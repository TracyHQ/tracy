// The wp-cli runner keeps one container alive: a `docker compose … run --rm` runner costs a new
// container per call (2–3 s measured on the stand, 14/09), a `docker exec` into a container that
// is already up costs 0.3–0.5 s. The runner string stays what it was; the switch is internal and
// the seed's report counts the same calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunner, keepAlivePlan, createKeepAlive } from '../lib/wp-cli.mjs'
import { wpRunner } from '../quickstart/lib.mjs'

/** A spawnSync stand-in: records argv, answers from `answers` (matched by the argv's first words). */
function fakeSpawn(answers = {}) {
  const calls = []
  const spawn = (cmd, args, opts = {}) => {
    calls.push([cmd, ...args])
    const key = [cmd, ...args].join(' ')
    const hit = Object.entries(answers).find(([k]) => key.startsWith(k))
    const a = hit ? hit[1] : {}
    spawn.inputs.push(opts.input)
    return { status: a.status ?? 0, stdout: a.stdout ?? '', stderr: a.stderr ?? '', error: null }
  }
  spawn.calls = calls
  spawn.inputs = []
  return spawn
}

test('keepAlivePlan: a compose run --rm runner becomes one detached container plus docker exec', () => {
  const plan = keepAlivePlan(
    ['docker', 'compose', '--progress', 'quiet', '-f', '/s/compose.yml', '-p', 'wp-tracy-business', 'run', '--rm', '-T', 'cli']
  )
  assert.equal(plan.name, 'wp-tracy-business-cli-keep')
  assert.deepEqual(plan.create, [
    'docker', 'compose', '--progress', 'quiet', '-f', '/s/compose.yml', '-p', 'wp-tracy-business',
    'run', '-d', '--name', 'wp-tracy-business-cli-keep', '--entrypoint', 'sh', 'cli', '-c', 'sleep 7200'
  ])
  assert.deepEqual(plan.exec(['option', 'get', 'x']), ['docker', 'exec', '-i', 'wp-tracy-business-cli-keep', 'wp', 'option', 'get', 'x'])
  assert.deepEqual(plan.remove, ['docker', 'rm', '-f', 'wp-tracy-business-cli-keep'])
})

test('keepAlivePlan: the project name comes from -p, else the compose file name:, else the directory', () => {
  const readText = (f) => (f === '/stands/alpha/compose.yml' ? 'services:\n  x: {}\nname: alpha-stand\n' : null)
  assert.equal(keepAlivePlan(['docker', 'compose', '-f', '/stands/alpha/compose.yml', 'run', '--rm', 'cli'], { readText }).name, 'alpha-stand-cli-keep')
  assert.equal(keepAlivePlan(['docker', 'compose', '--project-directory', '/stands/beta', 'run', '--rm', '-T', 'cli'], { readText }).name, 'beta-cli-keep')
  assert.equal(keepAlivePlan(['docker', 'compose', 'run', '--rm', 'cli'], { readText, cwd: '/stands/Gamma Site' }).name, 'gammasite-cli-keep')
  assert.equal(keepAlivePlan(['docker', 'compose', '--project-name=delta', 'run', '--rm', 'cli'], { readText }).name, 'delta-cli-keep')
})

test('keepAlivePlan: a docker run --rm … wordpress:cli wp runner keeps its network, mounts and env', () => {
  const plan = keepAlivePlan([
    'docker', 'run', '--rm', '--network', 'wtb_default', '--user', '33:33', '-v', '/s/verify:/var/www/html',
    '-e', 'WORDPRESS_DB_HOST=db', 'wordpress:cli', 'wp'
  ])
  assert.equal(plan.name, 'wtb_default-wp-keep')
  assert.deepEqual(plan.create, [
    'docker', 'run', '-d', '--name', 'wtb_default-wp-keep', '--entrypoint', 'sh', '--network', 'wtb_default', '--user', '33:33',
    '-v', '/s/verify:/var/www/html', '-e', 'WORDPRESS_DB_HOST=db', 'wordpress:cli', '-c', 'sleep 7200'
  ])
  assert.deepEqual(plan.exec(['core', 'version']), ['docker', 'exec', '-i', 'wtb_default-wp-keep', 'wp', 'core', 'version'])
})

test('keepAlivePlan: any other runner is left alone', () => {
  assert.equal(keepAlivePlan(['wp', '--path=/var/www/html']), null)
  assert.equal(keepAlivePlan(['docker', 'compose', 'exec', '-T', 'cli']), null)
  assert.equal(keepAlivePlan(['docker', 'compose', 'run', '--rm', '-e', 'X=1', 'cli']), null, 'a run flag with a value is not understood')
  assert.equal(keepAlivePlan(['docker', 'run', '--rm', 'wordpress:cli']), null, 'no trailing wp')
  assert.equal(keepAlivePlan(['node', '/x/fake-wp.mjs']), null)
})

