/**
 * REG-104: the EmDash image build keeps an 8 GB Node heap even when upstream's Dockerfile sets its
 * own heap line after COPY, and the guard counts heap lines instead of matching any. The test's two
 * heap cases need GNU sed, so on macOS the suite runs inside `node:22` (as the case says); the
 * script's sed patch is applied to a copy of the pinned upstream Dockerfile in the same shell.
 * A machine with neither Linux + GNU sed nor docker cannot run the case.
 */
import { checks, cannotRun, countLines, readTap, ROOT, run } from './lib.mjs'

const SCRIPT = 'packages/fleet/tracy-fleet-operation/scripts/provision/emdash/build-image.sh'
const PATCH = String.raw`s|^ENV NODE_OPTIONS=--max-old-space-size=[0-9]*|ENV NODE_OPTIONS=--max-old-space-size=8192|`

/**
 * The shell both roads run: the suite, then the patch on a copy, then the two counts.
 * @param {string} work - the tracy-fleet-operation folder.
 * @param {string} upstream - the pinned upstream Dockerfile.
 * @returns {string} bash source.
 */
const shell = (work, upstream) =>
  [
    `cd '${work}'`,
    'node --test --test-reporter=tap test/emdash-build-image.test.mjs; echo "TEST_EXIT=$?"',
    `q=$(mktemp -d); cp '${upstream}' "$q/Dockerfile"; sed -i '${PATCH}' "$q/Dockerfile"`,
    `echo "HEAP_LINES=$(grep -c 'max-old-space-size=' "$q/Dockerfile")"`,
    `echo "HEAP_8G=$(grep -c 'max-old-space-size=8192' "$q/Dockerfile")"`
  ].join('\n')

const gnuSed = process.platform === 'linux' && run('sed', ['--version']).stdout.includes('GNU sed')
let out
if (gnuSed) {
  out = run('bash', [
    '-c',
    shell(`${ROOT}/packages/fleet/tracy-fleet-operation`, `${ROOT}/vendor/emdash/emdash/Dockerfile`)
  ])
} else {
  if (run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutS: 30 }).status !== 0)
    cannotRun('not Linux with GNU sed, and no running docker daemon to run node:22 in')
  out = run('docker', [
    'run',
    '--rm',
    '-v',
    `${ROOT}/packages/fleet/tracy-fleet-operation:/w`,
    '-v',
    `${ROOT}/vendor/emdash/emdash/Dockerfile:/upstream/Dockerfile:ro`,
    '-w',
    '/w',
    'node:22',
    'bash',
    '-c',
    `git config --global --add safe.directory '*'\n${shell('/w', '/upstream/Dockerfile')}`
  ])
}

const c = checks()
const value = (name) => Number(new RegExp(`^${name}=(\\d+)$`, 'm').exec(out.stdout)?.[1] ?? Number.NaN)
const tap = readTap(out.stdout)
c.eq('test command exit code', value('TEST_EXIT'), 0)
c.eq('PASS_N', tap.counts.pass, 5)
c.eq('FAIL_N', tap.counts.fail, 0)
c.eq('SKIP_N', tap.counts.skipped, 0)
c.eq('HEAP_LINES', value('HEAP_LINES'), 1)
c.eq('HEAP_8G', value('HEAP_8G'), 1)
const guard = countLines(SCRIPT, 'HEAP_8G')
c.check('GUARD_COUNT >= 1', guard >= 1, guard)
c.eq('OLD_GUARD', countLines(SCRIPT, "grep -q 'max-old-space-size'"), 0)
if (Number.isNaN(value('TEST_EXIT'))) process.stdout.write(`${out.stdout}\n${out.stderr}\n`.slice(-2000))
c.done()
