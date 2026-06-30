import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { KpiDashboardRow, KpiTraceRow } from "../types/kpi";
import { downloadPdf, safeFilename } from "./pdfPreview";

declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: { finalY?: number };
  }
}

function fmt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function safe(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(18, 59, 99);
  doc.rect(0, 0, width, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 12, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, 12, 18);
  doc.setTextColor(20, 32, 51);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(110, 122, 140);
    doc.text(`Generato il ${new Date().toLocaleString("it-IT")} · KPI Performance`, 12, height - 8);
    doc.text(`Pagina ${page} di ${pageCount}`, width - 12, height - 8, { align: "right" });
  }
}

function cards(doc: jsPDF, items: { label: string; value: string }[], y = 30) {
  const width = doc.internal.pageSize.getWidth();
  const cardWidth = (width - 24 - (items.length - 1) * 4) / items.length;
  items.forEach((item, index) => {
    const x = 12 + index * (cardWidth + 4);
    doc.setDrawColor(215, 225, 236);
    doc.setFillColor(247, 250, 253);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(110, 122, 140);
    doc.text(item.label.toUpperCase(), x + 3, y + 6);
    doc.setFontSize(12);
    doc.setTextColor(18, 59, 99);
    doc.text(item.value, x + 3, y + 14);
  });
  return y + 26;
}

export function createKpiIndividualPdf(row: KpiDashboardRow, trace: KpiTraceRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(doc, "Scheda KPI individuale", `${row.employee_name} · ${row.period_type === "WEEK" ? "Settimana" : "Mese"} ${row.period_start} / ${row.period_end}`);

  let y = cards(doc, [
    { label: "Indice", value: `${fmt(row.performance_index)}/100` },
    { label: "Livello", value: safe(row.livello) },
    { label: "Classifica", value: `#${safe(row.group_rank)}` },
    { label: "Riconoscimento", value: row.is_top_performer || row.eligible ? "Top performer" : "No" },
    { label: "Righe validate", value: `${safe(row.validated_rows)}/${safe(row.total_rows)}` },
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [["KPI", "Nome", "Valore", "Lettura"]],
    body: [
      ["K1", "Tempo produttivo", `${fmt(row.k1_saturazione)}/100`, "Tempo produttivo validato rispetto al target"],
      ["K2", "Produzione", `${fmt(row.k2_produzione)}/100`, "Produzione standard ponderata completata"],
      ["K3", "Efficienza", `${fmt(row.k3_efficienza)}/100`, "Tempo standard rispetto alle ore effettive"],
      ["K4", "Qualità", `${fmt(row.k4_qualita)}/100`, "Correttezza, integrazioni, respinte e rilavorazioni"],
      ["K5", "Scadenze", `${fmt(row.k5_puntualita)}/100`, "Rispetto delle scadenze assegnate"],
    ],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 59, 99], textColor: [255, 255, 255] },
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Motivazione / controllo", 12, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(row.eligibility_reason || (row.eligible ? "Idoneo al riconoscimento Top performer." : "Non idoneo al riconoscimento nel periodo."), 270), 12, y + 6);

  y += 22;
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [["Data", "Commessa", "Attività", "Ore", "Std", "Qualità", "Scadenza", "Descrizione / note"]],
    body: trace.map((r) => [
      safe(r.data),
      `${safe(r.codice_commessa)}\n${safe(r.descrizione_commessa, "")}`.trim(),
      `${safe(r.codice_attivita)}\n${safe(r.nome_categoria, "")}`.trim(),
      fmt(r.ore),
      fmt(r.standard_units),
      `${safe(r.kpi_quality_outcome)}\n${fmt(r.quality_points)}`,
      r.kpi_due_date ? `${safe(r.kpi_due_date)}\n${safe(r.kpi_completed_at, "non chiusa")}` : "—",
      [r.descrizione, r.note, r.kpi_exclusion_reason ? `Esclusione: ${r.kpi_exclusion_reason}` : null].filter(Boolean).join("\n"),
    ]),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [232, 239, 247], textColor: [15, 33, 58] },
  });

  addFooter(doc);
  return doc;
}

export function createKpiLeaderboardPdf(rows: KpiDashboardRow[], title = "Classifica KPI") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(doc, title, "Classifica ordinata per indice. Top performer solo se supera soglie e controlli obbligatori.");
  cards(doc, [
    { label: "Valutabili", value: String(rows.length) },
    { label: "Top performer", value: String(rows.filter((r) => r.is_top_performer || r.eligible).length) },
    { label: "Scala", value: "0-100" },
  ], 30);

  autoTable(doc, {
    startY: 58,
    margin: { left: 12, right: 12 },
    head: [["Rank", "Dipendente", "Gruppo", "PI", "K1", "K2", "K3", "K4", "K5", "Riconoscimento"]],
    body: rows.map((r) => [
      `#${safe(r.group_rank)}`,
      `${safe(r.employee_name)}\n${safe(r.employee_email, "")}`.trim(),
      safe(r.nome_gruppo),
      fmt(r.performance_index),
      fmt(r.k1_saturazione),
      fmt(r.k2_produzione),
      fmt(r.k3_efficienza),
      fmt(r.k4_qualita),
      fmt(r.k5_puntualita),
      r.is_top_performer || r.eligible ? "Top performer" : safe(r.eligibility_reason, "Solo classifica"),
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [18, 59, 99], textColor: [255, 255, 255] },
  });

  addFooter(doc);
  return doc;
}

export function downloadKpiIndividualPdf(row: KpiDashboardRow, trace: KpiTraceRow[]) {
  downloadPdf(createKpiIndividualPdf(row, trace), `${safeFilename(`kpi-${row.employee_name}`)}.pdf`);
}

export function downloadKpiLeaderboardPdf(rows: KpiDashboardRow[], title = "Classifica KPI") {
  downloadPdf(createKpiLeaderboardPdf(rows, title), `${safeFilename(title)}.pdf`);
}
