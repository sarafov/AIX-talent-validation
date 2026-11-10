import asyncio
import io
from datetime import date

import pytest
from api.index import app
from fastapi.testclient import TestClient
from openpyxl import Workbook

from talent_estimation.catalog import load_default_catalog
from talent_estimation.domain.models import (
    BreakdownRow,
    CapabilityNeed,
    Parameters,
    ProjectInfo,
    RoleFactors,
    RunResult,
    WbsItem,
)
from talent_estimation.io.wbs_reader import detect_candidates, read_wbs
from talent_estimation.staffing import skill_key
from talent_estimation.workflow import (
    Allocation,
    EstimateInput,
    Person,
    ReviewInput,
    RoleChoice,
    StaffingInput,
    estimate,
    read_inventory,
    review,
    staffing,
)


def xlsx(book):
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def test_reader_prefers_detailed_second_sheet_and_exact_finish_header():
    book = Workbook()
    summary = book.active
    summary.title = "Ringkasan"
    summary.append(["Kode", "Workstream", "Start", "Finish"])
    summary.append(["A", "Summary", date(2027, 1, 4), date(2027, 1, 29)])
    detail = book.create_sheet("WBS 2027")
    detail.append(["Project title"])
    detail.append(
        [
            "WBS ID",
            "Elemen WBS",
            "Kriteria Selesai",
            "PIC (Role)",
            "Role Pendukung",
            "Start",
            "Finish",
            "Durasi (hari kerja)",
            "Effort (MD)",
        ]
    )
    detail.append(["1", "Parent", "Approved", "DE", "", date(2027, 1, 4), date(2027, 1, 29), 20, 8])
    detail.append(["1.1", "Child", "UAT", "DE", "DA", date(2027, 1, 4), date(2027, 1, 15), 10, 8])
    data = xlsx(book)
    parsed = read_wbs(data)
    assert len(detect_candidates(data)) == 2
    assert parsed.mapping.sheet == "WBS 2027"
    assert len(parsed.items) == 1
    item = parsed.items[0]
    assert item.end == date(2027, 1, 15)
    assert item.source_row == 4 and item.source_effort_days == 8
    assert item.acceptance == "UAT" and "DA" in item.role_hint


def test_inventory_reads_both_teams_preserves_counts_and_unknown_labels():
    catalog = load_default_catalog()
    book = Workbook()
    for sheet, code in [(book.active, "DE"), (book.create_sheet("Design"), "UX")]:
        profile = catalog.roles[code]
        _pillar, skills = next(iter(profile.pillars.items()))
        sheet.title = "Data" if code == "DE" else "Design"
        sheet.append(
            [
                "Nama",
                "Role Utama",
                "Preferred Role",
                "Assignment",
                "Jumlah Assignment",
                profile.name,
                None,
            ]
        )
        sheet.append([None] * 5 + [skills[0], "Uncatalogued skill"])
        sheet.append([f"{code} example", profile.name, profile.name, "Alpha; Beta", 2, 4, 2])
    people = read_inventory(xlsx(book), catalog)["talents"]
    assert len(people) == 2
    assert all(p["assignment_count"] == 2 and p["assignments"] == "Alpha; Beta" for p in people)
    assert all("current_fte" not in p for p in people)
    assert all(any(k.startswith("outside|") for k in p["skills"]) for p in people)


def fixture(roles=("DE",)):
    start, end = date(2027, 1, 4), date(2027, 1, 29)
    rows, items = [], []
    for code in roles:
        item = WbsItem(item_id=code, name=f"{code} delivery", start=start, end=end, workdays=20)
        items.append(item)
        rows.append(
            BreakdownRow(
                item_id=code,
                item_name=item.name,
                role=code,
                start=start,
                end=end,
                workdays=20,
                involvement="Utama",
                classification="Average",
                allocation_fte=1,
                capabilities=[CapabilityNeed(pillar="Test", skill=f"{code} skill", target=3)],
            )
        )
    return RunResult(
        project=ProjectInfo(name="Test", start=start, end=end, scope="all"),
        parameters=Parameters(),
        roles=list(roles),
        items=items,
        breakdown=rows,
        factors=[RoleFactors(role=r) for r in roles],
        approved=True,
    )


def choices(roles):
    return [RoleChoice(code=r, name=r, team="data") for r in roles]


def test_approvals_block_estimation_and_unmapped_work_blocks_review():
    run = fixture()
    with pytest.raises(ValueError, match="Konfirmasi"):
        asyncio.run(
            estimate(EstimateInput(project=run.project, items=run.items, roles=choices(run.roles)))
        )
    run.items.append(WbsItem(item_id="missing", name="Unmapped"))
    with pytest.raises(ValueError, match="pengecualian"):
        review(ReviewInput(run=run, roles=choices(run.roles), approved=True))
    assert review(
        ReviewInput(
            run=run,
            roles=choices(run.roles),
            exclusions={"missing": "External dependency"},
            approved=True,
        )
    ).approved