test('createRunner: the first call starts the container, every call is a docker exec with stdin, dispose removes it', () => {
  const spawn = fakeSpawn({ 'docker inspect': { status: 1 }, 'docker exec': { stdout: 'ok\n' } })
  const wp = createRunner('docker compose -p wtb run --rm -T cli', { spawn, keep: true })
  assert.equal(wp.out(['option', 'get', 'blogname']), 'ok')
  assert.equal(wp.run(['post', 'update', '5', '-'], { stdin: 'body' }).code, 0)
  const argv = spawn.calls.map((c) => c.join(' '))
  assert.deepEqual(argv, [
    'docker inspect -f {{.State.Running}} wtb-cli-keep',
    'docker rm -f wtb-cli-keep',
    'docker compose -p wtb run -d --name wtb-cli-keep --entrypoint sh cli -c sleep 7200',
    'docker exec -i wtb-cli-keep wp option get blogname',
    'docker exec -i wtb-cli-keep wp post update 5 -'
  ])
  assert.equal(spawn.inputs[4], 'body')
  assert.equal(wp.calls.length, 2, 'the report counts wp calls, not docker housekeeping')
  wp.dispose()
  assert.equal(argv.length, 5)
  assert.deepEqual(spawn.calls.at(-1).slice(0, 4), ['docker', 'rm', '-f', 'wtb-cli-keep'])
})

test('createRunner: a container already running under that name is reused and left running', () => {
  const spawn = fakeSpawn({ 'docker inspect': { stdout: 'true\n' } })
  const wp = createRunner('docker compose -p wtb run --rm -T cli', { spawn, keep: true })
  wp.run(['core', 'version'])
  wp.dispose()
  assert.deepEqual(
    spawn.calls.map((c) => c.join(' ')),
    ['docker inspect -f {{.State.Running}} wtb-cli-keep', 'docker exec -i wtb-cli-keep wp core version']
  )
})

test('createRunner: a kept container that vanished mid-run is started again and the call retried once', () => {
  let execs = 0
  const spawn = (cmd, args, opts) => {
    spawn.calls.push([cmd, ...args])
    if (args[0] === 'inspect') return { status: 1, stdout: '', stderr: '', error: null }
    if (args[0] === 'exec') return ++execs === 2 ? { status: 1, stdout: '', stderr: 'Error response from daemon: No such container: wtb-cli-keep', error: null } : { status: 0, stdout: 'ok', stderr: '', error: null }
    return { status: 0, stdout: '', stderr: '', error: null }
  }
  spawn.calls = []
  const wp = createRunner('docker compose -p wtb run --rm -T cli', { spawn, keep: true })
  wp.run(['core', 'version'])
  assert.equal(wp.out(['core', 'version']), 'ok')
  const kinds = spawn.calls.map((c) => c.slice(0, 3).join(' '))
  assert.deepEqual(kinds, [
    'docker inspect -f', 'docker rm -f', 'docker compose -p', 'docker exec -i',
    'docker exec -i', 'docker inspect -f', 'docker rm -f', 'docker compose -p', 'docker exec -i'
  ])
  const gone = createRunner('docker compose -p wtb run --rm -T cli', { spawn: (c, a) => (a[0] === 'exec' ? { status: 1, stdout: '', stderr: 'No such container', error: null } : { status: a[0] === 'inspect' ? 1 : 0, stdout: '', stderr: '', error: null }), keep: true })
  assert.throws(() => gone.run(['core', 'version']), /No such container/, 'a second vanishing is the error it is')
})

test('createRunner: a container that fails to start is an error, not a silent fallback', () => {
  const spawn = fakeSpawn({ 'docker inspect': { status: 1 }, 'docker compose': { status: 1, stderr: 'no such service: cli' } })
  const wp = createRunner('docker compose -p wtb run --rm -T cli', { spawn, keep: true })
  assert.throws(() => wp.run(['core', 'version']), /cannot start wtb-cli-keep.*no such service/)
})

test('createRunner: keep off, or a runner that is not a docker container, spawns the runner as written', () => {
  for (const [runner, keep] of [
    ['docker compose -p wtb run --rm -T cli', false],
    ['wp --path=/var/www/html', true]
  ]) {
    const spawn = fakeSpawn()
    createRunner(runner, { spawn, keep }).run(['core', 'version'])
    assert.deepEqual(spawn.calls, [[...runner.split(' '), 'core', 'version']])
  }
})

