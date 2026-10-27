/**
 * Help's logic that draws nothing: reading tracy-web's event stream, turning an answer into
 * safe blocks, and naming the site on screen. Kept apart from the React half so it is tested in
 * Node without a browser.
 *
 * 🔒 AN ANSWER IS NEVER HTML. The model's text is split into paragraphs, list items, bold, code and
 * links, and each becomes a React text node or one of a few known elements. A link becomes clickable
 * only when its address is EXACTLY one the server listed in the `meta` event (`links`), which
 * tracy-web built from the asker's own seats (plus the fixed Discord invite). Any other address — one the model invented, one a
 * site name smuggled in — is drawn as its label alone, not as a link.
 */

export interface NavLink {
  href: string
  label: string
}

/** One server-sent event: `event:` and its JSON `data:`. */
export interface Frame {
  event: string
  data: unknown
}

/**
 * Split a growing SSE buffer into complete frames and the unfinished rest.
 * @param buffer - text received so far, possibly ending mid-frame.
 */
export function takeFrames(buffer: string): { frames: Frame[]; rest: string } {
  const frames: Frame[] = []
  let rest = buffer
  let end: number
  while ((end = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, end)
    rest = rest.slice(end + 2)
    let event = 'message'
    let data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    try {
      frames.push({ event, data: data === '' ? null : JSON.parse(data) })
    } catch {
      // A frame that is not JSON is not one tracy-web sends; skipping it loses nothing.
    }
  }
  return { frames, rest }
}

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

export type Block =
  | { kind: 'paragraph'; inline: Inline[] }
  /** A fenced block: text the person is meant to copy (a sample request, a report). Plain text, never markup. */
  | { kind: 'copy'; text: string }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }

// The address may come wrapped in `<…>`, CommonMark's form for a destination; measured 05/10/2026,
// DeepSeek writes `[Open site](</site.tracy.test/>)` about one link in three. The brackets are
// syntax, not part of the address, so the allowlist compares what is inside them. The model also
// pads the parentheses, `[Publish]( /site/?tab=T&site=S)`; the whitespace sits outside the capture,
// which still excludes whitespace, `<>` and parentheses.
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(\s*<?([^()\s<>]+)>?\s*\)/g

/**
 * The listed address a link means, or null. Exact first. Then the two shortenings a model makes of
 * a listed address, measured 06/10/2026: the workspace dropped from a tab link
 * (`/?tab=T&site=S` for `/S/?tab=T&site=S`) and the trailing slash dropped (`/S` for `/S/`). Each is
 * rebuilt into the full address and must then be on the list itself; nothing else is guessed.
 */
export function listedHref(href: string, allowed: ReadonlySet<string>): string | null {
  if (allowed.has(href)) return href
  const tab = /^\/\?tab=([^&]+)&site=([^&]+)$/.exec(href)
  if (tab) {
    const full = `/${tab[2]}/?tab=${tab[1]}&site=${tab[2]}`
    return allowed.has(full) ? full : null
  }
  if (/^\/[^/?#]+$/.test(href) && allowed.has(`${href}/`)) return `${href}/`
  return null
}

/**
 * One line's inline marks. A link whose address is not in `allowed` keeps its label as plain text.
 * @param allowed - the hrefs of the `meta` event's links.
 */
export function inlineOf(line: string, allowed: ReadonlySet<string>): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const m of line.matchAll(INLINE)) {
    const index = m.index ?? 0
    if (index > at) out.push({ kind: 'text', text: line.slice(at, index) })
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] })
    else if (m[3] !== undefined && m[4] !== undefined) {
      const href = listedHref(m[4], allowed)
      out.push(href ? { kind: 'link', text: m[3], href } : { kind: 'text', text: m[3] })
    }
    at = index + m[0].length
  }
  if (at < line.length) out.push({ kind: 'text', text: line.slice(at) })
  return out
}

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

/**
 * An answer as blocks: blank lines end a paragraph, `- ` and `1. ` lines make lists. Headings lose
 * their `#` and read as a bold line, which is all a chat panel needs of them.
 */
export function blocksOf(answer: string, allowed: ReadonlySet<string>): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: Inline[][] } | null = null
  const flushParagraph = () => {
    if (paragraph.length > 0)
      blocks.push({ kind: 'paragraph', inline: inlineOf(paragraph.join(' '), allowed) })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ...list })
    list = null
  }
  let fence: string[] | null = null
  for (const raw of answer.split('\n')) {
    const line = raw.trimEnd()
    if (line.trim().startsWith('```')) {
      if (fence === null) {
        flushParagraph()
        flushList()
        fence = []
      } else {
        blocks.push({ kind: 'copy', text: fence.join('\n') })
        fence = null
      }
      continue
    }
    if (fence !== null) {
      fence.push(raw)
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = numbered !== null
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push(inlineOf((bullet ?? numbered)![1], allowed))
      continue
    }
    flushList()
    if (line.trim() === '') {
      flushParagraph()
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      blocks.push({ kind: 'paragraph', inline: [{ kind: 'bold', text: heading[1] }] })
      continue
    }
    paragraph.push(line.trim())
  }
  // A fence still open is an answer still streaming: show what has arrived.
  if (fence !== null) blocks.push({ kind: 'copy', text: fence.join('\n') })
  flushParagraph()
  flushList()
  return blocks
}

/**
 * The site the page is about, read from the page's base (`/<site name>/`), or null on the creation
 * workspace (`/new/`). A hint only: tracy-web answers about it only when the asker holds a seat.
 * @param baseUri - `document.baseURI`.
 */
export function siteOfPage(baseUri: string): string | null {
  let first: string | undefined
  try {
    first = new URL(baseUri).pathname.split('/').filter(Boolean)[0]
  } catch {
    return null
  }
  if (!first) return null
  let name: string
  try {
    name = decodeURIComponent(first)
  } catch {
    return null
  }
  // A site name is a hostname and always has a dot; `new`, `ops` and the rest never do.
  return name.includes('.') ? name : null
}

/** A turn as tracy-web stores it (`GET /api/assistant/conversation`). */
export interface Turn {
  replyToId?: string
  id: string
  role: 'user' | 'assistant' | 'staff'
  text: string
  /** Seq of the session log the question was asked after (Help turns only). */
  anchorSeq?: number
  /** The answer's rating by the asker: 1 up, -1 down; absent when not rated. */
  rating?: number
  /** When the turn was stored (ISO), or null. */
  at?: string | null
  /** Files a question carried (`files.ts`). */
  files?: import('./files.ts').HelpFile[]
}

/**
 * What Help says for a refusal tracy-web answered with a status, by its code. A 429 names its
 * window: a minute's burst clears soon, the day's count does not.
 * @param window - the `window` field of a 429 body.
 */
export function errorKeyOf(status: number, code: unknown, window?: unknown): string {
  if (status === 401) return 'error.signin'
  if (status === 429 || code === 'RATE_LIMITED') return window === 'day' ? 'error.limitDay' : 'error.limit'
  if (status === 400) return 'error.tooLong'
  return 'error.unavailable'
}
