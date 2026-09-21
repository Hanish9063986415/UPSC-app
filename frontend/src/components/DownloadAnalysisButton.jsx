import { useState } from "react";

export default function DownloadAnalysisButton({
  questions,
  summary,
  sourceFileName,
  disabled = false,
  className = ""
}) {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");

  const runExport = async (kind) => {
    if (disabled || loading || !questions?.length) return;
    setError("");
    setLoading(kind);
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (kind === "html") {
        const { downloadAnalysisHtml } = await import("../lib/exportAnalysisHtml");
        downloadAnalysisHtml({ questions, summary, sourceFileName });
      } else {
        const { downloadAnalysisPdf } = await import("../lib/exportAnalysisPdf");
        downloadAnalysisPdf({ questions, summary, sourceFileName });
      }
    } catch (err) {
      setError(err?.message || "Could not generate export.");
    } finally {
      setLoading(null);
    }
  };

  const busy = Boolean(loading);

  return (
    <div className={`download-analysis-wrap ${className}`.trim()}>
      <div className="download-analysis-actions">
        <button
          type="button"
          className="btn btn-primary download-analysis-btn"
          onClick={() => runExport("html")}
          disabled={disabled || busy || !questions?.length}
        >
          {loading === "html" ? "Preparing report…" : "Download report (HTML)"}
        </button>
        <button
          type="button"
          className="btn btn-secondary download-analysis-btn download-analysis-btn--pdf"
          onClick={() => runExport("pdf")}
          disabled={disabled || busy || !questions?.length}
        >
          {loading === "pdf" ? "Preparing PDF…" : "PDF (text)"}
        </button>
      </div>
      {error && (
        <p className="download-analysis-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
