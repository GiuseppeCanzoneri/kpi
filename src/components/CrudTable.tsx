"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2, X, AlertCircle } from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";

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
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true });
    
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
    return rows.filter((row) => 
      Object.values(row).some(val => String(val).toLowerCase().includes(q))
    );
  }, [rows, filter]);

  const save = async () => {
    if (!editing) return;
    setError(null);
    const payload = { ...editing };
    delete payload.created_at;
    delete payload.updated_at;
    
    fields.forEach((field) => {
      if (field.readonly) delete payload[field.key];
    });

    const { error } = payload.id
      ? await supabase.from(table).update(payload).eq("id", payload.id)
      : await supabase.from(table).insert(payload);

    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo record?")) return;
    setError(null);
    
    const { error } = await supabase.from(table).delete().eq("id", id);
    
    if (error) {
      if (error.code === '23503') {
        setError("Impossibile eliminare: questo record è utilizzato in altre tabelle (es. commesse, dipendenti o aree). Elimina prima i dati collegati.");
      } else {
        setError(error.message);
      }
      return;
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{rows.length} record totali</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input 
              className="input pl-8 w-64" 
              placeholder="Cerca..." 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)} 
            />
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </div>
          <button className="button secondary" onClick={load}><RefreshCw size={16} /></button>
          {canEdit && <button className="button primary" onClick={() => setEditing({ ...defaultValues })}><Plus size={16} /> Nuovo</button>}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="panel p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {visibleFields.map((f) => <th key={f.key}>{f.label}</th>)}
                {canEdit && <th className="text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {visibleFields.map((f) => (
                    <td key={f.key}>
                      {f.type === 'boolean' ? (
                        <span className={cn("pill", row[f.key] ? "pill-success" : "pill-danger")}>
                          {row[f.key] ? "Attivo" : "Inattivo"}
                        </span>
                      ) : f.type === 'select' ? (
                        f.options?.find(o => o.value === row[f.key])?.label || row[f.key]
                      ) : row[f.key] || "—"}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button className="p-1.5 hover:bg-slate-100 rounded text-slate-600" onClick={() => setEditing(row)}>Modifica</button>
                        <button className="p-1.5 hover:bg-red-50 rounded text-red-500" onClick={() => remove(row.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={visibleFields.length + 1} className="py-12 text-center text-slate-400 italic">
                    Nessun record trovato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold">{editing.id ? `Modifica ${title}` : `Nuovo ${title}`}</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
              {fields.map((f) => (
                <div key={f.key} className={cn("space-y-1", (f.type === 'textarea' || f.key === 'ragione_sociale') && "col-span-2")}>
                  <label className="text-xs font-bold text-slate-500 uppercase">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea 
                      className="input min-h-[100px]" 
                      value={editing[f.key] || ""} 
                      onChange={(e) => setEditing({...editing, [f.key]: e.target.value})}
                    />
                  ) : f.type === 'select' ? (
                    <select 
                      className="input" 
                      value={editing[f.key] || ""} 
                      onChange={(e) => setEditing({...editing, [f.key]: e.target.value})}
                    >
                      <option value="">Seleziona...</option>
                      {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'boolean' ? (
                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4" 
                        checked={editing[f.key] || false} 
                        onChange={(e) => setEditing({...editing, [f.key]: e.target.checked})}
                      />
                      <span className="text-sm font-medium">Attivo</span>
                    </div>
                  ) : (
                    <input 
                      type={f.type === 'number' ? 'number' : 'text'} 
                      className="input" 
                      value={editing[f.key] || ""} 
                      onChange={(e) => setEditing({...editing, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value})}
                      readOnly={f.readonly}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button className="button secondary" onClick={() => setEditing(null)}>Annulla</button>
              <button className="button primary" onClick={save}><Save size={16} /> Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  );
}