from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Query
from pydantic import BaseModel

from app.auth import require_internal_service_token
from app.db import close_pool, tenant_connection
from app.forecast import DailyRevenue, linear_trend_forecast

HISTORY_WINDOW_DAYS = 90


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await close_pool()


app = FastAPI(title="SoloDesk ml-analytics", lifespan=lifespan)


class ForecastPointResponse(BaseModel):
    day: date
    projected_amount: str


class ForecastResponse(BaseModel):
    tenant_id: str
    history_days_used: int
    forecast: list[ForecastPointResponse]


@app.get("/v1/forecast/{tenant_id}", response_model=ForecastResponse, dependencies=[Depends(require_internal_service_token)])
async def get_forecast(tenant_id: str, days: int = Query(default=7, ge=1, le=30)) -> ForecastResponse:
    """
    Only ever called from inside an agent-orchestrator Temporal Activity
    (docs Section 5.5's rule) — never synchronously from an HTTP handler
    outside a Workflow/Activity, the exact gap `cxgenie-be`'s raw
    synchronous calls to `cxgenie-core-ai` left open (see CLAUDE.md).
    """
    # VN-local calendar date (fixed UTC+7) — same discipline every sibling
    # service pins; a UTC date.today() skews the window edge by up to 7 hours.
    vn_today = datetime.now(timezone(timedelta(hours=7))).date()
    since = vn_today - timedelta(days=HISTORY_WINDOW_DAYS)
    async with tenant_connection(tenant_id) as conn:
        rows = await conn.fetch(
            """
            SELECT created_at::date AS day, SUM(total_amount) AS total
            FROM sales.orders
            WHERE tenant_id = $1 AND status = 'confirmed' AND created_at >= $2
            GROUP BY created_at::date
            ORDER BY created_at::date
            """,
            tenant_id,
            since,
        )

    history = [DailyRevenue(day=r["day"], total=float(r["total"])) for r in rows]
    forecast = linear_trend_forecast(history, days)

    return ForecastResponse(
        tenant_id=tenant_id,
        history_days_used=len(history),
        forecast=[ForecastPointResponse(day=p.day, projected_amount=f"{p.projected_amount:.2f}") for p in forecast],
    )
