import type { ReactNode } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "../hooks/useAuth";

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, activeRoleLabel, allAreaIds, activeAreaId, setActiveAreaId } = useAuth();

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="main">
        <div className="topbar">
          <div>
            <span className="eyebrow">Gestionale interno</span>
            <h1>KPI / Contabilità ore infragruppo</h1>
          </div>
          <div className="topbar-actions">
            {allAreaIds.length > 1 && (
              <select className="input small area-switch" value={activeAreaId ?? ""} onChange={(e) => setActiveAreaId(e.target.value || null)}>
                <option value="">Tutte le aree abilitate</option>
                {allAreaIds.map((id) => (
                  <option key={id} value={id}>{id.slice(0, 8)}</option>
                ))}
              </select>
            )}
            <span className="role-chip"><ShieldCheck size={15} /> {activeRoleLabel}</span>
            <span className="user-chip">{user?.email}</span>
            <button className="button secondary" type="button" onClick={() => void signOut()}>
              <LogOut size={16} /> Esci
            </button>
          </div>
        </div>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
