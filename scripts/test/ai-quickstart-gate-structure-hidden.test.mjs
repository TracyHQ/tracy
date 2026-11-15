// The hidden variant and the link probes decide only on what they saw (ticket #586, review round 2): a variant that
// hid no page measured nothing; a hidden page is seen answering as missing (404 or 410) before the links to it are
// judged, and one that still answers leaves the variant incomplete naming it; a variant whose links reached the probe
// limit of the link check did not read every link and is incomplete. The invented florist kit on a memory site.
import assert from 'node:assert/strict'
import test from 'node:test'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { structure } from '../ai-quickstart/gate/structure.mjs'
import { PROBE_MAX } from '../ai-quickstart/rendered-scan/links.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf, ORIGIN } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const measure = (wrapSite = (s) => s) => {
  const kit = floristKit()
  const site = wrapSite(memorySiteOf(kit, {}))
  const build = (options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  return structure({ build, site, kit, base: ORIGIN + '/' })
}

test('R4: the clean hidden variant keeps each hidden page seen answering as missing', async () => {
  const result = await measure()
  assert.equal(result.hidden.status, 'passed')
  assert.ok(result.hidden.hidden >= 1)
  assert.equal(result.hidden.seenMissing.length, result.hidden.hidden)
  for (const s of result.hidden.seenMissing) assert.ok([404, 410].includes(s.status), JSON.stringify(s))
})

test('R4: a variant that hides no page is incomplete, never passed', async () => {
  const result = await measure((site) => ({
    ...site,
    pages: async (built, record) => (await site.pages(built, record)).map((p) => ({ ...p, record: null }))
  }))
  assert.equal(result.hidden.status, 'incomplete')
  assert.equal(result.hidden.reason, 'nothing_hidden')
  assert.notEqual(result.status, 'passed')
})

test('R4: a hidden page that still answers leaves the variant incomplete, naming the page', async () => {
  // The hide door answers but the site keeps serving the page.
  const result = await measure((site) => ({ ...site, hide: async () => {} }))
  assert.equal(result.hidden.status, 'incomplete')
  assert.equal(result.hidden.reason, 'hidden_page_still_answers')
  assert.ok(result.hidden.stillShown.length >= 1)
  assert.ok(result.hidden.stillShown.every((p) => p.pageType && p.status === 200))
  assert.notEqual(result.status, 'passed')
})

test('T8: a variant whose links reach the probe limit of the link check is incomplete', async () => {
  const many = Array.from({ length: PROBE_MAX + 5 }, (_, i) => '<a href="/far-' + i + '.pdf">x</a>').join('')
  const result = await measure((site) => ({
    ...site,
    fetch: async (url) => {
      const answer = await site.fetch(url)
      if (/\/far-\d+\.pdf$/.test(url)) return { status: 200, html: '' }
      return { ...answer, html: String(answer.html).replace('</body>', many + '</body>') }
    }
  }))
  assert.equal(result.full.status, 'incomplete')
  assert.equal(result.full.reason, 'link_probe_cap')
  assert.equal(result.full.probes, PROBE_MAX)
  assert.notEqual(result.status, 'passed')
})
