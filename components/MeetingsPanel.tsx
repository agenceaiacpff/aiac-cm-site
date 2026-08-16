"use client";

import dynamic from "next/dynamic";

const MeetingsPanel = dynamic(() => import("./MeetingsPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement des réunions…</p></div>,
});

export default MeetingsPanel;
export type {
  MeetingRow,
  MeetingParticipantRow,
  MeetingGuestRow,
  MeetingDirectoryEntry,
  MeetingBodyEntry,
  MeetingProjectEntry,
} from "./MeetingsPanelHeavy";
