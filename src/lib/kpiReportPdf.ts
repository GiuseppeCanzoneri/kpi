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

function score(row: KpiDashboardRow) {
  return Number(row.performance_index ?? 0);
}

function areaName(row: KpiDashboardRow) {
  return row.nome_gruppo || row.nome_area || row.codice_area || "Senza area";
}

function sortOverall(rows: KpiDashboardRow[]) {
  return [...rows].sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    const byQuality = Number(b.k4_qualita ?? 0) - Number(a.k4_qualita ?? 0);
    if (byQuality !== 0) return byQuality;
    const byDeadline = Number(b.k5_puntualita ?? 0) - Number(a.k5_puntualita ?? 0);
    if (byDeadline !== 0) return byDeadline;
    const byProduction = Number(b.k2_produzione ?? 0) - Number(a.k2_produzione ?? 0);
    if (byProduction !== 0) return byProduction;
    return String(a.employee_name ?? "").localeCompare(String(b.employee_name ?? ""));
  });
}

function groupByArea(rows: KpiDashboardRow[]) {
  const grouped = new Map<string, KpiDashboardRow[]>();
  rows.forEach((row) => {
    const key = areaName(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  return [...grouped.entries()]
    .map(([area, areaRows]) => ({ area, rows: sortOverall(areaRows) }))
    .sort((a, b) => a.area.localeCompare(b.area));
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
    doc.setFont("helvetica", "normal");
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

function ensureSpace(doc: jsPDF, y: number, needed = 20) {
  const bottomLimit = doc.internal.pageSize.getHeight() - 16;
  if (y + needed <= bottomLimit) return y;
  doc.addPage();
  return 28;
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
  y = ensureSpace(doc, y, 18);
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
    { label: "Rank area", value: `#${safe(row.group_rank)}` },
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

export function createKpiLeaderboardPdf(rows: KpiDashboardRow[], title = "Classifica KPI generale e per area") {
  const sortedRows = sortOverall(rows);
  const groups = groupByArea(rows);
  const bestOverall = sortedRows[0] ?? null;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(doc, title, "Classifica generale ordinata per PI e classifica separata per area/gruppo omogeneo.");

  let y = cards(
    doc,
    [
      { label: "Valutabili", value: String(sortedRows.length) },
      { label: "Migliore assoluto", value: bestOverall ? `${safe(bestOverall.employee_name)} · ${fmt(bestOverall.performance_index)}` : "—" },
      { label: "Top performer", value: String(sortedRows.filter((r) => r.is_top_performer || r.eligible).length) },
      { label: "Scala", value: "0-100" },
    ],
    30
  );

  y = addTextBlock(
    doc,
    "Classifica generale",
    "Ordine unico dal punteggio più alto al più basso. Il primo classificato generale non coincide necessariamente con il Top performer.",
    y + 4
  );

  y = drawManualTable(doc, {
    startY: y + 2,
    fontSize: 7.6,
    columns: [
      { header: "Rank gen.", width: 18, align: "center" },
      { header: "Dipendente", width: 47 },
      { header: "Area", width: 32 },
      { header: "PI", width: 20, align: "right" },
      { header: "Livello", width: 24 },
      { header: "K1", width: 18, align: "right" },
      { header: "K2", width: 18, align: "right" },
      { header: "K3", width: 18, align: "right" },
      { header: "K4", width: 18, align: "right" },
      { header: "K5", width: 18, align: "right" },
      { header: "Esito", width: 62 },
    ],
    rows: sortedRows.map((r, index) => [
      `#${index + 1}`,
      `${safe(r.employee_name)}\n${safe(r.employee_email, "")}`.trim(),
      areaName(r),
      fmt(r.performance_index),
      safe(r.livello),
      fmt(r.k1_saturazione),
      fmt(r.k2_produzione),
      fmt(r.k3_efficienza),
      fmt(r.k4_qualita),
      fmt(r.k5_puntualita),
      r.is_top_performer || r.eligible ? "Top performer" : safe(r.eligibility_reason, "Solo classifica"),
    ]),
  });

  groups.forEach((group) => {
    y = ensureSpace(doc, y + 12, 35);
    y = addTextBlock(doc, `Classifica area: ${group.area}`, `Primo di area: ${safe(group.rows[0]?.employee_name)} · PI ${fmt(group.rows[0]?.performance_index)}/100`, y);
    y = drawManualTable(doc, {
      startY: y + 2,
      fontSize: 7.6,
      columns: [
        { header: "Rank area", width: 22, align: "center" },
        { header: "Dipendente", width: 62 },
        { header: "PI", width: 22, align: "right" },
        { header: "Livello", width: 26 },
        { header: "K1", width: 20, align: "right" },
        { header: "K2", width: 20, align: "right" },
        { header: "K3", width: 20, align: "right" },
        { header: "K4", width: 20, align: "right" },
        { header: "K5", width: 20, align: "right" },
        { header: "Esito", width: 61 },
      ],
      rows: group.rows.map((r, index) => [
        `#${index + 1}`,
        `${safe(r.employee_name)}\n${safe(r.employee_email, "")}`.trim(),
        fmt(r.performance_index),
        safe(r.livello),
        fmt(r.k1_saturazione),
        fmt(r.k2_produzione),
        fmt(r.k3_efficienza),
        fmt(r.k4_qualita),
        fmt(r.k5_puntualita),
        r.is_top_performer || r.eligible ? "Top performer" : "Solo classifica",
      ]),
    });
  });

  addFooter(doc);
  return doc;
}

export function downloadKpiIndividualPdf(row: KpiDashboardRow, trace: KpiTraceRow[]) {
  downloadPdf(createKpiIndividualPdf(row, trace), `${safeFilename(`kpi-${row.employee_name}`)}.pdf`);
}

export function downloadKpiLeaderboardPdf(rows: KpiDashboardRow[], title = "Classifica KPI generale e per area") {
  downloadPdf(createKpiLeaderboardPdf(rows, title), `${safeFilename(title)}.pdf`);
}
