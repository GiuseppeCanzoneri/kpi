export type KpiPeriodType = "WEEK" | "MONTH";
export type KpiPeriodStatus = "Aperto" | "In verifica" | "Chiuso" | "Riaperto" | "Escluso";
export type KpiLevel = "Basso" | "Attenzione" | "In linea" | "Alto" | "Eccellente";
export type KpiCode = "K1" | "K2" | "K3" | "K4" | "K5";

export interface KpiMetricSetting {
  code: KpiCode;
  nome: string;
  nome_breve: string | null;
  descrizione: string | null;
  popup_titolo: string | null;
  popup_testo: string | null;
  peso_percentuale: number;
  attivo: boolean;
  soglia_minima: number | null;
  formula_label: string | null;
  note: string | null;
  scala_massima: number;
}

export interface KpiDashboardRow {
  id: string;
  period_id: string;
  period_type: KpiPeriodType;
  period_start: string;
  period_end: string;
  period_status?: KpiPeriodStatus;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  photo_url: string | null;
  mansione?: string | null;
  company_code: string | null;
  company_name: string | null;
  codice_area: string | null;
  nome_area: string | null;
  codice_ruolo: string | null;
  nome_ruolo: string | null;
  codice_gruppo: string | null;
  nome_gruppo: string | null;
  k1_saturazione: number;
  k2_produzione: number;
  k3_efficienza: number;
  k4_qualita: number;
  k5_puntualita: number;
  performance_index: number;
  livello: KpiLevel;
  eligible: boolean;
  is_top_performer?: boolean;
  recognition_status?: string;
  eligibility_reason: string | null;
  productive_hours: number;
  available_hours_net: number;
  standard_units: number;
  rework_hours: number;
  excluded_hours: number;
  working_days: number;
  validated_rows: number;
  total_rows: number;
  critical_nonconformities: number;
  priority_delays: number;
  details: Record<string, unknown>;
  computed_at: string;
  badges: { code: string; label: string; reason: string | null }[];
  group_rank?: number;
  overall_rank?: number;
}

export interface KpiTraceRow {
  id?: string;
  score_id: string;
  employee_id?: string;
  employee_name: string;
  period_type?: KpiPeriodType;
  period_start?: string;
  period_end?: string;
  timesheet_entry_id: string;
  data: string;
  descrizione: string | null;
  note?: string | null;
  ore: number;
  kpi_quality_outcome: string;
  kpi_rework_hours: number;
  kpi_due_date: string | null;
  kpi_completed_at: string | null;
  kpi_exclusion_reason: string | null;
  standard_units: number;
  quality_points: number;
  punctuality_points: number | null;
  codice_attivita: string | null;
  nome_categoria: string | null;
  codice_commessa: string | null;
  descrizione_commessa: string | null;
}
