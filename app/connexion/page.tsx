import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { createClient } from "@/lib/supabase/server";

function safeReturn(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/espace";
}

export default async function Connexion({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status,registration_state,must_reset_password")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.registration_state === "rejected") redirect("/compte-refuse");
    if (profile?.status === "suspended") redirect("/compte-suspendu");
    if (profile && (profile.status === "pending" || profile.registration_state !== "approved")) redirect("/compte-en-attente");
    if (profile?.must_reset_password) redirect("/mettre-a-jour-mot-de-passe");
    if (profile && ["admin", "super_admin"].includes(profile.role) && claimsData?.claims?.aal !== "aal2") redirect("/mfa");
    if (profile) redirect(safeReturn(params.retour));
  }
  return <main className="authPage"><section className="authCard"><Link href="/">← Accueil</Link><img src="/aiac-logo.bmp" alt="AIAC" /><p className="eyebrow">Espace sécurisé AIAC</p><h1>Connexion</h1><p>Accédez à vos messages, demandes, documents et activités.</p><AuthForm mode="connexion" /><div className="authLinks"><Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link><Link href="/inscription">Créer un compte</Link></div></section></main>;
}
