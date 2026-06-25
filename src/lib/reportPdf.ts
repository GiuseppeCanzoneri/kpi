import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TimesheetView } from "../types/db";
import { euro, numberIt } from "./format";

declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: { finalY?: number };
  }
}

export function generateTimesheetPdf(rows: TimesheetView[], filters: { month: number; year: number; title?: string }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = filters.title ?? "Elenco Ore Registrate";
  const totaleOre = rows.reduce((acc, r) => acc + Number(r.ore ?? 0), 0);
  const totaleOrePesate = rows.reduce((acc, r) => acc + Number(r.ore_pesate ?? 0), 0);
  const totaleImporto = rows.reduce((acc, r) => acc + Number(r.importo_visibile ?? 0), 0);

  doc.setFontSize(16);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generato il ${new Date().toLocaleString("it-IT")}`, 14, 21);
  doc.text(`Filtri: mese ${filters.month} / anno ${filters.year}`, 14, 26);
  doc.text(`Totale ore: ${numberIt(totaleOre)} | Ore pesate: ${numberIt(totaleOrePesate)} | Importo: ${euro(totaleImporto)}`, 14, 31);

  autoTable(doc, {
    startY: 36,
    head: [["Data", "Utente", "Da società", "A società", "Commessa", "Area", "Centro costo", "Ore", "Ore pesate", "Tariffa", "Importo", "Categoria", "Descrizione", "Stato"]],
    body: rows.map((r) => [
      r.data,
      r.employee_name,
      r.employer_company_code,
      r.beneficiary_company_code,
      r.codice_commessa,
      r.codice_area,
      r.codice_centro_costo ?? "",
      numberIt(r.ore),
      numberIt(r.ore_pesate),
      r.tariffa_oraria_visibile === null ? "Riservato" : euro(r.tariffa_oraria_visibile),
      r.importo_visibile === null ? "Riservato" : euro(r.importo_visibile),
      r.codice_attivita,
      r.descrizione ?? "",
      r.stato,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [18, 57, 70] },
    columnStyles: {
      1: { cellWidth: 28 },
      4: { cellWidth: 25 },
      12: { cellWidth: 45 },
    },
  });

  const y = (doc.lastAutoTable?.finalY ?? 170) + 8;
  const grouped = group(rows, (r) => r.codice_attivita, (r) => Number(r.ore));
  autoTable(doc, {
    startY: y,
    head: [["Distribuzione per categoria", "Ore"]],
    body: grouped.map((r) => [r.name, numberIt(r.value)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 57, 70] },
    margin: { left: 14, right: 170 },
  });

  return doc;
}

function group<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + value(r)));
  return Array.from(m, ([name, val]) => ({ name, value: val })).sort((a, b) => b.value - a.value);
}
