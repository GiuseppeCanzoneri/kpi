import jsPDF from "jspdf";
import type { IntercompanyInvoiceView, TimesheetView } from "../types/db";
import { euro, numberIt } from "./format";
import { downloadPdf, safeFilename } from "./pdfPreview";

type PdfFilters = { month: number; year: number; title?: string };
type MonthlyRow = {
  da: string;
  a: string;
  area: string;
  ore: number;
  orePesate: number;
  imponibile: number;
  iva: number;
  totale: number;
  righe: number;
  contestazioni: boolean;
};

type TableColumn = { header: string; width: number; align?: "left" | "right" | "center" };

type TableOptions = {
  startY: number;
  columns: TableColumn[];
  rows: Array<Array<unknown>>;
  fontSize?: number;
  rowPadding?: number;
};

const pageMargin = 12;

function safe(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function asNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(18, 59, 99);
  doc.rect(0, 0, width, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(title, pageMargin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, pageMargin, 18);
  doc.setTextColor(20, 32, 51);
}

function drawSummaryCards(doc: jsPDF, cards: { label: string; value: string }[], y = 30) {
  const usableWidth = doc.internal.pageSize.getWidth() - pageMargin * 2;
  const gap = 3;
  const cardWidth = (usableWidth - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x = pageMargin + index * (cardWidth + gap);
    doc.setDrawColor(210, 225, 240);
    doc.setFillColor(247, 250, 253);
    doc.roundedRect(x, y, cardWidth, 18, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(110, 122, 140);
    doc.text(card.label.toUpperCase(), x + 3, y + 6);
    doc.setFontSize(11);
    doc.setTextColor(20, 32, 51);
    doc.text(card.value, x + 3, y + 14);
  });
  return y + 25;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 122, 140);
    doc.text(`Generato il ${new Date().toLocaleString("it-IT")} · KPI / Contabilità ore infragruppo`, pageMargin, height - 8);
    doc.text(`Pagina ${page} di ${pageCount}`, width - pageMargin, height - 8, { align: "right" });
  }
}

function splitCell(doc: jsPDF, value: unknown, width: number): string[] {
  const text = safe(value, "");
  const parts = text.split("\n");
  return parts.flatMap((part) => {
    const split = doc.splitTextToSize(part || " ", Math.max(8, width - 4));
    return Array.isArray(split) ? split : [split];
  });
}

function alignX(x: number, width: number, align: TableColumn["align"]) {
  if (align === "right") return x + width - 2;
  if (align === "center") return x + width / 2;
  return x + 2;
}

