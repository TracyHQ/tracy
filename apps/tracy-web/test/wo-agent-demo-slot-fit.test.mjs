// Slot fit, wave 1, on the agent demo path: a collected photo takes a template picture's place only cut to that
// place's frame, and never the place of a picture the template keeps (an icon, an avatar strip, a cut-out, a kept slot).
// Everything here is made up: a fictional boxing gym, fictional files and fictional photo sizes.
import sharp from 'sharp'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { inventoryInvariant } from '../src/sites/agent-demo-inventory.js'
import {
  AGENT_DEMO,
  agentDemoCapabilities,
  agentDemoPrompt,
  agentPlanGuide,
  freezeAgentResearch,
  researchHash,
  validateAgentPlan as validateUnwired
} from '../src/opportunities-build/agent-demo.js'
import { keptPictures } from '../src/opportunities-build/agent-demo-slot-fit.js'

const validateAgentPlan = (plan, bundle, options = {}) =>
  validateUnwired(plan, bundle, { inventoryInvariant, ...options })

const joomla = (file, w, h) =>
  `images/demo/${file}#joomlaImage://local-images/demo/${file}?width=${w}&height=${h}`
/** The fictional template's picture slots, as a Joomla contract inspect lists them. */
const SLOTS = [
  {
    key: 'module-20.0',
    type: 'image',
    label: 'Our Classes / intro',
    current: joomla('classes/intro-1.jpg', 1128, 484)
  },
  {
    key: 'module-21.0',
    type: 'image',
    label: 'Coaches / img',
    current: joomla('team/coach-1.jpg', 573, 574)
  },
  {
    key: 'module-22.4',
    type: 'image',
    label: 'The workout / img-icon',
    customize: 'keep',
    current: joomla('icons/icon-dark-1.png', 100, 100)
  },
  {
    key: 'module-23.1',
    type: 'image',
    label: 'Our Classes / top-desc',
    customize: 'keep',
    current: 'images/demo/others/avatar-1.png'
  },
  {
    key: 'module-24.1',
    type: 'image',
    label: 'Hero / image-main',
    current: joomla('hero/fighter.png', 1175, 960)
  }
]
/** The demo's boxes as the QA baseline measured them, before the agent's turn. */
const BASELINE = {
  cssRules: {},
  imageFrames: [
    {
      path: 'images/demo/classes/intro-1.jpg',
      width: 704,
      height: 302,
      route: '/',
      selector: 'div.intro > img'
    },
    {
      path: 'images/demo/team/coach-1.jpg',
      width: 350,
      height: 351,
      route: '/',
      selector: 'div.coach > img'
    },
    {
      path: 'images/demo/icons/icon-dark-1.png',
      width: 100,
      height: 100,
      route: '/',
      selector: 'div.icon > img'
    }
  ]
}
/** The fictional gym's photos: two phone portraits, one wide, one square. */
const PHOTOS = [
  { id: 'photo-portrait', width: 360, height: 640 },
  { id: 'photo-tall', width: 1320, height: 2325 },
  { id: 'photo-wide', width: 1600, height: 800 },
  { id: 'photo-square', width: 1080, height: 1080 }
]

