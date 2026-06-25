import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { CrudTable, type FieldConfig } from "../components/CrudTable";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { BusinessArea, Company } from "../types/db";

export default function CentriCosto() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const canEdit = isSuperAdmin || isAdminArea;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [areas, setAreas] = useState<BusinessArea[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("companies").select("*").eq("attiva", true).order("codice_societa", { ascending: true }),
      supabase.from("business_areas").select("*").eq("attiva", true).order("codice_area", { ascending: true }),
    ]).then(([companiesRes, areasRes]) => {
      const firstError = companiesRes.error || areasRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      setCompanies((companiesRes.data ?? []) as Company[]);
      setAreas((areasRes.data ?? []) as BusinessArea[]);
    });
  }, []);

  const companyOptions = useMemo(
    () => companies.map((company) => ({ value: company.id, label: `${company.codice_societa} · ${company.ragione_sociale}` })),
    [companies],
  );

  const areaOptions = useMemo(
    () => areas.map((area) => ({ value: area.id, label: `${area.codice_area} · ${area.nome_area}` })),
    [areas],
  );

  const fields = useMemo<FieldConfig[]>(() => [
    { key: "codice_centro_costo", label: "Codice centro costo", required: true },
    { key: "nome_centro_costo", label: "Nome centro costo", required: true },
    { key: "descrizione", label: "Descrizione", type: "textarea" },
    { key: "company_id", label: "Società specifica", type: "select", options: companyOptions },
    { key: "business_area_id", label: "Area", type: "select", options: areaOptions },
    { key: "attivo", label: "Attivo", type: "boolean" },
  ], [areaOptions, companyOptions]);

  return (
    <div>
      <PageHeader
        title="Centri di costo"
        description="Gestione separata dei centri di costo. Questa pagina non punta più alle anagrafiche generali."
      />

      {error && <div className="alert error"><AlertTriangle size={16} /> {error}</div>}

      <CrudTable
        title="Centri di costo"
        table="cost_centers"
        fields={fields}
        canEdit={canEdit}
        orderBy="codice_centro_costo"
        defaultValues={{ attivo: true }}
      />
    </div>
  );
}
