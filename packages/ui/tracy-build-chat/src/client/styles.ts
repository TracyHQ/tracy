/**
 * Plain CSS for the build chat cards (mode B: inside dsh's page, no reset, tv-bc- prefix). Every colour is a Tracy
 * token from tracy-ui tokens.css, so one rule is right in both themes; a missing shade is a color-mix of two tokens.
 * Shapes follow the approved build chat mock, which copied them from dsh's task list (TodoPanel).
 * Each card is its own size container, so it lays out for the room the chat column gives it, phone or desktop.
 */
export const CSS = `
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
/* A quiet action with nothing to do (Undo with no last edit) reads as unavailable, not as plain text */
.tv-bc-btn[data-ghost]:disabled { color: var(--muted-foreground); }
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
.tv-bc-v { display: inline-flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
/* A value the owner can change: the whole row is a button, a pencil on hover, the just changed value tinted */
.tv-bc-val-edit {
  width: calc(100% + 16px); min-height: 30px; margin: 0 -8px; padding: 4px 8px; border-radius: 8px;
  border: 1px solid transparent; background: transparent; color: inherit; font: inherit; text-align: left; cursor: text;
  /* A long link wraps anywhere: a host button rule must not clip it to one line */
  white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere;
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

/* The quiet row of one tracy_build call (BuildToolRow): dsh's own process row, the business name beside it */
.tv-bc-toolrow-sum { margin-left: 6px; color: var(--muted-foreground); overflow-wrap: normal; word-break: keep-all; }
/* The same row above the chat input while a call waits (WorkingDock) */
/* It sits in the column of the chat: the width axis dsh gives the messages and the input, centred like them */
.tv-bc-dock {
  box-sizing: border-box; min-width: 0; margin: 0 auto; padding: 0 0 4px;
  width: var(--dsh-chat-content-width, calc(100% - 32px)); max-width: 100%;
}

/* The plan review bar (ReviewBar): the shape of dsh's plan review panel, in Tracy tokens */
.tv-bc-review-frame {
  display: flex; flex-direction: column; gap: 8px; padding: 6px 16px 10px; container-type: inline-size;
}
/* The living plan card above the bar while the review waits: it scrolls in its own box, the chat keeps its room */
.tv-bc-review-plan { max-height: 50vh; overflow-y: auto; overscroll-behavior: contain; border-radius: 16px; }
.tv-bc-review {
  box-sizing: border-box; display: flex; flex-direction: column; width: 100%; overflow: hidden;
  border: 1px solid var(--border); border-radius: 16px; background: var(--card); color: var(--card-foreground);
  font-size: 14px; line-height: 1.5;
}
.tv-bc-review * { box-sizing: border-box; }
.tv-bc-review-strip {
  padding: 10px 16px; font-weight: 500; overflow-wrap: break-word;
  background: color-mix(in oklab, var(--primary) 10%, var(--card)); color: var(--primary);
}
.tv-bc-review-body { padding: 12px 16px 4px; min-width: 0; }
.tv-bc-review-body p { margin: 0 0 4px; overflow-wrap: break-word; }
.tv-bc-review-q { font-weight: 500; }
.tv-bc-review-foot {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px;
  padding: 8px 16px 12px;
}
.tv-bc-review-err { min-height: 16px; font-size: 12px; color: var(--destructive); }
.tv-bc-review-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-left: auto; }
`
