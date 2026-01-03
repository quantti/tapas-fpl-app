"""Database connection management using asyncpg."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

from app.config import get_settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """Initialize the database connection pool."""
    global _pool
    if _pool is not None:
        return _pool

    settings = get_settings()
    db_url = settings.db_connection_string

    if not db_url:
        raise ValueError(
            "Database connection string not configured. "
            "Set DATABASE_URL or SUPABASE_URL environment variable."
        )

    logger.info("Initializing database connection pool")
    _pool = await asyncpg.create_pool(
        db_url,
        min_size=1,
        max_size=10,
        command_timeout=30,
    )
    return _pool


async def close_pool() -> None:
    """Close the database connection pool."""
    global _pool
    if _pool is not None:
        logger.info("Closing database connection pool")
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    """Get the current connection pool (must be initialized first)."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_pool() first.")
    return _pool


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the pool."""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn
