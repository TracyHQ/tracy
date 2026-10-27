/**
 * The DOM half of the swap: put the planned words into the inspiration's fixture (spec §4f).
 *
 * `fill.mjs` decided WHAT goes WHERE without a DOM; this file only finds each slot the way the
 * generator numbered it — `document.body.querySelectorAll(tag)[n]` — and rewrites the element's OWN
 * text nodes. Descendants survive: Airbnb's tab keeps its glyph and its "New" pill, a stat keeps its
 * unit span. The fixture's CSS is never touched, so the layout is the author's, to the pixel.
 */
import { type SitePreview } from './api'
import { planFill } from './fill.mjs'

/**
 * Chrome does not repaint a scaled srcDoc iframe until SOMETHING invalidates the compositor: on a
 * top-level Tracy page (the public design page, the bench) every thumbnail stayed blank for as
 * long as nothing moved, and one nudge on ANY frame painted them all — measured 07/09/2026, Vite
 * dev and production build alike. Inside dsh's page the chat's own updates did the nudging, which
 * is why it went unnoticed. So every fixture frame calls this on `load`: hide for one frame, show.
 * The sandbox stays `""` — that was never the cause.
 */
export function nudgePaint(el: HTMLElement): void {
  const nudge = (): void => {
    if (!el.isConnected) return
    // 🔒 NEVER hide while the document cannot paint. `setTimeout` still fires in a background tab
    // but `requestAnimationFrame` does not, so the `hidden` below would have nothing to undo it and
    // the frame would stay invisible — not for a frame, but until something else repainted it.
    // Measured 08/09 in a background tab: all 35 fixture frames stuck at `visibility: hidden` with
    // their `srcdoc` fully loaded, and the gallery read as empty. The nudge exists to make a frame
    // appear; it must not be able to make one disappear.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    el.style.visibility = 'hidden'
    requestAnimationFrame(() => {
      el.style.visibility = ''
    })
  }
  // Not on `load` itself — the frame's layer exists a beat later, and a scaled frame can get one
  // more layer change after that. Four cheap nudges over six seconds cover what was measured.
  for (const delay of [300, 1200, 3000, 6000]) window.setTimeout(nudge, delay)
  // A tab that was in the background missed every nudge above. Take the first one it can run.
  const onShown = (): void => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', onShown)
    nudge()
  }
  document.addEventListener('visibilitychange', onShown)
  window.setTimeout(() => document.removeEventListener('visibilitychange', onShown), 60_000)
}

export interface Slot {
  id: string
  tag: string
  n: number
  role: string
  group: string | null
  inNav: boolean
  text: string
  chars: number
  words: number
}

/**
 * Roles whose element is one sentence: a `<code>` or `<em>` inside it is part of that sentence, and
 * keeping it after the customer's words leaves a fragment behind — the kit's paragraph ended in
 * `var(--brand-*)` on every brand card (Lee, 06/09 11:20). Those roles replace the whole text.
 * Labels, buttons and nav keep their glyphs and pills: their children are chrome, not prose.
 */
const WHOLE_TEXT_ROLES = new Set(['paragraph', 'headline', 'title', 'subtitle', 'eyebrow', 'quote'])

/** Replace the element's own text with `text`: first non-blank text node takes it, the others go blank. */
function setOwnText(el: Element, text: string): void {
  let placed = false
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue
    if ((node.textContent ?? '').trim() === '') continue
    if (!placed) {
      // Keep the author's surrounding whitespace so inline glyphs stay spaced as drawn.
      const raw = node.textContent ?? ''
      const lead = raw.match(/^\s*/)?.[0] ?? ''
      const tail = raw.match(/\s*$/)?.[0] ?? ''
      node.textContent = `${lead}${text}${tail}`
      placed = true
    } else {
      node.textContent = ''
    }
  }
  if (!placed) el.prepend(el.ownerDocument.createTextNode(text))
}

