#!/usr/bin/env node
/** Versioned design expectations and complete page/variant render coverage. */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractHash } from './content-contract.mjs';
import { diffSnapshots } from './verify-render.mjs';
export { contractHash as designHash };
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.trim().length>0;
const need=(x,message)=>{if(!x)throw new Error(message)};
function keys(x,allowed,label){need(obj(x),`${label} must be an object`);for(const k of Object.keys(x))need(allowed.includes(k),`${label}: unknown field ${k}`)}
function list(x,label){need(Array.isArray(x)&&x.length>0&&x.every(str)&&new Set(x).size===x.length,`${label} must contain distinct strings`)}
function styles(x,label){need(obj(x)&&Object.keys(x).length>0&&Object.values(x).every(v=>str(v)&&!/(?:var|calc)\(/.test(v)),`${label} must contain resolved computed CSS property strings`)}
const own=(x,k)=>Object.hasOwn(x,k);
export function validateDesign(c){
 keys(c,['schemaVersion','id','revision','source','theme','variants','tokens','rules','coverage','pages','pilotPages','exceptions','pending'],'design contract');
 need(c.schemaVersion===1&&str(c.id)&&Number.isInteger(c.revision)&&c.revision>0,'Invalid design identity/version');
 keys(c.source,['reference','inspiration','version','capturedAt'],'source');
 need(Object.values(c.source).length===4&&Object.values(c.source).every(str)&&Number.isFinite(Date.parse(c.source.capturedAt)),'Pin the reference, inspiration/version and capture time');
 keys(c.theme,['selector','attribute','darkValue','lightValue'],'theme');
 need(['selector','attribute','darkValue','lightValue'].every(k=>str(c.theme[k]))&&c.theme.darkValue!==c.theme.lightValue,'theme requires distinct observed dark/light values');
 need(Array.isArray(c.pending)&&c.pending.length===0,'Resolve pending design decisions before validation');
 need(Array.isArray(c.variants)&&c.variants.length>=4,'Declare desktop/mobile in light/dark');
 const variants=new Set();
 for(const v of c.variants){
  keys(v,['id','mode','width','height'],'variant');
  need(str(v.id)&&!variants.has(v.id)&&['light','dark'].includes(v.mode),'Invalid/duplicate variant');variants.add(v.id);
  need(Number.isInteger(v.width)&&v.width>0&&Number.isInteger(v.height)&&v.height>0,'Variant dimensions must be positive integers');
 }
 for(const mode of ['light','dark'])for(const size of ['mobile','desktop'])need(c.variants.some(v=>v.mode===mode&&(size==='mobile'?v.width<=430:v.width>=1280)),`Missing ${mode} ${size} variant`);
 need(obj(c.tokens)&&Object.keys(c.tokens).length===variants.size,'Token variants must match viewport/theme variants');
 for(const v of variants){styles(c.tokens[v],`tokens.${v}`);need(Object.keys(c.tokens[v]).every(k=>k.startsWith('--')),'Use CSS custom property names for tokens')}
 need(Array.isArray(c.rules)&&c.rules.length>0,'Design rules are required');const rules=new Map();
 for(const r of c.rules){
  keys(r,['id','category','selector','styles'],'rule');
  need(str(r.id)&&!rules.has(r.id)&&str(r.selector),'Invalid/duplicate rule or empty selector');rules.set(r.id,r);
  need(['typography','color','layout','component'].includes(r.category),'Unknown design rule category');
  need(obj(r.styles)&&Object.keys(r.styles).length===variants.size,'Rule styles must cover every variant');
  for(const v of variants)styles(r.styles[v],`${r.id}.${v}`);
 }
 for(const category of ['typography','color','layout','component'])need(c.rules.some(r=>r.category===category),`Missing ${category} rules`);
 need(Array.isArray(c.coverage)&&c.coverage.length>0,'Declare selectors/properties that must be classified');
 for(const group of c.coverage){keys(group,['selector','properties'],'coverage');need(str(group.selector),'Coverage selector required');list(group.properties,'coverage.properties')}
 need(Array.isArray(c.pages)&&c.pages.length>0,'Page inventory is required');const pages=new Set();
 for(const p of c.pages){
  keys(p,['id','url','expectedUrl','identity','rules','requiredRules'],'page');need(str(p.id)&&!pages.has(p.id)&&str(p.identity),'Invalid/duplicate page');pages.add(p.id);
  for(const key of ['url','expectedUrl'])need(str(p[key])&&/^https?:$/.test(new URL(p[key]).protocol),`Invalid ${key}`);
  list(p.rules,'page.rules');list(p.requiredRules,'page.requiredRules');
  for(const id of p.rules)need(rules.has(id),`Unknown rule ${id}`);
  for(const id of p.requiredRules)need(p.rules.includes(id),`Required rule ${id} is not applied`);
 }
 list(c.pilotPages,'pilotPages');for(const p of c.pilotPages)need(pages.has(p),`Unknown pilot page ${p}`);
 need(Array.isArray(c.exceptions),'exceptions must be an array');const exceptions=new Set();
 for(const e of c.exceptions){
  keys(e,['page','rule','variant','reason','decision','styles'],'exception');
  need(pages.has(e.page)&&c.pages.find(p=>p.id===e.page).rules.includes(e.rule)&&variants.has(e.variant),'Exception must name a page/rule/variant in scope');
  need(str(e.reason)&&str(e.decision),'Exception needs rationale and a user/design decision reference');
  const key=JSON.stringify([e.page,e.rule,e.variant]);need(!exceptions.has(key),'Duplicate exception');exceptions.add(key);
  styles(e.styles,'exception.styles');for(const k of Object.keys(e.styles))need(own(rules.get(e.rule).styles[e.variant],k),`Exception adds unknown property ${k}`);
 }
 return c;
}
export function designRequest(c,pageId,variantId){
 validateDesign(c);const page=c.pages.find(p=>p.id===pageId),variant=c.variants.find(v=>v.id===variantId);
 need(page&&variant,'Unknown page/variant');
 return {contractId:c.id,contractHash:contractHash(c),page:page.id,variant:variant.id,url:page.url.replaceAll('{mode}',variant.mode),expectedUrl:page.expectedUrl.replaceAll('{mode}',variant.mode),identity:page.identity,theme:c.theme,width:variant.width,height:variant.height,mode:variant.mode,tokens:Object.keys(c.tokens[variant.id]),coverage:c.coverage,rules:page.rules.map(id=>{
  const rule=c.rules.find(r=>r.id===id);const override=c.exceptions.find(e=>e.page===page.id&&e.rule===id&&e.variant===variant.id);
  return {id,selector:rule.selector,required:page.requiredRules.includes(id),properties:Object.keys({...rule.styles[variant.id],...override?.styles})};
 })};
}
function equalStyle(property,expected,actual){
 if(typeof actual!=='string'||!actual.trim())return false;
 const px=/^(-?\d+(?:\.\d+)?)px$/;const a=expected.match(px),b=actual.match(px);
 if(a&&b)return Math.abs(Number(a[1])-Number(b[1]))<=0.1;
 // Exact CSS colors (including alpha) and normalized strings; no permissive color tolerance.
 return diffSnapshots({rule:{[property]:expected}},{rule:{[property]:actual}},{hexTolerance:0}).mismatches.length===0;
}
/**
 * `scope` audits a named subset of the inventory — a migration that finishes one group of pages
 * before the rest can be accepted without either waiting for the whole matrix or deleting pages
 * from the contract to fake a pass. The report keeps `contractCases` alongside the scoped count,
 * so a partial run can never be quoted as full-site acceptance.
 */
export function auditDesign(c,observations,{pilot=false,scope=null}={}){
 validateDesign(c);need(Array.isArray(observations),'Observations must be an array');
 need(!(pilot&&scope),'Choose the pilot page set or an explicit scope, not both');
 if(scope!==null){list(scope,'scope');for(const id of scope)need(c.pages.some(p=>p.id===id),`Unknown scope page ${id}`)}
 const pages=pilot?c.pages.filter(p=>c.pilotPages.includes(p.id)):scope?c.pages.filter(p=>scope.includes(p.id)):c.pages;
 const expected=new Set(pages.flatMap(p=>c.variants.map(v=>JSON.stringify([p.id,v.id]))));
 const seen=new Set(),findings=[];let elements=0,properties=0;
 for(const o of observations){
  const key=JSON.stringify([o.page,o.variant]);need(expected.has(key)&&!seen.has(key),'Unexpected or duplicate page/variant observation');seen.add(key);
  need(o.contractId===c.id&&o.contractHash===contractHash(c),'Stale/different design contract observation');
  const request=designRequest(c,o.page,o.variant),v=c.variants.find(v=>v.id===o.variant);
  need(o.url===request.expectedUrl,`Unexpected final URL for ${o.page}`);
  need(o.width===v.width&&o.height===v.height&&o.mode===v.mode,'Wrong viewport or observed theme');
  need(Number.isFinite(Date.parse(o.capturedAt))&&Date.parse(o.capturedAt)>=Date.parse(c.source.capturedAt),'Missing/stale capture timestamp');
  need(o.fontsReady===true&&Number.isInteger(o.identityMatches)&&o.identityMatches>0,'Fonts/page identity not ready');
  need(Number.isFinite(o.scrollWidth)&&o.scrollWidth>0,'Missing page geometry');
  if(o.scrollWidth>o.width+1)findings.push({page:o.page,variant:o.variant,issue:'horizontal-overflow'});
  need(obj(o.tokens)&&Object.keys(o.tokens).length===request.tokens.length,'Incomplete token measurements');
  for(const token of request.tokens){properties++;if(!equalStyle(token,c.tokens[v.id][token],o.tokens[token]))findings.push({page:o.page,variant:o.variant,token,expected:c.tokens[v.id][token],actual:o.tokens[token]})}
  need(Array.isArray(o.rules)&&o.rules.length===request.rules.length,'Incomplete rule measurements');const measured=new Map(o.rules.map(r=>[r.id,r]));need(measured.size===o.rules.length,'Duplicate rule measurements');
  for(const rule of request.rules){
   const measuredRule=measured.get(rule.id);need(measuredRule&&Array.isArray(measuredRule.elements),'Missing rule elements');
   if(rule.required&&measuredRule.elements.length===0)findings.push({page:o.page,variant:o.variant,rule:rule.id,issue:'zero-matches'});
   const base=c.rules.find(r=>r.id===rule.id).styles[v.id],exception=c.exceptions.find(e=>e.page===o.page&&e.rule===rule.id&&e.variant===v.id),values={...base,...exception?.styles};
   need(new Set(measuredRule.elements.map(e=>e.path)).size===measuredRule.elements.length,'Duplicate measured element identity');
   for(const element of measuredRule.elements){
    elements++;need(str(element.path)&&obj(element.styles),'Missing element identity/styles');
    for(const [property,value]of Object.entries(values)){properties++;if(!equalStyle(property,value,element.styles[property]))findings.push({page:o.page,variant:o.variant,rule:rule.id,element:element.path,property,expected:value,actual:element.styles[property]})}
   }
  }
  need(Array.isArray(o.unclassified)&&Number.isInteger(o.coverageCount)&&o.coverageCount>0,'Missing or empty classification coverage');
  for(const item of o.unclassified)findings.push({page:o.page,variant:o.variant,issue:'unclassified',...item});
 }
 const missing=[...expected].filter(k=>!seen.has(k)).map(k=>JSON.parse(k));
 need(elements>0&&properties>0,'No elements were measured');
 return {ok:missing.length===0&&findings.length===0,scope:pilot?'pilot':scope?'partial':'full',expectedCases:expected.size,observedCases:seen.size,contractCases:c.pages.length*c.variants.length,scopePages:pages.map(p=>p.id),elements,properties,missing,findings,contractHash:contractHash(c)};
}
const main=process.argv[1]&&realpathSync(resolve(process.argv[1]))===fileURLToPath(import.meta.url);
if(main){try{
 const [command,file,...args]=process.argv.slice(2),c=validateDesign(JSON.parse(readFileSync(file,'utf8')));let result;
 if(command==='validate'&&!args.length)result={ok:true,contractHash:contractHash(c),cases:c.pages.length*c.variants.length};
 else if(command==='request'&&args.length===2)result=designRequest(c,...args);
 else if(command==='audit'&&args.length===1)result=auditDesign(c,JSON.parse(readFileSync(args[0],'utf8')));
 else if(command==='audit'&&args.length===2&&args[1].startsWith('--scope='))result=auditDesign(c,JSON.parse(readFileSync(args[0],'utf8')),{scope:args[1].slice('--scope='.length).split(',').map(s=>s.trim()).filter(Boolean)});
 else if(command==='pilot'&&args.length===1)result=auditDesign(c,JSON.parse(readFileSync(args[0],'utf8')),{pilot:true});
 else throw new Error('Usage: design-contract.mjs validate CONTRACT | request CONTRACT PAGE VARIANT | pilot CONTRACT OBSERVATIONS | audit CONTRACT OBSERVATIONS [--scope=PAGE_ID,...]');
 console.log(JSON.stringify(result,null,2));if(result.ok===false)process.exitCode=1;
 }catch(error){console.error(error.message);process.exitCode=1}}
