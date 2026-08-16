"use client";

import dynamic from "next/dynamic";

// Messagerie V2 auditée : contrôles complets, recherche, notifications, droits, synchronisation temps réel et administration MFA.
const MessageCenter = dynamic(() => import("./MessageCenterV2"), {
  loading: () => <div className="portalPanel"><p>Chargement de la messagerie sécurisée…</p></div>,
});

export default MessageCenter;
export type { ConversationRow, MessageRecipient } from "./MessageCenterV2";
