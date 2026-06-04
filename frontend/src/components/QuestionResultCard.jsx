import { useEffect, useRef, useState } from "react";
import { getQuestionScores, getScoreBand } from "../lib/evaluationMetrics";
import ParameterAccordion from "./ParameterAccordion";
import QuestionAnalyticsOverview from "./QuestionAnalyticsOverview";
import VerbatimText from "./VerbatimText";

const EXTRACTED_ANSWER_PREVIEW_LINES = 4;

function answerNeedsPreviewToggle(text) {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  return lines.length > EXTRACTED_ANSWER_PREVIEW_LINES || text.length > 280;
}

function ExtractedAnswerSection({ text }) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = answerNeedsPreviewToggle(text);

  return (
    <section className="sub-card extracted-answer-section">
      <div className="extracted-answer-head">
        <h4>Your answer (extracted)</h4>
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
      <div
        className={`extracted-answer-body${canToggle && !expanded ? " is-collapsed" : " is-expanded"}`}
      >
        <VerbatimText
          text={text}
          as="div"
          className="answer-text verbatim-text extracted-answer-text"
        />
      </div>
    </section>
  );
}

export default function QuestionResultCard({ item, isActive, onActivate }) {
  const cardRef = useRef(null);
  const [expandAllParams, setExpandAllParams] = useState(false);

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isActive]);

  if (item.error) {
    return (
      <article
        ref={cardRef}
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
      ref={cardRef}
      id={`question-${item.question_number}`}
      className={`question surface-light band-${band}${isActive ? " active" : ""}`}
      onMouseEnter={() => onActivate?.(item.question_number)}
    >
      <div className="question-head">
        <h3>Question {item.question_number}</h3>
        <div className={`score-pill band-${band}`}>
          {scores.awarded} / {scores.possible} <span>({scores.percent}%)</span>
        </div>
      </div>

      <section className="sub-card overview-analytics-card">
        <h4>Question analytics</h4>
        <QuestionAnalyticsOverview item={item} />
      </section>

      <p className="question-text">{item.question}</p>

      {analysis.upsc_expectations?.length > 0 && (
        <section className="sub-card">
          <h4>UPSC expectations</h4>
          <ul>
            {analysis.upsc_expectations.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
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

      {modelText !== "" && (
        <section className="sub-card model">
          <h4>Model answer</h4>
          <VerbatimText text={modelText} as="pre" className="model-text verbatim-text" />
        </section>
      )}
    </article>
  );
}
