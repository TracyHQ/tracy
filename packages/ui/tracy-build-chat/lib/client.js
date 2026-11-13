window.__ModuleLoader__.load({
	id: "@tracy/dsh-build-chat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";var U=Object.defineProperty;var Oe=Object.getOwnPropertyDescriptor;var Ce=Object.getOwnPropertyNames;var Pe=Object.prototype.hasOwnProperty;var De=(e,t)=>{for(var a in t)U(e,a,{get:t[a],enumerable:!0})},Ee=(e,t,a,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of Ce(t))!Pe.call(e,i)&&i!==a&&U(e,i,{get:()=>t[i],enumerable:!(n=Oe(t,i))||n.enumerable});return e};var Re=e=>Ee(U({},"__esModule",{value:!0}),e);var nt={};De(nt,{ADD_SITE_HREF:()=>Z,BUILD_CHAT_NS:()=>B,BUILD_DRAFT_PLAN_EDITS_PATH:()=>J,BUILD_DRAFT_PLAN_UNDO_PATH:()=>Q,BuildProgress:()=>pe,BuildStopped:()=>ue,PlanCard:()=>me,TemplateCard:()=>Ne,apply:()=>tt,english:()=>se,inject:()=>et,savePlanEdit:()=>xe,saveTemplateChoice:()=>ye,undoPlanEdit:()=>we});module.exports=Re(nt);var ie=`
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
.tv-bc-page ol > li {
  display: grid; grid-template-columns: 22px 130px minmax(0, 1fr); align-items: start; gap: 0 8px;
  counter-increment: tv-bc-b;
}
.tv-bc-page ol > li::before {
  content: counter(tv-bc-b); color: var(--muted-foreground); font-size: 12px; padding-top: 6px; text-align: right;
}
.tv-bc-bn { font-size: 13px; padding-top: 5px; }
.tv-bc-lists { grid-column: 3; min-width: 0; padding-bottom: 4px; }
.tv-bc-list { margin-top: 2px; }
.tv-bc-lh { font-size: 12.5px; color: var(--muted-foreground); padding-top: 2px; overflow-wrap: break-word; }
.tv-bc-rows { margin: 0; padding: 0 0 0 14px; list-style: none; font-size: 13px; }
.tv-bc-rows li { position: relative; padding: 1px 0; line-height: 1.45; overflow-wrap: break-word; min-width: 0; }
.tv-bc-rows li::before {
  content: ''; position: absolute; left: -10px; top: .72em; width: 4px; height: 4px; border-radius: 50%;
  background: var(--muted-foreground);
}
.tv-bc-rows .tv-bc-lists { padding-left: 0; }
.tv-bc-plain { margin: 0; padding-left: 18px; font-size: 13px; }
.tv-bc-plain li { margin: 2px 0; }
.tv-bc-dropped { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tv-bc-dropped li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.tv-bc-what { font-weight: 500; }
.tv-bc-x { color: var(--muted-foreground); margin-top: 2px; display: grid; place-items: center; }
@container (max-width: 560px) {
  .tv-bc-kv { grid-template-columns: 1fr; gap: 0; }
  .tv-bc-kv .tv-bc-k { padding-top: 6px; padding-bottom: 0; }
  .tv-bc-page ol > li { grid-template-columns: 18px minmax(0, 1fr); }
  .tv-bc-page ol > li > .tv-bc-val, .tv-bc-page ol > li > .tv-bc-lists { grid-column: 2; }
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
`;var B="tracy-build-chat",F={"template.list":"Designs for your site","template.recommended":"Recommended","template.later":"You can change the design later.","template.use":"Use {name}","template.chosen":"Chosen: {name}","template.saveFailed":"Your choice was not saved. Try again.","template.none":"No ready design fits your business yet.","template.noneNext":"You can still add your site from Add site.","template.openAddSite":"Open Add site","progress.title.build":"Building your site","progress.title.partial":"Updating your site","progress.done":"{count} completed","progress.running":"{count} in progress","progress.pending":"{count} pending","progress.failed":"{count} failed","progress.state.done":"Completed","progress.state.running":"In progress","progress.state.pending":"Pending","progress.state.failed":"Failed","progress.note.failed":"Failed","progress.note.failedTwice":"Failed twice","progress.note.notStarted":"Not started","progress.clock":"Elapsed time","stopped.title":"Your site is not finished yet","stopped.twice":'The step "{step}" failed twice, so I stopped instead of showing you a half built site.',"stopped.once":'The step "{step}" failed, so I stopped instead of showing you a half built site.',"stopped.kept.none":"Kept: your plan and your answers.","stopped.kept.one":"Kept: your plan, your answers and the written page.","stopped.kept.other":"Kept: your plan, your answers and the {count} written pages.","stopped.unchanged":"Your current site is unchanged.","stopped.notified":"The Tracy team has been notified and will reply in this chat. You do not need to do anything.","cancelled.title":"The build was cancelled","cancelled.body":"You cancelled this build. Your plan and your answers are kept.","plan.title":"{name} site plan","plan.design":"Design: {name}","plan.facts":"Business facts","plan.language":"Site language","plan.allSources":"All sources","plan.look":"Look","plan.look.template":"Template","plan.look.accent":"Accent colour","plan.look.logoLight":"Logo on light","plan.look.logoDark":"Logo on dark","plan.look.logoOwn":"Your logo, from {source}","plan.look.logoText":"Your business name as text","plan.services":"Services ({count})","plan.service":"Service {n}","plan.pages":"Pages ({count})","plan.sections.one":"{count} section","plan.sections.other":"{count} sections","plan.fromServices":"From Services","plan.count.service.one":"{count} service","plan.count.service.other":"{count} services","plan.count.person.one":"{count} person","plan.count.person.other":"{count} people","plan.count.quote.one":"{count} quote","plan.count.quote.other":"{count} quotes","plan.count.gallery.one":"{count} photo","plan.count.gallery.other":"{count} photos","plan.count.item.one":"{count} item","plan.count.item.other":"{count} items","plan.pictures":"Pictures","plan.pictures.own":"Your photos","plan.pictures.ownValue":"{count} photos from {from}","plan.pictures.drawn":"Drawn pictures","plan.pictures.drawnValue.one":"{count} picture","plan.pictures.drawnValue.other":"{count} pictures","plan.pictures.drawnNone":"None","plan.assumptions":"Assumptions","plan.leftOut":"Left out","plan.and":"{first} and {last}","plan.saveFailed":"Your change was not saved. Try again.","plan.edit":"Edit {label}: {value}","plan.newValue":"New value for {label}","plan.save":"Save","plan.cancel":"Cancel","plan.changed":"Changed","plan.undo":"Undo","plan.undoLabel":"Undo last change"},se=(e,t={})=>F[e].replace(/\{(\w+)\}/g,(a,n)=>String(t[n]??""));var D=require("@deepseek-ai/dsh-client-ui-primitives");var Ae="tracy-build-plan-edit/v1";var z=e=>e?.[0]?.name??"",le=e=>(e.sources??[]).some(t=>t.kind==="website");function _e(e,t){let a=[...t.alternatives].sort((n,i)=>Number(le(i))-Number(le(n)));return{field:t.field,said:t.said,options:a.map(n=>({value:n.value,source:z(n.sources),selected:n.value===e.value}))}}function Be(e,t,a){let n=e.data??[];if(a.length>0&&n.length===a.length&&a.every(l=>n.includes(l)))return{services:a.map(l=>t.items.find(d=>d.id===l).label)};let i=[],o=[];for(let l of n){let d=t.facts.find(m=>m.id===l);if(d){i.push(d.label);continue}let c=t.items.find(m=>m.id===l);if(!c)continue;let h=c.count??1,k=o.find(m=>m.kind===c.kind);k?k.count+=h:o.push({kind:c.kind,count:h})}return{facts:i,counts:o}}var Le=3;function ce(e,t,a=1){if(!Array.isArray(e)||a>Le)return[];let n=[];for(let i of e){let o=[];for(let d of i.rows??[]){let c=Ue(d,t);if(c===null)continue;let h=ce(d.lists,t,a+1);o.push(h.length>0?{label:c,lists:h}:{label:c})}if(o.length===0)continue;let l=i.item?t.items.find(d=>d.id===i.item):null;n.push(l?{head:l.label,rows:o}:{rows:o})}return n}function Ue(e,t){if(e.page!==void 0)return t.pages.find(i=>i.id===e.page)?.name??null;let a=e.data;return(t.rows??[]).find(i=>i.id===a)?.label??t.facts.find(i=>i.id===a)?.value??t.items.find(i=>i.id===a)?.label??null}function H(e){let t=new Map((e.assumptions??[]).filter(o=>Array.isArray(o.alternatives)&&/^facts\[[^\]]+\]\.value$/.test(o.field)).map(o=>[o.field,o])),a=e.items.filter(o=>o.kind==="service"),n=a.map(o=>o.id),i=e.facts.find(o=>o.kind==="business.name")?.value??"";return{planId:e.id,revision:e.revision,name:i,facts:e.facts.map(o=>{let l=`facts[${o.id}].value`,d=t.get(l);return{id:o.id,field:l,label:o.label,value:o.value,source:z(o.sources),choice:d?_e(o,d):null}}),language:e.language,look:{template:e.look.template.name,accent:e.look.accent,logo:e.look.logo.kind==="own"?{kind:"own",source:e.look.logo.source}:{kind:e.look.logo.kind}},services:a.map(o=>({id:o.id,field:`items[${o.id}].label`,label:o.label,source:z(o.sources)})),pages:e.pages.map(o=>({id:o.id,name:o.name,blocks:o.blocks.map(l=>{let d=ce(l.lists,e);return{id:l.id,label:l.label,reason:l.reason,holds:Be(l,e,n),...d.length>0?{lists:d}:{}}})})),pictures:{own:{frames:e.pictures.own.frames,from:[...e.pictures.own.from??[]]},generated:{frames:e.pictures.generated.frames,...e.pictures.generated.reason?{reason:e.pictures.generated.reason}:{}}},assumptions:(e.assumptions??[]).filter(o=>!t.has(o.field)).map(o=>({id:o.id,said:o.said})),leftOut:(e.leftOut??[]).map(o=>({what:o.what,kind:o.kind,reason:o.reason})),counts:{pages:e.pages.length,services:a.length}}}function M(e,t,a){return{schema:Ae,id:a,plan:{id:e.id,revision:e.revision},changes:t.map(n=>({field:n.field,value:n.value}))}}function V(e,t,a){let n=String(a??"").trim();if(n==="")return null;if(typeof t=="number"){if(!/^\d+$/.test(n))return null;let i=Number(n);return i===t?null:{field:e,value:i}}return n===t?null:{field:e,value:n}}function $({plan:e,lastEdit:t=null,canUndo:a=!1}){return!a||!t?.plan||!e?[]:t.plan.id!==e.id||t.plan.revision+1!==e.revision?[]:(t.changes??[]).map(n=>n.field)}var Fe=new Set(["look","writer","pictures","write"]);function q(e){let t=(e??[]).filter(n=>n?.quickstart==="released"&&n.fits===!0),a=(t.find(n=>n.recommended===!0)??t[0])?.slug??null;return{options:t,chosen:a,none:t.length===0}}function K(e){return{slug:e.slug,name:e.name,version:e.version}}var ze=new Set(["done","stopped","cancelled"]),He=new Set(["stopped","cancelled"]),de=e=>e?.state==="failed"&&e.noRerun!==!0;function Me(e,t){let a={id:e.id,label:e.label};return e.state==="done"?{...a,state:"done",note:null}:e.state==="failed"?{...a,state:"failed",note:de(e)?"failed-twice":"failed"}:e.state==="running"&&t===null?{...a,state:"running",note:null}:{...a,state:"pending",note:He.has(t)?"not-started":null}}function Y(e){let t=e?.outcome??null,a=t??e?.events?.at(-1)??null,n=ze.has(t?.result)?t.result:null,i=(a?.steps??[]).filter(l=>Fe.has(l.kind)).map(l=>Me(l,n)),o=l=>i.filter(d=>d.state===l).length;return{kind:a?.run?.kind??"build",items:i,counts:{done:o("done"),running:o("running"),pending:o("pending"),failed:o("failed")},elapsedSeconds:a?.elapsedSeconds??0,running:a!==null&&n===null,result:n}}function j(e){if(e?.result!=="stopped")return null;let t=e.steps??[],a=t.find(n=>n.state==="failed")??t.find(n=>n.id===e.stopped?.step);return{step:a?.label??"",twice:de(a),writtenPages:t.filter(n=>n.kind==="writer"&&n.state==="done").length,siteUnchanged:!t.some(n=>n.kind==="write"&&n.state==="done"),teamNotified:e.stopped?.teamNotified===!0}}function W(e){return e?.result!=="cancelled"?null:{siteUnchanged:!(e.steps??[]).some(t=>t.kind==="write"&&t.state==="done"),teamNotified:e.cancelled?.teamNotified===!0}}function G(e){let t=Math.max(0,Math.floor(e));return`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`}var P=require("react"),f=require("react/jsx-runtime"),Ve={failed:"progress.note.failed","failed-twice":"progress.note.failedTwice","not-started":"progress.note.notStarted"},$e={done:"progress.state.done",running:"progress.state.running",pending:"progress.state.pending",failed:"progress.state.failed"};function qe(e,t){let[a,n]=(0,P.useState)(()=>({base:e,at:Date.now()})),[i,o]=(0,P.useState)(()=>Date.now());return a.base!==e&&n({base:e,at:Date.now()}),(0,P.useEffect)(()=>{if(!t)return;let l=setInterval(()=>o(Date.now()),1e3);return()=>clearInterval(l)},[t]),t?e+Math.max(0,Math.floor((i-a.at)/1e3)):e}function pe({run:e,t}){let a=Y(e),[n,i]=(0,P.useState)(!0),o=qe(a.elapsedSeconds,a.running);if(a.items.length===0)return null;let l=[a.counts.done>0&&t("progress.done",{count:a.counts.done}),a.counts.running>0&&t("progress.running",{count:a.counts.running}),a.counts.pending>0&&a.result!=="stopped"&&a.result!=="cancelled"&&t("progress.pending",{count:a.counts.pending}),a.counts.failed>0&&t("progress.failed",{count:a.counts.failed})].filter(Boolean).join("\u2002\xB7\u2002"),d=t(a.kind==="partial"?"progress.title.partial":"progress.title.build");return(0,f.jsxs)("section",{className:"tv-bc-todo","aria-label":d,"data-result":a.result??"running",children:[(0,f.jsxs)("button",{type:"button",className:"tv-bc-todo-head","aria-expanded":n,onClick:()=>i(c=>!c),children:[(0,f.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:(0,f.jsx)(D.IconChecklistOutlineRegular,{})}),(0,f.jsx)("span",{className:"tv-bc-todo-title",children:d}),(0,f.jsx)("span",{className:"tv-bc-todo-progress",children:l}),(0,f.jsx)("span",{className:"tv-bc-clock",role:"timer","aria-label":t("progress.clock"),children:G(o)}),(0,f.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:n?(0,f.jsx)(D.IconChevronDownOutlineRegular,{}):(0,f.jsx)(D.IconChevronUpOutlineRegular,{})})]}),n&&(0,f.jsx)("ul",{children:a.items.map(c=>(0,f.jsxs)("li",{"data-s":c.state,"data-note":c.note??void 0,children:[(0,f.jsx)("span",{className:"tv-bc-sd","data-s":c.state,role:"img","aria-label":t($e[c.state])}),(0,f.jsx)("span",{className:"tv-bc-c",children:c.label}),c.note!==null&&(0,f.jsx)("span",{className:"tv-bc-r",children:t(Ve[c.note])})]},c.id))})]})}var v=require("react/jsx-runtime");function ue({outcome:e,t}){let a=W(e);if(a!==null)return(0,v.jsx)(Ke,{siteUnchanged:a.siteUnchanged,t});let n=j(e);if(n===null)return null;let i=n.writtenPages===0?t("stopped.kept.none"):n.writtenPages===1?t("stopped.kept.one"):t("stopped.kept.other",{count:n.writtenPages});return(0,v.jsxs)("div",{className:"tv-bc-notice",role:"status",children:[(0,v.jsxs)("div",{className:"tv-bc-notice-head",children:[(0,v.jsx)("span",{className:"tv-bc-sd","data-s":"failed","aria-hidden":!0}),t("stopped.title")]}),(0,v.jsx)("p",{children:t(n.twice?"stopped.twice":"stopped.once",{step:n.step})}),(0,v.jsxs)("ul",{children:[(0,v.jsx)("li",{children:i}),n.siteUnchanged&&(0,v.jsx)("li",{children:t("stopped.unchanged")})]}),n.teamNotified&&(0,v.jsxs)("p",{className:"tv-bc-team tv-bc-muted tv-bc-small",children:[(0,v.jsx)(Ye,{}),t("stopped.notified")]})]})}function Ke({siteUnchanged:e,t}){return(0,v.jsxs)("div",{className:"tv-bc-notice",role:"status",children:[(0,v.jsxs)("div",{className:"tv-bc-notice-head",children:[(0,v.jsx)("span",{className:"tv-bc-sd","data-s":"pending","aria-hidden":!0}),t("cancelled.title")]}),(0,v.jsx)("p",{children:t("cancelled.body")}),e&&(0,v.jsx)("p",{children:t("stopped.unchanged")})]})}function Ye(){return(0,v.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:[(0,v.jsx)("path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"}),(0,v.jsx)("path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0"})]})}var fe=require("@deepseek-ai/dsh-client-ui-primitives");var y=require("react");var ve=require("@deepseek-ai/dsh-client-ui-primitives"),L=require("react"),g=require("react/jsx-runtime");function I({ctx:e,field:t,label:a,current:n,text:i,source:o,note:l,children:d}){let{t:c}=e,h=(0,L.useId)(),[k,m]=(0,L.useState)(String(n)),C=e.editing===t,S=e.changed.has(t);return C?(0,g.jsx)("div",{className:"tv-bc-val","data-field":t,"data-editing":"",children:(0,g.jsxs)("div",{className:"tv-bc-edit",children:[(0,g.jsx)("input",{autoFocus:!0,value:k,inputMode:typeof n=="number"?"numeric":void 0,"aria-label":c("plan.newValue",{label:a}),onChange:x=>m(x.target.value),onKeyDown:x=>{x.key==="Enter"?(x.preventDefault(),e.save(t,n,k)):x.key==="Escape"&&(x.preventDefault(),e.cancel(t))}}),(0,g.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",onClick:()=>e.save(t,n,k),children:c("plan.save")}),(0,g.jsx)("button",{type:"button",className:"tv-bc-btn","data-ghost":"",onClick:()=>e.cancel(t),children:c("plan.cancel")})]})}):(0,g.jsxs)("div",{className:"tv-bc-val","data-field":t,"data-changed":S||void 0,children:[(0,g.jsxs)("button",{type:"button",className:"tv-bc-val-row tv-bc-val-edit","aria-label":c("plan.edit",{label:a,value:i}),"aria-describedby":S?h:void 0,"aria-disabled":e.busy||void 0,onClick:()=>{e.busy||(m(String(n)),e.start(t))},children:[(0,g.jsx)("span",{className:"tv-bc-v",children:d??i}),S?(0,g.jsx)("span",{id:h,className:"tv-bc-chip","data-accent":"",children:c("plan.changed")}):o&&(0,g.jsx)("span",{className:"tv-bc-src",children:o}),(0,g.jsx)("span",{className:"tv-bc-pen","aria-hidden":!0,children:(0,g.jsx)(ve.IconEditOutlineRegular,{})})]}),l&&(0,g.jsx)("div",{className:"tv-bc-note",children:l})]})}function ge(){return(0,g.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:[(0,g.jsx)("path",{d:"M9 14 4 9l5-5"}),(0,g.jsx)("path",{d:"M4 9h10a6 6 0 0 1 0 12h-3"})]})}var r=require("react/jsx-runtime"),je=()=>`edit-${globalThis.crypto.randomUUID()}`,X=(e,t,a,n={})=>e(`${t}.${a===1?"one":"other"}`,{count:a,...n});function We(e,t){return t.length<=1?t[0]??"":e("plan.and",{first:t.slice(0,-1).join(", "),last:t[t.length-1]})}var Ge=new Set(["service","person","quote","gallery"]);function Xe(e,t){if("services"in t)return t.services.join(", ");let a=t.facts.map((o,l)=>l===0?o:o.toLowerCase()),n=t.counts.map(o=>X(e,`plan.count.${Ge.has(o.kind)?o.kind:"item"}`,o.count)),i=[...a,...n].join(", ");return i.charAt(0).toUpperCase()+i.slice(1)}function be({lists:e}){return(0,r.jsx)("div",{className:"tv-bc-lists",children:e.map((t,a)=>(0,r.jsxs)("section",{className:"tv-bc-list",children:[t.head&&(0,r.jsx)("div",{className:"tv-bc-lh",children:t.head}),(0,r.jsx)("ul",{className:"tv-bc-rows",children:t.rows.map((n,i)=>(0,r.jsxs)("li",{children:[n.label,n.lists&&(0,r.jsx)(be,{lists:n.lists})]},i))})]},a))})}function Je(e,t){try{return new Intl.DisplayNames([t],{type:"language"}).of(e)??e}catch{return e}}function E({field:e,source:t,note:a,children:n}){return(0,r.jsxs)("div",{className:"tv-bc-val","data-field":e,children:[(0,r.jsxs)("div",{className:"tv-bc-val-row",children:[(0,r.jsx)("span",{className:"tv-bc-v",children:n}),t&&(0,r.jsx)("span",{className:"tv-bc-src",children:t})]}),a&&(0,r.jsx)("div",{className:"tv-bc-note",children:a})]})}function Qe({fact:e,busy:t,changed:a,onPick:n}){let i=(0,y.useId)();return(0,r.jsxs)("div",{className:"tv-bc-val","data-field":e.field,"data-changed":a||void 0,children:[(0,r.jsx)("div",{className:"tv-bc-choice",role:"radiogroup","aria-label":e.label,"aria-busy":t,children:e.choice.options.map(o=>(0,r.jsxs)("label",{className:"tv-bc-opt","data-checked":o.selected||void 0,children:[(0,r.jsx)("input",{type:"radio",name:i,value:o.value,checked:o.selected,disabled:t,onChange:()=>n(o.value)}),(0,r.jsx)("span",{className:"tv-bc-v",children:o.value}),(0,r.jsx)("span",{className:"tv-bc-src",children:o.source})]},o.value))}),e.choice.options[0]?.selected&&(0,r.jsx)("div",{className:"tv-bc-note",children:e.choice.said})]})}function O({title:e,children:t}){return(0,r.jsxs)("section",{className:"tv-bc-plan-sec","aria-label":e,children:[(0,r.jsx)("h4",{children:e}),t]})}function me({plan:e,lastEdit:t=null,canUndo:a=!1,t:n,onEdit:i,onUndo:o,locale:l="en",newEditId:d=je}){let[c,h]=(0,y.useState)({plan:e,lastEdit:t,canUndo:a}),[k,m]=(0,y.useState)(!1),[C,S]=(0,y.useState)(!1),[x,N]=(0,y.useState)(null),[_,w]=(0,y.useState)(null),ee=(0,y.useRef)(null);(0,y.useEffect)(()=>h({plan:e,lastEdit:t,canUndo:a}),[e,t,a]),(0,y.useEffect)(()=>{_===null||x!==null||(ee.current?.querySelector(`[data-field="${CSS.escape(_)}"] .tv-bc-val-edit`)?.focus(),w(null))});let te=c.plan,p=H(te),ne=async s=>{m(!0),S(!1);try{h(await s())}catch{S(!0)}finally{m(!1)}},ae=s=>ne(()=>i(M(te,s,d()))),R={t:n,editing:x,busy:k,changed:new Set($(c)),start:s=>N(s),cancel:s=>{N(null),w(s)},save:(s,b,Te)=>{N(null),w(s);let re=V(s,b,Te);re&&ae([re])}},oe=p.look.logo.kind==="own"?n("plan.look.logoOwn",{source:p.look.logo.source??""}):n("plan.look.logoText"),Se=p.pictures.generated.frames===0?n("plan.pictures.drawnNone"):X(n,"plan.pictures.drawnValue",p.pictures.generated.frames);return(0,r.jsxs)("article",{ref:ee,className:"tv-bc-plan","aria-label":n("plan.title",{name:p.name}),children:[(0,r.jsxs)("div",{className:"tv-bc-plan-h",children:[(0,r.jsx)("h3",{className:"tv-bc-plan-t",children:n("plan.title",{name:p.name})}),(0,r.jsx)("span",{className:"tv-bc-chip","data-plain":"",children:n("plan.design",{name:p.look.template})}),(0,r.jsxs)("button",{type:"button",className:"tv-bc-btn","data-ghost":"","aria-label":n("plan.undoLabel"),disabled:!c.canUndo||k,onClick:()=>{N(null),ne(o)},children:[(0,r.jsx)(ge,{}),n("plan.undo")]})]}),C&&(0,r.jsx)("p",{className:"tv-bc-plan-err tv-bc-error",role:"alert",children:n("plan.saveFailed")}),(0,r.jsx)(O,{title:n("plan.facts"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[p.facts.map(s=>(0,r.jsx)(T,{label:s.label,children:s.choice?(0,r.jsx)(Qe,{fact:s,busy:k,changed:R.changed.has(s.field),onPick:b=>{b!==s.value&&ae([{field:s.field,value:b}])}}):(0,r.jsx)(I,{ctx:R,field:s.field,label:s.label,current:s.value,text:s.value,source:s.source})},s.id)),(0,r.jsx)(T,{label:n("plan.language"),children:(0,r.jsx)(E,{field:"language",source:n("plan.allSources"),children:Je(p.language,l)})})]})}),(0,r.jsx)(O,{title:n("plan.look"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[(0,r.jsx)(T,{label:n("plan.look.template"),children:(0,r.jsx)(E,{field:"look.template",children:p.look.template})}),(0,r.jsx)(T,{label:n("plan.look.accent"),children:(0,r.jsxs)(I,{ctx:R,field:"look.accent",label:n("plan.look.accent"),current:p.look.accent,text:p.look.accent,children:[(0,r.jsx)("span",{className:"tv-bc-swatch",style:{background:p.look.accent},"aria-hidden":!0}),p.look.accent]})}),(0,r.jsx)(T,{label:n("plan.look.logoLight"),children:(0,r.jsx)(E,{field:"look.logo",children:oe})}),(0,r.jsx)(T,{label:n("plan.look.logoDark"),children:(0,r.jsx)(E,{field:"look.logo",children:oe})})]})}),(0,r.jsx)(O,{title:n("plan.services",{count:p.services.length}),children:(0,r.jsx)("div",{className:"tv-bc-kv",children:p.services.map((s,b)=>(0,r.jsx)(T,{label:n("plan.service",{n:b+1}),children:(0,r.jsx)(I,{ctx:R,field:s.field,label:n("plan.service",{n:b+1}),current:s.label,text:s.label,source:s.source})},s.id))})}),(0,r.jsx)(O,{title:n("plan.pages",{count:p.pages.length}),children:p.pages.map(s=>(0,r.jsxs)("div",{className:"tv-bc-page","data-page":s.id,children:[(0,r.jsxs)("div",{className:"tv-bc-ph",children:[s.name,(0,r.jsx)("span",{className:"tv-bc-n",children:X(n,"plan.sections",s.blocks.length)})]}),(0,r.jsx)("ol",{children:s.blocks.map(b=>(0,r.jsxs)("li",{children:[(0,r.jsx)("span",{className:"tv-bc-bn",children:b.label}),(0,r.jsx)(E,{field:`pages[${s.id}].blocks[${b.id}].data`,..."services"in b.holds?{source:n("plan.fromServices")}:{},note:b.reason,children:Xe(n,b.holds)}),b.lists&&(0,r.jsx)(be,{lists:b.lists})]},b.id))})]},s.id))}),(0,r.jsx)(O,{title:n("plan.pictures"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[(0,r.jsx)(T,{label:n("plan.pictures.own"),children:(0,r.jsx)(E,{children:n("plan.pictures.ownValue",{count:p.pictures.own.frames,from:We(n,p.pictures.own.from)})})}),(0,r.jsx)(T,{label:n("plan.pictures.drawn"),children:(0,r.jsx)(I,{ctx:R,field:"pictures.generated.frames",label:n("plan.pictures.drawn"),current:p.pictures.generated.frames,text:Se,...p.pictures.generated.reason?{note:p.pictures.generated.reason}:{}})})]})}),p.assumptions.length>0&&(0,r.jsx)(O,{title:n("plan.assumptions"),children:(0,r.jsx)("ul",{className:"tv-bc-plain",children:p.assumptions.map(s=>(0,r.jsx)("li",{children:s.said},s.id))})}),p.leftOut.length>0&&(0,r.jsx)(O,{title:n("plan.leftOut"),children:(0,r.jsx)("ul",{className:"tv-bc-dropped",children:p.leftOut.map(s=>(0,r.jsxs)("li",{children:[(0,r.jsx)("span",{className:"tv-bc-x",children:(0,r.jsx)(fe.IconCloseOutlineRegular,{"aria-hidden":!0})}),(0,r.jsxs)("span",{children:[(0,r.jsxs)("span",{className:"tv-bc-what",children:[s.what,"."]})," ",(0,r.jsx)("span",{className:"tv-bc-muted",children:s.reason})]})]},s.what))})})]})}function T({label:e,children:t}){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("div",{className:"tv-bc-k",children:e}),(0,r.jsx)("div",{className:"tv-bc-cell",children:t})]})}var J="/api/build-draft/plan-edits",Q="/api/build-draft/plan-undo";async function he(e,t,a){let n=await a(e,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(t)}),i=await n.json().catch(()=>null);if(!n.ok||!i?.draft?.plan)throw new Error(String(i?.code??n.status));let{plan:o,lastEdit:l=null,canUndo:d=!1}=i.draft;return{plan:o,lastEdit:l,canUndo:d}}function xe(e,t=fetch){return he(J,{edit:e},t)}function we(e=fetch){return he(Q,{},e)}var Ze="/api/build-draft/template";async function ye(e,t=fetch){let a=await t(Ze,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({template:e})}),n=await a.json().catch(()=>null);if(!a.ok)throw new Error(String(n?.code??a.status));return n?.draft??null}var ke=require("@deepseek-ai/dsh-client-ui-primitives");var A=require("react"),u=require("react/jsx-runtime"),Z="?tab=tracy%3Aadd-site";function Ne({templates:e,t,onChoose:a,chosen:n=null,addSiteHref:i=Z}){let o=q(e),[l,d]=(0,A.useState)(n??o.chosen),[c,h]=(0,A.useState)(n),[k,m]=(0,A.useState)(!1),[C,S]=(0,A.useState)(!1);if(o.none)return(0,u.jsxs)("div",{className:"tv-bc-card tv-bc-none",role:"status",children:[(0,u.jsx)("p",{children:t("template.none")}),(0,u.jsx)("p",{className:"tv-bc-muted",children:t("template.noneNext")}),(0,u.jsx)("div",{className:"tv-bc-tfoot",children:(0,u.jsx)("a",{className:"tv-bc-btn",href:i,children:t("template.openAddSite")})})]});let x=c!==null,N=o.options.find(w=>w.slug===(c??l))??o.options[0],_=async()=>{m(!0),S(!1);try{await a(K(N)),h(N.slug)}catch{S(!0)}finally{m(!1)}};return(0,u.jsxs)("div",{className:"tv-bc-card",children:[(0,u.jsx)("div",{className:"tv-bc-tgrid",role:"group","aria-label":t("template.list"),children:o.options.map(w=>(0,u.jsxs)("button",{type:"button",className:"tv-bc-tpl","aria-pressed":N.slug===w.slug,"aria-disabled":x||void 0,onClick:()=>{x||d(w.slug)},children:[(0,u.jsx)("img",{className:"tv-bc-thumb",src:w.picture,alt:"",loading:"lazy"}),(0,u.jsxs)("span",{className:"tv-bc-nm",children:[w.name,w.recommended===!0&&(0,u.jsx)("span",{className:"tv-bc-badge",children:t("template.recommended")})]}),(0,u.jsx)("span",{className:"tv-bc-why",children:w.reason})]},w.slug))}),(0,u.jsx)("div",{className:"tv-bc-tfoot",children:x?(0,u.jsxs)("span",{className:"tv-bc-chip",children:[(0,u.jsx)(ke.IconCheckOutlineRegular,{"aria-hidden":!0}),t("template.chosen",{name:N.name})]}):(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)("span",{className:C?"tv-bc-grow tv-bc-error":"tv-bc-grow tv-bc-muted tv-bc-small",role:"status",children:t(C?"template.saveFailed":"template.later")}),(0,u.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",disabled:k,onClick:_,children:t("template.use",{name:N.name})})]})})]})}var et=["locale"];function tt(e){e.effect(()=>{let t="tracy-build-chat-css";if(document.getElementById(t))return;let a=document.createElement("style");return a.id=t,a.textContent=ie,document.head.appendChild(a),()=>a.remove()},"tracy-build-chat: styles"),e.effect(()=>e.locale.register(B,{en:F}),"tracy-build-chat: dictionaries")}

		return module.exports;
	}
});
