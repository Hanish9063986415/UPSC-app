import { useState } from "react";

export default function KeywordFrequencyPanel({ items, emptyMessage = "No keywords returned yet." }) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_VISIBLE = 8;

  if (!items?.length) {
    return <p className="muted chart-empty">{emptyMessage}</p>;
  }

  const ranked = [...items].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const visible = expanded ? ranked : ranked.slice(0, INITIAL_VISIBLE);
  const hasMore = ranked.length > INITIAL_VISIBLE;
  const maxCount = Math.max(...ranked.map((i) => i.count), 1);
  const totalMentions = ranked.reduce((sum, i) => sum + i.count, 0);
  const top = ranked[0];

  return (
    <div className="keyword-freq-panel" aria-label="Keyword frequency">
      <div className="keyword-freq-summary">
        <div className="keyword-freq-stat">
          <span className="keyword-freq-stat-value">{ranked.length}</span>
          <span className="keyword-freq-stat-label">Unique keywords</span>
        </div>
        <div className="keyword-freq-stat">
          <span className="keyword-freq-stat-value">{totalMentions}</span>
          <span className="keyword-freq-stat-label">Total mentions</span>
        </div>
        {top && (
          <div className="keyword-freq-stat highlight">
            <span className="keyword-freq-stat-value">{top.count}×</span>
            <span className="keyword-freq-stat-label" title={top.label}>
              Top: {top.label.length > 28 ? `${top.label.slice(0, 27)}…` : top.label}
            </span>
          </div>
        )}
      </div>

      <div className="keyword-freq-grid">
        {visible.map((item, idx) => {
          const absoluteRank = ranked.findIndex((r) => r.label === item.label) + 1;
          const width = Math.max(8, (item.count / maxCount) * 100);
          const isTop = absoluteRank <= 3;
          return (
            <article
              key={`${item.label}-${idx}`}
              className={`keyword-freq-card${isTop ? " top-tier" : ""}`}
            >
              <div className="keyword-freq-card-head">
                <span className="keyword-freq-rank">#{absoluteRank}</span>
                <span className={`keyword-freq-count${item.count >= maxCount ? " peak" : ""}`}>
                  {item.count}×
                </span>
              </div>
              <p className="keyword-freq-text verbatim-text" title={item.label}>
                {item.label}
              </p>
              <div className="keyword-freq-meter" aria-hidden="true">
                <div className="keyword-freq-meter-fill" style={{ width: `${width}%` }} />
              </div>
            </article>
          );
        })}
      </div>
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
