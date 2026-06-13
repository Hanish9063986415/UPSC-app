export default function ScoreRing({
  percent = 0,
  band = "mid",
  size = 140,
  label,
  sublabel,
  strokeWidth,
  compact = false,
  emphasis = "percent"
}) {
  const resolvedStroke = strokeWidth ?? (compact ? 8 : 12);
  const radius = (size - resolvedStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const ariaLabel = [sublabel, label, `${percent}%`].filter(Boolean).join(" · ");

  const centerContent =
    emphasis === "marks" ? (
      <>
        {sublabel && <span className="score-ring-sublabel score-ring-marks">{sublabel}</span>}
        {label && <span className="score-ring-label">{label}</span>}
        <span className={`score-ring-percent-badge band-${band}`}>{percent}%</span>
      </>
    ) : (
      <>
        <span className="score-ring-value">{percent}%</span>
        {label && <span className="score-ring-label">{label}</span>}
        {sublabel && <span className="score-ring-sublabel">{sublabel}</span>}
      </>
    );

  return (
    <div
      className={`score-ring-wrap${compact ? " score-ring-wrap--compact" : ""}${
        emphasis === "marks" ? " score-ring-wrap--marks-emphasis" : ""
      }`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className={`score-ring band-${band}`} role="img" aria-label={ariaLabel}>
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={resolvedStroke}
          fill="none"
        />
        <circle
          className="score-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={resolvedStroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-center">{centerContent}</div>
    </div>
  );
}
