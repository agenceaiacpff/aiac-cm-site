import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Recuperation() {
  return <main className="authPage"><section className="authCard"><Link href="/connexion">← Connexion</Link><p className="eyebrow">Récupération</p><h1>Mot de passe oublié</h1><p>Indiquez l’adresse utilisée pour votre compte.</p><AuthForm mode="recuperation" /></section></main>;
}
