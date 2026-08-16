"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
  "Demandes et interventions": "operations",
  "Gestion institutionnelle": "institution",
  "Gouvernance et membres": "institution",
  "Documents sécurisés": "documents",
  "Publications du site": "contenus",
  "Comptes et accès": "administration",
  "Contrôle des données": "data-control",
  "Journal d’audit": "audit",
};

export default function PortalTabNavigator({ activeTab }: { activeTab: string }) {
  const router = useRouter();

  useEffect(() => {
    if (activeTab === "terrain" && window.location.pathname === "/espace") {
      router.replace("/espace/terrain");
      return;
    }

    for (const button of Array.from(document.querySelectorAll(".portalSidebar nav button"))) {
      const span = button.querySelector("span");
      if (!span) continue;
      const label = span.textContent?.trim();
      if (label === "Gestion opérationnelle") span.textContent = "Demandes et interventions";
      if (label === "Gestion institutionnelle") span.textContent = "Gouvernance et membres";
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest(".portalSidebar nav button");
      if (!(button instanceof HTMLButtonElement)) return;
      const label = button.querySelector("span")?.textContent?.trim() || "";
      const tab = labelToTab[label];
      if (!tab || tab === activeTab) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(tab === "terrain" ? "/espace/terrain" : `/espace?tab=${encodeURIComponent(tab)}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [activeTab, router]);

  return null;
}
