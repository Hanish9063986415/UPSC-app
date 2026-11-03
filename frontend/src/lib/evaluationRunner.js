import {
  API_BASE_URL,
  fetchInstamarkDebitStatus,
  fetchInstamarkEvaluations,
  getYantraAuthHeaders,
} from "./api";
import { removeInstamarkTransaction, updateInstamarkTransaction, loadInstamarkTransactions, extractEvaluationSummary, addInstamarkTransaction } from "./instamarkTransactions";
import { saveTransactionAnalysis } from "./instamarkTransactionAssets";
import { notifyWalletChanged } from "./walletEvents";
import {
  INSTAMARK_MAINTENANCE_MESSAGE,
  messageFromApiDetail,
  parseMaintenancePayload,
} from "./instamarkService";
import {
  buildInsufficientWalletMessage,
  parseInsufficientWalletPayload,
} from "./walletMessages";

const IN_FLIGHT_KEY = "instamark-evaluation-in-flight";
const POLL_MS = 8000;

function parseSseChunk(chunk) {
  const line = chunk.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return null;
  try {
    return JSON.parse(line.replace("data: ", ""));
  } catch {
    return null;
  }
}

function readInFlight() {
  try {
    const raw = sessionStorage.getItem(IN_FLIGHT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeInFlight(data) {
  if (data) {
    sessionStorage.setItem(IN_FLIGHT_KEY, JSON.stringify(data));
  } else {
    sessionStorage.removeItem(IN_FLIGHT_KEY);
  }
}

async function persistAnalysisReport(transactionId, questions, summary, fileName) {
  const saved = await saveTransactionAnalysis(transactionId, {
    questions,
    summary,
    sourceFileName: fileName,
  });
  if (!saved) return false;

  updateInstamarkTransaction(transactionId, { hasAnalysisReport: true });

  try {
    const { captureAnalysisHtmlDocument } = await import("./exportAnalysisHtml");
    const exportHtml = await captureAnalysisHtmlDocument({
      questions,
      summary,
      sourceFileName: fileName,
      mode: "auto",
    });
    await saveTransactionAnalysis(transactionId, {
      questions,
      summary,
      sourceFileName: fileName,
      exportHtml,
    });
  } catch {
    // Questions are saved; download will regenerate with the same export pipeline.
  }
  return true;
}

function applyFinalSummary(job, payload, fileName) {
  job.summary = payload;
  job.status = "completed";
  job.error = null;

  const evalSummary = extractEvaluationSummary(payload);
  const durationSeconds =
    job.startedAt != null ? Math.round((Date.now() - job.startedAt) / 1000) : null;

  updateInstamarkTransaction(job.transactionId, {
    status: "completed",
    completedAt: new Date().toISOString(),
    serverEvaluationId: payload.evaluation_id || null,
    persistedToDatabase: payload.persisted === true,
    hasAnalysisReport: true,
    ...evalSummary,
    durationSeconds: evalSummary.durationSeconds ?? durationSeconds
  });

  persistAnalysisReport(job.transactionId, job.questions, payload, fileName);
  writeInFlight(null);
}

class EvaluationRunner {
  constructor() {
    this.job = null;
    this.listeners = new Set();
    this._pollTimer = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.job) listener(this.job);
    return () => this.listeners.delete(listener);
  }

  getJob() {
    return this.job;
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.job));
  }

  async _confirmWalletDebit(job, yantraUserId) {
    if (!yantraUserId || job.walletDebited || job.status === "error") {
      return;
    }

    try {
      const status = await fetchInstamarkDebitStatus(job.transactionId);
      if (status?.debited) {
        job.walletDebited = true;
        job.walletDebitedAmount = status.amount_inr ?? job.walletDebitedAmount ?? null;
        job.walletBalance = status.balance_inr ?? job.walletBalance ?? null;
        notifyWalletChanged();
        this.notify();
      } else if (job.walletBillingActive) {
        job.walletDebitMissing = true;
        job.error = INSTAMARK_MAINTENANCE_MESSAGE;
        job.maintenance = true;
        job.status = "error";
        removeInstamarkTransaction(job.transactionId);
        writeInFlight(null);
        this.stopPolling();
        this.notify();
      }
    } catch {
      // Server may not expose debit-status yet; rely on SSE wallet_debit when available.
    }
  }

  async start({ formData, transactionId, fileName, pageCount, amount, yantraUserId, walletBillingActive }) {
    if (this.job?.status === "running") {
      return this.job;
    }

    const job = {
      transactionId,
      fileName,
      status: "running",
      progress: [],
      questions: [],
      summary: null,
      error: null,
      insufficientWallet: false,
      walletDebited: false,
      walletDebitedAmount: null,
      walletBillingActive: Boolean(walletBillingActive),
      walletDebitMissing: false,
      startedAt: Date.now(),
      disconnected: false,
      userInitiated: true
    };

    this.job = job;
    this.notify();

    try {
      const response = await fetch(`${API_BASE_URL}/api/evaluate-stream`, {
        method: "POST",
        headers: getYantraAuthHeaders(),
        body: formData
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const insufficient = parseInsufficientWalletPayload(payload);

        if (insufficient) {
          job.status = "error";
          job.insufficientWallet = true;
          job.error = insufficient.message;
          this.notify();
          return job;
        }

        const maintenance = parseMaintenancePayload(payload);
        if (maintenance || response.status === 503) {
          job.status = "error";
          job.maintenance = true;
          job.error = maintenance?.message || INSTAMARK_MAINTENANCE_MESSAGE;
          this.notify();
          return job;
        }

        const detail = payload?.detail;
        throw new Error(messageFromApiDetail(detail, `Failed: ${response.status} ${response.statusText}`));
      }

      addInstamarkTransaction({
        id: transactionId,
        fileName,
        pageCount,
        amount,
        yantraUserId
      });
      writeInFlight({ transactionId, fileName, startedAt: job.startedAt });
      this.notify();

      if (!response.body) {
        throw new Error("Evaluation stream unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          this._handleEvent(job, chunk, fileName);
        }
      }

      if (
        job.status === "running" ||
        (job.status === "completed" && job.walletBillingActive && !job.walletDebited)
      ) {
        await this._confirmWalletDebit(job, yantraUserId);
      }
      if (job.status === "running") {
        job.status = "completed";
        writeInFlight(null);
      }
    } catch (error) {
      const message = error?.message || "";
      const streamInterrupted =
        error?.name === "AbortError" ||
        /aborted|network error|failed to fetch|load failed/i.test(message);

      if (streamInterrupted && !job.summary && job.status !== "completed") {
        job.status = "background";
        job.disconnected = true;
        job.error = null;
        this.startPolling(job.transactionId);
        this.notify();
        return job;
      }

      if (!job.summary) {
        job.status = "error";
        job.error = message || "Evaluation failed";
        removeInstamarkTransaction(job.transactionId);
        writeInFlight(null);
        this.stopPolling();
      }
    }

    this.notify();
    return job;
  }

  _handleEvent(job, chunk, fileName) {
    const payload = parseSseChunk(chunk);
    if (!payload) return;
    const type = payload.type || "unknown";

    if (type === "progress") {
      const message = payload.message || "Processing…";
      if (/^Processing pages \d+ to \d+$/.test(message)) return;
      if (job.progress[job.progress.length - 1] !== message) {
        job.progress = [...job.progress, message];
      }
    } else if (type === "question_complete" || type === "question_error") {
      job.questions = [...job.questions, payload];
    } else if (type === "wallet_debit") {
      job.walletDebited = true;
      job.walletDebitedAmount = payload.amount_inr ?? null;
      job.walletBalance = payload.balance_inr ?? null;
      notifyWalletChanged();
    } else if (type === "final_summary") {
      applyFinalSummary(job, payload, fileName);
    } else if (type === "error") {
      job.status = "error";
      if (payload.code === "insufficient_wallet") {
        job.insufficientWallet = true;
        job.error =
          payload.message ||
          buildInsufficientWalletMessage({
            balance: payload.balance_inr,
            required: payload.required_inr,
          });
      } else if (payload.code === "maintenance" || payload.code === "wallet_billing_unavailable") {
        job.maintenance = true;
        job.error = payload.message || INSTAMARK_MAINTENANCE_MESSAGE;
      } else {
        job.error = payload.message || "Evaluation failed";
      }
      removeInstamarkTransaction(job.transactionId);
      writeInFlight(null);
      this.stopPolling();
    }

    this.notify();
  }

  startPolling(transactionId) {
    if (this._pollTimer) return;
    const poll = () => this.syncProcessingFromServer(transactionId);
    this._pollTimer = window.setInterval(poll, POLL_MS);
    poll();
  }

  stopPolling() {
    if (this._pollTimer) {
      window.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /** Poll server for in-flight evaluations — does NOT start a new evaluation or show live UI. */
  syncPendingEvaluations(onSynced) {
    const inFlight = readInFlight();
    const processingTx = loadInstamarkTransactions().find((tx) => tx.status === "processing");
    const transactionId = inFlight?.transactionId || processingTx?.id;
    if (!transactionId) return;

    const poll = async () => {
      await this.syncProcessingFromServer(transactionId, { silent: true });
      onSynced?.();
    };

    if (this._pollTimer) return;
    this._pollTimer = window.setInterval(poll, POLL_MS);
    poll();
  }

  async syncProcessingFromServer(transactionId, { silent = false } = {}) {
    const rows = await fetchInstamarkEvaluations(100);
    const match = rows.find((row) => row.client_transaction_id === transactionId);
    if (!match || match.status !== "completed") return;

    const { mapServerEvaluationToTransaction } = await import("./api");
    const { saveAnalysisFromCompletePackage } = await import("./instamarkTransactionAssets");
    const { questionItemsFromCompletePackage, summaryFromCompletePackage } = await import(
      "./analysisFromPackage"
    );

    const mapped = mapServerEvaluationToTransaction(match);
    const questions = questionItemsFromCompletePackage(match.complete_package);
    const summary = summaryFromCompletePackage(match.complete_package, {
      evaluation_id: match.id,
      persisted: true
    });

    updateInstamarkTransaction(transactionId, {
      ...mapped,
      id: transactionId,
      status: "completed",
      hasAnalysisReport: questions.length > 0
    });

    if (questions.length) {
      await saveAnalysisFromCompletePackage(transactionId, match.complete_package, {
        sourceFileName: match.file_name
      });
    }

    if (this.job?.transactionId === transactionId && !silent) {
      this.job.status = "completed";
      this.job.questions = questions;
      this.job.summary = summary;
      this.job.disconnected = false;
      this.job.error = null;
      this.notify();
    }

    writeInFlight(null);
    this.stopPolling();
  }
}

export const evaluationRunner = new EvaluationRunner();
