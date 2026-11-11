// Match extracted items to content-map slots. Decides: matched | locked | hole | ignored.
import { audioSourceIdentity } from '../../../../wo/website-opportunities/domain/audio-source.mjs'
import { normText, normPath, normHref, letterCount, alnumCount, compact } from './normalize.mjs'
import { isLockedDesignAsset } from './contract.mjs'

/** A size WordPress generated from an upload: the upload's path, the size suffix, the extension. */
const WORDPRESS_SIZE = /^(wp-content\/uploads\/.+?)-(?:\d+x\d+|scaled)(\.[a-z0-9]+)$/i

const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c)

/** Where `needle` occurs in `hay` on word boundaries (short samples must not hit inside words). */
function occurrences(hay, needle) {
  const out = []
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    if (needle.length >= 12 || (!isWordChar(hay[i - 1]) && !isWordChar(hay[i + needle.length]))) out.push(i)
  }
  return out
}

/** The video id inside a YouTube / Vimeo URL, or null. */
export function videoId(href) {
  const m = String(href).match(
    /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|v\/)|youtu\.be\/|vimeo\.com\/(?:video\/)?)([A-Za-z0-9_-]{6,})/
  )
  return m ? m[1] : null
}

const MONTHS =
  '(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)'
// A module's date_format may lead with the weekday ("D, M Y" prints "Tue, Aug 2021").
const WEEKDAY = '((mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?'
const DATE = new RegExp(
  `^${WEEKDAY}(\\d{1,2}(st|nd|rd|th)?\\s+${MONTHS},?\\s+\\d{4}|${MONTHS}\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|${MONTHS}\\s+\\d{4})$`
)
// An all-numeric date a layout prints from an item's own date with a format string (JA's latest-news layout: `d.m.Y`
// -> 06.09.2021): day, month and year in either order, split by dots, slashes or dashes. It is the article's date, not
// words of the demo; a phone or a price never has this shape.
const NUMERIC_DATE = /^(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./]\d{1,2}[./]\d{1,2})$/

/** A complete rendered date, never a bare year or a yearless label. */
export const isRenderedDate = (value) => DATE.test(value) || NUMERIC_DATE.test(value)

