import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { CrudTable, type FieldConfig } from "../components/CrudTable";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { BusinessArea, Company, LocationRow } from "../types/db";

export default function Accessi() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [areas, setAreas] = useState<BusinessArea[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("companies").select("*").order("codice_societa"),
      supabase.from("locations").select("*").order("nome_sede"),
      supabase.from("business_areas").select("*").order("nome_area"),
    ]).then(([c, l, a]) => {
      setCompanies((c.data ?? []) as Company[]);
      setLocations((l.data ?? []) as LocationRow[]);
      setAreas((a.data ?? []) as BusinessArea[]);
    });
  }, []);

  const companyOptions = useMemo(() => companies.map((c) => ({ value: c.id, label: c.codice_societa })), [companies]);
  const locationOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: l.nome_sede })), [locations]);
  const areaOptions = useMemo(() => areas.map((a) => ({ value: a.id, label: `${a.codice_area} - ${a.nome_area}` })), [areas]);

  const roleOptions = isSuperAdmin
    ? [{ value: "SUPER_ADMIN", label: "SUPER_ADMIN" }, { value: "ADMIN_AREA", label: "ADMIN_AREA" }, { value: "USER_AREA", label: "USER_AREA" }]
    : [{ value: "USER_AREA", label: "USER_AREA" }];

  const fields: FieldConfig[] = [
    { key: "email", label: "Email utente", type: "email", required: true },
    { key: "role", label: "Ruolo", type: "select", options: roleOptions, required: true },
    { key: "company_id", label: "Società", type: "select", options: companyOptions },
    { key: "location_id", label: "Sede", type: "select", options: locationOptions },
    { key: "business_area_id", label: "Area", type: "select", options: areaOptions },
    { key: "can_view_amounts", label: "Vede importi", type: "boolean" },
    { key: "active", label: "Attivo", type: "boolean" },
  ];

  return (
    <div>
      <PageHeader title="Gestione accessi area" subtitle="Assegna utenti a società, sedi, aree e ruoli. Il SUPER_ADMIN gestisce tutto; l'ADMIN_AREA può assegnare USER_AREA alla propria area." />
      <CrudTable title="Ruoli utenti" table="user_area_roles" canEdit={isSuperAdmin || isAdminArea} fields={fields} orderBy="assigned_at" defaultValues={{ active: true, role: "USER_AREA", can_view_amounts: false }} />
    </div>
  );
}
