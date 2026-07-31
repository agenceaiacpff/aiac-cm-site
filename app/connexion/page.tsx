import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Connexion() {
  return <main className="authPage"><section className="authCard"><Link href="/">← Accueil</Link><img src="/aiac-logo.bmp" alt="AIAC" /><p className="eyebrow">Espace sécurisé AIAC</p><h1>Connexion</h1><p>Accédez à vos messages, demandes, documents et activités.</p><AuthForm mode="connexion" /><div className="authLinks"><Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link><Link href="/inscription">Créer un compte</Link></div></section></main>;
}
