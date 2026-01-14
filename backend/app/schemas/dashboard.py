"""Dashboard API response schemas.

These Pydantic models are used for API serialization. They can be populated
directly from the service dataclasses using model_validate(obj, from_attributes=True).
"""

from pydantic import BaseModel, ConfigDict


class PickResponse(BaseModel):
    """A player pick in a manager's squad."""

    model_config = ConfigDict(from_attributes=True)

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


class TransferResponse(BaseModel):
    """A transfer made by a manager."""

    model_config = ConfigDict(from_attributes=True)

    player_in_id: int
    player_in_name: str
    player_out_id: int
    player_out_name: str


class ManagerResponse(BaseModel):
    """Dashboard data for a single manager."""

    model_config = ConfigDict(from_attributes=True)

    entry_id: int
    manager_name: str
    team_name: str
    total_points: int
    gw_points: int
    rank: int
    last_rank: int | None
    overall_rank: int | None
    last_overall_rank: int | None
    bank: float
    team_value: float
    transfers_made: int
    transfer_cost: int
    total_hits_cost: int  # Cumulative transfer costs across all GWs
    chip_active: str | None
    picks: list[PickResponse]
    chips_used: list[str]
    transfers: list[TransferResponse]


class LeagueDashboardResponse(BaseModel):
    """Consolidated dashboard response for a league."""

    model_config = ConfigDict(from_attributes=True)

    league_id: int
    gameweek: int
    season_id: int
    managers: list[ManagerResponse]
