/**
 * The path line of a new comment's popover (Akemi's edit-mode review E2, 01/10/2026): the picked
 * element and the blocks around it, outermost first — "Section › Block › Heading". Each step is one
 * of the levels the page reported (`PreviewPickTarget.levels`, index 0 the element first picked);
 * pressing one moves the pick there (`CommentMode.widen`). Pure: names, order and what fits on one
 * line; `CommentPath.tsx` draws and measures.
 */
import type { CopyKey } from './locales.ts'
import type { PreviewPickLevel } from './preview-protocol.generated.ts'

/** What a person calls an element by its tag; anything not listed is a "Block". */
const NAMES: Record<string, CopyKey> = {
  section: 'commentPathSection',
  header: 'commentPathHeader',
  footer: 'commentPathFooter',
  nav: 'commentPathMenu',
  main: 'commentPathMain',
  article: 'commentPathArticle',
  aside: 'commentPathSidebar',
  form: 'commentPathForm',
  fieldset: 'commentPathForm',
  h1: 'commentPathHeading',
  h2: 'commentPathHeading',
  h3: 'commentPathHeading',
  h4: 'commentPathHeading',
  h5: 'commentPathHeading',
  h6: 'commentPathHeading',
  p: 'commentPathText',
  span: 'commentPathText',
  small: 'commentPathText',
  strong: 'commentPathText',
  em: 'commentPathText',
  b: 'commentPathText',
  label: 'commentPathText',
  figcaption: 'commentPathText',
  cite: 'commentPathText',
  time: 'commentPathText',
  code: 'commentPathText',
  pre: 'commentPathText',
  a: 'commentPathLink',
  button: 'commentPathButton',
  summary: 'commentPathButton',
  img: 'commentPathImage',
  picture: 'commentPathImage',
  figure: 'commentPathImage',
  canvas: 'commentPathImage',
  svg: 'commentPathIcon',
  i: 'commentPathIcon',
  ul: 'commentPathList',
  ol: 'commentPathList',
  dl: 'commentPathList',
  menu: 'commentPathList',
  li: 'commentPathListItem',
  dt: 'commentPathListItem',
  dd: 'commentPathListItem',
  table: 'commentPathTable',
  thead: 'commentPathTable',
  tbody: 'commentPathTable',
  tfoot: 'commentPathTable',
  tr: 'commentPathRow',
  td: 'commentPathCell',
  th: 'commentPathCell',
  input: 'commentPathField',
  textarea: 'commentPathField',
  select: 'commentPathField',
  video: 'commentPathVideo',
  iframe: 'commentPathEmbed',
  embed: 'commentPathEmbed',
  object: 'commentPathEmbed',
  blockquote: 'commentPathQuote',
  q: 'commentPathQuote',
}

/** @param tag - a level's tag, lower case. @returns the copy key of its plain name. */
export function levelNameKey(tag: string): CopyKey {
  return NAMES[tag.toLowerCase()] ?? 'commentPathBlock'
}

/**
 * One step of the path: which level it is, its name's key, the level's own words (a tooltip), and —
 * for an ancestor the page names (runtime 20, `PreviewPickLevel.name`) — that name, quoted and cut,
 * shown instead of the key's word.
 */
export interface PathStep {
  index: number
  key: CopyKey
  words: string
  name?: string
}

/** A page's name for a step is shown at most this long, quotes aside; the tooltip holds it whole. */
const NAME_MAX = 24

/**
 * A page's name as the line shows it: in quotes, cut at the last word that fits with "…".
 * @param name - the level's `name`, as the page reported it.
 */
export function quotedName(name: string): string {
  const flat = name.replace(/\s+/g, ' ').trim()
  if (flat.length <= NAME_MAX) return `"${flat}"`
  const room = flat.slice(0, NAME_MAX - 1)
  const space = room.lastIndexOf(' ')
  const cut = (space > NAME_MAX / 3 ? room.slice(0, space) : room).replace(/[\s.,;:!?-]+$/, '')
  return `"${cut}…"`
}

