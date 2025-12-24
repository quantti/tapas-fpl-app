"""Unit tests for configuration module."""

import os
from unittest.mock import patch

import pytest

from app.config import Settings, get_settings


class TestSettings:
    """Tests for Settings configuration class."""

    def test_default_values(self):
        """Settings should have sensible defaults."""
        settings = Settings()

        assert settings.fpl_api_base_url == "https://fantasy.premierleague.com/api"
        assert settings.log_level == "INFO"
        assert settings.cache_ttl_bootstrap == 300
        assert settings.cache_ttl_fixtures == 600
        assert settings.cache_ttl_live == 60

    def test_cors_origins_list_single(self):
        """CORS origins should be parsed from comma-separated string."""
        settings = Settings(cors_origins="http://localhost:3000")

        assert settings.cors_origins_list == ["http://localhost:3000"]

    def test_cors_origins_list_multiple(self):
        """Multiple CORS origins should be parsed correctly."""
        settings = Settings(cors_origins="http://localhost:3000, https://app.example.com")

        assert settings.cors_origins_list == ["http://localhost:3000", "https://app.example.com"]

    def test_cors_origins_list_strips_whitespace(self):
        """Whitespace around CORS origins should be stripped."""
        settings = Settings(cors_origins="  http://a.com  ,  http://b.com  ")

        assert settings.cors_origins_list == ["http://a.com", "http://b.com"]

    @patch.dict(os.environ, {"FPL_API_BASE_URL": "https://custom.api.com"})
    def test_environment_override(self):
        """Settings should be overridable via environment variables."""
        # Clear the cache to pick up new env vars
        get_settings.cache_clear()

        settings = Settings()

        assert settings.fpl_api_base_url == "https://custom.api.com"

    @patch.dict(os.environ, {"LOG_LEVEL": "DEBUG"})
    def test_log_level_override(self):
        """Log level should be configurable via environment."""
        settings = Settings()

        assert settings.log_level == "DEBUG"

    @patch.dict(os.environ, {"CACHE_TTL_BOOTSTRAP": "600"})
    def test_cache_ttl_override(self):
        """Cache TTL should be configurable via environment."""
        settings = Settings()

        assert settings.cache_ttl_bootstrap == 600


class TestGetSettings:
    """Tests for get_settings function."""

    def test_returns_settings_instance(self):
        """get_settings should return a Settings instance."""
        get_settings.cache_clear()
        settings = get_settings()

        assert isinstance(settings, Settings)

    def test_caching(self):
        """get_settings should return the same cached instance."""
        get_settings.cache_clear()

        settings1 = get_settings()
        settings2 = get_settings()

        assert settings1 is settings2
