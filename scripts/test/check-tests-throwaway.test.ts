/**
 * Where `127.0.0.1` is, when the thing asking is itself in a container.
 *
 * 🔒 THIS IS A TEST ABOUT AN ADDRESS, NOT ABOUT POSTGRES. `docker run -p 127.0.0.1:55432:5432` asks
 * the DAEMON to listen, so the listener lands in the host's network namespace. When the process
 * that will connect is inside a container talking to that daemon over a mounted socket, its own
 * `127.0.0.1` is a different interface and the two never meet — with nothing said: the container
 * starts, `docker ps` shows it up, and the connection simply never opens.
 *
 * Measured 19/09/2026 on runner `tracy-ci-03` (`Machine name: b6eccb067d35`, a container id):
 * image pulled at 06:30:51, gate red at 06:31:59 — sixty-eight seconds, the whole wait loop.
 * Reproduced by hand afterwards, both ways: a postgres sharing a container's netns answers
 * `127.0.0.1:55432` from inside it, and one with a published port does not.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { throwawayArgs } from '../check-tests.ts'
import {
  type DatabaseIO,
  type DockerResult,
  parseDatabaseMode,
  pickDatabaseSource,
  prepareDatabase,
  startThrowaway,
  THROWAWAY_PORT,
  type Throwaway,
  type ThrowawayIO,
  throwawayName
} from '../test-database.ts'

test('on the host the port is published onto loopback', () => {
  const args = throwawayArgs(null)
  assert.ok(args.includes('-p'), 'the host branch must publish a port')
  assert.ok(args.includes('127.0.0.1:55432:55432'), args.join(' '))
  assert.ok(!args.includes('--network'), 'the host branch must not join anybody')
})

test('inside a container nothing is published and the netns is shared instead', () => {
  const args = throwawayArgs('b6eccb067d35')
  assert.ok(args.includes('--network'), 'the container branch must share a namespace')
  assert.ok(args.includes('container:b6eccb067d35'), args.join(' '))
  // 🔒 `-p` AND `--network container:` ARE MUTUALLY EXCLUSIVE — docker refuses the pair outright,
  // so this is not tidiness: leaving the publish in would fail the `docker run` itself.
  assert.ok(!args.includes('-p') || args.indexOf('-p') > args.indexOf('postgres:16-alpine'), args.join(' '))
})

test('both branches make ONE url true: the server listens on 55432 either way', () => {
  for (const args of [throwawayArgs(null), throwawayArgs('b6eccb067d35')]) {
    const image = args.indexOf('postgres:16-alpine')
    assert.ok(image >= 0, 'the image must be named')
    // `postgres:16-alpine` hands a leading `-…` straight to the server, so this is the server's own
    // port rather than a mapping — which is what lets the probe use one address in both worlds.
    assert.deepEqual(args.slice(image + 1), ['-p', '55432'], args.join(' '))
  }
  // And the credentials the url carries are the ones the container is given.
  for (const pair of ['POSTGRES_USER=tracy', 'POSTGRES_PASSWORD=tracy', 'POSTGRES_DB=tracy'])
    assert.ok(throwawayArgs(null).includes(pair), pair)
})

/**
 * Ownership on a shared Docker daemon — the defect this fix exists for.
 *
 * 🔒 THE OLD CODE SHARED ONE NAME (`tch-check-tests-postgres`), `rm -f`'d it at start and exit, and CI
 * runners share one daemon — so one invocation deleted another's LIVE database. These tests drive the
 * real lifecycle against a stubbed daemon and assert the two things that make that impossible: a
 * per-invocation name, and removal keyed to the full id THIS invocation captured, never a name and
 * never a container it did not create.
 */
const url = `postgres://tracy:tracy@127.0.0.1:${String(THROWAWAY_PORT)}/tracy`

/** A full container id as `docker create` prints one: 64 lowercase hex digits, no `sha256:` prefix. */
const hexId = (seq: number): string => String(seq).padStart(64, '0')
const ok = (stdout = ''): DockerResult => ({ status: 0, stdout, stderr: '' })

