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

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function validTemporaryPassword(password: string) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
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
    set_temporary_password: "accounts.password.manage",
    delete_account: "accounts.delete",
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
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || reason.length < 5) {
    return json(origin, { error: "Compte cible et motif détaillé obligatoires" }, 400);
  }

  if (action === "verify_email") {
    const { error } = await service.auth.admin.updateUserById(targetId, { email_confirm: true });
    if (error) return json(origin, { error: error.message }, 400);
    const recorded = await userClient.rpc("record_manual_email_verification", { target_id: targetId, reason });
    if (recorded.error) return json(origin, { error: recorded.error.message }, 400);
    return json(origin, { ok: true, message: "Adresse électronique vérifiée" });
  }

  const profile = await service.from("profiles").select("email,full_name,role,status").eq("id", targetId).single();
  if (profile.error || !profile.data?.email) return json(origin, { error: "Compte ou adresse électronique introuvable" }, 404);

  if (action === "set_temporary_password") {
    if (targetId === actorId) return json(origin, { error: "Modifiez votre propre mot de passe depuis votre profil" }, 400);
    const password = String(payload.password || "");
    if (!validTemporaryPassword(password)) {
      return json(origin, { error: "Le mot de passe temporaire doit contenir au moins 12 caractères, avec minuscule, majuscule, chiffre et caractère spécial" }, 400);
    }
    const updated = await service.auth.admin.updateUserById(targetId, { password });
    if (updated.error) return json(origin, { error: updated.error.message }, 400);
    // La synchronisation Auth remet d'abord l'indicateur à zéro lors du changement réel.
    // L'exigence administrative doit donc être posée après le mot de passe temporaire.
    const required = await userClient.rpc("require_password_reset", { target_id: targetId, reason });
    if (required.error) return json(origin, { error: `Mot de passe temporaire défini, mais changement obligatoire non enregistré : ${required.error.message}` }, 500);
    await service.from("admin_account_actions").insert({
      target_profile_id: targetId,
      actor_id: actorId,
      action: "set_temporary_password",
      reason,
      details: { sessions_revoked: true, change_required_at_next_login: true },
    });
    await service.from("audit_logs").insert({
      actor_id: actorId,
      action: "account.temporary_password_set",
      entity_type: "profile",
      entity_id: targetId,
      details: { reason, sessions_revoked: true, password_recorded: false },
    });
    return json(origin, { ok: true, message: "Mot de passe temporaire défini. Toutes les sessions sont révoquées et l’utilisateur devra choisir son propre mot de passe à la prochaine connexion." });
  }

  if (action === "delete_account") {
    if (targetId === actorId) return json(origin, { error: "Vous ne pouvez pas supprimer votre propre compte" }, 400);
    if (reason.length < 10) return json(origin, { error: "Le motif de suppression doit contenir au moins 10 caractères" }, 400);
    const confirmation = String(payload.confirmation || "").trim().toLowerCase();
    if (confirmation !== profile.data.email.toLowerCase()) {
      return json(origin, { error: "Recopiez exactement l’adresse électronique du compte pour confirmer la suppression" }, 400);
    }
    if (profile.data.role === "super_admin") {
      const remaining = await service.from("profiles").select("id", { count: "exact", head: true })
        .eq("role", "super_admin").eq("status", "active").neq("id", targetId);
      if (remaining.error || (remaining.count || 0) < 1) {
        return json(origin, { error: "Le dernier super-administrateur actif ne peut pas être supprimé" }, 400);
      }
    }

    const destructiveReferences = [
      { table: "messages", column: "sender_id", label: "messages" },
      { table: "requests", column: "created_by", label: "demandes" },
      { table: "tasks", column: "created_by", label: "tâches" },
      { table: "conversations", column: "created_by", label: "conversations" },
      { table: "documents", column: "owner_id", label: "documents" },
    ];
    const blockerChecks = await Promise.all(destructiveReferences.map(async (reference) => {
      const result = await service.from(reference.table).select("id", { count: "exact", head: true }).eq(reference.column, targetId);
      return { ...reference, count: result.count || 0, error: result.error };
    }));
    const blockerError = blockerChecks.find((item) => item.error)?.error;
    if (blockerError) return json(origin, { error: blockerError.message }, 500);
    const blockers = blockerChecks.filter((item) => item.count > 0).map((item) => `${item.count} ${item.label}`);
    if (blockers.length) {
      return json(origin, { error: `Suppression bloquée pour préserver les données institutionnelles : ${blockers.join(", ")}. Suspendez plutôt le compte ou transférez d’abord ces éléments.` }, 409);
    }

    const revoked = await userClient.rpc("revoke_user_sessions", { target_id: targetId, reason: `Suppression du compte : ${reason}` });
    if (revoked.error) return json(origin, { error: revoked.error.message }, 400);
    const actionLog = await service.from("admin_account_actions").insert({
      target_profile_id: targetId,
      actor_id: actorId,
      action: "delete_account",
      reason,
      details: { email: profile.data.email, full_name: profile.data.full_name, role: profile.data.role, status: "requested" },
    }).select("id").single();
    if (actionLog.error || !actionLog.data) return json(origin, { error: actionLog.error?.message || "Journalisation impossible" }, 500);
    await service.from("audit_logs").insert({
      actor_id: actorId,
      action: "account.deletion_requested",
      entity_type: "profile",
      entity_id: targetId,
      details: { reason, email: profile.data.email, full_name: profile.data.full_name, role: profile.data.role },
    });
    const removed = await service.auth.admin.deleteUser(targetId);
    if (removed.error) {
      await service.from("admin_account_actions").update({ details: { email: profile.data.email, full_name: profile.data.full_name, role: profile.data.role, status: "failed", error: removed.error.message } }).eq("id", actionLog.data.id);
      return json(origin, { error: `Suppression impossible : ${removed.error.message}. Les sessions ont néanmoins été révoquées.` }, 409);
    }
    await service.from("admin_account_actions").update({ details: { email: profile.data.email, full_name: profile.data.full_name, role: profile.data.role, status: "deleted" } }).eq("id", actionLog.data.id);
    return json(origin, { ok: true, deleted: true, message: "Compte supprimé définitivement. La trace administrative de l’opération est conservée." });
  }

  const required = await userClient.rpc("require_password_reset", { target_id: targetId, reason });
  if (required.error) return json(origin, { error: required.error.message }, 400);
  const recovery = await service.auth.admin.generateLink({
    type: "recovery",
    email: profile.data.email,
    options: { redirectTo },
  });
  const recoveryLink = recovery.data?.properties?.action_link;
  if (recovery.error || !recoveryLink) {
    return json(origin, { error: `Réinitialisation imposée, mais lien non généré : ${recovery.error?.message || "lien indisponible"}` }, 502);
  }
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json(origin, { error: "Réinitialisation imposée, mais le service d’e-mail AIAC n’est pas configuré" }, 502);
  const from = Deno.env.get("AIAC_EMAIL_FROM") || "AIAC <reunions@notifications.aiac-cm.org>";
  const recipientName = profile.data.full_name || profile.data.email;
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [profile.data.email],
      subject: "Réinitialisation de votre mot de passe — Portail AIAC",
      html: `<!doctype html><html lang="fr"><body style="background:#f1f5f9;font-family:Arial,sans-serif;margin:0;padding:24px"><main style="background:#fff;border-radius:14px;margin:auto;max-width:640px;padding:28px"><p style="color:#0369a1;font-size:12px;font-weight:700;text-transform:uppercase">Sécurité du portail AIAC</p><h1 style="color:#0f172a">Choisissez un nouveau mot de passe</h1><p>Bonjour ${escapeHtml(recipientName)},</p><p>Un super-administrateur de l’AIAC a demandé la réinitialisation sécurisée de votre mot de passe.</p><p style="margin:24px 0"><a href="${escapeHtml(recoveryLink)}" style="background:#047857;border-radius:8px;color:#fff;display:inline-block;font-weight:700;padding:12px 18px;text-decoration:none">Définir mon nouveau mot de passe</a></p><p>Ce lien est personnel et utilisable une seule fois. Si vous l’avez déjà ouvert, demandez un nouveau lien.</p><p style="color:#64748b;font-size:12px">Message automatique du portail AIAC.</p></main></body></html>`,
    }),
  });
  if (!emailResponse.ok) {
    const detail = await emailResponse.text();
    return json(origin, { error: `Réinitialisation imposée, mais e-mail AIAC non envoyé : ${detail.slice(0, 500)}` }, 502);
  }
  return json(origin, { ok: true, message: "Sessions révoquées et nouveau lien de réinitialisation envoyé par le service de courriel AIAC" });
});
