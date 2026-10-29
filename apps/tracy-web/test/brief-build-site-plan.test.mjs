// Acceptance of ticket TracyHQ/tracy#191 (spec #189): the Build button's own request reaches the Customize engine with the
// site plan, and the demo-leftover check's findings reach the hand-off report. It starts at the Build button's request
// (the client's `api.buildDemo`, as the button sends it) through the real build door and demo runner; the create door, the
// served pages and the site's module list are stand-ins, as in the demo runner's own tests. The bakery is made up.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { createApi } from '../../../packages/site/tracy-website-opportunities/src/client/api.ts'
import { createDemoRunner } from '../src/opportunities-build/demo-runner.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { createWebsiteBuilder } from '../src/opportunities-build/route.js'
import { createSiteContent } from '../src/opportunities-build/site-content.js'
import { planContactSteps } from '../src/sites/brief-engines/joomla-plan-contacts.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const READY = { version: 'brief-readiness/1', verdict: 'pass', next: 'build', checks: [], ownerQuestions: [] }
const EMAIL = 'owner@copperleaf.example'
const SITE = 'copperleaf.localhost'
const CARD = {
  id: 'tracy-cafe',
  label: 'Tracy Cafe',
  platforms: [{ platform: 'joomla', tag: 'tracy-cafe/j6', version: '1.0.0' }]
}
/** The business facts research found: a made-up bakery. */
const BAKERY = {
  business: {
    name: 'Copperleaf Bakery',
    phone: '+44 20 7946 0321',
    email: 'hello@copperleaf.example',
    address: '14 Mill Lane, Ashby Vale'
  },
  contact: { whatsapp: { number: '+447700901111' } }
}
/** A trimmed content map of the made-up template: its footer's demo mailbox. */
const CONTENT_MAP = {
  entities: [{ key: 'module-5', kind: 'module' }],
  pages: [],
  slots: [
    {
      key: 'module-5.0',
      entity: 'module-5',
      type: 'text',
      role: 'contact.email',
      sample: 'orders@cafedemo.example'
    }
  ]
}

