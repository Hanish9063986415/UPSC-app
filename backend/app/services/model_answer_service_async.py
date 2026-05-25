"""
Async Model Answer Service - Generate ideal answers asynchronously.
"""

import time
import asyncio
from typing import Dict, Any, Tuple, List
from app.core.logging_config import logger
from app.services.gemini_service_async import get_async_gemini_service
from app.utils.text_utils import sanitize_text_for_prompt, parse_ai_json_response


class AsyncModelAnswerService:
    """Async service for generating model UPSC answers."""
    
    def __init__(self):
        """Initialize async model answer service."""
        self.gemini_service = get_async_gemini_service()
    
    async def generate_model_answer_async(
        self,
        question: str,
        subject: List[str],
        gs_paper: str,
        marks: int,
        upsc_expectations: List[str]
    ) -> Tuple[Dict[str, Any], int]:
        """
        Generate a model answer asynchronously.
        
        Args:
            question: Question text
            subject: Subject areas
            gs_paper: GS Paper type
            marks: Maximum marks
            upsc_expectations: Expected points from evaluation
        
        Returns:
            Tuple of (model_answer_dict, tokens)
        """
        logger.info(f"Async generating model answer for {marks}-mark question")
        start_time = time.time()
        
        # Sanitize inputs
        sanitized_question = sanitize_text_for_prompt(question)
        
        # Calculate word count requirement
        min_words = 200 + (marks - 10) * 10 if marks >= 10 else 150
        max_words = min_words + 50
        
        # Create model answer prompt
        prompt = self._create_model_answer_prompt(
            sanitized_question,
            subject,
            gs_paper,
            marks,
            min_words,
            max_words,
            upsc_expectations
        )
        
        # Retry with exponential backoff for rate limit errors
        max_retries = 3
        retry_delay = 2  # seconds
        
        for attempt in range(max_retries):
            try:
                # IMPORTANT: use_json_mode=False for plain text output (like script.py)
                response = await self.gemini_service.generate_content_async([prompt], use_json_mode=False)
                
                duration = time.time() - start_time
                tokens = response.usage_metadata.total_token_count if response.usage_metadata else 0
                
                # Get plain text response (not JSON)
                model_text = response.text if hasattr(response, 'text') else str(response)
                
                # Validate response is not empty
                if not model_text or len(model_text.strip()) < 50:
                    raise ValueError("Model answer response too short or empty")
                
                # Calculate word count
                word_count = len(model_text.split())
                char_count = len(model_text)
                
                # Log generation details
                logger.info(f"Async model answer generated in {duration:.2f}s ({char_count} chars, ~{word_count} words) - attempt {attempt + 1}")
                logger.info(f"Expected minimum: {min_words} words (for {marks} marks)")
                
                # Create structured result from plain text
                result = {
                    "question_metadata": {
                        "question_text": question,
                        "subject": subject,
                        "gs_paper": gs_paper,
                        "max_marks": marks
                    },
                    "model_answer": {
                        "full_text": model_text,
                        "word_count": word_count,
                        "format": "Markdown"
                    },
                    "metadata": {
                        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "answer_type": "UPSC Model Answer",
                        "attempts": attempt + 1
                    }
                }
                
                return result, tokens
                
            except Exception as e:
                error_msg = str(e)
                is_rate_limit = "429" in error_msg or "rate" in error_msg.lower() or "quota" in error_msg.lower()
                
                if attempt < max_retries - 1 and is_rate_limit:
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(f"Rate limit hit, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error(f"Async model answer generation failed after {attempt + 1} attempts: {e}", exc_info=True)
                    return self._create_fallback_model_answer(question), 0
    
    def _create_model_answer_prompt(
        self,
        question: str,
        subject: List[str],
        gs_paper: str,
        marks: int,
        min_words: int,
        max_words: int,
        upsc_expectations: List[str]
    ) -> str:
        """Create comprehensive model answer prompt matching original script.py style."""
        
       
        # Formula: 200 + (marks - 10) * 10
        # 10 marks = 200 words, 15 marks = 250 words, 20 marks = 300 words, 25 marks = 350 words
        calculated_min_words = 200 + (marks - 10) * 10
        
        subject_str = ', '.join(subject) if isinstance(subject, list) else str(subject)
        expectations_str = '\n'.join([f"- {exp}" for exp in upsc_expectations]) if upsc_expectations else "- Comprehensive coverage of all dimensions"
        
        # Calculate body parts based on marks
        if marks <= 10:
            body_parts = '3'
        elif marks == 15:
            body_parts = '3-4'
        elif marks == 20:
            body_parts = '4-5'
        else:
            body_parts = '5-6'
        
        prompt = f"""
You are a 30+ years experienced UPSC Civil Services Mains examiner. Create a model answer following the exact structure specified below.

**QUESTION:** {question}
**Subject:** {subject_str}
**GS Paper:** {gs_paper}
**Marks:** {marks}

**KEY EXPECTATIONS TO ADDRESS:**
{expectations_str}

**MANDATORY STRUCTURE TO FOLLOW:**

**APPROACH:** First provide a brief approach statement explaining how to write this answer. Example format: "Introduce the answer with [specific requirement]. Next, discuss [main aspects]. Also, outline [additional elements]. Conclude with [specific conclusion type]."

**INTRODUCTION:**
- Directly address the question with background context. Please dont analyse the question just address the question like a student in the final exam
- Include stats, reports, years, recent news as per question demand
- Never use "this essay" or "this answer" 
- Make it effective and impactful
- Around 30 words limit

**BODY STRUCTURE:**
Use side headings directly related to the question, then numbered subheadings:

**1. [First Main Aspect]:**
Brief 1-2 statement introduction to this aspect.
(i) **[Relevant Subheading]:** First point with specific examples, stats, names, dates
(ii) **[Relevant Subheading]:** Second point with evidence and examples  
(iii) **[Relevant Subheading]:** Third point with supporting data
(iv) Additional points as needed

**2. [Second Main Aspect]:**
Brief 1-2 statement introduction.
(i) **[Relevant Subheading]:** Point with examples and statistics
(ii) **[Relevant Subheading]:** Point with case studies or evidence
(iii) **[Relevant Subheading]:** Point with current affairs integration
(iv) Additional points as needed

**3. [Continue pattern for all aspects required by question]**

**VISUAL ELEMENTS & TABLES:**
- Use markdown tables for comparison questions, differences, or when contrasting multiple concepts
- Include tables for data presentation, timeline comparisons, or feature analysis
- Format tables properly with clear headers and organized data

**CONCLUSION:**
- Synthesis of key arguments
- Specific way forward recommendations
- Subject-appropriate advice and future vision
- Around 30 words limit

**WORD LIMITS & BODY PARTS:**
- {marks} marks = {calculated_min_words} words minimum (Formula: 200 + (marks-10)*10)
- Target word count: {calculated_min_words}-{calculated_min_words + 100} words
- Include minimum {body_parts} body parts

**CRITICAL REQUIREMENTS:**
- Use **bold** for all key terms, names, years, policies, schemes, statistics
- Include specific examples with names and dates
- Add constitutional articles, acts, policies where relevant
- Integrate 2023-24 current affairs and recent developments
- Use precise {subject_str} terminology
- Every claim must have supporting evidence
- Connect theory with practical implementation

**MANDATORY: ADD RECENT CURRENT AFFAIRS SECTION:**
After completing the model answer, add a separate "Recent Current Affairs" section below the conclusion:

**Recent Current Affairs:**
Search for 2-3 recent developments 2025 or 2024 related to this question topic. For each development, include:
- Specific dates, statistics, and quantitative data
- Official sources (government reports, ministry data, research studies)
- Clear connection to the question topic with evidence

Format:
**Recent NEWS 1:** [Specific event with date] - [Quantitative data/statistics] - Source: [Official source/report name] - Relevance: [How it specifically connects to question topic]

**Recent NEWS 2:** [Specific event with date] - [Quantitative data/statistics] - Source: [Official source/report name] - Relevance: [How it specifically connects to question topic]

**Recent NEWS 3:** [Specific event with date] - [Quantitative data/statistics] - Source: [Official source/report name] - Relevance: [How it specifically connects to question topic]

**Add more Recent NEWS based on availability if possible**

**REQUIREMENTS FOR CURRENT AFFAIRS:**
- Include exact dates (month/year)
- Provide specific numbers, percentages, or statistics
- Cite official sources (ministry reports, survey data, government statistics)
- Explain direct relevance to the question topic
- Avoid generic statements - use concrete data only

Create a model answer that demonstrates UPSC topper-level writing with analytical depth, factual accuracy, and comprehensive coverage following the exact structure specified above.
- Bold important terms throughout
- Use proper markdown formatting

**SUBJECT-SPECIFIC GUIDELINES:**

**For Polity/Governance:**
- Reference Articles, Schedules, Amendments
- Cite Supreme Court cases
- Mention constitutional bodies, commissions
- Include recent legislative changes

**For International Relations:**
- Reference specific bilateral/multilateral agreements
- Include trade figures, strategic partnerships
- Mention recent summits, joint exercises with dates
- Reference think tank reports, global indices

**For Economy:**
- Include GDP figures, growth rates, budget allocations
- Reference economic surveys, RBI reports
- Mention specific sectors with data
- Include government economic schemes

**For Environment/Science:**
- Reference international agreements (Paris, Montreal Protocol)
- Include environmental indices, targets
- Mention specific technologies, missions
- Cite IPCC, scientific reports
"""
        return prompt
    
    def _create_fallback_model_answer(self, question: str) -> Dict[str, Any]:
        """Create fallback model answer when AI fails."""
        fallback_text = f"""**APPROACH:**
Unable to generate approach due to technical issue.

**INTRODUCTION:**
Model answer generation encountered an error. Please try again or create manually.

**CONCLUSION:**
Unable to generate conclusion due to technical issue.

**Recent Current Affairs:**
No current affairs data available.
"""
        return {
            "question_metadata": {
                "question_text": question,
                "subject": ["Unknown"],
                "gs_paper": "Unknown",
                "max_marks": 0
            },
            "model_answer": {
                "full_text": fallback_text,
                "word_count": len(fallback_text.split()),
                "format": "Markdown"
            },
            "metadata": {
                "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "answer_type": "Fallback",
                "error": "Model answer generation failed. Please try again."
            }
        }


# Singleton instance
_async_model_answer_service = None


def get_async_model_answer_service() -> AsyncModelAnswerService:
    """Get async model answer service instance."""
    global _async_model_answer_service
    if _async_model_answer_service is None:
        _async_model_answer_service = AsyncModelAnswerService()
    return _async_model_answer_service
