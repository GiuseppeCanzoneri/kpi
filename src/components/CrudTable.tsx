import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { EmptyState } from "./EmptyState";

type FieldType = "text" | "number" | "date" | "boolean" | "textarea" | "select" | "email";

export interface FieldConfig {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  readonly?: boolean;
  hideInTable?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface CrudTableProps {
  title: string;
  table: string;
  fields: FieldConfig[];
  canEdit: boolean;
  orderBy?: string;
  defaultValues?: Record<string, unknown>;
}

export function CrudTable({ title, table, fields, canEdit, orderBy = "created_at", defaultValues = {} }: CrudTableProps) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [filter, setFilter] = useState("");

  const visibleFields = fields.filter((f) => !f.hideInTable);

  const load = async () => {
    setLoading(true);
    setError(null);
    const query = supabase.from(table).select("*");
    const { data, error } = await query.order(orderBy, { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as Record<string, any>[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [table]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [rows, filter]);

  const startNew = () => setEditing({ ...defaultValues });
  const startEdit = (row: Record<string, any>) => setEditing({ ...row });

  const save = async () => {
    if (!editing) return;
    setError(null);
    const payload = { ...editing };
    delete payload.created_at;
    delete payload.updated_at;
    fields.forEach((field) => {
      if (field.readonly) delete payload[field.key];
    });
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });

    const isUpdate = Boolean(payload.id);
    const { error } = isUpdate
      ? await supabase.from(table).update(payload).eq("id", payload.id)
      : await supabase.from(table).insert(payload);

    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Eliminare questo record?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message);
    else await load();
  };

  const setValue = (key: string, value: unknown) => setEditing((prev) => ({ ...(prev ?? {}), [key]: value }));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{rows.length} record</p>
        </div>
        <div className="toolbar">
          <input className="input small" placeholder="Cerca..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="button secondary" onClick={load}><RefreshCw size={16} /> Aggiorna</button>
          {canEdit && <button className="button" onClick={startNew}><Plus size={16} /> Nuovo</button>}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading ? <div className="loading">Caricamento...</div> : filtered.length === 0 ? <EmptyState title="Nessun record" text="Inserisci il primo dato o importa dal modello Excel." /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {visibleFields.map((field) => <th key={field.key}>{field.label}</th>)}
                {canEdit && <th>Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} onDoubleClick={() => canEdit && startEdit(row)}>
                  {visibleFields.map((field) => <td key={field.key}>{formatCell(row[field.key], field)}</td>)}
                  {canEdit && (
                    <td className="row-actions">
                      <button className="icon-button" onClick={() => startEdit(row)}>Modifica</button>
                      <button className="icon-button danger" onClick={() => remove(row.id)}><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <div className="modal large">
            <div className="modal-header">
              <h3>{editing.id ? `Modifica ${title}` : `Nuovo ${title}`}</h3>
              <button className="icon-button" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="form-grid">
              {fields.map((field) => (
                <label key={field.key} className={field.type === "textarea" ? "full" : ""}>
                  <span>{field.label}{field.required && " *"}</span>
                  {renderInput(field, editing[field.key], (value) => setValue(field.key, value))}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setEditing(null)}>Annulla</button>
              <button className="button" onClick={save}><Save size={16} /> Salva</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function renderInput(field: FieldConfig, value: any, onChange: (value: any) => void) {
  if (field.readonly) return <input className="input" value={value ?? ""} readOnly />;
  if (field.type === "boolean") return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
  if (field.type === "textarea") return <textarea className="input" value={value ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "select") {
    return (
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Seleziona</option>
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text";
  return <input className="input" type={type} value={value ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)} />;
}

function formatCell(value: any, field: FieldConfig) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  if (field.type === "boolean") return value ? "Sì" : "No";
  if (field.type === "number") return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(Number(value));
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? value;
  return String(value);
}
