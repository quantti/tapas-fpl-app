"""Unit tests for configuration module."""

import os
from unittest.mock import patch

from app.config import Settings, get_settings


class TestSettings:
    """Tests for Settings configuration class."""

    @patch.dict(os.environ, {"LOG_LEVEL": ""}, clear=False)
    def test_default_values(self):
        """Settings should have sensible defaults."""
        # Clear LOG_LEVEL to test actual defaults (not env overrides)
        os.environ.pop("LOG_LEVEL", None)
        settings = Settings()

        assert settings.log_level == "INFO"
        assert "localhost" in settings.cors_origins

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

    @patch.dict(os.environ, {"LOG_LEVEL": "DEBUG"})
    def test_log_level_override(self):
        """Log level should be configurable via environment."""
        settings = Settings()

        assert settings.log_level == "DEBUG"


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
