import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { IntercompanyInvoiceView, TimesheetView } from "../types/db";
import { euro, numberIt } from "./format";

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

type PdfFilters = {
  month: number;
  year: number;
  title?: string;
};

const pageMargin = 12;

function safe(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function asNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fileSafe(value: string) {
  return value
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function savePdf(doc: jsPDF, filename: string) {
  try {
    doc.save(filename);
  } catch (error) {
    console.error("Errore salvataggio PDF", error);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function drawHeader(doc: jsPDF, title: string, filters: { month: number; year: number }) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, pageMargin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Competenza: ${String(filters.month).padStart(2, "0")}/${filters.year}`, pageMargin, 23);
  doc.text(`Generato il: ${new Date().toLocaleString("it-IT")}`, pageMargin, 28);
  doc.text("KPI / Contabilità ore infragruppo", pageMargin, 33);
}

function drawSummaryCards(
  doc: jsPDF,
  cards: { label: string; value: string }[],
  startY = 42,
) {
  const usableWidth = doc.internal.pageSize.getWidth() - pageMargin * 2;
  const cardWidth = usableWidth / cards.length - 2;

  cards.forEach((card, index) => {
    const x = pageMargin + index * (cardWidth + 2);
    doc.setDrawColor(210, 225, 240);
    doc.roundedRect(x, startY, cardWidth, 18, 3, 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(card.label.toUpperCase(), x + 3, startY + 6);
    doc.setFontSize(11);
    doc.text(card.value, x + 3, startY + 14);
  });

  return startY + 25;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Pagina ${page} di ${pageCount}`, width - pageMargin, height - 8, { align: "right" });
  }
}

export function printTimesheetReport(rows: TimesheetView[], filters: PdfFilters) {
  if (!rows.length) {
    window.alert("Nessuna riga da esportare nel PDF per il periodo selezionato.");
    return;
  }

  const title = filters.title ?? "Report ore registrate";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const totaleOre = rows.reduce((acc, r) => acc + asNumber(r.ore), 0);
  const totaleOrePesate = rows.reduce((acc, r) => acc + asNumber(r.ore_pesate), 0);
  const totaleImporto = rows.reduce((acc, r) => acc + asNumber(r.importo_visibile), 0);
  const contestate = rows.filter((r) => r.is_contested).length;

  drawHeader(doc, title, filters);
  const tableStartY = drawSummaryCards(doc, [
    { label: "Righe", value: String(rows.length) },
    { label: "Ore", value: numberIt(totaleOre) },
    { label: "Ore pesate", value: numberIt(totaleOrePesate) },
    { label: "Importo", value: euro(totaleImporto) },
    { label: "Contestazioni", value: String(contestate) },
  ]);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: pageMargin, right: pageMargin },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [232, 239, 247],
      textColor: [15, 33, 58],
    },
    bodyStyles: {
      textColor: [20, 34, 55],
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 28 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 14 },
      5: { cellWidth: 24 },
      6: { cellWidth: 22 },
      7: { cellWidth: 12, halign: "right" },
      8: { cellWidth: 14, halign: "right" },
      9: { cellWidth: 18, halign: "right" },
      10: { cellWidth: 20 },
      11: { cellWidth: 78 },
    },
    head: [[
      "Data",
      "Dipendente",
      "Da società",
      "A società",
      "Area",
      "Commessa",
      "Attività",
      "Ore",
      "Pesate",
      "Importo",
      "Stato",
      "Descrizione / note dipendente",
    ]],
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
      [r.descrizione, r.note, r.correction_note ? `Correzione: ${r.correction_note}` : null]
        .filter(Boolean)
        .map((v) => String(v))
        .join("\n"),
    ]),
  });

  addFooter(doc);
  savePdf(doc, `${fileSafe(title)}-${filters.year}-${String(filters.month).padStart(2, "0")}.pdf`);
}

