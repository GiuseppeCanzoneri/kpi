import { NavLink } from "react-router-dom";
import { BarChart3, Building2, ClipboardCheck, Clock3, Database, FileSpreadsheet, FileText, HelpCircle, KeyRound, ReceiptText, Settings2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const baseItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/timesheet", label: "Timesheet", icon: Clock3 },
  { to: "/approvazione", label: "Approvazione ore", icon: ClipboardCheck, adminOnly: true },
  { to: "/riepilogo", label: "Riepilogo mese", icon: FileSpreadsheet, adminOnly: true },
  { to: "/fatture", label: "Fatture infragruppo", icon: ReceiptText, adminOnly: true },
  { to: "/report", label: "Report", icon: FileText },
  { to: "/anagrafiche", label: "Anagrafiche", icon: Database, adminOnly: true },
  { to: "/tariffario", label: "Tariffario", icon: Settings2, superOnly: true },
  { to: "/centri-costo", label: "Centri di costo", icon: Building2, adminOnly: true },
  { to: "/import", label: "Import Excel", icon: FileSpreadsheet, adminOnly: true },
  { to: "/accessi", label: "Accessi e ruoli", icon: KeyRound, adminOnly: true },
  { to: "/istruzioni", label: "Istruzioni", icon: HelpCircle },
];

export function AppSidebar() {
  const { isSuperAdmin, isAdminArea, roles, user } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const items = baseItems.filter((item) => {
    if (item.superOnly) return isSuperAdmin;
    if (item.adminOnly) return canAdmin;
    return true;
  });
  const roleLabel = isSuperAdmin ? "Super Admin" : isAdminArea ? "Admin Area" : roles.length > 0 ? "User Area" : "In attesa";

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">K</div>
        <div>
          <h1>KPI Infragruppo</h1>
          <p>Ore · costi · aree</p>
        </div>
      </div>

      <nav className="nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-box">
          <span>Profilo attivo</span>
          <strong>{roleLabel}</strong>
          <small>{user?.email}</small>
        </div>
      </div>
    </aside>
  );
}
