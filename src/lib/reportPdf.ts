import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { IntercompanyInvoiceView, TimesheetView } from "../types/db";
import { euro, numberIt } from "./format";
import { downloadPdf, safeFilename } from "./pdfPreview";

declare module "jspdf" {
  interface jsPDF { lastAutoTable?: { finalY?: number } }
}

type PdfFilters = { month: number; year: number; title?: string };
type MonthlyRow = { da: string; a: string; area: string; ore: number; orePesate: number; imponibile: number; iva: number; totale: number; righe: number; contestazioni: boolean };
const pageMargin = 12;

function safe(value: unknown, fallback = "—") { return value === null || value === undefined || value === "" ? fallback : String(value); }
function asNumber(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(18, 59, 99);
  doc.rect(0, 0, width, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255,255,255);
  doc.setFontSize(15);
  doc.text(title, pageMargin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, pageMargin, 18);
  doc.setTextColor(20,32,51);
}

function drawSummaryCards(doc: jsPDF, cards: {label:string; value:string}[], y = 30) {
  const usableWidth = doc.internal.pageSize.getWidth() - pageMargin * 2;
  const cardWidth = usableWidth / cards.length - 2;
  cards.forEach((card, index) => {
    const x = pageMargin + index * (cardWidth + 2);
    doc.setDrawColor(210,225,240);
    doc.setFillColor(247,250,253);
    doc.roundedRect(x, y, cardWidth, 18, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(card.label.toUpperCase(), x + 3, y + 6);
    doc.setFontSize(11);
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
    doc.setTextColor(110,122,140);
    doc.text(`Generato il ${new Date().toLocaleString("it-IT")} · KPI / Contabilità ore infragruppo`, pageMargin, height - 8);
    doc.text(`Pagina ${page} di ${pageCount}`, width - pageMargin, height - 8, { align: "right" });
  }
}

export function createTimesheetReportDoc(rows: TimesheetView[], filters: PdfFilters) {
  const title = filters.title ?? "Report ore registrate";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totaleOre = rows.reduce((acc, r) => acc + asNumber(r.ore), 0);
  const totaleOrePesate = rows.reduce((acc, r) => acc + asNumber(r.ore_pesate), 0);
  const totaleImporto = rows.reduce((acc, r) => acc + asNumber(r.importo_visibile), 0);
  const contestate = rows.filter((r) => r.is_contested).length;

  drawHeader(doc, title, `Competenza: ${String(filters.month).padStart(2,"0")}/${filters.year}`);
  const y = drawSummaryCards(doc, [
    { label: "Righe", value: String(rows.length) },
    { label: "Ore", value: numberIt(totaleOre) },
    { label: "Ore pesate", value: numberIt(totaleOrePesate) },
    { label: "Importo", value: euro(totaleImporto) },
    { label: "Contestazioni", value: String(contestate) },
  ]);
  autoTable(doc, {
    startY: y,
    margin: { left: pageMargin, right: pageMargin },
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [232,239,247], textColor: [15,33,58] },
    head: [["Data", "Dipendente", "Da società", "A società", "Area", "Commessa", "Attività", "Ore", "Pesate", "Importo", "Stato", "Descrizione / note dipendente"]],
    body: rows.map((r) => [
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

export function createMonthlySummaryReportDoc(rows: MonthlyRow[], filters: {month:number; year:number}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totals = rows.reduce((acc, r) => ({ ore: acc.ore + asNumber(r.ore), orePesate: acc.orePesate + asNumber(r.orePesate), imponibile: acc.imponibile + asNumber(r.imponibile), iva: acc.iva + asNumber(r.iva), totale: acc.totale + asNumber(r.totale) }), { ore:0, orePesate:0, imponibile:0, iva:0, totale:0 });
  drawHeader(doc, "Riepilogo mese", `Competenza: ${String(filters.month).padStart(2,"0")}/${filters.year}`);
  const y = drawSummaryCards(doc, [
    { label: "Flussi", value: String(rows.length) }, { label: "Ore", value: numberIt(totals.ore) }, { label: "Ore pesate", value: numberIt(totals.orePesate) }, { label: "Imponibile", value: euro(totals.imponibile) }, { label: "Totale lordo", value: euro(totals.totale) },
  ]);
  autoTable(doc, { startY: y, margin: { left: pageMargin, right: pageMargin }, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [232,239,247], textColor: [15,33,58] }, head: [["Da società", "A società", "Area", "Righe", "Ore", "Ore pesate", "Imponibile", "IVA", "Totale", "Note"]], body: rows.map((r) => [safe(r.da), safe(r.a), safe(r.area), String(r.righe), numberIt(r.ore), numberIt(r.orePesate), euro(r.imponibile), euro(r.iva), euro(r.totale), r.contestazioni ? "Contiene contestazioni" : "OK"]) });
  addFooter(doc);
  return doc;
}

export function createInvoicesReportDoc(rows: IntercompanyInvoiceView[], filters: {month:number; year:number}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  drawHeader(doc, "Fatture infragruppo", `Competenza: ${String(filters.month).padStart(2,"0")}/${filters.year}`);
  autoTable(doc, { startY: 32, margin: { left: pageMargin, right: pageMargin }, styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" }, headStyles: { fillColor: [232,239,247], textColor: [15,33,58] }, head: [["Emittente", "Destinataria", "Mese", "Imponibile", "IVA", "Totale", "Stato", "Numero", "Data", "Note"]], body: rows.map((r) => [safe(r.employer_company_code ?? r.employer_company_name), safe(r.beneficiary_company_code ?? r.beneficiary_company_name), `${r.mese}/${r.anno}`, euro(r.imponibile), euro(r.iva), euro(r.totale), safe(r.stato), safe(r.numero_fattura), safe(r.data_fattura), safe(r.note)]) });
  addFooter(doc);
  return doc;
}

export function printTimesheetReport(rows: TimesheetView[], filters: PdfFilters) {
  if (!rows.length) { window.alert("Nessuna riga da esportare nel PDF per il periodo selezionato."); return; }
  downloadPdf(createTimesheetReportDoc(rows, filters), `${safeFilename(filters.title ?? "report-ore")}-${filters.year}-${String(filters.month).padStart(2,"0")}.pdf`);
}

export function printMonthlySummaryReport(rows: MonthlyRow[], filters: {month:number; year:number}) {
  if (!rows.length) { window.alert("Nessun dato da esportare nel PDF per il mese selezionato."); return; }
  downloadPdf(createMonthlySummaryReportDoc(rows, filters), `riepilogo-mese-${filters.year}-${String(filters.month).padStart(2,"0")}.pdf`);
}

export function printInvoicesReport(rows: IntercompanyInvoiceView[], filters: {month:number; year:number}) {
  if (!rows.length) { window.alert("Nessuna fattura da esportare nel PDF per il mese selezionato."); return; }
  downloadPdf(createInvoicesReportDoc(rows, filters), `fatture-infragruppo-${filters.year}-${String(filters.month).padStart(2,"0")}.pdf`);
}

export function downloadTimesheetCsv(rows: TimesheetView[], filename: string) {
  const header = ["Data", "Dipendente", "Email", "Da Societa", "A Societa", "Area", "Commessa", "Attivita", "Ore", "Importo", "Descrizione"];
  const csvContent = [header.join(";"), ...rows.map(r => [r.data, r.employee_name, r.employee_email, r.employer_company_code, r.beneficiary_company_code, r.codice_area, r.codice_commessa, r.codice_attivita, String(r.ore).replace(".", ","), String(r.importo_visibile || 0).replace(".", ","), (r.descrizione || "").replace(/;/g, ",")].join(";"))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Compatibilità con vecchie pagine Report.tsx.
 * Alcune versioni del frontend importano ancora generateTimesheetPdf.
 * Manteniamo questo alias per evitare errori di build.
 */
export function generateTimesheetPdf(
  rows: TimesheetView[],
  arg2?: PdfFilters | number | string,
  arg3?: number,
  arg4?: string
) {
  const now = new Date();
  const filters: PdfFilters =
    typeof arg2 === "object" && arg2 !== null
      ? arg2
      : typeof arg2 === "number"
        ? { month: arg2, year: typeof arg3 === "number" ? arg3 : now.getFullYear(), title: arg4 ?? "Report ore registrate" }
        : { month: now.getMonth() + 1, year: now.getFullYear(), title: typeof arg2 === "string" ? arg2 : "Report ore registrate" };

  return createTimesheetReportDoc(rows, filters);
}
