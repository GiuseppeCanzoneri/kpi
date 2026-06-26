import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { IntercompanyInvoiceView, TimesheetView } from "../types/db";
import { euro, numberIt } from "./format";

// Estensione dei tipi per TypeScript
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

/**
 * Funzione helper per chiamare autoTable in modo sicuro, 
 * gestendo le differenze di importazione tra i vari ambienti.
 */
function safeAutoTable(doc: jsPDF, options: any) {
  try {
    if (typeof autoTable === 'function') {
      autoTable(doc, options);
    } else if ((autoTable as any).default && typeof (autoTable as any).default === 'function') {
      (autoTable as any).default(doc, options);
    } else if (typeof (doc as any).autoTable === 'function') {
      (doc as any).autoTable(options);
    } else {
      console.error("Impossibile trovare la funzione autoTable");
    }
  } catch (err) {
    console.error("Errore durante l'esecuzione di autoTable:", err);
  }
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Sfondo intestazione blu scuro
  doc.setFillColor(18, 57, 99);
  doc.rect(0, 0, pageWidth, 20, "F");
  
  // Testo intestazione bianco
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 12, 12);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 12, 17);
  
  // Reset colori
  doc.setTextColor(20, 32, 51);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(110, 122, 140);
    doc.text(`Generato il ${nowIt()} · KPI / Contabilità ore infragruppo`, 12, pageHeight - 10);
    doc.text(`Pagina ${page} di ${pageCount}`, pageWidth - 12, pageHeight - 10, { align: "right" });
  }
}

function addKpiSummary(doc: jsPDF, items: { label: string; value: string }[], y = 28) {
  const width = 65;
  const gap = 5;
  
  items.forEach((item, index) => {
    const x = 12 + index * (width + gap);
    
    // Box
    doc.setDrawColor(215, 225, 236);
    doc.setFillColor(247, 250, 253);
    doc.roundedRect(x, y, width, 18, 2, 2, "FD");
    
    // Label
    doc.setFontSize(7);
    doc.setTextColor(110, 122, 140);
    doc.setFont("helvetica", "bold");
    doc.text(item.label.toUpperCase(), x + 4, y + 6);
    
    // Value
    doc.setTextColor(18, 57, 99);
    doc.setFontSize(12);
    doc.text(item.value, x + 4, y + 14);
  });
  
  doc.setFont("helvetica", "normal");
  return y + 25;
}

function addTimesheetTable(doc: jsPDF, rows: TimesheetView[], startY: number, title: string) {
  if (rows.length === 0) return startY;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(18, 57, 99);
  doc.text(title, 12, startY);
  
  safeAutoTable(doc, {
    startY: startY + 5,
    head: [["Data", "Dipendente", "Da", "A", "Area", "Commessa", "Attività", "Ore", "Importo", "Descrizione"]],
    body: rows.map((r) => [
      r.data,
      `${r.employee_name}\n${r.employee_email}`,
      r.employer_company_code || "—",
      r.beneficiary_company_code || "—",
      r.codice_area || "—",
      `${r.codice_commessa}\n${r.descrizione_commessa || ""}`,
      `${r.codice_attivita}\n${r.nome_categoria || ""}`,
      numberIt(r.ore),
      r.importo_visibile === null ? "Riservato" : euro(r.importo_visibile),
      [
        r.descrizione || "—",
        r.note ? `Note: ${r.note}` : null,
        r.is_contested ? `CONTESTATA: ${r.contest_reason || "da verificare"}` : null
      ].filter(Boolean).join("\n")
    ]),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [18, 57, 99], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 251] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 30 },
      2: { cellWidth: 15 },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 35 },
      6: { cellWidth: 35 },
      7: { cellWidth: 12, halign: "right" },
      8: { cellWidth: 20, halign: "right" },
      9: { cellWidth: "auto" }
    },
    margin: { left: 12, right: 12 },
    didParseCell: (data: any) => {
      const row = rows[data.row.index];
      if (data.section === "body" && row?.is_contested) {
        data.cell.styles.fillColor = [255, 245, 230];
        data.cell.styles.textColor = [180, 35, 24];
      }
    }
  });

  return (doc.lastAutoTable?.finalY || startY) + 15;
}

export function generateTimesheetPdf(rows: TimesheetView[], filters: { month: number; year: number }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  
  const totalOre = rows.reduce((s, r) => s + Number(r.ore || 0), 0);
  const totalImporto = rows.reduce((s, r) => s + Number(r.importo_visibile || 0), 0);
  
  addHeader(doc, "Report Dettaglio Ore", `Periodo: ${filters.month}/${filters.year}`);
  
  const nextY = addKpiSummary(doc, [
    { label: "Righe Totali", value: String(rows.length) },
    { label: "Ore Totali", value: numberIt(totalOre) },
    { label: "Valore Economico", value: euro(totalImporto) }
  ]);
  
  addTimesheetTable(doc, rows, nextY, "Elenco prestazioni registrate");
  
  addFooter(doc);
  return doc;
}

