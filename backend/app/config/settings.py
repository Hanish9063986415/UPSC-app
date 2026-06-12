"""
Configuration management for the UPSC Answer Evaluation API.
Handles environment variables and application settings.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field, model_validator
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
    api_key: Optional[str] = Field(default=None, validation_alias="API_KEY")
    gemini_model: str = "models/gemini-2.5-flash"

    # API Settings
    max_upload_size: int = 50 * 1024 * 1024
    default_page_limit: int = 80
    max_page_limit: int = 300

    # CORS Settings
    cors_credentials: bool = True
    cors_methods: list = ["*"]
    cors_headers: list = ["*"]

    # Logging Configuration
    log_level: str = "INFO"
    log_file: str = "execution.log"

    # YantraIAS database (shared PostgreSQL)
    database_url: Optional[str] = Field(default=None, validation_alias="DATABASE_URL")
    database_echo: bool = Field(default=False, validation_alias="DATABASE_ECHO")
    database_auto_init: bool = Field(default=False, validation_alias="DATABASE_AUTO_INIT")
    yantra_user_id_header: str = Field(
        default="X-Yantra-User-Id", validation_alias="YANTRA_USER_ID_HEADER"
    )
    instamark_rate_per_page_inr: float = Field(default=1.0, validation_alias="INSTAMARK_RATE_PER_PAGE_INR")

    # Processing Configuration
    image_max_pixels: Optional[int] = 178_956_970
    pdf_zoom_factor: int = 2
    page_image_format: str = "JPEG"  # Smaller/faster than PNG for Gemini vision
    page_image_jpeg_quality: int = 85
    pdf_processing_batch_size: int = 8  # Pages rendered + sent to Gemini per batch
    pdf_render_workers: int = 8  # Parallel CPU threads for page rendering

    # Concurrency Configuration (tuned for ~80 pages in under 3 minutes on 2 GB RAM)
    max_workers: int = 8  # Gemini API thread pool
    extraction_batch_size: int = 8  # Parallel Gemini vision calls per batch
    max_concurrent_evals: int = 4  # Parallel question evaluations
    max_concurrent_model_answers: int = 4  # Parallel model-answer generation
    max_concurrent_requests: int = 8
    max_concurrent_pdf_jobs: int = 1
    target_eval_duration_seconds: int = 180  # Log warning if a job exceeds this

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

    @model_validator(mode="after")
    def resolve_gemini_api_keys(self) -> "Settings":
        """Accept either API_KEYS (comma-separated) or a single API_KEY."""
        keys: list[str] = []

        if self.api_keys and self.api_keys.strip():
            keys = [k.strip() for k in self.api_keys.split(",") if k.strip()]

        if self.api_key and self.api_key.strip():
            if self.api_key.strip() not in keys:
                keys.insert(0, self.api_key.strip())

        if not keys:
            raise ValueError(
                "Set API_KEYS (recommended: key1,key2,key3) or API_KEY on Render."
            )

        object.__setattr__(self, "api_key", keys[0])
        object.__setattr__(self, "api_keys", ",".join(keys))
        return self

    @model_validator(mode="after")
    def apply_production_performance_profile(self) -> "Settings":
        """
        Production on Render Standard (2 GB): parallel batches for speed,
        hard ceilings so RAM stays safe with 80-page sheets.
        """
        if self.environment != "production":
            return self

        ceilings = {
            "max_concurrent_requests": 8,
            "max_concurrent_evals": 5,
            "max_concurrent_model_answers": 5,
            "max_concurrent_pdf_jobs": 1,
            "extraction_batch_size": 10,
            "pdf_processing_batch_size": 10,
            "pdf_render_workers": 10,
            "max_workers": 10,
            "pdf_zoom_factor": 2,
        }
        for field, ceiling in ceilings.items():
            current = getattr(self, field)
            if current > ceiling:
                object.__setattr__(self, field, ceiling)

        return self

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
