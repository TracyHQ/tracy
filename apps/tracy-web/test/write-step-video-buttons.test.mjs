// The write step's empty video button rule (ADR 0044, decision 29). Every fixture is invented: an invented template whose cards
// print a play button with an empty player address.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  emptyVideoButtonsOf,
  hideRuleFor,
  isEmptyVideoAddress,
  VIDEO_END,
  VIDEO_START,
  videoBlockFor,
  withVideoBlock
} from '../src/lib/empty-video-buttons.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { hideEmptyVideoButtons, VIDEO_BUTTONS_SLOT } from '../src/write-step/video-buttons-stage.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { brandKit, runBrand } from './_write-step-brand.mjs'

const SELECTOR = '.play-chip[data-src$="/embed/"]'
const HEAD =
  '<!-- tracy-brand-head:start -->\n<link rel="icon" type="image/png" sizes="32x32" href="/images/x.png">\n<!-- tracy-brand-head:end -->'

const kitOf = (emptyVideoButtons) => ({
  site: {
    head: { injection: { maxBytes: 4000, position: { name: 'foot-1', block: 'block-42' } } },
    ...(emptyVideoButtons ? { emptyVideoButtons } : {})
  }
})

function door(content = HEAD, { refuse = null } = {}) {
  const calls = []
  let held = content
  return {
    calls,
    held: () => held,
    apply: async ({ action, params }) => {
      calls.push({ action, params })
      if (action === 'content.get') return { ok: true, item: { id: params.id, content: held } }
      if (refuse) return { ok: false, error: 'locked', message: refuse }
      held = params.fields.content
      return { ok: true }
    }
  }
}

test('a kit that names its play buttons gets one hide rule in its head block, beside the brand block, read back there', async () => {
  const site = door()
  const lines = await hideEmptyVideoButtons({
    door: site,
    siteKey: 's',
    kit: kitOf([{ selector: SELECTOR, why: 'the card prints the button whatever the video field holds' }])
  })
  const writes = site.calls.filter((c) => c.action === 'content.update')
  assert.equal(writes.length, 1)
  const { params } = writes[0]
  assert.deepEqual([params.kind, params.id], ['module', 42])
  assert.ok(params.apply_id)
  const block = `${VIDEO_START}<style>${SELECTOR}{display:none!important}</style>${VIDEO_END}`
  assert.equal(params.fields.content, `${HEAD}\n${block}`)
  assert.equal(lines.length, 1)
  assert.deepEqual([lines[0].slot, lines[0].status, lines[0].ordered], [VIDEO_BUTTONS_SLOT, 'written', block])
  assert.deepEqual(lines[0].readFrom, {
    action: 'content.get',
    params: { kind: 'module', id: 42 },
    path: ['item', 'content'],
    type: 'contains'
  })
})

test('a kit that names no play buttons writes nothing and reports nothing', async () => {
  for (const kit of [kitOf(null), kitOf([])]) {
    const site = door()
    const lines = await hideEmptyVideoButtons({ door: site, siteKey: 's', kit })
    assert.deepEqual(lines, [])
    assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 0)
  }
  // A kit without the field is not asked about: the site is not even read.
  const site = door()
  await hideEmptyVideoButtons({ door: site, siteKey: 's', kit: kitOf(null) })
  assert.equal(site.calls.length, 0)
})

test('a rerun on the same kit sends nothing, and its line still reads as written', async () => {
  const kit = kitOf([{ selector: SELECTOR }])
  const site = door(`${HEAD}\n${videoBlockFor([SELECTOR])}`)
  const lines = await hideEmptyVideoButtons({ door: site, siteKey: 's', kit })
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 0)
  assert.equal(lines[0].status, 'written')
})

test('a block an earlier run left goes when the kit lists no play buttons any more, the brand block kept', async () => {
  const site = door(`${HEAD}\n${videoBlockFor([SELECTOR])}`)
  const lines = await hideEmptyVideoButtons({ door: site, siteKey: 's', kit: kitOf([]) })
  assert.deepEqual(lines, [])
  assert.equal(site.held(), HEAD)
})

