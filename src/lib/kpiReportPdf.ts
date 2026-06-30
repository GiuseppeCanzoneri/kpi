import jsPDF from "jspdf";
import type { KpiDashboardRow, KpiTraceRow } from "../types/kpi";
import { downloadPdf, safeFilename } from "./pdfPreview";

type TableColumn = { header: string; width: number; align?: "left" | "right" | "center" };

type TableOptions = {
  startY: number;
  columns: TableColumn[];
  rows: Array<Array<unknown>>;
  fontSize?: number;
  rowPadding?: number;
};

const pageMargin = 12;

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
  doc.text(title, pageMargin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, pageMargin, 18);
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
    doc.text(`Generato il ${new Date().toLocaleString("it-IT")} · KPI Performance`, pageMargin, height - 8);
    doc.text(`Pagina ${page} di ${pageCount}`, width - pageMargin, height - 8, { align: "right" });
  }
}

function cards(doc: jsPDF, items: { label: string; value: string }[], y = 30) {
  const width = doc.internal.pageSize.getWidth();
  const gap = 4;
  const cardWidth = (width - pageMargin * 2 - (items.length - 1) * gap) / items.length;
  items.forEach((item, index) => {
    const x = pageMargin + index * (cardWidth + gap);
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

function splitCell(doc: jsPDF, value: unknown, width: number): string[] {
  const text = safe(value, "");
  return text.split("\n").flatMap((part) => {
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
      lines.slice(0, 15).forEach((line, lineIndex) => {
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

function addTextBlock(doc: jsPDF, title: string, text: string, y: number) {
  const width = doc.internal.pageSize.getWidth() - pageMargin * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 32, 51);
  doc.text(title, pageMargin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 75, 94);
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, pageMargin, y + 6);
  return y + 8 + (Array.isArray(lines) ? lines.length : 1) * 4;
}

export function createKpiIndividualPdf(row: KpiDashboardRow, trace: KpiTraceRow[]) {
  const sortedTrace = [...trace].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(
    doc,
    "Scheda KPI individuale",
    `${row.employee_name} · ${row.period_type === "WEEK" ? "Settimana" : "Mese"} ${row.period_start} / ${row.period_end}`
  );

  let y = cards(doc, [
    { label: "Indice", value: `${fmt(row.performance_index)}/100` },
    { label: "Livello", value: safe(row.livello) },
    { label: "Classifica", value: `#${safe(row.group_rank)}` },
    { label: "Riconoscimento", value: row.is_top_performer || row.eligible ? "Top performer" : "No" },
    { label: "Righe validate", value: `${safe(row.validated_rows)}/${safe(row.total_rows)}` },
  ]);

  y = drawManualTable(doc, {
    startY: y,
    fontSize: 8,
    columns: [
      { header: "KPI", width: 18 },
      { header: "Nome", width: 42 },
      { header: "Valore", width: 26, align: "right" },
      { header: "Lettura", width: 187 },
    ],
    rows: [
      ["K1", "Tempo produttivo", `${fmt(row.k1_saturazione)}/100`, "Tempo produttivo validato rispetto al target"],
      ["K2", "Produzione", `${fmt(row.k2_produzione)}/100`, "Produzione standard ponderata completata"],
      ["K3", "Efficienza", `${fmt(row.k3_efficienza)}/100`, "Tempo standard rispetto alle ore effettive"],
      ["K4", "Qualità", `${fmt(row.k4_qualita)}/100`, "Correttezza, integrazioni, respinte e rilavorazioni"],
      ["K5", "Scadenze", `${fmt(row.k5_puntualita)}/100`, "Rispetto delle scadenze assegnate"],
    ],
  });

  y = addTextBlock(
    doc,
    "Motivazione / controllo",
    row.eligibility_reason || (row.eligible ? "Idoneo al riconoscimento Top performer." : "Non idoneo al riconoscimento nel periodo."),
    y + 10
  );

  drawManualTable(doc, {
    startY: y + 4,
    fontSize: 6.8,
    columns: [
      { header: "Data", width: 20 },
      { header: "Commessa", width: 38 },
      { header: "Attività", width: 38 },
      { header: "Ore", width: 15, align: "right" },
      { header: "Std", width: 15, align: "right" },
      { header: "Qualità", width: 31 },
      { header: "Scadenza", width: 34 },
      { header: "Descrizione / note", width: 82 },
    ],
    rows: sortedTrace.map((r) => [
      safe(r.data),
      `${safe(r.codice_commessa)}\n${safe(r.descrizione_commessa, "")}`.trim(),
      `${safe(r.codice_attivita)}\n${safe(r.nome_categoria, "")}`.trim(),
      fmt(r.ore),
      fmt(r.standard_units),
      `${safe(r.kpi_quality_outcome)}\n${fmt(r.quality_points)}`,
      r.kpi_due_date ? `${safe(r.kpi_due_date)}\n${safe(r.kpi_completed_at, "non chiusa")}` : "—",
      [r.descrizione, r.note, r.kpi_exclusion_reason ? `Esclusione: ${r.kpi_exclusion_reason}` : null].filter(Boolean).join("\n"),
    ]),
  });

  addFooter(doc);
  return doc;
}

export function createKpiLeaderboardPdf(rows: KpiDashboardRow[], title = "Classifica KPI") {
  const sortedRows = [...rows].sort((a, b) => Number(b.performance_index ?? 0) - Number(a.performance_index ?? 0));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(doc, title, "Classifica ordinata per indice. Top performer solo se supera soglie e controlli obbligatori.");
  const y = cards(
    doc,
    [
      { label: "Valutabili", value: String(sortedRows.length) },
      { label: "Top performer", value: String(sortedRows.filter((r) => r.is_top_performer || r.eligible).length) },
      { label: "Scala", value: "0-100" },
    ],
    30
  );

  drawManualTable(doc, {
    startY: y + 2,
    fontSize: 8,
    columns: [
      { header: "Rank", width: 18, align: "center" },
      { header: "Dipendente", width: 48 },
      { header: "Gruppo", width: 34 },
      { header: "PI", width: 22, align: "right" },
      { header: "K1", width: 20, align: "right" },
      { header: "K2", width: 20, align: "right" },
      { header: "K3", width: 20, align: "right" },
      { header: "K4", width: 20, align: "right" },
      { header: "K5", width: 20, align: "right" },
      { header: "Riconoscimento", width: 71 },
    ],
    rows: sortedRows.map((r) => [
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
