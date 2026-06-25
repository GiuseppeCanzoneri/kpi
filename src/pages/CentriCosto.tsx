import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { fetchLookupData, type LookupData } from "../lib/kpiData";
import type { CostCenter } from "../types/db";

interface CostCenterForm {
  codice_centro_costo: string;
  nome_centro_costo: string;
  descrizione: string;
  company_id: string;
  business_area_id: string;
}

const emptyForm: CostCenterForm = {
  codice_centro_costo: "",
  nome_centro_costo: "",
  descrizione: "",
  company_id: "",
  business_area_id: "",
};

export default function CentriCosto() {
  const auth = useAuth();
  const [lookup, setLookup] = useState<LookupData | null>(null);
  const [rows, setRows] = useState<CostCenter[]>([]);
  const [form, setForm] = useState<CostCenterForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const lookupRows = await fetchLookupData(auth.areaIds, auth.isSuperAdmin);
    setLookup(lookupRows);
    let query = supabase.from("cost_centers").select("*").order("codice_centro_costo");
    if (!auth.isSuperAdmin && auth.areaIds.length > 0) query = query.in("business_area_id", auth.areaIds);
    const { data, error } = await query;
    if (error) setMessage(error.message);
    setRows((data ?? []) as CostCenter[]);
  }

  useEffect(() => {
    void load();
  }, [auth.areaIds.join("|"), auth.isSuperAdmin]);

  function update<K extends keyof CostCenterForm>(key: K, value: CostCenterForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.codice_centro_costo || !form.nome_centro_costo) {
      setMessage("Compila codice e nome centro costo.");
      return;
    }
    if (!auth.isSuperAdmin && !auth.areaIds.includes(form.business_area_id)) {
      setMessage("Puoi creare centri di costo solo per le tue aree.");
      return;
    }

    const payload = {
      codice_centro_costo: form.codice_centro_costo.trim().toUpperCase(),
      nome_centro_costo: form.nome_centro_costo.trim(),
      descrizione: form.descrizione || null,
      company_id: form.company_id || null,
      business_area_id: form.business_area_id || null,
      attivo: true,
    };

    const { error } = await supabase.from("cost_centers").upsert(payload, { onConflict: "codice_centro_costo" });
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm(emptyForm);
    setMessage("Centro di costo salvato.");
    await load();
  }

  async function toggle(row: CostCenter) {
    const { error } = await supabase.from("cost_centers").update({ attivo: !row.attivo }).eq("id", row.id);
    if (error) setMessage(error.message);
    await load();
  }

  return (
    <section>
      <PageHeader title="Centri di costo" subtitle="Rende utile il campo centro costo nel timesheet, filtrandolo per area." />
      {message ? <div className="notice">{message}</div> : null}
      <form className="panel form-grid" onSubmit={(event) => void save(event)}>
        <label>Codice<input className="input" value={form.codice_centro_costo} onChange={(event) => update("codice_centro_costo", event.target.value)} placeholder="TEC-PROG" /></label>
        <label>Nome<input className="input" value={form.nome_centro_costo} onChange={(event) => update("nome_centro_costo", event.target.value)} placeholder="Progettazione tecnica" /></label>
        <label>Società<select className="input" value={form.company_id} onChange={(event) => update("company_id", event.target.value)}><option value="">Tutte / non specificata</option>{lookup?.companies.map((company) => <option key={company.id} value={company.id}>{company.codice_societa}</option>)}</select></label>
        <label>Area<select className="input" value={form.business_area_id} onChange={(event) => update("business_area_id", event.target.value)}><option value="">Non collegata</option>{lookup?.areas.map((area) => <option key={area.id} value={area.id}>{area.codice_area} - {area.nome_area}</option>)}</select></label>
        <label className="wide">Descrizione<textarea className="input" rows={2} value={form.descrizione} onChange={(event) => update("descrizione", event.target.value)} /></label>
        <div className="wide form-actions"><button className="button primary" type="submit">Salva centro costo</button></div>
      </form>

      <div className="panel table-panel">
        <div className="panel-title"><h3>Elenco centri costo</h3><span>{rows.length} elementi</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Codice</th><th>Nome</th><th>Area</th><th>Stato</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.codice_centro_costo}</td><td>{row.nome_centro_costo}</td><td>{row.business_area_id ?? "—"}</td><td>{row.attivo ? "Attivo" : "Disattivo"}</td><td><button className="button ghost" type="button" onClick={() => void toggle(row)}>{row.attivo ? "Disattiva" : "Attiva"}</button></td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
