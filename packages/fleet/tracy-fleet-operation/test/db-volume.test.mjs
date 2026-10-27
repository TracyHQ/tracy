/**
 * Whether a freshly minted database password can open the database a stack is about to start.
 *
 * Measured 23/09 on tracy-fleet-01: `business-joomla` provisioned into `/srv/tracy-private/` while
 * an older stack of the same name still ran from `/srv/tracy/` — same compose project, same
 * `business-joomla_db` volume, initialised on 14/09 with a password this run never had. The
 * readiness loop was refused 90 times and the job ended "database never became ready".
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../scripts/lib/db-volume.sh', import.meta.url))
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/**
 * A `docker` that knows a fixed set of containers (compose working dirs) and volumes, and answers
 * the two questions the lib asks the way the real CLI does. `fail` makes every call exit 1.
 */
function stand({ owners = [], volumes = [], fail = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-db-volume-'))
  temps.push(dir)
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(path.join(dir, 'owners'), owners.map((o) => `${o}\n`).join(''))
  writeFileSync(path.join(dir, 'volumes'), volumes.map((v) => `${v}\n`).join(''))
  const script = fail
    ? '#!/bin/sh\necho "Cannot connect to the Docker daemon" >&2\nexit 1\n'
    : `#!/bin/sh
case "$1 $2" in
  "ps -a") cat "${dir}/owners" ;;
  "volume ls") cat "${dir}/volumes" ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
`
  writeFileSync(path.join(bin, 'docker'), script, { mode: 0o755 })
  return { bin }
}

function ask(label, dir, { bin }) {
  const run = spawnSync(
    'bash',
    ['-euo', 'pipefail', '-c', '. "$1"; tracy_db_volume_conflict "$2" "$3"', '_', LIB, label, dir],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
    }
  )
  return { status: run.status, out: run.stdout.trim() }
}

const HERE = '/srv/tracy-private/business-joomla'

test('a host with no trace of the stack lets a new password through', () => {
  assert.deepEqual(ask('business-joomla', HERE, stand()), { status: 0, out: '' })
})

test("the stack's own containers are not a conflict", () => {
  assert.equal(ask('business-joomla', HERE, stand({ owners: [HERE, HERE] })).status, 0)
})

test('another stack owning the same compose project is refused, naming where it lives', () => {
  const r = ask(
    'business-joomla',
    HERE,
    stand({ owners: ['/srv/tracy/business-joomla', HERE], volumes: ['business-joomla_db'] })
  )
  assert.equal(r.status, 1)
  assert.match(
    r.out,
    /compose project business-joomla already belongs to the stack at \/srv\/tracy\/business-joomla/
  )
  assert.doesNotMatch(r.out, new RegExp(`${HERE} `), 'the stack being provisioned is not named as the owner')
})

test('a volume that outlived its stack is refused, naming the volume', () => {
  const r = ask('business-joomla', HERE, stand({ volumes: ['business-joomla_db'] }))
  assert.equal(r.status, 1)
  assert.match(r.out, /volume business-joomla_db outlived its stack/)
})

test('a volume of a longer label is not mistaken for this one', () => {
  const r = ask('business-joomla', HERE, stand({ volumes: ['business-joomla-2_db', 'x-business-joomla_db'] }))
  assert.deepEqual(r, { status: 0, out: '' })
})

// Regression (04/10/2026): the volume check was `printf | grep -q` under pipefail. grep quit on the
// match while bash was still writing the lines after it; SIGPIPE turned "found" into "not found" and
// a stack whose old volume holds an unknown password went ahead. The real filter answers one name,
// so this is the reader's contract rather than a seen failure: a long answer cannot flip it.
test('a matching volume is found however long the answer after it', () => {
  const others = Array.from({ length: 20000 }, (_, i) => `other-${i}_db`)
  const r = ask('business-joomla', HERE, stand({ volumes: ['business-joomla_db', ...others] }))
  assert.equal(r.status, 1)
  assert.match(r.out, /volume business-joomla_db outlived its stack/)
})

test('a docker that cannot answer is a refusal, not a clean host', () => {
  const r = ask('business-joomla', HERE, stand({ fail: true }))
  assert.equal(r.status, 1)
  assert.match(r.out, /cannot ask docker/)
})
