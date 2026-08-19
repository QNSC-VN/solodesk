from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from tests.conftest import seed_order, seed_tenant


async def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_forecast_reflects_real_seeded_orders_not_fabricated(admin_conn):
    tenant_id = await seed_tenant(admin_conn, "ML Analytics Test Tenant Trend")
    now = datetime.now(timezone.utc)
    await seed_order(admin_conn, tenant_id, "100.00", now - timedelta(days=2))
    await seed_order(admin_conn, tenant_id, "200.00", now - timedelta(days=1))
    await seed_order(admin_conn, tenant_id, "300.00", now)

    async with await client() as c:
        res = await c.get(
            f"/v1/forecast/{tenant_id}",
            params={"days": 2},
            headers={"X-Internal-Service-Token": settings.internal_service_token},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["history_days_used"] == 3
    assert float(body["forecast"][0]["projected_amount"]) == pytest.approx(400.0)
    assert float(body["forecast"][1]["projected_amount"]) == pytest.approx(500.0)


async def test_tenant_with_no_orders_gets_zero_forecast_not_another_tenants_data(admin_conn):
    populated_tenant = await seed_tenant(admin_conn, "ML Analytics Test Tenant Populated")
    empty_tenant = await seed_tenant(admin_conn, "ML Analytics Test Tenant Empty")
    await seed_order(admin_conn, populated_tenant, "999999.00", datetime.now(timezone.utc))

    async with await client() as c:
        res = await c.get(
            f"/v1/forecast/{empty_tenant}",
            params={"days": 3},
            headers={"X-Internal-Service-Token": settings.internal_service_token},
        )

    body = res.json()
    assert body["history_days_used"] == 0
    assert all(float(p["projected_amount"]) == 0.0 for p in body["forecast"])


async def test_cancelled_orders_are_excluded_from_the_forecast(admin_conn):
    tenant_id = await seed_tenant(admin_conn, "ML Analytics Test Tenant Cancelled")
    await seed_order(admin_conn, tenant_id, "500000.00", datetime.now(timezone.utc), status="cancelled")

    async with await client() as c:
        res = await c.get(
            f"/v1/forecast/{tenant_id}",
            headers={"X-Internal-Service-Token": settings.internal_service_token},
        )

    assert res.json()["history_days_used"] == 0


async def test_missing_internal_service_token_is_rejected():
    async with await client() as c:
        res = await c.get("/v1/forecast/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 403


async def test_wrong_internal_service_token_is_rejected():
    async with await client() as c:
        res = await c.get("/v1/forecast/00000000-0000-0000-0000-000000000000", headers={"X-Internal-Service-Token": "wrong"})
    assert res.status_code == 403
