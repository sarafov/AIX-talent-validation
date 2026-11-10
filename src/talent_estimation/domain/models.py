"""Pydantic models that describe projects, estimates, and run results.

Every model is serialisable to JSON so that the browser can hold the full run
state between requests. The server never stores a run.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Classification = Literal["Simple", "Average", "Complex"]
Involvement = Literal["Utama", "Pendukung"]
Level = Literal["Tinggi", "Sedang", "Rendah"]
Scope = Literal["all", "data", "design"]
FindingKind = Literal[
    "gap",
    "overlap",
    "outside_wbs",
    "divergence",
    "data_quality",
    "assumption",
    "reclassified",
]

TCF_FACTORS: tuple[tuple[str, str, float], ...] = (
    ("T1", "Distributed System Required", 2.0),
    ("T2", "Response Time or Throughput Performance", 1.0),
    ("T3", "End-User Efficiency", 1.0),
    ("T4", "Complex Internal Processing", 1.0),
    ("T5", "Reusability of Code", 1.0),
    ("T6", "Easy to Install", 0.5),
    ("T7", "Easy to Use", 0.5),
    ("T8", "Portability across Platforms", 2.0),
    ("T9", "Easy to Change / Maintainable", 1.0),
    ("T10", "Concurrency / High Parallelism", 1.0),
    ("T11", "Special Security Features", 1.0),
    ("T12", "Provides Direct Access for Third Parties", 1.0),
    ("T13", "Special User Training Facilities Needed", 1.0),
)
"""Technical complexity factors of Use Case Points: code, name, weight."""

EF_FACTORS: tuple[tuple[str, str, float], ...] = (
    ("E1", "Familiarity with Development Process", 1.5),
    ("E2", "Application Experience", 0.5),
    ("E3", "Object-Oriented / ML Experience", 1.0),
    ("E4", "Lead Analyst Capability", 0.5),
    ("E5", "Motivation of the Team", 1.0),
    ("E6", "Stable Requirements", 2.0),
    ("E7", "Part-Time Staff (shared / on-demand)", -1.0),
    ("E8", "Difficult Programming Language", -1.0),
)
"""Environmental factors of Use Case Points: code, name, weight."""


CLASSIFICATIONS: tuple[Classification, ...] = ("Simple", "Average", "Complex")
DEFAULT_USE_CASE_WEIGHTS: dict[Classification, float] = {
    "Simple": 5.0,
    "Average": 10.0,
    "Complex": 15.0,
}
DEFAULT_ACTOR_WEIGHTS: dict[Classification, float] = {"Simple": 1.0, "Average": 2.0, "Complex": 3.0}


class Parameters(BaseModel):
    """Calculation parameters chosen by the user.

    Attributes
    ----------
    hours_per_day : float
        Working hours in one person-day.
    days_per_month : float
        Working days in one person-month.
    phm : float
        Person-hours multiplier, the number of hours per adjusted use case point.
    support_factor : float
        Share of the use case weight counted when a role only supports an item.
    tolerance : float
        Relative difference under which an estimate is considered aligned.
    duration_override_months : float or None
        Analysis duration in months. When ``None`` the duration is derived from
        the project start and end dates.
    holidays : list of date
        Public holidays excluded from working-day counts.
    use_case_weights : dict
        Use case weight per classification.
    actor_weights : dict
        Actor weight per classification.
    """

    hours_per_day: float = Field(8.0, gt=0, le=24)
    days_per_month: float = Field(20.0, gt=0, le=31)
    phm: float = Field(15.0, gt=0, le=60)
    support_factor: float = Field(0.25, ge=0, le=1)
    tolerance: float = Field(0.15, ge=0, le=1)
    duration_override_months: float | None = Field(None, gt=0)
    holidays: list[date] = Field(default_factory=list)
    use_case_weights: dict[Classification, float] = Field(
        default_factory=lambda: dict(DEFAULT_USE_CASE_WEIGHTS)
    )
    actor_weights: dict[Classification, float] = Field(
        default_factory=lambda: dict(DEFAULT_ACTOR_WEIGHTS)
    )


class ProjectInfo(BaseModel):
    """General information about the project being validated."""

    name: str = ""
    start: date | None = None
    end: date | None = None
    scope: Scope = "data"
    context: str = ""
    reference: str = ""


class WbsItem(BaseModel):
    """A leaf work package read from the WBS or added from other documents."""

    item_id: str
    name: str
    description: str = ""
    role_hint: str = ""
    start: date | None = None
    end: date | None = None
    workdays: float | None = None
    group: str = ""
    source: Literal["wbs", "additional"] = "wbs"
    source_file: str = ""
    source_sheet: str = ""
    source_row: int | None = None
    source_effort_days: float | None = None
    acceptance: str = ""


class CapabilityNeed(BaseModel):
    """A catalog skill that the work of a breakdown row needs."""

    pillar: str
    skill: str
    reason: str = ""
    target: int = Field(default=3, ge=2, le=5)
    critical: bool = True
    status: str = "catalog"


class BreakdownRow(BaseModel):
    """One WBS item for one role, the unit every number is traced back to."""

    item_id: str
    item_name: str
    description: str = ""
    role_hint: str = ""
    start: date | None = None
    end: date | None = None
    workdays: float | None = None
    group: str = ""
    role: str
    involvement: Involvement
    quantity: float = Field(1.0, ge=0)
    steps: int | None = Field(None, ge=0)
    classification: Classification
    classification_reason: str = ""
    allocation_fte: float = Field(ge=0, le=5)
    allocation_reason: str = ""
    needs_review: bool = False
    source: Literal["wbs", "additional"] = "wbs"
    capabilities: list[CapabilityNeed] = Field(default_factory=list)

    @property
    def key(self) -> str:
        """Return the unique key of the row (item and role)."""
        return f"{self.item_id}|{self.role}"


class Actor(BaseModel):
    """An external party that interacts with the work of one role."""

    name: str
    category: Classification
    count: float = Field(1.0, ge=0)
    source: str = ""


class RoleFactors(BaseModel):
    """Actors and UCP factor ratings for one role."""

    role: str
    actors: list[Actor] = Field(default_factory=list)
    ratings: dict[str, int] = Field(default_factory=dict)
    evidence: dict[str, str] = Field(default_factory=dict)

    @field_validator("ratings")
    @classmethod
    def _check_ratings(cls, value: dict[str, int]) -> dict[str, int]:
        valid = {code for code, _, _ in TCF_FACTORS + EF_FACTORS}
        for code, rating in value.items():
            if code not in valid:
                raise ValueError(f"Unknown factor code {code!r}")
            if not 0 <= rating <= 5:
                raise ValueError(f"Rating for {code} must be between 0 and 5")
        return value

    def rating(self, code: str) -> int:
        """Return the rating of a factor, defaulting to the neutral value 3."""
        return self.ratings.get(code, 3)


class RoleInput(BaseModel):
    """Comparison figures supplied for one role."""

    role: str
    requested_fte: float | None = Field(None, ge=0)
    existing_fte: float = Field(0.0, ge=0)
    reference_fte: float | None = Field(None, ge=0)


class RoleEstimate(BaseModel):
    """Effort and FTE of one role computed by both methods."""

    role: str
    rows: int
    uaw: float
    uucw: float
    uucp: float
    tfactor: float
    tcf: float
    efactor: float
    ef: float
    ucp: float
    ucp_hours: float
    ucp_person_days: float
    ucp_person_months: float
    ucp_fte: float
    bu_person_days: float
    bu_hours: float
    bu_person_months: float
    bu_fte: float
    ucp_peak_fte: float = 0.0
    bu_peak_fte: float = 0.0


class MonthlyFte(BaseModel):
    """FTE per role in one calendar month for both methods."""

    month: date
    capacity_days: float
    ucp: dict[str, float]
    bottom_up: dict[str, float]


class Comparison(BaseModel):
    """Calculated need compared with the request for one role."""

    role: str
    requested_fte: float | None
    existing_fte: float
    reference_fte: float | None
    ucp_fte: float
    bu_fte: float
    ucp_additional_fte: float
    bu_additional_fte: float
    divergence: float | None
    ucp_vs_requested: str | None
    bu_vs_requested: str | None
    conclusion: str


class Finding(BaseModel):
    """An observation raised by an agent or by a calculation check."""

    kind: FindingKind
    message: str
    item_id: str | None = None
    role: str | None = None
    severity: Level = "Sedang"
    source: str = ""


class AiCategory(BaseModel):
    """A closed category of AI assistance with its saving range."""

    key: str
    label: str
    min_saving: float = Field(ge=0, le=1)
    max_saving: float = Field(ge=0, le=1)
    default_saving: float = Field(ge=0, le=1)
    examples: str = ""


class AiTask(BaseModel):
    """A task inside one breakdown row that may be assisted by AI."""

    item_id: str
    role: str
    task: str
    weight: float = Field(ge=0, le=1)
    pillar: str = ""
    skill: str = ""
    category: str
    saving: float = Field(ge=0, le=1)
    confidence: Level = "Sedang"
    prerequisite: str = ""
    reason: str = ""


class AiAssessment(BaseModel):
    """AI assistance scenario summarised for one role."""

    role: str
    baseline_person_days: float
    saved_person_days: float
    saving_share: float
    ucp_fte: float
    ucp_fte_assisted: float
    bu_fte: float
    bu_fte_assisted: float
    top_skills: list[str] = Field(default_factory=list)


class TraceEvent(BaseModel):
    """A decision or action recorded during a run."""

    agent: str
    action: str
    detail: str = ""


class RunResult(BaseModel):
    """Everything produced by one validation run.

    The browser keeps this object and sends it back for recalculation, review,
    and Excel export. The server does not persist it.
    """

    project: ProjectInfo
    parameters: Parameters = Field(default_factory=Parameters)
    roles: list[str]
    role_inputs: list[RoleInput] = Field(default_factory=list)
    items: list[WbsItem] = Field(default_factory=list)
    breakdown: list[BreakdownRow] = Field(default_factory=list)
    factors: list[RoleFactors] = Field(default_factory=list)
    estimates: list[RoleEstimate] = Field(default_factory=list)
    monthly: list[MonthlyFte] = Field(default_factory=list)
    comparisons: list[Comparison] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    ai_enabled: bool = True
    ai_tasks: list[AiTask] = Field(default_factory=list)
    ai_summary: list[AiAssessment] = Field(default_factory=list)
    message_draft: str = ""
    trace: list[TraceEvent] = Field(default_factory=list)
    approved: bool = False
