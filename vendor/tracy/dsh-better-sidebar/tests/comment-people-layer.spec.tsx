// @vitest-environment jsdom
/**
 * What the Browser tab DRAWS for people comments (Tracy, 29/09/2026; TCH stories
 * `PopoverTwoButtonsEmpty · PopoverTwoButtonsTyped · PopoverEditPending · ThreadCardSendToChat ·
 * ToolbarCommentsButton[Zero|Compact] · Refresh*` in `packages/dev/tracy-design/src/mockups/
 * browser-comment.mock.stories.tsx`). Each case renders `CommentLayer.tsx` with a hand-built controller
 * state (`comment-layer-fixture.ts`); the flow behind it is held by `comment-people-controller.spec.tsx`.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is stubbed: `Menu` draws its anchor and, open, its rows as
 * buttons.
 */
import { createElement, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h, Fragment } = await import('react')
  type Entry = { id: string; type?: 'separator'; label?: ReactNode; icon?: ReactNode; danger?: boolean }
  return {
    Pill: (p: { className?: string; 'aria-label'?: string; onClick?: () => void; children?: ReactNode }) =>
      h('button', { type: 'button', className: p.className, 'aria-label': p['aria-label'], onClick: p.onClick }, p.children),
    Menu: (p: { open: boolean; anchor: ReactNode; items?: Entry[]; onSelect?: (id: string) => void }) =>
      h(Fragment, null, p.anchor, p.open
        ? h('div', { role: 'menu' }, (p.items ?? []).map(entry => entry.type === 'separator' ? h('div', { key: entry.id, role: 'separator' }) : h('button', { key: entry.id, type: 'button', role: 'menuitem', 'data-id': entry.id, 'data-danger': entry.danger === true ? '' : undefined, onClick: () => p.onSelect?.(entry.id) }, entry.icon, entry.label)))
        : null),
    IconRefreshOutlineRegular: (p: { className?: string }) => h('svg', { className: p.className, 'data-icon': 'refresh' }),
    IconPaperclipOutlineRegular: () => h('svg', { 'data-icon': 'paperclip' }),
  }
})

import { AVATAR_PIN_SIZE, CommentOverlay, CommentsButton, EXIT_NOTE_MS, ModeBar, PIN_FAN_PX, RefreshButton, avatarPinPlacement, pinTip, pinTipPlace } from '../src/client/CommentLayer.tsx'
import { readFileSync } from 'node:fs'
const cssText = readFileSync(`${import.meta.dirname}/../src/client/sidebar.module.css`, 'utf8')
import { DISCARD_AGAIN_MS, type CommentMode } from '../src/client/comment-controller.ts'
import { THREAD_LIST_FRAME_SHARE, THREAD_LIST_MAX_PX, threadListMaxHeight } from '../src/client/comment-model.ts'
import { THREAD_RUN_GAP_MS } from '../src/client/comment-store.ts'
import { localeDicts } from '../src/client/chunks/locale.tsx'
import { en, zh } from '../src/client/locales.ts'
import css from '../src/client/sidebar.module.css'
import { LEE, MAI, comment, fixtureMode, picked } from './comment-layer-fixture.ts'
import { NEUTRAL_FACE_COLOUR } from '../src/client/face.tsx'

let root: Root | null = null
let host: HTMLDivElement

beforeEach(() => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(async () => {
  if (root !== null) await act(async () => { root!.unmount() })
  root = null
  host.remove()
  vi.restoreAllMocks()
})

async function draw(node: ReactElement): Promise<void> {
  root ??= createRoot(host)
  await act(async () => { root!.render(node) })
}

const overlay = (mode: CommentMode): ReactElement => createElement(CommentOverlay, { mode, zoom: 100 })
const q = <T extends Element = HTMLElement>(selector: string): T | null => host.querySelector<T>(selector)
const hexToRgb = (hex: string): string => `rgb(${[1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const qa = (selector: string): Element[] => Array.from(host.querySelectorAll(selector))
const buttons = (scope: Element): HTMLButtonElement[] => [...scope.querySelectorAll('button')]
const press = async (el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  await act(async () => { el.dispatchEvent(event) })
  return event
}
/** Enter while an input method (Telex, VNI, pinyin, kana) is still composing: it only ends the composition. */
const COMPOSING: KeyboardEventInit[] = [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }]

describe('the new-place popover (PopoverTwoButtonsEmpty · PopoverTwoButtonsTyped)', () => {
  it('a header "Comment" + ✕, the text box, "Note for team" (no key) and "Ask Tracy to edit ↵", both disabled while empty; no pin, no "+ Add another"', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked() })))
    const dialog = q('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Comment')
    expect(q(`.${css.commentHeadTitle!}`)!.textContent).toBe('Comment')
    expect(buttons(dialog).map(b => [b.getAttribute('aria-label') ?? b.textContent, b.disabled])).toEqual([['Close', false], ['Note for team', true], ['Ask Tracy to edit↵', true]])
    expect(buttons(dialog)[0]!.title).toBe('Close (Esc)')
    expect((dialog.querySelector('textarea') as HTMLTextAreaElement).placeholder).toBe('Describe what should change…')
    expect(dialog.textContent).not.toContain('Add another')
    expect(q('[data-comment-pin]')).toBeNull()
  })

  it('typed: both enabled; tooltips "Note for team" and "Ask Tracy to edit (Enter)"', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'Make only this menu item orange (#c8643b).' })))
    const [, add, send] = buttons(q('[role="dialog"]')!)
    expect([add!.disabled, send!.disabled]).toEqual([false, false])
    expect(add!.title).toBe('Note for team')
    expect(send!.title).toBe('Ask Tracy to edit (Enter)')
    expect(q('textarea')!.classList.contains(css.commentTextareaFilled!)).toBe(true)
  })

  it('Enter sends to Tracy (no new line); Note for team is a click only; Esc is one step of escape', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    const area = q('textarea')!
    const enter = await press(area, { key: 'Enter' })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(1)
    expect(enter.defaultPrevented).toBe(true)
    expect(mode.addComment).not.toHaveBeenCalled()
    await act(async () => { buttons(q('[role="dialog"]')!)[1]!.click() })
    expect(mode.addComment).toHaveBeenCalledTimes(1)
    await act(async () => { buttons(q('[role="dialog"]')!)[2]!.click() })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(2)
    await press(area, { key: 'Escape' })
    expect(mode.escape).toHaveBeenCalledWith('parent', expect.anything())
  })

  it('Shift+Enter is a new line: nothing sent, nothing added; ⇧⌘↵ / Alt+↵ are bound to nothing (dsh composer rule, Brian 30/09)', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    const area = q('textarea')!
    const shift = await press(area, { key: 'Enter', shiftKey: true })
    expect(shift.defaultPrevented).toBe(false)
    for (const init of [{ metaKey: true, shiftKey: true }, { ctrlKey: true, shiftKey: true }, { altKey: true }, { ctrlKey: true, metaKey: true }]) {
      const event = await press(area, { key: 'Enter', ...init })
      expect(event.defaultPrevented).toBe(true)
    }
    expect(mode.sendToTracy).not.toHaveBeenCalled()
    expect(mode.addComment).not.toHaveBeenCalled()
  })

  it('⌘↵ and Ctrl+↵ send to Tracy too, as in dsh\'s chat composer (Brian 30/09)', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    await press(q('textarea')!, { key: 'Enter', metaKey: true })
    await press(q('textarea')!, { key: 'Enter', ctrlKey: true })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(2)
    expect(mode.addComment).not.toHaveBeenCalled()
  })

  it('a held-down Enter sends once; Enter while it is sending does nothing', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    await press(q('textarea')!, { key: 'Enter' })
    for (let i = 0; i < 5; i += 1) await press(q('textarea')!, { key: 'Enter', repeat: true })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(1)
    const busy = fixtureMode({ foot: 'new', picked: picked(), text: 'Words', sending: true })
    await draw(overlay(busy))
    const event = await press(q('textarea')!, { key: 'Enter' })
    expect(event.defaultPrevented).toBe(true)
    expect(busy.sendToTracy).not.toHaveBeenCalled()
  })

  it('the Enter that closes a Vietnamese composition (right after compositionend, isComposing false) never sends and is the browser\'s, as in dsh\'s composer (round 5, INPUT-new-3)', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Chữ đỏ' })
    await draw(overlay(mode))
    const area = q('textarea')!
    await act(async () => { area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) })
    await act(async () => { area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'đỏ' })) })
    const closing = await press(area, { key: 'Enter' })
    expect(closing.defaultPrevented).toBe(false)
    expect(mode.sendToTracy).not.toHaveBeenCalled()
    // The next Enter, after the composition's tail, sends.
    await new Promise(resolve => setTimeout(resolve, 40))
    await press(area, { key: 'Enter' })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(1)
  })

  it('Enter while an input method composes (Telex, VNI, CJK) only ends the composition', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Chữ' })
    await draw(overlay(mode))
    for (const init of COMPOSING) {
      const event = await press(q('textarea')!, init)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(mode.sendToTracy).not.toHaveBeenCalled()
  })

  it('Enter in an empty (whitespace-only) box does nothing', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: '  \n ' })
    await draw(overlay(mode))
    await press(q('textarea')!, { key: 'Enter' })
    expect(mode.sendToTracy).not.toHaveBeenCalled()
    expect(mode.addComment).not.toHaveBeenCalled()
  })

  it('Enter on a focused button is that button, not Ask Tracy to edit', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    await press(buttons(q('[role="dialog"]')!)[1]!, { key: 'Enter' })
    expect(mode.sendToTracy).not.toHaveBeenCalled()
  })

  it('on Windows and Linux it reads the same: ↵, "(Enter)"', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'x' })))
    const [, add, send] = buttons(q('[role="dialog"]')!)
    expect([add!.textContent, send!.textContent]).toEqual(['Note for team', 'Ask Tracy to edit↵'])
    expect(send!.title).toBe('Ask Tracy to edit (Enter)')
  })
})

describe('the text boxes grow with their words (Brian 30/09)', () => {
  /** jsdom lays nothing out: a text box's content height is 16 px of padding plus 20 px a line. */
  const LINE = 20
  beforeEach(() => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return 16 + LINE * Math.max(1, this.value.split('\n').length)
    })
  })
  const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${String(i + 1)}`).join('\n')
  const mine = comment(1, 'Say hello')
  const root1 = comment(1, 'We have 14 subsidiaries now.', { author: MAI, can: { edit: false, delete: false } })

  for (const [name, make, field] of [
    ['the new-comment popover', (text: string) => fixtureMode({ foot: 'new', picked: picked(), text }), '[role="dialog"] textarea'],
    ['the edit popover', (text: string) => fixtureMode({ foot: 'edit', editing: mine, text, pageComments: [mine], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }]]) }), '[role="dialog"] textarea'],
    ['the thread card\'s reply box', (replyText: string) => fixtureMode({ thread: root1, threadMessages: [root1], pageComments: [root1], replyText, rects: new Map([['c1', { x: 32, y: 300, width: 200, height: 40 }]]) }), '[data-thread] textarea'],
  ] as const) {
    it(`${name}: taller with each line up to 200 px, then it scrolls inside; shorter again when words go`, async () => {
      await draw(overlay(make(lines(1))))
      const area = (): HTMLTextAreaElement => q<HTMLTextAreaElement>(field)!
      expect(area().style.height).toBe('36px')
      expect(area().style.overflowY).toBe('hidden')
      await draw(overlay(make(lines(4))))
      expect(area().style.height).toBe('96px')
      await draw(overlay(make(lines(20))))
      expect(area().style.height).toBe('200px')
      expect(area().style.overflowY).toBe('auto')
      await draw(overlay(make(lines(2))))
      expect(area().style.height).toBe('56px')
      expect(area().style.overflowY).toBe('hidden')
    })
  }

  it('the popover flips over its element when the grown box no longer fits under it, and stays inside the frame', async () => {
    // The popover's height: its chrome (100 px) plus the text box's grown height.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') !== 'dialog') return 0
      const area = this.querySelector('textarea')
      return 100 + (area === null ? 0 : Number.parseInt(area.style.height || '0', 10))
    })
    // A block too wide for a box beside it (1024 px stage: 60 px right of it, 16 px left): under or over.
    const at = (text: string): CommentMode => fixtureMode({ foot: 'new', picked: picked({ x: 40, y: 480, width: 900, height: 40 }), text })
    await draw(overlay(at(lines(1))))
    const top = (): number => Number.parseFloat(q<HTMLElement>('[role="dialog"]')!.style.top)
    expect(q('[role="dialog"]')!.getAttribute('data-side')).toBe('below')
    expect(top()).toBe(480 + 40 + 6 + 10)
    await draw(overlay(at(lines(12))))
    // 300 px tall now: under the element (768 − 536 = 232 px) it does not fit; over it, it does (a new
    // pick has no pin yet, so nothing else to keep clear of).
    expect(q('[role="dialog"]')!.getAttribute('data-side')).toBe('above')
    expect(top()).toBe(480 - 6 - 10 - 300)
    await draw(overlay(at(lines(1))))
    expect(top()).toBe(480 + 40 + 6 + 10)
  })

  it('beside a narrow block (Akemi 01/10, §3): right of it, its top at the outline\'s top, kept inside the frame as it grows', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') !== 'dialog') return 0
      const area = this.querySelector('textarea')
      return 100 + (area === null ? 0 : Number.parseInt(area.style.height || '0', 10))
    })
    const at = (text: string): CommentMode => fixtureMode({ foot: 'new', picked: picked({ x: 40, y: 480, width: 200, height: 40 }), text })
    await draw(overlay(at(lines(1))))
    const dialog = (): HTMLElement => q<HTMLElement>('[role="dialog"]')!
    expect([dialog().getAttribute('data-side'), dialog().style.left, dialog().style.top]).toEqual(['right', `${String(40 + 200 + 6 + 10)}px`, `${String(480 - 6)}px`])
    await draw(overlay(at(lines(12))))
    // 300 px tall: 474 + 300 > 768 − 8, so it rises to stay in the frame, still beside the block.
    expect([dialog().getAttribute('data-side'), dialog().style.top]).toEqual(['right', `${String(768 - 300 - 8)}px`])
  })
})

describe('the edit popover (PopoverEditPending)', () => {
  it('"Save ↵", "Ask Tracy to edit" (click only) and a small red "Delete"; Enter saves; the other bubbles are dimmed', async () => {
    const mine = comment(1, 'Say hello')
    const other = comment(2, 'Theirs', { author: MAI, can: { edit: false, delete: false } })
    const mode = fixtureMode({ foot: 'edit', editing: mine, text: 'Say hello', pageComments: [mine, other], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }], ['c2', { x: 40, y: 400, width: 300, height: 40 }]]) })
    await draw(overlay(mode))
    const dialog = q('[role="dialog"]')!
    expect(buttons(dialog).map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Close', 'Delete', 'Save↵', 'Ask Tracy to edit'])
    expect(buttons(dialog).slice(2).map(b => b.title)).toEqual(['Save (Enter)', 'Ask Tracy to edit'])
    expect(buttons(dialog)[1]!.className).toBe(css.commentDelete)
    await act(async () => { buttons(dialog)[1]!.click() })
    expect(mode.deleteComment).toHaveBeenCalledWith('c1')
    await press(q('textarea')!, { key: 'Enter' })
    expect(mode.save).toHaveBeenCalledTimes(1)
    expect(mode.sendToTracy).not.toHaveBeenCalled()
    await act(async () => { buttons(dialog)[3]!.click() })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(1)
    expect(q('[data-comment-pin="c2"]')!.classList.contains(css.commentPinDim!)).toBe(true)
    expect(q('[data-comment-pin="c1"]')!.classList.contains(css.commentPinDim!)).toBe(false)
  })
})

describe('the edit popover\'s keys', () => {
  const mine = comment(1, 'Say hello')
  const editMode = (text: string): CommentMode => fixtureMode({ foot: 'edit', editing: mine, text, pageComments: [mine], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }]]) })

  it('Shift+Enter is a new line; ⌘↵ / Ctrl+↵ save, like Enter, and send nothing; a held-down Enter saves once', async () => {
    const mode = editMode('Say hello')
    await draw(overlay(mode))
    const shift = await press(q('textarea')!, { key: 'Enter', shiftKey: true })
    expect(shift.defaultPrevented).toBe(false)
    await press(q('textarea')!, { key: 'Enter', metaKey: true })
    await press(q('textarea')!, { key: 'Enter', ctrlKey: true })
    expect(mode.save).toHaveBeenCalledTimes(2)
    await press(q('textarea')!, { key: 'Enter', repeat: true })
    expect(mode.save).toHaveBeenCalledTimes(2)
    expect(mode.sendToTracy).not.toHaveBeenCalled()
  })

  it('Enter while composing does not save; Enter on an emptied box does nothing', async () => {
    const mode = editMode('Xin chào')
    await draw(overlay(mode))
    for (const init of COMPOSING) await press(q('textarea')!, init)
    expect(mode.save).not.toHaveBeenCalled()
    const empty = editMode('   ')
    await draw(overlay(empty))
    await press(q('textarea')!, { key: 'Enter' })
    expect(empty.save).not.toHaveBeenCalled()
  })
})

