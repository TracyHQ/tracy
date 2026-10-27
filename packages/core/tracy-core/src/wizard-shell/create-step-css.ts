/** Create shares the wizard's typography, alerts and default-size action buttons. */
export const CREATE_STEP_CSS = `
/* The last segment reflects creation; completed form segments keep their normal fill. */
.tas-root .tas-wizard-segment[data-step-state="running"] > span { animation: tas-create-pulse 2.4s ease-in-out infinite; }
.tas-root .tas-wizard-segment[data-step-state="failed"] > span { background: var(--destructive); }
@media (prefers-reduced-motion: reduce) { .tas-root .tas-wizard-segment[data-step-state="running"] > span { animation: none; } }
/* The default matches wizard body text; Settings scales the whole Create step together. */
.tas-create-step, .tas-create-problem { --tas-create-font: var(--dsh-content-font-size, 14px); min-width: 0; font-size: var(--tas-create-font); line-height: calc(var(--tas-create-font) * 20 / 14); }
.tas-create-step { padding-top: 2px; }
.tas-create-step .tas-wizard-title { font-size: calc(var(--tas-create-font) * 20 / 14); }
.tas-create-step .tas-wizard-desc { font-size: var(--tas-create-font); line-height: inherit; overflow-wrap: anywhere; }
.tas-create-checklist { display: flex; flex-direction: column; gap: 0; list-style: none; margin: 20px 0 16px; padding: 0; }
.tas-create-checklist li { position: relative; display: flex; align-items: center; gap: 10px; min-height: calc(var(--tas-create-font) * 34 / 14); padding-bottom: 8px; font-size: inherit; line-height: inherit; color: var(--muted-foreground); }
.tas-create-checklist li:last-child { padding-bottom: 0; }
.tas-create-checklist li:not(:last-child)::after { position: absolute; content: ''; left: calc(var(--tas-create-font) * 10 / 14 - .5px); top: calc(var(--tas-create-font) * 22 / 14); bottom: 2px; width: 1px; background: var(--border); }
.tas-create-checklist [data-milestone="running"] { color: var(--foreground); }
.tas-create-marker { display: flex; align-items: center; justify-content: center; flex: none; width: calc(var(--tas-create-font) * 20 / 14); height: calc(var(--tas-create-font) * 20 / 14); color: var(--primary); }
.tas-create-marker svg { width: calc(var(--tas-create-font) * 16 / 14); height: calc(var(--tas-create-font) * 16 / 14); }
.tas-create-checklist [data-milestone="done"] .tas-create-marker { border-radius: 50%; color: var(--primary-foreground); background: var(--primary); }
.tas-create-checklist [data-milestone="done"] .tas-create-marker svg { width: calc(var(--tas-create-font) * 12 / 14); height: calc(var(--tas-create-font) * 12 / 14); }
.tas-create-checklist [data-milestone="failed"] .tas-create-marker { color: var(--destructive); }
.tas-create-status { display: flex; align-items: flex-start; gap: 9px; margin: 10px 0 0; font-size: inherit; font-weight: 400; line-height: inherit; color: var(--muted-foreground); }
.tas-create-status-copy { min-width: 0; }
.tas-create-status-copy > strong { display: block; color: var(--foreground); font-weight: 500; }
.tas-create-explanation { display: block; }
.tas-create-live { width: 6px; height: 6px; flex: none; margin-top: calc(var(--tas-create-font) * 7 / 14); border-radius: 50%; background: var(--primary); animation: tas-create-pulse 2.4s ease-in-out infinite; }
@keyframes tas-create-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .tas-create-live { animation: none; } }
/* Reuse Customize's shared Alert. There is no second guidance box inside it. */
.tas-create-notice { margin-top: 16px; font-size: inherit; line-height: inherit; }
.tas-create-notice [data-slot="alert-description"] { gap: 6px; min-width: 0; font-size: inherit; line-height: inherit; }
.tas-create-notice .tas-create-status { margin: 0; color: var(--foreground); }
.tas-create-notice[data-severity="error"] .tas-create-status { color: var(--destructive); }
.tas-create-notice > svg { width: calc(var(--tas-create-font) * 16 / 14); height: calc(var(--tas-create-font) * 16 / 14); }
.tas-create-guidance { margin: 0; font-size: inherit; line-height: inherit; color: var(--muted-foreground); overflow-wrap: anywhere; }
ol.tas-create-guidance { padding-left: 1.5em; }
.tas-create-guidance li + li { margin-top: 4px; }
/* Large Button sizing is shared with the final wizard pages; outline matches Customize/Review. */
.tas-create-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; }
.tas-create-actions:empty { display: none; }
.tas-create-actions [data-slot="button"], .tas-create-technical [data-slot="button"] { font: inherit; min-height: calc(var(--tas-create-font) * 36 / 14); height: auto; }
.tas-create-actions [data-slot="button"].bg-primary { color: var(--primary-foreground); }
.tas-create-actions [data-slot="button"].border-border, .tas-create-technical [data-slot="button"] { border-color: var(--border); background: transparent; color: var(--foreground); }
.tas-create-actions [data-slot="button"].border-border:hover, .tas-create-technical [data-slot="button"]:hover { background: var(--muted); }
.tas-create-actions [data-slot="button"] svg { width: calc(var(--tas-create-font) * 16 / 14); height: calc(var(--tas-create-font) * 16 / 14); }
.tas-create-actions a[data-slot="button"] { text-decoration: none; }
.tas-create-technical { margin-top: 16px; font-size: inherit; line-height: inherit; color: var(--muted-foreground); }
.tas-create-technical summary { width: fit-content; cursor: pointer; }
.tas-create-technical summary:hover { color: var(--foreground); }
.tas-create-technical pre { max-width: 100%; max-height: 240px; overflow: auto; margin: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: inherit; line-height: inherit; color: var(--muted-foreground); }
.tas-create-technical summary:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
`
