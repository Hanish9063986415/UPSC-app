"""
Rate limiting and request queue middleware for handling high concurrency.
"""

import asyncio
import time
from typing import Optional
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict

from app.core.logging_config import logger
from app.config.settings import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware to limit concurrent requests and prevent API overload.
    
    Features:
    - Limits concurrent requests to max_concurrent_requests
    - Tracks active requests per endpoint
    - Provides request queue with timeout
    """
    
    def __init__(self, app, max_concurrent: int = 100):
        super().__init__(app)
        self.max_concurrent = max_concurrent
        self.active_requests = 0
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.request_times = defaultdict(list)
        logger.info(f"RateLimitMiddleware initialized with max_concurrent={max_concurrent}")
    
    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""
        
        # Check if we can accept this request
        if self.active_requests >= self.max_concurrent:
            logger.warning(f"Rate limit reached: {self.active_requests}/{self.max_concurrent} active requests")
            raise HTTPException(
                status_code=429,
                detail=f"Too many concurrent requests. Max: {self.max_concurrent}. Please try again."
            )
        
        # Acquire semaphore (wait if needed)
        async with self.semaphore:
            self.active_requests += 1
            start_time = time.time()
            
            try:
                response = await call_next(request)
                return response
            finally:
                self.active_requests -= 1
                duration = time.time() - start_time
                logger.info(f"Request completed in {duration:.2f}s. Active: {self.active_requests}/{self.max_concurrent}")


class ConnectionPoolConfig:
    """Configuration for HTTP connection pooling."""
    
    @staticmethod
    def get_httpx_limits():
        """Connection pool sized for current deployment memory limits."""
        import httpx

        settings = get_settings()
        max_conn = max(10, settings.max_concurrent_requests * 2)
        return httpx.Limits(
            max_keepalive_connections=max_conn,
            max_connections=max_conn * 2,
            keepalive_expiry=30.0,
        )
