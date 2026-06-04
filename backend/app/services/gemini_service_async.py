"""
Async Gemini AI Service - Non-blocking AI calls for concurrent processing.
"""

import google.generativeai as genai
from typing import Optional, Any
import asyncio
from concurrent.futures import ThreadPoolExecutor
from app.config.settings import get_settings
from app.core.logging_config import logger


class AsyncGeminiService:
    """
    Async service for managing Gemini AI model with non-blocking calls.
    Enables concurrent request processing and streaming responses.
    Supports multiple API keys for load distribution.
    """
    
    _instance: Optional['AsyncGeminiService'] = None
    _model: Optional[genai.GenerativeModel] = None
    _configured: bool = False
    _executor: Optional[ThreadPoolExecutor] = None
    _api_keys: list = []
    _current_key_index: int = 0
    _models: dict = {}  # Cache models per API key
    
    def __new__(cls):
        """Ensure only one instance exists (singleton pattern)."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize the Async Gemini service (only runs once)."""
        if not self._configured:
            self._initialize()
    
    @staticmethod
    def _validate_api_key(api_key: str, index: int, total: int) -> None:
        """Fail fast if the Gemini API key is missing or rejected by Google."""
        key = (api_key or "").strip()
        if not key or key == "your_gemini_api_key_here":
            raise RuntimeError(
                "Gemini API key is missing or still a placeholder. "
                "Copy backend/.env.example to backend/dev.env and set API_KEY "
                "to a valid key from https://aistudio.google.com/apikey"
            )
        if not key.startswith("AIza"):
            raise RuntimeError(
                f"Gemini API key #{index} does not look valid (should start with AIza). "
                "Check backend/dev.env for extra spaces or quotes."
            )
        try:
            genai.configure(api_key=key)
            next(iter(genai.list_models()), None)
        except Exception as exc:
            message = str(exc)
            if "API_KEY_INVALID" in message or "API key not valid" in message:
                raise RuntimeError(
                    f"Gemini API key #{index}/{total} was rejected by Google (API_KEY_INVALID). "
                    "Create a new key at https://aistudio.google.com/apikey, paste it into "
                    "backend/dev.env as API_KEY=... (no quotes), then restart the server."
                ) from exc
            raise RuntimeError(f"Could not verify Gemini API key #{index}: {exc}") from exc

    def _initialize(self):
        """Configure and initialize the Gemini model with async support."""
        try:
            settings = get_settings()
            
            # Setup API keys (support multiple keys for load distribution)
            if settings.api_keys:
                # Multiple API keys provided (comma-separated)
                self._api_keys = [key.strip() for key in settings.api_keys.split(',')]
                logger.info(f"Configured {len(self._api_keys)} API keys for load distribution")
            else:
                # Single API key
                self._api_keys = [settings.api_key]
                logger.info("Configured single API key")
            
            # Initialize models for each API key (validate keys at startup)
            for idx, api_key in enumerate(self._api_keys):
                self._validate_api_key(api_key, idx + 1, len(self._api_keys))
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(settings.gemini_model)
                self._models[idx] = model
                logger.info(f"Initialized model {idx + 1}/{len(self._api_keys)}")
            
            # Set primary model
            self._model = self._models[0]
            logger.info(f"Successfully initialized Async Gemini with {len(self._api_keys)} key(s)")
            
            # Create thread pool executor for running sync Gemini calls asynchronously
            # Gemini SDK is synchronous, so we use executor to make it non-blocking
            # Increased to 50 workers for 50-100 concurrent users
            self._executor = ThreadPoolExecutor(
                max_workers=settings.max_workers,  # Configurable via settings
                thread_name_prefix="gemini-async"
            )
            logger.info(f"ThreadPoolExecutor initialized with {settings.max_workers} workers")
            
            self._configured = True
            
        except Exception as e:
            logger.error(f"Failed to initialize Async Gemini service: {e}")
            raise RuntimeError(f"Async Gemini initialization failed: {e}")
    
    @property
    def model(self) -> genai.GenerativeModel:
        """Get the Gemini model instance (rotates through available keys)."""
        if not self._configured or not self._models:
            raise RuntimeError("Async Gemini service not properly initialized")
        
        # Round-robin API key rotation for load distribution
        if len(self._models) > 1:
            self._current_key_index = (self._current_key_index + 1) % len(self._models)
            return self._models[self._current_key_index]
        
        return self._models[0]
    
    async def generate_content_async(self, content: Any, use_json_mode: bool = True) -> Any:
        """
        Generate content using the Gemini model asynchronously.
        
        This wraps the synchronous Gemini API call in an async executor,
        allowing FastAPI to handle other requests concurrently.
        
        Args:
            content: Content to send to the model (text, images, etc.)
            use_json_mode: Force JSON response format (default: True)
        
        Returns:
            Generated response from Gemini model
        """
        if not self._executor:
            raise RuntimeError("Thread pool executor not initialized")
        
        # Configure generation for faster, more consistent responses
        generation_config = {
            "temperature": 0.3,  # Lower for consistent JSON (was: default ~1.0)
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 6144,  # Optimized: reduced from 8192 (saves ~25% tokens)
        }
        
        # Force JSON response format (reduces parsing errors significantly)
        if use_json_mode:
            generation_config["response_mime_type"] = "application/json"
        
        # Get current model (with load balancing if multiple keys)
        current_model = self.model
        
        # Run blocking Gemini call in thread pool (non-blocking for FastAPI)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: current_model.generate_content(
                content,
                generation_config=generation_config
            )
        )
    
    async def generate_multiple_async(self, content_list: list) -> list:
        """
        Generate content for multiple prompts concurrently.
        
        Args:
            content_list: List of content items to process
        
        Returns:
            List of generated responses
        """
        tasks = [self.generate_content_async(content) for content in content_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return results
    
    def __del__(self):
        """Cleanup executor on service destruction."""
        if self._executor:
            self._executor.shutdown(wait=False)


# Singleton instance
_async_gemini_service: Optional[AsyncGeminiService] = None


def get_async_gemini_service() -> AsyncGeminiService:
    """
    Get or create the async Gemini service singleton.
    
    Returns:
        AsyncGeminiService instance
    """
    global _async_gemini_service
    if _async_gemini_service is None:
        _async_gemini_service = AsyncGeminiService()
    return _async_gemini_service
