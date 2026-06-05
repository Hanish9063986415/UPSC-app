import { PDFDocument } from "pdf-lib";

export async function getPdfPageCount(file) {
  if (!file) {
    throw new Error("No PDF file provided.");
  }

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();

  if (!pageCount || pageCount < 1) {
    throw new Error("This PDF has no readable pages.");
  }

  return pageCount;
}
