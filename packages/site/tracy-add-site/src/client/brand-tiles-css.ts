/**
 * The stylesheet of the logo and favicon tiles (`brand-tiles.tsx`), appended to this plugin's `CSS` (`styles.ts`).
 * Approved canvas: `11-sheet-review-canvas.html`, rules `.tile*`, `.upbtn.ib`, `.msg`, `.fhint`, `.favrow`, `.tabpv`.
 *
 * 🔒 TWO FIXED COLOURS, ON PURPOSE. A logo tile is a preview of the logo on a generic white (#ffffff) or near-black
 * (#0a0a0a) ground, the same in both Tracy themes and whatever the template's own colours (U5, Akemi 07/10/2026): it
 * answers "does my logo read on light and on dark", which a themed ground would hide. Those two are the only literal
 * colours here. The buttons on a tile mix the tile's own text colour (currentColor); everything around the tiles mixes
 * Tracy tokens, so both themes are right with one rule each.
 *
 * The warning colour: Tracy has no warning token (tokens.css), so a fixed amber hue is mixed into the foreground for
 * the text and into the card for the ground. Mixed that way it is dark amber on light and light amber on dark.
 *
 * Focus is one 1px stroke, never a halo (DESIGN.md section 5). Unlayered for the cascade-order reason in `styles.ts`.
 * No backtick may appear inside the template below.
 */
