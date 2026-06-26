import { supabase } from "../integrations/supabase/client";
import type {
  ActivityCategory,
  BusinessArea,
  Company,
  CostCenter,
  Employee,
  Id,
  LocationRow,
  Project,
  TariffProfile,
  TimesheetView,
  UserAreaRole,
} from "../types/db";

export interface LookupData {
  companies: Company[];
  locations: LocationRow[];
  areas: BusinessArea[];
  employees: Employee[];
  projects: Project[];
  activities: ActivityCategory[];
  costCenters: CostCenter[];
  tariffProfiles: TariffProfile[];
  areaRoles: UserAreaRole[];
}

export async function fetchLookupData(areaIds: Id[], isSuperAdmin: boolean, isAdminArea = false): Promise<LookupData> {
  const [companies, locations, areas, employees, projects, activities, costCenters, tariffProfiles, areaRoles] = await Promise.all([
    supabase.from("companies").select("*").order("ragione_sociale"),
    supabase.from("locations").select("*").order("nome_sede"),
    supabase.from("business_areas").select("*").order("nome_area"),
    supabase.from("employees").select("*").eq("attivo", true).order("cognome"),
    supabase.from("projects").select("*").order("codice_commessa"),
    supabase.from("activity_categories").select("*").eq("attiva", true).order("codice_attivita"),
    supabase.from("cost_centers").select("*").eq("attivo", true).order("codice_centro_costo"),
    supabase.from("tariff_profiles").select("*").eq("attivo", true).order("codice_profilo"),
    supabase.from("user_area_roles").select("*").eq("active", true),
  ]);

  const firstError = [companies, locations, areas, employees, projects, activities, costCenters, tariffProfiles, areaRoles].find((r) => r.error)?.error;
  if (firstError) throw firstError;

  const restrictedAreas = isSuperAdmin ? null : new Set(areaIds);
  const allRoles = (areaRoles.data ?? []) as UserAreaRole[];

  let allowedEmployeeEmails: Set<string> | null = null;
  if (!isSuperAdmin && isAdminArea) {
    allowedEmployeeEmails = new Set(
      allRoles
        .filter((r) => r.active && r.email && (!r.business_area_id || areaIds.includes(r.business_area_id)))
        .map((r) => r.email.toLowerCase())
    );
  }

  const employeeRows = (employees.data ?? []) as Employee[];

  return {
    // Società e Commesse sono ora globali per permettere l'infragruppo
    companies: ((companies.data ?? []) as Company[]).filter((row) => row.attiva !== false),
    locations: ((locations.data ?? []) as LocationRow[]).filter((row) => row.attiva !== false),
    areas: ((areas.data ?? []) as BusinessArea[]).filter((row) => row.attiva !== false && (!restrictedAreas || !row.id || restrictedAreas.has(row.id))),
    employees: employeeRows.filter((employee) => {
      if (isSuperAdmin) return true;
      if (isAdminArea && allowedEmployeeEmails) return allowedEmployeeEmails.has(employee.email.toLowerCase());
      return true;
    }),
    projects: (projects.data ?? []) as Project[], // Visibilità globale delle commesse
    activities: ((activities.data ?? []) as ActivityCategory[]).filter((row) => !restrictedAreas || !row.business_area_id || restrictedAreas.has(row.business_area_id)),
    costCenters: ((costCenters.data ?? []) as CostCenter[]).filter((row) => !restrictedAreas || !row.business_area_id || restrictedAreas.has(row.business_area_id)),
    tariffProfiles: (tariffProfiles.data ?? []) as TariffProfile[],
    areaRoles: allRoles,
  };
}

export function filterRowsByRole(
  rows: TimesheetView[],
  areaIds: string[],
  userEmail: string | null,
  isSuperAdmin: boolean,
  isAdminArea: boolean
) {
  if (isSuperAdmin) return rows;
  if (isAdminArea) return rows.filter((row) => areaIds.includes(row.business_area_id));
  return rows.filter((row) => row.employee_email?.toLowerCase() === userEmail?.toLowerCase());
}

export function byId<T extends { id: string }>(items: T[], id: string | null | undefined) {
  return items.find((item) => item.id === id) ?? null;
}

export function fullEmployeeName(employee: Employee) {
  return `${employee.nome ?? ""} ${employee.cognome ?? ""}`.trim() || employee.email;
}