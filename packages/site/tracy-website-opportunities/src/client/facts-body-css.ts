/**
 * The Business facts body of the Workspace card (#537, option B, `facts-body.tsx`): a fixed height in every state, at
 * most two columns of facts on the left, one hero photo on the right. Under 720px of card the hero goes under the
 * facts and the body grows to a second fixed height. Reads only Tracy tokens. No backtick may appear inside the
 * template below.
 */
export const FACTS_BODY_CSS = `
.tracy-wo-ws { --tracy-wo-fb-height: 192px; --tracy-wo-fb-hero: clamp(240px, 38%, 440px); }
/* The body keeps one height whatever was found: 12px top and 14px bottom padding, 166px of content. */
.tracy-wo-ws-sec[data-section='profile'] > .tracy-wo-ws-body:has(> .tracy-wo-fb) { box-sizing: border-box; height: var(--tracy-wo-fb-height); overflow: hidden; }
.tracy-wo-fb { display: grid; grid-template-columns: minmax(0, 1fr) var(--tracy-wo-fb-hero); gap: 24px; height: 100%; min-width: 0; overflow: hidden; }
/* Two columns of facts, never more: four fixed slots each, the last one two lines tall for About. */
.tracy-wo-fb-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; align-content: start; min-width: 0; overflow: hidden; }
.tracy-wo-fb-col { display: grid; grid-template-rows: 20px 20px 20px 38px; row-gap: 9px; min-width: 0; }
.tracy-wo-fb-fact { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; align-items: baseline; min-width: 0; line-height: 20px; }
.tracy-wo-fb-k { color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-fb-v { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--foreground); }
.tracy-wo-fb-v[data-na] { color: var(--muted-foreground); }
a.tracy-wo-fb-v { color: var(--primary); text-decoration: none; }
a.tracy-wo-fb-v:hover { text-decoration: underline; }
a.tracy-wo-fb-v:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; border-radius: 2px; }
.tracy-wo-fb-fact[data-fact='about'] .tracy-wo-fb-v:not([data-na]) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; white-space: pre-line; line-height: 19px; max-height: 38px; }
/* One hero photo: the first stored one, its counts in the corner; a press opens the Business facts page. */
.tracy-wo-fb-hero { position: relative; display: block; width: 100%; height: 100%; min-height: 0; margin: 0; padding: 0; overflow: hidden; border: 0; border-radius: 8px; background: var(--muted); cursor: pointer; }
.tracy-wo-fb-hero > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-fb-hero:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
.tracy-wo-fb-badge { position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 5px; max-width: calc(100% - 16px); padding: 2px 9px; border-radius: 99px; background: color-mix(in oklab, var(--card, var(--background)) 88%, transparent); color: var(--foreground); font-size: 12px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-fb-badge > svg { flex: none; width: 13px; height: 13px; }
/* No photo keeps the hero's box: dashed, muted. */
.tracy-wo-fb-nophoto { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 0; padding: 8px; overflow: hidden; border: 1px dashed color-mix(in oklab, var(--muted-foreground) 45%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--muted) 50%, transparent); color: var(--muted-foreground); font-size: 12.5px; text-align: center; }
.tracy-wo-fb-nophoto > b { color: var(--foreground); font-weight: 500; }
.tracy-wo-fb-nophoto > svg { width: 16px; height: 16px; }
@container (max-width: 719px) {
  /* The hero goes under the facts; the body gets a taller fixed height: 314px of content. */
  .tracy-wo-ws { --tracy-wo-fb-height: 340px; }
  .tracy-wo-fb { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 12px; }
}
@container (max-width: 560px) {
  /* The body's padding drops to 10px top and 12px bottom here; the height stays 340px. */
  .tracy-wo-fb-facts { column-gap: 16px; }
  .tracy-wo-fb-fact { grid-template-columns: 56px minmax(0, 1fr); gap: 8px; }
}
`
