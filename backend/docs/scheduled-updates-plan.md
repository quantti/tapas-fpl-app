# Scheduled Points Against Updates

## Overview

Automatically update Points Against data when a new gameweek is finalized (all games finished, bonus points added, autosubs processed).

## Trigger Condition

FPL API `bootstrap-static` endpoint provides per-gameweek flags:
- `finished: true` - All games completed
- `data_checked: true` - **Fully finalized** (bonus + autosubs done)

**Update when:** New gameweek has `data_checked: true` AND is newer than our stored `latest_gameweek`.

## Implementation: Supercronic on Fly.io

### Files to Create/Modify

1. **`backend/crontab`** (new)
   ```
   # Daily at 06:00 UTC (06:00 GMT / 07:00 BST)
   0 6 * * * python -m scripts.check_and_update_points_against
   ```

2. **`backend/scripts/check_and_update_points_against.py`** (new)
   ```python
   # Pseudo-code:
   # 1. Fetch bootstrap-static from FPL API
   # 2. Find latest gameweek with data_checked=true
   # 3. Get our stored latest_gameweek from DB
   # 4. If FPL's latest > our latest:
   #      - Run incremental collection (only new GW data)
   #      - Update latest_gameweek in DB
   # 5. Log result
   ```

3. **`backend/Dockerfile`** (modify)
   - Add Supercronic installation
   - Download binary, verify checksum
   - Copy crontab file

4. **`backend/fly.toml`** (modify)
   ```toml
   [processes]
     api = "uvicorn app.main:app --host 0.0.0.0 --port 8080"
     cron = "supercronic /app/crontab"

   [[services]]
     processes = ["api"]  # Only API is internet-facing
   ```

### Deployment

```bash
fly deploy
fly scale count cron=1 api=2  # One cron instance, multiple API instances
```

### Incremental vs Full Collection

| Type | When | Duration |
|------|------|----------|
| Full | Initial setup, season start | ~65 min (785 players) |
| Incremental | Weekly after GW finalized | ~5-10 min (only new fixtures) |

**Incremental approach:**
- Only fetch player histories for players who played in the new gameweek
- Or: Fetch all players but only process fixtures from new gameweek
- Update `latest_gameweek` after success

## Schedule

- **Time:** 06:00 UTC daily
- **Why daily?** Gameweeks can end any day (midweek games, blank GWs)
- **Idempotent:** If no new data_checked GW, script exits without changes

## Monitoring

- Logs visible via `fly logs --app tapas-fpl-backend`
- Status endpoint: `GET /api/v1/points-against/status`
  - Shows `latest_gameweek`, `last_full_collection`, `last_incremental_update`

## References

- [Fly.io Supercronic Docs](https://fly.io/docs/blueprints/supercronic/)
- [Fly.io Task Scheduling Guide](https://fly.io/docs/blueprints/task-scheduling/)
- FPL API: `https://fantasy.premierleague.com/api/bootstrap-static/`
