import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";

type LogRow = { sheet: string; row: number; status: "OK" | "ERRORE" | "SKIP"; message: string };

export default function ImportExcel() {
  const { isSuperAdmin } = useAuth();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    setLogs([]);
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const newLogs: LogRow[] = [];

    try {
      await importCompanies(wb, newLogs);
      await importTariffs(wb, newLogs);
      await importAreasIfMissing(newLogs);
      await importEmployees(wb, newLogs);
      await importProjects(wb, newLogs);
      await importActivities(wb, newLogs);
      await importTimesheet(wb, newLogs);
    } catch (e: any) {
      newLogs.push({ sheet: "GENERALE", row: 0, status: "ERRORE", message: e.message ?? String(e) });
    }

    setLogs(newLogs);
    setLoading(false);
  };

  if (!isSuperAdmin) {
    return <div><PageHeader title="Import Excel" subtitle="Importazione dal modello Excel" /><div className="alert error">Solo il SUPER_ADMIN può importare anagrafiche e dati da Excel.</div></div>;
  }

  return (
    <div>
      <PageHeader title="Import Excel" subtitle="Importa dal file Modello_contabilita_ore_area_tecnica_infragruppo.xlsx. Le righe incomplete vengono segnalate." />
      <section className="panel narrow">
        <label className="upload-box">
          <Upload size={32} />
          <strong>Carica modello Excel</strong>
          <span>Fogli letti: Società, Profili_tariffe, Dipendenti, Commesse, Attività, Timesheet</span>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
      </section>
      {loading && <div className="loading">Importazione in corso...</div>}
      {logs.length > 0 && (
        <section className="panel">
          <h3>Esito import</h3>
          <div className="kpi-grid small">
            <div className="kpi-card"><span>OK</span><strong>{logs.filter((l) => l.status === "OK").length}</strong></div>
            <div className="kpi-card"><span>Errori</span><strong>{logs.filter((l) => l.status === "ERRORE").length}</strong></div>
            <div className="kpi-card"><span>Saltate</span><strong>{logs.filter((l) => l.status === "SKIP").length}</strong></div>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead><tr><th>Foglio</th><th>Riga</th><th>Stato</th><th>Messaggio</th></tr></thead>
              <tbody>{logs.map((l, i) => <tr key={i}><td>{l.sheet}</td><td>{l.row}</td><td>{l.status}</td><td>{l.message}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function readSheet(wb: XLSX.WorkBook, name: string, headerRow = 4): any[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
  const headers = rows[headerRow - 1]?.map((h) => String(h ?? "").trim()) ?? [];
  return rows.slice(headerRow).filter((r) => r.some((cell) => cell !== null && cell !== "")).map((r) => {
    const obj: any = {};
    headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
    return obj;
  });
}

async function importCompanies(wb: XLSX.WorkBook, logs: LogRow[]) {
  const rows = readSheet(wb, "Società");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const codice = clean(r["Codice società"]);
    const ragione = clean(r["Ragione sociale"]);
    if (!codice || !ragione) { logs.push({ sheet: "Società", row: i + 5, status: "SKIP", message: "Codice o ragione sociale mancanti" }); continue; }
    const { error } = await supabase.from("companies").upsert({ codice_societa: codice, ragione_sociale: ragione, partita_iva_vat: clean(r["P. IVA"]), codice_sdi_pec: clean(r["Codice SDI / PEC"]), indirizzo: clean(r["Indirizzo"]), attiva: yes(r["Attiva"]), note: clean(r["Note"]) }, { onConflict: "codice_societa" });
    logs.push({ sheet: "Società", row: i + 5, status: error ? "ERRORE" : "OK", message: error?.message ?? `Importata ${codice}` });
  }
}

async function importTariffs(wb: XLSX.WorkBook, logs: LogRow[]) {
  const rows = readSheet(wb, "Profili_tariffe");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const codice = clean(r["Codice profilo"]);
    if (!codice) { logs.push({ sheet: "Profili_tariffe", row: i + 5, status: "SKIP", message: "Codice profilo mancante" }); continue; }
    const overhead = percent(r["Overhead %"]);
    const margine = percent(r["Margine %"]);
    const { error } = await supabase.from("tariff_profiles").upsert({ codice_profilo: codice, nome_profilo: clean(r["Profilo"]) || codice, descrizione: clean(r["Descrizione"]), costo_orario_base: num(r["Costo orario base"]), overhead_percentuale: overhead, margine_percentuale: margine, attivo: true, note: clean(r["Note"]) }, { onConflict: "codice_profilo" });
    logs.push({ sheet: "Profili_tariffe", row: i + 5, status: error ? "ERRORE" : "OK", message: error?.message ?? `Importato ${codice}` });
  }
}

async function importAreasIfMissing(logs: LogRow[]) {
  const { data } = await supabase.from("business_areas").select("id").eq("codice_area", "TEC").maybeSingle();
  if (!data) {
    const { error } = await supabase.from("business_areas").insert({ codice_area: "TEC", nome_area: "Area Tecnica", descrizione: "Area Tecnica importata automaticamente come area base timesheet", attiva: true });
    logs.push({ sheet: "Aree", row: 0, status: error ? "ERRORE" : "OK", message: error?.message ?? "Creata area TEC" });
  }
}

async function maps() {
  const [c, t, e, p, a, ba] = await Promise.all([
    supabase.from("companies").select("id,codice_societa"),
    supabase.from("tariff_profiles").select("id,codice_profilo"),
    supabase.from("employees").select("id,nome,cognome,email"),
    supabase.from("projects").select("id,codice_commessa"),
    supabase.from("activity_categories").select("id,codice_attivita"),
    supabase.from("business_areas").select("id,codice_area"),
  ]);
  return {
    companies: new Map((c.data ?? []).map((x: any) => [x.codice_societa, x.id])),
    tariffs: new Map((t.data ?? []).map((x: any) => [x.codice_profilo, x.id])),
    employees: new Map((e.data ?? []).map((x: any) => [`${x.nome} ${x.cognome}`.trim(), x.id])),
    projects: new Map((p.data ?? []).map((x: any) => [x.codice_commessa, x.id])),
    activities: new Map((a.data ?? []).map((x: any) => [x.codice_attivita, x.id])),
    areas: new Map((ba.data ?? []).map((x: any) => [x.codice_area, x.id])),
  };
}

async function importEmployees(wb: XLSX.WorkBook, logs: LogRow[]) {
  const rows = readSheet(wb, "Dipendenti");
  const m = await maps();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fullName = clean(r["Dipendente"]);
    const parts = fullName.split(" ");
    const nome = parts.shift() || "";
    const cognome = parts.join(" ") || "-";
    const company_id = m.companies.get(clean(r["Società datrice"]));
    const tariff_profile_id = m.tariffs.get(clean(r["Codice profilo"]));
    if (!fullName || !company_id || !tariff_profile_id) { logs.push({ sheet: "Dipendenti", row: i + 5, status: "ERRORE", message: "Dipendente, società datrice o profilo mancanti/non trovati" }); continue; }
    const email = clean(r["Email"]) || `${nome}.${cognome}`.toLowerCase().split(" ").join(".") + "@example.local";
    const { error } = await supabase.from("employees").upsert({ nome, cognome, email: email.toLowerCase(), company_id, tariff_profile_id, mansione: clean(r["Mansione"]), attivo: yes(r["Attivo"]) }, { onConflict: "email" });
    logs.push({ sheet: "Dipendenti", row: i + 5, status: error ? "ERRORE" : "OK", message: error?.message ?? `Importato ${fullName}` });
  }
}

async function importProjects(wb: XLSX.WorkBook, logs: LogRow[]) {
  const rows = readSheet(wb, "Commesse");
  const m = await maps();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const codice = clean(r["Codice commessa"]);
    const company_id = m.companies.get(clean(r["Società titolare"]));
    if (!codice || !company_id) { logs.push({ sheet: "Commesse", row: i + 5, status: "ERRORE", message: "Codice commessa o società titolare mancanti/non trovati" }); continue; }
    const { error } = await supabase.from("projects").upsert({ codice_commessa: codice, company_id, cliente: clean(r["Cliente"]), descrizione_commessa: clean(r["Descrizione commessa"]) || codice, tipo: clean(r["Tipo"]), stato: clean(r["Stato"]) || "Aperta", responsabile: clean(r["Responsabile"]), note: clean(r["Note"]) }, { onConflict: "codice_commessa" });
    logs.push({ sheet: "Commesse", row: i + 5, status: error ? "ERRORE" : "OK", message: error?.message ?? `Importata ${codice}` });
  }
}

async function importActivities(wb: XLSX.WorkBook, logs: LogRow[]) {
  const rows = readSheet(wb, "Attività");
  const m = await maps();
  const area_id = m.areas.get("TEC");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const codice = clean(r["Codice attività"]);
    if (!codice) { logs.push({ sheet: "Attività", row: i + 5, status: "SKIP", message: "Codice attività mancante" }); continue; }
    const { error } = await supabase.from("activity_categories").upsert({ codice_attivita: codice, nome_categoria: clean(r["Categoria"]) || codice, descrizione: clean(r["Descrizione"]), business_area_id: area_id, fatturabile: yes(r["Fatturabile"]), coefficiente_ore_pesate: 1, attiva: true, note: clean(r["Note"]) }, { onConflict: "codice_attivita" });
    logs.push({ sheet: "Attività", row: i + 5, status: error ? "ERRORE" : "OK", message: error?.message ?? `Importata ${codice}` });
  }
}

