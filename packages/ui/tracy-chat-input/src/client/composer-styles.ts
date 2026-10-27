/**
 * The in-session composer's shape and its attachment chips (Akemi, 01/10/2026). Plain CSS, mode B:
 * inside dsh's page, no reset, tv- prefix for what this plugin draws. Injected with styles.ts.
 *
 * dsh's input bar (ui-conversation InputBar) stays dsh's; these rules only lay it out. Its hooks are
 * stable attributes (data-slot, data-composer-card, data-input-scroll, data-composer-placeholder)
 * and the readable tail of its CSS-module classes (_root, _hero, _row, _tools, _trailing, _add,
 * _primary, _accessory, _dock, _input), never a full hashed name.
 *
 * The hero composer (blank session, its root carries _hero) is left as dsh and tracy-brand draw it:
 * every rule below is scoped to a root WITHOUT _hero. The chips themselves (tv-att, tv-chip) are
 * drawn on both.
 *
 * Numbers live in custom properties on the card so they are easy to adjust. The card's width axis
 * stays dsh's (--dsh-composer-card-max-width). The draft's height cap is Tracy's since 01/10/2026:
 * ten lines, 220px, in place of dsh's 336px (start-screen mockup, Case 2 composer spec), set on the
 * bar's slot so dsh's takeover panels, which read the same variable from the seat, keep theirs.
 *
 * A site's start screen (Case 2) keeps the hero composer at the bottom of the column with a taller
 * draft and one control row under it: [+] [role chip] … [send]. Those rules are scoped to the hero
 * root inside a composer stack that holds the site start block (HERO_CARD below), so the creation
 * workspace and a deployment with the start-cards switch off keep dsh's hero as it is.
 */
const CARD =
  ':is([data-slot="conversation.composer.bar"] [class*="_root"]:not([class*="_hero"]) > [data-composer-card], .tv-onboarding-composer)'
const ROOT = '[data-slot="conversation.composer.bar"] [class*="_root"]:not([class*="_hero"])'
const HERO_CARD =
  '[class*="composerHero"]:has([data-tracy-start="site"]) [data-slot="conversation.composer.bar"] [class*="_root"][class*="_hero"] > [data-composer-card]'

/**
 * The same hero card on a Viewer's start screen: the dock block carries data-tracy-viewer, and after a
 * / command (the block emptied) <html> still carries data-tracy-seat-viewer (index.tsx).
 */
const VIEWER_HERO_CARD = `:is([class*="composerHero"]:has([data-tracy-start="site"][data-tracy-viewer]), :root[data-tracy-seat-viewer] [class*="composerHero"]:has([data-tracy-start="site"])) [data-slot="conversation.composer.bar"] [class*="_root"][class*="_hero"] > [data-composer-card]`

/** The in-session chat box while this page's seat is a Viewer (ADR 0028; index.tsx sets the mark). */
const VIEWER_CARD = `:root[data-tracy-seat-viewer] ${CARD}`

