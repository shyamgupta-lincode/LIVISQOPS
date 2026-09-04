"""Proof Engine: Value Ledger and Continuous Value Validation."""

from collections import defaultdict

from fastapi import APIRouter

from ..store import DB

router = APIRouter(prefix="/api/value", tags=["value"])


@router.get("/summary")
def summary():
    """Executive value dashboard: dollars, not precision/recall."""
    by_category: dict = defaultdict(lambda: {"quantity": 0, "value_usd": 0.0})
    by_source: dict = defaultdict(float)
    total = 0.0
    for entry in DB["value_ledger"].values():
        c = by_category[entry["category"]]
        c["quantity"] += entry["quantity"]
        c["value_usd"] += entry["value_usd"]
        by_source[entry["source"]] += entry["value_usd"]
        total += entry["value_usd"]
    k = DB["kpis"]
    return {
        "period_days": 21,
        "total_value_usd": round(total, 2),
        "money_saved_today_usd": k["money_saved_today_usd"],
        "hours_saved_today": k["hours_saved_today"],
        "scrap_prevented_today": k["scrap_prevented_today"],
        "co2_saved_kg": k["co2_saved_kg"],
        "payback_months": k["payback_months"],
        "projected_annual_value_usd": k["projected_annual_value_usd"],
        "by_category": [
            {"category": name, **vals, "value_usd": round(vals["value_usd"], 2)}
            for name, vals in sorted(by_category.items(),
                                     key=lambda kv: -kv[1]["value_usd"])
        ],
        "by_workflow": [
            {"workflow": name, "value_usd": round(v, 2)}
            for name, v in sorted(by_source.items(), key=lambda kv: -kv[1])
        ],
    }


@router.get("/daily")
def daily():
    """Cumulative financial benefit by day for trend charts."""
    per_day: dict = defaultdict(float)
    for entry in DB["value_ledger"].values():
        per_day[entry["date"]] += entry["value_usd"]
    days = sorted(per_day.keys())
    cumulative = 0.0
    series = []
    for d in days:
        cumulative += per_day[d]
        series.append({"date": d, "value_usd": round(per_day[d], 2),
                       "cumulative_usd": round(cumulative, 2)})
    return series


@router.get("/ledger")
def ledger(category: str | None = None):
    result = list(DB["value_ledger"].values())
    if category:
        result = [e for e in result if e["category"] == category]
    return sorted(result, key=lambda e: e["date"], reverse=True)[:200]


@router.get("/cvv")
def cvv_stages():
    """Continuous Value Validation lifecycle for the pilot use case."""
    return {
        "value_hypothesis": {
            "business_problem": "Fuel tank fitment escapes and false rejects on Touring Assembly Line",
            "baseline": {"fp_rate": 0.061, "fn_rate": 0.012, "scrap_per_week": 18,
                         "rework_per_week": 42, "inspection_cost_weekly_usd": 4800},
        },
        "stages": [
            {"stage": "Baseline", "status": "Complete", "duration": "2 weeks",
             "detail": "No AI intervention; collected production, defect, rework, inspection time and operator decisions at York Vehicle Operations."},
            {"stage": "Digital Shadow", "status": "Complete", "duration": "3 weeks",
             "detail": "AI observed only. Agreement 94.2%; model drift and booth lighting variation tracked.",
             "metrics": {"agreement_pct": 94.2, "false_rejects": 31, "escapes": 2}},
            {"stage": "Assisted Mode", "status": "Complete", "duration": "4 weeks",
             "detail": "AI recommends, operator approves. Every disagreement became training data (312 labels).",
             "metrics": {"agreement_pct": 97.8, "labels_from_disagreement": 312}},
            {"stage": "Autonomous Mode", "status": "Active", "duration": "ongoing",
             "detail": "Confidence >99% auto-accept; 95-99% operator review; <95% escalate.",
             "policy": {"auto_accept_above": 0.99, "review_band": [0.95, 0.99],
                        "escalate_below": 0.95}},
        ],
        "roi_dashboard_note": "The dashboard shows money saved today, hours saved, scrap prevented, "
                              "warranty risk reduced, customer escapes prevented, CO2 saved and operator time saved.",
    }
