// The site planner bench's kit source (ADR 0041, #301): which kits the server can read, the kit read part by part
// through the read_kit_part tool, the image tool that answers "not available yet" (#302), and the first user message.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  firstUserMessage,
  KIT_TOOL_NAMES,
  kitParts,
  kitTools,
  openKit,
  readableKits
} from '../src/site-planner/kit-source.js'
import { plannerPrompt } from '../src/site-planner/planner-prompt.js'
import { brief } from './_site-plan-check-inputs.mjs'

const REF = 'ja-boxing/j6/1.0.10'
const boxing = () => openKit(REF)
const read = (parts, id) => JSON.parse(parts.read(id))

test('the JA Boxing kit is listed among the kits the server can read, with its 110 images', () => {
  const kits = readableKits()
  const found = kits.find((k) => k.ref === REF)
  assert.ok(found, 'JA Boxing 1.0.10 is not listed')
  assert.deepEqual(
    {
      release: found.release,
      version: found.version,
      platform: found.platform,
      template: found.template,
      images: found.images,
      approved: found.approved
    },
    {
      release: 'quickstart/ja-boxing/j6',
      version: '1.0.10',
      platform: 'joomla',
      template: { name: 'ja_boxing', version: '1.1.0' },
      images: 110,
      approved: true
    }
  )
})

test('a contract with no kit, or a kit that cannot be read, is not listed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kit-source-'))
  try {
    const dir = (name) => {
      const d = path.join(root, name)
      mkdirSync(d)
      return d
    }
    const none = dir('none')
    const broken = dir('broken')
    writeFileSync(path.join(broken, 'template-kit.json'), '{ not json')
    const good = dir('good')
    writeFileSync(
      path.join(good, 'template-kit.json'),
      JSON.stringify({
        template: { name: 'demo', version: '1.0.0' },
        quickstart: { version: '2.0.0' },
        images: [{ id: 'page-home-1440', path: 'images/page-home-1440.jpg', sha256: 'a'.repeat(64) }]
      })
    )
    const index = new Map([
      ['quickstart/none/j6@1.0.0', { id: 'none/j6/1.0.0', dir: none, platform: 'joomla' }],
      ['quickstart/broken/j6@1.0.0', { id: 'broken/j6/1.0.0', dir: broken, platform: 'joomla' }],
      ['quickstart/good/wp7@2.0.0', { id: 'good/wp7/2.0.0', dir: good, platform: 'wordpress' }]
    ])
    const kits = readableKits({ index })
    assert.deepEqual(
      kits.map((k) => [k.ref, k.release, k.version, k.images, k.approved]),
      [['good/wp7/2.0.0', 'quickstart/good/wp7', '2.0.0', 1, false]]
    )
    assert.equal(openKit('none/j6/1.0.0', { index }), null)
    const good2 = openKit('good/wp7/2.0.0', { index })
    assert.deepEqual(
      [good2.ref, good2.release, good2.version],
      ['good/wp7/2.0.0', 'quickstart/good/wp7', '2.0.0']
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown kit ref opens nothing', () => {
  assert.equal(openKit('ja-boxing/j6/9.9.9'), null)
  assert.equal(openKit(''), null)
  assert.equal(openKit(undefined), null)
})

test('contents names every part id, and every one of them can be read', () => {
  const kit = boxing()
  const parts = kitParts(kit.doc)
  const contents = read(parts, 'contents')
  assert.equal(contents.kit, REF)
  assert.deepEqual(contents.template, { name: 'ja_boxing', version: '1.1.0' })
  assert.equal(contents.pageGroups.length, 12)
  assert.equal(contents.pages.length, 50)
  assert.equal(contents.blocks.length, 76)
  assert.equal(contents.images, 110)
  assert.deepEqual(contents.pages[0], { id: 'page-home', group: 'group-home', path: '/', inMainMenu: true })
  assert.deepEqual(contents.blocks[0], { id: 'header', role: 'header', shared: true })
  const ids = [
    ...contents.parts.map((p) => p.id),
    ...contents.pageGroups,
    ...contents.pages.map((p) => p.id),
    ...contents.blocks.map((b) => b.id)
  ]
  assert.equal(new Set(ids).size, ids.length, 'a part id is listed twice')
  for (const id of ids) assert.doesNotThrow(() => read(parts, id), id)
  for (const id of ids) assert.equal(read(parts, id).error, undefined, id)
})

