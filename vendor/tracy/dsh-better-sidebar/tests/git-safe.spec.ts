/**
 * Tracy: the sidebar runs git inside the host's single dsh process, on a
 * repository the customer's agent can write (`.git/config`, `.gitattributes`,
 * `.git/hooks`). Git executes programs named by that repository's own config,
 * so every call must be unable to run them. Each case plants a program that
 * would `touch` a marker file and drives the real exported function; the
 * marker must never appear and the panel data must still be correct.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as git from '../src/git.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  })
}

/** A repository with one committed file `a.txt` and a marker path outside it. */
function scratch(): { repo: string; marker: string; touch: string } {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-safe-')))
  dirs.push(base)
  const repo = join(base, 'repo')
  mkdirSync(repo)
  sh(repo, 'init', '-q', '-b', 'main')
  sh(repo, 'config', 'user.name', 't')
  sh(repo, 'config', 'user.email', 't@t')
  writeFileSync(join(repo, 'a.txt'), 'one\n')
  sh(repo, 'add', 'a.txt')
  sh(repo, 'commit', '-q', '-m', 'first')
  const marker = join(base, 'PWNED')
  return { repo, marker, touch: `touch '${marker}'` }
}

function appendConfig(repo: string, text: string): void {
  writeFileSync(join(repo, '.git', 'config'), readFileSync(join(repo, '.git', 'config'), 'utf8') + text)
}

