"""
Async Evaluation Service - Non-blocking AI-based evaluation of answers.
"""

import time
import json
from typing import Dict, Any, Tuple
from app.core.logging_config import logger
from app.services.gemini_service_async import get_async_gemini_service
from app.utils.text_utils import sanitize_text_for_prompt, parse_ai_json_response


class AsyncEvaluationService:
    """Async service for evaluating UPSC answers using AI."""
    
    def __init__(self):
        """Initialize async evaluation service."""
        self.gemini_service = get_async_gemini_service()
    
    async def evaluate_answer_async(
        self,
        question: str,
        answer: str,
        marks: int,
        gs_paper: str,
        subject: list
    ) -> Tuple[Dict[str, Any], int]:
        """
        Evaluate a single answer using AI asynchronously.
        
        Args:
            question: Question text
            answer: Student's answer
            marks: Maximum marks
            gs_paper: GS Paper type
            subject: Subject areas
        
        Returns:
            Tuple of (evaluation_result, tokens)
        """
        logger.info(f"Async evaluating answer for {marks}-mark question")
        start_time = time.time()
        
        # Sanitize inputs
        sanitized_question = sanitize_text_for_prompt(question)
        sanitized_answer = sanitize_text_for_prompt(answer)
        
        # Calculate marks distribution
        distribution = self._calculate_marks_distribution(marks)
        
        # Create evaluation prompt
        eval_prompt = self._create_evaluation_prompt(
            sanitized_question,
            sanitized_answer,
            marks,
            gs_paper,
            subject,
            distribution
        )
        
        # Get evaluation from AI (async)
        try:
            response = await self.gemini_service.generate_content_async([eval_prompt])
            
            duration = time.time() - start_time
            tokens = response.usage_metadata.total_token_count if response.usage_metadata else 0
            
            # Parse response
            result = parse_ai_json_response(response.text)
            
            if result:
                # Add student answer to result
                result['student_answer'] = answer
                
                # Validate marks
                result = self._validate_marks(result, marks)
                logger.info(f"Async evaluation completed in {duration:.2f}s")
                return result, tokens
            else:
                logger.error("Failed to parse evaluation response")
                return self._create_fallback_evaluation(), tokens
                
        except Exception as e:
            logger.error(f"Async evaluation failed: {e}")
            return self._create_fallback_evaluation(), 0
    
    def _calculate_marks_distribution(self, total_marks: int) -> Dict[str, float]:
        """Calculate marks distribution for introduction, body, conclusion."""
        total_marks = int(total_marks)
        
        if total_marks == 10:
            return {"introduction": 2, "body": 6, "conclusion": 2}
        elif total_marks == 15:
            return {"introduction": 2.5, "body": 10, "conclusion": 2.5}
        elif total_marks == 20:
            return {"introduction": 3, "body": 14, "conclusion": 3}
        elif total_marks == 25:
            return {"introduction": 4, "body": 17, "conclusion": 4}
        else:
            intro = max(2, int(total_marks * 0.2))
            concl = max(2, int(total_marks * 0.15))
            body = total_marks - intro - concl
            return {"introduction": intro, "body": body, "conclusion": concl}
    
    def _create_evaluation_prompt(
        self,
        question: str,
        answer: str,
        marks: int,
        gs_paper: str,
        subject: list,
        distribution: Dict[str, float]
    ) -> str:
        """Create comprehensive evaluation prompt - EXACT COPY from script.py lines 863-1190."""
        
        subject_str = ', '.join(subject) if isinstance(subject, list) else str(subject)
        
        prompt = f"""
You are a UPSC evaluator. Analyze this answer and create body sections based on what the specific question demands.

**STEP 0: CRITICAL SUBJECT IDENTIFICATION**
Before any evaluation, accurately identify the subject and paper type:

**QUESTION:** {question}
**PROVIDED SUBJECT:** {subject_str}
**PROVIDED GS_PAPER:** {gs_paper}

**SUBJECT IDENTIFICATION RULES:**
1. **Trust the provided subject classification** - it has been pre-analyzed
2. **For Optional subjects:** Look for specific terminology, theories, scholars, concepts unique to that field
3. **For GS papers:** Identify which GS paper (1-4) based on syllabus coverage

**OPTIONAL SUBJECT INDICATORS:**
- Anthropology Optional: Terms like kinship, ethnography, cultural evolution, descent groups, marriage systems, tribal studies, Radcliffe-Brown, Levi-Strauss, etc.
- Sociology Optional: Terms like social stratification, social mobility, social change, Auguste Comte, Durkheim, Weber, etc.
- History Optional: Specific periods, historiography, primary sources, historical methodology
- Others: Look for subject-specific terminology and concepts

**CRITICAL:** The subject identification determines:
- Evaluation criteria and expectations
- Types of examples expected
- Theoretical frameworks to reference
- Depth of specialized knowledge required
- Marking standards (Optional vs GS different expectations)

**CONFIRMED SUBJECT FOR THIS EVALUATION:** {subject_str}
**PAPER TYPE:** {gs_paper}

**STEP 1: ANALYZE QUESTION DEMANDS FIRST**
**QUESTION:** {question}

Carefully identify what this specific question is asking for:
- What are ALL the distinct aspects/demands in this question?
- How many different components need to be addressed?
- Are there multiple dimensions mentioned (economic, social, political)?
- Are there sequential aspects (causes → effects → solutions)?
- Are there different stakeholders or perspectives to discuss?

**STEP 2: CREATE QUESTION-SPECIFIC BODY SECTIONS**
Based on the question analysis, create as many body sections as needed to address every demand.
**MANDATORY FIELD REQUIREMENTS:**
The following fields must NEVER be "N/A" - always provide specific content:

- "question_category": Must identify specific UPSC category (e.g., "UPSC Optional Anthropology Question", "UPSC GS-2 Polity Question", "UPSC GS-4 Ethics Case Study")

**QUESTION CATEGORY EXAMPLES:**
- "UPSC Anthropology Optional - Cultural Evolution Question"  
- "UPSC GS-1 History Question"
- "UPSC GS-4 Ethics Case Study"
- "UPSC Sociology Optional - Social Stratification Question"

**MAX MARKS:** {marks}
**STUDENT'S ANSWER:** {answer}

**CRITICAL MARKS DISTRIBUTION RULES - MUST BE FOLLOWED EXACTLY:**
- Introduction: {distribution['introduction']} marks max (FIXED - NEVER CHANGE)
- Body: {distribution['body']} marks max (MUST be split into sections that total EXACTLY {distribution['body']})  
- Conclusion: {distribution['conclusion']} marks max (FIXED - NEVER CHANGE)
- TOTAL MUST EQUAL: {marks} marks exactly

**BODY MARKS DIVISION - MANDATORY CALCULATION:**
The {distribution['body']} body marks MUST be divided among ALL body sections you create:
- If 2 body sections: {int(distribution['body']/2)} marks each
- If 3 body sections: {int(distribution['body']/3)} marks each
- If 4+ body sections: divide {distribution['body']} evenly among all sections

**VALIDATION REQUIREMENT:**
Before creating JSON, verify: {distribution['introduction']} + [sum of all body section marks] + {distribution['conclusion']} = {marks}

**FLEXIBLE BODY SECTION CREATION:**
Create separate body sections for each distinct demand in the question.
Examples based on question demands:
- "Discuss causes, effects, and solutions" → 3 sections: Causes + Effects + Solutions
- "Analyze economic and social dimensions" → 2 sections: Economic + Social  
- "Examine role of government, civil society, and private sector" → 3 sections
- "Trace evolution, assess current status, identify challenges, suggest measures" → 4 sections

**GRADING SCALE FOR ALL SECTIONS:**
- Excellent: 60% of allocated marks
- Good: 50% of allocated marks
- Average: 35% of allocated marks  
- Poor: 25% of allocated marks

**SUBJECT-SPECIFIC EVALUATION STANDARDS:**

**IF ANTHROPOLOGY OPTIONAL:**
- Expect theoretical frameworks (structural-functionalism, cultural materialism, etc.)
- Require ethnographic examples and case studies
- Look for anthropological terminology and concepts
- Higher depth expected than GS-level treatment
- Reference to anthropological thinkers and their contributions

**IF ETHICS (GS-4 or Ethics Optional):**
- Mandatory case study analysis with stakeholder identification
- Ethical dilemma resolution with multiple perspectives
- Reference to ethical theories (Utilitarianism, Deontology, Virtue Ethics)
- Real-world application of ethical principles
- Conflict resolution and value-based decision making
- Expected case study structure: Situation → Stakeholders → Ethical Issues → Options → Recommendation
- Thinkers expected: Kant, Mill, Aristotle, Gandhi, contemporary ethicists
- Government ethics frameworks: Nolan Committee principles, RTI, whistleblower protection

**IF GENERAL STUDIES (GS-1, GS-2, GS-3):**
- Broader, interdisciplinary approach expected
- Current affairs integration mandatory
- Government policies and schemes emphasis
- Constitutional and governance focus
- Less theoretical depth, more practical application

**IF HISTORY OPTIONAL:**
- Historiographical perspectives and debates
- Primary source references
- Chronological accuracy critical
- Multiple interpretations of events
- Methodological approaches to historical analysis

**IF SOCIOLOGY OPTIONAL:**
- Sociological theories and thinkers mandatory
- Empirical data and research findings
- Social stratification and mobility analysis
- Contemporary social issues with theoretical backing
- Comparative societal analysis

**IF PUBLIC ADMINISTRATION OPTIONAL:**
- Administrative theories and models
- Governance frameworks and reforms
- Case studies of administrative challenges
- Public policy analysis and implementation
- Comparative public administration systems

**ETHICS-SPECIFIC CASE STUDY EXPECTATIONS:**
When evaluating Ethics answers with case studies:

**CASE STUDY STRUCTURE REQUIREMENTS:**
1. **Situation Analysis**: Clear problem identification
2. **Stakeholder Mapping**: All affected parties identified
3. **Ethical Issues**: Specific ethical principles at stake
4. **Options Available**: Multiple courses of action
5. **Ethical Framework Applied**: Which theory/principle used
6. **Recommendation**: Clear, justified decision
7. **Implementation**: How to execute the decision

**CASE STUDY EVALUATION CRITERIA:**
- Completeness of stakeholder analysis
- Depth of ethical reasoning
- Practical feasibility of solutions
- Integration of multiple ethical perspectives
- Real-world applicability
- Sensitivity to consequences and duties

**FEEDBACK FORMAT REQUIREMENTS:**

**FOR STRENGTHS (strengths_for_upsc):**
- Use simple, direct sentences (maximum 6-8 words each)
- Point to specific things student did correctly
Examples:
- "Defined regional disparity clearly"
- "Used relevant example of Bihar"
- "Mentioned constitutional provisions"

**FOR MISTAKES (missing_upsc_elements):**
- Start with ERROR TYPE in caps
- Follow with brief, direct explanation
- Each point maximum 8-10 words after error type
Examples:
- "FACTUAL ERROR: Regional disparity predates independence"
- "LACK OF SPECIFIC EVIDENCE: No HDI data mentioned"
- "MISSING CONTEXT: Ignored constitutional framework"

**FOR IDEAL UPSC CONTENT (ideal_upsc_content):**
- Provide EXACT sentences student should write
- Include specific keywords, data, examples
- Make it copy-paste ready for student
Examples:
"Regional disparity refers to uneven development across states. Per capita income in Goa (₹4,58,000) is 5 times higher than Bihar (₹46,000) as per 2020-21 data. Article 371 provides special provisions for northeastern states."

**MANDATORY JSON FORMAT:**
{{
  "upsc_question_analysis": {{
    "question_category": "UPSC {subject_str} - [Specific topic] Question",
    "upsc_expectations": ["Expectation 1", "Expectation 2", "Expectation 3"],
    "question_demands": ["Demand 1", "Demand 2"],
    "marks_distribution": "Introduction ({distribution['introduction']}), Body Sections (total {distribution['body']}), Conclusion ({distribution['conclusion']}) = {marks} total"
  }},
  "upsc_focused_parameters": [
    {{
      "parameter_name": "Introduction",
      "max_marks_for_parameter": {distribution['introduction']},
      "student_analysis": {{
        "what_student_wrote": "First few words ... last few words",
        "missing_upsc_elements": ["Missing element 1", "Missing element 2"],
        "strengths_for_upsc": ["Strength 1", "Strength 2"],
        "marks_allocation": {int(distribution['introduction'] * 0.35)}
      }},
      "upsc_enhancement": {{
        "ideal_upsc_content": "Concise paragraph with definition, context, thesis (30 words)"
      }}
    }},
    {{
      "parameter_name": "[Question Demand 1 - e.g., Economic Dimensions]",
      "max_marks_for_parameter": "[Portion of body marks]",
      "student_analysis": {{
        "what_student_wrote": "Extract relevant portion",
        "missing_upsc_elements": ["ERROR TYPE: Explanation"],
        "strengths_for_upsc": ["What was done well"],
        "marks_allocation": "[Calculate using grade]"
      }},
      "upsc_enhancement": {{
        "ideal_upsc_content": "Specific sentences with data and examples"
      }}
    }},
    {{
      "parameter_name": "[Question Demand 2 - e.g., Social Dimensions]",
      "max_marks_for_parameter": "[Portion of body marks]",
      "student_analysis": {{
        "what_student_wrote": "Extract relevant portion",
        "missing_upsc_elements": ["ERROR TYPE: Explanation"],
        "strengths_for_upsc": ["What was done well"],
        "marks_allocation": "[Calculate using grade]"
      }},
      "upsc_enhancement": {{
        "ideal_upsc_content": "Specific sentences with data and examples"
      }}
    }},
    {{
      "parameter_name": "Conclusion",
      "max_marks_for_parameter": {distribution['conclusion']},
      "student_analysis": {{
        "what_student_wrote": "First few words ... last few words",
        "missing_upsc_elements": ["Missing element"],
        "strengths_for_upsc": ["Strength"],
        "marks_allocation": {int(distribution['conclusion'] * 0.35)}
      }},
      "upsc_enhancement": {{
        "ideal_upsc_content": "Synthesis with forward vision (30 words)"
      }}
    }}
  ],
  "overall_upsc_assessment": {{
    "total_param_marks_awarded": "[Sum of all marks]",
    "total_param_marks_possible": {marks},
    "keywords_for_success": ["Keyword1", "Keyword2", "Keyword3", "Keyword4", "Keyword5", "Keyword6", "Keyword7", "Keyword8", "Keyword9", "Keyword10"],
    "final_upsc_advice": "Specific advice for improvement"
  }}
}}

**CRITICAL REQUIREMENTS:**
1. CREATE AS MANY BODY SECTIONS AS QUESTION DEMANDS (2, 3, 4, 5+ sections)
2. Each body section addresses specific question demand
3. All body marks must sum to {distribution['body']}
4. Never create generic "Body Analysis" - use question-specific names
5. Always provide 10-15 keywords
6. Extract actual text for "what_student_wrote"

Provide ONLY valid JSON, no other text.
"""
        return prompt
    
    def _validate_marks(self, result: Dict[str, Any], max_marks: int) -> Dict[str, Any]:
        """Validate and cap marks to maximum allowed (comprehensive format)."""
        if 'upsc_focused_parameters' in result:
            # Calculate total from parameters
            total_awarded = 0
            
            for param in result['upsc_focused_parameters']:
                max_param_marks = param.get('max_marks_for_parameter', 0)
                current_marks = param.get('student_analysis', {}).get('marks_allocation', 0)
                
                # Apply 70% cap for excellence threshold
                max_allowed = int(max_param_marks * 0.7)
                
                # Ensure marks don't exceed cap or max, then round to nearest 0.5
                raw_marks = min(current_marks, max_allowed, max_param_marks)
                validated_marks = round(raw_marks * 2) / 2  # Round to nearest 0.5
                param['student_analysis']['marks_allocation'] = validated_marks
                
                total_awarded += validated_marks
            
            # If total exceeds maximum, reduce proportionally
            if total_awarded > max_marks:
                logger.warning(f"Total {total_awarded} exceeds max {max_marks}, reducing proportionally")
                reduction_factor = max_marks / total_awarded
                total_awarded = 0
                
                for param in result['upsc_focused_parameters']:
                    current = param['student_analysis']['marks_allocation']
                    new_marks = round(current * reduction_factor * 2) / 2  # Round to nearest 0.5
                    param['student_analysis']['marks_allocation'] = new_marks
                    total_awarded += new_marks
            
            # Update overall assessment with rounded total (to nearest 0.5)
            if 'overall_upsc_assessment' in result:
                result['overall_upsc_assessment']['total_param_marks_awarded'] = round(total_awarded * 2) / 2
                result['overall_upsc_assessment']['total_param_marks_possible'] = max_marks
        
        # Validate keywords are present
        if 'overall_upsc_assessment' in result:
            overall = result['overall_upsc_assessment']
            if not overall.get('keywords_for_success') or len(overall.get('keywords_for_success', [])) == 0:
                # Provide default keywords based on subject
                overall['keywords_for_success'] = [
                    "Policy framework", "Governance", "Implementation", 
                    "Constitutional provisions", "Administrative reforms",
                    "Social justice", "Development", "Accountability",
                    "Transparency", "Public administration", "Citizen services",
                    "Digital transformation", "Sustainable development", 
                    "Inclusive growth", "Good governance"
                ]
        
        return result
    
    def _create_fallback_evaluation(self) -> Dict[str, Any]:
        """Create fallback evaluation when AI fails (comprehensive format)."""
        return {
            "upsc_question_analysis": {
                "question_category": "UPSC Question - Manual Review Required",
                "upsc_expectations": [
                    "Clear analysis with examples",
                    "Structured approach",
                    "Subject-specific terminology"
                ],
                "question_demands": ["Evaluation failed - manual review needed"],
                "marks_distribution": "Unable to process - manual evaluation required"
            },
            "upsc_focused_parameters": [
                {
                    "parameter_name": "Overall Assessment",
                    "max_marks_for_parameter": 10,
                    "student_analysis": {
                        "what_student_wrote": "Evaluation service encountered error",
                        "missing_upsc_elements": ["System error prevented evaluation"],
                        "strengths_for_upsc": ["Requires manual review"],
                        "marks_allocation": 0
                    },
                    "upsc_enhancement": {
                        "ideal_upsc_content": "Manual evaluation required"
                    }
                }
            ],
            "overall_upsc_assessment": {
                "total_param_marks_awarded": 0,
                "total_param_marks_possible": 10,
                "keywords_for_success": [
                    "Analysis", "Examples", "Structure", "Evidence",
                    "Context", "Framework", "Implementation", "Policy",
                    "Development", "Governance"
                ],
                "final_upsc_advice": "System error - manual evaluation required."
            }
        }


# Singleton instance
_async_evaluation_service = None


def get_async_evaluation_service() -> AsyncEvaluationService:
    """Get async evaluation service instance."""
    global _async_evaluation_service
    if _async_evaluation_service is None:
        _async_evaluation_service = AsyncEvaluationService()
    return _async_evaluation_service
