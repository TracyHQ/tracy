// The emphasis stage of the write step (write-step/emphasis-stage.js, card N): a heading whose demo value is real HTML gets its
// emphasis as real tags, one in ACM data keeps the codes the template reads, and one the content map says nothing of keeps its codes
// with a warning. Kit, copy, site and words are invented (Quay Fitness Studio of the copy check fixtures).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEmphasisStage } from '../src/write-step/emphasis-stage.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { readBackGroup } from '../src/site-check/read-back.js'
import { copy as baseCopy, KIT, runStep } from './_write-step-run.mjs'

const HTML_SLOT = {
  key: 'module-2.1',
  entity: 'module-2',
  column: 'params',
  type: 'text',
  jsonPath: ['main-section'],
  xpath: '/html/body/div'
}
const ACM_SLOT = {
  key: 'module-3.1',
  entity: 'module-3',
  column: 'params',
  type: 'text',
  jsonPath: ['intro', 'intro[title]', 0],
  nestedJson: 'jatools-config'
}
const CONTENT_MAP = { slots: [HTML_SLOT, ACM_SLOT] }

/** A door over invented rows: `content.get` answers a row, `content.update` merges its fields. */
function rowsDoor(rows, refuse = null) {
  const calls = []
  return {
    calls,
    rows,
    door: {
      async apply(call) {
        calls.push(call)
        const name = `${call.params.kind}-${call.params.id}`
        if (call.action === 'content.get')
          return rows[name] ? { ok: true, item: { ...rows[name] } } : { ok: false, error: 'not_found' }
        if (call.action === 'content.update') {
          if (refuse) return refuse
          rows[name] = { ...rows[name], ...call.params.fields }
          return { ok: true }
        }
        return { ok: false, error: 'unexpected_action' }
      }
    }
  }
}

const params = (over) => JSON.stringify({ 'main-section': '', 'bg-color': 'normal', ...over })

test('a slot whose demo value is HTML gets real tags; the ACM slot keeps its codes', async () => {
  const sent = 'Lift with((br/))((span))purpose((/span))'
  const site = rowsDoor({ 'module-2': { id: 2, params: params({ 'main-section': `${sent} \r\n` }) } })
  const guard = lookGuard({ kit: KIT().doc, contentMap: CONTENT_MAP })
  const results = await runEmphasisStage({
    door: guard.door(site.door),
    siteKey: 'site-a',
    contentMap: CONTENT_MAP,
    written: ['module-2.1', 'module-3.1'],
    ordered: { 'module-2.1': sent, 'module-3.1': 'Calm((br/))((span))mornings((/span))' }
  })
  assert.equal(
    JSON.parse(site.rows['module-2'].params)['main-section'],
    'Lift with<br/><span>purpose</span> \r\n'
  )
  assert.equal(JSON.parse(site.rows['module-2'].params)['bg-color'], 'normal')
  assert.deepEqual(results.get('module-2.1').stored, 'Lift with<br/><span>purpose</span>')
  assert.deepEqual(results.get('module-2.1').readFrom.path, ['item', 'params', 'main-section'])
  assert.deepEqual(results.get('module-3.1'), { storage: 'codes' })
  assert.equal(
    site.calls.filter((c) => c.action === 'content.update').length,
    1,
    'the ACM row is not touched'
  )
  assert.deepEqual(guard.findings(), [], 'the look guard takes a change of emphasis form alone')
})

test('the visible words are escaped and only the emphasis tags are markup', async () => {
  const sent = 'Fish & chips((br/))((span))Tom & Jo((/span))'
  // The plugin saves the text node as HTML: `&` as a reference.
  const site = rowsDoor({
    'module-2': {
      id: 2,
      params: params({ 'main-section': 'Fish &amp; chips((br/))((span))Tom &amp; Jo((/span))' })
    }
  })
  const results = await runEmphasisStage({
    door: site.door,
    siteKey: 'site-a',
    contentMap: CONTENT_MAP,
    written: ['module-2.1'],
    ordered: { 'module-2.1': sent }
  })
  assert.equal(
    JSON.parse(site.rows['module-2'].params)['main-section'],
    'Fish &amp; chips<br/><span>Tom &amp; Jo</span>'
  )
  assert.equal(results.get('module-2.1').stored, 'Fish &amp; chips<br/><span>Tom &amp; Jo</span>')
})

test('a slot the content map says nothing of keeps its codes and warns; words not found once are not guessed', async () => {
  const site = rowsDoor({
    'module-2': { id: 2, params: params({ 'main-section': 'Something the owner wrote' }) }
  })
  const results = await runEmphasisStage({
    door: site.door,
    siteKey: 'site-a',
    contentMap: CONTENT_MAP,
    written: ['module-2.1', 'module-9.4'],
    ordered: {
      'module-2.1': 'Lift((br/))((span))more((/span))',
      'module-9.4': 'Our((br/))((span))team((/span))'
    }
  })
  assert.equal(results.get('module-9.4').storage, 'unknown')
  assert.match(results.get('module-9.4').warning, /left as written/)
  assert.match(results.get('module-2.1').warning, /0 times, not once/)
  assert.equal(results.get('module-2.1').stored, undefined)
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 0)
})

