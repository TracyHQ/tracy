// The structure measurement decides only on what it measured (ticket #586, review round 1): a planned page that does
// not answer as planned is an error whether or not a link leads to it; no page read is no measurement; each variant
// must show its blocks at the count of its shape, or name the build's reason; and the hidden pages decide too: a link
// on a page still shown that leads to a hidden page fails, pages that do not come back or a hide door that fails leave
// the measurement incomplete. The invented florist kit on a memory site.
import assert from 'node:assert/strict'
import test from 'node:test'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { structure } from '../ai-quickstart/gate/structure.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf, ORIGIN } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const measure = (faults = {}, { wrapSite = (s) => s, wrapBuild = (b) => b } = {}) => {
  const kit = floristKit()
  const site = wrapSite(memorySiteOf(kit, faults))
  const build = wrapBuild((options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  )
  return structure({ build, site, kit, base: ORIGIN + '/' })
}
test('the clean florist site passes all three variants', async () => {
  const result = await measure()
  assert.equal(result.full.status, 'passed')
  assert.equal(result.minimum.status, 'passed')
  assert.equal(result.hidden.status, 'passed')
  assert.equal(result.status, 'passed')
})

test('a planned page answering 404 or no answer is an error even when no link leads to it', async () => {
  for (const status of [404, 0]) {
    let target = null
    const result = await measure(
      {},
      {
        wrapSite: (site) => ({
          ...site,
          pages: async (built, record) => {
            const all = await site.pages(built, record)
            target = all.at(-1)
            return all
          },
          // The last page answers `status`, and no other page links to it.
          fetch: async (url) => {
            if (target && url === target.url) return { status, html: '' }
            const answer = await site.fetch(url)
            const link = target ? '<a href="' + target.path + '">' + target.pageType + '</a>' : null
            return link ? { ...answer, html: answer.html.replaceAll(link, '') } : answer
          }
        })
      }
    )
    assert.equal(result.full.status, 'failed', 'status ' + status)
    assert.deepEqual(result.full.broken, [], 'no link leads to it')
    assert.ok(result.full.errors.some((e) => e.status === status))
    assert.equal(result.status, 'failed')
  }
})

test('a variant with no page read is incomplete, never passed', async () => {
  const result = await measure({}, { wrapSite: (site) => ({ ...site, pages: async () => [] }) })
  assert.equal(result.full.status, 'incomplete')
  assert.equal(result.full.reason, 'no_pages')
  assert.notEqual(result.status, 'passed')
})

test('a block below its declared most items with no reason of the build leaves the full variant incomplete', async () => {
  const short = (build) => async (options) => {
    const built = await build(options)
    if (options.shape !== 'min')
      for (const page of built.order.pages)
        for (const b of page.blocks)
          if (b.counts?.shown > 1) {
            b.counts = { ...b.counts, shown: b.counts.shown - 1 }
            return built
          }
    return built
  }
  const result = await measure({}, { wrapBuild: short })
  assert.equal(result.full.status, 'incomplete')
  assert.equal(result.full.reason, 'items_not_at_shape')
  assert.equal(result.full.items.length, 1)
  assert.ok(result.full.items[0].block)
  assert.equal(result.status, 'incomplete')
})

test('a block below its most items for a reason the build gives is listed with that reason', async () => {
  const gapped = (build) => async (options) => {
    const built = await build(options)
    for (const page of built.order.pages)
      for (const b of page.blocks)
        if (b.counts?.shown > 1 && options.shape !== 'min') {
          b.counts = { ...b.counts, shown: b.counts.shown - 1 }
          built.gaps = [
            ...(built.gaps ?? []),
            { code: 'redo_failed', record: 'x', blocks: [(page.pageType ?? page.id) + '/' + b.block] }
          ]
          return built
        }
    return built
  }
  const result = await measure({}, { wrapBuild: gapped })
  assert.equal(result.full.status, 'passed')
  assert.ok(result.full.blocks.some((b) => b.reason === 'gap:redo_failed'))
})

test('a link on a shown page to a hidden page fails the hidden variant and the measurement', async () => {
  const result = await measure({ staleLinks: true })
  assert.equal(result.hidden.status, 'failed')
  const missing = result.hidden.broken.filter((f) => f.kind === 'missing_page')
  assert.ok(missing.length > 0)
  for (const f of missing)
    assert.ok(f.hidden.includes(f.target), f.target + ' was hidden when its link broke')
  assert.equal(result.status, 'failed')
})

test('pages that do not come back, a hide door that fails, or no hide door leave the measurement incomplete', async () => {
  const noShow = await measure({}, { wrapSite: (site) => ({ ...site, show: async () => {} }) })
  assert.equal(noShow.hidden.status, 'incomplete')
  assert.equal(noShow.hidden.reason, 'pages_not_back')
  assert.equal(noShow.status, 'incomplete')
  const throws = await measure(
    {},
    {
      wrapSite: (site) => ({
        ...site,
        hide: async () => {
          throw Object.assign(new Error('hide refused'), { code: 'DOOR_REFUSED' })
        }
      })
    }
  )
  assert.equal(throws.hidden.status, 'incomplete')
  assert.equal(throws.hidden.reason, 'hide_door_failed')
  const none = await measure({}, { wrapSite: (site) => ({ ...site, hide: undefined }) })
  assert.equal(none.hidden.status, 'incomplete')
  assert.equal(none.status, 'incomplete')
})