test('a part is its kit entry as compact JSON, unchanged', () => {
  const kit = boxing()
  const parts = kitParts(kit.doc)
  const page = kit.doc.pages.find((p) => p.id === 'page-home')
  assert.equal(parts.read('page-home'), JSON.stringify(page))
  const block = kit.doc.blocks.find((b) => b.id === 'header')
  assert.equal(parts.read('header'), JSON.stringify(block))
  assert.equal(parts.read('pageGroups'), JSON.stringify(kit.doc.pageGroups))
  assert.equal(parts.read('group-home'), JSON.stringify(kit.doc.pageGroups[0]))
  assert.equal(parts.read('site.contactBlocks'), JSON.stringify(kit.doc.site.contactBlocks))
  assert.equal(parts.read('site.fixedTexts'), JSON.stringify(kit.doc.site.fixedTexts))
})

test('site keeps its small parts inline and names each large one by the id that reads it', () => {
  const kit = boxing()
  const site = read(kitParts(kit.doc), 'site')
  assert.deepEqual(site.contactBlocks, kit.doc.site.contactBlocks)
  assert.deepEqual(site.forms, kit.doc.site.forms)
  assert.deepEqual(site.fixedTexts, {
    part: 'site.fixedTexts',
    entries: 150,
    characters: JSON.stringify(kit.doc.site.fixedTexts).length
  })
  assert.equal(site.brandColours.part, 'site.brandColours')
  assert.ok(JSON.stringify(site).length < 40_000, 'site is not compact')
})

test('a part too large to read whole says how to read it instead', () => {
  const result = read(kitParts(boxing().doc), 'blocks')
  assert.equal(result.error, 'PART_TOO_LARGE')
  assert.match(result.detail, /block id/)
})

test('an unknown id answers an error that lists the valid id kinds', () => {
  const parts = kitParts(boxing().doc)
  const result = read(parts, 'page-nowhere')
  assert.equal(result.error, 'UNKNOWN_PART')
  assert.equal(result.id, 'page-nowhere')
  for (const kind of [
    'contents',
    'site',
    'site.<key>',
    'pageGroups',
    'pages',
    'page group id',
    'page id',
    'block id'
  ])
    assert.ok(
      result.validIds.some((v) => v.includes(kind)),
      `the error does not name ${kind}`
    )
})

test('read_kit_part reads by id, refuses a missing id, and open_kit_image without images says they are not available', async () => {
  const kit = boxing()
  const [readPart, openImage] = kitTools(kit.doc)
  assert.deepEqual(KIT_TOOL_NAMES, { readPart: 'read_kit_part', openImage: 'open_kit_image' })
  assert.equal(readPart.name, 'read_kit_part')
  assert.deepEqual(readPart.parameters.required, ['id'])
  assert.equal(await readPart.run({ id: 'page-home' }), kitParts(kit.doc).read('page-home'))
  assert.equal(JSON.parse(await readPart.run({})).error, 'INVALID_ARGUMENTS')
  assert.equal(JSON.parse(await readPart.run({ id: 7 })).error, 'INVALID_ARGUMENTS')

  assert.equal(openImage.name, 'open_kit_image')
  assert.deepEqual(openImage.parameters.required, ['id'])
  const known = JSON.parse(await openImage.run({ id: 'header-1440' }))
  assert.equal(known.error, 'IMAGES_NOT_AVAILABLE')
  assert.equal(known.id, 'header-1440')
  assert.equal(known.known, true)
  assert.match(known.detail, /not available/)
  assert.equal(JSON.parse(await openImage.run({ id: 'nothing-1440' })).known, false)
})

test('the first user message explains the two tools, then gives the brief; the prompt stays as approved', () => {
  const kit = boxing()
  const b = brief()
  const text = firstUserMessage({ kit, brief: b })
  assert.match(text, /read_kit_part/)
  assert.match(text, /open_kit_image/)
  assert.match(text, /"the image tool"[^.]*open_kit_image/)
  assert.match(text, /read_kit_part\("contents"\)/)
  assert.match(text, /part by part/)
  assert.ok(text.includes(REF), 'the message does not name the kit')
  const at = text.indexOf('{')
  assert.ok(at > text.indexOf('open_kit_image'), 'the brief comes before the tools are explained')
  assert.deepEqual(JSON.parse(text.slice(at)), b)

  const prompt = plannerPrompt()
  assert.ok(prompt.sha256.startsWith('1492da55'))
  assert.ok(!prompt.text.includes('read_kit_part') && !prompt.text.includes('open_kit_image'))
})
