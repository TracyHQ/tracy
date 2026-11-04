/**
 * Links that come from DATA (a slide, a button, a Portable Text link, a card) go through the same gate as the menu
 * (TCH #1013, PAGE-4): a link to a page the customer unticked, or to a child of one, is dropped or drawn as plain text.
 * This is the pure half for rich text; `link-gate.ts` answers which URLs are live.
 */

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
