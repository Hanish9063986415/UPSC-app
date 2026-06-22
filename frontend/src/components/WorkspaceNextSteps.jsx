import { useEffect, useMemo, useState } from "react";
import InstamarkTransactionsPanel from "./InstamarkTransactionsPanel";
import { fetchInstamarkEvaluations, mapServerEvaluationToTransaction } from "../lib/api";
import { filterTransactionsByUser } from "../lib/instamarkTransactions";
import { useYantraUser } from "../hooks/useYantraUser";

function mergeTransactions(localTransactions, serverTransactions, userId) {
  const byKey = new Map();

  filterTransactionsByUser(serverTransactions, userId).forEach((tx) => {
    byKey.set(tx.serverEvaluationId || tx.id, tx);
  });

  filterTransactionsByUser(localTransactions, userId).forEach((tx) => {
    const key = tx.serverEvaluationId || tx.id;
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? {
            ...existing,
            ...tx,
            yantraUserId: tx.yantraUserId ?? existing.yantraUserId ?? userId ?? null,
            hasAnalysisReport: tx.hasAnalysisReport || existing.hasAnalysisReport,
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
  const { userId, isSignedIn, displayName } = useYantraUser();
  const [showTransactions, setShowTransactions] = useState(false);
  const [serverTransactions, setServerTransactions] = useState([]);

  useEffect(() => {
    if (!showTransactions || !userId) {
      setServerTransactions([]);
      return;
    }
    fetchInstamarkEvaluations()
      .then((rows) => setServerTransactions(rows.map(mapServerEvaluationToTransaction)))
      .catch(() => setServerTransactions([]));
  }, [showTransactions, transactions.length, userId]);

  const mergedTransactions = useMemo(
    () => mergeTransactions(transactions, serverTransactions, userId),
    [transactions, serverTransactions, userId]
  );

  return (
    <section className="glass-card workspace-next-steps" aria-label="Evaluation history">
      <h2 className="workspace-next-steps-title">Your evaluations</h2>
      <p className="muted workspace-next-steps-hint">
        Review Instamark billing and past evaluations for your account.
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
          <InstamarkTransactionsPanel
            transactions={mergedTransactions}
            userId={userId}
            isSignedIn={isSignedIn}
            accountLabel={displayName}
          />
        )}
      </div>
    </section>
  );
}
