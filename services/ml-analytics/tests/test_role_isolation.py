"""
Real Postgres, no mocks — solodesk_ml's boundary is READ-ONLY on exactly
sales.orders (see db/migrations/0001_provision_ml_role.sql), nothing else.
Same shape as agent-orchestrator's test/role-isolation.e2e-spec.ts.
"""

import os

import asyncpg
import pytest


async def _app_conn() -> asyncpg.Connection:
    return await asyncpg.connect(os.environ["DATABASE_URL"])


async def test_can_read_sales_orders():
    conn = await _app_conn()
    try:
        await conn.fetch("SELECT * FROM sales.orders LIMIT 1")
    finally:
        await conn.close()


async def test_cannot_insert_into_sales_orders_read_only_by_design():
    conn = await _app_conn()
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute(
                "INSERT INTO sales.orders (tenant_id, channel, status, total_amount) VALUES (gen_random_uuid(), 'counter', 'confirmed', '1.00')"
            )
    finally:
        await conn.close()


async def test_cannot_read_a_table_it_has_not_been_granted_on():
    conn = await _app_conn()
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.fetch("SELECT * FROM catalog.skus LIMIT 1")
    finally:
        await conn.close()


async def test_cannot_read_connector_hubs_vault_schema():
    conn = await _app_conn()
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.fetch("SELECT * FROM vault.credentials LIMIT 1")
    finally:
        await conn.close()
