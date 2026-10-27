/**
 * The words a chat chip shows for one mentioned element (`tracy-element` descriptor), moved here
 * from `tracy-chat-input` `comment-turn.mjs` (which re-exports them) so any reader of a recorded
 * request — the chat chip, the Comments tab, a recorded turn title, Site changes — names an element the
 * same way, and says a whole block in those words ({@link replaceMentions}). Pure functions, no imports.
 */

/** A record name that is only the page or article an element sits on (F10): `page "Home"`, `article "News"`. */
export const PAGE_RECORD = /^(?:page|article) "/
/**
 * A locate level's crumb (`Home › hero.img`, `Services › title`): a record's name, `›`, a field or
 * block key. The agent's words for where a value lives; a chip never shows one (V5S-5).
 */
export const RECORD_PATH = /\s›\s/

/** How long a chip's quote of the element's own words may be (quotes not counted). */
export const CHIP_EXCERPT = 40

/** A name that is only a tag (`<div>`, as turns sent before 27/09 pm could carry) says nothing. */
export const TAG_ONLY = /^<\/?[a-z][\w-]*[^>]*>$/i

/**
 * A name that is only a storage id says nothing either: EmDash serves media at
 * `/_emdash/api/media/file/<ULID>.<ext>`, so the file name the Browser tab falls back to for an image
 * without alt text is a ULID (dev 28/09). Also a hex hash (≥ 20 digits) or a UUID; a file extension
 * and the Browser tab's closing "…" are ignored. A name a person gave (`IMG_2024…`, `hero-team`)
 * carries a separator or plain words and is kept; an id must hold a digit, so a long word never
 * passes for one.
 */
