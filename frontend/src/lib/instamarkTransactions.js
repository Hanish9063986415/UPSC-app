import { PRICE_PER_PAGE_INR } from "./pdfPricing";

export const INSTAMARK_SERVICE = "instamark";
const STORAGE_KEY = "instamark-transactions-v2";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function loadInstamarkTransactions() {
  return readAll()
    .filter((item) => item?.service === INSTAMARK_SERVICE)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getInstamarkSerialMap(transactions) {
  const chronological = [...transactions].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  return new Map(chronological.map((tx, index) => [tx.id, index + 1]));
}

export function addInstamarkTransaction({ fileName, pageCount, amount }) {
  const entry = {
    id: crypto.randomUUID(),
    service: INSTAMARK_SERVICE,
    fileName: fileName || "Answer sheet.pdf",
    pageCount: Number(pageCount) || 0,
    amount: Number(amount) || 0,
    ratePerPage: PRICE_PER_PAGE_INR,
    status: "processing",
    createdAt: new Date().toISOString(),
    completedAt: null,
    questionCount: null,
    durationSeconds: null,
    marksAwarded: null,
    marksPossible: null,
    marksPercent: null,
    hasPdfCopy: false
  };

  const items = readAll();
  items.unshift(entry);
  writeAll(items);
  return entry.id;
}

export function updateInstamarkTransaction(id, patch) {
  if (!id) return;
  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;

  items[index] = { ...items[index], ...patch };
  writeAll(items);
}

export function removeInstamarkTransaction(id) {
  if (!id) return;
  writeAll(readAll().filter((item) => item.id !== id));
}

export function getVisibleInstamarkTransactions(transactions) {
  const list = transactions ?? loadInstamarkTransactions();
  return list.filter((tx) => tx.status === "completed");
}

export function extractEvaluationSummary(payload) {
  const meta = payload?.complete_package?.metadata || {};
  const awarded = meta.total_ai_magic_marks ?? meta.total_param_marks ?? null;
  const possible = meta.total_max_marks ?? null;
  const marksAwarded = awarded != null ? Number(awarded) : null;
  const marksPossible = possible != null ? Number(possible) : null;

  return {
    questionCount: payload?.total_questions ?? null,
    durationSeconds:
      payload?.total_duration != null ? Number(payload.total_duration) : null,
    marksAwarded,
    marksPossible,
    marksPercent:
      marksPossible > 0 && marksAwarded != null
        ? Math.round((marksAwarded / marksPossible) * 100)
        : null
  };
}

export function getInstamarkTransactionTotals(transactions) {
  const list = transactions || loadInstamarkTransactions();
  const completed = list.filter((t) => t.status === "completed");
  return {
    count: list.length,
    completedCount: completed.length,
    totalSpent: completed.reduce((sum, t) => sum + (t.amount || 0), 0),
    totalPages: completed.reduce((sum, t) => sum + (t.pageCount || 0), 0)
  };
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatTransactionDate(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(iso));
}

export function formatTransactionTime(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}
