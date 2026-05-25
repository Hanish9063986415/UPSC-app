"""
JSON Utilities - Robust JSON handling with error recovery.
Prevents "Unterminated string" errors in SSE streaming.
"""

import json
import re
from typing import Any, Dict, Optional
from app.core.logging_config import logger


def sanitize_json_string(text: str) -> str:
    """
    Sanitize string for safe JSON encoding.
    Handles unescaped quotes, newlines, and control characters.
    
    Args:
        text: Raw text that may contain unsafe characters
        
    Returns:
        Sanitized text safe for JSON encoding
    """
    if not isinstance(text, str):
        return text
    
    # Replace problematic characters
    text = text.replace('\\', '\\\\')  # Escape backslashes first
    text = text.replace('"', '\\"')    # Escape double quotes
    text = text.replace('\n', '\\n')   # Escape newlines
    text = text.replace('\r', '\\r')   # Escape carriage returns
    text = text.replace('\t', '\\t')   # Escape tabs
    text = text.replace('\b', '\\b')   # Escape backspace
    text = text.replace('\f', '\\f')   # Escape form feed
    
    # Remove control characters (0x00-0x1F except whitespace)
    text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F]', '', text)
    
    return text


def deep_sanitize_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively sanitize all string values in a dictionary.
    Prevents JSON encoding errors from AI-generated content.
    
    Args:
        data: Dictionary with potentially unsafe string values
        
    Returns:
        Sanitized dictionary
    """
    if not isinstance(data, dict):
        return data
    
    sanitized = {}
    for key, value in data.items():
        if isinstance(value, str):
            sanitized[key] = sanitize_json_string(value)
        elif isinstance(value, dict):
            sanitized[key] = deep_sanitize_dict(value)
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_json_string(item) if isinstance(item, str)
                else deep_sanitize_dict(item) if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            sanitized[key] = value
    
    return sanitized


def safe_json_dumps(data: Any, **kwargs) -> str:
    """
    Safely serialize data to JSON with automatic sanitization.
    
    Args:
        data: Data to serialize
        **kwargs: Additional arguments for json.dumps
        
    Returns:
        JSON string
        
    Raises:
        ValueError: If serialization fails after sanitization
    """
    try:
        # First attempt: direct serialization
        return json.dumps(data, **kwargs)
    except (TypeError, ValueError) as e:
        logger.warning(f"Direct JSON serialization failed: {e}. Attempting sanitization...")
        
        try:
            # Second attempt: with sanitization
            sanitized = deep_sanitize_dict(data) if isinstance(data, dict) else data
            return json.dumps(sanitized, **kwargs)
        except (TypeError, ValueError) as e2:
            logger.error(f"JSON serialization failed even after sanitization: {e2}")
            raise ValueError(f"Failed to serialize data to JSON: {e2}")


def safe_json_parse(json_str: str, retry_attempts: int = 3) -> Optional[Dict[str, Any]]:
    """
    Safely parse JSON with error recovery.
    Attempts to fix common JSON syntax errors.
    
    Args:
        json_str: JSON string to parse
        retry_attempts: Number of fix attempts
        
    Returns:
        Parsed dictionary or None if parsing fails
    """
    if not json_str or not json_str.strip():
        return None
    
    # Attempt 1: Direct parsing
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error (attempt 1): {e}")
    
    # Attempt 2: Fix common issues
    for attempt in range(retry_attempts):
        try:
            # Remove trailing commas
            fixed = re.sub(r',(\s*[}\]])', r'\1', json_str)
            
            # Fix unescaped quotes in strings (basic attempt)
            # This is complex and may not catch all cases
            
            # Try parsing
            return json.loads(fixed)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error (attempt {attempt + 2}): {e}")
            continue
    
    logger.error(f"Failed to parse JSON after {retry_attempts + 1} attempts")
    return None


def create_sse_event(event_type: str, data: Dict[str, Any]) -> str:
    """
    Create Server-Sent Event with safe JSON serialization.
    
    Args:
        event_type: Event type identifier
        data: Event data
        
    Returns:
        SSE formatted string
    """
    data['type'] = event_type
    json_str = safe_json_dumps(data, ensure_ascii=False)
    return f"data: {json_str}\n\n"


def create_error_response(message: str, question_number: Optional[str] = None) -> Dict[str, Any]:
    """
    Create standardized error response.
    
    Args:
        message: Error message
        question_number: Question number if applicable
        
    Returns:
        Error response dictionary
    """
    error = {
        'type': 'error',
        'message': sanitize_json_string(message)
    }
    
    if question_number:
        error['question_number'] = question_number
    
    return error
