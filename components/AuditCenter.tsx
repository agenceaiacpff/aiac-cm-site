"use client";

import dynamic from "next/dynamic";

const AuditCenter = dynamic(() => import("./AuditCenterHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement du journal d’audit…</p></div>,
});

export default AuditCenter;
export type { AuditLogRow, SessionActivityRow, DocumentAccessLogRow } from "./AuditCenterHeavy";
