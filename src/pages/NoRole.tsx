import { useAuth } from "../hooks/useAuth";

export default function NoRole() {
  const { user, signOut, refreshRoles } = useAuth();
  return (
    <div className="center-page">
      <div className="panel narrow">
        <h2>Accesso non configurato</h2>
        <p>L'utente <strong>{user?.email}</strong> non ha ancora un ruolo nel modulo KPI.</p>
        <p>Inserisci questo utente in <strong>user_area_roles</strong> come SUPER_ADMIN oppure assegnalo a un'area come ADMIN_AREA / USER_AREA.</p>
        <div className="toolbar">
          <button className="button" onClick={refreshRoles}>Ricarica ruoli</button>
          <button className="button secondary" onClick={signOut}>Esci</button>
        </div>
      </div>
    </div>
  );
}
