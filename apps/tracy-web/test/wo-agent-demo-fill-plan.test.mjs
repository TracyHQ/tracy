// The fill plan on the agent demo path (#141): for a release with a version 3 content map and a brief that links its
// photos, the fill plan, not the agent, decides which photo each contract picture slot takes. `plan.save` holds a row to
// it, `media.import` imports only the planned photo and draws the substitute a slot with no fitting photo takes, and the
// QA evidence carries the card's offering. A fictional boxing studio: its classes, coach and every file are made up.
import sharp from 'sharp'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { inventoryInvariant } from '../src/sites/agent-demo-inventory.js'
import {
  AGENT_DEMO,
  agentDemoCapabilities,
  freezeAgentResearch,
  researchHash,
  validateAgentPlan
} from '../src/opportunities-build/agent-demo.js'
import { agentFillPlan } from '../src/opportunities-build/agent-demo-fill-plan.js'
import { slotPhotoEvidence } from '../src/opportunities-build/slot-photo-evidence.js'

const fit = (width, height) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  source: { width, height, format: 'jpg' },
  boxes: { desktop: { width, height } }
})
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: ['module-2', 'module-3'].map((key) => ({ key, kind: 'module' })),
  slots: [
    {
      key: 'module-2.0',
      entity: 'module-2',
      type: 'image',
      role: 'offering.image',
      sample: 'images/demo/class.jpg',
      group: { id: 'module-2.service.0', item: 0, kind: 'service' },
      fit: fit(400, 300)
    },
    {
      key: 'module-3.0',
      entity: 'module-3',
      type: 'image',
      role: 'person.image',
      sample: 'images/demo/coach.jpg',
      group: { id: 'module-3.person.0', item: 0, kind: 'person' },
      fit: fit(300, 300)
    }
  ]
}
const CARD_NAMES = { 'module-2.service.0': 'Padel', 'module-3.person.0': 'Wren Example' }
const READING = {
  services: [{ id: 'svc-padel', label: 'Padel' }],
  team: [{ id: 'person-wren', label: 'Wren Example' }]
}
const ASSETS = [
  {
    id: 'photo-padel',
    kind: 'image',
    depicts: { id: 'svc-padel', evidence: { via: 'alt' } },
    faceBoxes: [],
    isOwnPhoto: true
  },
  {
    id: 'photo-hall',
    kind: 'image',
    depicts: { id: 'general', evidence: { via: 'vision' } },
    faceBoxes: [],
    isOwnPhoto: true
  }
]
const PHOTOS = [
  { id: 'photo-padel', width: 1200, height: 900 },
  { id: 'photo-hall', width: 1200, height: 900 }
]
const fillPlanFor = (args) =>
  agentFillPlan({ ...args, contentMapFor: () => CONTENT_MAP, cardNames: CARD_NAMES })

function fixture(sourceBytes) {
  const sha = createHash('sha256').update(sourceBytes).digest('hex')
  const media = PHOTOS.map((p) => ({
    ...p,
    sha256: sha,
    kind: 'image',
    mime: 'image/jpeg',
    source: 'website'
  }))
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-29T00:00:00Z',
    read: {
      profile: { name: 'Quay Street Boxing Studio' },
      media,
      rawSources: [{ id: 'source-1', source: 'website', collected: { pages: [] } }],
      posts: []
    }
  })
  const structure = {
    contract: { slots: CONTENT_MAP.slots.map((s) => ({ ...s, current: s.sample })) },
    pages: [{ route: '/', count: 1, publication: 'published' }],
    inventory: { version: 'agent-demo-native/1', complete: true, records: [] }
  }
  const row = (slot, assetIds, extra = {}) => ({
    page: '/',
    section: 'classes',
    goal: 'Show the studio',
    sourceIds: ['source-1'],
    assetIds,
    target: { kind: 'contract', slot },
    operation: 'replace-image',
    verify: 'Read the picture back',
    ...extra
  })
  const plan = (rows) => ({
    version: AGENT_DEMO,
    researchHash: bundle.hash,
    structureHash: researchHash(structure),
    structure,
    rows
  })
  const choice = {
    cms: 'joomla',
    template: { design: 't', quickstart: 'tag', version: '1' },
    quickstartWorkflow: AGENT_DEMO
  }
  const brief = { agentDemoSnapshot: bundle, reading: READING, assets: ASSETS }
  const build = {
    id: 'build',
    account_id: 'account',
    cms: 'joomla',
    template: choice.template,
    asset_manifest: media,
    brief,
    choice,
    revision_id: 'revision',
    site_key: 'site.test',
    action_id: 'action',
    action_status: 'queued',
    request_id: 'request',
    label: 'site',
    state: 'done',
    qa: { baseline: { cssRules: {}, imageFrames: [] } },
    content: { agentDemo: { structure, structureHash: researchHash(structure) } },
    handoff: {}
  }
  const pool = {
    async query(sql, args) {
      if (sql.includes('join wo_demo_action a')) return { rows: [build] }
      if (sql.includes('from wo_media'))
        return { rows: media.map((m) => ({ ...m, object_key: 'private/frozen', bytes: sourceBytes.length })) }
      if (sql.startsWith('update wo_build set handoff=jsonb_set')) {
        build.content.agentDemo.imports[args[1]] = JSON.parse(args[3])
        return { rows: [] }
      }
      if (sql.startsWith('update wo_build set content=jsonb_set(content,array[')) return { rows: [] }
      if (sql.includes("'{agentDemo,imports}'")) {
        build.content.agentDemo.imports ??= {}
        build.content.agentDemo.imports[args[1]] = JSON.parse(args[2])
        return { rows: [{ id: 'build' }] }
      }
      if (sql.startsWith('update wo_build set content=jsonb_set')) {
        build.content.agentDemo = JSON.parse(args[1])
        return { rows: [{ id: 'build' }] }
      }
      throw new Error(`Unexpected test SQL: ${sql}`)
    }
  }
  const service = agentDemoCapabilities({
    pool,
    objects: { get: async () => new Response(sourceBytes) },
    inventoryInvariant,
    fillPlanFor
  })
  return { bundle, build, row, plan, service, sha }
}

