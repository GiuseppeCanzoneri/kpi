import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { euro, numberIt } from "../lib/format";
import type { TimesheetStatus, TimesheetView } from "../types/db";

export default function Approvazioni() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canApprove = isSuperAdmin || isAdminArea;

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .in("stato", ["Bozza", "Da correggere"])
      .order("data", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const setStatus = async (row: TimesheetView, stato: TimesheetStatus) => {
    const { error } = await supabase.from("timesheet_entries").update({ stato }).eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  };

  if (!canApprove) {
    return <div><PageHeader title="Approvazione ore" subtitle="Sezione riservata a SUPER_ADMIN e ADMIN_AREA." /><div className="alert error">Non hai permessi di approvazione.</div></div>;
  }

  return (
    <div>
      <PageHeader title="Approvazione ore" subtitle="Controlla le righe in bozza o da correggere e approva le ore della tua area." actions={<button className="button secondary" onClick={load}><RefreshCw size={16} /> Aggiorna</button>} />
      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento...</div>}
      <section className="panel">
        {rows.length === 0 ? <EmptyState title="Nessuna ora da approvare" text="Le righe approvate o fatturate non vengono mostrate qui." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Dipendente</th><th>Area</th><th>Centro costo</th><th>Commessa</th><th>Attività</th><th>Ore</th><th>Importo</th><th>Stato</th><th>Azioni</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.data}</td>
                    <td>{row.employee_name}</td>
                    <td>{row.codice_area}</td>
                    <td>{row.codice_centro_costo ?? <span className="muted">Non assegnato</span>}</td>
                    <td>{row.codice_commessa}</td>
                    <td>{row.codice_attivita}</td>
                    <td>{numberIt(row.ore)}</td>
                    <td>{row.importo_visibile === null ? <span className="muted">Riservato</span> : euro(row.importo_visibile)}</td>
                    <td><span className="pill">{row.stato}</span></td>
                    <td className="row-actions">
                      <button className="icon-button success" onClick={() => setStatus(row, "Approvato")}><CheckCircle2 size={14} /> Approva</button>
                      <button className="icon-button warning" onClick={() => setStatus(row, "Da correggere")}><XCircle size={14} /> Correggi</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
