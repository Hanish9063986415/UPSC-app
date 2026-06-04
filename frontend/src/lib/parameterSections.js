import { getScoreBand } from "./evaluationMetrics";

export function classifyParameterSection(label) {
  const normalized = (label || "").trim().toLowerCase();
  if (normalized.includes("introduction")) return "introduction";
  if (normalized.includes("conclusion")) return "conclusion";
  return "body";
}

export function groupParameterRows(rows) {
  const groups = { introduction: [], body: [], conclusion: [] };
  (rows || []).forEach((row) => {
    groups[classifyParameterSection(row.label)].push(row);
  });
  return groups;
}

export function groupParameters(parameters) {
  const groups = { introduction: [], body: [], conclusion: [] };
  (parameters || []).forEach((param) => {
    groups[classifyParameterSection(param?.parameter_name)].push(param);
  });
  return groups;
}

export function aggregateParameterRows(rows, displayLabel) {
  if (!rows?.length) return null;

  const value = rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
  const max = rows.reduce((sum, row) => sum + Number(row.max ?? 0), 0);
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return {
    label: displayLabel,
    value,
    max,
    percent,
    band: getScoreBand(percent),
    topicCount: rows.length
  };
}

/** Ordered sections for display: Introduction → Body → Conclusion */
export function buildParameterMarkSections(rows) {
  const groups = groupParameterRows(rows);
  const sections = [];

  if (groups.introduction.length) {
    sections.push({
      key: "introduction",
      ...aggregateParameterRows(groups.introduction, "Introduction"),
      topics: groups.introduction
    });
  }

  if (groups.body.length) {
    sections.push({
      key: "body",
      ...aggregateParameterRows(groups.body, "Body"),
      topics: groups.body
    });
  }

  if (groups.conclusion.length) {
    sections.push({
      key: "conclusion",
      ...aggregateParameterRows(groups.conclusion, "Conclusion"),
      topics: groups.conclusion
    });
  }

  return sections;
}

/** Group raw parameter names into Introduction / Body / Conclusion for heatmap rows */
export function buildHeatmapSections(rowNames) {
  const groups = { introduction: [], body: [], conclusion: [] };
  (rowNames || []).forEach((name) => {
    groups[classifyParameterSection(name)].push(name);
  });

  const sections = [];
  if (groups.introduction.length) {
    sections.push({ key: "introduction", label: "Introduction", topics: groups.introduction });
  }
  if (groups.body.length) {
    sections.push({ key: "body", label: "Body", topics: groups.body });
  }
  if (groups.conclusion.length) {
    sections.push({ key: "conclusion", label: "Conclusion", topics: groups.conclusion });
  }
  return sections;
}

/** Merge heatmap cells across topic names for one question column */
export function aggregateHeatmapCells(cells, topicNames) {
  const matched = (cells || []).filter((c) => topicNames.includes(c.name));
  if (!matched.length) return null;

  const withScores = matched.filter(
    (c) => c.percent != null && c.possible != null && Number(c.possible) > 0
  );

  if (!withScores.length) {
    return { name: topicNames[0], awarded: null, possible: null, percent: null };
  }

  const awarded = withScores.reduce((sum, c) => sum + Number(c.awarded ?? 0), 0);
  const possible = withScores.reduce((sum, c) => sum + Number(c.possible ?? 0), 0);
  if (possible <= 0) {
    return { name: topicNames[0], awarded: null, possible: null, percent: null };
  }

  return {
    name: topicNames[0],
    awarded,
    possible,
    percent: Math.round((awarded / possible) * 100)
  };
}
