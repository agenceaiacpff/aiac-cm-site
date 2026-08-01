import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contentCategories, formatPublicDate, isCategorySlug, PublicBody, PublicContentItem, PublicContentMedia, publicMediaUrl, safeExternalUrl } from "@/lib/public-content";
import { sanitizePublicHtml, sanitizePublicHtmlDocument } from "@/lib/public-content-html";
import SandboxedHtmlDocument from "@/components/SandboxedHtmlDocument";

export const dynamic="force-dynamic";

export default async function PublicDetail({params}:{params:Promise<{type:string;slug:string}>}){
  const {type,slug}=await params;if(!isCategorySlug(type))notFound();const category=contentCategories[type];const supabase=await createClient();
  const {data:itemData}=await supabase.from("public_content_items").select("*").eq("slug",slug).eq("content_type",category.type).eq("status","published").maybeSingle();
  if(!itemData)notFound();const item=itemData as PublicContentItem;
  const [{data:bodyData},{data:mediaData}]=await Promise.all([
    supabase.from("governance_bodies").select("id,code,name,description,subsidiary_code,region,locality").eq("id",item.body_id).maybeSingle(),
    supabase.from("public_content_media").select("*").eq("content_id",item.id).order("sort_order").order("created_at")
  ]);
  const body=bodyData as PublicBody|null;const media=(mediaData||[]) as PublicContentMedia[];const cover=publicMediaUrl(item.cover_image_path);const external=safeExternalUrl(item.external_url);const richContent=item.content_format==="html"?sanitizePublicHtml(item.content):null;const documentContent=item.content_format==="html_document"?sanitizePublicHtmlDocument(item.content):null;
  return <main className="publicHubMain publicDetail"><Link className="publicBack" href={`/publications/${type}${body?`?organe=${encodeURIComponent(body.code)}`:""}`}>← Retour à {category.label.toLowerCase()}</Link>
    <article><header><span className="publicOrganBadge">{body?.code||"AIAC"} · {body?.name||"Organe subsidiaire"}</span><p className="publicCardMeta">Publié le {formatPublicDate(item.published_at)}{item.activity_date&&` · Activité du ${formatPublicDate(item.activity_date)}`}{item.location&&` · ${item.location}`}</p><h1>{item.title}</h1>{item.subtype&&<p className="publicLeadTag">{item.subtype}</p>}<p className="publicLead">{item.summary}</p></header>{cover&&<img className="publicDetailCover" src={cover} alt={item.title}/>} {documentContent?<SandboxedHtmlDocument html={documentContent} title={`Document publié : ${item.title}`} className="publicDocumentFrame"/>:richContent?<div className="publicArticleText publicRichContent" dangerouslySetInnerHTML={{__html:richContent}}/>:<div className="publicArticleText">{item.content.split(/\n{2,}/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>}
      {(item.starts_at||item.ends_at||item.location)&&<aside className="publicEventInfo"><h2>Informations pratiques</h2>{item.starts_at&&<p><b>Début :</b> {formatPublicDate(item.starts_at,true)}</p>}{item.ends_at&&<p><b>Fin :</b> {formatPublicDate(item.ends_at,true)}</p>}{item.location&&<p><b>Lieu :</b> {item.location}</p>}</aside>}
      {external&&<p><a className="publicPrimaryButton" href={external} target="_blank" rel="noreferrer">Ouvrir le contenu associé</a></p>}
      {item.document_path&&<p><a className="publicPrimaryButton" href={publicMediaUrl(item.document_path)||"#"} target="_blank" rel="noreferrer">Consulter le document</a></p>}
      {media.length>0&&<section className="publicMediaSection"><h2>Galerie et documents</h2><div className="publicMediaGrid">{media.map(entry=><MediaItem key={entry.id} item={entry}/>)}</div></section>}
    </article>
  </main>;
}

function MediaItem({item}:{item:PublicContentMedia}){const url=safeExternalUrl(item.external_url)||publicMediaUrl(item.storage_path);if(!url)return null;if(item.media_type==="image")return <figure><img src={url} alt={item.alt_text||item.title||"Photo AIAC"}/><figcaption><b>{item.title}</b>{item.caption&&<span>{item.caption}</span>}{item.occurred_on&&<small>{formatPublicDate(item.occurred_on)}</small>}</figcaption></figure>;if(item.media_type==="video")return <figure><video controls preload="metadata" src={url}/><figcaption><b>{item.title||"Vidéo"}</b>{item.caption&&<span>{item.caption}</span>}</figcaption></figure>;if(item.media_type==="audio")return <figure className="publicAudio"><b>{item.title||"Contenu audio"}</b><audio controls src={url}/>{item.caption&&<figcaption>{item.caption}</figcaption>}</figure>;return <a className="publicDocumentCard" href={url} target="_blank" rel="noreferrer"><b>{item.title||"Document"}</b><span>{item.caption||"Ouvrir ou télécharger le document"}</span></a>}