export function createMatcher(contract, siteUrl) {
  const { text, textCompact, textList, patterns = [], image, url, rawSample } = contract.index
  // Compact forms of every slot sample, for blocks whose spans render with no space between them ("Our<span>Classes</span>").
  const compactSet = new Set([...text.keys()].map((k) => compact(k)).filter((k) => k.length >= 2))
  /** Whether a compact piece is a run of slot samples written with no space between them. */
  const joined = (c, depth = 0) =>
    c === '' ||
    (depth < 5 &&
      [...Array(c.length).keys()].some(
        (i) => compactSet.has(c.slice(0, i + 1)) && joined(c.slice(i + 1), depth + 1)
      ))
  // A url slot sample `index.php?Itemid=N` renders as the SEF route of menu item N.
  const urlIdx = new Map(url)
  const routeOf = new Map(contract.pages.map((p) => [String(p.sourceId), p.route]))
  for (const [k, keys] of url) {
    const m = k.match(/itemid=(\d+)/)
    if (m && routeOf.has(m[1])) {
      const r = routeOf.get(m[1]) === 'home' ? '/' : '/' + routeOf.get(m[1]).toLowerCase()
      urlIdx.set(r, [...(urlIdx.get(r) ?? []), ...keys])
    }
  }
  // Whole-unit slots (capture --whole-units): the xpath names an element, the sample joins its pieces with spaces, and
  // the page shows those pieces as separate blocks ("Our" <br> "Classes"). A block that is a word-bounded piece of
  // such a sample is that slot's text.
  const wholeUnits = (contract.map?.slots ?? [])
    .filter(
      (s) =>
        s.type === 'text' && typeof s.xpath === 'string' && !/(text\(\)(\[\d+\])?|@[\w-]+)$/.test(s.xpath)
    )
    .map((s) => ({ norm: normText(s.sample), key: s.key }))
    .filter((s) => s.norm)
  // Figure slots too short for the containment list (no letter, fewer than 7 figures: a price "$2,450", a year): inside a
  // composite block they are removed on word boundaries, so the words a layout writes around them ("Reserve - $2,450")
  // are what is left and classified. At least 3 digits, so a lone "1" or "24" never splits a block.
  const shortFigures = [...text.entries()]
    .filter(([n]) => letterCount(n) === 0 && alnumCount(n) < 7 && (n.match(/\d/g) ?? []).length >= 3)
    .map(([norm, keys]) => ({ norm, keys }))
    .sort((x, y) => y.norm.length - x.norm.length)
  const textCache = new Map()
  const site = new URL(siteUrl)

  /**
   * Whether a placeholder of a language pattern was filled with run-time text: a count or a figure, a slot's text, or
   * the first words of a slot's text (a layout prints an author's first name).
   */
  function filledGap(gap) {
    if (/^[\p{N}\p{P}\p{S}\s]*\p{N}[\p{N}\p{P}\p{S}\s]*$/u.test(gap)) return true
    if (text.has(gap) || textCompact.has(compact(gap))) return true
    return letterCount(gap) >= 2 && textList.some((s) => s.norm.startsWith(`${gap} `))
  }

  function matchText(value) {
    const v = normText(value)
    if (textCache.has(v)) return textCache.get(v)
    let res
    if (alnumCount(v) < 2) res = { status: 'ignored', reason: 'no words or figures' }
    else if (text.has(v)) res = { status: 'matched', by: 'exact', slots: text.get(v) }
    else if (textCompact.has(compact(v)))
      res = { status: 'matched', by: 'exact ignoring spaces/punctuation', slots: textCompact.get(compact(v)) }
    if (!res) {
      const hit = patterns.find((p) => {
        const m = v.match(p.re)
        return m && m.slice(1).every(filledGap)
      })
      if (hit) res = { status: 'matched', by: 'language pattern', slots: [hit.key] }
    }
    if (!res && /(\.\.\.|…)$/.test(v)) {
      const p = v.replace(/\s*(\.\.\.|…)$/, '')
      const hit = p.length >= 15 && textList.find((s) => s.norm.startsWith(p) || s.norm.includes(p))
      if (hit) res = { status: 'matched', by: 'truncated', slots: [hit.key] }
      if (!res && contract.platform === 'joomla' && p.length >= 15) {
        // Joomla StringHelper::truncate removes every internal space before an ellipsis too.
        const keys = [
          ...new Set(textList.filter((s) => s.norm.replaceAll(' ...', '...').startsWith(p)).map((s) => s.key))
        ]
        if (keys.length === 1) res = { status: 'matched', by: 'Joomla truncated spacing', slots: keys }
      }
    }
    if (!res && v.length >= 20 && letterCount(v) >= 12) {
      const hit = textList.find((s) => s.norm.length > v.length && s.norm.includes(v))
      if (hit) res = { status: 'matched', by: 'fragment-of-slot', slots: [hit.key] }
    }
    if (!res) {
      const hits = wholeUnits.filter((s) => s.norm.length > v.length && occurrences(s.norm, v).length)
      if (hits.length) res = { status: 'matched', by: 'piece-of-whole-unit', slots: hits.map((s) => s.key) }
    }
    if (!res) {
      // Composite block: remove every slot sample found inside it; what is left is unmatched.
      let rest = v
      const slots = []
      for (const p of [...patterns].filter((p) => p.fragment).sort((a, b) => b.length - a.length)) {
        rest = rest.replace(p.fragment, (piece) => {
          const owners = new Set(
            patterns.filter((other) => other.fragment && other.re.test(piece)).map((other) => other.key)
          )
          if (owners.size !== 1) return piece
          slots.push(p.key)
          return ' \u0000 '
        })
      }
      // A card excerpt joins a label, a title and the start of a paragraph, then cuts it ("... the component wrapper -
      // your..."): the longest cut tail that starts a slot's text is that slot.
      if (/(\.\.\.|…)$/.test(v)) {
        const tail = v.replace(/\s*(\.\.\.|…)$/, '')
        for (let i = 0; i < tail.length; i = tail.indexOf(' ', i + 1) + 1 || tail.length) {
          const cut = tail.slice(i).trim()
          if (cut.length < 15) break
          const hit = textList.find((s) => s.norm.length > cut.length && s.norm.startsWith(cut))
          if (hit) {
            slots.push(hit.key)
            rest = `${tail.slice(0, i)} \u0000 `
            break
          }
        }
      }
      for (const s of textList) {
        if (s.norm.length > rest.length) continue
        const occ = occurrences(rest, s.norm)
        if (!occ.length) continue
        slots.push(s.key)
        rest = rest.split(s.norm).join(' \u0000 ')
      }
      for (const f of shortFigures) {
        // Metadata separators and matched slots bound complete dates; an unrelated year slot cannot own them.
        rest = rest
          // oxlint-disable-next-line no-control-regex -- NUL is the internal matched-slot boundary.
          .split(/(\u0000|·)/)
          .map((piece) => {
            if (isRenderedDate(piece.trim()) || !occurrences(piece, f.norm).length) return piece
            slots.push(...f.keys)
            return piece.split(f.norm).join(' \u0000 ')
          })
          .join('')
      }
      const parts = rest
        .split('\u0000')
        .map((x) => x.trim())
        .filter((x) => letterCount(x) >= 3 || /\d[\d.,]*\d/.test(x))
        // A piece written with no space between two slot spans ("ourclasses"): split it into slot samples.
        .filter(
          (x) =>
            !(
              compact(x).length <= 60 &&
              x.split(' ').length <= 3 &&
              x.split(' ').every((w) => joined(compact(w)))
            )
        )
      if (slots.length && !parts.length) res = { status: 'matched', by: 'composite', slots }
      else if (!parts.length) res = { status: 'matched', by: 'slot spans joined without a space', slots: [] }
      // The longest unexplained piece is what gets classified; every piece is reported.
      else if (slots.length)
        res = {
          status: 'hole',
          by: 'partial',
          slots,
          remainder: parts.sort((a, b) => b.length - a.length)[0],
          remainderParts: parts
        }
      else res = { status: 'hole' }
    }
    textCache.set(v, res)
    return res
  }

  function matchImage(value) {
    const p = normPath(value, siteUrl)
    if (!p) return { status: 'ignored', reason: 'empty src' }
    if (image.has(p)) return { status: 'matched', by: 'path', slots: image.get(p), path: p }
    // WordPress prints a picture with the sizes it generated from the attachment (`cake-300x200.jpg` in srcset, a
    // `-scaled` copy of a large upload). A write to the slot moves the block's attachment id, so every size follows it.
    const size = contract.platform === 'wordpress' ? WORDPRESS_SIZE.exec(p) : null
    if (size && image.has(size[1] + size[2]))
      return { status: 'matched', by: 'wordpress image size', slots: image.get(size[1] + size[2]), path: p }
    if (isLockedDesignAsset(contract, p))
      return { status: 'locked', reason: 'design asset pinned by presentation-lock.files', path: p }
    // No basename fallback: JA demos reuse item-1.jpg in many folders, so a name match proves nothing.
    return { status: 'hole', path: p }
  }

  function matchLink(item) {
    const v = normHref(item.value, siteUrl)
    if (urlIdx.has(v)) return { status: 'matched', by: 'href', slots: urlIdx.get(v) }
    // A video embed renders from a slot that holds only the video id (YouTube/Vimeo).
    const vid = videoId(item.value)
    if (vid && rawSample.has(vid)) return { status: 'matched', by: 'video id', slots: rawSample.get(vid) }
    // mailto:/tel: whose address or number is a text slot.
    const addr = String(item.value)
      .trim()
      .replace(/^(mailto|tel|sms|callto):/i, '')
      .split('?')[0]
    if (addr !== String(item.value).trim() && rawSample.has(decodeURIComponent(addr)))
      return { status: 'matched', by: 'address slot', slots: rawSample.get(decodeURIComponent(addr)) }
    // Joomla's e-mail cloaking turns an address written in a slot's text into a mailto link.
    if (/^mailto:/i.test(String(item.value).trim()) && addr.includes('@')) {
      const a = decodeURIComponent(addr).toLowerCase()
      const hit = textList.find((s) => occurrences(s.norm, a).length)
      if (hit) return { status: 'matched', by: 'address inside a slot text', slots: [hit.key] }
    }
    let u
    try {
      u = new URL(item.value, site)
    } catch {
      return { status: 'ignored', reason: 'unparsable href' }
    }
    const internal = u.host === site.host && /^https?:$/.test(u.protocol)
    if (internal && item.role !== 'button') {
      return {
        status: 'ignored',
        reason: 'internal link generated from an entity route (menu, article, category)'
      }
    }
    if (internal && u.pathname.match(/\.(css|js)$/)) return { status: 'ignored', reason: 'asset link' }
    return { status: 'hole', href: v }
  }

  return function match(item) {
    if (item.kind === 'media') {
      const identity = audioSourceIdentity(item.value, siteUrl)
      const hits = (contract.index.audio ?? []).filter(
        (s) =>
          identity &&
          s.sourceIdentity === identity &&
          item.entity === s.entity &&
          item.track !== undefined &&
          String(item.track) === String(s.jsonPath?.[2]) &&
          s.column === 'attribs' &&
          s.jsonPath?.[0] === 'ctm_audio' &&
          s.jsonPath?.[1] === 'audio-src'
      )
      return item.mediaKind === 'audio' && hits.length === 1
        ? { status: 'matched', by: 'audio source and owner row', slots: [hits[0].key] }
        : { status: 'hole', reason: 'audio source has no unique exact owner and row binding' }
    }
    if (item.kind === 'image') return matchImage(item.value)
    if (item.kind === 'link') return matchLink(item)
    if (item.kind === 'text' && typeof item.codeText === 'string') {
      const keys = contract.index.code?.get(item.codeText)
      return keys
        ? { status: 'matched', by: 'exact literal PRE text', slots: keys }
        : { status: 'hole', reason: 'literal PRE text has no exact declared scalar' }
    }
    if (item.inCode) return { status: 'hole', reason: 'unsupported or undeclared code text' }
    const res = matchText(item.value)
    // Inline code is left out of every slot on purpose (capture skips <code>): the words around it are the slot's text.
    if (res.status === 'hole' && typeof item.outsideCode === 'string') {
      const rest = matchText(item.outsideCode)
      // Only declared prose around inline CODE counts; an all-code block stays a hole.
      if (rest.status === 'matched') return { ...rest, by: `text outside inline code (${rest.by})` }
    }
    return res
  }
}
