// The image builder of each runner (`.github/actions/buildx-builder/`): both image workflows use
// it, it creates the builder with the repo's BuildKit config, it recreates a builder whose config
// is not the current one (keeping the cache volume), and the config is a GC policy BuildKit can
// load. The action's shell runs here against a fake `docker` that records every call.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ACTION_DIR = join(ROOT, '.github', 'actions', 'buildx-builder')
const CONFIG = join(ACTION_DIR, 'buildkitd.toml')
const WORKFLOWS = ['build-app-images.yml', 'build-dsh-image.yml']

const action = load(readFileSync(join(ACTION_DIR, 'action.yml'), 'utf8'))
const script = action.runs.steps[0].run
const configHash = createHash('sha256')
  .update(readFileSync(CONFIG))
  .update('--driver docker-container\n')
  .digest('hex')
  .slice(0, 16)

test('both image workflows get their builder from the shared action, and only from it', () => {
  for (const file of WORKFLOWS) {
    const wf = load(readFileSync(join(ROOT, '.github', 'workflows', file), 'utf8'))
    const steps = Object.values(wf.jobs).flatMap((job) => job.steps ?? [])
    const users = steps.filter((s) => s.uses === './.github/actions/buildx-builder')
    const builds = steps.filter((s) => String(s.run ?? '').includes('--builder "$BUILDER"'))
    assert.ok(builds.length > 0, `${file}: no step builds with $BUILDER`)
    assert.equal(users.length, builds.length, `${file}: every building job sets its builder up once`)
    for (const s of steps) {
      assert.ok(
        !String(s.run ?? '').includes('buildx create'),
        `${file}: a builder created outside the action`
      )
    }
  }
})

// ─── the action's shell against a fake docker ──────────────────────────────────────────────────

/**
 * Runs the action's script. `container` is the env of an existing `buildx_buildkit_tracy-r1-0`
 * (null = no container), `listed` whether this user's buildx list knows the builder, `help` what
 * `docker buildx create --help` prints. Returns the docker calls, one argv per line.
 */
function runAction({
  container,
  listed,
  help = '  --buildkitd-config string   BuildKit daemon config file'
}) {
  const dir = mkdtempSync(join(tmpdir(), 'buildx-builder-'))
  try {
    const bin = join(dir, 'bin')
    const log = join(dir, 'docker.log')
    const listedFile = join(dir, 'listed')
    if (listed) writeFileSync(listedFile, '')
    writeFileSync(join(dir, 'help'), help)
    writeFileSync(join(dir, 'env'), container ?? '')
    mkdirSync(bin)
    writeFileSync(
      join(bin, 'docker'),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$1 $2" in
  "buildx create") if [ "\${3:-}" = --help ]; then cat "${dir}/help"; else touch "${listedFile}"; fi ;;
  "buildx inspect") [ -e "${listedFile}" ] || exit 1; echo "Name: $3" ;;
  "buildx rm") rm "${listedFile}" ;;
  "container inspect") [ -s "${dir}/env" ] || exit 1; cat "${dir}/env" ;;
  "container rm") ;;
  *) echo "unexpected docker call: $*" >&2; exit 9 ;;
