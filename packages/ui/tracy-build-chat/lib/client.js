window.__ModuleLoader__.load({
	id: "@tracy/dsh-build-chat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";var U=Object.defineProperty;var Se=Object.getOwnPropertyDescriptor;var Te=Object.getOwnPropertyNames;var Oe=Object.prototype.hasOwnProperty;var Pe=(t,e)=>{for(var a in e)U(t,a,{get:e[a],enumerable:!0})},Ce=(t,e,a,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of Te(e))!Oe.call(t,i)&&i!==a&&U(t,i,{get:()=>e[i],enumerable:!(n=Se(e,i))||n.enumerable});return t};var De=t=>Ce(U({},"__esModule",{value:!0}),t);var Je={};Pe(Je,{ADD_SITE_HREF:()=>Q,BUILD_CHAT_NS:()=>L,BUILD_DRAFT_PLAN_EDITS_PATH:()=>X,BUILD_DRAFT_PLAN_UNDO_PATH:()=>J,BuildProgress:()=>ce,BuildStopped:()=>de,PlanCard:()=>fe,TemplateCard:()=>ye,apply:()=>Xe,english:()=>ie,inject:()=>Ge,savePlanEdit:()=>be,saveTemplateChoice:()=>xe,undoPlanEdit:()=>he});module.exports=De(Je);var re=`
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
`;var L="tracy-build-chat",z={"template.list":"Designs for your site","template.recommended":"Recommended","template.later":"You can change the design later.","template.use":"Use {name}","template.chosen":"Chosen: {name}","template.saveFailed":"Your choice was not saved. Try again.","template.none":"No ready design fits your business yet.","template.noneNext":"You can still add your site from Add site.","template.openAddSite":"Open Add site","progress.title.build":"Building your site","progress.title.partial":"Updating your site","progress.done":"{count} completed","progress.running":"{count} in progress","progress.pending":"{count} pending","progress.failed":"{count} failed","progress.state.done":"Completed","progress.state.running":"In progress","progress.state.pending":"Pending","progress.state.failed":"Failed","progress.note.failed":"Failed","progress.note.failedTwice":"Failed twice","progress.note.notStarted":"Not started","progress.clock":"Elapsed time","stopped.title":"Your site is not finished yet","stopped.twice":'The step "{step}" failed twice, so I stopped instead of showing you a half built site.',"stopped.once":'The step "{step}" failed, so I stopped instead of showing you a half built site.',"stopped.kept.none":"Kept: your plan and your answers.","stopped.kept.one":"Kept: your plan, your answers and the written page.","stopped.kept.other":"Kept: your plan, your answers and the {count} written pages.","stopped.unchanged":"Your current site is unchanged.","stopped.notified":"The Tracy team has been notified and will reply in this chat. You do not need to do anything.","plan.title":"{name} site plan","plan.design":"Design: {name}","plan.facts":"Business facts","plan.language":"Site language","plan.allSources":"All sources","plan.look":"Look","plan.look.template":"Template","plan.look.accent":"Accent colour","plan.look.logoLight":"Logo on light","plan.look.logoDark":"Logo on dark","plan.look.logoOwn":"Your logo, from {source}","plan.look.logoText":"Your business name as text","plan.services":"Services ({count})","plan.service":"Service {n}","plan.pages":"Pages ({count})","plan.sections.one":"{count} section","plan.sections.other":"{count} sections","plan.fromServices":"From Services","plan.count.service.one":"{count} service","plan.count.service.other":"{count} services","plan.count.person.one":"{count} person","plan.count.person.other":"{count} people","plan.count.quote.one":"{count} quote","plan.count.quote.other":"{count} quotes","plan.count.gallery.one":"{count} photo","plan.count.gallery.other":"{count} photos","plan.count.item.one":"{count} item","plan.count.item.other":"{count} items","plan.pictures":"Pictures","plan.pictures.own":"Your photos","plan.pictures.ownValue":"{count} photos from {from}","plan.pictures.drawn":"Drawn pictures","plan.pictures.drawnValue.one":"{count} picture","plan.pictures.drawnValue.other":"{count} pictures","plan.pictures.drawnNone":"None","plan.assumptions":"Assumptions","plan.leftOut":"Left out","plan.and":"{first} and {last}","plan.saveFailed":"Your change was not saved. Try again.","plan.edit":"Edit {label}: {value}","plan.newValue":"New value for {label}","plan.save":"Save","plan.cancel":"Cancel","plan.changed":"Changed","plan.undo":"Undo","plan.undoLabel":"Undo last change"},ie=(t,e={})=>z[t].replace(/\{(\w+)\}/g,(a,n)=>String(e[n]??""));var D=require("@deepseek-ai/dsh-client-ui-primitives");var Re="tracy-build-plan-edit/v1";var F=t=>t?.[0]?.name??"",se=t=>(t.sources??[]).some(e=>e.kind==="website");function Ae(t,e){let a=[...e.alternatives].sort((n,i)=>Number(se(i))-Number(se(n)));return{field:e.field,said:e.said,options:a.map(n=>({value:n.value,source:F(n.sources),selected:n.value===t.value}))}}function Ie(t,e,a){let n=t.data??[];if(a.length>0&&n.length===a.length&&a.every(l=>n.includes(l)))return{services:a.map(l=>e.items.find(d=>d.id===l).label)};let i=[],o=[];for(let l of n){let d=e.facts.find(m=>m.id===l);if(d){i.push(d.label);continue}let c=e.items.find(m=>m.id===l);if(!c)continue;let h=c.count??1,k=o.find(m=>m.kind===c.kind);k?k.count+=h:o.push({kind:c.kind,count:h})}return{facts:i,counts:o}}var _e=3;function le(t,e,a=1){if(!Array.isArray(t)||a>_e)return[];let n=[];for(let i of t){let o=[];for(let d of i.rows??[]){let c=Le(d,e);if(c===null)continue;let h=le(d.lists,e,a+1);o.push(h.length>0?{label:c,lists:h}:{label:c})}if(o.length===0)continue;let l=i.item?e.items.find(d=>d.id===i.item):null;n.push(l?{head:l.label,rows:o}:{rows:o})}return n}function Le(t,e){if(t.page!==void 0)return e.pages.find(i=>i.id===t.page)?.name??null;let a=t.data;return(e.rows??[]).find(i=>i.id===a)?.label??e.facts.find(i=>i.id===a)?.value??e.items.find(i=>i.id===a)?.label??null}function H(t){let e=new Map((t.assumptions??[]).filter(o=>Array.isArray(o.alternatives)&&/^facts\[[^\]]+\]\.value$/.test(o.field)).map(o=>[o.field,o])),a=t.items.filter(o=>o.kind==="service"),n=a.map(o=>o.id),i=t.facts.find(o=>o.kind==="business.name")?.value??"";return{planId:t.id,revision:t.revision,name:i,facts:t.facts.map(o=>{let l=`facts[${o.id}].value`,d=e.get(l);return{id:o.id,field:l,label:o.label,value:o.value,source:F(o.sources),choice:d?Ae(o,d):null}}),language:t.language,look:{template:t.look.template.name,accent:t.look.accent,logo:t.look.logo.kind==="own"?{kind:"own",source:t.look.logo.source}:{kind:t.look.logo.kind}},services:a.map(o=>({id:o.id,field:`items[${o.id}].label`,label:o.label,source:F(o.sources)})),pages:t.pages.map(o=>({id:o.id,name:o.name,blocks:o.blocks.map(l=>{let d=le(l.lists,t);return{id:l.id,label:l.label,reason:l.reason,holds:Ie(l,t,n),...d.length>0?{lists:d}:{}}})})),pictures:{own:{frames:t.pictures.own.frames,from:[...t.pictures.own.from??[]]},generated:{frames:t.pictures.generated.frames,...t.pictures.generated.reason?{reason:t.pictures.generated.reason}:{}}},assumptions:(t.assumptions??[]).filter(o=>!e.has(o.field)).map(o=>({id:o.id,said:o.said})),leftOut:(t.leftOut??[]).map(o=>({what:o.what,kind:o.kind,reason:o.reason})),counts:{pages:t.pages.length,services:a.length}}}function M(t,e,a){return{schema:Re,id:a,plan:{id:t.id,revision:t.revision},changes:e.map(n=>({field:n.field,value:n.value}))}}function V(t,e,a){let n=String(a??"").trim();if(n==="")return null;if(typeof e=="number"){if(!/^\d+$/.test(n))return null;let i=Number(n);return i===e?null:{field:t,value:i}}return n===e?null:{field:t,value:n}}function $({plan:t,lastEdit:e=null,canUndo:a=!1}){return!a||!e?.plan||!t?[]:e.plan.id!==t.id||e.plan.revision+1!==t.revision?[]:(e.changes??[]).map(n=>n.field)}var Be=new Set(["look","writer","pictures","write"]);function q(t){let e=(t??[]).filter(n=>n?.quickstart==="released"&&n.fits===!0),a=(e.find(n=>n.recommended===!0)??e[0])?.slug??null;return{options:e,chosen:a,none:e.length===0}}function K(t){return{slug:t.slug,name:t.name,version:t.version}}function Ue(t,e){let a={id:t.id,label:t.label};return t.state==="done"?{...a,state:"done",note:null}:t.state==="failed"?{...a,state:"failed",note:t.attempt>=2?"failed-twice":"failed"}:t.state==="running"&&e===null?{...a,state:"running",note:null}:{...a,state:"pending",note:e==="stopped"?"not-started":null}}function j(t){let e=t?.outcome??null,a=e??t?.events?.at(-1)??null,n=e?.result??null,i=(a?.steps??[]).filter(l=>Be.has(l.kind)).map(l=>Ue(l,n)),o=l=>i.filter(d=>d.state===l).length;return{kind:a?.run?.kind??"build",items:i,counts:{done:o("done"),running:o("running"),pending:o("pending"),failed:o("failed")},elapsedSeconds:a?.elapsedSeconds??0,running:a!==null&&n===null,result:n}}function Y(t){if(t?.result!=="stopped")return null;let e=t.steps??[],a=e.find(n=>n.state==="failed")??e.find(n=>n.id===t.stopped?.step);return{step:a?.label??"",twice:(a?.attempt??0)>=2,writtenPages:e.filter(n=>n.kind==="writer"&&n.state==="done").length,siteUnchanged:!e.some(n=>n.kind==="write"&&n.state==="done"),teamNotified:t.stopped?.teamNotified===!0}}function W(t){let e=Math.max(0,Math.floor(t));return`${Math.floor(e/60)}:${String(e%60).padStart(2,"0")}`}var C=require("react"),g=require("react/jsx-runtime"),ze={failed:"progress.note.failed","failed-twice":"progress.note.failedTwice","not-started":"progress.note.notStarted"},Fe={done:"progress.state.done",running:"progress.state.running",pending:"progress.state.pending",failed:"progress.state.failed"};function He(t,e){let[a,n]=(0,C.useState)(()=>({base:t,at:Date.now()})),[i,o]=(0,C.useState)(()=>Date.now());return a.base!==t&&n({base:t,at:Date.now()}),(0,C.useEffect)(()=>{if(!e)return;let l=setInterval(()=>o(Date.now()),1e3);return()=>clearInterval(l)},[e]),e?t+Math.max(0,Math.floor((i-a.at)/1e3)):t}function ce({run:t,t:e}){let a=j(t),[n,i]=(0,C.useState)(!0),o=He(a.elapsedSeconds,a.running);if(a.items.length===0)return null;let l=[a.counts.done>0&&e("progress.done",{count:a.counts.done}),a.counts.running>0&&e("progress.running",{count:a.counts.running}),a.counts.pending>0&&a.result!=="stopped"&&e("progress.pending",{count:a.counts.pending}),a.counts.failed>0&&e("progress.failed",{count:a.counts.failed})].filter(Boolean).join("\u2002\xB7\u2002"),d=e(a.kind==="partial"?"progress.title.partial":"progress.title.build");return(0,g.jsxs)("section",{className:"tv-bc-todo","aria-label":d,"data-result":a.result??"running",children:[(0,g.jsxs)("button",{type:"button",className:"tv-bc-todo-head","aria-expanded":n,onClick:()=>i(c=>!c),children:[(0,g.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:(0,g.jsx)(D.IconChecklistOutlineRegular,{})}),(0,g.jsx)("span",{className:"tv-bc-todo-title",children:d}),(0,g.jsx)("span",{className:"tv-bc-todo-progress",children:l}),(0,g.jsx)("span",{className:"tv-bc-clock",role:"timer","aria-label":e("progress.clock"),children:W(o)}),(0,g.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:n?(0,g.jsx)(D.IconChevronDownOutlineRegular,{}):(0,g.jsx)(D.IconChevronUpOutlineRegular,{})})]}),n&&(0,g.jsx)("ul",{children:a.items.map(c=>(0,g.jsxs)("li",{"data-s":c.state,"data-note":c.note??void 0,children:[(0,g.jsx)("span",{className:"tv-bc-sd","data-s":c.state,role:"img","aria-label":e(Fe[c.state])}),(0,g.jsx)("span",{className:"tv-bc-c",children:c.label}),c.note!==null&&(0,g.jsx)("span",{className:"tv-bc-r",children:e(ze[c.note])})]},c.id))})]})}var b=require("react/jsx-runtime");function de({outcome:t,t:e}){let a=Y(t);if(a===null)return null;let n=a.writtenPages===0?e("stopped.kept.none"):a.writtenPages===1?e("stopped.kept.one"):e("stopped.kept.other",{count:a.writtenPages});return(0,b.jsxs)("div",{className:"tv-bc-notice",role:"status",children:[(0,b.jsxs)("div",{className:"tv-bc-notice-head",children:[(0,b.jsx)("span",{className:"tv-bc-sd","data-s":"failed","aria-hidden":!0}),e("stopped.title")]}),(0,b.jsx)("p",{children:e(a.twice?"stopped.twice":"stopped.once",{step:a.step})}),(0,b.jsxs)("ul",{children:[(0,b.jsx)("li",{children:n}),a.siteUnchanged&&(0,b.jsx)("li",{children:e("stopped.unchanged")})]}),a.teamNotified&&(0,b.jsxs)("p",{className:"tv-bc-team tv-bc-muted tv-bc-small",children:[(0,b.jsx)(Me,{}),e("stopped.notified")]})]})}function Me(){return(0,b.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:[(0,b.jsx)("path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"}),(0,b.jsx)("path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0"})]})}var ve=require("@deepseek-ai/dsh-client-ui-primitives");var y=require("react");var pe=require("@deepseek-ai/dsh-client-ui-primitives"),B=require("react"),v=require("react/jsx-runtime");function A({ctx:t,field:e,label:a,current:n,text:i,source:o,note:l,children:d}){let{t:c}=t,h=(0,B.useId)(),[k,m]=(0,B.useState)(String(n)),P=t.editing===e,S=t.changed.has(e);return P?(0,v.jsx)("div",{className:"tv-bc-val","data-field":e,"data-editing":"",children:(0,v.jsxs)("div",{className:"tv-bc-edit",children:[(0,v.jsx)("input",{autoFocus:!0,value:k,inputMode:typeof n=="number"?"numeric":void 0,"aria-label":c("plan.newValue",{label:a}),onChange:x=>m(x.target.value),onKeyDown:x=>{x.key==="Enter"?(x.preventDefault(),t.save(e,n,k)):x.key==="Escape"&&(x.preventDefault(),t.cancel(e))}}),(0,v.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",onClick:()=>t.save(e,n,k),children:c("plan.save")}),(0,v.jsx)("button",{type:"button",className:"tv-bc-btn","data-ghost":"",onClick:()=>t.cancel(e),children:c("plan.cancel")})]})}):(0,v.jsxs)("div",{className:"tv-bc-val","data-field":e,"data-changed":S||void 0,children:[(0,v.jsxs)("button",{type:"button",className:"tv-bc-val-row tv-bc-val-edit","aria-label":c("plan.edit",{label:a,value:i}),"aria-describedby":S?h:void 0,"aria-disabled":t.busy||void 0,onClick:()=>{t.busy||(m(String(n)),t.start(e))},children:[(0,v.jsx)("span",{className:"tv-bc-v",children:d??i}),S?(0,v.jsx)("span",{id:h,className:"tv-bc-chip","data-accent":"",children:c("plan.changed")}):o&&(0,v.jsx)("span",{className:"tv-bc-src",children:o}),(0,v.jsx)("span",{className:"tv-bc-pen","aria-hidden":!0,children:(0,v.jsx)(pe.IconEditOutlineRegular,{})})]}),l&&(0,v.jsx)("div",{className:"tv-bc-note",children:l})]})}function ue(){return(0,v.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:[(0,v.jsx)("path",{d:"M9 14 4 9l5-5"}),(0,v.jsx)("path",{d:"M4 9h10a6 6 0 0 1 0 12h-3"})]})}var r=require("react/jsx-runtime"),Ve=()=>`edit-${globalThis.crypto.randomUUID()}`,G=(t,e,a,n={})=>t(`${e}.${a===1?"one":"other"}`,{count:a,...n});function $e(t,e){return e.length<=1?e[0]??"":t("plan.and",{first:e.slice(0,-1).join(", "),last:e[e.length-1]})}var qe=new Set(["service","person","quote","gallery"]);function Ke(t,e){if("services"in e)return e.services.join(", ");let a=e.facts.map((o,l)=>l===0?o:o.toLowerCase()),n=e.counts.map(o=>G(t,`plan.count.${qe.has(o.kind)?o.kind:"item"}`,o.count)),i=[...a,...n].join(", ");return i.charAt(0).toUpperCase()+i.slice(1)}function ge({lists:t}){return(0,r.jsx)("div",{className:"tv-bc-lists",children:t.map((e,a)=>(0,r.jsxs)("section",{className:"tv-bc-list",children:[e.head&&(0,r.jsx)("div",{className:"tv-bc-lh",children:e.head}),(0,r.jsx)("ul",{className:"tv-bc-rows",children:e.rows.map((n,i)=>(0,r.jsxs)("li",{children:[n.label,n.lists&&(0,r.jsx)(ge,{lists:n.lists})]},i))})]},a))})}function je(t,e){try{return new Intl.DisplayNames([e],{type:"language"}).of(t)??t}catch{return t}}function E({field:t,source:e,note:a,children:n}){return(0,r.jsxs)("div",{className:"tv-bc-val","data-field":t,children:[(0,r.jsxs)("div",{className:"tv-bc-val-row",children:[(0,r.jsx)("span",{className:"tv-bc-v",children:n}),e&&(0,r.jsx)("span",{className:"tv-bc-src",children:e})]}),a&&(0,r.jsx)("div",{className:"tv-bc-note",children:a})]})}function Ye({fact:t,busy:e,changed:a,onPick:n}){let i=(0,y.useId)();return(0,r.jsxs)("div",{className:"tv-bc-val","data-field":t.field,"data-changed":a||void 0,children:[(0,r.jsx)("div",{className:"tv-bc-choice",role:"radiogroup","aria-label":t.label,"aria-busy":e,children:t.choice.options.map(o=>(0,r.jsxs)("label",{className:"tv-bc-opt","data-checked":o.selected||void 0,children:[(0,r.jsx)("input",{type:"radio",name:i,value:o.value,checked:o.selected,disabled:e,onChange:()=>n(o.value)}),(0,r.jsx)("span",{className:"tv-bc-v",children:o.value}),(0,r.jsx)("span",{className:"tv-bc-src",children:o.source})]},o.value))}),t.choice.options[0]?.selected&&(0,r.jsx)("div",{className:"tv-bc-note",children:t.choice.said})]})}function O({title:t,children:e}){return(0,r.jsxs)("section",{className:"tv-bc-plan-sec","aria-label":t,children:[(0,r.jsx)("h4",{children:t}),e]})}function fe({plan:t,lastEdit:e=null,canUndo:a=!1,t:n,onEdit:i,onUndo:o,locale:l="en",newEditId:d=Ve}){let[c,h]=(0,y.useState)({plan:t,lastEdit:e,canUndo:a}),[k,m]=(0,y.useState)(!1),[P,S]=(0,y.useState)(!1),[x,N]=(0,y.useState)(null),[_,w]=(0,y.useState)(null),Z=(0,y.useRef)(null);(0,y.useEffect)(()=>h({plan:t,lastEdit:e,canUndo:a}),[t,e,a]),(0,y.useEffect)(()=>{_===null||x!==null||(Z.current?.querySelector(`[data-field="${CSS.escape(_)}"] .tv-bc-val-edit`)?.focus(),w(null))});let ee=c.plan,p=H(ee),te=async s=>{m(!0),S(!1);try{h(await s())}catch{S(!0)}finally{m(!1)}},ne=s=>te(()=>i(M(ee,s,d()))),R={t:n,editing:x,busy:k,changed:new Set($(c)),start:s=>N(s),cancel:s=>{N(null),w(s)},save:(s,f,Ne)=>{N(null),w(s);let oe=V(s,f,Ne);oe&&ne([oe])}},ae=p.look.logo.kind==="own"?n("plan.look.logoOwn",{source:p.look.logo.source??""}):n("plan.look.logoText"),ke=p.pictures.generated.frames===0?n("plan.pictures.drawnNone"):G(n,"plan.pictures.drawnValue",p.pictures.generated.frames);return(0,r.jsxs)("article",{ref:Z,className:"tv-bc-plan","aria-label":n("plan.title",{name:p.name}),children:[(0,r.jsxs)("div",{className:"tv-bc-plan-h",children:[(0,r.jsx)("h3",{className:"tv-bc-plan-t",children:n("plan.title",{name:p.name})}),(0,r.jsx)("span",{className:"tv-bc-chip","data-plain":"",children:n("plan.design",{name:p.look.template})}),(0,r.jsxs)("button",{type:"button",className:"tv-bc-btn","data-ghost":"","aria-label":n("plan.undoLabel"),disabled:!c.canUndo||k,onClick:()=>{N(null),te(o)},children:[(0,r.jsx)(ue,{}),n("plan.undo")]})]}),P&&(0,r.jsx)("p",{className:"tv-bc-plan-err tv-bc-error",role:"alert",children:n("plan.saveFailed")}),(0,r.jsx)(O,{title:n("plan.facts"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[p.facts.map(s=>(0,r.jsx)(T,{label:s.label,children:s.choice?(0,r.jsx)(Ye,{fact:s,busy:k,changed:R.changed.has(s.field),onPick:f=>{f!==s.value&&ne([{field:s.field,value:f}])}}):(0,r.jsx)(A,{ctx:R,field:s.field,label:s.label,current:s.value,text:s.value,source:s.source})},s.id)),(0,r.jsx)(T,{label:n("plan.language"),children:(0,r.jsx)(E,{field:"language",source:n("plan.allSources"),children:je(p.language,l)})})]})}),(0,r.jsx)(O,{title:n("plan.look"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[(0,r.jsx)(T,{label:n("plan.look.template"),children:(0,r.jsx)(E,{field:"look.template",children:p.look.template})}),(0,r.jsx)(T,{label:n("plan.look.accent"),children:(0,r.jsxs)(A,{ctx:R,field:"look.accent",label:n("plan.look.accent"),current:p.look.accent,text:p.look.accent,children:[(0,r.jsx)("span",{className:"tv-bc-swatch",style:{background:p.look.accent},"aria-hidden":!0}),p.look.accent]})}),(0,r.jsx)(T,{label:n("plan.look.logoLight"),children:(0,r.jsx)(E,{field:"look.logo",children:ae})}),(0,r.jsx)(T,{label:n("plan.look.logoDark"),children:(0,r.jsx)(E,{field:"look.logo",children:ae})})]})}),(0,r.jsx)(O,{title:n("plan.services",{count:p.services.length}),children:(0,r.jsx)("div",{className:"tv-bc-kv",children:p.services.map((s,f)=>(0,r.jsx)(T,{label:n("plan.service",{n:f+1}),children:(0,r.jsx)(A,{ctx:R,field:s.field,label:n("plan.service",{n:f+1}),current:s.label,text:s.label,source:s.source})},s.id))})}),(0,r.jsx)(O,{title:n("plan.pages",{count:p.pages.length}),children:p.pages.map(s=>(0,r.jsxs)("div",{className:"tv-bc-page","data-page":s.id,children:[(0,r.jsxs)("div",{className:"tv-bc-ph",children:[s.name,(0,r.jsx)("span",{className:"tv-bc-n",children:G(n,"plan.sections",s.blocks.length)})]}),(0,r.jsx)("ol",{children:s.blocks.map(f=>(0,r.jsxs)("li",{children:[(0,r.jsx)("span",{className:"tv-bc-bn",children:f.label}),(0,r.jsx)(E,{field:`pages[${s.id}].blocks[${f.id}].data`,..."services"in f.holds?{source:n("plan.fromServices")}:{},note:f.reason,children:Ke(n,f.holds)}),f.lists&&(0,r.jsx)(ge,{lists:f.lists})]},f.id))})]},s.id))}),(0,r.jsx)(O,{title:n("plan.pictures"),children:(0,r.jsxs)("div",{className:"tv-bc-kv",children:[(0,r.jsx)(T,{label:n("plan.pictures.own"),children:(0,r.jsx)(E,{children:n("plan.pictures.ownValue",{count:p.pictures.own.frames,from:$e(n,p.pictures.own.from)})})}),(0,r.jsx)(T,{label:n("plan.pictures.drawn"),children:(0,r.jsx)(A,{ctx:R,field:"pictures.generated.frames",label:n("plan.pictures.drawn"),current:p.pictures.generated.frames,text:ke,...p.pictures.generated.reason?{note:p.pictures.generated.reason}:{}})})]})}),p.assumptions.length>0&&(0,r.jsx)(O,{title:n("plan.assumptions"),children:(0,r.jsx)("ul",{className:"tv-bc-plain",children:p.assumptions.map(s=>(0,r.jsx)("li",{children:s.said},s.id))})}),p.leftOut.length>0&&(0,r.jsx)(O,{title:n("plan.leftOut"),children:(0,r.jsx)("ul",{className:"tv-bc-dropped",children:p.leftOut.map(s=>(0,r.jsxs)("li",{children:[(0,r.jsx)("span",{className:"tv-bc-x",children:(0,r.jsx)(ve.IconCloseOutlineRegular,{"aria-hidden":!0})}),(0,r.jsxs)("span",{children:[(0,r.jsxs)("span",{className:"tv-bc-what",children:[s.what,"."]})," ",(0,r.jsx)("span",{className:"tv-bc-muted",children:s.reason})]})]},s.what))})})]})}function T({label:t,children:e}){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("div",{className:"tv-bc-k",children:t}),(0,r.jsx)("div",{className:"tv-bc-cell",children:e})]})}var X="/api/build-draft/plan-edits",J="/api/build-draft/plan-undo";async function me(t,e,a){let n=await a(t,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(e)}),i=await n.json().catch(()=>null);if(!n.ok||!i?.draft?.plan)throw new Error(String(i?.code??n.status));let{plan:o,lastEdit:l=null,canUndo:d=!1}=i.draft;return{plan:o,lastEdit:l,canUndo:d}}function be(t,e=fetch){return me(X,{edit:t},e)}function he(t=fetch){return me(J,{},t)}var We="/api/build-draft/template";async function xe(t,e=fetch){let a=await e(We,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({template:t})}),n=await a.json().catch(()=>null);if(!a.ok)throw new Error(String(n?.code??a.status));return n?.draft??null}var we=require("@deepseek-ai/dsh-client-ui-primitives");var I=require("react"),u=require("react/jsx-runtime"),Q="?tab=tracy%3Aadd-site";function ye({templates:t,t:e,onChoose:a,chosen:n=null,addSiteHref:i=Q}){let o=q(t),[l,d]=(0,I.useState)(n??o.chosen),[c,h]=(0,I.useState)(n),[k,m]=(0,I.useState)(!1),[P,S]=(0,I.useState)(!1);if(o.none)return(0,u.jsxs)("div",{className:"tv-bc-card tv-bc-none",role:"status",children:[(0,u.jsx)("p",{children:e("template.none")}),(0,u.jsx)("p",{className:"tv-bc-muted",children:e("template.noneNext")}),(0,u.jsx)("div",{className:"tv-bc-tfoot",children:(0,u.jsx)("a",{className:"tv-bc-btn",href:i,children:e("template.openAddSite")})})]});let x=c!==null,N=o.options.find(w=>w.slug===(c??l))??o.options[0],_=async()=>{m(!0),S(!1);try{await a(K(N)),h(N.slug)}catch{S(!0)}finally{m(!1)}};return(0,u.jsxs)("div",{className:"tv-bc-card",children:[(0,u.jsx)("div",{className:"tv-bc-tgrid",role:"group","aria-label":e("template.list"),children:o.options.map(w=>(0,u.jsxs)("button",{type:"button",className:"tv-bc-tpl","aria-pressed":N.slug===w.slug,"aria-disabled":x||void 0,onClick:()=>{x||d(w.slug)},children:[(0,u.jsx)("img",{className:"tv-bc-thumb",src:w.picture,alt:"",loading:"lazy"}),(0,u.jsxs)("span",{className:"tv-bc-nm",children:[w.name,w.recommended===!0&&(0,u.jsx)("span",{className:"tv-bc-badge",children:e("template.recommended")})]}),(0,u.jsx)("span",{className:"tv-bc-why",children:w.reason})]},w.slug))}),(0,u.jsx)("div",{className:"tv-bc-tfoot",children:x?(0,u.jsxs)("span",{className:"tv-bc-chip",children:[(0,u.jsx)(we.IconCheckOutlineRegular,{"aria-hidden":!0}),e("template.chosen",{name:N.name})]}):(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)("span",{className:P?"tv-bc-grow tv-bc-error":"tv-bc-grow tv-bc-muted tv-bc-small",role:"status",children:e(P?"template.saveFailed":"template.later")}),(0,u.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",disabled:k,onClick:_,children:e("template.use",{name:N.name})})]})})]})}var Ge=["locale"];function Xe(t){t.effect(()=>{let e="tracy-build-chat-css";if(document.getElementById(e))return;let a=document.createElement("style");return a.id=e,a.textContent=re,document.head.appendChild(a),()=>a.remove()},"tracy-build-chat: styles"),t.effect(()=>t.locale.register(L,{en:z}),"tracy-build-chat: dictionaries")}

		return module.exports;
	}
});
