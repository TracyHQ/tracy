/**
 * The login-shell PATH (`src/shell-path.js`): an app opened from Finder gets a minimal PATH, so the
 * person's shell is asked once what PATH it builds (a CLI under fnm, nvm, ~/.local/bin is invisible
 * otherwise). Driven with a stand-in `spawn`; Windows with a stand-in registry.
 *
 *   node --test packages/desktop/tracy-desktop/test/shell-path.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createShellPathReader, parseRegQuery } = require('../src/shell-path.js')

const M = '__TRACY_SHELL_PATH__'

/** A `spawn` whose child prints `out` (string or chunks) and exits, unless `hang`. */
function fakeSpawn({ out = '', hang = false, error = null } = {}) {
  const calls = []
  const spawn = (file, args, options) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.killed = false
    child.kill = (signal) => {
      child.killed = signal ?? true
      setImmediate(() => child.emit('close', null, signal))
      return true
    }
    calls.push({ file, args, options, child })
    setImmediate(() => {
      if (error) return child.emit('error', error)
      for (const chunk of [].concat(out)) child.stdout.emit('data', Buffer.from(chunk))
      if (!hang) child.emit('close', 0, null)
    })
    return child
  }
  return { spawn, calls }
}

const reader = (spawn, more = {}) =>
  createShellPathReader({ spawn, platform: 'darwin', env: { SHELL: '/bin/zsh', HOME: '/Users/a' }, ...more })

test('zsh is asked with a fixed command, stdin closed, and a marker its rc files can see', async () => {
  const { spawn, calls } = fakeSpawn({ out: `${M}/usr/bin:/bin${M}` })
  assert.deepEqual(await reader(spawn).read(), { ok: true, segments: ['/usr/bin', '/bin'], reason: 'none' })
  const [{ file, args, options }] = calls
  assert.equal(file, '/bin/zsh')
  assert.deepEqual(args, ['-ilc', `printf '%s' '${M}'; printf '%s' "$PATH"; printf '%s' '${M}'`])
  assert.equal(options.stdio[0], 'ignore')
  assert.equal(options.env.TRACY_SHELL_PATH_PROBE, '1')
  assert.equal(options.env.HOME, '/Users/a')
})

test('banners and colours around the markers are ignored; empty, relative and repeated entries are dropped', async () => {
  const out = [`\x1b[32mWelcome!\x1b[0m\n${M}/a/bin:`, `:./rel:/b/bin:/a/bin:bin:/c\x1b[0m${M}\nbye`]
  const { spawn } = fakeSpawn({ out })
  assert.deepEqual((await reader(spawn).read()).segments, ['/a/bin', '/b/bin', '/c'])
})

test('bash runs the same command; fish and nu are asked in their own syntax', async () => {
  for (const [shell, expected] of [
    ['/usr/local/bin/bash', `printf '%s' "$PATH"`],
    ['/opt/homebrew/bin/fish', 'string join : $PATH'],
    ['/usr/local/bin/nu', '($env.PATH | str join (char esep))']
  ]) {
    const { spawn, calls } = fakeSpawn({ out: `${M}/x${M}` })
    const result = await reader(spawn, { shell }).read()
    assert.equal(result.ok, true, shell)
    assert.equal(calls[0].args[0], '-ilc')
    assert.ok(calls[0].args[1].includes(expected), `${shell}: ${calls[0].args[1]}`)
  }
})

test('fish ends its output with a newline, which is not part of the last entry', async () => {
  const { spawn } = fakeSpawn({ out: `${M}/x:/y\n${M}` })
  assert.deepEqual((await reader(spawn, { shell: '/usr/bin/fish' }).read()).segments, ['/x', '/y'])
})

test('a shell the app does not know is not guessed at', async () => {
  const { spawn, calls } = fakeSpawn({ out: `${M}/x${M}` })
  assert.deepEqual(await reader(spawn, { shell: '/bin/tcsh' }).read(), {
    ok: false,
    segments: [],
    reason: 'unsupported_shell'
  })
  assert.equal(calls.length, 0)
})

test('with no $SHELL, macOS asks zsh and Linux asks bash', async () => {
  for (const [platform, shell] of [
    ['darwin', '/bin/zsh'],
    ['linux', '/bin/bash']
  ]) {
    const { spawn, calls } = fakeSpawn({ out: `${M}/x${M}` })
    await createShellPathReader({ spawn, platform, env: {} }).read()
    assert.equal(calls[0].file, shell)
  }
})

test('a shell that never answers is killed after the time limit', async () => {
  const { spawn, calls } = fakeSpawn({ out: 'loading…', hang: true })
  const result = await reader(spawn, { timeoutMs: 20 }).read()
  assert.deepEqual(result, { ok: false, segments: [], reason: 'timeout' })
  assert.ok(calls[0].child.killed)
})

