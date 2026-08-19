from datetime import date, timedelta

import pytest

from app.forecast import DailyRevenue, linear_trend_forecast


def test_no_history_forecasts_zero_not_a_fabricated_number():
    result = linear_trend_forecast([], days_ahead=3)
    assert len(result) == 3
    assert all(p.projected_amount == 0.0 for p in result)


def test_single_day_history_repeats_that_value_no_invented_slope():
    day = date(2026, 1, 1)
    result = linear_trend_forecast([DailyRevenue(day=day, total=100.0)], days_ahead=2)
    assert [p.projected_amount for p in result] == [100.0, 100.0]
    assert result[0].day == day + timedelta(days=1)


def test_increasing_trend_projects_forward():
    base = date(2026, 1, 1)
    history = [
        DailyRevenue(day=base, total=100.0),
        DailyRevenue(day=base + timedelta(days=1), total=200.0),
        DailyRevenue(day=base + timedelta(days=2), total=300.0),
    ]
    result = linear_trend_forecast(history, days_ahead=2)
    assert result[0].projected_amount == pytest.approx(400.0)
    assert result[1].projected_amount == pytest.approx(500.0)


def test_declining_trend_clamps_at_zero_never_negative():
    base = date(2026, 1, 1)
    history = [
        DailyRevenue(day=base, total=100.0),
        DailyRevenue(day=base + timedelta(days=1), total=50.0),
        DailyRevenue(day=base + timedelta(days=2), total=0.0),
    ]
    result = linear_trend_forecast(history, days_ahead=5)
    assert all(p.projected_amount >= 0.0 for p in result)


def test_zero_days_ahead_returns_empty():
    assert linear_trend_forecast([DailyRevenue(day=date.today(), total=100.0)], days_ahead=0) == []
