"""
A real, first-cut baseline forecast — a linear trend fit (least-squares,
`numpy.polyfit`) over each day's actual confirmed-order revenue, projected
forward. Deliberately NOT the Prophet/statsmodels stack docs Section 8
names as this service's eventual target — that's genuinely heavier
tooling (Prophet needs a C++/Stan toolchain, non-trivial to install and
verify in this environment) for a first cut whose job is proving the
service, its DB role, and its Temporal-Activity-only calling convention
work end to end. A real, defensible statistical method (linear
regression, not a fabricated number), explicitly not the fancier one —
same "documented scope cut, not a silent gap" discipline as this repo's
connector-hub adapters and agent-orchestrator's LiteLLM-gateway deferral.
Swap in a real Prophet/statsmodels model later without changing this
function's signature.
"""

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np


@dataclass
class DailyRevenue:
    day: date
    total: float


@dataclass
class ForecastPoint:
    day: date
    projected_amount: float


def linear_trend_forecast(history: list[DailyRevenue], days_ahead: int) -> list[ForecastPoint]:
    if days_ahead <= 0:
        return []
    if not history:
        return [ForecastPoint(day=date.today() + timedelta(days=i + 1), projected_amount=0.0) for i in range(days_ahead)]

    sorted_history = sorted(history, key=lambda h: h.day)
    last_day = sorted_history[-1].day

    if len(sorted_history) == 1:
        # A single day of history has no trend to fit — the honest forecast
        # is "repeat the one data point we have," not an invented slope.
        flat_value = sorted_history[0].total
        return [ForecastPoint(day=last_day + timedelta(days=i + 1), projected_amount=max(flat_value, 0.0)) for i in range(days_ahead)]

    x = np.array([(h.day - sorted_history[0].day).days for h in sorted_history], dtype=float)
    y = np.array([h.total for h in sorted_history], dtype=float)
    slope, intercept = np.polyfit(x, y, 1)

    results = []
    for i in range(days_ahead):
        future_day = last_day + timedelta(days=i + 1)
        x_future = (future_day - sorted_history[0].day).days
        projected = slope * x_future + intercept
        # Revenue can't be negative — a declining trend clamps at 0, never
        # projects a negative number.
        results.append(ForecastPoint(day=future_day, projected_amount=max(projected, 0.0)))
    return results
