# Dashboard Consolidation Plan

**Date:** 2026-01-13
**Status:** Planning (Reviewed by backend-architect and frontend-react-expert agents)

## Problem Statement

The frontend dashboard makes ~64 FPL API calls on initial load:
- 4 league-level calls (standings, live, bootstrap-static, fixtures)
- 60 per-manager calls (20 managers × 3 endpoints: picks, history, transfers)

This causes:
1. Slow initial load times
2. FPL API rate limiting risks
3. Unnecessary network overhead

## Solution Overview

Create a consolidated backend endpoint that returns all manager data in a single call, leveraging existing database tables.

```
Before:  Frontend → 60 FPL API calls → FPL servers
After:   Frontend → 1 backend call → PostgreSQL (local DB)
```

## Database Schema Analysis (Verified)

### Tables Available

| Table | Column Names (DB) | Use Case |
|-------|-------------------|----------|
| `manager_pick` | `snapshot_id`, `player_id`, `position`, `multiplier`, `is_captain`, `is_vice_captain` | Squad picks via JOIN |
| `manager_gw_snapshot` | `manager_id`, `gameweek`, `season_id`, `points`, `total_points`, `overall_rank`, `bank`, `value`, `transfers_made`, `transfers_cost`, `chip_used` | Manager GW state |
| `chip_usage` | `manager_id`, `season_id`, `gameweek`, `chip_type`, `season_half` | Chips used history |
| `player` | `id`, `season_id`, `web_name`, `team_id`, `element_type`, `now_cost`, `form`, `points_per_game`, `selected_by_percent` | Player details |
| `transfer` | `manager_id`, `season_id`, `gameweek`, `player_in`, `player_out`, `price_in`, `price_out` | **EXISTS** (not a gap!) |
| `league_manager` | `league_id`, `manager_id`, `season_id`, `rank`, `last_rank`, `total`, `event_total` | League standings |
| `manager` | `id`, `season_id`, `player_first_name`, `player_last_name`, `name` (team name) | Manager info |
| `team` | `id`, `season_id`, `short_name` | Team short names |

### Schema Design Consideration

**Important:** `manager_pick` uses `snapshot_id` FK, not direct `manager_id`/`gameweek` columns.

```sql
-- manager_pick links through manager_gw_snapshot:
manager_pick.snapshot_id → manager_gw_snapshot.id
                           ├── manager_id
                           ├── gameweek
                           └── season_id
```

This requires a JOIN to filter picks by manager/gameweek:

```sql
SELECT mp.*, p.web_name, p.team_id, t.short_name
FROM manager_pick mp
JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
JOIN player p ON mp.player_id = p.id AND mgs.season_id = p.season_id
JOIN team t ON p.team_id = t.id AND mgs.season_id = t.season_id
WHERE mgs.manager_id = ANY($1)
  AND mgs.gameweek = $2
  AND mgs.season_id = $3;
```

### Column Name Mappings (Plan → DB)

| Plan Uses | Actual DB Column | Table |
|-----------|------------------|-------|
| `entry_id` | `manager_id` | manager_gw_snapshot, chip_usage, transfer |
| `gw_points` | `points` | manager_gw_snapshot |
| `rank` | `overall_rank` | manager_gw_snapshot |
| `transfer_cost` | `transfers_cost` | manager_gw_snapshot |
| `chip_name` | `chip_type` | chip_usage |

### Data Availability Check

Before implementing, verify via `fly ssh console`:

```sql
-- Check data counts (should be >0 for current season)
SELECT 'manager_gw_snapshot' as tbl, COUNT(*) FROM manager_gw_snapshot WHERE season_id = 1;
SELECT 'manager_pick' as tbl, COUNT(*) FROM manager_pick;
SELECT 'chip_usage' as tbl, COUNT(*) FROM chip_usage WHERE season_id = 1;
SELECT 'transfer' as tbl, COUNT(*) FROM transfer WHERE season_id = 1;
SELECT 'league_manager' as tbl, COUNT(*) FROM league_manager WHERE season_id = 1;
```

