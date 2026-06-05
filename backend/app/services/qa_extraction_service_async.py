"""
Async Q&A Extraction Service - Parallel batch extraction for high performance.
"""

import re
import json
import time
from typing import List, Dict, Any, Optional
from PIL import Image
import io
import asyncio

from app.core.logging_config import logger
from app.core.memory_utils import release_memory
from app.services.gemini_service_async import get_async_gemini_service
from app.services.pdf_service import get_pdf_service
from app.utils.text_utils import sanitize_text_for_prompt, parse_ai_json_response
from app.config.settings import get_settings


class AsyncQAExtractionService:
    """Async service for extracting Q&A from PDF images with parallel processing."""
    
    def __init__(self):
        """Initialize async QA extraction service."""
        self.gemini_service = get_async_gemini_service()
        self.settings = get_settings()
    
    async def extract_qa_from_pdf_async(
        self,
        pdf_bytes: bytes,
        page_limit: Optional[int] = None,
        zoom_factor: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fast path: parallel-render pages in batches, then parallel Gemini OCR per batch.
        Peak RAM ≈ one batch of images (not all 80 pages).
        """
        settings = self.settings
        pdf_service = get_pdf_service()
        batch_size = settings.pdf_processing_batch_size
        zoom = zoom_factor if zoom_factor is not None else settings.pdf_zoom_factor
        extract_start = time.time()

        page_indices = await asyncio.to_thread(
            pdf_service.resolve_page_indices,
            pdf_bytes,
            page_limit,
            None,
            None,
        )

        if not page_indices:
            logger.warning("No pages to process in PDF")
            return []

        total_pages = len(page_indices)
        num_batches = (total_pages + batch_size - 1) // batch_size
        logger.info(
            f"Parallel Q&A extraction: {total_pages} pages, "
            f"{num_batches} batches of {batch_size}, "
            f"{settings.pdf_render_workers} render workers, zoom={zoom}"
        )

        page_results: List[Dict[str, Any]] = []

        for batch_num, batch_start in enumerate(range(0, total_pages, batch_size), 1):
            batch_indices = page_indices[batch_start : batch_start + batch_size]
            batch_t0 = time.time()

            rendered = await pdf_service.render_pages_parallel_async(
                pdf_bytes=pdf_bytes,
                page_indices=batch_indices,
                zoom_factor=zoom,
            )

            if not rendered:
                logger.warning(f"Batch {batch_num}: no pages rendered")
                continue

            batch_images = [img for _, img in rendered]
            batch_page_numbers = [num for num, _ in rendered]

            page_results.extend(
                await self._extract_page_batch(batch_images, batch_page_numbers)
            )
            release_memory(rendered, batch_images)

            logger.info(
                f"Batch {batch_num}/{num_batches} done in {time.time() - batch_t0:.1f}s "
                f"(pages {batch_page_numbers[0]}-{batch_page_numbers[-1]})"
            )

        extract_duration = time.time() - extract_start
        qa_pairs = self._stitch_answers(page_results)
        release_memory(page_results)

        logger.info(
            f"Extracted {len(qa_pairs)} Q&A pairs from {total_pages} pages "
            f"in {extract_duration:.1f}s "
            f"({extract_duration / max(total_pages, 1):.2f}s/page)"
        )
        return qa_pairs

    async def extract_qa_from_images_async(self, images_data: List[bytes]) -> List[Dict[str, Any]]:
        """
        Extract Q&A pairs from pre-loaded page images (legacy path).
        Prefer extract_qa_from_pdf_async() in production to limit RAM usage.
        """
        logger.info(f"Starting ASYNC Q&A extraction from {len(images_data)} pages")
        page_results = await self._extract_pages_in_batches(images_data)
        qa_pairs = self._stitch_answers(page_results)
        release_memory(images_data, page_results)
        logger.info(f"Extracted {len(qa_pairs)} Q&A pairs using async batch processing")
        return qa_pairs
    
    async def _extract_page_batch(
        self,
        batch_images: List[bytes],
        batch_page_numbers: List[int],
    ) -> List[Dict[str, Any]]:
        """Run Gemini extraction for one small batch of pages, then free image memory."""
        page_specific_prompt = self._get_extraction_prompt()
        if batch_page_numbers:
            logger.info(
                f"Processing batch: pages {batch_page_numbers[0]} to {batch_page_numbers[-1]}"
            )

        tasks = [
            self._extract_single_page(image_bytes, page_number, page_specific_prompt)
            for image_bytes, page_number in zip(batch_images, batch_page_numbers)
        ]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        parsed: List[Dict[str, Any]] = []
        for page_number, result in zip(batch_page_numbers, batch_results):
            if isinstance(result, Exception):
                logger.error(f"Page {page_number} extraction failed: {result}")
                parsed.append(self._create_fallback_page_data(page_number))
            elif result:
                parsed.append(result)
            else:
                logger.warning(f"Page {page_number}: No result")
                parsed.append(self._create_fallback_page_data(page_number))

        release_memory(batch_images)
        return parsed

    async def _extract_pages_in_batches(self, images_data: List[bytes]) -> List[Dict[str, Any]]:
        """Extract from a pre-loaded image list in bounded parallel batches."""
        all_page_results: List[Dict[str, Any]] = []
        total_pages = len(images_data)
        batch_size = self.settings.extraction_batch_size

        logger.info(f"Extracting {total_pages} pages in batches of {batch_size}")

        for batch_start in range(0, total_pages, batch_size):
            batch_end = min(batch_start + batch_size, total_pages)
            batch_images = images_data[batch_start:batch_end]
            batch_page_numbers = list(range(batch_start + 1, batch_end + 1))
            all_page_results.extend(
                await self._extract_page_batch(batch_images, batch_page_numbers)
            )
            release_memory()

        return all_page_results
    
    async def _extract_single_page(
        self,
        image_bytes: bytes,
        page_number: int,
        prompt_template: str
    ) -> Dict[str, Any]:
        """Extract content from a single page asynchronously."""
        try:
            img = Image.open(io.BytesIO(image_bytes))
            
            # Customize prompt with page number
            page_prompt = prompt_template.replace(
                'PAGE_NUMBER_PLACEHOLDER',
                str(page_number)
            )
            
            # Call Gemini API asynchronously
            response = await self.gemini_service.generate_content_async([img, page_prompt])
            page_data = parse_ai_json_response(response.text)
            
            if page_data:
                # CRITICAL: Force correct page number (AI sometimes ignores our instruction)
                page_data["Page Number"] = page_number
                logger.debug(f"Page {page_number}: Extracted successfully")
                return page_data
            else:
                logger.warning(f"Page {page_number}: Failed to parse JSON")
                return self._create_fallback_page_data(page_number)
                
        except Exception as e:
            logger.error(f"Page {page_number} extraction error: {e}")
            raise
    
    def _get_extraction_prompt(self) -> str:
        """Get the comprehensive extraction prompt from original script.py."""
        return """
You are a highly specialized OCR model for UPSC handwritten answer sheets. Your task is to extract content from a single page and format it as a JSON object. Follow these strict rules:

**CRITICAL INSTRUCTION: DO NOT MISS ANY TEXT.**
- You must capture every single word and character of the student's answer. This includes text in the main body, sidebars, margins, headers, or any other part of the page where the student has written.
- The completeness of your transcription is paramount for the downstream evaluation.

**CRITICAL QUESTION IDENTIFICATION RULES:**

1.  **NEW QUESTION INDICATORS:** A new question MUST have:
    - Clear question number (Q1, Q2, etc. OR 1., 2., etc.)
    - Followed by actual question text with question words like "Examine", "Discuss", "Analyze", "Explain", "Critically analyze", "Evaluate", "Comment on"
    - Clear marks indication like "(10 marks)" or "[15M]"

2.  **NOT A NEW QUESTION:** Do NOT treat as new questions:
    - Numbered points within an answer (like "1) Political History", "2) Economic History")
    - Section headings or subheadings
    - Continuation of previous answer on new page
    - Lists or bullet points

3.  **CONTINUATION RULE:** 
    - If a page has NO question text at all, it is ALWAYS a continuation
    - If a page starts with answer content (not a question), it is a continuation  
    - If text on a page does NOT start with question words like "examine", "discuss", etc., treat it as continuation
    - **CRITICAL**: Before creating any new question entry, verify it has ALL THREE requirements: question number + question text + marks
    - If ANY of the three requirements are missing, leave "Question Number" as empty string ("")

4.  **MANDATORY VERIFICATION BEFORE NEW QUESTION:**
    - Question number present? (Q1, Q2, 1., 2., etc.)
    - Question text with question words present? (Examine, Discuss, Analyze, etc.)  
    - Marks indication present? ((10 marks), [15M], etc.)
    - **If NO to any of these = This is a CONTINUATION PAGE, set "Question Number" to ""**

**CONTENT EXTRACTION PROTOCOL:**

1.  **Question Field (`Question`):**
    * Search the page for an English question. An English question can be identified by:
        * **UPSC Question Patterns:** Look for these specific patterns at the start of meaningful content:
            * "Q.1", "Q.2", "Q.3" (with or without spaces)
            * "1.", "2.", "3." followed by question text (not a continuation of an answer)
            * "1(a)", "1(b)", "2(a)", "2(b)" for sub-questions
        * **Directive words:** The text must contain words like "Discuss," "Examine," "Analyze," "Evaluate," "Explain," or "Comment."
    * If an English question is found, extract its full text and place it in this field.
    * If no English question is found, this field MUST be an empty string ("").

2.  **Answer Field (`Answer_Page_Text`):**
    * Transcribe all remaining handwritten English text on the page.
    * This field MUST NOT contain the English question text.
    * Completely ignore and do not transcribe any Hindi/Devanagari characters or text.
    **ROW-BY-ROW EXTRACTION PROTOCOL:**
    - Process each line of handwritten text from left to right completely
    - IGNORE vertical lines, borders, or visual dividers - they should NOT stop text extraction
    - When you encounter a vertical line, continue reading across it to capture content on both sides
    - For each row: extract left content + right content as "Left text | Right text"
    - Only stop when you reach actual end of handwritten content or significant white space gap
    - Don't let visual elements interrupt the flow of text extraction
    - Complete each horizontal row fully before moving to next row
    - CRITICAL: Extract ALL handwritten content until the very end - don't truncate conclusions or final statements
    
3.  **Language Filter:**
    * Some questions will be in both Hindi and English languages immediately but only consider English question alone and dont consider Hindi.
    * Completely ignore all Hindi/Devanagari characters (e.g., in the Hindi question at the top of the page). Only English text should be extracted for any field.
    * If a page has no handwritten text, use the value "BLANK_PAGE".
    * If a page contains only exam instructions, use the value "INSTRUCTION_PAGE".
    * CRITICAL: Extract ALL handwritten content until the very end - don't truncate conclusions or final statements

4.  **Marks Extraction:** Look for patterns like `(10 marks)`, `[15M]`, `2*10=20`, `5 x 10 = 50`, or similar.
    - **CRITICAL:** If a pattern like `X*Y=Z` or `X x Y = Z` is found, this indicates `Y` is the marks for each individual sub-question. Use `Y`, not `Z`.
    - The value for "Marks" must NEVER exceed 25. If you see > 25, it's a section total - find the individual question marks.

5.  **GS_Paper Identification:** Identify the UPSC Paper type: 'GS-1', 'GS-2', 'GS-3', 'GS-4', or 'Optional'.

6.  **Subject Identification:** Identify relevant UPSC Subjects. For optional subjects, use format "Subject Optional" (e.g., "Anthropology Optional").
    **CRITICAL FORMAT RULES:**
    - Subject MUST be a SINGLE complete string like "Anthropology Optional"
    - NEVER split into letters ["A","n","t","h"]
    - Use format: ["Anthropology Optional"] or ["History", "Polity"]

**JSON Output Schema:**

**CRITICAL: USE THE PAGE NUMBER PROVIDED BELOW - DO NOT CHANGE IT!**

{
    "Page Number": PAGE_NUMBER_PLACEHOLDER,
    "Question Number": "The question number (e.g., '1', '2(a)'), or '' if none.",
    "Question": "The full English question text, or '' if none.",
    "Answer_Page_Text": "The transcribed English answer text only, with the question text completely removed.",
    "Marks": "The marks for the question, or 0 if none.",
    "GS_Paper": "The UPSC paper, or '' if none.",
    "Subject": "An array of identified subjects, or [] if none."
}

**Your response must be a single, valid JSON object, and nothing else.**
"""
    
    def _create_fallback_page_data(self, page_num: int) -> Dict[str, Any]:
        """Create fallback page data when extraction fails."""
        return {
            "Page Number": page_num,
            "Question Number": "",
            "Question": "",
            "Answer_Page_Text": "EXTRACTION_FAILED",
            "Marks": 0,
            "GS_Paper": "",
            "Subject": []
        }
    
    def _stitch_answers(self, page_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Stitch answers that span multiple pages.
        
        CRITICAL: This processes ALL pages sequentially AFTER batch extraction completes,
        ensuring continuation pages are properly connected even across batch boundaries.
        
        Example: 
        - Batch 1: Pages 1-10 (Q1 starts on page 10)
        - Batch 2: Pages 11-20 (Page 11 continues Q1's answer)
        - Result: Q1's answer = Page 10 answer + Page 11 answer (correctly stitched)
        """
        logger.info(f"Stitching answers across {len(page_results)} pages")
        
        final_qa_pairs = []
        current_question = None
        continuation_count = 0
        
        for idx, page_data in enumerate(page_results):
            page_num = page_data.get("Page Number", idx + 1)
            # # Ensure page_num is an integer (Gemini may return it as a string)
            # try:
            #     page_num = int(page_num) if isinstance(page_num, str) else page_num
            # except (ValueError, TypeError):
            #     page_num = idx + 1
            
            q_num = page_data.get("Question Number", "")
            question_text = page_data.get("Question", "")
            answer_text = page_data.get("Answer_Page_Text", "")
            
            logger.debug(f"[Page {page_num}] Processing: q_num='{q_num}', answer_len={len(answer_text) if answer_text else 0}")
            
            # Skip blank/failed pages
            if not answer_text or len(answer_text.strip()) < 10 or answer_text == "BLANK_PAGE":
                logger.info(f"[skip] Page {page_num}: blank or insufficient content")
                continue
            
            # Check for new question
            if q_num and q_num.strip():
                # Finalize previous question
                if current_question:
                    final_qa_pairs.append(current_question)
                    page_range_str = ', '.join(str(p) for p in current_question['Page_Range'])
                    logger.info(f"[ok] Completed Q{current_question['Question Number']}: "
                              f"{len(current_question['Answer'])} chars across {len(current_question['Page_Range'])} pages "
                              f"[Pages: {page_range_str}]")
                
                # Get marks
                marks_value = page_data.get("Marks", 10)
                try:
                    marks_int = int(marks_value) if marks_value else 10
                except (ValueError, TypeError):
                    marks_int = 10
                
                # Start new question
                current_question = {
                    "Question Number": q_num,
                    "Question": question_text,
                    "Answer": answer_text,
                    "Marks": marks_int,
                    "GS_Paper": page_data.get("GS_Paper", "GS-1"),
                    "Subject": page_data.get("Subject", ["General Studies"]),
                    "Page_Range": [page_num]
                }
                continuation_count = 0
                logger.info(f"[new] Started Q{q_num} on page {page_num} ({len(answer_text)} chars)")
            else:
                # Continuation page (NO question number means answer continues from previous page)
                if current_question:
                    # Append answer text to current question
                    if current_question["Answer"]:
                        current_question["Answer"] += "\n\n" + answer_text
                    else:
                        current_question["Answer"] = answer_text
                    current_question["Page_Range"].append(page_num)
                    continuation_count += 1
                    logger.info(f"[cont] Page {page_num}: continuation of Q{current_question['Question Number']} "
                              f"(+{len(answer_text)} chars, total: {len(current_question['Answer'])} chars, "
                              f"continuation #{continuation_count})")
                else:
                    # Orphan content (no preceding question) - skip
                    logger.warning(f"[orphan] Page {page_num}: content skipped "
                                 f"({len(answer_text)} chars, no preceding question)")
        
        # Add final question
        if current_question:
            final_qa_pairs.append(current_question)
            page_range_str = ', '.join(str(p) for p in current_question['Page_Range'])
            logger.info(f"[ok] Added FINAL question Q{current_question['Question Number']}: "
                      f"{len(current_question['Answer'])} chars across {len(current_question['Page_Range'])} pages "
                      f"[Pages: {page_range_str}]")
        
        logger.info(f"=" * 80)
        logger.info(f"[done] Stitching complete: {len(final_qa_pairs)} Q&A pairs from {len(page_results)} pages")
        logger.info(f"=" * 80)
        return final_qa_pairs


def get_async_qa_extraction_service() -> AsyncQAExtractionService:
    """Get async QA extraction service instance (singleton)."""
    return AsyncQAExtractionService()
