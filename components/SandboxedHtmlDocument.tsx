"use client";

import { useEffect, useRef, useState } from "react";
import { buildSandboxDocument } from "@/lib/html-document";

export default function SandboxedHtmlDocument({html,title,className=""}:{html:string;title:string;className?:string}){
  const frameRef=useRef<HTMLIFrameElement>(null);
  const observerRef=useRef<ResizeObserver|null>(null);
  const [height,setHeight]=useState(520);

  useEffect(()=>()=>observerRef.current?.disconnect(),[]);

  function resize(){
    const frame=frameRef.current;const doc=frame?.contentDocument;if(!doc)return;
    const measure=()=>{
      const next=Math.max(doc.documentElement?.scrollHeight||0,doc.body?.scrollHeight||0,520);
      setHeight(Math.min(next+4,30000));
    };
    observerRef.current?.disconnect();measure();
    if(typeof ResizeObserver!=="undefined"){
      observerRef.current=new ResizeObserver(measure);
      if(doc.body)observerRef.current.observe(doc.body);
    }
    for(const image of Array.from(doc.images))image.addEventListener("load",measure,{once:true});
  }

  return <iframe ref={frameRef} className={`sandboxedHtmlDocument ${className}`.trim()} title={title} sandbox="allow-same-origin" srcDoc={buildSandboxDocument(html)} style={{height}} onLoad={resize}/>;
}
