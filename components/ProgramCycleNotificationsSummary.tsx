"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./ProgramCycleNotificationsSummary.module.css";

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  href: string | null;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

const cycleEntities = new Set(["task_report", "activity_task", "activity", "project", "program"]);
function isCycle(item: NotificationRow) {
  return cycleEntities.has(item.entity_type || "") || item.category === "program_cycle" || item.category.startsWith("task_report");
}

export default function ProgramCycleNotificationsSummary({ profileId }: { profileId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,user_id,title,body,href,category,entity_type,entity_id,read_at,created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      setLoading(false);
      if (error) { setNotice(error.message); return; }
      setItems(((data || []) as NotificationRow[]).filter(isCycle));
    })();

    const channel = supabase
      .channel(`program-cycle-notifications:${profileId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profileId}` }, (payload) => {
        const incoming = payload.new as NotificationRow;
        if (isCycle(incoming)) setItems((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profileId}` }, (payload) => {
        const incoming = payload.new as NotificationRow;
        if (isCycle(incoming)) setItems((current) => current.map((item) => item.id === incoming.id ? incoming : item));
      })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [profileId, supabase]);

  const unread = items.filter((item) => !item.read_at).length;

  async function open(item: NotificationRow) {
    if (!item.read_at) {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", profileId);
      if (!error) setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }
    if (item.href?.startsWith("/")) router.push(item.href);
  }

  async function markAllRead() {
    const ids = items.filter((item) => !item.read_at).map((item) => item.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("user_id", profileId).in("id", ids);
    if (error) { setNotice(error.message); return; }
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, read_at: now } : item));
  }

  if (loading) return <section className={styles.panel}><p>Chargement des notifications du cycle…</p></section>;
  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>Suivi en direct</p><h2>Notifications du cycle</h2><p>Affectations, rapports, retours et validations liés au Cycle des programmes.</p></div>
        <div className={styles.actions}><span>{unread} non lue(s)</span>{unread > 0 && <button type="button" onClick={() => void markAllRead()}>Tout marquer comme lu</button>}</div>
      </div>
      {notice && <div className={styles.notice}>{notice}</div>}
      {items.length === 0 ? <p className={styles.empty}>Aucune notification du cycle pour le moment.</p> : (
        <div className={styles.list}>{items.slice(0, 8).map((item) => (
          <button type="button" key={item.id} className={`${styles.item} ${!item.read_at ? styles.unread : ""}`} onClick={() => void open(item)} disabled={!item.href}>
            <span><b>{item.title}</b><small>{item.body}</small></span><time>{new Date(item.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
          </button>
        ))}</div>
      )}
      {items.length > 8 && <button type="button" className={styles.more} onClick={() => router.push("/espace?tab=notifications")}>Voir toutes les notifications</button>}
    </section>
  );
}
