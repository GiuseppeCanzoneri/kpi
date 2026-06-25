import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { CrudTable, type FieldConfig } from "../components/CrudTable";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { BusinessArea } from "../types/db";

export default function Tariffario() {
  const { isSuperAdmin } = useAuth();
  const [areas, setAreas] = useState<BusinessArea[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("business_areas")
      .select("*")
      .eq("attiva", true)
      .order("codice_area", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAreas((data ?? []) as BusinessArea[]);
      });
  }, []);

  const areaOptions = useMemo(
    () => areas.map((area) => ({ value: area.id, label: `${area.codice_area} · ${area.nome_area}` })),
    [areas],
  );

  const fields = useMemo<FieldConfig[]>(() => [
    { key: "codice_profilo", label: "Codice", required: true },
    { key: "nome_profilo", label: "Profilo", required: true },
    { key: "descrizione", label: "Descrizione", type: "textarea" },
    { key: "business_area_id", label: "Area", type: "select", options: areaOptions },
    { key: "costo_orario_base", label: "Costo h base", type: "number", required: true },
    { key: "overhead_percentuale", label: "Overhead %", type: "number" },
    { key: "margine_percentuale", label: "Margine %", type: "number" },
    { key: "tariffa_oraria_calcolata", label: "Tariffa calcolata", type: "number", readonly: true },
    { key: "attivo", label: "Attivo", type: "boolean" },
    { key: "note", label: "Note", type: "textarea" },
  ], [areaOptions]);

  return (
    <div>
      <PageHeader
        title="Tariffario"
        description="Gestione dei profili tariffari. La tariffa calcolata è generata dal database: non va inserita manualmente."
      />

      {error && <div className="alert error"><AlertTriangle size={16} /> {error}</div>}

      <CrudTable
        title="Profili tariffari"
        table="tariff_profiles"
        fields={fields}
        canEdit={isSuperAdmin}
        orderBy="codice_profilo"
        defaultValues={{ attivo: true, costo_orario_base: 0, overhead_percentuale: 0, margine_percentuale: 0 }}
      />
    </div>
  );
}
