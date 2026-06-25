import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { BusinessArea, Company, Employee, KpiRole, LocationRow, TariffProfile, UserAreaRole } from "../types/db";

interface AccessForm {
  email: string;
  nome: string;
  cognome: string;
  mansione: string;
  role: KpiRole;
  company_id: string;
  location_id: string;
  business_area_id: string;
  tariff_profile_id: string;
  can_view_amounts: boolean;
}

const emptyForm: AccessForm = {
  email: "",
  nome: "",
  cognome: "",
  mansione: "",
  role: "USER_AREA",
  company_id: "",
  location_id: "",
  business_area_id: "",
  tariff_profile_id: "",
  can_view_amounts: false,
};

function guessNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "utente";
  const parts = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  const capitalized = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  return {
    nome: capitalized[0] || "Utente",
    cognome: capitalized.slice(1).join(" ") || "Da aggiornare",
  };
}

export default function Accessi() {
  const { user, isSuperAdmin, isAdminArea, areaIds, refreshRoles } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [areas, setAreas] = useState<BusinessArea[]>([]);
  const [tariffProfiles, setTariffProfiles] = useState<TariffProfile[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<UserAreaRole[]>([]);
  const [form, setForm] = useState<AccessForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowedAreas = useMemo(() => {
    if (isSuperAdmin) return areas;
    return areas.filter((a) => areaIds.includes(a.id));
  }, [areas, areaIds, isSuperAdmin]);

  const roleOptions: KpiRole[] = isSuperAdmin ? ["SUPER_ADMIN", "ADMIN_AREA", "USER_AREA"] : ["USER_AREA"];

  const filteredTariffProfiles = useMemo(() => {
    if (!form.business_area_id) return tariffProfiles;
    return tariffProfiles.filter((p) => !p.business_area_id || p.business_area_id === form.business_area_id);
  }, [tariffProfiles, form.business_area_id]);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const employeeByEmail = useMemo(() => new Map(employees.map((e) => [e.email.toLowerCase(), e])), [employees]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [companiesRes, locationsRes, areasRes, profilesRes, employeesRes, rolesRes] = await Promise.all([
      supabase.from("companies").select("*").order("ragione_sociale"),
      supabase.from("locations").select("*").order("nome_sede"),
      supabase.from("business_areas").select("*").order("nome_area"),
      supabase.from("tariff_profiles").select("*").eq("attivo", true).order("codice_profilo"),
      supabase.from("employees").select("*").order("cognome"),
      supabase.from("user_area_roles").select("*").order("assigned_at", { ascending: false }),
    ]);

    const firstError = [companiesRes, locationsRes, areasRes, profilesRes, employeesRes, rolesRes].find((r) => r.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setCompanies((companiesRes.data ?? []) as Company[]);
    setLocations((locationsRes.data ?? []) as LocationRow[]);
    setAreas((areasRes.data ?? []) as BusinessArea[]);
    setTariffProfiles((profilesRes.data ?? []) as TariffProfile[]);
    setEmployees((employeesRes.data ?? []) as Employee[]);
    setRoles((rolesRes.data ?? []) as UserAreaRole[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!form.business_area_id || form.tariff_profile_id) return;
    const firstProfile = tariffProfiles.find((p) => p.business_area_id === form.business_area_id) ?? tariffProfiles[0];
    if (firstProfile) setForm((prev) => ({ ...prev, tariff_profile_id: firstProfile.id }));
  }, [form.business_area_id, form.tariff_profile_id, tariffProfiles]);

  const assignRole = async () => {
    setError(null);
    setMessage(null);

    const email = form.email.trim().toLowerCase();
    if (!email) {
      setError("Inserisci l'email dell'utente.");
      return;
    }

    if (!isSuperAdmin && (!form.business_area_id || !areaIds.includes(form.business_area_id))) {
      setError("Puoi assegnare utenti solo alle tue aree.");
      return;
    }

    const guessed = guessNameFromEmail(email);
    const nome = form.nome.trim() || guessed.nome;
    const cognome = form.cognome.trim() || guessed.cognome;
    const defaultCompanyId = form.company_id || companies[0]?.id;
    const defaultTariffProfile = form.tariff_profile_id || filteredTariffProfiles[0]?.id || tariffProfiles[0]?.id;

    if (!defaultCompanyId || !defaultTariffProfile) {
      setError("Manca una società o un profilo tariffario di default. Compila prima le anagrafiche.");
      return;
    }

    setLoading(true);

    const rolePayload = {
      email,
      role: form.role,
      company_id: form.company_id || null,
      location_id: form.location_id || null,
      business_area_id: form.role === "SUPER_ADMIN" ? null : form.business_area_id || null,
      can_view_amounts: isSuperAdmin ? form.can_view_amounts || form.role !== "USER_AREA" : false,
      active: true,
      assigned_by: user?.id ?? null,
      assigned_at: new Date().toISOString(),
    };

    const { error: roleError } = await supabase.from("user_area_roles").insert(rolePayload);
    if (roleError) {
      setError(roleError.message);
      setLoading(false);
      return;
    }

    const existingEmployee = employeeByEmail.get(email);
    if (existingEmployee) {
      const { error: employeeUpdateError } = await supabase
        .from("employees")
        .update({
          nome: existingEmployee.nome || nome,
          cognome: existingEmployee.cognome || cognome,
          company_id: existingEmployee.company_id || defaultCompanyId,
          location_id: existingEmployee.location_id || form.location_id || null,
          tariff_profile_id: existingEmployee.tariff_profile_id || defaultTariffProfile,
          mansione: existingEmployee.mansione || form.mansione || null,
          attivo: true,
        })
        .eq("id", existingEmployee.id);
      if (employeeUpdateError) {
        setError(employeeUpdateError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: employeeInsertError } = await supabase.from("employees").insert({
        email,
        nome,
        cognome,
        company_id: defaultCompanyId,
        location_id: form.location_id || null,
        tariff_profile_id: defaultTariffProfile,
        mansione: form.mansione || null,
        attivo: true,
      });
      if (employeeInsertError) {
        setError(employeeInsertError.message);
        setLoading(false);
        return;
      }
    }

    setForm(emptyForm);
    setMessage("Ruolo assegnato e dipendente creato/aggiornato correttamente.");
    await Promise.all([load(), refreshRoles()]);
    setLoading(false);
  };

  const toggleRole = async (role: UserAreaRole, active: boolean) => {
    setError(null);
    const { error } = await supabase.from("user_area_roles").update({ active }).eq("id", role.id);
    if (error) setError(error.message);
    else {
      setMessage(active ? "Ruolo riattivato." : "Ruolo disattivato.");
      await Promise.all([load(), refreshRoles()]);
    }
  };

  if (!canAdmin) {
    return <div className="panel"><h3>Accesso non consentito</h3><p className="muted">Questa sezione è riservata agli amministratori.</p></div>;
  }

  return (
    <div className="page access-page">
      <PageHeader
        kicker="Modulo KPI"
        title="Accessi e ruoli"
        description="Assegna un ruolo e crea automaticamente il dipendente collegato al timesheet. Così l’utente non deve selezionarsi: il sistema lo riconosce dalla sua email."
      />

      {error && <div className="alert error"><XCircle size={16} /> {error}</div>}
      {message && <div className="alert success"><CheckCircle2 size={16} /> {message}</div>}

      <section className="panel hero-panel">
        <div className="panel-header align-start">
          <div>
            <span className="eyebrow">Nuova abilitazione</span>
            <h3>Assegna utente</h3>
            <p>Il ruolo finisce in <strong>Accessi</strong> e l’email viene sincronizzata in <strong>Dipendenti</strong>.</p>
          </div>
          <button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
        </div>

        <div className="form-grid refined">
          <label>
            <span>Email utente *</span>
            <input className="input" type="email" value={form.email} placeholder="nome.cognome@azienda.it" onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            <span>Ruolo *</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as KpiRole })}>
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>
            <span>Nome dipendente</span>
            <input className="input" value={form.nome} placeholder="Compilato automaticamente se vuoto" onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label>
            <span>Cognome dipendente</span>
            <input className="input" value={form.cognome} placeholder="Compilato automaticamente se vuoto" onChange={(e) => setForm({ ...form, cognome: e.target.value })} />
          </label>
          <label>
            <span>Società datrice</span>
            <select className="input" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
              <option value="">Default / da completare</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.codice_societa} · {c.ragione_sociale}</option>)}
            </select>
          </label>
          <label>
            <span>Sede</span>
            <select className="input" value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
              <option value="">Non specificata</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.nome_sede}</option>)}
            </select>
          </label>
          <label>
            <span>Area</span>
            <select className="input" value={form.business_area_id} onChange={(e) => setForm({ ...form, business_area_id: e.target.value, tariff_profile_id: "" })} disabled={form.role === "SUPER_ADMIN"}>
              <option value="">Tutte / non specificata</option>
              {allowedAreas.map((a) => <option key={a.id} value={a.id}>{a.codice_area} · {a.nome_area}</option>)}
            </select>
          </label>
          <label>
            <span>Profilo tariffario dipendente</span>
            <select className="input" value={form.tariff_profile_id} onChange={(e) => setForm({ ...form, tariff_profile_id: e.target.value })}>
              <option value="">Default per area</option>
              {filteredTariffProfiles.map((p) => <option key={p.id} value={p.id}>{p.codice_profilo} · {p.nome_profilo}</option>)}
            </select>
          </label>
          <label>
            <span>Mansione</span>
            <input className="input" value={form.mansione} placeholder="Es. Tecnico area, amministrazione, gare..." onChange={(e) => setForm({ ...form, mansione: e.target.value })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.can_view_amounts} onChange={(e) => setForm({ ...form, can_view_amounts: e.target.checked })} disabled={!isSuperAdmin} />
            <span>Può vedere importi economici</span>
          </label>
        </div>

        <div className="panel-actions">
          <button className="button xl" onClick={assignRole} disabled={loading}><UserPlus size={18} /> Assegna ruolo e crea dipendente</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Ruoli attivi</span>
            <h3>Assegnazioni</h3>
          </div>
          <span className="count-badge">{roles.length} assegnazioni</span>
        </div>
        <div className="table-wrap elevated-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Dipendente</th>
                <th>Ruolo</th>
                <th>Società</th>
                <th>Sede</th>
                <th>Area</th>
                <th>Importi</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const employee = employeeByEmail.get(role.email.toLowerCase());
                return (
                  <tr key={role.id}>
                    <td><strong>{role.email}</strong></td>
                    <td>{employee ? `${employee.nome} ${employee.cognome}` : <span className="muted">Da creare</span>}</td>
                    <td><span className={`role-badge role-${role.role.toLowerCase()}`}>{role.role}</span></td>
                    <td>{role.company_id ? companyById.get(role.company_id)?.codice_societa ?? "—" : "Tutte"}</td>
                    <td>{role.location_id ? locationById.get(role.location_id)?.nome_sede ?? "—" : "—"}</td>
                    <td>{role.business_area_id ? `${areaById.get(role.business_area_id)?.codice_area ?? ""} · ${areaById.get(role.business_area_id)?.nome_area ?? "Area"}` : "Tutte"}</td>
                    <td>{role.can_view_amounts ? "Sì" : "No"}</td>
                    <td>{role.active ? <span className="status-pill ok">Attivo</span> : <span className="status-pill off">Disattivo</span>}</td>
                    <td>
                      <button className="icon-button" onClick={() => toggleRole(role, !role.active)}>
                        <ShieldCheck size={15} /> {role.active ? "Disattiva" : "Riattiva"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
