import { LANGUAGE_ROW_CSS } from './language-row'

/**
 * The CSS Tailwind generates at build time, substituted here by esbuild's `define`.
 *
 * Not an import: dsh serves exactly one `lib/client.js` per plugin, so there is no room for a
 * second CSS file. See `scripts/build-client.mjs` §buildStyles.
 */
declare const __TAILWIND_CSS__: string

/** Tailwind classes of the `@tracy/ui` components, pre-generated. */
export const TAILWIND = __TAILWIND_CSS__

/**
 * This page's frame follows the EXACT numbers of dsh's own dialog, measured from `SettingsRoot.module.css` in
 * `@deepseek-ai/dsh-client-ui-settings-general` (version 0.1.2-alpha.1):
 *
 *     overlay  fixed inset-0 · flex center · z-index 1000
 *     mask     --dsw-alias-bg-mask-1 + --dsw-mask-blur · absolute inset-0
 *     panel    800px · max-width calc(100vw - 48px) · height min(800px, 100vh - 48px)
 *              border-radius 24px · --dsw-shadow-lv3 · --dsw-alias-bg-layer-2
 *
 * ⚠ THE FIRST VERSION WAS A FULL-SCREEN PAGE (`fixed; inset: 0`), rejected on 01/09. The old reason — "a
 * page instead of a dialog" — was a product decision, not a technical one, and it chose wrong:
 * the user opens Settings from inside dsh and expects to come back to the same place, not to be
 * taken somewhere else. Taking dsh's seat is still right (slot `single`, see `cordis.patch.yml`);
 * taking the whole screen is not.
 *
 * `position: fixed` is still required: the `sidebar.settings` slot renders INSIDE the sidebar footer, a
 * ~250px column, so the panel has to escape that column. dsh's own modal does exactly the same.
 *
 * The numbers here are dsh's, not Tracy's — the goal is that the user does not notice they just
 * switched to something else. The layout INSIDE the panel is still `@tracy/ui` classes.
 *
 * 🔒 COMMENTS INSIDE THE TEMPLATE MUST BE IN ENGLISH. That string goes straight into the `lib/client.js`
 * the browser downloads, so outsiders can read it. `check-language` sees the whole template
 * literal as ONE string and caught exactly this on 30/08. Longer explanations stay in
 * this block, outside the template. And NO backtick inside it — one would close the template.
 */
