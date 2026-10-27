/**
 * Usage of the first-run guides (`src/client/usage.ts`): what the Welcome popup and the two tour stages
 * tell `POST /api/onboarding/step`, against a fake `fetch`; and that every scene, step and way out the
 * client can name is on tracy-web's closed lists (`apps/tracy-web/src/onboarding/usage.js`), so a scene
 * or step added to the guides without its line there fails here instead of going uncounted.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ONBOARD_FLOWS } from '../../../../apps/tracy-web/src/onboarding/usage.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-usage-'))
  const outfile = path.join(outDir, 'usage.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export * from './usage.ts'
        export { SCENES } from './welcome-flow.ts'
        export { SITE_STEPS, START_STEPS } from './tour-targets.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => rmSync(outDir, { recursive: true, force: true }))

test('a step and an end go to the door as JSON, never awaited; a refusal or a throwing fetch is silent', async () => {
  const calls = []
  const fake = async (url, init) => {
    calls.push([url, init.method, JSON.parse(init.body), init.keepalive])
    return new Response('{}', { status: 400 })
  }
  const id = lib.newRunId()
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(lib.newRunId(), id)
  assert.equal(lib.onboardStep(id, 'welcome', '3', fake), undefined, 'not awaited')
  lib.onboardEnd(id, 'tour-site', 'publish', 'skip', fake)
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(calls, [
    ['/api/onboarding/step', 'POST', { runId: id, flow: 'welcome', step: '3' }, true],
    ['/api/onboarding/step', 'POST', { runId: id, flow: 'tour-site', step: 'publish', end: 'skip' }, true]
  ])
  const throwing = () => {
    throw new TypeError('fetch failed')
  }
  assert.doesNotThrow(() => lib.onboardStep(id, 'welcome', '1', throwing))
  assert.doesNotThrow(() =>
    lib.onboardEnd(id, 'welcome', '1', 'close', async () => Promise.reject(new Error('x')))
  )
})

test('every scene and tour step the guides can name is on the server’s list, and nothing more', () => {
  assert.deepEqual(
    ONBOARD_FLOWS.welcome.steps,
    lib.SCENES.map((_, n) => String(n + 1))
  )
  assert.deepEqual(ONBOARD_FLOWS['tour-start'].steps, lib.START_STEPS)
  assert.deepEqual(ONBOARD_FLOWS['tour-site'].steps, lib.SITE_STEPS)
  assert.deepEqual(ONBOARD_FLOWS.welcome.ends, lib.WELCOME_ENDS)
  for (const flow of ['tour-start', 'tour-site']) assert.deepEqual(ONBOARD_FLOWS[flow].ends, lib.TOUR_ENDS)
})
