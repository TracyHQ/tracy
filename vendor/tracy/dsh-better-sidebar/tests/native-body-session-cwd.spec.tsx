// @vitest-environment jsdom
/**
 * TRACY FORK (TCH R3-1, 06/10/2026): a native tab body resolves its session's
 * workspace root even when the client session list has none.
 *
 * A conversation made with New session gets a list summary without `cwd`, and
 * that summary is not filled in until the page reloads. The native body read
 * the summary only, so the Files tab got `scope.cwd === undefined`, drew
 * "Select a conversation to use the sidebar" and never listed the tree (the
 * browser sent `git.status` without `cwd` and no `fs.trees`), while the shell
 * Sidebar asked the host (`session.cwd`) and got the folder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import type { SessionScope } from '../src/client/api.ts'

const sessionCwd = vi.fn<(scope: SessionScope) => Promise<{ sessionId: string; cwd: string; root: string; parent: string | null }>>()

vi.mock('../src/client/api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/api.ts')>()
  return { ...actual, api: { ...actual.api, sessionCwd: (scope: SessionScope) => sessionCwd(scope) } }
})

const { createNativeTabRecords, NativeTabBody } = await import('../src/client/native/tab-adapter.tsx')
const { createBetterSidebarService } = await import('../src/client/service.ts')
const { createSidebarStore } = await import('../src/client/state.ts')

interface Summary { cwd?: string }

/** A session list whose summaries the test can change and announce. */
function sessionList(byId: Record<string, Summary>) {
  let snapshot = { byId }
  const listeners = new Set<() => void>()
  return {
    list: {
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      getSnapshot: () => snapshot,
    },
    set(next: Record<string, Summary>) {
      snapshot = { byId: next }
      for (const listener of listeners) listener()
    },
  }
}

const flush = async (): Promise<void> => {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

describe('NativeTabBody session cwd', () => {
  let host: HTMLDivElement
  let root: Root | undefined
  const seen: Array<string | undefined> = []

  function mount(sessions: ReturnType<typeof sessionList>, sessionId: string): void {
    const store = createSidebarStore()
    store.setSession(sessionId)
    const service = createBetterSidebarService(store)
    service.registerTab({
      id: 'probe',
      title: 'Probe',
      component: ({ scope }: { scope: SessionScope }) => {
        seen.push(scope.cwd)
        return createElement('div', { 'data-cwd': scope.cwd ?? '' })
      },
    })
    const info = {
      tab: {
        id: 'native-files',
        kind: 'probe',
        title: 'Probe',
        contentId: 'sidebar://probe',
        visible: true,
        navigation: { address: 'sidebar://probe', params: undefined, revision: 0 },
        signal: new AbortController().signal,
      },
    }
    act(() => {
      root = createRoot(host)
      root.render(createElement(NativeTabBody, {
        sessionId,
        ctx: { sessions } as never,
        store,
        service,
        records: createNativeTabRecords(),
        descriptorId: 'probe',
        useTabInfo: () => info,
      }))
    })
  }

  const drawnCwd = (): string | null | undefined => host.querySelector('[data-cwd]')?.getAttribute('data-cwd')

  beforeEach(() => {
    sessionCwd.mockReset()
    seen.length = 0
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    act(() => { root?.unmount() })
    root = undefined
    host.remove()
  })

  it('asks the host for the cwd of a session whose summary has none (a New session)', async () => {
    sessionCwd.mockResolvedValue({ sessionId: 's-new', cwd: '/site/rc2wp01', root: '/', parent: null })
    const sessions = sessionList({ 's-new': {} })
    mount(sessions, 's-new')
    await flush()
    expect(sessionCwd).toHaveBeenCalledWith({ sessionId: 's-new' })
    expect(drawnCwd()).toBe('/site/rc2wp01')
  })

  it('uses the summary cwd without asking the host', async () => {
    const sessions = sessionList({ s1: { cwd: '/site/a' } })
    mount(sessions, 's1')
    await flush()
    expect(sessionCwd).not.toHaveBeenCalled()
    expect(drawnCwd()).toBe('/site/a')
  })

  it('takes the summary cwd once it arrives', async () => {
    sessionCwd.mockResolvedValue({ sessionId: 's-new', cwd: '/site/from-host', root: '/', parent: null })
    const sessions = sessionList({ 's-new': {} })
    mount(sessions, 's-new')
    await flush()
    act(() => { sessions.set({ 's-new': { cwd: '/site/from-summary' } }) })
    await flush()
    expect(drawnCwd()).toBe('/site/from-summary')
  })

  it('keeps the cwd undefined while the host has not answered, and when it refuses', async () => {
    sessionCwd.mockRejectedValue(new Error('403'))
    const sessions = sessionList({ 's-new': {} })
    mount(sessions, 's-new')
    await flush()
    expect(sessionCwd).toHaveBeenCalledTimes(1)
    expect(drawnCwd()).toBe('')
    expect(seen.every(cwd => cwd === undefined)).toBe(true)
  })
})
