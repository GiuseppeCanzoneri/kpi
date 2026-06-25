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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openPrintDocument(title: string, body: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!win) {
    alert("Il browser ha bloccato l'apertura del report. Abilita i popup per generare il PDF.");
    return;
  }

  win.document.write(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #142033; margin: 0; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #123b63; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { margin: 0; font-size: 20px; color: #123b63; }
    .meta { text-align: right; color: #6c7a8c; font-size: 11px; line-height: 1.5; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .kpi { border: 1px solid #d7e1ec; border-radius: 8px; padding: 8px; }
    .kpi span { color: #6c7a8c; font-size: 10px; text-transform: uppercase; font-weight: bold; }
    .kpi strong { display: block; font-size: 16px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #eef3f8; color: #24364d; text-transform: uppercase; font-size: 8px; letter-spacing: .04em; }
    th, td { border: 1px solid #d7e1ec; padding: 5px; vertical-align: top; }
    tr.contested td { background: #fff8e8; }
    .muted { color: #6c7a8c; }
    .badge { display: inline-block; border-radius: 999px; padding: 2px 6px; font-weight: bold; background: #e7f8ef; color: #087443; }
    .badge.warn { background: #fff1f0; color: #b42318; }
  </style>
</head>
<body>${body}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

export function printTimesheetReport(rows: TimesheetView[], filters: { month: number; year: number; title?: string }) {
  const title = filters.title ?? "Report ore registrate";
  const totaleOre = rows.reduce((acc, r) => acc + Number(r.ore ?? 0), 0);
  const totaleOrePesate = rows.reduce((acc, r) => acc + Number(r.ore_pesate ?? 0), 0);
  const totaleImporto = rows.reduce((acc, r) => acc + Number(r.importo_visibile ?? 0), 0);
  const contestate = rows.filter((r) => r.is_contested).length;

  const body = `
    <div class="header">
      <div><h1>${escapeHtml(title)}</h1><div class="muted">Competenza ${filters.month}/${filters.year}</div></div>
      <div class="meta">Generato il ${new Date().toLocaleString("it-IT")}<br/>KPI / Contabilità ore infragruppo</div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Righe</span><strong>${rows.length}</strong></div>
      <div class="kpi"><span>Ore</span><strong>${numberIt(totaleOre)}</strong></div>
      <div class="kpi"><span>Ore pesate</span><strong>${numberIt(totaleOrePesate)}</strong></div>
      <div class="kpi"><span>Importo</span><strong>${euro(totaleImporto)}</strong></div>
    </div>
    ${contestate ? `<p><span class="badge warn">${contestate} righe contestate / da verificare</span></p>` : ""}
    <table>
      <thead><tr><th>Data</th><th>Dipendente</th><th>Da società</th><th>A società</th><th>Area</th><th>Commessa</th><th>Attività</th><th>Ore</th><th>Pesate</th><th>Importo</th><th>Stato</th><th>Descrizione</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr class="${r.is_contested ? "contested" : ""}">
            <td>${escapeHtml(r.data)}</td>
            <td>${escapeHtml(r.employee_name)}<br/><span class="muted">${escapeHtml(r.employee_email)}</span></td>
            <td>${escapeHtml(r.employer_company_code)}</td>
            <td>${escapeHtml(r.beneficiary_company_code)}</td>
            <td>${escapeHtml(r.codice_area)}</td>
            <td>${escapeHtml(r.codice_commessa)}</td>
            <td>${escapeHtml(r.codice_attivita)}</td>
            <td>${numberIt(r.ore)}</td>
            <td>${numberIt(r.ore_pesate)}</td>
            <td>${r.importo_visibile === null ? "Riservato" : euro(r.importo_visibile)}</td>
            <td>${r.is_contested ? '<span class="badge warn">Contestata</span>' : '<span class="badge">Approvato</span>'}</td>
            <td>${escapeHtml(r.descrizione ?? "")}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  openPrintDocument(title, body);
}

export function printMonthlySummaryReport(rows: MonthlyRow[], filters: { month: number; year: number }) {
  const title = "Riepilogo mese";
  const totals = rows.reduce((acc, r) => ({
    ore: acc.ore + r.ore,
    orePesate: acc.orePesate + r.orePesate,
    imponibile: acc.imponibile + r.imponibile,
    iva: acc.iva + r.iva,
    totale: acc.totale + r.totale,
  }), { ore: 0, orePesate: 0, imponibile: 0, iva: 0, totale: 0 });

  const body = `
    <div class="header">
      <div><h1>${title}</h1><div class="muted">Competenza ${filters.month}/${filters.year}</div></div>
      <div class="meta">Generato il ${new Date().toLocaleString("it-IT")}<br/>KPI / Contabilità ore infragruppo</div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Flussi</span><strong>${rows.length}</strong></div>
      <div class="kpi"><span>Ore</span><strong>${numberIt(totals.ore)}</strong></div>
      <div class="kpi"><span>Imponibile</span><strong>${euro(totals.imponibile)}</strong></div>
      <div class="kpi"><span>Totale lordo</span><strong>${euro(totals.totale)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Da società</th><th>A società</th><th>Area</th><th>Righe</th><th>Ore</th><th>Ore pesate</th><th>Imponibile</th><th>IVA</th><th>Totale</th><th>Note</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.contestazioni ? "contested" : ""}"><td>${escapeHtml(r.da)}</td><td>${escapeHtml(r.a)}</td><td>${escapeHtml(r.area)}</td><td>${r.righe}</td><td>${numberIt(r.ore)}</td><td>${numberIt(r.orePesate)}</td><td>${euro(r.imponibile)}</td><td>${euro(r.iva)}</td><td>${euro(r.totale)}</td><td>${r.contestazioni ? "Contiene contestazioni" : "OK"}</td></tr>`).join("")}</tbody>
    </table>`;

  openPrintDocument(title, body);
}

export function printInvoicesReport(rows: IntercompanyInvoiceView[], filters: { month: number; year: number }) {
  const title = "Fatture infragruppo";
  const totals = rows.reduce((acc, r) => ({ imponibile: acc.imponibile + Number(r.imponibile ?? 0), iva: acc.iva + Number(r.iva ?? 0), totale: acc.totale + Number(r.totale ?? 0) }), { imponibile: 0, iva: 0, totale: 0 });

  const body = `
    <div class="header">
      <div><h1>${title}</h1><div class="muted">Competenza ${filters.month}/${filters.year}</div></div>
      <div class="meta">Generato il ${new Date().toLocaleString("it-IT")}<br/>KPI / Contabilità ore infragruppo</div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Prospetti</span><strong>${rows.length}</strong></div>
      <div class="kpi"><span>Imponibile</span><strong>${euro(totals.imponibile)}</strong></div>
      <div class="kpi"><span>IVA</span><strong>${euro(totals.iva)}</strong></div>
      <div class="kpi"><span>Totale</span><strong>${euro(totals.totale)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Emittente</th><th>Destinataria</th><th>Competenza</th><th>Imponibile</th><th>IVA</th><th>Totale</th><th>Numero</th><th>Data</th><th>Stato</th><th>Note</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.employer_company_code ?? r.employer_company_name)}</td><td>${escapeHtml(r.beneficiary_company_code ?? r.beneficiary_company_name)}</td><td>${r.mese}/${r.anno}</td><td>${euro(r.imponibile)}</td><td>${euro(r.iva)}</td><td>${euro(r.totale)}</td><td>${escapeHtml(r.numero_fattura ?? "—")}</td><td>${escapeHtml(r.data_fattura ?? "—")}</td><td>${escapeHtml(r.stato)}</td><td>${escapeHtml(r.note ?? "")}</td></tr>`).join("")}</tbody>
    </table>`;

  openPrintDocument(title, body);
}

export function downloadTimesheetCsv(rows: TimesheetView[], filename: string) {
  const header = ["Data", "Dipendente", "Email", "Da societa", "A societa", "Area", "Commessa", "Attivita", "Ore", "Ore pesate", "Importo", "Contestata", "Descrizione"];
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
