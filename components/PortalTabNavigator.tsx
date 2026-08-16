"use client";

import { useEffect } from "react";

const labelToTab: Record<string, string> = {
  "Tableau de bord": "accueil",
  "Réunions et agenda": "reunions",
  "Mes demandes": "demandes",
  Messagerie: "messages",
  Notifications: "notifications",
  Annonces: "annonces",
  "Mon profil": "profil",
  "Cycle des programmes": "terrain",
  "Gestion opérationnelle": "operations",
  "Gestion institutionnelle": "institution",
  "Documents sécurisés": "documents",
  "Publications du site": "contenus",
  "Comptes et accès": "administration",
  "Contrôle des données": "data-control",
  "Journal d’audit": "audit",
};

export default function PortalTabNavigator({ activeTab }: { activeTab: string }) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest(".portalSidebar nav button");
      if (!(button instanceof HTMLButtonElement)) return;
      const label = button.querySelector("span")?.textContent?.trim() || "";
      const tab = labelToTab[label];
      if (!tab || tab === activeTab) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(`/espace?tab=${encodeURIComponent(tab)}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [activeTab]);

  return null;
}