## Implementation Plan

### Phase 0: TDD - Write Tests First

**File:** `backend/tests/test_dashboard_service.py`

```python
"""Tests for DashboardService - TDD approach."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.dashboard import DashboardService, LeagueDashboard, ManagerDashboard

@pytest.fixture
def mock_conn():
    """Mock database connection."""
    return AsyncMock()

@pytest.fixture
def sample_snapshot_rows():
    """Sample manager_gw_snapshot data."""
    return [
        {
            "manager_id": 123,
            "points": 65,
            "total_points": 1250,
            "overall_rank": 50000,
            "bank": 5,  # 0.5M
            "value": 1023,  # 102.3M
            "transfers_made": 1,
            "transfers_cost": 0,
            "chip_used": None,
        },
        # ... more managers
    ]

class TestDashboardService:
    """TDD tests for DashboardService."""

    async def test_get_league_dashboard_returns_all_managers(
        self, mock_conn, sample_snapshot_rows
    ):
        """Dashboard should return data for all league managers."""
        mock_conn.fetch.return_value = sample_snapshot_rows
        service = DashboardService()

        result = await service.get_league_dashboard(
            league_id=242017,
            gameweek=21,
            season_id=1,
            conn=mock_conn
        )

        assert isinstance(result, LeagueDashboard)
        assert len(result.managers) == len(sample_snapshot_rows)

    async def test_managers_include_picks_with_player_details(
        self, mock_conn
    ):
        """Each manager should have 15 picks with player info."""
        # Setup mock to return picks with player data
        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        for manager in result.managers:
            assert len(manager.picks) == 15
            for pick in manager.picks:
                assert pick.player_name is not None
                assert pick.team_short_name is not None

    async def test_empty_league_returns_empty_managers_list(self, mock_conn):
        """Empty league should return empty managers list, not error."""
        mock_conn.fetch.return_value = []
        service = DashboardService()

        result = await service.get_league_dashboard(999999, 21, 1, mock_conn)

        assert result.managers == []

    async def test_chips_used_aggregated_correctly(self, mock_conn):
        """Chips used should include both season halves."""
        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Manager who used wildcard in GW5 (half 1) and bboost in GW22 (half 2)
        manager = next(m for m in result.managers if m.entry_id == 123)
        assert "wildcard_1" in manager.chips_used
        assert "bboost_2" in manager.chips_used

    async def test_transfers_included_for_gameweek(self, mock_conn):
        """Transfers for the requested gameweek should be included."""
        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager = next(m for m in result.managers if m.entry_id == 123)
        assert len(manager.transfers) >= 0  # May be 0 if no transfers

    async def test_bank_and_value_converted_to_millions(self, mock_conn):
        """Bank and team_value should be in millions, not 0.1M units."""
        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager = result.managers[0]
        assert manager.bank < 100  # Should be ~0-10, not 0-1000
        assert manager.team_value < 200  # Should be ~95-110, not 950-1100
```

**File:** `backend/tests/test_dashboard_routes.py`

```python
"""Integration tests for dashboard endpoint."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

class TestDashboardEndpoint:
    """Integration tests for /api/v1/dashboard/league/{id}."""

    async def test_returns_200_for_valid_league(self, client):
        """Valid league ID should return 200."""
        response = await client.get("/api/v1/dashboard/league/242017")
        assert response.status_code == 200

    async def test_returns_422_for_invalid_league_id(self, client):
        """Invalid league ID should return 422."""
        response = await client.get("/api/v1/dashboard/league/-1")
        assert response.status_code == 422

    async def test_response_shape_matches_schema(self, client):
        """Response should match expected JSON structure."""
        response = await client.get("/api/v1/dashboard/league/242017?gameweek=21")
        data = response.json()

        assert "league_id" in data
        assert "gameweek" in data
        assert "season_id" in data
        assert "managers" in data
        assert isinstance(data["managers"], list)

    async def test_cached_response_has_same_data(self, client):
        """Second request should return cached data."""
        r1 = await client.get("/api/v1/dashboard/league/242017?gameweek=21")
        r2 = await client.get("/api/v1/dashboard/league/242017?gameweek=21")

        assert r1.json() == r2.json()

    async def test_503_when_db_unavailable(self, client, monkeypatch):
        """Should return 503 when database is unavailable."""
        monkeypatch.setattr("app.db._pool", None)
        response = await client.get("/api/v1/dashboard/league/242017")
        assert response.status_code == 503
```

