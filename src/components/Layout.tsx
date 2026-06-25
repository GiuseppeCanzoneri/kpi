import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "../hooks/useAuth";

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, isSuperAdmin, isAdminArea, roles, activeAreaId, areaIds, setActiveAreaId } = useAuth();
  const roleLabel = isSuperAdmin ? "SUPER_ADMIN" : isAdminArea ? "ADMIN_AREA" : "USER_AREA";

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Gestionale interno</p>
            <h2>KPI / Contabilità ore infragruppo</h2>
          </div>
          <div className="topbar-status">
            {areaIds.length > 1 && (
              <select className="input compact" value={activeAreaId ?? ""} onChange={(event) => setActiveAreaId(event.target.value || null)}>
                <option value="">Tutte le aree abilitate</option>
                {areaIds.map((id) => (
                  <option key={id} value={id}>{id.slice(0, 8)}</option>
                ))}
              </select>
            )}
            <span className="status-pill">{roleLabel}</span>
            <span className="user-chip">{user?.email ?? roles[0]?.email ?? "Utente"}</span>
            <button type="button" className="button secondary" onClick={() => void signOut()}>Esci</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
