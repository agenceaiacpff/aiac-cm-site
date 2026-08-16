"use client";

import dynamic from "next/dynamic";

const MessageCenter = dynamic(() => import("./MessageCenterHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement de la messagerie…</p></div>,
});

export default MessageCenter;
export type { ConversationRow, MessageRecipient } from "./MessageCenterHeavy";