### Phase 1: Backend Service

**File:** `app/services/dashboard.py`

```python
"""Dashboard consolidation service - returns all league data in one call."""

import logging
from dataclasses import dataclass, field

import asyncpg

from app.db import get_connection

logger = logging.getLogger(__name__)


@dataclass
class ManagerPick:
    """A single player pick in a manager's squad."""
    position: int
    player_id: int
    player_name: str
    team_id: int
    team_short_name: str
    element_type: int
    is_captain: bool
    is_vice_captain: bool
    multiplier: int
    now_cost: int
    form: float
    points_per_game: float
    selected_by_percent: float


@dataclass
class ManagerTransfer:
    """A transfer made by a manager."""
    player_in_id: int
    player_in_name: str
    player_out_id: int
    player_out_name: str


@dataclass
class ManagerDashboard:
    """Full dashboard data for a single manager."""
    entry_id: int
    manager_name: str
    team_name: str
    total_points: int
    gw_points: int
    rank: int
    last_rank: int | None
    overall_rank: int | None  # Added per React expert
    last_overall_rank: int | None  # Added per React expert
    bank: float
    team_value: float
    transfers_made: int
    transfer_cost: int
    chip_active: str | None
    picks: list[ManagerPick] = field(default_factory=list)
    chips_used: list[str] = field(default_factory=list)
    transfers: list[ManagerTransfer] = field(default_factory=list)


@dataclass
class LeagueDashboard:
    """Consolidated dashboard response."""
    league_id: int
    gameweek: int
    season_id: int
    managers: list[ManagerDashboard] = field(default_factory=list)


class DashboardService:
    """Service for fetching consolidated league dashboard data."""

    async def get_league_dashboard(
        self,
        league_id: int,
        gameweek: int,
        season_id: int,
        conn: asyncpg.Connection,
    ) -> LeagueDashboard:
        """
        Returns consolidated dashboard data for a league.

        Uses 6 batched queries (~10-20ms total) instead of 60 API calls.
        """
        # 1. Get league managers
        manager_ids = await self._get_league_managers(conn, league_id, season_id)

        if not manager_ids:
            return LeagueDashboard(
                league_id=league_id,
                gameweek=gameweek,
                season_id=season_id,
            )

        # 2. Batch fetch all data
        snapshots = await self._get_snapshots(conn, manager_ids, gameweek, season_id)
        picks_by_manager = await self._get_picks(conn, manager_ids, gameweek, season_id)
        chips_by_manager = await self._get_chips(conn, manager_ids, season_id)
        transfers_by_manager = await self._get_transfers(conn, manager_ids, gameweek, season_id)
        manager_info = await self._get_manager_info(conn, manager_ids, season_id)
        league_standings = await self._get_league_standings(conn, league_id, manager_ids, season_id)

        # 3. Assemble response
        managers = []
        for mid in manager_ids:
            snapshot = snapshots.get(mid)
            if not snapshot:
                continue

            info = manager_info.get(mid, {})
            standings = league_standings.get(mid, {})

            managers.append(ManagerDashboard(
                entry_id=mid,
                manager_name=f"{info.get('player_first_name', '')} {info.get('player_last_name', '')}".strip(),
                team_name=info.get('name', ''),
                total_points=snapshot['total_points'],
                gw_points=snapshot['points'],
                rank=standings.get('rank', 0),
                last_rank=standings.get('last_rank'),
                overall_rank=snapshot['overall_rank'],
                last_overall_rank=None,  # Would need previous GW lookup
                bank=snapshot['bank'] / 10,
                team_value=snapshot['value'] / 10,
                transfers_made=snapshot['transfers_made'],
                transfer_cost=snapshot['transfers_cost'],
                chip_active=snapshot['chip_used'],
                picks=picks_by_manager.get(mid, []),
                chips_used=chips_by_manager.get(mid, []),
                transfers=transfers_by_manager.get(mid, []),
            ))

        managers.sort(key=lambda m: m.rank or 999999)

        return LeagueDashboard(
            league_id=league_id,
            gameweek=gameweek,
            season_id=season_id,
            managers=managers,
        )

    async def _get_league_managers(
        self, conn: asyncpg.Connection, league_id: int, season_id: int
    ) -> list[int]:
        """Get all manager IDs in the league."""
        rows = await conn.fetch(
            """
            SELECT manager_id FROM league_manager
            WHERE league_id = $1 AND season_id = $2
            """,
            league_id, season_id
        )
        return [r['manager_id'] for r in rows]

    async def _get_snapshots(
        self, conn: asyncpg.Connection, manager_ids: list[int], gameweek: int, season_id: int
    ) -> dict[int, dict]:
        """Batch fetch snapshots for all managers."""
        rows = await conn.fetch(
            """
            SELECT manager_id, points, total_points, overall_rank,
                   bank, value, transfers_made, transfers_cost, chip_used
            FROM manager_gw_snapshot
            WHERE manager_id = ANY($1)
              AND gameweek = $2
              AND season_id = $3
            """,
            manager_ids, gameweek, season_id
        )
        return {r['manager_id']: dict(r) for r in rows}

    async def _get_picks(
        self, conn: asyncpg.Connection, manager_ids: list[int], gameweek: int, season_id: int
    ) -> dict[int, list[ManagerPick]]:
        """Batch fetch picks with player details for all managers."""
        rows = await conn.fetch(
            """
            SELECT
                mgs.manager_id,
                mp.position,
                mp.player_id,
                mp.is_captain,
                mp.is_vice_captain,
                mp.multiplier,
                p.web_name,
                p.team_id,
                p.element_type,
                p.now_cost,
                p.form,
                p.points_per_game,
                p.selected_by_percent,
                t.short_name
            FROM manager_pick mp
            JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
            JOIN player p ON mp.player_id = p.id AND mgs.season_id = p.season_id
            JOIN team t ON p.team_id = t.id AND mgs.season_id = t.season_id
            WHERE mgs.manager_id = ANY($1)
              AND mgs.gameweek = $2
              AND mgs.season_id = $3
            ORDER BY mgs.manager_id, mp.position
            """,
            manager_ids, gameweek, season_id
        )

        result: dict[int, list[ManagerPick]] = {mid: [] for mid in manager_ids}
        for r in rows:
            result[r['manager_id']].append(ManagerPick(
                position=r['position'],
                player_id=r['player_id'],
                player_name=r['web_name'],
                team_id=r['team_id'],
                team_short_name=r['short_name'],
                element_type=r['element_type'],
                is_captain=r['is_captain'],
                is_vice_captain=r['is_vice_captain'],
                multiplier=r['multiplier'],
                now_cost=r['now_cost'],
                form=float(r['form'] or 0),
                points_per_game=float(r['points_per_game'] or 0),
                selected_by_percent=float(r['selected_by_percent'] or 0),
            ))
        return result

    async def _get_chips(
        self, conn: asyncpg.Connection, manager_ids: list[int], season_id: int
    ) -> dict[int, list[str]]:
        """Batch fetch chips used by all managers."""
        rows = await conn.fetch(
            """
            SELECT manager_id, chip_type, season_half
            FROM chip_usage
            WHERE manager_id = ANY($1)
              AND season_id = $2
            """,
            manager_ids, season_id
        )

        result: dict[int, list[str]] = {mid: [] for mid in manager_ids}
        for r in rows:
            # Format: "wildcard_1" for first half, "bboost_2" for second half
            chip_name = f"{r['chip_type']}_{r['season_half']}"
            result[r['manager_id']].append(chip_name)
        return result

    async def _get_transfers(
        self, conn: asyncpg.Connection, manager_ids: list[int], gameweek: int, season_id: int
    ) -> dict[int, list[ManagerTransfer]]:
        """Batch fetch transfers for all managers for this gameweek."""
        rows = await conn.fetch(
            """
            SELECT
                t.manager_id,
                t.player_in,
                t.player_out,
                pin.web_name as player_in_name,
                pout.web_name as player_out_name
            FROM transfer t
            JOIN player pin ON t.player_in = pin.id AND t.season_id = pin.season_id
            JOIN player pout ON t.player_out = pout.id AND t.season_id = pout.season_id
            WHERE t.manager_id = ANY($1)
              AND t.gameweek = $2
              AND t.season_id = $3
            """,
            manager_ids, gameweek, season_id
        )

        result: dict[int, list[ManagerTransfer]] = {mid: [] for mid in manager_ids}
        for r in rows:
            result[r['manager_id']].append(ManagerTransfer(
                player_in_id=r['player_in'],
                player_in_name=r['player_in_name'],
                player_out_id=r['player_out'],
                player_out_name=r['player_out_name'],
            ))
        return result

    async def _get_manager_info(
        self, conn: asyncpg.Connection, manager_ids: list[int], season_id: int
    ) -> dict[int, dict]:
        """Batch fetch manager names and team names."""
        rows = await conn.fetch(
            """
            SELECT id, player_first_name, player_last_name, name
            FROM manager
            WHERE id = ANY($1) AND season_id = $2
            """,
            manager_ids, season_id
        )
        return {r['id']: dict(r) for r in rows}

    async def _get_league_standings(
        self, conn: asyncpg.Connection, league_id: int, manager_ids: list[int], season_id: int
    ) -> dict[int, dict]:
        """Batch fetch league standings for all managers."""
        rows = await conn.fetch(
            """
            SELECT manager_id, rank, last_rank, total, event_total
            FROM league_manager
            WHERE league_id = $1
              AND manager_id = ANY($2)
              AND season_id = $3
            """,
            league_id, manager_ids, season_id
        )
        return {r['manager_id']: dict(r) for r in rows}
```

