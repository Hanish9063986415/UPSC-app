import { useState } from "react";
import { buildParameterMarkSections } from "../../lib/parameterSections";

function formatScore(value) {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(1);
}

function bandLabel(band) {
  if (band === "high") return "Strong";
  if (band === "mid") return "Average";
  return "Needs work";
}

function SectionMarksRow({ section, rank, isExpandable, expanded, onToggle }) {
  const width = Math.max(4, Math.min(100, section.percent ?? 0));
  const RowTag = isExpandable ? "button" : "div";

  return (
    <div className={`qparam-row band-${section.band}${isExpandable ? " is-expandable" : ""}`}>
      <RowTag
        type={isExpandable ? "button" : undefined}
        className={`qparam-row-head${isExpandable ? " qparam-row-toggle" : ""}`}
        onClick={isExpandable ? onToggle : undefined}
        aria-expanded={isExpandable ? expanded : undefined}
      >
        <span className="qparam-rank">{rank}</span>
        <span className="qparam-title-wrap">
          <span className="qparam-title">{section.label}</span>
          {isExpandable && (
            <span className="qparam-topic-count">
              {section.topicCount} topic{section.topicCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <span className={`qparam-band band-${section.band}`}>{bandLabel(section.band)}</span>
        {isExpandable && <span className={`qparam-chevron${expanded ? " open" : ""}`} aria-hidden="true" />}
      </RowTag>

      <div className="qparam-row-body">
        <div className="qparam-track" aria-hidden="true">
          <div className="qparam-fill" style={{ width: `${width}%` }} />
        </div>
        <div className="qparam-values">
          <span className="qparam-score">
            {formatScore(section.value)}/{formatScore(section.max)}
          </span>
          <span className="qparam-percent">{section.percent}%</span>
        </div>
      </div>
    </div>
  );
}

function BodyTopicRow({ row, index }) {
  const width = Math.max(4, Math.min(100, row.percent ?? 0));

  return (
    <div className={`qparam-topic-row band-${row.band}`}>
      <span className="qparam-topic-index">{index}</span>
      <div className="qparam-topic-main">
        <span className="qparam-topic-title" title={row.label}>
          {row.label}
        </span>
        <div className="qparam-topic-metric">
          <div className="qparam-topic-track" aria-hidden="true">
            <div className="qparam-topic-fill" style={{ width: `${width}%` }} />
          </div>
          <div className="qparam-topic-values">
            <span className="qparam-topic-score">
              {formatScore(row.value)}/{formatScore(row.max)}
            </span>
            <span className={`qparam-topic-percent band-${row.band}`}>{row.percent}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuestionParameterMarksPanel({ data }) {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  if (!data?.length) {
    return <p className="muted chart-empty">No parameter marks available.</p>;
  }

  const sections = buildParameterMarkSections(data);

  if (!sections.length) {
    return <p className="muted chart-empty">No parameter marks available.</p>;
  }

  return (
    <div className="qparam-panel qparam-panel-grouped" role="list" aria-label="Parameter marks by section">
      {sections.map((section, idx) => {
        const rank = idx + 1;
        const isBody = section.key === "body";

        if (!isBody) {
          return (
            <div key={section.key} role="listitem">
              <SectionMarksRow section={section} rank={rank} />
            </div>
          );
        }

        return (
          <div key={section.key} className={`qparam-body-block${bodyExpanded ? " is-open" : ""}`} role="listitem">
            <SectionMarksRow
              section={section}
              rank={rank}
              isExpandable
              expanded={bodyExpanded}
              onToggle={() => setBodyExpanded((open) => !open)}
            />
            {bodyExpanded && (
              <div className="qparam-body-topics" aria-label="Body topics">
                {section.topics.map((row, topicIdx) => (
                  <BodyTopicRow key={`${row.label}-${topicIdx}`} row={row} index={topicIdx + 1} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
