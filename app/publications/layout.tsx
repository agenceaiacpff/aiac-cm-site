import Link from "next/link";
import Script from "next/script";
import { categoryEntries } from "@/lib/public-content";

export default function PublicationsLayout({children}:{children:React.ReactNode}){
  return <div className="publicHub">
    <header className="publicHubHeader"><Link className="publicHubBrand" href="/nouveau-site/index.html"><img src="/aiac-logo.bmp" alt="AIAC"/><span><b>AIAC Cameroun</b><small>Site officiel</small></span></Link><nav><Link href="/nouveau-site/index.html">Accueil</Link><Link href="/espace">Espace personnel</Link></nav></header>
    <nav className="publicCategoryNav" aria-label="Rubriques publiques">{categoryEntries.map(([slug,category])=><Link key={slug} href={`/publications/${slug}`}>{category.label}</Link>)}<Link href="/publications/livre-dor">Livre d’or</Link></nav>
    {children}
    <footer className="publicHubFooter"><p>Agence d’Intervention et d’Action Communautaire — Cameroun</p><Link href="/nouveau-site/index.html">Retour au site officiel</Link></footer>
    <Script src="/aiac-session.js" strategy="afterInteractive"/>
  </div>;
}