test(
  'the Build button sends a brief build that reaches the engine with the site plan, and the check’s findings reach the hand-off',
  opts,
  async () => {
    const pool = db.pool
    const account = (await pool.query('insert into account(email) values ($1) returning id', [EMAIL])).rows[0]
      .id
    const opportunity = (
      await pool.query(
        `insert into wo_opportunity(account_id,name,provider,provider_id,candidate)
         values ($1,'Copperleaf Bakery','url','https://copperleaf.example','{}') returning id`,
        [account]
      )
    ).rows[0].id
    await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'r1', 'completed')`,
      [account, opportunity]
    )
    const measured = await websiteOpportunitiesDomain()
    const domain = { ...measured, briefReadinessOf: () => structuredClone(READY) }
    let at = Date.parse('2026-10-29T08:00:00.000Z')
    const created = []
    const sent = []
    const turns = []
    // The create door, the questions door and the job door, as the server's own answer them.
    const request = async (path, init = {}) => {
      if (path === '/api/templates') return Response.json({ templates: [CARD] })
      if (path.startsWith('/api/sites/questions?'))
        return Response.json({
          set: { contentHash: 'c'.repeat(64) },
          questions: [
            { id: 'name', kind: 'text' },
            { id: 'about', kind: 'longtext' },
            {
              id: 'pages',
              kind: 'multi',
              feeds: ['site.pages'],
              options: ['home', 'about', 'about/contact-us', 'menu', 'pages/elements'],
              locked: ['home']
            }
          ]
        })
      if (path === '/api/sites') {
        const body = JSON.parse(init.body)
        created.push(body)
        await pool.query(
          `insert into site(site_key,label,platform,host,address) values ($1,'copperleaf','joomla','local','https://copperleaf.localhost')
           on conflict do nothing`,
          [SITE]
        )
        await pool.query(
          `insert into site_creation(account_id,build_id,payload_hash,state,site_key,job_id)
           values ($1,$2,'hash','done',$3,'job-1') on conflict do nothing`,
          [account, body.buildId, SITE]
        )
        await pool.query(
          `insert into site_brief(site_key,account_id,platform,brief,state) values ($1,$2,'joomla','{}','applied')
           on conflict (site_key) do nothing`,
          [SITE, account]
        )
        return Response.json({ siteKey: SITE, jobId: 'job-1' }, { status: 201 })
      }
      if (path.includes('/jobs/')) return Response.json({ state: 'done' })
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
    }
    // The pages the built site serves: its footer still shows the template's demo mailbox.
    const served = {
      '/': '<html><body><h1>Copperleaf Bakery</h1><footer>orders@cafedemo.example</footer></body></html>'
    }
    const deps = {
      pool,
      config: { origin: 'http://localhost', siteDomain: 'localhost', sessionSecret: 's'.repeat(32) },
      request,
      loadDomain: async () => domain,
      // The revision research made, with the bakery's facts (this world has no research to read them from).
      revisionForAction: async (p, args) => {
        const made = await revisionForAction(p, args)
        if (made.revision) made.revision.brief = { ...made.revision.brief, ...structuredClone(BAKERY) }
        return made
      },
      runtime: async () => ({ settings: DEFAULT_WO_OPS_SETTINGS }),
      switchOn: async () => true,
      objects: { get: async () => null },
      now: () => at,
      contentMapOf: () => CONTENT_MAP,
      readSitePage: async (_site, path) =>
        served[path] ? { status: 200, html: served[path] } : { status: 404, html: '<h1>Not found</h1>' },
      prepareDemoContact: async () => ({ ok: true }),
      checkDemoGrant: async () => true,
      sessionAhead: async (_site, _email, id) => id,
      demoQa: async () => ({
        ok: true,
        status: 200,
        body: {
          baseline: { cssRules: {}, pictures: {}, texts: [], read: ['/'], unread: [] },
          checks: [{ id: 'pages-load', pass: true, measured: '1/1' }],
          pages: ['/']
        }
      }),
      // Every prompt any chat on the site is sent: a brief build sends no build hand-off prompt (#191, #197).
      prompt: async (...args) => {
        sent.push(args)
        return true
      },
      // The one bounded cleanup turn the check's findings get (#197), as its port is called.
      cleanupTurn: async (turn) => {
        turns.push(turn)
        return { state: 'completed' }
      },
      log: { warn() {}, error() {} }
    }

    // 1. The Build button's own request, through the real build door.
    const builder = createWebsiteBuilder({ ...deps, templateCards: async () => ({ cards: [CARD] }) })
    const app = new Hono()
    builder.routes(app, {
      caller: async () => ({ accountId: account }),
      refuse: (c, status, code, next, extra = {}) => c.json({ code, next, ...extra }, status),
      notFound: (c) => c.json({ code: 'NOT_FOUND' }, 404),
      featureOn: async () => true,
      featureOff: (c) => c.json({ code: 'FEATURE_OFF' }, 403),
      body: async (c) => c.req.json(),
      UUID: /^[0-9a-f-]{36}$/,
      REQUEST_ID: /^[A-Za-z0-9:_-]{8,200}$/
    })
    const api = createApi((url, init) => app.request(String(url), init))
    const pressed = await api.buildDemo(opportunity, 'press-build-1', undefined, {
      cms: 'joomla',
      design: 'tracy-cafe',
      quickstart: 'tracy-cafe/j6'
    })
    assert.equal(pressed.status, 202, JSON.stringify(pressed.body))

    // 2. The runner builds it: the create door gets the site plan's answers and every contact fact.
    const runner = () => createDemoRunner(deps)
    await runner().drain()
    for (let i = 0; i < 3; i++) {
      at += 11_000
      await pool.query('update wo_demo_action set next_at=$1', [new Date(at - 1)])
      await runner().drain()
    }
    assert.equal(created.length, 1)
    assert.ok(created[0].brief.answers.pages.includes('about/contact-us'), 'the Contact page is kept')
    assert.equal(created[0].brief.facts.whatsapp.value, '+447700901111')

    // 3. The engine reads the site plan through its own reader, and writes the contact lines from it.
    const woContent = createSiteContent({ pool })
    const plan = await woContent.sitePlanFor({ siteKey: SITE, email: EMAIL })
    assert.equal(plan.version, 'site-plan/1')
    assert.equal(plan.contact.phone.href, 'tel:+442079460321')
    assert.equal(plan.pages.find((p) => p.id === 'about/contact-us').decision, 'keep')
    const footer = '<p><a href="#">(555) 010-4477</a> orders@cafedemo.example</p>'
    const notes = []
    const { steps } = await planContactSteps({
      apply: async () => ({ ok: true, items: [{ id: 5, published: 1, language: '*', content: footer }] }),
      siteKey: SITE,
      ctx: { siteKey: SITE, email: EMAIL, note: (n) => notes.push(n) },
      woContent,
      visible: new Set(['en-GB'])
    })
    assert.equal(steps.length, 1)
    assert.match(steps[0].fields.content, /href="tel:\+442079460321"/)
    assert.match(steps[0].fields.content, /hello@copperleaf\.example/)
    assert.doesNotMatch(steps[0].fields.content, /cafedemo/)

    // 4. The demo-leftover check ran after the build, and its findings are in the hand-off report.
    const build = (await pool.query('select receipt, handoff from wo_build')).rows[0]
    assert.equal(build.receipt.leftovers.pass, false)
    const finding = build.receipt.leftovers.findings.find((f) => f.kind === 'C17')
    assert.deepEqual([finding.page, finding.place], ['/', 'module-5.0'])
    assert.ok(build.handoff?.leftovers?.findings.some((f) => f.kind === 'C17' && f.place === 'module-5.0'))

    // 5. The only agent turn is the bounded cleanup turn over those findings: no build hand-off prompt is sent.
    assert.equal(sent.length, 0, 'no hand-off prompt reaches any chat')
    assert.equal(build.handoff.prompt, undefined)
    assert.equal(build.handoff.promptSent, undefined)
    assert.equal(turns.length, 1)
    assert.match(turns[0].requestId, /^wo-cleanup:/)
    const action = (await pool.query('select status from wo_demo_action')).rows[0]
    assert.equal(action.status, 'completed')
  }
)