/**
 * A single daemon many invocations reach, as CI's really is. Ids come from `create`; the published
 * host port 55432 can be held by only one container at a time, so a second `start` collides exactly
 * as docker's would. Every call is recorded so a test can see who removed what.
 */
class SharedDaemon {
  readonly calls: string[][] = []
  readonly removed: string[] = []
  private seq = 0
  private portHolder: string | null = null
  private readonly live = new Set<string>()

  io(): ThrowawayIO {
    return {
      run: (args): DockerResult => {
        this.calls.push(args)
        const cmd = args[0]
        if (cmd === 'create') {
          const id = hexId(this.seq++)
          this.live.add(id)
          return ok(`${id}\n`)
        }
        if (cmd === 'start') {
          const id = args[1]
          if (this.portHolder !== null)
            return { status: 1, stdout: '', stderr: `port ${String(THROWAWAY_PORT)} already allocated` }
          this.portHolder = id
          return ok()
        }
        if (cmd === 'rm') {
          const id = args[3] // ['rm','-f','-v',<id>]
          this.removed.push(id)
          this.live.delete(id)
          if (this.portHolder === id) this.portHolder = null
          return ok()
        }
        return ok()
      },
      // A real connection opens only to whoever currently holds the published port.
      probe: (): boolean => this.portHolder !== null,
      sleep: (): void => {}
    }
  }
}

test('the name is per-invocation, never a shared constant', () => {
  const a = throwawayName()
  const b = throwawayName()
  assert.notEqual(a, b, 'two invocations must not share a name')
  assert.match(a, /^tch-check-tests-postgres-\d+-[0-9a-f]{12}$/, a)
})

test('a second invocation on a shared daemon fails safely and removes only its OWN container', () => {
  const daemon = new SharedDaemon()
  const io = daemon.io()

  // First invocation wins the port and is left running, exactly as a live DB would be mid-run.
  const first = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(first.outcome, 'ready', 'the first invocation should get a working database')
  assert.ok(first.id, 'it must own the container it created')

  // Second invocation, same daemon: create succeeds, start collides on the bound port.
  const before = daemon.removed.length
  const second = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(second.outcome, 'start-failed', 'the bound port must make start fail, not succeed')

  // It must clean up after itself...
  second.remove()
  const removedBySecond = daemon.removed.slice(before)
  assert.deepEqual(removedBySecond, [second.id], 'the second must remove exactly its own id')
  // ...and it must never have removed the first invocation's live container — the whole point.
  assert.ok(!daemon.removed.includes(first.id ?? ''), 'the first invocation must be untouched')
  // Nowhere does a name reach `rm`: removal is keyed to the captured full container id.
  for (const c of daemon.calls) if (c[0] === 'rm') assert.match(c[3], /^[0-9a-f]{64}$/, c.join(' '))
})

/**
 * Two DISTINCT runner containers sharing one daemon, each throwaway joined to its OWN netns
 * (`--network container:<us>`), so there is no host port to collide on and both come up ready. Either
 * cleanup order must leave the other invocation's database untouched and usable.
 */
class NetnsDaemon {
  readonly removed: string[] = []
  private seq = 0
  /** One runner's view: its own container's id and whether it is currently up. */
  io(): ThrowawayIO & { up(): boolean; mine(): string | null } {
    let mine: string | null = null
    let started = false
    const self = {
      run: (args: string[]): DockerResult => {
        const cmd = args[0]
        if (cmd === 'create') {
          mine = hexId(this.seq++)
          return ok(`${mine}\n`)
        }
        // netns-shared: nothing is published, so start never contends with another runner.
        if (cmd === 'start') {
          started = true
          return ok()
        }
        if (cmd === 'rm') {
          const id = args[3]
          this.removed.push(id)
          if (id === mine) {
            started = false
            mine = null
          }
          return ok()
        }
        return ok()
      },
      probe: (): boolean => started && mine !== null,
      sleep: (): void => {},
      up: (): boolean => started && mine !== null,
      mine: (): string | null => mine
    }
    return self
  }
}

