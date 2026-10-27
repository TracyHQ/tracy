/**
 * Plain CSS for the mode+platform picker (mode B: inside dsh's page, no reset, `tv-` prefix).
 * Colours read dsh's aliases with a fallback, so the picker follows the Tracy layer dsh-brand
 * puts on <body> and the light/dark switch. Platforms are drawn with their own marks
 * (`platform-logo.tsx`) in their own brand colours, not dsh aliases: a platform's logo is not a
 * host colour.
 */
export const CSS = `
.tv-mode-picker { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; margin-right: 8px; }
.tv-mp-picker { position: relative; display: inline-flex; }
/* The hero picker takes the room the workspace chip leaves (fit.mjs decides what it shows in it)
   and never less than its two pills as icons — the same numbers as the compact rules below:
   2 × (6px padding each side + 1px border each side) + a 14px mode icon + an 18px platform glyph
   + the 6px gap. Below that the workspace chip shortens its own label instead. */
.tv-mode-fit {
  flex: 1 1 0;
  min-width: calc(2 * (2 * 6px + 2px) + 14px + 18px + 6px);
  margin-left: 8px;
  justify-content: flex-end;
}
.tv-mp-row { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.tv-mode-picker[data-compact] .tv-seat { padding: 0 6px; }
.tv-mode-picker[data-compact] .tv-seat-chevron { display: none; }
/* Words hidden from sight only: screen readers still read them (and a button's title shows them
   on hover). */
.tv-mode-picker[data-compact] .tv-seat-text {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}
.tv-seat {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, #e3e7e9);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #172026);
  font: inherit; font-size: 13px; font-weight: 500; line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .12s;
}
.tv-seat:hover { background: var(--dsw-alias-interactive-bg-hover, #f4f6f8); }
.tv-seat:disabled { opacity: .6; cursor: default; }
.tv-seat-locked { cursor: default; opacity: .75; }
.tv-seat-locked:hover { background: transparent; }
.tv-seat-icon { width: 14px; height: 14px; flex: none; color: var(--dsw-alias-label-secondary, #4a5560); }
.tv-seat-chevron { width: 12px; height: 12px; flex: none; color: var(--dsw-alias-label-secondary, #4a5560); }

/* The role chip in the composer row (Case 2 composer spec, Akemi 01/10/2026): 32px tall, 8px corners,
   no border and no fill, 13px words, a 16px line icon on the left and a 12px chevron on the right.
   Hover brightens it the way the + beside it does (the text colour mixed into the background); keyboard
   focus is one --ring stroke, no halo. */
.tv-role-chip {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  height: 32px; padding: 0 8px; box-sizing: border-box;
  border: 0; border-radius: 8px; background: transparent;
  color: var(--foreground, #172026);
  font: inherit; font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap;
  cursor: pointer; transition: background-color .12s;
}
.tv-role-chip:hover:not(:disabled) { background: color-mix(in oklab, var(--foreground, #172026) 8%, transparent); }
.tv-role-chip:focus { outline: none; }
.tv-role-chip:focus-visible { outline: 1px solid var(--ring, #bf5b3d); outline-offset: 1px; }
.tv-role-chip:disabled { opacity: .6; cursor: default; }
.tv-role-chip-icon { width: 16px; height: 16px; flex: none; color: var(--muted-foreground, #6b7280); }
.tv-role-chip .tv-seat-text { overflow: hidden; text-overflow: ellipsis; }
.tv-role-chip .tv-seat-chevron { color: var(--muted-foreground, #6b7280); }

.tv-menu {
  position: fixed; z-index: 60;
  width: 19rem; max-width: calc(100vw - 24px);
  background: var(--dsw-alias-bg-layer-3, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e3e7e9);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .16);
  overflow: hidden;
  padding: 4px 0;
}
.tv-menu-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 6px 12px;
  border: none; background: transparent; text-align: left;
  font: inherit; color: inherit; cursor: pointer;
}
.tv-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, #f4f6f8); }
/* The chosen row is marked by its check mark only (Akemi, 02/10/2026; the Site changes filter follows
   the same rule). A background is the pointer's signal: a tinted choice read like the hovered row. */
/* A platform this site is not. Dimmed rather than removed, and dimmed by OPACITY rather than by a
   second set of colours: one rule covers light and dark, and no token has to be picked for a state
   that only means "not here". The hover rule above still matches a disabled row, so it is undone. */
.tv-menu-item:disabled { opacity: 0.4; cursor: default; }
.tv-menu-item:disabled:hover { background: transparent; }
.tv-menu-item-icon { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; color: var(--dsw-alias-label-secondary, #4a5560); }
.tv-menu-item-text { min-width: 0; flex: 1; }
.tv-menu-item-name { display: block; font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary, #172026); }
.tv-menu-item-hint { display: block; font-size: 12px; color: var(--dsw-alias-label-secondary, #4a5560); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tv-menu-item-check { width: 14px; height: 14px; flex: none; color: var(--dsw-alias-label-primary, #172026); }

.tv-glyph {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 18px; height: 18px; border-radius: 999px;
  font-size: 9px; font-weight: 700;
  background: var(--dsw-alias-bg-layer-2, #f4f6f8); color: var(--dsw-alias-label-secondary, #4a5560);
}
/* A known platform shows its own mark (platform-logo.tsx) in the same 18px box, with no tinted
   disc behind it: the mark carries the brand colour itself. A disabled menu row fades the mark
   with the row, since the row's opacity covers everything inside it. */
.tv-glyph[data-platform] { background: transparent; }
.tv-glyph-mark { display: block; width: 16px; height: 16px; flex: none; }

/* WordPress on a dark surface: its blue W measures about 2.3:1 on dsh's dark menu layer, below
   the 3:1 a graphic needs. WordPress's own logo kit offers the W mark in white for dark grounds,
   so the dark theme fills the same path white. Joomla's blue (about 3.5:1 there) and EmDash's
   mark (shown unchanged in EmDash's own dark admin) stay as drawn. body[data-ds-dark-theme] is
   the attribute dsh flips (DESIGN.md section 1.1). */
body[data-ds-dark-theme] .tv-glyph[data-platform="wordpress"] .tv-glyph-mark path { fill: #ffffff; }

.tv-header-model-menu > [role="presentation"] { overflow-y: visible; }
.tv-header-model-menu.tv-header-model-scroll > [role="presentation"] { max-height: min(420px, 65vh); overflow-y: auto; }
.tv-header-model-status { order: -1; flex: none; padding: 4px; min-width: 200px; }
.tv-header-model-search { box-sizing: border-box; width: 100%; height: 28px; padding: 0 7px; }
.tv-header-model-search input { width: 0; font-size: 12px; line-height: 18px; }
.tv-header-model-status p { margin: 6px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #4a5560); }
`
