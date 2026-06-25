import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { CrudTable, type FieldConfig } from "../components/CrudTable";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { BusinessArea, Company, CostCenter, LocationRow, TariffProfile } from "../types/db";

const tabs = [
  "Società",
  "Sedi",
  "Aree",
  "Profili tariffari",
  "Dipendenti",
  "Commesse",
  "Centri di costo",
  "Attività",
] as const;

type Tab = typeof tabs[number];

export default function Anagrafiche() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const [tab, setTab] = useState<Tab>("Società");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [areas, setAreas] = useState<BusinessArea[]>([]);
  const [tariffs, setTariffs] = useState<TariffProfile[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const canEditMaster = isSuperAdmin;
  const canEditAreaData = isSuperAdmin || isAdminArea;

  useEffect(() => {
    Promise.all([
      supabase.from("companies").select("*").order("codice_societa"),
      supabase.from("locations").select("*").order("nome_sede"),
      supabase.from("business_areas").select("*").order("nome_area"),
      supabase.from("tariff_profiles").select("*").order("codice_profilo"),
      supabase.from("cost_centers").select("*").order("codice_centro_costo"),
    ]).then(([c, l, a, t, cc]) => {
      setCompanies((c.data ?? []) as Company[]);
      setLocations((l.data ?? []) as LocationRow[]);
      setAreas((a.data ?? []) as BusinessArea[]);
      setTariffs((t.data ?? []) as TariffProfile[]);
      setCostCenters((cc.data ?? []) as CostCenter[]);
    });
  }, []);

  const companyOptions = useMemo(() => companies.map((c) => ({ value: c.id, label: `${c.codice_societa} - ${c.ragione_sociale}` })), [companies]);
  const locationOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: l.nome_sede })), [locations]);
  const areaOptions = useMemo(() => areas.map((a) => ({ value: a.id, label: `${a.codice_area} - ${a.nome_area}` })), [areas]);
  const tariffOptions = useMemo(() => tariffs.map((t) => ({ value: t.id, label: `${t.codice_profilo} - ${t.nome_profilo}` })), [tariffs]);
  const costCenterCount = costCenters.length;

  return (
    <div>
      <PageHeader title="Anagrafiche" subtitle="Dati base del modello Excel: società, profili tariffari, dipendenti, commesse, attività, sedi e aree." />
      <div className="tabs">
        {tabs.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Società" && <CrudTable title="Società" table="companies" canEdit={canEditMaster} fields={companyFields} orderBy="codice_societa" defaultValues={{ attiva: true }} />}
      {tab === "Sedi" && <CrudTable title="Sedi operative" table="locations" canEdit={canEditMaster} fields={locationFields(companyOptions)} orderBy="nome_sede" defaultValues={{ attiva: true }} />}
      {tab === "Aree" && <CrudTable title="Aree aziendali" table="business_areas" canEdit={canEditMaster} fields={areaFields(companyOptions, locationOptions)} orderBy="nome_area" defaultValues={{ attiva: true }} />}
      {tab === "Profili tariffari" && <CrudTable title="Profili tariffari" table="tariff_profiles" canEdit={isSuperAdmin} fields={tariffFields} orderBy="codice_profilo" defaultValues={{ attivo: true, costo_orario_base: 0, overhead_percentuale: 0, margine_percentuale: 0 }} />}
      {tab === "Dipendenti" && <CrudTable title="Dipendenti" table="employees" canEdit={isSuperAdmin} fields={employeeFields(companyOptions, locationOptions, tariffOptions)} orderBy="cognome" defaultValues={{ attivo: true }} />}
      {tab === "Commesse" && <CrudTable title="Commesse" table="projects" canEdit={canEditAreaData} fields={projectFields(companyOptions, areaOptions)} orderBy="codice_commessa" defaultValues={{ stato: "Aperta" }} />}
      {tab === "Centri di costo" && <CrudTable title={`Centri di costo (${costCenterCount})`} table="cost_centers" canEdit={canEditAreaData} fields={costCenterFields(companyOptions, areaOptions)} orderBy="codice_centro_costo" defaultValues={{ attivo: true }} />}
      {tab === "Attività" && <CrudTable title="Categorie attività" table="activity_categories" canEdit={canEditAreaData} fields={activityFields(areaOptions)} orderBy="codice_attivita" defaultValues={{ attiva: true, fatturabile: true, coefficiente_ore_pesate: 1 }} />}
    </div>
  );
}

