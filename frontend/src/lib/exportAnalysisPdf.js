import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  computePaperStats,
  getQuestionBarChartData,
  collectGapFrequency,
  collectStrengthFrequency,
  collectKeywordFrequency,
  compareQuestionNumbers
} from "./paperAnalytics";
import { getQuestionScores, getParameters } from "./evaluationMetrics";
import { groupParameters } from "./parameterSections";

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 5;
const ACCENT = [243, 146, 0];
const NAVY = [30, 58, 138];
const MUTED = [100, 116, 139];

function plainText(text) {
  return String(text ?? "").replace(/\*\*([^*]+)\*\*/g, "$1");
}

function sanitizeFilename(name) {
  return (name || "analysis")
    .replace(/\.pdf$/i, "")
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function sortQuestions(questions) {
  return [...questions].sort((a, b) =>
    compareQuestionNumbers(a.question_number, b.question_number)
  );
}

function createWriter(doc) {
  let y = MARGIN;

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const ensureSpace = (height) => {
    if (y + height > PAGE_H - 18) {
      newPage();
    }
  };

  const footer = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "normal");
      doc.text("Instamark · UPSC Answer Evaluation Report", MARGIN, PAGE_H - 8);
      doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    }
  };

  const titleBlock = (text, size = 14) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(...NAVY);
    doc.text(text, MARGIN, y);
    y += size * 0.45 + 4;
  };

  const sectionTitle = (text) => {
    ensureSpace(14);
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y - 4, 3, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(text, MARGIN + 6, y + 2);
    y += 10;
  };

  const subTitle = (text) => {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(text, MARGIN, y);
    y += 6;
  };

  const paragraph = (text, indent = 0) => {
    const body = plainText(text);
    if (!body) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(body, CONTENT_W - indent);
    const blockH = lines.length * LINE_H + 3;
    ensureSpace(blockH);
    doc.text(lines, MARGIN + indent, y);
    y += blockH;
  };

  const bulletList = (items, indent = 0) => {
    if (!items?.length) return;
    items.forEach((item) => {
      const body = plainText(item);
      if (!body) return;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(`• ${body}`, CONTENT_W - indent - 4);
      const blockH = lines.length * LINE_H + 2;
      ensureSpace(blockH);
      doc.text(lines, MARGIN + indent, y);
      y += blockH;
    });
    y += 2;
  };

  const spacer = (mm = 4) => {
    y += mm;
  };

  return { doc, y: () => y, setY: (v) => {
    y = v;
  }, newPage, ensureSpace, footer, titleBlock, sectionTitle, subTitle, paragraph, bulletList, spacer };
}

function addParameterBlock(w, param) {
  const analysis = param?.student_analysis || {};
  const enhancement = param?.upsc_enhancement || {};
  const awarded = analysis.marks_allocation ?? 0;
  const possible = param?.max_marks_for_parameter ?? 0;
  const percent = possible > 0 ? Math.round((awarded / possible) * 100) : 0;

  w.subTitle(`${param?.parameter_name || "Parameter"} — ${awarded}/${possible} (${percent}%)`);

  if (analysis.what_student_wrote) {
    w.subTitle("What you wrote");
    w.paragraph(analysis.what_student_wrote, 2);
  }
  if (analysis.strengths_for_upsc?.length) {
    w.subTitle("Strengths");
    w.bulletList(analysis.strengths_for_upsc, 2);
  }
  if (analysis.missing_upsc_elements?.length) {
    w.subTitle("Missing elements");
    w.bulletList(analysis.missing_upsc_elements, 2);
  }
  if (enhancement.ideal_upsc_content) {
    w.subTitle("Ideal UPSC content");
    w.paragraph(enhancement.ideal_upsc_content, 2);
  }
  w.spacer(2);
}