esac
`
    )
    chmodSync(join(bin, 'docker'), 0o755)
    const githubEnv = join(dir, 'github-env')
    const r = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_NAME: 'r1',
        GITHUB_ENV: githubEnv,
        GITHUB_ACTION_PATH: ACTION_DIR
      }
    })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(readFileSync(githubEnv, 'utf8'), 'BUILDER=tracy-r1\n')
    const calls = readFileSync(log, 'utf8').trim().split('\n')
    // The cache is the state volume: nothing here may ever take it.
    for (const c of calls) assert.doesNotMatch(c, /volume|\s-v\b|--volumes/, c)
    return { calls, stdout: r.stdout }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const createLine = (flag) =>
  `buildx create --name tracy-r1 --driver docker-container ${flag} ${CONFIG} ` +
  `--driver-opt env.TRACY_BUILDKITD_CONFIG=${configHash} --bootstrap`
const currentEnv = `PATH=/usr/bin\nTRACY_BUILDKITD_CONFIG=${configHash}\n`

test('no builder yet: created with the repo config and its hash', () => {
  const { calls } = runAction({ container: null, listed: false })
  assert.ok(calls.includes(createLine('--buildkitd-config')), calls.join('\n'))
  assert.ok(!calls.some((c) => c.startsWith('buildx rm')))
})

test('a builder with the current config is reused, not recreated', () => {
  const { calls } = runAction({ container: currentEnv, listed: true })
  assert.ok(!calls.some((c) => c.startsWith('buildx create --name') || c.includes(' rm ')), calls.join('\n'))
  assert.ok(calls.includes('buildx inspect tracy-r1 --bootstrap'))
})

test('a builder made before the config, or with an older one, is replaced and keeps its cache', () => {
  for (const env of ['PATH=/usr/bin\n', 'PATH=/usr/bin\nTRACY_BUILDKITD_CONFIG=0123456789abcdef\n']) {
    const { calls } = runAction({ container: env, listed: true })
    const rm = calls.indexOf('buildx rm --keep-state tracy-r1')
    const create = calls.indexOf(createLine('--buildkitd-config'))
    assert.ok(rm >= 0 && create > rm, calls.join('\n'))
  }
})

test('a current container this runner home does not list (a fresh home) is recreated plainly', () => {
  const { calls } = runAction({ container: currentEnv, listed: false })
  assert.ok(calls.includes('container rm -f buildx_buildkit_tracy-r10'), calls.join('\n'))
  assert.ok(calls.includes(createLine('--buildkitd-config')))
})

test('a buildx older than v0.13 gets the config through --config', () => {
  const { calls } = runAction({
    container: null,
    listed: false,
    help: '  --config string   BuildKit config file'
  })
  assert.ok(calls.includes(createLine('--config')), calls.join('\n'))
})

// ─── the config itself ─────────────────────────────────────────────────────────────────────────

/**
 * The TOML subset buildkitd.toml uses — `[table]`, `[[array of tables]]`, `key = "string" | number
 * | bool | ["string", …]`, comments — parsed strictly: any other line fails the test instead of
 * being skipped. (No TOML parser is a dependency of the repo root.)
 */
function parseToml(text) {
  const root = {}
  let cur = root
  const at = (path) => path.split('.').reduce((o, k) => (o[k] ??= {}), root)
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (line === '' || line.startsWith('#')) continue
    let m
    if ((m = /^\[\[([\w.]+)\]\]$/.exec(line))) {
      const parts = m[1].split('.')
      const parent = parts.length > 1 ? at(parts.slice(0, -1).join('.')) : root
      const list = (parent[parts.at(-1)] ??= [])
      cur = {}
      list.push(cur)
    } else if ((m = /^\[([\w.]+)\]$/.exec(line))) {
      cur = at(m[1])
    } else if ((m = /^(\w+)\s*=\s*(.+)$/.exec(line))) {
      const v = m[2]
      if (v === 'true' || v === 'false') cur[m[1]] = v === 'true'
      else if (/^\d+$/.test(v)) cur[m[1]] = Number(v)
      else if (/^"[^"]*"$/.test(v) || /^\[\s*("[^"]*"\s*,?\s*)*\]$/.test(v)) cur[m[1]] = JSON.parse(v)
      else assert.fail(`buildkitd.toml:${i + 1}: value not understood: ${v}`)
    } else assert.fail(`buildkitd.toml:${i + 1}: line not understood: ${raw}`)
  }
  return root
}

// BuildKit's own parsers (cmd/buildkitd/config/gcpolicy.go): a disk space is a percentage or a
// go-units RAMInBytes size (binary units); a duration is a Go duration or whole seconds.
const GIB = 1024 ** 3
function bytes(v) {
  const m = /^(\d+(?:\.\d+)?)\s*([kmgt]?)i?b?$/i.exec(String(v))
  assert.ok(m, `not a BuildKit disk space: ${v}`)
  return Number(m[1]) * 1024 ** ' kmgt'.indexOf(m[2].toLowerCase() || ' ')
}
function hours(v) {
  const m = /^(\d+)h$/.exec(v)
  assert.ok(m, `not a duration this test reads: ${v}`)
  return Number(m[1])
}
const FILTER = /^type==(source\.local|exec\.cachemount|source\.git\.checkout|regular|internal|frontend)$/

test('buildkitd.toml is a GC policy BuildKit loads, sized from the 16/11 measurement', () => {
  const conf = parseToml(readFileSync(CONFIG, 'utf8'))
  const known = new Set(['filters', 'keepDuration', 'reservedSpace', 'maxUsedSpace', 'minFreeSpace', 'all'])
  assert.equal(conf.worker.oci.gc, true)
  const rules = conf.worker.oci.gcpolicy
  assert.ok(Array.isArray(rules) && rules.length >= 2, 'explicit rules replace the default policy')
  for (const rule of rules) {
    for (const k of Object.keys(rule)) assert.ok(known.has(k), `unknown gcpolicy key ${k}`)
    for (const f of rule.filters ?? []) assert.match(f, FILTER)
    if (rule.keepDuration) hours(rule.keepDuration)
    if (rule.reservedSpace && rule.maxUsedSpace) {
      assert.ok(bytes(rule.reservedSpace) <= bytes(rule.maxUsedSpace), 'reservedSpace above maxUsedSpace')
    }
    if (rule.minFreeSpace) assert.match(rule.minFreeSpace, /^\d{1,2}%$/)
  }
  // The cap must hold one day of both workflows (30.6 GB measured) with headroom, and be well
  // below the 100 GB default that let the cache reach 98.5 GB.
  const caps = rules.filter((r) => !r.filters && r.maxUsedSpace).map((r) => bytes(r.maxUsedSpace))
  assert.ok(caps.length > 0, 'no size cap on ordinary records')
  for (const cap of caps) assert.ok(cap >= 1.3 * 30.6e9 && cap < 80 * GIB, `cap ${cap / GIB} GiB`)
  // Something removes old records whatever the size, so the record count stays bounded too.
  assert.ok(rules.some((r) => r.keepDuration && !r.filters && !r.maxUsedSpace && !r.minFreeSpace))
})

test('the action points at the config next to it', () => {
  assert.ok(existsSync(CONFIG))
  assert.match(script, /CONFIG="\$GITHUB_ACTION_PATH\/buildkitd\.toml"/)
  assert.match(script, /"\$config_flag" "\$CONFIG"/)
})
