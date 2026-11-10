"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Card, PageHeader, inputClass } from "@/components/ui";
import { DEFAULT_PARAMETERS, useStore } from "@/lib/store";
import { fresh, request, saveFile, useWorkflow } from "@/lib/workflow";
import type {
  Allocation,
  Intake,
  Mapping,
  Person,
  Report,
  RoleChoice,
  WorkRow,
  WorkRun,
  WorkflowState,
  Action,
} from "@/lib/workflow";

const steps = [
  "Sumber",
  "Informasi proyek",
  "Lingkup role",
  "Breakdown & skill",
  "Ringkasan FTE",
  "Talent",
  "Gap & tindakan",
];
const num = (n: number | null | undefined) =>
  n == null
    ? "Belum diketahui"
    : n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const pct = (n: number | null | undefined) =>
  n == null ? "Belum dinilai" : `${num(n)}%`;
const unconfirm = (a: Allocation[]) =>
  a.map((v) => ({ ...v, confirmed: false, confirmation: "" }));
function Field({
  label,
  value,
  change,
  type = "text",
  area = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  type?: string;
  area?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      {area ? (
        <textarea
          aria-label={label}
          rows={3}
          className={`${inputClass} mt-1`}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          type={type}
          className={`${inputClass} mt-1`}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      {children}
    </div>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
const td = "p-3 align-top";
export default function Workspace() {
  const { state: s, setState } = useWorkflow();
  const { catalog, setCatalog, provider, apiKey } = useStore();
  const [files, setFiles] = useState<File[]>([]),
    [docs, setDocs] = useState<File[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const [team, setTeam] = useState("all"),
    [role, setRole] = useState(""),
    [search, setSearch] = useState(""),
    [newItem, setNewItem] = useState(""),
    [newRole, setNewRole] = useState("");
  const [selections, setSelections] = useState<Record<string, Mapping[]>>({}),
    [reference, setReference] = useState<{ code: string; label: string }[]>([]);
  const guard = useRef(false);
  const [candidateCache, setCandidateCache] = useState<Report | null>(null);
  const candidates = s.report ?? candidateCache;
  const signature = catalog ? JSON.stringify(catalog) : "",
    intake = s.intake,
    run = s.run;
  const patch = (p: Partial<WorkflowState>) =>
    setState((old) => ({ ...old, ...p }));
  const name = (code: string) =>
    s.roles.find((r) => r.code === code)?.name ??
    catalog?.roles[code]?.name ??
    code;
  const inTeam = (code: string) =>
    team === "all" ||
    (catalog?.roles[code]?.team ??
      s.roles.find((r) => r.code === code)?.team ??
      "additional") === team;
  const filteredStats = Object.entries(s.report?.role_summary ?? {})
    .filter(([code]) => inTeam(code))
    .map(([, v]) => v);
  const sumMetric = (
    key:
      | "weight"
      | "met"
      | "assessed"
      | "required_days"
      | "proposed_days"
      | "confirmed_days"
      | "qualified_days",
  ) => filteredStats.reduce((n, v) => n + v[key], 0);
  const ratio = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
  const summary =
    team === "all"
      ? s.report?.summary
      : {
          capability: ratio(sumMetric("met"), sumMetric("weight")),
          assessment: ratio(sumMetric("assessed"), sumMetric("weight")),
          proposed: ratio(
            sumMetric("proposed_days"),
            sumMetric("required_days"),
          ),
          confirmed: ratio(
            sumMetric("confirmed_days"),
            sumMetric("required_days"),
          ),
          qualified: ratio(
            sumMetric("qualified_days"),
            sumMetric("required_days"),
          ),
        };
  const unlocked = (i: number) =>
    i === 0 ||
    (i === 1 && !!intake) ||
    (i === 2 && s.projectApproved) ||
    (i === 3 && s.rolesApproved) ||
    (i >= 4 && !!run?.approved);
  useEffect(() => {
    request<{ factors: typeof reference }>("reference")
      .then((d) => setReference(d.factors))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setCandidateCache(null);
  }, [s.run, s.talents, s.baseline]);
  useEffect(() => {
    if (s.report) setCandidateCache(s.report);
  }, [s.report]);
  useEffect(() => {
    if (signature)
      setState((old) =>
        old.catalogVersion && old.catalogVersion !== signature
          ? {
              ...old,
              catalogVersion: signature,
              step: old.intake ? 1 : 0,
              projectApproved: false,
              rolesApproved: false,
              run: null,
              report: null,
              allocations: [],
            }
          : old.catalogVersion
            ? old
            : { ...old, catalogVersion: signature },
      );
  }, [signature, setState]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (intake) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [intake]);
  async function act(label: string, action: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(`${label}: selesai. Hasil siap ditinjau.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  function editProject(next: Intake) {
    patch({
      intake: next,
      projectApproved: false,
      rolesApproved: false,
      run: null,
      report: null,
      allocations: [],
    });
  }
  function editRoles(roles: RoleChoice[]) {
    patch({
      roles,
      rolesApproved: false,
      run: null,
      report: null,
      allocations: [],
    });
  }
  function editRun(next: WorkRun) {
    patch({
      run: { ...next, approved: false },
      report: null,
      allocations: unconfirm(s.allocations),
    });
  }
  function rowEdit(i: number, p: Partial<WorkRow>) {
    if (run)
      editRun({
        ...run,
        breakdown: run.breakdown.map((r, j) => (i === j ? { ...r, ...p } : r)),
      });
  }
  function aEdit(i: number, p: Partial<Allocation>) {
    patch({
      allocations: s.allocations.map((a, j) =>
        i === j
          ? {
              ...a,
              ...p,
              ...(p.fte !== undefined || p.month !== undefined
                ? { confirmed: false, confirmation: "" }
                : {}),
            }
          : a,
      ),
      report: null,
    });
  }
  async function analyze(demo = false) {
    await act("Membaca sumber dan menyusun informasi proyek", async () => {
      let data: Intake;
      if (demo) data = await request<Intake>("demo");
      else {
        if (!files.length) throw Error("Unggah WBS.");
        if (files.length > 5 || docs.length > 5)
          throw Error("Maksimum 5 file per kelompok.");
        const settings = JSON.stringify({ provider, catalog, selections });
        if (
          [...files, ...docs].reduce(
            (n, f) => n + f.size,
            new Blob([settings]).size,
          ) >
          4 * 1024 * 1024
        )
          throw Error("Total file dan pengaturan maksimum 4 MB.");
        const body = new FormData();
        body.append("settings", settings);
        files.forEach((f) => body.append("wbs", f));
        docs.forEach((f) => body.append("documents", f));
        data = await request<Intake>("intake", body, apiKey);
      }
      setState({
        ...fresh(),
        intake: data,
        roles: data.synthesis.roles,
        step: 1,
        catalogVersion: signature,
      });
      setSelections(
        Object.fromEntries(data.manifests.map((m) => [m.file, m.selected])),
      );
    });
  }
  async function estimate() {
    if (!intake) return;
    await act(
      apiKey ? "Agent menilai WBS dan effort" : "Menilai dengan aturan",
      async () => {
        const data = await request<WorkRun>(
          "estimate",
          {
            project: intake.project,
            items: intake.items,
            roles: s.roles,
            context: [
              intake.project.context,
              intake.project.reference,
              ...intake.synthesis.facts.map((f) => `${f.label}: ${f.value}`),
              intake.context,
            ].join("\n"),
            legend: intake.legend,
            provider,
            catalog,
            parameters: s.parameters ?? DEFAULT_PARAMETERS,
            project_approved: s.projectApproved,
            roles_approved: true,
          },
          apiKey,
        );
        patch({
          run: data,
          rolesApproved: true,
          step: 3,
          report: null,
          allocations: [],
        });
      },
    );
  }
  async function approve() {
    if (run)
      await act("Memvalidasi baseline", async () =>
        patch({
          run: await request<WorkRun>("review", {
            run,
            roles: s.roles,
            catalog,
            exclusions: s.exclusions,
            approved: true,
          }),
          step: 4,
          report: null,
        }),
      );
  }
  async function match() {
    if (run)
      await act("Menilai skill dan alokasi bersama", async () =>
        patch({
          report: await request<Report>("staffing", {
            run,
            roles: s.roles,
            talents: s.talents,
            allocations: s.allocations,
            ceilings: s.ceilings,
            baseline: s.baseline,
          }),
        }),
      );
  }
  function addRow() {
    const item = intake?.items.find((i) => i.item_id === newItem);
    if (!run || !item || !newRole) return;
    if (
      run.breakdown.some((r) => r.item_id === newItem && r.role === newRole)
    ) {
      setError("Item × role sudah ada.");
      return;
    }
    editRun({
      ...run,
      breakdown: [
        ...run.breakdown,
        {
          item_id: item.item_id,
          item_name: item.name,
          description: item.description,
          role_hint: item.role_hint,
          start: item.start,
          end: item.end,
          workdays: item.workdays,
          group: item.group,
          role: newRole,
          involvement: "Utama",
          quantity: 1,
          steps: null,
          classification: "Average",
          classification_reason: "Ditambahkan reviewer; validasi kompleksitas.",
          allocation_fte: 0.25,
          allocation_reason: "Validasi fraksi effort sepanjang durasi item.",
          needs_review: true,
          source: "wbs",
          capabilities: [],
        },
      ],
    });
  }
  function addAction(gap: string, code = "", type: Action["type"] = "Build") {
    patch({
      actions: [
        ...s.actions,
        {
          id: crypto.randomUUID(),
          gap,
          role: code,
          type,
          owner: "",
          due: "",
          status: "Proposed",
          notes: "",
        },
      ],
    });
  }
  const tabs = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tim">
      {[
        ["all", "Semua"],
        ["data", "Data"],
        ["design", "Design"],
        ["additional", "Role tambahan"],
      ].map(([v, label]) => (
        <Button
          key={v}
          size="sm"
          variant={team === v ? "primary" : "secondary"}
          aria-pressed={team === v}
          onClick={() => setTeam(v)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
  return (
    <>
      <PageHeader
        title="Validasi Talent"
        description="Konteks proyek → kebutuhan → kecocokan talent → Build · Buy · Borrow."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!intake || !!busy}
              onClick={() =>
                saveFile(
                  new Blob(
                    [
                      JSON.stringify(
                        { version: 2, state: { ...s, report: null }, catalog },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  ),
                  "AIX_Validation_Session.json",
                )
              }
            >
              Simpan sesi
            </Button>
            <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm">
              Pulihkan sesi
              <input
                aria-label="Pulihkan sesi validasi"
                className="sr-only"
                type="file"
                accept=".json"
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f)
                    void act("Memulihkan sesi", async () => {
                      if (f.size > 4 * 1024 * 1024)
                        throw Error("Maksimum 4 MB.");
                      const data = JSON.parse(await f.text());
                      if (data.version !== 2 || !data.state?.intake)
                        throw Error("Format sesi tidak sesuai.");
                      const valid = await request<WorkflowState>(
                        "session/validate",
                        data.state,
                      );
                      if (data.catalog)
                        setCatalog(data.catalog, "sesi validasi");
                      setState({
                        ...valid,
                        step: 1,
                        projectApproved: false,
                        rolesApproved: false,
                        run: valid.run
                          ? { ...valid.run, approved: false }
                          : null,
                        allocations: unconfirm(valid.allocations),
                        report: null,
                        catalogVersion: JSON.stringify(data.catalog ?? catalog),
                      });
                    });
                }}
              />
            </label>
          </>
        }
      />
      <div
        className="mb-5 flex gap-2 overflow-x-auto pb-2"
        role="group"
        aria-label="Tahap validasi"
      >
        {steps.map((label, i) => (
          <button
            key={label}
            disabled={!unlocked(i) || !!busy}
            aria-current={s.step === i ? "step" : undefined}
            className={`shrink-0 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${s.step === i ? "border-accent-600 bg-accent-600 text-white" : "border-line bg-white"}`}
            onClick={() => {
              patch({ step: i });
              setError("");
            }}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="mb-4 rounded-lg bg-accent-50 p-4 text-sm">
          {busy}… Pertahankan tab ini; dokumen besar dapat memerlukan beberapa
          menit.
        </p>
      )}
      {notice && !busy && (
        <p role="status" className="mb-4 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <fieldset
        disabled={!!busy}
        className="min-w-0 space-y-5 disabled:opacity-60"
      >
        {s.step === 0 && (
          <>
            <Card
              title="1. Sumber proyek"
              description="Semua sheet diperiksa. Unggah WBS dan dokumen KAK/charter, permintaan talent, atau notulen."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  Workbook WBS
                  <input
                    aria-label="Workbook WBS"
                    type="file"
                    multiple
                    accept=".xlsx"
                    className={`${inputClass} mt-2`}
                    onChange={(e) => {
                      setFiles([...(e.target.files ?? [])]);
                      setSelections({});
                    }}
                  />
                </label>
                <label className="text-sm">
                  Dokumen pendukung
                  <input
                    aria-label="Dokumen pendukung"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.md"
                    className={`${inputClass} mt-2`}
                    onChange={(e) => setDocs([...(e.target.files ?? [])])}
                  />
                </label>
              </div>
              <p className="my-4 text-xs text-muted">
                5 file per kelompok, total 4 MB termasuk pengaturan. PDF scan
                perlu OCR. Atur model di{" "}
                <Link href="/pengaturan" className="underline">
                  Pengaturan
                </Link>
                . Tanpa API key, hasil aturan diberi label dan perlu review
                manual.
              </p>
              <div className="flex gap-3">
                <Button
                  disabled={!catalog || !files.length}
                  onClick={() => analyze()}
                >
                  Analisis dokumen
                </Button>
                <Button
                  disabled={!catalog}
                  variant="secondary"
                  onClick={() => analyze(true)}
                >
                  Coba alur dengan contoh
                </Button>
              </div>
              {intake && (
                <p className="mt-3 text-xs text-muted">
                  Analisis baru mengganti baseline dan alokasi. Simpan sesi
                  untuk mempertahankan pekerjaan sebelumnya.
                </p>
              )}
            </Card>
            {intake && (
              <Card
                title="Pilihan tabel sumber"
                description="Ubah pilihan lalu unggah file yang sama dan analisis ulang. Pilih hanya tabel detail agar ringkasan tidak dihitung dua kali."
              >
                {intake.manifests.map((m) => (
                  <div key={m.file} className="mb-4">
                    <p className="font-medium">{m.file}</p>
                    <p className="text-xs text-muted">
                      Sheet ditemukan:{" "}
                      {m.sheets.map((sh) => sh.name).join(", ")}
                    </p>
                    {m.candidates.map((c) => (
                      <label key={c.sheet} className="mt-2 flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(selections[m.file] ?? m.selected).some(
                            (v) => v.sheet === c.sheet,
                          )}
                          onChange={(e) =>
                            setSelections((old) => ({
                              ...old,
                              [m.file]: e.target.checked
                                ? [...(old[m.file] ?? m.selected), c]
                                : (old[m.file] ?? m.selected).filter(
                                    (v) => v.sheet !== c.sheet,
                                  ),
                            }))
                          }
                        />
                        {c.sheet} · header baris {c.header_row + 1}
                      </label>
                    ))}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
        {s.step === 1 && intake && (
          <>
            <Note>
              {intake.method}. Koreksi informasi atau tanggal membatalkan hasil
              dan persetujuan berikutnya.
            </Note>
            <Card title="2. Informasi proyek">
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Judul proyek"
                  value={intake.project.name}
                  change={(name) =>
                    editProject({
                      ...intake,
                      project: { ...intake.project, name },
                    })
                  }
                />
                <Field
                  label="Mulai proyek"
                  type="date"
                  value={intake.project.start ?? ""}
                  change={(start) =>
                    editProject({
                      ...intake,
                      project: { ...intake.project, start: start || null },
                    })
                  }
                />
                <Field
                  label="Selesai proyek"
                  type="date"
                  value={intake.project.end ?? ""}
                  change={(end) =>
                    editProject({
                      ...intake,
                      project: { ...intake.project, end: end || null },
                    })
                  }
                />
              </div>
              <div className="mt-4">
                <Field
                  label="Ringkasan dan tujuan proyek"
                  area
                  value={intake.project.context}
                  change={(context) =>
                    editProject({
                      ...intake,
                      project: { ...intake.project, context },
                    })
                  }
                />
              </div>
              {intake.synthesis.facts.map((f, i) => (
                <div className="mt-4 rounded-lg border border-line p-3" key={i}>
                  <Field
                    label={f.label}
                    value={f.value}
                    area
                    change={(value) =>
                      editProject({
                        ...intake,
                        synthesis: {
                          ...intake.synthesis,
                          facts: intake.synthesis.facts.map((v, j) =>
                            i === j ? { ...v, value, status: "reviewer" } : v,
                          ),
                        },
                      })
                    }
                  />
                  <p className="mt-2 text-xs text-muted">
                    {f.status} · {f.source || "Belum ada sumber terverifikasi"}
                    {f.quote ? ` · “${f.quote}”` : ""}
                  </p>
                </div>
              ))}
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() =>
                  editProject({
                    ...intake,
                    synthesis: {
                      ...intake.synthesis,
                      facts: [
                        ...intake.synthesis.facts,
                        {
                          label: "Informasi tambahan",
                          value: "",
                          source: "Reviewer",
                          quote: "",
                          status: "reviewer",
                        },
                      ],
                    },
                  })
                }
              >
                Tambah informasi
              </Button>
            </Card>
            <Card title="Pertanyaan dan kualitas sumber">
              <ul className="mb-4 list-disc space-y-2 pl-5 text-sm">
                {[...intake.warnings, ...intake.synthesis.questions].map(
                  (w, i) => (
                    <li key={i}>{w}</li>
                  ),
                )}
              </ul>
              <Field
                label="Jawaban / keputusan reviewer"
                area
                value={intake.project.reference}
                change={(reference) =>
                  editProject({
                    ...intake,
                    project: { ...intake.project, reference },
                  })
                }
              />
            </Card>
            <Card
              title={`${intake.items.length} work package terbaca`}
              description="Tanggal berasal dari rentang aktivitas. Periksa konflik dengan metadata/dokumen."
            >
              <div className="max-h-80 overflow-auto">
                <Table
                  headers={[
                    "ID / pekerjaan",
                    "Mulai",
                    "Selesai",
                    "Sumber",
                    "Effort sumber (MD)",
                  ]}
                >
                  {intake.items.map((it, i) => (
                    <tr key={it.item_id}>
                      <td className={`${td} min-w-64`}>
                        {it.item_id} · {it.name}
                        <p className="text-xs text-muted">{it.acceptance}</p>
                      </td>
                      {(["start", "end"] as const).map((key) => (
                        <td className={td} key={key}>
                          <input
                            aria-label={`${key} WBS ${it.item_id}`}
                            type="date"
                            className={inputClass}
                            value={it[key] ?? ""}
                            onChange={(e) =>
                              editProject({
                                ...intake,
                                items: intake.items.map((a, j) =>
                                  j === i
                                    ? {
                                        ...a,
                                        [key]: e.target.value || null,
                                        workdays: null,
                                      }
                                    : a,
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                      <td className={`${td} text-xs`}>
                        {it.source_file}
                        <br />
                        {it.source_sheet} · baris {it.source_row}
                      </td>
                      <td className={td}>{num(it.source_effort_days)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>
            <Button
              disabled={
                !intake.project.name ||
                !intake.project.start ||
                !intake.project.end
              }
              onClick={() => patch({ projectApproved: true, step: 2 })}
            >
              Konfirmasi informasi proyek
            </Button>
          </>
        )}
        {s.step === 2 && intake && (
          <>
            <Note>
              Role di luar katalog dapat divalidasi khusus proyek, dipetakan ke
              katalog, dicatat sebagai dependensi eksternal, atau dikecualikan.
              Katalog master tidak diubah otomatis.
            </Note>
            <Card
              title="3. Lingkup role"
              description="Diminta FTE berasal dari permintaan atau keputusan reviewer. Kosong berarti belum diketahui."
            >
              {s.roles.map((r, i) => (
                <div
                  key={r.code}
                  className="mb-4 rounded-lg border border-line p-4"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field
                      label={`Nama role ${i + 1}`}
                      value={r.name}
                      change={(name) =>
                        editRoles(
                          s.roles.map((v, j) => (i === j ? { ...v, name } : v)),
                        )
                      }
                    />
                    <label className="text-sm">
                      Keputusan
                      <select
                        aria-label={`Keputusan role ${r.code}`}
                        className={`${inputClass} mt-1`}
                        value={r.decision}
                        onChange={(e) =>
                          editRoles(
                            s.roles.map((v, j) =>
                              i === j
                                ? {
                                    ...v,
                                    decision: e.target
                                      .value as RoleChoice["decision"],
                                  }
                                : v,
                            ),
                          )
                        }
                      >
                        {[
                          ["include", "Validasi role ini"],
                          ["map", "Petakan ke katalog"],
                          ["external", "Dependensi eksternal"],
                          ["exclude", "Di luar lingkup"],
                        ].map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label={`Diminta FTE ${r.code}`}
                      type="number"
                      value={
                        r.requested_fte == null ? "" : String(r.requested_fte)
                      }
                      change={(v) =>
                        editRoles(
                          s.roles.map((a, j) =>
                            i === j
                              ? {
                                  ...a,
                                  requested_fte:
                                    v === "" ? null : Math.max(0, Number(v)),
                                }
                              : a,
                          ),
                        )
                      }
                    />
                  </div>
                  <p className="my-2 text-xs text-muted">
                    {r.code} ·{" "}
                    {catalog?.roles[r.code] ? "Katalog" : "Di luar katalog"} ·{" "}
                    {r.team}
                  </p>
                  {r.decision === "map" && (
                    <label className="text-sm">
                      Role tujuan
                      <select
                        aria-label={`Role tujuan ${r.code}`}
                        className={inputClass}
                        value={r.mapped_to}
                        onChange={(e) =>
                          editRoles(
                            s.roles.map((v, j) =>
                              i === j ? { ...v, mapped_to: e.target.value } : v,
                            ),
                          )
                        }
                      >
                        <option value="">Pilih role</option>
                        {Object.values(catalog?.roles ?? {}).map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <Field
                    label={`Alasan / bukti ${r.code}`}
                    area
                    value={r.reason}
                    change={(reason) =>
                      editRoles(
                        s.roles.map((v, j) => (i === j ? { ...v, reason } : v)),
                      )
                    }
                  />
                  {!catalog?.roles[r.code] && r.decision === "include" && (
                    <Field
                      label={`Skill khusus ${r.code} (satu per baris)`}
                      area
                      value={r.skills.join("\n")}
                      change={(v) =>
                        editRoles(
                          s.roles.map((a, j) =>
                            j === i
                              ? { ...a, skills: v.split("\n").filter(Boolean) }
                              : a,
                          ),
                        )
                      }
                    />
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-3">
                <select
                  aria-label="Tambahkan role katalog"
                  className={`${inputClass} max-w-xs`}
                  defaultValue=""
                  onChange={(e) => {
                    const p = catalog?.roles[e.target.value];
                    if (p && !s.roles.some((r) => r.code === p.code))
                      editRoles([
                        ...s.roles,
                        {
                          code: p.code,
                          name: p.name,
                          team: p.team as RoleChoice["team"],
                          reason: "Ditambahkan reviewer",
                          decision: "include",
                          mapped_to: "",
                          requested_fte: null,
                          skills: [],
                        },
                      ]);
                    e.target.value = "";
                  }}
                >
                  <option value="">Tambah role katalog…</option>
                  {Object.values(catalog?.roles ?? {}).map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  onClick={() =>
                    editRoles([
                      ...s.roles,
                      {
                        code: `EXT-${crypto.randomUUID().slice(0, 8)}`,
                        name: "Role tambahan",
                        team: "additional",
                        reason: "",
                        decision: "include",
                        mapped_to: "",
                        requested_fte: null,
                        skills: [],
                      },
                    ])
                  }
                >
                  Role di luar katalog
                </Button>
              </div>
            </Card>
            <details className="rounded-xl border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm">
                Asumsi perhitungan
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {(
                  [
                    ["hours_per_day", "Jam kerja per hari"],
                    ["days_per_month", "Hari kerja rata-rata per bulan"],
                    ["phm", "Person-hours per UCP"],
                    ["support_factor", "Faktor role pendukung"],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    type="number"
                    value={String((s.parameters ?? DEFAULT_PARAMETERS)[key])}
                    change={(v) =>
                      patch({
                        parameters: {
                          ...(s.parameters ?? DEFAULT_PARAMETERS),
                          [key]: Number(v),
                        },
                        rolesApproved: false,
                        run: null,
                        report: null,
                        allocations: [],
                      })
                    }
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                FTE bulanan menggunakan hari kerja kalender. UCP untuk
                Data/Design adalah estimasi adaptasi; aktor, faktor, dan role
                tambahan perlu ditinjau.
              </p>
            </details>
            <Button
              disabled={
                !s.roles.some((r) => ["include", "map"].includes(r.decision))
              }
              onClick={() =>
                run ? patch({ rolesApproved: true, step: 3 }) : estimate()
              }
            >
              {run
                ? "Konfirmasi lingkup & tinjau breakdown tersimpan"
                : "Konfirmasi lingkup & buat breakdown"}
            </Button>
          </>
        )}
        {s.step === 3 && run && intake && (
          <>
            <Note>
              Tinjau klasifikasi, fraksi effort, dan skill kritis sebelum
              menyetujui baseline. Perubahan membatalkan konfirmasi alokasi
              berikutnya.
            </Note>
            {tabs}
            <Card
              title="4. Breakdown & kebutuhan skill"
              description={`${run.breakdown.length} item × role · ${run.breakdown.filter((r) => r.needs_review).length} belum direview`}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    editRun({
                      ...run,
                      breakdown: run.breakdown.map((r) => ({
                        ...r,
                        needs_review: false,
                      })),
                    })
                  }
                >
                  Tandai semua sudah direview
                </Button>
              }
            >
              <div className="max-h-[650px] space-y-3 overflow-y-auto">
                {run.breakdown.map(
                  (r, i) =>
                    inTeam(r.role) && (
                      <details
                        key={`${r.item_id}-${r.role}`}
                        className="rounded-lg border border-line p-4"
                      >
                        <summary className="cursor-pointer text-sm">
                          <strong>
                            {r.item_id} · {r.item_name}
                          </strong>{" "}
                          · {name(r.role)} ·{" "}
                          {r.needs_review ? "Perlu review" : "Direview"}
                        </summary>
                        <p className="my-2 text-xs text-muted">
                          {
                            intake.items.find((it) => it.item_id === r.item_id)
                              ?.source_file
                          }{" "}
                          ·{" "}
                          {
                            intake.items.find((it) => it.item_id === r.item_id)
                              ?.source_sheet
                          }{" "}
                          · Effort sumber{" "}
                          {num(
                            intake.items.find((it) => it.item_id === r.item_id)
                              ?.source_effort_days,
                          )}{" "}
                          MD
                        </p>
                        <div className="my-3 grid gap-3 md:grid-cols-3">
                          <label className="text-sm">
                            Kompleksitas
                            <select
                              aria-label={`Kompleksitas ${i}`}
                              className={inputClass}
                              value={r.classification}
                              onChange={(e) =>
                                rowEdit(i, {
                                  classification: e.target
                                    .value as WorkRow["classification"],
                                  needs_review: true,
                                })
                              }
                            >
                              {["Simple", "Average", "Complex"].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <Field
                            label={`Fraksi FTE ${i}`}
                            type="number"
                            value={String(r.allocation_fte)}
                            change={(v) =>
                              rowEdit(i, {
                                allocation_fte: Number(v),
                                needs_review: true,
                              })
                            }
                          />
                          <Field
                            label={`Kuantitas ${i}`}
                            type="number"
                            value={String(r.quantity)}
                            change={(v) =>
                              rowEdit(i, {
                                quantity: Number(v),
                                needs_review: true,
                              })
                            }
                          />
                        </div>
                        <p className="mb-3 text-xs text-muted">
                          Bottom-up = {num(r.workdays)} hari kerja × fraksi FTE.
                          Ini effort sepanjang durasi item, bukan headcount
                          otomatis.
                        </p>
                        <Field
                          label={`Alasan ${i}`}
                          area
                          value={
                            r.classification_reason + "\n" + r.allocation_reason
                          }
                          change={(v) =>
                            rowEdit(i, {
                              classification_reason: v,
                              allocation_reason: "Disunting reviewer",
                              needs_review: true,
                            })
                          }
                        />
                        {r.capabilities.map((n, ni) => (
                          <div
                            key={ni}
                            className="mt-3 rounded-lg bg-canvas p-3"
                          >
                            <div className="grid gap-2 md:grid-cols-3">
                              <Field
                                label={`Skill ${i}-${ni}`}
                                value={n.skill}
                                change={(v) =>
                                  rowEdit(i, {
                                    needs_review: true,
                                    capabilities: r.capabilities.map((a, k) =>
                                      k === ni
                                        ? { ...a, skill: v, status: "outside" }
                                        : a,
                                    ),
                                  })
                                }
                              />
                              <Field
                                label={`Pilar ${i}-${ni}`}
                                value={n.pillar}
                                change={(v) =>
                                  rowEdit(i, {
                                    needs_review: true,
                                    capabilities: r.capabilities.map((a, k) =>
                                      k === ni ? { ...a, pillar: v } : a,
                                    ),
                                  })
                                }
                              />
                              <label className="text-sm">
                                Target
                                <select
                                  aria-label={`Target ${i}-${ni}`}
                                  className={inputClass}
                                  value={n.target ?? 3}
                                  onChange={(e) =>
                                    rowEdit(i, {
                                      needs_review: true,
                                      capabilities: r.capabilities.map(
                                        (a, k) =>
                                          k === ni
                                            ? {
                                                ...a,
                                                target: Number(e.target.value),
                                              }
                                            : a,
                                      ),
                                    })
                                  }
                                >
                                  {[2, 3, 4, 5].map((v) => (
                                    <option key={v}>{v}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <p className="my-2 text-xs text-muted">
                              {n.status === "catalog"
                                ? "Katalog"
                                : "Di luar katalog / perlu pemetaan"}{" "}
                              · {n.reason}
                            </p>
                            <label className="text-sm">
                              <input
                                type="checkbox"
                                checked={n.critical ?? true}
                                onChange={(e) =>
                                  rowEdit(i, {
                                    needs_review: true,
                                    capabilities: r.capabilities.map((a, k) =>
                                      k === ni
                                        ? { ...a, critical: e.target.checked }
                                        : a,
                                    ),
                                  })
                                }
                              />{" "}
                              Skill kritis
                            </label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                rowEdit(i, {
                                  needs_review: true,
                                  capabilities: r.capabilities.filter(
                                    (_, k) => k !== ni,
                                  ),
                                })
                              }
                            >
                              Hapus skill
                            </Button>
                          </div>
                        ))}
                        {!r.capabilities.length && (
                          <p className="my-3 text-sm text-amber-900">
                            Belum ada kebutuhan skill; tidak dihitung sebagai
                            qualified.
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              rowEdit(i, {
                                needs_review: true,
                                capabilities: [
                                  ...r.capabilities,
                                  {
                                    pillar: "Project-specific",
                                    skill: "",
                                    target: 3,
                                    critical: true,
                                    status: "outside",
                                    reason: "Ditambahkan reviewer",
                                  },
                                ],
                              })
                            }
                          >
                            Tambah skill
                          </Button>
                          <label className="text-sm">
                            <input
                              type="checkbox"
                              checked={!r.needs_review}
                              onChange={(e) =>
                                rowEdit(i, { needs_review: !e.target.checked })
                              }
                            />{" "}
                            Sudah direview
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              editRun({
                                ...run,
                                breakdown: run.breakdown.filter(
                                  (_, j) => j !== i,
                                ),
                              })
                            }
                          >
                            Hapus baris
                          </Button>
                        </div>
                      </details>
                    ),
                )}
              </div>
            </Card>
            <Card
              title="Item belum terpetakan & tambahan manual"
              description="Setiap item harus dipetakan atau dikecualikan dengan alasan. Tidak ada pekerjaan hilang diam-diam."
            >
              {intake.items
                .filter(
                  (it) => !run.breakdown.some((r) => r.item_id === it.item_id),
                )
                .map((it) => (
                  <div key={it.item_id} className="mb-3">
                    <p className="text-sm">
                      {it.item_id} · {it.name}
                    </p>
                    <Field
                      label={`Alasan pengecualian ${it.item_id}`}
                      value={s.exclusions[it.item_id] ?? ""}
                      change={(v) =>
                        patch({
                          exclusions: { ...s.exclusions, [it.item_id]: v },
                          run: { ...run, approved: false },
                          report: null,
                        })
                      }
                    />
                  </div>
                ))}
              <div className="flex flex-wrap gap-3">
                <select
                  aria-label="Item tambahan breakdown"
                  className={`${inputClass} max-w-sm`}
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                >
                  <option value="">Pilih item WBS</option>
                  {intake.items.map((it) => (
                    <option key={it.item_id} value={it.item_id}>
                      {it.item_id} · {it.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Role tambahan breakdown"
                  className={`${inputClass} max-w-xs`}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="">Pilih role disetujui</option>
                  {run.roles.map((code) => (
                    <option key={code} value={code}>
                      {name(code)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  disabled={!newItem || !newRole}
                  onClick={addRow}
                >
                  Tambah baris
                </Button>
              </div>
            </Card>
            <Card
              title="Asumsi UCP"
              description="Aktor dan faktor tanpa bukti perlu penilaian reviewer. Rating netral faktor adalah 3."
            >
              {(
                run.factors as {
                  role: string;
                  actors: {
                    name: string;
                    count: number;
                    category: string;
                    source: string;
                  }[];
                  ratings: Record<string, number>;
                  evidence: Record<string, string>;
                }[]
              ).map((f, fi) => (
                <details
                  key={f.role}
                  className="mb-2 rounded-lg border border-line p-3"
                >
                  <summary className="cursor-pointer text-sm">
                    {name(f.role)}
                  </summary>
                  {f.actors.map((a, ai) => (
                    <div key={ai} className="my-3 grid gap-3 md:grid-cols-3">
                      <Field
                        label={`Aktor ${f.role} ${ai}`}
                        value={a.name}
                        change={(v) =>
                          editRun({
                            ...run,
                            factors: run.factors.map((x, j) =>
                              j === fi
                                ? {
                                    ...f,
                                    actors: f.actors.map((ac, k) =>
                                      k === ai ? { ...ac, name: v } : ac,
                                    ),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                      <Field
                        label={`Jumlah aktor ${f.role} ${ai}`}
                        type="number"
                        value={String(a.count)}
                        change={(v) =>
                          editRun({
                            ...run,
                            factors: run.factors.map((x, j) =>
                              j === fi
                                ? {
                                    ...f,
                                    actors: f.actors.map((ac, k) =>
                                      k === ai
                                        ? { ...ac, count: Number(v) }
                                        : ac,
                                    ),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                      <p className="text-xs text-muted">
                        {a.category} · {a.source}
                      </p>
                    </div>
                  ))}
                  <div className="grid gap-3 md:grid-cols-3">
                    {reference.map((ref) => (
                      <div key={ref.code}>
                        <Field
                          label={`${ref.code} ${f.role}: ${ref.label}`}
                          type="number"
                          value={String(f.ratings[ref.code] ?? 3)}
                          change={(v) =>
                            editRun({
                              ...run,
                              factors: run.factors.map((x, j) =>
                                j === fi
                                  ? {
                                      ...f,
                                      ratings: {
                                        ...f.ratings,
                                        [ref.code]: Number(v),
                                      },
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                        <p className="text-xs text-muted">
                          {f.evidence[ref.code] || "Belum ada bukti spesifik"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </Card>
            <Button
              disabled={run.breakdown.some((r) => r.needs_review)}
              onClick={approve}
            >
              Setujui breakdown & hitung FTE
            </Button>
          </>
        )}
        {s.step === 4 && run?.approved && (
          <>
            {tabs}
            <Card
              title="5. Ringkasan FTE"
              description="Permintaan, UCP, dan bottom-up dipertahankan terpisah."
            >
              <Table
                headers={[
                  "Role",
                  "Diminta",
                  "UCP rata-rata",
                  "UCP puncak",
                  "Bottom-up rata-rata",
                  "Bottom-up puncak",
                  "Selisih effort",
                ]}
              >
                {run.estimates
                  .filter((e) => inTeam(e.role))
                  .map((e) => (
                    <tr key={e.role}>
                      <td className={td}>{name(e.role)}</td>
                      <td className={td}>
                        {num(
                          run.role_inputs.find((r) => r.role === e.role)
                            ?.requested_fte,
                        )}
                      </td>
                      {[e.ucp_fte, e.ucp_peak_fte, e.bu_fte, e.bu_peak_fte].map(
                        (v, i) => (
                          <td className={td} key={i}>
                            {num(v)}
                          </td>
                        ),
                      )}
                      <td className={td}>
                        {e.bu_hours
                          ? pct((e.ucp_hours / e.bu_hours - 1) * 100)
                          : "Tidak tersedia"}
                      </td>
                    </tr>
                  ))}
              </Table>
            </Card>
            <Card title="FTE bulanan">
              <Table
                headers={[
                  "Role / metode",
                  ...run.monthly.map((m) => m.month.slice(0, 7)),
                ]}
              >
                {run.roles.filter(inTeam).flatMap((code) =>
                  (["ucp", "bottom_up"] as const).map((method) => (
                    <tr key={code + method}>
                      <td className={td}>
                        {name(code)} · {method === "ucp" ? "UCP" : "Bottom-up"}
                      </td>
                      {run.monthly.map((m) => (
                        <td className={td} key={m.month}>
                          {num(m[method][code])}
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </Table>
            </Card>
            <Card
              title="Baseline perencanaan"
              description="Mengubah metode membatalkan konfirmasi alokasi dan coverage berikutnya."
            >
              <select
                aria-label="Baseline perencanaan"
                className={`${inputClass} max-w-xs`}
                value={s.baseline}
                onChange={(e) =>
                  patch({
                    baseline: e.target.value as WorkflowState["baseline"],
                    allocations: unconfirm(s.allocations),
                    report: null,
                  })
                }
              >
                <option value="bottom_up">Bottom-up</option>
                <option value="ucp">UCP</option>
              </select>
            </Card>
            <details className="rounded-lg border border-line p-4">
              <summary className="cursor-pointer text-sm">
                Temuan & asumsi ({run.findings.length})
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                {run.findings.map((f, i) => (
                  <li key={i}>
                    {f.role} {f.item_id}: {f.message}
                  </li>
                ))}
              </ul>
            </details>
            <Button onClick={() => patch({ step: 5 })}>Lanjut ke talent</Button>
          </>
        )}
        {s.step === 5 && run?.approved && (
          <>
            <Note>
              Assignment dan jumlah assignment adalah konteks beban kerja, bukan
              FTE tersedia. Role utama/preferred role tidak mengunci
              rekomendasi. Ketersediaan awal tetap belum dinilai.
            </Note>
            <Card
              title="6. Inventori Data & Design"
              description="Semua sheet talent dibaca; skor kosong tetap belum dinilai."
            >
              <input
                aria-label="Inventori talent"
                type="file"
                accept=".xlsx"
                className={inputClass}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f)
                    void act("Membaca inventori", async () => {
                      if (f.size > 4 * 1024 * 1024)
                        throw Error("Maksimum 4 MB.");
                      const form = new FormData();
                      form.append("file", f);
                      form.append("roles_json", JSON.stringify(s.roles));
                      if (catalog)
                        form.append("catalog_json", JSON.stringify(catalog));
                      const data = await request<{
                        talents: Person[];
                        warnings: string[];
                      }>("inventory", form);
                      patch({
                        talents: data.talents,
                        inventoryWarnings: data.warnings,
                        allocations: [],
                        report: null,
                      });
                    });
                }}
              />
              <p className="mt-3 text-sm">{s.talents.length} talent dimuat.</p>
              {s.inventoryWarnings.map((w, i) => (
                <p className="mt-1 text-xs text-muted" key={i}>
                  {w}
                </p>
              ))}
              <Button
                className="mt-4"
                disabled={!s.talents.length}
                onClick={match}
              >
                Hitung kecocokan talent
              </Button>
            </Card>
            {candidates && (
              <Card
                title="Kandidat lintas role"
                description="Skor adalah ranking skill, bukan persentase kapasitas. Tidak ada poin kapasitas atau penalti jumlah assignment."
              >
                <div className="mb-4 flex flex-wrap gap-3">
                  <select
                    aria-label="Role rekomendasi"
                    className={`${inputClass} max-w-xs`}
                    value={role || run.roles[0]}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {run.roles.map((code) => (
                      <option key={code} value={code}>
                        {name(code)}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Cari talent"
                    placeholder="Cari nama talent"
                    className={`${inputClass} max-w-xs`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-[650px] space-y-3 overflow-y-auto">
                  {candidates.roles
                    .find((r) => r.role === (role || run.roles[0]))
                    ?.candidates.filter((c) =>
                      c.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <details
                        className="rounded-lg border border-line p-4"
                        key={c.id}
                      >
                        <summary className="cursor-pointer text-sm">
                          <strong>{c.name}</strong> · skor {num(c.score)} ·
                          target terpenuhi {pct(c.coverage)}
                        </summary>
                        <p className="my-2 text-sm">
                          Role utama: {c.primary_role || "Belum diisi"} ·
                          Preferred: {c.preferred_roles || "Belum diisi"}
                        </p>
                        <div className="rounded-lg bg-canvas p-3 text-sm">
                          <strong>
                            Assignment saat ini (
                            {c.assignment_count ?? "total belum diketahui"})
                          </strong>
                          <p>{c.assignments || "Belum diisi"}</p>
                          <p className="mt-1 text-xs text-muted">
                            Ketersediaan belum dinilai · Assessment{" "}
                            {pct(c.assessment)}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          className="my-3"
                          onClick={() => {
                            const code = role || run.roles[0],
                              month = run.monthly[0]?.month.slice(0, 7);
                            if (!month) return;
                            if (
                              s.allocations.some(
                                (a) =>
                                  a.talent_id === c.id &&
                                  a.role === code &&
                                  a.month === month,
                              )
                            ) {
                              setError(
                                "Usulan bulan pertama sudah ada; edit alokasi di bawah.",
                              );
                              return;
                            }
                            patch({
                              allocations: [
                                ...s.allocations,
                                {
                                  talent_id: c.id,
                                  role: code,
                                  month,
                                  fte: 0.25,
                                  confirmed: false,
                                  confirmation: "",
                                },
                              ],
                              report: null,
                            });
                          }}
                        >
                          Pilih talent untuk {name(role || run.roles[0])}
                        </Button>
                        <div className="max-h-64 overflow-auto">
                          <Table
                            headers={[
                              "WBS / skill",
                              "Target",
                              "Assessment",
                              "Gap",
                            ]}
                          >
                            {c.details.map((d, i) => (
                              <tr key={i}>
                                <td className={td}>
                                  {d.item_id} · {d.skill}
                                  {d.critical ? " · kritis" : ""}
                                </td>
                                <td className={td}>{d.target}</td>
                                <td className={td}>
                                  {d.level ?? "Belum dinilai"}
                                </td>
                                <td className={td}>
                                  {d.level == null
                                    ? "Perlu assessment"
                                    : d.level < d.target
                                      ? `Kurang ${d.target - d.level} level`
                                      : "Memenuhi"}
                                </td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      </details>
                    ))}
                </div>
              </Card>
            )}
            {!!s.allocations.length && (
              <Card
                title="Usulan alokasi & konfirmasi"
                description="Konfirmasi per bulan dengan talent/resource owner. Mengubah FTE atau bulan membatalkan konfirmasi."
              >
                {s.allocations.map((a, i) => {
                  const person = s.talents.find((p) => p.id === a.talent_id);
                  return (
                    <div
                      key={i}
                      className="mb-4 rounded-lg border border-line p-4"
                    >
                      <p className="font-medium">
                        {person?.name} · {name(a.role)}
                      </p>
                      <p className="my-2 text-sm">
                        Assignment saat ini (
                        {person?.assignment_count ?? "total belum diketahui"}):{" "}
                        {person?.assignments || "Belum diisi"}
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="text-sm">
                          Bulan
                          <select
                            aria-label={`Bulan alokasi ${i}`}
                            className={inputClass}
                            value={a.month}
                            onChange={(e) =>
                              aEdit(i, { month: e.target.value })
                            }
                          >
                            {run.monthly.map((m) => (
                              <option key={m.month} value={m.month.slice(0, 7)}>
                                {m.month.slice(0, 7)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Field
                          label={`FTE usulan ${i}`}
                          type="number"
                          value={String(a.fte)}
                          change={(v) => aEdit(i, { fte: Number(v) })}
                        />
                        <Field
                          label={`Batas rencana talent ${i}`}
                          type="number"
                          value={String(
                            s.ceilings[`${a.talent_id}|${a.month}`] ?? 1,
                          )}
                          change={(v) =>
                            patch({
                              ceilings: {
                                ...s.ceilings,
                                [`${a.talent_id}|${a.month}`]: Number(v),
                              },
                              allocations: unconfirm(s.allocations),
                              report: null,
                            })
                          }
                        />
                      </div>
                      <p className="my-2 text-xs text-muted">
                        Batas default 1 FTE dibagi lintas role per bulan. Ini
                        batas perencanaan, bukan bukti bahwa talent tersedia 1
                        FTE.
                      </p>
                      <Field
                        label={`Catatan konfirmasi ${i}`}
                        value={a.confirmation}
                        change={(v) =>
                          aEdit(i, { confirmation: v, confirmed: false })
                        }
                      />
                      <label className="mt-3 block text-sm">
                        <input
                          type="checkbox"
                          checked={a.confirmed}
                          disabled={!a.confirmation.trim()}
                          onChange={(e) =>
                            aEdit(i, { confirmed: e.target.checked })
                          }
                        />{" "}
                        Reviewer telah mengonfirmasi alokasi dengan
                        talent/resource owner
                      </label>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const next = run.monthly
                              .map((m) => m.month.slice(0, 7))
                              .find(
                                (m) =>
                                  !s.allocations.some(
                                    (x) =>
                                      x.talent_id === a.talent_id &&
                                      x.role === a.role &&
                                      x.month === m,
                                  ),
                              );
                            if (next)
                              patch({
                                allocations: [
                                  ...s.allocations,
                                  {
                                    ...a,
                                    month: next,
                                    confirmed: false,
                                    confirmation: "",
                                  },
                                ],
                                report: null,
                              });
                          }}
                        >
                          Tambah bulan berikutnya
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            patch({
                              allocations: s.allocations.filter(
                                (_, j) => j !== i,
                              ),
                              report: null,
                            })
                          }
                        >
                          Hapus usulan
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
            {!!s.talents.length && (
              <div className="flex gap-3">
                <Button onClick={match}>Perbarui rekomendasi & coverage</Button>
                <Button
                  variant="secondary"
                  disabled={!s.report}
                  onClick={() => patch({ step: 6 })}
                >
                  Lihat gap & tindakan
                </Button>
              </div>
            )}
          </>
        )}
        {s.step === 6 && run?.approved && (
          <>
            {!s.report ? (
              <Card title="Coverage perlu diperbarui">
                <Button disabled={!s.talents.length} onClick={match}>
                  Hitung coverage terbaru
                </Button>
              </Card>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    [
                      "Capability coverage",
                      pct(summary?.capability),
                      "Skill ada dalam inventori; belum tentu tersedia.",
                    ],
                    [
                      "Assessment completeness",
                      pct(summary?.assessment),
                      "Requirement dengan setidaknya satu assessment.",
                    ],
                    [
                      "Proposed staffing",
                      pct(summary?.proposed),
                      "Usulan reviewer, bukan komitmen.",
                    ],
                    [
                      "Confirmed staffing",
                      pct(summary?.confirmed),
                      "Alokasi dikonfirmasi, dapat memiliki skill gap.",
                    ],
                    [
                      "Qualified delivery",
                      pct(summary?.qualified),
                      "Dikonfirmasi dan memenuhi skill kritis work package.",
                    ],
                    [
                      "Ketersediaan awal",
                      "Belum dinilai",
                      "Assignment count tidak diterjemahkan menjadi FTE.",
                    ],
                  ].map(([label, value, note]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-line bg-white p-4"
                    >
                      <p className="text-xs text-muted">{label}</p>
                      <p className="my-2 text-2xl font-semibold">{value}</p>
                      <p className="text-xs text-muted">{note}</p>
                    </div>
                  ))}
                </div>
                {tabs}
                {s.report.alerts.map((a, i) => (
                  <Note key={i}>{a}</Note>
                ))}
                <Card
                  title="Coverage bulanan per role"
                  description="Agregat dibobot hari-orang. FTE dibatasi kebutuhan dan batas talent bersama, sehingga tidak dihitung dua kali."
                >
                  <Table
                    headers={[
                      "Bulan",
                      "Role",
                      "Kebutuhan",
                      "Diusulkan",
                      "Dikonfirmasi",
                      "Qualified",
                      "Sisa staffing",
                    ]}
                  >
                    {s.report.monthly
                      .filter((m) => inTeam(m.role) && m.required > 0)
                      .map((m) => (
                        <tr key={m.month + m.role}>
                          <td className={td}>{m.month}</td>
                          <td className={td}>{name(m.role)}</td>
                          {(
                            [
                              "required",
                              "proposed",
                              "confirmed",
                              "qualified",
                              "remaining",
                            ] as const
                          ).map((k) => (
                            <td className={td} key={k}>
                              {num(m[k])}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </Table>
                </Card>
                <Card
                  title="Gap capability, proficiency & assessment"
                  description="Di luar katalog tidak otomatis berarti skill tidak dimiliki. Skor kosong tetap belum diketahui."
                >
                  <div className="max-h-96 overflow-auto">
                    <Table
                      headers={[
                        "WBS / role",
                        "Skill",
                        "Target",
                        "Terbaik",
                        "Jenis gap",
                        "Tindakan",
                      ]}
                    >
                      {s.report.gaps
                        .filter((g) => inTeam(g.role))
                        .map((g, i) => (
                          <tr key={i}>
                            <td className={td}>
                              {g.item_id} · {name(g.role)}
                            </td>
                            <td className={td}>{g.skill}</td>
                            <td className={td}>{g.target}</td>
                            <td className={td}>{g.best ?? "Belum dinilai"}</td>
                            <td className={td}>
                              {g.kind}
                              {g.catalog_gap ? " + catalog gap" : ""}
                            </td>
                            <td className={td}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  addAction(
                                    `${g.item_id}: ${g.skill} (${g.kind})`,
                                    g.role,
                                    g.best == null ? "Borrow" : "Build",
                                  )
                                }
                              >
                                Rencanakan
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </Table>
                  </div>
                  {!s.report.gaps.length && (
                    <p className="text-sm">
                      Target skill yang dipetakan tercakup inventori. Tetap
                      periksa staffing dan work package tanpa assessment.
                    </p>
                  )}
                </Card>
                <details className="rounded-lg border border-line p-4">
                  <summary className="cursor-pointer text-sm">
                    Metode skor & coverage
                  </summary>
                  <p className="mt-3 text-sm">{s.report.formula}</p>
                  <p className="mt-2 text-xs text-muted">
                    Level 1 tidak ada pengalaman · 2 dasar · 3 menengah · 4
                    mahir · 5 ahli. Skill dalam satu work package berbagi bobot
                    effort.
                  </p>
                </details>
              </>
            )}
            <Card
              title="Build · Buy · Borrow"
              description="Tindakan tidak otomatis menambah supply atau coverage terkonfirmasi."
            >
              {s.actions.map((a, i) => (
                <div
                  className="mb-4 rounded-lg border border-line p-4"
                  key={a.id}
                >
                  <Field
                    label={`Gap / kebutuhan tindakan ${i}`}
                    area
                    value={a.gap}
                    change={(gap) =>
                      patch({
                        actions: s.actions.map((v, j) =>
                          i === j ? { ...v, gap } : v,
                        ),
                      })
                    }
                  />
                  <div className="my-3 grid gap-3 md:grid-cols-4">
                    <label className="text-sm">
                      Strategi
                      <select
                        aria-label={`Strategi ${i}`}
                        className={inputClass}
                        value={a.type}
                        onChange={(e) =>
                          patch({
                            actions: s.actions.map((v, j) =>
                              i === j
                                ? {
                                    ...v,
                                    type: e.target.value as Action["type"],
                                  }
                                : v,
                            ),
                          })
                        }
                      >
                        {["Build", "Buy", "Borrow", "Rephase"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label={`Pemilik tindakan ${i}`}
                      value={a.owner}
                      change={(owner) =>
                        patch({
                          actions: s.actions.map((v, j) =>
                            i === j ? { ...v, owner } : v,
                          ),
                        })
                      }
                    />
                    <Field
                      label={`Target tindakan ${i}`}
                      type="date"
                      value={a.due}
                      change={(due) =>
                        patch({
                          actions: s.actions.map((v, j) =>
                            i === j ? { ...v, due } : v,
                          ),
                        })
                      }
                    />
                    <label className="text-sm">
                      Status
                      <select
                        aria-label={`Status tindakan ${i}`}
                        className={inputClass}
                        value={a.status}
                        onChange={(e) =>
                          patch({
                            actions: s.actions.map((v, j) =>
                              i === j
                                ? {
                                    ...v,
                                    status: e.target.value as Action["status"],
                                  }
                                : v,
                            ),
                          })
                        }
                      >
                        {[
                          "Proposed",
                          "Approved",
                          "In progress",
                          "Completed",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Field
                    label={`Catatan tindakan ${i}`}
                    area
                    value={a.notes}
                    change={(notes) =>
                      patch({
                        actions: s.actions.map((v, j) =>
                          i === j ? { ...v, notes } : v,
                        ),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() =>
                      patch({ actions: s.actions.filter((_, j) => i !== j) })
                    }
                  >
                    Hapus tindakan
                  </Button>
                </div>
              ))}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    addAction("Kekurangan staffing pada role/bulan terkait")
                  }
                >
                  Tambah tindakan
                </Button>
                <Button
                  disabled={!s.report}
                  onClick={() =>
                    saveFile(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              project: intake?.project,
                              baseline: s.baseline,
                              roles: s.roles,
                              monthly: run.monthly,
                              allocations: s.allocations,
                              coverage: s.report,
                              actions: s.actions,
                              note: "Assignment counts are workload context. Actions are not confirmed supply.",
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                      "Talent_Validation_Decision_Plan.json",
                    )
                  }
                >
                  Unduh rencana keputusan
                </Button>
              </div>
            </Card>
          </>
        )}
      </fieldset>
    </>
  );
}
