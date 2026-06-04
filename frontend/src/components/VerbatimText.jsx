/**
 * Renders API text exactly as returned, but displays **segment** as bold.
 * Does not modify or trim the source string.
 */
function parseBoldSegments(text) {
  if (text == null || text === "") return [];

  const segments = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "bold", value: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", value: text }];
}

export default function VerbatimText({ text, className = "verbatim-text", as = "span" }) {
  const segments = parseBoldSegments(text);
  const nodes = segments.map((segment, index) =>
    segment.type === "bold" ? (
      <strong key={`b-${index}`}>{segment.value}</strong>
    ) : (
      <span key={`t-${index}`}>{segment.value}</span>
    )
  );

  if (as === "pre") {
    return <pre className={className}>{nodes}</pre>;
  }

  if (as === "div") {
    return <div className={className}>{nodes}</div>;
  }

  return <span className={className}>{nodes}</span>;
}