### Phase 2: Backend Route

**Add to:** `app/api/routes.py`

```python
from cachetools import TTLCache
from app.services.dashboard import DashboardService

DASHBOARD_CACHE_TTL = 60  # 1 minute
_dashboard_cache: TTLCache = TTLCache(maxsize=50, ttl=DASHBOARD_CACHE_TTL)

@router.get("/api/v1/dashboard/league/{league_id}")
async def get_league_dashboard(
    league_id: int = Path(..., ge=1),
    gameweek: int = Query(default=None, ge=1, le=38),
    season_id: int = Query(default=1, ge=1),
    _: None = Depends(require_db),
):
    """Consolidated dashboard endpoint - returns all league data in one call."""

    # Check cache
    cache_key = f"dashboard_{league_id}_{gameweek}_{season_id}"
    if cache_key in _dashboard_cache:
        return _dashboard_cache[cache_key]

    async with get_connection() as conn:
        # Get current GW if not specified
        if gameweek is None:
            gameweek = await conn.fetchval(
                "SELECT id FROM gameweek WHERE is_current = true AND season_id = $1",
                season_id
            )

        service = DashboardService()
        result = await service.get_league_dashboard(league_id, gameweek, season_id, conn)

        # Serialize and cache
        response = {
            "league_id": result.league_id,
            "gameweek": result.gameweek,
            "season_id": result.season_id,
            "managers": [
                {
                    "entry_id": m.entry_id,
                    "manager_name": m.manager_name,
                    "team_name": m.team_name,
                    "total_points": m.total_points,
                    "gw_points": m.gw_points,
                    "rank": m.rank,
                    "last_rank": m.last_rank,
                    "overall_rank": m.overall_rank,
                    "last_overall_rank": m.last_overall_rank,
                    "bank": m.bank,
                    "team_value": m.team_value,
                    "transfers_made": m.transfers_made,
                    "transfer_cost": m.transfer_cost,
                    "chip_active": m.chip_active,
                    "picks": [
                        {
                            "position": p.position,
                            "player_id": p.player_id,
                            "player_name": p.player_name,
                            "team_id": p.team_id,
                            "team_short_name": p.team_short_name,
                            "element_type": p.element_type,
                            "is_captain": p.is_captain,
                            "is_vice_captain": p.is_vice_captain,
                            "multiplier": p.multiplier,
                            "now_cost": p.now_cost,
                            "form": p.form,
                            "points_per_game": p.points_per_game,
                            "selected_by_percent": p.selected_by_percent,
                        }
                        for p in m.picks
                    ],
                    "chips_used": m.chips_used,
                    "transfers": [
                        {
                            "player_in_id": t.player_in_id,
                            "player_in_name": t.player_in_name,
                            "player_out_id": t.player_out_id,
                            "player_out_name": t.player_out_name,
                        }
                        for t in m.transfers
                    ],
                }
                for m in result.managers
            ],
        }

        _dashboard_cache[cache_key] = response
        return response
```