test('two runner namespaces on one daemon both come up; cleaning one leaves the other usable', () => {
  const daemon = new NetnsDaemon()
  const a = daemon.io()
  const b = daemon.io()

  const first = startThrowaway(a, 'runner-a-netns', throwawayName(), url, { attempts: 3 })
  const second = startThrowaway(b, 'runner-b-netns', throwawayName(), url, { attempts: 3 })
  assert.equal(first.outcome, 'ready', 'runner A gets its own database in its own netns')
  assert.equal(second.outcome, 'ready', 'runner B gets one too — no host port to fight over')
  assert.notEqual(first.id, second.id, 'they are distinct containers')

  // Tear the first down; the second must still be up and must not appear in what the first removed.
  first.remove()
  assert.deepEqual(daemon.removed, [first.id], 'only the first namespace container is removed')
  assert.ok(b.up(), "the second runner's database is still usable after the first is cleaned up")
  assert.ok(!a.up(), 'the first runner is down, by its own id')

  // Finally clean the second container by its own id.
  second.remove()
  assert.deepEqual(daemon.removed, [first.id, second.id], 'each runner removes exactly its own id')
})

test('remove targets the captured full id, uses rm -f -v, and is idempotent', () => {
  const daemon = new SharedDaemon()
  const handle = startThrowaway(daemon.io(), null, 'a-friendly-name', url, { attempts: 3 })
  assert.equal(handle.outcome, 'ready')

  handle.remove()
  handle.remove() // an exit hook firing after an explicit cleanup must not remove twice
  const rms = daemon.calls.filter((c) => c[0] === 'rm')
  assert.equal(rms.length, 1, 'remove must be idempotent')
  // `-v` drops the anonymous postgres data volume; the target is the id, never the friendly name.
  assert.deepEqual(rms[0], ['rm', '-f', '-v', handle.id], rms[0].join(' '))
  assert.notEqual(rms[0][3], 'a-friendly-name')
})

test('a failed rm stays retryable, and a later rm succeeds without double-removing', () => {
  // A transient cleanup error must not be recorded as done: the exit hook has to be able to retry.
  let failNext = true
  const rmTargets: string[] = []
  const base = new SharedDaemon().io()
  const io: ThrowawayIO = {
    run: (args): DockerResult => {
      if (args[0] === 'rm') {
        rmTargets.push(args[3])
        if (failNext) {
          failNext = false
          return { status: 1, stdout: '', stderr: 'device or resource busy' }
        }
        return ok()
      }
      return base.run(args)
    },
    probe: (): boolean => true,
    sleep: (): void => {}
  }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(handle.outcome, 'ready')

  handle.remove() // transient failure: not marked done
  handle.remove() // retry: succeeds and marks done
  handle.remove() // now a no-op
  assert.deepEqual(rmTargets, [handle.id, handle.id], 'exactly one retry after the transient failure')
})

test('malformed create stdout fails safely: nothing is owned, nothing is removed', () => {
  // Status 0 but stdout is not a 64-hex container id (here the image-digest shape `sha256:…`).
  // Recording it would key `start`/`rm` to garbage, so we must own nothing.
  const calls: string[][] = []
  const io: ThrowawayIO = {
    run: (args): DockerResult => {
      calls.push(args)
      if (args[0] === 'create') return ok(`sha256:${'0'.repeat(64)}\n`)
      return ok()
    },
    probe: (): boolean => true,
    sleep: (): void => {}
  }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(handle.outcome, 'create-failed', 'malformed id is a create failure, not a start')
  assert.equal(handle.id, null, 'a non-id must never be recorded as owned')
  assert.ok(!calls.some((c) => c[0] === 'start'), 'nothing is started against a garbage id')
  handle.remove()
  assert.ok(!calls.some((c) => c[0] === 'rm'), 'nothing owned means nothing removed')
})