async function importTimesheet(wb: XLSX.WorkBook, logs: LogRow[]) {
  const rows = readSheet(wb, "Timesheet");
  const m = await maps();
  const defaultArea = m.areas.get("TEC");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const employee_id = m.employees.get(clean(r["Dipendente"]));
    const beneficiary_company_id = m.companies.get(clean(r["Società beneficiaria"]));
    const project_id = m.projects.get(clean(r["Commessa"]));
    const activity_category_id = m.activities.get(clean(r["Attività"]));
    const data = excelDate(r["Data"]);
    if (!employee_id || !beneficiary_company_id || !project_id || !activity_category_id || !data || !defaultArea) {
      logs.push({ sheet: "Timesheet", row: i + 5, status: "ERRORE", message: "Dipendente, società beneficiaria, commessa, attività, data o area non trovati" });
      continue;
    }
    const { error } = await supabase.from("timesheet_entries").insert({ data, employee_id, beneficiary_company_id, business_area_id: defaultArea, project_id, activity_category_id, ore: num(r["Ore"]), descrizione: clean(r["Descrizione lavoro svolto"]), stato: clean(r["Stato"]) || "Bozza", note: clean(r["Note"]) });
    logs.push({ sheet: "Timesheet", row: i + 5, status: error ? "ERRORE" : "OK", message: error?.message ?? "Riga ore importata" });
  }
}

function clean(v: any) { return String(v ?? "").trim(); }
function yes(v: any) { const s = clean(v).toLowerCase(); return ["sì", "si", "yes", "true", "1", "attiva", "attivo"].includes(s); }
function num(v: any) { const n = Number(String(v ?? 0).replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function percent(v: any) { const n = num(v); return n > 0 && n < 1 ? n * 100 : n; }
function excelDate(v: any) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const date = XLSX.SSF.parse_date_code(v);
    if (!date) return "";
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}