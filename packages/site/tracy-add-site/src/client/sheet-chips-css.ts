/**
 * The stylesheet of the sheet's chips (`sheet-chips.tsx`) and its language select (`language-select.tsx`), appended
 * to this plugin's `CSS` (`styles.ts`). Approved canvas: `11-sheet-review-canvas.html`, rules `.rchip`, `.cchip`,
 * `.lbox.one`, `.ldrop`.
 *
 * Every colour is a Tracy token or a mix of two, so light and dark are both right with one rule each. Hover mixes the
 * text colour into the card and strengthens the neutral stroke; chosen is the primary stroke on a 10% primary ground
 * (the CHIP_SELECTED of the shared choice cards). Focus is one 1px stroke, never a halo (DESIGN.md section 5).
 * Unlayered for the cascade-order reason in `styles.ts`. No backtick may appear inside the template below.
 */
export const SHEET_CHIPS_CSS = `
.tas-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tas-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin: 0;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--foreground);
  font-size: 13.5px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.tas-chip:hover { background: color-mix(in oklab, var(--foreground) 4%, var(--card)); border-color: color-mix(in oklab, var(--foreground) 28%, var(--card)); }
.tas-chip:active { background: color-mix(in oklab, var(--foreground) 8%, var(--card)); transform: translateY(1px); }
.tas-chip[data-on="1"] { border-color: var(--primary); background: color-mix(in oklab, var(--primary) 10%, var(--card)); font-weight: 500; }
.tas-chip[data-on="1"]:hover { border-color: var(--primary); background: color-mix(in oklab, var(--primary) 16%, var(--card)); }
.tas-chip[data-on="1"]:active { background: color-mix(in oklab, var(--primary) 22%, var(--card)); }
.tas-chip:focus-visible { outline: none; border-color: var(--ring); }
.tas-chip:disabled { cursor: default; opacity: 0.6; }
/* The locked home page: chosen, not pressable. */
.tas-chip[data-locked="1"], .tas-chip[data-locked="1"]:hover, .tas-chip[data-locked="1"]:active {
  cursor: default;
  transform: none;
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 10%, var(--card));
  opacity: 0.7;
}
.tas-chip-radio {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--input);
  border-radius: 50%;
  background: var(--card);
}
.tas-chip[data-on="1"] .tas-chip-radio { border-color: var(--primary); }
.tas-chip[data-on="1"] .tas-chip-radio::after { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--primary); }
.tas-chip-tick { width: 13px; height: 13px; flex-shrink: 0; color: var(--primary); stroke-width: 3; }
.tas-chip-plus { width: 13px; flex-shrink: 0; text-align: center; font-size: 13px; line-height: 1; color: var(--muted-foreground); }
.tas-pages-kept { margin: 0; font-size: 13px; line-height: 1.4; color: var(--foreground); }

/* The language select: a box showing the language, a chevron, and the list under it. */
.tas-lsel { position: relative; }
.tas-lsel-input {
  display: block;
  width: 100%;
  min-width: 0;
  height: 32px;
  margin: 0;
  padding: 0 30px 0 10px;
  border: 1px solid var(--input);
  border-radius: 10px;
  background: transparent;
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
}
.tas-lsel-input:focus { cursor: text; border-color: var(--ring); outline: none; box-shadow: none; }
.tas-lsel-input::placeholder { color: var(--muted-foreground); }
.tas-lsel-chev {
  position: absolute;
  right: 8px;
  top: 50%;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  color: var(--muted-foreground);
  pointer-events: none;
}
.tas-lsel-drop {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 5;
  max-height: 196px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 8px 24px color-mix(in oklab, var(--foreground) 10%, transparent);
}
.tas-lsel-opt {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.tas-lsel-opt:hover, .tas-lsel-opt:focus-visible { background: color-mix(in oklab, var(--foreground) 4%, var(--popover)); }
.tas-lsel-opt:active { background: color-mix(in oklab, var(--foreground) 8%, var(--popover)); }
.tas-lsel-opt:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.tas-lsel-opt[aria-selected="true"] { font-weight: 500; }
.tas-lsel-opt svg { width: 13px; height: 13px; color: var(--primary); stroke-width: 3; flex-shrink: 0; }
.tas-lsel-none { padding: 6px 8px; font-size: 12px; color: var(--muted-foreground); }

/* On the Customize your site page (the ask form's sections layout, Akemi 14/10/2026): a single choice is a column of
   full-width rows, each with a 16px radio circle, its name and a short muted line on the right; a multiple choice
   (Pages) keeps wrapping chips, square-cornered. The language box is as tall as the other fields. */
[data-ask-layout="sections"] .tas-chips[role="radiogroup"] { flex-direction: column; align-items: stretch; gap: 8px; width: 100%; }
[data-ask-layout="sections"] .tas-chips[role="radiogroup"] .tas-chip {
  width: 100%;
  min-height: 46px;
  padding: 10px 14px;
  gap: 12px;
  border-radius: 10px;
  font-size: 14px;
}
[data-ask-layout="sections"] .tas-chips[role="radiogroup"] .tas-chip-radio { width: 16px; height: 16px; }
[data-ask-layout="sections"] .tas-chips[role="radiogroup"] .tas-chip[data-on="1"] .tas-chip-radio::after { width: 8px; height: 8px; }
.tas-chip-desc { margin-left: auto; padding-left: 8px; text-align: right; font-size: 13px; font-weight: 400; color: var(--muted-foreground); }
[data-ask-layout="sections"] .tas-chips[role="group"] { gap: 8px; }
[data-ask-layout="sections"] .tas-chips[role="group"] .tas-chip { min-height: 34px; padding: 0 12px; border-radius: 8px; }
[data-ask-layout="sections"] .tas-lsel-input { height: 42px; padding: 0 34px 0 14px; font-size: 14px; }
`
