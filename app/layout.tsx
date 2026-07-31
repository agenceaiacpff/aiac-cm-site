import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "AIAC Cameroun", template: "%s | AIAC" },
  description: "Portail public et espace sécurisé de l'Agence d'Intervention et d'Action Communautaire."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
