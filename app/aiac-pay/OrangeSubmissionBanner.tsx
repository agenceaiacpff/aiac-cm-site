export default function OrangeSubmissionBanner() {
  return (
    <div style={{
      maxWidth: 1160,
      margin: "18px auto 0",
      padding: "0 20px",
      boxSizing: "border-box"
    }}>
      <div style={{
        background: "#fff4e8",
        border: "1px solid #ffc98f",
        borderRadius: 16,
        padding: "14px 16px",
        color: "#7a4300",
        fontFamily: "Arial, Helvetica, sans-serif",
        lineHeight: 1.5
      }}>
        <strong>Orange Money Cameroun — demande soumise ✓</strong><br />
        Le formulaire Orange Money Web Payment de l’AIAC a été soumis. Retour de l’équipe commerciale Orange attendu avant activation des paiements réels et remise des identifiants API marchands.
      </div>
    </div>
  );
}