function drawTableHeader(doc: jsPDF, columns: TableColumn[], y: number, headerHeight = 9) {
  let x = pageMargin;
  doc.setFillColor(232, 239, 247);
  doc.setDrawColor(205, 220, 235);
  doc.setTextColor(15, 33, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  columns.forEach((column) => {
    doc.rect(x, y, column.width, headerHeight, "FD");
    doc.text(column.header.toUpperCase(), alignX(x, column.width, column.align), y + 5.8, { align: column.align ?? "left" });
    x += column.width;
  });
  return y + headerHeight;
}

function drawManualTable(doc: jsPDF, options: TableOptions) {
  const fontSize = options.fontSize ?? 7;
  const rowPadding = options.rowPadding ?? 2;
  const lineHeight = fontSize * 0.42;
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - 16;
  let y = drawTableHeader(doc, options.columns, options.startY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(20, 32, 51);

  options.rows.forEach((row, rowIndex) => {
    const linesByCell = row.map((cell, index) => splitCell(doc, cell, options.columns[index]?.width ?? 20));
    const maxLines = Math.max(1, ...linesByCell.map((lines) => lines.length));
    const rowHeight = Math.max(8, maxLines * lineHeight + rowPadding * 2 + 1);

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawTableHeader(doc, options.columns, 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(20, 32, 51);
    }

    let x = pageMargin;
    const fill = rowIndex % 2 === 0 ? 255 : 250;
    options.columns.forEach((column, columnIndex) => {
      doc.setDrawColor(225, 233, 242);
      doc.setFillColor(fill, fill + (fill === 255 ? 0 : 2), 255);
      doc.rect(x, y, column.width, rowHeight, "FD");
      const lines = linesByCell[columnIndex] ?? [""];
      lines.slice(0, 14).forEach((line, lineIndex) => {
        const yy = y + rowPadding + 3 + lineIndex * lineHeight;
        const xx = alignX(x, column.width, column.align);
        doc.text(line, xx, yy, { align: column.align ?? "left" });
      });
      x += column.width;
    });
    y += rowHeight;
  });
  return y;
}

export function createTimesheetReportDoc(rows: TimesheetView[], filters: PdfFilters) {
  const title = filters.title ?? "Report ore registrate";
  const sortedRows = [...rows].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totaleOre = sortedRows.reduce((acc, r) => acc + asNumber(r.ore), 0);
  const totaleOrePesate = sortedRows.reduce((acc, r) => acc + asNumber(r.ore_pesate), 0);
  const totaleImporto = sortedRows.reduce((acc, r) => acc + asNumber(r.importo_visibile), 0);
  const contestate = sortedRows.filter((r) => r.is_contested).length;

  drawHeader(doc, title, `Competenza: ${String(filters.month).padStart(2, "0")}/${filters.year}`);
  const y = drawSummaryCards(doc, [
    { label: "Righe", value: String(sortedRows.length) },
    { label: "Ore", value: numberIt(totaleOre) },
    { label: "Ore pesate", value: numberIt(totaleOrePesate) },
    { label: "Importo", value: euro(totaleImporto) },
    { label: "Contestazioni", value: String(contestate) },
  ]);

  drawManualTable(doc, {
    startY: y,
    fontSize: 6.6,
    columns: [
      { header: "Data", width: 19 },
      { header: "Dipendente", width: 32 },
      { header: "Da", width: 22 },
      { header: "A", width: 22 },
      { header: "Area", width: 18 },
      { header: "Commessa", width: 30 },
      { header: "Attività", width: 30 },
      { header: "Ore", width: 14, align: "right" },
      { header: "Pesate", width: 15, align: "right" },
      { header: "Importo", width: 22, align: "right" },
      { header: "Stato", width: 24 },
      { header: "Descrizione / note", width: 49 },
    ],
    rows: sortedRows.map((r) => [
      safe(r.data),
      `${safe(r.employee_name)}\n${safe(r.employee_email, "")}`.trim(),
      safe(r.employer_company_code ?? r.employer_company_name),
      safe(r.beneficiary_company_code ?? r.beneficiary_company_name),
      safe(r.codice_area ?? r.nome_area),
      `${safe(r.codice_commessa)}\n${safe(r.descrizione_commessa, "")}`.trim(),
      `${safe(r.codice_attivita)}\n${safe(r.nome_categoria, "")}`.trim(),
      numberIt(r.ore),
      numberIt(r.ore_pesate),
      r.importo_visibile === null ? "Riservato" : euro(r.importo_visibile),
      r.is_contested ? `Contestata\n${safe(r.contest_reason, "")}`.trim() : safe(r.stato, "Approvato"),
      [r.descrizione, r.note, r.correction_note ? `Correzione: ${r.correction_note}` : null].filter(Boolean).join("\n"),
    ]),
  });
  addFooter(doc);
  return doc;
}

export function createMonthlySummaryReportDoc(rows: MonthlyRow[], filters: { month: number; year: number }) {
  const sortedRows = [...rows].sort((a, b) => `${b.da}-${b.a}-${b.area}`.localeCompare(`${a.da}-${a.a}-${a.area}`));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totals = sortedRows.reduce(
    (acc, r) => ({
      ore: acc.ore + asNumber(r.ore),
      orePesate: acc.orePesate + asNumber(r.orePesate),
      imponibile: acc.imponibile + asNumber(r.imponibile),
      iva: acc.iva + asNumber(r.iva),
      totale: acc.totale + asNumber(r.totale),
    }),
    { ore: 0, orePesate: 0, imponibile: 0, iva: 0, totale: 0 }
  );
  drawHeader(doc, "Riepilogo mese", `Competenza: ${String(filters.month).padStart(2, "0")}/${filters.year}`);
  const y = drawSummaryCards(doc, [
    { label: "Flussi", value: String(sortedRows.length) },
    { label: "Ore", value: numberIt(totals.ore) },
    { label: "Ore pesate", value: numberIt(totals.orePesate) },
    { label: "Imponibile", value: euro(totals.imponibile) },
    { label: "Totale lordo", value: euro(totals.totale) },
  ]);

  drawManualTable(doc, {
    startY: y,
    fontSize: 8,
    columns: [
      { header: "Da società", width: 38 },
      { header: "A società", width: 38 },
      { header: "Area", width: 35 },
      { header: "Righe", width: 18, align: "right" },
      { header: "Ore", width: 22, align: "right" },
      { header: "Ore pesate", width: 26, align: "right" },
      { header: "Imponibile", width: 28, align: "right" },
      { header: "IVA", width: 26, align: "right" },
      { header: "Totale", width: 28, align: "right" },
      { header: "Note", width: 38 },
    ],
    rows: sortedRows.map((r) => [
      safe(r.da),
      safe(r.a),
      safe(r.area),
      String(r.righe),
      numberIt(r.ore),
      numberIt(r.orePesate),
      euro(r.imponibile),
      euro(r.iva),
      euro(r.totale),
      r.contestazioni ? "Contiene contestazioni" : "OK",
    ]),
  });
  addFooter(doc);
  return doc;
}

export function createInvoicesReportDoc(rows: IntercompanyInvoiceView[], filters: { month: number; year: number }) {
  const sortedRows = [...rows].sort((a, b) => String(b.data_fattura ?? "").localeCompare(String(a.data_fattura ?? "")) || String(b.numero_fattura ?? "").localeCompare(String(a.numero_fattura ?? "")));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  drawHeader(doc, "Fatture infragruppo", `Competenza: ${String(filters.month).padStart(2, "0")}/${filters.year}`);

  drawManualTable(doc, {
    startY: 32,
    fontSize: 8,
    columns: [
      { header: "Emittente", width: 38 },
      { header: "Destinataria", width: 38 },
      { header: "Mese", width: 20 },
      { header: "Imponibile", width: 28, align: "right" },
      { header: "IVA", width: 26, align: "right" },
      { header: "Totale", width: 28, align: "right" },
      { header: "Stato", width: 28 },
      { header: "Numero", width: 28 },
      { header: "Data", width: 24 },
      { header: "Note", width: 59 },
    ],
    rows: sortedRows.map((r) => [
      safe(r.employer_company_code ?? r.employer_company_name),
      safe(r.beneficiary_company_code ?? r.beneficiary_company_name),
      `${r.mese}/${r.anno}`,
      euro(r.imponibile),
      euro(r.iva),
      euro(r.totale),
      safe(r.stato),
      safe(r.numero_fattura),
      safe(r.data_fattura),
      safe(r.note),
    ]),
  });
  addFooter(doc);
  return doc;
}

export function printTimesheetReport(rows: TimesheetView[], filters: PdfFilters) {
  if (!rows.length) {
    window.alert("Nessuna riga da esportare nel PDF per il periodo selezionato.");
    return;
  }
  downloadPdf(createTimesheetReportDoc(rows, filters), `${safeFilename(filters.title ?? "report-ore")}-${filters.year}-${String(filters.month).padStart(2, "0")}.pdf`);
}

export function printMonthlySummaryReport(rows: MonthlyRow[], filters: { month: number; year: number }) {
  if (!rows.length) {
    window.alert("Nessun dato da esportare nel PDF per il mese selezionato.");
    return;
  }
  downloadPdf(createMonthlySummaryReportDoc(rows, filters), `riepilogo-mese-${filters.year}-${String(filters.month).padStart(2, "0")}.pdf`);
}

export function printInvoicesReport(rows: IntercompanyInvoiceView[], filters: { month: number; year: number }) {
  if (!rows.length) {
    window.alert("Nessuna fattura da esportare nel PDF per il mese selezionato.");
    return;
  }
  downloadPdf(createInvoicesReportDoc(rows, filters), `fatture-infragruppo-${filters.year}-${String(filters.month).padStart(2, "0")}.pdf`);
}

export function downloadTimesheetCsv(rows: TimesheetView[], filename: string) {
  const header = ["Data", "Dipendente", "Email", "Da Societa", "A Societa", "Area", "Commessa", "Attivita", "Ore", "Importo", "Descrizione"];
  const csvContent = [
    header.join(";"),
    ...rows.map((r) =>
      [
        r.data,
        r.employee_name,
        r.employee_email,
        r.employer_company_code,
        r.beneficiary_company_code,
        r.codice_area,
        r.codice_commessa,
        r.codice_attivita,
        String(r.ore).replace(".", ","),
        String(r.importo_visibile || 0).replace(".", ","),
        (r.descrizione || "").replace(/;/g, ","),
      ].join(";")
    ),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateTimesheetPdf(rows: TimesheetView[], arg2?: PdfFilters | number | string, arg3?: number, arg4?: string) {
  const now = new Date();
  const filters: PdfFilters =
    typeof arg2 === "object" && arg2 !== null
      ? arg2
      : typeof arg2 === "number"
        ? { month: arg2, year: typeof arg3 === "number" ? arg3 : now.getFullYear(), title: arg4 ?? "Report ore registrate" }
        : { month: now.getMonth() + 1, year: now.getFullYear(), title: typeof arg2 === "string" ? arg2 : "Report ore registrate" };

  return createTimesheetReportDoc(rows, filters);
}
