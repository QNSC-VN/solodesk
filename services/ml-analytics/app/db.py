"""
Same RLS + per-transaction `SET LOCAL app.tenant_id` mechanism as the other
3 services' tenant-context.ts/tenant-db.ts — copied, not shared via a
package (same YAGNI convention, and there's no cross-language package to
share it through anyway). Parameterized via `set_config`, not raw string
interpolation, from day one — the other 3 services all had to fix that
same bug later (see CLAUDE.md); no reason to introduce it here first.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def tenant_connection(tenant_id: str) -> AsyncIterator[asyncpg.Connection]:
    """
    Runs inside a transaction with `app.tenant_id` set via `SET LOCAL`
    (through `set_config`, parameterized) — scoped to this transaction
    only, cleared automatically on commit/rollback. Never session-level
    `SET` — same reasoning as the other 3 services' tenant-context.ts.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", tenant_id)
            yield conn
