// Template quality reads the pages the marker test rendered, at the addresses the host really reads (ticket #586,
// review round 2). Through the host's own request rule (`demoQaBody` of `apps/tracy-host/src/demo-qa.js`, which the
// gate's local reader runs before its browser) and the site check's own calls (`runSiteCheck`, seven pages asked and
// eight planned per call), on the gate's own session reader (`siteSession({hostOf}).quality`): no address is put under
// `/index.php` twice, and every page a group fails on finds the page key the marker test read at that address. The
// system pages the template titles itself are compared with the untouched template (`systemPathsOf`), and a write that
// stopped leaves quality incomplete. Only the browser is replaced: it answers what each page shows.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { demoQaBody } from '../../apps/tracy-host/src/demo-qa.js'
import { underIndex } from '../../apps/tracy-web/src/site-check/host-measure.js'
import { joomlaQualityPath } from '../ai-quickstart/gate/adapters/joomla-quality-path.mjs'
import { pageKeysOf } from '../ai-quickstart/gate/quality.mjs'
import { qualityPathsOf, qualityPhase, systemPathsOf } from '../ai-quickstart/gate/release-gate-quality.mjs'
import { renderAt } from '../ai-quickstart/gate/render.mjs'
import { siteSession } from '../ai-quickstart/gate/site-session.mjs'

const ORIGIN = 'http://petal.example.test'
// Joomla-shaped addresses as the write gives them: menu items, created articles, a contact, the home page.
const PATHS = [
  '/',
  ...Array.from({ length: 9 }, (_, i) => '/index.php?Itemid=' + (240 + i)),
  ...Array.from(
    { length: 6 },
    (_, i) => '/index.php?option=com_content&view=article&id=' + (i + 1) + '&catid=8&Itemid=241'
  ),
  '/index.php?option=com_contact&view=contact&id=1&Itemid=249'
]
const SYSTEM = ['/index.php?option=com_users&view=login', '/index.php?option=com_search&view=search']
const keyOf = (html) => /data-key="([^"]+)"/.exec(html)?.[1] ?? null

/** A host reader with the host's own request rule and a browser that reads two main headings on every page. */
function hostOf(read) {
  return async (_base, platform) => ({
    host: async ({ timeoutMs: _t, ...payload }) => {
      const asked = demoQaBody({ label: 'demo', platform, host: 'petal.example.test', ...payload })
      if (asked.error) throw new Error('refused: ' + asked.error)
      const pages = [...asked.pages, ...asked.plan]
      read.push(...pages)
      return {
        checks: [],
        visited: pages,
        pageMeasures: pages.map((p) => ({ path: p, width: 1440, mainHeadings: ['One', 'Two'] }))
      }
    },
    close: async () => {}
  })
}

function sessionWith(read) {
  const out = mkdtempSync(path.join(tmpdir(), 'quality-addresses-'))
  const s = siteSession({
    base: ORIGIN + '/',
    token: 'example',
    out,
    pin: null,
    kit: {},
    platform: 'joomla',
    hostOf: hostOf(read)
  })
  return { s, done: () => rmSync(out, { recursive: true, force: true }) }
}

const renders = [...PATHS, ...SYSTEM].map((p, i) => ({
  ...renderAt({ pageType: SYSTEM.includes(p) ? 'system-' + i : 'page-' + i, path: p }, 'light', 1440),
  status: 200,
  html: '<html><body data-key="key-' + i + '"><title>T</title></body></html>'
}))

test('R2: the old addresses were read under index.php twice by the host rule', () => {
  assert.equal(underIndex('joomla', '/index.php?Itemid=245'), '/index.php/index.php?Itemid=245')
  assert.equal(underIndex('joomla', joomlaQualityPath('/index.php?Itemid=245')), '/index.php/?Itemid=245')
})

test('R2: through the site check and the host rule, no address is doubled and every failure finds its page key', async () => {
  const read = []
  const { s, done } = sessionWith(read)
  try {
    const asked = qualityPathsOf(
      PATHS.map((p) => ({ path: p })),
      joomlaQualityPath
    )
    assert.ok(asked.length > 15, 'more than one call of the site check')
    const measured = await s.quality(asked)
    assert.ok(read.length >= asked.length, 'every page was read: ' + read.length)
    for (const p of read) assert.doesNotMatch(p, /index\.php.*index\.php/, p)
    for (const p of read)
      assert.ok(underIndex('joomla', p) === p || p === '/', 'the deployed host leaves it too: ' + p)
    const keys = pageKeysOf(renders, keyOf, joomlaQualityPath)
    const failures = measured.groups.find((g) => g.name === 'main-heading').failures
    assert.ok(failures.length >= PATHS.length, 'a failure on every page')
    for (const f of failures) {
      const at = '/' + String(f.page).replace(/^\/+/, '')
      assert.ok(keys[at]?.startsWith('key-'), f.page + ' finds its page key')
    }
  } finally {
    done()
  }
})

test('R3: the system pages of real renders are compared with the untouched template', () => {
  assert.deepEqual(systemPathsOf(renders), SYSTEM)
})

test('T3: a marker write that stopped leaves quality incomplete, naming the stop', async () => {
  const marker = { renders }
  const input = {
    quality: async (pages) => ({ pages, groups: [] }),
    pageKey: keyOf,
    qualityPath: joomlaQualityPath
  }
  const site = { origin: ORIGIN, fetch: async () => ({ status: 200, html: '' }) }
  const state = {
    pages: PATHS.map((p) => ({ path: p })),
    real: { report: { status: 'stopped', code: 'door_not_available' } }
  }
  const result = await qualityPhase({ input, marker, state, site, control: null })
  assert.equal(result.status, 'incomplete')
  assert.equal(result.reason, 'write_stopped')
  assert.equal(result.write.code, 'door_not_available')
})
