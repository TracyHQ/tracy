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
import { buildModel } from '../src/site-writer/reading-page/model.js'
import { failureListText } from '../src/site-writer/copy-check/check-copy.js'
import { brief, check, copy, plan } from './_site-copy-check.mjs'

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
    assert.ok(html.includes('Alt: A coach showing a member how to lift'))
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
