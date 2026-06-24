import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const authCall = mode === "login"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });
    const { error } = await authCall;
    setLoading(false);
    if (error) setMessage(error.message);
    else if (mode === "signup") setMessage("Utente creato. Ora assegna il ruolo SUPER_ADMIN dal SQL seed o dalla tabella user_area_roles.");
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
        {message && <div className="alert">{message}</div>}
        <label>
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        <button className="button full" disabled={loading}>{loading ? "Attendi..." : mode === "login" ? "Accedi" : "Crea utente"}</button>
        <button type="button" className="button ghost full" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Crea primo utente" : "Ho già un account"}</button>
      </form>
    </div>
  );
}