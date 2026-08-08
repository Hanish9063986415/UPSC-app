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
  const [serverTransactions, setServerTransactions] = useState([]);

  useEffect(() => {
    if (!userId) {
      setServerTransactions([]);
      return;
    }
    fetchInstamarkEvaluations()
      .then((rows) => setServerTransactions(rows.map(mapServerEvaluationToTransaction)))
      .catch(() => setServerTransactions([]));
  }, [transactions.length, userId]);

  const mergedTransactions = useMemo(
    () => mergeTransactions(transactions, serverTransactions, userId),
    [transactions, serverTransactions, userId]
  );

  return (
    <section className="glass-card workspace-next-steps home-transactions" aria-label="Previous transactions">
      <h2 className="workspace-next-steps-title">Previous transactions</h2>
      <p className="muted workspace-next-steps-hint">
        Your Instamark evaluation history and billing for this account.
      </p>

      <InstamarkTransactionsPanel
        transactions={mergedTransactions}
        userId={userId}
        isSignedIn={isSignedIn}
        accountLabel={displayName}
      />
    </section>
  );
}
