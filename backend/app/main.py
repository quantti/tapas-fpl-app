"""Main FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.fixtures import router as fixtures_router
from app.api.history import router as history_router
from app.api.routes import router
from app.config import get_settings
from app.db import close_pool, init_pool

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifecycle - startup and shutdown."""
    # Startup
    logger.info("Starting Tapas FPL Backend")
    logger.info(f"CORS origins: {settings.cors_origins_list}")

    # Initialize database pool if configured
    if settings.db_connection_string:
        try:
            await init_pool()
            logger.info("Database pool initialized")
        except (TimeoutError, OSError, asyncpg.PostgresError) as e:
            logger.warning("Database pool initialization failed: %s", e)
            logger.warning("Continuing without database - some features may be unavailable")

    yield  # Application runs here

    # Shutdown
    logger.info("Shutting down Tapas FPL Backend")
    await close_pool()


# Create FastAPI app
app = FastAPI(
    title="Tapas FPL Backend",
    description="Backend API for FPL analytics (expected points, transfer optimization)",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)
app.include_router(fixtures_router)
app.include_router(history_router)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint for container orchestration."""
    from app.db import get_connection

    # Check database connectivity
    db_status = "not_configured"
    try:
        async with get_connection() as conn:
            await conn.fetchval("SELECT 1")
            db_status = "connected"
    except RuntimeError:
        db_status = "not_configured"
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        db_status = "disconnected"

    return {
        "status": "healthy",
        "database": db_status,
    }