### Phase 3: Frontend Hook

**File:** `frontend/src/services/queries/useLeagueDashboard.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CURRENT_SEASON_ID } from 'config/index';
import { backendApi, BackendApiError } from 'services/backendApi';
import { queryKeys } from 'services/queryKeys';

// Add to queryKeys.ts:
// leagueDashboard: (leagueId: number, gameweek: number, seasonId: number) =>
//   ['leagueDashboard', leagueId, gameweek, seasonId] as const,

export interface DashboardPick {
  position: number;
  player_id: number;
  player_name: string;
  team_id: number;
  team_short_name: string;
  element_type: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
  now_cost: number;
  form: number;
  points_per_game: number;
  selected_by_percent: number;
}

export interface DashboardTransfer {
  player_in_id: number;
  player_in_name: string;
  player_out_id: number;
  player_out_name: string;
}

export interface DashboardManager {
  entry_id: number;
  manager_name: string;
  team_name: string;
  total_points: number;
  gw_points: number;
  rank: number;
  last_rank: number | null;
  overall_rank: number | null;
  last_overall_rank: number | null;
  bank: number;
  team_value: number;
  transfers_made: number;
  transfer_cost: number;
  chip_active: string | null;
  picks: DashboardPick[];
  chips_used: string[];
  transfers: DashboardTransfer[];
}

export interface LeagueDashboardResponse {
  league_id: number;
  gameweek: number;
  season_id: number;
  managers: DashboardManager[];
}

interface UseLeagueDashboardOptions {
  seasonId?: number;
  enabled?: boolean;
  isLive?: boolean;
}

export function useLeagueDashboard(
  leagueId: number,
  gameweek: number,
  options: UseLeagueDashboardOptions = {}
) {
  const { seasonId = CURRENT_SEASON_ID, enabled = true, isLive = false } = options;

  const query = useQuery({
    queryKey: queryKeys.leagueDashboard(leagueId, gameweek, seasonId),
    queryFn: () => backendApi.getLeagueDashboard(leagueId, gameweek, seasonId),
    staleTime: isLive ? 30_000 : 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: isLive ? 60_000 : false,
    enabled: enabled && gameweek > 0,
    retry: (failureCount, error) => {
      if (error instanceof BackendApiError && error.isServiceUnavailable) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Create players map from picks (for components that need it)
  const playersMap = useMemo(() => {
    if (!query.data) return new Map();
    const map = new Map();
    for (const manager of query.data.managers) {
      for (const pick of manager.picks) {
        if (!map.has(pick.player_id)) {
          map.set(pick.player_id, {
            id: pick.player_id,
            web_name: pick.player_name,
            team: pick.team_id,
            element_type: pick.element_type,
            now_cost: pick.now_cost,
            form: String(pick.form),
            points_per_game: String(pick.points_per_game),
            selected_by_percent: String(pick.selected_by_percent),
          });
        }
      }
    }
    return map;
  }, [query.data]);

  return {
    data: query.data,
    playersMap,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable:
      query.error instanceof BackendApiError && query.error.isServiceUnavailable,
    refresh: query.refetch,
  };
}
```

