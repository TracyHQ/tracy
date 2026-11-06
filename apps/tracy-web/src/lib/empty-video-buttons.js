// Shared by the write step, its look guard and the site check (ADR 0044, decision 27): a play button whose video address is
// empty. Some templates print a video's play button whatever the video field holds (JA Boxing's session cards print
// `https://www.youtube.com/embed/` plus an empty id), so a hidden video id leaves a button over the picture that opens an empty
// player. The kit names, per template, the selector of such a button with an empty address (`site.emptyVideoButtons`), and the
// write step puts one CSS rule for those selectors in the kit's head injection block. The rule keys on the address, so a
// button whose video is filled later shows again with nothing taken off.

/** The write report line of the rule (write-step/video-buttons-stage.js), which the site check reads too. */
export const VIDEO_BUTTONS_SLOT = 'site:empty-video-buttons'

export const VIDEO_START = '<!-- tracy-video-buttons:start -->'
export const VIDEO_END = '<!-- tracy-video-buttons:end -->'

/** At most this many selectors, each at most this long: a rule this small never crowds the head block. */
export const MAX_SELECTORS = 20
export const MAX_SELECTOR_CHARS = 200

// Plain selector characters only: no braces, semicolons, angle brackets, at-rules or escapes, so a selector cannot close the rule,
// the style element or the block.
const SAFE = /^[\w\s.#[\]="'$^*~|:(),+/-]+$/
// It must test an attribute's value (`[data-src$="/embed/"]`, `[href="https://player.example/video/"]`): a selector that does not
// look at the address would hide a button that has a video.
const ADDRESS_TEST = /\[\s*[\w-]+\s*[$^*]?=\s*(?:"[^"]*"|'[^']*')\s*\]/

const each = (value) => (Array.isArray(value) ? value : [])

/** Whether a kit entry's selector may go into the rule. */
export const isSafeSelector = (selector) =>
  typeof selector === 'string' &&
  selector.trim() !== '' &&
  selector.length <= MAX_SELECTOR_CHARS &&
  SAFE.test(selector) &&
  ADDRESS_TEST.test(selector)

/**
 * The kit's selectors of play buttons with an empty video address, and what keeps an entry out.
 * @param {object | null | undefined} kit the template kit document
 * @returns {{ selectors: string[], problems: string[] }}
 */
export function emptyVideoButtonsOf(kit) {
  const selectors = []
  const problems = []
  for (const entry of each(kit?.site?.emptyVideoButtons)) {
    const selector = typeof entry?.selector === 'string' ? entry.selector.trim() : null
    if (!isSafeSelector(selector))
      problems.push(
        `the kit's empty video button ${JSON.stringify(entry?.selector ?? null)} is not one selector that tests the video address`
      )
    else if (!selectors.includes(selector)) selectors.push(selector)
  }
  if (selectors.length > MAX_SELECTORS) {
    problems.push(`the kit names ${selectors.length} empty video buttons, over ${MAX_SELECTORS}`)
    return { selectors: [], problems }
  }
  return { selectors, problems }
}

/** The one rule: every listed button with an empty address is not drawn. */
export const hideRuleFor = (selectors) => `${selectors.join(',')}{display:none!important}`

/** The marked block that carries the rule, or null when there is nothing to hide. */
export const videoBlockFor = (selectors) =>
  selectors.length ? `${VIDEO_START}<style>${hideRuleFor(selectors)}</style>${VIDEO_END}` : null

/** The marked block a module's content holds, or null. */
export function videoBlockIn(content) {
  const text = String(content ?? '')
  const from = text.indexOf(VIDEO_START)
  const to = text.indexOf(VIDEO_END)
  return from !== -1 && to > from ? text.slice(from, to + VIDEO_END.length) : null
}

/** `content` with the block put in place of an earlier one, added at the end, or taken off when `block` is null. */
export function withVideoBlock(content, block) {
  const text = String(content ?? '')
  const held = videoBlockIn(text)
  if (held) {
    const at = text.indexOf(held)
    const before = text.slice(0, at)
    const after = text.slice(at + held.length)
    if (block) return before + block + after
    return (before.replace(/\n$/, '') + after.replace(/^\n/, '')).replace(/^\n+|\n+$/g, '')
  }
  if (!block) return text
  return text === '' ? block : `${text}\n${block}`
}

// ── measuring ─────────────────────────────────────────────────────────────────────────────────────────────────────────

// A video embed address that names no video: the address ends where the id should start (`/embed/`, `/video/`), or its id is
// an empty query value (`watch?v=`). Read on what the host measured, which holds the attribute value as the page printed it.
const EMPTY_VIDEO_ADDRESS = [
  /^(?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/?(?:[?#&].*)?$/i,
  /^(?:https?:)?\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=(?:&.*|#.*)?$/i,
  /^(?:https?:)?\/\/youtu\.be\/?(?:[?#].*)?$/i,
  /^(?:https?:)?\/\/player\.vimeo\.com\/video\/?(?:[?#].*)?$/i,
  /^(?:https?:)?\/\/(?:www\.)?vimeo\.com\/?(?:[?#].*)?$/i
]

/** Whether an address is a video player's address with no video in it. */
export const isEmptyVideoAddress = (address) =>
  typeof address === 'string' && EMPTY_VIDEO_ADDRESS.some((re) => re.test(address.trim()))
