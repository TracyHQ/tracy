/**
 * Tracy: a file the person downloads from the side panel (Tracy beta week, 21/10/2026: a template zip
 * asked for in the chat came down as `file.json` — the route refused it over the 20 MiB media limit
 * and the bare `<a download>` saved the JSON refusal as the file).
 *
 * - `/sidebar/file?…&download=1` serves up to the upload cap, not the media cap the editor draws under;
 * - a refusal names the size and the limit;
 * - a path relative to the conversation folder (the agent's chat file link) is served, still fenced;
 * - the client fetches first (`saveDownload`) and throws the route's own message on a refusal.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import { saveDownload, downloadName } from '../src/client/save-download.ts'

interface Route { path: string; handler: (req: unknown, res: unknown) => Promise<void> }

function fileRoute(workspace: string, config: { mediaLimit: number; uploadLimit: number }): Route {
  const routes: Route[] = []
  const ctx = {
    webRuntime: { trustedHosts: [] },
    webServer: {
      register: (route: Route) => { routes.push(route); return () => {} },
      registerUpgrade: () => () => {},
    },
    sessions: { get: () => ({ header: { cwd: workspace } }) },
    tools: { register: () => () => {} },
    provide: () => {},
    effect: (fn: () => void | (() => void)) => { fn() },
    inject: () => () => {},
    on: () => () => {},
    get: () => undefined,
  }
  apply(ctx as never, config as never)
  return routes.find(route => route.path === '/sidebar/file')!
}

async function get(route: Route, url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const out = { status: 200, headers: {} as Record<string, string>, body: '' }
  const req = { method: 'GET', url, headers: { host: '127.0.0.1:3080' } }
  const res = {
    writeHead: (status: number, headers?: Record<string, string>) => { out.status = status; out.headers = headers ?? {} },
    end: (chunk: unknown) => { out.body += chunk === undefined ? '' : Buffer.from(chunk as Uint8Array).toString('utf8') },
  }
  await route.handler(req, res)
  return out
}

describe('side-panel download (Tracy)', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  const workspaceWith = (bytes: number): { workspace: string; file: string } => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-sidebar-download-'))
    roots.push(root)
    const workspace = join(root, 'workspace')
    mkdirSync(workspace)
    const file = join(workspace, 'template.zip')
    writeFileSync(file, 'x'.repeat(bytes))
    return { workspace, file }
  }

  it('serves a download over the media limit, up to the upload limit; the editor still keeps the media limit', async () => {
    const { workspace, file } = workspaceWith(64)
    const route = fileRoute(workspace, { mediaLimit: 16, uploadLimit: 128 })
    const q = `/sidebar/file?sessionId=s&path=${encodeURIComponent(file)}`
    const download = await get(route, `${q}&download=1`)
    expect(download.status).toBe(200)
    expect(download.body).toBe('x'.repeat(64))
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''template.zip")
    const shown = await get(route, q)
    expect(shown.status).toBe(400)
    expect(JSON.parse(shown.body)).toMatchObject({ ok: false, error: { code: 'fs-error', message: expect.stringMatching(/^too large/) } })
  })

  it('refuses a download over the upload limit, saying its size and the limit', async () => {
    const { workspace, file } = workspaceWith(3 * 1048576)
    const route = fileRoute(workspace, { mediaLimit: 1048576, uploadLimit: 2 * 1048576 })
    const out = await get(route, `/sidebar/file?sessionId=s&path=${encodeURIComponent(file)}&download=1`)
    expect(out.status).toBe(400)
    expect(JSON.parse(out.body)).toMatchObject({ ok: false, error: { message: 'too large: 3 MB, the limit is 2 MB' } })
  })

  it('serves a path relative to the conversation folder, as the agent writes a file link in the chat', async () => {
    const { workspace } = workspaceWith(32)
    const route = fileRoute(workspace, { mediaLimit: 16, uploadLimit: 128 })
    const out = await get(route, `/sidebar/file?sessionId=s&path=template.zip&cwd=${encodeURIComponent(workspace)}&download=1`)
    expect(out.status).toBe(200)
    expect(out.body).toBe('x'.repeat(32))
  })

  it('still refuses a relative path that leaves the conversation folder', async () => {
    const { workspace } = workspaceWith(8)
    writeFileSync(join(workspace, '..', 'secret.zip'), 'secret')
    const route = fileRoute(workspace, { mediaLimit: 16, uploadLimit: 128 })
    const out = await get(route, `/sidebar/file?sessionId=s&path=${encodeURIComponent('../secret.zip')}&download=1`)
    expect(out.status).toBe(403)
    expect(JSON.parse(out.body)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('saveDownload throws the route’s own message instead of saving the refusal as the file', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, error: { code: 'fs-error', message: 'too large: 30 MB, the limit is 20 MB' } }), { status: 400, headers: { 'content-type': 'application/json' } }))
    await expect(saveDownload('/sidebar/file?download=1', 'template.zip')).rejects.toThrow('too large: 30 MB, the limit is 20 MB')
    vi.stubGlobal('fetch', async () => new Response('forbidden', { status: 403 }))
    await expect(saveDownload('/sidebar/file?download=1', 'template.zip')).rejects.toThrow('HTTP 403')
  })

  it('downloadName is the last segment of the path', () => {
    expect(downloadName('/site/work/ja_seven-modified.zip')).toBe('ja_seven-modified.zip')
    expect(downloadName('')).toBe('download')
  })
})