test('a selector that does not test the video address, or could close the rule, is left out', () => {
  const { selectors, problems } = emptyVideoButtonsOf(
    kitOf([
      { selector: '.play-chip' },
      { selector: '.play-chip[data-src$="/embed/"]}body{display:none' },
      { selector: '.play-chip[data-src$="/embed/"]</style><script>' },
      { selector: SELECTOR }
    ])
  )
  assert.deepEqual(selectors, [SELECTOR])
  assert.equal(problems.length, 3)
  assert.equal(hideRuleFor(selectors), `${SELECTOR}{display:none!important}`)
})

test('a refusal or a kit without a head block is a failed line in the plugin’s words', async () => {
  const refused = await hideEmptyVideoButtons({
    door: door(HEAD, { refuse: 'in use' }),
    siteKey: 's',
    kit: kitOf([{ selector: SELECTOR }])
  })
  assert.deepEqual([refused[0].status, refused[0].reason], ['failed', 'locked: in use'])
  const kit = { site: { emptyVideoButtons: [{ selector: SELECTOR }] } }
  const none = await hideEmptyVideoButtons({ door: door(), siteKey: 's', kit })
  assert.equal(none[0].status, 'failed')
})

test('the look guard lets the write step put the kit rule in the head block, and nothing else', async () => {
  const kit = kitOf([{ selector: SELECTOR }])
  const guard = lookGuard({ kit })
  const site = guard.door(door())
  await hideEmptyVideoButtons({ door: site, siteKey: 's', kit })
  assert.deepEqual(guard.findings(), [])

  const other = lookGuard({ kit })
  const inner = other.door(door())
  await inner.apply({ siteKey: 's', action: 'content.get', params: { kind: 'module', id: 42 } })
  const rogue = `${VIDEO_START}<style>.site-header{display:none!important}</style>${VIDEO_END}`
  await inner.apply({
    siteKey: 's',
    action: 'content.update',
    params: { apply_id: 'x', kind: 'module', id: 42, fields: { content: withVideoBlock(HEAD, rogue) } }
  })
  assert.equal(other.findings().length, 1)
  assert.match(other.findings()[0].reason, /empty video/)
})

test('an empty player address is told from one that names a video', () => {
  for (const empty of [
    'https://www.youtube.com/embed/',
    'https://www.youtube.com/embed/?autoplay=1',
    '//www.youtube-nocookie.com/embed/',
    'https://www.youtube.com/watch?v=',
    'https://youtu.be/',
    'https://player.vimeo.com/video/'
  ])
    assert.equal(isEmptyVideoAddress(empty), true, empty)
  for (const full of [
    'https://www.youtube.com/embed/abc123XYZ_0',
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://player.vimeo.com/video/123456',
    '/images/clip.mp4',
    ''
  ])
    assert.equal(isEmptyVideoAddress(full), false, full)
})

test('through the entry point: the rule lands in the head block after the brand stage, with no guard finding, and reads back', async () => {
  const kit = brandKit()
  kit.doc.site.emptyVideoButtons = [
    { selector: SELECTOR, why: 'invented cards print the button whatever the video field holds' }
  ]
  const { report, site, line } = await runBrand({ deps: { kit } })
  assert.equal(report.status, 'done')
  const content = site.holds.module.get(88)
  assert.ok(content.includes('<!-- tracy-brand-head:start -->'), 'the brand block is kept')
  assert.ok(content.includes(videoBlockFor([SELECTOR])), 'the hide rule is in the head block')
  assert.deepEqual(report.guard.findings, [])
  assert.equal(line(VIDEO_BUTTONS_SLOT).status, 'written')
  const checked = await runSiteCheck({ door: site.readDoor, report })
  const readBack = checked.groups.find((g) => g.name === 'read-back')
  assert.equal(readBack.status, 'green')

  // The same run on a kit that names no play buttons sends no such rule.
  const plain = await runBrand()
  assert.equal(plain.line(VIDEO_BUTTONS_SLOT), undefined)
  assert.ok(!String(plain.site.holds.module.get(88)).includes(VIDEO_START))
})
