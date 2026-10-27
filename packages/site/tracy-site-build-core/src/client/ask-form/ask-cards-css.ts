/**
 * The stylesheet of the ask form's card layout (`AskCards.tsx`), as a string the plugin drawing that layout injects
 * beside its own (the Add site plugin appends it to its `CSS`). Approved canvas: `11-sheet-review-canvas.html`
 * (Akemi, 07/10/2026), rules `.qe*` there.
 *
 * Every colour is a Tracy token or a mix of two (DESIGN.md section 1.2): hover and press mix the text colour into the
 * card, the open card mixes terracotta into its border and header. So the light and dark themes are both right without
 * a pair of rules. Focus is one 1px stroke on the card's border, never a halo (DESIGN.md section 5).
 *
 * Unlayered on purpose: dsh puts every plugin's utilities into one cascade layer, and an unlayered rule wins over all
 * of them whatever order the plugins load in.
 *
 * No backtick may appear inside the template below: it would close the string.
 */
export const ASK_CARDS_CSS = `
/* The list of question cards: a tinted ground so the white cards read as cards in the light theme. */
[data-ask-layout="cards"] { background: color-mix(in oklab, var(--foreground) 4%, var(--background)); }
.ask-cards { display: flex; flex-direction: column; gap: 8px; }
.ask-card {
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 12px;
  min-width: 0;
  scroll-margin-top: 8px;
  transition: border-color 0.12s, background-color 0.12s;
}
/* Closed card: hover turns the whole border terracotta and lifts the surface one step; press one step more. */
.ask-card[data-ask-card="closed"]:has(> .ask-card-h .ask-card-btn:hover) {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--foreground) 4%, var(--card));
}
.ask-card[data-ask-card="closed"]:has(> .ask-card-h .ask-card-btn:active) {
  background: color-mix(in oklab, var(--foreground) 8%, var(--card));
}
/* Open card: a softer terracotta stroke and a tinted header, like a chosen chip; hover or press on its header brings
   the stroke to full and the tint one step up. */
.ask-card[data-ask-card="open"] { border-color: color-mix(in oklab, var(--primary) 55%, var(--border)); }
.ask-card[data-ask-card="open"] > .ask-card-h .ask-card-btn {
  background: color-mix(in oklab, var(--primary) 7%, var(--card));
  border-radius: 11px 11px 0 0;
}
.ask-card[data-ask-card="open"]:has(> .ask-card-h .ask-card-btn:hover) { border-color: var(--primary); }
.ask-card[data-ask-card="open"]:has(> .ask-card-h .ask-card-btn:hover) > .ask-card-h .ask-card-btn {
  background: color-mix(in oklab, var(--primary) 12%, var(--card));
}
.ask-card[data-ask-card="open"]:has(> .ask-card-h .ask-card-btn:active) > .ask-card-h .ask-card-btn {
  background: color-mix(in oklab, var(--primary) 17%, var(--card));
}
/* Keyboard focus on a card's header: the card's own border becomes the ring colour. One 1px stroke, no halo. */
.ask-card:has(> .ask-card-h .ask-card-btn:focus-visible) { border-color: var(--ring); }
.ask-card-h { margin: 0; font: inherit; }
.ask-card-btn {
  width: 100%;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 16px;
  column-gap: 10px;
  align-items: center;
  margin: 0;
  border: none;
  background: none;
  color: var(--foreground);
  padding: 11px 12px 11px 14px;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.3;
}
.ask-card-btn:focus-visible { outline: none; }
.ask-card-n {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--input);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: var(--muted-foreground);
  background: var(--card);
  font-variant-numeric: tabular-nums;
}
.ask-card[data-answered="1"] .ask-card-n {
  background: color-mix(in oklab, var(--primary) 10%, var(--card));
  border-color: var(--primary);
  color: var(--primary);
}
.ask-card-t {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--muted-foreground);
}
.ask-card[data-answered="1"] .ask-card-t { color: var(--foreground); }
.ask-card-chev { width: 16px; height: 16px; color: var(--muted-foreground); transition: transform 0.15s; }
.ask-card[data-ask-card="open"] .ask-card-chev { transform: rotate(180deg); }
.ask-card-p { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ask-card-p[hidden] { display: none; }
/* The hint keeps the line breaks its set wrote (U3). */
.ask-card-hint {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted-foreground);
  white-space: pre-line;
}
/* A long answer in a card is three lines of text: 3 x the line height, the padding and the border (U8). */
.ask-card-p textarea[data-ask-long="3"] { min-height: calc(3 * 1.375em + 14px); }
/* "Start with" chips above a long answer: dashed pills that start a sentence. */
.ask-start { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: var(--muted-foreground); }
.ask-start-chip {
  margin: 0;
  padding: 2px 10px;
  border: 1px dashed var(--input);
  border-radius: 999px;
  background: transparent;
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}
.ask-start-chip:hover {
  border-color: color-mix(in oklab, var(--foreground) 28%, var(--card));
  background: color-mix(in oklab, var(--foreground) 4%, var(--card));
}
.ask-start-chip:active { background: color-mix(in oklab, var(--foreground) 8%, var(--card)); transform: translateY(1px); }
.ask-start-chip:focus-visible { outline: none; border: 1px solid var(--ring); }
.ask-start-chip:disabled { cursor: default; opacity: 0.6; }
@media (prefers-reduced-motion: reduce) {
  .ask-card, .ask-card-chev { transition: none; }
}
`

/**
 * The ask form's `sections` layout (`AskCards` with `collapsible` off): the Customize your site page, in the Claude Design
 * question style the PO chose on 14/10/2026 (option C). No box per question and no accordion: each question is its title
 * (15px, 600) over its hint (13px) and control, and a hairline with 24px either side parts one question from the next.
 * Inputs are 42px high with a 10px corner, a long answer at least 96px, the "Start with" chips square-cornered (8px).
 * The footer sticks to the bottom of whatever scrolls the form, on the form's own surface. Appended after
 * `ASK_CARDS_CSS`, so where both say something about the same card these rules win. Same token rules as above.
 */
export const ASK_SECTIONS_CSS = `
[data-ask-layout="sections"] .ask-cards { gap: 0; }
[data-ask-layout="sections"] .ask-card {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 0 0 24px;
  margin: 0 0 24px;
  transition: none;
}
[data-ask-layout="sections"] .ask-card:last-child { border-bottom: 0; padding-bottom: 0; margin-bottom: 0; }
[data-ask-layout="sections"] .ask-card[data-ask-card="open"] { border-color: var(--border); }
[data-ask-layout="sections"] .ask-card-t {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--foreground);
}
[data-ask-layout="sections"] .ask-card-p { padding: 6px 0 0; gap: 12px; }
[data-ask-layout="sections"] .ask-card-hint { font-size: 13px; line-height: 1.45; }
[data-ask-layout="sections"] [data-slot="input"] { height: 42px; border-radius: 10px; padding: 0 14px; font-size: 14px; }
[data-ask-layout="sections"] [data-slot="textarea"],
[data-ask-layout="sections"] .ask-card-p textarea[data-ask-long="3"] {
  min-height: 96px;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 14px;
}
[data-ask-layout="sections"] .ask-start-chip { border-style: solid; border-radius: 8px; height: 28px; padding: 0 10px; }
[data-ask-layout="sections"] .ask-start-chip:focus-visible { border-style: solid; }
[data-ask-variant="sections"] > [data-ask-foot] {
  position: sticky;
  bottom: 0;
  z-index: 2;
  background: var(--card);
}
`
