"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import profileStyles from "@/components/PortalProfile.module.css";
import type {
  BeneficiaryRow,
  InterventionRow,
  ProjectMemberRow,
  ProjectRow,
  TaskRow,
  WorkflowEvent,
} from "@/components/OperationsPanel";
import type {
  AccountProfile,
  AccountReviewRow,
  AccountScopeRow,
  AccountStatusHistory,
  PermissionOverrideRow,
  PermissionRow,
  PositionAssignmentRow,
  PositionDefinitionRow,
} from "@/components/AccountsPanel";
import type { AnnouncementRow } from "@/components/AnnouncementsPanel";
import type { RequestRow } from "@/components/RequestsPanel";
import type { NotificationRow } from "@/components/NotificationsPanel";
import type {
  ActivityReportRow,
  ActivityRow,
  BodyMembershipRow,
  CaseActionRow,
  CaseFileRow,
  CaseNoteRow,
  GovernanceBodyRow,
  InstitutionalMemberRow,
  PartnerRow,
  PartnershipRow,
  ProgramRow,
  WorkforceAssignmentRow,
} from "@/components/InstitutionalPanel";
import type { ConversationRow, MessageRecipient } from "@/components/MessageCenter";
import type {
  DocumentApprovalRow,
  DocumentFolderRow,
  DocumentGrantRow,
  DocumentVersionRow,
  SecureDocumentRow,
} from "@/components/DocumentVault";
import type {
  AuditLogRow,
  DocumentAccessLogRow,
  SessionActivityRow,
} from "@/components/AuditCenter";
import type {
  GuestbookEntry,
  PublicContentItem,
  PublicContentMedia,
} from "@/lib/public-content";
import type {
  MeetingBodyEntry,
  MeetingDirectoryEntry,
  MeetingGuestRow,
  MeetingParticipantRow,
  MeetingProjectEntry,
  MeetingRow,
} from "@/components/MeetingsPanel";
import type {
  ActivityTaskCountRow,
  ActivityTaskRow,
  TaskReportApprovalRow,
  TaskReportAttendanceRow,
  TaskReportEventRow,
  TaskReportEvidenceRow,
  TaskReportIndicatorRow,
  TaskReportRow,
} from "@/components/FieldReportingPanel";
import type { InstitutionalSignatureAsset } from "@/lib/institutional-signatures";

function ModuleLoading() {
  return (
    <div className="portalPanel" role="status" aria-live="polite">
      <p className="eyebrow">AIAC</p>
      <h2>Ouverture du module…</h2>
      <p>Seul l’écran demandé est chargé.</p>
    </div>
  );
}

const MeetingsPanel = dynamic(() => import("@/components/MeetingsPanel"), { loading: ModuleLoading });
const RequestsPanel = dynamic(() => import("@/components/RequestsPanel"), { loading: ModuleLoading });
const MessageCenter = dynamic(() => import("@/components/MessageCenter"), { loading: ModuleLoading });
const DocumentVault = dynamic(() => import("@/components/DocumentVault"), { loading: ModuleLoading });
const NotificationsPanel = dynamic(() => import("@/components/NotificationsPanel"), { loading: ModuleLoading });
const AnnouncementsPanel = dynamic(() => import("@/components/AnnouncementsPanel"), { loading: ModuleLoading });
const OperationsPanel = dynamic(() => import("@/components/OperationsPanel"), { loading: ModuleLoading });
const InstitutionalPanel = dynamic(() => import("@/components/InstitutionalPanel"), { loading: ModuleLoading });
const PublicContentPanel = dynamic(() => import("@/components/PublicContentPanel"), { loading: ModuleLoading });
const AccountsPanel = dynamic(() => import("@/components/AccountsPanel"), { loading: ModuleLoading });
const SuperAdminDataCenter = dynamic(() => import("@/components/SuperAdminDataCenter"), { loading: ModuleLoading });
const AuditCenter = dynamic(() => import("@/components/AuditCenter"), { loading: ModuleLoading });

type UnreadMessageCountRow = { conversation_id: string; unread_count: number };
type RealtimePayload = { new: unknown };

const portalTabs = new Set([
  "accueil",
  "reunions",
  "annonces",
  "notifications",
  "demandes",
  "messages",
  "documents",
  "operations",
  "institution",
  "contenus",
  "administration",
  "data-control",
  "audit",
  "profil",
]);

