import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const legacySiteUrl = "http://agenceaiac.e-monsite.com";
const newSiteUrl = "/nouveau-site/index.html";

const roleLabels: Record<string, string> = {
  member: "Membre",
  beneficiary: "Bénéficiaire",
  volunteer: "Bénévole",
  staff: "Personnel AIAC",
  manager: "Responsable d’organe",
  partner: "Partenaire",
  admin: "Administrateur",
  super_admin: "Super-administrateur"
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("full_name,email,role,status,registration_state").eq("id", userId).maybeSingle()
    : { data: null };
  const connected = Boolean(profile && profile.status === "active" && profile.registration_state === "approved");

  return (
    <main className="portalPage">
      <section className="welcome">
        <img className="portalLogo" src="/aiac-logo.bmp" alt="Logo AIAC" />
        <p className="portalEyebrow">Agence d'Intervention et d'Action Communautaire</p>
        <h1>Bienvenue sur le portail officiel de l'AIAC</h1>
        <p className="portalLead">
          {connected
            ? "Votre session AIAC est active. Vous pouvez parcourir le site public et reprendre votre travail sans vous reconnecter."
            : "Consultez nos activités publiques ou connectez-vous à votre espace AIAC."}
        </p>
        {connected ? (
          <div className="homeSessionCard" aria-label="Session AIAC active">
            <span className="homeSessionAvatar" aria-hidden="true">{(profile?.full_name || profile?.email || "A").charAt(0).toUpperCase()}</span>
            <span><b>{profile?.full_name || "Membre AIAC"}</b><small>{roleLabels[profile?.role || ""] || profile?.role}</small></span>
            <Link className="enterButton" href="/espace">Reprendre mon travail</Link>
          </div>
        ) : (
          <div className="portalActions">
            <Link className="enterButton" href="/connexion">Se connecter</Link>
            <Link className="secondaryButton" href="/inscription">Créer un compte</Link>
          </div>
        )}
      </section>

      <section className="bookGrid" aria-label="Choix du site AIAC">
        <article className="book oldBook">
          <div className="bookTop">
            <span>Ancien site</span>
            <h2>Activites realisees</h2>
          </div>
          <p className="bookDate">Archives disponibles au 01 juin 2026</p>
          <p>
            Cet espace permet de visionner certaines informations et activites
            realisees par le passe, non encore transferees vers le nouveau site.
          </p>
          <a className="enterButton" href={legacySiteUrl}>
            Entrer
          </a>
        </article>

        <article className="book newBook">
          <div className="bookTop">
            <span>Nouveau site</span>
            <h2>AIAC a jour</h2>
          </div>
          <p className="bookDate">Informations officielles actualisees</p>
          <p>
            Un nouveau site a ete construit pour mieux nous connaitre. Les
            informations du nouveau site sont a jour et presentent l'AIAC dans
            sa forme actuelle.
          </p>
          <a className="enterButton" href={newSiteUrl}>
            Entrer
          </a>
        </article>
      </section>
    </main>
  );
}
