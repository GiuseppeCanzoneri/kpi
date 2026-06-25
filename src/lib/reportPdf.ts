import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { IntercompanyInvoiceView, TimesheetView } from "../types/db";
import { euro, numberIt } from "./format";

declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: { finalY?: number };
  }
}

export type MonthlyPdfRow = {
  key: string;
  employer_company_id: string;
  beneficiary_company_id: string;
  business_area_id: string;
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

const nowIt = () => new Date().toLocaleString("it-IT");
const value = (v: unknown, fallback = "—") => String(v ?? "").trim() || fallback;

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(18, 57, 99);
  doc.rect(0, 0, 297, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 12, 11);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 12, 16);
  doc.setTextColor(20, 32, 51);
  doc.setFont("helvetica", "normal");
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(110, 122, 140);
    doc.text(`Generato il ${nowIt()} · KPI / Contabilità ore infragruppo`, 12, 205);
    doc.text(`Pagina ${page} di ${pageCount}`, 270, 205, { align: "right" });
  }
  doc.setTextColor(20, 32, 51);
}

function addKpiRow(doc: jsPDF, items: { label: string; value: string }[], y = 24) {
  const width = 64;
  const gap = 4;
  items.slice(0, 4).forEach((item, index) => {
    const x = 12 + index * (width + gap);
    doc.setDrawColor(215, 225, 236);
    doc.setFillColor(247, 250, 253);
    doc.roundedRect(x, y, width, 17, 2, 2, "FD");
    doc.setFontSize(7);
    doc.setTextColor(110, 122, 140);
    doc.setFont("helvetica", "bold");
    doc.text(item.label.toUpperCase(), x + 3, y + 6);
    doc.setTextColor(20, 32, 51);
    doc.setFontSize(11);
    doc.text(item.value, x + 3, y + 13);
  });
  doc.setFont("helvetica", "normal");
}

