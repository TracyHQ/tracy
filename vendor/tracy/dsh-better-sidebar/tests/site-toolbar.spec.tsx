// @vitest-environment jsdom
/**
 * The Browser toolbar's Publish and More buttons (TCH fix/ds-templates-local): the store keeps Tracy's
 * latest state per site and asks for it once at creation; the buttons draw exactly what it says and
 * send each press back with the site, the conversation, the action and the pressed button.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSiteToolbarStore,
  readSiteToolbarState,
  SITE_TOOLBAR_ASK_EVENT,
  SITE_TOOLBAR_PRESS_EVENT,
  SITE_TOOLBAR_STATE_EVENT,
  type SiteToolbarStore,
} from '../src/client/site-toolbar.ts'
import { SiteToolbarButtons } from '../src/client/SiteToolbarButtons.tsx'

const say = (target: EventTarget, detail: unknown): void => {
  target.dispatchEvent(new CustomEvent(SITE_TOOLBAR_STATE_EVENT, { detail }))
}

describe('reading a state', () => {
  it('keeps a site and its two words, an empty or missing word reads null', () => {
    expect(readSiteToolbarState({ siteKey: 's', publish: 'Publish', more: 'More' })).toEqual({ siteKey: 's', publish: 'Publish', more: 'More' })
    expect(readSiteToolbarState({ siteKey: 's', publish: '', more: 7 })).toEqual({ siteKey: 's', publish: null, more: null })
    expect(readSiteToolbarState({ siteKey: '', publish: 'Publish' })).toBeNull()
    expect(readSiteToolbarState(null)).toBeNull()
  })

  it('a new store asks Tracy for the state once', () => {
    const target = new EventTarget()
    const asked = vi.fn()
    target.addEventListener(SITE_TOOLBAR_ASK_EVENT, asked)
    const store = createSiteToolbarStore(target)
    expect(asked).toHaveBeenCalledOnce()
    store.dispose()
  })
})

describe('the buttons', () => {
  let target: EventTarget
  let store: SiteToolbarStore
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    target = new EventTarget()
    store = createSiteToolbarStore(target)
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
    act(() => { root.render(createElement(SiteToolbarButtons, { siteKey, sessionId: 'sess-1', compact, store, target, onPress })) })
  }

  it('draws nothing until Tracy says a state for this site', () => {
    draw('site-1')
    expect(host.querySelector('button')).toBeNull()
    act(() => { say(target, { siteKey: 'site-2', publish: 'Publish', more: 'More' }) })
    expect(host.querySelector('button')).toBeNull()
  })

  it('draws only the buttons Tracy names: no Publish while the publish state is unknown', () => {
    draw('site-1')
    act(() => { say(target, { siteKey: 'site-1', publish: null, more: 'More' }) })
    expect(host.querySelector('[data-site-toolbar="publish"]')).toBeNull()
    expect(host.querySelector('[data-site-toolbar="more"]')).not.toBeNull()
  })

  it('Publish then More, each press sent with the site, the conversation, the action and the button', () => {
    const pressed = vi.fn()
    const before = vi.fn()
    target.addEventListener(SITE_TOOLBAR_PRESS_EVENT, e => pressed((e as CustomEvent).detail))
    draw('site-1', false, before)
    act(() => { say(target, { siteKey: 'site-1', publish: 'Publish', more: 'More' }) })
    const [publish, more] = [...host.querySelectorAll('button')]
    expect(publish!.textContent).toBe('Publish')
    expect(more!.getAttribute('aria-label')).toBe('More')
    expect(more!.getAttribute('aria-haspopup')).toBe('menu')
    act(() => { publish!.click() })
    expect(pressed).toHaveBeenLastCalledWith({ siteKey: 'site-1', sessionId: 'sess-1', action: 'publish', anchor: publish })
    act(() => { more!.click() })
    expect(pressed).toHaveBeenLastCalledWith({ siteKey: 'site-1', sessionId: 'sess-1', action: 'more', anchor: more })
    expect(before).toHaveBeenCalledTimes(2)
  })

  it('compact: Publish is its icon alone, named for assistive tech', () => {
    draw('site-1', true)
    act(() => { say(target, { siteKey: 'site-1', publish: 'Publish', more: 'More' }) })
    const publish = host.querySelector('[data-site-toolbar="publish"]')!
    expect(publish.textContent).toBe('')
    expect(publish.getAttribute('aria-label')).toBe('Publish')
  })
})