export function generateMonthlySummaryPdf(summaryRows: MonthlyPdfRow[], detailRows: TimesheetView[], filters: { month: number; year: number }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  
  const totals = summaryRows.reduce((acc, r) => ({
    ore: acc.ore + r.ore,
    imponibile: acc.imponibile + r.imponibile,
    totale: acc.totale + r.totale
  }), { ore: 0, imponibile: 0, totale: 0 });

  addHeader(doc, "Riepilogo Mensile Consolidato", `Competenza: ${filters.month}/${filters.year}`);
  
  let nextY = addKpiSummary(doc, [
    { label: "Flussi Infragruppo", value: String(summaryRows.length) },
    { label: "Ore Approvate", value: numberIt(totals.ore) },
    { label: "Imponibile Totale", value: euro(totals.imponibile) },
    { label: "Totale Lordo", value: euro(totals.totale) }
  ]);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(18, 57, 99);
  doc.text("Sintesi per Società e Area", 12, nextY);

  safeAutoTable(doc, {
    startY: nextY + 5,
    head: [["Da Società", "A Società", "Area", "Righe", "Ore", "Ore Pesate", "Imponibile", "IVA", "Totale", "Stato"]],
    body: summaryRows.map((r) => [
      r.da, r.a, r.area, String(r.righe),
      numberIt(r.ore), numberIt(r.orePesate),
      euro(r.imponibile), euro(r.iva), euro(r.totale),
      r.contestazioni ? "CONTESTAZIONI" : "OK"
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 57, 99], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 248, 251] },
    margin: { left: 12, right: 12 }
  });

  nextY = (doc.lastAutoTable?.finalY || nextY) + 15;
  
  if (nextY > 160) {
    doc.addPage();
    nextY = 25;
  }
  
  addTimesheetTable(doc, detailRows, nextY, "Dettaglio analitico delle prestazioni");
  
  addFooter(doc);
  return doc;
}

export function generateIntercompanyInvoicesPdf(invoices: IntercompanyInvoiceView[], detailRows: TimesheetView[], filters: { month: number; year: number }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  
  const totals = invoices.reduce((acc, r) => ({
    imponibile: acc.imponibile + Number(r.imponibile || 0),
    totale: acc.totale + Number(r.totale || 0)
  }), { imponibile: 0, totale: 0 });

  addHeader(doc, "Prospetti Fatturazione Infragruppo", `Competenza: ${filters.month}/${filters.year}`);
  
  let nextY = addKpiSummary(doc, [
    { label: "Prospetti Generati", value: String(invoices.length) },
    { label: "Imponibile Totale", value: euro(totals.imponibile) },
    { label: "Totale Lordo", value: euro(totals.totale) }
  ]);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(18, 57, 99);
  doc.text("Elenco Prospetti Fattura", 12, nextY);

  safeAutoTable(doc, {
    startY: nextY + 5,
    head: [["Emittente", "Destinataria", "Mese", "Imponibile", "IVA", "Totale", "Stato", "Note"]],
    body: invoices.map((r) => [
      r.employer_company_code || r.employer_company_name || "—",
      r.beneficiary_company_code || r.beneficiary_company_name || "—",
      `${r.mese}/${r.anno}`,
      euro(Number(r.imponibile || 0)),
      euro(Number(r.iva || 0)),
      euro(Number(r.totale || 0)),
      r.stato,
      r.note || ""
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 57, 99], textColor: [255, 255, 255] },
    margin: { left: 12, right: 12 }
  });

  nextY = (doc.lastAutoTable?.finalY || nextY) + 15;
  
  if (nextY > 160) {
    doc.addPage();
    nextY = 25;
  }
  
  const intercompanyDetails = detailRows.filter(r => r.employer_company_id !== r.beneficiary_company_id);
  addTimesheetTable(doc, intercompanyDetails, nextY, "Dettaglio prestazioni incluse nei prospetti");
  
  addFooter(doc);
  return doc;
}

export function downloadTimesheetCsv(rows: TimesheetView[], filename: string) {
  const header = ["Data", "Dipendente", "Email", "Da Societa", "A Societa", "Area", "Commessa", "Attivita", "Ore", "Importo", "Descrizione"];
  const csvContent = [
    header.join(";"),
    ...rows.map(r => [
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
      (r.descrizione || "").replace(/;/g, ",")
    ].join(";"))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}