function descriptionText(row: TimesheetView) {
  const parts = [
    row.descrizione ? `Descrizione: ${row.descrizione}` : "Descrizione: —",
    row.note ? `Note: ${row.note}` : null,
    row.is_contested ? `Contestazione: ${row.contest_reason ?? "da verificare"}` : null,
    row.correction_note ? `Correzione: ${row.correction_note}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

function addTimesheetDetailTable(doc: jsPDF, rows: TimesheetView[], startY: number, title = "Dettaglio ore e descrizioni dipendenti") {
  if (rows.length === 0) return startY;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 12, startY);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: startY + 4,
    head: [["Data", "Dipendente", "Da", "A", "Area", "Commessa", "Attività", "Ore", "Importo", "Descrizione scritta dal dipendente"]],
    body: rows.map((r) => [
      value(r.data),
      `${value(r.employee_name)}\n${value(r.employee_email, "")}`,
      value(r.employer_company_code),
      value(r.beneficiary_company_code),
      value(r.codice_area),
      `${value(r.codice_commessa)}\n${value(r.descrizione_commessa, "")}`,
      `${value(r.codice_attivita)}\n${value(r.nome_categoria, "")}`,
      numberIt(r.ore),
      r.importo_visibile === null ? "Riservato" : euro(Number(r.importo_visibile ?? 0)),
      descriptionText(r),
    ]),
    styles: { fontSize: 6.6, cellPadding: 1.5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [18, 57, 99], textColor: [255, 255, 255], fontSize: 6.5 },
    alternateRowStyles: { fillColor: [247, 250, 253] },
    columnStyles: {
      0: { cellWidth: 17 },
      1: { cellWidth: 28 },
      2: { cellWidth: 16 },
      3: { cellWidth: 16 },
      4: { cellWidth: 13 },
      5: { cellWidth: 32 },
      6: { cellWidth: 32 },
      7: { cellWidth: 10, halign: "right" },
      8: { cellWidth: 18, halign: "right" },
      9: { cellWidth: 85 },
    },
    margin: { left: 12, right: 12 },
    didParseCell: (data) => {
      const row = rows[data.row.index];
      if (data.section === "body" && row?.is_contested) {
        data.cell.styles.fillColor = [255, 248, 232];
      }
    },
  });

  return (doc.lastAutoTable?.finalY ?? startY) + 8;
}

export function generateTimesheetPdf(rows: TimesheetView[], filters: { month: number; year: number; title?: string }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = filters.title ?? "Report ore registrate";
  const totaleOre = rows.reduce((acc, r) => acc + Number(r.ore ?? 0), 0);
  const totaleOrePesate = rows.reduce((acc, r) => acc + Number(r.ore_pesate ?? 0), 0);
  const totaleImporto = rows.reduce((acc, r) => acc + Number(r.importo_visibile ?? 0), 0);
  const contestate = rows.filter((r) => r.is_contested).length;

  addHeader(doc, title, `Competenza ${filters.month}/${filters.year}`);
  addKpiRow(doc, [
    { label: "Righe", value: String(rows.length) },
    { label: "Ore", value: numberIt(totaleOre) },
    { label: "Ore pesate", value: numberIt(totaleOrePesate) },
    { label: "Importo", value: euro(totaleImporto) },
  ]);

  if (contestate) {
    doc.setFontSize(8);
    doc.setTextColor(180, 35, 24);
    doc.text(`${contestate} righe contestate incluse nel report.`, 12, 47);
    doc.setTextColor(20, 32, 51);
  }

  addTimesheetDetailTable(doc, rows, 54);
  addFooter(doc);
  return doc;
}

export function generateMonthlySummaryPdf(summaryRows: MonthlyPdfRow[], detailRows: TimesheetView[], filters: { month: number; year: number }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totals = summaryRows.reduce((acc, r) => ({
    ore: acc.ore + r.ore,
    orePesate: acc.orePesate + r.orePesate,
    imponibile: acc.imponibile + r.imponibile,
    iva: acc.iva + r.iva,
    totale: acc.totale + r.totale,
  }), { ore: 0, orePesate: 0, imponibile: 0, iva: 0, totale: 0 });

  addHeader(doc, "Riepilogo mese", `Competenza ${filters.month}/${filters.year}`);
  addKpiRow(doc, [
    { label: "Flussi", value: String(summaryRows.length) },
    { label: "Ore", value: numberIt(totals.ore) },
    { label: "Imponibile", value: euro(totals.imponibile) },
    { label: "Totale lordo", value: euro(totals.totale) },
  ]);

  autoTable(doc, {
    startY: 48,
    head: [["Da società", "A società", "Area", "Righe", "Ore", "Ore pesate", "Imponibile", "IVA", "Totale", "Note"]],
    body: summaryRows.map((r) => [
      r.da,
      r.a,
      r.area,
      String(r.righe),
      numberIt(r.ore),
      numberIt(r.orePesate),
      euro(r.imponibile),
      euro(r.iva),
      euro(r.totale),
      r.contestazioni ? "Contiene contestazioni" : "OK",
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [18, 57, 99], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [247, 250, 253] },
    margin: { left: 12, right: 12 },
  });

  let y = (doc.lastAutoTable?.finalY ?? 80) + 10;
  if (y > 165) {
    doc.addPage();
    y = 24;
  }
  addTimesheetDetailTable(doc, detailRows, y, "Dettaglio ore: descrizioni inserite dai dipendenti");
  addFooter(doc);
  return doc;
}

export function generateIntercompanyInvoicesPdf(invoices: IntercompanyInvoiceView[], detailRows: TimesheetView[], filters: { month: number; year: number }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const totals = invoices.reduce((acc, r) => ({
    imponibile: acc.imponibile + Number(r.imponibile ?? 0),
    iva: acc.iva + Number(r.iva ?? 0),
    totale: acc.totale + Number(r.totale ?? 0),
  }), { imponibile: 0, iva: 0, totale: 0 });

  addHeader(doc, "Fatture infragruppo", `Competenza ${filters.month}/${filters.year}`);
  addKpiRow(doc, [
    { label: "Prospetti", value: String(invoices.length) },
    { label: "Imponibile", value: euro(totals.imponibile) },
    { label: "IVA", value: euro(totals.iva) },
    { label: "Totale", value: euro(totals.totale) },
  ]);

  autoTable(doc, {
    startY: 48,
    head: [["Emittente", "Destinataria", "Competenza", "Imponibile", "IVA", "Totale", "Numero", "Data", "Stato", "Note"]],
    body: invoices.map((r) => [
      value(r.employer_company_code ?? r.employer_company_name),
      value(r.beneficiary_company_code ?? r.beneficiary_company_name),
      `${r.mese}/${r.anno}`,
      euro(Number(r.imponibile ?? 0)),
      euro(Number(r.iva ?? 0)),
      euro(Number(r.totale ?? 0)),
      value(r.numero_fattura),
      value(r.data_fattura),
      value(r.stato),
      value(r.note, ""),
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [18, 57, 99], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [247, 250, 253] },
    margin: { left: 12, right: 12 },
  });

  let y = (doc.lastAutoTable?.finalY ?? 80) + 10;
  const details = detailRows.filter((r) => r.employer_company_id !== r.beneficiary_company_id && r.tipo_movimento === "Infragruppo fatturabile");
  if (y > 165) {
    doc.addPage();
    y = 24;
  }
  addTimesheetDetailTable(doc, details, y, "Dettaglio ore incluse nelle fatture: descrizioni dipendenti");
  addFooter(doc);
  return doc;
}

export function downloadTimesheetCsv(rows: TimesheetView[], filename: string) {
  const header = ["Data", "Dipendente", "Email", "Da societa", "A societa", "Area", "Commessa", "Attivita", "Ore", "Ore pesate", "Importo", "Contestata", "Descrizione", "Note"];
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
  const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
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

export function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
