/**
 * The owner's edits on the Business facts bands (#537 R14 to R16): the small switch on each photo tile and review
 * card, an item kept off the site dimmed, a person's photo in the avatar, the Team rows in Edit, the Social pages
 * links in Edit and the Add more row, the locked notice of approved facts and the line naming the same place's
 * other cards. Tracy tokens only. No backtick may appear inside the template below.
 */
export const FACTS_OWNER_CSS = `
.tracy-wo-facts-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tracy-wo-facts-avatar { overflow: hidden; }
.tracy-wo-facts-avatar > img { display: block; width: 100%; height: 100%; object-fit: cover; }
/* A photo or video tile: its switch in the top corner; kept off the site, the picture fades. */
.tracy-wo-facts-strip .tracy-wo-facts-tile-sw { position: absolute; top: 2px; right: 2px; display: flex; line-height: 0; }
.tracy-wo-facts-strip .tracy-wo-facts-tile-sw .tracy-wo-facts-sw { gap: 0; line-height: 0; }
.tracy-wo-facts-strip .tracy-wo-facts-tile-sw [data-slot='switch'] { transform: scale(0.62); transform-origin: top right; box-shadow: 0 0 0 1px color-mix(in oklab, var(--background) 70%, transparent); }
.tracy-wo-facts-strip > li[data-off] > img, .tracy-wo-facts-strip > li[data-off] > a { opacity: 0.35; }
/* A guest review: its switch at the end of the author line; kept off the site, the quote fades. */
.tracy-wo-facts-cards .tracy-wo-facts-ln > .tracy-wo-facts-sw { flex: none; margin-left: auto; }
.tracy-wo-facts-cards > li[data-off] > q, .tracy-wo-facts-cards > li[data-off] > .tracy-wo-facts-ln > .tracy-wo-facts-ell { opacity: 0.5; }
/* Team in Edit: one row per person, then Add person. */
.tracy-wo-facts-team-ed, .tracy-wo-facts-social-ed { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-team-ed > li { display: grid; grid-template-columns: 32px minmax(0, 1.3fr) minmax(0, 1fr) auto auto; align-items: center; gap: 8px; min-width: 0; }
.tracy-wo-facts-team-ed > li[data-off] .tracy-wo-facts-photo, .tracy-wo-facts-team-ed > li[data-off] input { opacity: 0.5; }
.tracy-wo-facts-team-ed > li.tracy-wo-facts-team-add { grid-template-columns: 32px minmax(0, 1.3fr) minmax(0, 1fr) auto; padding-top: 8px; border-top: 1px dashed var(--border); }
.tracy-wo-facts-team-ed > li > .tracy-wo-error { grid-column: 2 / -1; }
.tracy-wo-facts-photo { position: relative; display: flex; }
.tracy-wo-facts-photo > .tracy-wo-facts-avatar { padding: 0; border: 1px dashed color-mix(in oklab, var(--primary) 45%, transparent); cursor: pointer; }
.tracy-wo-facts-photo > .tracy-wo-facts-avatar:disabled { cursor: default; }
.tracy-wo-facts-photo > .tracy-wo-facts-avatar[data-failed] { border-color: var(--destructive); }
.tracy-wo-facts-photo > .tracy-wo-facts-avatar svg { width: 14px; height: 14px; }
.tracy-wo-facts-photo > .tracy-wo-facts-avatar:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
/* Social pages in Edit: the owner's links, each with Remove. */
.tracy-wo-facts-social-ed > li { display: grid; grid-template-columns: 16px minmax(0, 0.6fr) minmax(0, 1.4fr) auto; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; }
.tracy-wo-facts-social-ed svg { color: var(--muted-foreground); }
/* Approved facts (#537 R23): one calm notice over the bands, its button at the end of the line. */
.tracy-wo-facts-locked { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--muted); color: var(--muted-foreground); font-size: 13px; }
.tracy-wo-facts-locked > p { flex: 1 1 240px; margin: 0; min-width: 0; }
.tracy-wo-facts-locked > .tracy-wo-error { flex-basis: 100%; }
/* A line naming the account's other cards of the same place. */
.tracy-wo-same-as { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 0; color: var(--muted-foreground); font-size: 12px; }
.tracy-wo-same-as > button { padding: 0; border: 0; background: none; color: var(--foreground); font: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.tracy-wo-same-as > button:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
/* Under a list row's name: one line, cut with an ellipsis, the whole line on hover. */
.tracy-wo-p-place > .tracy-wo-same-as { flex-wrap: nowrap; min-width: 0; max-width: 100%; }
.tracy-wo-p-place > .tracy-wo-same-as > button { min-width: 0; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-p-place > .tracy-wo-same-as > span { flex: none; }
@container wo-facts (max-width: 559px) {
  .tracy-wo-facts-team-ed > li, .tracy-wo-facts-team-ed > li.tracy-wo-facts-team-add { grid-template-columns: 32px minmax(0, 1fr) auto; }
  .tracy-wo-facts-team-ed > li > input:nth-of-type(2) { grid-column: 2 / -1; }
}
`
