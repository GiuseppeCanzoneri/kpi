import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type KpiRole = "USER_AREA" | "ADMIN_AREA" | "SUPER_ADMIN";

type CreateUserPayload = {
  email: string;
  password: string;
  nome?: string;
  cognome?: string;
  mansione?: string;
  role?: KpiRole;
  company_id?: string | null;
  location_id?: string | null;
  business_area_id?: string | null;
  tariff_profile_id?: string | null;
  can_view_amounts?: boolean;
  send_credentials_email?: boolean;
  portal_url?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function guessNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "utente";
  const parts = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  const capitalized = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  return {
    nome: capitalized[0] || "Utente",
    cognome: capitalized.slice(1).join(" ") || "Da aggiornare",
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  while (page < 30) {
    const list = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (list.error) throw list.error;
    const found = list.data.users.find((u) => cleanEmail(u.email ?? "") === email);
    if (found) return found.id;
    if (!list.data.users.length || list.data.users.length < 1000) break;
    page += 1;
  }
  return null;
}

async function sendCredentialsEmail(params: {
  to: string;
  nome: string;
  cognome: string;
  password: string;
  role: KpiRole;
  portalUrl: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "KPI Area IT <kpi@updates.as-protech.org>";
  const replyTo = Deno.env.get("RESEND_REPLY_TO") || "g.canzoneri@erelma.org";

  if (!apiKey) {
    return {
      sent: false,
      error: "RESEND_API_KEY non configurata nei secrets della Edge Function.",
    };
  }

  const name = `${params.nome} ${params.cognome}`.trim();
  const safeName = escapeHtml(name || params.to);
  const safeEmail = escapeHtml(params.to);
  const safePassword = escapeHtml(params.password);
  const safePortalUrl = escapeHtml(params.portalUrl);
  const safeRole = escapeHtml(params.role);

  const subject = "Accesso portale KPI / Registro ore";
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f3f7fb; padding:28px; color:#142033;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #d7e1ec; border-radius:18px; overflow:hidden;">
        <div style="background:#123b63; color:#ffffff; padding:22px 26px;">
          <div style="font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:700; opacity:.86;">KPI / Registro ore</div>
          <h1 style="margin:8px 0 0; font-size:24px; line-height:1.15;">Credenziali di accesso al portale</h1>
        </div>
        <div style="padding:26px;">
          <p style="font-size:16px; line-height:1.55; margin:0 0 16px;">Ciao <strong>${safeName}</strong>,</p>
          <p style="font-size:15px; line-height:1.55; margin:0 0 18px;">
            è stato creato il tuo account per accedere al portale KPI / Registro ore.
            Da oggi puoi iniziare a registrare le attività svolte, le commesse e le ore lavorate.
          </p>

          <div style="background:#f7fafc; border:1px solid #d7e1ec; border-radius:14px; padding:18px; margin:18px 0;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#6c7a8c; font-weight:700;">Credenziali</div>
            <p style="margin:12px 0 6px;"><strong>Email:</strong> ${safeEmail}</p>
            <p style="margin:6px 0;"><strong>Password temporanea:</strong> <span style="font-family:Consolas, Monaco, monospace; font-size:16px; background:#eef3f8; padding:4px 8px; border-radius:8px;">${safePassword}</span></p>
            <p style="margin:6px 0 0;"><strong>Ruolo:</strong> ${safeRole}</p>
          </div>

          <p style="font-size:15px; line-height:1.55; margin:0 0 20px;">
            Al primo accesso conserva le credenziali e, appena disponibile, aggiorna la password dalle impostazioni account.
          </p>

          <a href="${safePortalUrl}" style="display:inline-block; background:#123b63; color:#ffffff; text-decoration:none; padding:13px 18px; border-radius:12px; font-weight:700;">Apri il portale</a>

          <p style="font-size:13px; line-height:1.55; color:#6c7a8c; margin:22px 0 0;">
            Se riscontri problemi di accesso, errori nel caricamento ore oppure mancano commesse o attività, contatta l’Area IT.
          </p>
        </div>
      </div>
    </div>
  `;

  const text = `Ciao ${name || params.to},\n\nè stato creato il tuo account per il portale KPI / Registro ore.\n\nPortale: ${params.portalUrl}\nEmail: ${params.to}\nPassword temporanea: ${params.password}\nRuolo: ${params.role}\n\nSe riscontri problemi, contatta l'Area IT.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      sent: false,
      error: result?.message || result?.error || `Errore Resend ${response.status}`,
      result,
    };
  }

  return { sent: true, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Variabili Supabase mancanti nella Edge Function." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user?.email) {
      return json({ error: "Utente non autenticato." }, 401);
    }

    const callerEmail = cleanEmail(authData.user.email);
    const { data: callerRoles, error: callerRoleError } = await admin
      .from("user_area_roles")
      .select("role,business_area_id,active,email,user_id")
      .eq("active", true)
      .or(`user_id.eq.${authData.user.id},email.eq.${callerEmail}`);

    if (callerRoleError) return json({ error: callerRoleError.message }, 400);

    const activeRoles = callerRoles ?? [];
    const isSuperAdmin = activeRoles.some((r) => r.role === "SUPER_ADMIN");
    const isAdminArea = activeRoles.some((r) => r.role === "ADMIN_AREA");

    if (!isSuperAdmin && !isAdminArea) {
      return json({ error: "Solo ADMIN_AREA o SUPER_ADMIN possono creare utenze." }, 403);
    }

    const body = (await req.json()) as CreateUserPayload;
    const email = cleanEmail(body.email);
    const password = String(body.password ?? "");
    const role = String(body.role ?? "USER_AREA") as KpiRole;
    const company_id = body.company_id || null;
    const location_id = body.location_id || null;
    const business_area_id = body.business_area_id || null;
    const tariff_profile_id = body.tariff_profile_id || null;
    const can_view_amounts = Boolean(body.can_view_amounts || role === "ADMIN_AREA" || role === "SUPER_ADMIN");
    const sendEmail = body.send_credentials_email !== false;
    const portalUrl = cleanText(body.portal_url) || Deno.env.get("KPI_PORTAL_URL") || "https://kpi.as-protech.org";

    if (!email || !email.includes("@")) return json({ error: "Email non valida." }, 400);
    if (!password || password.length < 8) return json({ error: "La password deve avere almeno 8 caratteri." }, 400);
    if (!["USER_AREA", "ADMIN_AREA", "SUPER_ADMIN"].includes(role)) return json({ error: "Ruolo non valido." }, 400);
    if (!company_id) return json({ error: "Seleziona la società datrice." }, 400);
    if (!tariff_profile_id) return json({ error: "Seleziona il profilo tariffario del dipendente." }, 400);
    if (!isSuperAdmin && role !== "USER_AREA") return json({ error: "ADMIN_AREA può creare solo utenti USER_AREA." }, 403);
    if (role !== "SUPER_ADMIN" && !business_area_id) return json({ error: "Per USER_AREA e ADMIN_AREA devi selezionare un'area." }, 400);

    if (!isSuperAdmin && business_area_id) {
      const canAssignArea = activeRoles.some((r) => r.role === "ADMIN_AREA" && r.business_area_id === business_area_id);
      if (!canAssignArea) return json({ error: "Puoi creare utenti solo nella tua area." }, 403);
    }

    const guessed = guessNameFromEmail(email);
    const nome = cleanText(body.nome) || guessed.nome;
    const cognome = cleanText(body.cognome) || guessed.cognome;
    const mansione = cleanText(body.mansione) || null;

    let createdUserId: string | null = null;
    let userWasCreated = false;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { kpi_role: role, nome, cognome },
    });

    if (created.error) {
      const msg = created.error.message.toLowerCase();
      const alreadyExists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (!alreadyExists) return json({ error: created.error.message }, 400);

      createdUserId = await findAuthUserIdByEmail(admin, email);
      if (!createdUserId) return json({ error: "Utente già esistente, ma ID non trovato in Auth Users." }, 409);

      const updated = await admin.auth.admin.updateUserById(createdUserId, {
        password,
        email_confirm: true,
        user_metadata: { kpi_role: role, nome, cognome },
      });
      if (updated.error) return json({ error: updated.error.message }, 400);
    } else {
      createdUserId = created.data.user?.id ?? null;
      userWasCreated = true;
    }

    if (!createdUserId) return json({ error: "Creazione utente non completata." }, 500);

    const rolePayload = {
      user_id: createdUserId,
      email,
      role,
      company_id,
      location_id,
      business_area_id: role === "SUPER_ADMIN" ? null : business_area_id,
      can_view_amounts,
      active: true,
      assigned_by: authData.user.id,
      assigned_at: new Date().toISOString(),
    };

    const { data: existingRows, error: findRoleError } = await admin
      .from("user_area_roles")
      .select("id,email,role,company_id,location_id,business_area_id")
      .eq("email", email)
      .eq("role", role);

    if (findRoleError) return json({ error: findRoleError.message }, 400);

    const existingRole = (existingRows ?? []).find(
      (r) =>
        (r.company_id ?? null) === company_id &&
        (r.location_id ?? null) === location_id &&
        (r.business_area_id ?? null) === (role === "SUPER_ADMIN" ? null : business_area_id),
    );

    if (existingRole) {
      const { error } = await admin.from("user_area_roles").update(rolePayload).eq("id", existingRole.id);
      if (error) return json({ error: error.message }, 400);
    } else {
      const { error } = await admin.from("user_area_roles").insert(rolePayload);
      if (error) return json({ error: error.message }, 400);
    }

    const employeePayload = {
      email,
      nome,
      cognome,
      company_id,
      location_id,
      tariff_profile_id,
      mansione,
      attivo: true,
    };

    const { data: existingEmployee, error: findEmployeeError } = await admin
      .from("employees")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (findEmployeeError) return json({ error: findEmployeeError.message }, 400);

    if (existingEmployee?.id) {
      const { error } = await admin.from("employees").update(employeePayload).eq("id", existingEmployee.id);
      if (error) return json({ error: error.message }, 400);
    } else {
      const { error } = await admin.from("employees").insert(employeePayload);
      if (error) return json({ error: error.message }, 400);
    }

    let emailResult: Awaited<ReturnType<typeof sendCredentialsEmail>> | null = null;
    if (sendEmail) {
      emailResult = await sendCredentialsEmail({
        to: email,
        nome,
        cognome,
        password,
        role,
        portalUrl,
      });
    }

    return json({
      ok: true,
      user_id: createdUserId,
      email,
      role,
      user_was_created: userWasCreated,
      email_sent: emailResult?.sent ?? false,
      email_error: emailResult && !emailResult.sent ? emailResult.error : null,
      message: emailResult?.sent
        ? "Utente creato/aggiornato, ruolo assegnato ed email credenziali inviata."
        : sendEmail
          ? "Utente creato/aggiornato, ma email credenziali non inviata."
          : "Utente creato/aggiornato e ruolo assegnato.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
