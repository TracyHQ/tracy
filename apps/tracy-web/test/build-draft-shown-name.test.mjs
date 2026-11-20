// A business name the owner asked to keep off the site must not become the site's label, its public subdomain or the
// title of the hand off to the site chat (#610). Every name here is invented.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-shown-name.test.mjs
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-shown-name.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { draftSiteStarter } from '../src/build-draft-build-wiring.js'
import { keepDescriptionOut } from '../src/build-draft/description-guard.js'
import { handOffBuild } from '../src/build-draft/handoff-door.js'
import { createDraft } from '../src/build-draft/store.js'
import { draftBuildName, shownBuildNameOf, shownBuildPlanOf } from '../src/lib/draft-build.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'
import { OWNER, config, kits } from './build-draft-engine-fixtures.mjs'

const HELD = 'Zorvane Hollow Studio'
const SHOWN = 'Hollow Pottery Dubai'

const plan = (value = HELD) => ({
  id: 'plan-x',
  revision: 1,
  pages: [{ id: 'home', blocks: [{ id: 'hero', data: ['business-name', 'service-a'] }] }],
  items: [{ id: 'service-a', kind: 'service', label: 'Clay classes' }],
  facts: [{ id: 'business-name', kind: 'business.name', label: 'Business name', value }]
})
const profile = (withheld) => ({
  sources: [{ id: 'src-1', origin: 'website' }],
  // As the plan step reads it, a held name goes by its site name answer.
  facts: { 'business.name': [{ value: withheld?.siteName ?? HELD, sources: ['src-1'] }] },
  items: {},
  ...(withheld ? { withheld } : {})
})
// The research of a draft that keeps the name off the site: the held name is still in its record.
const research = (withheld) => ({
  withheld,
  profile: profile(null),
  brief: { business: { name: HELD } }
})
const snapshot = ({ value = HELD, withheld, profileWithheld = withheld } = {}) => ({
  plan: plan(value),
  profile: profile(profileWithheld),
  research: research(withheld)
})

test('a held name with a site name answer: the site name answer is the name, never the held one', () => {
  const held = { name: true, siteName: SHOWN, names: [HELD], heldNames: [HELD] }
  assert.equal(shownBuildNameOf(snapshot({ withheld: held })), SHOWN)
  // Research only (no `names` yet): the held name is read from the record.
  const early = { name: true, siteName: SHOWN }
  assert.equal(shownBuildNameOf({ ...snapshot({ withheld: early }), profile: null }), SHOWN)
})

test('a held name with no site name answer: no name at all, so the caller goes by its neutral fallback', () => {
  assert.equal(shownBuildNameOf(snapshot({ withheld: { name: true, names: [HELD] } })), null)
  assert.equal(shownBuildNameOf({ ...snapshot({ withheld: { name: true } }), profile: null }), null)
})

test('a name nothing holds off is the plan fact as before', () => {
  assert.equal(shownBuildNameOf(snapshot({ withheld: undefined, value: ' Plain Name ' })), 'Plain Name')
  assert.equal(shownBuildNameOf({ plan: { facts: [] } }), null)
  // The owner chose to show the held name: the name leaves the hidden list and is the answer.
  const chosen = { name: true, siteName: HELD, names: [], heldNames: [HELD] }
  assert.equal(shownBuildNameOf(snapshot({ withheld: chosen })), HELD)
})

test('the plan a reader outside the gate sees carries the shown name, or none, and no held id', () => {
  const held = { name: true, siteName: SHOWN, names: [HELD], heldNames: [HELD] }
  const shown = shownBuildPlanOf(snapshot({ withheld: held }))
  assert.equal(shown.facts[0].value, SHOWN)
  assert.equal(JSON.stringify(shown).includes(HELD), false)
  const none = shownBuildPlanOf(snapshot({ withheld: { name: true, names: [HELD] } }))
  assert.deepEqual(none.facts, [])
  assert.equal(JSON.stringify(none).includes(HELD), false)
  assert.deepEqual(none.pages[0].blocks[0].data, ['service-a'])
})

