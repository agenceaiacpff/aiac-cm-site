"use client";

import DOMPurify from "dompurify";
import { ChangeEvent, ClipboardEvent, useEffect, useRef, useState } from "react";

export type ImportedMetadata={fileName:string;mimeType:string;title:string;summary:string;warnings:string[]};

function cleanHtml(html:string){
  return DOMPurify.sanitize(html,{
    USE_PROFILES:{html:true},ADD_ATTR:["target","rel","controls","poster","allowfullscreen"],
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
    return cleanHtml(juice(preliminary,{applyStyleTags:true,removeStyleTags:true,preserveMediaQueries:false,preserveFontFaces:false,preserveKeyFrames:false,applyAttributesTableElements:true,applyWidthAttributes:true,applyHeightAttributes:true}));
  }catch{return cleanHtml(preliminary);}
}

function plainText(html:string){const doc=new DOMParser().parseFromString(html,"text/html");return (doc.body.textContent||"").replace(/\s+/g," ").trim();}

export default function RichHtmlEditor({onChange,onImported,resetToken}:{onChange:(html:string)=>void;onImported:(metadata:ImportedMetadata)=>void;resetToken:number}){
  const editorRef=useRef<HTMLDivElement>(null);const fileRef=useRef<HTMLInputElement>(null);
  const [selectedFile,setSelectedFile]=useState<File|null>(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");

  useEffect(()=>{if(editorRef.current)editorRef.current.innerHTML="";if(fileRef.current)fileRef.current.value="";setSelectedFile(null);setNotice("");onChange("");},[resetToken,onChange]);

  function sync(){onChange(cleanHtml(editorRef.current?.innerHTML||""));}
  function command(name:string,value?:string){editorRef.current?.focus();document.execCommand(name,false,value);sync();}
  function addLink(){const href=window.prompt("Adresse du lien (https://…)");if(href&&/^https?:\/\//i.test(href))command("createLink",href);else if(href)setNotice("Le lien doit commencer par http:// ou https://");}
  function addTable(){command("insertHTML",'<table style="width:100%;border-collapse:collapse"><tbody><tr><th style="border:1px solid #94a3b8;padding:8px;background-color:#e2e8f0">Titre 1</th><th style="border:1px solid #94a3b8;padding:8px;background-color:#e2e8f0">Titre 2</th></tr><tr><td style="border:1px solid #94a3b8;padding:8px">Donnée</td><td style="border:1px solid #94a3b8;padding:8px">Donnée</td></tr></tbody></table><p><br></p>');}

  function paste(event:ClipboardEvent<HTMLDivElement>){
    const html=event.clipboardData.getData("text/html");if(!html)return;
    event.preventDefault();command("insertHTML",cleanHtml(html));setNotice("Mise en forme collée et sécurisée.");
  }

  async function importFile(){
    if(!selectedFile)return setNotice("Choisissez d’abord un fichier HTML ou Word DOCX.");setBusy(true);setNotice("");
    try{
      let html="";let title=selectedFile.name.replace(/\.(?:html?|docx)$/i,"");const warnings:string[]=[];
      if(/\.docx$/i.test(selectedFile.name)){
        const mammoth=(await import("mammoth")).default;
        const result=await mammoth.convertToHtml({arrayBuffer:await selectedFile.arrayBuffer()},{
          styleMap:["p[style-name='Title'] => h1:fresh","p[style-name='Subtitle'] => h2:fresh"],
          includeEmbeddedStyleMap:false,externalFileAccess:false
        });
        html=result.value;warnings.push(...result.messages.map(message=>message.message));
      }else{
        const source=await selectedFile.text();const doc=new DOMParser().parseFromString(source,"text/html");
        title=doc.title.trim()||title;
        const styles=Array.from(doc.querySelectorAll("style")).map(style=>style.outerHTML).join("\n");
        html=`${styles}${doc.body?.innerHTML||source}`;
        if(doc.querySelector("link[rel='stylesheet']"))warnings.push("Les feuilles de style externes ne sont pas importées ; utilisez des styles intégrés ou en ligne.");
      }
      const safe=await prepareImportedHtml(html);const text=plainText(safe);
      if(text.length<10)throw new Error("Le fichier ne contient pas assez de texte publiable.");
      if(safe.length>4900000)throw new Error("Le contenu dépasse 4,9 Mo. Réduisez les images intégrées ou téléversez-les séparément dans la galerie.");
      if(editorRef.current)editorRef.current.innerHTML=safe;onChange(safe);
      onImported({fileName:selectedFile.name,mimeType:selectedFile.type||(/\.docx$/i.test(selectedFile.name)?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"text/html"),title,summary:text.slice(0,500),warnings});
      setNotice(`Fichier « ${selectedFile.name} » chargé${warnings.length?` avec ${warnings.length} avertissement(s)`:""}. Vérifiez l’aperçu puis enregistrez.`);
    }catch(error){setNotice(error instanceof Error?error.message:"Importation impossible.");}
    setBusy(false);
  }

  function selectFile(event:ChangeEvent<HTMLInputElement>){setSelectedFile(event.target.files?.[0]||null);setNotice("");}

  return <div className="richEditorField">
    <div className="richImportBox"><div><b>Importer un rapport déjà préparé</b><small>HTML/HTML5 (.html, .htm) ou Microsoft Word (.docx), jusqu’à 4,9 Mo de contenu converti.</small></div><input ref={fileRef} type="file" accept=".html,.htm,.docx,text/html,application/xhtml+xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={selectFile}/><button type="button" disabled={busy||!selectedFile} onClick={importFile}>{busy?"Importation…":"Valider et charger le fichier"}</button></div>
    <div className="richToolbar" role="toolbar" aria-label="Mise en forme du contenu">
      <button type="button" onClick={()=>command("bold")} title="Gras"><b>G</b></button><button type="button" onClick={()=>command("italic")} title="Italique"><i>I</i></button><button type="button" onClick={()=>command("underline")} title="Souligné"><u>S</u></button>
      <button type="button" onClick={()=>command("formatBlock","p")}>Texte</button><button type="button" onClick={()=>command("formatBlock","h2")}>Titre 2</button><button type="button" onClick={()=>command("formatBlock","h3")}>Titre 3</button>
      <button type="button" onClick={()=>command("insertUnorderedList")}>• Liste</button><button type="button" onClick={()=>command("insertOrderedList")}>1. Liste</button><button type="button" onClick={addTable}>Tableau</button><button type="button" onClick={addLink}>Lien</button>
      <label title="Couleur du texte">A <input type="color" onChange={event=>command("foreColor",event.target.value)}/></label><label title="Surlignage">▰ <input type="color" defaultValue="#fff59d" onChange={event=>command("hiliteColor",event.target.value)}/></label>
      <button type="button" onClick={()=>command("undo")}>↶</button><button type="button" onClick={()=>command("redo")}>↷</button><button type="button" onClick={()=>command("removeFormat")}>Effacer le style</button>
    </div>
    <div ref={editorRef} className="richEditor" contentEditable suppressContentEditableWarning onInput={sync} onPaste={paste} data-placeholder="Collez ici le contenu venant de Word ou rédigez directement votre rapport…"/>
    <small>Le collage depuis Word conserve notamment les titres, couleurs, listes et tableaux. L’import DOCX convertit sa structure ; pour une reproduction visuelle très exacte, privilégiez le collage ou l’enregistrement Word au format HTML. Les scripts, formulaires et éléments dangereux sont supprimés.</small>
    {notice&&<p className="richEditorNotice" role="status">{notice}</p>}
  </div>;
}
