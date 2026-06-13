import VerbatimText from "./VerbatimText";
import { groupParameters } from "../lib/parameterSections";

function getParamStats(param) {
  const analysis = param?.student_analysis || {};
  const awarded = analysis.marks_allocation ?? 0;
  const possible = param?.max_marks_for_parameter ?? 0;
  const percent = possible > 0 ? Math.round((awarded / possible) * 100) : 0;
  const strengths = analysis.strengths_for_upsc?.length ?? 0;
  const gaps = analysis.missing_upsc_elements?.length ?? 0;

  return { awarded, possible, percent, strengths, gaps };
}

function aggregateParamStats(params) {
  return params.reduce(
    (acc, param) => {
      const stats = getParamStats(param);
      return {
        awarded: acc.awarded + stats.awarded,
        possible: acc.possible + stats.possible,
        strengths: acc.strengths + stats.strengths,
        gaps: acc.gaps + stats.gaps,
      };
    },
    { awarded: 0, possible: 0, strengths: 0, gaps: 0 }
  );
}

function ParamMetaPills({ strengths = 0, gaps = 0, topicCount = 0 }) {
  return (
    <span className="param-accordion-meta">
      {topicCount > 1 && (
        <span className="param-meta-pill neutral">
          {topicCount} topic{topicCount === 1 ? "" : "s"}
        </span>
      )}
      {strengths > 0 && (
        <span className="param-meta-pill good">
          {strengths} strength{strengths === 1 ? "" : "s"}
        </span>
      )}
      {gaps > 0 && (
        <span className="param-meta-pill warn">
          {gaps} gap{gaps === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

function SectionCardHeader({ title, stats }) {
  const percent = stats.possible > 0 ? Math.round((stats.awarded / stats.possible) * 100) : 0;

  return (
    <>
      <div className="param-section-card-main">
        <span className="param-section-title">{title}</span>
        <span className="param-accordion-marks">
          {stats.awarded} / {stats.possible} ({percent}%)
        </span>
      </div>
      <ParamMetaPills strengths={stats.strengths} gaps={stats.gaps} topicCount={stats.topicCount ?? 0} />
    </>
  );
}

function parseFeedbackItem(text) {
  const value = String(text ?? "").trim();
  const match = value.match(/^([A-Z][A-Z0-9_\s/-]{0,40}):\s*(.+)$/);
  if (match) {
    return { label: match[1].trim(), body: match[2].trim() };
  }
  return { label: null, body: value };
}

function FeedbackItem({ text }) {
  const { label, body } = parseFeedbackItem(text);

  return (
    <li className="param-feedback-item">
      {label && <span className="param-feedback-item-label">{label}</span>}
      <span className="param-feedback-item-text">{body}</span>
    </li>
  );
}

function FeedbackInsightBlocks({ strengths = [], gaps = [] }) {
  const strengthItems = Array.isArray(strengths) ? strengths : [];
  const gapItems = Array.isArray(gaps) ? gaps : [];
  const hasStrengths = strengthItems.length > 0;
  const hasGaps = gapItems.length > 0;

  if (!hasStrengths && !hasGaps) return null;

  return (
    <div className={`param-feedback-grid${hasStrengths && hasGaps ? " has-both" : ""}`}>
      {hasStrengths && (
        <section className="param-feedback-block param-feedback-block--good" aria-label="Strengths">
          <div className="param-feedback-block-head">
            <h5>Strengths</h5>
            <span className="param-feedback-block-count">{strengthItems.length}</span>
          </div>
          <ul className="param-feedback-items">
            {strengthItems.map((item, i) => (
              <FeedbackItem key={i} text={item} />
            ))}
          </ul>
        </section>
      )}

      {hasGaps && (
        <section className="param-feedback-block param-feedback-block--warn" aria-label="Missing elements">
          <div className="param-feedback-block-head">
            <h5>Missing elements</h5>
            <span className="param-feedback-block-count">{gapItems.length}</span>
          </div>
          <ul className="param-feedback-items">
            {gapItems.map((item, i) => (
              <FeedbackItem key={i} text={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ParameterDetailBody({ param }) {
  const analysis = param?.student_analysis || {};
  const enhancement = param?.upsc_enhancement || {};

  return (
    <div className="param-accordion-body">
      {analysis.what_student_wrote != null && analysis.what_student_wrote !== "" && (
        <div className="verbatim-block">
          <h5>What you wrote:</h5>
          <VerbatimText text={analysis.what_student_wrote} className="verbatim-text verbatim-block" />
        </div>
      )}

      <FeedbackInsightBlocks
        strengths={analysis.strengths_for_upsc}
        gaps={analysis.missing_upsc_elements}
      />

      {enhancement.ideal_upsc_content != null && enhancement.ideal_upsc_content !== "" && (
        <div className="verbatim-block ideal-content">
          <h5>Ideal UPSC content:</h5>
          <VerbatimText text={enhancement.ideal_upsc_content} className="verbatim-text verbatim-block" />
        </div>
      )}
    </div>
  );
}

function ParameterDetail({ param, defaultOpen = false }) {
  const stats = getParamStats(param);
  const title = param?.parameter_name || "Parameter";

  return (
    <details className="param-accordion-item param-accordion-topic" open={defaultOpen || undefined}>
      <summary className="param-accordion-summary">
        <div className="param-accordion-summary-main">
          <span className="param-accordion-title">{title}</span>
          <span className="param-accordion-marks">
            {stats.awarded} / {stats.possible} ({stats.percent}%)
          </span>
        </div>
        <ParamMetaPills strengths={stats.strengths} gaps={stats.gaps} />
      </summary>
      <ParameterDetailBody param={param} />
    </details>
  );
}

function SectionCard({ title, params, expandAll = false, action = "feedback" }) {
  if (!params.length) return null;

  const stats = {
    ...aggregateParamStats(params),
    topicCount: params.length,
  };

  const actionClass =
    action === "topics"
      ? "param-section-card-summary--topics"
      : action === "parts"
        ? "param-section-card-summary--parts"
        : "param-section-card-summary--feedback";

  if (params.length === 1) {
    return (
      <details className="param-section-group" open={expandAll || undefined}>
        <summary className={`param-section-card-summary ${actionClass}`}>
          <SectionCardHeader title={title} stats={stats} />
        </summary>
        <div className="param-section-body param-section-body--flat">
          <ParameterDetailBody param={params[0]} />
        </div>
      </details>
    );
  }

  return (
    <details className="param-section-group" open={expandAll || undefined}>
      <summary className={`param-section-card-summary ${actionClass}`}>
        <SectionCardHeader title={title} stats={stats} />
      </summary>
      <div className="param-section-body param-section-body-topics">
        {params.map((param, i) => (
          <ParameterDetail
            key={`${title}-${param?.parameter_name || i}`}
            param={param}
            defaultOpen={expandAll}
          />
        ))}
      </div>
    </details>
  );
}

export default function ParameterAccordion({ parameters, expandAll = false }) {
  if (!parameters?.length) return null;

  const groups = groupParameters(parameters);

  return (
    <div className="param-accordion param-accordion-grouped">
      <SectionCard title="Introduction" params={groups.introduction} expandAll={expandAll} action="feedback" />
      <SectionCard title="Body" params={groups.body} expandAll={expandAll} action="topics" />
      <SectionCard title="Conclusion" params={groups.conclusion} expandAll={expandAll} action="feedback" />
    </div>
  );
}
