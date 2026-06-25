export type KpiRole = "SUPER_ADMIN" | "ADMIN_AREA" | "USER_AREA";
export type TimesheetStatus = "Bozza" | "Da correggere" | "Approvato" | "Fatturato";
export type MovementType = "Interno non fatturabile" | "Infragruppo fatturabile";
export type InvoiceStatus = "Non necessaria" | "Da emettere" | "Emessa" | "Pagata";
export type Id = string;

export interface Company {
  id: Id;
  codice_societa: string;
  ragione_sociale: string;
  nazione: string | null;
  partita_iva_vat: string | null;
  codice_sdi_pec: string | null;
  indirizzo: string | null;
  attiva: boolean;
  note: string | null;
}

export interface LocationRow {
  id: Id;
  company_id: Id | null;
  nome_sede: string;
  citta: string | null;
  nazione: string | null;
  indirizzo: string | null;
  responsabile: string | null;
  attiva: boolean;
}

export interface BusinessArea {
  id: Id;
  codice_area: string;
  nome_area: string;
  descrizione: string | null;
  company_id: Id | null;
  location_id: Id | null;
  responsabile: string | null;
  attiva: boolean;
}

export interface TariffProfile {
  id: Id;
  codice_profilo: string;
  nome_profilo: string;
  descrizione: string | null;
  business_area_id?: Id | null;
  costo_orario_base: number;
  overhead_percentuale: number;
  margine_percentuale: number;
  tariffa_oraria_calcolata: number;
  attivo: boolean;
  note: string | null;
}

export interface Employee {
  id: Id;
  nome: string;
  cognome: string;
  email: string;
  company_id: Id;
  location_id: Id | null;
  tariff_profile_id: Id;
  mansione: string | null;
  attivo: boolean;
}

export interface Project {
  id: Id;
  codice_commessa: string;
  company_id: Id;
  business_area_id: Id | null;
  cliente: string | null;
  descrizione_commessa: string;
  tipo: string | null;
  stato: string;
  responsabile: string | null;
  data_apertura: string | null;
  data_chiusura: string | null;
  note: string | null;
}

export interface ActivityCategory {
  id: Id;
  codice_attivita: string;
  nome_categoria: string;
  descrizione: string | null;
  business_area_id: Id | null;
  fatturabile: boolean;
  coefficiente_ore_pesate: number;
  attiva: boolean;
  note: string | null;
}

export interface CostCenter {
  id: Id;
  codice_centro_costo: string;
  nome_centro_costo: string;
  descrizione: string | null;
  company_id: Id | null;
  business_area_id: Id | null;
  attivo: boolean;
}

export interface UserAreaRole {
  id: Id;
  user_id: Id | null;
  email: string;
  company_id: Id | null;
  location_id: Id | null;
  business_area_id: Id | null;
  role: KpiRole;
  can_view_amounts: boolean;
  active: boolean;
  assigned_by: Id | null;
  assigned_at: string;
}

export interface TimesheetEntry {
  id: Id;
  data: string;
  employee_id: Id;
  beneficiary_company_id: Id;
  location_id: Id | null;
  business_area_id: Id;
  project_id: Id;
  activity_category_id: Id;
  cost_center_id: Id | null;
  ore: number;
  descrizione: string | null;
  stato: TimesheetStatus;
  note: string | null;
  employer_company_id: Id;
  tariff_profile_id: Id;
  tariffa_oraria: number;
  coefficiente_ore_pesate: number;
  ore_pesate: number;
  importo: number;
  tipo_movimento: MovementType;
  mese: number;
  anno: number;
  created_by: Id | null;
  approved_by: Id | null;
  approved_at: string | null;
}

export interface TimesheetView extends TimesheetEntry {
  employee_name: string;
  employee_email: string;
  employer_company_code: string;
  employer_company_name: string;
  beneficiary_company_code: string;
  beneficiary_company_name: string;
  location_name: string | null;
  codice_area: string;
  nome_area: string;
  codice_commessa: string;
  descrizione_commessa: string;
  codice_centro_costo: string | null;
  nome_centro_costo: string | null;
  codice_attivita: string;
  nome_categoria: string;
  codice_profilo: string;
  nome_profilo: string;
  tariffa_oraria_visibile: number | null;
  importo_visibile: number | null;
}

export interface MonthlySummary {
  id: Id;
  mese: number;
  anno: number;
  employer_company_id: Id;
  beneficiary_company_id: Id;
  business_area_id: Id | null;
  ore_approvate: number;
  ore_pesate_approvate: number;
  imponibile: number;
  iva: number;
  totale_lordo: number;
  stato_fattura: InvoiceStatus;
  note: string | null;
}

export interface IntercompanyInvoice {
  id: Id;
  employer_company_id: Id;
  beneficiary_company_id: Id;
  mese: number;
  anno: number;
  imponibile: number;
  iva: number;
  totale: number;
  stato: InvoiceStatus;
  numero_fattura: string | null;
  data_fattura: string | null;
  note: string | null;
}
