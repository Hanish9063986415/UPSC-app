"""
Text utility functions for sanitization, JSON parsing, and validation.
"""

import re
import json
from typing import Any, Dict, Optional
from app.core.logging_config import logger


def sanitize_text_for_prompt(text: str) -> str:
    """
    Remove invalid control characters from text to prevent JSON errors.
    
    Args:
        text: Input text to sanitize
    
    Returns:
        Sanitized text safe for JSON processing
    """
    if not isinstance(text, str):
        return ""
    # Remove C0 and C1 control characters, which are invalid in JSON strings
    return re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)


def clean_json_string(json_str: str) -> str:
    """
    Clean JSON string by removing markdown formatting and fixing common issues.
    
    Args:
        json_str: Raw JSON string from AI response
    
    Returns:
        Cleaned JSON string
    """
    # Remove markdown formatting
    json_str = re.sub(r'```json\s*', '', json_str)
    json_str = re.sub(r'```\s*$', '', json_str)
    
    # Try to find JSON array or object in the response
    json_match = re.search(r'[\[{].*[\]}]', json_str, re.DOTALL)
    if json_match:
        json_str = json_match.group(0)
    
    # Clean up common JSON issues
    json_str = re.sub(r',\s*\]', ']', json_str)  # Remove trailing commas in arrays
    json_str = re.sub(r',\s*\}', '}', json_str)  # Remove trailing commas in objects
    
    return json_str


def parse_ai_json_response(response_text: str) -> Optional[Dict[str, Any]]:
    """
    Parse JSON response from AI with multiple fallback strategies - OPTIMIZED.
    
    Args:
        response_text: Raw response text from AI model
    
    Returns:
        Parsed JSON as dictionary, or None if parsing fails
    """
    try:
        # Strip and clean the response
        json_str = response_text.strip()
        
        # Fast path: Try parsing directly first (most common case)
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
        
        # Remove markdown formatting
        json_str = re.sub(r'```json\s*', '', json_str)
        json_str = re.sub(r'```\s*$', '', json_str)
        json_str = json_str.strip()
        
        # Second attempt after markdown removal
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
        
        # Extract JSON object/array (handles extra text before/after)
        json_match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', json_str)
        if json_match:
            json_str = json_match.group(1)
            
        # Third attempt after extraction
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
        
        # Aggressive cleanup for common AI response issues
        json_str = re.sub(r',\s*([}\]])', r'\1', json_str)  # Remove trailing commas
        json_str = sanitize_text_for_prompt(json_str)  # Remove control chars
        
        # Fourth attempt after aggressive cleanup
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed after all attempts: {e}")
            logger.debug(f"Failed JSON (first 1000 chars): {response_text[:1000]}")
            return None
                
    except Exception as e:
        logger.error(f"Unexpected error parsing JSON: {e}")
        return None


def fix_quotes_in_json(text: str) -> str:
    """
    Fix unescaped quotes in JSON string values.
    
    Args:
        text: JSON string with potential quote issues
    
    Returns:
        JSON string with fixed quotes
    """
    lines = text.split('\n')
    fixed_lines = []
    
    for line in lines:
        # If line contains a field value with unescaped quotes
        if '"Answer":' in line or '"Question":' in line or '"ideal_upsc_content":' in line:
            # Find the start and end of the string value
            colon_pos = line.find(':')
            if colon_pos != -1:
                prefix = line[:colon_pos + 1]
                rest = line[colon_pos + 1:].strip()
                
                if rest.startswith('"') and (rest.endswith('",') or rest.endswith('"')):
                    # Extract the string content
                    start_quote = rest.find('"')
                    if rest.endswith('",'):
                        end_quote = rest.rfind('"', 0, -1)
                        suffix = ',"'
                    else:
                        end_quote = rest.rfind('"')
                        suffix = '"'
                    
                    if start_quote != -1 and end_quote != -1 and end_quote > start_quote:
                        string_content = rest[start_quote + 1:end_quote]
                        # Escape internal quotes (but don't double-escape)
                        if '\\"' not in string_content:
                            escaped_content = string_content.replace('"', '\\"')
                        else:
                            escaped_content = string_content
                        fixed_lines.append(f'{prefix} "{escaped_content}"{suffix[1:]}')
                    else:
                        fixed_lines.append(line)
                else:
                    fixed_lines.append(line)
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)


def validate_marks(marks: int, max_marks: int) -> int:
    """
    Validate marks don't exceed maximum allowed.
    
    Args:
        marks: Awarded marks
        max_marks: Maximum marks allowed
    
    Returns:
        Validated marks within acceptable range
    """
    if marks < 0:
        return 0
    if marks > max_marks:
        logger.warning(f"Marks {marks} exceed maximum {max_marks}, capping at maximum")
        return max_marks
    return marks


def extract_question_number(text: str) -> str:
    """
    Extract question number from text.
    
    Args:
        text: Text containing question number
    
    Returns:
        Extracted question number or empty string
    """
    # Match patterns like Q1, Q.1, 1., 1(a), etc.
    patterns = [
        r'Q\.?\s*(\d+[a-z]?)',
        r'^(\d+)\.',
        r'(\d+\([a-z]\))',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return ""
