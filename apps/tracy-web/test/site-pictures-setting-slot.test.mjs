// A frame written through a kit setting slot (`site.settingSlots`, e.g. a T4 page background `site.body-background`)
// is listed in siteSettings, never in frames, even though the kit marks it writable: no content map slot holds it, so
// in frames the export would report "the kit has no image slot" and the write step would refuse the whole package.
// Its kit twins are painted by the same setting and get no entry of their own. Invented Kestrel Row Bike Workshop kit.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { ladderState } from '../src/site-pictures/ladder-state.js'
import { PICTURES_VERSION, PROMPT_ROLES } from '../src/site-pictures/manifest-shape.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { packageProblems } from '../src/write-step/picture-package.js'
import { brief, contentMap, kit, KIT_REF, PHOTO_BYTES, plan } from './_site-pictures-bench.mjs'

const SLOT = 'site.body-background'
const ROOT = 'block-7.picture-1'
const TWINS = ['block-10.picture-1', 'body-contact.picture-2']

// The bench kit with its painted-behind background tied to a setting slot, as the kit tool writes it, plus two twins
// of it on other pages. The content map holds no image slot for any of the three.
function settingKit() {
  const k = { ...kit(), contentMap: contentMap() }
  const bg = k.blocks.find((b) => b.id === 'block-7').frames[0]
  delete bg.writableReason
  Object.assign(bg, { writable: true, slotId: SLOT })
  const twin = (id) => ({ ...bg, id, twinOf: ROOT })
  k.blocks.push({ id: 'block-10', role: 'section', frames: [twin(TWINS[0])] })
  k.blocks.push({ id: 'body-contact', role: 'page', frames: [twin(TWINS[1])] })
  k.site = {
    ...k.site,
    settingSlots: [
      {
        id: SLOT,
        kind: 'template-background',
        writable: true,
        writeTo: {
          action: 'template.siteSettings',
          template: 'demo_bikes',
          key: 'body_bg_img',
          file: 'etc/site/default.json'
        },
        frames: [ROOT, ...TWINS]
      }
    ]
  }
  return k
}

const hex = (c) => c.repeat(64)
const manifestOf = (got) => ({
  version: PICTURES_VERSION,
  fingerprint: {
    kit: KIT_REF,
    planSha256: hex('a'),
    briefSha256: hex('b'),
    prompts: Object.fromEntries(PROMPT_ROLES.map((r) => [r, hex('c')]))
  },
  frames: got.frames,
  siteSettings: got.siteSettings,
  returns: got.returns,
  pending: got.pending,
  altNotes: [],
  usage: got.usage,
  cost: {},
  timing: {}
})

test('a frame of a setting slot goes to siteSettings, its twins follow the setting, and the package exports clean', async () => {
  const k = settingKit()
  const got = await fillFrames({ plan: plan(), brief: brief(), kit: k, photoBytes: PHOTO_BYTES })
  assert.deepEqual(
    got.siteSettings.map((e) => e.frame),
    [ROOT],
    JSON.stringify({ frames: got.frames.map((e) => e.frame), returns: got.returns })
  )
  assert.equal(got.siteSettings[0].writeDoor, 'none')
  const listed = new Set([...got.frames, ...got.returns].map((e) => e.frame))
  for (const id of [ROOT, ...TWINS]) assert.ok(!listed.has(id), `${id} is not in frames or returns`)

  const out = exportPictureMapping({
    pictures: manifestOf(got),
    contract: KIT_REF,
    revision: 'rev-1',
    plan: plan(),
    brief: brief(),
    kit: k
  })
  assert.deepEqual(out.problems, [])
  assert.deepEqual(
    out.siteSettings.map((e) => e.frame),
    [ROOT]
  )
  assert.deepEqual(packageProblems(out, KIT_REF), [])
})

test('the fallback ladder lists a setting slot frame in siteSettings too', () => {
  const k = settingKit()
  const idx = indexInputs({ plan: plan(), kit: k, brief: brief(), files: {} })
  const s = ladderState(idx, { frames: [], siteSettings: [], returns: [], pending: [] })
  assert.equal(s.listOf(idx.frames.get(ROOT)), 'siteSettings')
  assert.equal(s.listOf(idx.frames.get('block-6.1')), 'frames')
})

test('a writable frame with a slot id the kit does not list as a setting slot stays in frames', async () => {
  const k = settingKit()
  k.site.settingSlots = []
  const idx = indexInputs({ plan: plan(), kit: k, brief: brief(), files: {} })
  const s = ladderState(idx, { frames: [], siteSettings: [], returns: [], pending: [] })
  assert.equal(s.listOf(idx.frames.get(ROOT)), 'frames')
})
