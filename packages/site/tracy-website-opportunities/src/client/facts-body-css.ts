/**
 * The Business facts body of the Workspace card (#537, option F, `facts-body.tsx`): two small groups of facts with an
 * About line under them, and a 3 by 2 square photo mosaic as tall as the facts block beside them, so both end on the
 * same line. One fixed height . Under 640px of card
 * the mosaic goes under the facts as a single row of six tiles. Reads only Tracy tokens. No backtick may appear
 * inside the template below.
 */
export const FACTS_BODY_CSS = `
.tracy-wo-ws { --tracy-wo-fb-gap: 6px; --tracy-wo-fb-c: 117px; --tracy-wo-fb-tile: calc((var(--tracy-wo-fb-c) - var(--tracy-wo-fb-gap)) / 2); }
/* The profile section is the container the queries below measure: it is as wide as the card, whatever the page column is. Side by side needs 340px of facts, 24px of gap and the mosaic (178px) inside 16px of padding each side: 640px. */
.tracy-wo-ws-sec[data-section='profile']:has(> .tracy-wo-ws-body > .tracy-wo-fb) { container: wofb / inline-size; }
/* The body keeps one height whatever was found: 12px top and 14px bottom padding around the content (117px). */
.tracy-wo-ws-sec[data-section='profile'] > .tracy-wo-ws-body:has(> .tracy-wo-fb) { --tracy-wo-fb-height: calc(var(--tracy-wo-fb-c) + 26px); box-sizing: border-box; height: var(--tracy-wo-fb-height); overflow: hidden; }
.tracy-wo-fb { display: grid; grid-template-columns: minmax(340px, 1fr) auto; gap: 24px; height: 100%; min-width: 0; overflow: hidden; }
.tracy-wo-fb-facts { display: flex; flex-direction: column; height: var(--tracy-wo-fb-c); min-width: 0; overflow: hidden; }
.tracy-wo-fb-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; min-width: 0; }
.tracy-wo-fb-group { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tracy-wo-fb-gt { margin: 0 0 0; font-size: 11px; font-weight: 600; line-height: 14px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-foreground); }
.tracy-wo-fb-fact { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 10px; align-items: baseline; min-width: 0; line-height: 20px; }
.tracy-wo-fb-k { color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-fb-v { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--foreground); }
.tracy-wo-fb-v[data-na] { color: var(--muted-foreground); }
.tracy-wo-fb-fact[data-off] > .tracy-wo-fb-v { opacity: 0.5; }
a.tracy-wo-fb-v { color: var(--primary); text-decoration: none; }
a.tracy-wo-fb-v:hover { text-decoration: underline; }
a.tracy-wo-fb-v:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; border-radius: 2px; }
/* About: one muted line under both groups, at the foot of the block; the title attribute holds the whole text. */
.tracy-wo-fb-foot { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: baseline; margin-top: auto; padding-top: 7px; border-top: 1px solid var(--border); min-width: 0; }
.tracy-wo-fb-foot .tracy-wo-fb-v { color: var(--muted-foreground); }
.tracy-wo-fb-aside { color: var(--muted-foreground); line-height: 20px; white-space: nowrap; }
.tracy-wo-fb-aside > b { color: var(--foreground); font-weight: 500; }
.tracy-wo-fb-aside[data-off] { opacity: 0.5; }
/* The mosaic: three square tiles by two, as tall as the facts block. The last tile carries +N. */
.tracy-wo-fb-strip { display: grid; grid-template-columns: repeat(3, var(--tracy-wo-fb-tile)); grid-template-rows: repeat(2, var(--tracy-wo-fb-tile)); gap: var(--tracy-wo-fb-gap); align-content: start; min-width: 0; }
.tracy-wo-fb-tile { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; margin: 0; padding: 0; overflow: hidden; border: 0; border-radius: 6px; background: var(--muted); color: var(--muted-foreground); cursor: pointer; }
.tracy-wo-fb-tile[data-empty] { cursor: default; background: color-mix(in oklab, var(--muted) 50%, transparent); }
.tracy-wo-fb-tile > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-fb-tile:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
.tracy-wo-fb-play { width: 20px; height: 20px; }
.tracy-wo-fb-more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in oklab, var(--background) 55%, transparent); color: var(--foreground); font-size: 14px; font-weight: 600; line-height: 20px; }
/* No photo keeps the mosaic's box: dashed, muted. */
.tracy-wo-fb-nophoto { box-sizing: border-box; align-self: start; width: calc(3 * var(--tracy-wo-fb-tile) + 2 * var(--tracy-wo-fb-gap)); height: var(--tracy-wo-fb-c); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px; overflow: hidden; border: 1px dashed color-mix(in oklab, var(--muted-foreground) 45%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--muted) 50%, transparent); color: var(--muted-foreground); font-size: 12.5px; text-align: center; }
.tracy-wo-fb-nophoto > b { color: var(--foreground); font-weight: 500; }
.tracy-wo-fb-nophoto > svg { width: 16px; height: 16px; }
@container wofb (max-width: 639px) {
  /* The mosaic goes under the facts as one row of six 56px tiles; the body gets a taller fixed height. */
  .tracy-wo-ws-sec[data-section='profile'] > .tracy-wo-ws-body:has(> .tracy-wo-fb) { --tracy-wo-fb-height: calc(var(--tracy-wo-fb-c) + 12px + 56px + 26px); }
  .tracy-wo-fb { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; align-content: start; gap: 12px; }
  .tracy-wo-fb-strip { grid-template-columns: repeat(6, 56px); grid-template-rows: 56px; }
  .tracy-wo-fb-nophoto { width: calc(6 * 56px + 5 * var(--tracy-wo-fb-gap)); height: 56px; flex-direction: row; }
  .tracy-wo-fb-nophoto > span { display: none; }
}
@container wofb (max-width: 560px) {
  .tracy-wo-fb-groups { column-gap: 16px; }
  .tracy-wo-fb-fact { grid-template-columns: 52px minmax(0, 1fr); gap: 8px; }
}
`
