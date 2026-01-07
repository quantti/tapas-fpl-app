# Scheduled Data Updates

## Overview

Automatically update backend data when a new gameweek is finalized (all games finished, bonus points added, autosubs processed).

**Data sources updated:**
1. **Points Against** - FPL points conceded by each team (~5-65 min)
2. **Chips Usage** - Manager chip activations per league (~30 sec)

## Trigger Condition

FPL API `bootstrap-static` endpoint provides per-gameweek flags:
- `finished: true` - All games completed
- `data_checked: true` - **Fully finalized** (bonus + autosubs done)

**Update when:** New gameweek has `data_checked: true` AND is newer than our stored `latest_gameweek`.

---

## Database Considerations (Supabase)

### Connection Keepalive

Supabase uses PgBouncer for connection pooling. Long-running operations risk:
- **Idle connection timeout** (default 60s)
- **Statement timeout** (can be 30s on free tier)
- **Connection pool exhaustion**

**Solutions:**

1. **Use transaction-mode pooling URL** (port 6543):
   ```
   postgresql://postgres.[project]:[password]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
   ```

2. **Periodic keepalive queries** during long operations:
   ```python
   async def keepalive(conn):
       """Run every 30s during long operations."""
       await conn.execute("SELECT 1")
   ```

3. **Batch commits** - Don't hold transactions open for minutes:
   ```python
   # Good: Commit every 50 players
   for i, player_id in enumerate(player_ids):
       await process_player(player_id)
       if (i + 1) % 50 == 0:
           await conn.execute("COMMIT")
           await conn.execute("BEGIN")
   ```

4. **Connection retry logic**:
   ```python
   async def get_connection_with_retry(max_retries=3):
       for attempt in range(max_retries):
           try:
               return await asyncpg.connect(DATABASE_URL)
           except asyncpg.ConnectionDoesNotExistError:
               if attempt == max_retries - 1:
                   raise
               await asyncio.sleep(2 ** attempt)
   ```

### Recommended Connection Settings

```python
# backend/app/db.py

async def create_pool():
    return await asyncpg.create_pool(
        DATABASE_URL,
        min_size=1,
        max_size=5,
        command_timeout=300,        # 5 min for long queries
        statement_cache_size=0,     # Disable for pgbouncer compatibility
    )
```

### Supabase Project Settings

Ensure these settings in Supabase Dashboard → Settings → Database:
- **Connection pooling mode**: Transaction (recommended)
- **Pool size**: At least 10 connections
- **Statement timeout**: 300000 (5 minutes) or higher for collection jobs

---

## Implementation: Supercronic on Fly.io

### Files to Create/Modify

1. **`backend/crontab`** (new)
   ```
   # Daily at 06:00 UTC (06:00 GMT / 07:00 BST)
   # After most GWs finalize + buffer for bonus points
   0 6 * * * python -m scripts.scheduled_update
   ```

2. **`backend/scripts/scheduled_update.py`** (new)

   See the actual implementation in `backend/scripts/scheduled_update.py`. Key design decisions:

   ```python
   # Key imports
   from app.services.chips import ChipsService
   from app.services.fpl_client import FplApiClient
   from scripts.collect_points_against import collect_points_against, get_or_create_season

   # Configuration
   LEAGUE_ID = 620837  # Tapas and Tackles league

   # Main flow:
   # 1. Fetch FPL bootstrap, validate response
   # 2. Find latest gameweek with data_checked=true
   # 3. Check collection_status to see if already processed
   # 4. Run Points Against collection (uses existing collect_points_against)
   # 5. Verify Points Against data was saved correctly
   # 6. Run Chips collection (uses ChipsService.sync_league_chips)
   # 7. Verify Chips data was saved correctly
   # 8. Only if all verifications pass: mark gameweek as processed

   # Rate limiting: 1.0 req/sec for incremental (vs 0.2 for bulk)
   # because weekly updates only fetch ~300 players, not all 785
   ```

   **Verification before completion**: The script only marks a gameweek as processed after verifying data was saved correctly. If verification fails, the gameweek remains unprocessed and will be retried on next run.

3. **`backend/Dockerfile`** (modify)
   ```dockerfile
   FROM python:3.14-slim

   # Install Supercronic for cron jobs
   ARG SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64
   ARG SUPERCRONIC_SHA1SUM=cd48d45c4b10f3f0bfdd3a57d054cd05ac96812b
   ARG SUPERCRONIC=supercronic-linux-amd64

   RUN apt-get update && apt-get install -y curl && \
       curl -fsSLO "$SUPERCRONIC_URL" && \
       echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - && \
       chmod +x "$SUPERCRONIC" && \
       mv "$SUPERCRONIC" /usr/local/bin/supercronic && \
       apt-get remove -y curl && apt-get autoremove -y && \
       rm -rf /var/lib/apt/lists/*

   WORKDIR /app

   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY . .

   # Copy crontab for scheduled jobs
   COPY crontab /app/crontab

   # Default command (overridden by fly.toml processes)
   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
   ```

