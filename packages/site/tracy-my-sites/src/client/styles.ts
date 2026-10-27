/**
 * The stylesheet of the My Sites tab and its two Settings entries, injected once into the dsh page.
 *
 * Since 03/09 this tab is built with `@tracy/ui` + Tailwind utilities, no longer hand-written CSS
 * prefixed `tracy-mysites-*`. Same recipe as `@tracy/dsh-settings` and `@tracy/dsh-sidebar`: Tailwind
 * runs at build time on `src/client/my-sites.css` (theme + utilities, **no preflight** — this bundle
 * lives INSIDE dsh's page, so a second reset would break the host's UI, RULE #4 of
 * `CLAUDE.md`), then esbuild's `define` puts the result here as a string constant.
 *
 * Colours go only through tokens: `@tracy/ui`'s `tokens.css` maps each shadcn variable to
 * `--dsw-alias-*` with a fallback, so `bg-card`, `text-muted-foreground`, `border-border`… follow
 * dsh's light/dark switch without the component knowing about it. No `#hex`, no `oklch()`
 * in components.
 *
 * No preflight means the UA stylesheet remains: `ul`, `p`, `h3` keep default margins, `a` is blue and
 * underlined. Components set `m-0`, `list-none`, `no-underline` where needed — that is the price of
 * not bringing a reset into someone else's page, and it is cheap.
 */

/**
 * The CSS Tailwind generates at build time, substituted here by esbuild's `define`.
 *
 * Not an import: dsh serves exactly one `lib/client.js` per plugin, so there is no room for a
 * second CSS file. See `scripts/build-client.mjs` §buildStyles.
 */
declare const __TAILWIND_CSS__: string

/** Tailwind classes of the `@tracy/ui` components and of this package, pre-generated. */
export const TAILWIND = __TAILWIND_CSS__

/**
 * The part utilities CANNOT express: the dots running after "Now chatting".
 *
 * It is a `@keyframes` that steps `content` — Tailwind has no utility for dynamic `content`,
 * and `animate-pulse` fades rather than jumps. Keep exactly this block, scoped under `.tracy-mysites`.
 *
 * 🔒 COMMENTS INSIDE THE TEMPLATE BELOW MUST BE ENGLISH: they sit in a template literal, so they are
 * **strings**; esbuild bundles them verbatim into `lib/client.js` and the customer's browser downloads them.
 * `check-language` does not tell a "CSS comment" from a "string", and it should not.
 *
 * 🔒 And no backtick inside the template: a stray backtick closes the string, and esbuild goes red
 * on an unrelated line.
 */
