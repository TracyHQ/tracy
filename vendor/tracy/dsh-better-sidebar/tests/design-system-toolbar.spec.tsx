// @vitest-environment jsdom
/**
 * The Browser toolbar's Design system button (TCH feat/design-system-button): the store keeps Tracy's
 * latest state per site, and the button draws exactly what it says — nothing without a state or on
 * `hidden`, inert with its reason on `off` — and sends the press back with the site and conversation.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDesignSystemToolbarStore,
  DESIGN_SYSTEM_TOOLBAR_PRESS_EVENT,
  DESIGN_SYSTEM_TOOLBAR_STATE_EVENT,
  readDesignSystemToolbarState,
  type DesignSystemToolbarStore,
} from '../src/client/design-system-toolbar.ts'
import { DesignSystemToolbarButton } from '../src/client/DesignSystemToolbarButton.tsx'

const TEXT = { label: 'Design system', tooltip: 'Choose a design system for this site' }
const say = (target: EventTarget, detail: unknown): void => {
  target.dispatchEvent(new CustomEvent(DESIGN_SYSTEM_TOOLBAR_STATE_EVENT, { detail }))
}

describe('reading a state', () => {
  it('keeps a well-formed state and refuses one without a site or a name', () => {
    expect(readDesignSystemToolbarState({ siteKey: 's', state: 'ready', text: TEXT })).toEqual({ siteKey: 's', state: 'ready', text: TEXT })
    expect(readDesignSystemToolbarState({ siteKey: '', state: 'ready', text: TEXT })).toBeNull()
    expect(readDesignSystemToolbarState({ siteKey: 's', state: 'busy', text: TEXT })).toBeNull()
    expect(readDesignSystemToolbarState({ siteKey: 's', state: 'ready', text: { label: '', tooltip: '' } })).toBeNull()
  })
})

describe('the button', () => {
  let target: EventTarget
  let store: DesignSystemToolbarStore
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    target = new EventTarget()
    store = createDesignSystemToolbarStore(target)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => { root.unmount() })
    host.remove()
    store.dispose()
  })
  const draw = (siteKey: string | null, compact = false, onPress?: () => void): void => {
    act(() => { root.render(createElement(DesignSystemToolbarButton, { siteKey, sessionId: 'sess-1', compact, store, target, onPress })) })
  }

  it('draws nothing until Tracy says a state for this site, and nothing on hidden', () => {
    draw('site-1')
    expect(host.querySelector('button')).toBeNull()
    act(() => { say(target, { siteKey: 'site-2', state: 'ready', text: TEXT }) })
    expect(host.querySelector('button')).toBeNull()
    act(() => { say(target, { siteKey: 'site-1', state: 'hidden', text: TEXT }) })
    expect(host.querySelector('button')).toBeNull()
  })

  it('ready: shows the word and sends the press with the site and the conversation', () => {
    const pressed = vi.fn()
    const before = vi.fn()
    target.addEventListener(DESIGN_SYSTEM_TOOLBAR_PRESS_EVENT, e => pressed((e as CustomEvent).detail))
    draw('site-1', false, before)
    act(() => { say(target, { siteKey: 'site-1', state: 'ready', text: TEXT }) })
    const button = host.querySelector('button')!
    expect(button.textContent).toBe('Design system')
    expect(button.title).toBe(TEXT.tooltip)
    act(() => { button.click() })
    expect(before).toHaveBeenCalledOnce()
    expect(pressed).toHaveBeenCalledWith({ siteKey: 'site-1', sessionId: 'sess-1' })
  })

  it('off: inert, its tooltip says why; compact: the icon alone, named for assistive tech', () => {
    const pressed = vi.fn()
    target.addEventListener(DESIGN_SYSTEM_TOOLBAR_PRESS_EVENT, pressed)
    draw('site-1', true)
    act(() => { say(target, { siteKey: 'site-1', state: 'off', text: { label: 'Design system', tooltip: 'Not available on this site' } }) })
    const button = host.querySelector('button')!
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Design system')
    expect(button.textContent).toBe('')
    expect(button.title).toBe('Not available on this site')
    act(() => { button.click() })
    expect(pressed).not.toHaveBeenCalled()
  })
})