4. **`backend/fly.toml`** (modify)
   ```toml
   app = "tapas-fpl-backend"
   primary_region = "lhr"

   [build]

   [processes]
     api = "uvicorn app.main:app --host 0.0.0.0 --port 8080"
     cron = "supercronic /app/crontab"

   [[services]]
     internal_port = 8080
     protocol = "tcp"
     processes = ["api"]  # Only API is internet-facing

     [[services.ports]]
       port = 80
       handlers = ["http"]
     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]

   [env]
     # Cron process doesn't need to serve HTTP
     # API process handles all web traffic
   ```

### Deployment

```bash
# Deploy with both processes
fly deploy

# Scale: 1 cron instance (always running), 1-2 API instances
fly scale count cron=1 api=1

# View cron logs
fly logs --app tapas-fpl-backend | grep -i cron
```

---

## Collection Details

### Points Against Collection

| Type | When | Duration | API Calls |
|------|------|----------|-----------|
| Full | Initial setup, season start | ~65 min | ~785 (all players) |
| Incremental | After each GW finalized | ~5-10 min | ~300 (players who played) |

**Incremental approach:**
1. Fetch `/event/{gw}/live/` to get players who played
2. Only fetch element-summary for those players
3. Process only fixtures from the new gameweek
4. Upsert to `points_against_by_fixture` table

### Chips Collection

| Type | When | Duration | API Calls |
|------|------|----------|-----------|
| League refresh | After each GW finalized | ~30 sec | ~20 (one per manager) |

**Collection approach:**
1. Fetch league standings to get manager IDs
2. For each manager, fetch `/entry/{id}/history/`
3. Extract `chips` array
4. Upsert to `chip_usage` table

---

## Schedule

- **Time:** 06:00 UTC daily
- **Why daily?** Gameweeks can end any day (midweek games, blank GWs)
- **Why 06:00?** GWs typically finish by 22:00 UK time + ~8hr buffer for FPL to finalize
- **Idempotent:** If no new `data_checked` GW, script exits without changes

### Gameweek Finalization Timeline

```
Sunday 16:30 - Last match kicks off
Sunday 18:30 - Last match ends
Sunday ~20:00 - Bonus points calculated
Sunday ~22:00 - data_checked = true
Monday 06:00 - Our scheduled update runs
```

---

## Monitoring

### Logs

```bash
# View all logs
fly logs --app tapas-fpl-backend

# Filter to cron/scheduled updates
fly logs --app tapas-fpl-backend | grep -E "(scheduled|cron|Points Against|Chips)"
```

### Status Endpoints

- `GET /api/v1/points-against/status` - Points Against collection status
- `GET /api/v1/chips/status` - Chips collection status (to be implemented)

**Response:**
```json
{
  "latest_gameweek": 20,
  "last_full_collection": "2026-01-01T06:00:00Z",
  "last_incremental_update": "2026-01-06T06:00:00Z",
  "status": "idle"
}
```

### Health Check

Add to `/api/v1/health`:
```json
{
  "status": "healthy",
  "data_freshness": {
    "points_against_gw": 20,
    "chips_gw": 20,
    "hours_since_update": 12
  }
}
```

---

## Error Handling

### Retry Strategy

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=60)
)
async def fetch_with_retry(url: str):
    """Fetch with exponential backoff."""
    ...
```

### Failure Scenarios

| Scenario | Handling |
|----------|----------|
| FPL API 503 | Retry with backoff, alert if persists |
| Database timeout | Reconnect, resume from checkpoint |
| Partial failure | Upserts are idempotent, safe to re-run |
| Cron process crash | Fly.io auto-restarts, next run catches up |

### Alerting (Future)

Could add Discord/Slack webhook on failure:
```python
if failed:
    await send_alert(f"Scheduled update failed: {error}")
```

---

## Implementation Checklist

- [x] Create `backend/crontab` file
- [x] Create `backend/scripts/scheduled_update.py`
- [x] Add `collection_status` table migration (`migrations/010_collection_status.sql`)
- [ ] Update `backend/Dockerfile` with Supercronic
- [ ] Update `backend/fly.toml` with processes
- [ ] Test locally with `python -m scripts.scheduled_update`
- [ ] Deploy to Fly.io
- [ ] Verify cron runs with `fly logs`
- [ ] Add status endpoints (optional - `show_status()` already provides CLI status)

---

## References

- [Fly.io Supercronic Docs](https://fly.io/docs/blueprints/supercronic/)
- [Fly.io Task Scheduling Guide](https://fly.io/docs/blueprints/task-scheduling/)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [asyncpg with PgBouncer](https://magicstack.github.io/asyncpg/current/usage.html#connection-pools)
- FPL API: `https://fantasy.premierleague.com/api/bootstrap-static/`
