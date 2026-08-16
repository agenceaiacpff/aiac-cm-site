"use client";

import dynamic from "next/dynamic";

const DocumentVault = dynamic(() => import("./DocumentVaultHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement des documents sécurisés…</p></div>,
});

export default DocumentVault;
export type {
  SecureDocumentRow,
  DocumentFolderRow,
  DocumentVersionRow,
  DocumentApprovalRow,
  DocumentGrantRow,
} from "./DocumentVaultHeavy";
