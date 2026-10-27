/**
 * The popover's path line (Akemi's edit-mode review E2, 01/10/2026): names by tag, outermost first,
 * and what folds into "…" when the line is too narrow.
 */
import { describe, expect, it } from 'vitest'
import { fitPath, levelNameKey, pathItems, pickPath } from '../src/client/comment-path.ts'
import type { PreviewPickLevel } from '../src/client/preview-protocol.generated.ts'

const level = (tag: string, text = ''): PreviewPickLevel => ({ tag, mark: null, text, rect: { x: 0, y: 0, width: 10, height: 10 } })
/** h1 inside a column inside a section: innermost first, as the page reports it. */
const HERO = [level('h1', 'Ship fast'), level('div'), level('section')]

describe('levelNameKey: what a person calls an element by its tag', () => {
  it('maps the common tags and calls anything else a Block', () => {
    expect(levelNameKey('h1')).toBe('commentPathHeading')
    expect(levelNameKey('H3')).toBe('commentPathHeading')
    expect(levelNameKey('p')).toBe('commentPathText')
    expect(levelNameKey('a')).toBe('commentPathLink')
    expect(levelNameKey('button')).toBe('commentPathButton')
    expect(levelNameKey('img')).toBe('commentPathImage')
    expect(levelNameKey('li')).toBe('commentPathListItem')
    expect(levelNameKey('ul')).toBe('commentPathList')
    expect(levelNameKey('section')).toBe('commentPathSection')
    expect(levelNameKey('nav')).toBe('commentPathMenu')
    expect(levelNameKey('div')).toBe('commentPathBlock')
    expect(levelNameKey('x-widget')).toBe('commentPathBlock')
  })
})

describe('pickPath: outermost first, the first pick last', () => {
  it('reverses the levels and keeps each one\'s index and words', () => {
    expect(pickPath(HERO).map(s => [s.index, s.key, s.words])).toEqual([
      [2, 'commentPathSection', ''],
      [1, 'commentPathBlock', ''],
      [0, 'commentPathHeading', 'Ship fast'],
    ])
    expect(pickPath([])).toEqual([])
  })
})

describe('pickPath (runtime 20): the page\'s own names, landmarks, and one Block for a run of wrappers', () => {
  const at = (tag: string, extra: Partial<PreviewPickLevel> = {}): PreviewPickLevel => ({ ...level(tag), ...extra })
  const show = (levels: PreviewPickLevel[]) => pickPath(levels).map(s => [s.index, s.name ?? s.key])

  it('the kinetic hero: a named hero, main by its landmark, the leaf by its tag', () => {
    // What a runtime-20 page reports for the h1 of kineticakemi.tracy.site's home hero.
    const levels = [
      at('h1', { text: 'Ship fast. Sleep through the night.' }),
      at('div'),
      at('div', { name: 'Ship fast. Sleep through the night.' }),
      at('main', { landmark: 'main' }),
    ]
    expect(show(levels)).toEqual([
      [3, 'commentPathMain'],
      [2, '"Ship fast. Sleep…"'],
      [1, 'commentPathBlock'],
      [0, 'commentPathHeading'],
    ])
  })

  it('a landmark by role reads as its tag would; the element first picked keeps its tag\'s word', () => {
    expect(show([at('button', { name: 'Buy now', landmark: 'form' }), at('div', { landmark: 'nav' })])).toEqual([
      [1, 'commentPathMenu'],
      [0, 'commentPathButton'],
    ])
  })

  it('a name is quoted and cut at a word, short names whole', () => {
    expect(show([at('a'), at('div', { name: 'Pricing' })])[0]).toEqual([1, '"Pricing"'])
    expect(show([at('a'), at('div', { name: 'Supercalifragilisticexpialidocious' })])[0]).toEqual([1, '"Supercalifragilisticexp…"'])
  })

  it('a runtime-19 page: consecutive Blocks are one step, the outermost, so pressing it widens that far', () => {
    const levels = [at('h1', { text: 'Ship fast' }), at('div'), at('div'), at('div'), at('div'), at('div')]
    expect(show(levels)).toEqual([
      [5, 'commentPathBlock'],
      [0, 'commentPathHeading'],
    ])
    const between = [at('a'), at('div'), at('div'), at('section'), at('div'), at('div', { name: 'Hero' }), at('div')]
    expect(show(between)).toEqual([
      [6, 'commentPathBlock'],
      [5, '"Hero"'],
      [4, 'commentPathBlock'],
      [3, 'commentPathSection'],
      [2, 'commentPathBlock'],
      [0, 'commentPathLink'],
    ])
  })

  it('the leaf is never folded into a run, even a div', () => {
    expect(show([at('div'), at('div'), at('div')])).toEqual([
      [2, 'commentPathBlock'],
      [0, 'commentPathBlock'],
    ])
  })
})