function fixture(sourceBytes = Buffer.from('frozen picture')) {
  const sha = createHash('sha256').update(sourceBytes).digest('hex')
  const media = PHOTOS.map((p) => ({
    ...p,
    sha256: sha,
    kind: 'image',
    mime: 'image/jpeg',
    source: 'instagram',
    sourceUrl: `https://example.test/harbor-lane-boxing/${p.id}`
  }))
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-27T00:00:00Z',
    read: {
      profile: { name: 'Harbor Lane Boxing Club' },
      media,
      rawSources: [
        { id: 'source-1', source: 'instagram', collected: { posts: [{ text: 'Open sparring on Fridays' }] } }
      ],
      posts: []
    }
  })
  const structure = {
    contract: { slots: SLOTS },
    pages: [{ route: '/', count: 1, publication: 'published' }],
    inventory: { version: 'agent-demo-native/1', complete: true, records: [] }
  }
  const row = (slot, assetIds, extra = {}) => ({
    page: '/',
    section: 'classes',
    goal: 'Show the gym',
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
  const revision = {
    id: 'revision',
    account_id: 'account',
    cms: 'joomla',
    template: choice.template,
    asset_manifest: media,
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle }
  }
  const build = {
    ...revision,
    brief: { agentDemoSnapshot: bundle },
    choice,
    id: 'build',
    revision_id: 'revision',
    site_key: 'site.test',
    action_id: 'action',
    action_status: 'queued',
    request_id: 'request',
    label: 'site',
    state: 'done',
    qa: { baseline: BASELINE },
    content: { agentDemo: { structure, structureHash: researchHash(structure) } },
    handoff: {}
  }
  const pool = {
    async query(sql, args) {
      if (sql.startsWith('select id,session_id,selection from wo_demo_action'))
        return { rows: [{ id: 'action' }] }
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
  return { bundle, build, pool, row, plan, sha }
}

const issuesOf = (plan, bundle) => {
  try {
    validateAgentPlan(plan, bundle, { baseline: BASELINE })
    return []
  } catch (error) {
    return (error.detail?.issues ?? [{ message: error.message }]).map((i) => i.message)
  }
}

test('no photo replaces an icon, an avatar strip, a kept slot or a cut-out: each row is sent back to retain', () => {
  const { bundle, row, plan } = fixture()
  for (const slot of ['module-22.4', 'module-23.1', 'module-24.1']) {
    const issues = issuesOf(plan([row(slot, ['photo-square'])]), bundle)
    assert.equal(issues.length, 1, slot)
    assert.match(issues[0], /no collected photo replaces it.*retain/)
  }
  // The same rows kept as the template drew them pass.
  assert.deepEqual(
    issuesOf(
      plan([row('module-22.4', [], { operation: 'retain' }), row('module-20.0', ['photo-wide'])]),
      bundle
    ),
    []
  )
})

test('a phone portrait never goes into a wide class card; the plan names the photo that fits', () => {
  const { bundle, row, plan } = fixture()
  const issues = issuesOf(plan([row('module-20.0', ['photo-portrait', 'photo-tall'])]), bundle)
  assert.equal(issues.length, 1)
  assert.match(issues[0], /704×302/)
  assert.match(issues[0], /retain/)
  assert.match(issues[0], /photo-wide/)
  assert.doesNotMatch(issues[0], /photo-portrait|photo-tall/)
  assert.deepEqual(issuesOf(plan([row('module-20.0', ['photo-wide'])]), bundle), [])
})

test("a crop of another shape than the frame's is refused; the frame's own shape passes", () => {
  const { bundle, row, plan } = fixture()
  const image = (aspect, output) => ({
    assetId: 'photo-square',
    crop: { aspect, source: { width: 1080, height: 1080 }, output, strategy: 'attention' }
  })
  const wrong = issuesOf(
    plan([row('module-21.0', ['photo-square'], { image: image('16/9', { width: 1072, height: 603 }) })]),
    bundle
  )
  assert.equal(wrong.length, 1)
  assert.match(wrong[0], /would change its shape/)
  assert.deepEqual(
    issuesOf(
      plan([row('module-21.0', ['photo-square'], { image: image('350/351', { width: 350, height: 351 }) })]),
      bundle
    ),
    []
  )
})

test('media.import cuts the photo to the frame the baseline measured, with no recipe from the agent', async () => {
  const wide = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#4a6b8a' } })
    .jpeg()
    .toBuffer()
  const { pool, row, plan } = fixture(wide)
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(wide) } })
  await service.call(auth, { operation: 'plan.save', plan: plan([row('module-20.0', ['photo-wide'])]) })
  let shape = null
  const upload = async ({ params }) => {
    const meta = await sharp(Buffer.from(params.content_b64, 'base64')).metadata()
    shape = { width: meta.width, height: meta.height }
    return { status: 200, body: { ok: true } }
  }
  const result = await service.call(
    auth,
    { operation: 'media.import', assetId: 'photo-wide', rowIndex: 0 },
    { upload }
  )
  assert.ok(Math.abs(shape.width / shape.height - 704 / 302) <= 0.005, `${shape.width}×${shape.height}`)
  assert.ok(shape.width <= 1600 && shape.height <= 800)
  assert.equal(result.derivative.parentAssetId, 'photo-wide')
})

test('media.import refuses a photo the frame cannot take and a row aimed at a kept picture', async () => {
  const tall = await sharp({ create: { width: 360, height: 640, channels: 3, background: '#8a4a4a' } })
    .jpeg()
    .toBuffer()
  const { pool, row, plan, build } = fixture(tall)
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(tall) } })
  await service.call(auth, { operation: 'plan.save', plan: plan([row('module-21.0', ['photo-square'])]) })
  const upload = async () => {
    throw new Error('nothing is uploaded')
  }
  // A plan saved before Slot fit, or changed under the validator, still cannot carry a portrait into the wide card.
  build.content.agentDemo.plan.rows = [
    row('module-20.0', ['photo-portrait']),
    row('module-22.4', ['photo-portrait'])
  ]
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'photo-portrait', rowIndex: 0 }, { upload }),
    /AGENT_DEMO_IMAGE_DOES_NOT_FIT/
  )
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'photo-portrait', rowIndex: 1 }, { upload }),
    /AGENT_DEMO_SLOT_PROTECTED/
  )
})

test('the kept pictures the QA lets stay: the icon, the avatar strip and the cut-out, never a photo frame', () => {
  const { build } = fixture()
  const kept = keptPictures(build.content.agentDemo.structure, BASELINE)
  assert.deepEqual(
    kept.map((k) => [k.file, k.kind]),
    [
      ['images/demo/icons/icon-dark-1.png', 'keep'],
      ['images/demo/others/avatar-1.png', 'keep'],
      ['images/demo/hero/fighter.png', 'cutout']
    ]
  )
})

test('the prompt and the plan guide put photos only where they fit, and keep the pictures the template keeps', () => {
  const { bundle, build } = fixture()
  const prompt = agentDemoPrompt({
    ...build,
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle }
  })
  const rules = agentPlanGuide(bundle, build.content.agentDemo.structure).rules.join('\n')
  for (const text of [prompt, rules]) {
    assert.doesNotMatch(text, /in place of every template photo/)
    assert.doesNotMatch(
      text,
      /Everything collected goes on the site: a row citing part:reviews for at least one review \(or an unplaced entry\), and replace-image rows for the place’s own photos with home first\./
    )
  }
  assert.match(prompt, /icons/i)
  assert.match(prompt, /avatar/)
  assert.match(prompt, /keeps the template's picture/)
})
