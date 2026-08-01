import "server-only";
import juice from "juice";
import sanitizeHtml from "sanitize-html";

const richTags=Array.from(new Set([
  ...sanitizeHtml.defaults.allowedTags,
  "article","section","header","footer","figure","figcaption","mark","details","summary",
  "table","thead","tbody","tfoot","tr","th","td","caption","colgroup","col",
  "video","audio","source","iframe"
]));

const richAttributes:Record<string,string[]>={
  "*":["class","style","title","dir","lang"],
  a:["href","name","target","rel"],
  img:["src","alt","width","height","loading"],
  table:["width","height","border","cellpadding","cellspacing","summary"],
  th:["colspan","rowspan","scope","width","height"],td:["colspan","rowspan","width","height"],
  col:["span","width"],ol:["start","type"],li:["value"],
  video:["src","controls","poster","width","height","preload"],audio:["src","controls","preload"],
  source:["src","type"],iframe:["src","title","width","height","loading","allow","allowfullscreen"]
};

const color=/^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i;
const length=/^(?:auto|0|\d+(?:\.\d+)?(?:px|pt|pc|em|rem|%|cm|mm|in))$/i;
const spacing=/^(?:auto|0|-?\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\s+(?:auto|0|-?\d+(?:\.\d+)?(?:px|pt|em|rem|%))){0,3}$/i;

const finalOptions:sanitizeHtml.IOptions={
  allowedTags:richTags,
  allowedAttributes:richAttributes,
  allowedSchemes:["http","https","mailto","tel"],
  allowedSchemesByTag:{img:["http","https","data"],video:["http","https"],audio:["http","https"],source:["http","https"]},
  allowedIframeHostnames:["www.youtube.com","youtube.com","www.youtube-nocookie.com","player.vimeo.com"],
  allowedStyles:{
    "*":{
      color:[color],"background-color":[color],"text-align":[/^(?:left|right|center|justify|start|end)$/],
      "font-weight":[/^(?:normal|bold|bolder|lighter|[1-9]00)$/],"font-style":[/^(?:normal|italic|oblique)$/],
      "text-decoration":[/^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/],
      "font-size":[length],"font-family":[/^[\w\s,'"-]+$/],"line-height":[/^(?:normal|\d+(?:\.\d+)?|\d+(?:\.\d+)?(?:px|pt|em|rem|%))$/],
      width:[length],height:[length],"max-width":[length],"min-width":[length],"max-height":[length],"min-height":[length],
      margin:[spacing],"margin-top":[length],"margin-right":[length],"margin-bottom":[length],"margin-left":[length],
      padding:[spacing],"padding-top":[length],"padding-right":[length],"padding-bottom":[length],"padding-left":[length],
      border:[/^(?:none|0|\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double)\s+(?:#[0-9a-f]{3,8}|[a-z]+))$/i],
      "border-width":[spacing],"border-style":[/^(?:(?:none|solid|dashed|dotted|double)(?:\s+|$)){1,4}$/],"border-color":[/^[#\w\s]+$/],
      "border-collapse":[/^(?:collapse|separate)$/],"border-spacing":[spacing],"border-radius":[spacing],
      display:[/^(?:block|inline|inline-block|table|table-row|table-cell|flex|grid|none)$/],
      "vertical-align":[/^(?:baseline|sub|super|top|middle|bottom|text-top|text-bottom)$/],
      "list-style-type":[/^(?:disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|none)$/],
      "white-space":[/^(?:normal|nowrap|pre|pre-wrap|pre-line)$/]
    }
  },
  transformTags:{a:(tagName,attribs)=>({tagName,attribs:{...attribs,target:attribs.target||"_blank",rel:"noopener noreferrer"}})}
};

export function sanitizePublicHtml(value:string){
  const preliminary=sanitizeHtml(value,{
    allowedTags:[...richTags,"style"],allowedAttributes:richAttributes,allowedSchemes:["http","https","mailto","tel"],
    allowedSchemesByTag:{img:["http","https","data"]},allowVulnerableTags:true
  });
  const inlined=juice(preliminary,{
    applyStyleTags:true,removeStyleTags:true,preserveMediaQueries:false,preserveFontFaces:false,preserveKeyFrames:false,
    applyAttributesTableElements:true,applyWidthAttributes:true,applyHeightAttributes:true
  });
  return sanitizeHtml(inlined,finalOptions);
}
