import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pollJob, wizardOpened } from '../src/client/create.ts'
import { applyPick, readSupport } from '../src/client/design-system-pick.mjs'
import { rewriteAbout } from '../src/client/rewrite.mjs'
import { fetchSiteQuestions } from '../src/client/site-brief.mjs'

test('native widget creation consumers use the authenticated bridge while ordinary workspaces keep their doors', async () => {
  const originalFetch = globalThis.fetch
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const calls = []
  globalThis.fetch = async (path, init) => {
    calls.push({ path, method: init?.method || 'GET' })
    return Response.json({ text: 'A bakery.', supported: true })
  }
  try {
    for (const [pathname, prefix] of [
      ['/widget/native/s/session-widget-test', '/widget/native/backend'],
      ['/new/s/session-test', '']
    ]) {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: { pathname } })
      calls.length = 0
      await pollJob('demo.test', 'job-1')
      wizardOpened('wizard-1', 'new')
      await rewriteAbout('A bakery')
      await fetchSiteQuestions({ platform: 'wordpress', lang: 'en' })
      await readSupport({ quickstart: 'base', platform: 'wordpress' })
      await applyPick('demo.test', 'design-1')
      assert.deepEqual(
        calls.map(({ path, method }) => [method, path.split('?')[0]]),
        [
          ['GET', prefix + '/api/sites/demo.test/jobs/job-1'],
          ['POST', prefix + '/api/sites/wizard'],
          ['POST', prefix + '/api/sites/brief/rewrite'],
          ['GET', prefix + '/api/sites/questions'],
          ['GET', prefix + '/api/design-system/support'],
          ['POST', prefix + '/api/sites/demo.test/design-system']
        ]
      )
    }
  } finally {
    globalThis.fetch = originalFetch
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
    else delete globalThis.location
  }
})
