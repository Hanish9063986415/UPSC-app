/** Rebuild live SSE-style question items from a stored complete_package (server/DB). */

function packagedEvalToRaw(entry) {
  if (!entry) return {};
  const sections = entry.evaluation_sections || [];
  return {
    upsc_question_analysis: {
      upsc_expectations: entry.question_analysis?.upsc_expectations || [],
      question_category: entry.question_analysis?.question_category,
      marks_distribution: entry.question_analysis?.marks_distribution
    },
    upsc_focused_parameters: sections.map((section) => ({
      parameter_name: section.section_name,
      max_marks_for_parameter: section.max_marks,
      student_analysis: {
        marks_allocation: section.awarded_marks,
        what_student_wrote: section.what_student_wrote,
        strengths_for_upsc: section.strengths || [],
        missing_upsc_elements: (section.mistakes || []).map((m) =>
          typeof m === "string" ? m : m.description || m.error_type || ""
        )
      },
      upsc_enhancement: {
        ideal_upsc_content: section.ideal_content
      }
    })),
    overall_upsc_assessment: {
      final_upsc_advice: entry.final_advice,
      keywords_for_success: entry.keywords_for_success || []
    },
    student_answer: entry.student_answer
  };
}

export function questionItemsFromCompletePackage(completePackage) {
  const bag = completePackage?.questions;
  if (!bag || typeof bag !== "object") return [];

  const numbers = new Set();
  Object.keys(bag).forEach((key) => {
    const match = key.match(/^(.+)\._(evaluation|model_answer)$/);
    if (match) numbers.add(match[1]);
  });

  return [...numbers]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    .map((qNum) => {
      const evalEntry = bag[`${qNum}._evaluation`];
      const modelEntry = bag[`${qNum}._model_answer`];
      const meta = evalEntry?.question_metadata || {};
      return {
        question_number: qNum,
        question: meta.question_text,
        marks: meta.max_marks,
        evaluation: packagedEvalToRaw(evalEntry),
        model_answer: modelEntry
      };
    });
}

export function summaryFromCompletePackage(completePackage, extras = {}) {
  const meta = completePackage?.metadata || {};
  return {
    total_questions: meta.total_questions,
    total_duration: meta.total_duration_seconds ?? extras.total_duration,
    total_tokens: meta.total_tokens ?? extras.total_tokens,
    complete_package: completePackage,
    ...extras
  };
}