export const COMPOSER_CSS = `
/* The draft's height cap, both composers: ten 22px lines. Past it the draft scrolls inside its own
   box (dsh's [data-input-scroll]), and its top edge fades once some text has scrolled out above:
   a scroll-driven animation on that box moves the fade from 0 to 16px over the first 1% of its
   scroll range. composer-line.ts gates the animation on actual overflow and scroll position:
   a completed timeline can otherwise retain its 16px fill after submit shrinks the draft. */
[data-slot="conversation.composer.bar"] { --dsh-composer-text-max-height: 220px; }
/* Both drafts follow Settings' conversation content size, just like dsh's messages. Preserve the
   approved 14px text on 20px lines at the default, with enough leading at larger sizes too.
   The chat box sits 8px in from the conversation's sides on both screens. */
[data-slot="conversation.composer.bar"] [data-composer-card] { --tc-composer-font: var(--dsh-content-font-size, 14px); }
[data-composer-seat] { --dsh-composer-side-clearance: 8px; }
@property --tc-composer-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
@keyframes tc-composer-fade { from { --tc-composer-fade: 0px; } 1%, to { --tc-composer-fade: 16px; } }
[data-slot="conversation.composer.bar"] [data-input-scroll] {
  mask-image: none;
  -webkit-mask-image: none;
}
[data-slot="conversation.composer.bar"] [data-input-scroll][data-tc-composer-scrolled] {
  animation: tc-composer-fade linear both;
  animation-timeline: scroll(self);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, var(--foreground) var(--tc-composer-fade));
  mask-image: linear-gradient(to bottom, transparent 0, var(--foreground) var(--tc-composer-fade));
}

/* A site's start screen (Case 2): the hero card at the bottom of the column, sized after Claude
   Design's narrowest chat (Akemi 14/10/2026): 12px corners, 1px --input border, the 14px hint 13px in
   from the top-left border, a draft as tall as its hint while empty (no empty row under it), then one
   28px control row 11px under it with 6px between its controls: + (dsh's command menu, a 28px
   outlined square), the role chip, and the 30px round send at the far end.
   The draft grows upward (the card is at the column's bottom) up to the cap above. */
${HERO_CARD} {
  --tc-hero-font: var(--tc-composer-font);
  gap: 11px; padding: 10px 12px 12px 8px;
  border: 1px solid var(--input, #e3e7e9); border-radius: 12px;
  background: var(--card, #ffffff); box-shadow: none;
}
/* Active: the same one darker neutral stroke as the in-session card (tracy-brand declares
   --tc-composer-focus-border once), for a click and for Tab alike. Never the terracotta ring: every
   chat box looks the same when it is active (Akemi 01/10/2026). */
${HERO_CARD}:focus-within { border-color: var(--tc-composer-focus-border, var(--input, #e3e7e9)); }
${HERO_CARD} > [data-input-scroll] { margin-right: 0; }
${HERO_CARD} [data-input-scroll] [class*="_input"] { min-height: calc(var(--tc-composer-font) + 6px); padding: 0 4px; font-size: var(--tc-hero-font); line-height: calc(var(--tc-composer-font) + 6px); }
/* No empty row under the hint (Akemi 14/10/2026): while the draft is empty (dsh renders its
   placeholder only then) the hint is in flow and gives the draft its height, one line on a wide
   column and two on the 300px one (three at most, clamped below), and the editable surface lies over
   it. Once something is typed the hint is gone and the draft grows with its text up to the cap. */
${HERO_CARD} [data-input-scroll] [class*="_grow"]:has(> [data-composer-placeholder]) > [class*="_input"] { position: absolute; inset: 0; }
${HERO_CARD} [data-input-scroll] [class*="_grow"]:has(> [data-composer-placeholder]) > [data-composer-placeholder] { position: relative; inset: auto; margin: 0 4px; }
/* The placeholder wraps inside the three-line draft so all of it shows (Akemi 01/10/2026: the one
   ellipsized line cut "@ files or sessions" at ~417px). Past three lines (a very narrow column) it
   is clamped at three lines. */
${HERO_CARD} [data-input-scroll] [data-composer-placeholder] {
  inset: 0 4px auto 4px; display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: 3; line-clamp: 3; white-space: normal; overflow: hidden;
  font-size: var(--tc-hero-font); line-height: calc(var(--tc-composer-font) + 6px); color: var(--muted-foreground, #6b7280);
}
/* A Viewer's start screen (ADR 0028): the hint after "/help to ask Tracy · " (tracy-assistant's
   ::before) asks about the site instead of dsh's own words. dsh draws its text as the element's own
   node, so that node is sized to nothing (its line too, so the empty strut adds no height) and ::after carries ours (index.tsx sets --tc-viewer-hint);
   both pseudo-elements take back the size the rule above gives the placeholder. */
${VIEWER_HERO_CARD} [data-input-scroll] [data-composer-placeholder] { font-size: 0; line-height: 0; }
${VIEWER_HERO_CARD} [data-input-scroll] [data-composer-placeholder]::before,
${VIEWER_HERO_CARD} [data-input-scroll] [data-composer-placeholder]::after { font-size: var(--tc-hero-font); line-height: calc(var(--tc-composer-font) + 6px); }
${VIEWER_HERO_CARD} [data-input-scroll] [data-composer-placeholder]::after { content: var(--tc-viewer-hint, none); }
/* The same hint in the in-session chat box, through the whole session (after the first message dsh
   puts its generic words back). One ellipsized line at the card's own draft size: dsh's .card sets
   --dsh-content-font-size and a 24px line plus --dsh-content-font-delta, which the pseudo-elements
   take back here since the element itself is sized to nothing. */
${VIEWER_CARD} [data-input-scroll] [data-composer-placeholder] { font-size: 0; line-height: 0; }
${VIEWER_CARD} [data-input-scroll] [data-composer-placeholder]::before,
${VIEWER_CARD} [data-input-scroll] [data-composer-placeholder]::after {
  font-size: var(--tc-composer-font); line-height: calc(var(--tc-composer-font) + 6px);
}
${VIEWER_CARD} [data-input-scroll] [data-composer-placeholder]::after { content: var(--tc-viewer-hint, none); }
${HERO_CARD} > [class*="_row"] { flex-wrap: nowrap; gap: 6px; min-height: 28px; padding: 0; }
${HERO_CARD} > [class*="_row"] > [class*="_tools"] { gap: 6px; min-height: 28px; }
${HERO_CARD} > [class*="_row"] > [class*="_trailing"] { gap: 6px; margin-left: auto; }
${HERO_CARD} [class*="_add"] {
  box-sizing: border-box; width: 28px; height: 28px; border: 1px solid var(--border, #e5e7eb); border-radius: 6px;
  background: transparent; color: var(--muted-foreground, #6b7280);
}
${HERO_CARD} [class*="_add"]:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--foreground, #172026); }
${HERO_CARD} [class*="_add"] svg { width: 16px; height: 16px; }
${HERO_CARD} [class*="_trailing"] [class*="_primary"] {
  width: 30px; height: 30px; transform: none; color: var(--primary-foreground, #ffffff);
}
/* The model picker (dsh ui-model-selection), in both chat boxes and at every width (Akemi
   14/10/2026): dsh's compact glyph and a 12px chevron, never the name as text. The selected model
   stays discoverable: dsh keeps it in the button's title and accessible name. dsh's own switch to the
   glyph (a row too narrow for the name) sets the same two variables. */
[data-slot="conversation.composer.bar"] [data-composer-card] {
  --dsh-composer-model-text-display: none; --dsh-composer-model-icon-display: block;
}
[data-slot="conversation.composer.bar"] [data-slot="conversation.input.model"] button[class*="_trigger"] { gap: 2px; padding: 0 4px; }
[data-slot="conversation.composer.bar"] [data-slot="conversation.input.model"] [class*="_chevron"] { width: 12px; height: 12px; }
/* One line when there is nothing attached: [+] [draft] [send], the draft growing upward to dsh's
   height cap and scrolling inside past it. Card (Akemi 14/10/2026, the start screen's look): 12px
   corners, 10px above and 12px below 28px controls, 10px at the sides. _row is display: contents so its
   two groups become cells of the card's grid beside the draft. The accessory row (dsh's, rarely
   present) spans the top. --tc-composer-row-gap is the space between that row or the stacked chips
   and the input line. The chip measurement (composer-line.ts) reads the computed side padding, so
   it follows --tc-composer-pad-x without a second number. */
${CARD} {
  --tc-composer-draft-min: 160px;
  --tc-composer-control: 28px;
  --tc-composer-pad-y: 10px;
  --tc-composer-pad-x: 10px;
  --tc-composer-row-gap: 11px;
  --tc-composer-gap: 6px;
  --tc-composer-radius: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "acc acc acc" "tools draft trailing";
  align-items: end;
  column-gap: var(--tc-composer-gap);
  row-gap: 0;
  padding: var(--tc-composer-pad-y) var(--tc-composer-pad-x) 12px;
  border: 1px solid var(--input, #e3e7e9);
  border-radius: var(--tc-composer-radius);
  background: var(--card, #ffffff);
  box-shadow: none;
}
/* Focus: the shared stroke colour tracy-brand declares on the composer bar (the hero card uses the
   same one), falling back to the resting border if tracy-brand is absent. */
${CARD}:focus-within { border-color: var(--tc-composer-focus-border, var(--input, #e3e7e9)); }

/* Attachments, stacked: the chips wrap in their own row on top and the input line stays below.
   This is also the state before the first measurement. */
${CARD}:has(.tv-att) {
  grid-template-areas: "acc acc acc" "chips chips chips" "tools draft trailing";
}
${CARD}:has(.tv-att) .tv-att { margin-bottom: var(--tc-composer-row-gap); }
/* Attachments, inline: ComposerChips (composer-line.ts) measured that the plus, every chip, a draft
   of at least --tc-composer-draft-min and send fit one line, and that the draft is one line. */
${CARD}[data-tc-chips="inline"]:has(.tv-att) {
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  grid-template-areas: "acc acc acc acc" "tools chips draft trailing";
}
${CARD}[data-tc-chips="inline"] .tv-att { flex-wrap: nowrap; min-height: var(--tc-composer-control); margin-bottom: 0; }
${CARD}[data-tc-chips="inline"]:has(.tv-att) > [class*="_accessory"] { grid-column: 1 / -1; }

/* A column too narrow for the draft between the controls (composer-line.ts watchDraftLine, the
   rule is draftLayout): the draft takes a full-width row and the controls sit under it, so a
   sentence never wraps every two or three words in a sliver (J7.8, 04/10/2026). After the chip
   rules so it wins over both chip modes. */
${CARD}[data-tc-draft="own-row"] {
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "acc acc acc" "draft draft draft" "tools . trailing";
}
${CARD}[data-tc-draft="own-row"]:has(.tv-att) {
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "acc acc acc" "chips chips chips" "draft draft draft" "tools . trailing";
}
${CARD}[data-tc-draft="own-row"] > [data-input-scroll] { margin-bottom: var(--tc-composer-row-gap); }


${CARD} > [class*="_accessory"] { grid-area: acc; padding: 0 0 var(--tc-composer-row-gap); }
${CARD} .tv-att { grid-area: chips; }
${CARD} > [data-input-scroll] { grid-area: draft; min-width: 0; margin-right: 0; }
${CARD} > [class*="_row"] { display: contents; }
${CARD} > [class*="_row"] > [class*="_tools"] { grid-area: tools; min-height: var(--tc-composer-control); gap: 4px; }
${CARD} > [class*="_row"] > [class*="_trailing"] { grid-area: trailing; min-height: var(--tc-composer-control); gap: var(--tc-composer-gap); margin-left: 0; }
${CARD} > [class*="_row"] > [class*="_trailing"] > [class*="_standardControls"] { gap: var(--tc-composer-gap); }

/* The draft: one 20px line plus 4px above and below = the 28px of the controls beside it, and no
   taller while empty (no blank row under the hint). The placeholder stays on one line and ends in an
   ellipsis. */
${CARD} [data-input-scroll] [class*="_input"] { min-height: var(--tc-composer-control); padding: 4px; font-size: var(--tc-composer-font); line-height: calc(var(--tc-composer-font) + 6px); }
${CARD} [data-input-scroll] [data-composer-placeholder] {
  inset: 4px 4px auto 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: var(--tc-composer-font); line-height: calc(var(--tc-composer-font) + 6px);
}

/* + is a quiet 28px outlined square (it opens dsh's command menu), the start screen's. */
${CARD} [class*="_add"] {
  box-sizing: border-box; width: var(--tc-composer-control); height: var(--tc-composer-control);
  border: 1px solid var(--border, #e5e7eb); border-radius: 6px; background: transparent; color: var(--muted-foreground, #6b7280);
}
${CARD} [class*="_add"]:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--foreground, #172026); }
${CARD} [class*="_add"] svg { width: 16px; height: 16px; }

/* Send: a 30px terracotta circle (the colour rule is tracy-brand's), dimmed by dsh while disabled.
   While the agent runs dsh turns it into the stop square; a second stop that dsh draws before it
   (a continuable subagent) is a quiet outlined circle of the same size. */
${CARD} [class*="_trailing"] [class*="_primary"] {
  width: 30px; height: 30px;
  transform: none; color: var(--primary-foreground, #ffffff);
}
${CARD} [class*="_trailing"] [class*="_primary"]:not(:last-of-type) {
  background: transparent; color: var(--foreground, #172026);
  box-shadow: inset 0 0 0 1px var(--input, #e3e7e9);
}

/* The running conversation's chat box is the start screen's, pixel for pixel (Akemi 14/10/2026): the
   draft always has its own row with the controls under it, whatever the width or the chips, the same
   10px 12px 12px 8px padding, and an empty draft as tall as its hint (the hint in flow, wrapping and
   clamped at three lines, the editable surface over it), so there is no empty row. These rules come
   after the card's other rules (the measured layouts of composer-line.ts included) and win over them. */
${CARD}, ${CARD}[data-tc-draft], ${CARD}[data-tc-chips="inline"]:has(.tv-att) {
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "acc acc acc" "draft draft draft" "tools . trailing";
  padding: 10px 12px 12px 8px;
}
${CARD}:has(.tv-att), ${CARD}[data-tc-draft]:has(.tv-att), ${CARD}[data-tc-chips="inline"]:has(.tv-att) {
  grid-template-areas: "acc acc acc" "chips chips chips" "draft draft draft" "tools . trailing";
}
${CARD}[data-tc-chips="inline"] .tv-att { flex-wrap: wrap; margin-bottom: var(--tc-composer-row-gap); }
${CARD} > [data-input-scroll], ${CARD}[data-tc-draft] > [data-input-scroll] { margin-bottom: var(--tc-composer-row-gap); }
${CARD} [data-input-scroll] [class*="_input"] { min-height: calc(var(--tc-composer-font) + 6px); padding: 0 4px; }
${CARD} > [class*="_row"] > [class*="_tools"], ${CARD} > [class*="_row"] > [class*="_trailing"] { align-self: center; }
${CARD} [data-input-scroll] [data-composer-placeholder] {
  inset: 0 4px auto 4px; display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: 3; line-clamp: 3; white-space: normal; overflow: hidden;
}
${CARD} [data-input-scroll] [class*="_grow"]:has(> [data-composer-placeholder]) > [class*="_input"] { position: absolute; inset: 0; }
${CARD} [data-input-scroll] [class*="_grow"]:has(> [data-composer-placeholder]) > [data-composer-placeholder] { position: relative; inset: auto; margin: 0 4px; }

/* The turn statistics under the card (tokens per second, cache hit, context ring), quiet and on one
   line in a 300px conversation (Akemi 14/10/2026): 11px muted text with tabular figures so numbers
   do not jitter, 12px icons, 12px between items, starting at the card's inner left edge (its 10px
   padding plus the draft's 4px). The row's height is RESERVED before the first turn too (Akemi
   01/10/2026): an empty dock is as tall as one with pills (--tc-composer-foot), so the card does not
   move when the pills arrive. */
[data-composer-seat] { --tc-composer-foot: 28px; }
${ROOT} > [class*="_dock"] {
  justify-content: flex-start; gap: 12px; width: 100%; max-width: var(--dsh-composer-card-max-width);
  box-sizing: border-box; min-height: var(--tc-composer-foot, 28px); padding: 6px 4px 4px 15px;
  white-space: nowrap; overflow: hidden;
}
${ROOT} > [class*="_dock"] [data-slot="conversation.composer.dock"] > [class*="_root"] { gap: 12px; flex-wrap: nowrap; }
${ROOT} > [class*="_dock"] button, ${ROOT} > [class*="_dock"] [class*="_pill"] {
  gap: 4px; height: 18px; padding: 0; font-size: 11px; line-height: 18px; font-variant-numeric: tabular-nums;
  color: var(--muted-foreground, #6b7280); background: transparent;
}
${ROOT} > [class*="_dock"] svg { width: 12px; height: 12px; flex: none; }

/* The chips (ComposerChips.tsx): 30px tall, 8px corners, one wrapping row; an image shows a 22px
   thumbnail and its name, a file a type badge, its name and its size. Name ellipsis at 200px. */
.tv-att { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.tv-chip {
  position: relative; display: inline-flex; align-items: center; gap: 2px; flex: none;
  box-sizing: border-box; height: 30px; max-width: 200px; padding: 0 3px 0 3px; overflow: hidden;
  border: 1px solid var(--input, #e3e7e9); border-radius: 8px;
  background: var(--background, #ffffff); color: var(--foreground, #172026);
  font-size: 12px; line-height: 16px;
}
.tv-chip-body {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0; flex: 0 1 auto; height: 100%;
  margin: 0; padding: 0 2px 0 0; border: 0; background: none; color: inherit; font: inherit; text-align: left;
}
button.tv-chip-body { cursor: pointer; }
button.tv-chip-body:has(.tv-chip-thumb) { cursor: zoom-in; }
.tv-chip-thumb { display: block; width: 22px; height: 22px; flex: none; border-radius: 5px; object-fit: cover; background: var(--muted, #f3f4f6); }
.tv-chip-badge {
  display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 5px;
  background: color-mix(in oklab, var(--foreground, #172026) 10%, var(--background, #ffffff));
  font-size: 8px; font-weight: 700; letter-spacing: 0.02em;
}
.tv-chip-name { min-width: 24px; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-chip-meta { flex: none; white-space: nowrap; color: var(--muted-foreground, #6b7280); }
.tv-chip[data-state="error"] { border-color: var(--destructive, #ef4444); }
.tv-chip[data-state="error"] .tv-chip-meta { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--destructive, #ef4444); }
.tv-chip-x {
  display: grid; place-items: center; flex: none; width: 20px; height: 20px; margin: 0; padding: 0;
  border: 0; border-radius: 5px; background: none; color: var(--muted-foreground, #6b7280); cursor: pointer;
}
.tv-chip-x:hover { background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); color: var(--foreground, #172026); }
.tv-chip-x svg { width: 14px; height: 14px; }
.tv-chip-body:focus-visible, .tv-chip-x:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
.tv-chip-spinner {
  width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%;
  border: 2px solid color-mix(in oklab, var(--foreground, #172026) 20%, transparent);
  border-top-color: var(--foreground, #172026); animation: tv-chip-spin 0.8s linear infinite;
}
@keyframes tv-chip-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tv-chip-spinner { animation: none; } }
.tv-chip-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; }
.tv-chip-progress > span { display: block; width: 30%; height: 100%; background: var(--dsw-alias-brand-primary, #bf5b3d); transition: width 0.2s; }

/* The drop invitation over the whole page while files are dragged in. pointer-events: none keeps
   the drag events on the page under it, where the enter/leave count lives (composer-drop.ts). */
.tv-drop {
  position: fixed; inset: 12px; z-index: 2147483000; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; pointer-events: none;
  border: 1.5px dashed var(--dsw-alias-brand-primary, #bf5b3d); border-radius: 16px;
  background: color-mix(in oklab, var(--background, #ffffff) 88%, transparent);
}
.tv-drop[data-blocked] { border-color: var(--muted-foreground, #6b7280); }
.tv-drop-title { font-size: 15px; font-weight: 600; color: var(--foreground, #172026); }
.tv-drop-desc { font-size: 13px; color: var(--muted-foreground, #6b7280); }

/* The original image of a chip, over the page. */
.tv-lightbox {
  position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center;
  padding: 32px; box-sizing: border-box; cursor: zoom-out;
  background: var(--dsw-alias-bg-mask-photo, rgba(0, 0, 0, 0.72));
}
.tv-lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
.tv-lightbox-close {
  position: absolute; top: 16px; right: 16px; display: grid; place-items: center; width: 32px; height: 32px;
  padding: 0; border: 0; border-radius: 50%; cursor: pointer;
  background: var(--card, #ffffff); color: var(--foreground, #172026);
}
.tv-lightbox-close svg { width: 16px; height: 16px; }
`