test('startup failure after create does not leak the owned container', () => {
  // create succeeds, start fails: we own a container that never ran, and it must not be left behind.
  const beef = hexId(1)
  const calls: string[][] = []
  const io: ThrowawayIO = {
    run: (args): DockerResult => {
      calls.push(args)
      if (args[0] === 'create') return ok(`${beef}\n`)
      if (args[0] === 'start') return { status: 1, stdout: '', stderr: 'boom' }
      return ok()
    },
    probe: (): boolean => false,
    sleep: (): void => {}
  }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(handle.outcome, 'start-failed')
  assert.equal(handle.id, beef, 'ownership is captured before start is attempted')
  assert.equal(handle.detail, 'boom', "docker's own words are kept for the diagnosis")
  handle.remove()
  assert.deepEqual(calls.at(-1), ['rm', '-f', '-v', beef], 'the owned-but-failed container is removed')
})

test('a failed create owns nothing, so remove is a no-op', () => {
  const calls: string[][] = []
  const io: ThrowawayIO = {
    run: (args): DockerResult => {
      calls.push(args)
      return { status: 1, stdout: '', stderr: 'no such image' }
    },
    probe: (): boolean => false,
    sleep: (): void => {}
  }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(handle.outcome, 'create-failed')
  assert.equal(handle.id, null, 'nothing was created, so nothing is owned')
  handle.remove()
  assert.ok(!calls.some((c) => c[0] === 'rm'), 'a container we never made must never be removed')
})

test('readiness timeout still owns the container and removes it by id', () => {
  const daemon = new SharedDaemon()
  // Override probe to never answer, so create+start succeed but the wait exhausts its attempts.
  const base = daemon.io()
  const io: ThrowawayIO = { ...base, probe: (): boolean => false }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(handle.outcome, 'timeout')
  assert.ok(handle.id, 'a container that started but never answered is still ours')
  handle.remove()
  assert.deepEqual(daemon.removed, [handle.id], 'the timed-out container is removed by its id')
})

/**
 * Ownership is reachable BEFORE readiness, and an unexpected throw after create cannot leak.
 *
 * 🔒 THE OLD SHAPE LEFT `owned` NULL UNTIL THE WAIT LOOP RETURNED. A throw from `start`, the probe, or
 * `sleep` — or a signal mid-wait — then found no handle to clean up. `onAcquire` fires the instant a
 * valid id is captured, and a throw after that point attempts our own cleanup and re-propagates.
 */
test('onAcquire publishes ownership the moment a valid id is captured, before readiness', () => {
  const daemon = new SharedDaemon()
  const io = daemon.io()
  let acquired: Throwaway | null = null
  let acquiredWhileNotYetReady = false
  const wrapped: ThrowawayIO = {
    ...io,
    probe: (u): boolean => {
      // On the first probe attempt, ownership must already be published, before we answer ready.
      if (acquired !== null && acquired.outcome !== 'ready') acquiredWhileNotYetReady = true
      return io.probe(u)
    }
  }
  const handle = startThrowaway(wrapped, null, throwawayName(), url, {
    attempts: 3,
    onAcquire: (h) => {
      acquired = h
    }
  })
  assert.equal(handle.outcome, 'ready')
  assert.equal(acquired, handle, 'onAcquire receives the same handle the caller keeps')
  assert.ok(acquiredWhileNotYetReady, 'ownership was reachable before the container answered')
})

