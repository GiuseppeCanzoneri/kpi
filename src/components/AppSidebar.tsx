import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const baseItems = [
  { to: "/", label: "Dashboard" },
  { to: "/timesheet", label: "Timesheet" },
  { to: "/approvazione", label: "Approvazione ore", adminOnly: true },
  { to: "/riepilogo", label: "Riepilogo mese", adminOnly: true },
  { to: "/fatture", label: "Fatture infragruppo", adminOnly: true },
  { to: "/report", label: "Report" },
  { to: "/anagrafiche", label: "Anagrafiche", adminOnly: true },
  { to: "/tariffario", label: "Tariffario", superOnly: true },
  { to: "/centri-costo", label: "Centri di costo", adminOnly: true },
  { to: "/import", label: "Import Excel", adminOnly: true },
  { to: "/accessi", label: "Accessi e ruoli", adminOnly: true },
  { to: "/istruzioni", label: "Istruzioni" },
];

export function AppSidebar() {
  const { isSuperAdmin, isAdminArea, roles } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;

  const items = baseItems.filter((item) => {
    if (item.superOnly) return isSuperAdmin;
    if (item.adminOnly) return canAdmin;
    return true;
  });

  const roleLabel = isSuperAdmin ? "Super Admin" : isAdminArea ? "Admin Area" : roles.length > 0 ? "User Area" : "In attesa";

  return (
    <aside className="sidebar">
      <div className="brand-card">
        <div className="brand-mark">K</div>
        <div>
          <h1>KPI Infragruppo</h1>
          <p>Contabilità ore</p>
        </div>
      </div>

      <div className="sidebar-role">
        <span>Profilo attivo</span>
        <strong>{roleLabel}</strong>
      </div>

      <nav className="nav" aria-label="Navigazione principale">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