test('createKeepAlive: cleanup registered for process exit runs the removal once', () => {
  const spawn = fakeSpawn({ 'docker inspect': { status: 1 } })
  const hooks = []
  const ka = createKeepAlive(keepAlivePlan(['docker', 'compose', '-p', 'wtb', 'run', '--rm', 'cli']), {
    spawn,
    onExit: (fn) => hooks.push(fn)
  })
  ka.argv(['core', 'version'])
  assert.equal(hooks.length, 1)
  hooks[0]()
  hooks[0]()
  ka.dispose()
  assert.equal(spawn.calls.filter((c) => c[1] === 'rm').length, 2, 'the pre-create rm -f plus one removal')
})

test('quickstart wpRunner: the compose runner goes through the kept container too, other runners through sh -c', () => {
  const spawn = fakeSpawn({ 'docker inspect': { status: 1 }, 'docker exec': { stdout: '6.8\n' } })
  const wp = wpRunner('docker compose -p wtb run --rm -T cli', { spawn, keep: true })
  assert.equal(wp.field(['core', 'version']), '6.8')
  assert.deepEqual(spawn.calls.at(-1).slice(0, 6), ['docker', 'exec', '-i', 'wtb-cli-keep', 'wp', 'core'])
  const plain = fakeSpawn({ sh: { stdout: 'x' } })
  wpRunner('wp --path=/x', { spawn: plain, keep: true })(['core', 'version'])
  assert.deepEqual(plain.calls, [['sh', '-c', 'wp --path=/x "$@"', 'wp', 'core', 'version']])
})

// ---------------------------------------------------------------- deadlines
// A seed or a quickstart tool has one clock for the whole run: every wp call checks it before it
// starts and is capped by what remains, so a stand that stops answering ends the run with a named
// error instead of a process that sits there (a call that hangs is ETIMEDOUT under the per-call
// cap; the run's own cap is the deadline).
import { TimeoutError } from '../lib/wp-cli.mjs'
import { startDeadline } from '../quickstart/lib.mjs'
import { parseArgs as seedArgs } from '../seed.mjs'

test('createRunner: a deadline already passed stops the next call before it is spawned; a later one caps the call', () => {
  const spawn = fakeSpawn()
  const late = createRunner('wp', { spawn, keep: false, deadline: Date.now() - 1 })
  assert.throws(() => late.run(['core', 'version']), (e) => e instanceof TimeoutError && /seed: timed out after .*core version/.test(e.message))
  assert.equal(spawn.calls.length, 0)
  const opts = []
  const recording = (cmd, args, o) => (opts.push(o), spawn(cmd, args, o))
  const soon = createRunner('wp', { spawn: recording, keep: false, deadline: Date.now() + 5000 })
  soon.run(['core', 'version'])
  assert.ok(opts[0].timeout > 0 && opts[0].timeout <= 5000, `per-call timeout ${opts[0].timeout} capped by the deadline`)
})

test('createRunner: a call the per-call cap kills is a named error', () => {
  const spawn = () => ({ status: null, stdout: '', stderr: '', error: { code: 'ETIMEDOUT', message: 'spawnSync wp ETIMEDOUT' } })
  const wp = createRunner('wp', { spawn, keep: false })
  assert.throws(() => wp.run(['post', 'list']), /wp post list timed out/)
})

test('seed.mjs: --timeout is seconds for the whole run, 900 by default', () => {
  const base = ['--spec', '/s', '--wp', 'w', '--theme', 't', '--patterns-map', '/m', '--images', '/i']
  assert.equal(seedArgs(base).timeout, 900)
  assert.equal(seedArgs([...base, '--timeout', '30']).timeout, 30)
  assert.throws(() => seedArgs([...base, '--timeout', 'soon']), /--timeout takes seconds/)
})

test('quickstart: startDeadline checks and caps; wpRunner refuses a call past it', () => {
  const d = startDeadline(0.001, 'pack')
  d.stop()
  const t0 = Date.now()
  while (Date.now() - t0 < 5) {}
  assert.throws(() => d.check('tar'), /pack: timed out after 0.001s \(at tar\)/)
  assert.equal(d.remainingMs(), 1)
  const spawn = fakeSpawn()
  assert.throws(() => wpRunner('wp', { spawn, keep: false, deadline: d })(['core', 'version']), /pack: timed out/)
  assert.equal(spawn.calls.length, 0)
  const open = startDeadline(60, 'pack')
  open.stop()
  const opts = []
  wpRunner('wp', { spawn: (c, a, o) => (opts.push(o), spawn(c, a, o)), keep: false, deadline: open })(['core', 'version'])
  assert.ok(opts[0].timeout <= 60_000)
})
