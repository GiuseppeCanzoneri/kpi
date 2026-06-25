import { useAuth } from "../hooks/useAuth";

export default function NoRole() {
  const { user, refreshRoles, signOut } = useAuth();

  return (
    <main className="auth-screen">
      <section className="auth-card waiting-card">
        <div className="brand-mark large">K</div>
        <p className="eyebrow">Accesso in attesa</p>
        <h1>Utente registrato, ruolo non ancora attivo</h1>
        <p>
          L'account <strong>{user?.email}</strong> è stato creato correttamente. Ora un SUPER_ADMIN deve assegnare il ruolo operativo.
          Dopo l'assegnazione l'app aggiorna il profilo automaticamente; puoi anche forzare il controllo.
        </p>
        <div className="auth-actions">
          <button className="button primary" type="button" onClick={() => void refreshRoles()}>Controlla abilitazione</button>
          <button className="button secondary" type="button" onClick={() => void signOut()}>Esci</button>
        </div>
      </section>
    </main>
  );
}