export const CSS = `
/*
 * Settings > Account, layout A (Akemi 04/10/2026, review/settings-account-options.html): the sizes of
 * the mock, as plugin-scoped rules (DESIGN.md 3.1). Other bundles' utility tables override text-xs and
 * text-sm on this page, so the row's type is set here, not by utilities: label 12/16 muted, address
 * 13/18 medium in the text colour, help 12/17 muted.
 */
.tracy-mysites .tracy-mysites-account-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: 16px;
  row-gap: 8px;
  padding: 12px 0;
}
/* Too narrow for the words and the button side by side (a phone): the button goes under the words
   instead of over them (measured on dev 09/10/2026 at 360px: Sign out covered its own help line). */
.tracy-mysites .tracy-mysites-account-text { flex: 1 1 180px; min-width: 0; }
.tracy-mysites .tracy-mysites-account-label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: var(--muted-foreground);
}
.tracy-mysites .tracy-mysites-account-value {
  margin-top: 2px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--foreground);
  overflow-wrap: anywhere;
}
.tracy-mysites p.tracy-mysites-account-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 17px;
  color: var(--muted-foreground);
}
.tracy-mysites .tracy-mysites-account-label + p.tracy-mysites-account-hint { margin-top: 2px; }
.tracy-mysites .tracy-mysites-account-action { flex: none; }

/*
 * The moving dots after "Now chatting".
 *
 * CSS, not a timer in React: this blinks for as long as the tab is open, and a JavaScript counter
 * for it is a re-render every half second inside a panel people leave open all day.
 *
 * steps(1) rather than a smooth ease -- the dots must STEP like someone typing, not glide like a
 * progress bar. The width changes with each frame, so min-width holds the space and the words
 * beside it stay still.
 */
.tracy-mysites .tracy-mysites-live::after {
  content: '';
  display: inline-block;
  min-width: 1.2em;
  text-align: left;
  animation: tracy-mysites-dots 1.2s steps(1, end) infinite;
}

@keyframes tracy-mysites-dots {
  0% { content: '.'; }
  33% { content: '..'; }
  66% { content: '...'; }
}

@media (prefers-reduced-motion: reduce) {
  /* An endless loop is the first thing to stop once someone has said they do not want motion. */
  .tracy-mysites .tracy-mysites-live::after {
    content: '...';
    animation: none;
  }
}

/*
 * A row that opens its site: the whole table row is the target.
 *
 * The fill mixes the pane's own text colour into transparent, so it is a touch of black on the
 * light theme and a touch of white on the dark one from one rule, instead of a light/dark pair.
 */
.tracy-mysites .tracy-mysites-row.is-openable {
  cursor: pointer;
  transition: background-color 120ms ease;
}

.tracy-mysites .tracy-mysites-row.is-openable:hover {
  background-color: color-mix(in oklab, var(--foreground) 6%, transparent);
}

.tracy-mysites .tracy-mysites-row.is-openable:focus-visible {
  outline: 1px solid var(--ring);
  outline-offset: -1px;
}

/*
 * "Open Chat" plus the new-window arrow, after the address, shown when the row is pointed at or
 * focused: a resting list of eight identical buttons made every row shout, while a row that answers
 * the pointer says the same thing only where the reader is looking.
 *
 * Out of the layout at rest (display none, not opacity 0): it sits on the address's line, and a hint
 * that kept its room there would take about 80px of the address on every openable row. When it
 * appears, the address gives way by truncating, never the hint.
 */
.tracy-mysites .tracy-mysites-open-hint {
  display: none;
  align-items: center;
  gap: 0.25rem;
  flex: none;
  font-size: 0.75rem;
  color: var(--foreground);
  white-space: nowrap;
}

.tracy-mysites .tracy-mysites-row.is-openable:hover .tracy-mysites-open-hint,
.tracy-mysites .tracy-mysites-row.is-openable:focus-visible .tracy-mysites-open-hint {
  display: inline-flex;
}

/* A screen without hover (touch) never reveals the hint, so it stays shown there. */
@media (hover: none) {
  .tracy-mysites .tracy-mysites-open-hint {
    display: inline-flex;
    color: var(--muted-foreground);
  }
}

/*
 * The table fits the panel instead of scrolling sideways (Akemi, 30/09: at the panel's default
 * width the Created column and the menu sat behind a horizontal scrollbar on every screen).
 *
 * Six columns since 01/10: Site, CMS, Role, Team, Created and the menu. The row's state (Managing,
 * Start the agent, an invitation, Open Chat...) is no longer a column; it sits on the Site cell's
 * line right after the address (site-cell.tsx).
 *
 * The site column takes every pixel the other columns leave: width 100% with max-width 0 is what
 * lets an auto-layout table cell shrink under its text, so the five other columns stay at the width
 * of their content. On the site's line the address truncates first, never below its floor (4rem);
 * the state keeps its whole width and never wraps under the address. When even that does not fit,
 * the least needed columns give way, in this order: Created, the CMS logo, Role, then Team (the pane
 * under the chat). The site, its state and the menu stay, because they are what a row is pressed
 * for. The box is the container, not the tab root: the root class also sits on the site picker, a
 * fixed popup that a container would trap.
 *
 * Thresholds are box widths measured on the real table (01/10, Chrome, the e2e fixture): CMS 51px,
 * Role 101 (the Developer badge), Team 109, Created 104, menu 52; the site column is its padding,
 * the address at its 4rem floor, the gap and the widest state that keeps its width, "Accept
 * invitation" at 115 (the asked badge truncates instead, below): 211. Every column then needs
 * 628px, without Created 524, without the CMS 473, without Role 372. Each threshold sits above its
 * sum, the first one 20px for a longer "Created" text; they are the steps the table had with its
 * Status column, so no column hides at a width where it used to show. The panel opens at 720px
 * (LIST_PANEL_WIDTH, a 694px box), so every column shows there and the site column has 277px.
 */
.tracy-mysites .tracy-mysites-table {
  container-type: inline-size;
}

/*
 * The table box is also the vertical scroller (09/10: with many sites the rows below the tab's
 * bottom edge were clipped by the tab body and never reachable). The column headers stay at its
 * top. A sticky cell needs an opaque fill or the rows show through it, so the old translucent
 * muted wash (bg-muted at 40%) is mixed into the pane's background instead: the same colour on
 * both themes, from tokens only.
 */
.tracy-mysites .tracy-mysites-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: color-mix(in oklab, var(--muted) 40%, var(--background));
}

.tracy-mysites .tracy-mysites-table .tracy-mysites-site {
  width: 100%;
  max-width: 0;
}

.tracy-mysites .tracy-mysites-site-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

/* A large shrink factor: flex-shrink is weighted by size, so the address gives way first. */
.tracy-mysites .tracy-mysites-table .tracy-mysites-site-name {
  flex: 0 1000 auto;
  min-width: 4rem;
}

/*
 * Accept and Decline side by side (U10 A): one unit that keeps its width, like a single button.
 * Short labels on purpose, so the pair is about as wide as the one "Accept invitation" button it
 * replaced (the thresholds below were measured with that one; the pair is not measured yet).
 */
.tracy-mysites .tracy-mysites-answer {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.25rem;
}

/*
 * A state label keeps its width while the address can still give way; once the address is at its
 * floor, the label truncates too (its full text is the tooltip), rather than push the table into a
 * sideways scroll. "Waiting for approval" (Akemi, 01/10) replaced a 220px label so it fits whole.
 */
.tracy-mysites .tracy-mysites-table .tracy-mysites-state-text {
  flex-shrink: 1;
  min-width: 4rem;
}
.tracy-mysites .tracy-mysites-table .tracy-mysites-state-text > .truncate {
  min-width: 0;
}

@container (width < 40.5rem) {
  .tracy-mysites .tracy-mysites-table .tracy-mysites-created {
    display: none;
  }
}

@container (width < 34rem) {
  .tracy-mysites .tracy-mysites-table .tracy-mysites-cms-col {
    display: none;
  }
}

@container (width < 30.5rem) {
  .tracy-mysites .tracy-mysites-table .tracy-mysites-role {
    display: none;
  }
}

/*
 * The pane under the chat (~300px, Akemi 30/09, option b): below 25.5rem Team goes too; the address
 * ellipsises, and its full name is the cell's tooltip (title).
 */
@container (width < 25.5rem) {
  .tracy-mysites .tracy-mysites-table .tracy-mysites-team {
    display: none;
  }
}

/*
 * Narrower than the right panel's own floor (300px), only while a divider is dragged past it: the
 * address keeps 2.5rem so "Accept invitation" (115px) still fits beside it in a 244px box.
 */
@container (width < 17rem) {
  .tracy-mysites .tracy-mysites-table .tracy-mysites-site-name {
    min-width: 2.5rem;
  }
}

/* Draft / Live after the site's name: dot and word. The word carries the state, the colour repeats
   it. The same rules as the Settings tab's chip (site-tabs-rules.css, .tv-status-chip). */
.tracy-mysites .tv-status-chip {
  flex-shrink: 0;
  gap: 0.375rem;
}
.tracy-mysites .tv-status-chip[data-status='live'] {
  border-color: color-mix(in oklab, var(--success) 50%, transparent);
  background-color: color-mix(in oklab, var(--success) 10%, transparent);
}
.tracy-mysites .tv-status-chip[data-status='publishing'] {
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
  background-color: color-mix(in oklab, var(--primary) 10%, transparent);
}
.tracy-mysites .tv-status-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background-color: var(--muted-foreground);
}
.tracy-mysites .tv-status-chip[data-status='live'] .tv-status-dot {
  background-color: var(--success);
}
.tracy-mysites .tv-status-chip[data-status='publishing'] .tv-status-dot {
  background-color: var(--primary);
}

/* The dot of the "Managing" badge: the same brand mark as the dot of the open session in the left column. */
.tracy-mysites .tracy-mysites-dot {
  flex-shrink: 0;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background-color: var(--primary);
}

/*
 * The page shell of Add site and Publish, without the stepper (24/10/2026; it replaced the centred
 * raised card of 14/10). Same geometry as WIZARD_ROOT_LAYOUT_CSS and the wizard title in
 * @tracy/core/wizard-shell: change them together. The root fills the tab on the card surface; the
 * title, the table and the action stand in one column that spans the full panel width, with gutters
 * of 16px, 24px from 600px and 32px from 900px. The root stays a flex column that never scrolls: the
 * table box shrinks and scrolls under its sticky column headers, so the title and the action stay
 * in view with many sites. Dialogs are children too and are not blocks, so they are left alone.
 */
.tracy-mysites.tracy-mysites-page {
  container-type: inline-size;
  padding: 24px 0;
  background-color: var(--card);
}
.tracy-mysites.tracy-mysites-page > .tracy-mysites-block {
  flex: none;
  width: calc(100% - 32px);
  margin-inline: 16px;
}
.tracy-mysites.tracy-mysites-page > .tracy-mysites-table { flex: 0 1 auto; }
@container (min-width: 600px) {
  .tracy-mysites.tracy-mysites-page > .tracy-mysites-block { width: calc(100% - 48px); margin-inline: 24px; }
}
@container (min-width: 900px) {
  .tracy-mysites.tracy-mysites-page > .tracy-mysites-block { width: calc(100% - 64px); margin-inline: 32px; }
}
.tracy-mysites .tracy-mysites-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; margin-bottom: 20px; }
.tracy-mysites .tracy-mysites-head-text { flex: 1 1 260px; min-width: 0; }
.tracy-mysites .tracy-mysites-lead { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted-foreground); }
.tracy-mysites .tracy-mysites-add { flex: none; }
.tracy-mysites .tracy-mysites-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--foreground);
}
/* The sign-in note keeps its own gutters elsewhere (Settings); in the page the column has them. */
.tracy-mysites.tracy-mysites-page > .tracy-mysites-block > .tracy-mysites { padding: 0; }
`