describe('"Deleted · Undo" IN PLACE of the deleted message (Brian 29/09 23:05)', () => {
  const root = comment(1, 'We have 14 subsidiaries now.', { author: MAI, can: { edit: false, delete: false } })
  const mine = comment(2, 'The About page says 13 as well.', { replyTo: 'c1' })
  const card = (over: Partial<CommentMode> = {}): CommentMode => fixtureMode({ thread: root, threadMessages: [root, mine], pageComments: [root], rects: new Map([['c1', { x: 32, y: 300, width: 200, height: 40 }]]), ...over })

  it('the deleted message\'s spot reads "Deleted · Undo"; the other messages stay; Undo calls undoDelete', async () => {
    const mode = card({ deleted: { id: 'c2', left: 4 } })
    await draw(overlay(mode))
    const spots = [...q('[data-thread="c1"]')!.querySelectorAll('[data-message]')]
    expect(spots.map(m => m.textContent)).toEqual([expect.stringContaining('We have 14 subsidiaries now.'), 'Deleted·Undo'])
    const spot = spots[1]!
    expect(spot.hasAttribute('data-deleted')).toBe(true)
    expect(spot.getAttribute('role')).toBe('status')
    expect(spot.querySelector('[aria-label="More"]')).toBeNull()
    // The countdown's thin bar (Brian 23:20): it empties over the whole window.
    const bar = spot.querySelector(`.${css.commentCountdown!}`) as HTMLElement
    expect(bar.style.animationDuration).toBe('10000ms')
    await act(async () => { buttons(spot)[0]!.click() })
    expect(mode.undoDelete).toHaveBeenCalledTimes(1)
  })

  it('no floating notice anywhere else: not over the page, not in the popover', async () => {
    await draw(overlay(card({ deleted: { id: 'c2', left: 4 } })))
    expect(q('[data-comment-notice]')).toBeNull()
    expect(host.textContent!.split('Deleted').length - 1).toBe(1)
  })

  // Akemi 01/10/2026 (dev, kineticakemi): deleting a thread's only message took its pin off the page at
  // once, so the card lost its place and jumped to the frame's top corner, and it still offered a reply
  // box and "Ask Tracy to edit" for a thread that was going away.
  describe('the first message deleted with no reply under it: the whole thread is going', () => {
    const AT = { x: 600, y: 300, width: 120, height: 40 }
    const only = comment(1, 'The only message.')
    const standing = (over: Partial<CommentMode> = {}): CommentMode => fixtureMode({ thread: only, threadMessages: [only], comments: [only], pageComments: [only], rects: new Map([['c1', AT]]), ...over })
    // What the controller shows while the Delete waits: the comment off the list and its pin off the page.
    const going = (over: Partial<CommentMode> = {}): CommentMode => standing({ deleted: { id: 'c1', left: 9 }, comments: [], pageComments: [], rects: new Map(), ...over })
    const placeOf = (): { left: string; top: string } => {
      const el = q('[data-thread="c1"]')!
      return { left: el.style.left, top: el.style.top }
    }

    it('the card keeps the place it stood at while the Undo window runs', async () => {
      await draw(overlay(standing()))
      const before = placeOf()
      await draw(overlay(going()))
      expect(placeOf()).toEqual(before)
    })

    it('only "Deleted · Undo": no reply box, no Reply, no Ask Tracy to edit, no Resolve', async () => {
      await draw(overlay(standing()))
      await draw(overlay(going()))
      const card = q('[data-thread="c1"]')!
      expect(card.querySelector('[data-deleted]')).not.toBeNull()
      expect(card.querySelector('textarea')).toBeNull()
      expect(card.querySelector('[data-thread-compose]')).toBeNull()
      const labels = buttons(card).map(b => b.getAttribute('aria-label') ?? b.textContent ?? '')
      expect(labels.some(l => l.startsWith('Reply') || l.startsWith('Ask Tracy') || l === 'Resolve')).toBe(false)
      // Undo and ✕ stay.
      expect(labels.some(l => l.startsWith('Undo'))).toBe(true)
    })

    it('Undo: the reply box comes back where the card stands', async () => {
      await draw(overlay(standing()))
      const before = placeOf()
      await draw(overlay(going()))
      await draw(overlay(standing()))
      expect(placeOf()).toEqual(before)
      expect(q('[data-thread="c1"] textarea')).not.toBeNull()
    })

    it('a first message with a reply under it stays a thread (a tombstone): its reply box stays', async () => {
      const reply = comment(2, 'A reply.', { replyTo: 'c1', author: MAI })
      const tombstone = { ...only, removed: true as const }
      await draw(overlay(standing({ threadMessages: [only, reply], comments: [tombstone, reply], deleted: { id: 'c1', left: 9 } })))
      expect(q('[data-thread="c1"] textarea')).not.toBeNull()
    })

    it('a reply deleted: the reply box stays', async () => {
      const mine = comment(2, 'Mine.', { replyTo: 'c1' })
      await draw(overlay(standing({ threadMessages: [only, mine], comments: [only], deleted: { id: 'c2', left: 9 } })))
      expect(q('[data-thread="c1"] textarea')).not.toBeNull()
    })
  })

  it('no Delete waiting: every message as it is', async () => {
    await draw(overlay(card()))
    expect(q('[data-deleted]')).toBeNull()
  })

  it('reads "Đã xoá · Hoàn tác" in Vietnamese, and every dictionary has its own words', () => {
    const dicts = { zh, ...localeDicts } as Record<string, Record<string, string>>
    expect(dicts.vi!.commentDeleted).toBe('Đã xoá')
    expect(dicts.vi!.commentUndo).toBe('Hoàn tác')
    for (const [lang, dict] of Object.entries(dicts)) for (const k of ['commentDeleted', 'commentUndo']) {
      expect(dict[k], `${lang}.${k}`).toBeTruthy()
      expect(dict[k], `${lang}.${k}`).not.toBe((en as Record<string, string>)[k])
    }
  })
})

describe('pins are the author\'s bubble: no number, no status (rule 4)', () => {
  it('the initial in a 26 px bubble in the block\'s left gutter, pointing right at it (P1); a click opens the thread card', async () => {
    const c = comment(7, 'Hello', { author: MAI })
    const mode = fixtureMode({ pageComments: [c], rects: new Map([['c7', { x: 40, y: 200, width: 300, height: 40 }]]) })
    await draw(overlay(mode))
    const pin = q('[data-comment-pin="c7"]')!
    expect(pin.querySelector('[data-pin-initial]')!.textContent).toBe('M')
    expect(pin.textContent).not.toContain('7')
    expect(pin.getAttribute('aria-label')).toBe('Comment by Mai')
    // Outline at 34: the pin's right edge 6 px left of it (34 − 6 − 26 = 2), its top level with the outline's (194).
    expect([pin.style.left, pin.style.top, pin.getAttribute('data-spot')]).toEqual(['2px', '194px', 'gutter'])
    // The author's colour, as the server gave it (`author.color`).
    expect(pin.style.background).toBe(hexToRgb(MAI.color!))
    expect(pin.hasAttribute('data-status')).toBe(false)
    await act(async () => { (pin as HTMLButtonElement).click() })
    expect(mode.openThread).toHaveBeenCalledWith('c7')
  })

  it('F9 (stage-6 acceptance): a comment whose block is scrolled out of view has no pin — never one stuck to the frame\'s top edge', async () => {
    const above = comment(1, 'Above', { author: MAI })
    const below = comment(2, 'Below')
    const shown = comment(3, 'Shown')
    // jsdom measures nothing: the layer places against its nominal 1024 × 768 stage.
    const rects = new Map([['c1', { x: 40, y: -120, width: 300, height: 40 }], ['c2', { x: 40, y: 900, width: 300, height: 40 }], ['c3', { x: 40, y: 200, width: 300, height: 40 }]])
    await draw(overlay(fixtureMode({ pageComments: [above, below, shown], rects })))
    expect([...host.querySelectorAll('[data-comment-pin]')].map(p => p.getAttribute('data-comment-pin'))).toEqual(['c3'])
  })

  it('round 5 (acceptance v3 B04, B13, PICK-new-4): a block the page says is clipped or covered has no pin — not over a nested box, the admin bar or an open menu', async () => {
    const clipped = comment(1, 'Nested row')
    const covered = comment(2, 'Under the admin bar')
    const shown = comment(3, 'Shown')
    const rects = new Map([
      ['c1', { x: 40, y: 300, width: 300, height: 40, hidden: 'clipped' as const }],
      ['c2', { x: 40, y: 20, width: 300, height: 40, hidden: 'covered' as const }],
      ['c3', { x: 40, y: 200, width: 300, height: 40 }],
    ])
    await draw(overlay(fixtureMode({ pageComments: [clipped, covered, shown], rects })))
    expect([...host.querySelectorAll('[data-comment-pin]')].map(p => p.getAttribute('data-comment-pin'))).toEqual(['c3'])
  })

  it('stays inside the frame', () => {
    expect(avatarPinPlacement({ x: -10, y: -4, width: 50, height: 10 }, 400)).toEqual({ left: 0, top: 0, spot: 'inside' })
    expect(avatarPinPlacement({ x: 500, y: 100, width: 50, height: 10 }, 400)).toEqual({ left: 374, top: 94, spot: 'gutter' })
  })

  it('two people of one name wear the colours the server gave them — the page moves neither (TCH team-badge-count contract §1)', async () => {
    const SAM_1 = { accountId: 'acc-sam-1', email: 'sam.one@example.com', name: 'Sam Tester', initial: 'S', color: '#db2777', avatarUrl: null }
    const SAM_2 = { accountId: 'acc-sam-2', email: 'sam.two@example.com', name: 'Sam Tester', initial: 'S', color: '#c026d3', avatarUrl: null }
    // The server may give two namesakes one colour (8 colours, keyed by account): drawn as given.
    const SAM_3 = { ...SAM_2, accountId: 'acc-sam-3', email: 'sam.three@example.com', color: '#db2777' }
    const cs = [comment(1, 'One', { author: SAM_1 }), comment(2, 'Two', { author: SAM_2 }), comment(3, 'Three', { author: SAM_3 })]
    const rects = new Map(cs.map((c, i) => [c.id, { x: 40, y: 100 + 100 * i, width: 300, height: 40 }]))
    await draw(overlay(fixtureMode({ comments: cs, pageComments: cs, rects })))
    const pin = (id: string): HTMLElement => q(`[data-comment-pin="${id}"]`)!
    expect(['c1', 'c2', 'c3'].map(id => [pin(id).querySelector('[data-pin-initial]')!.textContent, pin(id).style.background])).toEqual([
      ['S', hexToRgb('#db2777')],
      ['S', hexToRgb('#c026d3')],
      ['S', hexToRgb('#db2777')],
    ])
  })

  it('a comment the server has not answered for wears the viewer\'s face, then its author\'s once the POST answers; neither known: grey, no letter', async () => {
    const at = new Map([['c9', { x: 40, y: 200, width: 300, height: 40 }]])
    const { author: _typed, ...pending } = comment(9, 'Just typed')
    const viewerFace = { initial: 'L', color: '#4f46e5', avatarUrl: null }
    // Before `/auth/me` answered: a neutral bubble with no letter.
    await draw(overlay(fixtureMode({ pageComments: [pending], rects: at, viewerFace: null })))
    expect(q('[data-comment-pin="c9"] [data-pin-initial]')!.textContent).toBe('')
    expect((q('[data-comment-pin="c9"]') as HTMLElement).getAttribute('style')).toContain(`background: ${NEUTRAL_FACE_COLOUR}`)
    // The viewer's face known: the comment the viewer is sending wears it.
    await draw(overlay(fixtureMode({ pageComments: [pending], rects: at, viewerFace })))
    expect(q('[data-comment-pin="c9"] [data-pin-initial]')!.textContent).toBe('L')
    expect((q('[data-comment-pin="c9"]') as HTMLElement).style.background).toBe(hexToRgb('#4f46e5'))
    // The POST answered with the server's author: its face, not the viewer's.
    const saved = { ...pending, author: MAI }
    await draw(overlay(fixtureMode({ pageComments: [saved], rects: at, viewerFace })))
    expect(q('[data-comment-pin="c9"] [data-pin-initial]')!.textContent).toBe('M')
    expect((q('[data-comment-pin="c9"]') as HTMLElement).style.background).toBe(hexToRgb(MAI.color!))
  })

  it('a resolved comment shown for its open card is the author\'s bubble, faded', async () => {
    const done = comment(3, 'Done one', { author: MAI, status: 'resolved', resolvedAt: 5, resolvedBy: LEE })
    const open = comment(4, 'Still open')
    await draw(overlay(fixtureMode({ thread: done, threadMessages: [done], pageComments: [done, open], rects: new Map([['c3', { x: 40, y: 200, width: 300, height: 40 }], ['c4', { x: 40, y: 400, width: 300, height: 40 }]]) })))
    const pin = q('[data-comment-pin="c3"]')!
    expect(pin.querySelector('[data-pin-initial]')!.textContent).toBe('M')
    expect(pin.classList.contains(css.commentPinDim!)).toBe(true)
    expect(q('[data-comment-pin="c4"]')!.classList.contains(css.commentPinDim!)).toBe(false)
  })

  it('an author with a photo: the pin and the thread card draw the photo; a photo that fails gives way to the letter (TCH Face contract)', async () => {
    const withPhoto = { ...MAI, avatarUrl: 'https://example.com/mai.png' }
    const c = comment(7, 'Hello', { author: withPhoto })
    await draw(overlay(fixtureMode({ thread: c, threadMessages: [c], pageComments: [c], rects: new Map([['c7', { x: 40, y: 200, width: 300, height: 40 }]]) })))
    const pinFace = q('[data-comment-pin="c7"] [data-pin-initial]')!
    expect(pinFace.querySelector('img')!.getAttribute('src')).toBe('https://example.com/mai.png')
    const cardFace = q('[data-thread="c7"] [data-message] [data-avatar]')!
    expect(cardFace.querySelector('img')!.getAttribute('src')).toBe('https://example.com/mai.png')
    await act(async () => { pinFace.querySelector('img')!.dispatchEvent(new Event('error')) })
    expect(pinFace.querySelector('img')).toBeNull()
    expect(pinFace.textContent).toBe('M')
  })

  it('a grey pin (its block lost) wears the grey with the letter, never the author\'s photo', async () => {
    const c = comment(7, 'Hello', { author: { ...MAI, avatarUrl: 'https://example.com/mai.png' } })
    await draw(overlay(fixtureMode({ comments: [c], pageComments: [c], ghosts: new Map([['c7', { reason: 'missing' as const, rect: null }]]) })))
    const pin = q('[data-comment-pin="c7"]')!
    expect(pin.getAttribute('data-ghost')).toBe('missing')
    expect(pin.querySelector('img')).toBeNull()
    expect(pin.querySelector('[data-pin-initial]')!.textContent).toBe('M')
  })

  it('in Interactive no pin is drawn', async () => {
    const c = comment(1, 'Hello')
    await draw(overlay(fixtureMode({ modes: { visible: true, edit: false, unavailable: false, selectEdit: vi.fn(), selectInteractive: vi.fn(), reload: vi.fn() }, pageComments: [c], rects: new Map([['c1', { x: 1, y: 1, width: 1, height: 1 }]]) })))
    expect(q('[data-comment-pin]')).toBeNull()
  })
})