const STORAGE_ID =
  /^(?=.*\d)(?:[0-9A-HJKMNP-TV-Z]{20,26}|[0-9a-f]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/**
 * @param {string} name
 * @returns {boolean} true when every dot-separated part of the name (extension and closing "…"
 *   aside) is a storage id — EmDash 1.4.5 names a media file `<ULID>.<ULID>.png`, and the chip drew
 *   the first ULID for it on dev 29/09 (dev acceptance H-1).
 */
export function storageId(name) {
  // The Browser tab cuts a long file name to ~40 characters and closes it with "…", so the last
  // part of `<ULID>.<ULID>.png` arrives as a ULID prefix (`01M3GF56T7DE…`, dev re-check 29/09):
  // a cut last part is an id when it is the head of one.
  const cut = name.endsWith('…')
  const parts = name
    .replace(/…$/u, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .split('.')
  return (
    parts.length > 0 &&
    parts.every(
      (part, i) => STORAGE_ID.test(part) || (cut && i === parts.length - 1 && STORAGE_ID_HEAD.test(part))
    )
  )
}

/** The head of a ULID, a hex hash or a UUID: what is left of one after the Browser tab's cut. */
const STORAGE_ID_HEAD = /^(?=.*\d)(?:[0-9A-HJKMNP-TV-Z]{6,25}|[0-9a-f]{6,}|[0-9a-f]{8}-[0-9a-f-]{1,27})$/i

/**
 * The words on the chip for one parsed descriptor.
 *
 * `resolved` from a complete answer → the record's name (`Menu item "Services"`). Anything else —
 * including a `resolved` read from part of the site (`incomplete`) → a quote of the element's own
 * text (`"13 subsidiaries"`), because a name Tracy is not sure of would read as a fact; with no text
 * (an image, a section) → the name the Browser tab gave the element (its alt text or file name),
 * unless that name is only a storage id ({@link STORAGE_ID}). Never an HTML tag, never a status
 * word, never an id; possibly empty (the chip then shows its icon alone).
 * F10 (stage-6 acceptance): when the record is only the page or article the element sits on
 * (`page "Home"`) and the head carries the Browser tab's own `label` for the element (its words, else
 * its image's alt or file, else the words inside it — the fork's `plainLabel`), that label names the
 * chip: a logo reads `northgate-logo.svg`, not `page "Home"`. A label that is only a storage id is
 * not used. Heads written before the fix carry no `label`, so their chips stay as they were.
 * V5S-5 (acceptance v5): a name that is a level's crumb (`Home › hero.img`) is never shown — the
 * head's `label` names the chip when it has one, else the element's words, else nothing (an old turn's
 * image shows its icon alone).
 * @param {{ status?: string, incomplete?: boolean, name?: string, text?: string, label?: string }} element - from
 *   {@link parseCommentTurn}.
 * @param {{ many?: boolean }} [form] - `many`: the chip is one of several in a turn. Then an element
 *   with words is always quoted, even when its record is sure: a record is often the PAGE the
 *   comments share (stand e2e 28/09, WordPress: heading, paragraph and image all read `page "Home"`),
 *   and the person tells numbered chips apart by the words they pointed at (story `SentTwoToChat`).
 *   An element with no words keeps its name, or its icon alone.
 * @returns {string}
 */
export function chipLabel(element, { many = false } = {}) {
  const name = typeof element.name === 'string' ? element.name.replace(/\s+/g, ' ').trim() : ''
  const usable = name !== '' && !TAG_ONLY.test(name) && !storageId(name) && !RECORD_PATH.test(name)
  const own = typeof element.label === 'string' ? element.label.replace(/\s+/g, ' ').trim() : ''
  if (
    own !== '' &&
    (PAGE_RECORD.test(name) || RECORD_PATH.test(name)) &&
    !TAG_ONLY.test(own) &&
    !RECORD_PATH.test(own) &&
    !storageId(own.replace(/^"|"$/g, ''))
  )
    return own
  if (!many && element.status === 'resolved' && element.incomplete !== true && usable) return name
  const text = typeof element.text === 'string' ? element.text.replace(/\s+/g, ' ').trim() : ''
  if (text !== '') {
    const chars = Array.from(text)
    return `"${chars.length > CHIP_EXCERPT ? `${chars.slice(0, CHIP_EXCERPT - 1).join('')}…` : text}"`
  }
  return usable ? name : ''
}

// ── A block in a request, said in words ─────────────────────────────────────────────────────────

/** What an element block reads as when nothing in its markup names the element. */
export const UNNAMED_ELEMENT = '[element]'
/** What a page block reads as when it names no path. */
export const UNNAMED_PAGE = '[page]'

/**
 * One `tracy-element` or `tracy-page` block wherever it sits: on lines of its own (as a comment turn
 * sends it), mid-line, squeezed onto one line by a stored title, or cut off before its end (a capped
 * title) — then it runs to the end of the text. [1] the fence, [2] the head, [3] the body.
 */
const BLOCK =
  /```tracy-(element|page)\s*(<(?:mentioned-element|page)\b[^>]*>?)([\s\S]*?)(?:<\/(?:mentioned-element|page)>\s*```|```|$)/g
const ATTR = /([a-z][a-z-]*)="([^"]*)"/g
/** The element's own words in a block's body: `text: …` up to the next body key or the end. */
const TEXT = /(?:^|\s)text: ([\s\S]*?)(?=\s(?:was|inside|image|thread|value|write|marks?|answer): |$)/

/** @type {Record<string, string>} */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * `&gt;`, `&quot;`, `&#39;`, `&#x27;` … as the characters they stand for; an unknown one is kept.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/**
 * The words for one block: an element's chip words ({@link chipLabel}), a page's path (what the page
 * chip shows), else {@link UNNAMED_ELEMENT} / {@link UNNAMED_PAGE}.
 * @param {string} fence - `element` or `page`.
 * @param {string} head
 * @param {string} body
 * @returns {string}
 */
function blockWords(fence, head, body) {
  /** @type {Record<string, string>} */
  const attrs = {}
  for (const [, key, value] of head.matchAll(ATTR)) attrs[key] = decodeEntities(value)
  if (fence === 'page') return attrs.path?.trim() || UNNAMED_PAGE
  const text = TEXT.exec(body)?.[1]
  const words = chipLabel(
    {
      status: attrs.status,
      incomplete: attrs.incomplete === 'true',
      name: attrs.name,
      label: attrs.label,
      text: text === undefined ? undefined : decodeEntities(text)
    },
    { many: / n="\d+"/.test(head) }
  )
  return words.trim() === '' ? UNNAMED_ELEMENT : words
}

/**
 * `text` with every block replaced by `say(words)` — `words` being what the chip shows for it — and
 * Tracy's hint after the last block left out (the first line after it, when it names `tracy_site`;
 * on a squeezed line, the rest of it). Text without a block is returned as it is.
 * @param {string} text
 * @param {(words: string) => string} say - e.g. `(w) => w` to name each block, `() => ''` to cut it.
 * @returns {string}
 */
export function replaceMentions(text, say) {
  if (!text.includes('```tracy-element') && !text.includes('```tracy-page')) return text
  const pieces = []
  let from = 0
  for (const m of text.matchAll(BLOCK)) {
    pieces.push(text.slice(from, m.index), say(blockWords(m[1], m[2], m[3])))
    from = /** @type {number} */ (m.index) + m[0].length
  }
  if (from === 0) return text
  const tail = text.slice(from)
  const hint = /^[ \t]*\n?([^\n]*)/.exec(tail)
  pieces.push(hint && hint[1].includes('`tracy_site`') ? tail.slice(hint[0].length) : tail)
  return pieces.join('')
}
