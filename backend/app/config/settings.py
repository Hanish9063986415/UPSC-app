"""
Configuration management for the UPSC Answer Evaluation API.
Handles environment variables and application settings.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=("dev.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API Configuration
    app_name: str = "UPSC Answer Evaluation API"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: str = "development"
    frontend_url: str = Field(default="http://localhost:5173", validation_alias="FRONTEND_URL")
    allowed_origins: str = Field(default="", validation_alias="ALLOWED_ORIGINS")

    # Gemini AI Configuration
    api_key: str = Field(validation_alias="API_KEY")
    gemini_model: str = "models/gemini-2.5-flash"

    # API Settings
    max_upload_size: int = 50 * 1024 * 1024
    default_page_limit: int = 80
    max_page_limit: int = 100

    # CORS Settings
    cors_credentials: bool = True
    cors_methods: list = ["*"]
    cors_headers: list = ["*"]

    # Logging Configuration
    log_level: str = "INFO"
    log_file: str = "execution.log"

    # Processing Configuration
    image_max_pixels: Optional[int] = None
    pdf_zoom_factor: int = 2

    # Concurrency Configuration
    max_workers: int = 50
    extraction_batch_size: int = 10
    max_concurrent_evals: int = 10
    max_concurrent_requests: int = 100

    # JSON Processing & Error Handling
    json_parse_retry_attempts: int = 3
    json_sanitize_enabled: bool = True
    preserve_partial_results: bool = True

    # Token Management
    max_output_tokens: int = 6144
    enable_token_tracking: bool = True

    # Dashboard Display Configuration
    show_progress_percentage: bool = True
    show_timer: bool = True
    show_comprehensive_analysis: bool = True
    enable_visual_indicators: bool = True

    error_type_categories: list = [
        "FACTUAL ERROR",
        "LACK OF SPECIFIC EVIDENCE",
        "MISSING CONTEXT",
        "INSUFFICIENT ANALYSIS",
        "LACK OF DATA",
        "WEAK CONCLUSION",
        "POOR STRUCTURE",
        "IRRELEVANT CONTENT",
        "CHRONOLOGICAL ERROR",
        "RELEVANCE ERROR",
        "GEOGRAPHICAL ERROR",
        "CONCEPTUAL ERROR",
        "STATISTICAL ERROR",
        "LACK OF SUBSTANTIVE ANALYSIS",
        "LACK OF COHERENCE",
        "LACK OF SPECIFICITY",
        "LACK OF SYNTHESIS",
        "LACK OF PRECISE DEFINITION",
        "CONFUSION OF CONCEPTS",
        "LACK OF NUANCE",
        "INSUFFICIENT CITATION",
    ]

    api_keys: Optional[str] = Field(default=None, validation_alias="API_KEYS")
    request_timeout: int = 300

    @property
    def cors_origins(self) -> list[str]:
        if self.allowed_origins:
            return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
        if self.environment == "development":
            return ["*"]
        return [self.frontend_url]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
