"""Safety boundaries for Tapas core-table writes and destructive test utilities."""

from urllib.parse import urlparse

from app.config import get_settings


class CoreWritesDisabled(RuntimeError):
    """Raised when a disabled Tapas core writer is invoked directly."""


def core_writes_enabled() -> bool:
    """Return whether Tapas may write shared FPL core tables."""
    return get_settings().fpl_core_writes_enabled


def require_core_writes(operation: str) -> None:
    """Block a direct core writer when ownership has moved to the assistant."""
    if not core_writes_enabled():
        raise CoreWritesDisabled(
            f"{operation} is blocked because FPL_CORE_WRITES_ENABLED=false"
        )


def require_disposable_database(database_url: str | None, operation: str) -> None:
    """Allow destructive helpers only when core writes are enabled on a local DB."""
    require_core_writes(operation)
    if not database_url:
        raise RuntimeError(f"{operation} requires an explicit local DATABASE_URL")

    parsed = urlparse(database_url)
    local_hosts = {"localhost", "127.0.0.1", "::1", "db", "tapas-fpl-db"}
    database_name = parsed.path.removeprefix("/")
    if parsed.hostname not in local_hosts or database_name in {"", "postgres"}:
        raise RuntimeError(
            f"{operation} is restricted to a disposable local database; "
            f"refusing host={parsed.hostname!r} database={database_name!r}"
        )
