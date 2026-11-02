// Template kit pack: one representative page per group, one shot per block per width, the self-check that every
// block a page lists has its shot, and a zip that is the same bytes on every run. A made-up studio kit.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { inflateRawSync } from 'node:zlib'

import { applyLayouts } from '../template-kit/lib/layouts.mjs'
import { approvePack, packKitFolder, packPlan, representativeOf } from '../template-kit/lib/pack.mjs'

const W = (id) => ({ 1440: `${id}-1440`, 390: `${id}-390` })
const page = (id, path, blocks, inMainMenu = false) => ({
  id,
  path,
  inMainMenu,
  blocks: { 1440: blocks, 390: blocks },
  images: W(id)
})

function kitOf() {
  const pages = [
    page('page-home', '/', ['header', 'block-1', 'block-2', 'footer'], true),
    page('page-lessons', '/lessons', ['header', 'body-lessons', 'footer'], true),
    page('page-lessons_jump-rope', '/lessons/jump-rope', ['header', 'body-jump', 'footer']),
    page('page-lessons_boxing', '/lessons/boxing', ['header', 'body-boxing', 'block-9', 'footer'])
  ]
  const blocks = [
    'header',
    'block-1',
    'block-2',
    'footer',
    'body-lessons',
    'body-jump',
    'body-boxing',
    'block-9'
  ].map((id) => ({ id, images: W(id), frames: [], lists: [], links: [] }))
  blocks[1].frames = [{ id: 'block-1.0', canHide: true, hideEvidence: { images: W('block-1.0-hidden') } }]
  const ids = [
    ...pages.flatMap((p) => Object.values(p.images)),
    ...blocks.flatMap((b) => Object.values(b.images)),
    'block-1.0-hidden-1440',
    'block-1.0-hidden-390',
    'block-1.0-crop-1440',
    'block-2.items-min-1-1440'
  ]
  return {
    template: { name: 'studio_demo', version: '2.0.0' },
    quickstart: { version: '2.0.1' },
    widths: [1440, 390],
    pageGroups: [
      { id: 'group-home', root: 'page-home', children: [] },
      {
        id: 'group-lessons',
        root: 'page-lessons',
        children: ['page-lessons_jump-rope', 'page-lessons_boxing']
      }
    ],
    pages,
    blocks,
    images: ids.map((id) => ({ id, path: `images/${id}.jpg`, sha256: 'a'.repeat(64) })),
    errors: []
  }
}

