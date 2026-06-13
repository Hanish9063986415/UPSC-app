import { useState } from "react";
import { getQuestionScores, getScoreBand } from "../lib/evaluationMetrics";
import ParameterAccordion from "./ParameterAccordion";
import QuestionAnalyticsOverview from "./QuestionAnalyticsOverview";
import VerbatimText from "./VerbatimText";
import { countAnswerWords, parseAnswerContent } from "../lib/formattedAnswer";

const EXTRACTED_ANSWER_PREVIEW_LINES = 4;
const MODEL_ANSWER_PREVIEW_LINES = 3;

function answerNeedsPreviewToggle(text) {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  return lines.length > EXTRACTED_ANSWER_PREVIEW_LINES || text.length > 280;
}

function FormattedAnswerContent({ text }) {
  const blocks = parseAnswerContent(text);

  if (!blocks.length) {
    return (
      <div className="extracted-answer-content">
        <VerbatimText text={text} as="div" className="extracted-answer-paragraph verbatim-text" />
      </div>
    );
  }

  return (
    <div className="extracted-answer-content">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ol key={`list-${index}`} className="extracted-answer-list">
            {block.items.map((item, itemIndex) => (
              <li key={`item-${index}-${itemIndex}`} className="extracted-answer-list-item">
                <VerbatimText text={item} as="span" className="extracted-answer-list-text verbatim-text" />
              </li>
            ))}
          </ol>
        ) : (
          <p key={`para-${index}`} className="extracted-answer-paragraph">
            <VerbatimText text={block.text} as="span" className="verbatim-text" />
          </p>
        )
      )}
    </div>
  );
}

function ExtractedAnswerSection({ text }) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = answerNeedsPreviewToggle(text);
  const wordCount = countAnswerWords(text);

  return (
    <section className="sub-card extracted-answer-section">
      <div className="extracted-answer-head">
        <div className="extracted-answer-head-main">
          <span className="extracted-answer-eyebrow">Extracted from your sheet</span>
          <h4>Your answer</h4>
        </div>
        <div className="extracted-answer-head-actions">
          {wordCount > 0 && (
            <span className="extracted-answer-meta">
              {wordCount} word{wordCount === 1 ? "" : "s"}
            </span>
          )}
          {canToggle && (
            <button
              type="button"
              className="extracted-answer-view-more"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "View more"}
            </button>
          )}
        </div>
      </div>
      <div
        className={`extracted-answer-body${canToggle && !expanded ? " is-collapsed" : " is-expanded"}`}
      >
        <FormattedAnswerContent text={text} />
      </div>
    </section>
  );
}

function modelAnswerNeedsToggle(text) {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  return lines.length > MODEL_ANSWER_PREVIEW_LINES || text.length > 220;
}

function ModelAnswerSection({ text }) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = modelAnswerNeedsToggle(text);

  return (
    <section className="sub-card model model-answer-section">
      <div className="model-answer-head">
        <h4>Model answer</h4>
        {canToggle && (
          <button
            type="button"
            className="model-answer-view-complete"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : "View complete answer"}
          </button>
        )}
      </div>
      <div
        className={`model-answer-body${canToggle && !expanded ? " is-collapsed" : " is-expanded"}`}
      >
        <VerbatimText text={text} as="div" className="model-text verbatim-text model-answer-text" />
      </div>
    </section>
  );
}

export default function QuestionResultCard({ item, isActive, onActivate }) {
  const [expandAllParams, setExpandAllParams] = useState(false);

  if (item.error) {
    return (
      <article
        id={`question-${item.question_number}`}
        className={`question surface-light error${isActive ? " active" : ""}`}
        onMouseEnter={() => onActivate?.(item.question_number)}
      >
        <h3>Question {item.question_number}</h3>
        <p className="error-text">{item.error}</p>
      </article>
    );
  }

  const evaluation = item.evaluation || {};
  const overall = evaluation.overall_upsc_assessment || {};
  const analysis = evaluation.upsc_question_analysis || {};
  const parameters = evaluation.upsc_focused_parameters || [];
  const modelText =
    item.model_answer?.model_answer?.full_text ||
    item.model_answer?.full_text ||
    "";

  const scores = getQuestionScores(item);
  const band = getScoreBand(scores.percent);

  return (
    <article
      id={`question-${item.question_number}`}
      className={`question surface-light band-${band}${isActive ? " active" : ""}`}
      onMouseEnter={() => onActivate?.(item.question_number)}
    >
      <h3>Question {item.question_number}</h3>

      <section className="question-prompt" aria-label="Question text">
        <p className="question-text">{item.question}</p>
      </section>

      <section className="sub-card overview-analytics-card">
        <h4>Question analytics</h4>
        <QuestionAnalyticsOverview item={item} />
      </section>

      {analysis.upsc_expectations?.length > 0 && (
        <section className="sub-card upsc-expectations-card">
          <div className="upsc-expectations-head">
            <div className="upsc-expectations-head-main">
              <span className="upsc-expectations-eyebrow">Examiner lens</span>
              <h4>UPSC expectations</h4>
            </div>
            <span className="upsc-expectations-count">
              {analysis.upsc_expectations.length}{" "}
              {analysis.upsc_expectations.length === 1 ? "point" : "points"}
            </span>
          </div>
          <ol className="upsc-expectations-list">
            {analysis.upsc_expectations.map((e, i) => (
              <li key={i} className="upsc-expectation-item">
                <span className="upsc-expectation-index" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="upsc-expectation-text">{e}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {evaluation.student_answer != null && evaluation.student_answer !== "" && (
        <ExtractedAnswerSection text={evaluation.student_answer} />
      )}

      {parameters.length > 0 && (
        <section className="sub-card">
          <div className="sub-card-head-row">
            <h4>Parameter-wise analysis</h4>
            <button
              type="button"
              className="btn-text"
              onClick={() => setExpandAllParams((v) => !v)}
            >
              {expandAllParams ? "Collapse all" : "Expand all feedback"}
            </button>
          </div>
          <p className="muted sub-card-hint">
            All evaluation text is shown exactly as returned — expand a parameter to read it.
          </p>
          <ParameterAccordion
            key={expandAllParams ? "params-open" : "params-closed"}
            parameters={parameters}
            expandAll={expandAllParams}
          />
        </section>
      )}

      {overall.final_upsc_advice != null && overall.final_upsc_advice !== "" && (
        <section className="sub-card advice">
          <h4>Final advice</h4>
          <VerbatimText text={overall.final_upsc_advice} className="verbatim-text verbatim-block" />
        </section>
      )}

      {Array.isArray(overall.keywords_for_success) && overall.keywords_for_success.length > 0 && (
        <section className="sub-card keywords-section">
          <h4>Keywords for success</h4>
          <div className="chips">
            {overall.keywords_for_success.map((k, i) => (
              <span key={i} className="chip">
                {k}
              </span>
            ))}
          </div>
        </section>
      )}

      {modelText !== "" && <ModelAnswerSection text={modelText} />}
    </article>
  );
}
