import {
  computePaperStats,
  getParameterHeatmapData,
  getQuestionBarChartData,
  sortQuestionsByNumber
} from "./paperAnalytics";
import { getQuestionScores, getScoreBand } from "./evaluationMetrics";
import { groupParameters } from "./parameterSections";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeFilename(name) {
  return (name || "analysis")
    .replace(/\.pdf$/i, "")
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function richTextToHtml(text) {
  const escaped = escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/).filter(Boolean);
      if (lines.every((line) => /^[-•*]\s+/.test(line))) {
        const items = lines.map((line) => `<li>${line.replace(/^[-•*]\s+/, "")}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

function bandColor(band) {
  if (band === "high") return "#059669";
  if (band === "mid") return "#d97706";
  return "#dc2626";
}

function scoreRingSvg(percent, band, label, sublabel) {
  const color = bandColor(band);
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return `
    <div class="score-ring" role="img" aria-label="${escapeHtml(label)} ${percent}%">
      <svg viewBox="0 0 128 128" width="156" height="156">
        <circle cx="64" cy="64" r="${r}" fill="none" stroke="#e8eaef" stroke-width="12"/>
        <circle cx="64" cy="64" r="${r}" fill="none" stroke="${color}" stroke-width="12"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
          transform="rotate(-90 64 64)"/>
        <text x="64" y="58" text-anchor="middle" class="ring-pct">${percent}%</text>
        <text x="64" y="78" text-anchor="middle" class="ring-sub">${escapeHtml(sublabel)}</text>
      </svg>
      <span class="ring-label">${escapeHtml(label)}</span>
    </div>`;
}

function renderHeatmap(heatmap) {
  if (!heatmap?.rows?.length || !heatmap?.columns?.length) {
    return `<p class="muted">No parameter heatmap data.</p>`;
  }
  const head = heatmap.columns
    .map((col) => `<th>${escapeHtml(col.label)}</th>`)
    .join("");
  const body = heatmap.rows
    .map((rowName) => {
      const cells = heatmap.columns
        .map((col) => {
          const cell = col.cells.find((c) => c.name === rowName);
          if (!cell || cell.percent == null) {
            return `<td class="heat-cell empty">—</td>`;
          }
          const band = getScoreBand(cell.percent);
          return `<td class="heat-cell band-${band}" title="${cell.awarded}/${cell.possible}">
            <span>${cell.percent}%</span>
            <small>${cell.awarded}/${cell.possible}</small>
          </td>`;
        })
        .join("");
      return `<tr><th class="heat-row">${escapeHtml(rowName)}</th>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="heat-table"><thead><tr><th>Parameter</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderParameterCard(param) {
  const analysis = param?.student_analysis || {};
  const enhancement = param?.upsc_enhancement || {};
  const awarded = analysis.marks_allocation ?? 0;
  const possible = param?.max_marks_for_parameter ?? 0;
  const percent = possible > 0 ? Math.round((awarded / possible) * 100) : 0;
  const band = getScoreBand(percent);

  const blocks = [];
  if (analysis.what_student_wrote) {
    blocks.push(`<div class="param-block"><h5>What you wrote</h5>${richTextToHtml(analysis.what_student_wrote)}</div>`);
  }
  if (analysis.strengths_for_upsc?.length) {
    blocks.push(
      `<div class="param-block good"><h5>Strengths</h5><ul>${analysis.strengths_for_upsc
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("")}</ul></div>`
    );
  }
  if (analysis.missing_upsc_elements?.length) {
    blocks.push(
      `<div class="param-block warn"><h5>Missing elements</h5><ul>${analysis.missing_upsc_elements
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("")}</ul></div>`
    );
  }
  if (enhancement.ideal_upsc_content) {
    blocks.push(
      `<div class="param-block"><h5>Ideal UPSC content</h5>${richTextToHtml(enhancement.ideal_upsc_content)}</div>`
    );
  }

  return `
    <article class="param-card band-${band}">
      <header class="param-card-head">
        <h4>${escapeHtml(param?.parameter_name || "Parameter")}</h4>
        <span class="marks-pill">${awarded} / ${possible} · ${percent}%</span>
      </header>
      ${blocks.join("")}
    </article>`;
}

function renderQuestionSection(item) {
  if (item.error) {
    return `
      <section class="question-card error" id="question-${escapeHtml(item.question_number)}">
        <h3>Question ${escapeHtml(item.question_number)}</h3>
        <p class="error-text">${escapeHtml(item.error)}</p>
      </section>`;
  }

  const evaluation = item.evaluation || {};
  const overall = evaluation.overall_upsc_assessment || {};
  const analysis = evaluation.upsc_question_analysis || {};
  const scores = getQuestionScores(item);
  const band = getScoreBand(scores.percent);
  const modelText =
    item.model_answer?.model_answer?.full_text || item.model_answer?.full_text || "";

  const paramGroups = groupParameters(evaluation.upsc_focused_parameters || []);
  const sectionOrder = [
    { label: "Introduction", items: paramGroups.introduction },
    { label: "Body", items: paramGroups.body },
    { label: "Conclusion", items: paramGroups.conclusion }
  ];

  const paramHtml = sectionOrder
    .filter((s) => s.items.length)
    .map(
      (s) => `
      <div class="param-section">
        <h4 class="section-label">${escapeHtml(s.label)}</h4>
        ${s.items.map((p) => renderParameterCard(p)).join("")}
      </div>`
    )
    .join("");

  return `
    <section class="question-card band-${band}" id="question-${escapeHtml(item.question_number)}">
      <header class="question-head">
        <div>
          <h3>Question ${escapeHtml(item.question_number)}</h3>
          <p class="score-line">${scores.awarded} / ${scores.possible} marks · <strong>${scores.percent}%</strong></p>
        </div>
        <span class="band-badge band-${band}">${band === "high" ? "Strong" : band === "mid" ? "Moderate" : "Needs work"}</span>
      </header>
      ${item.question ? `<div class="sub-card"><h4>Question</h4>${richTextToHtml(item.question)}</div>` : ""}
      ${
        analysis.upsc_expectations?.length
          ? `<div class="sub-card"><h4>UPSC expectations</h4><ul>${analysis.upsc_expectations
              .map((e) => `<li>${escapeHtml(e)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      ${
        evaluation.student_answer
          ? `<div class="sub-card answer"><h4>Your answer (extracted)</h4>${richTextToHtml(evaluation.student_answer)}</div>`
          : ""
      }
      ${paramHtml ? `<div class="param-wrap"><h4>Parameter-wise analysis</h4>${paramHtml}</div>` : ""}
      ${overall.final_upsc_advice ? `<div class="sub-card advice"><h4>Final advice</h4>${richTextToHtml(overall.final_upsc_advice)}</div>` : ""}
      ${
        overall.keywords_for_success?.length
          ? `<div class="keywords"><strong>Keywords for success:</strong> ${escapeHtml(overall.keywords_for_success.join(" · "))}</div>`
          : ""
      }
      ${modelText ? `<div class="sub-card model"><h4>Model answer</h4>${richTextToHtml(modelText)}</div>` : ""}
    </section>`;
}

const REPORT_STYLES = `
:root {
  --accent: #f39200;
  --blue-deep: #122a5b;
  --bg: #f4f6fb;
  --card: #ffffff;
  --border: #e8eaef;
  --text: #1a1c22;
  --muted: #6b7280;
  --low: #dc2626;
  --mid: #d97706;
  --high: #059669;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 960px; margin: 0 auto; padding: 28px 20px 48px; }
.hero {
  background: linear-gradient(135deg, #122a5b 0%, #1f376d 55%, #f39200 140%);
  color: #fff;
  padding: 28px 24px;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 12px 40px rgba(18, 42, 91, 0.18);
}
.hero h1 { margin: 0 0 8px; font-size: 1.65rem; }
.hero .meta { opacity: 0.9; font-size: 0.9rem; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px 20px;
  margin-bottom: 18px;
  box-shadow: 0 8px 28px rgba(18, 42, 91, 0.06);
}
.card h2 { margin: 0 0 14px; color: var(--blue-deep); font-size: 1.2rem; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.summary-grid div {
  background: #f8f9fc;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.summary-grid strong { display: block; font-size: 0.72rem; text-transform: uppercase; color: var(--muted); }
.summary-grid span { font-size: 1.15rem; font-weight: 700; color: var(--blue-deep); }
.summary-body { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; }
.score-ring { text-align: center; }
.score-ring .ring-pct { font-size: 22px; font-weight: 800; fill: var(--blue-deep); }
.score-ring .ring-sub { font-size: 11px; fill: var(--muted); }
.score-ring .ring-label { display: block; margin-top: 6px; font-weight: 600; color: var(--blue-deep); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
th, td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; }
thead th { background: var(--blue-deep); color: #fff; }
.overview-table tbody tr:nth-child(even) { background: #f8f9fc; }
.heat-table .heat-row { font-weight: 600; background: #fafbfd; min-width: 140px; }
.heat-cell { text-align: center; min-width: 72px; }
.heat-cell small { display: block; color: var(--muted); font-size: 0.72rem; }
.heat-cell.band-high { background: rgba(5, 150, 105, 0.12); }
.heat-cell.band-mid { background: rgba(217, 119, 6, 0.12); }
.heat-cell.band-low { background: rgba(220, 38, 38, 0.1); }
.heat-cell.empty { color: var(--muted); }
.question-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px 18px;
  margin-bottom: 20px;
  box-shadow: 0 6px 22px rgba(18, 42, 91, 0.05);
  border-left: 4px solid var(--accent);
}
.question-card.band-high { border-left-color: var(--high); }
.question-card.band-mid { border-left-color: var(--mid); }
.question-card.band-low { border-left-color: var(--low); }
.question-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
.question-head h3 { margin: 0; color: var(--blue-deep); }
.score-line { margin: 4px 0 0; color: var(--muted); }
.band-badge { font-size: 0.75rem; font-weight: 700; padding: 6px 10px; border-radius: 999px; background: #f0f1f3; }
.band-badge.band-high { background: rgba(5,150,105,.12); color: var(--high); }
.band-badge.band-mid { background: rgba(217,119,6,.14); color: var(--mid); }
.band-badge.band-low { background: rgba(220,38,38,.1); color: var(--low); }
.sub-card {
  background: #fafbfd;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 14px;
  margin: 12px 0;
}
.sub-card h4 { margin: 0 0 8px; font-size: 0.95rem; color: var(--blue-deep); }
.sub-card.model { border-color: rgba(243, 146, 0, 0.35); background: #fffaf3; }
.param-wrap h4 { margin: 16px 0 8px; color: var(--blue-deep); }
.section-label {
  margin: 14px 0 8px;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
  color: var(--blue-deep);
}
.param-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: #fff;
}
.param-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 8px; }
.param-card-head h4 { margin: 0; font-size: 0.92rem; }
.marks-pill { font-size: 0.8rem; font-weight: 700; color: var(--blue-deep); background: #f0f4ff; padding: 4px 8px; border-radius: 999px; }
.param-block { margin-top: 8px; font-size: 0.9rem; }
.param-block h5 { margin: 0 0 4px; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); }
.param-block.good h5 { color: var(--high); }
.param-block.warn h5 { color: var(--low); }
.keywords { margin-top: 12px; font-size: 0.9rem; color: var(--muted); }
.muted { color: var(--muted); font-size: 0.9rem; }
ul { margin: 6px 0; padding-left: 1.2rem; }
p { margin: 6px 0; }
.error-text { color: var(--low); }
.footer-note { text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 28px; }
@media print {
  body { background: #fff; }
  .wrap { max-width: none; padding: 0; }
  .card, .question-card { break-inside: avoid; box-shadow: none; }
}
`;

export function buildAnalysisHtml({ questions, summary, sourceFileName }) {
  if (!questions?.length) {
    throw new Error("No evaluation results to export.");
  }

  const sorted = sortQuestionsByNumber(questions);
  const stats = computePaperStats(questions);
  const heatmap = getParameterHeatmapData(questions);
  const barData = getQuestionBarChartData(questions);
  const meta = summary?.complete_package?.metadata || {};
  const obtained = meta.total_ai_magic_marks ?? meta.total_param_marks ?? stats.totalAwarded;
  const maxMarks = meta.total_max_marks ?? stats.totalPossible;
  const percent = maxMarks > 0 ? Math.round((obtained / maxMarks) * 100) : stats.percent;
  const band = stats.band ?? getScoreBand(percent);
  const generatedAt = new Date().toLocaleString();

  const overviewRows = barData
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${row.value}/${row.max}</td><td>${row.hasError ? "Error" : `${row.percent}%`}</td></tr>`
    )
    .join("");

  const questionsHtml = sorted.map((q) => renderQuestionSection(q)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Instamark · UPSC Evaluation Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>UPSC Answer Evaluation Report</h1>
      <p class="meta">Instamark · YantraIAS · Generated ${escapeHtml(generatedAt)}</p>
      ${sourceFileName ? `<p class="meta">Source: ${escapeHtml(sourceFileName)}</p>` : ""}
    </header>

    <section class="card">
      <h2>Final summary</h2>
      <div class="summary-body">
        ${scoreRingSvg(percent, band, "Paper score", `${obtained}/${maxMarks}`)}
        <div class="summary-grid">
          <div><strong>Questions</strong><span>${summary?.total_questions ?? meta.total_questions ?? questions.length}</span></div>
          <div><strong>Duration</strong><span>${summary?.total_duration ?? meta.total_duration_seconds ?? 0}s</span></div>
          <div><strong>Marks obtained</strong><span>${obtained}</span></div>
          <div><strong>Max marks</strong><span>${maxMarks}</span></div>
          <div><strong>Strengths</strong><span>${stats.totalStrengths}</span></div>
          <div><strong>Gaps flagged</strong><span>${stats.totalGaps}</span></div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Questions overview</h2>
      <div class="table-wrap">
        <table class="overview-table">
          <thead><tr><th>Question</th><th>Marks</th><th>Percentage</th></tr></thead>
          <tbody>${overviewRows}</tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Parameter heatmap</h2>
      <p class="muted">Performance by parameter across questions (same data as on-screen heatmap).</p>
      ${renderHeatmap(heatmap)}
    </section>

    <section class="card">
      <h2>Question-wise analysis</h2>
      ${questionsHtml}
    </section>

    <p class="footer-note">© YantraIAS · Instamark · Open this file in any browser · Print to PDF for a styled document</p>
  </div>
</body>
</html>`;
}

export function downloadAnalysisHtml({ questions, summary, sourceFileName }) {
  const html = buildAnalysisHtml({ questions, summary, sourceFileName });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = sanitizeFilename(sourceFileName);
  const filename = `upsc-analysis-${base}-${stamp}.html`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
