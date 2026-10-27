// @vitest-environment jsdom
/**
 * Tracy (rc2 stand, 04/10/2026): a seat's Files tree polls `git.status` every 2.5 s, and
 * dsh-passwords keeps that route to the owner — 53 × 403 in one page. A 403 ends the poll for
 * that slot; any other failure keeps retrying.
 *
 * Tracy (acm stand, 09/10/2026): even that one 403 per slot printed two console errors on a seat's
 * Files tab. The gate now marks the seat's page (`globalThis.__TRACY_SIDEBAR_GIT__ = "off"`), and
 * a page so marked never asks: the tree renders without git badges.
 */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { renderRoot } from './test-utils.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarApiError } from '../src/client/api.ts'
import { useGitStatus } from '../src/client/ui/git-status.ts'

const gitStatus = vi.fn()

vi.mock('../src/client/api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/api.ts')>()
  return { ...actual, api: { ...actual.api, gitStatus: (...args: unknown[]) => gitStatus(...args) } }
})

function Probe({ sessionId }: { sessionId: string }) {
  const view = useGitStatus({ sessionId }, { pollMs: 1_000 })
  return createElement('span', { 'data-error': String(view.error) })
}

afterEach(() => {
  delete (globalThis as { __TRACY_SIDEBAR_GIT__?: unknown }).__TRACY_SIDEBAR_GIT__
  vi.useRealTimers()
  gitStatus.mockReset()
})

describe('git status poll and a 403', () => {
  it('asks once, then never again for that slot', async () => {
    vi.useFakeTimers()
    gitStatus.mockRejectedValue(new SidebarApiError('forbidden', 'forbidden', 403))
    const { unmount } = renderRoot(createElement(Probe, { sessionId: 'seat-403' }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(gitStatus).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('keeps asking after any other failure', async () => {
    vi.useFakeTimers()
    gitStatus.mockRejectedValue(new SidebarApiError('boom', 'boom', 500))
    const { unmount } = renderRoot(createElement(Probe, { sessionId: 'seat-500' }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(gitStatus.mock.calls.length).toBeGreaterThan(1)
    unmount()
  })

  it('never asks on a page the gate marked git-off, and shows no error', async () => {
    vi.useFakeTimers()
    ;(globalThis as { __TRACY_SIDEBAR_GIT__?: unknown }).__TRACY_SIDEBAR_GIT__ = 'off'
    gitStatus.mockRejectedValue(new SidebarApiError('forbidden', 'forbidden', 403))
    const { container, unmount } = renderRoot(createElement(Probe, { sessionId: 'seat-flagged' }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(gitStatus).not.toHaveBeenCalled()
    expect(container.querySelector('span')?.getAttribute('data-error')).toBe('false')
    unmount()
  })
})
