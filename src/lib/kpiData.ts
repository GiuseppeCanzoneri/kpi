import { supabase } from "../integrations/supabase/client";
import type { ActivityCategory, BusinessArea, Company, CostCenter, Employee, Id, LocationRow, Project, TariffProfile, TimesheetView } from "../types/db";

export interface LookupData {
  companies: Company[];
  locations: LocationRow[];
  areas: BusinessArea[];
  employees: Employee[];
  projects: Project[];
  activities: ActivityCategory[];
  costCenters: CostCenter[];
  tariffProfiles: TariffProfile[];
}

export async function fetchLookupData(areaIds: Id[], isSuperAdmin: boolean): Promise<LookupData> {
  const [companies, locations, areas, employees, projects, activities, costCenters, tariffProfiles] = await Promise.all([
    supabase.from("companies").select("*").order("ragione_sociale"),
    supabase.from("locations").select("*").order("nome_sede"),
    supabase.from("business_areas").select("*").order("nome_area"),
    supabase.from("employees").select("*").eq("attivo", true).order("cognome"),
    supabase.from("projects").select("*").order("codice_commessa"),
    supabase.from("activity_categories").select("*").eq("attiva", true).order("codice_attivita"),
    supabase.from("cost_centers").select("*").eq("attivo", true).order("codice_centro_costo"),
    supabase.from("tariff_profiles").select("*").eq("attivo", true).order("codice_profilo"),
  ]);

  const restrictedAreas = isSuperAdmin ? null : new Set(areaIds);

  return {
    companies: ((companies.data ?? []) as Company[]).filter((row) => row.attiva !== false),
    locations: ((locations.data ?? []) as LocationRow[]).filter((row) => row.attiva !== false),
    areas: ((areas.data ?? []) as BusinessArea[]).filter((row) => row.attiva !== false && (!restrictedAreas || !row.id || restrictedAreas.has(row.id))),
    employees: (employees.data ?? []) as Employee[],
    projects: ((projects.data ?? []) as Project[]).filter((row) => !restrictedAreas || !row.business_area_id || restrictedAreas.has(row.business_area_id)),
    activities: ((activities.data ?? []) as ActivityCategory[]).filter((row) => !restrictedAreas || !row.business_area_id || restrictedAreas.has(row.business_area_id)),
    costCenters: ((costCenters.data ?? []) as CostCenter[]).filter((row) => !restrictedAreas || !row.business_area_id || restrictedAreas.has(row.business_area_id)),
    tariffProfiles: (tariffProfiles.data ?? []) as TariffProfile[],
  };
}

export function filterRowsByRole(rows: TimesheetView[], areaIds: string[], userEmail: string | null, isSuperAdmin: boolean, isAdminArea: boolean) {
  if (isSuperAdmin) return rows;
  if (isAdminArea) return rows.filter((row) => areaIds.includes(row.business_area_id));
  return rows.filter((row) => row.employee_email?.toLowerCase() === userEmail?.toLowerCase());
}

export function byId<T extends { id: string }>(items: T[], id: string | null | undefined) {
  return items.find((item) => item.id === id) ?? null;
}
