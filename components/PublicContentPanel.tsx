"use client";

import dynamic from "next/dynamic";

const PublicContentPanel = dynamic(() => import("./PublicContentPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement des publications…</p></div>,
});

export default PublicContentPanel;
