"use client";

import dynamic from "next/dynamic";

const MessageCenter = dynamic(() => import("./MessageCenterV2"), {
  loading: () => <div className="portalPanel"><p>Chargement de la messagerie sécurisée…</p></div>,
});

export default MessageCenter;
export type { ConversationRow, MessageRecipient } from "./MessageCenterV2";