for (const step of ['start', 'probe', 'sleep'] as const) {
  test(`an unexpected throw from ${step} cleans up the owned container and re-propagates`, () => {
    const beef = hexId(7)
    const calls: string[][] = []
    let acquired: Throwaway | null = null
    const boom = new Error(`${step} exploded`)
    const io: ThrowawayIO = {
      run: (args): DockerResult => {
        calls.push(args)
        if (args[0] === 'create') return ok(`${beef}\n`)
        if (args[0] === 'start') {
          if (step === 'start') throw boom
          return ok()
        }
        return ok() // rm
      },
      probe: (): boolean => {
        if (step === 'probe') throw boom
        return false // force the sleep path when we are testing sleep
      },
      sleep: (): void => {
        if (step === 'sleep') throw boom
      }
    }
    assert.throws(
      () => startThrowaway(io, null, throwawayName(), url, { attempts: 3, onAcquire: (h) => (acquired = h) }),
      /exploded/,
      'the original failure must propagate loudly, not be swallowed'
    )
    assert.ok(acquired, 'ownership was published before the throw, so cleanup was possible')
    assert.deepEqual(calls.at(-1), ['rm', '-f', '-v', beef], 'the owned container is removed on the way out')
  })
}

test('a throw during cleanup does not mask the original startup failure', () => {
  const boom = new Error('start exploded')
  const io: ThrowawayIO = {
    run: (args): DockerResult => {
      if (args[0] === 'create') return ok(`${hexId(3)}\n`)
      if (args[0] === 'start') throw boom
      if (args[0] === 'rm') throw new Error('rm also exploded')
      return ok()
    },
    probe: (): boolean => false,
    sleep: (): void => {}
  }
  // The rm failure must be swallowed so the caller sees the real cause, not the cleanup noise.
  assert.throws(() => startThrowaway(io, null, throwawayName(), url, { attempts: 3 }), /start exploded/)
})

/**
 * Borrowed sources are read, never built and never removed. `pickDatabaseSource` decides this before
 * any container is touched, so these paths never reach the lifecycle above at all.
 */
test('a reachable exported url is borrowed, never a container', () => {
  const s = pickDatabaseSource('postgres://borrowed/exported', undefined, () => true)
  assert.deepEqual(s, { kind: 'exported', url: 'postgres://borrowed/exported' })
})

test('a reachable deploy/.env url is borrowed when nothing is exported', () => {
  const s = pickDatabaseSource(undefined, 'postgres://borrowed/deploy', (u) => u.includes('deploy'))
  assert.deepEqual(s, { kind: 'deploy', url: 'postgres://borrowed/deploy' })
})

test('an exported-but-unreachable url fails loudly, never falling through to a container', () => {
  // A wrong address is not a missing machine: it must not silently spin up a throwaway.
  const s = pickDatabaseSource('postgres://typo', 'postgres://borrowed/deploy', () => false)
  assert.deepEqual(s, { kind: 'exported-unreachable', url: 'postgres://typo' })
})

test('with no source available the throwaway is the last resort', () => {
  assert.deepEqual(
    pickDatabaseSource(undefined, undefined, () => false),
    { kind: 'throwaway' }
  )
  assert.deepEqual(
    pickDatabaseSource(undefined, 'postgres://deploy', () => false),
    { kind: 'throwaway' }
  )
})

/**
 * The siblings of the cases above: every way `create` can answer without handing over a container,
 * and every way `start` can fail to. None may leave something this invocation would later remove.
 */
for (const [name, stdout] of [
  ['empty', ''],
  ['whitespace only', '  \n'],
  ['one digit short', 'a'.repeat(63)],
  ['one digit long', 'a'.repeat(65)],
  ['upper-case hex', 'A'.repeat(64)],
  ['a name instead of an id', 'tch-check-tests-postgres-1-abcdef'],
  ['two ids', `${'a'.repeat(64)}\n${'b'.repeat(64)}\n`],
  ['a warning before the id', `WARNING: platform mismatch\n${'a'.repeat(64)}\n`]
] as const) {
  test(`create printing ${name} is not an id: nothing is started and nothing is removed`, () => {
    const calls: string[][] = []
    const io: ThrowawayIO = {
      run: (args): DockerResult => {
        calls.push(args)
        return args[0] === 'create' ? ok(stdout) : ok()
      },
      probe: (): boolean => true,
      sleep: (): void => {}
    }
    let acquired = false
    const handle = startThrowaway(io, null, throwawayName(), url, {
      attempts: 3,
      onAcquire: () => (acquired = true)
    })
    assert.equal(handle.outcome, 'create-failed')
    assert.equal(handle.url, undefined, 'a probe that would answer must not make this ready')
    assert.equal(handle.id, null)
    assert.equal(acquired, false, 'ownership of nothing is not published')
    handle.remove()
    assert.deepEqual(
      calls.map((c) => c[0]),
      ['create']
    )
  })
}

