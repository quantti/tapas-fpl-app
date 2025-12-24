"""Shared pytest fixtures for backend tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def sample_bootstrap_response() -> dict:
    """Sample FPL bootstrap-static response for testing."""
    return {
        "events": [
            {
                "id": 1,
                "name": "Gameweek 1",
                "deadline_time": "2025-08-15T17:30:00Z",
                "finished": True,
                "is_current": False,
                "is_next": False,
            },
            {
                "id": 18,
                "name": "Gameweek 18",
                "deadline_time": "2025-12-21T11:00:00Z",
                "finished": True,
                "is_current": True,
                "is_next": False,
            },
        ],
        "teams": [
            {"id": 1, "name": "Arsenal", "short_name": "ARS"},
            {"id": 12, "name": "Manchester United", "short_name": "MUN"},
        ],
        "elements": [
            {
                "id": 1,
                "web_name": "Salah",
                "team": 11,
                "element_type": 3,
                "now_cost": 130,
                "form": "8.5",
                "expected_goals": "10.5",
                "expected_assists": "5.2",
                "minutes": 1500,
            },
            {
                "id": 2,
                "web_name": "Haaland",
                "team": 13,
                "element_type": 4,
                "now_cost": 150,
                "form": "9.0",
                "expected_goals": "15.2",
                "expected_assists": "2.1",
                "minutes": 1400,
            },
        ],
        "chips": [
            {"id": 1, "name": "wildcard", "number": 1},
            {"id": 2, "name": "wildcard", "number": 2},
        ],
    }


@pytest.fixture
def sample_fixtures_response() -> list:
    """Sample FPL fixtures response for testing."""
    return [
        {
            "id": 1,
            "event": 1,
            "team_h": 12,
            "team_a": 4,
            "team_h_score": 4,
            "team_a_score": 2,
            "finished": True,
            "team_h_difficulty": 2,
            "team_a_difficulty": 4,
        },
        {
            "id": 2,
            "event": 1,
            "team_h": 1,
            "team_a": 20,
            "team_h_score": 2,
            "team_a_score": 0,
            "finished": True,
            "team_h_difficulty": 2,
            "team_a_difficulty": 4,
        },
        {
            "id": 180,
            "event": 19,
            "team_h": 11,
            "team_a": 9,
            "team_h_score": None,
            "team_a_score": None,
            "finished": False,
            "team_h_difficulty": 3,
            "team_a_difficulty": 3,
        },
    ]


@pytest.fixture
def sample_entry_response() -> dict:
    """Sample FPL entry (manager) response for testing."""
    return {
        "id": 12345,
        "player_first_name": "Test",
        "player_last_name": "Manager",
        "name": "Test FC",
        "summary_overall_points": 1000,
        "summary_overall_rank": 50000,
        "summary_event_points": 75,
        "summary_event_rank": 100000,
    }


@pytest.fixture
def sample_picks_response() -> dict:
    """Sample FPL entry picks response for testing."""
    return {
        "active_chip": None,
        "automatic_subs": [],
        "entry_history": {
            "event": 18,
            "points": 75,
            "total_points": 1000,
            "rank": 100000,
            "rank_sort": 100000,
            "overall_rank": 50000,
            "bank": 5,
            "value": 1000,
            "event_transfers": 1,
            "event_transfers_cost": 0,
            "points_on_bench": 8,
        },
        "picks": [
            {"element": 1, "position": 1, "multiplier": 1, "is_captain": False, "is_vice_captain": False},
            {"element": 2, "position": 2, "multiplier": 2, "is_captain": True, "is_vice_captain": False},
        ],
    }


@pytest.fixture
def sample_league_response() -> dict:
    """Sample FPL league standings response for testing."""
    return {
        "league": {
            "id": 314,
            "name": "Test League",
            "created": "2025-07-01T00:00:00Z",
        },
        "standings": {
            "has_next": False,
            "page": 1,
            "results": [
                {
                    "id": 1,
                    "event_total": 75,
                    "player_name": "Manager 1",
                    "rank": 1,
                    "last_rank": 1,
                    "rank_sort": 1,
                    "total": 1000,
                    "entry": 12345,
                    "entry_name": "Team 1",
                },
                {
                    "id": 2,
                    "event_total": 70,
                    "player_name": "Manager 2",
                    "rank": 2,
                    "last_rank": 2,
                    "rank_sort": 2,
                    "total": 950,
                    "entry": 67890,
                    "entry_name": "Team 2",
                },
            ],
        },
    }


@pytest.fixture
def sample_live_response() -> dict:
    """Sample FPL live event response for testing."""
    return {
        "elements": [
            {
                "id": 1,
                "stats": {
                    "minutes": 90,
                    "goals_scored": 1,
                    "assists": 1,
                    "clean_sheets": 0,
                    "goals_conceded": 2,
                    "own_goals": 0,
                    "penalties_saved": 0,
                    "penalties_missed": 0,
                    "yellow_cards": 0,
                    "red_cards": 0,
                    "saves": 0,
                    "bonus": 3,
                    "bps": 45,
                    "total_points": 12,
                },
            },
            {
                "id": 2,
                "stats": {
                    "minutes": 90,
                    "goals_scored": 2,
                    "assists": 0,
                    "clean_sheets": 0,
                    "goals_conceded": 1,
                    "own_goals": 0,
                    "penalties_saved": 0,
                    "penalties_missed": 0,
                    "yellow_cards": 1,
                    "red_cards": 0,
                    "saves": 0,
                    "bonus": 3,
                    "bps": 55,
                    "total_points": 15,
                },
            },
        ],
    }


@pytest.fixture
def sample_entry_history_response() -> dict:
    """Sample FPL entry history response for testing."""
    return {
        "current": [
            {
                "event": 1,
                "points": 65,
                "total_points": 65,
                "rank": 500000,
                "overall_rank": 500000,
                "event_transfers": 0,
                "event_transfers_cost": 0,
                "value": 1000,
                "bank": 0,
            },
            {
                "event": 2,
                "points": 72,
                "total_points": 137,
                "rank": 300000,
                "overall_rank": 350000,
                "event_transfers": 1,
                "event_transfers_cost": 0,
                "value": 1001,
                "bank": 5,
            },
        ],
        "past": [
            {"season_name": "2023/24", "total_points": 2100, "rank": 150000},
        ],
        "chips": [
            {"name": "bboost", "time": "2025-01-15T12:00:00Z", "event": 5},
        ],
    }


@pytest.fixture
def sample_entry_transfers_response() -> list:
    """Sample FPL entry transfers response for testing."""
    return [
        {
            "element_in": 100,
            "element_in_cost": 75,
            "element_out": 200,
            "element_out_cost": 70,
            "entry": 12345,
            "event": 2,
            "time": "2025-08-22T10:30:00Z",
        },
        {
            "element_in": 150,
            "element_in_cost": 60,
            "element_out": 250,
            "element_out_cost": 55,
            "entry": 12345,
            "event": 5,
            "time": "2025-09-12T14:00:00Z",
        },
    ]


@pytest.fixture
def sample_element_summary_response() -> dict:
    """Sample FPL element summary response for testing."""
    return {
        "fixtures": [
            {
                "id": 180,
                "event": 19,
                "difficulty": 3,
                "is_home": True,
                "team_h": 11,
                "team_a": 9,
            },
            {
                "id": 190,
                "event": 20,
                "difficulty": 2,
                "is_home": False,
                "team_h": 5,
                "team_a": 11,
            },
        ],
        "history": [
            {
                "element": 1,
                "fixture": 10,
                "total_points": 8,
                "round": 1,
                "minutes": 90,
            },
            {
                "element": 1,
                "fixture": 20,
                "total_points": 12,
                "round": 2,
                "minutes": 90,
            },
        ],
        "history_past": [
            {"season_name": "2023/24", "element_code": 12345, "total_points": 250},
        ],
    }


@pytest.fixture
def sample_event_status_response() -> dict:
    """Sample FPL event status response for testing."""
    return {
        "status": [
            {"bonus_added": True, "date": "2025-12-21", "event": 17, "points": "r"},
            {"bonus_added": True, "date": "2025-12-22", "event": 18, "points": "r"},
        ],
        "leagues": "Updated",
    }


@pytest.fixture
async def async_client():
    """Async HTTP client for testing the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
