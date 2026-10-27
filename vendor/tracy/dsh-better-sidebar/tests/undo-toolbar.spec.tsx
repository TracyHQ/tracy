// @vitest-environment jsdom
/**
 * The Browser toolbar's Undo button (TCH #957, `tasks/undo-change/toolbar-contract.md`): the store keeps
 * Tracy's latest state per conversation, and the button draws exactly what that state says — nothing
 * without one or on `hidden`, its cards and its one-time notice, and the presses it sends back.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNDO_TOOLBAR_PRESS_EVENT, UNDO_TOOLBAR_STATE_EVENT } from '../src/client/comment-store.ts'
import { createUndoToolbarStore, readUndoToolbarState, shownUndoState, type UndoToolbarStore } from '../src/client/undo-toolbar.ts'
import { UNDO_TOAST_MS, UndoToolbarButton } from '../src/client/UndoToolbarButton.tsx'

const TEXT = {
  label: 'Undo',
  tooltip: 'Undo your last request',
  confirmTitle: 'Undo your last request?',
  confirmQuote: 'Make the header blue',
  confirmBody: 'Puts back: header',
  confirmUndo: 'Undo it',
  cancel: 'Cancel',
  blockedTitle: "Can't undo your last request",
  blockedBody: 'Someone changed it after',
  blockedAction: 'Open Site changes',
  working: 'Undoing…',
  toastDone: 'Undone: Make the header blue',
  toastAction: 'Site changes',
}

function state(sessionId: string, value: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { sessionId, siteKey: 'site-1', state: value, text: TEXT, ...extra }
}

const say = (target: EventTarget, detail: unknown): void => {
  target.dispatchEvent(new CustomEvent(UNDO_TOOLBAR_STATE_EVENT, { detail }))
}

describe('the store', () => {
  let target: EventTarget
  let store: UndoToolbarStore
  beforeEach(() => { target = new EventTarget(); store = createUndoToolbarStore(target) })
  afterEach(() => { store.dispose() })

  it('keeps each conversation apart, and the latest state of each wins', () => {
    say(target, state('s1', 'ready'))
    say(target, state('s2', 'off'))
    say(target, state('s1', 'working'))
    expect(store.get('s1')?.state).toBe('working')
    expect(store.get('s2')?.state).toBe('off')
    expect(store.get('s3')).toBeNull()
  })

  it('keeps a state said before anyone subscribed, and tells subscribers of the next one', () => {
    say(target, state('s1', 'ready'))
    const heard = vi.fn()
    store.subscribe(heard)
    expect(store.get('s1')?.state).toBe('ready')
    say(target, state('s1', 'blocked'))
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('ignores a malformed detail (no session, unknown state, no label or tooltip)', () => {
    say(target, state('s1', 'ready'))
    say(target, state('', 'off'))
    say(target, state('s1', 'gone'))
    say(target, { sessionId: 's1', state: 'off', text: { label: 'Undo' } })
    say(target, null)
    expect(store.get('s1')?.state).toBe('ready')
  })

  it('reads the words and the toast it is given, dropping what is not a string', () => {
    const read = readUndoToolbarState({ sessionId: 's1', state: 'ready', text: { label: 'U', tooltip: 'T', cancel: 3 }, toast: 'partial' })
    expect(read).toEqual({ sessionId: 's1', siteKey: '', state: 'ready', text: { label: 'U', tooltip: 'T' }, toast: 'partial' })
    expect(readUndoToolbarState(state('s1', 'ready', { toast: 'other' }))?.toast).toBeNull()
  })

  it('draws nothing for no state and for hidden', () => {
    expect(shownUndoState(null)).toBeNull()
    expect(shownUndoState(readUndoToolbarState(state('s1', 'hidden')))).toBeNull()
    expect(shownUndoState(readUndoToolbarState(state('s1', 'off')))?.state).toBe('off')
  })
})

describe('the button', () => {
  let host: HTMLDivElement
  let root: Root | null = null
  let target: EventTarget
  let store: UndoToolbarStore
  let presses: unknown[]
  const onPress = (event: Event): void => { presses.push((event as CustomEvent).detail) }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    target = new EventTarget()
    store = createUndoToolbarStore(target)
    presses = []
    target.addEventListener(UNDO_TOOLBAR_PRESS_EVENT, onPress)
  })
  afterEach(async () => {
    if (root !== null) await act(async () => { root!.unmount() })
    root = null
    host.remove()
    store.dispose()
    vi.useRealTimers()
  })

  async function draw(sessionId = 's1', onOpenChanges?: () => void): Promise<void> {
    root ??= createRoot(host)
    await act(async () => { root!.render(createElement(UndoToolbarButton, { sessionId, compact: false, store, target, onOpenChanges })) })
  }
  const tell = async (detail: unknown): Promise<void> => { await act(async () => { say(target, detail) }) }
  const button = (): HTMLButtonElement | null => host.querySelector('button')
  const dialog = (): HTMLElement | null => document.body.querySelector('[role="dialog"]')
  const click = async (el: Element): Promise<void> => { await act(async () => { (el as HTMLElement).click() }) }
  const dialogButton = (name: string): HTMLButtonElement => [...dialog()!.querySelectorAll('button')].find(b => b.textContent === name)!

  it('draws nothing while no state was said for its conversation, nor for another conversation, nor on hidden', async () => {
    await draw()
    expect(host.innerHTML).toBe('')
    await tell(state('s2', 'ready'))
    expect(host.innerHTML).toBe('')
    await tell(state('s1', 'hidden'))
    expect(host.innerHTML).toBe('')
  })

  it('ready: its name and tooltip are the words said; the confirm card sends confirm and closes', async () => {
    await draw()
    await tell(state('s1', 'ready'))
    expect(button()!.getAttribute('aria-label')).toBe('Undo')
    expect(button()!.title).toBe('Undo your last request')
    expect(button()!.getAttribute('aria-disabled')).toBeNull()
    await click(button()!)
    expect(dialog()!.getAttribute('aria-label')).toBe('Undo your last request?')
    expect(dialog()!.querySelector('q')!.textContent).toBe('Make the header blue')
    expect(dialog()!.textContent).toContain('Puts back: header')
    await click(dialogButton('Undo it'))
    expect(presses).toEqual([{ sessionId: 's1', action: 'confirm' }])
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(button())
  })

  it('Cancel and Escape close the card without a press, the focus back on the button', async () => {
    await draw()
    await tell(state('s1', 'ready'))
    await click(button()!)
    await click(dialogButton('Cancel'))
    expect(dialog()).toBeNull()
    await click(button()!)
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(dialog()).toBeNull()
    expect(presses).toEqual([])
    expect(document.activeElement).toBe(button())
  })

  it('off and working: inert, the tooltip explains; working shows its words', async () => {
    await draw()
    await tell(state('s1', 'off', { text: { ...TEXT, tooltip: 'Tracy is working' } }))
    expect(button()!.getAttribute('aria-disabled')).toBe('true')
    expect(button()!.title).toBe('Tracy is working')
    await click(button()!)
    expect(dialog()).toBeNull()
    await tell(state('s1', 'working'))
    expect(button()!.getAttribute('aria-disabled')).toBe('true')
    expect(button()!.textContent).toBe('Undoing…')
    await click(button()!)
    expect(dialog()).toBeNull()
    expect(presses).toEqual([])
  })

  it('blocked: a card with the reason whose action sends open-changes (after leaving fullscreen)', async () => {
    const leave = vi.fn()
    await draw('s1', leave)
    await tell(state('s1', 'blocked'))
    await click(button()!)
    expect(dialog()!.getAttribute('aria-label')).toBe("Can't undo your last request")
    expect(dialog()!.textContent).toContain('Someone changed it after')
    await click(dialogButton('Open Site changes'))
    expect(leave).toHaveBeenCalledTimes(1)
    expect(presses).toEqual([{ sessionId: 's1', action: 'open-changes' }])
    expect(dialog()).toBeNull()
  })

  it('an open card closes when Tracy moves on', async () => {
    await draw()
    await tell(state('s1', 'ready'))
    await click(button()!)
    expect(dialog()).not.toBeNull()
    await tell(state('s1', 'working'))
    expect(dialog()).toBeNull()
  })

  it('a toast shows once per state, its action opens Site changes, and it leaves after 6 s', async () => {
    vi.useFakeTimers()
    await draw()
    const done = state('s1', 'ready', { toast: 'done' })
    await tell(done)
    const notice = (): HTMLElement | null => host.querySelector('[role="status"]')
    expect(notice()!.textContent).toContain('Undone: Make the header blue')
    await act(async () => { vi.advanceTimersByTime(UNDO_TOAST_MS) })
    expect(notice()).toBeNull()
    // The same state object again (a re-render, a remount): no second notice.
    await draw()
    await tell(done)
    expect(notice()).toBeNull()
    // A new state with a toast: a new notice; its action sends open-changes and closes it.
    await tell(state('s1', 'ready', { toast: 'partial' }))
    expect(notice()).not.toBeNull()
    await click([...notice()!.querySelectorAll('button')].find(b => b.textContent === 'Site changes')!)
    expect(presses).toEqual([{ sessionId: 's1', action: 'open-changes' }])
    expect(notice()).toBeNull()
  })
})
