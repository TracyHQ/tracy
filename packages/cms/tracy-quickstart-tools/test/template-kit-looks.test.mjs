// Template kit looks: a short text of what each packed 1440 shot shows, written by the packager's own Claude Code.
// `looks --list` names the shots without a current look, `looks --apply` checks and merges the texts, `pack`
// carries them to pages and blocks drawn by another one's shot. A made-up gallery kit; every text is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { looksMissingOf } from '../../../../apps/tracy-web/src/lib/template-kit/reader.js'
import { applyLooks, indentOf, keepLooks, lookWorklist } from '../template-kit/lib/looks.mjs'
import { packKitFolder, placeLook } from '../template-kit/lib/pack.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const sha = (s) => createHash('sha256').update(s).digest('hex')
const W = (id) => ({ 1440: `${id}-1440`, 390: `${id}-390` })
const TEXT = {
  'page-home-1440':
    'A full width photo banner with a centred heading and one button, then three equal cards with icons.',
  'page-works-1440':
    'A page heading over a grid of six square thumbnails in three columns, each with a caption.',
  'top-1440': 'A slim bar with the logo on the left and five menu links on the right, on a white background.',
  'body-works-1440': 'A grid of square thumbnails in three columns with a short caption under each picture.',
  'body-work-a-1440':
    'One large picture across the top, a heading, two paragraphs of text and a back link below.'
}

/** A gallery kit: a home page, a works listing with two item pages (one layout, `shotOf`), files on disk. */
function gallery(dir) {
  const page = (id, path, blocks) => ({ id, path, blocks: { 1440: blocks, 390: blocks }, images: W(id) })
  const kit = {
    template: { name: 'gallery_demo', version: '1.0.0' },
    quickstart: { version: '1.0.0' },
    widths: [1440, 390],
    pageGroups: [
      { id: 'group-home', root: 'page-home', children: [] },
      { id: 'group-works', root: 'page-works', children: ['page-work-a', 'page-work-b'] }
    ],
    pages: [
      page('page-home', '/', ['top']),
      page('page-works', '/works', ['top', 'body-works']),
      page('page-work-a', '/works/a', ['top', 'body-work-a']),
      page('page-work-b', '/works/b', ['top', 'body-work-b'])
    ],
    blocks: [
      { id: 'top', images: W('top') },
      { id: 'body-works', images: W('body-works') },
      { id: 'body-work-a', images: W('body-work-a') },
      { id: 'body-work-b', images: W('body-work-b'), shotOf: 'body-work-a' }
    ],
    errors: []
  }
  const ids = [...kit.pages, ...kit.blocks].flatMap((x) => Object.values(x.images))
  mkdirSync(join(dir, 'images'), { recursive: true })
  kit.images = ids.map((id) => {
    writeFileSync(join(dir, `images/${id}.jpg`), `picture ${id}`)
    return { id, path: `images/${id}.jpg`, sha256: sha(`picture ${id}`) }
  })
  return kit
}

const entriesFor = (need) => need.map((n) => ({ image: n.image, sha256: n.sha256, text: TEXT[n.image] }))