for (const step of ['create', 'start'] as const) {
  test(`${step} that could not be spawned (null status) is a failure, never a ready database`, () => {
    // `spawnSync` reports a missing binary, a denied socket and a signal the same way: status null.
    const calls: string[][] = []
    const io: ThrowawayIO = {
      run: (args): DockerResult => {
        calls.push(args)
        if (args[0] === step) return { status: null, stdout: '', stderr: 'permission denied' }
        return args[0] === 'create' ? ok(`${hexId(5)}\n`) : ok()
      },
      probe: (): boolean => true,
      sleep: (): void => {}
    }
    const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
    assert.equal(handle.outcome, step === 'create' ? 'create-failed' : 'start-failed')
    assert.equal(handle.url, undefined)
    handle.remove()
    const rms = calls.filter((c) => c[0] === 'rm')
    assert.deepEqual(rms, step === 'create' ? [] : [['rm', '-f', '-v', hexId(5)]])
  })
}

test('a database that answers late is ready, within the attempts and not one probe more', () => {
  let probes = 0
  let sleeps = 0
  const base = new SharedDaemon().io()
  const io: ThrowawayIO = { ...base, probe: (): boolean => ++probes === 3, sleep: (): void => void sleeps++ }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  assert.equal(handle.outcome, 'ready')
  assert.equal(handle.url, url)
  assert.deepEqual([probes, sleeps], [3, 2])
})

test('an rm that could not be spawned stays retryable, like one that failed', () => {
  let results: (number | null)[] = [null, 1, 0]
  const rms: string[][] = []
  const base = new SharedDaemon().io()
  const io: ThrowawayIO = {
    ...base,
    run: (args): DockerResult => {
      if (args[0] !== 'rm') return base.run(args)
      rms.push(args)
      const [status, ...rest] = results
      results = rest
      return { status, stdout: '', stderr: '' }
    }
  }
  const handle = startThrowaway(io, null, throwawayName(), url, { attempts: 3 })
  for (let i = 0; i < 5; i++) handle.remove()
  assert.equal(rms.length, 3, 'two failures, one success, then nothing')
  for (const rm of rms) assert.deepEqual(rm, ['rm', '-f', '-v', handle.id])
})

/**
 * `--database`: the flag that keeps a run away from borrowed databases. A typo that fell back to
 * the borrowed order would do the one thing the flag exists to prevent.
 */
test('no --database is the order the gate always had', () => {
  assert.deepEqual(parseDatabaseMode([]), { mode: 'auto' })
  assert.deepEqual(parseDatabaseMode(['--part', 'workers:1/2,rest']), { mode: 'auto' })
})

test('--database owned is accepted wherever it stands among the arguments', () => {
  assert.deepEqual(parseDatabaseMode(['--database', 'owned']), { mode: 'owned' })
  assert.deepEqual(parseDatabaseMode(['--part', 'workers', '--database', 'owned']), { mode: 'owned' })
  assert.deepEqual(parseDatabaseMode(['--database', 'owned', '--part', 'workers']), { mode: 'owned' })
})

test('a missing, repeated, glued or unknown --database is an error, never a silent auto', () => {
  for (const argv of [
    ['--database'],
    ['--part', 'workers', '--database'],
    ['--database', '--part', 'workers'],
    ['--database', 'owned', '--database', 'owned'],
    ['--database', 'owned', '--database'],
    ['--database=owned'],
    ['--database', 'owned', '--database=owned'],
    ['--databases', 'owned'],
    ['--database', 'auto'],
    ['--database', 'Owned'],
    ['--database', 'owned '],
    ['--database', ''],
    ['--database', 'throwaway'],
    ['--database', 'exported']
  ]) {
    const parsed = parseDatabaseMode(argv)
    assert.ok('error' in parsed, argv.join(' '))
    assert.match(parsed.error, /--database|database mode/, argv.join(' '))
  }
})

