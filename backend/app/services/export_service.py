"""
Export Service - Transforms evaluations and model answers into complete package format.
Matches the structure of complete_evaluation_package.json.
"""

from typing import Dict, Any, List
from datetime import datetime
from app.core.logging_config import logger


class ExportService:
    """Service for exporting evaluations to complete package format."""
    
    @staticmethod
    def create_complete_package(
        evaluations: List[Dict[str, Any]],
        model_answers: List[Dict[str, Any]],
        qa_pairs: List[Dict[str, Any]],
        total_duration: float,
        total_tokens: int
    ) -> Dict[str, Any]:
        """
        Transform evaluations and model answers into complete package format.
        
        Args:
            evaluations: List of evaluation results
            model_answers: List of model answer results
            qa_pairs: Original Q&A pairs with student answers
            total_duration: Total processing duration in seconds
            total_tokens: Total tokens consumed
        
        Returns:
            Complete evaluation package matching JSON structure
        """
        logger.info("Creating complete evaluation package")
        
        # Calculate totals with proper rounding
        total_questions = len(evaluations)
        total_ai_magic_marks = sum(
            eval_data.get('overall_upsc_assessment', {}).get('total_param_marks_awarded', 0)
            for eval_data in evaluations
        )
        total_max_marks = sum(
            eval_data.get('overall_upsc_assessment', {}).get('total_param_marks_possible', 0)
            for eval_data in evaluations
        )
        
        # Round total marks to nearest 0.5 (half marks)
        total_ai_magic_marks = round(total_ai_magic_marks * 2) / 2
        
        # Build metadata
        metadata = {
            "total_questions": total_questions,
            "generated_at": datetime.now().isoformat(),
            "total_duration_seconds": round(total_duration, 2),
            "total_tokens": total_tokens,
            "total_ai_magic_marks": total_ai_magic_marks,
            "total_param_marks": total_ai_magic_marks,
            "total_max_marks": round(total_max_marks, 1)
        }
        
        # Build questions dict
        questions = {}
        
        for i, (eval_data, qa_item) in enumerate(zip(evaluations, qa_pairs)):
            q_num = qa_item.get("Question Number", i + 1)
            
            # Get model answer if available
            model_data = model_answers[i] if i < len(model_answers) else None
            
            # Build evaluation entry
            questions[f"{q_num}._evaluation"] = ExportService._build_evaluation_entry(
                eval_data, qa_item
            )
            
            # Build model answer entry
            questions[f"{q_num}._model_answer"] = ExportService._build_model_answer_entry(
                model_data, qa_item
            )
        
        logger.info(f"Complete package created with {len(questions)} entries")
        
        return {
            "metadata": metadata,
            "questions": questions
        }
    
    @staticmethod
    def _build_evaluation_entry(
        eval_data: Dict[str, Any],
        qa_item: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build evaluation entry for a question."""
        
        question_text = qa_item.get("Question", "N/A")
        answer_text = qa_item.get("Answer", "N/A")
        marks = int(qa_item.get("Marks", 10))
        subjects = qa_item.get("Subject", ["General Studies"])
        gs_paper = qa_item.get("GS_Paper", "GS-1")
        
        # Extract marks from evaluation (already rounded in validation)
        overall_assessment = eval_data.get('overall_upsc_assessment', {})
        awarded_marks = overall_assessment.get('total_param_marks_awarded', 0)
        
        # Calculate percentage
        percentage = round((awarded_marks / marks * 100), 1) if marks > 0 else 0
        time_allocation_minutes = ExportService._calculate_time_allocation(marks)
        
        # Build question metadata
        question_metadata = {
            "question_number": str(qa_item.get("Question Number", "1")),
            "question_text": question_text,
            "subject": subjects if isinstance(subjects, list) else [subjects],
            "gs_paper": gs_paper,
            "max_marks": marks,
            "page_range": {
                "start": str(qa_item.get("Start_Page", "1")),
                "end": str(qa_item.get("End_Page", "1"))
            },
            "time_allocation_minutes": time_allocation_minutes
        }
        
        # Build marks summary
        marks_summary = {
            "ai_magic_marks": awarded_marks,
            "param_marks_validated": awarded_marks,
            "percentage": percentage,
            "time_allocation_minutes": time_allocation_minutes
        }
        
        # Build question analysis
        qa_analysis = eval_data.get('upsc_question_analysis', {})
        question_analysis = {
            "question_category": qa_analysis.get('question_category', f"UPSC {gs_paper} Question"),
            "marks_distribution": qa_analysis.get('marks_distribution', f"{marks} marks"),
            "upsc_expectations": qa_analysis.get('upsc_expectations', [])
        }
        
        # Build evaluation sections
        evaluation_sections = ExportService._build_evaluation_sections(eval_data, marks)
        
        # Extract keywords
        keywords = overall_assessment.get('keywords_for_success', [])
        
        # Get final advice
        final_advice = overall_assessment.get('final_upsc_advice', 
                                              "Focus on structured writing with specific examples")
        
        # Build complete evaluation entry
        evaluation_entry = {
            "question_metadata": question_metadata,
            "marks_summary": marks_summary,
            "question_analysis": question_analysis,
            "evaluation_sections": evaluation_sections,
            "keywords_for_success": keywords,
            "final_advice": final_advice,
            "student_answer": answer_text
        }
        
        # Validation logging
        logger.info(f"Q{question_metadata['question_number']}: Built evaluation with student_answer={len(answer_text)} chars")
        
        return evaluation_entry
    
    @staticmethod
    def _build_evaluation_sections(
        eval_data: Dict[str, Any],
        max_marks: int
    ) -> List[Dict[str, Any]]:
        """Build evaluation sections from parameters matching exact JSON structure."""
        
        sections = []
        parameters = eval_data.get('upsc_focused_parameters', [])
        
        for param in parameters:
            section_name = param.get('parameter_name', 'Analysis')
            section_max_marks = param.get('max_marks_for_parameter', 0)
            student_analysis = param.get('student_analysis', {})
            upsc_enhancement = param.get('upsc_enhancement', {})
            
            awarded_marks = student_analysis.get('marks_allocation', 0)
            percentage = round((awarded_marks / section_max_marks * 100), 1) if section_max_marks > 0 else 0
            
            # Parse missing_upsc_elements into mistakes array with error_type and description
            mistakes = []
            missing_elements = student_analysis.get('missing_upsc_elements', [])
            for element in missing_elements:
                # Each element should be in format "ERROR_TYPE: Description"
                if isinstance(element, str) and ':' in element:
                    parts = element.split(':', 1)
                    mistakes.append({
                        "error_type": parts[0].strip(),
                        "description": parts[1].strip()
                    })
                elif isinstance(element, dict):
                    # Already in correct format
                    mistakes.append(element)
                else:
                    # Fallback for plain strings
                    mistakes.append({
                        "error_type": "GENERAL ISSUE",
                        "description": str(element)
                    })
            
            section = {
                "section_name": section_name,
                "max_marks": section_max_marks,
                "awarded_marks": awarded_marks,
                "percentage": percentage,
                "what_student_wrote": student_analysis.get('what_student_wrote', ''),
                "strengths": student_analysis.get('strengths_for_upsc', []),
                "mistakes": mistakes,
                "ideal_content": upsc_enhancement.get('ideal_upsc_content', '')
            }
            
            sections.append(section)
        
        return sections
    
    @staticmethod
    def _build_model_answer_entry(
        model_data: Dict[str, Any],
        qa_item: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build model answer entry for a question."""
        
        if not model_data:
            # Create empty model answer entry
            return {
                "question_metadata": {
                    "question_number": str(qa_item.get("Question Number", "1")),
                    "question_text": qa_item.get("Question", "N/A"),
                    "subject": qa_item.get("Subject", ["General Studies"]),
                    "gs_paper": qa_item.get("GS_Paper", "GS-1"),
                    "max_marks": int(qa_item.get("Marks", 10))
                },
                "model_answer": {
                    "content": "Model answer generation pending",
                    "structure": "Introduction + Body + Conclusion",
                    "format": "Markdown"
                },
                "current_affairs": [],
                "metadata": {
                    "generated_at": datetime.now().isoformat(),
                    "generation_time_seconds": 0,
                    "tokens_consumed": 0
                }
            }
        
        # Return actual model answer data
        return model_data
    
    @staticmethod
    def _calculate_time_allocation(marks: int) -> int:
        """
        Calculate recommended time allocation in minutes based on marks.
        
        Args:
            marks: Question marks
        
        Returns:
            Time in minutes
        """
        # Standard UPSC formula: ~7 minutes per 10 marks
        if marks == 10:
            return 7
        elif marks == 15:
            return 11
        elif marks == 20:
            return 14
        elif marks == 25:
            return 18
        else:
            # General formula: 0.7 minutes per mark
            return int(marks * 0.7)


def get_export_service() -> ExportService:
    """Get export service instance."""
    return ExportService()
