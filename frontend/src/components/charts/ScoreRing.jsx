export default function ScoreRing({
  percent = 0,
  band = "mid",
  size = 140,
  label,
  sublabel,
  strokeWidth,
  compact = false
}) {
  const resolvedStroke = strokeWidth ?? (compact ? 8 : 12);
  const radius = (size - resolvedStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div
      className={`score-ring-wrap${compact ? " score-ring-wrap--compact" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className={`score-ring band-${band}`} role="img" aria-label={label}>
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
      <div className="score-ring-center">
        <span className="score-ring-value">{percent}%</span>
        {label && <span className="score-ring-label">{label}</span>}
        {sublabel && <span className="score-ring-sublabel">{sublabel}</span>}
      </div>
    </div>
  );
}
