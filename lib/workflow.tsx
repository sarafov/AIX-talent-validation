"use client";

import { createContext, useContext, useState } from "react";
import type { Parameters, ProjectInfo, RunResult, BreakdownRow } from "./types";

export interface Need {
  pillar: string;
  skill: string;
  reason: string;
  target: number;
  critical: boolean;
  status: string;
}
export interface WorkRow extends Omit<BreakdownRow, "capabilities"> {
  capabilities: Need[];
}
export interface WorkRun extends Omit<RunResult, "breakdown" | "items"> {
  breakdown: WorkRow[];
  items: Item[];
}
export interface Item {
  item_id: string;
  name: string;
  description: string;
  role_hint: string;
  start: string | null;
  end: string | null;
  workdays: number | null;
  group: string;
  source_file: string;
  source_sheet: string;
  source_row: number;
  source_effort_days: number | null;
  acceptance: string;
}
export interface RoleChoice {
  code: string;
  name: string;
  team: "data" | "design" | "additional";
  reason: string;
  decision: "include" | "map" | "external" | "exclude";
  mapped_to: string;
  requested_fte: number | null;
  skills: string[];
}
export interface Mapping {
  sheet: string;
  header_row: number;
  [key: string]: string | number | null;
}
export interface Intake {
  project: ProjectInfo;
  items: Item[];
  context: string;
  legend: Record<string, string>;
  method: string;
  warnings: string[];
  manifests: {
    file: string;
    sheets: { name: string; rows: number; columns: number }[];
    candidates: Mapping[];
    selected: Mapping[];
  }[];
  synthesis: {
    title: string;
    summary: string;
    facts: {
      label: string;
      value: string;
      source: string;
      quote: string;
      status: string;
    }[];
    roles: RoleChoice[];
    questions: string[];
  };
}
export interface Person {
  id: string;
  name: string;
  primary_role: string;
  preferred_roles: string;
  assignments: string;
  assignment_count: number | null;
  team: string;
  skills: Record<string, number>;
}
export interface Allocation {
  talent_id: string;
  role: string;
  month: string;
  fte: number;
  confirmed: boolean;
  confirmation: string;
}
export interface Candidate extends Omit<Person, "skills"> {
  score: number | null;
  coverage: number | null;
  assessment: number | null;
  availability: string;
  details: {
    item_id: string;
    skill: string;
    target: number;
    level: number | null;
    critical: boolean;
    status: string;
  }[];
}
export interface MonthCoverage {
  month: string;
  role: string;
  days: number;
  required: number;
  proposed: number;
  confirmed: number;
  qualified: number;
  remaining: number;
}
export interface Gap {
  item_id: string;
  role: string;
  skill: string;
  target: number;
  best: number | null;
  weight: number;
  catalog_gap: boolean;
  kind: string;
  suggestion: string;
}
export interface Report {
  role_summary: Record<
    string,
    {
      weight: number;
      met: number;
      assessed: number;
      required_days: number;
      proposed_days: number;
      confirmed_days: number;
      qualified_days: number;
    }
  >;
  roles: { role: string; candidates: Candidate[] }[];
  gaps: Gap[];
  monthly: MonthCoverage[];
  alerts: string[];
  formula: string;
  summary: {
    capability: number | null;
    assessment: number | null;
    proposed: number | null;
    confirmed: number | null;
    qualified: number | null;
  };
}
export interface Action {
  id: string;
  gap: string;
  role: string;
  type: "Build" | "Buy" | "Borrow" | "Rephase";
  owner: string;
  due: string;
  status: "Proposed" | "Approved" | "In progress" | "Completed";
  notes: string;
}
export interface WorkflowState {
  version: 2;
  step: number;
  intake: Intake | null;
  roles: RoleChoice[];
  projectApproved: boolean;
  rolesApproved: boolean;
  exclusions: Record<string, string>;
  run: WorkRun | null;
  talents: Person[];
  inventoryWarnings: string[];
  allocations: Allocation[];
  ceilings: Record<string, number>;
  baseline: "bottom_up" | "ucp";
  report: Report | null;
  actions: Action[];
  parameters: Parameters | null;
  catalogVersion: string;
}
export const fresh = (): WorkflowState => ({
  version: 2,
  step: 0,
  intake: null,
  roles: [],
  projectApproved: false,
  rolesApproved: false,
  exclusions: {},
  run: null,
  talents: [],
  inventoryWarnings: [],
  allocations: [],
  ceilings: {},
  baseline: "bottom_up",
  report: null,
  actions: [],
  parameters: null,
  catalogVersion: "",
});
const Context = createContext<{
  state: WorkflowState;
  setState: React.Dispatch<React.SetStateAction<WorkflowState>>;
} | null>(null);
export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkflowState>(fresh);
  return (
    <Context.Provider value={{ state, setState }}>{children}</Context.Provider>
  );
}
export function useWorkflow() {
  const value = useContext(Context);
  if (!value) throw Error("WorkflowProvider required");
  return value;
}
export async function request<T>(
  path: string,
  body?: unknown,
  key = "",
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api/py/workflow/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(!multipart && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(key ? { "X-LLM-Api-Key": key } : {}),
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({
      detail: `Permintaan gagal (${response.status}). Periksa koneksi dan pengaturan model.`,
    }));
  if (!response.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail),
    );
  return data as T;
}
export function saveFile(content: Blob, name: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
