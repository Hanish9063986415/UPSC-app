import {
  questionItemsFromCompletePackage,
  summaryFromCompletePackage
} from "./analysisFromPackage";

const DB_NAME = "instamark-assets";
const DB_VERSION = 2;
const ANALYSIS_STORE = "analysis";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (db.objectStoreNames.contains("pdfs")) {
        db.deleteObjectStore("pdfs");
      }
      if (!db.objectStoreNames.contains(ANALYSIS_STORE)) {
        db.createObjectStore(ANALYSIS_STORE, { keyPath: "transactionId" });
      }
    };
  });
}

/** Persist evaluation analysis for later HTML view/download (not the uploaded answer sheet). */
export async function saveTransactionAnalysis(transactionId, { questions, summary, sourceFileName }) {
  if (!transactionId || !questions?.length) return false;

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYSIS_STORE, "readwrite");
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(ANALYSIS_STORE).put({
      transactionId,
      sourceFileName: sourceFileName || "answer-sheet.pdf",
      questions,
      summary: summary || null,
      savedAt: new Date().toISOString()
    });
  });
}

export async function saveAnalysisFromCompletePackage(
  transactionId,
  completePackage,
  { sourceFileName, ...extras } = {}
) {
  const questions = questionItemsFromCompletePackage(completePackage);
  if (!questions.length) return false;
  return saveTransactionAnalysis(transactionId, {
    questions,
    summary: summaryFromCompletePackage(completePackage, extras),
    sourceFileName
  });
}

export async function getTransactionAnalysis(transactionId) {
  if (!transactionId) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYSIS_STORE, "readonly");
    const request = tx.objectStore(ANALYSIS_STORE).get(transactionId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function hasTransactionAnalysis(transactionId) {
  const record = await getTransactionAnalysis(transactionId);
  return Boolean(record?.questions?.length);
}

/**
 * Load analysis from IndexedDB; fetch from server only when local copy is missing.
 * Keeps server/API use to one hydration per transaction.
 */
export async function resolveTransactionAnalysis(
  transactionId,
  { serverEvaluationId, sourceFileName } = {}
) {
  let record = await getTransactionAnalysis(transactionId);
  if (record?.questions?.length) return record;
  if (!serverEvaluationId) return null;

  const { fetchInstamarkEvaluation } = await import("./api");
  const remote = await fetchInstamarkEvaluation(serverEvaluationId);
  if (!remote?.complete_package) return null;

  await saveAnalysisFromCompletePackage(transactionId, remote.complete_package, {
    sourceFileName: sourceFileName || "answer-sheet.pdf"
  });
  record = await getTransactionAnalysis(transactionId);
  return record?.questions?.length ? record : null;
}

async function loadExportHtml() {
  return import("./exportAnalysisHtml");
}

/** Download the generated evaluation analysis HTML report (not the uploaded file). */
export async function downloadTransactionAnalysis(
  transactionId,
  { sourceFileName = "answer-sheet.pdf", serverEvaluationId } = {}
) {
  const record = await resolveTransactionAnalysis(transactionId, {
    serverEvaluationId,
    sourceFileName
  });
  if (!record) return false;

  const { downloadAnalysisHtml } = await loadExportHtml();
  downloadAnalysisHtml({
    questions: record.questions,
    summary: record.summary,
    sourceFileName: record.sourceFileName || sourceFileName,
    mode: "built"
  });
  return true;
}

/** Open the evaluation analysis HTML report in a new tab. */
export async function viewTransactionAnalysis(
  transactionId,
  { sourceFileName = "answer-sheet.pdf", serverEvaluationId, previewWindow = null } = {}
) {
  const record = await resolveTransactionAnalysis(transactionId, {
    serverEvaluationId,
    sourceFileName
  });
  if (!record) return false;

  const { openAnalysisHtmlInWindow } = await loadExportHtml();
  openAnalysisHtmlInWindow(previewWindow, {
    questions: record.questions,
    summary: record.summary,
    sourceFileName: record.sourceFileName || sourceFileName,
    mode: "built"
  });
  return true;
}
