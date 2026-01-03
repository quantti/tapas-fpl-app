#!/usr/bin/env python
"""
Run SQL migrations in order.

Usage:
    python -m scripts.migrate           # Run pending migrations
    python -m scripts.migrate --status  # Show migration status
    python -m scripts.migrate --reset   # Drop all and re-run (DANGER!)
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

# Load local environment
load_dotenv(".env.local")
load_dotenv(".env")

MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations"


async def get_connection() -> asyncpg.Connection:
    """Get database connection from environment."""
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://tapas:localdev@localhost:5432/tapas_fpl"
    )
    return await asyncpg.connect(db_url)


async def ensure_migrations_table(conn: asyncpg.Connection) -> None:
    """Create migrations tracking table if it doesn't exist."""
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)


async def get_applied_migrations(conn: asyncpg.Connection) -> set[str]:
    """Get set of already applied migration names."""
    rows = await conn.fetch("SELECT name FROM _migrations ORDER BY name")
    return {row["name"] for row in rows}


async def get_pending_migrations(conn: asyncpg.Connection) -> list[Path]:
    """Get list of migration files that haven't been applied."""
    applied = await get_applied_migrations(conn)
    all_migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    return [m for m in all_migrations if m.name not in applied]


async def run_migration(conn: asyncpg.Connection, migration_file: Path) -> None:
    """Execute a single migration file."""
    sql = migration_file.read_text()

    # Execute migration in a transaction
    async with conn.transaction():
        await conn.execute(sql)
        await conn.execute(
            "INSERT INTO _migrations (name) VALUES ($1)", migration_file.name
        )


async def run_all_pending(conn: asyncpg.Connection) -> int:
    """Run all pending migrations. Returns count of migrations run."""
    await ensure_migrations_table(conn)
    pending = await get_pending_migrations(conn)

    if not pending:
        print("No pending migrations.")
        return 0

    print(f"Found {len(pending)} pending migration(s):")
    for migration_file in pending:
        print(f"  Applying {migration_file.name}...")
        try:
            await run_migration(conn, migration_file)
            print(f"  \u2713 {migration_file.name}")
        except Exception as e:
            print(f"  \u2717 {migration_file.name} FAILED: {e}")
            raise

    print(f"\nMigrations complete! Applied {len(pending)} migration(s).")
    return len(pending)


async def show_status(conn: asyncpg.Connection) -> None:
    """Show current migration status."""
    await ensure_migrations_table(conn)
    applied = await get_applied_migrations(conn)
    all_migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))

    print("Migration Status:")
    print("-" * 50)
    for migration_file in all_migrations:
        status = "\u2713 applied" if migration_file.name in applied else "  pending"
        print(f"  {status}  {migration_file.name}")
    print("-" * 50)
    print(f"Applied: {len(applied)}, Pending: {len(all_migrations) - len(applied)}")


async def reset_database(conn: asyncpg.Connection) -> None:
    """Drop all tables and re-run migrations. DANGEROUS!"""
    print("WARNING: This will DROP ALL TABLES and re-run migrations!")
    confirm = input("Type 'yes' to confirm: ")
    if confirm.lower() != "yes":
        print("Aborted.")
        return

    # Get all tables in public schema (except _migrations)
    tables = await conn.fetch("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
    """)

    if tables:
        print(f"Dropping {len(tables)} table(s)...")
        for row in tables:
            await conn.execute(f'DROP TABLE IF EXISTS "{row["tablename"]}" CASCADE')
            print(f"  Dropped {row['tablename']}")

    # Re-run all migrations
    await run_all_pending(conn)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Database migration runner")
    parser.add_argument("--status", action="store_true", help="Show migration status")
    parser.add_argument(
        "--reset", action="store_true", help="Drop all tables and re-run (DANGER!)"
    )
    args = parser.parse_args()

    try:
        conn = await get_connection()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        print("Make sure PostgreSQL is running: docker compose up -d")
        sys.exit(1)

    try:
        if args.status:
            await show_status(conn)
        elif args.reset:
            await reset_database(conn)
        else:
            await run_all_pending(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
