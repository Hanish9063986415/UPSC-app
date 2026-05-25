"""
Streaming Routes - Real-time evaluation with Server-Sent Events (SSE).
"""

import time
import json
import asyncio
from typing import AsyncGenerator
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, RedirectResponse
from typing import Optional

from app.core.logging_config import logger
from app.config.settings import get_settings
from app.services.pdf_service import get_pdf_service
from app.services.qa_extraction_service_async import get_async_qa_extraction_service
from app.services.evaluation_service_async import get_async_evaluation_service
from app.services.model_answer_service_async import get_async_model_answer_service
from app.services.export_service import get_export_service
from app.utils.json_utils import safe_json_dumps, create_sse_event, create_error_response
router = APIRouter()

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
    
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@router.get("/live-visualization", tags=["Dashboard"])
async def live_visualization():
    """Redirect to React dashboard."""
    settings = get_settings()
    return RedirectResponse(url=f"{settings.frontend_url}/dashboard")


async def evaluate_pdf_stream(
    file_bytes: bytes,
    filename: str,
    page_limit_int: int
) -> AsyncGenerator[str, None]:
    """
    Stream evaluation results as Server-Sent Events (SSE).
    
    Event Types:
    - progress: Processing status updates
    - question_complete: Individual question evaluation complete
    - final_summary: Complete evaluation package
    - error: Error occurred during processing
    
    Args:
        file_bytes: PDF file content
        filename: Original filename
        page_limit_int: Number of pages to process
        
    Yields:
        SSE formatted strings (data: {...}\n\n)
    """
    overall_start_time = time.time()
    settings = get_settings()
    
    try:
        # Initialize services
        pdf_service = get_pdf_service()
        qa_service = get_async_qa_extraction_service()  # Use async version for parallel extraction
        eval_service = get_async_evaluation_service()
        model_service = get_async_model_answer_service()
        export_service = get_export_service()
        
        # Step 1: Extract images from PDF
        yield create_sse_event('progress', {
            'message': 'Extracting images from PDF...',
            'step': 1,
            'total_steps': 4
        })
        
        logger.info("Step 1: Extracting images from PDF")
        # Run heavy PDF -> image conversion in a thread to avoid blocking the event loop
        images_data = await asyncio.to_thread(lambda: pdf_service.extract_images_from_pdf(
            pdf_bytes=file_bytes,
            page_limit=page_limit_int,
            page_range_start=None,
            page_range_end=None,
            zoom_factor=settings.pdf_zoom_factor
        ))
        
        if not images_data:
            error_msg = "No pages could be extracted from PDF"
            yield create_sse_event('error', {'message': error_msg})
            return
        
        pages_processed = len(images_data)
        yield create_sse_event('progress', {
            'message': f'Extracted {pages_processed} pages',
            'pages': pages_processed
        })
        
        # Step 2: Extract Q&A pairs
        yield create_sse_event('progress', {
            'message': 'Extracting questions and answers...',
            'step': 2,
            'total_steps': 4
        })
        
        logger.info("Step 2: Extracting Q&A pairs using async batch processing")
        qa_pairs = await qa_service.extract_qa_from_images_async(images_data)
        
        if not qa_pairs:
            error_msg = "No questions/answers could be extracted from PDF"
            logger.warning(f"⚠️ {error_msg} for {filename}")
            yield create_sse_event('error', {'message': error_msg})
            return
        
        total_questions = len(qa_pairs)
        yield create_sse_event('progress', {
            'message': f'Found {total_questions} questions',
            'total_questions': total_questions
        })
        
        # Step 3: Evaluate all answers in PARALLEL with concurrency limit
        yield create_sse_event('progress', {
            'message': 'Starting parallel evaluation...',
            'step': 3,
            'total_steps': 4
        })
        
        logger.info(f"Step 3: Evaluating answers with PARALLEL processing (max {settings.max_concurrent_evals} concurrent)")
        
        # Semaphore to limit concurrent evaluations (reduces burst token usage)
        semaphore = asyncio.Semaphore(settings.max_concurrent_evals)
        
        # Define async function to process one question
        async def process_question(idx, qa):
            """Process single question: evaluation + model answer."""
            async with semaphore:  # Limit concurrent evaluations
                question_num = qa['Question Number']
                student_answer = qa.get('Answer', '')
                logger.info(f"Processing Q{question_num} ({idx}/{total_questions}): student answer {len(student_answer)} chars")
                
                try:
                    # Evaluate answer
                    eval_result, eval_tokens = await eval_service.evaluate_answer_async(
                        question=qa['Question'],
                        answer=student_answer,
                        marks=qa['Marks'],
                        gs_paper=qa['GS_Paper'],
                        subject=qa['Subject']
                    )
                    
                    # Generate model answer
                    upsc_expectations = eval_result.get('upsc_question_analysis', {}).get('upsc_expectations', [])
                    model_result, model_tokens = await model_service.generate_model_answer_async(
                        question=qa['Question'],
                        subject=qa['Subject'],
                        gs_paper=qa['GS_Paper'],
                        marks=qa['Marks'],
                        upsc_expectations=upsc_expectations
                    )
                    
                    return {
                        'success': True,
                        'idx': idx,
                        'question_num': question_num,
                        'qa': qa,
                        'eval_result': eval_result,
                        'eval_tokens': eval_tokens,
                        'model_result': model_result,
                        'model_tokens': model_tokens
                    }
                    
                except Exception as e:
                    logger.error(f"Failed to process Question {question_num}: {e}")
                    return {
                        'success': False,
                        'idx': idx,
                        'question_num': question_num,
                        'error': str(e)
                    }
        
        # Create tasks for ALL questions (parallel processing)
        tasks = [process_question(idx, qa) for idx, qa in enumerate(qa_pairs, 1)]
        
        # Process all questions concurrently and stream results as they complete
        results_by_index = {}  # Store results by index to maintain order
        total_tokens = 0
        completed_count = 0
        
        # Stream results as they complete (fastest questions stream first)
        for coro in asyncio.as_completed(tasks):
            result = await coro
            completed_count += 1
            
            if result['success']:
                # Store results by index for proper ordering later
                results_by_index[result['idx']] = result
                total_tokens += result['eval_tokens'] + result['model_tokens']
                
                # Stream completed question immediately
                question_package = {
                    'question_number': result['question_num'],
                    'current': completed_count,
                    'total': total_questions,
                    'question': result['qa']['Question'],
                    'marks': result['qa']['Marks'],
                    'evaluation': result['eval_result'],
                    'model_answer': result['model_result'],
                    'page_range': result['qa'].get('Page_Range', [])
                }
                
                # Verify data completeness
                has_student = 'student_answer' in question_package['evaluation']
                has_model = question_package['model_answer'] and 'model_answer' in question_package['model_answer']
                student_len = len(question_package['evaluation'].get('student_answer', ''))
                model_len = len(question_package['model_answer'].get('model_answer', {}).get('full_text', '')) if has_model else 0
                
                logger.info(f"Q{result['question_num']} package: student={has_student}({student_len}c), model={has_model}({model_len}c)")
                
                yield create_sse_event('question_complete', question_package)
                logger.info(f"Streamed Question {result['question_num']} ({completed_count}/{total_questions})")
            else:
                # Stream error but preserve partial results
                error_package = {
                    'question_number': result['question_num'],
                    'error': result['error'],
                    'current': completed_count,
                    'total': total_questions
                }
                yield create_sse_event('question_error', error_package)
        
        # Rebuild ordered lists from results_by_index
        evaluations_raw = []
        model_answers = []
        for idx in sorted(results_by_index.keys()):
            result = results_by_index[idx]
            evaluations_raw.append(result['eval_result'])
            model_answers.append(result['model_result'])
        
        # Step 4: Send final summary
        yield create_sse_event('progress', {
            'message': 'Building final summary...',
            'step': 4,
            'total_steps': 4
        })
        
        total_duration = time.time() - overall_start_time
        
        complete_package = export_service.create_complete_package(
            evaluations=evaluations_raw,
            model_answers=model_answers,
            qa_pairs=qa_pairs,
            total_duration=total_duration,
            total_tokens=total_tokens
        )
        
        # Send final summary
        final_summary = {
            'total_questions': total_questions,
            'total_duration': round(total_duration, 2),
            'total_tokens': total_tokens,
            'complete_package': complete_package
        }
        
        yield create_sse_event('final_summary', final_summary)
        logger.info(f"PARALLEL Streaming complete: {total_questions} questions in {total_duration:.2f}s (avg {total_duration/total_questions:.2f}s per question)")

    except Exception as e:
        logger.error(f"Streaming evaluation failed: {e}", exc_info=True)
        yield create_sse_event('error', {
            'message': f'Evaluation failed: {str(e)}'
        })


