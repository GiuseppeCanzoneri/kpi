import { NavLink } from "react-router-dom";
import { BarChart3, Building2, Clock3, Database, FileSpreadsheet, FileText, Gauge, HelpCircle, KeyRound, Medal, ReceiptText, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const baseItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/timesheet", label: "Timesheet", icon: Clock3 },
  { to: "/kpi", label: "KPI Performance", icon: Gauge },
  { to: "/kpi/validazione", label: "Validazione KPI", icon: Medal, adminOnly: true },
  { to: "/kpi/impostazioni", label: "Impostazioni K1-K5", icon: SlidersHorizontal, adminOnly: true },
  { to: "/kpi/direzione", label: "Direzione KPI", icon: ShieldCheck, adminOnly: true },
  { to: "/riepilogo", label: "Riepilogo mese", icon: FileSpreadsheet, adminOnly: true },
  { to: "/fatture", label: "Fatture infragruppo", icon: ReceiptText, adminOnly: true },
  { to: "/report", label: "Report PDF", icon: FileText },
  { to: "/anagrafiche", label: "Anagrafiche", icon: Database, adminOnly: true },
  { to: "/tariffario", label: "Tariffario", icon: Settings2, superOnly: true },
  { to: "/centri-costo", label: "Centri di costo", icon: Building2, adminOnly: true },
  { to: "/import", label: "Import Excel", icon: FileSpreadsheet, adminOnly: true },
  { to: "/accessi", label: "Accessi e ruoli", icon: KeyRound, adminOnly: true },
  { to: "/istruzioni", label: "Istruzioni", icon: HelpCircle },
];

export function AppSidebar() {
  const { isSuperAdmin, isAdminArea, activeRoleLabel, user } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const items = baseItems.filter((item) => {
    if (item.superOnly) return isSuperAdmin;
    if (item.adminOnly) return canAdmin;
    return true;
  });

  return (
    <aside className="sidebar app-sidebar">
      <div className="brand sidebar-brand">
        <div className="brand-mark">K</div>
        <div>
          <h1>KPI Infragruppo</h1>
          <p>Ore · costi · performance</p>
        </div>
      </div>

      <nav className="nav sidebar-nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer sidebar-profile">
        <div className="user-box">
          <span>Profilo attivo</span>
          <strong>{activeRoleLabel}</strong>
          <small>{user?.email}</small>
        </div>
      </div>
    </aside>
  );
}
