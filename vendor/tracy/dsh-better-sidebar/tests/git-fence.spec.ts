/**
 * Tracy: repository discovery must not leave the session workspace. A site
 * folder can carry a `.git` pointer file, a `.git` symlink, `core.worktree`,
 * a linked-worktree `commondir` or object alternates that lead git into
 * another site's repository (one dsh process serves every site on a host).
 * The panel must refuse those, for reads and writes alike, and must never
 * pick up a repository ABOVE the workspace. Every case plants a victim
 * repository outside the workspace and checks that not one byte of it moved.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as git from '../src/git.ts'
import { apply } from '../src/index.ts'
import type { SidebarWebRoute, SidebarWebUpgradeRoute } from '../src/context-types.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' })
}

function initRepo(dir: string, file: string, content: string): void {
  mkdirSync(dir, { recursive: true })
  sh(dir, 'init', '-q', '-b', 'main')
  writeFileSync(join(dir, file), content)
  sh(dir, 'add', file)
  sh(dir, 'commit', '-q', '-m', 'first')
}

/** Every file under `dir` with its content hash and mtime: the "untouched" proof. */
function fingerprint(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        out[full] = `${createHash('sha1').update(readFileSync(full)).digest('hex')}:${statSync(full).mtimeMs}`
      }
    }
  }
  walk(dir)
  return out
}

/** A workspace and, next to it, a victim repository with one changed file. */
function setup(): { base: string; ws: string; victim: string } {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-fence-')))
  dirs.push(base)
  const ws = join(base, 'ws')
  const victim = join(base, 'victim')
  mkdirSync(ws)
  initRepo(victim, 'v.txt', 'victim\n')
  writeFileSync(join(victim, 'v.txt'), 'victim changed\n')
  return { base, ws, victim }
}

