/**
 * Links that come from DATA (a slide, a button, a Portable Text link, a card) go through the same gate as the menu
 * (TCH #1013, PAGE-4): a link to a page the customer unticked, or to a child of one, is dropped or drawn as plain text.
 * This is the pure half for rich text; `link-gate.ts` answers which URLs are live.
 */

/**
 * The scheme of a URL as a browser reads it: leading control characters and spaces are dropped and tabs and line breaks
 * inside are ignored, so ` JaVaScript:alert(1)` and `java\tscript:` are both `javascript`. Null when it has none.
 */
export function schemeOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const raw = url.replace(/[\t\n\r]/g, '')
  let start = 0
  while (start < raw.length && raw.charCodeAt(start) <= 0x20) start++
  return /^([a-z][a-z0-9+.-]*):/i.exec(raw.slice(start))?.[1].toLowerCase() ?? null
}

/** A URL that runs code or carries a document: `javascript:`, `vbscript:` and `data:`. No data link may render one. */
export function isScriptUrl(url: unknown): boolean {
  const scheme = schemeOf(url)
  return scheme === 'javascript' || scheme === 'vbscript' || scheme === 'data'
}

/** `hostname:port` with the scheme's default port dropped, so `http://x`, `https://x` and `//x:80` on http are one host. */
const hostKey = (u: URL): string => `${u.hostname}:${u.port}`

/**
 * The gate passes an external link (http(s) to another host), `tel:`, `mailto:` and an in-page `#` link unchanged and gates a
 * same-site path. This reads the URL as the path it opens on THIS site, the way a browser would resolve it: the candidate is
 * resolved against the request origin (`origins[0]`; so `//host/...` takes the page's own scheme, `/\host` is the host it
 * is, and the parser normalises case, default ports and dot segments), and it is the same site when its host is the request's
 * or one of the other `origins` (the configured public one). The scheme is not compared: a site behind a proxy is reached
 * as both `http://` and `https://`. Anything else (another host or port, another scheme, `#`) is null, which the gate
 * always passes.
 */
export function sameSitePath(url: unknown, origins: readonly string[]): string | null {
  if (typeof url !== 'string' || isScriptUrl(url)) return null
  const raw = url.trim()
  if (!/^([/\\]|https?:)/i.test(raw)) return null
  const bases = origins.flatMap((o) => {
    try {
      return [new URL(o)]
    } catch {
      return []
    }
  })
  try {
    const resolved = new URL(raw, bases[0] ?? 'http://localhost')
    if (!/^https?:$/.test(resolved.protocol)) return null
    return bases.some((b) => hostKey(b) === hostKey(resolved))
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : null
  } catch {
    return null
  }
}

/**
 * The `href` to print for a link that comes from data. Only a same-site path takes the locale prefix (`prefix`, the theme's
 * `href(locale, path)`); an external link, a protocol-relative one, `tel:`, `mailto:`, `#` and any other scheme are printed as
 * written. A script URL is not printed at all (null): the caller draws the words alone.
 */
export function dataHref(url: unknown, prefix: (path: string) => string): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null
  if (isScriptUrl(url)) return null
  const raw = url.trim()
  if (raw.startsWith('#') || raw.startsWith('//') || schemeOf(raw) !== null) return raw
  return prefix(raw)
}

type Mark = string
interface Span {
  _type?: string
  text?: string
  marks?: Mark[]
  [key: string]: unknown
}
interface Block {
  _type?: string
  children?: Span[]
  markDefs?: Array<{ _key?: string; _type?: string; href?: string }>
  [key: string]: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** The `href` of every link mark of a Portable Text value, in nested blocks too (a quote holds paragraphs). */
export function linkHrefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(linkHrefs)
  if (!isObject(value)) return []
  const own = ((value as Block).markDefs ?? []).flatMap((m) => (typeof m?.href === 'string' ? [m.href] : []))
  return [...own, ...Object.entries(value).flatMap(([k, v]) => (k === 'markDefs' ? [] : linkHrefs(v)))]
}

/**
 * The value without the links `live` refuses: the link mark leaves its spans and its definition, the words stay (nested
 * blocks too). A block that is nothing but one dead link stays as plain text (the caller decides whether it was a button).
 */
export function gateBlocks<T>(value: T, live: (url: string) => boolean): T {
  if (Array.isArray(value)) return value.map((v) => gateBlocks(v, live)) as T
  if (!isObject(value)) return value
  const block = value as Block
  const dead = new Set(
    (block.markDefs ?? []).filter((m) => typeof m?.href === 'string' && !live(m.href)).map((m) => m._key)
  )
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = k === 'markDefs' ? v : gateBlocks(v, live)
  if (dead.size === 0) return out as T
  out.markDefs = (block.markDefs ?? []).filter((m) => !dead.has(m._key))
  out.children = ((out.children as Span[] | undefined) ?? []).map((sp) => ({
    ...sp,
    marks: (sp.marks ?? []).filter((mark) => !dead.has(mark))
  }))
  return out as T
}
