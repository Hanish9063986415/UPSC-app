import { useState } from "react";
import { getScoreBand } from "../../lib/evaluationMetrics";
import { shortenParameterLabel, compareQuestionNumbers } from "../../lib/paperAnalytics";
import { buildHeatmapSections, aggregateHeatmapCells } from "../../lib/parameterSections";

function HeatmapLegend() {
  return (
    <div className="heatmap-legend" aria-label="Score color legend">
      <span className="heatmap-legend-title">Score scale</span>
      <span className="heatmap-legend-item band-high">70%+ Strong</span>
      <span className="heatmap-legend-item band-mid">40–69% Average</span>
      <span className="heatmap-legend-item band-low">1–39% Weak</span>
      <span className="heatmap-legend-item cell-zero">0 No marks</span>
      <span className="heatmap-legend-item empty">— N/A</span>
    </div>
  );
}

function HeatmapCell({ rowName, col, cell }) {
  if (!cell || cell.percent == null) {
    return (
      <td className="heatmap-cell empty" title={`${rowName} · ${col.label}: not applicable`}>
        <span className="heatmap-cell-na" aria-label="Not applicable">
          —
        </span>
      </td>
    );
  }

  const band = getScoreBand(cell.percent);
  const title = `${rowName} · ${col.label}: ${cell.awarded}/${cell.possible} marks (${cell.percent}%)`;
  const isZero = cell.percent === 0;

  if (isZero) {
    return (
      <td className="heatmap-cell band-low cell-zero" title={title}>
        <span className="heatmap-cell-zero">0</span>
      </td>
    );
  }

  return (
    <td className={`heatmap-cell band-${band}`} title={title}>
      <span className="heatmap-cell-pct">{cell.percent}%</span>
      <span className="heatmap-cell-marks">
        {cell.awarded}/{cell.possible}
      </span>
    </td>
  );
}

function HeatmapRowLabel({ rank, text, title, isBody, topicCount, expanded, onToggle }) {
  if (isBody) {
    return (
      <th scope="row" className="heatmap-row-label heatmap-section-label is-body">
        <button
          type="button"
          className="heatmap-body-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          title={expanded ? "Hide body topics" : "Show body topics"}
        >
          <span className="heatmap-row-num">{rank}</span>
          <span className="heatmap-row-text">
            <span className="heatmap-section-name">Body</span>
            <span className="heatmap-section-meta">
              {topicCount} topic{topicCount === 1 ? "" : "s"}
            </span>
          </span>
          <span className={`heatmap-section-chevron${expanded ? " open" : ""}`} aria-hidden="true" />
        </button>
      </th>
    );
  }

  return (
    <th scope="row" className="heatmap-row-label heatmap-section-label" title={title || text}>
      <span className="heatmap-row-num">{rank}</span>
      <span className="heatmap-row-text heatmap-section-name">{text}</span>
    </th>
  );
}

export default function ParameterHeatmap({ rows, columns, onSelectQuestion }) {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  if (!rows?.length || !columns?.length) {
    return <p className="muted chart-empty">Parameter heatmap appears when questions share parameters.</p>;
  }

  const sortedColumns = [...columns].sort((a, b) =>
    compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );
  const sections = buildHeatmapSections(rows);

  return (
    <div className="heatmap-panel">
      <HeatmapLegend />
      <p className="heatmap-read-hint muted">
        Overview by <strong>Introduction</strong>, <strong>Body</strong>, and <strong>Conclusion</strong>.
        Click <strong>Body</strong> to expand topic-level scores. Click <strong>Q#</strong> to jump to a question.
      </p>
      <div className="heatmap-scroll">
        <table className="heatmap-table heatmap-table-grouped">
          <thead>
            <tr>
              <th scope="col" className="heatmap-corner">
                Section ↓ / Question →
              </th>
              {sortedColumns.map((col) => (
                <th key={col.label} scope="col" className="heatmap-col-head">
                  <button
                    type="button"
                    className="heatmap-col-btn"
                    onClick={() => onSelectQuestion?.(col.questionNumber)}
                    title={`Go to question ${col.questionNumber}`}
                  >
                    {col.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section, sectionIdx) => {
              const rank = sectionIdx + 1;
              const isBody = section.key === "body";

              return (
                <SectionRows
                  key={section.key}
                  section={section}
                  rank={rank}
                  isBody={isBody}
                  bodyExpanded={bodyExpanded}
                  onToggleBody={() => setBodyExpanded((v) => !v)}
                  sortedColumns={sortedColumns}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRows({ section, rank, isBody, bodyExpanded, onToggleBody, sortedColumns }) {
  const sectionRowName = section.label;

  return (
    <>
      <tr className={`heatmap-section-row${isBody ? " is-body" : ""}`}>
        <HeatmapRowLabel
          rank={rank}
          text={section.label}
          isBody={isBody}
          topicCount={section.topics.length}
          expanded={bodyExpanded}
          onToggle={onToggleBody}
        />
        {sortedColumns.map((col) => {
          const cell = aggregateHeatmapCells(col.cells, section.topics);
          return (
            <HeatmapCell
              key={`${section.key}-${col.label}`}
              rowName={sectionRowName}
              col={col}
              cell={cell}
            />
          );
        })}
      </tr>

      {isBody &&
        bodyExpanded &&
        section.topics.map((topicName, topicIdx) => (
          <tr key={topicName} className="heatmap-topic-row">
            <th scope="row" className="heatmap-row-label heatmap-topic-label" title={topicName}>
              <span className="heatmap-topic-num">{topicIdx + 1}</span>
              <span className="heatmap-row-text">{shortenParameterLabel(topicName, 52)}</span>
            </th>
            {sortedColumns.map((col) => {
              const cell = col.cells.find((c) => c.name === topicName);
              return (
                <HeatmapCell
                  key={`${topicName}-${col.label}`}
                  rowName={topicName}
                  col={col}
                  cell={cell}
                />
              );
            })}
          </tr>
        ))}
    </>
  );
}
