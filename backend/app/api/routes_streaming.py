"""
Streaming Routes - Real-time evaluation with Server-Sent Events (SSE).
"""

import asyncio
import time
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.core.memory_guard import get_evaluation_memory_guard
from app.services.evaluation_pipeline import get_evaluation_pipeline
from app.services.evaluation_storage_service import save_instamark_evaluation
from app.utils.json_utils import create_sse_event

router = APIRouter()


def _parse_page_limit(page_limit: Optional[str]) -> Optional[int]:
    """Return None to process every page in the uploaded PDF."""
    if page_limit and page_limit.strip():
        settings = get_settings()
        try:
            value = int(page_limit)
        except ValueError:
            raise HTTPException(status_code=400, detail="page_limit must be a valid integer")
        if value < 1:
            raise HTTPException(status_code=400, detail="page_limit must be at least 1")
        if value > settings.max_page_limit:
            raise HTTPException(
                status_code=400,
                detail=f"page_limit must not exceed {settings.max_page_limit}",
            )
        return value
    return None

@router.get("/dashboard-stream", tags=["Dashboard"])
async def dashboard_streaming():
    """Redirect to React dashboard."""
    settings = get_settings()
    return RedirectResponse(url=f"{settings.frontend_url}/dashboard")


@router.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint.
    
    Returns:
    - Status of the API and its services
    """
    settings = get_settings()
    from app.db.session import database_enabled

    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "persistence": {
            "database_enabled": database_enabled(),
            "yantra_user_id_header": settings.yantra_user_id_header,
        },
        "performance": {
            "target_eval_duration_seconds": settings.target_eval_duration_seconds,
            "gemini_api_keys_configured": len(
                [k for k in (settings.api_keys or "").split(",") if k.strip()]
            ),
            "max_concurrent_pdf_jobs": settings.max_concurrent_pdf_jobs,
            "max_concurrent_evals": settings.max_concurrent_evals,
            "max_concurrent_model_answers": settings.max_concurrent_model_answers,
            "pdf_processing_batch_size": settings.pdf_processing_batch_size,
            "pdf_render_workers": settings.pdf_render_workers,
            "page_image_format": settings.page_image_format,
        },
    }


@router.get("/live-visualization", tags=["Dashboard"])
async def live_visualization():
    """Redirect to React dashboard."""
    settings = get_settings()
    return RedirectResponse(url=f"{settings.frontend_url}/dashboard")


async def evaluate_pdf_stream(
    file_bytes: bytes,
    filename: str,
    page_limit_int: Optional[int],
    *,
    yantra_user_id: Optional[str] = None,
    client_transaction_id: Optional[str] = None,
    page_count: Optional[int] = None,
    amount_inr: Optional[float] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream evaluation results as Server-Sent Events (SSE).
    Uses the memory-efficient pipeline (page-by-page PDF, bounded concurrency).
    """
    event_queue: asyncio.Queue = asyncio.Queue()
    pipeline = get_evaluation_pipeline()
    settings = get_settings()

    async def on_progress(message: str, extra: dict) -> None:
        await event_queue.put(
            create_sse_event("progress", {"message": message, **extra})
        )

    async def on_question_complete(package: dict) -> None:
        if package.get("error"):
            await event_queue.put(
                create_sse_event(
                    "question_error",
                    {
                        "question_number": package["question_number"],
                        "error": package.get("error_message", "Unknown error"),
                        "current": package["current"],
                        "total": package["total"],
                    },
                )
            )
        else:
            await event_queue.put(create_sse_event("question_complete", package))

    async def run_pipeline() -> None:
        try:
            result = await pipeline.run(
                pdf_bytes=file_bytes,
                filename=filename,
                page_limit=page_limit_int,
                on_progress=on_progress,
                on_question_complete=on_question_complete,
            )
            evaluation_id = None
            persist_error = None
            try:
                evaluation_id = await save_instamark_evaluation(
                    complete_package=result["complete_package"],
                    file_name=filename,
                    total_questions=result["total_questions"],
                    total_duration=result["total_duration"],
                    total_tokens=result["total_tokens"],
                    yantra_user_id=yantra_user_id,
                    client_transaction_id=client_transaction_id,
                    page_count=page_count,
                    amount_inr=amount_inr,
                    rate_per_page=settings.instamark_rate_per_page_inr,
                )
            except Exception as save_exc:
                persist_error = str(save_exc)
                logger.error(
                    "Evaluation completed but database save failed for user=%s file=%s: %s",
                    yantra_user_id or "anonymous",
                    filename,
                    save_exc,
                    exc_info=True,
                )

            await event_queue.put(
                create_sse_event(
                    "final_summary",
                    {
                        "total_questions": result["total_questions"],
                        "total_duration": result["total_duration"],
                        "total_tokens": result["total_tokens"],
                        "complete_package": result["complete_package"],
                        "evaluation_id": evaluation_id,
                        "persisted": evaluation_id is not None,
                        "persist_error": persist_error,
                    },
                )
            )
        except ValueError as e:
            logger.warning(f"Validation error for {filename}: {e}")
            await event_queue.put(create_sse_event("error", {"message": str(e)}))
        except Exception as e:
            logger.error(f"Streaming evaluation failed: {e}", exc_info=True)
            await event_queue.put(
                create_sse_event("error", {"message": f"Evaluation failed: {str(e)}"})
            )
        finally:
            await event_queue.put(None)

    task = asyncio.create_task(run_pipeline())
    try:
        while True:
            event = await event_queue.get()
            if event is None:
                break
            try:
                yield event
            except (asyncio.CancelledError, GeneratorExit):
                logger.info(
                    "Client disconnected — evaluation continues server-side: %s",
                    filename,
                )
                break
    finally:
        if task.done():
            await task
        else:
            logger.info(
                "Evaluation still running in background after disconnect: %s (user=%s)",
                filename,
                yantra_user_id or "anonymous",
            )