describe('pathItems: steps and the "…" that stand for folded ones', () => {
  const path = pickPath([level('span'), level('a'), level('li'), level('ul'), level('nav'), level('header')])
  it('nothing folded: every step, the current one marked', () => {
    const items = pathItems(path, 2, 0, 0)
    expect(items.map(i => (i.kind === 'step' ? `${String(i.step.index)}${i.current ? '*' : ''}` : '…'))).toEqual(['5', '4', '3', '2*', '1', '0'])
  })
  it('outer steps fold into one leading "…" that steps up ONE level, to the nearest hidden one', () => {
    const items = pathItems(path, 2, 2, 0)
    expect(items[0]).toMatchObject({ kind: 'more', side: 'outer', to: 4 })
    expect(items[0]!.kind === 'more' && items[0]!.hidden.map(s => s.index)).toEqual([5, 4])
    expect(items.slice(1).map(i => i.kind === 'step' && i.step.index)).toEqual([3, 2, 1, 0])
  })
  it('inner steps fold into one trailing "…" that steps down one level', () => {
    const items = pathItems(path, 2, 3, 2)
    expect(items.map(i => (i.kind === 'step' ? i.step.index : `…${i.side}`))).toEqual(['…outer', 2, '…inner'])
    expect(items[2]).toMatchObject({ kind: 'more', side: 'inner', to: 1 })
  })
  it('the current step is never folded, whatever is asked', () => {
    const items = pathItems(path, 2, 99, 99)
    expect(items.filter(i => i.kind === 'step').map(i => i.kind === 'step' && i.current)).toEqual([true])
  })
})

describe('fitPath: fold the outermost first until the line fits', () => {
  // Widths outermost first: Header 52, Menu 40, List 32, List item 60 (current), Link 36, Text 34.
  const widths = [52, 40, 32, 60, 36, 34]
  const at = 3
  const more = 22
  const gap = 12
  const total = widths.reduce((a, b) => a + b, 0) + 5 * gap
  it('everything fits: nothing folds', () => {
    expect(fitPath(widths, at, total, more, gap)).toEqual({ outer: 0, inner: 0 })
  })
  it('a little short: the outermost step goes first, into "…"', () => {
    expect(fitPath(widths, at, total - 1, more, gap)).toEqual({ outer: 1, inner: 0 })
  })
  it('shorter: more outer steps go, one at a time, before any inner one', () => {
    // … › List item › Link › Text = 22 + 60 + 36 + 34 + 3 × 12
    expect(fitPath(widths, at, 22 + 60 + 36 + 34 + 3 * 12, more, gap)).toEqual({ outer: 3, inner: 0 })
  })
  it('narrower still: inner steps fold from the innermost, the current one stays', () => {
    // … › List item › Link › … = 22 + 60 + 36 + 22 + 3 × 12
    expect(fitPath(widths, at, 22 + 60 + 36 + 22 + 3 * 12, more, gap)).toEqual({ outer: 3, inner: 1 })
    expect(fitPath(widths, at, 10, more, gap)).toEqual({ outer: 3, inner: 2 })
  })
})
