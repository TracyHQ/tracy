import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import { loadQualityPreparation, prepareQualityRun } from '../src/opportunities-build/quality-preparation.js'
import { randomUUID } from 'node:crypto'
import {
  createRevision,
  currentResearchKey,
  freezeDemoResearchInput,
  revisionForAction
} from '../src/opportunities-build/revisions.js'
import { savePreference } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** A demo action of the world's opportunity: the build chooses the CMS and template, never the brief. */
const actionOf = (args, selection = null) => ({
  id: randomUUID(),
  account_id: args.accountId,
  opportunity_id: args.opportunityId,
  revision_id: randomUUID(),
  build_request_id: randomUUID(),
  selection
})
const throughAction = (args, action, extra = {}) =>
  revisionForAction(db.pool, {
    action,
    domain: args.domain,
    templates: async () => args.templates.cards,
    ops: args.ops,
    ...extra
  })
async function world() {
  const account = (
    await db.pool.query("insert into account(email)values('quality-revision@example.test') returning id")
  ).rows[0]
  const opp = (
    await db.pool.query(
      "insert into wo_opportunity(account_id,name,provider,provider_id,candidate)values($1,'Synthetic cafe','url','https://synthetic.invalid','{}')returning id",
      [account.id]
    )
  ).rows[0]
  const domain = await websiteOpportunitiesDomain()
  return {
    accountId: account.id,
    opportunityId: opp.id,
    domain,
    ops: { defaultCms: 'emdash' },
    templates: {
      cards: [
        {
          id: 'business',
          platforms: [
            { platform: 'emdash', tag: 'synthetic/emdash', version: '1.0.0' },
            { platform: 'wordpress', tag: 'synthetic/wp', version: '1.0.0' }
          ]
        }
      ]
    }
  }
}
test(
  'model work holds no preference lock, and settings changed in flight only reach the next build',
  opts,
  async () => {
    const args = await world()
    let frozen
    const made = await throughAction(args, actionOf(args), {
      editorial: async (input) => {
        frozen = structuredClone(input)
        // This takes the exclusive counterpart of a shared preference lock. If prepare kept its
        // transaction open across model work, this operation would deadlock.
        await savePreference(db.pool, args.accountId, 'wordpress')
        return {
          frozenHash: qualityHash(input),
          reference: { mode: 'shadow', state: 'needs-attention' },
          markdown: '# Frozen editorial evidence'
        }
      }
    })
    assert.equal(made.revision.cms, 'emdash')
    assert.equal(made.revision.template.quickstart, 'synthetic/emdash')
    assert.equal(made.revision.brief.editorial.mode, 'shadow')
    // quality-v1 keeps its one build's view and its editorial markdown (a known exception, 24/10/2026).
    assert.match(made.revision.brief_md, /# Frozen editorial evidence/)
    assert.equal(frozen.account_id, args.accountId)
    assert.equal((await throughAction(args, actionOf(args))).revision.cms, 'wordpress')
  }
)

test('wrong finalize hash and a failed model call leave no partial revision', opts, async () => {
  const args = await world()
  await assert.rejects(
    createRevision(db.pool, { ...args, editorial: async () => ({ frozenHash: 'changed' }) }),
    /QUALITY_FINALIZE_INPUT_CHANGED/
  )
  await assert.rejects(
    createRevision(db.pool, {
      ...args,
      editorial: async () => {
        throw new Error('model failed')
      }
    }),
    /model failed/
  )
  assert.equal((await db.pool.query('select count(*)::int as n from wo_revision')).rows[0].n, 0)
})

test(
  'restart finalizes the persisted preparation and refuses a different editorial reference on replay',
  opts,
  async () => {
    const args = await world(),
      revisionId = '00000000-0000-4000-8000-000000000099'
    let crash = true,
      first
    const editorial = async (frozen) => {
      const run = await prepareQualityRun(db.pool, {
        frozen,
        semanticInput: { opportunityId: args.opportunityId },
        manifest: { hash: 'manifest' },
        questions: { languages: ['en'] },
        models: { editorial: { hash: 'model' } },
        mode: 'apply',
        policy: { maxAttempts: 32, accountDailyCapCents: 50, maxRunMs: 172800000 }
      })
      first ??= frozen
      if (crash) throw new Error('Crash before provider dispatch')
      return {
        frozenHash: qualityHash(frozen),
        reference: { runId: run.id, frozenHash: qualityHash(frozen), planHash: 'validated' },
        markdown: 'Frozen plan'
      }
    }
    editorial.loadPrepared = async (identity) =>
      (await loadQualityPreparation(db.pool, identity))?.input.frozen
    await assert.rejects(createRevision(db.pool, { ...args, revisionId, editorial }), /Crash before/)
    await db.pool.query("update wo_opportunity set name='Changed live input' where id=$1", [
      args.opportunityId
    ])
    crash = false
    const made = await createRevision(db.pool, { ...args, revisionId, editorial })
    assert.equal(made.revision.brief.business.name, first.brief.business.name)
    assert.equal((await createRevision(db.pool, { ...args, revisionId, editorial })).revision.id, revisionId)
    const wrong = async (frozen) => ({
      frozenHash: qualityHash(frozen),
      reference: { planHash: 'other' },
      markdown: 'Changed'
    })
    wrong.loadPrepared = editorial.loadPrepared
    await assert.rejects(
      createRevision(db.pool, { ...args, revisionId, editorial: wrong }),
      /FINALIZE_REFERENCE_CHANGED/
    )
  }
)

test(
  'prepare freezes the account candidate overlay while later edits only reach the next input',
  opts,
  async () => {
    const args = await world()
    await db.pool.query('update wo_opportunity set candidate=$2 where id=$1', [
      args.opportunityId,
      { phone: '+1234567890', note: 'private source' }
    ])
    let frozen
    await createRevision(db.pool, {
      ...args,
      editorial: async (input) => {
        frozen = structuredClone(input)
        await db.pool.query('update wo_opportunity set candidate=$2 where id=$1', [
          args.opportunityId,
          { phone: '+1987654321' }
        ])
        return { frozenHash: qualityHash(input), reference: { mode: 'shadow' }, markdown: '' }
      }
    })
    assert.equal(frozen.overlay.candidate.phone, '+1234567890')
    assert.equal(frozen.overlay.candidate.note, 'private source')
    assert.equal(frozen.overlay.name, 'Synthetic cafe')
    assert.equal(
      (await db.pool.query('select candidate from wo_opportunity where id=$1', [args.opportunityId])).rows[0]
        .candidate.phone,
      '+1987654321'
    )
  }
)

test(
  'picture settings are frozen on each build before work starts, ordinary and editorial alike',
  opts,
  async () => {
    const args = await world()
    args.ops = {
      ...args.ops,
      visionEnabled: false,
      maxVisionPictures: 10,
      handoffMaxPictures: 6,
      missingHeroMode: 'real-only'
    }
    const first = await throughAction(args, actionOf(args))
    assert.equal(first.revision.brief.picturePolicy.visionEnabled, false)
    assert.equal(first.revision.brief.picturePolicy.handoffMaxPictures, 6)
    const second = await throughAction(args, actionOf(args), {
      editorial: async (frozen) => {
        assert.equal(frozen.brief.picturePolicy.maxVisionPictures, 10)
        args.ops.maxVisionPictures = 100
        args.ops.missingHeroMode = 'outpaint-and-scene'
        return { frozenHash: qualityHash(frozen), reference: { state: 'needs-attention' }, markdown: '' }
      }
    })
    assert.equal(second.revision.brief.picturePolicy.maxVisionPictures, 10)
    assert.equal(second.revision.brief.picturePolicy.missingHeroMode, 'real-only')
    // The next build reuses the first brief (same research) and reads the settings of its own time.
    const next = await throughAction(args, actionOf(args))
    assert.equal(next.revision.id, first.revision.id)
    assert.equal(next.revision.brief.picturePolicy.maxVisionPictures, 100)
    assert.equal(next.revision.brief.picturePolicy.missingHeroMode, 'outpaint-and-scene')
    // The editorial brief is never shared.
    assert.notEqual(second.revision.id, first.revision.id)
    assert.equal(second.revision.research_hash, null)
  }
)

test(
  'explicit demo CMS ignores account/default pins and freezes the chosen CMS release before models',
  opts,
  async () => {
    const args = await world()
    await savePreference(db.pool, args.accountId, 'emdash')
    const release = { version: '1.0.0', files: { source: { file: 'wp.zip', sha256: 'a'.repeat(64) } } }
    args.templates.cards[0].platforms[1].release = release
    args.ops = {
      defaultCms: 'emdash',
      pinnedTemplates: { wordpress: 'wrong/wp' },
      templatePinPolicy: 'strict'
    }
    const selection = {
      cms: 'wordpress',
      design: 'business',
      quickstart: 'synthetic/wp',
      version: '1.0.0',
      release
    }
    let seen
    const made = await throughAction(args, actionOf(args, selection), {
      editorial: async (frozen) => {
        seen = frozen
        return { frozenHash: qualityHash(frozen), reference: { mode: 'shadow' }, markdown: '# Evidence' }
      }
    })
    assert.equal(made.revision.cms, 'wordpress')
    assert.equal(seen.cms, 'wordpress')
    assert.equal(seen.template.quickstart, 'synthetic/wp')
    assert.deepEqual(seen.template.release, release)
    const stale = await throughAction(args, actionOf(args, { ...selection, version: '0.9.0' }))
    assert.equal(stale.error, 'TEMPLATE_VERSION_CHANGED')
    const replaced = await throughAction(
      args,
      actionOf(args, { ...selection, release: { ...release, files: {} } })
    )
    assert.equal(replaced.error, 'TEMPLATE_VERSION_CHANGED')
  }
)

test(
  'a demo’s frozen research and the Details read hash alike: its brief reads current until the research changes',
  opts,
  async () => {
    const args = await world()
    const selection = { cms: 'emdash', design: 'business', quickstart: 'synthetic/emdash', version: '1.0.0' }
    const researchInput = await freezeDemoResearchInput(db.pool, args.opportunityId, args.accountId)
    const made = await throughAction(
      args,
      actionOf(args, {
        ...selection,
        workflow: 'agent-demo/1',
        researchInput,
        snapshotAt: new Date().toISOString()
      })
    )
    const opp = async () =>
      (await db.pool.query('select * from wo_opportunity where id = $1', [args.opportunityId])).rows[0]
    assert.equal(await currentResearchKey(db.pool, await opp(), args.domain), made.revision.research_hash)
    // A second build of other choice reuses the brief: one brief, two demos.
    const other = await throughAction(
      args,
      actionOf(args, { ...selection, cms: 'wordpress', quickstart: 'synthetic/wp' })
    )
    assert.equal(other.revision.id, made.revision.id)
    assert.equal(other.revision.cms, 'wordpress')
    await db.pool.query("update wo_opportunity set name = 'Synthetic cafe renamed' where id = $1", [
      args.opportunityId
    ])
    assert.notEqual(await currentResearchKey(db.pool, await opp(), args.domain), made.revision.research_hash)
    const next = await throughAction(args, actionOf(args, selection))
    assert.notEqual(next.revision.id, made.revision.id)
  }
)
