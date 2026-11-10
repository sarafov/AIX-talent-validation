# Management validation and staffing

Workspace stages: Sources, Project Information, Role Scope, Breakdown & Skills,
FTE Summary, Talent, and Gaps & Actions.

## Evidence and approval

The reader examines workbook sheets and exposes candidates and source coordinates.
The reviewer can select another sheet and reanalyze. Dates, effort, and acceptance
text are retained when available. Supporting PDF, DOCX, and text provide context;
scanned PDFs require OCR. Conflicting dates become warnings. AI facts without
verifiable quotations are marked inferred. Rule mode is clearly labeled.

Confirm project information and role scope before estimation. Additional roles
can be included for the project, mapped, externalized, or excluded with reasons.
Custom roles use generic UCP assumptions requiring review. The master catalog is
not extended automatically. Review every WBS-role row and explicitly exclude any
unmapped work package before approving. Retain outside-catalog skills as gaps.

## Estimation

Existing deterministic UCP and bottom-up engines calculate effort and monthly FTE.
Compare requested, average, peak, divergence, and monthly demand in Data / Design /
Additional tabs. Select UCP or bottom-up monthly demand as the staffing baseline.
Missing requested FTE remains unknown, never silently one person.

## Inventory and scoring

Upload the two-header Data / Design inventory. Row 1 groups skills by role; row 2
names each skill. Metadata includes Nama, Role Utama, Preferred Role, Assignment
(or Tribe / Project), and Jumlah Assignment. Levels 1-5 mean no experience, basic,
intermediate, advanced, expert. Missing cells remain unassessed. Unrecognized skill
labels are preserved; conflicting duplicate assessments require reconciliation.

Every person is considered across roles regardless of primary/preferred role,
team, or assignment count. Requirements are weighted by work-package baseline
effort, divided equally among each package's skills.

- Proficiency: weighted `(level - 1) / 4`; unassessed contributes zero.
- Target coverage: weighted share meeting the reviewed target.
- Score: `100 * (70 * proficiency + 20 * target coverage) / 90`.
- Assessment completeness: weighted share with recorded assessments, shown separately.

These measures compare evidence and are not calibrated hiring predictions.
Current assignments and counts remain visible when comparing/selecting people.
There is no conversion from assignment count to current FTE or ranking penalty.

## Allocation and coverage

Person-role-month allocations remain proposed until resource-owner confirmation
is recorded and explicitly checked. An editable per-person/month planning ceiling
defaults to 1 FTE; this assumption is not measured availability. Confirmation must
account for existing commitments outside this project.

A constrained flow calculation shares each person's ceiling across roles and work
packages, preventing double counting. Monthly coverage is weighted by working days.

- Capability: effort-weighted requirements where someone meets the target skill.
- Proposed: demand supported by any proposed allocations.
- Confirmed: demand supported by explicitly confirmed allocations.
- Qualified: confirmed allocations whose person meets every critical package skill.

Unknown requirements remain in the denominator. Missing assessments differ from
recorded level 1. Gaps distinguish assessment, absent capability, proficiency,
outside-catalog skills, and staffing shortfall. Team filters use role-level weights.

## Decisions and sessions

Build develops skills; Buy recruits/procures capability; Borrow uses help from
another team or partner; Rephase changes timing/scope. Record owner, date, status,
and notes. Actions alone never increase confirmed/qualified coverage. Humans
make final assignments.

Upstream edits invalidate affected approvals and allocation confirmations.
Save/restore session JSON excludes keys and requires renewed approvals on restore.
Download decision-plan JSON for review. SLA drafting is not included.
