import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw, Save, ShieldCheck, UserPlus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { fetchLookupData, type LookupData } from "../lib/kpiData";
import type { KpiRole, UserAreaRole } from "../types/db";

interface RoleForm {
  email: string;
  password: string;
  confirmPassword: string;
  role: KpiRole;
  company_id: string;
  location_id: string;
  business_area_id: string;
  can_view_amounts: boolean;
}

const emptyForm: RoleForm = {
  email: "",
  password: "",
  confirmPassword: "",
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const canCreateAdvancedRoles = auth.isSuperAdmin;
  const availableRoles: KpiRole[] = canCreateAdvancedRoles
    ? ["USER_AREA", "ADMIN_AREA", "SUPER_ADMIN"]
    : ["USER_AREA"];

  const areaNameById = useMemo(() => {
    const map = new Map<string, string>();
    lookup?.areas.forEach((area) => map.set(area.id, `${area.codice_area} · ${area.nome_area}`));
    return map;
  }, [lookup?.areas]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const lookupRows = await fetchLookupData(auth.areaIds, auth.isSuperAdmin);
      setLookup(lookupRows);

      let query = supabase
        .from("user_area_roles")
        .select("*")
        .order("assigned_at", { ascending: false });

      if (!auth.isSuperAdmin && auth.areaIds.length > 0) {
        query = query.in("business_area_id", auth.areaIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRows((data ?? []) as UserAreaRole[]);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [auth.areaIds, auth.isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof RoleForm>(key: K, value: RoleForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "role" && value === "SUPER_ADMIN") {
        next.business_area_id = "";
        next.can_view_amounts = true;
      }
      if (key === "role" && value === "ADMIN_AREA") {
        next.can_view_amounts = true;
      }
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const email = form.email.trim().toLowerCase();

    if (!email || !form.role) {
      setError("Inserisci email e ruolo.");
      return;
    }

    if (!form.password || form.password.length < 6) {
      setError("Inserisci una password di almeno 6 caratteri.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    if (!auth.isSuperAdmin && form.role !== "USER_AREA") {
      setError("L'ADMIN_AREA può creare solo USER_AREA.");
      return;
    }

    if (form.role !== "SUPER_ADMIN" && !form.business_area_id) {
      setError("Seleziona un'area per USER_AREA o ADMIN_AREA.");
      return;
    }

    if (!auth.isSuperAdmin && !auth.areaIds.includes(form.business_area_id)) {
      setError("Puoi assegnare utenti solo alle tue aree.");
      return;
    }

    setSaving(true);

    // Utilizzo del nome della funzione: il client Supabase gestisce l'URL di base
    const { data, error } = await supabase.functions.invoke("create-kpi-user", {
      body: {
        email,
        password: form.password,
        role: form.role,
        company_id: form.company_id || null,
        location_id: form.location_id || null,
        business_area_id: form.role === "SUPER_ADMIN" ? null : form.business_area_id,
        can_view_amounts: form.role === "ADMIN_AREA" || form.role === "SUPER_ADMIN" || form.can_view_amounts,
      },
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    setForm(emptyForm);
    setMessage(data?.message ?? "Utente creato e ruolo assegnato.");
    await load();
    await auth.refreshRoles();
  }

  async function toggleActive(row: UserAreaRole) {
    setMessage(null);
    setError(null);

    const { error } = await supabase
      .from("user_area_roles")
      .update({ active: !row.active })
      .eq("id", row.id);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
    await auth.refreshRoles();
  }

  return (
    <div>
      <PageHeader
        title="Accessi e ruoli"
        description="Crea l'utente con password e assegna subito il ruolo KPI. La registrazione pubblica dal login resta disattivata."
        actions={
          <button className="button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Aggiorna
          </button>
        }
      />

      <div className="kpi-grid small">
        <div className="kpi-card">
          <span>Utenti configurati</span>
          <strong>{rows.length}</strong>
          <small>Ruoli attivi e disattivi</small>
        </div>
        <div className="kpi-card">
          <span>Area corrente</span>
          <strong>{auth.isSuperAdmin ? "Tutte" : auth.areaIds.length}</strong>
          <small>Ambito di gestione</small>
        </div>
        <div className="kpi-card">
          <span>Sicurezza</span>
          <strong>Password</strong>
          <small>Creata da admin</small>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {message && (
        <div className="alert success">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <div className="split-grid access-grid">
        <form className="panel access-form" onSubmit={save}>
          <div className="panel-title">
            <UserPlus size={18} />
            <div>
              <h3>Nuova utenza</h3>
              <p>Email, password e ruolo operativo.</p>
            </div>
          </div>

          <div className="form-grid refined">
            <label>
              Email utente *
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="utente@azienda.it"
                autoComplete="off"
              />
            </label>

            <label>
              Ruolo *
              <select className="input" value={form.role} onChange={(event) => update("role", event.target.value as KpiRole)}>
                {availableRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>

            <label>
              Password *
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder="Minimo 6 caratteri"
                autoComplete="new-password"
              />
            </label>

            <label>
              Conferma password *
              <input
                className="input"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => update("confirmPassword", event.target.value)}
                placeholder="Ripeti password"
                autoComplete="new-password"
              />
            </label>

            <label>
              Società
              <select className="input" value={form.company_id} onChange={(event) => update("company_id", event.target.value)}>
                <option value="">Tutte / non specificata</option>
                {lookup?.companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.codice_societa} · {item.ragione_sociale}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sede
              <select className="input" value={form.location_id} onChange={(event) => update("location_id", event.target.value)}>
                <option value="">Tutte / non specificata</option>
                {lookup?.locations.map((item) => (
                  <option key={item.id} value={item.id}>{item.nome_sede}</option>
                ))}
              </select>
            </label>

            <label className={form.role === "SUPER_ADMIN" ? "muted-field" : ""}>
              Area {form.role !== "SUPER_ADMIN" ? "*" : ""}
              <select
                className="input"
                value={form.business_area_id}
                onChange={(event) => update("business_area_id", event.target.value)}
                disabled={form.role === "SUPER_ADMIN"}
              >
                <option value="">Seleziona area</option>
                {lookup?.areas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.codice_area} · {item.nome_area}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.role === "ADMIN_AREA" || form.role === "SUPER_ADMIN" || form.can_view_amounts}
                disabled={form.role === "ADMIN_AREA" || form.role === "SUPER_ADMIN"}
                onChange={(event) => update("can_view_amounts", event.target.checked)}
              />
              Può vedere importi
            </label>
          </div>

          <div className="hint-box">
            <KeyRound size={16} />
            L'utente potrà accedere subito dal login con la password impostata qui.
          </div>

          <button className="button full" disabled={saving}>
            <Save size={16} /> {saving ? "Creo utenza..." : "Crea utente e assegna ruolo"}
          </button>
        </form>

        <div className="panel">
          <div className="panel-title">
            <ShieldCheck size={18} />
            <div>
              <h3>Ruoli assegnati</h3>
              <p>{rows.length} assegnazioni presenti.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Ruolo</th>
                  <th>Area</th>
                  <th>Importi</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.email}</strong></td>
                    <td><span className="status-pill approvato">{row.role}</span></td>
                    <td>{row.business_area_id ? areaNameById.get(row.business_area_id) ?? row.business_area_id : "Tutte"}</td>
                    <td>{row.can_view_amounts ? "Sì" : "No"}</td>
                    <td>{row.active ? "Attivo" : "Disattivo"}</td>
                    <td>
                      <button className="button secondary small" type="button" onClick={() => void toggleActive(row)}>
                        {row.active ? "Disattiva" : "Attiva"}
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">Nessun ruolo configurato.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}