test('any argument that is not a known flag with its value is an error, never a silent auto', () => {
  for (const argv of [
    ['--databas', 'owned'],
    ['--part', 'workers', '--databas', 'owned'],
    ['-database', 'owned'],
    ['--Database', 'owned'],
    ['--db', 'owned'],
    ['database', 'owned'],
    ['owned'],
    ['--database', 'owned', 'extra'],
    ['--part', 'workers', 'owned'],
    ['--par', 'workers'],
    ['--part=workers'],
    ['--'],
    ['']
  ]) {
    const parsed = parseDatabaseMode(argv)
    assert.ok('error' in parsed, argv.join(' '))
    assert.match(parsed.error, /^unknown argument /, argv.join(' '))
  }
  // A flag given twice is two answers to one question, whichever flag it is.
  for (const argv of [
    ['--part', 'workers', '--part', 'rest'],
    ['--part', 'workers', '--database', 'owned', '--part', 'workers']
  ]) {
    const parsed = parseDatabaseMode(argv)
    assert.ok('error' in parsed, argv.join(' '))
    assert.match(parsed.error, /^--part given more than once/, argv.join(' '))
  }
  // A flag's value is never read as a flag: `--part` followed by nothing is `parseParts`'s to name.
  assert.ok('error' in parseDatabaseMode(['--part']))
  assert.ok('error' in parseDatabaseMode(['--database', 'owned', '--part']))
})

/** Sources that record what was asked of them; a borrowed one that must not be asked throws instead. */
function sources(over: Partial<DatabaseIO> = {}): DatabaseIO & { asked: string[] } {
  const asked: string[] = []
  const forbidden = (what: string) => (): never => {
    asked.push(what)
    throw new Error(`${what} must not be read in this mode`)
  }
  const io: DatabaseIO = {
    exported: forbidden('exported'),
    deployEnv: forbidden('deployEnv'),
    answers: forbidden('answers'),
    throwaway: forbidden('throwaway'),
    ...over
  }
  return {
    exported: () => io.exported(),
    deployEnv: () => io.deployEnv(),
    answers: (u) => io.answers(u),
    throwaway: () => {
      asked.push('throwaway')
      return io.throwaway()
    },
    asked
  }
}

test('owned never reads the exported url or deploy/.env and never probes: only its own database', () => {
  // The borrowed readers throw if called — an unreadable deploy/.env, a FIFO, a symlink, a customer's
  // url: none can matter to a mode that does not open them. The inherited values are every shape
  // an environment can hold.
  for (const inherited of [
    undefined,
    '',
    'postgres://customer:secret@db.example.invalid/live',
    'not a url',
    ' postgres://tracy:tracy@127.0.0.1:55432/tracy'
  ]) {
    const env: Record<string, string | undefined> = { TEST_DATABASE_URL: inherited, OTHER: 'kept' }
    const io = sources({ throwaway: () => url })
    assert.deepEqual(prepareDatabase('owned', io, env), { ok: true, source: 'throwaway', url })
    assert.deepEqual(io.asked, ['throwaway'], String(inherited))
    assert.equal(env.TEST_DATABASE_URL, url, 'the suites get the url of the container this run created')
    assert.equal(env.OTHER, 'kept')
  }
})

test('owned whose database did not come up fails AND leaves no inherited url behind for the suites', () => {
  for (const nothing of [undefined, ''] as const) {
    const env: Record<string, string | undefined> = { TEST_DATABASE_URL: 'postgres://customer/live' }
    const io = sources({ throwaway: () => nothing })
    assert.deepEqual(prepareDatabase('owned', io, env), { ok: false, reason: 'no-database' })
    assert.deepEqual(io.asked, ['throwaway'])
    assert.ok(!('TEST_DATABASE_URL' in env), 'a failed owned run must not fall back to what it inherited')
  }
})

