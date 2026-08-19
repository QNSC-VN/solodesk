import os

import asyncpg
import pytest_asyncio


@pytest_asyncio.fixture
async def admin_conn():
    conn = await asyncpg.connect(os.environ["DATABASE_ADMIN_URL"])
    try:
        yield conn
    finally:
        await conn.close()


async def seed_tenant(conn: asyncpg.Connection, legal_name: str) -> str:
    row = await conn.fetchrow(
        "INSERT INTO identity.tenants (legal_name, industry) VALUES ($1, 'food_beverage') RETURNING id",
        legal_name,
    )
    return str(row["id"])


async def seed_order(conn: asyncpg.Connection, tenant_id: str, total_amount: str, created_at, status: str = "confirmed") -> None:
    await conn.execute(
        """
        INSERT INTO sales.orders (tenant_id, channel, status, total_amount, created_at, updated_at)
        VALUES ($1, 'counter', $2, $3, $4, $4)
        """,
        tenant_id,
        status,
        total_amount,
        created_at,
    )
