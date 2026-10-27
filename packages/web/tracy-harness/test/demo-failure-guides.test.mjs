/**
 * The failed-install guide table (`src/cms/demo-failure-guides.ts`): the EmDash mail failure (#827)
 * has its own guide, read off the reason `failureReason` gives; any other reason keeps the
 * placeholder. Plain English, no dashes (Akemi's copy rule).
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const rootRequire = createRequire(path.join(pkgRoot, '..', '..', '..', 'package.json'))

let mod

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { failedInstallGuide, RETRY_STEPS } from './cms/demo-failure-guides'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent'
  })
  mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

const MAIL = [
  'configure-mail: the site has no sender address and no owner email was passed — none is invented',
  'configure-mail: the sender is not a plain email address',
  "could not configure this site's mail — refusing to mark this site ready"
]

test('a mail failure has its own short fact line, then retry and report', () => {
  for (const reason of MAIL) {
    const g = mod.failedInstallGuide(reason, 'provision')
    assert.equal(g.whatToDo, 'Fixed on 11/10/2026, so a retry should pass.', reason)
    // The labels the Demo Site row really draws: Retry install arms, a second press confirms.
    assert.deepEqual(g.howTo, [
      'Press Retry install twice.',
      'Still failing? Send the reason to the dev team.'
    ])
    assert.doesNotMatch([g.whatToDo, ...g.howTo].join(' '), /[—–]/, 'no dashes in the copy')
  }
})

test('any other reason gets no fact line, only the retry and the report, said once', () => {
  const g = mod.failedInstallGuide('quickstart checksum mismatch', 'provision')
  assert.equal(g.whatToDo, null)
  assert.deepEqual(g.howTo, mod.RETRY_STEPS)
  assert.equal(g.howTo.filter((x) => /dev team/.test(x)).length, 1)
})
