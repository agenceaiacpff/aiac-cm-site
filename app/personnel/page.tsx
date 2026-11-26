import Link from "next/link";
import { JULIENNE_PHOTO } from "./julienne-photo";

export const metadata = {
  title: "Vérification du personnel AIAC",
  description: "Portail officiel de vérification des cartes professionnelles du personnel AIAC.",
};

const staff = [
  {
    matricule: "MB013",
    nom: "MUNPEN MAPON JULIENNE",
    fonction: "Conseillère agropastorale",
    affectation: "Antenne AIAC – Maroua",
    expiration: "11 mai 2028",
    statut: "ACTIF",
  },
];

export default function PersonnelPage() {
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
          <div style={{display:"flex",alignItems:"center",gap:15}}>
            <img src="/aiac-logo.bmp" alt="Logo AIAC" style={{width:88,height:60,objectFit:"contain"}}/>
            <div>
              <h1 style={{margin:0,color:"#0c3d78",fontSize:21}}>Vérification du personnel AIAC</h1>
              <div style={{color:"#67758c",fontSize:12}}>Authentification des cartes professionnelles</div>
            </div>
          </div>
          <span style={{border:"1px solid #c9d7ea",borderRadius:999,padding:"8px 12px",color:"#0c3d78",fontWeight:700,fontSize:12}}>✓ SERVICE OFFICIEL AIAC</span>
        </div>
      </header>

      <section style={{background:"linear-gradient(135deg,#fff,#edf4fb)",padding:"56px 0 42px"}}>
        <div style={{width:"min(1160px,92vw)",margin:"0 auto"}}>
          <div style={{color:"#e1262f",fontWeight:800,fontSize:13,letterSpacing:1,textTransform:"uppercase"}}>Sécurité • Authenticité • Traçabilité</div>
          <h2 style={{fontSize:"clamp(34px,5vw,52px)",lineHeight:1.05,color:"#092f63",margin:"10px 0 14px"}}>Vérifiez une carte professionnelle AIAC</h2>
          <p style={{maxWidth:850,fontSize:18,lineHeight:1.65,color:"#53657c"}}>
            Cette page permet de confirmer qu’une personne détient une carte professionnelle délivrée par l’AIAC et de consulter uniquement les informations professionnelles nécessaires à sa vérification.
          </p>
        </div>
      </section>

      <section style={{padding:"44px 0 70px"}}>
        <div style={{width:"min(1160px,92vw)",margin:"0 auto"}}>
          <h2 style={{color:"#0c3d78",fontSize:30,margin:"0 0 8px"}}>Personnel actuellement vérifiable</h2>
          <p style={{color:"#67758c",marginBottom:24}}>L’annuaire sera complété progressivement avec les autres agents disposant d’une carte professionnelle active.</p>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,360px))",gap:20}}>
            {staff.map((p) => (
              <article key={p.matricule} style={{background:"#fff",border:"1px solid #dbe3ee",borderRadius:18,overflow:"hidden",boxShadow:"0 10px 30px rgba(25,45,70,.08)"}}>
                <div style={{height:78,background:"linear-gradient(120deg,#0c3d78,#145da0)"}} />
                <div style={{padding:"22px"}}>
                  <img src={JULIENNE_PHOTO} alt="MUNPEN MAPON JULIENNE" style={{width:74,height:74,borderRadius:"50%",objectFit:"cover",objectPosition:"center 35%",marginTop:-58,border:"5px solid #fff",boxShadow:"0 4px 14px rgba(0,0,0,.16)"}}/>
                  <h3 style={{margin:"12px 0 5px",fontSize:19}}>{p.nom}</h3>
                  <div style={{color:"#0c3d78",fontWeight:700,fontSize:14}}>{p.fonction}</div>
                  <div style={{color:"#67758c",fontSize:13,marginTop:8}}>Matricule : {p.matricule}<br/>{p.affectation}</div>
                  <div style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:12,padding:"7px 10px",borderRadius:999,background:"#eaf8f0",color:"#11703f",fontWeight:800,fontSize:12}}>● Personnel actif</div>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginTop:16}}>
                    <span style={{color:"#67758c",fontSize:12}}>Valide jusqu’au {p.expiration}</span>
                    <Link href={"/personnel/"+p.matricule} style={{fontWeight:800,color:"#0c3d78",fontSize:14}}>Vérifier →</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer style={{background:"#071f42",color:"#d7e2f1",padding:"28px 0"}}>
        <div style={{width:"min(1160px,92vw)",margin:"0 auto",fontSize:13,lineHeight:1.7}}>
          <strong style={{color:"#fff"}}>AIAC — Agence d’Intervention et d’Action Communautaire</strong><br/>
          Vérification complémentaire : siege@aiac-cm.org • pca@aiac-cm.org<br/>
          Cette page ne publie aucune donnée personnelle sensible, salariale ou contractuelle.
        </div>
      </footer>
    </main>
  );
}
