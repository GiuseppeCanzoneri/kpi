import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setBusy(false);

    if (error) {
      setMessage("Credenziali non valide oppure utente non abilitato. Verifica email e password.");
    }
  };

  return (
    <div className="login-v2-page">
      <div className="login-v2-bg" />

      <section className="login-v2-panel" aria-label="Accesso gestionale KPI">
        <div className="login-v2-hero">
          <div className="login-v2-kicker">Gestionale interno</div>
          <h1>KPI / Contabilità ore infragruppo</h1>
          <p>
            Accesso riservato agli utenti abilitati. Le ore caricate entrano subito nei
            riepiloghi approvati, con controllo successivo da Admin Area e Super Admin.
          </p>

          <div className="login-v2-points">
            <div>
              <ShieldCheck size={18} />
              <span>Accesso controllato per ruolo</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>Report mensili e fatture infragruppo</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>Timesheet, aree, commesse e tariffari</span>
            </div>
          </div>
        </div>

        <form className="login-v2-card" onSubmit={submit}>
          <div className="login-v2-brand">
            <div className="login-v2-logo">K</div>
            <div>
              <span>Modulo KPI</span>
              <strong>Area riservata</strong>
            </div>
          </div>

          <div className="login-v2-title">
            <h2>Accedi al portale</h2>
            <p>Usa l’account già autorizzato dal Super Admin.</p>
          </div>

          {message && <div className="login-v2-alert">{message}</div>}

          <label className="login-v2-field">
            <span>Email</span>
            <div>
              <Mail size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@azienda.it"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="login-v2-field">
            <span>Password</span>
            <div>
              <LockKeyhole size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Inserisci password"
                autoComplete="current-password"
                required
              />
            </div>
          </label>

          <button className="login-v2-submit" disabled={busy || loading}>
            <span>{busy ? "Accesso in corso..." : "Accedi"}</span>
            <ArrowRight size={19} />
          </button>

          <p className="login-v2-note">
            La creazione utenti è gestita da <strong>Accessi e ruoli</strong>. Non è
            disponibile registrazione pubblica.
          </p>
        </form>
      </section>
    </div>
  );
}
