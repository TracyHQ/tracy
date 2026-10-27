/** Read-only DOM callback. Pass a designRequest to the supported browser tool's evaluate API. */
export function captureDesign(request) {
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
 const path=e=>{let parts=[];while(e&&e.nodeType===1){let n=1,s=e;while((s=s.previousElementSibling))n++;parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${n})`);e=e.parentElement}return parts.join(' > ')};
 const measured=new Map();
 const rules=request.rules.map(rule=>({id:rule.id,elements:Array.from(document.querySelectorAll(rule.selector)).filter(visible).map(e=>{
  const style=getComputedStyle(e);const set=measured.get(e)||new Set();rule.properties.forEach(p=>set.add(p));measured.set(e,set);
  return {path:path(e),styles:Object.fromEntries(rule.properties.map(p=>[p,style.getPropertyValue(p.startsWith('--')?p:p.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()))]))};
 })}));
 const unclassified=[];let coverageCount=0;
 for(const group of request.coverage)for(const e of document.querySelectorAll(group.selector)){
  if(!visible(e))continue;coverageCount++;
  const missing=group.properties.filter(p=>!measured.get(e)?.has(p));if(missing.length)unclassified.push({element:path(e),properties:missing});
 }
 const rootStyle=getComputedStyle(document.documentElement),theme=document.querySelector(request.theme.selector)?.getAttribute(request.theme.attribute);
 return {contractId:request.contractId,contractHash:request.contractHash,page:request.page,variant:request.variant,capturedAt:new Date().toISOString(),url:location.href,width:innerWidth,height:innerHeight,mode:theme===request.theme.darkValue?'dark':theme===request.theme.lightValue?'light':'unknown',fontsReady:document.fonts.status==='loaded',identityMatches:Array.from(document.querySelectorAll(request.identity)).filter(visible).length,scrollWidth:document.documentElement.scrollWidth,tokens:Object.fromEntries(request.tokens.map(k=>[k,rootStyle.getPropertyValue(k).trim()])),rules,coverageCount,unclassified};
}