describe('the thread card (ThreadCardSendToChat · CommentsTabRowOpensCard)', () => {
  const root1 = comment(1, 'We have 14 subsidiaries now.', { author: MAI, can: { edit: false, delete: false }, createdAt: Date.now() - 20 * 60_000 })
  const reply1 = comment(2, 'The About page says 13 as well.', { replyTo: 'c1', createdAt: Date.now() - 6 * 60_000 })
  const threadMode = (over: Partial<CommentMode> = {}): CommentMode => fixtureMode({ thread: root1, threadMessages: [root1, reply1], pageComments: [root1], rects: new Map([['c1', { x: 32, y: 300, width: 200, height: 40 }]]), ...over })

  it('three layers (Akemi 01/10): a head "On <element>" with Resolve ✓ and ✕; each message with its bubble, name, age and ⋮; under "Reply…" only "Reply" (no key) and "Ask Tracy to edit ↵"', async () => {
    const mode = threadMode()
    await draw(overlay(mode))
    const card = q('[data-thread="c1"]')!
    // Layer 1: the head, first in the card — the Comments tab chip's words for the element.
    const head = card.querySelector('[data-thread-head]')!
    expect(card.firstElementChild).toBe(head)
    expect(head.querySelector('[data-thread-on]')!.textContent).toBe('On "element 1"')
    expect(head.querySelector('[data-thread-on]')!.getAttribute('title')).toBe('On "element 1"')
    expect(head.querySelector('[data-resolved-pill]')).toBeNull()
    expect(head.querySelector('[data-reopen]')).toBeNull()
    expect(buttons(head).map(b => [b.getAttribute('aria-label'), b.title])).toEqual([['Resolve', 'Resolve'], ['Close', 'Close (Esc)']])
    // Layer 2: each message with the author's bubble (initial, the pin's colour), name, age, then the words.
    expect([...card.querySelectorAll('[data-message]')].map(m => m.textContent)).toEqual(['MMai20 min agoWe have 14 subsidiaries now.', 'LLee6 min agoThe About page says 13 as well.'])
    const bubbles = [...card.querySelectorAll<HTMLElement>('[data-message] [data-avatar]')]
    expect(bubbles.map(b => b.textContent)).toEqual(['M', 'L'])
    expect(bubbles.map(b => b.style.background)).toEqual([MAI, LEE].map(a => hexToRgb(a.color!)))
    expect(buttons(card).map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Resolve', 'Close', 'More', 'More', 'Reply', 'Ask Tracy to edit↵'])
    // Resolve moved out of the messages and the foot into the head.
    const resolve = head.querySelector<HTMLButtonElement>('[data-resolve]')!
    expect(card.querySelector(`.${css.threadMessageHead!} [data-resolve]`)).toBeNull()
    // Layer 3: the composer under the messages; its foot holds only the two sends.
    const compose = card.querySelector('[data-thread-compose]')!
    expect(compose.contains(card.querySelector('textarea'))).toBe(true)
    expect(card.querySelector(`.${css.commentFoot!}`)!.textContent).toBe('ReplyAsk Tracy to edit↵')
    expect(card.querySelector(`.${css.commentFoot!}`)!.closest('[data-thread-compose]')).toBe(compose)
    await act(async () => { resolve.click() })
    expect(mode.resolve).toHaveBeenCalledWith(['c1'])
    expect(buttons(card).slice(4).map(b => b.disabled)).toEqual([true, true])
    expect((card.querySelector('textarea') as HTMLTextAreaElement).placeholder).toBe('Reply…')
    expect(buttons(card).slice(4).map(b => b.title)).toEqual(['Reply', 'Ask Tracy to edit (Enter)'])
  })

  it('✕ in the head closes the card as Esc does (words typed are kept by the same rule)', async () => {
    const mode = threadMode()
    await draw(overlay(mode))
    await act(async () => { q<HTMLButtonElement>('[data-thread] [data-thread-close]')!.click() })
    expect(mode.escape).toHaveBeenCalledWith('parent')
  })

  it('a whole-page comment\'s head says "On the whole page"; a long element quote is cut at 40 and ellipsized by CSS', async () => {
    const page = { ...root1, element: null }
    await draw(overlay(threadMode({ thread: page, threadMessages: [page], rects: new Map() })))
    expect(q('[data-thread] [data-thread-on]')!.textContent).toBe('On the whole page')
    const long = { ...root1, element: { ...root1.element!, text: 'A very long heading that goes on and on past forty characters' } }
    await draw(overlay(threadMode({ thread: long, threadMessages: [long] })))
    expect(q('[data-thread] [data-thread-on]')!.textContent).toBe('On "A very long heading that goes on and on…"')
    expect(cssText).toMatch(/\.threadOn \{[^}]*text-overflow: ellipsis/)
  })

  it('the ⋮ of a message shows on hover or focus only (always on touch, and while its menu is open)', () => {
    expect(cssText).toMatch(/\.threadMoreSlot \{[^}]*opacity: 0/)
    expect(cssText).toMatch(/\.threadMessage:hover \.threadMoreSlot,\s*\.threadMessage:focus-within \.threadMoreSlot,\s*\.threadMoreSlot:has\(\[aria-expanded='true'\]\),\s*\.threadMoreSlot:has\(\.copyLinkTip\) \{\s*opacity: 1;/)
    expect(cssText).toMatch(/@media \(hover: none\) \{\s*\.threadMoreSlot \{\s*opacity: 1;/)
  })

  it('⋮ on another person\'s message offers Copy link only; on one\'s own Edit, Copy link, a divider, Delete last (review §8)', async () => {
    const mode = threadMode()
    await draw(overlay(mode))
    const [theirs, mine] = [...q('[data-thread="c1"]')!.querySelectorAll('[data-message]')]
    await act(async () => { (theirs!.querySelector('button[aria-label="More"]') as HTMLButtonElement).click() })
    expect(buttons(theirs!.querySelector('[role="menu"]')!).map(b => b.textContent)).toEqual(['Copy link'])
    await act(async () => { (mine!.querySelector('button[aria-label="More"]') as HTMLButtonElement).click() })
    const menu = mine!.querySelector('[role="menu"]')!
    expect([...menu.children].map(c => c.getAttribute('role') === 'separator' ? '—' : c.textContent)).toEqual(['Edit', 'Copy link', '—', 'Delete'])
    expect(theirs!.querySelector('[role="menu"] [role="separator"]')).toBeNull()
    await act(async () => { (menu.querySelector('[data-id="edit"]') as HTMLButtonElement).click() })
    expect(mode.editMessage).toHaveBeenCalledWith('c2')
  })

  it('F14 (stage-6 acceptance): ⋮ Copy link says "Link copied" in the toolbar copy button\'s bubble for 1.5 s; a refused copy says so', async () => {
    vi.useFakeTimers()
    const mode = threadMode()
    await draw(overlay(mode))
    const theirs = q('[data-thread="c1"]')!.querySelector('[data-message]')!
    await act(async () => { (theirs.querySelector('button[aria-label="More"]') as HTMLButtonElement).click() })
    await act(async () => { (theirs.querySelector('[data-id="link"]') as HTMLButtonElement).click() })
    await act(async () => { await Promise.resolve() })
    expect(mode.copyLink).toHaveBeenCalledWith('c1')
    const tip = theirs.querySelector('[role="status"]')!
    expect(tip.textContent).toBe('Link copied')
    expect(tip.className).toBe(css.copyLinkTip)
    await act(async () => { vi.advanceTimersByTime(1_500) })
    expect(theirs.querySelector('[role="status"]')).toBeNull()
    vi.mocked(mode.copyLink).mockResolvedValueOnce(false)
    await act(async () => { (theirs.querySelector('button[aria-label="More"]') as HTMLButtonElement).click() })
    await act(async () => { (theirs.querySelector('[data-id="link"]') as HTMLButtonElement).click() })
    await act(async () => { await Promise.resolve() })
    expect(theirs.querySelector('[role="status"]')!.textContent).toBe('Could not copy the link')
    vi.useRealTimers()
  })

  it('F15 (stage-6 acceptance): the ages in an open card move on by themselves (every 30 s)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_790_000_000_000)
    const fresh = comment(5, 'Just said', { createdAt: Date.now() - 10_000 })
    await draw(overlay(threadMode({ thread: fresh, threadMessages: [fresh], rects: new Map([['c5', { x: 32, y: 300, width: 200, height: 40 }]]) })))
    const age = (): string => q('[data-thread="c5"] [data-message]')!.textContent!
    expect(age()).toBe('LLeejust nowJust said')
    await act(async () => { vi.advanceTimersByTime(90_000) })
    expect(age()).toBe('LLee1 min agoJust said')
    vi.useRealTimers()
  })

  it('Enter (and ⌘↵ / Ctrl+↵) sends the thread to Tracy; Reply is a click only; Shift+Enter is a new line', async () => {
    const mode = threadMode({ replyText: 'Update it on both pages, please.' })
    await draw(overlay(mode))
    const area = q('[data-thread] textarea')!
    const shift = await press(area, { key: 'Enter', shiftKey: true })
    expect(shift.defaultPrevented).toBe(false)
    expect(mode.sendThread).not.toHaveBeenCalled()
    expect(mode.reply).not.toHaveBeenCalled()
    const enter = await press(area, { key: 'Enter' })
    expect(enter.defaultPrevented).toBe(true)
    expect(mode.sendThread).toHaveBeenCalledTimes(1)
    await press(area, { key: 'Enter', metaKey: true })
    await press(area, { key: 'Enter', ctrlKey: true })
    expect(mode.sendThread).toHaveBeenCalledTimes(3)
    expect(mode.reply).not.toHaveBeenCalled()
    await act(async () => { buttons(q('[data-thread="c1"]')!).find(b => b.textContent === 'Reply')!.click() })
    expect(mode.reply).toHaveBeenCalledTimes(1)
  })

  it('Enter while composing, or in an empty reply box, sends nothing', async () => {
    const mode = threadMode({ replyText: 'Cập nhật' })
    await draw(overlay(mode))
    for (const init of COMPOSING) await press(q('[data-thread] textarea')!, init)
    expect(mode.sendThread).not.toHaveBeenCalled()
    const empty = threadMode({ replyText: ' ' })
    await draw(overlay(empty))
    await press(q('[data-thread] textarea')!, { key: 'Enter' })
    expect(empty.sendThread).not.toHaveBeenCalled()
  })

  it('⋮ Delete on one\'s own message: red, with the trash icon (the same as Delete all in the Comments tab)', async () => {
    const mode = threadMode()
    await draw(overlay(mode))
    const mine = [...q('[data-thread="c1"]')!.querySelectorAll('[data-message]')][1]!
    await act(async () => { (mine.querySelector('button[aria-label="More"]') as HTMLButtonElement).click() })
    const del = mine.querySelector('[data-id="delete"]') as HTMLButtonElement
    expect(del.textContent).toBe('Delete')
    expect(del.hasAttribute('data-danger')).toBe(true)
    expect(del.querySelector('[data-icon="trash"]')).not.toBeNull()
    await act(async () => { del.click() })
    expect(mode.deleteComment).toHaveBeenCalledWith('c2')
  })

  it('Esc or a click outside closes it; a click inside does not', async () => {
    const mode = threadMode()
    await draw(overlay(mode))
    await act(async () => { q('[data-thread] textarea')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
    expect(mode.closeThread).not.toHaveBeenCalled()
    await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
    expect(mode.closeThread).toHaveBeenCalledTimes(1)
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(mode.escape).toHaveBeenCalledWith('parent', expect.anything())
  })

  it('a resolved thread: a green "Resolved" pill ("Resolved by <name>" as its tooltip) and Reopen in the head, "A reply reopens it." under the messages, no Resolve', async () => {
    const done = { ...root1, status: 'resolved' as const, resolvedAt: 5, resolvedBy: LEE }
    const mode = threadMode({ thread: done, threadMessages: [done] })
    await draw(overlay(mode))
    const card = q('[data-thread="c1"]')!
    const head = card.querySelector('[data-thread-head]')!
    const pill = head.querySelector('[data-resolved-pill]')!
    expect(pill.textContent).toBe('Resolved')
    expect(pill.getAttribute('title')).toBe('Resolved by Lee')
    expect(buttons(head).map(b => [b.getAttribute('aria-label'), b.title])).toEqual([['Reopen', 'Reopen'], ['Close', 'Close (Esc)']])
    expect(card.querySelector('[data-resolve]')).toBeNull()
    expect(card.querySelector('[data-reopen-note]')!.textContent).toBe('A reply reopens it.')
    expect(card.textContent).not.toContain('Resolved by')
    await act(async () => { head.querySelector<HTMLButtonElement>('[data-reopen]')!.click() })
    expect(mode.reopen).toHaveBeenCalledWith('c1')
  })
  it('a thread Tracy resolved (ADR 0025): the pill\'s tooltip reads "Tracy marked this done", as the Comments list tags it', async () => {
    const TRACY = { accountId: '', email: '', name: 'Tracy', initial: 'T' }
    const done = { ...root1, status: 'resolved' as const, resolvedAt: 5, resolvedBy: TRACY, resolvedByTracy: true as const }
    const mode = threadMode({ thread: done, threadMessages: [done] })
    await draw(overlay(mode))
    const pill = q('[data-thread="c1"] [data-resolved-pill]')!
    expect(pill.textContent).toBe('Resolved')
    expect(pill.getAttribute('title')).toBe('Tracy marked this done')
  })
})

describe('F13 (stage-6 acceptance): the Edit hint fits a 320 px frame', () => {
  function frameOf(width: number): void {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? width : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 700 : 0 })
  }

  it('wide: the whole sentence on one line; compact: the short one, allowed to wrap, never cut', async () => {
    frameOf(1024)
    await draw(overlay(fixtureMode()))
    expect(q(`.${css.commentHint!}`)!.textContent).toBe('Click any block to leave a note or ask Tracy to edit· Esc to stop')
    await act(async () => { root!.unmount() })
    root = null
    frameOf(320)
    await draw(overlay(fixtureMode()))
    const hint = q(`.${css.commentHint!}`)!
    expect(hint.textContent).toBe('Click any block to leave a note or ask Tracy to edit')
    expect(hint.classList.contains(css.commentHintCompact!)).toBe(true)
  })
})

describe('the note an Esc leaves when it takes the tab out of Edit (Akemi 01/10/2026)', () => {
  const modes = (edit: boolean, leftByEsc: number): CommentMode['modes'] =>
    ({ visible: true, edit, unavailable: false, selectEdit: vi.fn(), selectInteractive: vi.fn(), reload: vi.fn(), leftByEsc })

  it('says "Interactive: click links normally" at the hint\'s spot, politely, then goes after EXIT_NOTE_MS', async () => {
    vi.useFakeTimers()
    try {
      await draw(overlay(fixtureMode({ modes: modes(true, 0) })))
      expect(q('[data-comment-exit-note]')).toBeNull()
      await draw(overlay(fixtureMode({ modes: modes(false, 1) })))
      const note = q('[data-comment-exit-note]')!
      expect(note.textContent).toBe('Interactive: click links normally')
      expect(note.getAttribute('role')).toBe('status')
      expect(note.getAttribute('aria-live')).toBe('polite')
      expect(note.classList.contains(css.commentHint!)).toBe(true)
      expect(note.classList.contains(css.commentHintLeaving!)).toBe(true)
      expect(q(`.${css.commentHint!}:not([data-comment-exit-note])`)).toBeNull()
      await act(async () => { vi.advanceTimersByTime(EXIT_NOTE_MS - 1) })
      expect(q('[data-comment-exit-note]')).not.toBeNull()
      await act(async () => { vi.advanceTimersByTime(1) })
      expect(q('[data-comment-exit-note]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('nothing when Interactive came without an Esc that left Edit (an Esc that only closed a card does not count)', async () => {
    await draw(overlay(fixtureMode({ modes: modes(false, 0) })))
    expect(q('[data-comment-exit-note]')).toBeNull()
    // Esc closed the card: still in Edit, the count did not move, the hint is back and no note.
    await draw(overlay(fixtureMode({ modes: modes(true, 0) })))
    expect(q('[data-comment-exit-note]')).toBeNull()
    expect(q(`.${css.commentHint!}`)!.textContent).toContain('Click any block')
  })

  it('back in Edit before it runs out: the note goes at once and the hint takes the spot', async () => {
    await draw(overlay(fixtureMode({ modes: modes(false, 1) })))
    expect(q('[data-comment-exit-note]')).not.toBeNull()
    await draw(overlay(fixtureMode({ modes: modes(true, 1) })))
    expect(q('[data-comment-exit-note]')).toBeNull()
    expect(qa(`.${css.commentHint!}`)).toHaveLength(1)
  })

  it('fades only with motion allowed: reduced motion drops the animation', () => {
    expect(cssText).toMatch(/\.commentHintLeaving \{[^}]*animation: tracy-comment-hint-leave 2s/)
    expect(cssText).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.commentHintLeaving \{\s*animation: none;/)
    expect(EXIT_NOTE_MS).toBe(2_000)
  })
})

describe('Edit on a page with no picker (TCH e2e v7 ADDR-9, finding 4)', () => {
  it('says it cannot edit there, offers Reload, and never the "Click anything" hint', async () => {
    const reload = vi.fn()
    await draw(overlay(fixtureMode({ modes: { visible: true, edit: true, unavailable: true, selectEdit: vi.fn(), selectInteractive: vi.fn(), reload } })))
    expect(q(`.${css.commentHint!}`)).toBeNull()
    const line = q('[data-comment-unavailable]')!
    expect(line.getAttribute('role')).toBe('status')
    expect(line.textContent).toBe('Editing is not available on this page right now. Reload the page to try again.Reload')
    const button = line.querySelector('button')!
    expect(button.textContent).toBe('Reload')
    await act(async () => { button.click() })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('in Interactive, or with the picker there, the line is not drawn', async () => {
    await draw(overlay(fixtureMode({ modes: { visible: true, edit: false, unavailable: false, selectEdit: vi.fn(), selectInteractive: vi.fn(), reload: vi.fn() } })))
    expect(q('[data-comment-unavailable]')).toBeNull()
    await draw(overlay(fixtureMode()))
    expect(q('[data-comment-unavailable]')).toBeNull()
  })
})

describe('a door that refused says what did not happen', () => {
  it('a refused send reads "Not sent." with the door\'s sentence; a refused write "Not saved."', async () => {
    await draw(overlay(fixtureMode({ serverNotice: 'Ask the owner for a seat.', serverNoticeKind: 'send' })))
    expect(q('[data-comment-notice="server"]')!.textContent).toBe('Not sent. Ask the owner for a seat.')
    await draw(overlay(fixtureMode({ serverNotice: '', serverNoticeKind: 'save' })))
    expect(q('[data-comment-notice="server"]')!.textContent).toBe('Not saved.')
  })
})

describe('runtime 11 holds the page\'s clicks itself: no shield, the wheel reaches the page', () => {
  it('holdable: no shield over the frame; a pick-outside from the page applies the rule (empty → close, typed → flash)', async () => {
    let tell: ((at: { x: number; y: number }) => void) | null = null
    const onPageOutside = vi.fn((fn: (at: { x: number; y: number }) => void) => { tell = fn; return () => { tell = null } })
    const empty = fixtureMode({ holdable: true, onPageOutside, foot: 'new', picked: picked() })
    await draw(overlay(empty))
    expect(q(`.${css.commentShield!}`)).toBeNull()
    await act(async () => { tell!({ x: 1, y: 2 }) })
    expect(empty.close).toHaveBeenCalledTimes(1)
    const typed = fixtureMode({ holdable: true, onPageOutside, foot: 'new', picked: picked(), text: 'words', unsaved: true })
    await draw(overlay(typed))
    await act(async () => { tell!({ x: 1, y: 2 }) })
    expect(typed.close).not.toHaveBeenCalled()
    expect(q('[role="dialog"]')!.classList.contains(css.commentFlash!)).toBe(true)
  })

  it('a runtime-9 page (not holdable) keeps the shield', async () => {
    await draw(overlay(fixtureMode({ holdable: false, foot: 'new', picked: picked() })))
    expect(q(`.${css.commentShield!}`)).not.toBeNull()
  })
})

describe('round 7: ✕ and Esc in the popover are one rule, and the Esc stays in the box (IN4-1, IN4-3)', () => {
  it('✕ asks the controller (which flashes or drops); Esc goes to the controller and no further', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'abc', unsaved: true })
    await draw(overlay(mode))
    await act(async () => { buttons(q('[role="dialog"]')!)[0]!.click() })
    expect(mode.close).toHaveBeenCalledTimes(1)
    const heard = vi.fn()
    window.addEventListener('keydown', heard)
    try {
      await act(async () => { q('[role="dialog"] textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    } finally {
      window.removeEventListener('keydown', heard)
    }
    expect(mode.escape).toHaveBeenCalledTimes(1)
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('a click outside an open box only closes it (Brian 23:08)', () => {
  const shield = (): HTMLElement | null => q(`.${css.commentShield!}`)
  const onPage = comment(9, 'Another', { author: MAI })
  const pinned = { pageComments: [onPage], rects: new Map([['c9', { x: 40, y: 500, width: 200, height: 40 }]]) }

  it('nothing open: no shield, clicks reach the page and a pin opens its card', async () => {
    const mode = fixtureMode(pinned)
    await draw(overlay(mode))
    expect(shield()).toBeNull()
    await act(async () => { (q('[data-comment-pin="c9"]') as HTMLButtonElement).click() })
    expect(mode.openThread).toHaveBeenCalledWith('c9')
  })

  it('an empty new-place popover: the first click on the page (or a pin) closes it — no pick, no link, no card', async () => {
    const mode = fixtureMode({ ...pinned, foot: 'new', picked: picked() })
    await draw(overlay(mode))
    // The shield covers the frame under the popover: the page never sees that click.
    expect(shield()).not.toBeNull()
    await act(async () => { shield()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(mode.close).toHaveBeenCalledTimes(1)
    await act(async () => { (q('[data-comment-pin="c9"]') as HTMLButtonElement).click() })
    expect(mode.openThread).not.toHaveBeenCalled()
    expect(mode.close).toHaveBeenCalledTimes(2)
  })

  it('a popover with typed words does NOT close: it flashes and keeps the focus', async () => {
    vi.useFakeTimers()
    const mode = fixtureMode({ ...pinned, foot: 'new', picked: picked(), text: 'half a thought', unsaved: true })
    await draw(overlay(mode))
    ;(document.activeElement as HTMLElement | null)?.blur()
    await act(async () => { shield()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(mode.close).not.toHaveBeenCalled()
    // Round 7 (IN4-2): the controller hears it, so the click never counts as a first attempt.
    expect(mode.clickedOutside).toHaveBeenCalledTimes(1)
    expect(q('[role="dialog"]')!.classList.contains(css.commentFlash!)).toBe(true)
    expect(document.activeElement).toBe(q('[role="dialog"] textarea'))
    await act(async () => { (q('[data-comment-pin="c9"]') as HTMLButtonElement).click() })
    expect(mode.openThread).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(q('[role="dialog"]')!.classList.contains(css.commentFlash!)).toBe(false)
    vi.useRealTimers()
  })

  it('the edit popover follows the same rule: its saved words untouched close on the first click (round 4)', async () => {
    const mine = comment(1, 'Say hello')
    const mode = fixtureMode({ foot: 'edit', editing: mine, text: 'Say hello', unsaved: false, pageComments: [mine], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }]]) })
    await draw(overlay(mode))
    await act(async () => { shield()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(mode.close).toHaveBeenCalledTimes(1)
    const changed = fixtureMode({ foot: 'edit', editing: mine, text: 'Say hello there', unsaved: true, pageComments: [mine], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }]]) })
    await draw(overlay(changed))
    await act(async () => { shield()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(changed.close).not.toHaveBeenCalled()
  })

  it('a thread card: empty reply closes on the first click; a typed reply flashes and stays', async () => {
    const root1 = comment(1, 'Root', { author: MAI })
    const open = fixtureMode({ ...pinned, thread: root1, threadMessages: [root1] })
    await draw(overlay(open))
    await act(async () => { shield()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(open.closeThread).toHaveBeenCalledTimes(1)
    const typed = fixtureMode({ ...pinned, thread: root1, threadMessages: [root1], replyText: 'and also', unsaved: true })
    await draw(overlay(typed))
    await act(async () => { shield()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(typed.closeThread).not.toHaveBeenCalled()
    expect(q('[data-thread]')!.classList.contains(css.commentFlash!)).toBe(true)
    expect(document.activeElement).toBe(q('[data-thread] textarea'))
  })
})

describe('"Comments" (ToolbarCommentsButton · …Zero · …Compact, rule 9; option A 01/10; open count and unread dot since 04/10)', () => {
  const count = (): HTMLElement | null => q(`.${css.commentsCount!}`)

  it('one ghost button showing the open count it is given; nothing drawn at 0 or null (only in its name); no ▾, no menu', async () => {
    const onOpen = vi.fn()
    await draw(createElement(CommentsButton, { open: 0, unread: null, compact: false, onOpen }))
    const button = q<HTMLButtonElement>('button')!
    expect(button.getAttribute('aria-label')).toBe('Comments, 0')
    expect(button.textContent).toBe('Comments')
    expect(count()).toBeNull()
    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(host.querySelector('[aria-haspopup]')).toBeNull()
    await act(async () => { button.click() })
    expect(onOpen).toHaveBeenCalledTimes(1)
    await draw(createElement(CommentsButton, { open: 2, unread: 0, compact: false, onOpen }))
    expect(q('button')!.getAttribute('aria-label')).toBe('Comments, 2')
    expect(q('button')!.textContent).toBe('Comments2')
    expect(count()!.textContent).toBe('2')
    // Nobody said a number yet: none drawn.
    await draw(createElement(CommentsButton, { open: null, unread: null, compact: false, onOpen }))
    expect(q('button')!.textContent).toBe('Comments')
    expect(count()).toBeNull()
  })

  it('the unread dot: on the count while unread is above 0, its tooltip and the button\'s name saying "N unread"; none at 0 or null (no "0 unread")', async () => {
    await draw(createElement(CommentsButton, { open: 5, unread: 2, compact: false, onOpen: vi.fn() }))
    expect(q('button')!.textContent).toBe('Comments5')
    expect(count()!.hasAttribute('data-dot')).toBe(true)
    expect(count()!.title).toBe('2 unread')
    expect(q('button')!.getAttribute('aria-label')).toBe('Comments, 5, 2 unread')
    for (const unread of [0, null]) {
      await draw(createElement(CommentsButton, { open: 5, unread, compact: false, onOpen: vi.fn() }))
      expect(count()!.textContent, String(unread)).toBe('5')
      expect(count()!.hasAttribute('data-dot'), String(unread)).toBe(false)
      expect(count()!.hasAttribute('title'), String(unread)).toBe(false)
      expect(q('button')!.getAttribute('aria-label'), String(unread)).toBe('Comments, 5')
    }
    // No number, no dot: a dot needs a count to sit on.
    await draw(createElement(CommentsButton, { open: 0, unread: 2, compact: false, onOpen: vi.fn() }))
    expect(count()).toBeNull()
    expect(q('button')!.getAttribute('aria-label')).toBe('Comments, 0')
  })

  it('compact: the icon with the count as a corner badge, the word in the tooltip, the dot on the badge', async () => {
    await draw(createElement(CommentsButton, { open: 1, unread: 1, compact: true, onOpen: vi.fn() }))
    const button = q<HTMLButtonElement>('button')!
    expect(button.textContent).toBe('1')
    expect(button.title).toBe('Comments')
    expect(q(`.${css.commentsCountCorner!}`)).not.toBeNull()
    expect(q(`.${css.commentsCountCorner!}`)!.hasAttribute('data-dot')).toBe(true)
    await draw(createElement(CommentsButton, { open: 0, unread: 0, compact: true, onOpen: vi.fn() }))
    expect(q('button')!.textContent).toBe('')
    expect(q(`.${css.commentsCountCorner!}`)).toBeNull()
  })
})

describe('Refresh carries Tracy\'s progress (Refresh*, rule 5)', () => {
  const look = async (value: 'idle' | 'working' | 'working-long' | 'updated' | 'ready'): Promise<HTMLButtonElement> => {
    await draw(createElement(RefreshButton, { look: value, onClick: vi.fn() }))
    return q<HTMLButtonElement>('button')!
  }

  it('working: spins + "Tracy is working"; long: spins, no chip', async () => {
    await look('working')
    expect(q('[role="status"]')!.textContent).toBe('Tracy is working')
    expect(q('svg')!.getAttribute('class')).toBe(css.commentSpin)
    const button = await look('working-long')
    expect(q('[role="status"]')).toBeNull()
    expect(q('svg')!.getAttribute('class')).toBe(css.commentSpin)
    expect(button.getAttribute('aria-label')).toBe('Refresh: Tracy is working')
  })

  it('updated: still, "New version updated"; ready: terracotta, "New version ready"; idle: plain', async () => {
    await look('updated')
    expect(q('[role="status"]')!.textContent).toBe('New version updated')
    expect(q('svg')!.getAttribute('class')).toBeNull()
    const ready = await look('ready')
    expect(q('[role="status"]')!.textContent).toBe('New version ready')
    expect(ready.classList.contains(css.refreshReady!)).toBe(true)
    const idle = await look('idle')
    expect(q('[role="status"]')).toBeNull()
    expect(idle.getAttribute('aria-label')).toBe('Refresh')
  })
})

describe('every new string is translated in every dictionary the sidebar ships', () => {
  const KEYS = ['commentTitle', 'commentAdd', 'editSend', 'commentReply', 'commentResolve', 'commentResolvedBy', 'commentDoneByTracy', 'commentPinLabel', 'refreshWorking', 'refreshUpdated', 'refreshReady', 'editPlaceholder'] as const
  it('not the English fallback, and every placeholder kept', () => {
    const dicts = { zh, ...localeDicts } as Record<string, Record<string, string>>
    expect(Object.keys(dicts).length).toBeGreaterThanOrEqual(20)
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of KEYS) {
        const text = dict[key]
        expect(text, `${lang}.${key}`).toBeTruthy()
        expect(text, `${lang}.${key}`).not.toBe(en[key])
        for (const hole of en[key].match(/\{\w+\}/g) ?? []) expect(text, `${lang}.${key}`).toContain(hole)
      }
    }
  })

  it('the stage-5 status words and the ⇧↵ / ⌘↵ tooltips (Brian 29/09 22:40) are gone from every dictionary', () => {
    const dicts = { zh, en, ...localeDicts } as Record<string, Record<string, string>>
    for (const dict of Object.values(dicts)) for (const key of ['commentAddTitle', 'commentSaveTitle', 'commentSendTitle', 'commentSendThreadTitle', 'commentReplyTitle', 'editPinAsked', 'editPinFailed', 'editPinLost', 'editAddAnother', 'editSendMany', 'editDiscardMany', 'editRefusedFull', 'commentsMore', 'commentsOpen']) expect(dict).not.toHaveProperty(key)
  })
})

describe('files in the boxes (attachments contract §B–§D)', () => {
  const ON = { enabled: true, maxBytes: 20 * 1024 * 1024, maxFiles: 20 }
  const png = new File(['PNG'], 'shot.png', { type: 'image/png' })
  const pdf = new File(['x'.repeat(1_240_000)], 'brief.pdf', { type: 'application/pdf' })
  const attach = (scope: Element): HTMLButtonElement | null => scope.querySelector<HTMLButtonElement>('[data-attach]')
  const fileInput = (scope: Element): HTMLInputElement => scope.querySelector<HTMLInputElement>('input[type="file"]')!
  beforeEach(() => {
    let n = 0
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => { n += 1; return `blob:t/${String(n)}` }), revokeObjectURL: vi.fn() }))
  })

  it('the popover has a paperclip before its buttons; the thread card\'s reply box has one too', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), attachments: ON })))
    const button = attach(q('[role="dialog"]')!)!
    expect(button.getAttribute('aria-label')).toBe('Attach files')
    expect(button.querySelector('[data-icon="paperclip"]')).not.toBeNull()
    expect(fileInput(q('[role="dialog"]')!).multiple).toBe(true)
    const root = comment(1, 'Numbers are off.')
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], attachments: ON })))
    expect(attach(q('[data-thread]')!)).not.toBeNull()
  })

  it('hidden when the server keeps no files (attachments.enabled false): no button, no picker, drop and paste do nothing', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    const dialog = q('[role="dialog"]')!
    expect(attach(dialog)).toBeNull()
    expect(dialog.querySelector('input[type="file"]')).toBeNull()
    await act(async () => { dialog.dispatchEvent(dropEvent([png])) })
    await act(async () => { q('textarea')!.dispatchEvent(pasteEvent([png])) })
    expect(mode.addFiles).not.toHaveBeenCalled()
    const root = comment(1, 'Numbers are off.')
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root] })))
    expect(attach(q('[data-thread]')!)).toBeNull()
  })

  it('picking files adds them to the box (the button opens the file picker)', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), attachments: ON })
    await draw(overlay(mode))
    const input = fileInput(q('[role="dialog"]')!)
    const clicked = vi.spyOn(input, 'click')
    await act(async () => { attach(q('[role="dialog"]')!)!.click() })
    expect(clicked).toHaveBeenCalled()
    Object.defineProperty(input, 'files', { value: [png, pdf], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(mode.addFiles).toHaveBeenCalledWith('popover', [png, pdf])
  })

  it('dropping files on the box adds them; pasting an image into the text adds it (text paste stays text)', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), attachments: ON })
    await draw(overlay(mode))
    await act(async () => { q('[role="dialog"]')!.dispatchEvent(dropEvent([pdf])) })
    expect(mode.addFiles).toHaveBeenLastCalledWith('popover', [pdf])
    const paste = pasteEvent([png, pdf])
    await act(async () => { q('textarea')!.dispatchEvent(paste) })
    expect(mode.addFiles).toHaveBeenLastCalledWith('popover', [png])
    expect(paste.defaultPrevented).toBe(true)
    const words = pasteEvent([])
    await act(async () => { q('textarea')!.dispatchEvent(words) })
    expect(mode.addFiles).toHaveBeenCalledTimes(2)
    expect(words.defaultPrevented).toBe(false)
  })

  it('the thread card\'s reply box takes drops and pastes for itself', async () => {
    const root = comment(1, 'Numbers are off.')
    const mode = fixtureMode({ thread: root, threadMessages: [root], attachments: ON })
    await draw(overlay(mode))
    await act(async () => { q('[data-thread]')!.dispatchEvent(dropEvent([pdf])) })
    expect(mode.addFiles).toHaveBeenLastCalledWith('reply', [pdf])
  })

  it('chips under the text (the chat composer\'s): an image a thumbnail and its name, a file a type badge, name and size; ✕ inline removes one; a kept file shows its stored thumbnail', async () => {
    const kept = { id: 'att-9', name: 'old.png', size: 2048, type: 'image/png', url: '/api/sites/northgate/comments/attachments/att-9' }
    const mode = fixtureMode({
      foot: 'new',
      picked: picked(),
      attachments: ON,
      draft: [{ kind: 'stored', key: 's:att-9', attachment: kept }, { kind: 'file', key: 'f:1', file: png }, { kind: 'file', key: 'f:2', file: pdf }],
    })
    await draw(overlay(mode))
    const chips = [...host.querySelectorAll('[data-attach-chip]')]
    expect(chips.map(c => c.getAttribute('data-attach-chip'))).toEqual(['s:att-9', 'f:1', 'f:2'])
    expect(chips[0]!.querySelector('img')!.getAttribute('src')).toBe(kept.url)
    expect(chips[1]!.querySelector('img')!.getAttribute('src')).toBe('blob:t/1')
    // Akemi 01/10: an image chip names its file (two pasted screenshots told apart).
    expect(chips[0]!.querySelector(`.${css.attachName!}`)!.textContent).toBe('old.png')
    expect(chips[1]!.querySelector(`.${css.attachName!}`)!.textContent).toBe(png.name)
    expect(chips[1]!.querySelector(`.${css.attachMeta!}`)).toBeNull()
    expect(chips[2]!.querySelector('img')).toBeNull()
    expect(chips[2]!.querySelector(`.${css.attachBadge!}`)!.textContent).toBe('PDF')
    expect(chips[2]!.querySelector(`.${css.attachName!}`)!.textContent).toBe('brief.pdf')
    expect(chips[2]!.querySelector(`.${css.attachMeta!}`)!.textContent).toBe('1.2 MB')
    // The ✕ is the chip's last child, in its row (not a corner badge).
    expect(chips[2]!.lastElementChild!.className).toBe(css.attachRemove)
    const remove = chips[2]!.querySelector('button')!
    expect(remove.getAttribute('aria-label')).toBe('Remove brief.pdf')
    await act(async () => { remove.click() })
    expect(mode.removeDraft).toHaveBeenCalledWith('popover', 'f:2')
  })

  it('a refused file is a red chip with a short reason and ✕ in its own box; the sentence stays for screen readers', async () => {
    const big = { key: 'r:1', name: 'site-backup.zip', size: 52_000_000, type: 'application/zip', code: 'too-large' as const, limit: 20 * 1024 * 1024 }
    const late = { key: 'r:2', name: 'c.png', size: 3, type: 'image/png', code: 'too-many' as const, limit: 20 }
    const mode = fixtureMode({ foot: 'new', picked: picked(), attachments: ON, draft: [{ kind: 'file', key: 'f:1', file: pdf }], draftError: { box: 'popover', refusal: { code: 'too-large', name: 'site-backup.zip', limit: 20 * 1024 * 1024 }, files: [big, late] } })
    await draw(overlay(mode))
    const chips = [...host.querySelectorAll('[data-attach-chip]')]
    expect(chips.map(c => [c.getAttribute('data-attach-chip'), c.getAttribute('data-state')])).toEqual([['f:1', null], ['r:1', 'error'], ['r:2', 'error']])
    expect(chips[1]!.querySelector(`.${css.attachBadge!}`)!.textContent).toBe('ZIP')
    expect(chips[1]!.querySelector(`.${css.attachName!}`)!.textContent).toBe('site-backup.zip')
    // The real cap, written as every size in the box is (1000-based).
    expect(chips[1]!.querySelector(`.${css.attachMeta!}`)!.textContent).toBe('Over 20 MB')
    expect(chips[2]!.querySelector(`.${css.attachMeta!}`)!.textContent).toBe('Max 20 files')
    await act(async () => { chips[1]!.querySelector('button')!.click() })
    expect(mode.removeRefused).toHaveBeenCalledWith('popover', 'r:1')
    expect(mode.removeDraft).not.toHaveBeenCalled()
    const live = q('[data-attach-error]')!
    expect([live.textContent, live.getAttribute('role'), live.getAttribute('aria-live'), live.className]).toEqual(['site-backup.zip is too large. Files can be up to 20 MB', 'status', 'polite', css.visuallyHidden])
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), attachments: ON, draftError: { box: 'popover', refusal: { code: 'too-many', limit: 20 }, files: [late] } })))
    expect(q('[data-attach-error]')!.textContent).toBe('Too many files: up to 20 at once')
    // Another box's refusal is not said here.
    const root = comment(1, 'Numbers are off.')
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], attachments: ON, draftError: { box: 'popover', refusal: { code: 'too-many', limit: 20 }, files: [late] } })))
    expect(q('[data-attach-error]')).toBeNull()
    expect(q('[data-attach-chip]')).toBeNull()
  })

  it('a chat that refused the files says so (attachment-too-large · attachment-failed)', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'x', notice: 'attachment-too-large' })))
    expect(q(`.${css.commentError!}`)!.textContent).toBe('A file is too large for the chat. Send a smaller one')
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'x', notice: 'attachment-failed' })))
    expect(q(`.${css.commentError!}`)!.textContent).toBe('A file could not be added to the chat. Try again')
  })

  it('the thread card shows each message\'s files: a lazy thumbnail for an image, name and size otherwise; an image opens in a new tab, any other file downloads in place (round 5)', async () => {
    const shot = { id: 'a1', name: 'shot.png', size: 3000, type: 'image/png', url: '/api/sites/northgate/comments/attachments/a1' }
    const doc = { id: 'a2', name: 'brief.pdf', size: 1_240_000, type: 'application/pdf', url: '/api/sites/northgate/comments/attachments/a2' }
    const root = comment(1, 'Numbers are off.', { attachments: [shot] })
    const answer = comment(2, 'Report attached.', { replyTo: 'c1', author: MAI, attachments: [doc] })
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root, answer] })))
    const [first, second] = [...host.querySelectorAll('[data-message]')]
    const image = first!.querySelector<HTMLAnchorElement>('a[data-attachment="a1"]')!
    expect(image.getAttribute('href')).toBe(shot.url)
    expect(image.target).toBe('_blank')
    expect(image.rel).toContain('noopener')
    const img = image.querySelector('img')!
    expect([img.getAttribute('src'), img.getAttribute('loading'), img.getAttribute('alt')]).toEqual([shot.url, 'lazy', 'shot.png'])
    const file = second!.querySelector<HTMLAnchorElement>('a[data-attachment="a2"]')!
    expect(file.querySelector('img')).toBeNull()
    expect(file.textContent).toContain('brief.pdf')
    expect(file.textContent).toContain('1.2 MB')
    expect([file.getAttribute('href'), file.target, file.getAttribute('download')]).toEqual([doc.url, '', 'brief.pdf'])
    expect(file.getAttribute('aria-label')).toBe('Open brief.pdf')
  })

  describe('a file dragged into the Browser tab while a box is open (Brian, 30/09)', () => {
    /** The Browser tab as BrowserView draws it: a toolbar, then the stage with the layer. */
    const tab = (mode: CommentMode): ReactElement => createElement('div', { 'data-browser-tab': '' },
      createElement('button', { type: 'button', 'data-toolbar': '' }, 'Refresh'),
      createElement('div', { 'data-stage': '' }, overlay(mode)))
    const drag = (type: string, over: { relatedTarget?: EventTarget | null } = {}): Event & { dataTransfer: { dropEffect: string } } => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { files: [pdf], types: ['Files'], dropEffect: 'copy' } })
      if (over.relatedTarget !== undefined) Object.defineProperty(event, 'relatedTarget', { value: over.relatedTarget })
      return event as Event & { dataTransfer: { dropEffect: string } }
    }

    it('dropped on the toolbar it is caught and ignored: never opened by the browser, never attached', async () => {
      const mode = fixtureMode({ foot: 'new', picked: picked(), attachments: ON })
      await draw(tab(mode))
      const toolbar = q('[data-toolbar]')!
      const over = drag('dragover')
      await act(async () => { toolbar.dispatchEvent(over) })
      expect([over.defaultPrevented, over.dataTransfer.dropEffect]).toEqual([true, 'none'])
      const drop = drag('drop')
      await act(async () => { toolbar.dispatchEvent(drop) })
      expect(drop.defaultPrevented).toBe(true)
      expect(mode.addFiles).not.toHaveBeenCalled()
    })

    it('over the page frame a catcher stands for the length of the drag, and a drop on it is ignored', async () => {
      const mode = fixtureMode({ foot: 'new', picked: picked(), attachments: ON, holdable: true })
      await draw(tab(mode))
      expect(q('[data-comment-dropcatch]')).toBeNull()
      await act(async () => { q('[data-toolbar]')!.dispatchEvent(drag('dragenter')) })
      const catcher = q('[data-comment-dropcatch]')!
      expect(catcher).not.toBeNull()
      const drop = drag('drop')
      await act(async () => { catcher.dispatchEvent(drop) })
      expect(drop.defaultPrevented).toBe(true)
      expect(mode.addFiles).not.toHaveBeenCalled()
      expect(q('[data-comment-dropcatch]')).toBeNull()
      // Leaving the tab ends it too.
      await act(async () => { q('[data-toolbar]')!.dispatchEvent(drag('dragenter')) })
      await act(async () => { q('[data-toolbar]')!.dispatchEvent(drag('dragleave', { relatedTarget: null })) })
      expect(q('[data-comment-dropcatch]')).toBeNull()
    })

    it('with the server keeping no files, a drop on the box itself is ignored too', async () => {
      const mode = fixtureMode({ foot: 'new', picked: picked() })
      await draw(tab(mode))
      const drop = drag('drop')
      await act(async () => { q('[role="dialog"]')!.dispatchEvent(drop) })
      expect(drop.defaultPrevented).toBe(true)
      expect(mode.addFiles).not.toHaveBeenCalled()
    })

    it('no box open: the tab leaves drags alone', async () => {
      await draw(tab(fixtureMode({ attachments: ON })))
      const over = drag('dragover')
      await act(async () => { q('[data-toolbar]')!.dispatchEvent(over) })
      expect(over.defaultPrevented).toBe(false)
      await act(async () => { q('[data-toolbar]')!.dispatchEvent(drag('dragenter')) })
      expect(q('[data-comment-dropcatch]')).toBeNull()
    })

    it('the box lights up while files are dragged over it, and not after they leave or drop', async () => {
      const mode = fixtureMode({ foot: 'new', picked: picked(), attachments: ON })
      await draw(tab(mode))
      const dialog = q('[role="dialog"]')!
      await act(async () => { dialog.dispatchEvent(drag('dragenter')) })
      expect(dialog.getAttribute('data-drop')).toBe('on')
      // Akemi 01/10: the text area turns into a drop zone (no ring around the box), with the box's real cap.
      const zone = q('[data-drop-zone]')!
      expect(zone.textContent).toBe('Drop to attachImages or any file, up to 20 MB each')
      expect(zone.parentElement!.querySelector('textarea')).not.toBeNull()
      expect(dialog.className).not.toContain('commentDropOn')
      // Into a child of the box: still on.
      await act(async () => { q('textarea')!.dispatchEvent(drag('dragenter')) })
      await act(async () => { dialog.dispatchEvent(drag('dragleave')) })
      expect(dialog.getAttribute('data-drop')).toBe('on')
      await act(async () => { q('textarea')!.dispatchEvent(drag('dragleave')) })
      expect(dialog.getAttribute('data-drop')).toBeNull()
      expect(q('[data-drop-zone]')).toBeNull()
      await act(async () => { dialog.dispatchEvent(drag('dragenter')) })
      const drop = drag('drop')
      await act(async () => { dialog.dispatchEvent(drop) })
      expect(dialog.getAttribute('data-drop')).toBeNull()
      expect(mode.addFiles).toHaveBeenCalledWith('popover', [pdf])
    })

    it('the drop zone says the cap the box applies: a smaller server cap wins over the chat\'s 20 MiB', async () => {
      await draw(tab(fixtureMode({ foot: 'new', picked: picked(), attachments: { enabled: true, maxBytes: 10_000_000, maxFiles: 20 } })))
      await act(async () => { q('[role="dialog"]')!.dispatchEvent(drag('dragenter')) })
      expect(q('[data-drop-zone]')!.textContent).toBe('Drop to attachImages or any file, up to 10 MB each')
    })

    it('the thread card lights up the same way', async () => {
      const root = comment(1, 'Numbers are off.')
      await draw(tab(fixtureMode({ thread: root, threadMessages: [root], attachments: ON })))
      const card = q('[data-thread]')!
      await act(async () => { card.dispatchEvent(drag('dragenter')) })
      expect(card.getAttribute('data-drop')).toBe('on')
      expect(q('[data-drop-zone]')!.parentElement!.querySelector('textarea')).not.toBeNull()
    })

    // Round 11 (acceptance v5 V5-2): dsh's chat box listens for file drops on the whole document
    // (`ui-attachment` drop-events.ts) and takes every one that reaches it, prevented or not.
    describe('a file dropped in a comment box never reaches dsh\'s chat box (V5-2)', () => {
      const KINDS = ['dragenter', 'dragover', 'dragleave', 'drop'] as const
      const heard: string[] = []
      const listen = (event: Event): void => { heard.push(event.type) }
      beforeEach(() => {
        heard.length = 0
        for (const kind of KINDS) document.addEventListener(kind, listen)
      })
      afterEach(() => { for (const kind of KINDS) document.removeEventListener(kind, listen) })
      const boxes: Array<[string, () => CommentMode, string]> = [
        ['the popover', () => fixtureMode({ foot: 'new', picked: picked(), attachments: ON }), '[role="dialog"]'],
        ['the thread card', () => { const root = comment(1, 'Numbers are off.'); return fixtureMode({ thread: root, threadMessages: [root], attachments: ON }) }, '[data-thread]'],
        ['the popover of a server keeping no files', () => fixtureMode({ foot: 'new', picked: picked() }), '[role="dialog"]'],
      ]
      for (const [name, make, selector] of boxes) {
        it(`${name}: no drag event of a file stops at the document; the box still takes what it takes`, async () => {
          const mode = make()
          await draw(tab(mode))
          const box = q(selector)!
          const drop = drag('drop')
          for (const kind of ['dragenter', 'dragover', 'dragleave'] as const) await act(async () => { box.dispatchEvent(drag(kind)) })
          await act(async () => { q(`${selector} textarea`)!.dispatchEvent(drop) })
          expect(heard).toEqual([])
          expect(drop.defaultPrevented).toBe(true)
          if (mode.attachments.enabled) expect(mode.addFiles).toHaveBeenCalledWith(selector === '[data-thread]' ? 'reply' : 'popover', [pdf])
          else expect(mode.addFiles).not.toHaveBeenCalled()
        })
      }
      it('a drop outside every box keeps today\'s rule: caught by the tab, and the document still hears it', async () => {
        await draw(tab(fixtureMode({ foot: 'new', picked: picked(), attachments: ON })))
        const drop = drag('drop')
        await act(async () => { q('[data-toolbar]')!.dispatchEvent(drop) })
        expect(drop.defaultPrevented).toBe(true)
        expect(heard).toEqual(['drop'])
      })
      it('a drag with no file (words, a link) is left alone', async () => {
        await draw(tab(fixtureMode({ foot: 'new', picked: picked(), attachments: ON })))
        const words = new Event('drop', { bubbles: true, cancelable: true })
        Object.defineProperty(words, 'dataTransfer', { value: { files: [], types: ['text/plain'], dropEffect: 'copy' } })
        await act(async () => { q('[role="dialog"]')!.dispatchEvent(words) })
        expect(heard).toEqual(['drop'])
      })
    })
  })

  it('Enter rules unchanged with files in the box: Enter sends to Tracy, Shift+Enter is a new line, ⇧⌘↵ is bound to nothing', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words', attachments: ON, draft: [{ kind: 'file', key: 'f:1', file: png }] })
    await draw(overlay(mode))
    const area = q('textarea')!
    await press(area, { key: 'Enter', shiftKey: true })
    await press(area, { key: 'Enter', metaKey: true, shiftKey: true })
    expect(mode.addComment).not.toHaveBeenCalled()
    expect(mode.sendToTracy).not.toHaveBeenCalled()
    await press(area, { key: 'Enter' })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(1)
    expect(mode.addComment).not.toHaveBeenCalled()
  })
})

