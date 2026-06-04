export function getQuestionEvaluation(item) {
  if (item?.error) return null;
  return item?.evaluation || {};
}

export function getQuestionScores(item) {
  if (item?.error) {
    return {
      questionNumber: item.question_number,
      awarded: 0,
      possible: item.marks ?? 0,
      percent: 0,
      hasError: true
    };
  }

  const evaluation = getQuestionEvaluation(item);
  const overall = evaluation.overall_upsc_assessment || {};
  const awarded = overall.total_param_marks_awarded ?? 0;
  const possible = overall.total_param_marks_possible ?? item.marks ?? 0;
  const percent = possible > 0 ? Math.round((awarded / possible) * 100) : 0;

  return {
    questionNumber: item.question_number,
    awarded,
    possible,
    percent,
    hasError: false
  };
}

export function getScoreBand(percent) {
  if (percent < 40) return "low";
  if (percent < 70) return "mid";
  return "high";
}

export function getParameters(item) {
  const evaluation = getQuestionEvaluation(item);
  if (!evaluation) return [];
  return evaluation.upsc_focused_parameters || [];
}

export function getRadarData(item) {
  return getParameters(item).map((param) => {
    const analysis = param?.student_analysis || {};
    const awarded = Number(analysis.marks_allocation ?? 0);
    const possible = Number(param?.max_marks_for_parameter ?? 0);
    return {
      name: param?.parameter_name || "Parameter",
      awarded,
      possible,
      percent: possible > 0 ? Math.round((awarded / possible) * 100) : 0
    };
  });
}