const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
const jpeg = () =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: '#4a6b8a' } })
    .jpeg()
    .toBuffer()

test("plan.save holds each contract picture slot to the fill plan's photo, and a substitute slot to none", async () => {
  const { row, plan, service } = fixture(await jpeg())
  // The agent's own choice for the padel card is refused with the planned photo named.
  await assert.rejects(
    service.call(auth, { operation: 'plan.save', plan: plan([row('module-2.0', ['photo-hall'])]) }),
    (error) => error.detail.issues.some((i) => /fill plan puts photo photo-padel/.test(i.message))
  )
  // A brief photo in the coach slot (no portrait of Wren) is refused too.
  await assert.rejects(
    service.call(auth, { operation: 'plan.save', plan: plan([row('module-3.0', ['photo-hall'])]) }),
    (error) => error.detail.issues.some((i) => /No brief photo goes in this slot/.test(i.message))
  )
  const saved = await service.call(auth, {
    operation: 'plan.save',
    plan: plan([row('module-2.0', ['photo-padel']), row('module-3.0', [])])
  })
  assert.equal(saved.ok, true)
})

test('media.import imports only the planned photo and draws the coach initials for the substitute slot', async () => {
  const { row, plan, service, build } = fixture(await jpeg())
  await service.call(auth, {
    operation: 'plan.save',
    plan: plan([row('module-2.0', ['photo-padel']), row('module-3.0', [])])
  })
  const uploads = []
  const upload = async ({ params }) => {
    const meta = await sharp(Buffer.from(params.content_b64, 'base64')).metadata()
    uploads.push({ path: params.path, width: meta.width, height: meta.height })
    return { status: 200, body: { ok: true } }
  }
  const photo = await service.call(
    auth,
    { operation: 'media.import', assetId: 'photo-padel', rowIndex: 0 },
    { upload }
  )
  assert.equal(photo.assetId, 'photo-padel')
  assert.ok(Math.abs(uploads[0].width / uploads[0].height - 4 / 3) <= 0.01)
  const avatar = await service.call(auth, { operation: 'media.import', rowIndex: 1 }, { upload })
  assert.deepEqual([avatar.assetId, avatar.substitute, avatar.reason], [null, 'avatar', 'no-portrait'])
  assert.deepEqual([uploads[1].width, uploads[1].height], [300, 300])
  // A plan changed under the validator still cannot carry another photo into the planned card.
  build.content.agentDemo.plan.rows[0] = row('module-2.0', ['photo-hall'])
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'photo-hall', rowIndex: 0 }, { upload }),
    /AGENT_DEMO_FILL_PLAN_PHOTO/
  )
})

test("the QA evidence names the offering the fill plan bound the card to; the agent reads the plan's decisions", async () => {
  const { row, plan, service, build } = fixture(await jpeg())
  const read = await service.call(auth, { operation: 'plan.read' })
  assert.deepEqual(
    read.fillPlan.slots.map((s) => [s.slot, s.action, s.photo ?? null]),
    [
      ['module-2.0', 'photo', 'photo-padel'],
      ['module-3.0', 'substitute', null]
    ]
  )
  await service.call(auth, { operation: 'plan.save', plan: plan([row('module-2.0', ['photo-padel'])]) })
  await service.call(
    auth,
    { operation: 'media.import', assetId: 'photo-padel', rowIndex: 0 },
    { upload: async () => ({ status: 200, body: { ok: true } }) }
  )
  const { placedSlots } = slotPhotoEvidence({ brief: build.brief }, build)
  assert.deepEqual(Object.values(placedSlots), [
    {
      photo: 'photo-padel',
      slot: 'module-2.0',
      role: 'offering.image',
      group: 'service',
      offering: 'svc-padel'
    }
  ])
})

test('a release without a version 3 map keeps the agent free to choose, as before; with one, a photo carries its shown width', async () => {
  const sizes = new Map(PHOTOS.map((p) => [p.id, p]))
  const revision = { brief: { assets: ASSETS, reading: READING }, template: {} }
  assert.equal(await agentFillPlan({ revision, sizes, contentMapFor: () => ({ slots: [] }) }), null)
  // With one, a planned photo carries the width its slot is shown at on the desktop: the bar its crop is cut against.
  const fill = await fillPlanFor({ revision, sizes })
  assert.equal(fill.slots.find((s) => s.key === 'module-2.0').minWidth, 400)
  assert.equal(typeof validateAgentPlan, 'function')
})
