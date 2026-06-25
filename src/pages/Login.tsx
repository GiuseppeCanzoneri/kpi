import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const authCall = mode === "login"
      ? supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      : supabase.auth.signUp({ email: email.trim().toLowerCase(), password });

    const { error } = await authCall;
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup") setMessage("Utente creato. Ora assegna un ruolo in Accessi e ruoli / user_area_roles.");
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand center">
          <div className="brand-mark">K</div>
          <div>
            <h1>KPI Ore</h1>
            <p>Contabilità Ore Infragruppo</p>
          </div>
        </div>

        {message && <div className="alert warning">{message}</div>}

        <label>Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
        <button className="button full" disabled={busy}>{busy ? "Attendi..." : mode === "login" ? "Accedi" : "Crea utente"}</button>
        <button type="button" className="button secondary full" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Crea primo utente" : "Ho già un account"}
        </button>
      </form>
    </div>
  );
}
