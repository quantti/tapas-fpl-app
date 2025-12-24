# Tapas FPL Backend

Python/FastAPI backend for the Tapas FPL App. Replaces Cloudflare Workers with added caching and prepares for future analytics.

**Live:** https://tapas-fpl-backend.fly.dev

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Build and run
docker-compose up

# Or build manually
docker build -t tapas-fpl-backend .
docker run -p 8000:8000 -e CORS_ORIGINS="http://localhost:5173" tapas-fpl-backend
```

### Option 2: Local Python

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run
uvicorn app.main:app --reload
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /docs` | OpenAPI documentation |
| `GET /api/bootstrap-static` | FPL players, teams, events |
| `GET /api/fixtures` | All fixtures (optional `?event=N` filter) |
| `GET /api/entry/{id}` | Manager info |
| `GET /api/entry/{id}/history` | Manager gameweek history, past seasons, chips |
| `GET /api/entry/{id}/event/{gw}/picks` | Manager picks for gameweek |
| `GET /api/entry/{id}/transfers` | Manager transfer history |
| `GET /api/leagues-classic/{id}/standings` | League standings |
| `GET /api/event/{gw}/live` | Live scoring data |
| `GET /api/element-summary/{id}` | Player fixture history and upcoming |
| `GET /api/event-status` | Bonus points processing status |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FPL_API_BASE_URL` | `https://fantasy.premierleague.com/api` | FPL API base URL |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `LOG_LEVEL` | `INFO` | Logging level |
| `CACHE_TTL_BOOTSTRAP` | `300` | Bootstrap cache TTL (seconds) |
| `CACHE_TTL_FIXTURES` | `600` | Fixtures cache TTL |
| `CACHE_TTL_LIVE` | `60` | Live data cache TTL |

## Deploy to Fly.io

```bash
# First time
fly launch --no-deploy

# Set CORS origins (include BOTH www and non-www if using redirects!)
fly secrets set CORS_ORIGINS="https://tapas-and-tackles.live,https://www.tapas-and-tackles.live,http://localhost:5173"

# Deploy
fly deploy

# Logs
fly logs

# Check current secrets
fly secrets list
```

### CORS Configuration

**Important:** If your domain redirects (e.g., `example.com` → `www.example.com`), you must include **both** origins in `CORS_ORIGINS`. Browsers send the `Origin` header based on the final URL after redirects, so missing the www variant will cause API requests to fail silently.

## Testing

```bash
# Install dev dependencies
pip install pytest pytest-asyncio pytest-cov respx

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=term-missing
```

### Test Structure

| File | Tests | Description |
|------|-------|-------------|
| `test_config.py` | 9 | Settings defaults, CORS parsing, env overrides |
| `test_fpl_proxy.py` | 19 | CacheEntry TTL, FPLProxyService caching, error handling |
| `test_api.py` | 26 | API endpoints, health check, FPL proxy, stub endpoints |
| `conftest.py` | - | Shared fixtures (sample API responses) |

**Total: 54 tests**

### Test Categories

- **Unit tests**: Test individual components (config, cache, proxy service)
- **Integration tests**: Test full API request/response cycle via ASGI transport
- **Mocking**: Uses `respx` to mock HTTP calls to FPL API

## Project Structure

```
backend/
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Local development
├── fly.toml                # Fly.io configuration
├── pyproject.toml          # Python project config
├── requirements.txt        # Dependencies
├── .env.example            # Environment template
├── app/
│   ├── main.py             # FastAPI entry point
│   ├── config.py           # Settings management
│   ├── api/
│   │   └── routes.py       # API endpoints
│   └── services/
│       └── fpl_proxy.py    # FPL API proxy with caching
└── tests/
    ├── conftest.py         # Shared test fixtures
    ├── test_config.py      # Config unit tests
    ├── test_fpl_proxy.py   # Proxy service unit tests
    └── test_api.py         # API integration tests
```

## Future Phases

- **Phase 2**: Expected Points (xP) calculation engine
- **Phase 3**: MILP transfer optimization (HiGHS solver)
- **Phase 4**: ML predictions (XGBoost ensemble)

See `RECOMMENDATIONS.md` in project root for full roadmap.
