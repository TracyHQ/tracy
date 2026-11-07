// The picture bench writes the write step's picture file (ADR 0043, ADR 0044): `get` puts mapping.json, the output of
// exportPictureMapping, beside site-pictures.json and the files/ it points at, so `write-step-bench.mjs run
// --pictures-file <dir>/mapping.json` reads the folder as it is. The run, kit and pictures are invented here; every
// picture is a tiny generated PNG.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { copyPictureFiles, runFiles } from '../src/site-pictures/bench-export.js'
import { packageProblems, readPackageFiles } from '../src/write-step/picture-package.js'
import { picture } from './_write-step-pictures.mjs'

const CONTRACT = 'demo-fern/j6/2.0.0'
const HERO = picture('fern hero')
const LETTERS = picture('fern letters')
const BAND = picture('fern band')
const hex = (c) => c.repeat(64)

const placed = (frame, source, made, extra = {}) => ({
  frame,
  source,
  ...made.entry,
  crop: null,
  enlarge: null,
  sharpness: null,
  darkened: false,
  seen: 'what the looker saw',
  reason: 'why this picture',
  ...extra
})

// The manifest of an invented run: an owner photo, a hidden frame, an initials frame (painted, its file a preview) and
// a drawn site setting.
const manifest = () => ({
  version: 'site-pictures/1',
  fingerprint: {
    kit: `tracy-template-kit/2 ${CONTRACT}`,
    planSha256: hex('a'),
    briefSha256: hex('b'),
    prompts: { picker: hex('c'), drawing: hex('d'), looker: hex('e') }
  },
  frames: [
    placed('block-2.0', 'owner-photo', HERO, { asset: 'a-hero' }),
    { frame: 'block-2.1', source: 'hide', file: null, darkened: false, seen: null, reason: 'no photo fits' },
    placed('block-3.0', 'initials', LETTERS, {
      letters: 'FW',
      paint: { background: 'accent', foreground: 'on-accent' },
      preview: true
    })
  ],
  siteSettings: [placed('block-4.picture-1', 'drawn', BAND, { writeDoor: 'none' })],
  returns: [],
  altNotes: [],
  usage: [{ asset: 'a-hero', frames: 1 }],
  cost: { picker: 0.01, drawer: 0.02, looker: 0.01 },
  timing: { picker: 1000, drawer: 2000, looker: 500 }
})

const imageSlot = (key) => ({ key, type: 'image' })
const kitDoc = () => ({
  contract: CONTRACT,
  contentMap: { slots: ['module-2.0', 'module-2.1', 'module-3.0'].map(imageSlot) }
})

const run = (rounds) => ({
  id: 'run-fern-1',
  status: 'succeeded',
  step: 'done',
  kitRef: CONTRACT,
  brief: { business: { name: 'Fernwood Pottery' } },
  plan: { kit: `tracy-template-kit/2 ${CONTRACT}` },
  rounds,
  standingFailures: ''
})
const doneRound = () => ({
  round: 0,
  state: 'done',
  pictures: manifest(),
  checkResult: { summary: { pass: 1, fail: 0 } }
})
const fileRows = [HERO, LETTERS, BAND].map((m) => ({
  path: path.basename(m.entry.file),
  sha256: m.entry.sha256
}))
const store = {
  readPicture: async (name) =>
    [HERO, LETTERS, BAND].find((m) => m.entry.file === `files/${name}`)?.bytes ?? null
}

/** Write what `get` writes into a fresh folder and return it. */
async function exported(theRun, kit) {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-pictures-mapping-export-'))
  for (const [name, text] of runFiles(theRun, [], fileRows, kit)) writeFileSync(path.join(dir, name), text)
  assert.deepEqual(await copyPictureFiles(store, fileRows, dir), [])
  return dir
}

test('get writes mapping.json beside site-pictures.json and files/, and the write step reads the folder', async () => {
  const dir = await exported(run([doneRound()]), kitDoc())
  try {
    const names = readdirSync(dir)
    for (const name of ['mapping.json', 'site-pictures.json', 'files']) assert.ok(names.includes(name), name)
    assert.equal(readdirSync(path.join(dir, 'files')).length, 3)
    const pkg = JSON.parse(readFileSync(path.join(dir, 'mapping.json'), 'utf8'))
    assert.deepEqual(Object.keys(pkg).sort(), [
      'alts',
      'hidden',
      'mapping',
      'painted',
      'problems',
      'siteSettings',
      'uploads'
    ])
    assert.deepEqual(pkg.problems, [])
    assert.equal(pkg.mapping.contract, CONTRACT)
    assert.equal(pkg.mapping.revision, 'site-pictures-run run-fern-1')
    assert.deepEqual(pkg.mapping.changes, { 'module-2.0': HERO.entry.sitePath })
    assert.deepEqual(pkg.uploads, [HERO.entry])
    assert.deepEqual(
      pkg.hidden.map((h) => h.key),
      ['module-2.1']
    )
    assert.deepEqual(
      pkg.painted.map((p) => [p.key, p.kind, p.preview.file]),
      [['module-3.0', 'initials', LETTERS.entry.file]]
    )
    assert.deepEqual(
      pkg.siteSettings.map((s) => s.file),
      [BAND.entry.file]
    )
    // The write step's own reader: no problem on this contract, and every file it names is read from beside the
    // mapping and holds its hash.
    assert.deepEqual(packageProblems(pkg, CONTRACT), [])
    const inputs = {}
    const read = await readPackageFiles([...pkg.uploads, ...pkg.siteSettings], dir, inputs)
    assert.equal(read.stop, undefined, JSON.stringify(read.stop))
    assert.equal(read.files.size, 2)
    assert.deepEqual(Object.keys(inputs.assets).sort(), [BAND.entry.file, HERO.entry.file].sort())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('with no kit the mapping names the run kit and checks no slot; with no manifest there is no mapping', async () => {
  const dir = await exported(run([doneRound()]), null)
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'mapping.json'), 'utf8'))
    assert.equal(pkg.mapping.contract, CONTRACT)
    assert.deepEqual(pkg.problems, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const names = runFiles(run([{ round: 0, state: 'failed', error: 'stopped' }]), [], [], kitDoc()).map(
    ([n]) => n
  )
  assert.ok(!names.includes('mapping.json'))
  assert.ok(!names.includes('site-pictures.json'))
})

test('a kit without the slot a frame fills is a problem in the file, which the write step refuses', async () => {
  const kit = {
    contract: CONTRACT,
    contentMap: { slots: [imageSlot('module-2.1'), imageSlot('module-3.0')] }
  }
  const dir = await exported(run([doneRound()]), kit)
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'mapping.json'), 'utf8'))
    assert.deepEqual(pkg.problems, [{ where: 'block-2.0', detail: 'the kit has no image slot module-2.0' }])
    assert.equal(packageProblems(pkg, CONTRACT)[0], 'block-2.0: the kit has no image slot module-2.0')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
