import { useState } from "react";

function getBand(percent) {
  if (percent >= 70) return "high";
  if (percent >= 40) return "mid";
  return "low";
}

function toFixedScore(value) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

export default function ParameterAveragePanel({ data }) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_VISIBLE = 8;

  if (!data?.length) {
    return <p className="muted chart-empty">No parameter averages yet.</p>;
  }

  const ranked = [...data]
    .map((item) => ({
      ...item,
      band: getBand(item.percent ?? 0)
    }))
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  const visible = expanded ? ranked : ranked.slice(0, INITIAL_VISIBLE);
  const hasMore = ranked.length > INITIAL_VISIBLE;

  return (
    <div className="param-avg-panel" role="list" aria-label="Average marks by parameter">
      <div className="param-avg-header">
        <span>Parameter</span>
        <span>Average score</span>
      </div>
      {visible.map((row, idx) => {
        const width = Math.max(4, Math.min(100, row.percent ?? 0));
        const absoluteRank = idx + 1;
        return (
          <div key={`${row.label}-${idx}`} className={`param-avg-row band-${row.band}`} role="listitem">
            <div className="param-avg-label-wrap">
              <span className="param-avg-rank">#{absoluteRank}</span>
              <span className="param-avg-label" title={row.label}>
                {row.label}
              </span>
            </div>

            <div className="param-avg-metric">
              <div className="param-avg-track" aria-hidden="true">
                <div className="param-avg-fill" style={{ width: `${width}%` }} />
              </div>
              <div className="param-avg-values">
                <span className="param-avg-score">
                  {toFixedScore(row.value)}/{toFixedScore(row.max)}
                </span>
                <span className={`param-avg-percent band-${row.band}`}>{row.percent}%</span>
              </div>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div className="panel-actions">
          <button type="button" className="panel-view-more-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `View more (${ranked.length - INITIAL_VISIBLE} more)`}
          </button>
        </div>
      )}
    </div>
  );
}
