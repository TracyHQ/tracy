window.__ModuleLoader__.load({
	id: "@tracy/dsh-build-chat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";var R=Object.defineProperty;var ee=Object.getOwnPropertyDescriptor;var te=Object.getOwnPropertyNames;var ne=Object.prototype.hasOwnProperty;var oe=(t,e)=>{for(var n in e)R(t,n,{get:e[n],enumerable:!0})},ae=(t,e,n,a)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of te(e))!ne.call(t,i)&&i!==n&&R(t,i,{get:()=>e[i],enumerable:!(a=ee(e,i))||a.enumerable});return t};var re=t=>ae(R({},"__esModule",{value:!0}),t);var Se={};oe(Se,{ADD_SITE_HREF:()=>V,BUILD_CHAT_NS:()=>P,BUILD_DRAFT_PLAN_EDITS_PATH:()=>H,BuildProgress:()=>K,BuildStopped:()=>Y,PlanCard:()=>W,TemplateCard:()=>X,apply:()=>Ne,english:()=>M,inject:()=>ke,savePlanEdit:()=>G,saveTemplateChoice:()=>J});module.exports=re(Se);var q=`
.tv-bc-card, .tv-bc-todo, .tv-bc-notice, .tv-bc-plan {
  box-sizing: border-box; container-type: inline-size; font-size: 14px; line-height: 1.5;
  color: var(--card-foreground); background: var(--card); border: 1px solid var(--border);
}
.tv-bc-card *, .tv-bc-todo *, .tv-bc-notice *, .tv-bc-plan * { box-sizing: border-box; }
.tv-bc-muted { color: var(--muted-foreground); }
.tv-bc-small { font-size: 12.5px; }

.tv-bc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 14px;
  border-radius: 10px; border: 1px solid var(--input); background: var(--card); color: var(--card-foreground);
  font: inherit; font-weight: 500; font-size: 13px; cursor: pointer; text-decoration: none;
}
.tv-bc-btn:hover { background: color-mix(in oklab, var(--foreground) 5%, var(--card)); }
.tv-bc-btn[data-primary] { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
.tv-bc-btn[data-primary]:hover { background: color-mix(in oklab, var(--primary-foreground) 8%, var(--primary)); }
.tv-bc-btn:disabled { opacity: .45; cursor: default; }
.tv-bc-btn:focus-visible, .tv-bc-tpl:focus-visible, .tv-bc-todo-head:focus-visible {
  outline: 1px solid var(--ring); outline-offset: 0;
}

.tv-bc-badge {
  font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 6px; font-weight: 500;
  background: color-mix(in oklab, var(--primary) 14%, var(--card)); color: var(--primary);
}
.tv-bc-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 0 7px; border-radius: 999px; white-space: nowrap;
  font-size: 11.5px; line-height: 18px; border: 1px solid color-mix(in oklab, var(--success) 45%, var(--card));
  color: var(--success);
}

/* Template choice card */
.tv-bc-card { border-radius: var(--radius-lg, 16px); padding: 12px; }
.tv-bc-tgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.tv-bc-tpl {
  display: flex; flex-direction: column; gap: 8px; padding: 8px; text-align: left; cursor: pointer;
  border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: inherit; font: inherit;
}
.tv-bc-tpl:hover { border-color: var(--input); }
.tv-bc-tpl[aria-pressed="true"] { border-color: var(--primary); }
.tv-bc-tpl[aria-disabled="true"] { cursor: default; }
.tv-bc-thumb {
  display: block; width: 100%; aspect-ratio: 16 / 10; border-radius: 8px; object-fit: cover; background: var(--muted);
}
.tv-bc-nm { display: flex; align-items: center; gap: 6px; font-weight: 500; }
.tv-bc-why { color: var(--muted-foreground); font-size: 12.5px; line-height: 1.45; }
.tv-bc-tfoot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.tv-bc-grow { flex: 1; min-width: 160px; }
.tv-bc-error { color: var(--destructive); font-size: 12.5px; }
.tv-bc-none p { margin: 0 0 4px; }
.tv-bc-none .tv-bc-tfoot { margin-top: 8px; }
@container (max-width: 600px) {
  .tv-bc-tgrid { grid-template-columns: 1fr; }
  .tv-bc-tpl { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 4px 10px; align-items: start; }
  .tv-bc-tpl .tv-bc-thumb { grid-row: span 2; aspect-ratio: 4 / 3; }
}

/* Status dot: grey waiting, green done, red failed, a terracotta ring turning while it runs */
.tv-bc-sd { width: 14px; height: 14px; display: grid; place-items: center; flex: none; }
.tv-bc-sd::before {
  content: ""; width: 7px; height: 7px; border-radius: 50%;
  background: color-mix(in oklab, var(--muted-foreground) 45%, var(--card));
}
.tv-bc-sd[data-s="done"]::before { background: var(--success); }
.tv-bc-sd[data-s="failed"]::before { background: var(--destructive); }
.tv-bc-sd[data-s="running"]::before {
  width: 10px; height: 10px; background: transparent; border: 2px solid var(--primary);
  border-right-color: transparent; animation: tv-bc-spin .8s linear infinite;
}
@keyframes tv-bc-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tv-bc-sd[data-s="running"]::before { animation: none; } }

/* Build task list: dsh TodoPanel's shape with a clock in its head */
.tv-bc-todo { border-radius: var(--radius-lg, 16px); padding: 6px 12px 8px; }
.tv-bc-todo-head {
  display: flex; align-items: center; gap: 10px; min-height: 30px; width: 100%; padding: 0; border: 0;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.tv-bc-todo-icon { display: grid; place-items: center; flex: none; color: var(--muted-foreground); }
.tv-bc-todo-title { font-weight: 500; font-size: 13px; flex: none; }
.tv-bc-todo-progress {
  flex: 1; min-width: 0; color: var(--muted-foreground); font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tv-bc-clock {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px;
  color: var(--muted-foreground); font-variant-numeric: tabular-nums;
}
.tv-bc-todo ul {
  list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px;
  max-height: 240px; overflow-y: auto;
}
.tv-bc-todo li { display: flex; align-items: center; gap: 8px; font-size: 13px; min-height: 24px; }
.tv-bc-todo li[data-s="done"] .tv-bc-c, .tv-bc-todo li[data-note="not-started"] .tv-bc-c { color: var(--muted-foreground); }
.tv-bc-todo li[data-s="failed"] .tv-bc-c { color: var(--destructive); }
.tv-bc-todo .tv-bc-r { margin-left: auto; color: var(--muted-foreground); font-size: 12px; white-space: nowrap; }
@container (max-width: 560px) { .tv-bc-todo ul { max-height: 132px; } }

/* Could not finish notice */
.tv-bc-notice { border-radius: var(--radius-lg, 16px); padding: 12px 14px; }
.tv-bc-notice-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.tv-bc-notice p { margin: 6px 0 0; }
.tv-bc-notice ul { margin: 6px 0 0; padding-left: 18px; }
.tv-bc-notice li { margin: 2px 0; }
.tv-bc-notice .tv-bc-team { display: flex; align-items: center; gap: 4px; margin-top: 8px; }

/* Plan card: labelled values in sections, the approved mock's plan card */
.tv-bc-plan { border-radius: var(--radius-lg, 16px); overflow: hidden; }
.tv-bc-plan-h {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.tv-bc-plan-t { margin: 0; font-weight: 600; font-size: 15px; flex: 1 1 auto; min-width: 0; }
.tv-bc-chip[data-plain] { border-color: var(--border); color: var(--muted-foreground); }
.tv-bc-plan-err { margin: 0; padding: 8px 14px; border-bottom: 1px solid var(--border); }
.tv-bc-plan-sec { padding: 10px 14px 12px; border-bottom: 1px solid var(--border); }
.tv-bc-plan-sec:last-child { border-bottom: 0; }
.tv-bc-plan-sec h4 {
  margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--muted-foreground);
  letter-spacing: .03em; text-transform: uppercase;
}
.tv-bc-kv { display: grid; grid-template-columns: 150px minmax(0, 1fr); align-items: start; gap: 2px 12px; }
.tv-bc-k { color: var(--muted-foreground); font-size: 13px; padding: 5px 0; }
.tv-bc-cell { min-width: 0; }
.tv-bc-val { padding: 4px 0; min-width: 0; }
.tv-bc-val-row { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.tv-bc-v { display: inline-flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.tv-bc-src { font-size: 11.5px; color: var(--muted-foreground); white-space: nowrap; }
.tv-bc-note { font-size: 12.5px; line-height: 1.45; color: var(--muted-foreground); margin-top: 2px; }
.tv-bc-swatch {
  width: 14px; height: 14px; border-radius: 4px; flex: none;
  border: 1px solid color-mix(in oklab, var(--foreground) 15%, transparent);
}
.tv-bc-choice { display: flex; flex-direction: column; gap: 4px; }
.tv-bc-opt {
  display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 4px 8px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 8px;
}
.tv-bc-opt:hover { background: color-mix(in oklab, var(--foreground) 4%, var(--card)); }
.tv-bc-opt[data-checked] { border-color: var(--primary); }
.tv-bc-opt input { margin: 0; flex: none; accent-color: var(--primary); }
.tv-bc-opt input:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; }
.tv-bc-opt:has(input:disabled) { cursor: default; opacity: .7; }
.tv-bc-page { border: 1px solid var(--border); border-radius: 12px; margin-top: 8px; }
.tv-bc-ph { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-weight: 500; }
.tv-bc-n { color: var(--muted-foreground); font-weight: 400; font-size: 12.5px; }
.tv-bc-page ol { margin: 0; padding: 0 12px 8px; list-style: none; counter-reset: tv-bc-b; }
.tv-bc-page li {
  display: grid; grid-template-columns: 22px 130px minmax(0, 1fr); align-items: start; gap: 0 8px;
  counter-increment: tv-bc-b;
}
.tv-bc-page li::before {
  content: counter(tv-bc-b); color: var(--muted-foreground); font-size: 12px; padding-top: 6px; text-align: right;
}
.tv-bc-bn { font-size: 13px; padding-top: 5px; }
.tv-bc-plain { margin: 0; padding-left: 18px; font-size: 13px; }
.tv-bc-plain li { margin: 2px 0; }
.tv-bc-dropped { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tv-bc-dropped li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.tv-bc-what { font-weight: 500; }
.tv-bc-x { color: var(--muted-foreground); margin-top: 2px; display: grid; place-items: center; }
@container (max-width: 560px) {
  .tv-bc-kv { grid-template-columns: 1fr; gap: 0; }
  .tv-bc-kv .tv-bc-k { padding-top: 6px; padding-bottom: 0; }
  .tv-bc-page li { grid-template-columns: 18px minmax(0, 1fr); }
  .tv-bc-page li .tv-bc-val { grid-column: 2; }
  .tv-bc-src { white-space: normal; text-align: right; }
}
`;var P="tracy-build-chat",I={"template.list":"Designs for your site","template.recommended":"Recommended","template.later":"You can change the design later.","template.use":"Use {name}","template.chosen":"Chosen: {name}","template.saveFailed":"Your choice was not saved. Try again.","template.none":"No ready design fits your business yet.","template.noneNext":"You can still add your site from Add site.","template.openAddSite":"Open Add site","progress.title.build":"Building your site","progress.title.partial":"Updating your site","progress.done":"{count} completed","progress.running":"{count} in progress","progress.pending":"{count} pending","progress.failed":"{count} failed","progress.state.done":"Completed","progress.state.running":"In progress","progress.state.pending":"Pending","progress.state.failed":"Failed","progress.note.failed":"Failed","progress.note.failedTwice":"Failed twice","progress.note.notStarted":"Not started","progress.clock":"Elapsed time","stopped.title":"Your site is not finished yet","stopped.twice":'The step "{step}" failed twice, so I stopped instead of showing you a half built site.',"stopped.once":'The step "{step}" failed, so I stopped instead of showing you a half built site.',"stopped.kept.none":"Kept: your plan and your answers.","stopped.kept.one":"Kept: your plan, your answers and the written page.","stopped.kept.other":"Kept: your plan, your answers and the {count} written pages.","stopped.unchanged":"Your current site is unchanged.","stopped.notified":"The Tracy team has been notified and will reply in this chat. You do not need to do anything.","plan.title":"{name} site plan","plan.design":"Design: {name}","plan.facts":"Business facts","plan.language":"Site language","plan.allSources":"All sources","plan.look":"Look","plan.look.template":"Template","plan.look.accent":"Accent colour","plan.look.logoLight":"Logo on light","plan.look.logoDark":"Logo on dark","plan.look.logoOwn":"Your logo, from {source}","plan.look.logoText":"Your business name as text","plan.services":"Services ({count})","plan.service":"Service {n}","plan.pages":"Pages ({count})","plan.sections.one":"{count} section","plan.sections.other":"{count} sections","plan.fromServices":"From Services","plan.count.service.one":"{count} service","plan.count.service.other":"{count} services","plan.count.person.one":"{count} person","plan.count.person.other":"{count} people","plan.count.quote.one":"{count} quote","plan.count.quote.other":"{count} quotes","plan.count.gallery.one":"{count} photo","plan.count.gallery.other":"{count} photos","plan.count.item.one":"{count} item","plan.count.item.other":"{count} items","plan.pictures":"Pictures","plan.pictures.own":"Your photos","plan.pictures.ownValue":"{count} photos from {from}","plan.pictures.drawn":"Drawn pictures","plan.pictures.drawnValue.one":"{count} picture","plan.pictures.drawnValue.other":"{count} pictures","plan.pictures.drawnNone":"None","plan.assumptions":"Assumptions","plan.leftOut":"Left out","plan.and":"{first} and {last}","plan.saveFailed":"Your change was not saved. Try again."},M=(t,e={})=>I[t].replace(/\{(\w+)\}/g,(n,a)=>String(e[a]??""));var S=require("@deepseek-ai/dsh-client-ui-primitives");var se="tracy-build-plan-edit/v1";var _=t=>t?.[0]?.name??"",$=t=>(t.sources??[]).some(e=>e.kind==="website");function le(t,e){let n=[...e.alternatives].sort((a,i)=>Number($(i))-Number($(a)));return{field:e.field,said:e.said,options:n.map(a=>({value:a.value,source:_(a.sources),selected:a.value===t.value}))}}function ce(t,e,n){let a=t.data??[];if(n.length>0&&a.length===n.length&&n.every(c=>a.includes(c)))return{services:n.map(c=>e.items.find(g=>g.id===c).label)};let i=[],r=[];for(let c of a){let g=e.facts.find(l=>l.id===c);if(g){i.push(g.label);continue}let d=e.items.find(l=>l.id===c);if(!d)continue;let k=d.count??1,w=r.find(l=>l.kind===d.kind);w?w.count+=k:r.push({kind:d.kind,count:k})}return{facts:i,counts:r}}function E(t){let e=new Map((t.assumptions??[]).filter(r=>Array.isArray(r.alternatives)&&/^facts\[[^\]]+\]\.value$/.test(r.field)).map(r=>[r.field,r])),n=t.items.filter(r=>r.kind==="service"),a=n.map(r=>r.id),i=t.facts.find(r=>r.kind==="business.name")?.value??"";return{planId:t.id,revision:t.revision,name:i,facts:t.facts.map(r=>{let c=`facts[${r.id}].value`,g=e.get(c);return{id:r.id,field:c,label:r.label,value:r.value,source:_(r.sources),choice:g?le(r,g):null}}),language:t.language,look:{template:t.look.template.name,accent:t.look.accent,logo:t.look.logo.kind==="own"?{kind:"own",source:t.look.logo.source}:{kind:t.look.logo.kind}},services:n.map(r=>({id:r.id,field:`items[${r.id}].label`,label:r.label,source:_(r.sources)})),pages:t.pages.map(r=>({id:r.id,name:r.name,blocks:r.blocks.map(c=>({id:c.id,label:c.label,reason:c.reason,holds:ce(c,t,a)}))})),pictures:{own:{frames:t.pictures.own.frames,from:[...t.pictures.own.from??[]]},generated:{frames:t.pictures.generated.frames,...t.pictures.generated.reason?{reason:t.pictures.generated.reason}:{}}},assumptions:(t.assumptions??[]).filter(r=>!e.has(r.field)).map(r=>({id:r.id,said:r.said})),leftOut:(t.leftOut??[]).map(r=>({what:r.what,kind:r.kind,reason:r.reason})),counts:{pages:t.pages.length,services:n.length}}}function A(t,e,n){return{schema:se,id:n,plan:{id:t.id,revision:t.revision},changes:e.map(a=>({field:a.field,value:a.value}))}}var pe=new Set(["look","writer","pictures","write"]);function D(t){let e=(t??[]).filter(a=>a?.quickstart==="released"&&a.fits===!0),n=(e.find(a=>a.recommended===!0)??e[0])?.slug??null;return{options:e,chosen:n,none:e.length===0}}function B(t){return{slug:t.slug,name:t.name,version:t.version}}function de(t,e){let n={id:t.id,label:t.label};return t.state==="done"?{...n,state:"done",note:null}:t.state==="failed"?{...n,state:"failed",note:t.attempt>=2?"failed-twice":"failed"}:t.state==="running"&&e===null?{...n,state:"running",note:null}:{...n,state:"pending",note:e==="stopped"?"not-started":null}}function z(t){let e=t?.outcome??null,n=e??t?.events?.at(-1)??null,a=e?.result??null,i=(n?.steps??[]).filter(c=>pe.has(c.kind)).map(c=>de(c,a)),r=c=>i.filter(g=>g.state===c).length;return{kind:n?.run?.kind??"build",items:i,counts:{done:r("done"),running:r("running"),pending:r("pending"),failed:r("failed")},elapsedSeconds:n?.elapsedSeconds??0,running:n!==null&&a===null,result:a}}function F(t){if(t?.result!=="stopped")return null;let e=t.steps??[],n=e.find(a=>a.state==="failed")??e.find(a=>a.id===t.stopped?.step);return{step:n?.label??"",twice:(n?.attempt??0)>=2,writtenPages:e.filter(a=>a.kind==="writer"&&a.state==="done").length,siteUnchanged:!e.some(a=>a.kind==="write"&&a.state==="done"),teamNotified:t.stopped?.teamNotified===!0}}function U(t){let e=Math.max(0,Math.floor(t));return`${Math.floor(e/60)}:${String(e%60).padStart(2,"0")}`}var N=require("react"),m=require("react/jsx-runtime"),ue={failed:"progress.note.failed","failed-twice":"progress.note.failedTwice","not-started":"progress.note.notStarted"},me={done:"progress.state.done",running:"progress.state.running",pending:"progress.state.pending",failed:"progress.state.failed"};function ge(t,e){let[n,a]=(0,N.useState)(()=>({base:t,at:Date.now()})),[i,r]=(0,N.useState)(()=>Date.now());return n.base!==t&&a({base:t,at:Date.now()}),(0,N.useEffect)(()=>{if(!e)return;let c=setInterval(()=>r(Date.now()),1e3);return()=>clearInterval(c)},[e]),e?t+Math.max(0,Math.floor((i-n.at)/1e3)):t}function K({run:t,t:e}){let n=z(t),[a,i]=(0,N.useState)(!0),r=ge(n.elapsedSeconds,n.running);if(n.items.length===0)return null;let c=[n.counts.done>0&&e("progress.done",{count:n.counts.done}),n.counts.running>0&&e("progress.running",{count:n.counts.running}),n.counts.pending>0&&n.result!=="stopped"&&e("progress.pending",{count:n.counts.pending}),n.counts.failed>0&&e("progress.failed",{count:n.counts.failed})].filter(Boolean).join("\u2002\xB7\u2002"),g=e(n.kind==="partial"?"progress.title.partial":"progress.title.build");return(0,m.jsxs)("section",{className:"tv-bc-todo","aria-label":g,"data-result":n.result??"running",children:[(0,m.jsxs)("button",{type:"button",className:"tv-bc-todo-head","aria-expanded":a,onClick:()=>i(d=>!d),children:[(0,m.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:(0,m.jsx)(S.IconChecklistOutlineRegular,{})}),(0,m.jsx)("span",{className:"tv-bc-todo-title",children:g}),(0,m.jsx)("span",{className:"tv-bc-todo-progress",children:c}),(0,m.jsx)("span",{className:"tv-bc-clock",role:"timer","aria-label":e("progress.clock"),children:U(r)}),(0,m.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:a?(0,m.jsx)(S.IconChevronDownOutlineRegular,{}):(0,m.jsx)(S.IconChevronUpOutlineRegular,{})})]}),a&&(0,m.jsx)("ul",{children:n.items.map(d=>(0,m.jsxs)("li",{"data-s":d.state,"data-note":d.note??void 0,children:[(0,m.jsx)("span",{className:"tv-bc-sd","data-s":d.state,role:"img","aria-label":e(me[d.state])}),(0,m.jsx)("span",{className:"tv-bc-c",children:d.label}),d.note!==null&&(0,m.jsx)("span",{className:"tv-bc-r",children:e(ue[d.note])})]},d.id))})]})}var v=require("react/jsx-runtime");function Y({outcome:t,t:e}){let n=F(t);if(n===null)return null;let a=n.writtenPages===0?e("stopped.kept.none"):n.writtenPages===1?e("stopped.kept.one"):e("stopped.kept.other",{count:n.writtenPages});return(0,v.jsxs)("div",{className:"tv-bc-notice",role:"status",children:[(0,v.jsxs)("div",{className:"tv-bc-notice-head",children:[(0,v.jsx)("span",{className:"tv-bc-sd","data-s":"failed","aria-hidden":!0}),e("stopped.title")]}),(0,v.jsx)("p",{children:e(n.twice?"stopped.twice":"stopped.once",{step:n.step})}),(0,v.jsxs)("ul",{children:[(0,v.jsx)("li",{children:a}),n.siteUnchanged&&(0,v.jsx)("li",{children:e("stopped.unchanged")})]}),n.teamNotified&&(0,v.jsx)("p",{className:"tv-bc-team tv-bc-muted tv-bc-small",children:e("stopped.notified")})]})}var j=require("@deepseek-ai/dsh-client-ui-primitives");var x=require("react"),o=require("react/jsx-runtime"),ve=()=>`edit-${globalThis.crypto.randomUUID()}`,L=(t,e,n,a={})=>t(`${e}.${n===1?"one":"other"}`,{count:n,...a});function fe(t,e){return e.length<=1?e[0]??"":t("plan.and",{first:e.slice(0,-1).join(", "),last:e[e.length-1]})}var be=new Set(["service","person","quote","gallery"]);function he(t,e){if("services"in e)return e.services.join(", ");let n=e.facts.map((r,c)=>c===0?r:r.toLowerCase()),a=e.counts.map(r=>L(t,`plan.count.${be.has(r.kind)?r.kind:"item"}`,r.count)),i=[...n,...a].join(", ");return i.charAt(0).toUpperCase()+i.slice(1)}function xe(t,e){try{return new Intl.DisplayNames([e],{type:"language"}).of(t)??t}catch{return t}}function f({field:t,source:e,note:n,children:a}){return(0,o.jsxs)("div",{className:"tv-bc-val","data-field":t,children:[(0,o.jsxs)("div",{className:"tv-bc-val-row",children:[(0,o.jsx)("span",{className:"tv-bc-v",children:a}),e&&(0,o.jsx)("span",{className:"tv-bc-src",children:e})]}),n&&(0,o.jsx)("div",{className:"tv-bc-note",children:n})]})}function we({fact:t,busy:e,onPick:n}){let a=(0,x.useId)();return(0,o.jsxs)("div",{className:"tv-bc-val","data-field":t.field,children:[(0,o.jsx)("div",{className:"tv-bc-choice",role:"radiogroup","aria-label":t.label,"aria-busy":e,children:t.choice.options.map(i=>(0,o.jsxs)("label",{className:"tv-bc-opt","data-checked":i.selected||void 0,children:[(0,o.jsx)("input",{type:"radio",name:a,value:i.value,checked:i.selected,disabled:e,onChange:()=>n(i.value)}),(0,o.jsx)("span",{className:"tv-bc-v",children:i.value}),(0,o.jsx)("span",{className:"tv-bc-src",children:i.source})]},i.value))}),t.choice.options[0]?.selected&&(0,o.jsx)("div",{className:"tv-bc-note",children:t.choice.said})]})}function y({title:t,children:e}){return(0,o.jsxs)("section",{className:"tv-bc-plan-sec","aria-label":t,children:[(0,o.jsx)("h4",{children:t}),e]})}function W({plan:t,t:e,onEdit:n,locale:a="en",newEditId:i=ve}){let[r,c]=(0,x.useState)(t),[g,d]=(0,x.useState)(!1),[k,w]=(0,x.useState)(!1);(0,x.useEffect)(()=>c(t),[t]);let l=E(r),C=async s=>{d(!0),w(!1);try{c(await n(A(r,s,i())))}catch{w(!0)}finally{d(!1)}},T=l.look.logo.kind==="own"?e("plan.look.logoOwn",{source:l.look.logo.source??""}):e("plan.look.logoText");return(0,o.jsxs)("article",{className:"tv-bc-plan","aria-label":e("plan.title",{name:l.name}),children:[(0,o.jsxs)("div",{className:"tv-bc-plan-h",children:[(0,o.jsx)("h3",{className:"tv-bc-plan-t",children:e("plan.title",{name:l.name})}),(0,o.jsx)("span",{className:"tv-bc-chip","data-plain":"",children:e("plan.design",{name:l.look.template})})]}),k&&(0,o.jsx)("p",{className:"tv-bc-plan-err tv-bc-error",role:"alert",children:e("plan.saveFailed")}),(0,o.jsx)(y,{title:e("plan.facts"),children:(0,o.jsxs)("div",{className:"tv-bc-kv",children:[l.facts.map(s=>(0,o.jsx)(h,{label:s.label,children:s.choice?(0,o.jsx)(we,{fact:s,busy:g,onPick:u=>{u!==s.value&&C([{field:s.field,value:u}])}}):(0,o.jsx)(f,{field:s.field,source:s.source,children:s.value})},s.id)),(0,o.jsx)(h,{label:e("plan.language"),children:(0,o.jsx)(f,{field:"language",source:e("plan.allSources"),children:xe(l.language,a)})})]})}),(0,o.jsx)(y,{title:e("plan.look"),children:(0,o.jsxs)("div",{className:"tv-bc-kv",children:[(0,o.jsx)(h,{label:e("plan.look.template"),children:(0,o.jsx)(f,{field:"look.template",children:l.look.template})}),(0,o.jsx)(h,{label:e("plan.look.accent"),children:(0,o.jsxs)(f,{field:"look.accent",children:[(0,o.jsx)("span",{className:"tv-bc-swatch",style:{background:l.look.accent},"aria-hidden":!0}),l.look.accent]})}),(0,o.jsx)(h,{label:e("plan.look.logoLight"),children:(0,o.jsx)(f,{field:"look.logo",children:T})}),(0,o.jsx)(h,{label:e("plan.look.logoDark"),children:(0,o.jsx)(f,{field:"look.logo",children:T})})]})}),(0,o.jsx)(y,{title:e("plan.services",{count:l.services.length}),children:(0,o.jsx)("div",{className:"tv-bc-kv",children:l.services.map((s,u)=>(0,o.jsx)(h,{label:e("plan.service",{n:u+1}),children:(0,o.jsx)(f,{field:s.field,source:s.source,children:s.label})},s.id))})}),(0,o.jsx)(y,{title:e("plan.pages",{count:l.pages.length}),children:l.pages.map(s=>(0,o.jsxs)("div",{className:"tv-bc-page","data-page":s.id,children:[(0,o.jsxs)("div",{className:"tv-bc-ph",children:[s.name,(0,o.jsx)("span",{className:"tv-bc-n",children:L(e,"plan.sections",s.blocks.length)})]}),(0,o.jsx)("ol",{children:s.blocks.map(u=>(0,o.jsxs)("li",{children:[(0,o.jsx)("span",{className:"tv-bc-bn",children:u.label}),(0,o.jsx)(f,{field:`pages[${s.id}].blocks[${u.id}].data`,..."services"in u.holds?{source:e("plan.fromServices")}:{},note:u.reason,children:he(e,u.holds)})]},u.id))})]},s.id))}),(0,o.jsx)(y,{title:e("plan.pictures"),children:(0,o.jsxs)("div",{className:"tv-bc-kv",children:[(0,o.jsx)(h,{label:e("plan.pictures.own"),children:(0,o.jsx)(f,{children:e("plan.pictures.ownValue",{count:l.pictures.own.frames,from:fe(e,l.pictures.own.from)})})}),(0,o.jsx)(h,{label:e("plan.pictures.drawn"),children:(0,o.jsx)(f,{field:"pictures.generated.frames",...l.pictures.generated.reason?{note:l.pictures.generated.reason}:{},children:l.pictures.generated.frames===0?e("plan.pictures.drawnNone"):L(e,"plan.pictures.drawnValue",l.pictures.generated.frames)})})]})}),l.assumptions.length>0&&(0,o.jsx)(y,{title:e("plan.assumptions"),children:(0,o.jsx)("ul",{className:"tv-bc-plain",children:l.assumptions.map(s=>(0,o.jsx)("li",{children:s.said},s.id))})}),l.leftOut.length>0&&(0,o.jsx)(y,{title:e("plan.leftOut"),children:(0,o.jsx)("ul",{className:"tv-bc-dropped",children:l.leftOut.map(s=>(0,o.jsxs)("li",{children:[(0,o.jsx)("span",{className:"tv-bc-x",children:(0,o.jsx)(j.IconCloseOutlineRegular,{"aria-hidden":!0})}),(0,o.jsxs)("span",{children:[(0,o.jsxs)("span",{className:"tv-bc-what",children:[s.what,"."]})," ",(0,o.jsx)("span",{className:"tv-bc-muted",children:s.reason})]})]},s.what))})})]})}function h({label:t,children:e}){return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("div",{className:"tv-bc-k",children:t}),(0,o.jsx)("div",{className:"tv-bc-cell",children:e})]})}var H="/api/build-draft/plan-edits";async function G(t,e=fetch){let n=await e(H,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({edit:t})}),a=await n.json().catch(()=>null);if(!n.ok||!a?.draft?.plan)throw new Error(String(a?.code??n.status));return a.draft.plan}var ye="/api/build-draft/template";async function J(t,e=fetch){let n=await e(ye,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({template:t})}),a=await n.json().catch(()=>null);if(!n.ok)throw new Error(String(a?.code??n.status));return a?.draft??null}var Q=require("@deepseek-ai/dsh-client-ui-primitives");var O=require("react"),p=require("react/jsx-runtime"),V="?tab=tracy%3Aadd-site";function X({templates:t,t:e,onChoose:n,chosen:a=null,addSiteHref:i=V}){let r=D(t),[c,g]=(0,O.useState)(a??r.chosen),[d,k]=(0,O.useState)(a),[w,l]=(0,O.useState)(!1),[C,T]=(0,O.useState)(!1);if(r.none)return(0,p.jsxs)("div",{className:"tv-bc-card tv-bc-none",role:"status",children:[(0,p.jsx)("p",{children:e("template.none")}),(0,p.jsx)("p",{className:"tv-bc-muted",children:e("template.noneNext")}),(0,p.jsx)("div",{className:"tv-bc-tfoot",children:(0,p.jsx)("a",{className:"tv-bc-btn",href:i,children:e("template.openAddSite")})})]});let s=d!==null,u=r.options.find(b=>b.slug===(d??c))??r.options[0],Z=async()=>{l(!0),T(!1);try{await n(B(u)),k(u.slug)}catch{T(!0)}finally{l(!1)}};return(0,p.jsxs)("div",{className:"tv-bc-card",children:[(0,p.jsx)("div",{className:"tv-bc-tgrid",role:"group","aria-label":e("template.list"),children:r.options.map(b=>(0,p.jsxs)("button",{type:"button",className:"tv-bc-tpl","aria-pressed":u.slug===b.slug,"aria-disabled":s||void 0,onClick:()=>{s||g(b.slug)},children:[(0,p.jsx)("img",{className:"tv-bc-thumb",src:b.picture,alt:"",loading:"lazy"}),(0,p.jsxs)("span",{className:"tv-bc-nm",children:[b.name,b.recommended===!0&&(0,p.jsx)("span",{className:"tv-bc-badge",children:e("template.recommended")})]}),(0,p.jsx)("span",{className:"tv-bc-why",children:b.reason})]},b.slug))}),(0,p.jsx)("div",{className:"tv-bc-tfoot",children:s?(0,p.jsxs)("span",{className:"tv-bc-chip",children:[(0,p.jsx)(Q.IconCheckOutlineRegular,{"aria-hidden":!0}),e("template.chosen",{name:u.name})]}):(0,p.jsxs)(p.Fragment,{children:[(0,p.jsx)("span",{className:C?"tv-bc-grow tv-bc-error":"tv-bc-grow tv-bc-muted tv-bc-small",role:"status",children:e(C?"template.saveFailed":"template.later")}),(0,p.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",disabled:w,onClick:Z,children:e("template.use",{name:u.name})})]})})]})}var ke=["locale"];function Ne(t){t.effect(()=>{let e="tracy-build-chat-css";if(document.getElementById(e))return;let n=document.createElement("style");return n.id=e,n.textContent=q,document.head.appendChild(n),()=>n.remove()},"tracy-build-chat: styles"),t.effect(()=>t.locale.register(P,{en:I}),"tracy-build-chat: dictionaries")}

		return module.exports;
	}
});