/** Every read and write route refuses, and nothing outside the workspace moves. */
async function expectRefused(cwd: string, ws: string, watched: string): Promise<void> {
  const before = fingerprint(watched)
  const forbidden = { code: 'forbidden' }
  await expect(git.status(cwd, undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.diff(cwd, undefined, false, undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.log(cwd, 30, 0, undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.branches(cwd, undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.worktrees(cwd, ws)).rejects.toMatchObject(forbidden)
  await expect(git.stage(cwd, undefined, undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.discard(cwd, 'v.txt', undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.commit(cwd, 'pwned', undefined, ws)).rejects.toMatchObject(forbidden)
  await expect(git.checkout(cwd, 'main', undefined, ws)).rejects.toMatchObject(forbidden)
  expect(fingerprint(watched)).toEqual(before)
}

describe('git discovery stays inside the workspace', () => {
  it('refuses a .git pointer file that leads outside', async () => {
    const { ws, victim } = setup()
    writeFileSync(join(ws, '.git'), `gitdir: ${join(victim, '.git')}\n`)
    writeFileSync(join(ws, 'v.txt'), 'mine\n')
    await expectRefused(ws, ws, victim)
  })

  it('refuses a .git symlink that leads outside', async () => {
    const { ws, victim } = setup()
    symlinkSync(join(victim, '.git'), join(ws, '.git'))
    writeFileSync(join(ws, 'v.txt'), 'mine\n')
    await expectRefused(ws, ws, victim)
  })

  it('refuses core.worktree that leads outside', async () => {
    const { ws, victim } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    sh(ws, 'config', 'core.worktree', victim)
    await expectRefused(ws, ws, victim)
  })

  it('refuses a linked-worktree commondir that leads outside', async () => {
    const { ws, victim } = setup()
    const meta = join(ws, '.meta')
    mkdirSync(meta)
    writeFileSync(join(meta, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(meta, 'commondir'), `${join(victim, '.git')}\n`)
    writeFileSync(join(meta, 'gitdir'), `${join(ws, '.git')}\n`)
    writeFileSync(join(ws, '.git'), `gitdir: ${meta}\n`)
    writeFileSync(join(ws, 'v.txt'), 'mine\n')
    await expectRefused(ws, ws, victim)
  })

  it('refuses object alternates that lead outside', async () => {
    const { ws, victim } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    writeFileSync(join(ws, '.git', 'objects', 'info', 'alternates'), `${join(victim, '.git', 'objects')}\n`)
    await expectRefused(ws, ws, victim)
  })

  it('refuses a symlinked entry of the git dir that leads outside', async () => {
    const { ws, victim } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    rmSync(join(ws, '.git', 'refs'), { recursive: true })
    symlinkSync(join(victim, '.git', 'refs'), join(ws, '.git', 'refs'))
    await expectRefused(ws, ws, victim)
  })

  it('never uses a repository above the workspace', async () => {
    const { base, ws } = setup()
    initRepo(base, 'top.txt', 'top\n')
    writeFileSync(join(base, 'top.txt'), 'top changed\n')
    writeFileSync(join(ws, 'mine.txt'), 'mine\n')
    const before = fingerprint(join(base, '.git'))
    const status = await git.status(ws, undefined, ws).catch((error: unknown) => error)
    // Either "no repository here" or a refusal — never the ancestor's status.
    expect(status).not.toMatchObject({ isRepo: true })
    await expect(git.stage(ws, undefined, undefined, ws)).rejects.toThrow()
    await expect(git.commit(ws, 'pwned', undefined, ws)).rejects.toThrow()
    await expect(git.discard(ws, join(base, 'top.txt'), undefined, ws)).rejects.toThrow()
    expect(fingerprint(join(base, '.git'))).toEqual(before)
    expect(readFileSync(join(base, 'top.txt'), 'utf8')).toBe('top changed\n')
  })

  it('hides and refuses a linked worktree that lives outside', async () => {
    const { base, ws } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    const outsideWt = join(base, 'outside-wt')
    sh(ws, 'worktree', 'add', '-q', '-b', 'away', outsideWt)
    const rows = await git.worktrees(ws, ws)
    expect(rows.map(row => row.branch)).toEqual(['main'])
    await expect(git.resolveWorktree(ws, outsideWt, ws)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('still serves a normal repository and a linked worktree inside the workspace', async () => {
    const { ws } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    const inner = join(ws, 'wt')
    sh(ws, 'worktree', 'add', '-q', '-b', 'feature', inner)
    writeFileSync(join(inner, 'own.txt'), 'changed\n')
    const rows = await git.worktrees(ws, ws)
    expect(rows.map(row => [row.branch, row.changes])).toEqual([['main', 1], ['feature', 1]])
    expect(await git.resolveWorktree(ws, inner, ws)).toBe(inner)
    expect((await git.status(inner, undefined, ws)).entries.map(entry => entry.path)).toEqual(['own.txt'])
    await git.stage(inner, undefined, undefined, ws)
    await git.commit(inner, 'second', undefined, ws)
    expect((await git.log(inner, 30, 0, undefined, ws)).map(entry => entry.subject)).toEqual(['second', 'first'])
  })

  it('serves a session cwd below the repository root when the root is the workspace', async () => {
    const { ws } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    mkdirSync(join(ws, 'sub'))
    writeFileSync(join(ws, 'own.txt'), 'changed\n')
    expect((await git.status(join(ws, 'sub'), undefined, ws)).entries.map(entry => entry.path)).toEqual(['own.txt'])
  })
})

describe('/sidebar/api git routes fence on the session workspace', () => {
  function mount(sessionCwd: string): SidebarWebRoute {
    const routes: SidebarWebRoute[] = []
    const ctx = {
      webRuntime: { trustedHosts: [] },
      webServer: {
        register: (route: SidebarWebRoute) => { routes.push(route); return () => {} },
        registerUpgrade: (route: SidebarWebUpgradeRoute) => { void route; return () => {} },
      },
      sessions: { get: () => ({ header: { cwd: sessionCwd } }) },
      tools: { register: () => () => {} },
      effect: (fn: () => void | (() => void)) => { fn() },
      inject: () => () => {},
      get: () => undefined,
      provide: () => {},
      on: () => () => {},
    }
    apply(ctx as never)
    return routes.find(route => route.path === '/sidebar/api')!
  }

  async function callApi(route: SidebarWebRoute, method: string, payload: unknown): Promise<{ ok: boolean; value?: unknown; error?: { code?: string } }> {
    const body = Buffer.from(JSON.stringify(payload))
    const req = {
      method: 'POST',
      url: `/sidebar/api/${method}`,
      headers: { host: '127.0.0.1:3080' },
      [Symbol.asyncIterator]: async function* () { yield body },
    } as never
    let out = ''
    const res = { writeHead: () => {}, end: (chunk: unknown) => { out += String(chunk ?? '') } } as never
    await route.handler(req, res)
    return JSON.parse(out) as { ok: boolean; value?: unknown; error?: { code?: string } }
  }

  it('serves a client cwd below the repository root and refuses a pointer outside', async () => {
    const { ws, victim } = setup()
    initRepo(ws, 'own.txt', 'own\n')
    mkdirSync(join(ws, 'sub'))
    writeFileSync(join(ws, 'own.txt'), 'changed\n')
    const api = mount(ws)
    const ok = await callApi(api, 'git.status', { sessionId: 's1', cwd: join(ws, 'sub') })
    expect(ok).toMatchObject({ ok: true, value: { isRepo: true } })

    rmSync(join(ws, '.git'), { recursive: true })
    writeFileSync(join(ws, '.git'), `gitdir: ${join(victim, '.git')}\n`)
    const before = fingerprint(victim)
    const refused = await callApi(api, 'git.stage', { sessionId: 's1' })
    expect(refused).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(fingerprint(victim)).toEqual(before)
  })
})