export function printMonthlySummaryReport(rows: MonthlyRow[], filters: { month: number; year: number }) {
  if (!rows.length) {
    window.alert("Nessun dato da esportare nel PDF per il mese selezionato.");
    return;
  }

  const title = "Riepilogo mese";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totals = rows.reduce(
    (acc, r) => ({
      ore: acc.ore + asNumber(r.ore),
      orePesate: acc.orePesate + asNumber(r.orePesate),
      imponibile: acc.imponibile + asNumber(r.imponibile),
      iva: acc.iva + asNumber(r.iva),
      totale: acc.totale + asNumber(r.totale),
    }),
    { ore: 0, orePesate: 0, imponibile: 0, iva: 0, totale: 0 },
  );

  drawHeader(doc, title, filters);
  const tableStartY = drawSummaryCards(doc, [
    { label: "Flussi", value: String(rows.length) },
    { label: "Ore", value: numberIt(totals.ore) },
    { label: "Ore pesate", value: numberIt(totals.orePesate) },
    { label: "Imponibile", value: euro(totals.imponibile) },
    { label: "Totale lordo", value: euro(totals.totale) },
  ]);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: pageMargin, right: pageMargin },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [232, 239, 247], textColor: [15, 33, 58] },
    head: [["Da società", "A società", "Area", "Righe", "Ore", "Ore pesate", "Imponibile", "IVA", "Totale", "Note"]],
    body: rows.map((r) => [
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
  savePdf(doc, `riepilogo-mese-${filters.year}-${String(filters.month).padStart(2, "0")}.pdf`);
}

export function printInvoicesReport(rows: IntercompanyInvoiceView[], filters: { month: number; year: number }) {
  if (!rows.length) {
    window.alert("Nessuna fattura da esportare nel PDF per il mese selezionato.");
    return;
  }

  const title = "Fatture infragruppo";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totals = rows.reduce(
    (acc, r) => ({
      imponibile: acc.imponibile + asNumber(r.imponibile),
      iva: acc.iva + asNumber(r.iva),
      totale: acc.totale + asNumber(r.totale),
    }),
    { imponibile: 0, iva: 0, totale: 0 },
  );

  drawHeader(doc, title, filters);
  const tableStartY = drawSummaryCards(doc, [
    { label: "Prospetti", value: String(rows.length) },
    { label: "Imponibile", value: euro(totals.imponibile) },
    { label: "IVA", value: euro(totals.iva) },
    { label: "Totale", value: euro(totals.totale) },
  ]);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: pageMargin, right: pageMargin },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [232, 239, 247], textColor: [15, 33, 58] },
    head: [["Emittente", "Destinataria", "Competenza", "Imponibile", "IVA", "Totale", "Numero", "Data", "Stato", "Note"]],
    body: rows.map((r) => [
      safe(r.employer_company_code ?? r.employer_company_name),
      safe(r.beneficiary_company_code ?? r.beneficiary_company_name),
      `${r.mese}/${r.anno}`,
      euro(r.imponibile),
      euro(r.iva),
      euro(r.totale),
      safe(r.numero_fattura),
      safe(r.data_fattura),
      safe(r.stato),
      safe(r.note),
    ]),
  });

  addFooter(doc);
  savePdf(doc, `fatture-infragruppo-${filters.year}-${String(filters.month).padStart(2, "0")}.pdf`);
}

export function downloadTimesheetCsv(rows: TimesheetView[], filename: string) {
  const header = [
    "Data",
    "Dipendente",
    "Email",
    "Da societa",
    "A societa",
    "Area",
    "Commessa",
    "Attivita",
    "Ore",
    "Ore pesate",
    "Importo",
    "Contestata",
    "Descrizione",
    "Note",
  ];

  const lines = rows.map((r) => [
    r.data,
    r.employee_name,
    r.employee_email,
    r.employer_company_code,
    r.beneficiary_company_code,
    r.codice_area,
    r.codice_commessa,
    r.codice_attivita,
    numberIt(r.ore),
    numberIt(r.ore_pesate),
    r.importo_visibile === null ? "Riservato" : String(r.importo_visibile),
    r.is_contested ? "SI" : "NO",
    r.descrizione ?? "",
    r.note ?? "",
  ]);

  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