export const CSS = `
/* The overlay: centres the panel over the whole viewport.
   Matches dsh's own settings dialog, including the z-index, so the two stack the same way
   against everything else in the shell. */
.ts-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* The dimmed backdrop behind the panel -- dsh's tokens, so a skin dims it the same way. */
.ts-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
  backdrop-filter: var(--dsw-mask-blur, blur(4px));
}
/* The panel itself, at Tracy's own scale (02/10/2026): 13px body, a 12px radius and a
   hairline border, like the rest of Tracy's surfaces rather than dsh's 24px-radius dialog. */
.ts-surface {
  position: relative;
  z-index: 1;
  width: 760px;
  max-width: calc(100vw - 48px);
  height: min(600px, 100vh - 48px);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  font-size: 13px;
  line-height: 1.4;
}
/* Nav items: 30px rows with an icon; the open one gets a soft tint and the full foreground colour,
   the others stay muted and tint on hover. */
.ts-overlay .ts-nav {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 8px;
  border: 0; border-radius: 7px; background-color: transparent; color: var(--muted-foreground);
  font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.ts-overlay .ts-nav:hover { background-color: color-mix(in oklab, var(--foreground) 5%, transparent); color: var(--foreground); }
.ts-overlay .ts-nav[aria-current] { background-color: color-mix(in oklab, var(--foreground) 6%, transparent); color: var(--foreground); font-weight: 500; }
.ts-overlay .ts-nav:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.ts-nav-icon { width: 15px; height: 15px; flex: none; }
.ts-page-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 26px; color: var(--foreground); }
/* Close: a 26px ghost icon button. */
.ts-overlay .ts-close {
  display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0;
  border-radius: 7px; background-color: transparent; color: var(--muted-foreground); cursor: pointer;
}
.ts-overlay .ts-close:hover { background-color: color-mix(in oklab, var(--foreground) 5%, transparent); color: var(--foreground); }
.ts-overlay .ts-close:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.ts-close svg { width: 14px; height: 14px; }
/* General: one hairline between rows, owned here so every row (Tracy's or dsh's) gets the same. */
.ts-general { display: flex; flex-direction: column; }
.ts-general-item + .ts-general-item { border-top: 1px solid var(--border); }
.ts-general-item:empty { display: none; }
/* A registrant that renders nothing still leaves its display:contents slot wrapper behind, so the
   item is not :empty and drew a second hairline above the next row (measured 02/10/2026, above
   Keyboard shortcuts). */
.ts-general-item:has(> [data-slot]:empty) { display: none; }
/* Rows Tracy draws itself (label and description left, control right) and the compact menu
   button: the Language row's own sheet, shared with the desktop first-run screen. */
${LANGUAGE_ROW_CSS}
/* Settings, Notifications: a label column and two switch columns (Inbox, Email), one hairline
   between rows, the section headings (Team, Comments) in the muted small caps of the nav groups. */
.ts-ntable { display: flex; flex-direction: column; }
.ts-nrow { display: grid; grid-template-columns: minmax(0, 1fr) 64px 64px; align-items: center; column-gap: 8px; padding: 10px 0; }
.ts-ndata + .ts-ndata { border-top: 1px solid var(--border); }
.ts-nhead { padding: 4px 0 6px; font-size: 12px; line-height: 17px; color: var(--muted-foreground); }
.ts-nhead > span, .ts-ncell { display: flex; justify-content: center; }
.ts-nsection { padding: 16px 0 4px; font-size: 11px; line-height: 16px; font-weight: 500; color: var(--muted-foreground); }
.ts-nsection > span { grid-column: 1 / -1; }
.ts-nnote { margin: 10px 0 0; }
/* Desktop app only: the row above the table (this computer's system notification), set apart from
   the server's rows by one hairline. */
.ts-ndesktop { padding-top: 0; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.ts-ndesktop-controls { display: flex; flex: none; flex-direction: column; align-items: flex-end; gap: 8px; margin-left: auto; }
.ts-ndesktop-sound { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.ts-ncell.is-locked { position: relative; align-items: center; }
/* A locked switch keeps the full ON colour: the default half-opacity of a disabled switch read as
   off in the dark theme (04/10/2026). The lock beside it says why it cannot move. */
.ts-ncell.is-locked [data-slot="switch"][data-disabled] { opacity: 1; cursor: default; }
/* Beside the switch, outside the flow, so the switch stays centred under its column like the others. */
.ts-ncell.is-locked .ts-nlock {
  position: absolute; left: calc(50% + 20px); top: 50%; width: 12px; height: 12px;
  transform: translateY(-50%); color: var(--muted-foreground);
}
.ts-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ts-nloading { min-height: 120px; }
/* Settings, Connected apps: one row per app, a hairline between rows. */
.ts-connected-apps .ts-row + .ts-row { border-top: 1px solid var(--border); }
/* The account menu (account-menu.tsx). The name beside the face in the wide column. */
.ts-account-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font-size: 14px; font-weight: 500; }
/* The shortcut at the end of the Settings row: muted keycaps, no box of their own. */
.ts-menu .ts-kbd { font: inherit; font-size: 11px; letter-spacing: 0.04em; color: var(--muted-foreground); }
/* A disc with no letter (nobody known yet) still needs a box to be round. */
.ts-account-trigger [data-tracy-face]:empty { min-width: 1px; }
/* The nav: a dot after a label when that section waits for the person, and the heading-less last
   group (Help & about) set off by a gap. */
.ts-nav-badge { margin-left: auto; width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--primary); }
.ts-nav-tail { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
/* Settings, Help & about (mock-up pa-b.html): two boxes with a 12px radius and a hairline border, a
   closing line of legal links. */
.ts-help { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
.ts-help-box { border: 1px solid var(--border); border-radius: 12px; padding: 2px 16px; }
.ts-help-app { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 0; }
.ts-help-logo { display: grid; place-items: center; width: 52px; height: 52px; flex: none; border-radius: 13px; background: color-mix(in oklab, var(--primary) 12%, var(--background)); }
.ts-help-app-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ts-help-name { font-size: 15px; font-weight: 600; line-height: 20px; color: var(--foreground); }
.ts-help-channel { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 10px; background: var(--muted); color: var(--muted-foreground); font-size: 11px; font-weight: 500; line-height: 18px; vertical-align: 1px; }
.ts-help-download-block { margin-left: auto; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ts-overlay a.ts-help-download { flex: none; color: var(--primary-foreground); text-decoration: none; }
.ts-help-tagline { font-size: 12.5px; line-height: 17px; color: var(--muted-foreground); }
.ts-help-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.ts-help-version-ok { background: color-mix(in oklab, var(--success) 14%, transparent); color: var(--success); border: none; }
.ts-overlay a.ts-help-version-link { display: inline-flex; align-items: center; border-radius: 10px; padding: 1px 8px; font-size: 11.5px; line-height: 17px; font-weight: 500; font-variant-numeric: tabular-nums; text-decoration: none; }
.ts-overlay a.ts-help-version-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.ts-help-version { font-variant-numeric: tabular-nums; }
.ts-help-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 0; border-top: 1px solid var(--border); }
.ts-help-grow { flex: 1; min-width: 0; }
.ts-help-status { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 12.5px; line-height: 17px; color: var(--muted-foreground); }
.ts-help-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--muted-foreground); }
.ts-help-dot[data-tone="ok"] { background: var(--success); }
.ts-help-dot[data-tone="busy"], .ts-help-dot[data-tone="ready"] { background: var(--primary); }
.ts-help-dot[data-tone="warn"] { background: var(--dsw-alias-state-warn-primary); }
.ts-help-dot[data-tone="error"] { background: var(--destructive); }
.ts-help-spin { width: 12px; height: 12px; flex: none; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: ts-help-spin 0.8s linear infinite; }
@keyframes ts-help-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ts-help-spin { animation-duration: 2.4s; } }
.ts-help-bar { height: 5px; max-width: 320px; margin-top: 7px; overflow: hidden; border-radius: 3px; background: var(--muted); }
.ts-help-bar > span { display: block; height: 100%; background: var(--primary); transition: width 0.3s; }
.ts-help-actions { display: flex; flex: none; gap: 8px; }
.ts-help-error { color: var(--destructive); }
.ts-help-notes { padding: 0 0 14px; }
.ts-help-notes + .ts-help-notes { padding-top: 4px; }
.ts-help-notes-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 2px 0 8px; }
.ts-help-notes-head .ts-help-notes-title { margin: 0; }
.ts-help-new { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 10px; background: color-mix(in oklab, var(--primary) 14%, transparent); color: var(--primary); font-size: 11px; font-weight: 500; line-height: 18px; vertical-align: 1px; }
.ts-help-policy { margin-top: 6px; }
.ts-help-notes-title { margin: 2px 0 8px; font-size: 12.5px; font-weight: 600; line-height: 17px; color: var(--foreground); }
/* A fixed height that scrolls inside and can be pulled taller; long words wrap instead of widening it. */
.ts-help-notes-box { min-height: 0; max-height: 480px; overflow-y: auto; resize: vertical; padding: 9px 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); font-size: 12.5px; line-height: 18px; color: var(--foreground); overflow-wrap: anywhere; white-space: pre-wrap; }
.ts-help-notes-box:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.ts-help-notes-box p { margin: 6px 0 2px; }
.ts-help-notes-box p:first-child { margin-top: 0; }
.ts-help-notes-box ul { margin: 0; padding-left: 18px; white-space: normal; }
.ts-help-notes-box li { margin: 2px 0; white-space: pre-wrap; }
.ts-help-link { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.ts-help-link + .ts-help-link { border-top: 1px solid var(--border); }
.ts-help-link-icon { width: 16px; height: 16px; flex: none; color: var(--muted-foreground); }
.ts-overlay a.ts-help-open { flex: none; color: var(--foreground); text-decoration: none; }
.ts-overlay a.ts-help-open:focus-visible { outline: 1px solid var(--ring); outline-offset: 0; }
.ts-help-legal { display: flex; justify-content: center; gap: 4px; margin: -2px 0 4px; font-size: 12px; color: var(--muted-foreground); }
.ts-overlay .ts-help-legal a { color: var(--muted-foreground); text-decoration: none; }
.ts-overlay .ts-help-legal a:hover { color: var(--foreground); text-decoration: underline; }
.ts-overlay .ts-help-legal a:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; border-radius: 3px; }
/* A narrow window: the buttons go under their text rather than squeezing it. */
@media (max-width: 760px) { .ts-help-row { flex-wrap: wrap; } .ts-help-actions { margin-left: auto; } }
/* A phone (measured on dev 09/10/2026 at 360x740): the 196px nav beside the section left the section
   about 100px, so rows drew their buttons over their words. Below 640px the dialog is one column: the
   title and the sections as a strip of tabs that scrolls sideways on top, the open section under it
   at the dialog's whole width, the close button at the top corner. Unlayered rules scoped to the
   overlay, so they win over the Tailwind utilities in the markup. */
@media (max-width: 640px) {
  .ts-overlay .ts-surface { flex-direction: column; width: calc(100% - 16px); max-width: none; height: calc(100% - 16px); }
  .ts-overlay .ts-side { width: auto; border-right: 0; border-bottom: 1px solid var(--border); }
  .ts-overlay .ts-side > [data-slot="scroll-area"] { flex: none; }
  .ts-overlay .ts-navlist { flex-direction: row; gap: 2px; width: max-content; padding: 0 8px 8px; }
  .ts-overlay .ts-navlist > div { display: contents; }
  .ts-overlay .ts-nav-group { display: none; }
  .ts-overlay .ts-nav { width: auto; flex: none; white-space: nowrap; }
  .ts-overlay .ts-nav-tail { margin-top: 0; }
  .ts-overlay .ts-close { position: absolute; top: 9px; right: 10px; }
  .ts-overlay .ts-head { padding: 10px 16px 0; }
  .ts-overlay .ts-content { padding-right: 16px; padding-left: 16px; }
}
`