/** Apply `fills` to `html` and return the document as text for `srcDoc`. */
export function applyFill(html: string, fills: { id: string; text: string; role?: string }[]): string {
  if (fills.length === 0) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const byTag = new Map<string, Element[]>()
  for (const f of fills) {
    const dot = f.id.lastIndexOf('.')
    const tag = f.id.slice(0, dot)
    const n = Number(f.id.slice(dot + 1))
    let list = byTag.get(tag)
    if (!list) {
      list = Array.from(doc.body.querySelectorAll(tag))
      byTag.set(tag, list)
    }
    const el = list[n]
    if (!el) continue
    if (f.role !== undefined && WHOLE_TEXT_ROLES.has(f.role) && el.children.length > 0)
      el.textContent = f.text
    else setOwnText(el, f.text)
  }
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

/**
 * OpenDesign's dark palette. Measured 06/09 across the vendored `system/kit.dark.html` files: the same
 * five values in every system, with only `--accent` the system's own — the brand engine derives one
 * dark canvas for all. So "Dark" here is OpenDesign's derivation, not the author's dark mode (only one
 * of 152 systems declares one), and the UI says so. The block covers both token vocabularies: the 56
 * shared tokens of `components.html` and the `--od-*` set of the kit, previews and artifacts.
 *
 * `.page` is in the block on purpose. 84 of the 152 fixtures paint their paper with a LITERAL gradient
 * on that wrapper (`linear-gradient(#fbf6ee…)` in Artistic) instead of `var(--bg)`, so the token
 * override alone leaves light type on a light page — measured 06/09, and the reason Dark was first
 * limited to the engine's pages. One rule reaches all 84; 23 fixtures never had a literal paint.
 */
export const DARK_OVERRIDES =
  ':root{color-scheme:dark;--bg:#0f1115;--surface:#171a21;--surface-warm:#141821;--fg:#f8fafc;--fg-2:#c7ccd6;' +
  '--muted:#a7adba;--meta:#a7adba;--border:#2a2f3a;--border-soft:#232833;' +
  '--od-page-bg:#0f1115;--od-surface:#171a21;--od-text:#f8fafc;--od-muted:#a7adba;--od-border:#2a2f3a}' +
  'body,.page{background:var(--bg,var(--od-page-bg))}body{color:var(--fg,var(--od-text))}'

/**
 * The inspiration's own name, wherever the author wrote it, becomes the site's: every text node and every
 * input `value` — "Bugatti Editorial issue" → "Tracy Editorial issue", the field prefilled "Bugatti" too.
 * Used on the sample products, whose shared slot map cannot know this inspiration's words.
 */
export function swapBrand(html: string, from: string, to: string): string {
  const a = from.trim()
  const b = to.trim()
  if (a === '' || b === '' || a.toLowerCase() === b.toLowerCase()) return html
  const pattern = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    // The artifact footers credit the design the page was built on; swapping the name in there
    // would have the site credit itself for its own inspiration.
    if ((node.parentElement as Element | null)?.closest('[data-tracy-credit]')) continue
    const text = node.textContent ?? ''
    if (pattern.test(text)) node.textContent = text.replace(pattern, b)
    pattern.lastIndex = 0
  }
  for (const el of Array.from(doc.querySelectorAll('input[value], input[placeholder], [title]'))) {
    for (const attr of ['value', 'placeholder', 'title']) {
      const v = el.getAttribute(attr)
      if (v !== null && pattern.test(v)) el.setAttribute(attr, v.replace(pattern, b))
      pattern.lastIndex = 0
    }
  }
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

/**
 * The reference fixture wearing ANOTHER inspiration's tokens. Measured 08/09: the 152 are one page —
 * `artistic` and `bento` differ by 70 lines of 136 and every one of them is a value in the `:root`
 * token block. So the page is not what makes them look unalike; the 56 tokens are.
 *
 * A brand the engine measured ships those same 56 tokens (`tokens.css`, 56 of 56 present, nothing
 * missing) but its own `components.html` is the engine's component kit — Buttons, Form controls,
 * Type scale — a spec sheet whose layout no token can move. Drawn that way, 83 brands come out
 * identical but for hue, which is not a fair reading of what the engine derived.
 *
 * Appending rather than splicing: a later `:root` block wins on every custom property it names, so
 * the donor's own values stay only where the brand has nothing to say. Same trick, same reason as
 * `withTheme` below.
 */
export function withTokens(html: string, tokensCss: string): string {
  if (tokensCss.trim() === '') return html
  // The donor paints `.page` with a LITERAL gradient of its own palette, not `var(--bg)` — 84 of the
  // 152 do (the same measurement that `DARK_OVERRIDES` below was written for). A brand whose site is
  // dark then gets its light type on the donor's light paper: measured 08/09 on vue.js, sqlite.org
  // and shopee.vn, whose cards came out pale on white. One rule hands the paper back to the tokens.
  const style = `<style data-tracy-tokens="brand">${tokensCss}\n.page{background:var(--bg)}</style>`
  const at = html.indexOf('</head>')
  return at < 0 ? `${style}${html}` : `${html.slice(0, at)}${style}${html.slice(at)}`
}

export type Theme = 'light' | 'dark'

/** The document in the asked theme: dark adds one override block at the end of `<head>`, after the tokens. */
export function withTheme(html: string, theme: Theme): string {
  if (theme !== 'dark') return html
  const style = `<style data-tracy-theme="dark">${DARK_OVERRIDES}</style>`
  const at = html.indexOf('</head>')
  return at < 0 ? `${style}${html}` : `${html.slice(0, at)}${style}${html.slice(at)}`
}

/**
 * The fixture wearing the customer's words for one page of the site. `copy` is an agent's rewritten
 * text by slot id when there is one; absent, the site's own words are cut to fit.
 */
export function fixtureDoc(
  html: string,
  slots: Slot[],
  site: SitePreview,
  page: SitePreview['pages'][number] | null,
  copy: Record<string, string> | null = null
): string {
  return applyFill(html, planFill(slots, { site: site.site, pages: site.pages, page, copy }))
}