@router.post("/evaluate", tags=["Evaluation"])
async def evaluate_pdf(
    file: UploadFile = File(..., description="PDF file containing handwritten answers"),
    page_limit: Optional[str] = Form(None, description="Number of pages to process from start (default: 80)")
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
    overall_start_time = time.time()
    settings = get_settings()
    
    # Validate and parse page_limit
    page_limit_int: int = 80  # Default: 80 pages
    
    if page_limit and page_limit.strip():
        try:
            page_limit_int = int(page_limit)
            if page_limit_int < 1 or page_limit_int > 100:
                raise HTTPException(
                    status_code=400,
                    detail="page_limit must be between 1 and 100"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="page_limit must be a valid integer"
            )
    
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )
    
    # Read file contents
    file_bytes = await file.read()
    
    # Validate file size
    if len(file_bytes) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size / (1024*1024):.0f}MB"
        )
    
    logger.info(f"Processing PDF: {file.filename} ({len(file_bytes)} bytes, page_limit={page_limit_int})")
    
    try:
        # Initialize services
        pdf_service = get_pdf_service()
        qa_service = get_async_qa_extraction_service()
        eval_service = get_async_evaluation_service()
        model_service = get_async_model_answer_service()
        export_service = get_export_service()
        
        # Step 1: Extract images from PDF (run in thread to avoid blocking)
        logger.info("Step 1: Extracting images from PDF")
        images_data = await asyncio.to_thread(lambda: pdf_service.extract_images_from_pdf(
            pdf_bytes=file_bytes,
            page_limit=page_limit_int,
            page_range_start=None,
            page_range_end=None,
            zoom_factor=settings.pdf_zoom_factor
        ))
        
        if not images_data:
            raise HTTPException(
                status_code=400,
                detail="No pages could be extracted from PDF"
            )
        
        pages_processed = len(images_data)
        logger.info(f"Extracted {pages_processed} pages")
        
        # Step 2: Extract Q&A pairs (async batch processing)
        logger.info("Step 2: Extracting Q&A pairs")
        qa_pairs = await qa_service.extract_qa_from_images_async(images_data)
        
        if not qa_pairs:
            error_msg = "No questions/answers could be extracted from PDF"
            logger.warning(f"⚠️ {error_msg} for {file.filename}")

            raise HTTPException(
                status_code=400,
                detail=error_msg
            )
        
        total_questions = len(qa_pairs)
        logger.info(f"Found {total_questions} questions")
        
        # Step 3: Evaluate all answers in PARALLEL with concurrency limit
        logger.info(f"Step 3: Evaluating {total_questions} questions in parallel (max {settings.max_concurrent_evals} concurrent)")
        
        semaphore = asyncio.Semaphore(settings.max_concurrent_evals)
        
        async def process_question(qa):
            """Process single question: evaluation + model answer."""
            async with semaphore:
                question_num = qa['Question Number']
                logger.info(f"Processing Q{question_num}")
                
                try:
                    # Evaluate answer and generate model answer in parallel
                    eval_result, eval_tokens = await eval_service.evaluate_answer_async(
                        question=qa['Question'],
                        answer=qa.get('Answer', ''),
                        marks=qa['Marks'],
                        gs_paper=qa['GS_Paper'],
                        subject=qa['Subject']
                    )
                    
                    upsc_expectations = eval_result.get('upsc_question_analysis', {}).get('upsc_expectations', [])
                    model_result, model_tokens = await model_service.generate_model_answer_async(
                        question=qa['Question'],
                        subject=qa['Subject'],
                        gs_paper=qa['GS_Paper'],
                        marks=qa['Marks'],
                        upsc_expectations=upsc_expectations
                    )
                    
                    return {
                        'success': True,
                        'qa': qa,
                        'eval_result': eval_result,
                        'model_result': model_result,
                        'tokens': eval_tokens + model_tokens
                    }
                except Exception as e:
                    logger.error(f"Failed to process Q{question_num}: {e}")
                    return {'success': False, 'error': str(e)}
        
        # Process all questions concurrently
        results = await asyncio.gather(*[process_question(qa) for qa in qa_pairs])
        
        # Check for failures
        failed = [r for r in results if not r['success']]
        if failed:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process {len(failed)} questions"
            )
        
        # Extract results
        evaluations_raw = [r['eval_result'] for r in results]
        model_answers = [r['model_result'] for r in results]
        total_tokens = sum(r['tokens'] for r in results)
        
        # Step 4: Build complete package
        logger.info("Step 4: Building complete package")
        total_duration = time.time() - overall_start_time
        
        complete_package = export_service.create_complete_package(
            evaluations=evaluations_raw,
            model_answers=model_answers,
            qa_pairs=qa_pairs,
            total_duration=total_duration,
            total_tokens=total_tokens
        )
        
        logger.info(f"Evaluation complete: {total_questions} questions in {total_duration:.2f}s, {total_tokens} tokens")

        # Return complete package
        return JSONResponse(
            content=complete_package,
            status_code=200,
            headers={
                "X-Total-Questions": str(total_questions),
                "X-Total-Duration": str(round(total_duration, 2)),
                "X-Total-Tokens": str(total_tokens)
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Evaluation failed: {str(e)}"
        )


@router.post("/evaluate-stream", tags=["Evaluation"])
async def evaluate_pdf_streaming(
    file: UploadFile = File(..., description="PDF file containing handwritten answers"),
    page_limit: Optional[str] = Form(None, description="Number of pages to process from start (default: 80)")
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
    # Validate and parse page_limit
    page_limit_int: int = 80  # Default: 80 pages
    
    if page_limit and page_limit.strip():
        try:
            page_limit_int = int(page_limit)
            if page_limit_int < 1 or page_limit_int > 100:
                raise HTTPException(
                    status_code=400,
                    detail="page_limit must be between 1 and 100"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="page_limit must be a valid integer"
            )
    
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )
    
    # Read file contents
    contents = await file.read()
    settings = get_settings()
    
    if len(contents) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size / (1024*1024):.0f}MB"
        )
    
    logger.info(f"Starting streaming evaluation: {file.filename} ({len(contents)} bytes, page_limit={page_limit_int})")
    
    # Return streaming response with SSE
    return StreamingResponse(
        evaluate_pdf_stream(contents, file.filename, page_limit_int),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable buffering in nginx
        }
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
    # Validate and parse page_limit
    page_limit_int: int = 80
    
    if page_limit and page_limit.strip():
        try:
            page_limit_int = int(page_limit)
            if page_limit_int < 1 or page_limit_int > 100:
                raise HTTPException(
                    status_code=400,
                    detail="page_limit must be between 1 and 100"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="page_limit must be a valid integer"
            )
    
    # Validate file
    if not file.filename.endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )
    
    contents = await file.read()
    settings = get_settings()
    
    if len(contents) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds {settings.max_upload_size / (1024*1024):.0f}MB"
        )
    
    logger.info(f"Starting export for: {file.filename} ({len(contents)} bytes)")
    
    try:
        overall_start_time = time.time()
        
        # Initialize services
        pdf_service = get_pdf_service()
        qa_service = get_async_qa_extraction_service()
        eval_service = get_async_evaluation_service()
        model_service = get_async_model_answer_service()
        export_service = get_export_service()
        
        # Extract images
        logger.info("Extracting images from PDF")
        images_data = pdf_service.extract_images_from_pdf(
            pdf_bytes=contents,
            page_limit=page_limit_int,
            page_range_start=None,
            page_range_end=None,
            zoom_factor=settings.pdf_zoom_factor
        )
        
        if not images_data:
            raise HTTPException(status_code=400, detail="Failed to extract images from PDF")
        
        # Extract Q&A pairs
        logger.info(f"Extracting Q&A from {len(images_data)} pages")
        qa_results = await qa_service.extract_qa_from_images_async(images_data)
        
        if not qa_results:
            raise HTTPException(status_code=400, detail="Failed to extract Q&A from PDF")
        
        # Evaluate all questions
        logger.info(f"Evaluating {len(qa_results)} questions")
        evaluation_results = []
        model_answer_results = []
        total_tokens = 0
        
        for qa_item in qa_results:
            # Evaluate answer
            eval_result, tokens = await eval_service.evaluate_answer_async(
                question=qa_item.get('Question', ''),
                answer=qa_item.get('Answer', ''),
                marks=qa_item.get('Marks', 10),
                gs_paper=qa_item.get('GS_Paper', 'GS-1'),
                subject=qa_item.get('Subject', ['General Studies'])
            )
            evaluation_results.append(eval_result)
            total_tokens += tokens
            
            # Generate model answer
            model_result, model_tokens = await model_service.generate_model_answer_async(
                question=qa_item.get('Question', ''),
                marks=qa_item.get('Marks', 10),
                gs_paper=qa_item.get('GS_Paper', 'GS-1'),
                subject=qa_item.get('Subject', ['General Studies'])
            )
            model_answer_results.append(model_result)
            total_tokens += model_tokens
        
        # Create complete package
        total_duration = time.time() - overall_start_time
        
        complete_package = export_service.create_complete_package(
            evaluations=evaluation_results,
            model_answers=model_answer_results,
            qa_pairs=qa_results,
            total_duration=total_duration,
            total_tokens=total_tokens
        )
        
        logger.info(f"Export completed in {total_duration:.2f}s")
        
        return JSONResponse(
            content=complete_package,
            headers={
                "Content-Disposition": f'attachment; filename="evaluation_package_{int(time.time())}.json"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
