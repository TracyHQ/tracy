/**
 * Plain CSS for the settings rows (mode B: inside dsh's page, no reset, tb- prefix).
 * Rows follow Tracy's settings scale (Akemi, 02/10/2026): 13px title, 12px description in the muted
 * colour, label left and control right; the hairline between rows belongs to the settings chrome
 * (tracy-settings), not to each row. Colours are Tracy tokens (tokens.css, present on the page
 * whenever the settings dialog is) with neutral fallbacks; the thumbnails alone use literal
 * colours, because each one depicts a theme rather than following it.
 */
export const CSS = `
/* dsh's own focus rings (links in answers, tables, its buttons and menus) take their width from one
   token, 2px in ui-theme focus.css, and already their colour from the brand primary. Tracy draws
   every focus as a single 1px stroke (Akemi, 29/09), so the token follows. Doubled root selector:
   dsh declares the token on :root too, and this must win whatever order the sheets load in. A few
   dsh rules hard-code 2px instead of reading the token; those stay as dsh drew them. */
:root:root { --dsw-focus-ring-width: 1px; }
.tb-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 0; }
.tb-row.tb-row-block { display: block; }
.tb-row-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.tb-title { font-size: 13px; line-height: 18px; font-weight: 500; color: var(--foreground, #172026); }
.tb-desc { font-size: 12px; line-height: 17px; color: var(--muted-foreground, #737373); }
.tb-control { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.tb-swatch { width: 24px; height: 24px; border-radius: 999px; border: 2px solid transparent; padding: 0; cursor: pointer; box-shadow: 0 0 0 1px var(--border, #e5e5e5) inset; }
.tb-swatch[aria-pressed="true"] { border-color: var(--foreground, #172026); }
.tb-hex { width: 92px; height: 28px; box-sizing: border-box; padding: 0 10px; border-radius: 7px; border: 1px solid var(--border, #e5e5e5); background: transparent; color: var(--foreground, #172026); font: inherit; font-family: var(--ds-font-family-code, ui-monospace, monospace); font-size: 12px; text-transform: uppercase; }
.tb-hex:focus { outline: none; border-color: var(--ring, #bf5b3d); }
.tb-hex[aria-invalid="true"] { border-color: var(--destructive, #ef4444); }
.tb-select { height: 28px; min-width: 160px; box-sizing: border-box; padding: 0 28px 0 10px; border-radius: 7px; border: 1px solid var(--border, #e5e5e5); background: transparent; color: var(--foreground, #172026); font: inherit; font-size: 13px; cursor: pointer; }
.tb-select:focus { outline: none; border-color: var(--ring, #bf5b3d); }

/* Font size: one bordered 28px box, minus and plus either side of the value. */
.tb-step { display: inline-flex; align-items: center; height: 28px; box-sizing: border-box; border: 1px solid var(--border, #e5e5e5); border-radius: 7px; overflow: hidden; }
.tb-step button { width: 28px; height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--muted-foreground, #737373); font: inherit; font-size: 14px; line-height: 1; cursor: pointer; }
.tb-step button:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 5%, transparent); color: var(--foreground, #172026); }
.tb-step button:disabled { opacity: .4; cursor: default; }
.tb-step button:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: -1px; }
.tb-step output { min-width: 44px; box-sizing: border-box; text-align: center; font-size: 13px; line-height: 26px; font-variant-numeric: tabular-nums; color: var(--foreground, #172026); border-inline: 1px solid var(--border, #e5e5e5); }

/* Appearance: three window thumbnails, 16:10, the chosen one ringed in the foreground colour with a
   check beside its caption. */
.tb-thumbs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-top: 8px; }
.tb-th { display: grid; gap: 6px; justify-items: start; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; border-radius: 8px; }
.tb-th:focus-visible { outline: none; }
.tb-th:focus-visible .tb-pv { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 2px; }
.tb-pv { position: relative; display: grid; width: 100%; aspect-ratio: 16 / 10; box-sizing: border-box; border: 1px solid var(--border, #e5e5e5); border-radius: 8px; overflow: hidden; }
.tb-pv.tb-pv-split { grid-template-columns: 1fr 1fr; }
.tb-th:hover .tb-pv { border-color: color-mix(in oklab, var(--foreground, #172026) 30%, transparent); }
.tb-th[aria-pressed="true"] .tb-pv { outline: 2px solid var(--foreground, #172026); outline-offset: 1px; }
/* Tab onto the picked card recolours its stroke instead of adding a halo (Akemi, 05/10/2026). */
.tb-th[aria-pressed="true"]:focus-visible .tb-pv { outline-color: var(--ring, #bf5b3d); }
.tb-pv-win { display: grid; grid-template-columns: 28% 1fr; min-width: 0; }
.tb-pv-split .tb-pv-win { grid-template-columns: 30% 1fr; }
.tb-pv-side { background: #f3f2ef; }
.tb-pv-body { display: grid; gap: 4px; align-content: start; padding: 8px; background: #ffffff; }
.tb-pv-dark .tb-pv-side { background: #1c1c1c; }
.tb-pv-dark .tb-pv-body { background: #262626; }
.tb-pv-line { display: block; height: 4px; border-radius: 2px; background: rgba(128, 128, 128, 0.35); }
.tb-pv-line.tb-pv-short { width: 60%; }
.tb-pv-line.tb-pv-accent { width: 40%; background: var(--primary, #bf5b3d); }
.tb-th-cap { display: flex; align-items: center; gap: 6px; font-size: 12.5px; line-height: 16px; color: var(--muted-foreground, #737373); }
.tb-th[aria-pressed="true"] .tb-th-cap { color: var(--foreground, #172026); font-weight: 500; }
.tb-th-check { width: 14px; height: 14px; visibility: hidden; }
.tb-th[aria-pressed="true"] .tb-th-check { visibility: visible; }

/* dsh's conversation pane, keyed on its stable data-slot wrappers plus the readable tail of a
   CSS-module class (never a full hashed name — DESIGN.md §3). Only the shapes that differ from
   the design bench's ChatPane: the user bubble (rounded-xl with a small bottom-right corner on
   the muted surface, instead of a brand-tinted pill) and a semibold session title. */
[data-slot="conversation.chat.node"] [class*="userRow"] [class*="bubble"] { border-radius: 12px 12px 4px 12px; background: var(--dsw-alias-bg-layer-2, #f4f6f8); color: var(--dsw-alias-label-primary, #172026); padding: 8px 12px; }
[data-slot="conversation.session.header"] [class*="crumbCurrent"] { font-weight: 600; }

/* dsh's input bar (InputBar.module.css), kept — Lee 03/09 — and dressed like the bench's composer
   card: rounded-xl on the card surface with the standard border, and the send button on the
   accent instead of dsh's info fill. The hashed class tails are _card, _primary and _add.
   dsh's own .card rule has NO fallback on its border/background/shadow custom properties
   (border: 1px solid var(--dsw-alias-border-l2-darkmode-thin) etc.) — if any of those tokens is
   missing on a given dsh build, the whole shorthand goes invalid and border-style computes to
   none, so a coat that only overrides border-color leaves the card with no visible box at all
   (observed on a production lane 03/09). Restate border-style and border-width here too so the
   card always has a box regardless of what dsh's own token resolution does.
   Since 01/10/2026 the in-session composer (not the hero) is laid out by tracy-chat-input
   (composer-styles.ts: one line, 20px corners, attachment chips); these two rules still dress the
   hero card and give both the terracotta send.
   Focus (Akemi, 01/10/2026): one darker stroke, no ring or halo, for a click and for Tab alike.
   The colour is declared once here as --tc-composer-focus-border and read by both cards: the hero
   by the focus-within rule below, the in-session card by tracy-chat-input (composer-styles.ts),
   whose more specific card rule would otherwise win over this one. 50% foreground into the card
   (raised from 30%, which was barely visible in dark). Mixing into --card is right for the hero
   too: tokens.css defines --card as --dsw-alias-bg-layer-1, the hero's own fill, in both themes. */
[data-slot="conversation.composer.bar"] { --tc-composer-focus-border: color-mix(in oklab, var(--foreground, #172026) 50%, var(--card, #ffffff)); }
[data-slot="conversation.composer.bar"] [class*="_card"] { border-radius: 12px; border-style: solid; border-width: 1px; border-color: var(--dsw-alias-border-l2, #e3e7e9); background: var(--dsw-alias-bg-layer-1, #ffffff); box-shadow: none; }
[data-slot="conversation.composer.bar"] [class*="_card"]:focus-within { border-color: var(--tc-composer-focus-border); }
[data-slot="conversation.composer.bar"] [class*="_primary"] { background: var(--dsw-alias-brand-primary, #bf5b3d); }
/* The same round button in every state (David, 11/10/2026): dsh paints .primary:hover with its blue info hover,
   so hover and press take the darker terracotta this plugin puts in --dsw-alias-button-primary-hover (theme.mjs:
   darker in light, lighter in dark). Help's stop (.tv-help-stop, @tracy/dsh-assistant) stands in the same seat and
   follows the same rule; its quiet outlined state beside Send is more specific and keeps its own look. Focus is one
   1px stroke, never a halo. */
[data-slot="conversation.composer.bar"] [class*="_primary"]:hover:not(:disabled),
[data-slot="conversation.composer.bar"] [class*="_primary"]:active:not(:disabled),
[data-slot="conversation.composer.bar"] .tv-help-stop:hover,
[data-slot="conversation.composer.bar"] .tv-help-stop:active { background: var(--dsw-alias-button-primary-hover, color-mix(in oklab, var(--dsw-alias-brand-primary, #bf5b3d) 88%, black)); }
[data-slot="conversation.composer.bar"] [class*="_primary"]:focus-visible,
[data-slot="conversation.composer.bar"] .tv-help-stop:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; box-shadow: none; }

/* The action row under an answer (copy, thumbs, branch: an agent reply's turn tail, a Help answer, a slash-command
   result; dsh fork tracy.42 marks each row data-actions-reveal). dsh gives its buttons no focus rule, so the browser
   drew its own ring; Tracy's focus is one 1px stroke (DESIGN.md §5). */
[data-actions-reveal] button:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 0; box-shadow: none; }

/* dsh's General settings rows (ui-permission-presets, locale, ui-theme, ui-chat, ui-conversation),
   kept and dressed like the bench's SettingsRow + Select + ThemeCard: 12px vertical padding,
   controls as 32px bordered boxes with the md radius instead of 36px pills, theme cards rounded-xl
   with a 1px primary border when selected, no halo (Akemi, 29/09: one stroke for every focus and selection). Class tails: _row, _selector, _stepper, _arrow, _themeCube, _selected. */
[data-slot="settings.general.item"] > div:not(.tb-row) { padding: 11px 0; box-sizing: border-box; }
[data-slot="settings.general.item"] button[class*="_selector"], [data-slot="settings.general.item"] [class*="_stepper"] { height: 32px; min-height: 32px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #e3e7e9); background: transparent; }
[data-slot="settings.general.item"] button[class*="_selector"] { padding: 0 8px 0 10px; font-size: 13px; }
[data-slot="settings.general.item"] button[class*="_selector"]:hover { background: var(--dsw-alias-interactive-bg-hover, #f4f6f8); }
[data-slot="settings.general.item"] [class*="_stepper"] [class*="_arrow"] { background: transparent; }
[data-slot="settings.general.item"] [class*="_themeCube"] { border-radius: 12px; padding: 16px 24px; }
[data-slot="settings.general.item"] [class*="_themeCube"][class*="_selected"] { background: transparent; border-color: var(--dsw-alias-brand-primary, #bf5b3d); }

/* dsh's Keyboard shortcuts row (ui-shortcuts Reference.module.css), kept so its button still opens
   dsh's own editor, and dressed like Tracy's rows (Akemi, 02/10/2026): 13px title, 12px muted
   description, no hairline of its own (the settings chrome draws one between rows), and the button
   as a bordered 28px secondary control like the Language menu button instead of a filled pill.
   The row is found by its _settingText child, a class tail only this row uses. Class tails:
   _setting, _settingText, _settingTitle, _settingDescription, _button. */
[data-slot="settings.general.item"] > div:has(> [class*="_settingText"]) { min-height: 0; gap: 16px; border-bottom: 0; }
[data-slot="settings.general.item"] [class*="_settingText"] { gap: 1px; padding-right: 0; }
[data-slot="settings.general.item"] [class*="_settingTitle"] { font-size: 13px; line-height: 18px; font-weight: 500; color: var(--foreground, #172026); }
[data-slot="settings.general.item"] [class*="_settingDescription"] { font-size: 12px; line-height: 17px; color: var(--muted-foreground, #737373); }
[data-slot="settings.general.item"] > div:has(> [class*="_settingText"]) button[class*="_button"] { height: 28px; min-width: 0; padding: 0 10px; box-sizing: border-box; border: 1px solid var(--border, #e5e5e5); border-radius: 7px; background: transparent; color: var(--foreground, #172026); font-size: 13px; line-height: 1; }
[data-slot="settings.general.item"] > div:has(> [class*="_settingText"]) button[class*="_button"]:hover { background: color-mix(in oklab, var(--foreground, #172026) 5%, transparent); }
[data-slot="settings.general.item"] > div:has(> [class*="_settingText"]) button[class*="_button"]:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 0; }

/* The empty-session hero (ui-conversation EmptyHero) is one flex column: title row, workspace +
   mode row, the input dock (Tracy's chips), the composer. Lee 03/09: chips right under the title,
   workspace + mode down against the composer. Slot wrappers are display:contents, so the flex
   items are their children — hence the child selectors. */
[class*="composerHero"] > [data-slot="conversation.input.dock"] > * { order: 1; margin-top: 0; margin-bottom: 28px; }
[class*="composerHero"] > [class*="heroWorkspaceRow"] { order: 2; margin-bottom: 8px; }
/* Lee 03/09: mark higher, chips tight under it, a clear gap before the workspace row + composer.
   The stack is vertically centred by dsh, so extra bottom padding lifts its content. */
[class*="composerHero"] { padding-bottom: 72px; }
[class*="composerHero"] > [data-slot="conversation.composer.bar"] > * { order: 3; }

/* Lee 03/09: no "Into the Unknown" and no Preview badge on the empty hero — the mark alone.
   dsh renamed the headline's classes since (headlineText → titleGroup inside a headline wrapper);
   measured 14/09 on the DOM: SPAN.titleGroup > DIV.headline. Both names matched, so the next
   rename of one still leaves the other. The mark itself lives in conversation.hero.brand.mark,
   outside these, and stays. Since 28/09 this and the Split and compass rules below are operator
   switches (/ops › User Interface: hero-headline, split-button, guide-picture), read from
   <html data-tracy-hide> (@tracy/core ui-switches). */
:root[data-tracy-hide~="hero-headline"] [class*="composerHero"] [class*="headlineText"], :root[data-tracy-hide~="hero-headline"] [class*="composerHero"] [class*="titleGroup"], :root[data-tracy-hide~="hero-headline"] [class*="composerHero"] [class*="previewBadge"] { display: none; }

/* The mark and its line on a site's blank conversation (index.tsx, heroMark): the same size and
   weight as the first-run title, so the two screens read as one family.
   The line wraps, balanced, rather than overflow: the chat column opens 301 px wide, and on one
   line the title is about 410 px (measured 29/09). */
.tb-hero { display: inline-flex; align-items: center; gap: 12px; max-width: 100%; min-width: 0; }
.tb-hero-title { min-width: 0; font-size: 24px; font-weight: 600; line-height: 1.2; color: var(--foreground, #172026); text-wrap: balance; }
/* dsh's box around the mark (fishHitbox, matched by its readable suffix) refuses to shrink
   (flex-shrink 0): sized for a lone mark, it grew to 456 px in a 252 px headline and pushed the line
   out of the column (measured 29/09). Only when it carries Tracy's line is it allowed to shrink. */
[class*="composerHero"] [class*="fishHitbox"]:has(.tb-hero) { flex-shrink: 1; min-width: 0; }

/* dsh-subscriptions' composer-row provider switcher ("Codex · 5h 32%"): the account is meant to
   stay configured server-side, not surfaced as something a seat can see or click mid-chat. */
.dsub-pill { display: none; }

/* The native right column's "Start" guide (dsh 0.1.7, ui-sidebar-right GuideBody.module.css) is a
   centred flex column inside a pane that clips overflow. dsh ships a handful of kinds and never
   overflows; Tracy registers sixteen, and on a 813 px window the list ran to 977 px with the last
   entries unreachable by scroll (measured 26/09/2026 on the local demo). Let the guide scroll and
   start at the top instead of centring, until the fork reduces the list to one Build/Live site
   per platform. CSS-module hashes keep the original name as the suffix, hence the attribute match. */
/* No Split control on the native right column (Lee, 26/09/2026): two panes side by side is a
   developer's layout, not a customer's, and the column is narrow on a site page. dsh marks the
   button with data-dockkit-split-button (ui-dockkit TabPanel.tsx), so the rule needs no class
   hash. The Cmd+backslash shortcut of ui-sidebar-right still exists; hiding the button is the
   decision with teeth for a mouse-driven customer. (No backticks in this template literal.) */
:root[data-tracy-hide~="split-button"] [data-slot="rightbar"] button[data-dockkit-split-button] { display: none; }

/* Equal tabs, the way Chrome draws them (Akemi, 29/09/2026). dsh sizes each chip to its title
   (flex 0 1 auto, 80 to 170px), so My Sites sat at 91px beside a clipped site name at 170px.
   Here every chip gets the same 180px width and the same shrink share, so a few tabs are all
   180px, more tabs shrink together and stay equal, and below dsh's own 80px floor the strip
   scrolls as before. The strip keeps its content width, so the add button stays right after the
   last tab. dsh marks the chips with data attributes (ui-dockkit TabPanel.tsx), so no class hash;
   three attributes outrank the module's single class whatever order the sheets load in. A pane's
   lone unclosable chip is a label, not a tab, and keeps its natural width. The chip is
   content-box in dsh (measured: a 170px max drew 190px), so border-box keeps 180 the whole tab. */
[data-dockkit-strip-tabs] > [data-dockkit-tab]:not([data-dockkit-tab-quiet]) { box-sizing: border-box; flex: 0 1 auto; width: 180px; max-width: none; }

/* Tab titles keep one size whatever Settings › Font size says (Akemi, 03/10/2026). That setting
   promises to change only the conversation, but dsh's docking kit sizes its chips on the same
   content axis (ui-dockkit dockkit.module.css, .tab), so at 22px the right column's tabs grew to
   20px. Pinning the axis variable on the strip, not the chip's font-size, keeps dsh's own steps
   (the menu's minus one) intact; 13px is the kit's own fallback and the size of the left strip. */
[data-dockkit-strip] { --dsh-content-font-size-secondary: 13px; }

/* Breathing room under the right column's tabs (Akemi, 14/10/2026). dsh draws the strip as a 28px
   band with 10px above it and nothing below (ui-dockkit dockkit.module.css, .tabStrip), so the
   active chip sat on the strip's bottom edge and a tab's content (the Add site cards, the Team
   table) scrolled up flush against the chips. The same 10px below balances the row. The gap
   belongs to the header, a sibling of the pane body that scrolls, so the pane's own ground fills
   it and nothing scrolls into it; the body simply starts 10px lower. Scoped to the right column:
   two attributes outrank the module's single class whatever order the sheets load in. The macOS
   app's integrated chrome rule (html[data-desktop-chrome='integrated'], which sizes this same
   padding to the window's title bar) is more specific and still wins there. */
[data-slot="rightbar"] [data-dockkit-strip] { padding-bottom: 10px; }

[data-slot="rightbar"] [class$="_guide"]:has([class$="_entryCell"]) {
  overflow-y: auto;
  justify-content: flex-start;
  min-height: 0;
}

/* Compact guide (Lee, 26/09/2026). dsh draws the guide for its own handful of kinds: one centred
   column of 380 x 56 px cards under a compass, which with Tracy's ten-plus kinds is a page to
   scroll. Same entries, denser: a grid that fits two columns when the column is wide enough and
   falls back to one, cards a third as tall, left-aligned, no compass. Every hook is a CSS-module
   suffix of ui-sidebar-right's GuideBody (guide, hero, entryCell, entry, entryIcon), matched by
   the stable part of the hashed class. */
[data-slot="rightbar"] [class$="_guide"]:has([class$="_entryCell"]) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 6px 8px;
  align-items: start;
  align-content: start;
  justify-items: stretch;
  padding: 10px 12px;
}
:root[data-tracy-hide~="guide-picture"] [data-slot="rightbar"] [class$="_guide"] > [class$="_hero"] { display: none; }
[data-slot="rightbar"] [class$="_guide"] [class$="_entryCell"] { width: auto; max-width: none; min-width: 0; }
[data-slot="rightbar"] [class$="_guide"] [class$="_entry"] {
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  gap: 8px;
  border-radius: 10px;
  font-size: 13px;
  justify-content: flex-start;
}
[data-slot="rightbar"] [class$="_guide"] [class$="_entryIcon"] { width: 18px; height: 18px; flex: 0 0 18px; }
[data-slot="rightbar"] [class$="_guide"] [class$="_entryIcon"] svg { width: 16px; height: 16px; }
`
