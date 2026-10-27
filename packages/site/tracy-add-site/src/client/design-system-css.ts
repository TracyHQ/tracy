/**
 * The Design system card and sheet (design-system-card.tsx, design-system-sheet.tsx). The card reuses the Customize your site card's grid
 * (`.tas-qcard` in styles.ts); these rules add only what differs: the picked system's thumbnail in the badge cell, the
 * dimmed state, the sheet's toolbar and body, and the picked card's stroke. Unlayered, like the rules they extend, so a later
 * plugin's copy of a utility cannot win a tie.
 */
export const DESIGN_SYSTEM_CSS = `
/* Line 2 of the Design system card: the pick's name, on one line that gives way at its end (a long library name). */
.tas-dscard .tas-qcard-l2 { overflow: hidden; text-overflow: ellipsis; }
/* The picked system's picture (or its swatch) in the badge cell: same 48px rounded square as the palette badge. */
.tas-ds-thumb { grid-area: badge; width: 48px; height: 48px; border-radius: 12px; object-fit: cover; object-position: top; }
/* Not available for the template in sight: dimmed, not pressable, and its one line may wrap. */
.tas-dscard[aria-disabled="true"] { opacity: .55; cursor: default; }
.tas-dscard[aria-disabled="true"] .tas-qcard-l2 { white-space: normal; line-height: 16px; }

/* The sheet's toolbar (design-system-filter.tsx) sits between the head and the grid and stays while the grid scrolls. */
.tas-ds-tools { flex: none; padding: 16px 16px 4px; }
/* The sheet's body: the grid scrolls, the head and the toolbar stay. */
.tas-ds-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px 16px; }
/* The cards are the Design templates gallery's, drawn with utilities (design-system-grid-card.tsx). The one rule here is the
   picked card's terracotta stroke, unlayered: as a bare utility it would lose to another plugin's later .border-border on
   the same card (DESIGN.md section 3.1). Hover and focus keep their stroke through their own variants. */
.tas-ds-card[aria-pressed="true"] { border-color: var(--primary); }

/* The popup is portalled to the page body, outside .tas-root and .tas-page, so it gets the same preflight stand-ins
   under its own name, in the base layer where Tailwind's own preflight lives (styles.ts explains why not unlayered). */
@layer base {
  .tas-dspop, .tas-dspop *, .tas-dspop *::before, .tas-dspop *::after { box-sizing: border-box; }
  .tas-dspop button { font: inherit; color: inherit; border: 0 solid; background-color: transparent; }
  .tas-dspop button:not(:disabled) { cursor: pointer; }
}
`
