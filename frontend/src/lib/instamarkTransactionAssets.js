const DB_NAME = "instamark-assets";
const DB_VERSION = 1;
const PDF_STORE = "pdfs";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE, { keyPath: "transactionId" });
      }
    };
  });
}

export async function saveTransactionPdf(transactionId, file) {
  if (!transactionId || !file) return false;
  const db = await openDb();
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PDF_STORE).put({
      transactionId,
      fileName: file.name || "answer-sheet.pdf",
      mimeType: file.type || "application/pdf",
      data: buffer,
      savedAt: new Date().toISOString()
    });
  });
}

export async function hasTransactionPdf(transactionId) {
  if (!transactionId) return false;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const request = tx.objectStore(PDF_STORE).get(transactionId);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function downloadTransactionPdf(transactionId, fallbackName = "answer-sheet.pdf") {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const request = tx.objectStore(PDF_STORE).get(transactionId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (!record?.data) return false;

  const blob = new Blob([record.data], { type: record.mimeType || "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = record.fileName || fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
