/**
 * Measures dsh's composer card and writes `data-tc-chips="inline|stacked"` on it, so the card's
 * grid (tracy-brand `styles.ts`, "the in-session composer") can put the chips on the input line or
 * in their own row above it. The rule itself is `chipsLayout` in `composer-chips.mjs`; this file
 * only reads the DOM. Every hook is dsh's stable attribute (`data-composer-card`,
 * `data-input-scroll`) or the readable tail of a CSS-module class (`_tools`, `_trailing`).
 */
import { CHIPS_STACKED, chipsLayout, DRAFT_MIN_WIDTH, draftLayout } from './composer-chips.mjs'

export const CHIPS_ATTR = 'data-tc-chips'
export const DRAFT_ATTR = 'data-tc-draft'

let canvas: HTMLCanvasElement | null = null

/** The draft's text width at one line, in the editor's own font, padding included. */
function draftTextWidth(input: HTMLElement, scroll: HTMLElement): number {
  const style = getComputedStyle(input)
  const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const margin = parseFloat(getComputedStyle(scroll).marginRight) || 0
  // Inline chips of the draft itself (dsh's @file and /command references) are decorator nodes.
  let decorators = 0
  for (const node of input.querySelectorAll<HTMLElement>('[data-lexical-decorator]'))
    decorators += node.getBoundingClientRect().width
  const text = input.innerText.replace(/\n+$/, '')
  if (text === '') return pad + margin + decorators
  canvas ??= document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) return Number.POSITIVE_INFINITY
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return context.measureText(text).width + pad + margin + decorators
}

/** One measurement: the mode the chips should take on this card now. */
function measure(card: HTMLElement, rail: HTMLElement): 'inline' | 'stacked' {
  const style = getComputedStyle(card)
  const lineWidth = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const gap = parseFloat(style.columnGap) || 0
  const plusWidth = card.querySelector<HTMLElement>('[class*="_tools"]')?.offsetWidth ?? 0
  const sendWidth = card.querySelector<HTMLElement>('[class*="_trailing"]')?.offsetWidth ?? 0
  const chips = [...rail.children] as HTMLElement[]
  const railGap = parseFloat(getComputedStyle(rail).columnGap) || 0
  const chipsWidth =
    chips.reduce((sum, chip) => sum + chip.getBoundingClientRect().width, 0) +
    Math.max(0, chips.length - 1) * railGap
  const scroll = card.querySelector<HTMLElement>('[data-input-scroll]')
  const input = scroll?.querySelector<HTMLElement>('[contenteditable]')
  if (!scroll || !input) return CHIPS_STACKED
  const draftMin = parseFloat(style.getPropertyValue('--tc-composer-draft-min')) || DRAFT_MIN_WIDTH
  return chipsLayout({
    lineWidth,
    plusWidth,
    chipsWidth,
    sendWidth,
    gap,
    draftMin,
    draftTextWidth: draftTextWidth(input, scroll),
    draftHasBreak: input.querySelectorAll('p').length > 1 || /\n./.test(input.innerText)
  })
}

/**
 * Keep the card's chip mode current: on resize of the card or the chips, and on every draft edit.
 * @param card - dsh's composer card (`[data-composer-card]`).
 * @param rail - the chips row this plugin draws inside it.
 * @returns cleanup that also takes the attribute away.
 */
export function watchChipsLine(card: HTMLElement, rail: HTMLElement): () => void {
  let frame = 0
  const update = (): void => {
    frame = 0
    const mode = measure(card, rail)
    if (card.getAttribute(CHIPS_ATTR) !== mode) card.setAttribute(CHIPS_ATTR, mode)
  }
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(update)
  }
  const resize = new ResizeObserver(schedule)
  resize.observe(card)
  resize.observe(rail)
  const scroll = card.querySelector('[data-input-scroll]')
  if (scroll) resize.observe(scroll)
  const edits = new MutationObserver(schedule)
  if (scroll) edits.observe(scroll, { subtree: true, childList: true, characterData: true })
  edits.observe(rail, { childList: true })
  update()
  return () => {
    if (frame !== 0) cancelAnimationFrame(frame)
    resize.disconnect()
    edits.disconnect()
    card.removeAttribute(CHIPS_ATTR)
  }
}

/**
 * Keep `data-tc-draft="line|own-row"` on dsh's composer card: whether the draft fits between the
 * controls or takes its own row above them (`draftLayout`). Follows the card's and the controls'
 * size (a column dragged narrower, the role chip changing its label).
 * @param card - dsh's composer card (`[data-composer-card]`).
 * @returns cleanup that also takes the attribute away.
 */
export function watchDraftLine(card: HTMLElement): () => void {
  let frame = 0
  const scroll = card.querySelector<HTMLElement>('[data-input-scroll]')
  // A completed scroll timeline can retain its last value after the draft shrinks to no overflow.
  // Gate the visual effect on real scroll geometry, including resize callbacks before paint.
  const syncScroll = (): void => {
    scroll?.toggleAttribute(
      'data-tc-composer-scrolled',
      scroll.scrollTop > 0 && scroll.scrollHeight > scroll.clientHeight
    )
  }
  const update = (): void => {
    frame = 0
    syncScroll()
    const style = getComputedStyle(card)
    const mode = draftLayout({
      lineWidth: card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      toolsWidth: card.querySelector<HTMLElement>('[class*="_tools"]')?.offsetWidth ?? 0,
      sendWidth: card.querySelector<HTMLElement>('[class*="_trailing"]')?.offsetWidth ?? 0,
      gap: parseFloat(style.columnGap) || 0,
      draftMin: parseFloat(style.getPropertyValue('--tc-composer-draft-min')) || DRAFT_MIN_WIDTH
    })
    if (card.getAttribute(DRAFT_ATTR) !== mode) card.setAttribute(DRAFT_ATTR, mode)
  }
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(update)
  }
  const resize = new ResizeObserver(() => {
    syncScroll()
    schedule()
  })
  resize.observe(card)
  if (scroll) {
    scroll.addEventListener('scroll', syncScroll, { passive: true })
    resize.observe(scroll)
    if (scroll.firstElementChild) resize.observe(scroll.firstElementChild)
  }
  for (const part of card.querySelectorAll<HTMLElement>('[class*="_tools"], [class*="_trailing"]'))
    resize.observe(part)
  update()
  return () => {
    if (frame !== 0) cancelAnimationFrame(frame)
    resize.disconnect()
    scroll?.removeEventListener('scroll', syncScroll)
    scroll?.removeAttribute('data-tc-composer-scrolled')
    card.removeAttribute(DRAFT_ATTR)
  }
}