function addQuestionSection(w, item) {
  const qNum = item.question_number;
  w.sectionTitle(`Question ${qNum}`);

  if (item.error) {
    w.paragraph(`Error: ${item.error}`);
    w.spacer(4);
    return;
  }

  const scores = getQuestionScores(item);
  const evaluation = item.evaluation || {};
  const overall = evaluation.overall_upsc_assessment || {};
  const analysis = evaluation.upsc_question_analysis || {};
  const modelText =
    item.model_answer?.model_answer?.full_text || item.model_answer?.full_text || "";

  w.paragraph(`Score: ${scores.awarded} / ${scores.possible} marks (${scores.percent}%)`);
  w.spacer(2);

  if (item.question) {
    w.subTitle("Question");
    w.paragraph(item.question);
  }

  if (analysis.upsc_expectations?.length) {
    w.subTitle("UPSC expectations");
    w.bulletList(analysis.upsc_expectations);
  }

  if (evaluation.student_answer) {
    w.subTitle("Your answer (extracted)");
    w.paragraph(evaluation.student_answer);
  }

  const parameters = evaluation.upsc_focused_parameters || [];
  if (parameters.length) {
    w.subTitle("Parameter-wise analysis");
    const groups = groupParameters(parameters);

    const sectionOrder = [
      { key: "introduction", label: "Introduction", items: groups.introduction },
      { key: "body", label: "Body", items: groups.body },
      { key: "conclusion", label: "Conclusion", items: groups.conclusion }
    ];

    sectionOrder.forEach(({ label, items }) => {
      if (!items.length) return;
      w.subTitle(label);
      items.forEach((param) => addParameterBlock(w, param));
    });
  }

  if (overall.final_upsc_advice) {
    w.subTitle("Final advice");
    w.paragraph(overall.final_upsc_advice);
  }

  if (overall.keywords_for_success?.length) {
    w.subTitle("Keywords for success");
    w.paragraph(overall.keywords_for_success.join(" · "));
  }

  if (modelText) {
    w.subTitle("Model answer");
    w.paragraph(modelText);
  }

  w.spacer(6);
}

function addFrequencyList(w, title, items, limit = 12) {
  if (!items?.length) return;
  w.subTitle(title);
  items.slice(0, limit).forEach((row, idx) => {
    w.paragraph(`${idx + 1}. ${row.label} (${row.count}×)`);
  });
  w.spacer(2);
}

export function buildAnalysisPdf({ questions, summary, sourceFileName }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = createWriter(doc);
  const sorted = sortQuestions(questions);
  const stats = computePaperStats(questions);
  const meta = summary?.complete_package?.metadata || {};
  const obtained = meta.total_ai_magic_marks ?? meta.total_param_marks ?? stats.totalAwarded;
  const maxMarks = meta.total_max_marks ?? stats.totalPossible;
  const percent = maxMarks > 0 ? Math.round((obtained / maxMarks) * 100) : stats.percent;
  const generatedAt = new Date().toLocaleString();

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, PAGE_W, 42, "F");
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, PAGE_W, 4, "F");

  w.titleBlock("UPSC Answer Evaluation Report", 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Instamark · Complete analysis export", MARGIN, w.y());
  w.setY(w.y() + 6);
  if (sourceFileName) {
    doc.text(`Source: ${sourceFileName}`, MARGIN, w.y());
    w.setY(w.y() + 5);
  }
  doc.text(`Generated: ${generatedAt}`, MARGIN, w.y());
  w.setY(w.y() + 10);

  w.sectionTitle("Paper overview");
  w.paragraph(
    `Overall score: ${obtained} / ${maxMarks} marks (${percent}%). ` +
      `Questions evaluated: ${stats.evaluatedCount}${stats.errorCount ? ` (${stats.errorCount} errors)` : ""}. ` +
      `Strengths noted: ${stats.totalStrengths}. Gaps flagged: ${stats.totalGaps}.`
  );
  if (summary?.total_duration ?? meta.total_duration_seconds) {
    w.paragraph(`Evaluation duration: ${summary?.total_duration ?? meta.total_duration_seconds}s`);
  }
  w.spacer(4);

  const barData = getQuestionBarChartData(questions);
  autoTable(doc, {
    startY: w.y(),
    margin: { left: MARGIN, right: MARGIN },
    head: [["Question", "Marks", "Percentage"]],
    body: barData.map((row) => [
      row.label,
      `${row.value}/${row.max}`,
      row.hasError ? "Error" : `${row.percent}%`
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  w.setY(doc.lastAutoTable.finalY + 8);

  addFrequencyList(w, "Most common gaps", collectGapFrequency(questions));
  addFrequencyList(w, "Most common strengths", collectStrengthFrequency(questions));
  addFrequencyList(w, "Keywords for success (frequency)", collectKeywordFrequency(questions));

  w.newPage();
  w.sectionTitle("Question-wise detailed analysis");

  sorted.forEach((item) => {
    w.ensureSpace(40);
    addQuestionSection(w, item);
  });

  w.footer();
  return doc;
}

export function downloadAnalysisPdf({ questions, summary, sourceFileName }) {
  if (!questions?.length) {
    throw new Error("No evaluation results to export.");
  }

  const doc = buildAnalysisPdf({ questions, summary, sourceFileName });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = sanitizeFilename(sourceFileName);
  doc.save(`upsc-analysis-${base}-${stamp}.pdf`);
}
