import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const allowedOrigins = new Set([
  "https://www.aiac-cm.org",
  "https://aiac-cm.org",
  "http://localhost:3000",
]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://www.aiac-cm.org",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  return `${Array.from(bytes, (value) => value.toString(36)).join("")}Aa1!`;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json(origin, { error: "Méthode non autorisée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
    return json(origin, { error: "Configuration ou authentification manquante" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(origin, { error: "Session invalide" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(origin, { error: "Corps JSON invalide" }, 400);
  }

  const action = String(payload.action || "");
  const permissionByAction: Record<string, string> = {
    invite: "accounts.invite",
    create: "accounts.invite",
    verify_email: "accounts.email.verify",
    require_password_reset: "accounts.password_reset.require",
  };
  const permission = permissionByAction[action];
  if (!permission) return json(origin, { error: "Action inconnue" }, 400);

  const { data: allowed, error: permissionError } = await userClient.rpc("can_admin_action", { permission_code: permission });
  if (permissionError || !allowed) {
    return json(origin, { error: "Permission insuffisante ou MFA non vérifiée" }, 403);
  }

  const actorId = authData.user.id;
  const redirectTo = "https://www.aiac-cm.org/auth/callback?next=/mettre-a-jour-mot-de-passe";

  if (action === "invite" || action === "create") {
    const email = String(payload.email || "").trim().toLowerCase();
    const fullName = String(payload.full_name || "").trim();
    const role = String(payload.role || "member");
    const phone = String(payload.phone || "").trim() || null;
    const organization = String(payload.organization || "AIAC").trim() || "AIAC";
    const bodyId = String(payload.body_id || "").trim() || null;
    const scopeType = String(payload.scope_type || "body");
    const territory = String(payload.territory || "").trim() || null;
    const decisionReference = String(payload.decision_reference || "").trim();
    const validRoles = new Set(["member", "beneficiary", "volunteer", "staff", "manager", "partner", "admin", "super_admin"]);
    if (!email.includes("@") || fullName.length < 2 || !validRoles.has(role)) {
      return json(origin, { error: "E-mail, nom ou rôle invalide" }, 400);
    }
    if (bodyId && decisionReference.length < 2) {
      return json(origin, { error: "La décision de rattachement est obligatoire" }, 400);
    }

    const userMetadata = { full_name: fullName, phone, organization };
    const created = action === "invite"
      ? await service.auth.admin.inviteUserByEmail(email, { data: userMetadata, redirectTo })
      : await service.auth.admin.createUser({ email, password: randomPassword(), email_confirm: true, user_metadata: userMetadata });
    if (created.error || !created.data.user) {
      return json(origin, { error: created.error?.message || "Création impossible" }, 400);
    }

    const targetId = created.data.user.id;
    const { error: profileError } = await service.from("profiles").update({
      email,
      full_name: fullName,
      phone,
      organization,
      role,
      registration_state: "approved",
      status: "active",
      validated_at: new Date().toISOString(),
      validated_by: actorId,
      rejection_reason: null,
      must_reset_password: true,
      password_reset_required_at: new Date().toISOString(),
      password_reset_required_by: actorId,
      email_verified_at: action === "create" ? new Date().toISOString() : null,
    }).eq("id", targetId);
    if (profileError) return json(origin, { error: profileError.message }, 500);

    if (bodyId) {
      const { error: scopeError } = await service.from("account_scope_assignments").insert({
        profile_id: targetId,
        scope_type: scopeType,
        body_id: scopeType === "project" ? null : bodyId,
        project_id: scopeType === "project" ? bodyId : null,
        territory,
        permission_level: "viewer",
        decision_reference: decisionReference,
        created_by: actorId,
      });
      if (scopeError) return json(origin, { error: scopeError.message }, 500);
    }

    if (action === "create") {
      const recovery = await service.auth.resetPasswordForEmail(email, { redirectTo });
      if (recovery.error) {
        return json(origin, { error: `Compte créé, mais e-mail de configuration non envoyé : ${recovery.error.message}`, user_id: targetId }, 502);
      }
    }

    await service.from("admin_account_actions").insert({
      target_profile_id: targetId,
      actor_id: actorId,
      action,
      reason: action === "invite" ? "Invitation institutionnelle envoyée" : "Compte institutionnel créé",
      details: { email, role, body_id: bodyId, scope_type: scopeType, territory },
    });
    return json(origin, { ok: true, user_id: targetId, message: action === "invite" ? "Invitation envoyée" : "Compte créé et configuration envoyée" });
  }

  const targetId = String(payload.target_id || "");
  const reason = String(payload.reason || "").trim();
  if (!targetId || reason.length < 5) return json(origin, { error: "Compte cible et motif détaillé obligatoires" }, 400);

  if (action === "verify_email") {
    const { error } = await service.auth.admin.updateUserById(targetId, { email_confirm: true });
    if (error) return json(origin, { error: error.message }, 400);
    const recorded = await userClient.rpc("record_manual_email_verification", { target_id: targetId, reason });
    if (recorded.error) return json(origin, { error: recorded.error.message }, 400);
    return json(origin, { ok: true, message: "Adresse électronique vérifiée" });
  }

  const profile = await service.from("profiles").select("email").eq("id", targetId).single();
  if (profile.error || !profile.data?.email) return json(origin, { error: "Compte ou adresse électronique introuvable" }, 404);
  const required = await userClient.rpc("require_password_reset", { target_id: targetId, reason });
  if (required.error) return json(origin, { error: required.error.message }, 400);
  const recovery = await service.auth.resetPasswordForEmail(profile.data.email, { redirectTo });
  if (recovery.error) return json(origin, { error: `Réinitialisation imposée, mais e-mail non envoyé : ${recovery.error.message}` }, 502);
  return json(origin, { ok: true, message: "Sessions révoquées et e-mail de réinitialisation envoyé" });
});
