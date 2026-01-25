# FPL Rules - Season 2025/26

Comprehensive Fantasy Premier League rules reference for the 2025/26 season.

> **Important:** This document serves as the source of truth for FPL game mechanics in this codebase. All implementations should follow these rules.

## Table of Contents

- [Transfer Rules](#transfer-rules)
- [Chips System](#chips-system)
- [Squad Rules](#squad-rules)
- [Captain Rules](#captain-rules)
- [Scoring System](#scoring-system)
- [Gameweek Rules](#gameweek-rules)
- [2025/26 Season Changes](#202526-season-changes)
- [API Reference](#api-reference)

---

## Transfer Rules

### Free Transfers

| Rule | Value |
|------|-------|
| Starting FT (GW1) | 1 |
| Weekly gain | +1 after each completed GW |
| Maximum banked | **5** (changed from 2 in 2024/25) |
| Transfer cost (hit) | -4 points per extra transfer |

### Transfer Scenarios

| Scenario | FT Before | Transfers Made | FT After | Notes |
|----------|-----------|----------------|----------|-------|
| Normal transfer | 2 | 1 | 2 | 2 - 1 + 1 (weekly gain) |
| Use all FT | 3 | 3 | 1 | 3 - 3 + 1 |
| Hit (-4 points) | 2 | 3 | 1 | 2 - 2 (depletes to 0) + 1 |
| Hit (-8 points) | 1 | 3 | 1 | 1 - 1 (depletes to 0) + 1 |
| No transfers | 3 | 0 | 4 | 3 + 1 (capped at 5) |
| At max | 5 | 0 | 5 | Already at max, no gain |

### Hit Calculation

```
Extra transfers = transfers_made - available_FT
Hit penalty = extra_transfers × (-4)
```

**Example:** 2 FT available, make 4 transfers → 2 extra × -4 = **-8 points**

### Special: AFCON (Gameweek 16)

For 2025/26, free transfers are **topped up to 5** at GW16 to help manage Africa Cup of Nations departures.

---

## Chips System

### Two-Chip System (NEW for 2025/26)

**Major change:** Managers receive TWO sets of chips:

| Chip Set | Availability | Deadline |
|----------|--------------|----------|
| First set | GW1-19 | Must use by GW19 deadline (6:30pm GMT, 30 Dec) |
| Second set | GW20-38 | Available from GW20 onwards |

**Total: 8 chips per season** (4 chips × 2 sets)

### Available Chips

| Chip | Effect | FT Impact | Can Cancel? |
|------|--------|-----------|-------------|
| **Wildcard** | All transfers free for GW | Preserves banked FT | No |
| **Free Hit** | Unlimited transfers, squad reverts after GW | Preserves banked FT | No |
| **Triple Captain** | Captain points ×3 instead of ×2 | Normal FT rules | No |
| **Bench Boost** | All 15 players score (bench included) | Normal FT rules | No |

### Wildcard Details

- All transfers (including those already made) become free
- Played when confirming costly transfers
- **Cannot be cancelled after confirmation**
- **You KEEP your banked transfers** when playing Wildcard
- Best used for major squad overhaul

### Free Hit Details

- Unlimited free transfers for a single Gameweek
- Squad **reverts to previous state** after deadline
- **Cannot be cancelled after confirmation**
- **You KEEP your banked transfers** when playing Free Hit
- **Restriction:** Cannot use Free Hit in both GW19 AND GW20
- Ideal for Blank Gameweeks or Double Gameweeks

### Chip Examples (FT Impact)

| Scenario | FT Before Chip | FT After GW |
|----------|----------------|-------------|
| Wildcard with 3 FT | 3 | 4 (3 preserved + 1) |
| Free Hit with 2 FT | 2 | 3 (2 preserved + 1) |
| Wildcard with 5 FT | 5 | 5 (capped at max) |
| Triple Captain with 2 FT, 1 transfer | 2 | 2 (2 - 1 + 1) |

---

## Squad Rules

### Squad Composition

| Position | Required |
|----------|----------|
| Goalkeepers | 2 |
| Defenders | 5 |
| Midfielders | 5 |
| Forwards | 3 |
| **Total** | **15 players** |

### Budget

- **Total budget:** £100 million
- Player prices range from £4.0m to £15.0m+

### Formation Requirements

Starting XI must include:
- At least 1 Goalkeeper
- At least 3 Defenders
- At least 1 Forward

**Valid formations:** 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1

### Team Limits

- **Maximum 3 players from any single Premier League team**

---

## Captain Rules

### Captain

- **Mandatory:** Must assign a captain every Gameweek
- **Points:** If captain plays (any minutes), all points are **DOUBLED**
- **Bench restriction:** Cannot be on bench (but if auto-subbed in, still doubled)

### Vice-Captain

- **Mandatory:** Must assign from starting XI
- **Activation:** If captain plays 0 minutes, vice-captain earns **DOUBLE POINTS**
- **No bonus if captain plays:** Vice-captain scores normally if captain plays any minutes

### If Both Absent

- If neither captain nor vice-captain plays, **no player receives doubled points**

---

## Scoring System

### Goals

| Position | Points |
|----------|--------|
| Goalkeeper | 10 |
| Defender | 6 |
| Midfielder | 5 |
| Forward | 4 |

### Assists

- **3 points** per assist
- Simplified definition for 2025/26 (more objective criteria)

### Clean Sheets

| Position | Points |
|----------|--------|
| Goalkeeper | 4 |
| Defender | 4 |
| Midfielder | 1 |
| Forward | 0 |

**Note:** Must play 60+ minutes to earn clean sheet points.

### Goalkeeper/Defender Specific

| Action | Points |
|--------|--------|
| Every 3 saves | 1 |
| Penalty save | 5 |
| Every 2 goals conceded | -1 |

### Defensive Contributions (NEW for 2025/26)

| Position | Threshold | Points |
|----------|-----------|--------|
| Defenders | 10 CBIT (clearances, blocks, interceptions, tackles) | 2 |
| Midfielders/Forwards | 12 CBIRT (+ ball recoveries) | 2 |

### Play-Time Points

| Minutes | Points |
|---------|--------|
| 1-59 | 1 |
| 60+ | 2 |

### Negative Points

| Action | Points |
|--------|--------|
| Yellow card | -1 |
| Red card | -3 |
| Own goal | -2 |
| Missed penalty | -2 |

### Bonus Points System (BPS)

Three highest-scoring players per match receive bonus:

| Place | Bonus Points |
|-------|--------------|
| 1st | 3 |
| 2nd | 2 |
| 3rd | 1 |

**2025/26 BPS Changes:**

| Action | BPS Points | Notes |
|--------|------------|-------|
| GK save (inside box) | 3 | New location-based system |
| GK save (outside box) | 2 | New location-based system |
| Penalty save | 8 | Reduced from 9 |
| Goalline clearance | 9 | Increased from 3 |
| Penalty goal | 12 | Unified (was position-based) |
| Tackle won | 2 | Simplified formula |

---

## Gameweek Rules

### Deadline

- **Timing:** 90 minutes before opening match of Gameweek
- **Typical:** Saturday 11:00am GMT (when most GWs begin)
- All changes must be confirmed before deadline

### Auto-Substitution Rules

Auto-subs occur when starting XI players play 0 minutes:

1. Player must have played **zero minutes**
2. Valid replacement available on bench
3. Starting XI formation remains legal after sub
4. Substitutions processed at **end of Gameweek**

**Bench Priority:**
- Bench ranked in priority order (1st substitute → highest priority)
- Position-specific rules enforced (need DEF → only DEF can sub in)
- Formation constraints: Must maintain min 1 GK, 3 DEF, 1 FWD

### Price Changes

| Aspect | Value |
|--------|-------|
| Timing | Overnight UK (1:00-2:00am) |
| Change increment | ±£0.1m |
| Max weekly change | ±£0.3m |
| Profit formula | Gain £0.1m per £0.2m rise |

**Price change factors:**
- Net transfer activity (in vs out)
- Ownership percentage changes
- Frozen if player injured/flagged
- Wildcard/Free Hit transfers don't count toward price changes

---

## 2025/26 Season Changes

### Major New Features

| Feature | Description |
|---------|-------------|
| **Two-Chip System** | All 4 chips available in each half-season (8 total) |
| **Chip Reset at GW20** | First set must be used by GW19; new set from GW20 |
| **Simplified Assists** | More objective definition (41 extra assists vs 2024/25) |
| **Defensive Contributions** | New 2-point category for defensive actions |
| **BPS Overhaul** | 4 specific changes (saves, goalline, penalties, tackles) |
| **AFCON Transfers** | FT topped up to 5 at GW16 |
| **No Assistant Manager** | Chip removed for 2025/26 |

### Elite Global Leagues (NEW)

| League | Qualification |
|--------|---------------|
| Top 1% League | Top 1% from previous season |
| Top 10% League | Top 10% from previous season |

---

## API Reference

### Relevant FPL API Endpoints

| Endpoint | Data |
|----------|------|
| `/api/bootstrap-static/` | Players, teams, gameweeks, game settings |
| `/api/entry/{manager_id}/` | Manager info |
| `/api/entry/{manager_id}/history/` | Manager GW history, chips used |
| `/api/entry/{manager_id}/event/{gw}/picks/` | Squad picks for GW |
| `/api/element-summary/{player_id}/` | Player history and fixtures |
| `/api/fixtures/` | All fixtures |
| `/api/event/{gw}/live/` | Live GW data |

### Key API Fields

**Manager History (`/api/entry/{id}/history/`):**

```json
{
  "current": [
    {
      "event": 21,
      "transfers_made": 1,
      "transfers_cost": 0,
      "active_chip": null
    }
  ],
  "chips": [
    {
      "name": "wildcard",
      "time": "2025-10-05T15:30:00Z",
      "event": 7
    }
  ]
}
```

**Important:** `transfers_cost` is **negative** (e.g., `-4`, `-8`).

### Chip Names in API

| Chip | API Name |
|------|----------|
| Wildcard | `wildcard` |
| Free Hit | `freehit` |
| Triple Captain | `3xc` |
| Bench Boost | `bboost` |

---

## Sources

- [Official Fantasy Premier League](https://fantasy.premierleague.com/)
- [Premier League - What's new for 2025/26](https://www.premierleague.com/en/news/4373187)
- [Premier League - Two sets of chips](https://www.premierleague.com/en/news/4362027)
- [Premier League - AFCON transfers](https://www.premierleague.com/en/news/4362102)
- [Premier League - BPS changes](https://www.premierleague.com/en/news/4362127)
- [Premier League - Scoring points](https://www.premierleague.com/en/news/2174909)
- [Premier League - Managing your team](https://www.premierleague.com/en/news/2174899)

---

## Implementation Notes

When implementing FPL features in this codebase:

1. **Free transfers:** See `backend/app/services/calculations.py` → `calculate_free_transfers()`
2. **Chips:** See `backend/app/services/chips.py`
3. **Database schema:** See `backend/DB.md`
4. **API proxy:** See `frontend/api/` (Vercel serverless functions)
5. **Frontend components:** See `frontend/FRONTEND.md`

---

*Last updated: January 2026*
