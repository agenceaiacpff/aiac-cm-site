const legacySiteUrl = "http://agenceaiac.e-monsite.com";
const newSiteUrl = "/nouveau-site/index.html";

export default function Home() {
  return (
    <main className="portalPage">
      <section className="welcome">
        <img className="portalLogo" src="/aiac-logo.bmp" alt="Logo AIAC" />
        <p className="portalEyebrow">Agence d'Intervention et d'Action Communautaire</p>
        <h1>Bienvenue sur le portail officiel de l'AIAC</h1>
        <p className="portalLead">
          Consultez nos activités publiques ou connectez-vous à votre espace AIAC.
        </p>
        <div className="portalActions">
          <a className="enterButton" href="/connexion">Se connecter</a>
          <a className="secondaryButton" href="/inscription">Créer un compte</a>
        </div>
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
