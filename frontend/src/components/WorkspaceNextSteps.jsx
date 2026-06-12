import { useEffect, useMemo, useState } from "react";
import InstamarkTransactionsPanel from "./InstamarkTransactionsPanel";
import { fetchInstamarkEvaluations, mapServerEvaluationToTransaction } from "../lib/api";

const YANTRA_MENTOR_URL =
  import.meta.env.VITE_YANTRA_MENTOR_URL || "https://www.yantraias.com/mentor";

function mergeTransactions(localTransactions, serverTransactions) {
  const byKey = new Map();

  serverTransactions.forEach((tx) => {
    byKey.set(tx.serverEvaluationId || tx.id, tx);
  });

  localTransactions.forEach((tx) => {
    const key = tx.serverEvaluationId || tx.id;
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? {
            ...existing,
            ...tx,
            hasPdfCopy: tx.hasPdfCopy || existing.hasPdfCopy
          }
        : tx
    );
  });

  return [...byKey.values()].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
}

export default function WorkspaceNextSteps({ transactions = [] }) {
  const [showTransactions, setShowTransactions] = useState(false);
  const [serverTransactions, setServerTransactions] = useState([]);

  useEffect(() => {
    if (!showTransactions) return;
    fetchInstamarkEvaluations()
      .then((rows) => setServerTransactions(rows.map(mapServerEvaluationToTransaction)))
      .catch(() => setServerTransactions([]));
  }, [showTransactions, transactions.length]);

  const mergedTransactions = useMemo(
    () => mergeTransactions(transactions, serverTransactions),
    [transactions, serverTransactions]
  );

  return (
    <section className="glass-card workspace-next-steps" aria-label="YantraIAS next steps">
      <h2 className="workspace-next-steps-title">Continue on YantraIAS</h2>
      <p className="muted workspace-next-steps-hint">
        Review Instamark-only billing here, or connect with a mentor for deeper answer-writing
        guidance.
      </p>

      <div className="workspace-next-steps-list">
        <button
          type="button"
          className={`workspace-next-step-btn workspace-next-step-btn--secondary${
            showTransactions ? " is-active" : ""
          }`}
          onClick={() => setShowTransactions((open) => !open)}
          aria-expanded={showTransactions}
        >
          <span className="workspace-next-step-label">
            {showTransactions ? "Hide transactions" : "View transactions"}
          </span>
          <span className="workspace-next-step-desc">
            Instamark evaluations only · not full app wallet
          </span>
        </button>

        {showTransactions && (
          <InstamarkTransactionsPanel transactions={mergedTransactions} />
        )}

        <a
          className="workspace-next-step-btn workspace-next-step-btn--primary"
          href={YANTRA_MENTOR_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="workspace-next-step-label">Evaluate with mentor</span>
          <span className="workspace-next-step-desc">Connect with verified UPSC mentors</span>
        </a>
      </div>
    </section>
  );
}
