import Link from "next/link";
import { JULIENNE_PHOTO } from "../julienne-photo";

export const metadata = {
  title: "MB013 — MUNPEN MAPON JULIENNE | AIAC",
  description: "Vérification officielle de la carte professionnelle AIAC de MUNPEN MAPON JULIENNE.",
};

export default function MB013Page() {
  return (
    <main style={{minHeight:"100vh",background:"#f5f8fc",color:"#172033",fontFamily:"Arial, sans-serif"}}>
      <div style={{background:"#071f42",color:"#fff",padding:"9px 0"}}>
        <div style={{width:"min(1160px,92vw)",margin:"0 auto",display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",fontSize:13}}>
          <span>AGENCE D’INTERVENTION ET D’ACTION COMMUNAUTAIRE (AIAC)</span>
          <span>Portail officiel de vérification du personnel</span>
        </div>
      </div>

      <header style={{background:"#fff",borderBottom:"1px solid #dbe3ee"}}>
        <div style={{width:"min(1160px,92vw)",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,padding:"14px 0"}}>
          <Link href="/personnel" style={{display:"flex",alignItems:"center",gap:15,textDecoration:"none"}}>
            <img src="/aiac-logo.bmp" alt="Logo AIAC" style={{width:88,height:60,objectFit:"contain"}}/>
            <div>
              <h1 style={{margin:0,color:"#0c3d78",fontSize:21}}>Vérification du personnel AIAC</h1>
              <div style={{color:"#67758c",fontSize:12}}>Fiche professionnelle authentifiée</div>
            </div>
          </Link>
          <span style={{border:"1px solid #bfe2cd",background:"#eef9f2",borderRadius:999,padding:"8px 12px",color:"#11703f",fontWeight:800,fontSize:12}}>✓ CARTE VÉRIFIÉE</span>
        </div>
      </header>

      <section style={{padding:"38px 0 60px"}}>
        <div style={{width:"min(1100px,92vw)",margin:"0 auto"}}>
          <div style={{fontSize:13,color:"#67758c",marginBottom:18}}><Link href="/personnel">Personnel AIAC</Link> › MB013 › Vérification</div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(260px,330px) minmax(0,1fr)",gap:26,alignItems:"start"}}>
            <aside style={{background:"#fff",border:"1px solid #dbe3ee",borderRadius:22,padding:24,textAlign:"center",boxShadow:"0 18px 48px rgba(27,47,75,.12)"}}>
              <img src={JULIENNE_PHOTO} alt="MUNPEN MAPON JULIENNE" style={{width:185,height:220,margin:"0 auto",borderRadius:18,border:"1px solid #dbe3ee",objectFit:"cover",objectPosition:"center 35%",display:"block"}}/>
              <div style={{display:"inline-flex",alignItems:"center",gap:8,margin:"15px auto 8px",background:"#eaf8f0",color:"#0e7540",padding:"9px 13px",borderRadius:999,fontWeight:900,fontSize:13}}>● STATUT : ACTIF</div>
              <h2 style={{fontSize:22,margin:"10px 0 4px",color:"#0b376d"}}>MUNPEN MAPON JULIENNE</h2>
              <div style={{color:"#0c3d78",fontWeight:700,fontSize:15}}>Conseillère agropastorale</div>
              <div style={{marginTop:14,padding:"10px 12px",background:"#f4f8fc",borderRadius:10,fontSize:12,color:"#53657c"}}>Matricule professionnel : <strong style={{color:"#172033"}}>MB013</strong></div>
            </aside>

            <section style={{background:"#fff",border:"1px solid #dbe3ee",borderRadius:22,overflow:"hidden",boxShadow:"0 18px 48px rgba(27,47,75,.12)"}}>
              <div style={{padding:"24px 28px",background:"linear-gradient(120deg,#0a356d,#155a9d)",color:"#fff"}}>
                <div style={{fontSize:13,fontWeight:800,textTransform:"uppercase",letterSpacing:1,color:"#bcffda"}}>✓ Enregistrement professionnel authentique</div>
                <h1 style={{fontSize:28,margin:"6px 0 5px"}}>Carte professionnelle AIAC vérifiée</h1>
                <p style={{margin:0,color:"#dbe9f8"}}>Les informations ci-dessous correspondent au registre public de vérification de l’AIAC.</p>
              </div>
              <div style={{padding:"26px 28px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:"0 22px"}}>
                  {[
                    ["Nom et prénoms","MUNPEN MAPON JULIENNE"],
                    ["Matricule","MB013"],
                    ["Fonction","Conseillère agropastorale"],
                    ["Affectation","Antenne AIAC – Maroua"],
                    ["Date de délivrance","12 mai 2025"],
                    ["Date d’expiration","11 mai 2028"],
                    ["Validité","3 ans"],
                    ["Statut actuel","ACTIF"],
                  ].map(([label,value]) => (
                    <div key={label} style={{padding:"13px 0",borderBottom:"1px solid #edf1f6"}}>
                      <div style={{color:"#67758c",fontSize:12,textTransform:"uppercase",letterSpacing:.6,marginBottom:5}}>{label}</div>
                      <strong style={{fontSize:16,color:label==="Statut actuel"?"#0f8a4b":"#172033"}}>{value}</strong>
                    </div>
                  ))}
                </div>

                <div style={{marginTop:22,padding:17,border:"1px solid #cbe7d6",background:"#f2fbf6",borderRadius:12,lineHeight:1.55}}>
                  <strong style={{color:"#10733e"}}>Confirmation officielle :</strong> le matricule MB013 est enregistré comme actif dans le registre public de vérification AIAC.
                </div>

                <div style={{marginTop:18,padding:"16px 18px",borderLeft:"4px solid #145da0",background:"#f4f8fc",borderRadius:8,color:"#45596f",fontSize:14,lineHeight:1.55}}>
                  <strong>Authenticité du QR code :</strong><br/>
                  Une carte AIAC authentique portant le matricule <b>MB013</b> doit renvoyer vers <b>https://www.aiac-cm.org/personnel/MB013</b>. Si le QR code ouvre un autre domaine, veuillez contacter directement l’AIAC.
                </div>

                <p style={{marginTop:14,fontSize:12,color:"#67758c"}}>Pour protéger les données personnelles, cette fiche n’affiche ni adresse personnelle, ni numéro de pièce d’identité, ni salaire, ni contrat de travail.</p>
              </div>
            </section>
          </div>
        </div>
      </section>

      <footer style={{background:"#071f42",color:"#d7e2f1",padding:"28px 0"}}>
        <div style={{width:"min(1100px,92vw)",margin:"0 auto",fontSize:13,lineHeight:1.7}}>
          <strong style={{color:"#fff"}}>AIAC — Agence d’Intervention et d’Action Communautaire</strong><br/>
          Vérification complémentaire : siege@aiac-cm.org • pca@aiac-cm.org
        </div>
      </footer>
    </main>
  );
}
