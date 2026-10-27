/**
 * The workspace fence must not be an existence oracle (Tracy SEC-2).
 *
 * One dsh serves many sites, so every other site's webroot is mounted in the
 * process that answers the Files tab. Before the fix, `ensureWorkspacePath`
 * resolved the target through `realpath` BEFORE checking containment: a path
 * in another site that did not exist answered 400 `fs-error` (ENOENT), one
 * that existed answered 403 `forbidden` — a seat of site A could probe which
 * files site B has. Every target outside the workspace, existing or not, and
 * whether reached directly or through a symlink planted inside the workspace,
 * must get the same refusal; only paths inside the workspace may say ENOENT.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureWorkspacePath, ensureWorkspaceWritePath } from '../src/path-security.ts'

const canSymlink = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sidebar-symlink-probe-'))
  try {
    symlinkSync('target', join(dir, 'link'))
    return true
  } catch {
    return false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})()

let root = ''
let alpha = ''
let beta = ''

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-sidebar-probe-')))
  alpha = join(root, 'alpha')
  beta = join(root, 'beta')
  mkdirSync(join(alpha, 'webroot'), { recursive: true })
  mkdirSync(join(beta, 'webroot'), { recursive: true })
  writeFileSync(join(beta, 'webroot', 'wp-config.php'), 'secret')
  writeFileSync(join(alpha, 'webroot', 'index.php'), 'alpha')
  if (canSymlink) symlinkSync(join(beta, 'webroot'), join(alpha, 'webroot', 'leak-dir'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The refusal a call ends in, reduced to what a client sees. */
async function outcome(call: () => Promise<unknown>): Promise<{ code?: string; status?: number; message?: string }> {
  try {
    await call()
    return {}
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string }
    return { code: e.code, status: e.status, message: e.message }
  }
}

/** The client-visible message with the probed path itself taken out. */
const shape = (result: { code?: string; status?: number; message?: string }, path: string) => ({
  code: result.code,
  status: result.status,
  message: result.message?.split(path).join('<path>'),
})

describe('workspace fence gives no existence oracle', () => {
  it('a missing target in another site is refused exactly like an existing one (read)', async () => {
    const existing = join(beta, 'webroot', 'wp-config.php')
    const missing = join(beta, 'webroot', 'nope.php')
    const a = await outcome(() => ensureWorkspacePath(alpha, existing))
    const b = await outcome(() => ensureWorkspacePath(alpha, missing))
    expect(a.status).toBe(403)
    expect(shape(b, missing)).toEqual(shape(a, existing))
  })

  it('a missing target under a missing directory of another site is refused the same way', async () => {
    const missing = join(beta, 'no-such-dir', 'x.php')
    const existing = join(beta, 'webroot', 'wp-config.php')
    const a = await outcome(() => ensureWorkspacePath(alpha, existing))
    expect(shape(await outcome(() => ensureWorkspacePath(alpha, missing)), missing)).toEqual(shape(a, existing))
    expect(shape(await outcome(() => ensureWorkspaceWritePath(alpha, missing)), missing)).toEqual(shape(a, existing))
  })

  it.skipIf(!canSymlink)('through a symlink planted in the workspace, missing and existing look the same', async () => {
    const existing = join(alpha, 'webroot', 'leak-dir', 'wp-config.php')
    const missing = join(alpha, 'webroot', 'leak-dir', 'nope.php')
    const a = await outcome(() => ensureWorkspacePath(alpha, existing))
    const b = await outcome(() => ensureWorkspacePath(alpha, missing))
    expect(a.status).toBe(403)
    expect(shape(b, missing)).toEqual(shape(a, existing))
  })

  it('a missing target INSIDE the workspace still reports ENOENT', async () => {
    const result = await outcome(() => ensureWorkspacePath(alpha, join(alpha, 'webroot', 'nope.php')))
    expect(result.status).toBe(400)
    expect(result.code).toBe('fs-error')
    expect(result.message).toMatch(/ENOENT/)
  })

  it('with the fence disarmed, a missing outside target reports ENOENT as before', async () => {
    const result = await outcome(() => ensureWorkspacePath(alpha, join(beta, 'webroot', 'nope.php'), false))
    expect(result.status).toBe(400)
    expect(result.message).toMatch(/ENOENT/)
  })
})
