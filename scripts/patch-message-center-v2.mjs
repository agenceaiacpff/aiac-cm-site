import fs from 'node:fs';

const path='components/MessageCenterV2.tsx';
let source=fs.readFileSync(path,'utf8');

const functionAnchor=' async function updateSettings(event:FormEvent<HTMLFormElement>)';
if(!source.includes(functionAnchor)) throw new Error('Function anchor not found');
if(!source.includes('async function markUnread(){')){
  const functions=` async function markUnread(){if(!active)return;setBusy(true);const {data,error}=await supabase.rpc("mark_conversation_unread",{target_conversation:active.id});if(error)setNotice(error.message);else if(data){onConversationRead();setNotice("Conversation marquée comme non lue.");}else setNotice("Aucun message reçu à marquer comme non lu.");setBusy(false);}\n async function leaveCurrentConversation(){if(!active||!myMembership||active.created_by===profile.id)return;if(!window.confirm("Quitter cette conversation ? Vous n’y aurez plus accès tant qu’un responsable ne vous réinvite pas."))return;setBusy(true);const leavingId=active.id;const nextId=conversations.find(x=>x.id!==leavingId)?.id||null;const {error}=await supabase.rpc("leave_conversation",{p_conversation_id:leavingId});if(error)setNotice(error.message);else{setConversations(current=>current.filter(x=>x.id!==leavingId));setActiveId(nextId);onConversationRead();setNotice("Vous avez quitté la conversation.");}setBusy(false);}\n`;
  source=source.replace(functionAnchor,functions+functionAnchor);
}

const headerAnchor='<div className={styles.headingActions}>{canManage&&<button className={styles.ghost} onClick={toggleArchive} disabled={busy}>{active.status==="archived"?"Rouvrir":"Archiver"}</button>}'
if(!source.includes(headerAnchor)) throw new Error('Header action anchor not found');
if(!source.includes('>Marquer non lu</button>')){
  source=source.replace(
    headerAnchor,
    '<div className={styles.headingActions}><button className={styles.ghost} onClick={()=>void markUnread()} disabled={busy}>Marquer non lu</button>{myMembership&&profile.id!==active.created_by&&<button className={styles.ghost} onClick={()=>void leaveCurrentConversation()} disabled={busy}>Quitter</button>}{canManage&&<button className={styles.ghost} onClick={toggleArchive} disabled={busy}>{active.status==="archived"?"Rouvrir":"Archiver"}</button>}'
  );
}

fs.writeFileSync(path,source);