def test_counts_do_not_change_ranking_and_unknown_assessment_is_not_absence():
    run = fixture()
    key = skill_key("DE", "Test", "DE skill")
    a = Person(id="a", name="A", primary_role="AI Engineer", assignment_count=20, skills={key: 4})
    b = Person(id="b", name="B", primary_role="Data Engineer", assignment_count=0, skills={key: 4})
    result = staffing(StaffingInput(run=run, roles=choices(run.roles), talents=[a, b]))
    candidates = result["roles"][0]["candidates"]
    assert candidates[0]["score"] == candidates[1]["score"]
    assert candidates[0]["availability"] == "Belum dinilai"
    result = staffing(
        StaffingInput(run=run, roles=choices(run.roles), talents=[Person(id="c", name="C")])
    )
    assert result["gaps"][0]["kind"] == "assessment"
    assert result["summary"]["assessment"] == 0
    assert result["summary"]["confirmed"] == 0


def test_confirmed_is_separate_from_proposed_and_shared_capacity_is_capped():
    run = fixture(("DE", "DA"))
    talent = Person(
        id="a", name="A", skills={skill_key(code, "Test", f"{code} skill"): 5 for code in run.roles}
    )
    allocations = [
        Allocation(talent_id="a", role=code, month="2027-01", fte=1) for code in run.roles
    ]
    body = StaffingInput(
        run=run, roles=choices(run.roles), talents=[talent], allocations=allocations
    )
    result = staffing(body)
    assert result["summary"]["proposed"] == pytest.approx(50)
    assert result["summary"]["confirmed"] == 0 and result["summary"]["qualified"] == 0
    assert result["alerts"]
    body.allocations = [
        a.model_copy(update={"confirmed": True, "confirmation": "Resource owner approved"})
        for a in allocations
    ]
    result = staffing(body)
    assert result["summary"]["qualified"] == pytest.approx(50)
    assert sum(m["qualified"] for m in result["monthly"]) <= 1.000001


def test_qualified_flow_can_reassign_supply_without_greedy_double_counting():
    run = fixture()
    second = run.breakdown[0].model_copy(deep=True)
    second.item_id = "second"
    second.capabilities = [CapabilityNeed(pillar="Test", skill="Special", target=4)]
    run.items.append(
        WbsItem(
            item_id="second",
            name="Special",
            start=run.project.start,
            end=run.project.end,
            workdays=20,
        )
    )
    run.breakdown.append(second)
    a = Person(
        id="a",
        name="A",
        skills={skill_key("DE", "Test", "DE skill"): 5, skill_key("DE", "Test", "Special"): 5},
    )
    b = Person(id="b", name="B", skills={skill_key("DE", "Test", "DE skill"): 5})
    allocations = [
        Allocation(
            talent_id=p.id,
            role="DE",
            month="2027-01",
            fte=1,
            confirmed=True,
            confirmation="Owner confirmed",
        )
        for p in [a, b]
    ]
    result = staffing(
        StaffingInput(run=run, roles=choices(run.roles), talents=[a, b], allocations=allocations)
    )
    assert result["summary"]["qualified"] == pytest.approx(100)


def test_missing_skill_requirements_remain_in_coverage_denominator():
    run = fixture()
    run.breakdown[0].capabilities = []
    result = staffing(
        StaffingInput(run=run, roles=choices(run.roles), talents=[Person(id="x", name="X")])
    )
    assert result["summary"]["capability"] == 0
    assert result["gaps"][0]["skill"] == "Kebutuhan skill belum ditentukan"


def test_confirmation_needs_evidence_and_invalid_month_is_rejected():
    run = fixture()
    p = Person(id="x", name="X")
    allocation = Allocation(talent_id="x", role="DE", month="2027-01", fte=1, confirmed=True)
    body = StaffingInput(run=run, roles=choices(run.roles), talents=[p], allocations=[allocation])
    with pytest.raises(ValueError, match="catatan konfirmasi"):
        staffing(body)
    allocation.confirmed = False
    allocation.month = "2028-01"
    with pytest.raises(ValueError, match="tidak valid"):
        staffing(body)


def test_api_demo_review_and_removed_sla_endpoints():
    client = TestClient(app)
    response = client.get("/api/py/workflow/demo")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] and data["method"].startswith("Aturan")
    assert client.post("/api/py/sla/draft", data={}).status_code == 404
    assert (
        client.post(
            "/api/py/workflow/estimate",
            json={
                "project": data["project"],
                "items": data["items"],
                "roles": data["synthesis"]["roles"],
            },
        ).status_code
        == 400
    )


def test_agent_keeps_uncatalogued_skill_in_breakdown():
    run = fixture()

    class Model:
        async def structured(self, schema, system, user, *, skill):
            if skill == "work_breakdown":
                row = run.breakdown[0].model_copy(deep=True)
                row.capabilities = [
                    CapabilityNeed(pillar="Project", skill="Uncatalogued requirement")
                ]
                return schema(rows=[row])
            return schema(role="DE", actors=[])

    options = EstimateInput(
        project=run.project,
        items=run.items,
        roles=choices(run.roles),
        project_approved=True,
        roles_approved=True,
    )
    result = asyncio.run(estimate(options, Model()))
    assert result.breakdown[0].capabilities[0].status == "outside"
    assert result.breakdown[0].capabilities[0].skill == "Uncatalogued requirement"