function dropEvent(files: File[]): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } })
  return event
}

function pasteEvent(files: File[]): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { files, types: files.length > 0 ? ['Files'] : ['text/plain'] } })
  return event
}

describe('a box that refused to drop its words flashes (round 4: Esc, Interactive, a navigation)', () => {
  it('each bump of mode.flash flashes the popover and puts the focus back in its text', async () => {
    vi.useFakeTimers()
    const base = { foot: 'new' as const, picked: picked(), text: 'Draft', unsaved: true }
    await draw(overlay(fixtureMode({ ...base, flash: 0 })))
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(q('[role="dialog"]')!.classList.contains(css.commentFlash!)).toBe(false)
    await draw(overlay(fixtureMode({ ...base, flash: 1 })))
    expect(q('[role="dialog"]')!.classList.contains(css.commentFlash!)).toBe(true)
    expect(document.activeElement).toBe(q('[role="dialog"] textarea'))
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(q('[role="dialog"]')!.classList.contains(css.commentFlash!)).toBe(false)
    vi.useRealTimers()
  })

  it('the thread card flashes too', async () => {
    const root1 = comment(1, 'Root', { author: MAI })
    const base = { thread: root1, threadMessages: [root1], replyText: 'and also', unsaved: true }
    await draw(overlay(fixtureMode({ ...base, flash: 0 })))
    await draw(overlay(fixtureMode({ ...base, flash: 1 })))
    expect(q('[data-thread]')!.classList.contains(css.commentFlash!)).toBe(true)
  })
})

