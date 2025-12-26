# Tapas FPL Backend

Python/FastAPI backend for future analytics features (expected points, transfer optimization).

**Note:** FPL API proxy is handled by Cloudflare Workers for instant edge responses. This backend is reserved for Python-specific analytics that require database access.

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
| `GET /api/analytics/expected-points/{player_id}` | Expected points (stub) |
| `POST /api/analytics/optimize-transfers` | Transfer optimizer (stub) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins (comma-separated) |
| `LOG_LEVEL` | `INFO` | Logging level |

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
```

## Testing

```bash
# Install dev dependencies
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=term-missing
```

### Test Structure

| File | Description |
|------|-------------|
| `test_config.py` | Settings defaults, CORS parsing, env overrides |
| `test_api.py` | Health check, analytics stubs, CORS |
| `conftest.py` | Shared test fixtures |

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
│   └── api/
│       └── routes.py       # Analytics stub endpoints
└── tests/
    ├── conftest.py         # Shared test fixtures
    ├── test_config.py      # Config unit tests
    └── test_api.py         # API integration tests
```

## Future Phases

- **Phase 2**: Expected Points (xP) calculation engine
- **Phase 3**: MILP transfer optimization (HiGHS solver)
- **Phase 4**: ML predictions (XGBoost ensemble)

See `RECOMMENDATIONS.md` in project root for full roadmap.
