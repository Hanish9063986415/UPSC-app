import { useMemo, useState } from "react";
import { formatInr } from "../lib/pdfPricing";
import { downloadTransactionPdf } from "../lib/instamarkTransactionAssets";
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

function TransactionStrip({ tx, serial, onDownload, downloading }) {
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

      <div className="instamark-tx-strip-cell instamark-tx-strip-pdf">
        <span className="instamark-tx-strip-label">Evaluated PDF</span>
        {tx.hasPdfCopy ? (
          <button
            type="button"
            className="instamark-tx-download-btn"
            disabled={downloading}
            onClick={() => onDownload(tx)}
          >
            {downloading ? "Downloading…" : "Download copy"}
          </button>
        ) : (
          <span className="instamark-tx-strip-muted">Not available</span>
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

export default function InstamarkTransactionsPanel({ transactions = [] }) {
  const [downloadingId, setDownloadingId] = useState("");
  const totals = getInstamarkTransactionTotals(transactions);
  const serialMap = useMemo(() => getInstamarkSerialMap(transactions), [transactions]);

  const handleDownload = async (tx) => {
    setDownloadingId(tx.id);
    try {
      await downloadTransactionPdf(tx.id, tx.fileName);
    } finally {
      setDownloadingId("");
    }
  };

  if (!transactions.length) {
    return (
      <div className="instamark-tx-panel instamark-tx-panel--empty">
        <p className="instamark-tx-empty-title">No Instamark transactions yet</p>
        <p className="muted instamark-tx-empty-hint">
          Each evaluation appears here as a strip with PDF name, date, time taken, marks, and a
          downloadable copy of your submitted answer sheet.
        </p>
      </div>
    );
  }

  return (
    <div className="instamark-tx-panel" role="region" aria-label="Instamark transactions">
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
        <span>Evaluated PDF</span>
      </div>

      <ul className="instamark-tx-strip-list">
        {transactions.map((tx) => (
          <TransactionStrip
            key={tx.id}
            tx={tx}
            serial={serialMap.get(tx.id) ?? "—"}
            onDownload={handleDownload}
            downloading={downloadingId === tx.id}
          />
        ))}
      </ul>
    </div>
  );
}
