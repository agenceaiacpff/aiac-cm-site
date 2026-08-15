import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GuestbookForm from "@/components/GuestbookForm";
import { contentCategories, formatPublicDate, GuestbookEntry, isCategorySlug, PublicBody, PublicContentItem, PublicContentMedia, publicMediaUrl } from "@/lib/public-content";

export const dynamic="force-dynamic";
const pageSize=20;

export default async function PublicListing({params,searchParams}:{params:Promise<{type:string}>;searchParams:Promise<{page?:string;organe?:string}>}){
  const {type}=await params;const filters=await searchParams;const page=Math.max(1,Number.parseInt(filters.page||"1",10)||1);const supabase=await createClient();
  const {data:bodyData}=await supabase.from("governance_bodies").select("id,code,name,description,subsidiary_code,region,locality").eq("status","active").order("code");
  const bodies=(bodyData||[]) as PublicBody[];const selectedBody=filters.organe?bodies.find(body=>body.code===filters.organe||body.subsidiary_code===filters.organe):undefined;

  if(type==="livre-dor"){
    let query=supabase.from("guestbook_entries").select("id,body_id,author_name,organization,message,status,moderator_id,moderation_note,published_at,created_at,updated_at",{count:"exact"}).eq("status","published").order("published_at",{ascending:false}).order("id",{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
    if(selectedBody)query=query.eq("body_id",selectedBody.id);else if(filters.organe)query=query.eq("body_id","00000000-0000-0000-0000-000000000000");
    const {data,count}=await query;const entries=(data||[]) as GuestbookEntry[];const pages=Math.max(1,Math.ceil((count||0)/pageSize));
    return <main className="publicHubMain"><PublicHeading title="Livre d’or" description="Témoignages, appréciations et messages adressés à l’AIAC et à ses organes subsidiaires." bodies={bodies} selected={selectedBody} path="livre-dor"/>
      <div className="guestbookLayout"><section><div className="publicResultCount">{count||0} témoignage(s) publié(s)</div>{entries.length===0?<Empty/>:entries.map(entry=><blockquote className="guestbookCard" key={entry.id}><p>“{entry.message}”</p><footer><b>{entry.author_name}</b>{entry.organization&&<span>{entry.organization}</span>}<small>{formatPublicDate(entry.published_at)}</small></footer></blockquote>)}<Pagination page={page} pages={pages} path="livre-dor" organ={selectedBody?.code}/></section><GuestbookForm bodyId={selectedBody?.id||null} bodyName={selectedBody?.name||null}/></div>
    </main>;
  }

  if(!isCategorySlug(type))notFound();const category=contentCategories[type];
  let query=supabase.from("public_content_items").select("*",{count:"exact"}).eq("status","published").eq("content_type",category.type).order("published_at",{ascending:false}).order("id",{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
  if(selectedBody)query=query.eq("body_id",selectedBody.id);else if(filters.organe)query=query.eq("body_id","00000000-0000-0000-0000-000000000000");
  const {data,count}=await query;const items=(data||[]) as PublicContentItem[];let media:PublicContentMedia[]=[];
  if(items.length){const {data:mediaData}=await supabase.from("public_content_media").select("*").in("content_id",items.map(item=>item.id)).eq("media_type","image").order("sort_order");media=(mediaData||[]) as PublicContentMedia[];}
  const bodyNames=Object.fromEntries(bodies.map(body=>[body.id,body]));const firstImages=Object.fromEntries(media.filter(row=>row.storage_path).map(row=>[row.content_id,row.storage_path]));const pages=Math.max(1,Math.ceil((count||0)/pageSize));
  return <main className="publicHubMain"><PublicHeading title={category.label} description={category.description} bodies={bodies} selected={selectedBody} path={type}/><div className="publicResultCount">{count||0} publication(s) · 20 par page</div>{items.length===0?<Empty/>:<div className="publicContentGrid">{items.map(item=>{const body=bodyNames[item.body_id];const image=publicMediaUrl(item.cover_image_path||firstImages[item.id]||null);return <article className="publicContentCard" key={item.id}>{image?<img src={image} alt={item.title}/>:<div className="publicCardPlaceholder" aria-hidden="true">AIAC</div>}<div className="publicCardBody"><span className="publicOrganBadge">{body?.code||"AIAC"} · {body?.name||"Organe AIAC"}</span><p className="publicCardMeta">{item.activity_date&&<>Activité : {formatPublicDate(item.activity_date)} · </>}{item.location&&<>{item.location} · </>}Publié le {formatPublicDate(item.published_at)}</p><h2>{item.title}</h2>{item.subtype&&<small>{item.subtype}</small>}<p>{item.summary}</p><Link href={`/publications/${type}/${item.slug}`}>Lire la publication <span aria-hidden="true">→</span></Link></div></article>;})}</div>}<Pagination page={page} pages={pages} path={type} organ={selectedBody?.code}/></main>;
}

function PublicHeading({title,description,bodies,selected,path}:{title:string;description:string;bodies:PublicBody[];selected:PublicBody|undefined;path:string}){return <section className="publicHubHero"><p className="eyebrow">Publications de l’AIAC</p><h1>{selected?`${title} — ${selected.name}`:title}</h1><p>{selected?.description||description}</p><div className="organFilters"><Link className={!selected?"active":""} href={`/publications/${path}`}>Tous les organes</Link>{bodies.map(body=><Link className={selected?.id===body.id?"active":""} key={body.id} href={`/publications/${path}?organe=${encodeURIComponent(body.code)}`}>{body.code}</Link>)}</div></section>}
function Empty(){return <div className="publicEmpty"><h2>Aucune publication pour le moment</h2><p>Les contenus validés par les organes de l’AIAC apparaîtront ici automatiquement.</p></div>}
function Pagination({page,pages,path,organ}:{page:number;pages:number;path:string;organ?:string}){const href=(next:number)=>`/publications/${path}?page=${next}${organ?`&organe=${encodeURIComponent(organ)}`:""}`;if(pages<=1)return null;return <nav className="publicPagination" aria-label="Pagination">{page>1&&<Link href={href(page-1)}>← Page précédente</Link>}<span>Page {page} sur {pages}</span>{page<pages&&<Link href={href(page+1)}>Page suivante →</Link>}</nav>}