describe('git never runs programs named by the repository', () => {
  it('ignores core.fsmonitor in the repository config (status)', async () => {
    const { repo, marker, touch } = scratch()
    appendConfig(repo, `[core]\n\tfsmonitor = "${touch}"\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    const result = await git.status(repo)
    expect(existsSync(marker)).toBe(false)
    expect(result.entries.map(entry => entry.path)).toEqual(['a.txt'])
  })

  it('ignores core.fsmonitor pulled in through include.path and includeIf', async () => {
    const { repo, marker, touch } = scratch()
    const included = join(repo, '..', 'evil.cfg')
    writeFileSync(included, `[core]\n\tfsmonitor = "${touch}"\n`)
    appendConfig(repo, `[include]\n\tpath = ${included}\n[includeIf "gitdir:/"]\n\tpath = ${included}\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    const result = await git.status(repo)
    expect(existsSync(marker)).toBe(false)
    expect(result.entries.map(entry => entry.path)).toEqual(['a.txt'])
  })

  it('ignores extensions.worktreeConfig + config.worktree', async () => {
    const { repo, marker, touch } = scratch()
    appendConfig(repo, `[extensions]\n\tworktreeConfig = true\n`)
    sh(repo, 'config', 'core.repositoryformatversion', '1')
    writeFileSync(join(repo, '.git', 'config.worktree'), `[core]\n\tfsmonitor = "${touch}"\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    const result = await git.status(repo)
    expect(existsSync(marker)).toBe(false)
    expect(result.entries.map(entry => entry.path)).toEqual(['a.txt'])
  })

  it('ignores clean filter drivers (status, diff, stage)', async () => {
    const { repo, marker, touch } = scratch()
    writeFileSync(join(repo, '.gitattributes'), '*.txt filter=evil\n')
    appendConfig(repo, `[filter "evil"]\n\tclean = "${touch}; cat"\n\tsmudge = "${touch}; cat"\n\tprocess = "${touch}"\n\trequired = true\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    const result = await git.status(repo)
    expect(result.entries.map(entry => entry.path).sort()).toEqual(['.gitattributes', 'a.txt'])
    const text = await git.diff(repo, 'a.txt', false)
    expect(text).toContain('+two')
    await git.stage(repo, 'a.txt')
    expect(await git.diff(repo, 'a.txt', true)).toContain('+two')
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores smudge filter drivers (discard, checkout)', async () => {
    const { repo, marker, touch } = scratch()
    sh(repo, 'branch', 'other')
    writeFileSync(join(repo, '.gitattributes'), '*.txt filter=evil\n')
    sh(repo, 'add', '.gitattributes')
    sh(repo, 'commit', '-q', '-m', 'attrs')
    appendConfig(repo, `[filter "evil"]\n\tsmudge = "${touch}; cat"\n\tprocess = "${touch}"\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    await git.discard(repo, 'a.txt')
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('one\n')
    await git.checkout(repo, 'other')
    expect((await git.status(repo)).branch).toBe('other')
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores textconv and external diff drivers (diff, commitDiff, show)', async () => {
    const { repo, marker, touch } = scratch()
    writeFileSync(join(repo, '.gitattributes'), '*.txt diff=evil\n')
    appendConfig(repo, `[diff "evil"]\n\ttextconv = "${touch}; cat"\n\tcommand = "${touch}"\n[diff]\n\texternal = "${touch}"\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    expect(await git.diff(repo, 'a.txt', false)).toContain('+two')
    const [head] = await git.log(repo)
    expect(await git.commitDiff(repo, head!.hashFull)).toContain('+one')
    expect(await git.show(repo, 'HEAD', 'a.txt')).toBe('one\n')
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores hooks in .git/hooks and core.hooksPath (commit, checkout)', async () => {
    const { repo, marker, touch } = scratch()
    const hooks = join(repo, 'evil-hooks')
    mkdirSync(hooks)
    for (const dir of [join(repo, '.git', 'hooks'), hooks]) {
      for (const name of ['pre-commit', 'commit-msg', 'prepare-commit-msg', 'post-commit', 'post-checkout', 'reference-transaction', 'post-index-change']) {
        writeFileSync(join(dir, name), `#!/bin/sh\n${touch}\n`, { mode: 0o755 })
      }
    }
    sh(repo, 'branch', 'other')
    appendConfig(repo, `[core]\n\thooksPath = ${hooks}\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    await git.stage(repo, undefined)
    await git.commit(repo, 'second')
    expect((await git.log(repo)).map(entry => entry.subject)).toEqual(['second', 'first'])
    await git.checkout(repo, 'other')
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores signing and signature programs (commit, log)', async () => {
    const { repo, marker, touch } = scratch()
    const gpg = join(repo, '..', 'gpg.sh')
    writeFileSync(gpg, `#!/bin/sh\n${touch}\nexit 1\n`, { mode: 0o755 })
    appendConfig(repo, `[gpg]\n\tprogram = ${gpg}\n[gpg "ssh"]\n\tprogram = ${gpg}\n[commit]\n\tgpgSign = true\n[log]\n\tshowSignature = true\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    await git.stage(repo, undefined)
    await git.commit(repo, 'second')
    expect((await git.log(repo)).map(entry => entry.subject)).toEqual(['second', 'first'])
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores merge drivers (cherry-pick, revert)', async () => {
    const { repo, marker, touch } = scratch()
    writeFileSync(join(repo, '.gitattributes'), '*.txt merge=evil\n')
    sh(repo, 'add', '.gitattributes')
    sh(repo, 'commit', '-q', '-m', 'attrs')
    writeFileSync(join(repo, 'a.txt'), 'one\nx\ny\nz\n')
    sh(repo, 'commit', '-q', '-am', 'base')
    sh(repo, 'checkout', '-q', '-b', 'side')
    writeFileSync(join(repo, 'a.txt'), 'one\nx\ny\nz\nside\n')
    sh(repo, 'commit', '-q', '-am', 'side')
    const pick = sh(repo, 'rev-parse', 'HEAD').trim()
    sh(repo, 'checkout', '-q', 'main')
    writeFileSync(join(repo, 'a.txt'), 'main\none\nx\ny\nz\n')
    sh(repo, 'commit', '-q', '-am', 'main')
    appendConfig(repo, `[merge "evil"]\n\tdriver = "${touch}; false"\n`)
    await git.cherryPick(repo, pick)
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('main\none\nx\ny\nz\nside\n')
    await git.revert(repo, pick)
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('main\none\nx\ny\nz\n')
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores a pager, an editor and credential helpers', async () => {
    const { repo, marker, touch } = scratch()
    appendConfig(repo, `[core]\n\tpager = "${touch}"\n\teditor = "${touch}"\n\taskPass = "${touch}"\n\tsshCommand = "${touch}"\n[sequence]\n\teditor = "${touch}"\n[credential]\n\thelper = "!${touch}"\n[pager]\n\tlog = "${touch}"\n\tstatus = "${touch}"\n`)
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    await git.status(repo)
    await git.log(repo)
    await git.branches(repo)
    await git.worktrees(repo)
    await git.stage(repo, undefined)
    await git.commit(repo, 'second')
    expect(existsSync(marker)).toBe(false)
  })

  it('does not descend into submodules with their own config', async () => {
    const { repo, marker, touch } = scratch()
    const sub = join(repo, 'sub')
    mkdirSync(sub)
    sh(sub, 'init', '-q', '-b', 'main')
    writeFileSync(join(sub, 'b.txt'), 'b\n')
    sh(sub, 'add', 'b.txt')
    sh(sub, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'b')
    sh(repo, 'add', 'sub')
    sh(repo, 'commit', '-q', '-m', 'gitlink')
    writeFileSync(join(sub, '.git', 'config'), readFileSync(join(sub, '.git', 'config'), 'utf8') + `[core]\n\tfsmonitor = "${touch}"\n[filter "evil"]\n\tclean = "${touch}; cat"\n`)
    writeFileSync(join(sub, '.gitattributes'), '* filter=evil\n')
    writeFileSync(join(sub, 'b.txt'), 'changed\n')
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    const result = await git.status(repo)
    expect(result.entries.map(entry => entry.path)).toContain('a.txt')
    await git.diff(repo, undefined, false)
    expect(existsSync(marker)).toBe(false)
  })

  it('still serves linked worktrees', async () => {
    const { repo, marker, touch } = scratch()
    const linked = join(repo, '..', 'linked')
    sh(repo, 'worktree', 'add', '-q', '-b', 'feature', linked)
    appendConfig(repo, `[core]\n\tfsmonitor = "${touch}"\n`)
    writeFileSync(join(linked, 'a.txt'), 'two\n')
    // Both checkouts sit in the scratch directory, the workspace here.
    const workspace = join(repo, '..')
    const rows = await git.worktrees(repo, workspace)
    expect(rows.map(row => [row.branch, row.changes])).toEqual([['main', 0], ['feature', 1]])
    expect((await git.status(linked, undefined, workspace)).entries.map(entry => entry.path)).toEqual(['a.txt'])
    expect(existsSync(marker)).toBe(false)
  })
})

describe('git call sites', () => {
  it('spawns git from exactly one place in src/', () => {
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) files.push(path)
      }
    }
    walk(join(__dirname, '..', 'src'))
    const hits = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      const found: string[] = []
      if (/simple-git|isomorphic-git|nodegit/.test(text)) found.push(`${file}: git library`)
      for (const match of text.matchAll(/(?<![.\w])(spawn|spawnSync|execFile|execFileSync|exec|execSync)\s*\(\s*([^,)]*)/g)) {
        found.push(`${file.slice(file.indexOf('src'))}: ${match[1]}(${match[2]}`)
      }
      return found
    })
    // open-external.ts launches the operator's own apps by a fixed table, never git.
    expect(hits.filter(hit => !hit.startsWith('src/open-external.ts'))).toEqual([
      "src/git.ts: spawn('git'",
    ])
    const source = readFileSync(join(__dirname, '..', 'src', 'git.ts'), 'utf8')
    // The one spawn lives in spawnGit; only the hardened entry points call it.
    const callers = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)[^\n]*\n(?:(?!^(?:export )?(?:async )?function )[\s\S])*?spawnGit\(/gm)].map(m => m[1])
    expect(callers.sort()).toEqual(['probeGit', 'readSafeConfig', 'safeGit'])
    expect(source.match(/spawn\(/g)).toHaveLength(1)
  })
})
