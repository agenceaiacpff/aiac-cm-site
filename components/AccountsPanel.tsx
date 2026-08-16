"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";
import type { GovernanceBodyRow } from "@/components/InstitutionalPanel";
import type { SessionActivityRow } from "@/components/AuditCenter";
import {
  institutionalAssetLabels,
  type InstitutionalSignatureAsset,
} from "@/lib/institutional-signatures";

export type AccountProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  phone: string | null;
  organization: string | null;
  avatar_url: string | null;
  registration_state: string;
  validated_at: string | null;
  validated_by: string | null;
  rejection_reason: string | null;
  must_reset_password: boolean;
  email_verified_at: string | null;
};

export type PositionDefinitionRow={id:string;code:string;title:string;institutional_level:string;body_id:string|null;authority_scope:string|null;status:string};
export type PositionAssignmentRow={id:string;position_id:string;body_id:string;profile_id:string|null;member_id:string|null;territory:string|null;decision_reference:string;start_date:string;end_date:string|null;status:string;appointed_by:string};
export type AccountReviewRow={id:string;profile_id:string;reviewer_id:string;decision:string;reason:string;body_id:string|null;position_assignment_id:string|null;created_at:string};
export type PermissionRow={code:string;domain:string;name:string;description:string;sensitive:boolean};
export type PermissionOverrideRow={id:string;profile_id:string;permission_code:string;effect:string;scope_type:string;body_id:string|null;project_id:string|null;scope_value:string|null;reason:string;starts_at:string;expires_at:string|null;granted_by:string;created_at:string};
export type AccountScopeRow={id:string;profile_id:string;scope_type:string;body_id:string|null;project_id:string|null;territory:string|null;permission_level:string;decision_reference:string;starts_on:string;ends_on:string|null;status:string;created_by:string;created_at:string;updated_at:string};

export type AccountStatusHistory = {
  id: string;
  profile_id: string;
  actor_id: string | null;
  old_status: string;
  new_status: string;
  reason: string;
  created_at: string;
};

export const roleLabels: Record<string, string> = {
  member: "Membre",
  beneficiary: "Bénéficiaire",
  volunteer: "Bénévole",
  staff: "Personnel AIAC",
  manager: "Responsable d’organe",
  partner: "Partenaire",
  admin: "Administrateur",
  super_admin: "Super-administrateur",
};

const statusLabels: Record<string, string> = { pending: "En attente", active: "Actif", suspended: "Suspendu" };

