import { aiacModules } from "@/lib/modules";

export default function Home() {
  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="eyebrow">AIAC Cameroun</p>
          <h1>Plateforme dynamique en preparation</h1>
          <p className="lead">
            Cette base Next.js est prete pour publier le site AIAC, connecter le domaine,
            puis ajouter progressivement Supabase, Cloudinary, formulaires, rapports,
            reunions et tableau de bord admin.
          </p>
        </div>
        <a className="primary" href="/ancien-site/index.html">
          Ouvrir le site actuel
        </a>
      </header>

      <section className="panel">
        <div className="sectionTitle">
          <p className="eyebrow">Migration</p>
          <h2>Ce projet garde ton site existant et prepare le futur dynamique</h2>
        </div>
        <div className="grid">
          {aiacModules.map((item) => (
            <article className="card" key={item.title}>
              <span>{item.status}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="actions">
        <a href="/ancien-site/explorer.html">Explorer les anciens dossiers</a>
        <a href="/ancien-site/autres/projets.html">Voir projets</a>
        <a href="/ancien-site/autres/rapports.html">Voir rapports</a>
        <a href="/ancien-site/autres/agenda.html">Voir agenda</a>
      </section>
    </main>
  );
}