test('list: one entry per packed 1440 shot without a look, never a stand-in shot or a 390 one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-looks-'))
  try {
    const kit = gallery(dir)
    const w = lookWorklist(kit, dir)
    assert.equal(w.width, 1440)
    assert.deepEqual(w.problems, [])
    // page-work-a/b are not their group's representative; body-work-b is drawn by body-work-a's shot.
    assert.deepEqual(
      w.need.map((n) => n.image),
      ['body-work-a-1440', 'body-works-1440', 'page-home-1440', 'page-works-1440', 'top-1440']
    )
    const top = w.need.find((n) => n.image === 'top-1440')
    assert.equal(top.file, join(dir, 'images/top-1440.jpg'))
    assert.equal(top.sha256, sha('picture top-1440'))
    assert.deepEqual(top.shows, ['block top'])
    assert.equal(top.why, 'missing')
    writeFileSync(join(dir, 'images/top-1440.jpg'), 'another picture')
    assert.match(lookWorklist(kit, dir).problems.join('\n'), /top-1440: the file differs/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('apply: every entry is checked and a wrong one writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-looks-'))
  try {
    const kit = gallery(dir)
    const before = JSON.stringify(kit)
    const good = entriesFor(lookWorklist(kit, dir).need)
    const r = applyLooks(kit, [
      ...good.slice(1),
      { image: 'nowhere-1440', sha256: 'a'.repeat(64), text: TEXT['top-1440'] },
      { image: 'top-390', sha256: sha('picture top-390'), text: TEXT['top-1440'] },
      { image: 'top-1440', sha256: 'b'.repeat(64), text: TEXT['top-1440'] },
      { ...good[0], text: 'Too short.' },
      {
        image: 'page-home-1440',
        sha256: sha('picture page-home-1440'),
        text: `${TEXT['top-1440']} ${String.fromCharCode(233)}`
      }
    ])
    assert.equal(r.set, 0)
    assert.equal(JSON.stringify(kit), before, 'nothing merged')
    const all = r.errors.join('\n')
    assert.match(all, /nowhere-1440\): no such image/)
    assert.match(all, /top-390\): not the 1440 shot/)
    assert.match(all, /top-1440\): the same image is described twice|top-1440\): sha256 does not match/)
    assert.match(all, /body-work-a-1440\): text is 10 characters/)
    assert.match(all, /page-home-1440\): (text must be plain ASCII|the same image)/)
    assert.match(applyLooks(kit, { nope: 1 }).errors[0], /must be a list/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('apply merges after images, a second run changes nothing, a new shot makes the look stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-looks-'))
  try {
    const kit = gallery(dir)
    const entries = entriesFor(lookWorklist(kit, dir).need)
    const r = applyLooks(kit, entries)
    assert.deepEqual(r.errors, [])
    const home = kit.pages[0]
    assert.deepEqual(Object.keys(home), ['id', 'path', 'blocks', 'images', 'look'])
    assert.deepEqual(home.look, {
      image: 'page-home-1440',
      sha256: sha('picture page-home-1440'),
      text: TEXT['page-home-1440']
    })
    assert.deepEqual(lookWorklist(kit, dir).need, [])
    const again = applyLooks(kit, entries)
    assert.equal(again.set, 0)
    assert.equal(again.unchanged, r.set)
    // A recaptured shot: its record holds a new sha256, so the look no longer describes it.
    writeFileSync(join(dir, 'images/top-1440.jpg'), 'a new top bar')
    kit.images.find((i) => i.id === 'top-1440').sha256 = sha('a new top bar')
    const w = lookWorklist(kit, dir)
    assert.deepEqual(
      w.need.map((n) => [n.image, n.why, n.was]),
      [['top-1440', 'stale', TEXT['top-1440']]]
    )
    // The rule /ops reads on the pack: the top bar's look no longer names its shot's bytes.
    const top = kit.blocks.find((b) => b.id === 'top')
    assert.deepEqual(looksMissingOf({ images: kit.images, pages: [], blocks: [top] }), [
      { kind: 'block', id: 'top', image: 'top-1440', why: 'stale' }
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pack carries each look to the pages and blocks drawn by the shot of another one; a rebuild keeps unchanged ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-looks-'))
  try {
    const kit = gallery(dir)
    assert.deepEqual(applyLooks(kit, entriesFor(lookWorklist(kit, dir).need)).errors, [])
    writeFileSync(join(dir, 'template-kit.json'), JSON.stringify(kit))
    packKitFolder(dir)
    const packed = JSON.parse(readFileSync(join(dir, 'pack/template-kit.json'), 'utf8'))
    const byId = (list, id) => list.find((x) => x.id === id)
    assert.equal(byId(packed.blocks, 'body-work-b').look.text, TEXT['body-work-a-1440'], 'shotOf')
    assert.equal(byId(packed.blocks, 'body-work-b').look.image, 'body-work-a-1440')
    assert.equal(byId(packed.pages, 'page-work-a').look.image, 'page-works-1440', 'fullShotOf')
    assert.deepEqual(looksMissingOf(packed), [], 'every packed shot has its current look')
    const rebuilt = gallery(dir)
    assert.equal(keepLooks(rebuilt, kit), 5)
    assert.deepEqual(lookWorklist(rebuilt, dir).need, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('placeLook keeps key order; indentOf reads the file indent', () => {
  const item = placeLook({ id: 'x', images: {}, frames: [] }, { image: 'x-1440', sha256: 'a', text: 't' })
  assert.deepEqual(Object.keys(item), ['id', 'images', 'look', 'frames'])
  assert.deepEqual(Object.keys(placeLook(item, undefined)), ['id', 'images', 'frames'])
  assert.equal(indentOf('{\n "a": 1\n}\n'), 1)
  assert.equal(indentOf('{\n  "a": 1\n}\n'), 2)
})

test('cli: looks --list then --apply, in place with the same indent, and refused on a wrong entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-looks-'))
  try {
    const kit = gallery(dir)
    const file = join(dir, 'template-kit.json')
    writeFileSync(file, `${JSON.stringify(kit, null, 1)}\n`)
    const run = (...args) =>
      spawnSync(process.execPath, [CLI, 'looks', '--kit', file, ...args], { encoding: 'utf8' })
    const list = run('--list', '--to', join(dir, 'work.json'))
    assert.equal(list.status, 0, list.stderr)
    const work = JSON.parse(readFileSync(join(dir, 'work.json'), 'utf8'))
    assert.equal(work.need.length, 5)
    const entries = entriesFor(work.need)
    writeFileSync(join(dir, 'bad.json'), JSON.stringify([{ ...entries[0], text: '' }]))
    const bad = run('--apply', join(dir, 'bad.json'))
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /no text/)
    assert.equal(readFileSync(file, 'utf8'), `${JSON.stringify(kit, null, 1)}\n`, 'untouched')
    writeFileSync(join(dir, 'looks.json'), JSON.stringify(entries))
    const ok = run('--apply', join(dir, 'looks.json'))
    assert.equal(ok.status, 0, ok.stderr)
    const written = readFileSync(file, 'utf8')
    assert.equal(indentOf(written), 1)
    assert.equal(run('--apply', join(dir, 'looks.json')).status, 0)
    assert.equal(readFileSync(file, 'utf8'), written, 'idempotent')
    assert.match(run('--list').stderr, /^0 shots need a look, 5 current$/m)
    assert.equal(spawnSync(process.execPath, [CLI, 'looks', '--list'], { encoding: 'utf8' }).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
