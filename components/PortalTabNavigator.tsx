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

const localTabs = new Set(["accueil", "notifications", "annonces", "profil"]);

function routeFor(tab: string) {
  if (tab === "terrain") return "/espace/terrain";
  if (tab === "accueil") return "/espace";
  return `/espace?tab=${encodeURIComponent(tab)}`;
}

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

    const identify = (event: Event) => {
      const target = event.target as Element | null;
      const button = target?.closest(".portalSidebar nav button");
      if (!(button instanceof HTMLButtonElement)) return null;
      const label = button.querySelector("span")?.textContent?.trim() || "";
      const tab = labelToTab[label];
      return tab ? { button, tab } : null;
    };

    const onPointerOver = (event: PointerEvent) => {
      const match = identify(event);
      if (!match || localTabs.has(match.tab) || match.tab === activeTab) return;
      router.prefetch(routeFor(match.tab));
    };

    const onClick = (event: MouseEvent) => {
      const match = identify(event);
      if (!match) return;
      const { tab } = match;

      if (localTabs.has(tab)) {
        // Laisser le onClick React modifier immédiatement l’écran, puis synchroniser l’URL sans trajet serveur.
        window.history.replaceState({}, "", routeFor(tab));
        return;
      }

      if (tab === activeTab) return;

      // IMPORTANT : ne jamais stopper la propagation ici.
      // Le bouton React doit d’abord exécuter setTab(tab), sinon l’URL change alors que l’écran reste figé.
      event.preventDefault();
      queueMicrotask(() => {
        router.push(routeFor(tab));
      });
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [activeTab, router]);

  return null;
}
