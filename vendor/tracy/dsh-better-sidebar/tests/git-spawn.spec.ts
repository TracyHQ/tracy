import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { isGitRepo, worktrees } from '../src/git.ts'

/** The git subcommand and its arguments, after `-C <dir>`, `--no-pager` and
 * the `-c key=value` hardening every call carries. */
function subcommand(args: string[]): string[] {
  let i = 0
  while (i < args.length) {
    if (args[i] === '-C' || args[i] === '-c') i += 2
    else if (args[i] === '--no-pager') i += 1
    else break
  }
  return args.slice(i)
}

// Tracy: git.ts resolves and fences every repository path on disk before
// spawning, so the fixture is a real (empty) directory with a `.git` folder.
const repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-spawn-')))
mkdirSync(join(repo, '.git'))
afterAll(() => { rmSync(repo, { recursive: true, force: true }) })

afterEach(() => {
  spawnMock.mockReset()
})

describe('git subprocess spawning', () => {
  it('hides spawned git windows', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter()
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      Object.assign(child, { stdout, stderr, kill: vi.fn() })

      queueMicrotask(() => {
        stdout.end(`${repo}\ntrue\n`)
        stderr.end()
        child.emit('close', 0)
      })

      return child
    })

    await expect(isGitRepo(repo)).resolves.toBe(true)

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['-C', repo, '--no-pager', 'core.fsmonitor=false', 'color.ui=false']),
      expect.objectContaining({ windowsHide: true }),
    )
    expect(subcommand(spawnMock.mock.calls[0]![1] as string[])).toEqual(['rev-parse', '--show-toplevel', '--is-inside-work-tree'])
  })

  it('falls back when worktree list does not support -z', async () => {
    const gitChild = (stdoutText = '', stderrText = '', code = 0): EventEmitter => {
      const child = new EventEmitter()
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      Object.assign(child, { stdout, stderr, kill: vi.fn() })
      queueMicrotask(() => {
        stdout.end(stdoutText)
        stderr.end(stderrText)
        child.emit('close', code)
      })
      return child
    }

    spawnMock.mockImplementation((_file: string, args: string[]) => {
      const command = subcommand(args)
      if (command[0] === 'rev-parse' && command[1] === '--path-format=absolute') return gitChild(`${repo}/.git\n${repo}/.git\n${repo}\n`)
      if (command[0] === 'config') return gitChild('core.repositoryformatversion\n0\0')
      if (command[0] === 'rev-parse' && command[1] === '--show-toplevel' && command[2] === '--is-inside-work-tree') return gitChild(`${repo}\ntrue\n`)
      if (command[0] === 'rev-parse' && command[1] === '--show-toplevel') return gitChild(`${repo}\n`)
      if (command[0] === 'rev-parse' && command[1] === '--abbrev-ref') return gitChild('main\n')
      if (command[0] === 'status') return gitChild('')
      if (command[0] === 'worktree' && command.includes('-z')) {
        return gitChild('', "error: unknown switch `z'\n", 129)
      }
      if (command[0] === 'worktree') {
        return gitChild([
          `worktree ${repo}`,
          'HEAD abc',
          'branch refs/heads/main',
          '',
        ].join('\n'))
      }
      throw new Error(`unexpected git command: ${command.join(' ')}`)
    })

    await expect(worktrees(repo)).resolves.toEqual([
      { path: repo, branch: 'main', current: true, changes: 0 },
    ])
    await expect(worktrees(repo)).resolves.toEqual([
      { path: repo, branch: 'main', current: true, changes: 0 },
    ])

    const nulAttempts = spawnMock.mock.calls.filter((call) => {
      const args = call[1] as string[]
      return args.includes('worktree') && args.includes('-z')
    })
    expect(nulAttempts).toHaveLength(1)
  })
})
