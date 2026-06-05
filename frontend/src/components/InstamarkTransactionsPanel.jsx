import { formatInr } from "../lib/pdfPricing";
import { getInstamarkTransactionTotals } from "../lib/instamarkTransactions";

function formatWhen(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function statusLabel(status) {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Processing";
}

export default function InstamarkTransactionsPanel({ transactions = [] }) {
  const totals = getInstamarkTransactionTotals(transactions);

  if (!transactions.length) {
    return (
      <div className="instamark-tx-panel instamark-tx-panel--empty">
        <p className="instamark-tx-empty-title">No Instamark transactions yet</p>
        <p className="muted instamark-tx-empty-hint">
          Evaluations you run here will appear in this list — only Instamark activity, not your
          full YantraIAS wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="instamark-tx-panel" role="region" aria-label="Instamark transactions">
      <div className="instamark-tx-summary">
        <div className="instamark-tx-stat">
          <span className="instamark-tx-stat-label">Instamark evaluations</span>
          <strong>{totals.completedCount}</strong>
        </div>
        <div className="instamark-tx-stat">
          <span className="instamark-tx-stat-label">Pages evaluated</span>
          <strong>{totals.totalPages}</strong>
        </div>
        <div className="instamark-tx-stat instamark-tx-stat--accent">
          <span className="instamark-tx-stat-label">Total spent (Instamark)</span>
          <strong>{formatInr(totals.totalSpent)}</strong>
        </div>
      </div>

      <ul className="instamark-tx-list">
        {transactions.map((tx) => (
          <li key={tx.id} className={`instamark-tx-row status-${tx.status}`}>
            <div className="instamark-tx-row-main">
              <div className="instamark-tx-row-head">
                <span className="instamark-tx-file" title={tx.fileName}>
                  {tx.fileName}
                </span>
                <span className={`instamark-tx-badge status-${tx.status}`}>
                  {statusLabel(tx.status)}
                </span>
              </div>
              <p className="instamark-tx-meta">
                {tx.pageCount} page{tx.pageCount === 1 ? "" : "s"} · {formatInr(tx.ratePerPage)}/page
                {tx.questionCount != null ? ` · ${tx.questionCount} question${tx.questionCount === 1 ? "" : "s"}` : ""}
              </p>
              <p className="instamark-tx-time">{formatWhen(tx.createdAt)}</p>
            </div>
            <div className="instamark-tx-amount">{formatInr(tx.amount)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
