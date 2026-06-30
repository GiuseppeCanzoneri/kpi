import type jsPDF from "jspdf";
import type { PdfPreviewState } from "../components/PdfPreviewModal";

export function makePdfPreview(doc: jsPDF, filename: string, title: string): PdfPreviewState {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  return { url, filename, title };
}

export function revokePdfPreview(preview: PdfPreviewState | null) {
  if (preview?.url) URL.revokeObjectURL(preview.url);
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function safeFilename(value: string) {
  return value
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
