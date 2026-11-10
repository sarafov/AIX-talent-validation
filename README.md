# AIX Talent Validation

A management workspace for project demand, talent capability, proposed allocations,
and Build / Buy / Borrow decisions. This separate app extends
[Talent Estimation Agent](https://github.com/adryanra97/talent-estimation-agent).
The upstream MIT license and attribution are retained.

## Guided workflow

1. Upload WBS workbooks and supporting KAK, charter, requests, or meeting documents.
   Inspect all sheets and review the selected sheet and source rows.
2. Review editable project information, evidence, dates, and unresolved questions.
3. Confirm catalog roles; include, map, externalize, or exclude additional roles.
4. Review WBS-role classification, required skills, targets, critical flags,
   UCP assumptions, and explicit exclusions. Outside-catalog skills remain visible.
5. Compare UCP and bottom-up average, peak, and monthly FTE using Data / Design tabs.
6. Import talent assessments, compare skills across roles, inspect current
   assignments and counts, propose allocations, and record owner confirmation.
7. Review capability and staffing coverage, then track Build / Buy / Borrow /
   Rephase actions. Planned actions never count as confirmed capacity.

Navigation contains Home, Workspace, Catalog, and Model Settings. SLA drafting
is outside this application's scope. Previous report links redirect to Workspace.

## Interpretation

Assignment count is context, never inferred current FTE or a ranking penalty.
Primary and preferred roles never restrict eligibility. The effort-weighted score
is `100 * (70 * proficiency + 20 * targetCoverage) / 90`; proficiency maps levels
1-5 onto 0-1. Missing assessments differ from recorded level 1.
Skill fit does not prove availability.

Monthly coverage is constrained by demand, shared person-month planning ceilings,
and allocation confirmation. Qualified coverage also requires all critical skills
for each work package. Upstream changes invalidate downstream approvals.
See [the workflow and scoring guide](docs/talent-assignment.md).

## Running locally

Requires Node.js 22, Python 3.12+, and uv.

```sh
npm ci
uv sync --extra dev
npm run dev
```

Next.js runs on port 3000 and proxies Python on port 8000. Vercel uses
`api/index.py`; containers can set `AIX_PYTHON_API_ORIGIN` explicitly.
Configure the model in the dashboard. Without a key, outputs are explicitly
rule-based and require manual review. Live AI requires a configured provider.

```sh
npm run build
uv run pytest
uv run ruff check src tests api
uv run mypy src
```

No personal inventory, project documents, or API keys are bundled. Uploads are
processed without server persistence; the configured AI receives necessary source
context for each request. Save session JSON before closing the tab. Sessions
contain project/talent data but exclude model credentials. Restored sessions
require fresh approvals and allocation confirmations.
