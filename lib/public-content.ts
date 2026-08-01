import { supabaseUrl } from "@/lib/supabase/config";

export type PublicContentType="project"|"report"|"agenda"|"gallery"|"video"|"announcement";
export type PublicContentStatus="draft"|"review"|"published"|"archived";

export type PublicBody={id:string;code:string;name:string;description:string|null;subsidiary_code:string|null;region:string|null;locality:string|null};
export type PublicContentItem={
  id:string;body_id:string;content_type:PublicContentType;subtype:string|null;title:string;slug:string;summary:string;content:string;
  location:string|null;activity_date:string|null;starts_at:string|null;ends_at:string|null;status:PublicContentStatus;
  project_id:string|null;program_id:string|null;partnership_id:string|null;cover_image_path:string|null;document_path:string|null;
  external_url:string|null;is_featured:boolean;created_by:string;approved_by:string|null;published_at:string|null;created_at:string;updated_at:string;
};
export type PublicContentMedia={id:string;content_id:string;media_type:"image"|"video"|"audio"|"document";storage_path:string|null;external_url:string|null;title:string|null;caption:string|null;alt_text:string|null;occurred_on:string|null;sort_order:number;created_by:string;created_at:string};
export type GuestbookEntry={id:string;body_id:string|null;author_name:string;organization:string|null;message:string;status:"pending"|"published"|"rejected";moderator_id:string|null;moderation_note:string|null;published_at:string|null;created_at:string;updated_at:string};

export const contentCategories={
  projets:{type:"project",label:"Projets",singular:"Projet",description:"Programmes, projets et partenariats conduits par les organes subsidiaires."},
  rapports:{type:"report",label:"Rapports et publications",singular:"Rapport",description:"Rapports narratifs, synthèses, études et publications de l’AIAC."},
  agenda:{type:"agenda",label:"Agenda",singular:"Activité",description:"Calendrier des formations, campagnes, réunions et événements."},
  galerie:{type:"gallery",label:"Galerie",singular:"Album",description:"Albums et photographies des activités menées sur le terrain."},
  videos:{type:"video",label:"Vidéos",singular:"Vidéo",description:"Capsules, réunions et contenus audiovisuels des organes."},
  annonces:{type:"announcement",label:"Annonces",singular:"Annonce",description:"Recrutements, appels, communiqués et avis officiels."}
} as const;

export type CategorySlug=keyof typeof contentCategories;
export const categoryEntries=Object.entries(contentCategories) as [CategorySlug,(typeof contentCategories)[CategorySlug]][];

export function categoryFromType(type:PublicContentType){return categoryEntries.find(([,value])=>value.type===type)?.[0]||"projets";}
export function isCategorySlug(value:string):value is CategorySlug{return value in contentCategories;}
export function publicMediaUrl(path:string|null){return path?`${supabaseUrl}/storage/v1/object/public/aiac-public-media/${path.split("/").map(encodeURIComponent).join("/")}`:null;}
export function formatPublicDate(value:string|null,withTime=false){if(!value)return null;return new Intl.DateTimeFormat("fr-CM",withTime?{dateStyle:"long",timeStyle:"short",timeZone:"Africa/Douala"}:{dateStyle:"long",timeZone:"Africa/Douala"}).format(new Date(value));}
export function makeSlug(title:string){const base=title.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,150)||"publication";return `${base}-${Date.now().toString(36)}`;}
export function safeExternalUrl(value:string|null){if(!value)return null;try{const url=new URL(value);return ["http:","https:"].includes(url.protocol)?url.toString():null;}catch{return null;}}
