"""Shared FastAPI dependencies for API routes."""

from fastapi import HTTPException

from app.db import get_pool


def require_db() -> None:
    """FastAPI dependency that requires database availability.

    Raises HTTPException 503 if the database pool is not initialized.

    Usage:
        @router.get("/endpoint")
        async def endpoint(_: None = Depends(require_db)):
            ...
    """
    try:
        get_pool()
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Database not available. This feature requires database connection.",
        ) from e