describe('the wheel over a box scrolls the page (round 4, item 8)', () => {
  const wheel = async (el: Element, init: WheelEventInit): Promise<WheelEvent> => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    await act(async () => { el.dispatchEvent(event) })
    return event
  }
  /** Give a box a scroll state jsdom does not compute. */
  const scrollState = (el: HTMLElement, s: { top: number; client: number; height: number }): void => {
    el.style.overflowY = 'auto'
    Object.defineProperty(el, 'scrollTop', { value: s.top, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: s.client, configurable: true })
    Object.defineProperty(el, 'scrollHeight', { value: s.height, configurable: true })
  }

  it('over the popover: the page scrolls by the wheel, in the page\'s pixels (the tab\'s zoom taken out); the tab does not', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked() })
    await draw(createElement(CommentOverlay, { mode, zoom: 150 }))
    const event = await wheel(q('[role="dialog"] textarea')!, { deltaY: 120 })
    // Round 10: no id — the page scrolls the box the open pick sits in (`pick-wheel`, runtime 16).
    expect(mode.wheelPage).toHaveBeenCalledWith(0, 80, null)
    expect(event.defaultPrevented).toBe(true)
  })

  it('lines and pages are turned into pixels', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked() })
    await draw(overlay(mode))
    await wheel(q('[role="dialog"]')!, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE })
    expect(mode.wheelPage).toHaveBeenLastCalledWith(0, 48, null)
  })

  it('a text box that can still scroll that way scrolls first; at its end the page takes the wheel', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'many lines' })
    await draw(overlay(mode))
    const box = q<HTMLTextAreaElement>('[role="dialog"] textarea')!
    scrollState(box, { top: 0, client: 200, height: 400 })
    const inside = await wheel(box, { deltaY: 100 })
    expect(mode.wheelPage).not.toHaveBeenCalled()
    expect(inside.defaultPrevented).toBe(false)
    await wheel(box, { deltaY: -100 })
    expect(mode.wheelPage).toHaveBeenCalledWith(0, -100, null)
    scrollState(box, { top: 200, client: 200, height: 400 })
    await wheel(box, { deltaY: 100 })
    expect(mode.wheelPage).toHaveBeenLastCalledWith(0, 100, null)
  })

  it('over the thread card too', async () => {
    const root1 = comment(1, 'Root', { author: MAI })
    const mode = fixtureMode({ thread: root1, threadMessages: [root1] })
    await draw(overlay(mode))
    await wheel(q('[data-thread]')!, { deltaY: 50 })
    expect(mode.wheelPage).toHaveBeenCalledWith(0, 50, root1.id)
  })

  it('round 10: over a pin too — the page scrolls, for the box its element sits in (acceptance v5 PICK-new-9)', async () => {
    const c = comment(7, 'Hello', { author: MAI })
    const mode = fixtureMode({ pageComments: [c], rects: new Map([['c7', { x: 40, y: 200, width: 300, height: 40 }]]) })
    await draw(createElement(CommentOverlay, { mode, zoom: 200 }))
    const event = await wheel(q('[data-comment-pin="c7"]')!, { deltaY: 100 })
    expect(mode.wheelPage).toHaveBeenCalledWith(0, 50, 'c7')
    expect(event.defaultPrevented).toBe(true)
    // A pinch is the browser's.
    await wheel(q('[data-comment-pin="c7"]')!, { deltaY: 100, ctrlKey: true })
    expect(mode.wheelPage).toHaveBeenCalledTimes(1)
  })
})


describe('round 5 (acceptance v3)', () => {
  const SAM_A = { accountId: 'a3', email: 'e2e3-thread-a@example.test', name: 'Sam Tester', initial: 'S', color: '#db2777', avatarUrl: null }
  const SAM_B = { accountId: 'a4', email: 'e2e3-thread-b@example.test', name: 'Sam Tester', initial: 'S', color: '#c026d3', avatarUrl: null }
  const R = { x: 40, y: 300, width: 300, height: 40 }

  it('TH-2: a box a failed save gave back says why, in its own box', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words', saveError: { box: 'popover', key: 'commentErrTooLong', params: { max: 4000 } } })
    await draw(overlay(mode))
    expect(q('[data-save-error]')!.textContent).toBe('Too long to save. Keep it to 4000 characters or fewer.')
    const c = comment(1, 'Root')
    await draw(overlay(fixtureMode({ thread: c, threadMessages: [c], replyText: 'x', saveError: { box: 'reply', key: 'commentErrUnknown' } })))
    expect(q('[data-save-error]')!.textContent).toBe('Could not save. Your words are kept. Try again.')
  })

  it('TH-2: a count near the limit; over it Note for team, Ask Tracy to edit, Save and Reply are disabled and Enter does nothing', async () => {
    const near = fixtureMode({ foot: 'new', picked: picked(), text: 'x'.repeat(3700), maxChars: 4000 })
    await draw(overlay(near))
    expect(q('[data-char-count]')!.textContent).toBe('3700 / 4000')
    expect(q('[data-char-count]')!.hasAttribute('data-over')).toBe(false)
    const over = fixtureMode({ foot: 'new', picked: picked(), text: 'x'.repeat(4001), maxChars: 4000 })
    await draw(overlay(over))
    expect(q('[data-char-count]')!.hasAttribute('data-over')).toBe(true)
    for (const b of qa('[data-comment-box] .' + css.commentFootEnd + ' button')) expect((b as HTMLButtonElement).disabled).toBe(true)
    await press(q('textarea')!, { key: 'Enter' })
    expect(over.sendToTracy).not.toHaveBeenCalled()
    const short = fixtureMode({ foot: 'new', picked: picked(), text: 'short', maxChars: 4000 })
    await draw(overlay(short))
    expect(q('[data-char-count]')).toBeNull()
    const c = comment(1, 'Root')
    const card = fixtureMode({ thread: c, threadMessages: [c], replyText: 'x'.repeat(4001), maxChars: 4000 })
    await draw(overlay(card))
    for (const b of qa('[data-thread] .' + css.commentFootEnd + ' button')) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('TH-2: a refused Resolve or Delete says it in plain words over the page', async () => {
    await draw(overlay(fixtureMode({ serverError: { key: 'commentErrSignedOut' } })))
    expect(q('[data-comment-notice="server"]')!.textContent).toBe('You are signed out. Sign in again, then try again.')
  })

  it('TH-4: a deleted first message reads "Comment deleted", muted, with its replies under it and Resolve still there', async () => {
    const tomb = comment(1, '', { removed: true, can: { edit: false, delete: false } })
    const reply = comment(2, 'Seconded', { replyTo: 'c1', author: MAI, can: { edit: false, delete: false } })
    await draw(overlay(fixtureMode({ thread: tomb, threadMessages: [tomb, reply], pageComments: [tomb], rects: new Map([['c1', R]]) })))
    const first = q('[data-message="c1"]')!
    expect(first.querySelector('[data-tombstone]')!.textContent).toBe('Comment deleted')
    expect(first.querySelector('[data-tombstone]')!.classList.contains(css.threadTombstone!)).toBe(true)
    expect(q('[data-message="c2"]')!.textContent).toContain('Seconded')
    expect(q('[data-thread-head] [data-resolve]')).not.toBeNull()
    expect(q('[data-comment-pin="c1"]')).not.toBeNull()
  })

  it('TH-5: the messages scroll inside the card; the reply box and its buttons stay after the list', async () => {
    const root = comment(1, 'Root')
    const replies = Array.from({ length: 22 }, (_, i) => comment(i + 2, `Reply ${String(i)}`, { replyTo: 'c1' }))
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root, ...replies], rects: new Map([['c1', R]]) })))
    const list = q('[data-thread-list]')!
    expect(list.classList.contains(css.threadList!)).toBe(true)
    expect(list.querySelectorAll('[data-message]')).toHaveLength(23)
    const card = q('[data-thread]')!
    const kids = Array.from(card.children)
    expect(kids.indexOf(list)).toBeLessThan(kids.indexOf(card.querySelector('[data-thread-compose]')!))
    expect(card.querySelector('textarea')!.closest('[data-thread-list]')).toBeNull()
  })

  it('TH-6: two people of one name read "Name (email before @)" in the card, the pin\'s tooltip and "Resolved by"; each has their own colour', async () => {
    const a = comment(1, 'From A', { author: SAM_A })
    const b = comment(2, 'From B', { author: SAM_B, replyTo: 'c1', can: { edit: false, delete: false } })
    const done = comment(3, 'Done', { author: SAM_A, status: 'resolved', resolvedAt: 5, resolvedBy: SAM_B })
    await draw(overlay(fixtureMode({ comments: [a, b, done], thread: done, threadMessages: [done], pageComments: [a, done], rects: new Map([['c1', R], ['c3', { ...R, y: 500 }]]) })))
    expect(q('[data-message="c3"] .' + css.threadAuthor)!.textContent).toBe('Sam Tester (e2e3-thread-a)')
    expect(q('[data-resolved-pill]')!.getAttribute('title')).toBe('Resolved by Sam Tester (e2e3-thread-b)')
    expect(q('[data-comment-pin="c1"] [data-pin-tip]')!.textContent).toBe('Sam Tester (e2e3-thread-a) · 2 comments')
    expect((q('[data-comment-pin="c1"]') as HTMLElement).style.background).toBe(hexToRgb(SAM_A.color))
    expect((q('[data-message="c3"] [data-avatar]') as HTMLElement).style.background).toBe(hexToRgb(SAM_A.color))
  })

  it('TH-8: "Deleted · Undo (10)" is one line; the author ellipsizes and the time never wraps', () => {
    const rule = (name: string): string => cssText.match(new RegExp(`\\.${name} \\{[^}]*\\}`))?.[0] ?? ''
    expect(rule('threadDeleted')).toMatch(/white-space: nowrap/)
    // The notice in a message's spot keeps its own two-class rule: one row on the baseline.
    expect(cssText).toMatch(/\.threadMessage\.threadDeleted \{[^}]*flex-direction: row/)
    expect(rule('threadAge')).toMatch(/white-space: nowrap/)
    expect(rule('threadAuthor')).toMatch(/text-overflow: ellipsis/)
  })

  it('SEND-new-1: two pins on one element fan out, so the lower one can be clicked', async () => {
    const a = comment(1, 'One')
    const b = comment(2, 'Two', { author: MAI })
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects: new Map([['c1', R], ['c2', R]]) })))
    const at = (id: string): [number, number] => { const el = q(`[data-comment-pin="${id}"]`) as HTMLElement; return [Number.parseFloat(el.style.left), Number.parseFloat(el.style.top)] }
    // R.x = 40: the gutter holds one pin, so the second goes a row down (P1).
    expect(at('c2')[0]).toBe(at('c1')[0])
    expect(at('c2')[1] - at('c1')[1]).toBe(PIN_FAN_PX)
    expect(PIN_FAN_PX).toBeGreaterThanOrEqual(10)
  })

  it('A07: a file that is not an image downloads in place; an image still opens in a new tab', async () => {
    const files = [
      { id: 'f1', name: 'brief.pdf', size: 10, type: 'application/pdf', url: '/api/sites/k/comments/attachments/f1' },
      { id: 'f2', name: 'shot.png', size: 10, type: 'image/png', url: '/api/sites/k/comments/attachments/f2' },
    ]
    const c = comment(1, 'With files', { attachments: files })
    await draw(overlay(fixtureMode({ thread: c, threadMessages: [c], rects: new Map([['c1', R]]) })))
    const pdf = q('[data-attachment="f1"]') as HTMLAnchorElement
    expect(pdf.getAttribute('download')).toBe('brief.pdf')
    expect(pdf.hasAttribute('target')).toBe(false)
    const png = q('[data-attachment="f2"]') as HTMLAnchorElement
    expect(png.getAttribute('target')).toBe('_blank')
    expect(png.hasAttribute('download')).toBe(false)
  })
})

