/**
 * The Browser toolbar as the approved stories draw it (acceptance of stage 5, TCH
 * `tasks/evidence/comment-thread/acceptance.md`, F10 + F17; stories `ToolbarCommentsSplit*` in
 * `browser-comment.mock.stories.tsx`), quieted by option A (Akemi, 01/10/2026). Read from the stylesheet and the component source: the tests'
 * CSS modules are stubbed (dsh's Pill classes do not reach the DOM here), and a colour or an offset is
 * what these two findings are about.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/client/sidebar.module.css', 'utf8')
const layer = readFileSync('src/client/CommentLayer.tsx', 'utf8')

/** One rule's body, by its exact selector. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`)
  expect(at, `no rule ${selector}`).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at))
}
const px = (body: string, prop: string): number => {
  const m = new RegExp(`\\n\\s*${prop}: (-?\\d+)px`).exec(body)
  expect(m, `no ${prop} in px`).not.toBeNull()
  return Number(m![1])
}

describe('F10 · the zoom chip is neutral (not the brand tint); Z1: a magnifier at 100 %, the value otherwise', () => {
  it('no brand colour on the chip, the label colour on a neutral shade instead', () => {
    const chip = rule('.zoomChip')
    expect(chip).not.toMatch(/brand-primary/)
    expect(chip).toMatch(/color: var\(--dsw-alias-label-primary\)/)
    expect(rule('.zoomChip:hover')).not.toMatch(/brand-primary/)
  })

  it('the control is a plain button (not dsh\'s "active" Pill): the magnifier icon at 100 %, the chip elsewhere', () => {
    expect(layer).not.toMatch(/<Pill\b/)
    expect(layer).toMatch(/className=\{atDefault \? css\.iconButton : css\.zoomChip\}/)
    expect(layer).toMatch(/atDefault \? <LuZoomIn\b/)
  })
})

describe('option A (Akemi 01/10/2026): two filled controls, everything else ghost, 32 px high', () => {
  it('the address field and the segmented switch are filled and have no border', () => {
    expect(rule('.browserField')).toMatch(/background: var\(--tb-fill\)/)
    expect(rule('.browserField')).not.toMatch(/\n\s*border: 1px/)
    expect(rule('.modeSegments')).toMatch(/background: var\(--tb-fill/)
    expect(rule('.modeSegments')).not.toMatch(/\n\s*border: 1px/)
    expect(px(rule('.browserField'), 'height')).toBe(32)
    expect(px(rule('.modeSegments'), 'height')).toBe(32)
  })

  it('the selected segment is a raised surface with a thin border, not filled with the label colour', () => {
    const on = rule('.modeSegmentOn,\n.modeSegmentOn:hover')
    expect(on).not.toMatch(/background: var\(--dsw-alias-label-primary\)/)
    expect(on).toMatch(/box-shadow: 0 0 0 1px/)
  })

  it('Comments is a ghost button the bar\'s height; its count is grey (Lee 04/10/2026), the unread dot terracotta', () => {
    const button = rule('.commentsButton')
    expect(button).toMatch(/background: transparent/)
    expect(button).toMatch(/border: none/)
    expect(px(button, 'height')).toBe(32)
    const count = rule('.commentsCount')
    expect(count).not.toMatch(/brand-primary/)
    expect(count).toMatch(/background: var\(--dsw-alias-bg-layer-2\)/)
    expect(count).toMatch(/color: var\(--dsw-alias-label-tertiary\)/)
    expect(count).toMatch(/position: relative/)
    const dot = rule('.commentsCount[data-dot]::after')
    expect(dot).toMatch(/background: var\(--dsw-alias-brand-primary\)/)
    expect(px(dot, 'width')).toBe(7)
    expect(px(dot, 'height')).toBe(7)
  })
})

describe('F17 · the compact count badge stays inside the toolbar', () => {
  it('its offset above the button plus its 2 px ring fit in the bar\'s top padding, 1 px to spare', () => {
    const corner = rule('.commentsCountCorner')
    const ring = /box-shadow: 0 0 0 (\d+)px/.exec(corner)
    expect(ring).not.toBeNull()
    const barPadding = Number(/\n\s*padding: (\d+)px/.exec(rule('.browserBar'))![1])
    // The ghost button has no border (option A): the badge rises -top px above it, its ring more.
    expect(-px(corner, 'top') + Number(ring![1])).toBeLessThanOrEqual(barPadding - 1)
  })

  it('the unread dot on the corner badge fits in the same padding (Lee 04/10/2026: the dot is not cut)', () => {
    const corner = rule('.commentsCountCorner')
    const dot = rule('.commentsCount[data-dot]::after')
    const barPadding = Number(/\n\s*padding: (\d+)px/.exec(rule('.browserBar'))![1])
    // `top` places the dot's outer (ring) edge: the badge's rise plus the dot's.
    expect(-px(corner, 'top') - px(dot, 'top')).toBeLessThanOrEqual(barPadding - 1)
  })
})

describe('one stroke for focus, no halo (Akemi 29/09/2026; tracy.40)', () => {
  it('a focused comment field takes the composer focus colour as its border and no ring', () => {
    const focus = rule('.commentTextarea:focus')
    expect(focus).toMatch(/border-color: color-mix\(in oklab, var\(--dsw-alias-label-primary\) 50%, var\(--dsw-alias-bg-layer-1\)\)/)
    expect(focus).toMatch(/box-shadow: none/)
    expect(focus).not.toMatch(/brand-primary/)
  })
})