test('a shell that cannot start, or prints no PATH, says why', async () => {
  const failed = fakeSpawn({ error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
  assert.equal((await reader(failed.spawn).read()).reason, 'spawn_error')
  const thrown = () => {
    throw new Error('EAGAIN')
  }
  assert.equal((await reader(thrown).read()).reason, 'spawn_error')
  assert.equal((await reader(fakeSpawn({ out: 'no markers here' }).spawn).read()).reason, 'empty_path')
  assert.equal((await reader(fakeSpawn({ out: `${M}${M}` }).spawn).read()).reason, 'empty_path')
  assert.equal((await reader(fakeSpawn({ out: `${M}rel:./x${M}` }).spawn).read()).reason, 'empty_path')
})

test('a shell that prints more than 64 KB is cut off and killed', async () => {
  const { spawn, calls } = fakeSpawn({ out: ['x'.repeat(70_000), `${M}/x${M}`], hang: true })
  const result = await reader(spawn).read()
  assert.equal(result.ok, false)
  assert.ok(calls[0].child.killed)
})

test('the answer is read once and shared; force asks again', async () => {
  const { spawn, calls } = fakeSpawn({ out: `${M}/x${M}` })
  const r = reader(spawn)
  const [a, b] = await Promise.all([r.read(), r.read()])
  assert.equal(a, b)
  assert.equal(calls.length, 1)
  await r.read({ force: true })
  assert.equal(calls.length, 2)
})

test('reading never changes the PATH of this process', async () => {
  const env = { SHELL: '/bin/zsh', PATH: '/usr/bin' }
  const before = process.env.PATH
  await createShellPathReader({
    spawn: fakeSpawn({ out: `${M}/x${M}` }).spawn,
    platform: 'darwin',
    env
  }).read()
  assert.equal(process.env.PATH, before)
  assert.equal(env.PATH, '/usr/bin')
})

test('Windows runs no profile: Path comes from the Machine and User registry scopes, expanded', async () => {
  const asked = []
  const registryRead = async (key) => {
    asked.push(key)
    if (key.startsWith('HKLM')) return { type: 'REG_EXPAND_SZ', value: '%SystemRoot%\\system32;C:\\Tools;;' }
    return {
      type: 'REG_EXPAND_SZ',
      value: '%LOCALAPPDATA%\\Programs\\x\\bin;C:\\Tools;relative\\bin;%NOPE%\\y'
    }
  }
  const { spawn, calls } = fakeSpawn()
  const result = await createShellPathReader({
    spawn,
    platform: 'win32',
    env: { SystemRoot: 'C:\\Windows', LocalAppData: 'C:\\Users\\a\\AppData\\Local' },
    registryRead
  }).read()
  assert.equal(calls.length, 0)
  assert.deepEqual(asked, [
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
    'HKCU\\Environment'
  ])
  assert.deepEqual(result, {
    ok: true,
    reason: 'none',
    segments: ['C:\\Windows\\system32', 'C:\\Tools', 'C:\\Users\\a\\AppData\\Local\\Programs\\x\\bin']
  })
})

test('Windows: a plain REG_SZ is not expanded; a registry that cannot be read says why', async () => {
  const plain = createShellPathReader({
    spawn: fakeSpawn().spawn,
    platform: 'win32',
    env: { X: 'C:\\x' },
    registryRead: async (key) => (key.startsWith('HKLM') ? { type: 'REG_SZ', value: 'C:\\%X%;C:\\a' } : null)
  })
  assert.deepEqual((await plain.read()).segments, ['C:\\%X%', 'C:\\a'])
  const broken = createShellPathReader({
    spawn: fakeSpawn().spawn,
    platform: 'win32',
    env: {},
    registryRead: async () => {
      throw new Error('denied')
    }
  })
  assert.equal((await broken.read()).reason, 'spawn_error')
  const empty = createShellPathReader({
    spawn: fakeSpawn().spawn,
    platform: 'win32',
    env: {},
    registryRead: async () => null
  })
  assert.equal((await empty.read()).reason, 'empty_path')
})

test('the default Windows registry reader understands `reg query` output', () => {
  const out = [
    '',
    'HKEY_CURRENT_USER\\Environment',
    '    Path    REG_EXPAND_SZ    %USERPROFILE%\\bin;C:\\Program Files\\x',
    ''
  ].join('\r\n')
  assert.deepEqual(parseRegQuery(out), {
    type: 'REG_EXPAND_SZ',
    value: '%USERPROFILE%\\bin;C:\\Program Files\\x'
  })
  assert.equal(
    parseRegQuery('ERROR: The system was unable to find the specified registry key or value.'),
    null
  )
})
