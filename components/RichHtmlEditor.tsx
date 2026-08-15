"use client";

import DOMPurify from "dompurify";
import { ChangeEvent, ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import SandboxedHtmlDocument from "@/components/SandboxedHtmlDocument";

export type ImportedMetadata={fileName:string;mimeType:string;title:string;summary:string;warnings:string[];contentFormat:"html"|"html_document"};

export function sanitizeRichHtml(html:string){
  return DOMPurify.sanitize(html,{
    USE_PROFILES:{html:true},ADD_DATA_URI_TAGS:["img"],ADD_ATTR:["target","rel","controls","poster","allowfullscreen","alt","width","height","style","data-file-name"],
    FORBID_TAGS:["script","style","object","embed","form","input","button","meta","link","base"],FORBID_ATTR:["srcdoc"]
  });
}

async function prepareImportedHtml(html:string){
  const preliminary=DOMPurify.sanitize(html,{
    USE_PROFILES:{html:true},ADD_TAGS:["style"],ADD_ATTR:["target","rel","controls","poster","allowfullscreen"],
    FORBID_TAGS:["script","object","embed","form","input","button","meta","link","base"],FORBID_ATTR:["srcdoc"]
  });
  try{
    const {default:juice}=await import("juice");
    return sanitizeRichHtml(juice(preliminary,{applyStyleTags:true,removeStyleTags:true,preserveMediaQueries:false,preserveFontFaces:false,preserveKeyFrames:false,applyAttributesTableElements:true,applyWidthAttributes:true,applyHeightAttributes:true}));
  }catch{return sanitizeRichHtml(preliminary);}
}

export function prepareImportedDocument(html:string){
  return DOMPurify.sanitize(html,{
    WHOLE_DOCUMENT:true,USE_PROFILES:{html:true},ADD_TAGS:["style"],
    ADD_ATTR:["target","rel","controls","poster","allowfullscreen","role","aria-label","aria-hidden"],
    FORBID_TAGS:["script","noscript","object","embed","applet","form","input","button","textarea","select","option","meta","link","base"],
    FORBID_ATTR:["srcdoc"]
  });
}

function plainText(html:string){const doc=new DOMParser().parseFromString(html,"text/html");return (doc.body.textContent||"").replace(/\s+/g," ").trim();}

export default function RichHtmlEditor({onChange,onImported=()=>{},resetToken=0,initialHtml="",allowInlineImages=false,showImport=true,placeholder="Collez ici le contenu venant de Word ou rédigez directement votre rapport…"}:{onChange:(html:string)=>void;onImported?:(metadata:ImportedMetadata)=>void;resetToken?:number|string;initialHtml?:string;allowInlineImages?:boolean;showImport?:boolean;placeholder?:string}){
  const editorRef=useRef<HTMLDivElement>(null);const fileRef=useRef<HTMLInputElement>(null);const imageRef=useRef<HTMLInputElement>(null);
  const [selectedFile,setSelectedFile]=useState<File|null>(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
  const [documentHtml,setDocumentHtml]=useState("");

  useEffect(()=>{if(editorRef.current)editorRef.current.innerHTML=sanitizeRichHtml(initialHtml);if(fileRef.current)fileRef.current.value="";if(imageRef.current)imageRef.current.value="";setSelectedFile(null);setDocumentHtml("");setNotice("");onChange(sanitizeRichHtml(initialHtml));},[resetToken,initialHtml]);

  function sync(){const safe=sanitizeRichHtml(editorRef.current?.innerHTML||"");if(safe.length>4900000)setNotice("Le document approche la limite de 4,9 Mo. Compressez les images ou placez-les dans les preuves annexes.");onChange(safe);}
  function command(name:string,value?:string){editorRef.current?.focus();document.execCommand(name,false,value);sync();}
  function addLink(){const href=window.prompt("Adresse du lien (https://…)");if(href&&/^https?:\/\//i.test(href))command("createLink",href);else if(href)setNotice("Le lien doit commencer par http:// ou https://");}
  function addTable(){command("insertHTML",'<table style="width:100%;border-collapse:collapse"><tbody><tr><th style="border:1px solid #94a3b8;padding:8px;background-color:#e2e8f0">Titre 1</th><th style="border:1px solid #94a3b8;padding:8px;background-color:#e2e8f0">Titre 2</th></tr><tr><td style="border:1px solid #94a3b8;padding:8px">Donnée</td><td style="border:1px solid #94a3b8;padding:8px">Donnée</td></tr></tbody></table><p><br></p>');}

  function paste(event:ClipboardEvent<HTMLDivElement>){
    const html=event.clipboardData.getData("text/html");if(!html)return;
    event.preventDefault();command("insertHTML",sanitizeRichHtml(html));setNotice("Mise en forme collée et sécurisée.");
  }

  function handleKeyDown(event:KeyboardEvent<HTMLDivElement>){if(event.key==="Tab"){event.preventDefault();command("insertHTML","&emsp;&emsp;");}}
  function insertInlineImage(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith("image/")){setNotice("Choisissez une image.");return;}if(file.size>1500*1024){setNotice("L’image intégrée doit faire au maximum 1,5 Mo. Ajoutez l’original dans les preuves annexes.");return;}
    const reader=new FileReader();reader.onload=()=>{const caption=window.prompt("Légende de la photo (facultatif)")||"";command("insertHTML",`<figure><img src="${String(reader.result)}" alt="${caption.replace(/[<>\"]/g,"")}" data-file-name="${file.name.replace(/[<>\"]/g,"")}" style="max-width:100%;height:auto"><figcaption>${caption.replace(/[<>]/g,"")}</figcaption></figure><p><br></p>`);setNotice("Photo insérée exactement à la position du curseur. Conservez aussi l’original dans les preuves si nécessaire.");};reader.readAsDataURL(file);event.target.value="";
  }

  async function importFile(){
    if(!selectedFile)return setNotice("Choisissez d’abord un fichier HTML ou Word DOCX.");setBusy(true);setNotice("");
    try{
      let html="";let title=selectedFile.name.replace(/\.(?:html?|docx)$/i,"");const warnings:string[]=[];let contentFormat:ImportedMetadata["contentFormat"]="html";
      if(/\.docx$/i.test(selectedFile.name)){
        const mammoth=(await import("mammoth")).default;
        const result=await mammoth.convertToHtml({arrayBuffer:await selectedFile.arrayBuffer()},{
          styleMap:["p[style-name='Title'] => h1:fresh","p[style-name='Subtitle'] => h2:fresh"],
          includeEmbeddedStyleMap:false,externalFileAccess:false
        });
        html=result.value;warnings.push(...result.messages.map(message=>message.message));
        html=await prepareImportedHtml(html);setDocumentHtml("");
      }else{
        const source=await selectedFile.text();const doc=new DOMParser().parseFromString(source,"text/html");
        title=doc.title.trim()||title;
        html=prepareImportedDocument(source);contentFormat="html_document";
        if(doc.querySelector("link[rel='stylesheet']"))warnings.push("Les feuilles de style externes ne sont pas importées ; utilisez des styles intégrés ou en ligne.");
      }
      const safe=html;const text=plainText(safe);
      if(text.length<10)throw new Error("Le fichier ne contient pas assez de texte publiable.");
      if(safe.length>4900000)throw new Error("Le contenu dépasse 4,9 Mo. Réduisez les images intégrées ou téléversez-les séparément dans la galerie.");
      if(contentFormat==="html_document")setDocumentHtml(safe);else if(editorRef.current)editorRef.current.innerHTML=safe;onChange(safe);
      onImported({fileName:selectedFile.name,mimeType:selectedFile.type||(/\.docx$/i.test(selectedFile.name)?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"text/html"),title,summary:text.slice(0,500),warnings,contentFormat});
      setNotice(`Fichier « ${selectedFile.name} » chargé${warnings.length?` avec ${warnings.length} avertissement(s)`:""}. Vérifiez l’aperçu puis enregistrez.`);
    }catch(error){setNotice(error instanceof Error?error.message:"Importation impossible.");}
    setBusy(false);
  }

  function selectFile(event:ChangeEvent<HTMLInputElement>){setSelectedFile(event.target.files?.[0]||null);setNotice("");}

  return <div className="richEditorField">
    {showImport&&<div className="richImportBox"><div><b>Importer un rapport déjà préparé</b><small>HTML/HTML5 (.html, .htm) ou Microsoft Word (.docx), jusqu’à 4,9 Mo de contenu converti.</small></div><input ref={fileRef} type="file" accept=".html,.htm,.docx,text/html,application/xhtml+xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={selectFile}/><button type="button" disabled={busy||!selectedFile} onClick={importFile}>{busy?"Importation…":"Valider et charger le fichier"}</button></div>}
    {!documentHtml&&<><div className="richToolbar" role="toolbar" aria-label="Mise en forme du contenu">
      <button type="button" onClick={()=>command("bold")} title="Gras"><b>G</b></button><button type="button" onClick={()=>command("italic")} title="Italique"><i>I</i></button><button type="button" onClick={()=>command("underline")} title="Souligné"><u>S</u></button>
      <button type="button" onClick={()=>command("formatBlock","p")}>Texte</button><button type="button" onClick={()=>command("formatBlock","h2")}>Titre 2</button><button type="button" onClick={()=>command("formatBlock","h3")}>Titre 3</button>
      <button type="button" onClick={()=>command("insertUnorderedList")}>• Liste</button><button type="button" onClick={()=>command("insertOrderedList")}>1. Liste</button><button type="button" onClick={addTable}>Tableau</button><button type="button" onClick={addLink}>Lien</button>{allowInlineImages&&<><button type="button" onClick={()=>imageRef.current?.click()}>Photo dans le texte</button><input ref={imageRef} hidden type="file" accept="image/*" onChange={insertInlineImage}/></>}
      <label title="Couleur du texte">A <input type="color" onChange={event=>command("foreColor",event.target.value)}/></label><label title="Surlignage">▰ <input type="color" defaultValue="#fff59d" onChange={event=>command("hiliteColor",event.target.value)}/></label>
      <button type="button" onClick={()=>command("undo")}>↶</button><button type="button" onClick={()=>command("redo")}>↷</button><button type="button" onClick={()=>command("removeFormat")}>Effacer le style</button>
    </div>
    <div ref={editorRef} className="richEditor" contentEditable suppressContentEditableWarning onInput={sync} onPaste={paste} onKeyDown={handleKeyDown} data-placeholder={placeholder}/></>}
    {documentHtml&&<><div className="richDocumentStatus"><b>Mode document HTML fidèle</b><span>La mise en page, les styles intégrés, les tableaux et les images incorporées sont isolés du site et conservés.</span></div><SandboxedHtmlDocument html={documentHtml} title="Aperçu du document HTML importé" className="richDocumentPreview"/></>}
    <small>Le collage depuis Word conserve notamment les titres, couleurs, listes et tableaux. Un fichier HTML est affiché comme un document autonome afin de préserver sa mise en page. Les scripts, formulaires et éléments dangereux sont supprimés.</small>
    {notice&&<p className="richEditorNotice" role="status">{notice}</p>}
  </div>;
}
