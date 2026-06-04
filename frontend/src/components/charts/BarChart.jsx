export default function BarChart({
  data,
  maxValue,
  valueKey = "value",
  maxKey = "max",
  labelKey = "label",
  percentKey = "percent",
  bandKey = "band",
  onBarClick,
  showValues = true,
  emptyMessage = "No data yet."
}) {
  if (!data?.length) {
    return <p className="muted chart-empty">{emptyMessage}</p>;
  }

  const computedMax =
    maxValue ?? Math.max(...data.map((d) => d[maxKey] ?? d[valueKey] ?? 0), 1);

  return (
    <div className="bar-chart" role="list">
      {data.map((row, idx) => {
        const value = row[valueKey] ?? 0;
        const max = row[maxKey] ?? computedMax;
        const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
        const band = row[bandKey] || "mid";
        const pct = row[percentKey];

        return (
          <div key={`${row[labelKey]}-${idx}`} className="bar-chart-row" role="listitem">
            <button
              type="button"
              className="bar-chart-label-btn"
              onClick={() => onBarClick?.(row)}
              disabled={!onBarClick}
            >
              {row[labelKey]}
            </button>
            <div className="bar-chart-track-wrap">
              <div className="bar-chart-track">
                <div
                  className={`bar-chart-fill band-${band}`}
                  style={{ width: `${width}%` }}
                  title={`${value} / ${max}`}
                />
              </div>
              {showValues && (
                <span className="bar-chart-value">
                  {value}/{max}
                  {pct != null ? ` (${pct}%)` : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