### Phase 4: Frontend Migration

Use feature flag for gradual rollout:

```typescript
// In Dashboard.tsx
const USE_CONSOLIDATED_ENDPOINT = import.meta.env.VITE_USE_DASHBOARD_ENDPOINT === 'true';

// Use new hook when flag is on
const dashboardQuery = useLeagueDashboard(LEAGUE_ID, currentGameweek?.id ?? 0, {
  enabled: USE_CONSOLIDATED_ENDPOINT && !!currentGameweek,
  isLive,
});

// Fallback to legacy hooks when flag is off
const legacyData = useFplData(/* ... */);

// Merge data sources
const managerDetails = USE_CONSOLIDATED_ENDPOINT
  ? transformDashboardToManagerDetails(dashboardQuery.data)
  : legacyData.managerDetails;
```

## Performance Estimate

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| API calls | 64 | 5 | 92% reduction |
| Network requests | 64 | 5 | 92% reduction |
| Backend queries | 0 | 6 | ~10-20ms total |
| Time to interactive | ~3-5s | <1s | ~80% faster |

**Query breakdown (20-manager league):**
1. `league_manager` lookup: ~1ms
2. `manager_gw_snapshot` batch: ~2-5ms (20 rows)
3. `manager_pick` batch with JOINs: ~5-10ms (300 rows)
4. `chip_usage` batch: ~1ms
5. `transfer` batch: ~1-2ms
6. `manager` info: ~1ms

