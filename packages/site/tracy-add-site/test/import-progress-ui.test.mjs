/**
 * What the wizard shows for a webroot that travels slowly (#1567) and for a run a dsh restart cut
 * (#1565): the bytes, a total and a clock that moves; "interrupted", with Continue when nothing has
 * to be typed again.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { filesProgress } from '../src/client/import-progress.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reactRequire = createRequire(
  path.resolve(root, '../../../vendor/tracy/dsh-better-sidebar/package.json')
)
const scratch = mkdtempSync(path.join(tmpdir(), 'import-progress-ui-test-'))
let lib
before(async () => {
  const outfile = path.join(scratch, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export * from './import-problems'; export * from './import-problem-data'; export { failedRunDetail } from './import'; export {en} from './strings'; export {ImportProgress} from './import-wizard'`,
      resolveDir: path.join(root, 'src/client'),
      loader: 'tsx'
    },
    plugins: [
      {
        name: 'single-host-react',
        setup(build) {
          build.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
            path: reactRequire.resolve(args.path)
          }))
        }
      }
    ],
    nodePaths: [path.resolve(root, '../../../vendor/tracy/dsh-better-sidebar/node_modules')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => rmSync(scratch, { recursive: true, force: true }))

const t = (key, params = {}) =>
  (lib.en[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
const MB = 1024 * 1024

// ── #1567 ────────────────────────────────────────────────────────────────────────────────────────

test('#1567: megabytes sent of the total, a rough time left, and the part on its way with its clock', () => {
  const now = 1_000_000
  assert.deepEqual(
    filesProgress(
      { bytes: 212 * MB, parts: 27, totalBytes: 628 * MB, rate: 85 * 1024, partStartedAt: now - 95_000 },
      now
    ),
    {
      sent: { key: 'import_detail_sent_of', params: { sent: 212, total: 628 } },
      // 416 MB at 85 KB/s is 83.5 minutes.
      left: { key: 'import_detail_left', params: { minutes: 84 } },
      part: { key: 'import_detail_part', params: { part: 28, elapsed: '1:35' } }
    }
  )
  // No total from the site: what was sent, and no time left made up.
  assert.deepEqual(filesProgress({ bytes: 40 * MB, parts: 5, rate: 1000 }, undefined), {
    sent: { key: 'import_detail_sent', params: { sent: 40 } }
  })
  // A total below what was sent is the engine counting other files: not shown as "of".
  assert.deepEqual(
    filesProgress({ bytes: 40 * MB, totalBytes: 30 * MB }, undefined).sent.key,
    'import_detail_sent'
  )
  assert.deepEqual(filesProgress(undefined, 5), {})
})

test('#1567: the files row says the bytes and the part on its way while the read runs', () => {
  const now = Date.now()
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ImportProgress, {
      t,
      platform: 'joomla',
      run: {
        state: 'running',
        step: 'reading_files',
        now,
        detail: {
          files: 1267,
          bytes: 212 * MB,
          parts: 27,
          totalBytes: 628 * MB,
          rate: 85 * 1024,
          partStartedAt: now - 95_000
        }
      }
    })
  )
  assert.match(html, /1267 files packed/)
  assert.match(html, /212 of about 628 MB sent/)
  assert.match(html, /about 84 min left/)
  assert.match(html, /Sending part 28 \(1:35\)/)
})

test('#1567: a stopped read shows what it sent, not a clock that runs on', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ImportProgress, {
      t,
      platform: 'joomla',
      failed: true,
      run: {
        state: 'error',
        step: 'reading_files',
        now: 10,
        detail: { files: 9, bytes: 3 * MB, parts: 1, partStartedAt: 1 }
      }
    })
  )
  assert.match(html, /3 MB sent/)
  assert.doesNotMatch(html, /Sending part/)
})

// ── #1565 ────────────────────────────────────────────────────────────────────────────────────────

test('#1565: an interrupted run offers Continue, or the details again when the host holds no code', () => {
  const run = (resumable) => ({
    id: 'r1',
    siteKey: 'customer.test',
    platform: 'joomla',
    state: 'error',
    step: 'reading_files',
    detail: {},
    error: 'interrupted',
    resumable
  })
  assert.equal(lib.importProblemCase('interrupted', lib.failedRunDetail(run(true))), 'p53')
  assert.equal(lib.importProblemCase('interrupted', lib.failedRunDetail(run(false))), 'p53.again')
  assert.deepEqual(lib.IMPORT_PROBLEMS.p53.actions, ['import_problem_p53_action_0'])
  assert.equal(t('import_problem_p53_action_0'), 'Continue')
  for (const key of ['import_problem_p53_what', 'import_problem_p53_why', 'import_problem_p53_again_why'])
    assert.equal(typeof lib.en[key], 'string', key)
  assert.match(t('import_problem_p53_why'), /without your password/)
})
