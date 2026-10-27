/**
 * Agent-opens push socket: what counts as a failed connection (TCH SB-1, 11/10/2026).
 *
 * The loop gives up after FAILURE_LIMIT consecutive failures and says so on the console. A socket
 * that OPENED and later closed — an idle proxy timeout, a host restart — is not a failed connection:
 * it reconnects with a fresh count. Before the fix every close counted, open or not, so a page left
 * on a session for a few minutes logged "[dsh-better-sidebar] agent-opens connection failed" and
 * stopped receiving the agent's opens for good, although every connection had worked.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import { setupReactAct } from './test-utils.ts'
setupReactAct()

import { useHostFeeds } from '../src/client/sidebar/use-host-feeds.ts'
import { createSidebarStore } from '../src/client/state.ts'

/** Every socket the hook made, newest last; each one can be opened and closed by the test. */
const sockets: FakeWebSocket[] = []

class FakeWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(readonly url: string) {
    sockets.push(this)
  }
  close = (): void => {
    if (this.closed) return
    this.closed = true
    this.onclose?.()
  }
  /** The server accepted the upgrade. */
  open(): void {
    this.onopen?.()
  }
  /** The connection went away (idle timeout, restart, refusal). */
  drop(): void {
    this.close()
  }
}

function Harness({ ctx, store, sessionId }: { ctx: never; store: ReturnType<typeof createSidebarStore>; sessionId: string }) {
  useHostFeeds({ ctx, store, sessionList: { byId: {} }, sessionId })
  return null
}

function mount(sessionId: string): () => void {
  vi.stubGlobal('WebSocket', FakeWebSocket)
  const list = { byId: {} }
  const ctx = {
    sessions: { list: { subscribe: () => () => {}, getSnapshot: () => list } },
    get: () => undefined,
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(createElement(Harness, { ctx: ctx as never, store: createSidebarStore(), sessionId }))
  })
  return () => {
    act(() => { root.unmount() })
    container.remove()
  }
}

afterEach(() => {
  sockets.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('agent-opens reconnect loop', () => {
  it('keeps reconnecting, silently, while every connection opened before it closed', () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unmount = mount('session-idle')
    for (let i = 0; i < 6; i++) {
      const socket = sockets.at(-1)!
      socket.open()
      socket.drop()
      act(() => { vi.advanceTimersByTime(2_000) })
    }
    // Seven sockets: the first and one per drop — the loop never gave up.
    expect(sockets).toHaveLength(7)
    expect(error).not.toHaveBeenCalled()
    unmount()
  })

  it('still gives up after three connections in a row that never opened', () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unmount = mount('session-refused')
    for (let i = 0; i < 3; i++) {
      sockets.at(-1)!.drop()
      act(() => { vi.advanceTimersByTime(2_000) })
    }
    expect(sockets).toHaveLength(3)
    // A host that refuses the push channel is reported, once, and the loop stops.
    expect(warn.mock.calls.length + error.mock.calls.length).toBe(1)
    unmount()
  })
})
