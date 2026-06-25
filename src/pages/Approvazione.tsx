import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { euro, numberIt, statusClass } from "../lib/format";
import { filterRowsByRole } from "../lib/kpiData";
import type { TimesheetStatus, TimesheetView } from "../types/db";

export default function Approvazione() {
  const auth = useAuth();
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .in("stato", ["Bozza", "Da correggere", "Approvato"])
      .order("data", { ascending: false });

    if (error) {
      console.error("Errore approvazione", error);
      setRows([]);
    } else {
      setRows(filterRowsByRole((data ?? []) as TimesheetView[], auth.areaIds, auth.user?.email ?? null, auth.isSuperAdmin, auth.isAdminArea));
    }
  }

  useEffect(() => {
    void load();
  }, [auth.areaIds.join("|"), auth.isSuperAdmin, auth.isAdminArea, auth.user?.email]);

  async function updateStatus(row: TimesheetView, stato: TimesheetStatus) {
    const payload = stato === "Approvato" ? { stato, approved_by: auth.user?.id ?? null, approved_at: new Date().toISOString() } : { stato };
    const { error } = await supabase.from("timesheet_entries").update(payload).eq("id", row.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Riga aggiornata a ${stato}.`);
    await load();
  }

  return (
    <section>
      <PageHeader title="Approvazione ore" subtitle="Controlla, approva o rimanda in correzione le ore della tua area." />
      {message ? <div className="notice">{message}</div> : null}
      <div className="panel table-panel">
        {rows.length === 0 ? <EmptyState title="Nessuna riga da gestire" text="Le righe in bozza o da correggere appariranno qui." /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Utente</th><th>Area</th><th>Centro costo</th><th>Attività</th><th>Ore</th><th>Importo</th><th>Stato</th><th>Azioni</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id}><td>{row.data}</td><td>{row.employee_name}</td><td>{row.nome_area}</td><td>{row.codice_centro_costo ?? "—"}</td><td>{row.nome_categoria}</td><td>{numberIt(row.ore)}</td><td>{auth.canViewAmounts ? euro(row.importo_visibile ?? row.importo) : "Riservato"}</td><td><span className={statusClass(row.stato)}>{row.stato}</span></td><td className="actions-cell"><button className="button success" type="button" onClick={() => void updateStatus(row, "Approvato")}>Approva</button><button className="button warning" type="button" onClick={() => void updateStatus(row, "Da correggere")}>Correggi</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
