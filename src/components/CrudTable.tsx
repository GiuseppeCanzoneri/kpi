"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { supabase } from "../integrations/supabase/client";

type FieldType = "text" | "number" | "date" | "boolean" | "textarea" | "select" | "email";

type Row = Record<string, unknown> & { id?: string };

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
  defaultValues?: Row;
}

function displayValue(row: Row, field: FieldConfig) {
  const value = row[field.key];

  if (field.type === "boolean") {
    return value ? <span className="status-pill approvato">Attivo</span> : <span className="status-pill muted-pill">No</span>;
  }

  if (field.type === "select") {
    return field.options?.find((option) => option.value === value)?.label ?? String(value ?? "—");
  }

  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function normalizePayload(row: Row, fields: FieldConfig[]) {
  const payload: Row = { ...row };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  fields.forEach((field) => {
    if (field.readonly) {
      delete payload[field.key];
      return;
    }

    if (payload[field.key] === "") payload[field.key] = null;
  });

  return payload;
}

export function CrudTable({ title, table, fields, canEdit, orderBy = "created_at", defaultValues = {} }: CrudTableProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [filter, setFilter] = useState("");

  const visibleFields = useMemo(() => fields.filter((field) => !field.hideInTable), [fields]);

  const load = async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true });

    if (loadError) setError(loadError.message);
    else setRows((data ?? []) as Row[]);

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [table, orderBy]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query)),
    );
  }, [rows, filter]);

  const startNew = () => {
    const initial: Row = { ...defaultValues };
    fields.forEach((field) => {
      if (initial[field.key] !== undefined) return;
      if (field.type === "boolean") initial[field.key] = true;
      else initial[field.key] = "";
    });
    setEditing(initial);
  };

  const save = async () => {
    if (!editing) return;

    setSaving(true);
    setError(null);

    const payload = normalizePayload(editing, fields);
    const result = editing.id
      ? await supabase.from(table).update(payload).eq("id", editing.id)
      : await supabase.from(table).insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setEditing(null);
    await load();
  };

  const remove = async (row: Row) => {
    if (!row.id) return;
    if (!window.confirm("Eliminare questo record?")) return;

    setError(null);
    const { error: deleteError } = await supabase.from(table).delete().eq("id", row.id);

    if (deleteError) {
      setError(
        deleteError.code === "23503"
          ? "Impossibile eliminare: il record è usato in altre tabelle. Disattivalo o rimuovi prima i dati collegati."
          : deleteError.message,
      );
      return;
    }

    await load();
  };

  return (
    <section className="panel crud-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{loading ? "Caricamento..." : `${filtered.length} record visualizzati su ${rows.length}`}</p>
        </div>
        <div className="crud-actions">
          <div className="search-box">
            <Search size={16} />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Cerca..." />
          </div>
          <button className="button secondary" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Aggiorna
          </button>
          {canEdit && (
            <button className="button" type="button" onClick={startNew}>
              <Plus size={16} /> Nuovo
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error"><AlertCircle size={16} /> {error}</div>}

      <div className="table-wrap elevated-table">
        <table className="data-table">
          <thead>
            <tr>
              {visibleFields.map((field) => <th key={field.key}>{field.label}</th>)}
              {canEdit && <th>Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={visibleFields.length + (canEdit ? 1 : 0)} className="muted">Caricamento dati...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={visibleFields.length + (canEdit ? 1 : 0)} className="muted">Nessun record trovato.</td></tr>
            ) : (
              filtered.map((row) => (
                <tr key={String(row.id ?? JSON.stringify(row))}>
                  {visibleFields.map((field) => <td key={field.key}>{displayValue(row, field)}</td>)}
                  {canEdit && (
                    <td>
                      <div className="row-actions">
                        <button className="icon-button" type="button" onClick={() => setEditing(row)}>Modifica</button>
                        <button className="icon-button danger" type="button" onClick={() => void remove(row)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <div className="modal-card wide" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">{editing.id ? "Modifica" : "Nuovo record"}</span>
                <h3>{title}</h3>
              </div>
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>Chiudi</button>
            </div>

            <div className="form-grid">
              {fields.map((field) => (
                <label key={field.key} className={field.type === "textarea" ? "span-2" : undefined}>
                  {field.label}{field.required ? " *" : ""}
                  {field.type === "textarea" ? (
                    <textarea
                      className="input"
                      value={String(editing[field.key] ?? "")}
                      onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })}
                      readOnly={field.readonly}
                      placeholder={field.placeholder}
                    />
                  ) : field.type === "select" ? (
                    <select
                      className="input"
                      value={String(editing[field.key] ?? "")}
                      onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })}
                      disabled={field.readonly}
                    >
                      <option value="">Seleziona...</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : field.type === "boolean" ? (
                    <div className="check-row">
                      <input
                        type="checkbox"
                        checked={Boolean(editing[field.key])}
                        onChange={(event) => setEditing({ ...editing, [field.key]: event.target.checked })}
                        disabled={field.readonly}
                      />
                      <span>Attivo</span>
                    </div>
                  ) : (
                    <input
                      className="input"
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
                      value={String(editing[field.key] ?? "")}
                      onChange={(event) => setEditing({
                        ...editing,
                        [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value,
                      })}
                      readOnly={field.readonly}
                      placeholder={field.placeholder}
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="modal-footer">
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>Annulla</button>
              <button className="button" type="button" onClick={() => void save()} disabled={saving}>
                <Save size={16} /> {saving ? "Salvataggio..." : "Salva"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