const companyFields: FieldConfig[] = [
  { key: "codice_societa", label: "Codice società", required: true },
  { key: "ragione_sociale", label: "Ragione sociale", required: true },
  { key: "nazione", label: "Nazione" },
  { key: "partita_iva_vat", label: "P.IVA / VAT" },
  { key: "codice_sdi_pec", label: "SDI / PEC" },
  { key: "indirizzo", label: "Indirizzo" },
  { key: "attiva", label: "Attiva", type: "boolean" },
  { key: "note", label: "Note", type: "textarea" },
];

const locationFields = (companies: { value: string; label: string }[]): FieldConfig[] => [
  { key: "company_id", label: "Società", type: "select", options: companies },
  { key: "nome_sede", label: "Nome sede", required: true },
  { key: "citta", label: "Città" },
  { key: "nazione", label: "Nazione" },
  { key: "indirizzo", label: "Indirizzo" },
  { key: "responsabile", label: "Responsabile" },
  { key: "attiva", label: "Attiva", type: "boolean" },
];

const areaFields = (companies: { value: string; label: string }[], locations: { value: string; label: string }[]): FieldConfig[] => [
  { key: "codice_area", label: "Codice area", required: true },
  { key: "nome_area", label: "Nome area", required: true },
  { key: "descrizione", label: "Descrizione", type: "textarea" },
  { key: "company_id", label: "Società specifica", type: "select", options: companies },
  { key: "location_id", label: "Sede specifica", type: "select", options: locations },
  { key: "responsabile", label: "Responsabile" },
  { key: "attiva", label: "Attiva", type: "boolean" },
];

const tariffFields: FieldConfig[] = [
  { key: "codice_profilo", label: "Codice", required: true },
  { key: "nome_profilo", label: "Profilo", required: true },
  { key: "descrizione", label: "Descrizione", type: "textarea" },
  { key: "costo_orario_base", label: "Costo h base", type: "number", required: true },
  { key: "overhead_percentuale", label: "Overhead %", type: "number" },
  { key: "margine_percentuale", label: "Margine %", type: "number" },
  { key: "tariffa_oraria_calcolata", label: "Tariffa calcolata", type: "number", readonly: true },
  { key: "attivo", label: "Attivo", type: "boolean" },
  { key: "note", label: "Note", type: "textarea" },
];

const employeeFields = (companies: { value: string; label: string }[], locations: { value: string; label: string }[], tariffs: { value: string; label: string }[]): FieldConfig[] => [
  { key: "nome", label: "Nome", required: true },
  { key: "cognome", label: "Cognome", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "company_id", label: "Società datrice", type: "select", options: companies, required: true },
  { key: "location_id", label: "Sede", type: "select", options: locations },
  { key: "tariff_profile_id", label: "Profilo tariffario", type: "select", options: tariffs, required: true },
  { key: "mansione", label: "Mansione" },
  { key: "attivo", label: "Attivo", type: "boolean" },
];

const projectFields = (companies: { value: string; label: string }[], areas: { value: string; label: string }[]): FieldConfig[] => [
  { key: "codice_commessa", label: "Codice commessa", required: true },
  { key: "company_id", label: "Società titolare/beneficiaria", type: "select", options: companies, required: true },
  { key: "business_area_id", label: "Area", type: "select", options: areas },
  { key: "cliente", label: "Cliente" },
  { key: "descrizione_commessa", label: "Descrizione", type: "textarea", required: true },
  { key: "tipo", label: "Tipo" },
  { key: "stato", label: "Stato" },
  { key: "responsabile", label: "Responsabile" },
  { key: "data_apertura", label: "Data apertura", type: "date" },
  { key: "data_chiusura", label: "Data chiusura", type: "date" },
  { key: "note", label: "Note", type: "textarea" },
];

const costCenterFields = (companies: { value: string; label: string }[], areas: { value: string; label: string }[]): FieldConfig[] => [
  { key: "codice_centro_costo", label: "Codice centro costo", required: true },
  { key: "nome_centro_costo", label: "Nome centro costo", required: true },
  { key: "descrizione", label: "Descrizione", type: "textarea" },
  { key: "company_id", label: "Società specifica", type: "select", options: companies },
  { key: "business_area_id", label: "Area", type: "select", options: areas },
  { key: "attivo", label: "Attivo", type: "boolean" },
];

const activityFields = (areas: { value: string; label: string }[]): FieldConfig[] => [
  { key: "codice_attivita", label: "Codice attività", required: true },
  { key: "nome_categoria", label: "Categoria", required: true },
  { key: "descrizione", label: "Descrizione", type: "textarea" },
  { key: "business_area_id", label: "Area", type: "select", options: areas },
  { key: "fatturabile", label: "Fatturabile", type: "boolean" },
  { key: "coefficiente_ore_pesate", label: "Coeff. ore pesate", type: "number" },
  { key: "attiva", label: "Attiva", type: "boolean" },
  { key: "note", label: "Note", type: "textarea" },
];