const roleLabels: Record<string, string> = {
  member: "Membre",
  beneficiary: "Bénéficiaire",
  volunteer: "Bénévole",
  staff: "Personnel AIAC",
  manager: "Responsable d’organe",
  partner: "Partenaire",
  admin: "Administrateur",
  super_admin: "Super-administrateur",
};

function countLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

function routeFor(tab: string) {
  if (tab === "terrain") return "/espace/terrain";
  if (tab === "accueil") return "/espace";
  return `/espace?tab=${encodeURIComponent(tab)}`;
}

export default function PortalClientV2({
  profile,
  initialRequests,
  initialConversations,
  initialNotifications,
  initialUnreadMessageCounts,
  staffProfiles,
  initialAuditLogs,
  initialProjects,
  initialProjectMembers,
  initialTasks,
  initialDocuments,
  initialBeneficiaries,
  initialRequestEvents,
  initialTaskEvents,
  initialAccountHistory,
  initialAnnouncements,
  initialAnnouncementReadIds,
  initialBodies,
  initialInstitutionalMembers,
  initialBodyMemberships,
  initialWorkforceAssignments,
  initialPrograms,
  initialPartners,
  initialPartnerships,
  initialCaseFiles,
  initialCaseNotes,
  initialCaseActions,
  initialActivities,
  initialActivityReports,
  initialPositionDefinitions,
  initialPositionAssignments,
  initialAccountReviews,
  messageRecipients,
  initialDocumentFolders,
  initialDocumentVersions,
  initialDocumentApprovals,
  initialDocumentGrants,
  initialSessionActivity,
  initialDocumentAccessLogs,
  initialPermissions,
  initialPermissionOverrides,
  initialAccountScopes,
  initialInterventions,
  initialPublicContent,
  initialPublicMedia,
  initialGuestbookEntries,
  manageablePublicBodyIds,
  initialMeetings,
  initialMeetingParticipants,
  initialMeetingGuests,
  meetingRecipients,
  meetingBodies,
  meetingProjects,
  initialActivityTasks,
  initialTaskReports,
  initialInstitutionalSignatureAssets,
}: {
  profile: AccountProfile;
  initialRequests: RequestRow[];
  initialConversations: ConversationRow[];
  initialNotifications: NotificationRow[];
  initialUnreadMessageCounts: UnreadMessageCountRow[];
  staffProfiles: AccountProfile[];
  initialAuditLogs: AuditLogRow[];
  initialProjects: ProjectRow[];
  initialProjectMembers: ProjectMemberRow[];
  initialTasks: TaskRow[];
  initialDocuments: SecureDocumentRow[];
  initialBeneficiaries: BeneficiaryRow[];
  initialRequestEvents: WorkflowEvent[];
  initialTaskEvents: WorkflowEvent[];
  initialAccountHistory: AccountStatusHistory[];
  initialAnnouncements: AnnouncementRow[];
  initialAnnouncementReadIds: string[];
  initialBodies: GovernanceBodyRow[];
  initialInstitutionalMembers: InstitutionalMemberRow[];
  initialBodyMemberships: BodyMembershipRow[];
  initialWorkforceAssignments: WorkforceAssignmentRow[];
  initialPrograms: ProgramRow[];
  initialPartners: PartnerRow[];
  initialPartnerships: PartnershipRow[];
  initialCaseFiles: CaseFileRow[];
  initialCaseNotes: CaseNoteRow[];
  initialCaseActions: CaseActionRow[];
  initialActivities: ActivityRow[];
  initialActivityReports: ActivityReportRow[];
  initialPositionDefinitions: PositionDefinitionRow[];
  initialPositionAssignments: PositionAssignmentRow[];
  initialAccountReviews: AccountReviewRow[];
  messageRecipients: MessageRecipient[];
  initialDocumentFolders: DocumentFolderRow[];
  initialDocumentVersions: DocumentVersionRow[];
  initialDocumentApprovals: DocumentApprovalRow[];
  initialDocumentGrants: DocumentGrantRow[];
  initialSessionActivity: SessionActivityRow[];
  initialDocumentAccessLogs: DocumentAccessLogRow[];
  initialPermissions: PermissionRow[];
  initialPermissionOverrides: PermissionOverrideRow[];
  initialAccountScopes: AccountScopeRow[];
  initialInterventions: InterventionRow[];
  initialPublicContent: PublicContentItem[];
  initialPublicMedia: PublicContentMedia[];
  initialGuestbookEntries: GuestbookEntry[];
  manageablePublicBodyIds: string[];
  initialMeetings: MeetingRow[];
  initialMeetingParticipants: MeetingParticipantRow[];
  initialMeetingGuests: MeetingGuestRow[];
  meetingRecipients: MeetingDirectoryEntry[];
  meetingBodies: MeetingBodyEntry[];
  meetingProjects: MeetingProjectEntry[];
  initialActivityTasks: ActivityTaskRow[];
  initialActivityTaskCounts: ActivityTaskCountRow[];
  initialTaskReports: TaskReportRow[];
  initialTaskReportEvidence: TaskReportEvidenceRow[];
  initialTaskReportAttendance: TaskReportAttendanceRow[];
  initialTaskReportIndicators: TaskReportIndicatorRow[];
  initialTaskReportApprovals: TaskReportApprovalRow[];
  initialTaskReportEvents: TaskReportEventRow[];
  initialInstitutionalSignatureAssets: InstitutionalSignatureAsset[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") || "accueil";
  const tab = portalTabs.has(requestedTab) ? requestedTab : "accueil";

  const [requests, setRequests] = useState(initialRequests);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [conversations, setConversations] = useState(initialConversations);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialUnreadMessageCounts.map((item) => [item.conversation_id, Number(item.unread_count)])),
  );
  const [meetingOverview, setMeetingOverview] = useState(initialMeetings);
  const [meetingInvitationOverview, setMeetingInvitationOverview] = useState(initialMeetingParticipants);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);

  const requestedConversationId = searchParams.get("conversation");
  const requestedMeetingId = searchParams.get("meeting");
  const isStaff = ["staff", "manager", "admin", "super_admin"].includes(profile.role);
  const isAdmin = ["admin", "super_admin"].includes(profile.role);
  const isSuperAdmin = profile.role === "super_admin";

  useEffect(() => setRequests(initialRequests), [initialRequests]);
  useEffect(() => setNotifications(initialNotifications), [initialNotifications]);
  useEffect(() => setConversations(initialConversations), [initialConversations]);
  useEffect(() => {
    setUnreadMessageCounts(
      Object.fromEntries(initialUnreadMessageCounts.map((item) => [item.conversation_id, Number(item.unread_count)])),
    );
  }, [initialUnreadMessageCounts]);
  useEffect(() => setMeetingOverview(initialMeetings), [initialMeetings]);
  useEffect(() => setMeetingInvitationOverview(initialMeetingParticipants), [initialMeetingParticipants]);
  useEffect(() => setAvatarUrl(profile.avatar_url || ""), [profile.avatar_url]);
  useEffect(() => setNavigationTarget(null), [pathname, searchParams]);

  const refreshUnreadMessageCounts = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_unread_message_counts");
    if (!error && data) {
      setUnreadMessageCounts(
        Object.fromEntries(
          (data as UnreadMessageCountRow[]).map((item) => [item.conversation_id, Number(item.unread_count)]),
        ),
      );
    }
  }, [supabase]);

  const refreshMeetingOverview = useCallback(async () => {
    const [{ data: meetingRows }, { data: participantRows }] = await Promise.all([
      supabase.from("meetings").select("*").order("starts_at"),
      supabase.from("meeting_participants").select("*").order("invited_at"),
    ]);
    if (meetingRows) setMeetingOverview(meetingRows as MeetingRow[]);
    if (participantRows) setMeetingInvitationOverview(participantRows as MeetingParticipantRow[]);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`portal-shell:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (payload: RealtimePayload) => {
          const incoming = payload.new as NotificationRow;
          setNotifications((items) => [incoming, ...items.filter((item) => item.id !== incoming.id)]);
          setNotice(`Nouvelle notification : ${incoming.title}`);
          if (["message", "message_access", "message_admin"].includes(incoming.category || "")) {
            void refreshUnreadMessageCounts();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (payload: RealtimePayload) => {
          const incoming = payload.new as NotificationRow;
          setNotifications((items) => items.map((item) => (item.id === incoming.id ? incoming : item)));
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void refreshUnreadMessageCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `user_id=eq.${profile.id}` }, () => {
        void refreshUnreadMessageCounts();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings" },
        () => void refreshMeetingOverview(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_participants" },
        () => void refreshMeetingOverview(),
      )
      .subscribe((status: string) => setRealtimeConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile.id, refreshMeetingOverview, refreshUnreadMessageCounts, supabase]);

  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  const unreadMessages = Object.values(unreadMessageCounts).reduce((total, count) => total + count, 0);
  const unreadAnnouncements = initialAnnouncements.filter(
    (item) => item.status === "published" && !initialAnnouncementReadIds.includes(item.id),
  ).length;
  const pendingMeetingInvitations = meetingInvitationOverview.filter(
    (item) => item.user_id === profile.id && item.response_status === "pending",
  ).length;
  const upcomingMeetings = meetingOverview.filter(
    (item) => new Date(item.ends_at).getTime() >= Date.now() && !["cancelled", "archived"].includes(item.status),
  ).length;

  useEffect(() => {
    document.title =
      unreadNotifications + unreadMessages > 0
        ? `(${unreadNotifications + unreadMessages}) Portail AIAC`
        : "Portail AIAC";
  }, [unreadMessages, unreadNotifications]);

  function navigate(nextTab: string) {
    if (nextTab === tab && nextTab !== "terrain") return;
    const route = routeFor(nextTab);
    setNavigationTarget(nextTab);
    router.push(route);
  }

  function prefetch(nextTab: string) {
    if (nextTab !== tab) router.prefetch(routeFor(nextTab));
  }

  function mergeConversation(incoming: ConversationRow) {
    setConversations((items) =>
      items.some((item) => item.id === incoming.id)
        ? items.map((item) => (item.id === incoming.id ? incoming : item))
        : [incoming, ...items],
    );
  }

  function openNotification(href: string) {
    if (href.startsWith("/")) router.push(href);
    else window.location.assign(href);
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: data.get("full_name"),
        phone: data.get("phone"),
        organization: data.get("organization"),
      })
      .eq("id", profile.id);
    setNotice(error ? error.message : "Profil mis à jour.");
  }

  async function uploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAvatarBusy(true);
    const form = event.currentTarget;
    const file = new FormData(form).get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      setNotice("Sélectionnez une photo.");
      setAvatarBusy(false);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice("La photo dépasse la limite de 5 Mo.");
      setAvatarBusy(false);
      return;
    }
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensions[file.type];
    if (!extension) {
      setNotice("Formats autorisés : JPG, PNG ou WebP.");
      setAvatarBusy(false);
      return;
    }
    const objectPath = `${profile.id}/profile.${extension}`;
    const uploaded = await supabase.storage.from("aiac-avatars").upload(objectPath, file, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });
    if (uploaded.error) {
      setNotice(uploaded.error.message);
      setAvatarBusy(false);
      return;
    }
    const publicUrl = supabase.storage.from("aiac-avatars").getPublicUrl(objectPath).data.publicUrl;
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;
    const { error } = await supabase.from("profiles").update({ avatar_url: versionedUrl }).eq("id", profile.id);
    if (error) setNotice(error.message);
    else {
      setAvatarUrl(versionedUrl);
      form.reset();
      setNotice("Photo de profil mise à jour.");
    }
    setAvatarBusy(false);
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    const { data } = await supabase.storage.from("aiac-avatars").list(profile.id);
    const paths = (data || []).map((item: { name: string }) => `${profile.id}/${item.name}`);
    if (paths.length) await supabase.storage.from("aiac-avatars").remove(paths);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
    if (error) setNotice(error.message);
    else {
      setAvatarUrl("");
      setNotice("Photo de profil supprimée.");
    }
    setAvatarBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  const navItems: Array<[string, string]> = [
    ["accueil", "Tableau de bord"],
    ["reunions", "Réunions et agenda"],
    ["demandes", "Mes demandes"],
    ["messages", "Messagerie"],
    ["notifications", "Notifications"],
    ["annonces", "Annonces"],
    ["profil", "Mon profil"],
    ["terrain", "Cycle des programmes"],
    ...(isStaff
      ? [
          ["operations", "Demandes et interventions"] as [string, string],
          ["institution", "Gouvernance et membres"] as [string, string],
          ["documents", "Documents sécurisés"] as [string, string],
          ["contenus", "Publications du site"] as [string, string],
        ]
      : []),
    ...(isAdmin ? [["administration", "Comptes et accès"] as [string, string]] : []),
    ...(isSuperAdmin
      ? [
          ["data-control", "Contrôle des données"] as [string, string],
          ["audit", "Journal d’audit"] as [string, string],
        ]
      : []),
  ];

  const navCounts: Record<string, number> = {
    reunions: pendingMeetingInvitations,
    messages: unreadMessages,
    notifications: unreadNotifications,
    annonces: unreadAnnouncements,
  };

  return (
    <div className="portalShell">
      <aside className="portalSidebar">
        <a href="/nouveau-site/index.html" className="portalBrand">
          <img src="/aiac-logo.bmp" alt="AIAC" />
          <span><b>AIAC</b><small>Site public</small></span>
        </a>
        <div className="portalIdentity">
          {avatarUrl ? (
            <img className={profileStyles.sidebarAvatar} src={avatarUrl} alt={`Photo de ${profile.full_name || "profil"}`} />
          ) : (
            <span aria-hidden="true">{(profile.full_name || profile.email || "A").charAt(0).toUpperCase()}</span>
          )}
          <div>
            <b>{profile.full_name || "Membre AIAC"}</b>
            <small>{roleLabels[profile.role] || profile.role}</small>
          </div>
        </div>
        <nav>
          {navItems.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "active" : navigationTarget === id ? "loading" : ""}
              onClick={() => navigate(id)}
              onPointerEnter={() => prefetch(id)}
              disabled={navigationTarget === id}
            >
              <span>{navigationTarget === id ? `${label}…` : label}</span>
              {navCounts[id] > 0 && <i className="navBadge">{countLabel(navCounts[id])}</i>}
            </button>
          ))}
        </nav>
        <a className="publicSiteLink" href="/nouveau-site/index.html">Voir le site public</a>
        <button className="logout" onClick={logout}>Se déconnecter</button>
      </aside>

      <main className="portalMain">
        <header>
          <div>
            <p className="eyebrow">{roleLabels[profile.role] || profile.role}</p>
            <h1>Bonjour, {profile.full_name || "membre AIAC"}</h1>
          </div>
          <div className="portalHeaderStatus">
            <span className={`realtimeStatus ${realtimeConnected ? "connected" : "connecting"}`}>
              {realtimeConnected ? "● Synchronisation en direct" : "● Connexion…"}
            </span>
            <span className={`status ${profile.status}`}>{profile.status === "active" ? "Compte actif" : profile.status}</span>
          </div>
        </header>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {tab === "accueil" && (
          <section>
            <div className="statGrid">
              <article><b>{requests.length}</b><span>Demandes</span></article>
              <article><b>{conversations.length}</b><span>Conversations</span></article>
              <article><b>{upcomingMeetings}</b><span>Réunions à venir</span></article>
              <article><b>{unreadNotifications}</b><span>Notifications non lues</span></article>
              <article><b>{unreadMessages}</b><span>Messages non lus</span></article>
              <article><b>{unreadAnnouncements}</b><span>Annonces à lire</span></article>
            </div>
            <div className="portalPanel">
              <h2>Bienvenue dans votre espace AIAC</h2>
              <p>Chaque rubrique est désormais chargée séparément. Le portail n’embarque plus les gros modules de gouvernance, reporting, opérations et administration au démarrage.</p>
            </div>
          </section>
        )}

        {tab === "reunions" && <MeetingsPanel profile={profile} initialMeetings={meetingOverview} initialParticipants={meetingInvitationOverview} initialGuests={initialMeetingGuests} recipients={meetingRecipients} bodies={meetingBodies} projects={meetingProjects} initialSelectedId={requestedMeetingId} />}
        {tab === "demandes" && <RequestsPanel profileId={profile.id} requests={requests} setRequests={setRequests} initialEvents={initialRequestEvents} />}
        {tab === "messages" && <MessageCenter profile={profile} initialConversations={conversations} initialActiveId={requestedConversationId} unreadCounts={unreadMessageCounts} onConversationRead={refreshUnreadMessageCounts} onConversationChange={mergeConversation} recipients={messageRecipients} bodies={initialBodies} />}
        {tab === "notifications" && <NotificationsPanel notifications={notifications} setNotifications={setNotifications} onOpen={openNotification} />}
        {tab === "annonces" && <AnnouncementsPanel profileId={profile.id} isAdmin={isAdmin} initialAnnouncements={initialAnnouncements} initialReadIds={initialAnnouncementReadIds} />}

        {tab === "profil" && (
          <section className="portalPanel">
            <h2>Mon profil</h2>
            <div className={profileStyles.profileGrid}>
              <div className={profileStyles.avatarCard}>
                {avatarUrl ? <img className={profileStyles.avatarPreview} src={avatarUrl} alt={`Photo de ${profile.full_name || "profil"}`} /> : <div className={profileStyles.avatarFallback}>{(profile.full_name || profile.email || "A").charAt(0).toUpperCase()}</div>}
                <div>
                  <h3>Photo de profil</h3>
                  <p>JPG, PNG ou WebP, 5 Mo maximum.</p>
                  <form className={profileStyles.avatarForm} onSubmit={uploadAvatar}>
                    <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required />
                    <button disabled={avatarBusy}>{avatarBusy ? "Envoi…" : "Choisir et enregistrer"}</button>
                  </form>
                  {avatarUrl && <button className={profileStyles.removeButton} type="button" onClick={removeAvatar} disabled={avatarBusy}>Supprimer la photo</button>}
                </div>
              </div>
              <form className="inlineForm" onSubmit={updateProfile}>
                <label>Nom complet<input name="full_name" defaultValue={profile.full_name || ""} required /></label>
                <label>E-mail<input value={profile.email || ""} disabled /></label>
                <label>Téléphone<input name="phone" defaultValue={profile.phone || ""} /></label>
                <label>Organisation<input name="organization" defaultValue={profile.organization || ""} /></label>
                <button>Enregistrer</button>
              </form>
            </div>
          </section>
        )}

        {tab === "operations" && isStaff && <OperationsPanel profile={profile} initialProjects={initialProjects} initialPrograms={initialPrograms} initialActivities={initialActivities} initialMembers={initialProjectMembers} initialTasks={initialTasks} initialDocuments={initialDocuments} initialBeneficiaries={initialBeneficiaries} initialRequests={requests} initialRequestEvents={initialRequestEvents} initialTaskEvents={initialTaskEvents} initialInterventions={initialInterventions} staffProfiles={staffProfiles} bodies={initialBodies} />}
        {tab === "institution" && isStaff && <InstitutionalPanel profile={profile} staffProfiles={staffProfiles} projects={initialProjects} projectMembers={initialProjectMembers} beneficiaries={initialBeneficiaries} initialBodies={initialBodies} initialInstitutionalMembers={initialInstitutionalMembers} initialBodyMemberships={initialBodyMemberships} initialWorkforceAssignments={initialWorkforceAssignments} initialPrograms={initialPrograms} initialPartners={initialPartners} initialPartnerships={initialPartnerships} initialCaseFiles={initialCaseFiles} initialCaseNotes={initialCaseNotes} initialCaseActions={initialCaseActions} initialActivities={initialActivities} initialActivityReports={initialActivityReports} />}
        {tab === "documents" && isStaff && <DocumentVault profile={profile} staffProfiles={staffProfiles} initialDocuments={initialDocuments} initialFolders={initialDocumentFolders} initialVersions={initialDocumentVersions} initialApprovals={initialDocumentApprovals} initialGrants={initialDocumentGrants} bodies={initialBodies} projects={initialProjects} beneficiaries={initialBeneficiaries} cases={initialCaseFiles} partners={initialPartners} activities={initialActivities} members={initialInstitutionalMembers} />}
        {tab === "contenus" && isStaff && <PublicContentPanel profileId={profile.id} bodies={initialBodies.filter((body) => manageablePublicBodyIds.includes(body.id))} initialItems={initialPublicContent} initialMedia={initialPublicMedia} initialGuestbook={initialGuestbookEntries} projects={initialProjects} programs={initialPrograms} partnerships={initialPartnerships} />}
        {tab === "administration" && isAdmin && <AccountsPanel currentProfile={profile} initialProfiles={staffProfiles} initialHistory={initialAccountHistory} initialBodies={initialBodies} initialPositions={initialPositionDefinitions} initialPositionAssignments={initialPositionAssignments} initialReviews={initialAccountReviews} initialPermissions={initialPermissions} initialPermissionOverrides={initialPermissionOverrides} initialAccountScopes={initialAccountScopes} initialSessions={initialSessionActivity} initialSignatureAssets={initialInstitutionalSignatureAssets} />}
        {tab === "data-control" && isSuperAdmin && <SuperAdminDataCenter programs={initialPrograms} projects={initialProjects} activities={initialActivities} tasks={initialActivityTasks} reports={initialTaskReports} publications={initialPublicContent} documents={initialDocuments} bodies={initialBodies} members={initialInstitutionalMembers} workforce={initialWorkforceAssignments} partners={initialPartners} />}
        {tab === "audit" && isSuperAdmin && <AuditCenter logs={initialAuditLogs} sessions={initialSessionActivity} documentAccess={initialDocumentAccessLogs} profiles={staffProfiles} documents={initialDocuments} />}
      </main>
    </div>
  );
}
