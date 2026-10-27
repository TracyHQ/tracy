import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { measureRelease, releaseOf } from '../scripts/release-measure.mjs'

test('a release of the batch: its line, its slot contract, and ports of its own', () => {
  const a = releaseOf('quickstart/ja-prodex/j6@1.0.4', 0, 52900)
  const b = releaseOf('quickstart/ja-prodex/j6@1.0.3', 1, 52900)
  assert.equal(a.platform, 'joomla')
  assert.equal(a.template, 'ja-prodex')
  assert.equal(a.contract, 'joomla-ja-prodex')
  // two releases measured at once never share a stand, a site port or a probe server
  assert.notEqual(a.name, b.name)
  assert.equal(a.port, 52900)
})

test('every port of every job comes from one base, none shared, whatever the base', () => {
  for (const base of [52900, 9700, 9701, 9611]) {
    const ports = [0, 1, 2, 3].flatMap((i) => {
      const r = releaseOf('quickstart/ja-prodex/j6@1.0.4', i, base)
      return [r.port, r.probePort, r.parityPort]
    })
    assert.equal(new Set(ports).size, ports.length, `ports shared at base ${base}: ${ports}`)
  }
  // a base whose last job would leave the port range is refused before anything runs
  assert.match(releaseOf('quickstart/ja-prodex/j6@1.0.4', 1, 65534).error, /port/)
})

test("--stand names every stand of the run, so a batch beside other agents' stands is told apart", () => {
  // the default keeps the old names, which other batches' teardown scripts already look for
  assert.equal(releaseOf('quickstart/ja-prodex/j6@1.0.4', 0, 52900).name, 'dsm-52900-ja-prodex-104')
  const r = releaseOf('quickstart/ja-podcast/j6@1.0.7', 1, 53300, 'text1-b3')
  assert.equal(r.name, 'text1-b3-53303-ja-podcast-107')
  // the docker name limit the stands keep (40) holds for the longest prefix the flag takes
  assert.match(releaseOf('quickstart/ja-prodex/j6@1.0.4', 0, 52900, 'a'.repeat(30)).error, /--stand/)
  assert.match(releaseOf('quickstart/ja-prodex/j6@1.0.4', 0, 52900, 'Bad Name').error, /--stand/)
})

test('a release the batch cannot measure says why, before anything runs', () => {
  assert.match(releaseOf('ja-prodex@1.0.4', 0).error, /quickstart\/template\/line/)
  assert.match(releaseOf('quickstart/ja-prodex/j6@9.9.9', 0).error, /no slot contract/)
})

/** A job run with a fake command runner: `fail` names the step that exits non-zero. */
async function job(
  /** @type {{ fail?: string, left?: string[], base?: number, spec?: string, brandOnly?: boolean }} */ o = {}
) {
  const work = mkdtempSync(join(tmpdir(), 'release-measure-test-'))
  /** @type {string[]} */
  const ran = []
  /** @type {string[][]} */
  const argvs = []
  try {
    const r = releaseOf(o.spec ?? 'quickstart/ja-prodex/j6@1.0.4', 0, o.base ?? 52890)
    const result = await measureRelease(r, {
      work,
      previewOnly: true,
      brandOnly: o.brandOnly ?? false,
      quiet: true,
      exec: async (_log, argv) => {
        const step = `${argv[0].split('/').pop()} ${argv[1]}`
        ran.push(step)
        argvs.push(argv)
        if (o.fail && step.startsWith(o.fail)) throw new Error(`${step} exited 1`)
        return argv[1] === 'up' ? `${JSON.stringify({ db: `${r.name}-db`, web: `${r.name}-web` })}\n` : ''
      },
      left: async () => o.left ?? []
    })
    return { result, ran, argvs, work }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

test('a job is ok only when its stand went down', async () => {
  const ok = await job()
  assert.equal(ok.result.ok, true)
  assert.equal(ok.ran.at(-1), 'stand.mjs down')
  // stand.mjs down failed: the job fails, though every measuring step passed
  const down = await job({ fail: 'stand.mjs down' })
  assert.equal(down.result.ok, false)
  assert.match(down.result.error, /stand down/)
  // stand.mjs down said done, but a container of the stand is still there
  const left = await job({ left: ['dsm-x-web'] })
  assert.equal(left.result.ok, false)
  assert.match(left.result.error, /dsm-x-web/)
  // a measuring step failed and the stand went down: the step's error is the one said
  const step = await job({ fail: 'preview-check.mjs' })
  assert.equal(step.result.ok, false)
  assert.match(step.result.error, /preview-check/)
  assert.equal(step.ran.at(-1), 'stand.mjs down')
})

test('a port already taken fails the job before any stand is touched', async () => {
  const server = createServer()
  await new Promise((ok) => server.listen(52881, '127.0.0.1', () => ok(null)))
  try {
    // base 52880: job 0 is 52880 (stand), 52881 (preview-check probe), 52882 (parity probe)
    const taken = await job({ base: 52880 })
    assert.equal(taken.result.ok, false)
    assert.match(taken.result.error, /52881/)
    assert.deepEqual(taken.ran, [])
  } finally {
    server.close()
  }
})

test('a version not yet published names its local build, passed on to the stand', () => {
  assert.equal(releaseOf('quickstart/ja-prodex/j6@1.0.4', 0, 52900).fromDir, null)
  const r = releaseOf('quickstart/ja-prodex/j6@1.0.4=out/ja-prodex/release', 0, 52900)
  assert.equal(r.version, '1.0.4')
  assert.equal(r.fromDir, 'out/ja-prodex/release')
})

test("a step's output lives beside the stand's folder, which stand.mjs down removes", async () => {
  const { result, argvs, work } = await job()
  const outOf = (/** @type {string} */ script) => {
    const argv = argvs.find((a) => a[0].endsWith(script)) ?? []
    return argv[argv.indexOf('--out') + 1]
  }
  const standDir = join(work, result.name)
  assert.equal(result.out, join(work, `${result.name}.out`))
  for (const out of [outOf('preview-check.mjs'), outOf('preview-parity.mjs')]) {
    assert.ok(out.startsWith(result.out), out)
    assert.ok(!out.startsWith(`${standDir}/`), out)
  }
})

test('a WordPress release has its brand facts measured on its stand; --brand-only measures nothing else', async () => {
  const wp = await job({ spec: 'quickstart/ja-diner/wp7@1.0.1' })
  assert.equal(wp.result.ok, true)
  assert.deepEqual(wp.ran, [
    'stand.mjs up',
    'preview-check.mjs --demos',
    'brand-facts.mjs --site',
    'stand.mjs down'
  ])
  const brand = wp.argvs.find((a) => a[0].endsWith('brand-facts.mjs')) ?? []
  assert.equal(brand[brand.indexOf('--wp-container') + 1], `${wp.result.name}-web`)
  assert.equal(brand[brand.indexOf('--version') + 1], '1.0.1')
  const only = await job({ spec: 'quickstart/ja-diner/wp7@1.0.1', brandOnly: true })
  assert.deepEqual(only.ran, ['stand.mjs up', 'brand-facts.mjs --site', 'stand.mjs down'])
  // a Joomla release has no brand step (its rows hold T3/T4 facts this probe does not read)
  const joomla = await job()
  assert.equal(
    joomla.ran.some((s) => s.startsWith('brand-facts')),
    false
  )
})
