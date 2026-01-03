#!/bin/bash
# Start local development environment with backend + frontend
# Usage: ./scripts/start-dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$FRONTEND_DIR/../backend"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting local development environment...${NC}"

# Kill any existing processes on our ports
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
(cd "$BACKEND_DIR" && docker compose stop api 2>/dev/null) || true
lsof -ti:8000 | xargs -r kill -9 2>/dev/null || true
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    # Kill background processes
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    # Stop docker compose
    (cd "$BACKEND_DIR" && docker compose down) 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"
}
trap cleanup EXIT

# 1. Start PostgreSQL via docker compose (only postgres, not the api service)
echo -e "${GREEN}[1/5] Starting PostgreSQL...${NC}"
(cd "$BACKEND_DIR" && docker compose up -d postgres)

# Wait for PostgreSQL to be ready
echo -e "${GREEN}[2/5] Waiting for PostgreSQL to be ready...${NC}"
sleep 3

# Set DATABASE_URL for local postgres (uvicorn runs outside Docker, so use localhost)
export DATABASE_URL="postgresql://tapas:localdev@localhost:5432/tapas_fpl"

# 2. Run migrations
echo -e "${GREEN}[3/5] Running database migrations...${NC}"
(cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" .venv/bin/python -m scripts.migrate)

# 3. Seed test data
echo -e "${GREEN}[4/5] Seeding test data...${NC}"
(cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" .venv/bin/python -m scripts.seed_test_data)

# 4. Start backend API in background
echo -e "${GREEN}[5/5] Starting backend API on http://localhost:8000...${NC}"
(cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

# 5. Start frontend with Vercel dev
echo -e "${GREEN}Starting frontend on http://localhost:3000...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
(cd "$FRONTEND_DIR" && npx vercel dev)