describe('round 5: a box by an element the page no longer shows waits at the frame corner (acceptance v3 B04, J06, J38)', () => {
  it('the popover of a pick hidden since it opened waits at the top corner with its words; covered, it stays by the block', async () => {
    const pick = picked({ x: 40, y: 300, width: 380, height: 40 })
    await draw(overlay(fixtureMode({ foot: 'new', picked: pick, text: 'Draft' })))
    const byBlock = (q('[data-comment-box]') as HTMLElement).style.top
    await draw(overlay(fixtureMode({ doc: 2, foot: 'new', picked: { ...pick, target: { ...pick.target, hidden: 'clipped' } }, text: 'Draft' })))
    const box = q('[data-comment-box]') as HTMLElement
    // A new document where the element was never seen: the corner an edit popover of a comment the
    // page cannot find takes (anchor 14, 4).
    expect([box.style.left, box.style.top]).toEqual(['8px', '20px'])
    expect(box.style.visibility).toBe('')
    expect((box.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Draft')
    await draw(overlay(fixtureMode({ doc: 2, foot: 'new', picked: { ...pick, target: { ...pick.target, hidden: 'covered' } }, text: 'Draft' })))
    expect((q('[data-comment-box]') as HTMLElement).style.top).toBe(byBlock)
  })

  it('the thread card of a clipped block opens at the frame corner (from the Comments tab too)', async () => {
    const c = comment(1, 'Row five')
    await draw(overlay(fixtureMode({ thread: c, threadMessages: [c], pageComments: [c], rects: new Map([['c1', { x: 40, y: 300, width: 300, height: 40, hidden: 'clipped' as const }]]) })))
    // The corner a whole-page comment's card takes.
    expect((q('[data-thread="c1"]') as HTMLElement).style.top).toBe('14px')
  })
})

describe('round 8 (acceptance v5 JS-v5-new-1, J38): a box whose element hides stays where it was, and says so', () => {
  const NEWS = { x: 40, y: 300, width: 200, height: 30 }
  const newsPick = (hidden?: 'clipped'): ReturnType<typeof picked> => {
    const pick = picked(hidden === undefined ? NEWS : { x: 0, y: 0, width: 0, height: 0 })
    return { ...pick, target: { ...pick.target, text: 'Newsletter', ...(hidden === undefined ? {} : { hidden }) } }
  }

  it('a hover menu closes while the pointer travels to the popover: the popover stays put, its head names the element', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: newsPick() })))
    const box = (): HTMLElement => q('[data-comment-box]') as HTMLElement
    const at = [box().style.left, box().style.top]
    expect(q('[data-hidden-note]')).toBeNull()
    await draw(overlay(fixtureMode({ foot: 'new', picked: newsPick('clipped') })))
    expect([box().style.left, box().style.top]).toEqual(at)
    expect(q('[data-hidden-note]')!.textContent).toBe('Newsletter (hidden now)')
    // Shown again: by the element, no note.
    await draw(overlay(fixtureMode({ foot: 'new', picked: newsPick() })))
    expect(q('[data-hidden-note]')).toBeNull()
  })

  it('verify6 L2: a long name is what the head shortens; the "(hidden now)" suffix always shows whole', async () => {
    const long = 'Newsletter Digest email template with a much longer label than the head can hold'
    const pick = newsPick('clipped')
    await draw(overlay(fixtureMode({ foot: 'new', picked: { ...pick, target: { ...pick.target, text: long } } })))
    const note = q('[data-hidden-note]') as HTMLElement
    const name = note.querySelector('[data-hidden-note-name]') as HTMLElement
    const suffix = note.querySelector('[data-hidden-note-suffix]') as HTMLElement
    // The name alone carries the ellipsis; the suffix is its own piece that never shrinks.
    expect(name.textContent).toBe(note.title.replace(/ \(hidden now\)$/, ''))
    expect(suffix.textContent).toBe(' (hidden now)')
    expect(note.textContent).toBe(note.title)
    expect(name.className).not.toBe(suffix.className)
  })

  it('the thread card and the edit popover keep their place the same way', async () => {
    const c = comment(1, 'Row five', { element: { ...comment(1, '').element!, text: 'Row five link' } })
    const rects = (hidden?: 'clipped') => new Map([['c1', hidden === undefined ? NEWS : { x: 0, y: -600, width: 0, height: 0, hidden }]])
    await draw(overlay(fixtureMode({ thread: c, threadMessages: [c], pageComments: [c], rects: rects() })))
    const top = (q('[data-thread="c1"]') as HTMLElement).style.top
    await draw(overlay(fixtureMode({ thread: c, threadMessages: [c], pageComments: [c], rects: rects('clipped') })))
    expect((q('[data-thread="c1"]') as HTMLElement).style.top).toBe(top)
    expect(q('[data-hidden-note]')!.textContent).toBe('Row five link (hidden now)')
    await draw(overlay(fixtureMode({ foot: 'edit', editing: c, text: 'Row five', pageComments: [c], rects: rects() })))
    const edit = (q('[data-comment-box]') as HTMLElement).style.top
    await draw(overlay(fixtureMode({ foot: 'edit', editing: c, text: 'Row five', pageComments: [c], rects: rects('clipped') })))
    expect((q('[data-comment-box]') as HTMLElement).style.top).toBe(edit)
  })

  it('a click the page reports where the popover stands (or stood a moment ago) is not a click outside: the box keeps the focus', async () => {
    let tell: ((at: { x: number; y: number }) => void) | null = null
    const onPageOutside = vi.fn((fn: (at: { x: number; y: number }) => void) => { tell = fn; return () => { tell = null } })
    const mode = fixtureMode({ holdable: true, onPageOutside, foot: 'new', picked: newsPick() })
    await draw(overlay(mode))
    const box = q('[data-comment-box]') as HTMLElement
    const x = Number.parseFloat(box.style.left) + 20
    const y = Number.parseFloat(box.style.top) + 20
    ;(document.activeElement as HTMLElement | null)?.blur()
    await act(async () => { tell!({ x, y }) })
    expect(mode.close).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(box.querySelector('textarea'))
    await act(async () => { tell!({ x: 1000, y: 700 }) })
    expect(mode.close).toHaveBeenCalledTimes(1)
  })

  it('pick-refocus from the page frame puts the focus back in the open box; from anyone else it does nothing', async () => {
    await draw(createElement('div', null, createElement('iframe', { title: 'page' }), overlay(fixtureMode({ holdable: true, foot: 'new', picked: newsPick() }))))
    const frame = host.querySelector('iframe')!
    const area = q('[data-comment-box] textarea') as HTMLTextAreaElement
    const refocus = (source: MessageEventSource | null) =>
      act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { channel: 'tracy-preview', v: 1, kind: 'pick-refocus' }, origin: 'https://site.test', source })) })
    area.blur()
    await refocus(window)
    expect(document.activeElement).not.toBe(area)
    await refocus(frame.contentWindow)
    expect(document.activeElement).toBe(area)
  })
})

describe('round 5 (acceptance v3 J38): Interactive | Edit never takes the focus out of the page', () => {
  it('a press on either button keeps the focus where it is (a WordPress mobile menu closes when the page loses it); the click still switches', async () => {
    const selectEdit = vi.fn()
    const selectInteractive = vi.fn()
    await draw(createElement(ModeBar, { modes: { visible: true, edit: false, unavailable: false, selectEdit, selectInteractive, reload: vi.fn() } }))
    for (const button of [...host.querySelectorAll('[role="group"] button')] as HTMLButtonElement[]) {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      button.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true)
      await act(async () => { button.click() })
    }
    expect(selectInteractive).toHaveBeenCalledTimes(1)
    expect(selectEdit).toHaveBeenCalledTimes(1)
  })
})

describe('round 5 (runtime 14 lockstep): the layer answers pick-drawn once it has drawn a step', () => {
  it('a pick-step from the page frame is answered after the commit, to that frame and origin only', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked({ x: 40, y: 300, width: 380, height: 40 }) })
    await draw(createElement('div', null, createElement('iframe', { title: 'page' }), overlay(mode)))
    const frame = host.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
    const step = (n: unknown, source: MessageEventSource | null = frame.contentWindow) =>
      act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { channel: 'tracy-preview', v: 1, kind: 'pick-step', step: n }, origin: 'https://site.test', source })) })
    await step(3)
    expect(post).toHaveBeenCalledWith({ channel: 'tracy-preview', v: 1, kind: 'pick-drawn', step: 3 }, 'https://site.test')
    post.mockClear()
    await step(4, window)
    await step('x')
    expect(post).not.toHaveBeenCalled()
  })
})


describe('round 6: the thread card (acceptance v4 thread)', () => {
  const R6 = { x: 40, y: 300, width: 300, height: 40 }
  const longThread = (): { root: ReturnType<typeof comment>; replies: Array<ReturnType<typeof comment>> } => ({
    root: comment(1, 'Root'),
    replies: Array.from({ length: 9 }, (_, i) => comment(i + 2, `Reply ${String(i)}`, { replyTo: 'c1' })),
  })
  /** jsdom lays nothing out: each message sits 50 px under the one before, the list is 2000 px tall. */
  const layout = (): void => {
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-message')
      return id === null ? 0 : Number(id.slice(1)) * 50
    })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-thread-list') ? 2000 : 0
    })
  }

  it('a link to a reply (`threadFocus`) opens the card AT that reply, highlighted — not at the newest', async () => {
    layout()
    const { root, replies } = longThread()
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root, ...replies], threadFocus: 'c3', rects: new Map([['c1', R6]]) })))
    const list = q('[data-thread-list]')!
    expect(list.scrollTop).toBe(3 * 50 - 8)
    expect(q('[data-message="c3"]')!.hasAttribute('data-focus')).toBe(true)
    expect(q('[data-message="c3"]')!.classList.contains(css.threadFocus!)).toBe(true)
    expect(qa('[data-focus]')).toHaveLength(1)
  })

  it('without a focus the card opens at the newest, as before (TH-5)', async () => {
    layout()
    const { root, replies } = longThread()
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root, ...replies], rects: new Map([['c1', R6]]) })))
    expect(q('[data-thread-list]')!.scrollTop).toBe(2000)
    expect(qa('[data-focus]')).toHaveLength(0)
  })

  it('my own reply sent while the list is scrolled up: the list goes down to show it', async () => {
    layout()
    const { root, replies } = longThread()
    const before = fixtureMode({ thread: root, threadMessages: [root, ...replies], ownReplies: 0, rects: new Map([['c1', R6]]) })
    await draw(overlay(before))
    const list = q('[data-thread-list]')!
    list.scrollTop = 100
    await act(async () => { list.dispatchEvent(new Event('scroll')) })
    const mine = comment(20, 'My new reply', { replyTo: 'c1' })
    await draw(overlay(fixtureMode({ ...before, threadMessages: [root, ...replies, mine], ownReplies: 1 })))
    expect(q('[data-thread-list]')!.scrollTop).toBe(2000)
  })

  it('someone else\'s reply arriving while scrolled up does not move the list', async () => {
    layout()
    const { root, replies } = longThread()
    const before = fixtureMode({ thread: root, threadMessages: [root, ...replies], ownReplies: 0, rects: new Map([['c1', R6]]) })
    await draw(overlay(before))
    const list = q('[data-thread-list]')!
    list.scrollTop = 100
    await act(async () => { list.dispatchEvent(new Event('scroll')) })
    const theirs = comment(20, 'Their reply', { replyTo: 'c1', author: MAI })
    await draw(overlay(fixtureMode({ ...before, threadMessages: [root, ...replies, theirs] })))
    expect(q('[data-thread-list]')!.scrollTop).toBe(100)
  })

  // Round 11 (acceptance v5 V5-1): a card opened from a link, or from a tab row while the page still
  // scrolls to the element, is first drawn uncapped (683 px of list) and only then capped beside its
  // element (251 px). A browser keeps `scrollTop` where it was clamped, so the list stood mid-thread.
  describe('the list keeps its aim through every change of the card\'s size until the person scrolls (V5-1)', () => {
    const TALL = 683
    const CAPPED = 251
    /** A browser's list: each message 50 px under the one before, 2000 px in all, `scrollTop` clamped to what fits. */
    const browser = (): { resize: () => void } => {
      layout()
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
        if (!this.hasAttribute('data-thread-list')) return 0
        return this.closest<HTMLElement>('[data-thread]')?.style.maxHeight ? CAPPED : TALL
      })
      const tops = new WeakMap<Element, number>()
      vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) { return tops.get(this) ?? 0 })
      vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
        tops.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)))
      })
      let observe: (() => void) | null = null
      vi.stubGlobal('ResizeObserver', class {
        constructor(fn: () => void) { observe = fn }
        observe(): void {}
        disconnect(): void { observe = null }
      })
      return { resize: () => { observe?.() } }
    }
    afterEach(() => { vi.unstubAllGlobals() })

    it('opened before its element\'s place is known, then capped beside it: at the newest', async () => {
      browser()
      const { root, replies } = longThread()
      const before = fixtureMode({ thread: root, threadMessages: [root, ...replies] })
      await draw(overlay(before))
      expect(q('[data-thread-list]')!.scrollTop).toBe(2000 - TALL)
      await draw(overlay(fixtureMode({ ...before, rects: new Map([['c1', R6]]) })))
      expect(q<HTMLElement>('[data-thread]')!.style.maxHeight).not.toBe('')
      expect(q('[data-thread-list]')!.scrollTop).toBe(2000 - CAPPED)
    })

    it('a link to a late reply: once capped, the list stands AT that reply (highlighted), not where the tall list clamped it', async () => {
      browser()
      const { root, replies } = longThread()
      // Each message 180 px apart: c9 at 1620 px is past what the tall list reaches (2000 − 683 = 1317).
      vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
        const id = this.getAttribute('data-message')
        return id === null ? 0 : Number(id.slice(1)) * 180
      })
      const before = fixtureMode({ thread: root, threadMessages: [root, ...replies], threadFocus: 'c9' })
      await draw(overlay(before))
      expect(q('[data-thread-list]')!.scrollTop).toBe(2000 - TALL)
      await draw(overlay(fixtureMode({ ...before, rects: new Map([['c1', R6]]) })))
      expect(q('[data-thread-list]')!.scrollTop).toBe(9 * 180 - 8)
      expect(q('[data-message="c9"]')!.hasAttribute('data-focus')).toBe(true)
    })

    it('a size change the card is not re-rendered for (an image loading, a font): the observer puts it back', async () => {
      const page = browser()
      const { root, replies } = longThread()
      await draw(overlay(fixtureMode({ thread: root, threadMessages: [root, ...replies] })))
      const list = q<HTMLElement>('[data-thread-list]')!
      // The card is capped from outside React (the same effect as a thumbnail growing the list).
      q<HTMLElement>('[data-thread]')!.style.maxHeight = '371px'
      page.resize()
      expect(list.scrollTop).toBe(2000 - CAPPED)
    })

    it('once the person scrolls the list (wheel), a later change of size leaves it where they put it', async () => {
      browser()
      const { root, replies } = longThread()
      const before = fixtureMode({ thread: root, threadMessages: [root, ...replies] })
      await draw(overlay(before))
      const list = q<HTMLElement>('[data-thread-list]')!
      await act(async () => { list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300 })) })
      list.scrollTop = 400
      await act(async () => { list.dispatchEvent(new Event('scroll')) })
      await draw(overlay(fixtureMode({ ...before, rects: new Map([['c1', R6]]) })))
      expect(list.scrollTop).toBe(400)
    })

    it('a scroll the list did not cause by changing size (a scrollbar drag) is the person\'s too', async () => {
      browser()
      const { root, replies } = longThread()
      const before = fixtureMode({ thread: root, threadMessages: [root, ...replies] })
      await draw(overlay(before))
      const list = q<HTMLElement>('[data-thread-list]')!
      list.scrollTop = 300
      await act(async () => { list.dispatchEvent(new Event('scroll')) })
      await draw(overlay(fixtureMode({ ...before, rects: new Map([['c1', R6]]) })))
      expect(list.scrollTop).toBe(300)
    })
  })

  // Measured on dev 09/10/2026 (TCH account-menu evidence hc-faces-hca-pin2): a one-message thread "On
  // body" — an element taller than the frame, so the card is capped to THREAD_CARD_MIN (160 px) and its
  // list keeps ~53 px for a ~70 px message. Aimed at the list's bottom edge, the card opened with the
  // message's face and author line above the list's top: the person saw only half a bubble.
  describe('the newest message taller than the list: the card opens at that message\'s top (dev 09/10)', () => {
    const BODY = { x: 0, y: -400, width: 1024, height: 4000 }
    const LIST = 53
    const MESSAGE = 70
    /** A browser's list holding one 70 px message under 53 px of room, `scrollTop` clamped to what fits. */
    const cramped = (messages: number): void => {
      vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
        const id = this.getAttribute('data-message')
        if (id !== null) return 39 + 2 + (Number(id.slice(1)) - 1) * MESSAGE
        return this.hasAttribute('data-thread-list') ? 39 : 0
      })
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-message') ? MESSAGE : 0
      })
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-thread-list') ? LIST : 0
      })
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-thread-list') ? 2 + messages * MESSAGE + 2 : 0
      })
      const tops = new WeakMap<Element, number>()
      vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) { return tops.get(this) ?? 0 })
      vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
        tops.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)))
      })
    }
    /** How far the newest message's top edge sits above the list's top edge (0 = its author line in view). */
    const hiddenAbove = (id: string): number => {
      const list = q<HTMLElement>('[data-thread-list]')!
      const message = q<HTMLElement>(`[data-message="${id}"]`)!
      return Math.max(0, list.scrollTop - (message.offsetTop - list.offsetTop))
    }

    it('one message on the body: its face and author line are in view, not scrolled above the card\'s head', async () => {
      cramped(1)
      const root = comment(1, 'Acceptance check of faces (PR #1082) - please ignore')
      await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], rects: new Map([['c1', BODY]]) })))
      expect(q('[data-thread] [data-message="c1"] [data-avatar]')).not.toBeNull()
      expect(hiddenAbove('c1')).toBe(0)
    })

    it('a long thread whose newest reply is tall: the list stands at that reply\'s top, not at the list\'s end', async () => {
      cramped(4)
      const root = comment(1, 'Root')
      const replies = [2, 3, 4].map(n => comment(n, `Reply ${String(n)}`, { replyTo: 'c1', author: n % 2 === 0 ? MAI : LEE }))
      await draw(overlay(fixtureMode({ thread: root, threadMessages: [root, ...replies], rects: new Map([['c1', BODY]]) })))
      expect(hiddenAbove('c4')).toBe(0)
      // …and still the newest: everything before it is above the list's top.
      expect(q<HTMLElement>('[data-thread-list]')!.scrollTop).toBeGreaterThan(0)
    })
  })

  it('the popover, reply and edit boxes count as the Comments tab does: "3600 / 4000"', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'x'.repeat(3600) })))
    expect(q('[data-char-count]')!.textContent).toBe('3600 / 4000')
  })
})

