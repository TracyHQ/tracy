/**
 * The Inbox's stylesheet, injected once into dsh's page.
 *
 * Tailwind (theme + utilities, no preflight) runs at build time on `inbox.css` and arrives here as a
 * string through esbuild's `define` (`scripts/build-client.mjs`). The rules below are the few that
 * utilities cannot say, scoped under the plugin's two roots so no other plugin's sheet overrides them
 * (DESIGN.md §3.1: nine Tailwind sheets share one page and the one injected last wins).
 *
 * Colours only through Tracy tokens (`--foreground`, `--primary`, `--sidebar-foreground`…), never a
 * `--dsw-alias-*` directly. The one exception is the category palette, declared once per theme as
 * variables on the plugin root; rules read the variables, never a literal.
 *
 * No backtick may appear inside the template below: it would close the string.
 */

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

export const CSS = `
/*
 * Layout "option I" (Akemi 03/10): three sections by what the reader has to do. Category colours
 * live as variables on the plugin root, one set per theme: the solid fills carry a white icon and
 * are the same in both themes (white on them is at least 4.5:1), except the request tile, which is
 * mixed from the brand colour per theme; the text tones are tuned per theme for contrast on the card. Components only ever read these variables, never a literal.
 */
.tracy-inbox {
  --tracy-inbox-solid-comment: #c2532f;
  /* Request (option B, Akemi 03/10): a pale terracotta tile with a terracotta icon, mixed from the
     brand colour, so the answer cards sit in the same family as their buttons. */
  --tracy-inbox-solid-request: color-mix(in oklab, var(--primary) 18%, var(--card));
  --tracy-inbox-icon-request: color-mix(in oklab, var(--primary) 82%, var(--foreground));
  --tracy-inbox-solid-in: #18804a;
  --tracy-inbox-solid-out: #cc2f4b;
  --tracy-inbox-solid-role: #a35f00;
  --tracy-inbox-tone-comment: #b4532f;
  --tracy-inbox-tone-request: var(--tracy-inbox-icon-request);
  --tracy-inbox-tone-in: #1d7f4f;
  --tracy-inbox-tone-out: #c03250;
  --tracy-inbox-tone-role: #96600a;
  --tracy-inbox-card-shadow: 0 2px 8px rgba(20, 30, 60, 0.08);
  --tracy-inbox-quote-bg: color-mix(in oklab, var(--foreground) 3%, var(--card));
}
[data-ds-dark-theme] .tracy-inbox,
.tracy-inbox[data-ds-dark-theme] {
  --tracy-inbox-tone-comment: #e88a6a;
  --tracy-inbox-solid-request: color-mix(in oklab, var(--primary) 30%, var(--card));
  --tracy-inbox-icon-request: color-mix(in oklab, var(--primary) 50%, var(--foreground));
  --tracy-inbox-tone-in: #5cc48f;
  --tracy-inbox-tone-out: #ef8090;
  --tracy-inbox-tone-role: #e3b65a;
  --tracy-inbox-card-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  --tracy-inbox-quote-bg: color-mix(in oklab, var(--foreground) 4%, var(--card));
}
.tracy-inbox .is-comment { --tracy-inbox-solid: var(--tracy-inbox-solid-comment); --tracy-inbox-tone: var(--tracy-inbox-tone-comment); }
.tracy-inbox .is-request { --tracy-inbox-solid: var(--tracy-inbox-solid-request); --tracy-inbox-icon: var(--tracy-inbox-icon-request); --tracy-inbox-tone: var(--tracy-inbox-tone-request); }
.tracy-inbox .is-in { --tracy-inbox-solid: var(--tracy-inbox-solid-in); --tracy-inbox-tone: var(--tracy-inbox-tone-in); }
.tracy-inbox .is-out { --tracy-inbox-solid: var(--tracy-inbox-solid-out); --tracy-inbox-tone: var(--tracy-inbox-tone-out); }
.tracy-inbox .is-role { --tracy-inbox-solid: var(--tracy-inbox-solid-role); --tracy-inbox-tone: var(--tracy-inbox-tone-role); }

/* Paragraph spacing as plugin-scoped rules, not "m-0 mt-N" utilities: every Tailwind plugin on
   the dsh page injects its own utility table, and a later "m-0" wins over this plugin's "mt-N"
   (DESIGN.md 3.1). Measured: the retention line sat at margin-top 0. */
.tracy-inbox p { margin: 0; }
.tracy-inbox p.tracy-inbox-gap-4 { margin: 16px 0 0; padding: 0 2px 4px; font-size: 12px; }
.tracy-inbox .tracy-inbox-more { margin-top: 12px; }

/* Section header: bold title, a count chip, an optional hint at the right. */
.tracy-inbox .tracy-inbox-section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 18px 2px 8px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 700;
  color: var(--foreground);
}
.tracy-inbox .tracy-inbox-section:first-child .tracy-inbox-section-head { padding-top: 2px; }
.tracy-inbox .tracy-inbox-count {
  padding: 1px 7px;
  border-radius: 999px;
  /* Not var(--muted): dsh's light layer-2 is white, so the chip vanished on the light card. */
  background: color-mix(in oklab, var(--foreground) 7%, var(--card));
  color: var(--muted-foreground);
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}
.tracy-inbox .tracy-inbox-hint {
  margin-left: auto;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 500;
}

/* The bordered list of Comments and Team updates, and the stack of raised cards above them. */
.tracy-inbox .tracy-inbox-list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
}
.tracy-inbox .tracy-inbox-list > li { margin: 0; border-top: 1px solid var(--border); }
.tracy-inbox .tracy-inbox-list > li:first-child { border-top: 0; }
.tracy-inbox .tracy-inbox-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tracy-inbox .tracy-inbox-cards > li { margin: 0; }
/* "Show all (N)" / "Show fewer" under the capped cards: a small muted text button. */
.tracy-inbox .tracy-inbox-toggle {
  margin-top: 6px;
  padding: 0 6px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 500;
}
.tracy-inbox .tracy-inbox-toggle:hover { color: var(--foreground); }

/* A row that opens something: the whole row is the target. The hover fill mixes the pane's own
   text colour into transparent: a touch of black on light, a touch of white on dark. */
.tracy-inbox .tracy-inbox-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.tracy-inbox .tracy-inbox-row:hover {
  background-color: color-mix(in oklab, var(--foreground) 7%, transparent);
}
.tracy-inbox .tracy-inbox-row:focus-visible {
  outline: 1px solid var(--ring);
  outline-offset: -1px;
}

/* Needs your answer: a raised card tinted with the request terracotta. */
.tracy-inbox .tracy-inbox-row.is-card {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--tracy-inbox-tone-request) 40%, var(--border));
  background: color-mix(in oklab, var(--tracy-inbox-tone-request) 9%, var(--card));
  box-shadow: var(--tracy-inbox-card-shadow);
}

.tracy-inbox .tracy-inbox-row.is-card:hover {
  background: color-mix(in oklab, var(--tracy-inbox-tone-request) 14%, var(--card));
}
/* An open invitation answers only through its buttons: no pointer, no hover fill on the body. */
.tracy-inbox .tracy-inbox-row.is-inert { cursor: default; }
.tracy-inbox .tracy-inbox-row.is-card.is-inert:hover {
  background: color-mix(in oklab, var(--tracy-inbox-tone-request) 9%, var(--card));
}

/* Solid circle in the category colour with a white icon (the request tile is pale terracotta with
   a terracotta icon): 40px on cards and comments, exactly the height of the two lines beside it
   (20 + 3 + 17, Akemi 04/10), 22px on a compact team row. A read row fades it. */
.tracy-inbox .tracy-inbox-solid {
  display: flex;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--tracy-inbox-solid);
  color: var(--tracy-inbox-icon, #fff);
}
.tracy-inbox .tracy-inbox-solid svg { width: 20px; height: 20px; }
.tracy-inbox .tracy-inbox-solid.is-small { width: 22px; height: 22px; }
.tracy-inbox .tracy-inbox-solid.is-small svg { width: 12px; height: 12px; }
.tracy-inbox .is-read .tracy-inbox-solid { opacity: 0.6; }

/* Line 1: name, age, unread dot. Line 2: bold action phrase naming the site. */
.tracy-inbox .tracy-inbox-l1 { display: flex; align-items: center; gap: 8px; height: 20px; }
.tracy-inbox .tracy-inbox-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--muted-foreground);
}
.tracy-inbox .is-unread .tracy-inbox-name { font-weight: 700; color: var(--foreground); }
.tracy-inbox .tracy-inbox-age {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted-foreground);
}
.tracy-inbox .tracy-inbox-dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}
.tracy-inbox .is-unread .tracy-inbox-dot { background-color: var(--primary); }
.tracy-inbox p.tracy-inbox-l2 {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 17px;
  color: var(--muted-foreground);
}
.tracy-inbox .is-unread .tracy-inbox-l2 { color: var(--foreground); }
/* Like Team updates (Akemi 04/10): only the verb is weighted and coloured; the rest of the phrase
   keeps the normal weight. */
.tracy-inbox .tracy-inbox-act { font-weight: 400; }
/* The site inside the phrase (layout option F, Akemi 04/10): it reads as part of the sentence,
   and a site with a live address shows it is a link on hover, with the same focus ring as the rows. */
.tracy-inbox .tracy-inbox-site { color: inherit; font-weight: inherit; white-space: nowrap; }
.tracy-inbox a.tracy-inbox-site { text-decoration: none; cursor: pointer; }
.tracy-inbox a.tracy-inbox-site:hover {
  color: var(--foreground);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.tracy-inbox a.tracy-inbox-site:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
  border-radius: 3px;
}

/* The quoted comment: a tinted block with a bar in the comment colour, @mentions in primary. */
.tracy-inbox p.tracy-inbox-quote {
  margin: 6px 0 0;
  padding: 5px 9px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-left: 2px solid var(--tracy-inbox-tone);
  border-radius: 0 6px 6px 0;
  background: var(--tracy-inbox-quote-bg);
  font-size: 12px;
  line-height: 17px;
  color: var(--muted-foreground);
}
.tracy-inbox .is-unread .tracy-inbox-quote { color: color-mix(in oklab, var(--foreground) 78%, var(--card)); }
.tracy-inbox .tracy-inbox-quote.is-deleted { font-style: italic; }
.tracy-inbox .tracy-inbox-mention { color: var(--primary); font-weight: 600; }
.tracy-inbox .tracy-inbox-actions { display: flex; gap: 6px; margin-top: 8px; }
.tracy-inbox p.tracy-inbox-failed { margin: 4px 0 0; font-size: 12px; }

/* Team updates: one line per row. */
.tracy-inbox .tracy-inbox-row.is-compact { align-items: center; gap: 8px; padding: 8px 12px; }
.tracy-inbox .tracy-inbox-one {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: pre;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--muted-foreground);
}
/* One line that keeps the site whole: the text before it gives way with an ellipsis first. */
.tracy-inbox .tracy-inbox-one-head { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tracy-inbox .tracy-inbox-one .tracy-inbox-site,
.tracy-inbox .tracy-inbox-one-tail { flex: 0 0 auto; }
.tracy-inbox .is-unread .tracy-inbox-one { color: var(--foreground); }
.tracy-inbox .tracy-inbox-one b { font-weight: 600; }
.tracy-inbox .tracy-inbox-verb { color: var(--tracy-inbox-tone); font-weight: 600; }
.tracy-inbox .is-read .tracy-inbox-verb {
  color: color-mix(in oklab, var(--tracy-inbox-tone) 70%, var(--muted-foreground));
}

/* A filter that is on: a soft chip, filled with a tint of the text colour, in both themes. */
.tracy-inbox .tracy-inbox-filter[aria-pressed="true"] {
  background-color: color-mix(in oklab, var(--foreground) 9%, transparent);
  color: var(--foreground);
}

/*
 * The page shell of My Sites, Team and Site changes (24/10/2026; it replaced the centred raised card
 * of 14/10). Same geometry as tracy-my-sites (styles.ts, tracy-mysites-page) and the wizard title in
 * @tracy/core/wizard-shell: change them together. The root fills the tab on the card surface; the
 * title row, the filter and the list stand in one column that spans the full panel width, with
 * gutters of 16px, 24px from 600px and 32px from 900px. The root never scrolls: the list below the
 * filter is the scroller, so the title, Mark all as read and the filter stay in view. The list's
 * gutters are its own padding, so its scrollbar sits at the panel's edge.
 */
.tracy-inbox.tracy-inbox-page {
  container-type: inline-size;
  padding-top: 24px;
  background-color: var(--card);
}
.tracy-inbox.tracy-inbox-page > .tracy-inbox-block {
  flex: none;
  width: calc(100% - 32px);
  margin-inline: 16px;
}
.tracy-inbox.tracy-inbox-page > .tracy-inbox-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 24px;
}
@container (min-width: 600px) {
  .tracy-inbox.tracy-inbox-page > .tracy-inbox-block { width: calc(100% - 48px); margin-inline: 24px; }
  .tracy-inbox.tracy-inbox-page > .tracy-inbox-body { padding-inline: 24px; }
}
@container (min-width: 900px) {
  .tracy-inbox.tracy-inbox-page > .tracy-inbox-block { width: calc(100% - 64px); margin-inline: 32px; }
  .tracy-inbox.tracy-inbox-page > .tracy-inbox-body { padding-inline: 32px; }
}
.tracy-inbox .tracy-inbox-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; margin-bottom: 16px; }
.tracy-inbox .tracy-inbox-head-text { flex: 1 1 260px; min-width: 0; }
.tracy-inbox .tracy-inbox-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--foreground);
}
.tracy-inbox p.tracy-inbox-lead { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted-foreground); }
.tracy-inbox .tracy-inbox-markall { flex: none; }
/* The Unread / All filter under the lead, aligned left, one step above the first section. */
.tracy-inbox .tracy-inbox-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 16px; }

/*
 * The row in the left column, right below New session. It takes the column's own colours
 * (--tsb-row-fg and --tsb-hover are declared on the column's root by @tracy/dsh-sidebar), with a
 * Tracy token as the fallback when it is drawn anywhere else.
 */
.tracy-inbox-nav .tracy-inbox-nav-button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 8px;
  color: var(--tsb-row-fg, var(--muted-foreground));
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.tracy-inbox-nav .tracy-inbox-nav-button:hover {
  color: var(--sidebar-foreground);
  background: var(--tsb-hover, color-mix(in oklab, var(--sidebar-foreground) 8%, transparent));
}

.tracy-inbox-nav .tracy-inbox-nav-button:focus-visible {
  outline: 1px solid var(--ring);
  outline-offset: -1px;
}

/* The unread count: terracotta primary, white text, a pill that grows with "9+". */
.tracy-inbox-nav .tracy-inbox-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: 9999px;
  background-color: var(--primary);
  color: var(--primary-foreground);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
}

/* Collapsed rail: the count sits on the icon's top right corner. */
.tracy-inbox-nav .tracy-inbox-badge.is-corner {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  font-size: 0.625rem;
}
`
