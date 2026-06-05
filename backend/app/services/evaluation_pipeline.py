"""
Unified evaluation pipeline — parallel processing for ~80 pages in under 3 minutes.
"""

import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.core.memory_utils import release_memory
from app.services.evaluation_service_async import get_async_evaluation_service
from app.services.export_service import get_export_service
from app.services.model_answer_service_async import get_async_model_answer_service
from app.services.qa_extraction_service_async import get_async_qa_extraction_service


ProgressCallback = Callable[[str, Dict[str, Any]], Awaitable[None]]
QuestionCallback = Callable[[Dict[str, Any]], Awaitable[None]]


class EvaluationPipeline:
    """PDF → parallel Q&A extraction → parallel per-question eval + model answers."""

    def __init__(self):
        self.settings = get_settings()
        self.qa_service = get_async_qa_extraction_service()
        self.eval_service = get_async_evaluation_service()
        self.model_service = get_async_model_answer_service()
        self.export_service = get_export_service()

    async def run(
        self,
        pdf_bytes: bytes,
        filename: str,
        page_limit: Optional[int] = None,
        on_progress: Optional[ProgressCallback] = None,
        on_question_complete: Optional[QuestionCallback] = None,
    ) -> Dict[str, Any]:
        overall_start = time.time()

        async def progress(message: str, **extra: Any) -> None:
            if on_progress:
                await on_progress(message, extra)

        await progress(
            "Extracting pages in parallel (fast batch mode)...",
            step=1,
            total_steps=4,
        )

        extract_start = time.time()
        qa_pairs = await self.qa_service.extract_qa_from_pdf_async(
            pdf_bytes=pdf_bytes,
            page_limit=page_limit,
        )
        extract_duration = time.time() - extract_start
        release_memory(pdf_bytes)

        if not qa_pairs:
            raise ValueError("No questions/answers could be extracted from PDF")

        total_questions = len(qa_pairs)
        await progress(
            f"Found {total_questions} questions in {extract_duration:.0f}s",
            step=2,
            total_steps=4,
            total_questions=total_questions,
        )

        await progress(
            f"Evaluating {total_questions} questions in parallel "
            f"(up to {self.settings.max_concurrent_evals} at once)...",
            step=3,
            total_steps=4,
        )

        eval_start = time.time()
        evaluations_raw, model_answers, total_tokens = await self._evaluate_all_questions(
            qa_pairs,
            on_question_complete=on_question_complete,
        )
        eval_duration = time.time() - eval_start

        await progress("Building final summary...", step=4, total_steps=4)

        total_duration = time.time() - overall_start
        complete_package = self.export_service.create_complete_package(
            evaluations=evaluations_raw,
            model_answers=model_answers,
            qa_pairs=qa_pairs,
            total_duration=total_duration,
            total_tokens=total_tokens,
        )

        target = self.settings.target_eval_duration_seconds
        if total_duration > target:
            logger.warning(
                f"Evaluation exceeded target: {total_duration:.1f}s > {target}s "
                f"(extract={extract_duration:.1f}s, eval={eval_duration:.1f}s, "
                f"pages={page_limit or 'all'}, questions={total_questions})"
            )
        else:
            logger.info(
                f"Within target: {total_duration:.1f}s <= {target}s "
                f"(extract={extract_duration:.1f}s, eval={eval_duration:.1f}s)"
            )

        logger.info(
            f"Pipeline complete for {filename}: {total_questions} questions "
            f"in {total_duration:.2f}s ({total_tokens} tokens)"
        )

        return {
            "total_questions": total_questions,
            "total_duration": round(total_duration, 2),
            "total_tokens": total_tokens,
            "complete_package": complete_package,
            "evaluations_raw": evaluations_raw,
            "model_answers": model_answers,
            "qa_pairs": qa_pairs,
        }

    async def _evaluate_all_questions(
        self,
        qa_pairs: List[Dict[str, Any]],
        on_question_complete: Optional[QuestionCallback] = None,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
        """
        Evaluate all questions with overlapping eval + model-answer stages.
        Separate semaphores let eval and model API calls run concurrently.
        """
        total_questions = len(qa_pairs)
        eval_sem = asyncio.Semaphore(self.settings.max_concurrent_evals)
        model_sem = asyncio.Semaphore(self.settings.max_concurrent_model_answers)
        results_by_index: Dict[int, Dict[str, Any]] = {}
        total_tokens = 0
        completed_count = 0

        async def process_question(idx: int, qa: Dict[str, Any]) -> Dict[str, Any]:
            question_num = qa["Question Number"]
            student_answer = qa.get("Answer", "")

            try:
                async with eval_sem:
                    eval_result, eval_tokens = await self.eval_service.evaluate_answer_async(
                        question=qa["Question"],
                        answer=student_answer,
                        marks=qa["Marks"],
                        gs_paper=qa["GS_Paper"],
                        subject=qa["Subject"],
                    )

                upsc_expectations = eval_result.get("upsc_question_analysis", {}).get(
                    "upsc_expectations", []
                )

                async with model_sem:
                    model_result, model_tokens = await self.model_service.generate_model_answer_async(
                        question=qa["Question"],
                        subject=qa["Subject"],
                        gs_paper=qa["GS_Paper"],
                        marks=qa["Marks"],
                        upsc_expectations=upsc_expectations,
                    )

                return {
                    "success": True,
                    "idx": idx,
                    "question_num": question_num,
                    "qa": qa,
                    "eval_result": eval_result,
                    "eval_tokens": eval_tokens,
                    "model_result": model_result,
                    "model_tokens": model_tokens,
                }
            except Exception as e:
                logger.error(f"Failed to process Question {question_num}: {e}")
                return {
                    "success": False,
                    "idx": idx,
                    "question_num": question_num,
                    "error": str(e),
                }

        tasks = [process_question(idx, qa) for idx, qa in enumerate(qa_pairs, 1)]

        for coro in asyncio.as_completed(tasks):
            result = await coro
            completed_count += 1

            if result["success"]:
                results_by_index[result["idx"]] = result
                total_tokens += result["eval_tokens"] + result["model_tokens"]

                if on_question_complete:
                    await on_question_complete(
                        {
                            "question_number": result["question_num"],
                            "current": completed_count,
                            "total": total_questions,
                            "question": result["qa"]["Question"],
                            "marks": result["qa"]["Marks"],
                            "evaluation": result["eval_result"],
                            "model_answer": result["model_result"],
                            "page_range": result["qa"].get("Page_Range", []),
                        }
                    )
            elif on_question_complete:
                await on_question_complete(
                    {
                        "error": True,
                        "question_number": result["question_num"],
                        "error_message": result.get("error", "Unknown error"),
                        "current": completed_count,
                        "total": total_questions,
                    }
                )

        evaluations_raw = []
        model_answers = []
        for idx in sorted(results_by_index.keys()):
            entry = results_by_index[idx]
            evaluations_raw.append(entry["eval_result"])
            model_answers.append(entry["model_result"])

        failed = total_questions - len(evaluations_raw)
        if failed:
            raise RuntimeError(f"Failed to process {failed} of {total_questions} questions")

        release_memory(results_by_index)
        return evaluations_raw, model_answers, total_tokens


def get_evaluation_pipeline() -> EvaluationPipeline:
    return EvaluationPipeline()