describe('round 11: a box whose comment someone else deleted keeps its words (acceptance v5 V5-3)', () => {
  const R = { x: 40, y: 300, width: 300, height: 40 }
  const KEPT = 'This comment was deleted. Your words are kept.'

  it('the thread card stays with its words and messages, says so in one plain line, and offers Ask Tracy to edit, Add as new comment, Discard', async () => {
    const root = comment(1, 'Root by Mai', { author: MAI, can: { edit: false, delete: false } })
    const mode = fixtureMode({ thread: root, threadMessages: [root], replyText: 'My reply draft', lost: 'thread', rects: new Map([['c1', R]]) })
    await draw(overlay(mode))
    const card = q('[data-thread]')!
    expect(q('[data-lost]')!.textContent).toBe(KEPT)
    expect(q<HTMLTextAreaElement>('[data-thread] textarea')!.value).toBe('My reply draft')
    expect(card.textContent).toContain('Root by Mai')
    // Nothing that acts on the deleted comment: no Reply, no Resolve, no ⋮.
    const labels = buttons(card).map(b => b.textContent)
    expect(labels).not.toContain('Reply')
    expect(labels).not.toContain('Resolve')
    expect(card.querySelector('[aria-haspopup="menu"]')).toBeNull()
    const pressed = (label: string): HTMLButtonElement => buttons(card).find(b => b.textContent?.startsWith(label))!
    await act(async () => { pressed('Ask Tracy to edit').click() })
    await act(async () => { pressed('Add as new comment').click() })
    await act(async () => { pressed('Discard').click() })
    expect([mode.sendLost, mode.addLost, mode.discardLost].map(f => (f as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1, 1])
    // Enter is the card's Enter: to Tracy.
    await press(q('[data-thread] textarea')!, { key: 'Enter' })
    expect(mode.sendLost).toHaveBeenCalledTimes(2)
    expect(mode.sendThread).not.toHaveBeenCalled()
  })

  it('emptied words: Send and Add wait, Discard does not', async () => {
    const root = comment(1, 'Root')
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], replyText: '  ', lost: 'thread' })))
    const card = q('[data-thread]')!
    const state = (label: string): boolean => buttons(card).find(b => b.textContent?.startsWith(label))!.disabled
    expect([state('Ask Tracy to edit'), state('Add as new comment'), state('Discard')]).toEqual([true, true, false])
  })

  it('the edit popover the same way: its words, the line, the three actions; Enter adds (the edit popover\'s Enter keeps words)', async () => {
    const mine = comment(1, 'Say hello')
    const mode = fixtureMode({ foot: 'edit', editing: mine, text: 'Say hello, warmly', lost: 'edit', rects: new Map([['c1', R]]) })
    await draw(overlay(mode))
    const box = q('[role="dialog"]')!
    expect(q('[data-lost]')!.textContent).toBe(KEPT)
    const labels = buttons(box).map(b => b.textContent ?? '')
    expect(labels.some(l => l.startsWith('Save'))).toBe(false)
    expect(labels.some(l => l === 'Delete')).toBe(false)
    await press(q('[role="dialog"] textarea')!, { key: 'Enter' })
    expect(mode.addLost).toHaveBeenCalledTimes(1)
    expect(mode.save).not.toHaveBeenCalled()
  })

  it('no line and the usual buttons while the comment stands', async () => {
    const root = comment(1, 'Root')
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], replyText: 'x' })))
    expect(q('[data-lost]')).toBeNull()
    expect(buttons(q('[data-thread]')!).map(b => b.textContent)).toContain('Reply')
  })

  it('the three new words are translated in every dictionary', () => {
    const dicts = { zh, ...localeDicts } as Record<string, Record<string, string>>
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of ['commentLostKept', 'commentLostAdd', 'commentLostDiscard', 'commentErrNotSentNetwork'] as const) {
        expect(dict[key], `${lang}.${key}`).toBeTruthy()
        expect(dict[key], `${lang}.${key}`).not.toBe(en[key])
      }
    }
  })
})

describe('round 11: over the limit, every box says why in the Comments tab\'s own sentence (L2)', () => {
  const OVER = 'x'.repeat(4001)
  const SENTENCE = 'Too long to save. Keep it to 4000 characters or fewer.'
  const boxes: Array<[string, () => CommentMode, string]> = [
    ['the new-place popover', () => fixtureMode({ foot: 'new', picked: picked(), text: OVER }), '[role="dialog"]'],
    ['the edit popover', () => fixtureMode({ foot: 'edit', editing: comment(1, 'Say hello'), text: OVER, rects: new Map([['c1', { x: 40, y: 300, width: 300, height: 40 }]]) }), '[role="dialog"]'],
    ['the thread card\'s reply box', () => { const root = comment(1, 'Root'); return fixtureMode({ thread: root, threadMessages: [root], replyText: OVER }) }, '[data-thread]'],
  ]
  for (const [name, make, selector] of boxes) {
    it(`${name}: the sentence under the count, in its own box`, async () => {
      await draw(overlay(make()))
      expect(q(`${selector} [data-too-long]`)!.textContent).toBe(SENTENCE)
    })
  }
  it('under the limit: the count only, no sentence', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'x'.repeat(3600) })))
    expect(q('[data-char-count]')).not.toBeNull()
    expect(q('[data-too-long]')).toBeNull()
  })
})

describe('no em-dash in what the Browser tab, its comments and Refresh show (Brian 30/09)', () => {
  it('every dictionary: none of the words these files use carries "—"', async () => {
    const { readdirSync } = await import('node:fs')
    const dir = `${import.meta.dirname}/../src/client`
    const sources = [...readdirSync(dir), ...readdirSync(`${dir}/builtins`).map(f => `builtins/${f}`), ...readdirSync(`${dir}/native`).map(f => `native/${f}`)]
      .filter(f => /\.tsx?$/.test(f) && /browser|comment|refresh/i.test(f) && !f.startsWith('locales'))
    const code = sources.map(f => readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
    const keys = Object.keys(en).filter(key => new RegExp(`['"\`]${key}['"\`]`).test(code))
    expect(keys).toEqual(expect.arrayContaining(['editTitle', 'attachTitle', 'commentLostKept', 'commentErrTooLong', 'refreshReady']))
    const dicts = { zh, en, ...localeDicts } as Record<string, Record<string, string>>
    const dashed = Object.entries(dicts).flatMap(([lang, dict]) => keys.filter(key => dict[key]?.includes('—')).map(key => `${lang}.${key}`))
    expect(dashed).toEqual([])
  })
})

describe('the path line under the new popover\'s head (Akemi\'s edit-mode review E2)', () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 }
  const deep = (level: number): ReturnType<typeof picked> => {
    const p = picked()
    return { ...p, target: { ...p.target, level, levels: [{ tag: 'h1', mark: null, text: 'Ship fast', rect }, { tag: 'div', mark: null, text: '', rect }, { tag: 'section', mark: null, text: '', rect }] } }
  }

  it('outermost first, the current step aria-current and tinted; a step widens the pick to its level', async () => {
    const mode = fixtureMode({ foot: 'new', picked: deep(0), canWiden: true })
    await draw(overlay(mode))
    const line = q('[data-comment-path] nav')!
    const steps = buttons(line)
    expect(steps.map(b => b.textContent)).toEqual(['Section', 'Block', 'Heading'])
    expect(steps.map(b => b.getAttribute('aria-current'))).toEqual([null, null, 'location'])
    expect(steps[2]!.className).toContain(css.commentPathCurrent)
    expect(steps[2]!.title).toBe('Ship fast')
    expect(steps.every(b => !b.disabled && b.tabIndex !== -1)).toBe(true)
    await act(async () => { steps[0]!.click() })
    expect(mode.widen).toHaveBeenCalledWith(2)
    await act(async () => { steps[2]!.click() })
    expect(mode.widen).toHaveBeenCalledTimes(1)
  })

  it('a widened pick keeps the inner steps, so it can go back down', async () => {
    const mode = fixtureMode({ foot: 'new', picked: deep(1), canWiden: true })
    await draw(overlay(mode))
    const steps = buttons(q('[data-comment-path] nav')!)
    expect(steps.map(b => b.getAttribute('aria-current'))).toEqual([null, 'location', null])
    await act(async () => { steps[2]!.click() })
    expect(mode.widen).toHaveBeenCalledWith(0)
  })

  it('a page that cannot widen: the path is shown, the other steps are not pressable', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: deep(0), canWiden: false })))
    expect(buttons(q('[data-comment-path] nav')!).map(b => b.disabled)).toEqual([true, true, false])
  })

  it('no levels reported, or the edit popover: no path line', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked() })))
    expect(q('[data-comment-path]')).toBeNull()
  })
})

describe('small polish (Akemi 01/10/2026, edit-mode review §8)', () => {
  const R = { x: 40, y: 300, width: 300, height: 40 }
  const rule = (selector: string): string => cssText.match(new RegExp(`${selector.replace(/[.:()]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? ''

  it('the pin is 26 px at full opacity in a 2 px white ring with a 1 px dark edge, no shadow, and a 38 px hit area under every bubble', () => {
    expect(AVATAR_PIN_SIZE).toBe(26)
    const pin = rule('.commentAvatarPin')
    expect(pin).toMatch(/width: 26px;/)
    expect(pin).toMatch(/height: 26px;/)
    expect(pin).toMatch(/box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgba\(0, 0, 0, 0\.18\);/)
    expect(pin).not.toMatch(/opacity/)
    expect(pin).not.toMatch(/z-index/)
    const hit = rule('.commentAvatarPin::before')
    // 26 + 2 × 6 = 38.
    expect(hit).toMatch(/inset: -6px;/)
    expect(hit).toMatch(/z-index: -1;/)
  })

  it('P1: the pin stands in the left gutter, its right edge 6 px left of the outline, its top level with the outline\'s', () => {
    const at = avatarPinPlacement(R, 1280)
    expect(at.spot).toBe('gutter')
    expect(at.left + AVATAR_PIN_SIZE).toBe(R.x - 6 - 6)
    expect(at.top).toBe(R.y - 6)
  })

  it('fanned pins still each show most of their bubble', async () => {
    expect(PIN_FAN_PX).toBeGreaterThan(AVATAR_PIN_SIZE / 2)
    expect(PIN_FAN_PX).toBeLessThan(AVATAR_PIN_SIZE)
    const a = comment(1, 'One')
    const b = comment(2, 'Two', { author: MAI })
    // A block with a wide gutter: the second pin steps left, away from the block.
    const wide = { ...R, x: 200 }
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects: new Map([['c1', wide], ['c2', wide]]) })))
    const left = (id: string): number => Number.parseFloat((q(`[data-comment-pin="${id}"]`) as HTMLElement).style.left)
    expect(left('c1') - left('c2')).toBe(PIN_FAN_PX)
    expect(left('c1') + AVATAR_PIN_SIZE).toBeLessThanOrEqual(wide.x - 6)
  })

  it('hover or focus shows "<name> · <n> comment(s)": the open thread\'s live messages, pluralised', async () => {
    const root = comment(1, 'Root', { author: MAI })
    const live = comment(2, 'Reply', { replyTo: 'c1' })
    const gone = comment(3, 'Gone', { replyTo: 'c1', removed: true })
    const lone = comment(4, 'Alone')
    const rects = new Map([['c1', R], ['c4', { ...R, y: 500 }]])
    await draw(overlay(fixtureMode({ comments: [root, live, gone, lone], pageComments: [root, lone], rects })))
    const tip = (id: string): Element => q(`[data-comment-pin="${id}"] [data-pin-tip]`)!
    expect(tip('c1').textContent).toBe('Mai · 2 comments')
    expect(tip('c4').textContent).toBe('Lee · 1 comment')
    expect(tip('c1').getAttribute('aria-hidden')).toBe('true')
    expect(q('[data-comment-pin="c1"]')!.getAttribute('aria-description')).toBe('Mai · 2 comments')
    expect(q('[data-comment-pin="c1"]')!.hasAttribute('title')).toBe(false)
    expect(pinTip('Mai', 1)).toBe('Mai · 1 comment')
    expect(cssText).toMatch(/\.commentPinTip\[data-shown\] \{\s*display: block;/)
  })

  it('the tooltip opens in the gutter at the pin\'s left when the gutter holds it', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 1280 : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 700 : 0 })
    const near = comment(1, 'Edge')
    await draw(overlay(fixtureMode({ pageComments: [near], rects: new Map([['c1', { ...R, x: 1200 }]]) })))
    // The pin stands at 1200 − 38 = 1162: the gutter holds the tooltip, at its left.
    expect(q('[data-comment-pin="c1"] [data-pin-tip]')!.getAttribute('data-side')).toBe('left')
    vi.restoreAllMocks()
  })

  it('pin P1: a narrow gutter puts the tooltip over the pin (never on the block\'s first line), under it at the frame\'s top, ending at the pin near the right edge', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 1280 : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 700 : 0 })
    const a = comment(1, 'Mid')
    const b = comment(2, 'Top')
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects: new Map([['c1', R], ['c2', { ...R, y: 10 }]]) })))
    const tip = (id: string): Element => q(`[data-comment-pin="${id}"] [data-pin-tip]`)!
    expect([tip('c1').getAttribute('data-side'), tip('c1').getAttribute('data-align')]).toEqual(['above', 'start'])
    expect(tip('c2').getAttribute('data-side')).toBe('below')
    expect(pinTipPlace({ left: 1100, top: 300 }, 1280)).toEqual({ side: 'left', align: 'end' })
    expect(pinTipPlace({ left: 100, top: 300 }, 250)).toEqual({ side: 'above', align: 'end' })
    expect(cssText).toMatch(/\.commentPinTip\[data-side='above'\] \{\s*top: auto;\s*bottom: calc\(100% \+ 6px\);/)
    vi.restoreAllMocks()
  })

  it('pin P1: the corner points right at the block from the gutter, and at the block\'s corner from inside it', async () => {
    const a = comment(1, 'Gutter')
    const b = comment(2, 'Inside')
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects: new Map([['c1', R], ['c2', { ...R, x: 20, y: 500 }]]) })))
    expect(q('[data-comment-pin="c1"]')!.getAttribute('data-spot')).toBe('gutter')
    const inside = q('[data-comment-pin="c2"]') as HTMLElement
    expect([inside.getAttribute('data-spot'), inside.style.left, inside.style.top]).toEqual(['inside', '20px', '500px'])
    expect(rule('.commentAvatarPin')).toMatch(/border-radius: 50% 0 50% 50%;/)
    expect(cssText).toMatch(/\.commentAvatarPin\[data-spot='inside'\] \{\s*border-radius: 0 50% 50% 50%;/)
  })

  it('pin P1 flow B2: the open thread\'s pin wears the active ring (2 px white, 2 px brand, no glow); the others do not', async () => {
    const open = comment(1, 'Open')
    const other = comment(2, 'Other', { author: MAI })
    await draw(overlay(fixtureMode({ thread: open, threadMessages: [open], pageComments: [open, other], rects: new Map([['c1', R], ['c2', { ...R, y: 500 }]]) })))
    const pin = (id: string): Element => q(`[data-comment-pin="${id}"]`)!
    expect(pin('c1').hasAttribute('data-active')).toBe(true)
    expect(pin('c1').classList.contains(css.commentPinActive!)).toBe(true)
    expect(pin('c1').getAttribute('aria-expanded')).toBe('true')
    expect(pin('c2').hasAttribute('data-active')).toBe(false)
    expect(pin('c2').getAttribute('aria-expanded')).toBe('false')
    const ring = cssText.match(/\.commentAvatarPin\.commentPinActive \{[^}]*\}/)?.[0] ?? ''
    expect(ring).toMatch(/box-shadow: 0 0 0 2px #fff, 0 0 0 4px var\(--dsw-alias-brand-primary\);/)
    expect(ring).not.toMatch(/blur|rgba/)
  })

  it.each([[1280, 'right'], [400, 'below']] as const)('pin P1: at %i px the thread card (%s) never covers its own pin', async (width, side) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? width : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 700 : 0 })
    const open = comment(1, 'Open')
    const block = { x: 40, y: 200, width: Math.min(300, width - 80), height: 38 }
    await draw(overlay(fixtureMode({ thread: open, threadMessages: [open], pageComments: [open], rects: new Map([['c1', block]]) })))
    const card = q('[role="dialog"]') as HTMLElement
    const pin = q('[data-comment-pin="c1"]') as HTMLElement
    expect(card.getAttribute('data-side')).toBe(side)
    const pinRight = Number.parseFloat(pin.style.left) + AVATAR_PIN_SIZE
    const pinBottom = Number.parseFloat(pin.style.top) + AVATAR_PIN_SIZE
    // Clear of the pin sideways (beside) or below it (under the block).
    expect(Number.parseFloat(card.style.left) >= pinRight || Number.parseFloat(card.style.top) >= pinBottom).toBe(true)
    vi.restoreAllMocks()
  })

  it('a first refused Esc says "Press Esc again to discard" under the field; typing again takes it away', async () => {
    const base = { foot: 'new' as const, picked: picked(), text: 'half a thought', unsaved: true }
    await draw(overlay(fixtureMode(base)))
    const note = (): Element | null => q('[role="dialog"] [aria-live="polite"]')
    expect(note()).not.toBeNull()
    expect(note()!.textContent).toBe('')
    await draw(overlay(fixtureMode({ ...base, flash: 1 })))
    expect(note()!.textContent).toBe('Press Esc again to discard')
    expect(note()!.getAttribute('data-discard-note')).toBe('on')
    // Under the text field, inside the box.
    expect(note()!.previousElementSibling!.querySelector('textarea')).not.toBeNull()
    await draw(overlay(fixtureMode({ ...base, flash: 1, text: 'half a thought, more' })))
    expect(note()!.textContent).toBe('')
  })

  it('the note goes when the box closes, and after the discard window, and a click outside never shows it', async () => {
    vi.useFakeTimers()
    const base = { foot: 'new' as const, picked: picked(), text: 'half a thought', unsaved: true }
    await draw(overlay(fixtureMode(base)))
    await draw(overlay(fixtureMode({ ...base, flash: 1 })))
    expect(q('[data-discard-note="on"]')).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(DISCARD_AGAIN_MS) })
    expect(q('[data-discard-note="on"]')).toBeNull()
    await draw(overlay(fixtureMode({ ...base, flash: 2 })))
    expect(q('[data-discard-note="on"]')).not.toBeNull()
    await draw(overlay(fixtureMode()))
    expect(q('[role="dialog"]')).toBeNull()
    // Reopened with the old count: not this box's refusal.
    await draw(overlay(fixtureMode({ ...base, flash: 2 })))
    expect(q('[data-discard-note="on"]')).toBeNull()
    // A click outside: the border flashes, no note.
    const shield = q('[data-comment-shield]')
    if (shield !== null) await act(async () => { shield.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(q('[data-discard-note="on"]')).toBeNull()
    vi.useRealTimers()
  })

  it('the thread card\'s reply field gets the same note', async () => {
    const root = comment(1, 'Root', { author: MAI })
    const base = { thread: root, threadMessages: [root], pageComments: [root], rects: new Map([['c1', R]]), replyText: 'a reply', unsaved: true }
    await draw(overlay(fixtureMode(base)))
    await draw(overlay(fixtureMode({ ...base, flash: 1 })))
    expect(q('[data-thread="c1"] [data-discard-note="on"]')!.textContent).toBe('Press Esc again to discard')
  })

  it('the flash is one stroke: the box\'s own border in the brand colour, no halo keyframe', () => {
    expect(cssText).not.toMatch(/tracy-comment-flash/)
    const flash = rule('.commentFlash')
    expect(flash).toMatch(/border-color: var\(--dsw-alias-brand-primary\);/)
    expect(flash).not.toMatch(/box-shadow|animation/)
  })
})

describe('the grey pin: a comment whose block the page lost (01/10/2026, edit-mode review bug 3)', () => {
  const R = { x: 40, y: 300, width: 300, height: 40 }
  const rule = (selector: string): string => cssText.match(new RegExp(`${selector.replace(/[.:()[\]]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? ''
  const author = (id: string): string => (q(`[data-comment-pin="${id}"]`) as HTMLElement).style.background

  it('changed: a neutral grey pin (not its author\'s colour) where its block was last seen; the tooltip says why in one more line', async () => {
    const lost = comment(1, 'Shorter please', { author: MAI })
    const fine = comment(2, 'Fine')
    const ghosts = new Map([['c1', { reason: 'changed' as const, rect: { x: 200, y: 300, width: 100, height: 20 } }]])
    await draw(overlay(fixtureMode({ comments: [lost, fine], pageComments: [lost, fine], rects: new Map([['c2', { ...R, y: 500 }]]), ghosts })))
    const pin = q('[data-comment-pin="c1"]') as HTMLElement
    expect(pin.getAttribute('data-ghost')).toBe('changed')
    expect(author('c1')).toBe('rgb(115, 115, 115)')
    expect(author('c2')).not.toBe('rgb(115, 115, 115)')
    expect(q('[data-comment-pin="c2"]')!.hasAttribute('data-ghost')).toBe(false)
    // Placed like any pin, from where the block was: in its left gutter.
    expect([pin.getAttribute('data-spot'), pin.style.top]).toEqual(['gutter', '294px'])
    expect(q('[data-comment-pin="c1"] [data-pin-tip-note]')!.textContent).toBe('This block changed since the comment. Showing where it was.')
    expect(q('[data-comment-pin="c1"] [data-pin-tip]')!.textContent).toBe('Mai · 1 commentThis block changed since the comment. Showing where it was.')
    expect(pin.getAttribute('aria-description')).toBe('Mai · 1 comment. This block changed since the comment. Showing where it was.')
    expect(q('[data-comment-pin="c2"] [data-pin-tip-note]')).toBeNull()
  })

  it('missing and never seen here: the grey pin waits at the frame\'s top corner and says the block is gone', async () => {
    const lost = comment(1, 'Where is it?')
    await draw(overlay(fixtureMode({ comments: [lost], pageComments: [lost], ghosts: new Map([['c1', { reason: 'missing' as const, rect: null }]]) })))
    const pin = q('[data-comment-pin="c1"]') as HTMLElement
    expect(pin.getAttribute('data-ghost')).toBe('missing')
    expect([pin.getAttribute('data-spot'), pin.style.left, pin.style.top]).toEqual(['inside', '14px', '4px'])
    expect(q('[data-comment-pin="c1"] [data-pin-tip-note]')!.textContent).toBe('This block is no longer on the page.')
  })

  it('a live box wins: a comment the page reports a box for has its author\'s pin even if a stale reason lingers', async () => {
    const back = comment(1, 'Back')
    await draw(overlay(fixtureMode({ comments: [back], pageComments: [back], rects: new Map([['c1', R]]), ghosts: new Map([['c1', { reason: 'changed' as const, rect: { ...R, y: 600 } }]]) })))
    expect(q('[data-comment-pin="c1"]')!.hasAttribute('data-ghost')).toBe(false)
  })

  it('its thread card stands by the grey pin and its head carries the one-line note, over the divider (no "(hidden now)")', async () => {
    const root = comment(1, 'Shorter please', { element: { ...comment(1, '').element!, text: 'One month free with JoomlArt' } })
    const ghosts = new Map([['c1', { reason: 'changed' as const, rect: { x: 200, y: 300, width: 300, height: 40 } }]])
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], comments: [root], pageComments: [root], ghosts })))
    const note = q('[data-ghost-note]')!
    expect(note.getAttribute('data-ghost-note')).toBe('changed')
    expect(note.getAttribute('role')).toBe('note')
    expect(note.textContent).toBe('This block changed since the comment. Showing where it was.')
    expect(q('[data-thread-head]')!.hasAttribute('data-has-note')).toBe(true)
    expect(q('[data-thread-head]')!.textContent).toContain('One month free with JoomlArt')
    expect(q('[data-thread-head]')!.textContent).not.toContain('hidden now')
    const card = q('[data-thread="c1"]') as HTMLElement
    // By the block's last place (right of it), not at the frame's corner.
    expect(Number.parseFloat(card.style.left)).toBeGreaterThan(200)
    expect(rule('.threadHead[data-has-note]')).toMatch(/border-bottom: none;/)
    expect(rule('.threadGhostNote')).toMatch(/border-bottom: 1px solid var\(--th-line\);/)
  })

  it('missing: the card says the block is no longer on the page; an ordinary thread has no note', async () => {
    const root = comment(1, 'Gone')
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], comments: [root], pageComments: [root], ghosts: new Map([['c1', { reason: 'missing' as const, rect: null }]]) })))
    expect(q('[data-ghost-note]')!.textContent).toBe('This block is no longer on the page.')
    // The card stands beside the corner pin, never over it.
    expect(Number.parseFloat((q('[data-thread="c1"]') as HTMLElement).style.left)).toBeGreaterThanOrEqual(14 + AVATAR_PIN_SIZE)
    await draw(overlay(fixtureMode({ thread: root, threadMessages: [root], comments: [root], pageComments: [root], rects: new Map([['c1', R]]) })))
    expect(q('[data-ghost-note]')).toBeNull()
    expect(q('[data-thread-head]')!.hasAttribute('data-has-note')).toBe(false)
  })

  it('both notes are in every dictionary', () => {
    for (const [name, dict] of Object.entries(localeDicts as Record<string, Record<string, string>>)) {
      expect(dict.commentGhostChanged, name).toBeTruthy()
      expect(dict.commentGhostMissing, name).toBeTruthy()
    }
    expect([en.commentGhostChanged, zh.commentGhostMissing]).toEqual(['This block changed since the comment. Showing where it was.', '此区块已不在页面上。'])
  })
})

