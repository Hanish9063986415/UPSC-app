const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 98;
const LABEL_RADIUS = 128;

function polar(angle, radius) {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle)
  };
}

function polygonPoints(values, maxValue, count) {
  if (!count) return "";
  const step = (Math.PI * 2) / count;
  const start = -Math.PI / 2;

  return values
    .map((value, index) => {
      const ratio = maxValue > 0 ? value / maxValue : 0;
      const { x, y } = polar(start + step * index, RADIUS * ratio);
      return `${x},${y}`;
    })
    .join(" ");
}

export default function ParameterRadarChart({ data }) {
  if (!data?.length) {
    return <p className="muted chart-empty">No parameter scores available for radar chart.</p>;
  }

  const count = data.length;
  const step = (Math.PI * 2) / count;
  const start = -Math.PI / 2;
  const maxPossible = Math.max(...data.map((d) => d.possible), 1);
  const awardedValues = data.map((d) => d.awarded);
  const possibleValues = data.map((d) => d.possible);
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="radar-chart-wrap">
      <svg
        className="radar-chart"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Parameter marks radar chart"
      >
        {rings.map((ring) => (
          <polygon
            key={`ring-${ring}`}
            points={polygonPoints(
              Array(count).fill(maxPossible * ring),
              maxPossible,
              count
            )}
            className="radar-grid"
          />
        ))}

        {Array.from({ length: count }).map((_, index) => {
          const axis = polar(start + step * index, RADIUS);
          return (
            <line
              key={`axis-${index}`}
              x1={CENTER}
              y1={CENTER}
              x2={axis.x}
              y2={axis.y}
              className="radar-axis"
            />
          );
        })}

        <polygon
          points={polygonPoints(possibleValues, maxPossible, count)}
          className="radar-possible"
        />
        <polygon
          points={polygonPoints(awardedValues, maxPossible, count)}
          className="radar-awarded"
        />

        {data.map((item, index) => {
          const awardedPoint = polar(
            start + step * index,
            RADIUS * (item.awarded / maxPossible)
          );
          return (
            <circle
              key={`point-${index}`}
              cx={awardedPoint.x}
              cy={awardedPoint.y}
              r="4"
              className="radar-point"
            />
          );
        })}

        {data.map((item, index) => {
          const labelPoint = polar(start + step * index, LABEL_RADIUS);
          return (
            <g key={`label-${index}`}>
              <title>{`${item.name}: ${item.awarded}/${item.possible}`}</title>
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                className="radar-label-score"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {item.awarded}/{item.possible}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="radar-legend" aria-hidden="true">
        <li>
          <span className="radar-legend-swatch possible" />
          Maximum marks per parameter
        </li>
        <li>
          <span className="radar-legend-swatch awarded" />
          Marks awarded
        </li>
      </ul>
    </div>
  );
}