test('the description guard never writes a held name into the page copy it leaves', () => {
  const sentence = 'We shape every bowl by hand in our small Dubai workshop.'
  const brief = (held) => ({
    business: { name: HELD },
    facts: [{ field: 'name', onSite: held ? false : true }],
    sitemap: [
      {
        slug: 'home',
        seo: { title: 'Pottery studio in Dubai' },
        sections: [{ kind: 'hero', copy: sentence }]
      }
    ]
  })
  const open = brief(false)
  keepDescriptionOut(open, sentence)
  assert.equal(open.sitemap[0].sections[0].copy, `${HELD}.`)
  const held = brief(true)
  keepDescriptionOut(held, sentence)
  assert.equal(JSON.stringify(held.sitemap).includes(HELD), false)
  assert.equal(held.sitemap[0].sections[0].copy, 'Pottery studio in Dubai.')
})

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** A draft whose ended, done build holds `snap`, as the create door and the hand off read it. */
async function builtDraft(snap) {
  const { id: accountId } = await ensureAccount(db.pool, OWNER)
  const { draft } = await createDraft(db.pool, accountId)
  const build = {
    id: 'build-1',
    plan: { id: 'plan-x', revision: 1 },
    approvedAt: new Date().toISOString(),
    snapshot: snap,
    site: { siteKey: 'site-1.localhost' },
    endedAt: new Date().toISOString(),
    result: 'done'
  }
  await db.pool.query('update build_draft set build = $2::jsonb where account_id = $1', [
    accountId,
    JSON.stringify(build)
  ])
  return { accountId, draftId: draft.id, build }
}
const held = { name: true, siteName: SHOWN, names: [HELD], heldNames: [HELD] }

test('the run frame names the site by the shown name', opts, async () => {
  const { draftId } = await builtDraft(snapshot({ withheld: held }))
  assert.equal(await draftBuildName(db.pool, draftId), SHOWN)
})

test(
  'the site label and subdomain suggestion come from the shown name, a neutral one without it',
  opts,
  async () => {
    const labels = async (withheld) => {
      const { accountId, draftId, build } = await builtDraft(snapshot({ withheld }))
      await db.pool.query(`update build_draft set build = build - 'label' where account_id = $1`, [accountId])
      const asked = []
      const request = async (path, init) => {
        asked.push(JSON.parse(init.body))
        return new Response(JSON.stringify({ siteKey: 's.localhost', jobId: 'j' }), { status: 201 })
      }
      const withSite = {
        loadKit: (slug) => ({
          ...kits.loadKit(slug),
          // The kit's own AI quickstart release (ADR 0045), as this server read it: never the demo's release.
          site: { platform: 'joomla', quickstart: 'ai-quickstart/club/j6' }
        })
      }
      const releases = async () => [{ tag: 'ai-quickstart/club/j6', platform: 'joomla' }]
      const start = draftSiteStarter({ pool: db.pool, config, kits: withSite, request, releases })
      const plan = { ...build.snapshot.plan, look: { template: { slug: 'club' } } }
      await start({
        accountId,
        email: OWNER,
        draftId,
        build: { ...build, snapshot: { ...build.snapshot, plan } }
      })
      return asked[0].label
    }
    assert.match(await labels(held), /^hollow-pottery/)
    const none = await labels({ name: true, names: [HELD] })
    assert.doesNotMatch(none, /zorvane|hollow-studio/)
    assert.match(none, /^my-site/)
  }
)

test('the hand off names the site and carries the plan with the shown name only', opts, async () => {
  const { accountId } = await builtDraft(snapshot({ withheld: held }))
  const sent = []
  const out = await handOffBuild({
    pool: db.pool,
    accountId,
    email: OWNER,
    body: { conversation: [{ role: 'user', text: 'Build my pottery site.' }] },
    openSiteChat: async () => 'session-1',
    promptSiteChat: async (m) => {
      sent.push(m.text)
      return true
    }
  })
  assert.match(out.next, /session-1/)
  assert.equal(sent[0].includes(HELD), false)
  assert.ok(sent[0].includes(SHOWN))
  assert.equal(JSON.parse(sent[0].split('\n')[1]).site.name, SHOWN)
})
