import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Clock, Database, FileText, HelpCircle, Home, LogOut, ReceiptText, Shield, Upload } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const nav = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/timesheet", label: "Timesheet", icon: Clock },
  { to: "/riepilogo", label: "Riepilogo mese", icon: BarChart3 },
  { to: "/fatture", label: "Fatture infragruppo", icon: ReceiptText },
  { to: "/report", label: "Report PDF", icon: FileText },
  { to: "/import", label: "Import Excel", icon: Upload },
  { to: "/anagrafiche", label: "Anagrafiche", icon: Database },
  { to: "/accessi", label: "Accessi area", icon: Shield },
  { to: "/istruzioni", label: "Istruzioni", icon: HelpCircle },
];

export function Layout() {
  const { user, roles, isSuperAdmin, signOut } = useAuth();
  const roleLabel = isSuperAdmin ? "SUPER_ADMIN" : roles.map((r) => r.role).join(", ") || "NESSUN RUOLO";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <h1>KPI Ore</h1>
            <p>Contabilità infragruppo</p>
          </div>
        </div>
        <nav className="nav">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-box">
            <strong>{user?.email}</strong>
            <span>{roleLabel}</span>
          </div>
          <button className="button ghost full" onClick={signOut}>
            <LogOut size={16} /> Esci
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
