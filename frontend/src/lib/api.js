import { INSTAMARK_MAINTENANCE_MESSAGE, messageFromApiDetail } from "./instamarkService";
import { getYantraUserId as resolveYantraUserId } from "./yantraUser";

/** API base URL. Empty string uses same-origin (Vite dev proxy in local dev). */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const YANTRA_USER_ID_HEADER =
  import.meta.env.VITE_YANTRA_USER_ID_HEADER || "X-Yantra-User-Id";

export { getYantraUserDisplayName, isYantraUserSignedIn } from "./yantraUser";

export function getYantraUserId() {
  return resolveYantraUserId();
}

export function getYantraAuthHeaders(extra = {}) {
  const headers = { ...extra };
  const userId = getYantraUserId();
  if (userId) {
    headers[YANTRA_USER_ID_HEADER] = userId;
  }
  return headers;
}

export function formatFetchError(error) {
  const message = error?.message || "Unknown error";
  if (message === "Failed to fetch" || error instanceof TypeError) {
    return (
      "Cannot reach the evaluation API. From the project root run npm start " +
      "(starts the backend on port 8000 and this UI together)."
    );
  }
  return message.startsWith("Error:") ? message : message;
}

export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchInstamarkServiceStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/instamark/storage-status`, {
      method: "GET",
    });
    if (!response.ok) {
      return {
        operational: false,
        maintenance: true,
        message: INSTAMARK_MAINTENANCE_MESSAGE,
      };
    }
    return response.json();
  } catch {
    return {
      operational: false,
      maintenance: false,
      message: null,
    };
  }
}

export async function fetchInstamarkDebitStatus(clientTransactionId) {
  const userId = getYantraUserId();
  if (!userId || !clientTransactionId) {
    throw new Error("User id and transaction id required to verify wallet debit.");
  }

  const params = new URLSearchParams({
    yantra_user_id: userId,
    client_transaction_id: clientTransactionId,
  });
  const response = await fetch(`${API_BASE_URL}/api/instamark/wallet/debit-status?${params}`, {
    headers: getYantraAuthHeaders(),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(messageFromApiDetail(payload.detail, "Could not verify wallet debit."));
  }

  return response.json();
}

export async function fetchInstamarkWallet() {
  const userId = getYantraUserId();
  if (!userId) {
    throw new Error("Sign in with your YantraIAS account to view wallet credits.");
  }

  const params = new URLSearchParams({
    yantra_user_id: userId,
    _: String(Date.now()),
  });
  const response = await fetch(`${API_BASE_URL}/api/instamark/wallet?${params}`, {
    headers: getYantraAuthHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(messageFromApiDetail(payload.detail, "Could not load wallet balance."));
  }

  return response.json();
}

export async function fetchInstamarkEvaluations(limit = 50) {
  const userId = getYantraUserId();
  if (!userId) return [];

  const params = new URLSearchParams({ yantra_user_id: userId, limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/api/instamark/evaluations?${params}`, {
    headers: getYantraAuthHeaders()
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  return Array.isArray(payload.evaluations) ? payload.evaluations : [];
}

export async function fetchInstamarkEvaluation(evaluationId) {
  const userId = getYantraUserId();
  if (!userId || !evaluationId) return null;

  const params = new URLSearchParams({ yantra_user_id: userId });
  const response = await fetch(
    `${API_BASE_URL}/api/instamark/evaluations/${evaluationId}?${params}`,
    { headers: getYantraAuthHeaders() }
  );

  if (!response.ok) return null;
  return response.json();
}

export function mapServerEvaluationToTransaction(record) {
  return {
    id: record.client_transaction_id || record.id,
    serverEvaluationId: record.id,
    service: record.service || "instamark",
    fileName: record.file_name,
    pageCount: record.page_count,
    amount: record.amount_inr,
    ratePerPage: record.rate_per_page,
    status: record.status,
    createdAt: record.created_at,
    completedAt: record.completed_at,
    questionCount: record.question_count,
    durationSeconds: record.duration_seconds,
    marksAwarded: record.marks_awarded,
    marksPossible: record.marks_possible,
    marksPercent: record.marks_percent,
    hasPdfCopy: false,
    hasAnalysisReport: Boolean(record.complete_package),
    syncedFromServer: true,
    yantraUserId: record.yantra_user_id || null
  };
}
