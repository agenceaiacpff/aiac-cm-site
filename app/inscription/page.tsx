import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Inscription() {
  return <main className="authPage"><section className="authCard"><Link href="/">← Accueil</Link><img src="/aiac-logo.bmp" alt="AIAC" /><p className="eyebrow">Rejoindre le portail</p><h1>Créer un compte</h1><p>Après la confirmation de votre adresse électronique, votre compte restera en attente jusqu’à sa validation par l’AIAC.</p><AuthForm mode="inscription" /><div className="authLinks"><Link href="/connexion">J’ai déjà un compte</Link></div></section></main>;
}
