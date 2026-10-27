// @vitest-environment jsdom
/**
 * A Viewer seat in Edit mode (TCH ADR 0028, `src/client/seat-viewer.ts`): Tracy keeps
 * `<html data-tracy-seat-viewer>` while the seat is a Viewer. A Viewer comments but cannot have Tracy
 * edit, so the popover has no "Ask Tracy to edit", "Note for team" (or Save) is primary and takes Enter,
 * the pointing hint leaves out "ask Tracy to edit", and a thread card's Reply is the one action (primary,
 * Enter). Without the attribute nothing changes.
 *
 * Copied harness: what the Browser tab DRAWS for people comments (Tracy, 29/09/2026; TCH stories
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

import { CommentOverlay } from '../src/client/CommentLayer.tsx'
import { type CommentMode } from '../src/client/comment-controller.ts'
import { SEAT_VIEWER_ATTR, isSeatViewer } from '../src/client/seat-viewer.ts'
import { localeDicts } from '../src/client/chunks/locale.tsx'
import { en } from '../src/client/locales.ts'
import css from '../src/client/sidebar.module.css'
import { MAI, comment, fixtureMode, picked } from './comment-layer-fixture.ts'

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
  document.documentElement.removeAttribute(SEAT_VIEWER_ATTR)
  vi.restoreAllMocks()
})

async function draw(node: ReactElement): Promise<void> {
  root ??= createRoot(host)
  await act(async () => { root!.render(node) })
}

const overlay = (mode: CommentMode): ReactElement => createElement(CommentOverlay, { mode, zoom: 100 })
const q = <T extends Element = HTMLElement>(selector: string): T | null => host.querySelector<T>(selector)
const buttons = (scope: Element): HTMLButtonElement[] => [...scope.querySelectorAll('button')]
const names = (scope: Element): string[] => buttons(scope).map(b => b.getAttribute('aria-label') ?? b.textContent ?? '')
const press = async (el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  await act(async () => { el.dispatchEvent(event) })
  return event
}
const asViewer = (): void => { document.documentElement.setAttribute(SEAT_VIEWER_ATTR, '') }

describe('isSeatViewer', () => {
  it('reads only the attribute Tracy sets', () => {
    expect(isSeatViewer(null)).toBe(false)
    expect(isSeatViewer(document.documentElement)).toBe(false)
    asViewer()
    expect(isSeatViewer(document.documentElement)).toBe(true)
  })
})

describe('a Viewer seat: the new-place popover', () => {
  it('no "Ask Tracy to edit"; "Note for team" is the primary button and says Enter', async () => {
    asViewer()
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })))
    const dialog = q('[role="dialog"]')!
    expect(names(dialog)).toEqual(['Close', 'Note for team↵'])
    const note = buttons(dialog)[1]!
    expect(note.className).toBe(css.commentSend)
    expect(note.title).toBe('Note for team (Enter)')
    expect(dialog.textContent).not.toContain('Ask Tracy')
  })

  it('Enter posts a team note and never sends to Tracy; Shift+Enter is still a new line', async () => {
    asViewer()
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    const area = q('textarea')!
    const enter = await press(area, { key: 'Enter' })
    expect(enter.defaultPrevented).toBe(true)
    expect(mode.addComment).toHaveBeenCalledTimes(1)
    expect(mode.sendToTracy).not.toHaveBeenCalled()
    const shift = await press(area, { key: 'Enter', shiftKey: true })
    expect(shift.defaultPrevented).toBe(false)
    expect(mode.addComment).toHaveBeenCalledTimes(1)
  })

  it('a reopened comment: Save only (primary, Enter), no "Ask Tracy to edit"', async () => {
    asViewer()
    const mine = comment(1, 'Say hello')
    const mode = fixtureMode({ foot: 'edit', editing: mine, text: 'Say hello', pageComments: [mine], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }]]) })
    await draw(overlay(mode))
    const dialog = q('[role="dialog"]')!
    expect(names(dialog)).toEqual(['Close', 'Delete', 'Save↵'])
    await press(q('textarea')!, { key: 'Enter' })
    expect(mode.save).toHaveBeenCalledTimes(1)
    expect(mode.sendToTracy).not.toHaveBeenCalled()
  })

  it('the attribute arriving after the first draw (the role is read late) takes "Ask Tracy to edit" away', async () => {
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })))
    expect(names(q('[role="dialog"]')!)).toEqual(['Close', 'Note for team', 'Ask Tracy to edit↵'])
    await act(async () => { asViewer(); await Promise.resolve() })
    expect(names(q('[role="dialog"]')!)).toEqual(['Close', 'Note for team↵'])
  })
})

describe('an Editor or Owner (no attribute): unchanged', () => {
  it('"Note for team" (click) and primary "Ask Tracy to edit ↵"; Enter sends to Tracy', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    const dialog = q('[role="dialog"]')!
    expect(names(dialog)).toEqual(['Close', 'Note for team', 'Ask Tracy to edit↵'])
    expect(buttons(dialog)[1]!.className).toBe(css.commentSecondary)
    await press(q('textarea')!, { key: 'Enter' })
    expect(mode.sendToTracy).toHaveBeenCalledTimes(1)
    expect(mode.addComment).not.toHaveBeenCalled()
  })

  it('the hint still offers Tracy', async () => {
    await draw(overlay(fixtureMode()))
    expect(q(`.${css.commentHint!}`)!.textContent).toContain('ask Tracy to edit')
  })
})

describe('a Viewer seat: the pointing hint', () => {
  it('says only "Click any block to leave a note · Esc to stop"', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 1024 : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains(css.commentOverlay!) ? 700 : 0 })
    asViewer()
    await draw(overlay(fixtureMode()))
    expect(q(`.${css.commentHint!}`)!.textContent).toBe('Click any block to leave a note· Esc to stop')
  })

  it('every dictionary the fork ships has the Viewer hint, shorter than its full hint', () => {
    expect(en.editHintViewer).toBe('Click any block to leave a note')
    for (const [lang, dict] of Object.entries(localeDicts as Record<string, Record<string, string>>)) {
      expect(dict.editHintViewer, lang).toBeTruthy()
      expect(dict.editHintViewer!.length, lang).toBeLessThan(dict.editHint!.length)
    }
  })
})

describe('a thread card (the reply box under a comment)', () => {
  const root1 = comment(1, 'We have 14 subsidiaries now.', { author: MAI, can: { edit: false, delete: false } })
  const threadMode = (over: Partial<CommentMode> = {}): CommentMode => fixtureMode({ thread: root1, threadMessages: [root1], pageComments: [root1], rects: new Map([['c1', { x: 32, y: 300, width: 200, height: 40 }]]), replyText: 'Words', ...over })
  const foot = (): string[] => {
    const card = q('[data-thread="c1"]')!
    return [...card.querySelectorAll('[data-lost-foot] button, .' + css.commentFootEnd! + ' button')].map(b => b.textContent ?? '')
  }

  it('a Viewer: no "Ask Tracy to edit"; Reply is primary and Enter posts the reply', async () => {
    asViewer()
    const mode = threadMode()
    await draw(overlay(mode))
    expect(foot()).toEqual(['Reply↵'])
    const reply = buttons(q('[data-thread="c1"]')!).find(b => b.textContent === 'Reply↵')!
    expect(reply.className).toBe(css.commentSend)
    expect(reply.title).toBe('Reply (Enter)')
    expect(q('[data-thread="c1"]')!.textContent).not.toContain('Ask Tracy')
    const enter = await press(q('[data-thread] textarea')!, { key: 'Enter' })
    expect(enter.defaultPrevented).toBe(true)
    expect(mode.reply).toHaveBeenCalledTimes(1)
    expect(mode.sendThread).not.toHaveBeenCalled()
  })

  it('a Viewer whose comment lost its block: the lost foot offers no "Ask Tracy to edit"; Enter adds', async () => {
    asViewer()
    const mode = threadMode({ lost: 'thread' })
    await draw(overlay(mode))
    expect(foot()).not.toContain('Ask Tracy to edit')
    await press(q('[data-thread] textarea')!, { key: 'Enter' })
    expect(mode.addLost).toHaveBeenCalledTimes(1)
    expect(mode.sendLost).not.toHaveBeenCalled()
  })

  it('an Editor or Owner: Reply (click) and primary "Ask Tracy to edit ↵"; Enter sends the thread to Tracy', async () => {
    const mode = threadMode()
    await draw(overlay(mode))
    expect(foot()).toEqual(['Reply', 'Ask Tracy to edit↵'])
    await press(q('[data-thread] textarea')!, { key: 'Enter' })
    expect(mode.sendThread).toHaveBeenCalledTimes(1)
    expect(mode.reply).not.toHaveBeenCalled()
  })
})
