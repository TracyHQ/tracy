/**
 * The Business facts body of the Workspace card (#537, option B, `facts-body.tsx`): a fixed height in every state, at
 * most two columns of facts on the left, a strip of three square tiles on the right. Under 720px of card the strip goes under the
 * facts and the body grows to a second fixed height. Reads only Tracy tokens. No backtick may appear inside the
 * template below.
 */
export const FACTS_BODY_CSS = `
.tracy-wo-ws { --tracy-wo-fb-height: 192px; --tracy-wo-fb-tile: 120px; --tracy-wo-fb-gap: 8px; --tracy-wo-fb-strip: calc(3 * var(--tracy-wo-fb-tile) + 2 * var(--tracy-wo-fb-gap)); }
/* The body keeps one height whatever was found: 12px top and 14px bottom padding, 166px of content. */
.tracy-wo-ws-sec[data-section='profile'] > .tracy-wo-ws-body:has(> .tracy-wo-fb) { box-sizing: border-box; height: var(--tracy-wo-fb-height); overflow: hidden; }
.tracy-wo-fb { display: grid; grid-template-columns: minmax(0, 1fr) var(--tracy-wo-fb-strip); gap: 24px; height: 100%; min-width: 0; overflow: hidden; }
/* Two columns of facts, never more: four fixed slots each, the last one two lines tall for About. */
.tracy-wo-fb-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; align-content: start; min-width: 0; overflow: hidden; }
.tracy-wo-fb-col { display: grid; grid-template-rows: 20px 20px 20px 38px; row-gap: 9px; min-width: 0; }
.tracy-wo-fb-fact { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 10px; align-items: baseline; min-width: 0; line-height: 20px; }
/* Labels take their own width, capped so the values keep the room. */
.tracy-wo-fb-k { max-width: 64px; color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-fb-v { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--foreground); }
.tracy-wo-fb-v[data-na] { color: var(--muted-foreground); }
a.tracy-wo-fb-v { color: var(--primary); text-decoration: none; }
a.tracy-wo-fb-v:hover { text-decoration: underline; }
a.tracy-wo-fb-v:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; border-radius: 2px; }
.tracy-wo-fb-fact[data-fact='about'] .tracy-wo-fb-v:not([data-na]) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; white-space: pre-line; line-height: 19px; max-height: 38px; }
/* Three square tiles in a row: the first stored items; the third is dimmed with +N when more are stored. A press opens the Business facts page. */
.tracy-wo-fb-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tracy-wo-fb-gap); align-content: start; width: 100%; min-width: 0; }
.tracy-wo-fb-tile { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1 / 1; min-width: 0; margin: 0; padding: 0; overflow: hidden; border: 0; border-radius: 8px; background: var(--muted); color: var(--muted-foreground); cursor: pointer; }
.tracy-wo-fb-tile[data-empty] { cursor: default; background: color-mix(in oklab, var(--muted) 50%, transparent); }
.tracy-wo-fb-tile > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-fb-tile:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
.tracy-wo-fb-play { width: 28px; height: 28px; }
.tracy-wo-fb-more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in oklab, var(--background) 55%, transparent); color: var(--foreground); font-size: 16px; font-weight: 600; line-height: 24px; }
/* No photo keeps the strip's width: dashed, muted. */
.tracy-wo-fb-nophoto { box-sizing: border-box; align-self: start; height: var(--tracy-wo-fb-tile); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 0; padding: 8px; overflow: hidden; border: 1px dashed color-mix(in oklab, var(--muted-foreground) 45%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--muted) 50%, transparent); color: var(--muted-foreground); font-size: 12.5px; text-align: center; }
.tracy-wo-fb-nophoto > b { color: var(--foreground); font-weight: 500; }
.tracy-wo-fb-nophoto > svg { width: 16px; height: 16px; }
@container (max-width: 719px) {
  /* The strip goes under the facts, capped at three full tiles; the body gets a taller fixed height: 314px of content. */
  .tracy-wo-ws { --tracy-wo-fb-height: 340px; }
  .tracy-wo-fb { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 12px; }
  .tracy-wo-fb-strip, .tracy-wo-fb-nophoto { width: min(100%, var(--tracy-wo-fb-strip)); }
}
@container (max-width: 560px) {
  /* The body's padding drops to 10px top and 12px bottom here; the height stays 340px. */
  .tracy-wo-fb-facts { column-gap: 16px; }
  .tracy-wo-fb-fact { grid-template-columns: 56px minmax(0, 1fr); gap: 8px; }
}
`
