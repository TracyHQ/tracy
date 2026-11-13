window.__ModuleLoader__.load({
	id: "@tracy/dsh-build-chat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";var U=Object.defineProperty;var ke=Object.getOwnPropertyDescriptor;var Ne=Object.getOwnPropertyNames;var Se=Object.prototype.hasOwnProperty;var Te=(e,t)=>{for(var a in t)U(e,a,{get:t[a],enumerable:!0})},Ce=(e,t,a,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of Ne(t))!Se.call(e,s)&&s!==a&&U(e,s,{get:()=>t[s],enumerable:!(n=ke(t,s))||n.enumerable});return e};var Oe=e=>Ce(U({},"__esModule",{value:!0}),e);var Ye={};Te(Ye,{ADD_SITE_HREF:()=>X,BUILD_CHAT_NS:()=>B,BUILD_DRAFT_PLAN_EDITS_PATH:()=>J,BUILD_DRAFT_PLAN_UNDO_PATH:()=>Q,BuildProgress:()=>le,BuildStopped:()=>ce,PlanCard:()=>ve,TemplateCard:()=>xe,apply:()=>je,english:()=>ie,inject:()=>Ke,savePlanEdit:()=>fe,saveTemplateChoice:()=>be,undoPlanEdit:()=>me});module.exports=Oe(Ye);var re=`
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
.tv-bc-btn[data-ghost] { border-color: transparent; background: transparent; }
.tv-bc-btn[data-ghost]:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground) 5%, var(--card)); }
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
.tv-bc-card { border-radius: 16px; padding: 12px; }
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
.tv-bc-nm { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; font-weight: 500; overflow-wrap: normal; }
.tv-bc-nm .tv-bc-badge { white-space: nowrap; }
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
/* Under about 360px the picture sits above the text, so name and badge keep a whole line */
@container (max-width: 360px) {
  .tv-bc-tpl { display: flex; flex-direction: column; gap: 8px; }
  .tv-bc-tpl .tv-bc-thumb { aspect-ratio: 16 / 10; }
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
.tv-bc-todo { border-radius: 16px; padding: 6px 12px 8px; }
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
/* Narrow: the summary wraps under the title instead of being cut, the clock stays, and every row shows in full */
@container (max-width: 560px) {
  .tv-bc-todo-head { flex-wrap: wrap; row-gap: 0; }
  .tv-bc-todo-title { flex: 1 1 auto; }
  .tv-bc-todo-progress { order: 5; flex: 1 0 100%; white-space: normal; overflow: visible; text-overflow: clip; padding-left: 24px; }
  .tv-bc-todo ul { max-height: none; overflow-y: visible; }
}

/* Could not finish notice */
.tv-bc-notice { border-radius: 16px; padding: 12px 14px; }
.tv-bc-notice-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.tv-bc-notice p { margin: 6px 0 0; }
.tv-bc-notice ul { margin: 6px 0 0; padding-left: 18px; }
.tv-bc-notice li { margin: 2px 0; }
.tv-bc-notice .tv-bc-team { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.tv-bc-team svg { flex: none; }

/* Plan card: labelled values in sections, the approved mock's plan card */
.tv-bc-plan { border-radius: 16px; overflow: hidden; }
.tv-bc-plan-h {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.tv-bc-plan-t { margin: 0; font-weight: 600; font-size: 15px; flex: 1 1 auto; min-width: 0; }
.tv-bc-chip[data-plain] { border-color: var(--border); color: var(--muted-foreground); }
.tv-bc-chip[data-accent] { border-color: color-mix(in oklab, var(--primary) 45%, var(--card)); color: var(--primary); }
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
/* A value the owner can change: the whole row is a button, a pencil on hover, the just changed value tinted */
.tv-bc-val-edit {
  width: calc(100% + 16px); min-height: 30px; margin: 0 -8px; padding: 4px 8px; border-radius: 8px;
  border: 1px solid transparent; background: transparent; color: inherit; font: inherit; text-align: left; cursor: text;
}
.tv-bc-val:has(> .tv-bc-val-edit) { padding: 0; }
.tv-bc-val-edit:hover:not([aria-disabled]) { background: color-mix(in oklab, var(--foreground) 5%, var(--card)); }
.tv-bc-val-edit:focus-visible { outline: 1px solid var(--ring); outline-offset: 0; }
.tv-bc-val-edit[aria-disabled] { cursor: default; }
.tv-bc-pen { display: grid; place-items: center; flex: none; color: var(--muted-foreground); opacity: 0; }
.tv-bc-val-edit:hover .tv-bc-pen, .tv-bc-val-edit:focus-visible .tv-bc-pen { opacity: 1; }
@media (hover: none) { .tv-bc-pen { opacity: .6; } }
.tv-bc-val[data-changed] > .tv-bc-val-edit, .tv-bc-val[data-changed] .tv-bc-opt[data-checked] {
  background: color-mix(in oklab, var(--primary) 16%, var(--card));
  border-color: color-mix(in oklab, var(--primary) 35%, transparent);
}
.tv-bc-val[data-changed] .tv-bc-pen { opacity: 0; }
.tv-bc-val[data-editing] { padding: 2px 0; }
/* A value shown, not offered, keeps its source in line with the sources of editable values beside it */
.tv-bc-val > div.tv-bc-val-row:has(.tv-bc-src) { padding-right: 21px; }
.tv-bc-edit { display: flex; gap: 6px; align-items: center; }
.tv-bc-edit input {
  flex: 1; min-width: 0; height: 30px; padding: 0 8px; border: 1px solid var(--ring); border-radius: 8px;
  background: var(--card); color: inherit; font: inherit; outline: none;
}
.tv-bc-src { font-size: 11.5px; color: var(--muted-foreground); white-space: nowrap; overflow-wrap: normal; word-break: keep-all; }
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
  /* A source never breaks inside a word: when the row is narrow it drops under the value */
  .tv-bc-val-row { flex-wrap: wrap; row-gap: 0; }
  .tv-bc-opt { flex-wrap: wrap; row-gap: 0; }
  .tv-bc-opt .tv-bc-v { flex: 1 1 0; }
  .tv-bc-opt .tv-bc-src { padding: 0 0 4px 24px; }
  .tv-bc-src { order: 3; flex: 1 0 100%; text-align: left; }
  .tv-bc-val > div.tv-bc-val-row:has(.tv-bc-src) { padding-right: 0; }
  .tv-bc-edit { flex-wrap: wrap; row-gap: 6px; }
  .tv-bc-edit input { flex: 1 0 100%; }
}
`;var B="tracy-build-chat",F={"template.list":"Designs for your site","template.recommended":"Recommended","template.later":"You can change the design later.","template.use":"Use {name}","template.chosen":"Chosen: {name}","template.saveFailed":"Your choice was not saved. Try again.","template.none":"No ready design fits your business yet.","template.noneNext":"You can still add your site from Add site.","template.openAddSite":"Open Add site","progress.title.build":"Building your site","progress.title.partial":"Updating your site","progress.done":"{count} completed","progress.running":"{count} in progress","progress.pending":"{count} pending","progress.failed":"{count} failed","progress.state.done":"Completed","progress.state.running":"In progress","progress.state.pending":"Pending","progress.state.failed":"Failed","progress.note.failed":"Failed","progress.note.failedTwice":"Failed twice","progress.note.notStarted":"Not started","progress.clock":"Elapsed time","stopped.title":"Your site is not finished yet","stopped.twice":'The step "{step}" failed twice, so I stopped instead of showing you a half built site.',"stopped.once":'The step "{step}" failed, so I stopped instead of showing you a half built site.',"stopped.kept.none":"Kept: your plan and your answers.","stopped.kept.one":"Kept: your plan, your answers and the written page.","stopped.kept.other":"Kept: your plan, your answers and the {count} written pages.","stopped.unchanged":"Your current site is unchanged.","stopped.notified":"The Tracy team has been notified and will reply in this chat. You do not need to do anything.","plan.title":"{name} site plan","plan.design":"Design: {name}","plan.facts":"Business facts","plan.language":"Site language","plan.allSources":"All sources","plan.look":"Look","plan.look.template":"Template","plan.look.accent":"Accent colour","plan.look.logoLight":"Logo on light","plan.look.logoDark":"Logo on dark","plan.look.logoOwn":"Your logo, from {source}","plan.look.logoText":"Your business name as text","plan.services":"Services ({count})","plan.service":"Service {n}","plan.pages":"Pages ({count})","plan.sections.one":"{count} section","plan.sections.other":"{count} sections","plan.fromServices":"From Services","plan.count.service.one":"{count} service","plan.count.service.other":"{count} services","plan.count.person.one":"{count} person","plan.count.person.other":"{count} people","plan.count.quote.one":"{count} quote","plan.count.quote.other":"{count} quotes","plan.count.gallery.one":"{count} photo","plan.count.gallery.other":"{count} photos","plan.count.item.one":"{count} item","plan.count.item.other":"{count} items","plan.pictures":"Pictures","plan.pictures.own":"Your photos","plan.pictures.ownValue":"{count} photos from {from}","plan.pictures.drawn":"Drawn pictures","plan.pictures.drawnValue.one":"{count} picture","plan.pictures.drawnValue.other":"{count} pictures","plan.pictures.drawnNone":"None","plan.assumptions":"Assumptions","plan.leftOut":"Left out","plan.and":"{first} and {last}","plan.saveFailed":"Your change was not saved. Try again.","plan.edit":"Edit {label}: {value}","plan.newValue":"New value for {label}","plan.save":"Save","plan.cancel":"Cancel","plan.changed":"Changed","plan.undo":"Undo","plan.undoLabel":"Undo last change"},ie=(e,t={})=>F[e].replace(/\{(\w+)\}/g,(a,n)=>String(t[n]??""));var R=require("@deepseek-ai/dsh-client-ui-primitives");var Re="tracy-build-plan-edit/v1";var z=e=>e?.[0]?.name??"",se=e=>(e.sources??[]).some(t=>t.kind==="website");function De(e,t){let a=[...t.alternatives].sort((n,s)=>Number(se(s))-Number(se(n)));return{field:t.field,said:t.said,options:a.map(n=>({value:n.value,source:z(n.sources),selected:n.value===e.value}))}}function Ee(e,t,a){let n=e.data??[];if(a.length>0&&n.length===a.length&&a.every(l=>n.includes(l)))return{services:a.map(l=>t.items.find(u=>u.id===l).label)};let s=[],o=[];for(let l of n){let u=t.facts.find(f=>f.id===l);if(u){s.push(u.label);continue}let c=t.items.find(f=>f.id===l);if(!c)continue;let k=c.count??1,y=o.find(f=>f.kind===c.kind);y?y.count+=k:o.push({kind:c.kind,count:k})}return{facts:s,counts:o}}function H(e){let t=new Map((e.assumptions??[]).filter(o=>Array.isArray(o.alternatives)&&/^facts\[[^\]]+\]\.value$/.test(o.field)).map(o=>[o.field,o])),a=e.items.filter(o=>o.kind==="service"),n=a.map(o=>o.id),s=e.facts.find(o=>o.kind==="business.name")?.value??"";return{planId:e.id,revision:e.revision,name:s,facts:e.facts.map(o=>{let l=`facts[${o.id}].value`,u=t.get(l);return{id:o.id,field:l,label:o.label,value:o.value,source:z(o.sources),choice:u?De(o,u):null}}),language:e.language,look:{template:e.look.template.name,accent:e.look.accent,logo:e.look.logo.kind==="own"?{kind:"own",source:e.look.logo.source}:{kind:e.look.logo.kind}},services:a.map(o=>({id:o.id,field:`items[${o.id}].label`,label:o.label,source:z(o.sources)})),pages:e.pages.map(o=>({id:o.id,name:o.name,blocks:o.blocks.map(l=>({id:l.id,label:l.label,reason:l.reason,holds:Ee(l,e,n)}))})),pictures:{own:{frames:e.pictures.own.frames,from:[...e.pictures.own.from??[]]},generated:{frames:e.pictures.generated.frames,...e.pictures.generated.reason?{reason:e.pictures.generated.reason}:{}}},assumptions:(e.assumptions??[]).filter(o=>!t.has(o.field)).map(o=>({id:o.id,said:o.said})),leftOut:(e.leftOut??[]).map(o=>({what:o.what,kind:o.kind,reason:o.reason})),counts:{pages:e.pages.length,services:a.length}}}function M(e,t,a){return{schema:Re,id:a,plan:{id:e.id,revision:e.revision},changes:t.map(n=>({field:n.field,value:n.value}))}}function V(e,t,a){let n=String(a??"").trim();if(n==="")return null;if(typeof t=="number"){if(!/^\d+$/.test(n))return null;let s=Number(n);return s===t?null:{field:e,value:s}}return n===t?null:{field:e,value:n}}function $({plan:e,lastEdit:t=null,canUndo:a=!1}){return!a||!t?.plan||!e?[]:t.plan.id!==e.id||t.plan.revision+1!==e.revision?[]:(t.changes??[]).map(n=>n.field)}var Ie=new Set(["look","writer","pictures","write"]);function q(e){let t=(e??[]).filter(n=>n?.quickstart==="released"&&n.fits===!0),a=(t.find(n=>n.recommended===!0)??t[0])?.slug??null;return{options:t,chosen:a,none:t.length===0}}function K(e){return{slug:e.slug,name:e.name,version:e.version}}function Ae(e,t){let a={id:e.id,label:e.label};return e.state==="done"?{...a,state:"done",note:null}:e.state==="failed"?{...a,state:"failed",note:e.attempt>=2?"failed-twice":"failed"}:e.state==="running"&&t===null?{...a,state:"running",note:null}:{...a,state:"pending",note:t==="stopped"?"not-started":null}}function j(e){let t=e?.outcome??null,a=t??e?.events?.at(-1)??null,n=t?.result??null,s=(a?.steps??[]).filter(l=>Ie.has(l.kind)).map(l=>Ae(l,n)),o=l=>s.filter(u=>u.state===l).length;return{kind:a?.run?.kind??"build",items:s,counts:{done:o("done"),running:o("running"),pending:o("pending"),failed:o("failed")},elapsedSeconds:a?.elapsedSeconds??0,running:a!==null&&n===null,result:n}}function Y(e){if(e?.result!=="stopped")return null;let t=e.steps??[],a=t.find(n=>n.state==="failed")??t.find(n=>n.id===e.stopped?.step);return{step:a?.label??"",twice:(a?.attempt??0)>=2,writtenPages:t.filter(n=>n.kind==="writer"&&n.state==="done").length,siteUnchanged:!t.some(n=>n.kind==="write"&&n.state==="done"),teamNotified:e.stopped?.teamNotified===!0}}function W(e){let t=Math.max(0,Math.floor(e));return`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`}var P=require("react"),g=require("react/jsx-runtime"),_e={failed:"progress.note.failed","failed-twice":"progress.note.failedTwice","not-started":"progress.note.notStarted"},Be={done:"progress.state.done",running:"progress.state.running",pending:"progress.state.pending",failed:"progress.state.failed"};function Le(e,t){let[a,n]=(0,P.useState)(()=>({base:e,at:Date.now()})),[s,o]=(0,P.useState)(()=>Date.now());return a.base!==e&&n({base:e,at:Date.now()}),(0,P.useEffect)(()=>{if(!t)return;let l=setInterval(()=>o(Date.now()),1e3);return()=>clearInterval(l)},[t]),t?e+Math.max(0,Math.floor((s-a.at)/1e3)):e}function le({run:e,t}){let a=j(e),[n,s]=(0,P.useState)(!0),o=Le(a.elapsedSeconds,a.running);if(a.items.length===0)return null;let l=[a.counts.done>0&&t("progress.done",{count:a.counts.done}),a.counts.running>0&&t("progress.running",{count:a.counts.running}),a.counts.pending>0&&a.result!=="stopped"&&t("progress.pending",{count:a.counts.pending}),a.counts.failed>0&&t("progress.failed",{count:a.counts.failed})].filter(Boolean).join("\u2002\xB7\u2002"),u=t(a.kind==="partial"?"progress.title.partial":"progress.title.build");return(0,g.jsxs)("section",{className:"tv-bc-todo","aria-label":u,"data-result":a.result??"running",children:[(0,g.jsxs)("button",{type:"button",className:"tv-bc-todo-head","aria-expanded":n,onClick:()=>s(c=>!c),children:[(0,g.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:(0,g.jsx)(R.IconChecklistOutlineRegular,{})}),(0,g.jsx)("span",{className:"tv-bc-todo-title",children:u}),(0,g.jsx)("span",{className:"tv-bc-todo-progress",children:l}),(0,g.jsx)("span",{className:"tv-bc-clock",role:"timer","aria-label":t("progress.clock"),children:W(o)}),(0,g.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:n?(0,g.jsx)(R.IconChevronDownOutlineRegular,{}):(0,g.jsx)(R.IconChevronUpOutlineRegular,{})})]}),n&&(0,g.jsx)("ul",{children:a.items.map(c=>(0,g.jsxs)("li",{"data-s":c.state,"data-note":c.note??void 0,children:[(0,g.jsx)("span",{className:"tv-bc-sd","data-s":c.state,role:"img","aria-label":t(Be[c.state])}),(0,g.jsx)("span",{className:"tv-bc-c",children:c.label}),c.note!==null&&(0,g.jsx)("span",{className:"tv-bc-r",children:t(_e[c.note])})]},c.id))})]})}var b=require("react/jsx-runtime");function ce({outcome:e,t}){let a=Y(e);if(a===null)return null;let n=a.writtenPages===0?t("stopped.kept.none"):a.writtenPages===1?t("stopped.kept.one"):t("stopped.kept.other",{count:a.writtenPages});return(0,b.jsxs)("div",{className:"tv-bc-notice",role:"status",children:[(0,b.jsxs)("div",{className:"tv-bc-notice-head",children:[(0,b.jsx)("span",{className:"tv-bc-sd","data-s":"failed","aria-hidden":!0}),t("stopped.title")]}),(0,b.jsx)("p",{children:t(a.twice?"stopped.twice":"stopped.once",{step:a.step})}),(0,b.jsxs)("ul",{children:[(0,b.jsx)("li",{children:n}),a.siteUnchanged&&(0,b.jsx)("li",{children:t("stopped.unchanged")})]}),a.teamNotified&&(0,b.jsxs)("p",{className:"tv-bc-team tv-bc-muted tv-bc-small",children:[(0,b.jsx)(Ue,{}),t("stopped.notified")]})]})}function Ue(){return(0,b.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:[(0,b.jsx)("path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"}),(0,b.jsx)("path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0"})]})}var ue=require("@deepseek-ai/dsh-client-ui-primitives");var w=require("react");var de=require("@deepseek-ai/dsh-client-ui-primitives"),L=require("react"),v=require("react/jsx-runtime");function I({ctx:e,field:t,label:a,current:n,text:s,source:o,note:l,children:u}){let{t:c}=e,k=(0,L.useId)(),[y,f]=(0,L.useState)(String(n)),O=e.editing===t,S=e.changed.has(t);return O?(0,v.jsx)("div",{className:"tv-bc-val","data-field":t,"data-editing":"",children:(0,v.jsxs)("div",{className:"tv-bc-edit",children:[(0,v.jsx)("input",{autoFocus:!0,value:y,inputMode:typeof n=="number"?"numeric":void 0,"aria-label":c("plan.newValue",{label:a}),onChange:h=>f(h.target.value),onKeyDown:h=>{h.key==="Enter"?(h.preventDefault(),e.save(t,n,y)):h.key==="Escape"&&(h.preventDefault(),e.cancel(t))}}),(0,v.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",onClick:()=>e.save(t,n,y),children:c("plan.save")}),(0,v.jsx)("button",{type:"button",className:"tv-bc-btn","data-ghost":"",onClick:()=>e.cancel(t),children:c("plan.cancel")})]})}):(0,v.jsxs)("div",{className:"tv-bc-val","data-field":t,"data-changed":S||void 0,children:[(0,v.jsxs)("button",{type:"button",className:"tv-bc-val-row tv-bc-val-edit","aria-label":c("plan.edit",{label:a,value:s}),"aria-describedby":S?k:void 0,"aria-disabled":e.busy||void 0,onClick:()=>{e.busy||(f(String(n)),e.start(t))},children:[(0,v.jsx)("span",{className:"tv-bc-v",children:u??s}),S?(0,v.jsx)("span",{id:k,className:"tv-bc-chip","data-accent":"",children:c("plan.changed")}):o&&(0,v.jsx)("span",{className:"tv-bc-src",children:o}),(0,v.jsx)("span",{className:"tv-bc-pen","aria-hidden":!0,children:(0,v.jsx)(de.IconEditOutlineRegular,{})})]}),l&&(0,v.jsx)("div",{className:"tv-bc-note",children:l})]})}function pe(){return(0,v.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:[(0,v.jsx)("path",{d:"M9 14 4 9l5-5"}),(0,v.jsx)("path",{d:"M4 9h10a6 6 0 0 1 0 12h-3"})]})}var r=require("react/jsx-runtime"),Fe=()=>`edit-${globalThis.crypto.randomUUID()}`,G=(e,t,a,n={})=>e(`${t}.${a===1?"one":"other"}`,{count:a,...n});function ze(e,t){return t.length<=1?t[0]??"":e("plan.and",{first:t.slice(0,-1).join(", "),last:t[t.length-1]})}var He=new Set(["service","person","quote","gallery"]);function Me(e,t){if("services"in t)return t.services.join(", ");let a=t.facts.map((o,l)=>l===0?o:o.toLowerCase()),n=t.counts.map(o=>G(e,`plan.count.${He.has(o.kind)?o.kind:"item"}`,o.count)),s=[...a,...n].join(", ");return s.charAt(0).toUpperCase()+s.slice(1)}function Ve(e,t){try{return new Intl.DisplayNames([t],{type:"language"}).of(e)??e}catch{return e}}function D({field:e,source:t,note:a,children:n}){return(0,r.jsxs)("div",{className:"tv-bc-val","data-field":e,children:[(0,r.jsxs)("div",{className:"tv-bc-val-row",children:[(0,r.jsx)("span",{className:"tv-bc-v",children:n}),t&&(0,r.jsx)("span",{className:"tv-bc-src",children:t})]}),a&&(0,r.jsx)("div",{className:"tv-bc-note",children:a})]})}function $e({fact:e,busy:t,changed:a,onPick:n}){let s=(0,w.useId)();return(0,r.jsxs)("div",{className:"tv-bc-val","data-field":e.field,"data-changed":a||void 0,children:[(0,r.jsx)("div",{className:"tv-bc-choice",role:"radiogroup","aria-label":e.label,"aria-busy":t,children:e.choice.options.map(o=>(0,r.jsxs)("label",{className:"tv-bc-opt","data-checked":o.selected||void 0,children:[(0,r.jsx)("input",{type:"radio",name:s,value:o.value,checked:o.selected,disabled:t,onChange:()=>n(o.value)}),(0,r.jsx)("span",{className:"tv-bc-v",children:o.value}),(0,r.jsx)("span",{className:"tv-bc-src",children:o.source})]},o.value))}),e.choice.options[0]?.selected&&(0,r.jsx)("div",{className:"tv-bc-note",children:e.choice.said})]})}function C({title:e,children:t}){return(0,r.jsxs)("section",{className:"tv-bc-plan-sec","aria-label":e,children:[(0,r.jsx)("h4",{children:e}),t]})}function ve({plan:e,lastEdit:t=null,canUndo:a=!1,t:n,onEdit:s,onUndo:o,locale:l="en",newEditId:u=Fe}){let[c,k]=(0,w.useState)({plan:e,lastEdit:t,canUndo:a}),[y,f]=(0,w.useState)(!1),[O,S]=(0,w.useState)(!1),[h,N]=(0,w.useState)(null),[_,x]=(0,w.useState)(null),Z=(0,w.useRef)(null);(0,w.useEffect)(()=>k({plan:e,lastEdit:t,canUndo:a}),[e,t,a]),(0,w.useEffect)(()=>{_===null||h!==null||(Z.current?.querySelector(`[data-field="${CSS.escape(_)}"] .tv-bc-val-edit`)?.focus(),x(null))});let ee=c.plan,d=H(ee),te=async i=>{f(!0),S(!1);try{k(await i())}catch{S(!0)}finally{f(!1)}},ne=i=>te(()=>s(M(ee,i,u()))),E={t:n,editing:h,busy:y,changed:new Set($(c)),start:i=>N(i),cancel:i=>{N(null),x(i)},save:(i,m,ye)=>{N(null),x(i);let oe=V(i,m,ye);oe&&ne([oe])}},ae=d.look.logo.kind==="own"?n("plan.look.logoOwn",{source:d.look.logo.source??""}):n("plan.look.logoText"),we=d.pictures.generated.frames===0?n("plan.pictures.drawnNone"):G(n,"plan.pictures.drawnValue",d.pictures.generated.frames);return(0,r.jsxs)("article",{ref:Z,className:"tv-bc-plan","aria-label":n("plan.title",{name:d.name}),children:[(0,r.jsxs)("div",{className:"tv-bc-plan-h",children:[(0,r.jsx)("h3",{className:"tv-bc-plan-t",children:n("plan.title",{name:d.name})}),(0,r.jsx)("span",{className:"tv-bc-chip","data-plain":"",children:n("plan.design",{name:d.look.template})}),(0,r.jsxs)("button",{type:"button",className:"tv-bc-btn","data-ghost":"","aria-label":n("plan.undoLabel"),disabled:!c.canUndo||y,onClick:()=>{N(null),te(o)},children:[(0,r.jsx)(pe,{}),n("plan.undo")]})]}),O&&(0,r.jsx)("p",{className:"tv-bc-plan-err tv-bc-error",role:"alert",children:n("plan.saveFailed")}),(0,r.jsx)(C,{title:n("plan.facts"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[d.facts.map(i=>(0,r.jsx)(T,{label:i.label,children:i.choice?(0,r.jsx)($e,{fact:i,busy:y,changed:E.changed.has(i.field),onPick:m=>{m!==i.value&&ne([{field:i.field,value:m}])}}):(0,r.jsx)(I,{ctx:E,field:i.field,label:i.label,current:i.value,text:i.value,source:i.source})},i.id)),(0,r.jsx)(T,{label:n("plan.language"),children:(0,r.jsx)(D,{field:"language",source:n("plan.allSources"),children:Ve(d.language,l)})})]})}),(0,r.jsx)(C,{title:n("plan.look"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[(0,r.jsx)(T,{label:n("plan.look.template"),children:(0,r.jsx)(D,{field:"look.template",children:d.look.template})}),(0,r.jsx)(T,{label:n("plan.look.accent"),children:(0,r.jsxs)(I,{ctx:E,field:"look.accent",label:n("plan.look.accent"),current:d.look.accent,text:d.look.accent,children:[(0,r.jsx)("span",{className:"tv-bc-swatch",style:{background:d.look.accent},"aria-hidden":!0}),d.look.accent]})}),(0,r.jsx)(T,{label:n("plan.look.logoLight"),children:(0,r.jsx)(D,{field:"look.logo",children:ae})}),(0,r.jsx)(T,{label:n("plan.look.logoDark"),children:(0,r.jsx)(D,{field:"look.logo",children:ae})})]})}),(0,r.jsx)(C,{title:n("plan.services",{count:d.services.length}),children:(0,r.jsx)("div",{className:"tv-bc-kv",children:d.services.map((i,m)=>(0,r.jsx)(T,{label:n("plan.service",{n:m+1}),children:(0,r.jsx)(I,{ctx:E,field:i.field,label:n("plan.service",{n:m+1}),current:i.label,text:i.label,source:i.source})},i.id))})}),(0,r.jsx)(C,{title:n("plan.pages",{count:d.pages.length}),children:d.pages.map(i=>(0,r.jsxs)("div",{className:"tv-bc-page","data-page":i.id,children:[(0,r.jsxs)("div",{className:"tv-bc-ph",children:[i.name,(0,r.jsx)("span",{className:"tv-bc-n",children:G(n,"plan.sections",i.blocks.length)})]}),(0,r.jsx)("ol",{children:i.blocks.map(m=>(0,r.jsxs)("li",{children:[(0,r.jsx)("span",{className:"tv-bc-bn",children:m.label}),(0,r.jsx)(D,{field:`pages[${i.id}].blocks[${m.id}].data`,..."services"in m.holds?{source:n("plan.fromServices")}:{},note:m.reason,children:Me(n,m.holds)})]},m.id))})]},i.id))}),(0,r.jsx)(C,{title:n("plan.pictures"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[(0,r.jsx)(T,{label:n("plan.pictures.own"),children:(0,r.jsx)(D,{children:n("plan.pictures.ownValue",{count:d.pictures.own.frames,from:ze(n,d.pictures.own.from)})})}),(0,r.jsx)(T,{label:n("plan.pictures.drawn"),children:(0,r.jsx)(I,{ctx:E,field:"pictures.generated.frames",label:n("plan.pictures.drawn"),current:d.pictures.generated.frames,text:we,...d.pictures.generated.reason?{note:d.pictures.generated.reason}:{}})})]})}),d.assumptions.length>0&&(0,r.jsx)(C,{title:n("plan.assumptions"),children:(0,r.jsx)("ul",{className:"tv-bc-plain",children:d.assumptions.map(i=>(0,r.jsx)("li",{children:i.said},i.id))})}),d.leftOut.length>0&&(0,r.jsx)(C,{title:n("plan.leftOut"),children:(0,r.jsx)("ul",{className:"tv-bc-dropped",children:d.leftOut.map(i=>(0,r.jsxs)("li",{children:[(0,r.jsx)("span",{className:"tv-bc-x",children:(0,r.jsx)(ue.IconCloseOutlineRegular,{"aria-hidden":!0})}),(0,r.jsxs)("span",{children:[(0,r.jsxs)("span",{className:"tv-bc-what",children:[i.what,"."]})," ",(0,r.jsx)("span",{className:"tv-bc-muted",children:i.reason})]})]},i.what))})})]})}function T({label:e,children:t}){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("div",{className:"tv-bc-k",children:e}),(0,r.jsx)("div",{className:"tv-bc-cell",children:t})]})}var J="/api/build-draft/plan-edits",Q="/api/build-draft/plan-undo";async function ge(e,t,a){let n=await a(e,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(t)}),s=await n.json().catch(()=>null);if(!n.ok||!s?.draft?.plan)throw new Error(String(s?.code??n.status));let{plan:o,lastEdit:l=null,canUndo:u=!1}=s.draft;return{plan:o,lastEdit:l,canUndo:u}}function fe(e,t=fetch){return ge(J,{edit:e},t)}function me(e=fetch){return ge(Q,{},e)}var qe="/api/build-draft/template";async function be(e,t=fetch){let a=await t(qe,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({template:e})}),n=await a.json().catch(()=>null);if(!a.ok)throw new Error(String(n?.code??a.status));return n?.draft??null}var he=require("@deepseek-ai/dsh-client-ui-primitives");var A=require("react"),p=require("react/jsx-runtime"),X="?tab=tracy%3Aadd-site";function xe({templates:e,t,onChoose:a,chosen:n=null,addSiteHref:s=X}){let o=q(e),[l,u]=(0,A.useState)(n??o.chosen),[c,k]=(0,A.useState)(n),[y,f]=(0,A.useState)(!1),[O,S]=(0,A.useState)(!1);if(o.none)return(0,p.jsxs)("div",{className:"tv-bc-card tv-bc-none",role:"status",children:[(0,p.jsx)("p",{children:t("template.none")}),(0,p.jsx)("p",{className:"tv-bc-muted",children:t("template.noneNext")}),(0,p.jsx)("div",{className:"tv-bc-tfoot",children:(0,p.jsx)("a",{className:"tv-bc-btn",href:s,children:t("template.openAddSite")})})]});let h=c!==null,N=o.options.find(x=>x.slug===(c??l))??o.options[0],_=async()=>{f(!0),S(!1);try{await a(K(N)),k(N.slug)}catch{S(!0)}finally{f(!1)}};return(0,p.jsxs)("div",{className:"tv-bc-card",children:[(0,p.jsx)("div",{className:"tv-bc-tgrid",role:"group","aria-label":t("template.list"),children:o.options.map(x=>(0,p.jsxs)("button",{type:"button",className:"tv-bc-tpl","aria-pressed":N.slug===x.slug,"aria-disabled":h||void 0,onClick:()=>{h||u(x.slug)},children:[(0,p.jsx)("img",{className:"tv-bc-thumb",src:x.picture,alt:"",loading:"lazy"}),(0,p.jsxs)("span",{className:"tv-bc-nm",children:[x.name,x.recommended===!0&&(0,p.jsx)("span",{className:"tv-bc-badge",children:t("template.recommended")})]}),(0,p.jsx)("span",{className:"tv-bc-why",children:x.reason})]},x.slug))}),(0,p.jsx)("div",{className:"tv-bc-tfoot",children:h?(0,p.jsxs)("span",{className:"tv-bc-chip",children:[(0,p.jsx)(he.IconCheckOutlineRegular,{"aria-hidden":!0}),t("template.chosen",{name:N.name})]}):(0,p.jsxs)(p.Fragment,{children:[(0,p.jsx)("span",{className:O?"tv-bc-grow tv-bc-error":"tv-bc-grow tv-bc-muted tv-bc-small",role:"status",children:t(O?"template.saveFailed":"template.later")}),(0,p.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",disabled:y,onClick:_,children:t("template.use",{name:N.name})})]})})]})}var Ke=["locale"];function je(e){e.effect(()=>{let t="tracy-build-chat-css";if(document.getElementById(t))return;let a=document.createElement("style");return a.id=t,a.textContent=re,document.head.appendChild(a),()=>a.remove()},"tracy-build-chat: styles"),e.effect(()=>e.locale.register(B,{en:F}),"tracy-build-chat: dictionaries")}

		return module.exports;
	}
});
