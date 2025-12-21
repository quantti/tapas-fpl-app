# Fantasy Premier League API Documentation

Base URL: `https://fantasy.premierleague.com/api/`

> **Note**: This is an unofficial, undocumented API. It may change without notice.

## Core Endpoints

### Bootstrap Static
```
GET /bootstrap-static/
```
**The most important endpoint** - returns all static game data in one request.

**Response includes:**
- `events[]` - All gameweeks with deadlines, scores, chip usage stats
- `teams[]` - All 20 Premier League teams with strength ratings
- `elements[]` - All players with full stats (500+ players)
- `element_types[]` - Position definitions (GK, DEF, MID, FWD)
- `game_settings` - Squad rules, scoring system, etc.
- `total_players` - Total number of FPL managers

**Caching recommendation**: This data updates a few times per day. Cache for 5-15 minutes.

---

### Fixtures
```
GET /fixtures/
GET /fixtures/?event={gameweek_id}
```
All fixtures for the season, optionally filtered by gameweek.

**Response includes:**
- Match schedules and kickoff times
- Team difficulty ratings
- Scores (when available)
- Player stats per fixture (goals, assists, bonus points)

---

### Entry (Manager Team)
```
GET /entry/{team_id}/
```
Information about a specific FPL manager's team.

**Response includes:**
- Manager name and region
- Overall points and rank
- Team value and bank
- Leagues joined
- Current event points

**Note**: Team IDs are visible in FPL URLs like `fantasy.premierleague.com/entry/{team_id}/history`

---

### Entry History
```
GET /entry/{team_id}/history/
```
Historical data for a manager's team.

**Response includes:**
- `current[]` - Points and rank per gameweek this season
- `past[]` - Previous seasons' final points and rank
- `chips[]` - Chips used (wildcard, bench boost, etc.)

---

### Entry Picks
```
GET /entry/{team_id}/event/{gameweek}/picks/
```
Manager's team selection for a specific gameweek.

**Response includes:**
- `picks[]` - 15 selected players with positions, captain, vice-captain
- `active_chip` - Chip played that week (if any)
- `automatic_subs[]` - Auto-substitutions made
- `entry_history` - Points and rank for that week

---

### Entry Transfers
```
GET /entry/{team_id}/transfers/
```
All transfers made by a manager this season.

**Response includes:**
- Player in/out IDs
- Transfer cost (if any)
- Gameweek of transfer
- Time of transfer

---

### League Standings (Classic)
```
GET /leagues-classic/{league_id}/standings/
GET /leagues-classic/{league_id}/standings/?page_standings={page}
```
Classic league standings with pagination (50 entries per page).

**Response includes:**
- League metadata
- `standings.results[]` - Managers ranked by total points
  - Current rank and movement
  - Gameweek points
  - Total points

---

### League Standings (H2H)
```
GET /leagues-h2h/{league_id}/standings/
```
Head-to-head league standings.

---

### Live Gameweek
```
GET /event/{gameweek}/live/
```
Real-time data during an active gameweek.

**Response includes:**
- `elements[]` - All players with current stats
  - Points breakdown (explain array)
  - Bonus points (provisional during matches)
  - Dream team selection

**Update frequency**: Every 30-60 seconds during live matches.

---

### Player Summary
```
GET /element-summary/{player_id}/
```
Detailed information for a single player.

**Response includes:**
- `fixtures[]` - Upcoming fixtures with difficulty
- `history[]` - Points breakdown per gameweek this season
- `history_past[]` - Previous seasons' total points

---

### Dream Team
```
GET /dream-team/{gameweek}/
```
Best XI for a completed gameweek.

---

## Additional Endpoints

| Endpoint | Description |
|----------|-------------|
| `/entry/{team_id}/cup/` | FPL Cup status and results |
| `/me/` | Your own team (requires auth) |
| `/my-team/{team_id}/` | Your team management (requires auth) |
| `/set-piece-notes/` | Set piece taker information |
| `/stats/most-valuable-teams/` | Top valued squads |

---

## Authentication

**Public endpoints** (no auth required):
- `/bootstrap-static/`
- `/fixtures/`
- `/entry/{team_id}/`
- `/leagues-classic/{league_id}/standings/`
- `/event/{gameweek}/live/`

**Private endpoints** (require login cookies):
- `/me/`
- `/my-team/{team_id}/`
- Making transfers (POST requests)

To authenticate:
1. Log in at `https://users.premierleague.com/`
2. Extract `pl_profile` and `csrftoken` cookies
3. Include cookies in requests

---

## Rate Limiting

No official documentation, but community observations:
- No strict limits on read-only endpoints
- Recommended: Max 1-2 requests per second
- Be respectful during high-traffic periods (gameweek deadlines)
- Bootstrap-static is heavy (~2MB) - cache it!

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 404 | Resource not found (invalid ID) |
| 503 | Service unavailable (high load periods) |

---

## Tips for Using the API

1. **Cache bootstrap-static** - It's large and updates infrequently
2. **Use fixtures for scheduling** - Plan when to fetch live data
3. **Check `is_current` in events** - Know which gameweek is active
4. **Player IDs are in `elements`** - Cross-reference with other endpoints
5. **Team IDs are stable** - Save them for your league members

---

## Common Data Lookups

### Player Position
```typescript
// element_type in player data
1 = Goalkeeper
2 = Defender
3 = Midfielder
4 = Forward
```

### Player Status
```typescript
// status field
'a' = Available
'i' = Injured (75% chance)
'd' = Doubtful (50% chance)
'n' = Not available (0% chance)
's' = Suspended
'u' = Unavailable (left PL)
```

### Price
```typescript
// now_cost is price * 10
const price = player.now_cost / 10; // e.g., 100 = £10.0m
```

---

## Example: Get Current Gameweek

```typescript
const bootstrap = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/').then(r => r.json());
const currentGameweek = bootstrap.events.find(e => e.is_current);
console.log(`Current GW: ${currentGameweek.id}`);
```

---

## Community Resources

- Search GitHub for "FPL API" for wrapper libraries
- r/FantasyPL subreddit has developer discussions
- API structure is stable season-to-season with minor changes
