import jsPDF from "jspdf";
import "jspdf-autotable";

type KpiScoreRow = Record<string, any>;
type KpiTraceRow = Record<string, any>;

const nf = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function n(value: unknown) {
  return nf.format(Number(value ?? 0));
}

function text(value: unknown) {
  return String(value ?? "—");
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(14, 48, 79);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 220, 14);
  doc.setTextColor(18, 28, 45);
}

function addFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(110, 123, 145);
    doc.text(`Documento generato da KPI Quantum - pagina ${i}/${pages}`, 14, 204);
  }
}

function gaugeColor(level: string): [number, number, number] {
  if (level === "Eccellente") return [45, 126, 197];
  if (level === "Alto") return [64, 160, 112];
  if (level === "In linea") return [224, 189, 70];
  if (level === "Attenzione") return [226, 139, 45];
  return [200, 58, 58];
}

function drawPiGauge(doc: jsPDF, x: number, y: number, pi: number, level: string) {
  const radius = 24;
  const [r, g, b] = gaugeColor(level);
  doc.setDrawColor(225, 232, 240);
  doc.setLineWidth(8);
  doc.circle(x, y, radius, "S");
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(8);
  const circumference = Math.PI * 2 * radius;
  const percent = Math.max(0, Math.min(1, pi / 120));
  doc.setLineDashPattern([circumference * percent, circumference * (1 - percent)], 0);
  doc.circle(x, y, radius, "S");
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(18, 28, 45);
  doc.text(`${Math.round(pi)}/120`, x, y + 2, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(r, g, b);
  doc.text(level, x, y + 10, { align: "center" });
}

export function downloadKpiIndividualPdf(score: KpiScoreRow, trace: KpiTraceRow[] = []) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const period = `${text(score.period_type)} ${text(score.period_start)} / ${text(score.period_end)}`;
  addHeader(doc, "QUANTUM | KPI PERFORMANCE REPORT", `Generato il ${new Date().toLocaleString("it-IT")}`);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(text(score.employee_name), 14, 35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 105, 125);
  doc.text(`${text(score.nome_ruolo)} · ${text(score.nome_gruppo)} · ${text(score.company_name)}`, 14, 43);
  doc.text(`Periodo: ${period}`, 14, 50);

  drawPiGauge(doc, 246, 52, Number(score.performance_index ?? 0), text(score.livello));

  const cardY = 66;
  const metrics = [
    ["K1 Saturazione", n(score.k1_saturazione), "15%"],
    ["K2 Produzione", n(score.k2_produzione), "30%"],
    ["K3 Efficienza", n(score.k3_efficienza), "20%"],
    ["K4 Qualità", n(score.k4_qualita), "20%"],
    ["K5 Puntualità", n(score.k5_puntualita), "15%"],
  ];
  metrics.forEach((m, i) => {
    const x = 14 + i * 53;
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(x, cardY, 48, 24, 3, 3, "F");
    doc.setFontSize(8);
    doc.setTextColor(90, 105, 125);
    doc.text(m[0], x + 4, cardY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(18, 28, 45);
    doc.text(m[1], x + 4, cardY + 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`peso ${m[2]}`, x + 32, cardY + 17);
  });

  const badges = Array.isArray(score.badges) ? score.badges : [];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(18, 28, 45);
  doc.text("Esito e riconoscimenti", 14, 103);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Idoneità premio: ${score.eligible ? "SI" : "NO"}`, 14, 110);
  doc.text(`Motivo: ${text(score.eligibility_reason || "Prestazione eleggibile")}`, 14, 116);
  doc.text(`Badge: ${badges.length ? badges.map((b: any) => b.label).join(", ") : "Nessun badge consolidato"}`, 14, 122);

  (doc as any).autoTable({
    startY: 132,
    head: [["Dato", "Valore", "Note"]],
    body: [
      ["Ore produttive", n(score.productive_hours), "Ore validate al netto delle esclusioni"],
      ["Ore disponibili nette", n(score.available_hours_net), "Base di saturazione"],
      ["Produzione standard", n(score.standard_units), "Tempo standard x complessità"],
      ["Rilavorazioni", n(score.rework_hours), "Penalizzano qualità"],
      ["Ore escluse", n(score.excluded_hours), "Assenze/blocchi autorizzati"],
      ["Giornate lavorate", String(score.working_days ?? 0), "Minimo periodo richiesto"],
      ["Righe validate", `${score.validated_rows ?? 0}/${score.total_rows ?? 0}`, "Tracciabilità KPI"],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [14, 48, 79] },
  });

  if (trace.length) {
    doc.addPage();
    addHeader(doc, "Dettaglio attività che generano il KPI", period);
    (doc as any).autoTable({
      startY: 30,
      head: [["Data", "Commessa", "Attività", "Ore", "Std", "Qualità", "Puntualità", "Descrizione"]],
      body: trace.map((r) => [
        text(r.data),
        text(r.codice_commessa),
        text(r.codice_attivita),
        n(r.ore),
        n(r.standard_units),
        n(r.quality_points),
        r.punctuality_points == null ? "—" : n(r.punctuality_points),
        text(r.descrizione).slice(0, 120),
      ]),
      styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak" },
      headStyles: { fillColor: [14, 48, 79] },
      columnStyles: { 7: { cellWidth: 80 } },
    });
  }

  addFooter(doc);
  doc.save(`KPI_${text(score.employee_name).replaceAll(" ", "_")}_${text(score.period_start)}.pdf`);
}

export function downloadKpiLeaderboardPdf(rows: KpiScoreRow[], title = "Classifica KPI") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(doc, `QUANTUM | ${title}`, `Generato il ${new Date().toLocaleString("it-IT")}`);
  (doc as any).autoTable({
    startY: 32,
    head: [["Rank", "Dipendente", "Gruppo", "PI", "Livello", "K1", "K2", "K3", "K4", "K5", "Badge/Note"]],
    body: rows.map((r) => [
      String(r.group_rank ?? "—"),
      text(r.employee_name),
      text(r.nome_gruppo),
      n(r.performance_index),
      text(r.livello),
      n(r.k1_saturazione),
      n(r.k2_produzione),
      n(r.k3_efficienza),
      n(r.k4_qualita),
      n(r.k5_puntualita),
      r.eligible ? "Elegibile" : text(r.eligibility_reason),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [14, 48, 79] },
  });
  addFooter(doc);
  doc.save(`${title.replaceAll(" ", "_")}.pdf`);
}