export const BRAND_TILES_CSS = `
.tas-brand { display: flex; flex-direction: column; gap: 8px; min-width: 0; --tas-warn-hue: oklch(0.72 0.15 70); }
/* Two tiles side by side, stacked once each would be narrower than 160px; one tile takes the row. */
.tas-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.tas-tiles[data-count="1"] { grid-template-columns: 1fr; }
.tas-tilewrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tas-tile-k { font-size: 12px; font-weight: 600; color: var(--muted-foreground); line-height: 16px; }
.tas-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border);
  transition: border-color 0.12s;
}
.tas-tile[data-ground="light"], .tas-tile-fv { background: #ffffff; color: #0a0a0a; }
.tas-tile[data-ground="dark"] { background: #0a0a0a; color: #ffffff; }
.tas-tile:has(.tas-ib:hover) { border-color: color-mix(in oklab, var(--foreground) 28%, var(--card)); }
.tas-tile:has(:focus-visible) { border-color: var(--ring); }
.tas-tile[data-bad="1"] { border-color: var(--destructive); }
/* The preview: 60px high, the logo at most 32px high. Dimmed and blurred while the actions show over it. */
.tas-tile-v { height: 60px; display: grid; place-items: center; padding: 8px 12px; transition: opacity 0.15s, filter 0.15s; }
.tas-tile-v img { max-height: 32px; max-width: 100%; display: block; }
.tas-tile-nm { font-weight: 700; font-size: 14px; line-height: 1.2; text-align: center; overflow-wrap: anywhere; }
.tas-tile-a {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.tas-tile:hover .tas-tile-a, .tas-tile:focus-within .tas-tile-a, .tas-tile-a:has([data-busy="1"]) { opacity: 1; }
.tas-tile:hover .tas-tile-v, .tas-tile:focus-within .tas-tile-v, .tas-tile:has([data-busy="1"]) .tas-tile-v {
  opacity: 0.25;
  filter: blur(1.5px);
}
/* A touch screen has no hover: the actions sit under the preview, always shown. */
@media (hover: none) {
  .tas-tile-a { opacity: 1; position: static; padding: 0 12px 10px; }
  .tas-tile .tas-tile-v { opacity: 1; filter: none; }
}
/* Icon-only buttons: the tile's own text colour mixed in, so they read on white and on near-black alike. */
.tas-ib {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid color-mix(in oklab, currentColor 40%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, currentColor 6%, transparent);
  color: inherit;
  cursor: pointer;
}
.tas-ib:hover { background: color-mix(in oklab, currentColor 10%, transparent); }
.tas-ib:active { background: color-mix(in oklab, currentColor 18%, transparent); transform: translateY(1px); }
.tas-ib:has(input:focus-visible), button.tas-ib:focus-visible { border-color: currentColor; outline: none; }
.tas-ib svg { width: 15px; height: 15px; pointer-events: none; }
.tas-ib input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.tas-ib input:focus-visible { outline: none; }
.tas-ib:has(input:disabled) { cursor: progress; }

/* The favicon: a 72px square on a checkerboard of the two preview colours, beside a browser tab. */
.tas-favrow { display: flex; gap: 12px; align-items: center; min-width: 0; }
.tas-tile-fv { width: 72px; flex-shrink: 0; }
.tas-tile-fv .tas-tile-v {
  height: 72px;
  padding: 10px;
  background: repeating-conic-gradient(color-mix(in srgb, #0a0a0a 8%, #ffffff) 0 25%, #ffffff 0 50%) 0 0 / 12px 12px;
}
.tas-tile-fv .tas-tile-v img { max-height: 44px; max-width: 44px; }
.tas-tile-fv .tas-tile-a { gap: 4px; }
.tas-tile-fv .tas-ib { width: 26px; height: 26px; }
.tas-tile-fv .tas-ib svg { width: 13px; height: 13px; }
@media (hover: none) { .tas-tile-fv .tas-tile-a { padding: 8px 10px 10px; } }
.tas-fvempty {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  border: 1.5px dashed color-mix(in oklab, currentColor 30%, transparent);
  background: color-mix(in srgb, #ffffff 70%, transparent);
}
.tas-tabpv {
  flex: 1;
  min-width: 0;
  display: flex;
  padding: 5px 6px 0;
  border-radius: 8px 8px 0 0;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--foreground) 7%, var(--card));
}
.tas-tabpv-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 7px 7px 0 0;
  background: var(--card);
  color: var(--foreground);
  font-size: 12px;
}
.tas-tabpv-tab img { width: 16px; height: 16px; flex-shrink: 0; border-radius: 3px; display: block; }
.tas-tabpv-ic {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 4px;
  background: color-mix(in oklab, var(--muted-foreground) 40%, transparent);
}
.tas-tabpv-nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Pictures the customer sent in the creation screen's chat (ChatLogo in brand-tiles.tsx): a label, then one small
   button per PNG. Focus is the one 1px stroke (DESIGN.md §5). */
.tas-chatlogo { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.tas-chatlogo-k { color: var(--muted-foreground); }
.tas-chatlogo-pick {
  display: inline-flex; align-items: center; gap: 6px; max-width: 220px; height: 28px; padding: 0 8px 0 3px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--foreground);
  font: inherit; cursor: pointer;
}
.tas-chatlogo-pick:hover { background: var(--muted); }
.tas-chatlogo-pick:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; }
.tas-chatlogo-pick img { width: 22px; height: 22px; flex: none; border-radius: 5px; object-fit: contain; background: var(--muted); }
.tas-chatlogo-pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* A refusal or a warning under the tiles; the file hints. */
.tas-brand-msg { display: flex; gap: 6px; align-items: flex-start; border-radius: 8px; padding: 6px 8px; font-size: 12px; line-height: 1.35; }
.tas-brand-msg[data-tone="error"] { color: var(--destructive); background: color-mix(in oklab, var(--destructive) 9%, var(--card)); }
.tas-brand-msg[data-tone="warn"] {
  color: color-mix(in oklab, var(--tas-warn-hue) 62%, var(--foreground));
  background: color-mix(in oklab, var(--tas-warn-hue) 13%, var(--card));
}
.tas-brand-msg b { font-weight: 600; overflow-wrap: anywhere; }
.tas-brand-msg-ic {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 1px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  font-size: 9.5px;
  font-weight: 700;
  font-style: normal;
}
.tas-fhint { font-size: 11.5px; line-height: 1.4; color: var(--muted-foreground); }
@media (prefers-reduced-motion: reduce) {
  .tas-tile, .tas-tile-v, .tas-tile-a { transition: none; }
}
`
