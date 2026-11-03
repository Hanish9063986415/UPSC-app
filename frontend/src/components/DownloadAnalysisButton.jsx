import { useState } from "react";

export default function DownloadAnalysisButton({
  questions,
  summary,
  sourceFileName,
  transactionId = null,
  disabled = false,
  className = "",
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    if (disabled || loading || !questions?.length) return;
    setError("");
    setLoading(true);
    try {
      const { captureAnalysisHtmlDocument, downloadHtmlString } = await import(
        "../lib/exportAnalysisHtml"
      );
      const html = await captureAnalysisHtmlDocument({
        questions,
        summary,
        sourceFileName,
        mode: "auto",
      });
      downloadHtmlString(html, sourceFileName);
      if (transactionId) {
        const { saveTransactionExportHtml } = await import("../lib/instamarkTransactionAssets");
        await saveTransactionExportHtml(transactionId, html);
      }
    } catch (err) {
      setError(err?.message || "Could not generate report.");
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
        {loading ? "Preparing report…" : "Download report (HTML)"}
      </button>
      {error && (
        <p className="download-analysis-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
