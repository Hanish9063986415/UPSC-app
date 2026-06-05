import { useState } from "react";

export default function DownloadAnalysisButton({
  questions,
  summary,
  sourceFileName,
  disabled = false,
  className = ""
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    if (disabled || loading || !questions?.length) return;
    setError("");
    setLoading(true);
    try {
      const { downloadAnalysisPdf } = await import("../lib/exportAnalysisPdf");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      downloadAnalysisPdf({ questions, summary, sourceFileName });
    } catch (err) {
      setError(err?.message || "Could not generate PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`download-analysis-wrap ${className}`.trim()}>
      <button
        type="button"
        className="btn btn-primary download-analysis-btn"
        onClick={handleDownload}
        disabled={disabled || loading || !questions?.length}
      >
        {loading ? "Preparing PDF…" : "Download complete analysis (PDF)"}
      </button>
      {error && (
        <p className="download-analysis-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
