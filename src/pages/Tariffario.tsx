import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { euro, numberIt } from "../lib/format";
import { fetchLookupData, type LookupData } from "../lib/kpiData";
import type { TariffProfile } from "../types/db";

interface TariffForm {
  codice_profilo: string;
  nome_profilo: string;
  descrizione: string;
  business_area_id: string;
  costo_orario_base: string;
  overhead_percentuale: string;
  margine_percentuale: string;
  note: string;
}

const emptyForm: TariffForm = {
  codice_profilo: "",
  nome_profilo: "",
  descrizione: "",
  business_area_id: "",
  costo_orario_base: "",
  overhead_percentuale: "20",
  margine_percentuale: "15",
  note: "",
};

function calc(base: string, overhead: string, margin: string) {
  const costo = Number(base || 0);
  const over = Number(overhead || 0);
  const margine = Number(margin || 0);
  return costo * (1 + over / 100) * (1 + margine / 100);
}

export default function Tariffario() {
  const auth = useAuth();
  const [lookup, setLookup] = useState<LookupData | null>(null);
  const [rows, setRows] = useState<TariffProfile[]>([]);
  const [form, setForm] = useState<TariffForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const lookupRows = await fetchLookupData(auth.areaIds, auth.isSuperAdmin);
    setLookup(lookupRows);
    const { data, error } = await supabase.from("tariff_profiles").select("*").order("codice_profilo");
    if (error) setMessage(error.message);
    setRows((data ?? []) as TariffProfile[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function update<K extends keyof TariffForm>(key: K, value: TariffForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tariffa = calc(form.costo_orario_base, form.overhead_percentuale, form.margine_percentuale);
    if (!form.codice_profilo || !form.nome_profilo || !Number(form.costo_orario_base)) {
      setMessage("Compila codice, nome profilo e costo orario base.");
      return;
    }

    const payload = {
      codice_profilo: form.codice_profilo.trim().toUpperCase(),
      nome_profilo: form.nome_profilo.trim(),
      descrizione: form.descrizione || null,
      business_area_id: form.business_area_id || null,
      costo_orario_base: Number(form.costo_orario_base),
      overhead_percentuale: Number(form.overhead_percentuale),
      margine_percentuale: Number(form.margine_percentuale),
      tariffa_oraria_calcolata: Number(tariffa.toFixed(2)),
      attivo: true,
      note: form.note || null,
    };

    const { error } = await supabase.from("tariff_profiles").upsert(payload, { onConflict: "codice_profilo" });
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm(emptyForm);
    setMessage("Profilo tariffario salvato.");
    await load();
  }

  async function toggle(row: TariffProfile) {
    const { error } = await supabase.from("tariff_profiles").update({ attivo: !row.attivo }).eq("id", row.id);
    if (error) setMessage(error.message);
    await load();
  }

  const preview = calc(form.costo_orario_base, form.overhead_percentuale, form.margine_percentuale);

  return (
    <section>
      <PageHeader title="Tariffario interno" subtitle="Gestione riservata al SUPER_ADMIN. Le tariffe alimentano importi e fatturazione infragruppo." />
      {message ? <div className="notice">{message}</div> : null}

      <form className="panel form-grid" onSubmit={(event) => void save(event)}>
        <label>Codice<input className="input" value={form.codice_profilo} onChange={(event) => update("codice_profilo", event.target.value)} placeholder="RESP_TEC" /></label>
        <label>Profilo<input className="input" value={form.nome_profilo} onChange={(event) => update("nome_profilo", event.target.value)} placeholder="Responsabile tecnico" /></label>
        <label>Area<select className="input" value={form.business_area_id} onChange={(event) => update("business_area_id", event.target.value)}><option value="">Non collegata</option>{lookup?.areas.map((area) => <option key={area.id} value={area.id}>{area.nome_area}</option>)}</select></label>
        <label>Costo base €/h<input className="input" type="number" step="0.01" value={form.costo_orario_base} onChange={(event) => update("costo_orario_base", event.target.value)} /></label>
        <label>Overhead %<input className="input" type="number" step="0.01" value={form.overhead_percentuale} onChange={(event) => update("overhead_percentuale", event.target.value)} /></label>
        <label>Margine %<input className="input" type="number" step="0.01" value={form.margine_percentuale} onChange={(event) => update("margine_percentuale", event.target.value)} /></label>
        <label className="wide">Descrizione<textarea className="input" rows={2} value={form.descrizione} onChange={(event) => update("descrizione", event.target.value)} /></label>
        <label className="wide">Note<textarea className="input" rows={2} value={form.note} onChange={(event) => update("note", event.target.value)} /></label>
        <div className="wide form-actions"><strong>Tariffa calcolata: {euro(preview)}</strong><button className="button primary" type="submit">Salva profilo</button></div>
      </form>

      <div className="panel table-panel">
        <div className="panel-title"><h3>Profili tariffari</h3><span>{rows.length} profili</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Codice</th><th>Profilo</th><th>Costo</th><th>Overhead</th><th>Margine</th><th>Tariffa</th><th>Stato</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.codice_profilo}</td><td>{row.nome_profilo}</td><td>{euro(row.costo_orario_base)}</td><td>{numberIt(row.overhead_percentuale, 1)}%</td><td>{numberIt(row.margine_percentuale, 1)}%</td><td><strong>{euro(row.tariffa_oraria_calcolata)}</strong></td><td>{row.attivo ? "Attivo" : "Disattivo"}</td><td><button className="button ghost" type="button" onClick={() => void toggle(row)}>{row.attivo ? "Disattiva" : "Attiva"}</button></td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
