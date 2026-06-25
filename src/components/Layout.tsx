import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Building2, CheckCircle2, Clock, Database, FileText, HelpCircle, Home, LogOut, ReceiptText, Shield, Upload, UserCog } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const baseNav = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/timesheet", label: "Timesheet", icon: Clock },
  { to: "/approvazioni", label: "Approvazione ore", icon: CheckCircle2 },
  { to: "/riepilogo", label: "Riepilogo mese", icon: BarChart3 },
  { to: "/fatture", label: "Fatture infragruppo", icon: ReceiptText, superOnly: true },
  { to: "/report", label: "Report", icon: FileText },
  { to: "/import", label: "Import Excel", icon: Upload },
  { to: "/anagrafiche", label: "Anagrafiche", icon: Database },
  { to: "/accessi", label: "Accessi e ruoli", icon: Shield },
  { to: "/istruzioni", label: "Istruzioni", icon: HelpCircle },
];

export function Layout() {
  const { user, roles, isSuperAdmin, isAdminArea, signOut, refreshRoles } = useAuth();
  const roleLabel = isSuperAdmin ? "SUPER_ADMIN" : isAdminArea ? "ADMIN_AREA" : roles[0]?.role ?? "USER_AREA";
  const nav = baseNav.filter((item) => !item.superOnly || isSuperAdmin);
  const areaCount = new Set(roles.map((r) => r.business_area_id).filter(Boolean)).size;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">K</div>
          <div>
            <h1>KPI Infragruppo</h1>
            <p>Ore · aree · società · tariffario</p>
          </div>
        </div>

        <div className="sidebar-section-title">Menu operativo</div>
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
          <div className="user-box professional">
            <div className="user-avatar"><UserCog size={18} /></div>
            <div>
              <strong>{user?.email}</strong>
              <span>{roleLabel} · {areaCount === 0 && isSuperAdmin ? "tutte le aree" : `${areaCount} aree`}</span>
            </div>
          </div>
          <button className="button ghost full" onClick={() => void refreshRoles()}><Building2 size={16} /> Ricarica ruolo</button>
          <button className="button ghost full" onClick={signOut}>
            <LogOut size={16} /> Esci
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <span className="eyebrow">Gestionale KPI</span>
            <h2>Contabilità ore infragruppo</h2>
          </div>
          <div className="topbar-status">
            <span className="status-dot" />
            <span>{roleLabel}</span>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
