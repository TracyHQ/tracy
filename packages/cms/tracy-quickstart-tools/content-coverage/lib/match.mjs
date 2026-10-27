// Match extracted items to content-map slots. Decides: matched | locked | hole | ignored.
import { normText, normPath, normHref, letterCount, alnumCount, compact } from './normalize.mjs'
import { isLockedDesignAsset } from './contract.mjs'

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

export function createMatcher(contract, siteUrl) {
  const { text, textCompact, textList, image, url, rawSample } = contract.index
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
  const textCache = new Map()
  const site = new URL(siteUrl)

  function matchText(value) {
    const v = normText(value)
    if (textCache.has(v)) return textCache.get(v)
    let res
    if (alnumCount(v) < 2) res = { status: 'ignored', reason: 'no words or figures' }
    else if (text.has(v)) res = { status: 'matched', by: 'exact', slots: text.get(v) }
    else if (textCompact.has(compact(v)))
      res = { status: 'matched', by: 'exact ignoring spaces/punctuation', slots: textCompact.get(compact(v)) }
    if (!res && /(\.\.\.|…)$/.test(v)) {
      const p = v.replace(/\s*(\.\.\.|…)$/, '')
      const hit = p.length >= 15 && textList.find((s) => s.norm.startsWith(p) || s.norm.includes(p))
      if (hit) res = { status: 'matched', by: 'truncated', slots: [hit.key] }
    }
    if (!res && v.length >= 20 && letterCount(v) >= 12) {
      const hit = textList.find((s) => s.norm.length > v.length && s.norm.includes(v))
      if (hit) res = { status: 'matched', by: 'fragment-of-slot', slots: [hit.key] }
    }
    if (!res) {
      // Composite block: remove every slot sample found inside it; what is left is unmatched.
      let rest = v
      const slots = []
      for (const s of textList) {
        if (s.norm.length > rest.length) continue
        const occ = occurrences(rest, s.norm)
        if (!occ.length) continue
        slots.push(s.key)
        rest = rest.split(s.norm).join(' \u0000 ')
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
    if (item.kind === 'image') return matchImage(item.value)
    if (item.kind === 'link') return matchLink(item)
    return matchText(item.value)
  }
}
