import {
  getQuestionScores,
  getScoreBand,
  getParameters,
  getRadarData
} from "./evaluationMetrics";

function countByLabel(items, getLabel) {
  const map = new Map();
  items.forEach((item) => {
    const label = getLabel(item);
    if (!label) return;
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function computePaperStats(questions) {
  const valid = questions.filter((q) => !q.error);
  let totalAwarded = 0;
  let totalPossible = 0;
  let totalStrengths = 0;
  let totalGaps = 0;
  let totalParameters = 0;

  valid.forEach((q) => {
    const s = getQuestionScores(q);
    totalAwarded += s.awarded;
    totalPossible += s.possible;
    getParameters(q).forEach((p) => {
      totalParameters += 1;
      const analysis = p?.student_analysis || {};
      totalStrengths += analysis.strengths_for_upsc?.length ?? 0;
      totalGaps += analysis.missing_upsc_elements?.length ?? 0;
    });
  });

  const percent = totalPossible > 0 ? Math.round((totalAwarded / totalPossible) * 100) : 0;

  return {
    questionCount: questions.length,
    evaluatedCount: valid.length,
    errorCount: questions.length - valid.length,
    totalAwarded,
    totalPossible,
    percent,
    band: getScoreBand(percent),
    totalStrengths,
    totalGaps,
    totalParameters
  };
}

export function compareQuestionNumbers(a, b) {
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  const parse = (s) => {
    const match = s.match(/^(\d+)(.*)$/i);
    if (!match) return { num: NaN, suffix: s.toLowerCase() };
    return { num: parseInt(match[1], 10), suffix: (match[2] || "").toLowerCase() };
  };
  const pa = parse(sa);
  const pb = parse(sb);
  if (!Number.isNaN(pa.num) && !Number.isNaN(pb.num)) {
    if (pa.num !== pb.num) return pa.num - pb.num;
    return pa.suffix.localeCompare(pb.suffix);
  }
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

export function sortQuestionsByNumber(questions) {
  return [...questions].sort((a, b) =>
    compareQuestionNumbers(a.question_number, b.question_number)
  );
}

export function getQuestionBarChartData(questions) {
  return questions
    .map((q) => {
      const s = getQuestionScores(q);
      return {
        label: `Q${s.questionNumber}`,
        questionNumber: s.questionNumber,
        value: s.awarded,
        max: s.possible,
        percent: s.percent,
        band: q.error ? "error" : getScoreBand(s.percent),
        hasError: !!q.error
      };
    })
    .sort((a, b) => compareQuestionNumbers(a.questionNumber, b.questionNumber));
}

export function getParameterHeatmapData(questions) {
  const valid = questions.filter((q) => !q.error);
  const paramNames = new Set();
  valid.forEach((q) => {
    getRadarData(q).forEach((r) => paramNames.add(r.name));
  });

  const rows = sortHeatmapParameterRows([...paramNames]);
  const columns = valid.map((q) => {
    const s = getQuestionScores(q);
    const byName = Object.fromEntries(getRadarData(q).map((r) => [r.name, r]));
    return {
      questionNumber: s.questionNumber,
      label: `Q${s.questionNumber}`,
      cells: rows.map((name) => {
        const cell = byName[name];
        if (!cell) return { name, awarded: null, possible: null, percent: null };
        return { name, awarded: cell.awarded, possible: cell.possible, percent: cell.percent };
      })
    };
  });

  columns.sort((a, b) => compareQuestionNumbers(a.questionNumber, b.questionNumber));

  return { rows, columns };
}

const HEATMAP_PARAM_PRIORITY = [
  "Introduction",
  "Body",
  "Conclusion",
  "Structure",
  "Overall Assessment",
  "Examples",
  "Analysis",
  "Relevance",
  "Balance"
];

function sortHeatmapParameterRows(rows) {
  const priorityIndex = (name) => {
    const idx = HEATMAP_PARAM_PRIORITY.findIndex(
      (key) => name === key || name.toLowerCase().includes(key.toLowerCase())
    );
    return idx === -1 ? 999 : idx;
  };
  return rows.sort((a, b) => {
    const diff = priorityIndex(a) - priorityIndex(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

export function shortenParameterLabel(name, maxLength = 42) {
  if (!name || name.length <= maxLength) return name;
  return `${name.slice(0, maxLength - 1)}…`;
}

export function getParameterAverageBars(questions) {
  const totals = new Map();

  questions
    .filter((q) => !q.error)
    .forEach((q) => {
      getRadarData(q).forEach((r) => {
        const prev = totals.get(r.name) || { awarded: 0, possible: 0, count: 0 };
        totals.set(r.name, {
          awarded: prev.awarded + r.awarded,
          possible: prev.possible + r.possible,
          count: prev.count + 1
        });
      });
    });

  return [...totals.entries()]
    .map(([label, t]) => ({
      label,
      value: t.count > 0 ? Math.round((t.awarded / t.count) * 10) / 10 : 0,
      max: t.count > 0 ? Math.round((t.possible / t.count) * 10) / 10 : 0,
      percent: t.possible > 0 ? Math.round((t.awarded / t.possible) * 100) : 0,
      count: t.count
    }))
    .sort((a, b) => a.percent - b.percent);
}

export function collectGapFrequency(questions) {
  const items = [];
  questions
    .filter((q) => !q.error)
    .forEach((q) => {
      getParameters(q).forEach((p) => {
        const gaps = p?.student_analysis?.missing_upsc_elements || [];
        gaps.forEach((text) => items.push({ text, questionNumber: q.question_number }));
      });
    });
  return countByLabel(items, (i) => i.text);
}

export function collectStrengthFrequency(questions) {
  const items = [];
  questions
    .filter((q) => !q.error)
    .forEach((q) => {
      getParameters(q).forEach((p) => {
        const list = p?.student_analysis?.strengths_for_upsc || [];
        list.forEach((text) => items.push({ text, questionNumber: q.question_number }));
      });
    });
  return countByLabel(items, (i) => i.text);
}

export function collectKeywordFrequency(questions) {
  const items = [];
  questions
    .filter((q) => !q.error)
    .forEach((q) => {
      const keywords = q.evaluation?.overall_upsc_assessment?.keywords_for_success || [];
      keywords.forEach((text) => items.push({ text, questionNumber: q.question_number }));
    });
  return countByLabel(items, (i) => i.text);
}

export function collectKeywordsByQuestion(questions) {
  return questions
    .filter((q) => !q.error)
    .map((q) => {
      const keywords = (q.evaluation?.overall_upsc_assessment?.keywords_for_success || []).filter(Boolean);
      const uniqueKeywords = [...new Set(keywords)];

      return {
        questionNumber: q.question_number,
        keywords: uniqueKeywords.sort((a, b) => a.localeCompare(b)),
        count: uniqueKeywords.length
      };
    });
}

export function getExpectationsStats(item) {
  const expectations = item.evaluation?.upsc_question_analysis?.upsc_expectations || [];
  const paramCount = getParameters(item).length;
  const gapCount = getParameters(item).reduce(
    (n, p) => n + (p?.student_analysis?.missing_upsc_elements?.length ?? 0),
    0
  );
  const strengthCount = getParameters(item).reduce(
    (n, p) => n + (p?.student_analysis?.strengths_for_upsc?.length ?? 0),
    0
  );

  return {
    expectationsCount: expectations.length,
    parameterCount: paramCount,
    gapCount,
    strengthCount
  };
}
