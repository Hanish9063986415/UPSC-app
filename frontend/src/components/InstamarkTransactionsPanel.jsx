import { useMemo, useState } from "react";
import { formatInr } from "../lib/pdfPricing";
import {
  downloadTransactionAnalysis,
  viewTransactionAnalysis
} from "../lib/instamarkTransactionAssets";
import {
  formatDuration,
  formatTransactionDate,
  formatTransactionTime,
  getInstamarkSerialMap,
  getInstamarkTransactionTotals
} from "../lib/instamarkTransactions";

function statusLabel(status) {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Processing";
}

function formatMarks(tx) {
  if (tx.status !== "completed") return "—";
  if (tx.marksAwarded == null || tx.marksPossible == null) return "—";
  const pct = tx.marksPercent != null ? ` (${tx.marksPercent}%)` : "";
  return `${tx.marksAwarded}/${tx.marksPossible}${pct}`;
}

function reportAvailable(tx) {
  return (
    tx.status === "completed" &&
    (tx.hasAnalysisReport || tx.hasPdfCopy || tx.serverEvaluationId)
  );
}

function TransactionStrip({ tx, serial, onView, onDownload, busyAction }) {
  return (
    <li className={`instamark-tx-strip status-${tx.status}`}>
      <div className="instamark-tx-strip-cell instamark-tx-strip-serial">
        <span className="instamark-tx-strip-label">#</span>
        <span className="instamark-tx-serial-num">{serial}</span>
      </div>

      <div className="instamark-tx-strip-cell instamark-tx-strip-name">
        <span className="instamark-tx-strip-label">PDF name</span>
        <span className="instamark-tx-strip-value" title={tx.fileName}>
          {tx.fileName}
        </span>
      </div>

      <div className="instamark-tx-strip-cell instamark-tx-strip-date">
        <span className="instamark-tx-strip-label">Date</span>
        <span className="instamark-tx-strip-value">{formatTransactionDate(tx.createdAt)}</span>
        {formatTransactionTime(tx.createdAt) && (
          <span className="instamark-tx-strip-sub">{formatTransactionTime(tx.createdAt)}</span>
        )}
      </div>

      <div className="instamark-tx-strip-cell instamark-tx-strip-duration">
        <span className="instamark-tx-strip-label">Evaluation time</span>
        <span className="instamark-tx-strip-value">{formatDuration(tx.durationSeconds)}</span>
      </div>

      <div className="instamark-tx-strip-cell instamark-tx-strip-marks">
        <span className="instamark-tx-strip-label">Marks</span>
        <span className="instamark-tx-strip-value">{formatMarks(tx)}</span>
      </div>

      <div className="instamark-tx-strip-cell instamark-tx-strip-report">
        <span className="instamark-tx-strip-label">Analysis report</span>
        {reportAvailable(tx) ? (
          <div className="instamark-tx-report-actions">
            <button
              type="button"
              className="instamark-tx-report-btn instamark-tx-report-btn--view"
              disabled={Boolean(busyAction)}
              onClick={() => onView(tx)}
            >
              {busyAction === "view" ? "Opening…" : "View HTML"}
            </button>
            <button
              type="button"
              className="instamark-tx-report-btn instamark-tx-report-btn--download"
              disabled={Boolean(busyAction)}
              onClick={() => onDownload(tx)}
            >
              {busyAction === "download" ? "Preparing…" : "Download HTML"}
            </button>
          </div>
        ) : tx.status === "completed" ? (
          <span className="instamark-tx-strip-muted">Not available</span>
        ) : (
          <span className="instamark-tx-strip-muted">Pending</span>
        )}
      </div>

      <div className="instamark-tx-strip-footer">
        <span className={`instamark-tx-badge status-${tx.status}`}>{statusLabel(tx.status)}</span>
        <span className="instamark-tx-strip-charge">
          {tx.pageCount} pg · {formatInr(tx.amount)}
        </span>
      </div>
    </li>
  );
}

export default function InstamarkTransactionsPanel({
  transactions = [],
  userId = null,
  isSignedIn = false,
  accountLabel = null
}) {
  const [busy, setBusy] = useState({ id: "", action: "" });
  const totals = getInstamarkTransactionTotals(transactions);
  const serialMap = useMemo(() => getInstamarkSerialMap(transactions), [transactions]);

  const analysisOpts = (tx) => ({
    sourceFileName: tx.fileName,
    serverEvaluationId: tx.serverEvaluationId
  });

  const handleView = async (tx) => {
    const previewWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
    setBusy({ id: tx.id, action: "view" });
    try {
      const ok = await viewTransactionAnalysis(tx.id, {
        ...analysisOpts(tx),
        previewWindow
      });
      if (!ok) {
        previewWindow?.close();
        window.alert("Analysis report is not available for this evaluation yet.");
      }
    } catch (err) {
      previewWindow?.close();
      window.alert(err?.message || "Could not open the HTML report.");
    } finally {
      setBusy({ id: "", action: "" });
    }
  };

  const handleDownload = async (tx) => {
    setBusy({ id: tx.id, action: "download" });
    try {
      const ok = await downloadTransactionAnalysis(tx.id, analysisOpts(tx));
      if (!ok) {
        window.alert("Analysis report is not available for this evaluation yet.");
      }
    } finally {
      setBusy({ id: "", action: "" });
    }
  };

  if (!isSignedIn || !userId) {
    return (
      <div className="instamark-tx-panel instamark-tx-panel--empty">
        <p className="instamark-tx-empty-title">Account not linked</p>
        <p className="muted instamark-tx-empty-hint">
          Open Instamark from YantraIAS while logged in to see evaluations for your account only.
        </p>
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <div className="instamark-tx-panel instamark-tx-panel--empty">
        <p className="instamark-tx-empty-title">No evaluations for this account</p>
        <p className="muted instamark-tx-empty-hint">
          {accountLabel
            ? `No Instamark transactions yet for ${accountLabel}.`
            : "Complete an evaluation to see your history here."}
        </p>
      </div>
    );
  }

  return (
    <div className="instamark-tx-panel" role="region" aria-label="Instamark transactions">
      <div className="instamark-tx-account-bar">
        <span className="instamark-tx-account-label">Showing evaluations for</span>
        <strong className="instamark-tx-account-name">{accountLabel || userId}</strong>
      </div>
      <div className="instamark-tx-summary">
        <div className="instamark-tx-stat">
          <span className="instamark-tx-stat-label">Evaluations</span>
          <strong>{totals.completedCount}</strong>
        </div>
        <div className="instamark-tx-stat instamark-tx-stat--accent">
          <span className="instamark-tx-stat-label">Instamark spend</span>
          <strong>{formatInr(totals.totalSpent)}</strong>
        </div>
      </div>

      <div className="instamark-tx-table-head" aria-hidden="true">
        <span>#</span>
        <span>PDF name</span>
        <span>Date</span>
        <span>Evaluation time</span>
        <span>Marks</span>
        <span>Analysis HTML</span>
      </div>

      <ul className="instamark-tx-strip-list">
        {transactions.map((tx) => (
          <TransactionStrip
            key={tx.id}
            tx={tx}
            serial={serialMap.get(tx.id) ?? "—"}
            onView={handleView}
            onDownload={handleDownload}
            busyAction={busy.id === tx.id ? busy.action : ""}
          />
        ))}
      </ul>
    </div>
  );
}
