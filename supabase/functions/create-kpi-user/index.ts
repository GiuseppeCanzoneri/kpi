import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type KpiRole = "USER_AREA" | "ADMIN_AREA" | "SUPER_ADMIN";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(email: string) {
  return String(email || "").trim().toLowerCase();
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

    const isSuperAdmin = (callerRoles ?? []).some((r) => r.role === "SUPER_ADMIN");
    const isAdminArea = (callerRoles ?? []).some((r) => r.role === "ADMIN_AREA");

    if (!isSuperAdmin && !isAdminArea) {
      return json({ error: "Solo ADMIN_AREA o SUPER_ADMIN possono creare utenze." }, 403);
    }

    const body = await req.json();
    const email = cleanEmail(body.email);
    const password = String(body.password ?? "");
    const role = String(body.role ?? "USER_AREA") as KpiRole;
    const company_id = body.company_id || null;
    const location_id = body.location_id || null;
    const business_area_id = body.business_area_id || null;
    const can_view_amounts = Boolean(body.can_view_amounts || role === "ADMIN_AREA" || role === "SUPER_ADMIN");

    if (!email || !email.includes("@")) return json({ error: "Email non valida." }, 400);
    if (!password || password.length < 6) return json({ error: "La password deve avere almeno 6 caratteri." }, 400);
    if (!["USER_AREA", "ADMIN_AREA", "SUPER_ADMIN"].includes(role)) return json({ error: "Ruolo non valido." }, 400);

    if (!isSuperAdmin && role !== "USER_AREA") {
      return json({ error: "ADMIN_AREA può creare solo utenti USER_AREA." }, 403);
    }

    if (role !== "SUPER_ADMIN" && !business_area_id) {
      return json({ error: "Per USER_AREA e ADMIN_AREA devi selezionare un'area." }, 400);
    }

    if (!isSuperAdmin && business_area_id) {
      const canAssignArea = (callerRoles ?? []).some((r) => r.role === "ADMIN_AREA" && r.business_area_id === business_area_id);
      if (!canAssignArea) return json({ error: "Puoi creare utenti solo nella tua area." }, 403);
    }

    let createdUserId: string | null = null;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { kpi_role: role },
    });

    if (created.error) {
      const alreadyExists = created.error.message.toLowerCase().includes("already") || created.error.message.toLowerCase().includes("registered");
      if (!alreadyExists) return json({ error: created.error.message }, 400);

      // Recupero best-effort dell'utente già presente.
      // Per installazioni piccole è accettabile; per grandi volumi conviene usare una tabella profilo indicizzata.
      let page = 1;
      while (!createdUserId && page < 20) {
        const list = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (list.error) break;
        const found = list.data.users.find((u) => cleanEmail(u.email ?? "") === email);
        if (found) createdUserId = found.id;
        if (!list.data.users.length || list.data.users.length < 1000) break;
        page++;
      }

      if (!createdUserId) {
        return json({ error: "Utente già esistente, ma non riesco a recuperare il suo ID. Controlla Auth Users in Supabase." }, 409);
      }
    } else {
      createdUserId = created.data.user?.id ?? null;
    }

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
    };

    const { data: existingRows, error: findError } = await admin
      .from("user_area_roles")
      .select("id,email,role,company_id,location_id,business_area_id")
      .eq("email", email)
      .eq("role", role);

    if (findError) return json({ error: findError.message }, 400);

    const existing = (existingRows ?? []).find((r) =>
      (r.company_id ?? null) === company_id &&
      (r.location_id ?? null) === location_id &&
      (r.business_area_id ?? null) === (role === "SUPER_ADMIN" ? null : business_area_id)
    );

    if (existing) {
      const { error } = await admin
        .from("user_area_roles")
        .update(rolePayload)
        .eq("id", existing.id);
      if (error) return json({ error: error.message }, 400);
    } else {
      const { error } = await admin.from("user_area_roles").insert(rolePayload);
      if (error) return json({ error: error.message }, 400);
    }

    return json({
      ok: true,
      user_id: createdUserId,
      email,
      role,
      message: "Utente creato/aggiornato e ruolo assegnato.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});