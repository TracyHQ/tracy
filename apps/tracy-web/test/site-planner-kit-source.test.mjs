// The site planner bench's kit source (ADR 0041, #301): which kits the server can read, the kit read part by part
// through the read_kit_part tool, the image tool that answers "not available yet" (#302), and the first user message.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  compactForPlanner,
  FIRST_MESSAGE_PARTS,
  firstUserMessage,
  lookTextOf,
  KIT_TOOL_NAMES,
  kitParts,
  kitTools,
  openKit,
  PLANNER_DROPPED_KIT_FIELDS,
  preloadedFirstMessage,
  preloadedKitBlock,
  READ_MANY_LIMIT,
  readableKits,
  WRITE_PLAN_INSTRUCTION
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
  // The kit carries a look for every packed 1440 shot; contents gives each as its text alone.
  const { look: homeLook, ...home } = contents.pages[0]
  assert.deepEqual(home, { id: 'page-home', group: 'group-home', path: '/', inMainMenu: true })
  assert.equal(typeof homeLook, 'string')
  const { look: headerLook, ...header } = contents.blocks[0]
  assert.deepEqual(header, { id: 'header', role: 'header', shared: true })
  assert.ok(headerLook === undefined || typeof headerLook === 'string')
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

test('a part is its kit entry as compact JSON, without the fields the planner never uses', () => {
  const kit = boxing()
  const parts = kitParts(kit.doc)
  const lean = compactForPlanner(kit.doc)
  assert.equal(parts.read('page-home'), JSON.stringify(lean.pages.find((p) => p.id === 'page-home')))
  assert.equal(parts.read('header'), JSON.stringify(lean.blocks.find((b) => b.id === 'header')))
  assert.equal(parts.read('pageGroups'), JSON.stringify(lean.pageGroups))
  assert.equal(parts.read('group-home'), JSON.stringify(lean.pageGroups[0]))
  assert.equal(parts.read('site.contactBlocks'), JSON.stringify(lean.site.contactBlocks))
  assert.equal(parts.read('site.fixedTexts'), JSON.stringify(lean.site.fixedTexts))
})

/** Every key anywhere in a value, with the key of the object that holds it. */
function keysOf(value, parent = '', out = []) {
  if (Array.isArray(value)) for (const v of value) keysOf(v, parent, out)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.push([parent, k])
      keysOf(v, k, out)
    }
  return out
}

test('the planner reads no measurement or evidence field, and keeps every field its prompt or the checker names', () => {
  const kit = boxing()
  const parts = kitParts(kit.doc)
  const prompt = plannerPrompt().text
  for (const { field } of PLANNER_DROPPED_KIT_FIELDS)
    assert.doesNotMatch(prompt, new RegExp(`\\b${field}\\b`), `the prompt names ${field}, so it must stay`)
  const read = [...kit.doc.blocks, ...kit.doc.pages].map((p) => JSON.parse(parts.read(p.id)))
  read.push(JSON.parse(parts.read('site.fixedTexts')))
  const seen = keysOf(read)
  for (const { field, in: holders } of PLANNER_DROPPED_KIT_FIELDS)
    assert.ok(
      !seen.some(([parent, k]) => k === field && (!holders || holders.includes(parent))),
      `${field} is still read`
    )
  const kept = new Set(seen.map(([, k]) => k))
  for (const field of [
    'canHide',
    'kind',
    'twinOf',
    'fixed',
    'maxCharacters',
    'labelId',
    'source',
    'reason',
    'network'
  ])
    assert.ok(kept.has(field), `${field} was dropped`)
  const link = kit.doc.blocks.flatMap((b) => b.links ?? []).find((l) => l.icon?.mechanism && l.icon.classes)
  const block = kit.doc.blocks.find((b) => b.links?.includes(link))
  const readIcon = JSON.parse(parts.read(block.id)).links.find((l) => l.id === link.id).icon
  assert.equal(
    readIcon.mechanism,
    link.icon.mechanism,
    'a link icon keeps its mechanism (the prompt reads iconMechanism)'
  )
  assert.equal(readIcon.classes, undefined)
  // The kit itself is untouched: the checker keeps reading every field.
  assert.ok(kit.doc.blocks.some((b) => b.frames?.some((f) => f.hideEvidence)))
})

test('the blocks the planner reads are at least a third smaller', () => {
  const kit = boxing()
  const parts = kitParts(kit.doc)
  const full = kit.doc.blocks.reduce((n, b) => n + JSON.stringify(b).length, 0)
  const lean = kit.doc.blocks.reduce((n, b) => n + parts.read(b.id).length, 0)
  assert.ok(lean < full * (2 / 3), `${lean} of ${full}`)
})

