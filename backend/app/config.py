"""Application configuration using pydantic-settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # FPL API
    fpl_api_base_url: str = "https://fantasy.premierleague.com/api"

    # CORS - comma-separated list of allowed origins
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    # Cache TTL in seconds
    cache_ttl_bootstrap: int = 300  # 5 minutes for bootstrap-static
    cache_ttl_fixtures: int = 600  # 10 minutes for fixtures
    cache_ttl_live: int = 60  # 1 minute for live data

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