export default function AccountsPanel({
  currentProfile,
  initialProfiles,
  initialHistory,
  initialBodies,
  initialPositions,
  initialPositionAssignments,
  initialReviews,
  initialPermissions,
  initialPermissionOverrides,
  initialAccountScopes,
  initialSessions,
  initialSignatureAssets,
}: {
  currentProfile: AccountProfile;
  initialProfiles: AccountProfile[];
  initialHistory: AccountStatusHistory[];
  initialBodies: GovernanceBodyRow[];
  initialPositions: PositionDefinitionRow[];
  initialPositionAssignments: PositionAssignmentRow[];
  initialReviews: AccountReviewRow[];
  initialPermissions: PermissionRow[];
  initialPermissionOverrides: PermissionOverrideRow[];
  initialAccountScopes: AccountScopeRow[];
  initialSessions: SessionActivityRow[];
  initialSignatureAssets: InstitutionalSignatureAsset[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [history, setHistory] = useState(initialHistory);
  const [assignments,setAssignments]=useState(initialPositionAssignments);
  const [reviews,setReviews]=useState(initialReviews);
  const [permissionOverrides,setPermissionOverrides]=useState(initialPermissionOverrides);
  const [accountScopes,setAccountScopes]=useState(initialAccountScopes);
  const [sessions,setSessions]=useState(initialSessions);
  const [signatureAssets,setSignatureAssets]=useState(initialSignatureAssets);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = currentProfile.role === "super_admin";

  const filtered = profiles.filter((item) => {
    const haystack = `${item.full_name || ""} ${item.email || ""} ${item.organization || ""} ${roleLabels[item.role] || item.role}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === "all" || item.status === status);
  });
  const paged = paginate(filtered, page);

  async function setRole(id: string, role: string) {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) setNotice(error.message);
    else {
      setProfiles((items) => items.map((item) => item.id === id ? { ...item, role } : item));
      setNotice("Fonction mise à jour et enregistrée dans le journal d’audit.");
    }
    setBusy(false);
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>, account: AccountProfile) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const newStatus = String(data.get("status"));
    const reason = String(data.get("reason") || "").trim();
    const { error } = await supabase.rpc("change_account_status", { target_id: account.id, new_status: newStatus, reason });
    if (error) {
      setNotice(error.message);
    } else {
      const created: AccountStatusHistory = {
        id: crypto.randomUUID(), profile_id: account.id, actor_id: currentProfile.id,
        old_status: account.status, new_status: newStatus, reason, created_at: new Date().toISOString(),
      };
      setProfiles((items) => items.map((item) => item.id === account.id ? { ...item, status: newStatus } : item));
      setHistory((items) => [created, ...items]);
      form.reset();
      setNotice("Statut modifié avec motif, traçabilité et révocation de session si nécessaire.");
    }
    setBusy(false);
  }

  async function reviewRegistration(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const decision=String(data.get("decision"));const reason=String(data.get("reason")||"").trim();const bodyId=String(data.get("body_id")||"")||null;
    const {error}=await supabase.rpc("review_account_registration",{target_id:account.id,decision_name:decision,reason,assigned_body_id:bodyId});
    if(error)setNotice(error.message);else{
      setProfiles(rows=>rows.map(row=>row.id===account.id?{...row,registration_state:decision,status:decision==="approved"?"active":"pending",rejection_reason:decision==="rejected"?reason:null}:row));
      setReviews(rows=>[{id:crypto.randomUUID(),profile_id:account.id,reviewer_id:currentProfile.id,decision,reason,body_id:bodyId,position_assignment_id:null,created_at:new Date().toISOString()},...rows]);
      form.reset();setNotice(decision==="approved"?"Inscription approuvée. Le compte peut maintenant accéder au portail.":"Inscription refusée et sessions révoquées.");
    }setBusy(false);
  }

  async function assignPosition(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const payload={position_id:String(data.get("position_id")),body_id:String(data.get("body_id")),profile_id:account.id,territory:String(data.get("territory")||"").trim()||null,decision_reference:String(data.get("decision_reference")||"").trim(),start_date:data.get("start_date"),appointed_by:currentProfile.id};
    const {data:created,error}=await supabase.from("position_assignments").insert(payload).select().single();
    if(error||!created)setNotice(error?.message||"Affectation impossible");else{setAssignments(rows=>[created as PositionAssignmentRow,...rows]);form.reset();setNotice("Poste rattaché à l’organe, au territoire et à la décision de nomination.");}setBusy(false);
  }

  async function createOrInviteAccount(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const payload={
      action:String(data.get("mode")||"invite"),email:String(data.get("email")||"").trim(),full_name:String(data.get("full_name")||"").trim(),
      phone:String(data.get("phone")||"").trim(),organization:String(data.get("organization")||"AIAC").trim(),role:String(data.get("role")||"member"),
      body_id:String(data.get("body_id")||"")||null,scope_type:String(data.get("scope_type")||"body"),territory:String(data.get("territory")||"").trim()||null,
      decision_reference:String(data.get("decision_reference")||"").trim(),
    };
    const {data:result,error}=await supabase.functions.invoke("admin-users",{body:payload});
    if(error||result?.error)setNotice(result?.error||error?.message||"Création impossible");
    else{form.reset();setNotice(result.message||"Compte créé.");window.setTimeout(()=>window.location.reload(),900);}
    setBusy(false);
  }

  async function revokeSessions(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const reason=String(new FormData(form).get("reason")||"").trim();
    const {error}=await supabase.rpc("revoke_user_sessions",{target_id:account.id,reason});
    if(error)setNotice(error.message);else{setSessions(rows=>rows.map(row=>row.user_id===account.id&& !row.revoked_at?{...row,revoked_at:new Date().toISOString()}:row));form.reset();setNotice("Toutes les sessions du compte ont été révoquées sans suspendre le compte.");}
    setBusy(false);
  }

  async function invokeAccountAction(event:FormEvent<HTMLFormElement>,account:AccountProfile,action:"verify_email"|"require_password_reset"){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const reason=String(new FormData(form).get("reason")||"").trim();
    const {data:result,error}=await supabase.functions.invoke("admin-users",{body:{action,target_id:account.id,reason}});
    if(error||result?.error)setNotice(result?.error||error?.message||"Action impossible");else{
      if(action==="verify_email")setProfiles(rows=>rows.map(row=>row.id===account.id?{...row,email_verified_at:new Date().toISOString()}:row));
      if(action==="require_password_reset")setProfiles(rows=>rows.map(row=>row.id===account.id?{...row,must_reset_password:true}:row));
      form.reset();setNotice(result.message);
    }setBusy(false);
  }

  async function setTemporaryPassword(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const password=String(data.get("password")||"");const confirmation=String(data.get("confirmation")||"");const reason=String(data.get("reason")||"").trim();
    if(password!==confirmation){setNotice("Les deux mots de passe temporaires ne correspondent pas.");setBusy(false);return;}
    const {data:result,error}=await supabase.functions.invoke("admin-users",{body:{action:"set_temporary_password",target_id:account.id,password,reason}});
    if(error||result?.error)setNotice(result?.error||error?.message||"Mot de passe impossible à définir");else{
      setProfiles(rows=>rows.map(row=>row.id===account.id?{...row,must_reset_password:true}:row));form.reset();setNotice(result.message);
    }setBusy(false);
  }

  async function deleteAccount(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const confirmation=String(data.get("confirmation")||"").trim();const reason=String(data.get("reason")||"").trim();
    if(confirmation.toLowerCase()!==(account.email||"").toLowerCase()){setNotice("Recopiez exactement l’adresse électronique du compte.");return;}
    if(!window.confirm(`Supprimer définitivement le compte ${account.email} ? Cette action retire son accès et ne peut pas être annulée.`))return;
    setBusy(true);const {data:result,error}=await supabase.functions.invoke("admin-users",{body:{action:"delete_account",target_id:account.id,confirmation,reason}});
    if(error||result?.error)setNotice(result?.error||error?.message||"Suppression impossible");else{
      setProfiles(rows=>rows.filter(row=>row.id!==account.id));setSessions(rows=>rows.filter(row=>row.user_id!==account.id));setNotice(result.message);
    }setBusy(false);
  }

  async function assignScope(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);const scopeType=String(data.get("scope_type"));
    const payload={profile_id:account.id,scope_type:scopeType,body_id:String(data.get("body_id")||"")||null,territory:String(data.get("territory")||"").trim()||null,permission_level:String(data.get("permission_level")),decision_reference:String(data.get("decision_reference")||"").trim(),starts_on:data.get("starts_on"),ends_on:data.get("ends_on")||null,created_by:currentProfile.id};
    const {data:created,error}=await supabase.from("account_scope_assignments").insert(payload).select().single();
    if(error||!created)setNotice(error?.message||"Rattachement impossible");else{setAccountScopes(rows=>[created as AccountScopeRow,...rows]);form.reset();setNotice("Périmètre institutionnel attribué et tracé.");}setBusy(false);
  }

  async function grantPermission(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);const scopeType=String(data.get("scope_type"));
    const payload={profile_id:account.id,permission_code:String(data.get("permission_code")),effect:String(data.get("effect")),scope_type:scopeType,body_id:["body","service","antenna"].includes(scopeType)?String(data.get("body_id")||"")||null:null,scope_value:scopeType==="region"?String(data.get("scope_value")||"").trim():null,reason:String(data.get("reason")||"").trim(),expires_at:data.get("expires_at")?new Date(String(data.get("expires_at"))).toISOString():null,granted_by:currentProfile.id};
    const {data:created,error}=await supabase.from("user_permission_overrides").insert(payload).select().single();
    if(error||!created)setNotice(error?.message||"Permission impossible");else{setPermissionOverrides(rows=>[created as PermissionOverrideRow,...rows]);form.reset();setNotice("Permission individuelle enregistrée avec son périmètre.");}setBusy(false);
  }

  async function removePermission(id:string){
    setBusy(true);const {error}=await supabase.from("user_permission_overrides").delete().eq("id",id);
    if(error)setNotice(error.message);else{setPermissionOverrides(rows=>rows.filter(row=>row.id!==id));setNotice("Dérogation de permission retirée.");}setBusy(false);
  }

  async function uploadInstitutionalAsset(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const file=data.get("asset_file");const assetType=String(data.get("asset_type")) as InstitutionalSignatureAsset["asset_type"];
    if(!(file instanceof File)||!file.size){setNotice("Sélectionnez l’image officielle à enregistrer.");setBusy(false);return;}
    if(file.size>2*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)){setNotice("L’actif doit être une image JPG, PNG ou WebP de 2 Mo maximum.");setBusy(false);return;}
    const safeName=file.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"-").replace(/-+/g,"-").slice(-120);
    const storagePath=`${account.id}/${assetType}/${crypto.randomUUID()}-${safeName}`;
    const uploaded=await supabase.storage.from("aiac-signatures").upload(storagePath,file,{contentType:file.type,upsert:false});
    if(uploaded.error){setNotice(uploaded.error.message);setBusy(false);return;}
    const {data:created,error}=await supabase.rpc("register_institutional_signature_asset",{
      target_profile_id:account.id,
      target_body_id:String(data.get("body_id")||"")||null,
      selected_asset_type:assetType,
      selected_storage_path:storagePath,
      selected_file_name:file.name,
      selected_mime_type:file.type,
      selected_official_title:String(data.get("official_title")||"").trim()||null,
      selected_decision_reference:String(data.get("decision_reference")||"").trim()||null,
    });
    if(error||!created){await supabase.storage.from("aiac-signatures").remove([storagePath]);setNotice(error?.message||"Enregistrement impossible");setBusy(false);return;}
    setSignatureAssets(rows=>[
      created as InstitutionalSignatureAsset,
      ...rows.map(row=>row.profile_id===account.id&&row.asset_type===assetType?{...row,is_default:false}:row),
    ]);
    form.reset();setNotice(`${institutionalAssetLabels[assetType]} enregistrée comme actif officiel par défaut.`);setBusy(false);
  }

  async function revokeInstitutionalAsset(asset:InstitutionalSignatureAsset){
    if(!window.confirm(`Révoquer « ${institutionalAssetLabels[asset.asset_type]} » ? Les anciens rapports conserveront leur traçabilité.`))return;
    setBusy(true);const {data:updated,error}=await supabase.rpc("revoke_institutional_signature_asset",{target_asset_id:asset.id});
    if(error||!updated)setNotice(error?.message||"Révocation impossible");else{
      setSignatureAssets(rows=>rows.map(row=>row.id===asset.id?updated as InstitutionalSignatureAsset:row));
      setNotice("Actif institutionnel révoqué. Le fichier historique est conservé dans le stockage privé.");
    }setBusy(false);
  }

  return (
    <section className="operationsWorkspace">
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {isSuperAdmin&&<div className="portalPanel"><h2>Créer ou inviter un compte</h2><p>L’invitation laisse l’utilisateur confirmer son adresse. La création administrative vérifie l’adresse et envoie immédiatement un lien pour définir le mot de passe.</p><form className="operationForm" onSubmit={createOrInviteAccount}>
        <select name="mode"><option value="invite">Inviter par e-mail</option><option value="create">Créer et envoyer la configuration</option></select>
        <input name="full_name" minLength={2} placeholder="Nom complet" required/><input name="email" type="email" placeholder="Adresse e-mail" required/><input name="phone" placeholder="Téléphone / WhatsApp"/><input name="organization" defaultValue="AIAC" placeholder="Organisation"/>
        <select name="role" defaultValue="member">{Object.entries(roleLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
        <select name="scope_type" defaultValue="body"><option value="body">Organe central ou subsidiaire</option><option value="service">Service structuré</option><option value="regional_coordination">Coordination régionale</option><option value="antenna">Antenne</option></select>
        <select name="body_id"><option value="">Aucun rattachement initial</option>{initialBodies.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}{row.region?` · ${row.region}`:""}</option>)}</select>
        <input name="territory" placeholder="Région, localité ou territoire"/><input name="decision_reference" placeholder="Décision / note de service de référence"/><button disabled={busy}>Créer ou inviter</button>
      </form></div>}
      <div className="portalPanel"><h2>Gestion sécurisée des comptes</h2>
      <p>Chaque rôle, statut, permission et périmètre est indépendant et tracé. Seul un super-administrateur peut gérer un autre super-administrateur.</p>
      <ListToolbar
        query={query} onQuery={setQuery} status={status} onStatus={setStatus}
        options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
        count={filtered.length} page={paged.page} pages={paged.pages} onPage={setPage}
        onExport={() => exportCsv("comptes-aiac.csv", ["Nom", "E-mail", "Organisation", "Fonction", "Statut"], filtered.map((item) => [item.full_name, item.email, item.organization, roleLabels[item.role] || item.role, statusLabels[item.status] || item.status]))}
        placeholder="Nom, e-mail, organisation ou fonction"
      />
      {paged.items.map((account) => {
        const protectedSuper = account.role === "super_admin" && !isSuperAdmin;
        const ownSuper = account.id === currentProfile.id && account.role === "super_admin";
        const accountHistory = history.filter((entry) => entry.profile_id === account.id).slice(0, 5);
        const accountScopesForUser=accountScopes.filter(row=>row.profile_id===account.id);
        const overridesForUser=permissionOverrides.filter(row=>row.profile_id===account.id);
        const sessionsForUser=sessions.filter(row=>row.user_id===account.id);
        const signatureAssetsForUser=signatureAssets.filter(row=>row.profile_id===account.id);
        return (
          <details className="workflowCard" key={account.id}>
            <summary>
              <span><b>{account.full_name || account.email}</b><small>{account.email} · {roleLabels[account.role] || account.role}</small></span>
              <span className={`status ${account.status}`}>{statusLabels[account.status] || account.status}</span>
            </summary>
            <div className="workflowBody">
              <label>Fonction
                <select value={account.role} disabled={busy || protectedSuper || ownSuper} onChange={(event) => setRole(account.id, event.target.value)}>
                  {Object.entries(roleLabels).filter(([value]) => isSuperAdmin || value !== "super_admin").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {account.registration_state!=="approved"&&<form className="operationForm compact" onSubmit={event=>reviewRegistration(event,account)}>
                <select name="decision"><option value="approved">Approuver l’inscription</option><option value="rejected">Refuser l’inscription</option></select>
                <select name="body_id"><option value="">Rattachement à définir ultérieurement</option>{initialBodies.map(body=><option value={body.id} key={body.id}>{body.code} · {body.name}</option>)}</select>
                <input name="reason" minLength={5} maxLength={1000} placeholder="Motif obligatoire de la décision" required/>
                <button disabled={busy||protectedSuper||ownSuper}>Décider</button>
              </form>}
              {account.registration_state==="approved"&&<form className="statusReasonForm" onSubmit={(event) => changeStatus(event, account)}>
                <select name="status" defaultValue={account.status} disabled={busy || protectedSuper || ownSuper}>
                  {Object.entries(statusLabels).filter(([value])=>value!=="pending").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input name="reason" minLength={5} maxLength={1000} placeholder="Motif obligatoire du changement" required disabled={busy || protectedSuper || ownSuper}/>
                <button disabled={busy || protectedSuper || ownSuper}>Appliquer</button>
              </form>}
              <div className="eventTimeline"><h3>Postes et habilitations institutionnelles</h3>
                {assignments.filter(row=>row.profile_id===account.id).map(row=>{const position=initialPositions.find(item=>item.id===row.position_id);const body=initialBodies.find(item=>item.id===row.body_id);return <div className="eventItem" key={row.id}><b>{position?.title||"Poste"}</b><p>{body?.code} · {body?.name}{row.territory?` · ${row.territory}`:""}</p><small>{row.decision_reference} · depuis le {new Date(row.start_date).toLocaleDateString("fr-FR")}</small></div>})}
                {isSuperAdmin&&<form className="operationForm compact" onSubmit={event=>assignPosition(event,account)}><select name="position_id" required><option value="">Poste officiel</option>{initialPositions.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.title}</option>)}</select><select name="body_id" required><option value="">Organe / niveau</option>{initialBodies.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select><input name="territory" placeholder="Région, antenne ou territoire"/><input name="decision_reference" minLength={2} placeholder="Décision / délégation de référence" required/><label>Début<input name="start_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><button disabled={busy}>Affecter le poste</button></form>}
              </div>
              {isSuperAdmin&&<div className="eventTimeline"><h3>Signatures et cachets officiels</h3><p>Les actifs actifs sont insérés automatiquement lors de la signature et apparaissent dans les rapports produits.</p>{signatureAssetsForUser.map(asset=>{const body=initialBodies.find(item=>item.id===asset.body_id);return <div className="eventItem" key={asset.id}><b>{institutionalAssetLabels[asset.asset_type]} · {asset.status==="active"?"Actif":"Révoqué"}</b><p>{asset.file_name}{asset.official_title?` · ${asset.official_title}`:""}</p><small>{body?`${body.code} · ${body.name}`:"Portée institutionnelle générale"}{asset.decision_reference?` · ${asset.decision_reference}`:""}{asset.status==="active"&&<button type="button" onClick={()=>revokeInstitutionalAsset(asset)} disabled={busy}>Révoquer</button>}</small></div>})}<form className="operationForm compact" onSubmit={event=>uploadInstitutionalAsset(event,account)}><select name="asset_type" required><option value="signature">Signature officielle</option><option value="round_seal">Cachet rond</option><option value="nominal_seal">Cachet nominatif</option><option value="composite_signature">Signature et cachet composés</option></select><select name="body_id"><option value="">Portée institutionnelle générale</option>{initialBodies.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select><input name="official_title" placeholder="Fonction officielle affichée"/><input name="decision_reference" placeholder="Décision / référence de validation"/><label>Image officielle<input name="asset_file" type="file" accept="image/jpeg,image/png,image/webp" required/></label><button disabled={busy}>Enregistrer comme actif officiel</button></form></div>}
              {isSuperAdmin&&<div className="eventTimeline"><h3>Périmètres d’accès structurés</h3>{accountScopesForUser.map(row=>{const body=initialBodies.find(item=>item.id===row.body_id);return <div className="eventItem" key={row.id}><b>{row.permission_level} · {row.scope_type}</b><p>{body?`${body.code} · ${body.name}`:"Projet"}{row.territory?` · ${row.territory}`:""}</p><small>{row.decision_reference} · depuis le {new Date(row.starts_on).toLocaleDateString("fr-FR")}</small></div>})}<form className="operationForm compact" onSubmit={event=>assignScope(event,account)}><select name="scope_type"><option value="body">Organe</option><option value="service">Service</option><option value="regional_coordination">Coordination régionale</option><option value="antenna">Antenne</option></select><select name="body_id" required><option value="">Structure</option>{initialBodies.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}{row.region?` · ${row.region}`:""}</option>)}</select><select name="permission_level"><option value="viewer">Consultation</option><option value="contributor">Contribution</option><option value="manager">Gestion</option><option value="authority">Autorité</option></select><input name="territory" placeholder="Territoire précis"/><input name="decision_reference" minLength={2} placeholder="Décision / note de service" required/><label>Début<input name="starts_on" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><label>Fin<input name="ends_on" type="date"/></label><button disabled={busy}>Attribuer le périmètre</button></form></div>}
              {isSuperAdmin&&<div className="eventTimeline"><h3>Permissions individuelles granulaires</h3>{overridesForUser.map(row=><div className="eventItem" key={row.id}><b>{row.effect==="allow"?"AUTORISER":"REFUSER"} · {row.permission_code}</b><p>{row.scope_type}{row.scope_value?` · ${row.scope_value}`:""} · {row.reason}</p><small>{row.expires_at?`Expire le ${new Date(row.expires_at).toLocaleString("fr-FR")}`:"Sans expiration"} <button type="button" onClick={()=>removePermission(row.id)} disabled={busy}>Retirer</button></small></div>)}<form className="operationForm compact" onSubmit={event=>grantPermission(event,account)}><select name="permission_code" required><option value="">Permission</option>{initialPermissions.map(row=><option value={row.code} key={row.code}>{row.name} · {row.code}</option>)}</select><select name="effect"><option value="allow">Autoriser</option><option value="deny">Refuser</option></select><select name="scope_type"><option value="global">Global</option><option value="body">Organe</option><option value="service">Service</option><option value="antenna">Antenne</option><option value="region">Région</option></select><select name="body_id"><option value="">Structure si nécessaire</option>{initialBodies.map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select><input name="scope_value" placeholder="Nom de la région si applicable"/><input name="reason" minLength={5} placeholder="Motif de la dérogation" required/><label>Expiration<input name="expires_at" type="datetime-local"/></label><button disabled={busy}>Enregistrer</button></form></div>}
              {isSuperAdmin&&<div className="eventTimeline"><h3>Sécurité, adresse électronique et appareils</h3><p>{account.email_verified_at?`Adresse vérifiée le ${new Date(account.email_verified_at).toLocaleString("fr-FR")}`:"Adresse non confirmée administrativement"} · {account.must_reset_password?"Changement de mot de passe obligatoire":"Mot de passe non signalé"}</p><div className="institutionalSplit"><form className="commentForm" onSubmit={event=>revokeSessions(event,account)}><input name="reason" minLength={5} placeholder="Motif de révocation des sessions" required/><button disabled={busy||account.id===currentProfile.id}>Révoquer toutes les sessions</button></form><form className="commentForm" onSubmit={event=>invokeAccountAction(event,account,"require_password_reset")}><input name="reason" minLength={5} placeholder="Motif de la réinitialisation" required/><button disabled={busy||account.id===currentProfile.id}>Envoyer un nouveau lien de réinitialisation</button></form>{!account.email_verified_at&&<form className="commentForm" onSubmit={event=>invokeAccountAction(event,account,"verify_email")}><input name="reason" minLength={5} placeholder="Justification de la vérification manuelle" required/><button disabled={busy}>Vérifier l’adresse e-mail</button></form>}</div><form className="operationForm compact" onSubmit={event=>setTemporaryPassword(event,account)}><h4>Définir un mot de passe temporaire</h4><input name="password" type="password" minLength={12} autoComplete="new-password" placeholder="Nouveau mot de passe temporaire" required/><input name="confirmation" type="password" minLength={12} autoComplete="new-password" placeholder="Confirmer le mot de passe" required/><input name="reason" minLength={5} maxLength={1000} placeholder="Motif administratif obligatoire" required/><button disabled={busy||account.id===currentProfile.id}>Définir et imposer son remplacement</button></form>{sessionsForUser.length? sessionsForUser.map(row=><div className="eventItem" key={row.id}><b>{row.revoked_at?"Session révoquée":"Session observée"}</b><p>{row.source_ip||"IP non disponible"} · {row.user_agent?.slice(0,140)||"Appareil non renseigné"}</p><small>Première connexion {new Date(row.first_seen_at).toLocaleString("fr-FR")} · dernière activité {new Date(row.last_seen_at).toLocaleString("fr-FR")}</small></div>):<p>Aucune session observée pour ce compte.</p>}<form className="operationForm compact" onSubmit={event=>deleteAccount(event,account)}><h4>Zone de suppression définitive</h4><p>La suppression est refusée si elle ferait disparaître des messages, demandes, tâches, conversations ou documents institutionnels.</p><input name="confirmation" type="email" placeholder={`Recopier ${account.email||"l’adresse e-mail"}`} required/><input name="reason" minLength={10} maxLength={1000} placeholder="Motif détaillé de la suppression" required/><button className="danger" disabled={busy||account.id===currentProfile.id}>Supprimer définitivement le compte</button></form></div>}
              <div className="eventTimeline">
                <h3>Historique des statuts</h3>
                {accountHistory.length ? accountHistory.map((entry) => (
                  <div key={entry.id} className="eventItem">
                    <b>{statusLabels[entry.old_status]} → {statusLabels[entry.new_status]}</b>
                    <p>{entry.reason}</p>
                    <small>{new Date(entry.created_at).toLocaleString("fr-FR")}</small>
                  </div>
                )) : <p>Aucun changement de statut enregistré.</p>}
              </div>
              <div className="eventTimeline"><h3>Décisions d’inscription</h3>{reviews.filter(row=>row.profile_id===account.id).map(row=><div className="eventItem" key={row.id}><b>{row.decision==="approved"?"Inscription approuvée":"Inscription refusée"}</b><p>{row.reason}</p><small>{new Date(row.created_at).toLocaleString("fr-FR")}</small></div>)}</div>
            </div>
          </details>
        );
      })}
      </div>
    </section>
  );
}
