// The copy reading page (#333): a fake run folder on the invented Quay Fitness Studio fixtures goes through the
// script, and the page it writes is checked for every page, block and slot of the plan, the red failing slots with
// their rule and numbers, the images, and escaping. No model is called.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { main } from '../scripts/site-writer-reading-page.mjs'
import { exportContractMapping } from '../src/site-writer/contract-mapping.js'
import { checkCopy, failureListText } from '../src/site-writer/copy-check/check-copy.js'
import { buildModel } from '../src/site-writer/reading-page/model.js'
import { renderPage } from '../src/site-writer/reading-page/render.js'
import { brief, check, copy, kit, plan } from './_site-copy-check.mjs'
import * as menuFixtures from './_site-writer-main-menu.mjs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc(body), body.length + 4)
  return out
}
/** A 2 by 2 red PNG. */
function tinyPng() {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(2, 0)
  header.writeUInt32BE(2, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.from([0, 200, 30, 30, 200, 30, 30])
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat([row, row]))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const w = (dir, name, value) =>
  writeFile(path.join(dir, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)

/** A run folder as "get" writes it: the copy breaks W03 (over the limit), W04 (an invented number), and holds markup. */
async function fakeRun(root) {
  const runDir = path.join(root, 'run')
  const imagesDir = path.join(root, 'images', 'blocks')
  await mkdir(runDir, { recursive: true })
  await mkdir(imagesDir, { recursive: true })
  const c = copy()
  c.slots.find((s) => s.slot === 'block-2.1').text =
    'Train with a coach who knows you and your goals, every day'
  c.slots.find((s) => s.slot === 'block-2.2').text =
    'Small group classes run every day. Open 07:30 to 21:00, call +000 555 0100 to reserve.'
  c.slots.find((s) => s.slot === 'block-3.1').text = '<script>alert("x")</script> & members'
  c.returns = [{ slot: 'block-5.1', reason: 'no coach name in the brief' }]
  c.slots = c.slots.filter((s) => s.slot !== 'block-5.1')
  const result = check(c)
  await w(runDir, 'plan.json', plan())
  await w(runDir, 'brief.json', brief())
  await w(runDir, 'run.json', { id: 'run-1', model: 'fake-flash', costUsd: 0.0123 })
  await w(runDir, 'site-copy.json', c)
  await w(runDir, 'copy-v1.json', copy())
  await w(runDir, 'check-v1.json', result)
  await w(runDir, 'failures-standing.txt', failureListText(result))
  for (const id of ['block-1', 'block-2', 'block-3', 'block-5'])
    await writeFile(path.join(imagesDir, `${id}-1440.png`), tinyPng())
  await writeFile(path.join(imagesDir, 'block-2-390.png'), tinyPng())
  return { runDir, imagesDir: path.join(root, 'images'), result }
}

const run = async (argv) => {
  const lines = { out: [], err: [] }
  const code = await main(argv, { out: (l) => lines.out.push(l), err: (l) => lines.err.push(l) })
  return { code, ...lines }
}

test('the page shows every page, block, slot and picture of the plan, failing ones in red', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const { runDir, imagesDir } = await fakeRun(root)
    const outFile = path.join(root, 'reading.html')
    const r = await run(['--run', runDir, '--kit-images', imagesDir, '--out', outFile])
    assert.equal(r.code, 0, r.err.join('\n'))
    const html = await readFile(outFile, 'utf8')
    for (const id of [
      'page-home',
      'page-about',
      'page-old',
      'legal:privacy',
      'block-1',
      'block-2',
      'block-3',
      'block-4',
      'block-5'
    ])
      assert.ok(html.includes(id), `${id} appears`)
    for (const slot of [
      'block-1.1',
      'block-2.1',
      'block-2.2',
      'block-3.1',
      'block-3.5',
      'block-3.6',
      'block-5.1',
      'block-2.f1'
    ])
      assert.ok(html.includes(`>${slot}<`), `${slot} appears`)
    assert.ok(html.includes('Picture wish: a coach and a member'))
    assert.ok(html.includes('Alt: <span class="w">A coach showing a member how to lift</span>'))
    assert.ok(html.includes('Quay Fitness Studio, group classes'), 'page title')
    assert.ok(html.includes('Privacy policy'), 'legal page')
    assert.match(html, /<button type="button" class="zoom"[^>]*><img src=/, 'block images are clickable')
    assert.ok(html.includes('Page not found'), 'not found page')
    assert.ok(html.includes('returned to the planner: no coach name in the brief'))
    assert.ok(html.includes('coaches know members'), 'notebook')
    assert.ok(html.includes('prefers-color-scheme:dark'))
    assert.equal((html.match(/data:image\/png;base64,/g) ?? []).length, 4, 'one 1440 image per used block')

    const slotDiv = (slot) => {
      const at = html.indexOf(`id="p-${slot.replace('.', '-')}"`)
      assert.ok(at > 0, `${slot} has a card`)
      const start = html.lastIndexOf('<div class="slot', at)
      const next = html.indexOf('<div class="slot', at)
      return html.slice(start, next < 0 ? undefined : next)
    }
    const over = slotDiv('block-2.1')
    assert.match(over, /class="slot bad"/)
    assert.match(over, /W03/)
    assert.match(over, /\d+ characters, limit 40/)
    assert.match(over, /count over/)
    assert.match(slotDiv('block-2.2'), /<b>W04<\/b>[^<]*[^<]*07:30/)
    assert.doesNotMatch(slotDiv('block-1.1'), /class="slot bad"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('text from the files is escaped', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const { runDir, imagesDir } = await fakeRun(root)
    const outFile = path.join(root, 'reading.html')
    await run(['--run', runDir, '--kit-images', imagesDir, '--out', outFile])
    const html = await readFile(outFile, 'utf8')
    assert.ok(!html.includes('<script>alert'), 'no raw script from the copy')
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; members'))
    assert.equal(html.split('<script').length - 1, 1, 'only the built-in zoom script')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('--link-images points at the files instead of embedding them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const { runDir, imagesDir } = await fakeRun(root)
    const outFile = path.join(root, 'reading.html')
    const r = await run(['--run', runDir, '--kit-images', imagesDir, '--out', outFile, '--link-images'])
    assert.equal(r.code, 0)
    const html = await readFile(outFile, 'utf8')
    assert.ok(!html.includes('data:image'))
    assert.ok(html.includes('src="images/blocks/block-2-1440.png"'), 'the 1440 file wins over the 390 one')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a block without an image says so, and a missing run folder is refused', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const { runDir } = await fakeRun(root)
    const outFile = path.join(root, 'reading.html')
    assert.equal((await run(['--run', runDir, '--out', outFile])).code, 0)
    assert.ok((await readFile(outFile, 'utf8')).includes('No 1440 image found for this block'))
    const bad = await run(['--run', path.join(root, 'nope'), '--out', outFile])
    assert.equal(bad.code, 1)
    assert.equal((await run([])).code, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the model puts every failure on a place and counts the slots in red', async () => {
  const c = copy()
  c.slots.find((s) => s.slot === 'block-2.1').text = 'x'.repeat(60)
  const m = buildModel({ plan: plan(), brief: brief(), copy: c, check: check(c), run: null, standing: '' })
  const s = m.pages[0].blocks[0].slots.find((x) => x.slot === 'block-2.1')
  assert.equal(s.limit, 40)
  assert.equal(s.chars, 60)
  assert.ok(s.failures.some((f) => f.rule === 'W03'))
  assert.equal(m.counts.failing >= 1, true)
  assert.deepEqual(m.unplaced, [])
})

test('the shared blocks show the main menu with its dropdowns, hidden items struck through', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const runDir = path.join(root, 'run')
    await mkdir(runDir, { recursive: true })
    const c = menuFixtures.copy()
    c.slots.find((s) => s.slot === 'menuItem-31.0').text = 'All of our friendly coaches'
    const p = menuFixtures.plan()
    const args = { plan: p, kit: menuFixtures.kit(), brief: brief(), contentMap: menuFixtures.contentMap() }
    const result = checkCopy({ copy: c, ...args })
    await w(runDir, 'plan.json', p)
    await w(runDir, 'brief.json', brief())
    await w(runDir, 'site-copy.json', c)
    await w(runDir, 'check-v1.json', result)
    const { extras } = exportContractMapping({
      copy: c,
      contract: 'demo-gym/j6/1.0.0',
      revision: 'r',
      ...args
    })
    await w(runDir, 'mapping.json', { extras })
    const outFile = path.join(root, 'reading.html')
    assert.equal((await run(['--run', runDir, '--out', outFile])).code, 0)
    const html = await readFile(outFile, 'utf8')
    const at = html.indexOf('id="main-menu"')
    assert.ok(at > html.indexOf('id="shared"'), 'the main menu sits in the shared blocks section')
    const section = html.slice(at, html.indexOf('</section>', at))
    assert.match(section, /About[\s\S]*All of our friendly coaches/, 'a dropdown label under its parent')
    assert.match(section, /<s>[^<]*Our history<\/s>/, 'a hidden item struck through, with its demo label')
    assert.match(section, /<s>[^<]*Prices<\/s>/)
    assert.match(section, /page-about_faq \(\/about\/faq\): no main menu item under \/about/)
    // The over-long dropdown label is a slot card in red, not a stray outside the plan blocks.
    assert.match(section, /class="slot bad"[^>]*id="p-menuItem-31-0"/)
    assert.equal(html.split('id="p-menuItem-31-0"').length - 1, 1, 'shown once, not again among the strays')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('object-valued facts and evidence quotes read as text, never [object Object]', () => {
  const b = brief()
  b.facts.push({
    id: 'f-hours-week',
    field: 'hours',
    value: { days: 'Monday to Friday', open: '06:00', close: '21:00' },
    evidence: [
      { ref: 'place-1', quote: 'Open weekdays from six', source: 'listing' },
      { ref: 'place-2', source: 'map' }
    ]
  })
  b.facts.push({
    id: 'f-tags',
    field: 'services',
    value: ['yoga', { name: 'spin', kind: 'class' }],
    evidence: []
  })
  const p = plan()
  p.pages[0].blocks[0].copy[0].factIds = ['f-name', 'f-hours-week', 'f-tags']
  const html = renderPage(
    buildModel({ plan: p, brief: b, copy: copy(), check: null, run: null, standing: '' })
  )
  assert.ok(!html.includes('[object Object]'))
  assert.ok(html.includes('days: Monday to Friday, open: 06:00, close: 21:00'))
  assert.ok(html.includes('Open weekdays from six'))
  assert.ok(html.includes('yoga; name: spin, kind: class'))
})

test('writer output is tinted, plan labels are dashed and muted, and a legend explains both', () => {
  const html = renderPage(
    buildModel({ plan: plan(), brief: brief(), copy: copy(), check: null, run: null, standing: '' })
  )
  assert.match(html, /<div class="legend">[\s\S]*writer output[\s\S]*plan label[\s\S]*plan notes and facts/)
  assert.match(html, /<div class="text w">.*Train with a coach who knows you/)
  assert.match(html, /<div class="text label">.*Join us/)
  assert.match(html, /<span class="w">A coach showing a member how to lift<\/span>/)
  assert.match(html, /<dd class="w">Quay Fitness Studio, group classes/)
  for (const theme of [':root{', ':root:not([data-theme="light"]){', ':root[data-theme="dark"]{']) {
    const at = html.indexOf(theme)
    assert.ok(at > 0, theme)
    assert.match(html.slice(at, html.indexOf('}', at)), /--w:#[0-9a-f]{6};--w-bg:#[0-9a-f]{6}/, theme)
  }
})

test("each block lists the plan's links with their labels and its own footer column heading", async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const runDir = path.join(root, 'run')
    await mkdir(runDir, { recursive: true })
    const p = plan()
    p.sharedBlocks[0].links = [
      { link: 'block-1.link-1', leadsTo: 'page-about', labelSlot: 'block-5.1' },
      { link: 'block-1.link-2', leadsTo: 'page-home', labelSlot: 'block-1.1' },
      { link: 'block-1.link-3', leadsTo: 'page-home', labelSlot: 'block-1.9' }
    ]
    p.sharedBlocks[0].hiddenSlots = [{ slot: 'block-1.9', why: 'no trial offer in the brief' }]
    p.sharedBlocks.push({ block: 'block-6', seen: 'seen', decision: 'keep', why: 'footer column' })
    const c = copy()
    await w(runDir, 'plan.json', p)
    await w(runDir, 'brief.json', brief())
    await w(runDir, 'site-copy.json', c)
    const { extras } = exportContractMapping({
      copy: c,
      contract: 'c',
      revision: 'r',
      kit: kit(),
      brief: brief(),
      plan: p
    })
    await w(runDir, 'mapping.json', { extras })
    const outFile = path.join(root, 'reading.html')
    assert.equal((await run(['--run', runDir, '--out', outFile])).code, 0)
    const html = await readFile(outFile, 'utf8')
    const blockOf = (id) => {
      const at = html.indexOf(`<h3>${id}</h3>`)
      return html.slice(at, html.indexOf('</section>', at))
    }
    const header = blockOf('block-1')
    assert.match(header, /<ul class="links">/)
    assert.match(
      header,
      /<span class="w">Nia Brook<\/span> → page-about/,
      'a writer label, wherever it was written'
    )
    assert.match(header, /<span class="label">Join us<\/span> → page-home/, 'a plan label')
    assert.match(
      header,
      /<s>block-1\.9<\/s> → page-home <span class="muted small">no trial offer in the brief<\/span>/
    )
    const footer = blockOf('block-6')
    assert.match(footer, /id="p-block-6-1"/, 'the column heading sits in its block')
    assert.match(footer, /column heading/)
    assert.match(footer, /Our classes/)
    assert.equal(html.split('id="p-block-6-1"').length - 1, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('with the kit, each block shows its lists row by row and the page lists the slots left alone', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-page-'))
  try {
    const runDir = path.join(root, 'run')
    await mkdir(runDir, { recursive: true })
    // An item list on the hero: one card per class article, a title, a card heading, a summary and an image field.
    const k = kit()
    const field = (f, role, type, samples) => ({
      field: f,
      role,
      type,
      slots: samples.map(([item, id, sample]) => ({ item, id, type, sample }))
    })
    const hero = k.blocks.find((b) => b.id === 'block-2')
    hero.slots.push({
      id: 'block-2.9',
      role: 'editorial.button_label',
      type: 'text',
      sample: 'Book a session'
    })
    // Not copy: a link and a video id are never listed as left alone.
    hero.slots.push({ id: 'block-2.10', role: 'contact.cta_url', type: 'url' })
    hero.slots.push({ id: 'block-2.11', role: 'business.video', type: 'text', sample: 'demo-video-id' })
    hero.lists = [
      {
        id: 'block-2.cards',
        rowKind: 'items',
        shown: ['article-1', 'article-2'],
        rowSlots: [
          field('title', 'offering.name', 'text', [
            ['article-1', 'article-1.4', 'Demo Kickboxing'],
            ['article-2', 'article-2.4', 'Demo Spinning']
          ]),
          field('custom:card-title', 'editorial.heading', 'text', [
            ['article-1', 'article-1.7', 'Kick hard'],
            ['article-2', 'article-2.7', 'Spin fast']
          ]),
          field('introtext', 'editorial.paragraph', 'text', [
            ['article-1', 'article-1.0', 'Demo summary one'],
            ['article-2', 'article-2.0', 'Demo summary two']
          ]),
          field('image', 'offering.image', 'image', [['article-1', 'article-1.5', 'images/demo.jpg']])
        ]
      }
    ]
    const p = plan()
    p.pages[0].blocks[0].hiddenSlots.push({ slot: 'article-2.7', why: 'one heading per card is enough' })
    const c = copy()
    c.slots.push(
      { slot: 'article-1.4', owner: 'writer', text: 'Morning yoga', factIds: [] },
      { slot: 'article-1.0', owner: 'writer', text: 'Slow stretches before work.', factIds: [] },
      { slot: 'article-2.4', owner: 'plan-label', text: 'Spin', factIds: [] }
    )
    await w(runDir, 'plan.json', p)
    await w(runDir, 'brief.json', brief())
    await w(runDir, 'site-copy.json', c)
    const kitFile = path.join(root, 'template-kit.json')
    await w(root, 'template-kit.json', k)
    const outFile = path.join(root, 'reading.html')
    assert.equal((await run(['--run', runDir, '--out', outFile, '--kit', kitFile])).code, 0)
    const html = await readFile(outFile, 'utf8')
    const at = html.indexOf('<h3>block-2</h3>')
    const hero2 = html.slice(at, html.indexOf('</section>', at))
    assert.match(hero2, /List block-2\.cards/)
    assert.match(hero2, /article-1<\/td>[\s\S]*article-1\.4<\/span> <span class="w">Morning yoga<\/span>/)
    assert.match(hero2, /article-1\.0<\/span> <span class="w">Slow stretches before work\.<\/span>/)
    assert.match(
      hero2,
      /article-1\.7<\/span> <span class="warn">not written, not hidden: demo text stays<\/span> <q>Kick hard<\/q>/
    )
    assert.match(hero2, /article-2\.4<\/span> <span class="label">Spin<\/span>/)
    assert.match(
      hero2,
      /article-2\.7<\/span> <s>Spin fast<\/s> <span class="muted small">hidden: one heading per card is enough/
    )
    assert.doesNotMatch(hero2, /article-1\.5/, 'image fields are the image step')
    const left = html.slice(html.indexOf('id="unhandled"'), html.indexOf('id="shared"'))
    const listed = [...left.matchAll(/<td class="id">([^<]+)<\/td>/g)].map((x) => x[1])
    assert.deepEqual(listed, ['block-2.9', 'article-1.7', 'article-2.0'])
    assert.match(left, /<q>Book a session<\/q>/)

    // Without the kit the page says nothing about lists or slots left alone.
    assert.equal((await run(['--run', runDir, '--out', outFile])).code, 0)
    assert.doesNotMatch(await readFile(outFile, 'utf8'), /id="unhandled"|List block-2\.cards/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