// Akemi 01/10/2026 (dev, kineticakemi): a root and three short replies by one person stood ~300 px tall,
// every message repeating its bubble, name and time; a few more replies and the card covered half the
// preview. Consecutive messages by one person are one run (Slack-style), and the list has a cap.
describe('the thread card groups a person\'s consecutive messages and caps its list (Akemi 01/10/2026)', () => {
  const R = { x: 40, y: 300, width: 300, height: 40 }
  const T0 = Date.now() - 30 * 60_000
  const MIN = 60_000
  const card = (messages: ReturnType<typeof comment>[], over: Partial<CommentMode> = {}): CommentMode =>
    fixtureMode({ thread: messages[0]!, threadMessages: messages, comments: messages, pageComments: [messages[0]!], rects: new Map([['c1', R]]), ...over })
  const heads = (): string[] => qa('[data-thread="c1"] [data-message]').map(m => (m.querySelector('[data-avatar]') === null ? '·' : m.querySelector(`.${css.threadAuthor!}`)!.textContent!))
  const sameRun = (): ReturnType<typeof comment>[] => [
    comment(1, 'Root', { createdAt: T0 }),
    comment(2, 'One', { replyTo: 'c1', createdAt: T0 + MIN }),
    comment(3, 'Two', { replyTo: 'c1', createdAt: T0 + 2 * MIN }),
    comment(4, 'Three', { replyTo: 'c1', createdAt: T0 + 3 * MIN }),
  ]

  it('a root and three replies by one person within 5 min: ONE bubble, name and time; the rest only their words, their time as a tooltip, their ⋮ kept', async () => {
    await draw(overlay(card(sameRun())))
    expect(heads()).toEqual(['Lee', '·', '·', '·'])
    expect(qa('[data-thread="c1"] [data-avatar]')).toHaveLength(1)
    expect(qa(`[data-thread="c1"] .${css.threadAge!}`)).toHaveLength(1)
    const follows = qa('[data-thread="c1"] [data-message][data-follow]')
    expect(follows.map(m => m.textContent)).toEqual(['One', 'Two', 'Three'])
    for (const m of follows) {
      expect(m.querySelector('[title]')!.getAttribute('title')).toMatch(/min ago$/)
      expect(m.querySelector('[aria-label="More"]')).not.toBeNull()
    }
    expect(THREAD_RUN_GAP_MS).toBe(5 * 60_000)
  })

  it('a run breaks when the author changes, after more than 5 min, and at a deleted message\'s spot or a tombstone', async () => {
    await draw(overlay(card([
      comment(1, 'Root', { createdAt: T0 }),
      comment(2, 'Mai answers', { replyTo: 'c1', author: MAI, createdAt: T0 + MIN }),
      comment(3, 'Lee again', { replyTo: 'c1', createdAt: T0 + 2 * MIN }),
      comment(4, 'Exactly 5 min on', { replyTo: 'c1', createdAt: T0 + 7 * MIN }),
      comment(5, 'Over 5 min on', { replyTo: 'c1', createdAt: T0 + 12 * MIN + 1 }),
    ])))
    expect(heads()).toEqual(['Lee', 'Mai', 'Lee', '·', 'Lee'])

    await draw(overlay(card(sameRun(), { deleted: { id: 'c2', left: 4 } })))
    const spots = qa('[data-thread="c1"] [data-message]')
    expect(spots.map(m => m.textContent)).toEqual([expect.stringContaining('Root'), 'Deleted·Undo', expect.stringContaining('Two'), 'Three'])
    expect(spots[2]!.querySelector('[data-avatar]')).not.toBeNull()
    expect(spots[3]!.hasAttribute('data-follow')).toBe(true)

    const [root, ...rest] = sameRun()
    await draw(overlay(card([{ ...root!, text: '', removed: true }, ...rest])))
    expect(heads()).toEqual(['Lee', 'Lee', '·', '·'])
  })

  it('the message list is capped at min(60% of the frame, 320 px) and scrolls inside; head and composer stay outside it', async () => {
    expect([THREAD_LIST_FRAME_SHARE, THREAD_LIST_MAX_PX]).toEqual([0.6, 320])
    expect(threadListMaxHeight({ width: 1024, height: 768 })).toBe(320)
    expect(threadListMaxHeight({ width: 1024, height: 400 })).toBe(240)
    const many = Array.from({ length: 30 }, (_, i) => comment(i + 1, `Message ${String(i)}`, { replyTo: i === 0 ? undefined : 'c1', author: i % 2 === 0 ? LEE : MAI, createdAt: T0 + i * MIN }))
    await draw(overlay(card(many)))
    const list = q<HTMLElement>('[data-thread="c1"] [data-thread-list]')!
    // jsdom has no layout: the overlay falls back to its nominal 1024 × 768 frame.
    expect(list.style.maxHeight).toBe('320px')
    expect(list.querySelector('[data-thread-head]')).toBeNull()
    expect(list.querySelector('[data-thread-compose]')).toBeNull()
    expect(rule('.threadCard > .threadList')).toMatch(/overflow-y: auto;/)
  })

  const rule = (selector: string): string => cssText.match(new RegExp(`${selector.replace(/[.:()>]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? ''

  it('a long run of one person, opened and after their own reply: the list stands at the newest', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-thread-list') ? 2000 : 0
    })
    // A list's own scroll position (an earlier spec's prototype spy must not decide it).
    const tops = new WeakMap<Element, number>()
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) { return tops.get(this) ?? 0 })
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) { tops.set(this, value) })
    const many = Array.from({ length: 12 }, (_, i) => comment(i + 1, `Message ${String(i)}`, { replyTo: i === 0 ? undefined : 'c1', createdAt: T0 + i * MIN }))
    const before = card(many, { ownReplies: 0 })
    await draw(overlay(before))
    const list = q<HTMLElement>('[data-thread-list]')!
    expect(list.scrollTop).toBe(2000)
    list.scrollTop = 100
    await act(async () => { list.dispatchEvent(new Event('scroll')) })
    const mine = comment(13, 'Mine', { replyTo: 'c1', createdAt: T0 + 12 * MIN })
    await draw(overlay(card([...many, mine], { ownReplies: 1 })))
    expect(q<HTMLElement>('[data-thread-list]')!.scrollTop).toBe(2000)
    expect(qa('[data-thread="c1"] [data-avatar]')).toHaveLength(1)
  })
})

describe('a pin\'s tooltip: one at a time, never over an open card (dev 01/10/2026, the tooltip lingering over the Linear logo)', () => {
  const R = { x: 40, y: 300, width: 300, height: 40 }
  const a = comment(1, 'Vercel')
  const b = comment(2, 'Linear')
  const rects = new Map([['c1', R], ['c2', { ...R, y: 500 }]])
  const pin = (id: string): HTMLElement => q(`[data-comment-pin="${id}"]`)!
  const shown = (): string[] => qa('[data-pin-tip][data-shown]').map(el => el.closest('[data-comment-pin]')!.getAttribute('data-comment-pin')!)
  // React builds enter / leave from pointerover / pointerout; relatedTarget null means from / to outside.
  const enter = async (id: string): Promise<void> => { await act(async () => { pin(id).dispatchEvent(new MouseEvent('pointerover', { bubbles: true })) }) }
  const leave = async (id: string): Promise<void> => { await act(async () => { pin(id).dispatchEvent(new MouseEvent('pointerout', { bubbles: true })) }) }

  it('no tooltip until a pointer is on a pin; leaving the pin takes it away', async () => {
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects })))
    expect(shown()).toEqual([])
    await enter('c1')
    expect(shown()).toEqual(['c1'])
    await leave('c1')
    expect(shown()).toEqual([])
  })

  it('hover A, then B: only B\'s; B clicked and its card open: none, A\'s least of all', async () => {
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects })))
    await enter('c1')
    await enter('c2')
    expect(shown()).toEqual(['c2'])
    await act(async () => { (pin('c2') as HTMLButtonElement).click() })
    // The controller opened B's card.
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects, thread: b, threadMessages: [b] })))
    expect(shown()).toEqual([])
    // The pointer still on B once the card closes: B's tooltip again.
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects })))
    expect(shown()).toEqual(['c2'])
  })

  it('with a card open, hovering any pin shows nothing', async () => {
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects, thread: b, threadMessages: [b] })))
    await enter('c1')
    expect(shown()).toEqual([])
    await enter('c2')
    expect(shown()).toEqual([])
  })

  // jsdom cannot tell a Tab from a click: the browser's :focus-visible answer is stubbed.
  const focusVisibleIs = (yes: boolean): void => {
    const real = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) { return selector === ':focus-visible' ? yes : real.call(this, selector) })
  }

  it('keyboard focus shows it, blur takes it away; only one tooltip at a time', async () => {
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects })))
    focusVisibleIs(true)
    await enter('c1')
    await act(async () => { pin('c2').focus() })
    expect(shown()).toEqual(['c2'])
    await act(async () => { pin('c2').blur() })
    expect(shown()).toEqual([])
  })

  it('the focus a click leaves (not :focus-visible) shows nothing once the pointer is gone', async () => {
    await draw(overlay(fixtureMode({ pageComments: [a, b], rects })))
    focusVisibleIs(false)
    await enter('c2')
    await act(async () => { pin('c2').focus() })
    await leave('c2')
    expect(shown()).toEqual([])
  })

  it('CSS draws the tooltip only from data-shown, never from :hover or :focus-visible', () => {
    expect(cssText).toMatch(/\.commentPinTip\[data-shown\] \{\s*display: block;/)
    expect(cssText).not.toMatch(/:hover \.commentPinTip/)
    expect(cssText).not.toMatch(/:focus-visible \.commentPinTip/)
  })
})

describe('the @ picker under a comment box (TCH #809 C1, U6)', () => {
  const people = [{ ...LEE, role: 'owner', you: true }, { ...MAI, role: 'editor' }]
  async function typed(text: string): Promise<{ mode: CommentMode; field: HTMLTextAreaElement }> {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text, setText: vi.fn(), escape: vi.fn(), sendToTracy: vi.fn(), mention: { people, load: vi.fn(), pick: vi.fn() } })
    await draw(overlay(mode))
    const field = q<HTMLTextAreaElement>('[data-comment-box] textarea')!
    field.setSelectionRange(text.length, text.length)
    await act(async () => { field.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    return { mode, field }
  }

  it('lists the site\'s people but the viewer, with name, address and role, and the seat line', async () => {
    const { mode } = await typed('Hi @')
    const list = q('[data-mention-picker]')!
    expect(list).not.toBeNull()
    const rows = qa('[role="option"]')
    expect(rows.map(r => r.textContent)).toEqual(['MMaimai@example.comEditor'])
    expect(rows[0]!.getAttribute('aria-selected')).toBe('true')
    expect(list.textContent).toContain(en.mentionOnlySeats)
    expect(mode.mention.load).toHaveBeenCalled()
  })

  it('a person\'s row wears their server face: the photo when they have one', async () => {
    const withPhoto = [{ ...LEE, role: 'owner', you: true }, { ...MAI, role: 'editor', avatarUrl: 'https://example.com/mai.png' }]
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Hi @', setText: vi.fn(), escape: vi.fn(), sendToTracy: vi.fn(), mention: { people: withPhoto, load: vi.fn(), pick: vi.fn() } })
    await draw(overlay(mode))
    const field = q<HTMLTextAreaElement>('[data-comment-box] textarea')!
    field.setSelectionRange(4, 4)
    await act(async () => { field.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const face = qa('[role="option"]')[0]!.querySelector('[data-tracy-face]')!
    expect(face.querySelector('img')!.getAttribute('src')).toBe('https://example.com/mai.png')
    expect((face as HTMLElement).style.background).toBe(hexToRgb(MAI.color!))
  })

  it('Enter picks: the words get @Mai and the controller hears whom; Ask Tracy is not pressed', async () => {
    const { mode, field } = await typed('Hi @ma')
    const event = await press(field, { key: 'Enter' })
    expect(event.defaultPrevented).toBe(true)
    expect(mode.setText).toHaveBeenCalledWith('Hi @Mai ')
    expect(mode.mention.pick).toHaveBeenCalledWith('popover', expect.objectContaining({ accountId: 'a2' }))
    expect(mode.sendToTracy).not.toHaveBeenCalled()
  })

  it('Esc closes the list only; the box stays', async () => {
    const { mode, field } = await typed('Hi @')
    await press(field, { key: 'Escape' })
    expect(q('[data-mention-picker]')).toBeNull()
    expect(mode.escape).not.toHaveBeenCalled()
  })

  it('no list while the caret is not in an @word, and "no one matches" for a word nobody has', async () => {
    await typed('mail a@b.co')
    expect(q('[data-mention-picker]')).toBeNull()
    await typed('@zz')
    expect(q('[data-mention-picker]')!.textContent).toContain(en.mentionNoMatch)
  })

  it('every dictionary has the picker\'s three lines', () => {
    for (const dict of [en, zh, ...Object.values(localeDicts)]) {
      for (const key of ['mentionPeople', 'mentionOnlySeats', 'mentionNoMatch']) expect((dict as Record<string, string>)[key]).toBeTruthy()
    }
  })
})

// Akemi 05/10/2026 (dev, tracy.ai): the chat column's Comments list drew "@octopal @anhvp.ecom" in
// terracotta while the thread card printed the same words as plain text.
describe('the thread card draws @mentions like the Comments list', () => {
  const root = comment(1, '@octopal @anhvp.ecom cái này', { author: MAI })
  const reply = comment(2, 'kìa @anhvp.ecom, mail a@b.co', { replyTo: 'c1' })
  const card = (): CommentMode => fixtureMode({ thread: root, threadMessages: [root, reply], pageComments: [root], rects: new Map([['c1', { x: 32, y: 300, width: 200, height: 40 }]]) })

  it('each mention in its own span with the mention class; an e-mail address stays plain', async () => {
    await draw(overlay(card()))
    const marks = qa('[data-thread="c1"] [data-mention]')
    expect(marks.map(m => m.textContent)).toEqual(['@octopal', '@anhvp.ecom', '@anhvp.ecom'])
    for (const m of marks) expect(m.className).toContain(css.threadMention)
    const texts = qa(`[data-thread="c1"] .${css.threadText}`).map(el => el.textContent)
    expect(texts).toEqual(['@octopal @anhvp.ecom cái này', 'kìa @anhvp.ecom, mail a@b.co'])
  })
})
