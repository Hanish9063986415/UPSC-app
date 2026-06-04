export default function FrequencyChart({
  items,
  variant = "warn",
  emptyMessage = "No items to chart.",
  maxItems = 12
}) {
  if (!items?.length) {
    return <p className="muted chart-empty">{emptyMessage}</p>;
  }

  const visible = items.slice(0, maxItems);
  const maxCount = Math.max(...visible.map((i) => i.count), 1);

  return (
    <div className={`frequency-chart variant-${variant}`}>
      {visible.map((item, idx) => (
        <div key={`${item.label}-${idx}`} className="frequency-row">
          <p className="frequency-label verbatim-text">{item.label}</p>
          <div className="frequency-bar-wrap">
            <div
              className="frequency-bar"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
            <span className="frequency-count">{item.count}×</span>
          </div>
        </div>
      ))}
      {items.length > maxItems && (
        <p className="muted frequency-more">+{items.length - maxItems} more (see question feedback)</p>
      )}
    </div>
  );
}