@router.post("/evaluate", tags=["Evaluation"])
async def evaluate_pdf(
    file: UploadFile = File(..., description="PDF file containing handwritten answers"),
    page_limit: Optional[str] = Form(None, description="Optional cap on pages; omit to process the full PDF"),
):
    """
    Evaluate UPSC answer sheet and return complete JSON response.
    
    **Optimized for Best Latency:**
    - ✅ Parallel processing of all questions (concurrent evaluation)
    - ✅ Async/await throughout for non-blocking I/O
    - ✅ Efficient memory management
    - ✅ Comprehensive evaluation data
    
    **Response Structure:**
    ```json
    {
      "metadata": {
        "total_questions": 5,
        "total_duration_seconds": 45.2,
        "total_tokens": 15000,
        "total_ai_magic_marks": 42.5,
        "total_param_marks": 50,
        "total_max_marks": 50,
        "generated_at": "2025-12-19 10:30:00"
      },
      "questions": {
        "1": {
          "question_text": "Discuss...",
          "marks": 10,
          "evaluation": {...},
          "model_answer": {...}
        }
      }
    }
    ```
    
    **Parameters:**
    - file: PDF file (required)
    - page_limit: Number of pages (default: 80, max: 100)
    
    **Benefits:**
    - ✅ Single comprehensive response
    - ✅ Maximum parallelization for speed
    - ✅ Complete evaluation package
    - ✅ Industry-standard REST API
    """
    settings = get_settings()
    page_limit_int = _parse_page_limit(page_limit)

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size / (1024 * 1024):.0f}MB",
        )

    logger.info(
        f"Processing PDF: {file.filename} ({len(file_bytes)} bytes, page_limit={page_limit_int})"
    )

    try:
        async with get_evaluation_memory_guard():
            pipeline = get_evaluation_pipeline()
            result = await pipeline.run(
                pdf_bytes=file_bytes,
                filename=file.filename,
                page_limit=page_limit_int,
            )

        return JSONResponse(
            content=result["complete_package"],
            status_code=200,
            headers={
                "X-Total-Questions": str(result["total_questions"]),
                "X-Total-Duration": str(result["total_duration"]),
                "X-Total-Tokens": str(result["total_tokens"]),
            },
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


@router.post("/evaluate-stream", tags=["Evaluation"])
async def evaluate_pdf_streaming(
    file: UploadFile = File(..., description="PDF file containing handwritten answers"),
    page_limit: Optional[str] = Form(None, description="Optional cap on pages; omit to process the full PDF"),
    client_transaction_id: Optional[str] = Form(None, description="Client-side Instamark transaction id"),
    page_count: Optional[str] = Form(None, description="Billable page count from client PDF scan"),
    amount_inr: Optional[str] = Form(None, description="Billable amount in INR"),
    yantra_user_id: Optional[str] = Form(None, description="YantraIAS user id"),
    x_yantra_user_id: Optional[str] = Header(None, alias="X-Yantra-User-Id"),
):
    """
    Evaluate UPSC answer sheet with real-time streaming responses.
    
    **Streaming Protocol: Server-Sent Events (SSE)**
    
    This endpoint streams evaluation results in real-time as each question is processed.
    Clients receive immediate feedback instead of waiting for all questions to complete.
    
    **Event Types:**
    
    1. **progress**: Processing status updates
       ```json
       {
         "type": "progress",
         "message": "Extracting images from PDF...",
         "step": 1,
         "total_steps": 4
       }
       ```
    
    2. **question_complete**: Individual question evaluation (sent immediately)
       ```json
       {
         "type": "question_complete",
         "question_number": "1",
         "current": 1,
         "total": 5,
         "question": "Discuss...",
         "marks": 10,
         "evaluation": {...},
         "model_answer": {...}
       }
       ```
    
    3. **final_summary**: Complete package with metadata
       ```json
       {
         "type": "final_summary",
         "total_questions": 5,
         "total_duration": 45.2,
         "complete_package": {...}
       }
       ```
    
    4. **error**: Error occurred
       ```json
       {
         "type": "error",
         "message": "Error description"
       }
       ```
    
    **Parameters:**
    - file: PDF file (required)
    - page_limit: Number of pages (default: 80, max: 100)
    
    **Client Example (JavaScript):**
    ```javascript
    const eventSource = new EventSource('/api/evaluate-stream');
    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'question_complete') {
            displayQuestion(data);
        }
    };
    ```
    
    **Benefits:**
    - ✅ Real-time feedback (questions appear as processed)
    - ✅ Improved UX (no waiting for 6+ minutes)
    - ✅ Concurrent requests (non-blocking architecture)
    - ✅ Progress tracking (step-by-step updates)
    """
    settings = get_settings()
    page_limit_int = _parse_page_limit(page_limit)

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    contents = await file.read()
    if len(contents) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size / (1024 * 1024):.0f}MB",
        )

    resolved_user_id = (yantra_user_id or x_yantra_user_id or "").strip() or None

    logger.info(
        f"Starting streaming evaluation: {file.filename} "
        f"({len(contents)} bytes, page_limit={page_limit_int}, user={resolved_user_id or 'anonymous'})"
    )

    page_count_int = int(page_count) if page_count and page_count.strip().isdigit() else None
    amount_value = float(amount_inr) if amount_inr and amount_inr.strip() else None

    async def guarded_stream():
        try:
            async with get_evaluation_memory_guard():
                async for event in evaluate_pdf_stream(
                    contents,
                    file.filename,
                    page_limit_int,
                    yantra_user_id=resolved_user_id,
                    client_transaction_id=client_transaction_id,
                    page_count=page_count_int,
                    amount_inr=amount_value,
                ):
                    yield event
        except HTTPException as e:
            yield create_sse_event("error", {"message": e.detail})

    return StreamingResponse(
        guarded_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/export-evaluation", tags=["Export"])
async def export_evaluation_package(
    file: UploadFile = File(...),
    page_limit: Optional[str] = Form(None)
) -> JSONResponse:
    """
    Export complete evaluation package as JSON matching required format.
    
    This endpoint processes the PDF and returns the complete evaluation package
    in the exact format matching complete_evaluation_package (2).json with:
    - Metadata (total questions, timestamps, marks, tokens)
    - Individual question evaluations with all parameters
    - Model answers with structure and content
    
    **Usage:**
    ```bash
    curl -X POST "http://localhost:8000/api/export-evaluation" \\
         -F "file=@test.pdf" \\
         -F "page_limit=10" \\
         -H "accept: application/json"
    ```
    
    **Response Format:**
    ```json
    {
      "metadata": {
        "total_questions": 5,
        "generated_at": "2025-12-04T10:30:00",
        "total_duration_seconds": 45.2,
        "total_tokens": 15000,
        "total_ai_magic_marks": 35.5,
        "total_param_marks": 35.5,
        "total_max_marks": 50
      },
      "questions": {
        "1._evaluation": {...},
        "1._model_answer": {...},
        "2._evaluation": {...},
        "2._model_answer": {...}
      }
    }
    ```
    """
    settings = get_settings()
    page_limit_int = _parse_page_limit(page_limit)

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    contents = await file.read()
    if len(contents) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds {settings.max_upload_size / (1024 * 1024):.0f}MB",
        )

    logger.info(f"Starting export for: {file.filename} ({len(contents)} bytes)")

    try:
        async with get_evaluation_memory_guard():
            pipeline = get_evaluation_pipeline()
            result = await pipeline.run(
                pdf_bytes=contents,
                filename=file.filename,
                page_limit=page_limit_int,
            )

        return JSONResponse(
            content=result["complete_package"],
            headers={
                "Content-Disposition": (
                    f'attachment; filename="evaluation_package_{int(time.time())}.json"'
                )
            },
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
