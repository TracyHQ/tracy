/**
 * The HTML preview URL for a path relative to the session (02/10, cowork.tracy.site): a file
 * opened from a chat link carries `TracyWork/…`, and the route encoded it as `/TracyWork/…`,
 * which the host answered with ENOENT. The path is now joined to the session folder first.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { htmlPreviewUrl } from '../src/client/api.ts'

afterEach(() => { vi.unstubAllGlobals() })

function stubSessionCwd(cwd: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    expect(String(input)).toContain('/sidebar/api/session.cwd')
    return new Response(JSON.stringify({ ok: true, value: { sessionId: 's-1', cwd, root: cwd, parent: null } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('htmlPreviewUrl', () => {
  it('keeps an absolute path as it is, asking the host nothing', async () => {
    const fetchMock = stubSessionCwd('/never')
    expect(await htmlPreviewUrl({ sessionId: 's-1' }, '/srv/site/out/a.html')).toBe('/sidebar/html/s-1/srv/site/out/a.html')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('joins a relative path to the scope cwd when the caller has it', async () => {
    const fetchMock = stubSessionCwd('/never')
    expect(await htmlPreviewUrl({ sessionId: 's-1', cwd: '/srv/site/' }, 'TracyWork/deliverables/email.html'))
      .toBe('/sidebar/html/s-1/srv/site/TracyWork/deliverables/email.html')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks the host for the session folder when the scope has no cwd', async () => {
    const fetchMock = stubSessionCwd('/srv/site')
    expect(await htmlPreviewUrl({ sessionId: 's-1' }, 'TracyWork/deliverables/email.html'))
      .toBe('/sidebar/html/s-1/srv/site/TracyWork/deliverables/email.html')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
