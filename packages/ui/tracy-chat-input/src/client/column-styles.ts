/**
 * The conversation column never scrolls sideways (Akemi 14/10/2026, the 300px conversation). Plain
 * CSS, mode B, injected with COMPOSER_CSS.
 *
 * Measured at 300px: opening the model picker shifted the whole column 61px to the left (messages,
 * cards and the chat box cut on the left) and it stayed shifted after the menu closed. dsh's
 * ConversationRoot sets overflow: hidden on its active-phase root, and hidden still leaves a scroll
 * container: anything that brings an element into view (focus, scrollIntoView, find in page, an
 * automation click) may scroll it, and nothing scrolls it back.
 *
 * It had room to scroll because dsh's two transcript width handles are placed from the content
 * width (--dsh-chat-content-width, at least 680px) and not from the column. In a 300px column the
 * right handle sits 514px from the column's left edge; its strip resolves to zero width but its 2px
 * glow (::after) does not, so the column's content was 520px wide inside 300px.
 *
 * Two rules, each on the box that owns the overflow:
 * - The band below the header (the root's _body, parent of the scrollport and the handles) clips
 *   horizontally, so a handle outside the column adds nothing to the column's width. Inside a wide
 *   column the handles and their glow sit within the band, so nothing visible is cut.
 * - The root clips instead of hiding: overflow: clip paints exactly what hidden paints but is not a
 *   scroll container, so no focus or scrollIntoView can move it. Both axes, because clip beside
 *   hidden on the other axis computes back to hidden. The transcript keeps its own scrollport
 *   (data-conversation-scroll) and its sticky chat box, which sit below this root.
 *
 * The start screen sits on the column's centre (Akemi 14/10/2026). dsh's scrollport reserves a
 * stable scrollbar gutter and keeps a 2px margin on its right only, so everything centred inside it
 * (the hero, the five cards, the composer) sat half of that left of the column's centre: 3.5px at
 * 300px. On the start screen the scrollport mirrors both on the left (stable both-edges, a 2px left
 * margin), so its content box is centred on the column whatever the bar's width (zero for overlay
 * bars). The transcript keeps dsh's one-sided reservation: only a scrollport holding .tv-start
 * matches.
 *
 * Hooks: the readable tails of dsh's CSS-module classes (_root, _body) and the scrollport's
 * data-conversation-scroll, never a full hashed name.
 */
const BAND = '[class*="_body"]'
const SCROLLPORT = '[data-conversation-scroll]'

/* :has() does not nest, so the root's selector spells the band and scrollport out in one :has. */
export const COLUMN_CSS = `
[class*="_root"][data-phase]:has(> ${BAND} > ${SCROLLPORT}) { overflow: clip; }
${BAND}:has(> ${SCROLLPORT}) { overflow-x: clip; }
${SCROLLPORT}:has(.tv-start) { scrollbar-gutter: stable both-edges; margin-left: 2px; }
`
