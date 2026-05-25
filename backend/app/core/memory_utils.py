"""
Utilities to release memory after heavy PDF/AI processing steps.
"""

import gc
from typing import Any


def release_memory(*objects: Any) -> None:
    """Drop references and encourage Python to return memory to the OS."""
    for obj in objects:
        del obj
    gc.collect()