test('the look guard still refuses an update that changes words as well as the emphasis form', () => {
  const guard = lookGuard({ kit: KIT().doc, contentMap: CONTENT_MAP })
  const held = { id: 2, params: params({ 'main-section': 'Lift((br/))((span))more((/span))' }) }
  const door = guard.door({
    async apply(call) {
      return call.action === 'content.get' ? { ok: true, item: held } : { ok: true }
    }
  })
  return (async () => {
    await door.apply({ siteKey: 's', action: 'content.get', params: { kind: 'module', id: 2 } })
    await door.apply({
      siteKey: 's',
      action: 'content.update',
      params: {
        apply_id: 'x',
        kind: 'module',
        id: 2,
        fields: { params: params({ 'main-section': 'Lift<br/><span>less</span>' }) }
      }
    })
    assert.equal(guard.findings().length, 1)
  })()
})

test('through the write step: the line keeps the codes it sent, stores the tags, and read-back compares the tags', async () => {
  const kit = KIT()
  const slot = kit.doc.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.1')
  slot.inline = [{ tag: 'span', attrs: '', text: 'fittest', at: 'inside' }]
  const c = baseCopy()
  c.slots.find((s) => s.slot === 'block-2.1').emphasis = 'coach'
  const sent = 'Train with a ((span))coach((/span)) who knows you'
  const { report, line, site } = await runStep(
    { copy: c },
    { records: [{ kind: 'module', id: 2, params: params({ 'main-section': `${sent} ` }) }] },
    { kit, contentMap: CONTENT_MAP }
  )
  assert.equal(report.status, 'done')
  const l = line('block-2.1')
  assert.equal(l.ordered, sent)
  assert.equal(l.stored, 'Train with a <span>coach</span> who knows you')
  assert.equal(l.emphasis, 'html')
  assert.deepEqual(report.emphasis, [{ key: 'module-2.1', storage: 'html', converted: true }])
  assert.deepEqual(
    report.guard.findings.filter((f) => /module 2\b/.test(f.what)),
    [],
    'the update of the emphasis form is no look guard finding'
  )
  const stored = JSON.parse(site.records.get('module-2').params)['main-section']
  assert.equal(stored, 'Train with a <span>coach</span> who knows you ')
  const read = async (action, p) =>
    action === 'content.get' ? { ok: true, item: site.records.get(`${p.kind}-${p.id}`) } : { ok: true }
  const judged = await readBackGroup.run({
    report: { ...report, slots: [l], status: 'done' },
    read: async (a, p) => (a === 'content.contract' ? { contract: report.contract, slots: [] } : read(a, p))
  })
  assert.deepEqual(judged.lines, { 'block-2.1': 'match' })
})

// Card N, 2026-11-06: the same write removed rows of a list, so the array the content map indexes shrank and the fixed index of a
// heading points nowhere (or at another row). The stage finds the written words in the whole stored value instead.
const MENU_SLOT = (index) => ({
  key: `module-7.${index}`,
  entity: 'module-7',
  column: 'params',
  type: 'text',
  jsonPath: ['menuitem_config', 'title', index],
  xpath: '/html/body/div'
})
const MENU_MAP = { slots: [MENU_SLOT(14), MENU_SLOT(12)] }
const menuParams = (titles) =>
  JSON.stringify({ menuitem_config: { title: titles, link: ['a', 'b', 'c'] }, layout: 'grid' })

test('rows removed in the same write move the heading: the words are found in the whole stored value and converted', async () => {
  const services = 'Our ((span))services((/span)) in town'
  const coaches = "The club's ((span))coaches((/span))"
  const site = rowsDoor({
    'module-7': { id: 7, params: menuParams(['Welcome', services, coaches]) }
  })
  const guard = lookGuard({ kit: KIT().doc, contentMap: MENU_MAP })
  const results = await runEmphasisStage({
    door: guard.door(site.door),
    siteKey: 'site-a',
    contentMap: MENU_MAP,
    written: ['module-7.14', 'module-7.12'],
    ordered: { 'module-7.14': services, 'module-7.12': coaches }
  })
  const stored = JSON.parse(site.rows['module-7'].params)
  assert.deepEqual(stored.menuitem_config.title, [
    'Welcome',
    'Our <span>services</span> in town',
    "The club's <span>coaches</span>"
  ])
  assert.equal(stored.layout, 'grid')
  assert.equal(results.get('module-7.14').stored, 'Our <span>services</span> in town')
  assert.deepEqual(results.get('module-7.14').readFrom.path, [
    'item',
    'params',
    'menuitem_config',
    'title',
    1
  ])
  assert.deepEqual(results.get('module-7.12').readFrom.path, [
    'item',
    'params',
    'menuitem_config',
    'title',
    2
  ])
  assert.equal(results.get('module-7.14').blocking, undefined)
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 1)
  assert.deepEqual(guard.findings(), [])
})

test('words found twice or nowhere in the stored value keep their codes and block the write step with the reason', async () => {
  const twice = 'Our ((span))team((/span))'
  const site = rowsDoor({
    'module-7': { id: 7, params: menuParams(['Hello', twice, twice]) }
  })
  const results = await runEmphasisStage({
    door: site.door,
    siteKey: 'site-a',
    contentMap: MENU_MAP,
    written: ['module-7.14', 'module-7.12'],
    ordered: { 'module-7.14': twice, 'module-7.12': 'Gone ((span))words((/span))' }
  })
  assert.equal(results.get('module-7.14').blocking, true)
  assert.match(
    results.get('module-7.14').warning,
    /2 times, not once \(looked at every text of module-7 params\)/
  )
  assert.equal(results.get('module-7.12').blocking, true)
  assert.match(results.get('module-7.12').warning, /0 times, not once/)
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 0)
})