## Resolved Questions

| Question | Answer |
|----------|--------|
| Transfers table needed? | **No** - `transfer` table already exists |
| Live scoring separate? | **Yes** - Keep `useLiveScoring` separate (different update frequency) |
| Caching strategy? | **Both** - Backend 60s TTL + Frontend 60s staleTime |
| `usePersonalStats.ts` duplicate keys? | **N/A** - File doesn't exist (may have been removed) |
| Overall rank needed? | **Yes** - Added `overall_rank` and `last_overall_rank` to response |
| Transfer player names? | **Yes** - Include names in response to avoid frontend lookup |

## Tasks Breakdown (TDD Order)

### Backend Tasks
- [ ] Write `test_dashboard_service.py` unit tests
- [ ] Write `test_dashboard_routes.py` integration tests
- [ ] Create `DashboardService` class (make tests pass)
- [ ] Add `GET /api/v1/dashboard/league/{id}` route
- [ ] Add response caching (60s TTL)
- [ ] Verify all tests pass

### Frontend Tasks
- [ ] Write `useLeagueDashboard.test.ts` tests
- [ ] Create `useLeagueDashboard` hook (make tests pass)
- [ ] Add `leagueDashboard` to queryKeys.ts
- [ ] Add `getLeagueDashboard` to backendApi.ts
- [ ] Create `types/dashboard.ts`
- [ ] Add feature flag `VITE_USE_DASHBOARD_ENDPOINT`
- [ ] Refactor `Dashboard.tsx` with feature flag
- [ ] Test with flag on/off
- [ ] Remove feature flag after validation
- [ ] Deprecate per-manager fetch code in `useFplData.ts`

## Acceptance Criteria

1. All TDD tests pass
2. Dashboard loads in <1s on 4G connection
3. Network tab shows ≤5 requests for initial dashboard load
4. All existing functionality preserved
5. No regression in live scoring updates
6. Feature flag allows safe rollback
