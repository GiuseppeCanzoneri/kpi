import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { fetchLookupData, type LookupData } from "../lib/kpiData";
import type { KpiRole, UserAreaRole } from "../types/db";

interface RoleForm {
  email: string;
  role: KpiRole;
  company_id: string;
  location_id: string;
  business_area_id: string;
  can_view_amounts: boolean;
}

const emptyForm: RoleForm = {
  email: "",
  role: "USER_AREA",
  company_id: "",
  location_id: "",
  business_area_id: "",
  can_view_amounts: false,
};

export default function Accessi() {
  const auth = useAuth();
  const [lookup, setLookup] = useState<LookupData | null>(null);
  const [rows, setRows] = useState<UserAreaRole[]>([]);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const lookupRows = await fetchLookupData(auth.areaIds, auth.isSuperAdmin);
    setLookup(lookupRows);

    let query = supabase.from("user_area_roles").select("*").order("assigned_at", { ascending: false });
    if (!auth.isSuperAdmin && auth.areaIds.length > 0) query = query.in("business_area_id", auth.areaIds);
    const { data, error } = await query;
    if (error) {
      console.error("Errore accessi", error);
      setRows([]);
    } else {
      setRows((data ?? []) as UserAreaRole[]);
    }
  }

  useEffect(() => {
    void load();
  }, [auth.areaIds.join("|"), auth.isSuperAdmin]);

  function update<K extends keyof RoleForm>(key: K, value: RoleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.email || !form.role) {
      setMessage("Inserisci email e ruolo.");
      return;
    }

    if (!auth.isSuperAdmin && form.role !== "USER_AREA") {
      setMessage("L'ADMIN_AREA può assegnare solo USER_AREA.");
      return;
    }

    if (!auth.isSuperAdmin && !auth.areaIds.includes(form.business_area_id)) {
      setMessage("Puoi assegnare utenti solo alle tue aree.");
      return;
    }

    const payload = {
      email: form.email.toLowerCase().trim(),
      role: form.role,
      company_id: form.company_id || null,
      location_id: form.location_id || null,
      business_area_id: form.business_area_id || null,
      can_view_amounts: form.role === "ADMIN_AREA" || form.can_view_amounts,
      active: true,
      assigned_by: auth.user?.id ?? null,
    };

    const { error } = await supabase.from("user_area_roles").insert(payload);
    if (error) {
      setMessage(error.message);
      return;
    }

    setForm(emptyForm);
    setMessage("Ruolo assegnato correttamente. L'utente verrà aggiornato senza refresh manuali.");
    await load();
    await auth.refreshRoles();
  }

  async function toggleActive(row: UserAreaRole) {
    const { error } = await supabase.from("user_area_roles").update({ active: !row.active }).eq("id", row.id);
    if (error) setMessage(error.message);
    await load();
  }

  return (
    <section>
      <PageHeader title="Accessi e ruoli" subtitle="Assegna SUPER_ADMIN, ADMIN_AREA e USER_AREA senza dover ricaricare più volte la pagina." />
      {message ? <div className="notice">{message}</div> : null}

      <form className="panel form-grid" onSubmit={(event) => void save(event)}>
        <label>Email utente<input className="input" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="utente@azienda.it" /></label>
        <label>Ruolo<select className="input" value={form.role} onChange={(event) => update("role", event.target.value as KpiRole)}><option value="USER_AREA">USER_AREA</option><option value="ADMIN_AREA">ADMIN_AREA</option>{auth.isSuperAdmin ? <option value="SUPER_ADMIN">SUPER_ADMIN</option> : null}</select></label>
        <label>Società<select className="input" value={form.company_id} onChange={(event) => update("company_id", event.target.value)}><option value="">Tutte / non specificata</option>{lookup?.companies.map((item) => <option key={item.id} value={item.id}>{item.codice_societa} - {item.ragione_sociale}</option>)}</select></label>
        <label>Sede<select className="input" value={form.location_id} onChange={(event) => update("location_id", event.target.value)}><option value="">Tutte / non specificata</option>{lookup?.locations.map((item) => <option key={item.id} value={item.id}>{item.nome_sede}</option>)}</select></label>
        <label>Area<select className="input" value={form.business_area_id} onChange={(event) => update("business_area_id", event.target.value)}><option value="">Tutte / non specificata</option>{lookup?.areas.map((item) => <option key={item.id} value={item.id}>{item.codice_area} - {item.nome_area}</option>)}</select></label>
        <label className="checkbox-line"><input type="checkbox" checked={form.can_view_amounts} onChange={(event) => update("can_view_amounts", event.target.checked)} /> Può vedere importi</label>
        <div className="wide form-actions"><button className="button primary" type="submit">Assegna ruolo</button></div>
      </form>

      <div className="panel table-panel">
        <div className="panel-title"><h3>Ruoli assegnati</h3><span>{rows.length} assegnazioni</span></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Email</th><th>Ruolo</th><th>Area</th><th>Importi</th><th>Stato</th><th /></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.email}</td><td><span className="role-badge">{row.role}</span></td><td>{row.business_area_id ?? "Tutte"}</td><td>{row.can_view_amounts ? "Sì" : "No"}</td><td>{row.active ? "Attivo" : "Disattivo"}</td><td><button className="button ghost" type="button" onClick={() => void toggleActive(row)}>{row.active ? "Disattiva" : "Attiva"}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