test('owned lets a throw from its own startup through, having already dropped the inherited url', () => {
  const env: Record<string, string | undefined> = { TEST_DATABASE_URL: 'postgres://customer/live' }
  const io = sources({
    throwaway: () => {
      throw new Error('probe exploded')
    }
  })
  assert.throws(() => prepareDatabase('owned', io, env), /probe exploded/)
  assert.ok(!('TEST_DATABASE_URL' in env))
})

test('auto borrows a reachable exported url as it is: no container, no write', () => {
  const env: Record<string, string | undefined> = { TEST_DATABASE_URL: 'postgres://borrowed/exported' }
  const io = sources({
    exported: () => env.TEST_DATABASE_URL,
    deployEnv: () => 'postgres://borrowed/deploy',
    answers: (u) => u === 'postgres://borrowed/exported'
  })
  assert.deepEqual(prepareDatabase('auto', io, env), {
    ok: true,
    source: 'exported',
    url: 'postgres://borrowed/exported'
  })
  assert.deepEqual(io.asked, [], 'a borrowed database means no throwaway is created')
  assert.equal(env.TEST_DATABASE_URL, 'postgres://borrowed/exported')
})

test('auto fails on an exported url that does not answer — malformed or unreachable — with no fallback', () => {
  for (const exported of ['postgres://typo', 'not a url', '   ', 'postgres://u:p@127.0.0.1:1/x']) {
    const env: Record<string, string | undefined> = { TEST_DATABASE_URL: exported }
    const probed: string[] = []
    const io = sources({
      exported: () => exported,
      // A deploy database that WOULD answer: falling through to it is the masking this refuses.
      deployEnv: () => 'postgres://borrowed/deploy',
      answers: (u) => {
        probed.push(u)
        return u === 'postgres://borrowed/deploy'
      }
    })
    assert.deepEqual(prepareDatabase('auto', io, env), {
      ok: false,
      reason: 'exported-unreachable',
      url: exported
    })
    assert.deepEqual(probed, [exported], 'the next source is not even probed')
    assert.deepEqual(io.asked, [], 'and no container is started to hide the wrong address')
    assert.equal(env.TEST_DATABASE_URL, exported)
  }
})

test('auto uses deploy/.env when nothing is exported, and writes its url for the suites', () => {
  for (const exported of [undefined, ''] as const) {
    const env: Record<string, string | undefined> = { TEST_DATABASE_URL: exported }
    const io = sources({
      exported: () => exported,
      deployEnv: () => 'postgres://borrowed/deploy',
      answers: () => true
    })
    assert.deepEqual(prepareDatabase('auto', io, env), {
      ok: true,
      source: 'deploy',
      url: 'postgres://borrowed/deploy'
    })
    assert.deepEqual(io.asked, [])
    assert.equal(env.TEST_DATABASE_URL, 'postgres://borrowed/deploy')
  }
})

test('auto reaches the throwaway only as the last resort, and no database at all is a failure', () => {
  for (const deploy of [undefined, '', 'postgres://deploy/down'] as const) {
    const up: Record<string, string | undefined> = {}
    const started = sources({
      exported: () => undefined,
      deployEnv: () => deploy,
      answers: () => false,
      throwaway: () => url
    })
    assert.deepEqual(prepareDatabase('auto', started, up), { ok: true, source: 'throwaway', url })
    assert.equal(up.TEST_DATABASE_URL, url)

    const down: Record<string, string | undefined> = {}
    const failed = sources({
      exported: () => undefined,
      deployEnv: () => deploy,
      answers: () => false,
      throwaway: () => undefined
    })
    assert.deepEqual(prepareDatabase('auto', failed, down), { ok: false, reason: 'no-database' })
    assert.ok(!('TEST_DATABASE_URL' in down))
  }
})
