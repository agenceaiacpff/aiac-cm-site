"use client";

import dynamic from "next/dynamic";

const SuperAdminDataCenter = dynamic(() => import("./SuperAdminDataCenterHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement du contrôle des données…</p></div>,
});

export default SuperAdminDataCenter;
