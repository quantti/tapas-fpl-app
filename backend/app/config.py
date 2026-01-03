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

    # CORS - comma-separated list of allowed origins
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    # Database (Supabase PostgreSQL)
    supabase_url: str = ""
    supabase_key: str = ""
    database_url: str = ""

    @property
    def db_connection_string(self) -> str:
        """Get database connection string (prefer DATABASE_URL if set)."""
        if self.database_url:
            return self.database_url
        # Construct from Supabase URL if available
        if self.supabase_url:
            # Extract project ref from URL: https://<project>.supabase.co
            import re

            match = re.search(r"https://([^.]+)\.supabase\.co", self.supabase_url)
            if match:
                project_ref = match.group(1)
                return f"postgresql://postgres.{project_ref}:@db.{project_ref}.supabase.co:5432/postgres"
        return ""

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
