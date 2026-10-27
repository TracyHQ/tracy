/**
 * The recon runner: OpenDesign's web-clone scripts (real Chrome over CDP) run against the forked
 * site and leave their evidence under `Brand/<host>/recon/`. The scripts themselves are not run here —
 * a fake script directory stands in — so the test pins the contract: which scripts, in which order,
 * where the files land, and that a missing browser or a hung script degrades to a note, never an error.
 */
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { runRecon } from '../src/host/recon.mjs'

/** Fake scripts: each writes `<name>.args` beside its `--out` and, for recon-site, the JSON dna-scaffold reads. */
function fakeScripts(dir, { hang = false } = {}) {
  mkdirSync(dir, { recursive: true })
  const body = (name) => `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'
const a = process.argv.slice(2); const out = a[a.indexOf('--out') + 1]
${hang ? 'await new Promise(() => { setInterval(() => {}, 1000) })' : ''}
if ('${name}' === 'dna-scaffold') { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, '{"meta":{}}'); process.exit(0) }
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, '${name}.args'), a.join(' ') + ' cwd=' + process.cwd() + ' browser=' + (process.env.OD_BROWSER_EXECUTABLE_PATH ?? ''))
if ('${name}' === 'recon-site') fs.writeFileSync(path.join(out, 'original-recon.json'), '{"captures":[]}')
`
  for (const name of ['recon-site', 'route-crawl', 'dna-scaffold']) {
    const file = path.join(dir, `${name}.mjs`)
    writeFileSync(file, body(name))
    chmodSync(file, 0o755)
  }
  return dir
}

test('runRecon: recon-site, route-crawl, dna-scaffold in that order, under <dir>/recon/, with the browser named', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-recon-'))
  try {
    const scripts = fakeScripts(path.join(root, 'scripts'))
    const dir = path.join(root, 'Brand', 'acme.example')
    const steps = []
    const result = await runRecon('https://acme.example/', dir, {
      scriptsDir: scripts,
      browser: '/usr/local/bin/tracy-chrome',
      onProgress: (s, d) => steps.push([s, d])
    })
    assert.equal(result.status, 'done')
    const recon = readFileSync(path.join(dir, 'recon', 'RECON', 'recon-site.args'), 'utf8')
    assert.match(recon, /--url https:\/\/acme\.example\/ --out RECON --label original/)
    assert.match(recon, /browser=\/usr\/local\/bin\/tracy-chrome/)
    assert.ok(
      recon.includes(`cwd=${realpathSync(path.join(dir, 'recon'))}`),
      'the scripts run inside <dir>/recon'
    )
    const routes = readFileSync(path.join(dir, 'recon', 'RECON', 'routes', 'route-crawl.args'), 'utf8')
    assert.match(routes, /--max-pages 12 --max-depth 1/)
    assert.ok(existsSync(path.join(dir, 'recon', 'RECON', 'design-dna.json')), 'dna-scaffold wrote its file')
    assert.deepEqual(
      steps.map((s) => s[0]),
      ['recon', 'recon-routes', 'recon-dna', 'recon-done']
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runRecon: no browser or no scripts is a note, not a failure', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-recon-'))
  try {
    const dir = path.join(root, 'Brand', 'acme.example')
    const noBrowser = await runRecon('https://acme.example/', dir, {
      scriptsDir: fakeScripts(path.join(root, 's')),
      browser: null
    })
    assert.equal(noBrowser.status, 'skipped:no-browser')
    const noScripts = await runRecon('https://acme.example/', dir, {
      scriptsDir: path.join(root, 'nope'),
      browser: '/x'
    })
    assert.equal(noScripts.status, 'skipped:no-scripts')
    assert.ok(!existsSync(path.join(dir, 'recon')), 'nothing written when skipped')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runRecon: a hung script is killed at the bound and reported as failed:timeout', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-recon-'))
  try {
    const dir = path.join(root, 'Brand', 'acme.example')
    const t0 = Date.now()
    const result = await runRecon('https://acme.example/', dir, {
      scriptsDir: fakeScripts(path.join(root, 's'), { hang: true }),
      browser: '/x',
      timeoutMs: 400
    })
    assert.equal(result.status, 'failed:timeout')
    assert.ok(Date.now() - t0 < 5000, 'did not wait for the hung script')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
