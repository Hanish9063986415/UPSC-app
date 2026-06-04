import { useState } from "react";
import VerbatimText from "./VerbatimText";
import { groupParameters } from "../lib/parameterSections";

function ScoreBar({ awarded, possible, percent }) {
  const width = possible > 0 ? Math.min(100, (awarded / possible) * 100) : 0;
  let band = "high";
  if (percent < 40) band = "low";
  else if (percent < 70) band = "mid";

  return (
    <div className="param-score-bar" aria-hidden="true">
      <div className={`param-score-bar-fill band-${band}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function ParameterDetail({ param, defaultOpen = false }) {
  const analysis = param?.student_analysis || {};
  const enhancement = param?.upsc_enhancement || {};
  const awarded = analysis.marks_allocation ?? 0;
  const possible = param?.max_marks_for_parameter ?? 0;
  const percent = possible > 0 ? Math.round((awarded / possible) * 100) : 0;

  return (
    <details className="param-accordion-item param-accordion-topic" open={defaultOpen || undefined}>
      <summary className="param-accordion-summary">
        <div className="param-accordion-summary-main">
          <span className="param-accordion-title">{param?.parameter_name || "Parameter"}</span>
          <span className="param-accordion-marks">
            {awarded} / {possible} ({percent}%)
          </span>
        </div>
        <ScoreBar awarded={awarded} possible={possible} percent={percent} />
        <span className="param-accordion-meta">
          {(analysis.strengths_for_upsc?.length ?? 0) > 0 && (
            <span className="param-meta-pill good">
              {analysis.strengths_for_upsc.length} strength
              {analysis.strengths_for_upsc.length === 1 ? "" : "s"}
            </span>
          )}
          {(analysis.missing_upsc_elements?.length ?? 0) > 0 && (
            <span className="param-meta-pill warn">
              {analysis.missing_upsc_elements.length} gap
              {analysis.missing_upsc_elements.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </summary>

      <div className="param-accordion-body">
        {analysis.what_student_wrote != null && analysis.what_student_wrote !== "" && (
          <div className="verbatim-block">
            <h5>What you wrote:</h5>
            <VerbatimText text={analysis.what_student_wrote} className="verbatim-text verbatim-block" />
          </div>
        )}

        {Array.isArray(analysis.strengths_for_upsc) && analysis.strengths_for_upsc.length > 0 && (
          <div className="verbatim-block tag-list good">
            <h5>Strengths:</h5>
            <ul>
              {analysis.strengths_for_upsc.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(analysis.missing_upsc_elements) &&
          analysis.missing_upsc_elements.length > 0 && (
            <div className="verbatim-block tag-list warn">
              <h5>Missing elements:</h5>
              <ul>
                {analysis.missing_upsc_elements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

        {enhancement.ideal_upsc_content != null && enhancement.ideal_upsc_content !== "" && (
          <div className="verbatim-block ideal-content">
            <h5>Ideal UPSC content:</h5>
            <VerbatimText text={enhancement.ideal_upsc_content} className="verbatim-text verbatim-block" />
          </div>
        )}
      </div>
    </details>
  );
}

function SectionBlock({ title, params, expandAll = false }) {
  if (!params.length) return null;

  if (params.length === 1) {
    return (
      <div className="param-section-group">
        <div className="param-section-label">{title}</div>
        <div className="param-section-body">
          <ParameterDetail param={params[0]} defaultOpen={expandAll} />
        </div>
      </div>
    );
  }

  return (
    <details className="param-section-group" open={expandAll || undefined}>
      <summary className="param-section-summary">
        <span className="param-section-title">{title}</span>
        <span className="param-section-meta">
          {params.length} parts
        </span>
      </summary>
      <div className="param-section-body">
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

function BodySection({ params, defaultOpen = false, expandTopics = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!params.length) return null;

  return (
    <div className={`param-section-group param-section-body${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="param-section-summary param-section-body-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="param-section-title">Body</span>
        <span className="param-section-meta">
          {params.length} topic{params.length === 1 ? "" : "s"}
        </span>
        <span className={`param-section-chevron${open ? " open" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="param-section-body param-section-body-topics">
          {params.map((param, i) => (
            <ParameterDetail
              key={`${param?.parameter_name || "param"}-${i}`}
              param={param}
              defaultOpen={expandTopics}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ParameterAccordion({ parameters, expandAll = false }) {
  if (!parameters?.length) return null;

  const groups = groupParameters(parameters);

  return (
    <div className="param-accordion param-accordion-grouped">
      <SectionBlock title="Introduction" params={groups.introduction} expandAll={expandAll} />

      <BodySection params={groups.body} defaultOpen={expandAll} expandTopics={expandAll} />

      <SectionBlock title="Conclusion" params={groups.conclusion} expandAll={expandAll} />
    </div>
  );
}