test('site keeps its small parts inline and names each large one by the id that reads it', () => {
  const kit = boxing()
  const site = read(kitParts(kit.doc), 'site')
  const lean = compactForPlanner(kit.doc).site
  assert.deepEqual(site.contactBlocks, lean.contactBlocks)
  assert.deepEqual(site.forms, lean.forms)
  assert.deepEqual(site.fixedTexts, {
    part: 'site.fixedTexts',
    entries: 150,
    characters: JSON.stringify(lean.fixedTexts).length
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

test('read_kit_part reads several ids in one call, and leaves the rest for another call past its size bound', async () => {
  const kit = boxing()
  const [readPart] = kitTools(kit.doc)
  const parts = kitParts(kit.doc)
  assert.equal(readPart.parameters.properties.ids.type, 'array')
  const two = JSON.parse(await readPart.run({ ids: ['page-home', 'header'] }))
  assert.deepEqual(Object.keys(two), ['page-home', 'header'])
  assert.deepEqual(two['page-home'], JSON.parse(parts.read('page-home')))
  assert.equal(
    JSON.parse(await readPart.run({ ids: ['page-home', 'page-nowhere'] }))['page-nowhere'].error,
    'UNKNOWN_PART'
  )
  const all = kit.doc.blocks.map((b) => b.id)
  const many = JSON.parse(await readPart.run({ ids: all }))
  assert.ok(Array.isArray(many.notRead) && many.notRead.length > 0, 'every block came back in one call')
  assert.ok(JSON.stringify(many).length < READ_MANY_LIMIT + 50_000)
  const got = Object.keys(many).filter((k) => k !== 'notRead' && k !== 'detail')
  assert.deepEqual([...got, ...many.notRead], all)
  assert.equal(JSON.parse(await readPart.run({ ids: [] })).error, 'INVALID_ARGUMENTS')
  assert.equal(JSON.parse(await readPart.run({ ids: ['x', 3] })).error, 'INVALID_ARGUMENTS')
})

test('read_kit_part reads by id, refuses a missing id, and open_kit_image without images says they are not available', async () => {
  const kit = boxing()
  const [readPart, openImage] = kitTools(kit.doc)
  assert.equal(readPart.name, 'read_kit_part')
  assert.equal(readPart.parameters.required, undefined)
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

test('the first user message explains the two tools, then gives the kit contents, then the brief; the prompt stays as approved', () => {
  const kit = boxing()
  const b = brief()
  const text = firstUserMessage({ kit, brief: b })
  assert.match(text, /read_kit_part/)
  assert.match(text, /open_kit_image/)
  assert.match(text, /"the image tool"[^.]*open_kit_image/)
  assert.match(text, /part by part/)
  assert.match(text, /sent once per conversation/)
  assert.doesNotMatch(text, /one id per call/)
  assert.match(text, /several/)
  assert.match(text, /same turn/)
  assert.ok(text.includes(REF), 'the message does not name the kit')
  // The kit before the brief: the tools, then "contents" as compact JSON, then the brief, which closes the message.
  const contents = JSON.stringify(kitParts(kit.doc).contents)
  const at = text.indexOf(contents)
  assert.ok(at > text.indexOf('open_kit_image'), 'the contents come before the tools are explained')
  assert.ok(text.endsWith(JSON.stringify(b)), 'the brief is not compact JSON at the end')
  assert.ok(at < text.lastIndexOf(JSON.stringify(b)), 'the brief comes before the kit contents')

  const prompt = plannerPrompt()
  assert.ok(prompt.sha256.startsWith('b48800fb'))
  assert.ok(!prompt.text.includes('read_kit_part') && !prompt.text.includes('open_kit_image'))
})

/** An invented two-block kit of an invented template, with a look on its page and on one block (none on the other). */
function harbourKit() {
  const look = (image, text) => ({ image, sha256: 'a'.repeat(64), text })
  return {
    contract: 'harbour-test/j6/0.0.1',
    template: { name: 'harbour_test', version: '0.0.1' },
    images: [
      { id: 'page-home-1440', path: 'images/page-home-1440.jpg', sha256: 'a'.repeat(64) },
      { id: 'hero-1440', path: 'images/hero-1440.jpg', sha256: 'a'.repeat(64) },
      { id: 'classes-1440', path: 'images/classes-1440.jpg', sha256: 'b'.repeat(64) }
    ],
    pageGroups: [{ id: 'group-home', pages: ['page-home'] }],
    pages: [
      {
        id: 'page-home',
        group: 'group-home',
        path: '/',
        inMainMenu: true,
        blocks: ['hero', 'classes'],
        images: { 1440: 'page-home-1440' },
        look: look(
          'page-home-1440',
          'A short light page: photo hero with heading and button, then three class cards.'
        )
      }
    ],
    blocks: [
      {
        id: 'hero',
        role: 'hero',
        shared: false,
        images: { 1440: 'hero-1440' },
        look: look('hero-1440', '  Full width photo hero, heading and one button on the left.  '),
        frames: [{ id: 'hero.image-1', kind: 'photo', hideEvidence: { before: 1, after: 1 } }]
      },
      { id: 'classes', role: 'features', shared: false, images: { 1440: 'classes-1440' } }
    ],
    site: {}
  }
}

test('the planner reads each look as its text, beside the page or block it describes, in contents and in its part', () => {
  const doc = harbourKit()
  const parts = kitParts(doc)
  const contents = read(parts, 'contents')
  assert.deepEqual(contents.pages, [
    {
      id: 'page-home',
      group: 'group-home',
      path: '/',
      inMainMenu: true,
      look: 'A short light page: photo hero with heading and button, then three class cards.'
    }
  ])
  assert.deepEqual(contents.blocks, [
    {
      id: 'hero',
      role: 'hero',
      shared: false,
      look: 'Full width photo hero, heading and one button on the left.'
    },
    { id: 'classes', role: 'features', shared: false }
  ])
  const hero = read(parts, 'hero')
  assert.equal(hero.look, 'Full width photo hero, heading and one button on the left.')
  assert.deepEqual(hero.images, { 1440: 'hero-1440' }, 'the image ids stay, so an image can still be opened')
  assert.equal(hero.frames[0].hideEvidence, undefined)
  assert.equal(read(parts, 'page-home').look, contents.pages[0].look)
  assert.ok(!('look' in read(parts, 'classes')), 'a block without a look reads none')
  // The shot id and sha256 of a look are for the Road to live, not for the planner.
  assert.ok(!parts.read('hero').includes('sha256') && !parts.read('page-home').includes('sha256'))
  // The kit itself keeps the whole look: the Road to live and the checker read the full kit.
  assert.equal(doc.blocks[0].look.image, 'hero-1440')
})

test('a look with no text is left out of the planner view', () => {
  assert.equal(lookTextOf(undefined), undefined)
  assert.equal(lookTextOf({ image: 'x-1440', sha256: 'a'.repeat(64), text: '   ' }), undefined)
  assert.equal(lookTextOf({ text: ' Two columns. ' }), 'Two columns.')
  assert.deepEqual(compactForPlanner({ id: 'b', look: { image: 'b-1440' } }), { id: 'b' })
})

test('the first user message says to plan from the looks when the kit has them, and opens images only by need', () => {
  const withLooks = firstUserMessage({
    kit: { ref: 'harbour-test/j6/0.0.1', doc: harbourKit() },
    brief: brief()
  })
  assert.match(
    withLooks,
    /also gives the look of every page and block that has one[^\n]*plan from these looks/
  )
  assert.match(withLooks, /Open an image only where your instructions say a look cannot settle a decision/)
  const bare = harbourKit()
  for (const item of [...bare.pages, ...bare.blocks]) delete item.look
  const without = firstUserMessage({ kit: { ref: 'harbour-test/j6/0.0.1', doc: bare }, brief: brief() })
  assert.doesNotMatch(without, /plan from these looks/)
  assert.match(without, /open_kit_image/)
})

test('a model given no images is offered only read_kit_part, and the first user message never tells it to open one', () => {
  const kit = { ref: 'harbour-test/j6/0.0.1', doc: harbourKit() }
  const tools = kitTools(kit.doc, { images: null, imageTool: false })
  assert.deepEqual(
    tools.map((t) => t.name),
    [KIT_TOOL_NAMES.readPart]
  )
  assert.deepEqual(
    kitTools(kit.doc).map((t) => t.name),
    [KIT_TOOL_NAMES.readPart, KIT_TOOL_NAMES.openImage]
  )
  const text = firstUserMessage({ kit, brief: brief(), imageTool: false })
  assert.doesNotMatch(text, /open_kit_image/)
  assert.doesNotMatch(text, /two tools/)
  assert.match(text, /Kit images are not available to you in this run, and there is no image tool/)
  assert.match(text, /plan from the looks instead/)
  assert.match(text, /plan from these looks/)
  assert.ok(text.endsWith(JSON.stringify(brief())), 'the brief still closes the message')
})

test('read_kit_part sends a part once per run: a later read answers the call it was sent in, and a resume replays the reads', async () => {
  const kit = boxing()
  const [readPart] = kitTools(kit.doc, { inFirstMessage: FIRST_MESSAGE_PARTS })
  const first = await readPart.run({ ids: ['site', 'header'] }, { call: 1 })
  assert.equal(first.repeated, false)
  assert.deepEqual(Object.keys(JSON.parse(first.text)), ['site', 'header'])
  // The same call read again (a resumed run runs the last call's tools once more): the parts in full.
  assert.equal((await readPart.run({ ids: ['site', 'header'] }, { call: 1 })).text, first.text)
  const again = await readPart.run({ id: 'header' }, { call: 4 })
  assert.equal(again.repeated, true)
  assert.deepEqual(JSON.parse(again.text).alreadySent, 'header')
  assert.match(JSON.parse(again.text).detail, /your call 1 of this conversation/)
  const contents = await readPart.run({ id: 'contents' }, { call: 2 })
  assert.equal(contents.repeated, true)
  assert.match(JSON.parse(contents.text).detail, /first message/)
  // A mix of a repeat and a new part is not a repeat; the new part comes in full.
  const mixed = await readPart.run({ ids: ['header', 'page-home'] }, { call: 5 })
  assert.equal(mixed.repeated, false)
  const parsed = JSON.parse(mixed.text)
  assert.equal(parsed.header.alreadySent, 'header')
  assert.deepEqual(parsed['page-home'], JSON.parse(kitParts(kit.doc).read('page-home')))
  // An unknown id is never recorded as sent.
  await readPart.run({ id: 'page-nowhere' }, { call: 6 })
  assert.equal(
    JSON.parse((await readPart.run({ id: 'page-nowhere' }, { call: 7 })).text).error,
    'UNKNOWN_PART'
  )

  // A resumed run builds the tool from the saved turns and answers the same.
  const turn = (n, args) => ({
    n,
    state: 'answered',
    message: {
      tool_calls: [{ id: `c${n}`, function: { name: 'read_kit_part', arguments: JSON.stringify(args) } }]
    }
  })
  const [resumed] = kitTools(kit.doc, { history: [turn(0, { id: 'site' }), turn(1, { ids: ['header'] })] })
  assert.match(JSON.parse((await resumed.run({ id: 'header' }, { call: 3 })).text).detail, /your call 1 /)
  assert.match(JSON.parse((await resumed.run({ id: 'site' }, { call: 3 })).text).detail, /your call 0 /)
  // The last saved call run again on resume still answers its parts in full.
  assert.equal((await resumed.run({ ids: ['header'] }, { call: 1 })).repeated, false)
  // Called without a call number (no tracking), the tool answers as before.
  assert.equal(typeof (await resumed.run({ id: 'header' })), 'string')
})

test('a preloaded first message: the kit block first (the same bytes for every brief), then the brief, then the write instruction', () => {
  const kit = { ref: 'harbour-test/j6/0.0.1', doc: harbourKit() }
  const block = preloadedKitBlock(kit)
  assert.equal(preloadedKitBlock(structuredClone(kit)), block, 'the kit block is not deterministic')
  const one = preloadedFirstMessage({ kit, brief: brief() })
  const other = preloadedFirstMessage({ kit, brief: { ...brief(), invented: 'another brief' } })
  assert.ok(one.startsWith(block) && other.startsWith(block), 'the message does not open with the kit block')
  assert.ok(one.endsWith(`${JSON.stringify(brief())}\n\n${WRITE_PLAN_INSTRUCTION}`))
  // test-quality: contract the model reads this wording and the plan parser expects one json fenced block; changing it must be a deliberate change of both
  assert.equal(
    WRITE_PLAN_INSTRUCTION,
    'Write the complete plan now as one JSON object in a single ```json fenced block; no tool calls.'
  )
  // The whole planner view of the kit, as compact JSON, and nothing about tools to call.
  const json = block.slice(block.indexOf('\n{') + 1)
  assert.deepEqual(JSON.parse(json), compactForPlanner(kit.doc))
  assert.equal(json, JSON.stringify(compactForPlanner(kit.doc)))
  assert.match(block, /The whole kit is included below/)
  assert.match(block, /There are no tools in this run/)
  assert.match(block, /plan from the looks instead/)
  assert.doesNotMatch(one, /read_kit_part|open_kit_image/)
  assert.ok(!block.includes(JSON.stringify(brief())), 'the brief leaks into the kit block')
})
