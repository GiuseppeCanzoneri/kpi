import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Eye, EyeOff, KeyRound, Mail, RefreshCw, ShieldCheck, UserPlus, XCircle } from "lucide-react";
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
  password: string;
  send_credentials_email: boolean;
}

interface CreateUserResponse {
  ok?: boolean;
  message?: string;
  email_sent?: boolean;
  email_error?: string | null;
  error?: string;
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
  password: "",
  send_credentials_email: true,
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

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(14);
  crypto.getRandomValues(values);
  const random = Array.from(values, (value) => chars[value % chars.length]).join("");
  return `Kpi-${random}`;
}

function RoleBadge({ role }: { role: KpiRole }) {
  return <span className={`role-badge role-${role.toLowerCase()}`}>{role}</span>;
}

export default function Accessi() {
  const {  isSuperAdmin, isAdminArea, areaIds, refreshRoles } = useAuth();
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
  const [showPassword, setShowPassword] = useState(false);

  const allowedAreas = useMemo(() => {
    if (isSuperAdmin) return areas;
    return areas.filter((area) => areaIds.includes(area.id));
  }, [areas, areaIds, isSuperAdmin]);

  const roleOptions: KpiRole[] = isSuperAdmin ? ["SUPER_ADMIN", "ADMIN_AREA", "USER_AREA"] : ["USER_AREA"];

  const filteredTariffProfiles = useMemo(() => {
    if (!form.business_area_id) return tariffProfiles;
    return tariffProfiles.filter((profile) => !profile.business_area_id || profile.business_area_id === form.business_area_id);
  }, [tariffProfiles, form.business_area_id]);

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
  const employeeByEmail = useMemo(() => new Map(employees.map((employee) => [employee.email.toLowerCase(), employee])), [employees]);

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

    const firstError = [companiesRes, locationsRes, areasRes, profilesRes, employeesRes, rolesRes].find((response) => response.error)?.error;
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
    const firstProfile = tariffProfiles.find((profile) => profile.business_area_id === form.business_area_id) ?? tariffProfiles[0];
    if (firstProfile) setForm((prev) => ({ ...prev, tariff_profile_id: firstProfile.id }));
  }, [form.business_area_id, form.tariff_profile_id, tariffProfiles]);

  const handleEmailBlur = () => {
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    if (form.nome || form.cognome) return;
    const guessed = guessNameFromEmail(email);
    setForm((prev) => ({ ...prev, nome: guessed.nome, cognome: guessed.cognome }));
  };

  const copyPassword = async () => {
    if (!form.password) return;
    await navigator.clipboard.writeText(form.password);
    setMessage("Password temporanea copiata negli appunti.");
  };

  const assignRoleAndCreateAccount = async () => {
    setError(null);
    setMessage(null);

    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Inserisci un'email valida.");
      return;
    }

    if (!isSuperAdmin && (!form.business_area_id || !areaIds.includes(form.business_area_id))) {
      setError("Puoi creare utenti solo per le tue aree.");
      return;
    }

    const guessed = guessNameFromEmail(email);
    const nome = form.nome.trim() || guessed.nome;
    const cognome = form.cognome.trim() || guessed.cognome;
    const companyId = form.company_id || companies[0]?.id;
    const tariffProfileId = form.tariff_profile_id || filteredTariffProfiles[0]?.id || tariffProfiles[0]?.id;
    const businessAreaId = form.role === "SUPER_ADMIN" ? "" : form.business_area_id;
    const password = form.password.trim() || generateTemporaryPassword();

    if (!companyId) {
      setError("Manca la società datrice. Compila prima le anagrafiche società.");
      return;
    }

    if (!tariffProfileId) {
      setError("Manca il profilo tariffario. Compila prima il tariffario.");
      return;
    }

    if (form.role !== "SUPER_ADMIN" && !businessAreaId) {
      setError("Per USER_AREA e ADMIN_AREA devi selezionare un'area.");
      return;
    }

    if (password.length < 8) {
      setError("La password temporanea deve avere almeno 8 caratteri.");
      return;
    }

    setLoading(true);
    setForm((prev) => ({ ...prev, password }));

    const { data, error: invokeError } = await supabase.functions.invoke<CreateUserResponse>("create-kpi-user", {
      body: {
        email,
        password,
        nome,
        cognome,
        mansione: form.mansione.trim() || null,
        role: form.role,
        company_id: companyId,
        location_id: form.location_id || null,
        business_area_id: businessAreaId || null,
        tariff_profile_id: tariffProfileId,
        can_view_amounts: isSuperAdmin ? form.can_view_amounts || form.role !== "USER_AREA" : false,
        send_credentials_email: form.send_credentials_email,
        portal_url: window.location.origin,
      },
    });

    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Errore durante la creazione dell'account.");
      setLoading(false);
      return;
    }

    if (data?.email_error) {
      setError(`Account creato, ma email non inviata: ${data.email_error}`);
    }

    setMessage(
      data?.message ||
        (data?.email_sent
          ? "Account creato e credenziali inviate via email."
          : "Account creato/aggiornato correttamente."),
    );

    setForm(emptyForm);
    await Promise.all([load(), refreshRoles()]);
    setLoading(false);
  };

  const toggleRole = async (role: UserAreaRole, active: boolean) => {
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase.from("user_area_roles").update({ active }).eq("id", role.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(active ? "Ruolo riattivato." : "Ruolo disattivato.");
    await Promise.all([load(), refreshRoles()]);
  };

  if (!canAdmin) {
    return (
      <div className="page">
        <PageHeader title="Accesso non consentito" description="Questa sezione è riservata agli amministratori." />
      </div>
    );
  }

  return (
    <div className="page accessi-page">
      <PageHeader
        title="Accessi e ruoli"
        description="Crea account, assegna ruoli e invia automaticamente le credenziali ai dipendenti."
        actions={
          <button className="button secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Aggiorna
          </button>
        }
      />

      {error ? (
        <div className="alert error">
          <XCircle size={18} /> {error}
        </div>
      ) : null}

      {message ? (
        <div className="alert success">
          <CheckCircle2 size={18} /> {message}
        </div>
      ) : null}

      <div className="panel access-create-panel">
        <div className="panel-header align-start">
          <div>
            <span className="page-kicker">Nuova abilitazione</span>
            <h3>Creazione account dipendente</h3>
            <p>
              Il sistema crea l’utente in Supabase Auth, lo collega ai dipendenti, assegna il ruolo e invia l’email con le credenziali.
            </p>
          </div>
          <div className="access-mail-status">
            <Mail size={18} /> Invio tramite Resend
          </div>
        </div>

        <div className="form-grid refined access-form-grid">
          <label>
            Email utente *
            <input
              className="input"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              onBlur={handleEmailBlur}
              placeholder="nome.cognome@azienda.it"
            />
          </label>

          <label>
            Ruolo *
            <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as KpiRole })}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nome dipendente
            <input className="input" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
          </label>

          <label>
            Cognome dipendente
            <input className="input" value={form.cognome} onChange={(event) => setForm({ ...form, cognome: event.target.value })} />
          </label>

          <label>
            Società datrice *
            <select className="input" value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seleziona società</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.codice_societa} · {company.ragione_sociale}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sede
            <select className="input" value={form.location_id} onChange={(event) => setForm({ ...form, location_id: event.target.value })}>
              <option value="">Non specificata</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.nome_sede}
                </option>
              ))}
            </select>
          </label>

          <label>
            Area {form.role !== "SUPER_ADMIN" ? "*" : ""}
            <select
              className="input"
              value={form.business_area_id}
              onChange={(event) => setForm({ ...form, business_area_id: event.target.value, tariff_profile_id: "" })}
              disabled={form.role === "SUPER_ADMIN"}
            >
              <option value="">Tutte / non specificata</option>
              {allowedAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.codice_area} · {area.nome_area}
                </option>
              ))}
            </select>
          </label>

          <label>
            Profilo tariffario dipendente *
            <select className="input" value={form.tariff_profile_id} onChange={(event) => setForm({ ...form, tariff_profile_id: event.target.value })}>
              <option value="">Seleziona profilo</option>
              {filteredTariffProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.codice_profilo} · {profile.nome_profilo}
                </option>
              ))}
            </select>
          </label>

          <label>
            Mansione
            <input className="input" value={form.mansione} onChange={(event) => setForm({ ...form, mansione: event.target.value })} placeholder="Es. Tecnico, amministrativo, HR..." />
          </label>

          <label>
            Password temporanea *
            <div className="password-control">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Generata automaticamente se lasci vuoto"
              />
              <button type="button" className="icon-button" onClick={() => setShowPassword((value) => !value)} title="Mostra/nascondi password">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button type="button" className="icon-button" onClick={() => setForm({ ...form, password: generateTemporaryPassword() })} title="Genera password">
                <KeyRound size={16} />
              </button>
              <button type="button" className="icon-button" onClick={copyPassword} disabled={!form.password} title="Copia password">
                <Copy size={16} />
              </button>
            </div>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.send_credentials_email}
              onChange={(event) => setForm({ ...form, send_credentials_email: event.target.checked })}
            />
            Invia email automatica con credenziali al dipendente
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.can_view_amounts}
              onChange={(event) => setForm({ ...form, can_view_amounts: event.target.checked })}
              disabled={!isSuperAdmin}
            />
            Può vedere importi economici
          </label>
        </div>

        <div className="credentials-preview">
          <div>
            <strong>Email inviata da</strong>
            <span>kpi@updates.as-protech.org oppure mittente configurato nei secrets Supabase</span>
          </div>
          <div>
            <strong>Contenuto email</strong>
            <span>Link portale, email, password temporanea, ruolo e istruzioni operative.</span>
          </div>
        </div>

        <div className="panel-actions">
          <button className="button xl" onClick={assignRoleAndCreateAccount} disabled={loading}>
            <UserPlus size={18} /> Crea account e invia credenziali
          </button>
        </div>
      </div>

      <div className="panel flush-panel">
        <div className="panel-header table-panel-header">
          <div>
            <span className="page-kicker">Ruoli attivi</span>
            <h3>Assegnazioni</h3>
          </div>
          <span className="count-badge">{roles.length} assegnazioni</span>
        </div>

        <div className="table-wrap">
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
                    <td>
                      <strong>{role.email}</strong>
                    </td>
                    <td>{employee ? `${employee.nome} ${employee.cognome}` : "Da creare"}</td>
                    <td>
                      <RoleBadge role={role.role} />
                    </td>
                    <td>{role.company_id ? companyById.get(role.company_id)?.codice_societa ?? "—" : "Tutte"}</td>
                    <td>{role.location_id ? locationById.get(role.location_id)?.nome_sede ?? "—" : "—"}</td>
                    <td>
                      {role.business_area_id
                        ? `${areaById.get(role.business_area_id)?.codice_area ?? ""} · ${areaById.get(role.business_area_id)?.nome_area ?? "Area"}`
                        : "Tutte"}
                    </td>
                    <td>{role.can_view_amounts ? "Sì" : "No"}</td>
                    <td>
                      <span className={`status-pill ${role.active ? "ok" : "off"}`}>{role.active ? "Attivo" : "Disattivo"}</span>
                    </td>
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
      </div>
    </div>
  );
}
