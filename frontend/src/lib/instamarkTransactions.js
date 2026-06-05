import { PRICE_PER_PAGE_INR } from "./pdfPricing";

export const INSTAMARK_SERVICE = "instamark";
const STORAGE_KEY = "instamark-transactions-v1";

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
    questionCount: null
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
