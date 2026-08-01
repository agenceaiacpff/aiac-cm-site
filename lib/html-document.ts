export const HTML_DOCUMENT_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "media-src data: blob: https:",
  "font-src data: https:",
  "style-src 'unsafe-inline'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const securityHead = `<meta http-equiv="Content-Security-Policy" content="${HTML_DOCUMENT_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1">`;

/** Place le document importé dans une page autonome protégée, destinée à un iframe sandboxé. */
export function buildSandboxDocument(html:string){
  const withoutDoctype=html.replace(/^\s*<!doctype[^>]*>/i,"").trim();
  if(/<html[\s>]/i.test(withoutDoctype)){
    if(/<head[\s>]/i.test(withoutDoctype))return `<!doctype html>${withoutDoctype.replace(/<head([^>]*)>/i,`<head$1>${securityHead}`)}`;
    return `<!doctype html>${withoutDoctype.replace(/<html([^>]*)>/i,`<html$1><head>${securityHead}</head>`)}`;
  }
  return `<!doctype html><html><head>${securityHead}</head><body>${withoutDoctype}</body></html>`;
}