/**
 * The path, outermost first, ending with the element first picked (index 0). An ancestor reads as the
 * page names it, else as its landmark, else as its tag; the element first picked always by its tag.
 * A run of ancestors that would all read "Block" is ONE step, the outermost of the run, so pressing it
 * widens the pick as far as the run reaches — a runtime-20 page already sends one level per run, this
 * keeps a runtime-19 page from reading "Block › Block › Block".
 * @param levels - the pick's levels, innermost first, as the page reported them.
 * @returns one step per level kept; empty when the page reported none.
 */
export function pickPath(levels: readonly PreviewPickLevel[]): PathStep[] {
  const steps: PathStep[] = []
  levels.forEach((level, index) => {
    const named = index > 0 && typeof level.name === 'string' && level.name.trim() !== ''
    const key = levelNameKey(index > 0 && level.landmark ? level.landmark : level.tag)
    const step: PathStep = { index, key, words: named ? level.name!.trim() : level.text, ...(named ? { name: quotedName(level.name!) } : {}) }
    const inner = steps[steps.length - 1]
    const plain = (s: PathStep): boolean => s.key === 'commentPathBlock' && s.name === undefined
    if (index > 1 && inner !== undefined && plain(inner) && plain(step)) steps[steps.length - 1] = step
    else steps.push(step)
  })
  return steps.reverse()
}

/** What the line shows: steps, and "…" standing for the steps it leaves out on one side. */
export type PathItem =
  | { kind: 'step'; step: PathStep; current: boolean }
  | { kind: 'more'; side: 'outer' | 'inner'; hidden: PathStep[]; to: number }

/**
 * The line with `outer` steps left out before the current one and `inner` after it. A "…" stands for
 * each side left out; pressing it moves the pick ONE step that way, to the hidden step nearest the
 * current one (`to`), so the current step shows whole and a person climbs at the pace of the steps.
 * @param path - `pickPath`, outermost first.
 * @param current - the level picked now (an index into the levels).
 * @param outer - how many of the outermost steps to leave out (kept before the current step).
 * @param inner - how many of the innermost steps to leave out (kept after the current step).
 */
export function pathItems(path: readonly PathStep[], current: number, outer: number, inner: number): PathItem[] {
  const at = path.findIndex(s => s.index === current)
  if (at < 0) return path.map(step => ({ kind: 'step', step, current: false }))
  const o = Math.max(0, Math.min(outer, at))
  const i = Math.max(0, Math.min(inner, path.length - 1 - at))
  const items: PathItem[] = []
  if (o > 0) items.push({ kind: 'more', side: 'outer', hidden: path.slice(0, o), to: path[o - 1]!.index })
  for (let p = o; p < path.length - i; p += 1) items.push({ kind: 'step', step: path[p]!, current: p === at })
  if (i > 0) {
    const first = path.length - i
    items.push({ kind: 'more', side: 'inner', hidden: path.slice(first), to: path[first]!.index })
  }
  return items
}

/**
 * How many steps to leave out so the line fits its width: the outermost first, one at a time, then —
 * only when every step before the current one is out — the innermost ones. The current step is never
 * left out; when even it and two "…" do not fit, everything else is out and the line clips.
 * @param widths - each step's drawn width, outermost first (as `pickPath`).
 * @param at - the current step's place in that list.
 * @param room - the line's width.
 * @param more - one "…"'s width.
 * @param gap - one separator's width with its spacing, between any two items.
 */
export function fitPath(widths: readonly number[], at: number, room: number, more: number, gap: number): { outer: number; inner: number } {
  const n = widths.length
  const width = (outer: number, inner: number): number => {
    let total = 0
    let items = 0
    for (let p = outer; p < n - inner; p += 1) {
      total += widths[p]!
      items += 1
    }
    if (outer > 0) { total += more; items += 1 }
    if (inner > 0) { total += more; items += 1 }
    return total + Math.max(0, items - 1) * gap
  }
  for (let outer = 0; outer <= at; outer += 1) if (width(outer, 0) <= room) return { outer, inner: 0 }
  for (let inner = 1; inner <= n - 1 - at; inner += 1) if (width(at, inner) <= room) return { outer: at, inner }
  return { outer: Math.max(0, at), inner: Math.max(0, n - 1 - at) }
}
