window.__ModuleLoader__.load({
	id: "@tracy/dsh-build-chat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";var x=Object.defineProperty;var F=Object.getOwnPropertyDescriptor;var K=Object.getOwnPropertyNames;var L=Object.prototype.hasOwnProperty;var Y=(n,e)=>{for(var t in e)x(n,t,{get:e[t],enumerable:!0})},$=(n,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of K(e))!L.call(n,s)&&s!==t&&x(n,s,{get:()=>e[s],enumerable:!(o=F(e,s))||o.enumerable});return n};var j=n=>$(x({},"__esModule",{value:!0}),n);var ee={};Y(ee,{ADD_SITE_HREF:()=>C,BUILD_CHAT_NS:()=>v,BuildProgress:()=>R,BuildStopped:()=>B,TemplateCard:()=>z,apply:()=>Z,english:()=>A,inject:()=>V,saveTemplateChoice:()=>E});module.exports=j(ee);var _=`
.tv-bc-card, .tv-bc-todo, .tv-bc-notice {
  box-sizing: border-box; container-type: inline-size; font-size: 14px; line-height: 1.5;
  color: var(--card-foreground); background: var(--card); border: 1px solid var(--border);
}
.tv-bc-card *, .tv-bc-todo *, .tv-bc-notice * { box-sizing: border-box; }
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
`;var v="tracy-build-chat",y={"template.list":"Designs for your site","template.recommended":"Recommended","template.later":"You can change the design later.","template.use":"Use {name}","template.chosen":"Chosen: {name}","template.saveFailed":"Your choice was not saved. Try again.","template.none":"No ready design fits your business yet.","template.noneNext":"You can still add your site from Add site.","template.openAddSite":"Open Add site","progress.title.build":"Building your site","progress.title.partial":"Updating your site","progress.done":"{count} completed","progress.running":"{count} in progress","progress.pending":"{count} pending","progress.failed":"{count} failed","progress.state.done":"Completed","progress.state.running":"In progress","progress.state.pending":"Pending","progress.state.failed":"Failed","progress.note.failed":"Failed","progress.note.failedTwice":"Failed twice","progress.note.notStarted":"Not started","progress.clock":"Elapsed time","stopped.title":"Your site is not finished yet","stopped.twice":'The step "{step}" failed twice, so I stopped instead of showing you a half built site.',"stopped.once":'The step "{step}" failed, so I stopped instead of showing you a half built site.',"stopped.kept.none":"Kept: your plan and your answers.","stopped.kept.one":"Kept: your plan, your answers and the written page.","stopped.kept.other":"Kept: your plan, your answers and the {count} written pages.","stopped.unchanged":"Your current site is unchanged.","stopped.notified":"The Tracy team has been notified and will reply in this chat. You do not need to do anything."},A=(n,e={})=>y[n].replace(/\{(\w+)\}/g,(t,o)=>String(e[o]??""));var m=require("@deepseek-ai/dsh-client-ui-primitives");var q=new Set(["look","writer","pictures","write"]);function w(n){let e=(n??[]).filter(o=>o?.quickstart==="released"&&o.fits===!0),t=(e.find(o=>o.recommended===!0)??e[0])?.slug??null;return{options:e,chosen:t,none:e.length===0}}function k(n){return{slug:n.slug,name:n.name,version:n.version}}function G(n,e){let t={id:n.id,label:n.label};return n.state==="done"?{...t,state:"done",note:null}:n.state==="failed"?{...t,state:"failed",note:n.attempt>=2?"failed-twice":"failed"}:n.state==="running"&&e===null?{...t,state:"running",note:null}:{...t,state:"pending",note:e==="stopped"?"not-started":null}}function S(n){let e=n?.outcome??null,t=e??n?.events?.at(-1)??null,o=e?.result??null,s=(t?.steps??[]).filter(d=>q.has(d.kind)).map(d=>G(d,o)),i=d=>s.filter(u=>u.state===d).length;return{kind:t?.run?.kind??"build",items:s,counts:{done:i("done"),running:i("running"),pending:i("pending"),failed:i("failed")},elapsedSeconds:t?.elapsedSeconds??0,running:t!==null&&o===null,result:o}}function N(n){if(n?.result!=="stopped")return null;let e=n.steps??[],t=e.find(o=>o.state==="failed")??e.find(o=>o.id===n.stopped?.step);return{step:t?.label??"",twice:(t?.attempt??0)>=2,writtenPages:e.filter(o=>o.kind==="writer"&&o.state==="done").length,siteUnchanged:!e.some(o=>o.kind==="write"&&o.state==="done"),teamNotified:n.stopped?.teamNotified===!0}}function T(n){let e=Math.max(0,Math.floor(n));return`${Math.floor(e/60)}:${String(e%60).padStart(2,"0")}`}var g=require("react"),a=require("react/jsx-runtime"),Q={failed:"progress.note.failed","failed-twice":"progress.note.failedTwice","not-started":"progress.note.notStarted"},W={done:"progress.state.done",running:"progress.state.running",pending:"progress.state.pending",failed:"progress.state.failed"};function X(n,e){let[t,o]=(0,g.useState)(()=>({base:n,at:Date.now()})),[s,i]=(0,g.useState)(()=>Date.now());return t.base!==n&&o({base:n,at:Date.now()}),(0,g.useEffect)(()=>{if(!e)return;let d=setInterval(()=>i(Date.now()),1e3);return()=>clearInterval(d)},[e]),e?n+Math.max(0,Math.floor((s-t.at)/1e3)):n}function R({run:n,t:e}){let t=S(n),[o,s]=(0,g.useState)(!0),i=X(t.elapsedSeconds,t.running);if(t.items.length===0)return null;let d=[t.counts.done>0&&e("progress.done",{count:t.counts.done}),t.counts.running>0&&e("progress.running",{count:t.counts.running}),t.counts.pending>0&&t.result!=="stopped"&&e("progress.pending",{count:t.counts.pending}),t.counts.failed>0&&e("progress.failed",{count:t.counts.failed})].filter(Boolean).join("\u2002\xB7\u2002"),u=e(t.kind==="partial"?"progress.title.partial":"progress.title.build");return(0,a.jsxs)("section",{className:"tv-bc-todo","aria-label":u,"data-result":t.result??"running",children:[(0,a.jsxs)("button",{type:"button",className:"tv-bc-todo-head","aria-expanded":o,onClick:()=>s(c=>!c),children:[(0,a.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:(0,a.jsx)(m.IconChecklistOutlineRegular,{})}),(0,a.jsx)("span",{className:"tv-bc-todo-title",children:u}),(0,a.jsx)("span",{className:"tv-bc-todo-progress",children:d}),(0,a.jsx)("span",{className:"tv-bc-clock",role:"timer","aria-label":e("progress.clock"),children:T(i)}),(0,a.jsx)("span",{className:"tv-bc-todo-icon","aria-hidden":!0,children:o?(0,a.jsx)(m.IconChevronDownOutlineRegular,{}):(0,a.jsx)(m.IconChevronUpOutlineRegular,{})})]}),o&&(0,a.jsx)("ul",{children:t.items.map(c=>(0,a.jsxs)("li",{"data-s":c.state,"data-note":c.note??void 0,children:[(0,a.jsx)("span",{className:"tv-bc-sd","data-s":c.state,role:"img","aria-label":e(W[c.state])}),(0,a.jsx)("span",{className:"tv-bc-c",children:c.label}),c.note!==null&&(0,a.jsx)("span",{className:"tv-bc-r",children:e(Q[c.note])})]},c.id))})]})}var l=require("react/jsx-runtime");function B({outcome:n,t:e}){let t=N(n);if(t===null)return null;let o=t.writtenPages===0?e("stopped.kept.none"):t.writtenPages===1?e("stopped.kept.one"):e("stopped.kept.other",{count:t.writtenPages});return(0,l.jsxs)("div",{className:"tv-bc-notice",role:"status",children:[(0,l.jsxs)("div",{className:"tv-bc-notice-head",children:[(0,l.jsx)("span",{className:"tv-bc-sd","data-s":"failed","aria-hidden":!0}),e("stopped.title")]}),(0,l.jsx)("p",{children:e(t.twice?"stopped.twice":"stopped.once",{step:t.step})}),(0,l.jsxs)("ul",{children:[(0,l.jsx)("li",{children:o}),t.siteUnchanged&&(0,l.jsx)("li",{children:e("stopped.unchanged")})]}),t.teamNotified&&(0,l.jsx)("p",{className:"tv-bc-team tv-bc-muted tv-bc-small",children:e("stopped.notified")})]})}var J="/api/build-draft/template";async function E(n,e=fetch){let t=await e(J,{method:"PUT",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({template:n})}),o=await t.json().catch(()=>null);if(!t.ok)throw new Error(String(o?.code??t.status));return o?.draft??null}var D=require("@deepseek-ai/dsh-client-ui-primitives");var b=require("react"),r=require("react/jsx-runtime"),C="?tab=tracy%3Aadd-site";function z({templates:n,t:e,onChoose:t,chosen:o=null,addSiteHref:s=C}){let i=w(n),[d,u]=(0,b.useState)(o??i.chosen),[c,U]=(0,b.useState)(o),[M,O]=(0,b.useState)(!1),[I,P]=(0,b.useState)(!1);if(i.none)return(0,r.jsxs)("div",{className:"tv-bc-card tv-bc-none",role:"status",children:[(0,r.jsx)("p",{children:e("template.none")}),(0,r.jsx)("p",{className:"tv-bc-muted",children:e("template.noneNext")}),(0,r.jsx)("div",{className:"tv-bc-tfoot",children:(0,r.jsx)("a",{className:"tv-bc-btn",href:s,children:e("template.openAddSite")})})]});let h=c!==null,f=i.options.find(p=>p.slug===(c??d))??i.options[0],H=async()=>{O(!0),P(!1);try{await t(k(f)),U(f.slug)}catch{P(!0)}finally{O(!1)}};return(0,r.jsxs)("div",{className:"tv-bc-card",children:[(0,r.jsx)("div",{className:"tv-bc-tgrid",role:"group","aria-label":e("template.list"),children:i.options.map(p=>(0,r.jsxs)("button",{type:"button",className:"tv-bc-tpl","aria-pressed":f.slug===p.slug,"aria-disabled":h||void 0,onClick:()=>{h||u(p.slug)},children:[(0,r.jsx)("img",{className:"tv-bc-thumb",src:p.picture,alt:"",loading:"lazy"}),(0,r.jsxs)("span",{className:"tv-bc-nm",children:[p.name,p.recommended===!0&&(0,r.jsx)("span",{className:"tv-bc-badge",children:e("template.recommended")})]}),(0,r.jsx)("span",{className:"tv-bc-why",children:p.reason})]},p.slug))}),(0,r.jsx)("div",{className:"tv-bc-tfoot",children:h?(0,r.jsxs)("span",{className:"tv-bc-chip",children:[(0,r.jsx)(D.IconCheckOutlineRegular,{"aria-hidden":!0}),e("template.chosen",{name:f.name})]}):(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("span",{className:I?"tv-bc-grow tv-bc-error":"tv-bc-grow tv-bc-muted tv-bc-small",role:"status",children:e(I?"template.saveFailed":"template.later")}),(0,r.jsx)("button",{type:"button",className:"tv-bc-btn","data-primary":"",disabled:M,onClick:H,children:e("template.use",{name:f.name})})]})})]})}var V=["locale"];function Z(n){n.effect(()=>{let e="tracy-build-chat-css";if(document.getElementById(e))return;let t=document.createElement("style");return t.id=e,t.textContent=_,document.head.appendChild(t),()=>t.remove()},"tracy-build-chat: styles"),n.effect(()=>n.locale.register(v,{en:y}),"tracy-build-chat: dictionaries")}

		return module.exports;
	}
});