test('the representative covers the most blocks; ties go to a main menu page, then the shortest path', () => {
  const kit = kitOf()
  const byId = new Map(kit.pages.map((p) => [p.id, p]))
  const r = representativeOf(kit.pageGroups[1], byId)
  assert.equal(r.page, 'page-lessons_boxing')
  assert.match(r.why, /covers 4 of the group's 6 blocks/)
  byId.get('page-lessons_boxing').blocks = { 1440: ['header', 'body-boxing', 'footer'] }
  assert.equal(representativeOf(kit.pageGroups[1], byId).page, 'page-lessons', 'a main menu page wins a tie')
  byId.get('page-lessons').inMainMenu = false
  assert.equal(representativeOf(kit.pageGroups[1], byId).page, 'page-lessons', 'then the shortest path')
})

test('one shot per block, blocks of left-out pages kept, emptied shots, crops and evidence left out', () => {
  const kit = kitOf()
  const plan = packPlan(kit)
  const ids = [...plan.imageIds]
  assert.ok(ids.includes('page-home-1440') && ids.includes('page-lessons_boxing-390'))
  assert.ok(
    !ids.includes('page-lessons_jump-rope-1440'),
    'a page that does not stand for its group has no full shot'
  )
  assert.ok(ids.includes('body-jump-1440'), 'its block still has its shot')
  assert.equal(ids.filter((i) => i.startsWith('header-')).length, 2, 'a shared block is one shot per width')
  assert.ok(!ids.includes('block-1.0-hidden-390'), 'emptied shots stay in the full set')
  assert.ok(!ids.includes('block-1.0-crop-1440') && !ids.includes('block-2.items-min-1-1440'))
  assert.deepEqual(plan.missing, [])
  kit.blocks.find((b) => b.id === 'block-9').images = { 1440: 'block-9-1440' }
  assert.deepEqual(packPlan(kit).missing, [{ block: 'block-9', width: 390 }])
  Object.assign(
    kit.blocks.find((b) => b.id === 'block-9'),
    { notShownAt: ['390'], notShownBecause: 'desktop only' }
  )
  const p = packPlan(kit)
  assert.equal(p.missing.length, 0)
  assert.equal(p.excused.length, 1)
})

test('the pack folder and zip hold only the packed images, and the zip is the same bytes every run', () => {
  const out = mkdtempSync(join(tmpdir(), 'kit-pack-'))
  try {
    const kit = kitOf()
    mkdirSync(join(out, 'images'))
    for (const i of kit.images) writeFileSync(join(out, i.path), `picture ${i.id}`)
    writeFileSync(join(out, 'template-kit.json'), JSON.stringify(kit))
    const a = packKitFolder(out)
    assert.equal(a.file, 'template-kit-studio-demo-2.0.1.zip')
    assert.equal(a.images, 20)
    assert.deepEqual(a.blocksWithoutImage, [])
    assert.equal(readdirSync(join(out, 'pack/images')).length, 20)
    const packed = JSON.parse(readFileSync(join(out, 'pack/template-kit.json'), 'utf8'))
    assert.equal(packed.images.length, 20)
    assert.equal(packed.pageGroups[1].representative, 'page-lessons_boxing')
    assert.equal(packed.pages.find((p) => p.id === 'page-lessons').fullShotOf, 'page-lessons_boxing')
    const full = JSON.parse(readFileSync(join(out, 'template-kit.json'), 'utf8'))
    assert.equal(full.pack.sha256, a.sha256)
    assert.equal(full.images.length, kit.images.length, 'the full kit keeps every image')
    const zip = readFileSync(join(out, a.file))
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50)
    assert.equal(zip.readUInt16LE(zip.length - 12), 21)
    // The first entry is the pack's template-kit.json, deflated.
    const nameLen = zip.readUInt16LE(26)
    const body = zip.subarray(30 + nameLen, 30 + nameLen + zip.readUInt32LE(18))
    assert.equal(JSON.parse(inflateRawSync(body).toString()).images.length, 20)
    assert.equal(packKitFolder(out).sha256, a.sha256, 'same files, same zip')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('the pack is what /ops reads: every page points at a packed shot, approval seals the pack and survives a re-pack', async () => {
  const { templateKitStep } = await import('../../../../apps/tracy-web/src/lib/template-kit/road-step.js')
  const out = mkdtempSync(join(tmpdir(), 'kit-pack-'))
  try {
    const kit = kitOf()
    mkdirSync(join(out, 'images'))
    for (const i of kit.images) writeFileSync(join(out, i.path), `picture ${i.id}`)
    for (const i of kit.images) i.sha256 = createHash('sha256').update(`picture ${i.id}`).digest('hex')
    writeFileSync(join(out, 'template-kit.json'), JSON.stringify(kit))
    const first = packKitFolder(out)
    const packFile = join(out, 'pack/template-kit.json')
    const packed = JSON.parse(readFileSync(packFile, 'utf8'))
    const inPack = new Set(packed.images.map((i) => i.id))
    const jump = packed.pages.find((p) => p.id === 'page-lessons_jump-rope')
    assert.equal(jump.fullShotOf, 'page-lessons_boxing')
    for (const p of packed.pages) for (const id of Object.values(p.images)) assert.ok(inPack.has(id), id)
    const judge = (doc) =>
      templateKitStep(
        (step, state, code) => ({ state, code }),
        () => undefined,
        {
          release: { platform: 'joomla', setting: { version: '2.0.1' } },
          version: '2.0.1',
          kit: { state: 'read', doc }
        }
      )
    assert.equal(judge(packed).code, 'kit-not-approved')
    const { pack } = approvePack(out, 'a-reviewer', '2031-01-01T00:00:00.000Z')
    assert.notEqual(pack.sha256, first.sha256, 'the approval is in the zip')
    const approved = JSON.parse(readFileSync(packFile, 'utf8'))
    assert.deepEqual(judge(approved), { state: 'done', code: 'kit-approved' })
    assert.equal(packKitFolder(out).approved, true, 'the same image set keeps its approval')
    writeFileSync(join(out, 'images/body-jump-1440.jpg'), 'another picture')
    const changed = JSON.parse(readFileSync(join(out, 'template-kit.json'), 'utf8'))
    changed.images.find((i) => i.id === 'body-jump-1440').sha256 = 'b'.repeat(64)
    writeFileSync(join(out, 'template-kit.json'), JSON.stringify(changed))
    assert.equal(packKitFolder(out).approved, false, 'a changed picture drops the approval')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('pages of one layout: one body shot and one canHide measurement stand for all of them', () => {
  const body = (id, frames) => ({ id, images: W(id), frames, lists: [], links: [] })
  const kit = {
    pages: [
      { ...page('page-news', '/news', ['header', 'body-news'], true), kind: 'category listing' },
      { ...page('page-news_a', '/news/a', ['header', 'body-news_a', 'block-7']), kind: 'article' },
      { ...page('page-news_bb', '/news/bb', ['header', 'body-news_bb']), kind: 'article' }
    ],
    pageGroups: [{ id: 'group-news', root: 'page-news', children: ['page-news_a', 'page-news_bb'] }],
    blocks: [
      body('header', []),
      body('body-news', []),
      body('body-news_a', [
        { id: 'article-1.5', role: 'article.image', canHide: true },
        { id: 'article-1.9', role: 'article.image', canHide: false }
      ]),
      body('body-news_bb', [
        { id: 'article-2.5', role: 'article.image', canHide: null },
        { id: 'article-2.9', role: 'article.image', canHide: null },
        { id: 'article-2.12', role: 'person.image', canHide: null }
      ]),
      body('block-7', [])
    ],
    errors: [
      { kind: 'missing', field: 'blocks[body-news_bb].frames[article-2.5].canHide', reason: 'x' },
      { kind: 'missing', field: 'blocks[body-news_bb].frames[article-2.12].canHide', reason: 'x' }
    ]
  }
  const { layouts } = applyLayouts(kit)
  assert.equal(layouts.get('body-news_bb').exemplar, 'body-news_a', 'the article that covers the most blocks')
  assert.equal(layouts.get('body-news').exemplar, 'body-news', 'a listing is a layout of its own')
  const bb = kit.blocks.find((b) => b.id === 'body-news_bb')
  assert.equal(bb.shotOf, 'body-news_a')
  assert.deepEqual(
    bb.frames.map((f) => [f.id, f.canHide, f.canHideFrom ?? null]),
    [
      ['article-2.5', true, 'article-1.5'],
      ['article-2.9', false, 'article-1.9'],
      ['article-2.12', null, null]
    ],
    'a frame with no counterpart is measured on its own page'
  )
  assert.deepEqual(
    kit.errors.map((e) => e.field),
    ['blocks[body-news_bb].frames[article-2.12].canHide']
  )
  kit.widths = [1440, 390]
  kit.images = [...kit.pages, ...kit.blocks].flatMap((x) =>
    Object.values(x.images).map((id) => ({ id, path: `images/${id}.jpg`, sha256: 'a'.repeat(64) }))
  )
  const plan = packPlan(kit)
  assert.ok(!plan.imageIds.has('body-news_bb-1440'), 'the stand-in body shot is packed once')
  assert.deepEqual(plan.missing, [], 'a body block resolves through shotOf')
})
