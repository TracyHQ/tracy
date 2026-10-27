// The demo QA gate after a hand-off (`src/opportunities-build/demo-qa.js`): when a round runs (the hand-off
// chat's turn closed since the last one), what each outcome writes, the repair list sent into the chat,
// and that a demo which never passed is never `completed`. The host and the chat are fakes; the rows are
// real Postgres.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  BASELINE_MAX_TRIES,
  baselineTrust,
  briefOf,
  claimAndRunQa,
  contactPaths,
  failedQaHash,
  pagePlanMissing,
  placedPaths,
  QA_MAX_REPAIRS,
  qaOutcome,
  qaShape,
  repairPrompt,
  startDemoQa,
  sweepDemoQa,
  takeDueBaselines,
  wakeStuckRepairs
} from '../src/opportunities-build/demo-qa.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const CSS_FAIL = {
  id: 'css-intact',
  pass: false,
  measured: '1 stylesheet',
  expected: 'no template stylesheet loses a rule',
  detail: [
    { file: 'templates/ja_impact/css/template.css', problem: 'the browser reads 2223 of its 3701 rules' }
  ]
}
const PASS = { id: 'pages-load', pass: true, measured: '3/3', expected: 'every page loads', detail: [] }

test('failed QA identity excludes only its server acceptance marker and preserves all measured facts', () => {
  const qa = { state: 'failed', repairs: 2, baseline: { texts: ['Original'] }, rounds: [{ n: 3 }] }
  const hash = failedQaHash(qa)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.equal(
    failedQaHash({ rounds: [{ n: 3 }], baseline: { texts: ['Original'] }, repairs: 2, state: 'failed' }),
    hash
  )
  assert.equal(failedQaHash({ ...qa, acceptedRetry: { acceptedActionId: 'new-action' } }), hash)
  for (const changed of [
    { ...qa, repairs: 1 },
    { ...qa, baseline: { texts: ['Edited'] } },
    { ...qa, rounds: [{ n: 4 }] },
    { ...qa, retryActionId: 'different-attempt' },
    { ...qa, unrecognizedFact: true }
  ])
    assert.notEqual(failedQaHash(changed), hash)
  assert.deepEqual(qa, {
    state: 'failed',
    repairs: 2,
    baseline: { texts: ['Original'] },
    rounds: [{ n: 3 }]
  })
  assert.equal('acceptedRetry' in qaShape({ ...qa, acceptedRetry: { acceptedActionId: 'private' } }), false)
})

test('qaOutcome: all pass completes; a failure repairs twice, then needs a person — never completed', () => {
  assert.deepEqual(qaOutcome({ repairs: 0 }, [PASS]), {
    state: 'passed',
    handoffState: 'completed',
    repair: false
  })
  assert.equal(qaOutcome({ repairs: 0 }, [PASS, CSS_FAIL]).state, 'retry')
  assert.equal(qaOutcome({ repairs: QA_MAX_REPAIRS - 1 }, [CSS_FAIL]).state, 'retry')
  assert.deepEqual(qaOutcome({ repairs: QA_MAX_REPAIRS }, [CSS_FAIL]), {
    state: 'failed',
    handoffState: 'needs-review',
    repair: false
  })
})

test('repairPrompt: scope-locked, coordinates per failed check, and css-intact restores instead of repairing', () => {
  const text = repairPrompt({ failed: [CSS_FAIL], round: 1 })
  assert.match(text, /repair 1 of 2/)
  assert.match(text, /Fix ONLY the problems listed below/)
  assert.match(text, /do not compile LESS or SCSS/)
  assert.match(text, /Never delete, unpublish, hide or empty content/)
  assert.match(text, /Restore each stylesheet named below/)
  assert.match(text, /custom\.css only/)
  assert.doesNotMatch(text, /fix (the|its) syntax/i)
  assert.match(text, /templates\/ja_impact\/css\/template\.css/)
  const pictures = repairPrompt({
    failed: [
      {
        id: 'no-demo-pictures',
        expected: 'x',
        detail: [{ page: '/', file: 'images/joomlart/hero/chef.png' }]
      }
    ],
    round: 2
  })
  assert.match(pictures, /Never substitute an unrelated person/)
  assert.match(pictures, /page: \/; file: images\/joomlart\/hero\/chef\.png/)
})

test('placedPaths and briefOf: what Tracy placed is never demo; booking may leave only for verified links', () => {
  const build = {
    pictures: {
      plan: { placements: [{ groupId: 'images/joomlart/slide-1.jpg', mediaId: 'm1' }], unfilled: [] },
      receipts: {
        'images/joomlart/slide-1.jpg': { state: 'verified', path: 'images/tracy-content/aa.jpg' },
        'images/joomlart/x.jpg': { state: 'failed', path: 'images/tracy-content/bb.jpg' }
      }
    },
    handoff: { placed: { m2: 'images/tracy-content/cc.jpg' } }
  }
  assert.deepEqual(placedPaths(build), ['images/tracy-content/aa.jpg', 'images/tracy-content/cc.jpg'])
  const brief = briefOf({
    brief_md: '# Pho Ba',
    brief: {
      integrations: [
        { kind: 'booking', url: 'https://book.test/pho', verified: true },
        { kind: 'chat', url: 'https://zalo.me/1', verified: false }
      ]
    }
  })
  assert.deepEqual(brief.allowedCta, ['https://book.test/pho'])
  assert.match(brief.briefText, /# Pho Ba/)
})

test('briefOf: Google reviews are not facts — their words never reach the judge, the rest of the brief does', () => {
  const review = 'On the Thu Bồn River, between Old Town and the beach, with a wood-fired oven.'
  const brief = briefOf({
    // A revision stored before reviews left the markdown still has them there.
    brief_md: `# Opal Moon\n- Hours: "Monday: 2:00 – 10:00 PM"\n- Review summary: "Guests love the river view."\n- Reviews (quote verbatim with the author; never invent or edit one):\n\n> ${JSON.stringify(review)} — Roger H on Google (5/5)\n\n## Sitemap\n`,
    brief: {
      business: { name: 'Opal Moon', phone: '+84 300 000 063' },
      googlePlace: {
        placeId: 'p',
        summaries: { editorial: 'Riverside bistro.', reviews: 'Guests love the river view.' },
        reviews: [{ author: 'Roger H', rating: 5, text: review }]
      },
      integrations: []
    }
  })
  assert.doesNotMatch(brief.briefText, /Thu Bồn|wood-fired|Roger H|river view/)
  assert.match(brief.briefText, /Monday: 2:00 – 10:00 PM/)
  assert.match(brief.briefText, /\+84 300 000 063/)
  assert.match(brief.briefText, /Riverside bistro/)
  // Review text is separate from the fact corpus, with the real attribution for testimonials.
  assert.deepEqual(brief.googleReviews, [review, 'Guests love the river view.'])
  assert.deepEqual(brief.googleReviewTestimonials, [{ text: review, author: 'Roger H', url: null }])
})

test('pagePlanMissing: a page the build kept that the site does not reach fails PAGE_PLAN_MISSING; soft shapes; none without a plan', () => {
  const plan = {
    pages: [
      { id: 'homepage', role: 'home', keep: true },
      { slug: 'menu/simple-menu', keep: true },
      { path: '/events/', keep: true, reason: 'a page of the template' },
      { id: 'blog', keep: false, why: 'a sample page' },
      { id: 'about-us', keep: true }
    ]
  }
  const check = pagePlanMissing(plan, ['/', '/simple-menu', '/about-us/'])
  assert.equal(check.id, 'page-plan-in-nav')
  assert.equal(check.pass, false)
  assert.deepEqual(check.detail, [
    { code: 'PAGE_PLAN_MISSING', page: '/events/', reason: 'a page of the template' }
  ])
  // A bare id or slug is not a route (an EmDash page id may differ from its path): listed, never a failure.
  assert.deepEqual(check.unmatched, ['menu/simple-menu', 'about-us'])
  assert.equal(pagePlanMissing(plan.pages, ['/', '/events']).pass, true)
  assert.equal(pagePlanMissing([{ url: '/en/index.php/contact', keep: true }], ['/contact']).pass, true)
  assert.equal(pagePlanMissing([{ id: 'services_page', keep: true }], ['/']).pass, true)
  assert.equal(pagePlanMissing(null, ['/']), null)
  assert.equal(pagePlanMissing({ pages: [] }, ['/']), null)
})

/** An account, an opportunity, a revision, a site and a build handed over with a baseline. */
async function handedOver(
  pool,
  {
    state = 'pending',
    repairs = 0,
    since = new Date(Date.now() - 60_000),
    receipt = null,
    qa: extra = {},
    // The chat's acceptance of the hand-off prompt, recorded: the QA gate judges only after it.
    handoff = { state: 'ready', placed: {}, promptSent: { requestId: 'initial-prompt' } },
    key = 'phoba.localhost',
    makeSite = true
  } = {}
) {
  const account = (await pool.query(`insert into account (email) values ('a@tracy.test') returning id`))
    .rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Pho Ba', 'osm', 'n/1') returning id`,
      [account]
    )
  ).rows[0].id
  const rev = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1, $2, 1, $3::jsonb, 'Pho Ba, noodle soup')
       returning id`,
      [opp, account, JSON.stringify({ integrations: [] })]
    )
  ).rows[0].id
  if (makeSite)
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('phoba.localhost', 'phoba', 'local', 'joomla')`
    )
  const qa = {
    state,
    sessionId: 'session-1',
    by: 'a@tracy.test',
    since: since.toISOString(),
    repairs,
    errors: 0,
    rounds: [],
    baseline: {
      cssRules: { 't.css': { rules: 3701, sentinel: '.x{}', page: '/' } },
      pictures: { files: [], shas: [] },
      texts: []
    },
    pages: ['/', '/menu'],
    ...extra
  }
  const build = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state, handoff, qa, receipt, choice, choice_key)
       values ($1, $2, 'req-1', gen_random_uuid(), $6, 'done', $3::jsonb, $4::jsonb, $5::jsonb, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
      [account, rev, JSON.stringify(handoff), JSON.stringify(qa), receipt && JSON.stringify(receipt), key]
    )
  ).rows[0].id
  return { build, account, rev }
}

let turnNo = 0
const turn = async (pool, { state = 'closed', session = 'session-1', openedAt = new Date(), rpcId } = {}) => {
  const held = (
    await pool.query(
      "select id, qa from wo_build where site_key='phoba.localhost' order by created_at desc limit 1"
    )
  ).rows[0]
  const expected =
    held?.qa?.expectedRequestIds?.at(-1) ??
    (held?.qa?.state === 'retry' ? `wo-qa-${held.id}-${held.qa.repairs}` : 'initial-prompt')
  return pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, state, opened_at, closed_at, rpc_id)
     values ($1, 'phoba.localhost', $2, $3, 'a@tracy.test', 'build it', $4, $5, case when $4 = 'open' then null else now() end, $6)`,
    [`${session}:${++turnNo}`, session, turnNo, state, openedAt, rpcId ?? expected]
  )
}

/** A host that answers the given checks, and a chat that records what it was sent. */
function fakes(checks, { accepted = true, hostOk = true, nav = () => [] } = {}) {
  const asked = []
  const sent = []
  return {
    asked,
    sent,
    deps: {
      demoQa: async (site, payload) => {
        asked.push({ site: site.site_key, payload })
        return hostOk
          ? {
              ok: true,
              status: 200,
              body: {
                checks,
                durationMs: 1200,
                pages: ['/', ...nav()],
                visited: [{ path: '/', status: 200, finalPath: '/', from: 'home' }]
              }
            }
          : { ok: false, status: 0, body: null }
      },
      prompt: async (site, email, sessionId, requestId, text) => {
        sent.push({ email, sessionId, requestId, text })
        return accepted
      },
      log: { warn() {} }
    }
  }
}

const read = async (pool, id) =>
  (await pool.query('select qa, handoff, qa_lease_until from wo_build where id = $1', [id])).rows[0]

test(
  'no round while the hand-off chat has no closed turn since the hand-off, or one is still open',
  opts,
  async () => {
    const { pool } = db
    await handedOver(pool)
    const f = fakes([PASS])
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 0, 'no turn yet')
    await turn(pool, { openedAt: new Date(Date.now() - 3_600_000) })
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 0, 'a turn from before the hand-off')
    await turn(pool, { session: 'another-chat' })
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 0, 'a turn in another chat')
    await turn(pool)
    await turn(pool, { state: 'open' })
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 0, 'the agent is still working')
    assert.equal(f.asked.length, 0)
  }
)

test(
  'passing round: qa passed, hand-off completed, the host read the baseline pages against the baseline',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await turn(pool)
    const f = fakes([PASS])
    const run = await claimAndRunQa(pool, f.deps, { siteKey: 'phoba.localhost' })
    assert.deepEqual(run.results, [{ id: build, state: 'passed' }])
    const row = await read(pool, build)
    assert.equal(row.qa.state, 'passed')
    assert.equal(row.handoff.state, 'completed')
    assert.equal(row.qa_lease_until, null)
    assert.equal(row.qa.rounds.length, 1)
    // Every round reads home's current nav, not the pages the baseline saw (L4: those became drafts).
    assert.deepEqual(f.asked[0].payload.pages, ['/'])
    assert.equal(f.asked[0].payload.discover, true)
    assert.equal(f.asked[0].payload.baseline.cssRules['t.css'].rules, 3701)
    assert.match(f.asked[0].payload.briefText, /Pho Ba, noodle soup/)
    assert.equal(f.sent.length, 0)
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 0, 'a passed build is not judged again')
  }
)

test(
  'failing round: the repair list goes into the hand-off chat, qa retry, and the next closed turn is judged',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await turn(pool)
    const f = fakes([PASS, CSS_FAIL])
    assert.deepEqual((await sweepDemoQa(pool, f.deps)).results, [{ id: build, state: 'retry' }])
    const row = await read(pool, build)
    assert.equal(row.qa.state, 'retry')
    assert.equal(row.qa.repairs, 1)
    assert.equal(row.handoff.state, 'ready')
    assert.equal(f.sent.length, 1)
    assert.equal(f.sent[0].sessionId, 'session-1')
    assert.equal(f.sent[0].email, 'a@tracy.test')
    assert.equal(f.sent[0].requestId, `wo-qa-${build}-1`)
    assert.match(f.sent[0].text, /css-intact/)
    assert.deepEqual(
      row.qa.rounds[0].failed.map((c) => c.id),
      ['css-intact']
    )
    // The turn that was judged does not start a second round; the agent's next one does.
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 0)
    await turn(pool, { openedAt: new Date(Date.now() + 5_000) })
    assert.equal((await sweepDemoQa(pool, f.deps)).ran, 1)
    assert.equal((await read(pool, build)).qa.repairs, 2)
  }
)

test(
  'the nav changed after a repair: the next round reads the new pages, and each round keeps what it read',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    let nav = ['/pricing/', '/product/']
    const f = fakes([CSS_FAIL], { nav: () => nav })
    await turn(pool)
    await sweepDemoQa(pool, f.deps)
    // The agent drafted the template's pages and published its own.
    nav = ['/about/', '/gallery/', '/contact/']
    await turn(pool, { openedAt: new Date(Date.now() + 5_000) })
    await sweepDemoQa(pool, f.deps)
    assert.equal(f.asked.length, 2)
    for (const a of f.asked) {
      assert.deepEqual(a.payload.pages, ['/'])
      assert.equal(a.payload.discover, true)
    }
    const row = await read(pool, build)
    assert.deepEqual(row.qa.rounds[0].pages, ['/', '/pricing/', '/product/'])
    assert.deepEqual(row.qa.rounds[1].pages, ['/', '/about/', '/gallery/', '/contact/'])
    assert.deepEqual(row.qa.pages, ['/', '/about/', '/gallery/', '/contact/'])
  }
)

test(
  'a build with a page plan: a kept page the site does not reach fails the round with PAGE_PLAN_MISSING; each round keeps what the host visited',
  opts,
  async () => {
    const { pool } = db
    const receipt = {
      status: 201,
      pagePlan: {
        pages: [
          { id: 'homepage', path: '/', role: 'home', keep: true },
          { id: 'menu', path: '/menu', keep: true },
          { id: 'events', path: '/events', keep: true }
        ]
      }
    }
    const { build } = await handedOver(pool, { receipt })
    await turn(pool)
    const f = fakes([PASS], { nav: () => ['/menu'] })
    assert.deepEqual((await sweepDemoQa(pool, f.deps)).results, [{ id: build, state: 'retry' }])
    const row = await read(pool, build)
    assert.deepEqual(
      row.qa.rounds[0].failed.map((c) => c.id),
      ['page-plan-in-nav']
    )
    assert.deepEqual(row.qa.rounds[0].visited, [{ path: '/', status: 200, finalPath: '/', from: 'home' }])
    assert.match(f.sent[0].text, /PAGE_PLAN_MISSING/)
    assert.match(f.sent[0].text, /page: \/events/)
  }
)

// cta-real (product owner, 22/10/2026): a booking button leads to the page the build made the contact page.
test("contactPaths: the kept contact rows of the build's page plan, nothing else", () => {
  const plan = {
    pages: [
      { id: 'homepage', path: '/', role: 'home', keep: true },
      { id: 'contact-us', path: '/lien-he', role: 'contact', keep: true },
      { id: 'contact-2', path: '/contact-2', role: 'contact', keep: false },
      { id: 'about-us', path: '/about-us', keep: true },
      { id: 'contact-3', url: 'https://evil.example/contact', role: 'contact', keep: true }
    ]
  }
  assert.deepEqual(contactPaths(plan), ['/lien-he'])
  assert.deepEqual(contactPaths(null), [])
})

// ds-7f (19/10/2026): Joomla's alias "Menu" hid Simple Menu from nav discovery, and its $ prices passed QA.
test(
  'a build with a page plan: the host is asked to read every kept page with a path, beside what nav finds',
  opts,
  async () => {
    const { pool } = db
    const receipt = {
      status: 201,
      pagePlan: {
        pages: [
          { id: 'homepage', path: '/', role: 'home', keep: true },
          { id: 'menu/simple-menu', path: '/menu/simple-menu', keep: true },
          { id: 'menu/2-column-menu', path: '/menu/2-column-menu', keep: false },
          { id: 'about-us/our-history', path: '/about-us/our-history', keep: true },
          { id: 'contact-us', path: '/lien-he', role: 'contact', keep: true },
          { id: 'contact-2', path: '/contact-2', role: 'contact', keep: false },
          { id: 'services_page', keep: true }
        ]
      }
    }
    await handedOver(pool, { receipt })
    await turn(pool)
    const f = fakes([PASS], { nav: () => ['/menu/simple-menu', '/about-us/our-history'] })
    await sweepDemoQa(pool, f.deps)
    assert.deepEqual(f.asked[0].payload.plan, ['/menu/simple-menu', '/about-us/our-history', '/lien-he'])
    // A booking button leads to the page the build made the contact page (cta-real, product owner 22/10/2026).
    assert.deepEqual(f.asked[0].payload.contactPaths, ['/lien-he'])
    assert.deepEqual(f.asked[0].payload.pages, ['/'])
  }
)

test(
  'out of repairs: qa failed, hand-off needs-review — never completed, no third repair sent',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool, { state: 'retry', repairs: QA_MAX_REPAIRS })
    await turn(pool, { openedAt: new Date(Date.now() + 1_000) })
    const f = fakes([CSS_FAIL])
    assert.deepEqual((await sweepDemoQa(pool, f.deps)).results, [{ id: build, state: 'failed' }])
    const row = await read(pool, build)
    assert.equal(row.qa.state, 'failed')
    assert.equal(row.handoff.state, 'needs-review')
    assert.match(row.qa.reason, /after 2 repairs/)
    assert.equal(f.sent.length, 0)
  }
)

test(
  'a repair list the chat refuses, and a host that never answers, leave the demo to a person',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await turn(pool)
    const refused = fakes([CSS_FAIL], { accepted: false })
    await sweepDemoQa(pool, refused.deps)
    assert.equal((await read(pool, build)).handoff.state, 'needs-review')

    await pool.query(
      `update wo_build set qa = (jsonb_set(qa, '{state}', '"pending"') - 'judgedTurnAt') || '{"expectedRequestIds":["initial-prompt"]}'::jsonb, handoff = '{"state":"ready","promptSent":{"requestId":"initial-prompt"}}'`
    )
    // B7 (19/10/2026): three sweeps 15 s apart — one tracy-host restart — used to fail the gate for good.
    let clock = Date.now()
    const down = fakes([], { hostOk: false })
    const deps = { ...down.deps, now: () => clock }
    for (let i = 0; i < 4; i++) {
      await sweepDemoQa(pool, deps)
      clock += 15_000
    }
    let row = await read(pool, build)
    assert.equal(row.qa.state, 'pending', 'a host down for a minute is waited for')
    assert.equal(row.handoff.state, 'ready')
    assert.ok(down.asked.length < 4, 'the next try waits for its backoff, not the next sweep')
    assert.ok(Date.parse(row.qa.retryAt) > clock - 15_000)
    // Still down ten minutes after the first error: a person looks.
    clock += 10 * 60_000
    await sweepDemoQa(pool, deps)
    row = await read(pool, build)
    assert.equal(row.qa.state, 'failed')
    assert.equal(row.handoff.state, 'needs-review')
    assert.match(row.qa.reason, /could not run/)
  }
)

test('a host back after a restart: the round runs and the errors are forgotten', opts, async () => {
  const { pool } = db
  const { build } = await handedOver(pool)
  await turn(pool)
  let clock = Date.now()
  const down = fakes([], { hostOk: false })
  await sweepDemoQa(pool, { ...down.deps, now: () => clock })
  assert.equal((await read(pool, build)).qa.errors, 1)
  clock += 60_000
  const up = fakes([PASS])
  await sweepDemoQa(pool, { ...up.deps, now: () => clock })
  const row = await read(pool, build)
  assert.equal(row.qa.state, 'passed')
  assert.equal(row.qa.errors, 0)
  assert.equal(row.qa.retryAt, undefined)
  assert.equal(row.qa.firstErrorAt, undefined)
})

test('a leased build is not taken twice: two runners at once judge it once', opts, async () => {
  const { pool } = db
  await handedOver(pool)
  await turn(pool)
  let calls = 0
  let release
  const gate = new Promise((r) => (release = r))
  const deps = {
    ...fakes([PASS]).deps,
    demoQa: async () => {
      calls++
      await gate
      return { ok: true, status: 200, body: { checks: [PASS] } }
    }
  }
  const first = sweepDemoQa(pool, deps)
  await new Promise((r) => setTimeout(r, 100))
  const second = await sweepDemoQa(pool, deps)
  release()
  await first
  assert.equal(second.ran, 0)
  assert.equal(calls, 1)
})

test('repairPrompt: a phone overflow is never answered with overflow on html/body, and a clipped page says to undo it', () => {
  const text = repairPrompt({
    failed: [
      {
        id: 'no-horizontal-scroll',
        expected: 'page width ≤ 390 px on a phone',
        detail: [{ page: '/', widest: 'div.acm-features', scrollWidth: 405 }]
      },
      {
        id: 'content-reachable',
        expected: 'the document scrolls as far as its content reaches',
        detail: [{ page: '/', documentHeight: 900, contentHeight: 3829 }]
      }
    ],
    round: 1
  })
  assert.match(text, /Never set overflow on html or body/)
  assert.match(text, /Remove every overflow rule you put on html or body/)
  assert.match(text, /widest: div\.acm-features/)
})

test(
  'a repair list the agent never started on is sent once more, then needs a person — never a silent wait',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool, { state: 'retry', repairs: 1 })
    const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString()
    const setQa = (patch) =>
      pool.query(`update wo_build set qa = qa || $2::jsonb where id = $1`, [build, JSON.stringify(patch)])
    await setQa({ lastPrompt: 'Tracy checked this site…', promptedAt: minutesAgo(0.5), wakes: 0 })
    const f = fakes([PASS])
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 0 }, 'too soon')
    await setQa({ promptedAt: minutesAgo(2) })
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 1, stuck: 0 })
    assert.equal(f.sent.length, 1)
    assert.match(f.sent[0].requestId, /-wake$/)
    assert.equal(f.sent[0].text, 'Tracy checked this site…')
    let row = await read(pool, build)
    assert.equal(row.qa.wakes, 1)
    assert.equal(row.qa.state, 'retry')
    assert.equal(row.qa_lease_until, null)
    // Woken a moment ago: nothing more yet.
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 0 })
    // A turn opened after the wake: the agent is on it, no verdict from here.
    await setQa({ promptedAt: minutesAgo(12) })
    await turn(pool)
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 0 })
    // Without that turn, ten minutes after the wake the build needs a person.
    await pool.query(`delete from site_turn where site_key = 'phoba.localhost'`)
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 1 })
    row = await read(pool, build)
    assert.equal(row.qa.state, 'failed')
    assert.match(row.qa.reason, /did not start/)
    assert.equal(row.handoff.state, 'needs-review')
    assert.equal(f.sent.length, 1, 'woken once only')
  }
)

test('a look-kept failure sends the agent the token and the file, and the rule it broke', () => {
  const text = repairPrompt({
    failed: [
      {
        id: 'look-kept',
        expected:
          'no token changes value, no --ds-c-* token is set by hand, nothing added since hand-off paints a colour or a font',
        detail: [
          {
            page: '/',
            file: 'templates/tracy/css/custom.css',
            token: '--ds-c-bg',
            before: '#ffffff',
            after: '#f7f4ef'
          }
        ]
      }
    ],
    round: 1
  })
  assert.match(text, /## look-kept — expected: no token changes value/)
  assert.match(text, /keeps the template’s design system.*never set by hand/)
  assert.match(
    text,
    /- page: \/; file: templates\/tracy\/css\/custom\.css; token: --ds-c-bg; before: #ffffff; after: #f7f4ef/
  )
})

// ── Fixes from the AI-flow audit (19/10/2026) ───────────────────────────────────────────────────────

const EMPTY = { cssRules: {}, pictures: { files: [], shas: [] }, texts: [] }
const answer = (baseline, ok = true) => ({
  ok,
  status: ok ? 200 : 502,
  body: ok ? { checks: [PASS], baseline, pages: ['/'] } : null
})

test('baselineTrust: read and empty is a baseline; not read, home failed or an empty legacy read is not', () => {
  assert.equal(baselineTrust(answer({ ...EMPTY, read: ['/'], unread: [] })).ok, true)
  assert.equal(
    baselineTrust(answer({ ...EMPTY, read: [], unread: [{ path: '/', why: 'did not open' }] })).ok,
    false
  )
  assert.match(
    baselineTrust(answer({ ...EMPTY, read: ['/'], unread: [{ path: '/menu', why: 'answered 502' }] })).why,
    /\/menu \(answered 502\)/
  )
  assert.equal(baselineTrust(answer(null, false)).ok, false)
  assert.equal(baselineTrust(answer(null)).ok, false)
  // A host from before `read`: empty means home never opened; something in it means it did.
  assert.equal(baselineTrust(answer(EMPTY)).ok, false)
  assert.equal(baselineTrust(answer({ ...EMPTY, texts: ['abc'] })).ok, true)
})

test('qaOutcome: a check the host could not judge is never passed and never a repair', () => {
  const unknown = { id: 'no-demo-pictures', pass: false, skipped: 'no baseline', detail: [] }
  assert.deepEqual(qaOutcome({ repairs: 0 }, [PASS, unknown]), {
    state: 'failed',
    handoffState: 'needs-review',
    repair: false,
    unknown: ['no-demo-pictures']
  })
  // An older host marked it skipped but passed: still unknown.
  assert.equal(qaOutcome({ repairs: 0 }, [PASS, { ...unknown, pass: true }]).state, 'failed')
  // A real failure beside it is repaired as usual.
  assert.equal(qaOutcome({ repairs: 0 }, [CSS_FAIL, unknown]).state, 'retry')
  // A round with no check at all judged nothing: never passed, never a repair.
  assert.deepEqual(qaOutcome({ repairs: 0 }, []), {
    state: 'failed',
    handoffState: 'needs-review',
    repair: false,
    unknown: []
  })
})

test(
  'B1: a run whose baseline is lost ends needs-review without asking the host — never passed',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool, { qa: { baseline: null, baselineError: 'host answered 0' } })
    await turn(pool)
    const f = fakes([PASS])
    assert.deepEqual((await sweepDemoQa(pool, f.deps)).results, [{ id: build, state: 'failed' }])
    const row = await read(pool, build)
    assert.equal(row.qa.state, 'failed')
    assert.equal(row.handoff.state, 'needs-review')
    assert.match(row.qa.reason, /baseline was not read/)
    assert.equal(f.asked.length, 0)
    assert.equal(f.sent.length, 0)
  }
)

test(
  'B1: a round where a check could not be judged leaves the demo to a person, with no repair sent',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await turn(pool)
    const f = fakes([
      PASS,
      { id: 'no-demo-words', pass: false, skipped: 'no baseline', expected: 'x', detail: [] }
    ])
    await sweepDemoQa(pool, f.deps)
    const row = await read(pool, build)
    assert.equal(row.qa.state, 'failed')
    assert.equal(row.handoff.state, 'needs-review')
    assert.match(row.qa.reason, /could not judge no-demo-words/)
    assert.equal(f.sent.length, 0)
  }
)

test(
  'B1: a baseline that could not be read holds the prompt; the sweep reads again and sends it, or gives up',
  opts,
  async () => {
    const { pool } = db
    const { build, rev } = await handedOver(pool, {
      handoff: { state: 'ready', placed: {}, prompt: 'Build the demo.' }
    })
    await pool.query(`update wo_build set qa = null where id = $1`, [build])
    const revision = (await pool.query('select * from wo_revision where id = $1', [rev])).rows[0]
    const site = (await pool.query(`select * from site where site_key = 'phoba.localhost'`)).rows[0]
    const buildRow = (await pool.query('select * from wo_build where id = $1', [build])).rows[0]
    let clock = Date.now()
    const now = () => clock
    let reply = answer({ ...EMPTY, read: [], unread: [{ path: '/', why: 'did not open' }] })
    const asked = []
    const sent = []
    const deps = {
      demoQa: async () => (asked.push(1), reply),
      prompt: async (s, email, sessionId, requestId, text) => (
        sent.push({ sessionId, requestId, text }), true
      ),
      log: { warn() {} },
      now
    }
    const qa = await startDemoQa({
      pool,
      build: buildRow,
      revision,
      site,
      sessionId: 'session-1',
      email: 'a@tracy.test',
      demoQa: deps.demoQa,
      now
    })
    assert.equal(qa.state, 'baseline')
    assert.equal(qa.baseline, undefined)
    assert.match(qa.baselineError, /not read/)
    // Too soon for the sweep to read again.
    assert.deepEqual(await takeDueBaselines(pool, deps), { read: 0, ready: 0 })
    clock += 61_000
    reply = answer({ ...EMPTY, texts: ['t1'], read: ['/'], unread: [] })
    assert.deepEqual(await takeDueBaselines(pool, deps), { read: 1, ready: 1 })
    let row = await read(pool, build)
    assert.equal(row.qa.state, 'pending')
    assert.deepEqual(row.qa.baseline.texts, ['t1'])
    assert.equal(row.qa.baselineError, undefined)
    assert.equal(row.qa.lease, undefined)
    assert.equal(row.qa_lease_until, null)
    assert.deepEqual(sent, [
      { sessionId: 'session-1', requestId: `wo-handoff:${build}:session-1`, text: 'Build the demo.' }
    ])
    assert.equal(row.handoff.promptSent.sessionId, 'session-1')
    assert.equal(row.handoff.prompt, 'Build the demo.', 'the hand-off is merged into, not rewritten')

    // Never readable: after BASELINE_MAX_TRIES the demo goes to a person, and no prompt ever went out.
    await pool.query(`update wo_build set qa = null, handoff = $2::jsonb where id = $1`, [
      build,
      JSON.stringify({ state: 'ready', placed: {}, prompt: 'Build the demo.' })
    ])
    sent.length = 0
    reply = answer(null, false)
    await startDemoQa({
      pool,
      build: buildRow,
      revision,
      site,
      sessionId: 'session-1',
      email: 'a@tracy.test',
      demoQa: deps.demoQa,
      now
    })
    for (let i = 1; i < BASELINE_MAX_TRIES; i++) {
      clock += 61_000
      await takeDueBaselines(pool, deps)
    }
    row = await read(pool, build)
    assert.equal(row.qa.state, 'failed')
    assert.equal(row.qa.baselineTries, BASELINE_MAX_TRIES)
    assert.match(row.qa.reason, /could not be read before the hand-off/)
    assert.equal(row.handoff.state, 'needs-review')
    assert.equal(sent.length, 0)
  }
)

test('B3: a turn the person typed between rounds is not the repair’s turn', opts, async () => {
  const { pool } = db
  const t = (s) => new Date(Date.now() - s * 1000)
  const { build } = await handedOver(pool, {
    state: 'retry',
    repairs: 1,
    qa: {
      judgedTurnAt: t(300).toISOString(),
      promptedAt: t(60).toISOString(),
      lastPrompt: 'Fix it.',
      wakes: 0
    }
  })
  // Typed after round 1 was judged, before the repair list went out.
  await turn(pool, { openedAt: t(120) })
  const f = fakes([PASS])
  assert.equal((await claimAndRunQa(pool, f.deps)).ran, 0)
  // The agent's turn on the repair list.
  await turn(pool, { openedAt: t(30) })
  assert.deepEqual((await claimAndRunQa(pool, f.deps)).results, [{ id: build, state: 'passed' }])
})

test(
  'B4: one build leased at a time, and a runner whose lease was taken over writes nothing and sends no prompt',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await turn(pool)
    let release
    const gate = new Promise((r) => (release = r))
    let calls = 0
    const sent = []
    const slow = {
      ...fakes([CSS_FAIL]).deps,
      demoQa: async () => {
        calls++
        if (calls === 1) await gate
        return { ok: true, status: 200, body: { checks: [CSS_FAIL], pages: ['/'] } }
      },
      prompt: async (s, email, sessionId, requestId) => (sent.push(requestId), true)
    }
    const stale = claimAndRunQa(pool, slow)
    await new Promise((r) => setTimeout(r, 100))
    // Its lease runs out while the host is slow; another runner takes the build and runs the round.
    await pool.query(`update wo_build set qa_lease_until = now() - interval '1 second' where id = $1`, [
      build
    ])
    assert.deepEqual((await claimAndRunQa(pool, slow)).results, [{ id: build, state: 'retry' }])
    release()
    assert.deepEqual((await stale).results, [{ id: build, state: 'lost' }])
    const row = await read(pool, build)
    assert.equal(row.qa.repairs, 1)
    assert.equal(row.qa.rounds.length, 1)
    assert.deepEqual(sent, [`wo-qa-${build}-1`])
  }
)

test('B4: the sweep does not lease the next build while it judges one', opts, async () => {
  const { pool } = db
  const { build: one } = await handedOver(pool)
  await pool.query(
    `insert into site (site_key, label, host, platform) values ('two.localhost', 'two', 'local', 'joomla')`
  )
  const two = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state, handoff, qa, choice, choice_key)
       select account_id, revision_id, 'req-2', gen_random_uuid(), 'two.localhost', state, handoff, qa, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture'
         from wo_build where id = $1 returning id`,
      [one]
    )
  ).rows[0].id
  await turn(pool)
  await pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, state, opened_at, closed_at, rpc_id)
     values ('two:1', 'two.localhost', 'session-1', 1, 'a@tracy.test', 'x', 'closed', $1, $1, 'initial-prompt')`,
    // The process clock, as `turn()` uses: the database's now() is not moved when the suite's clock is.
    [new Date()]
  )
  const leasedWhileJudging = []
  const f = fakes([PASS])
  const deps = {
    ...f.deps,
    demoQa: async (site, payload) => {
      const { rows } = await pool.query('select id from wo_build where qa_lease_until is not null')
      leasedWhileJudging.push(rows.map((r) => r.id))
      return f.deps.demoQa(site, payload)
    }
  }
  const run = await claimAndRunQa(pool, deps)
  assert.equal(run.ran, 2)
  assert.deepEqual(
    leasedWhileJudging.map((ids) => ids.length),
    [1, 1]
  )
  assert.deepEqual(new Set(leasedWhileJudging.flat()), new Set([one, two]))
})

test('B6: a hand-off prompt that opened no turn is sent once more, then needs a person', opts, async () => {
  const { pool } = db
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000)
  const { build } = await handedOver(pool, {
    since: minutesAgo(2),
    handoff: {
      state: 'ready',
      placed: {},
      prompt: 'Build the demo.',
      promptSent: { sessionId: 'session-1', requestId: 'initial-prompt' }
    }
  })
  const f = fakes([PASS])
  assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 1, stuck: 0 })
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].text, 'Build the demo.')
  // A wake remains bound to the accepted prompt, including a legacy hand-off request id.
  assert.equal(f.sent[0].requestId, 'initial-prompt-wake')
  let row = await read(pool, build)
  assert.equal(row.qa.state, 'pending')
  assert.equal(row.qa.wakes, 1)
  // Still no turn ten minutes after the wake.
  await pool.query(`update wo_build set qa = qa || $2::jsonb where id = $1`, [
    build,
    JSON.stringify({ promptedAt: minutesAgo(11).toISOString() })
  ])
  assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 1 })
  row = await read(pool, build)
  assert.equal(row.qa.state, 'failed')
  assert.match(row.qa.reason, /did not start on the hand-off/)
  assert.equal(row.handoff.state, 'needs-review')
  assert.equal(f.sent.length, 1)
})

test(
  'the first hand-off prompt has the same watchdog as repairs; an unrelated turn cannot keep it waiting',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await pool.query(`update wo_build set qa=qa || $2::jsonb where id=$1`, [
      build,
      JSON.stringify({
        lastPrompt: 'Build this site',
        promptedAt: new Date(Date.now() - 120000).toISOString(),
        expectedRequestIds: ['handoff-request'],
        wakes: 0
      })
    ])
    await turn(pool, { rpcId: 'some-other-message' })
    const f = fakes([PASS])
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 1, stuck: 0 })
    const held = await read(pool, build)
    assert.equal(held.qa.state, 'pending')
    assert.equal(f.sent[0].sessionId, 'session-1')
    assert.ok(held.qa.expectedRequestIds.includes(f.sent[0].requestId))
    await pool.query(`update wo_build set qa=jsonb_set(qa,'{promptedAt}',to_jsonb($2::text)) where id=$1`, [
      build,
      new Date(Date.now() - 11 * 60000).toISOString()
    ])
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 1 })
    assert.equal((await read(pool, build)).qa.state, 'failed')
  }
)

test(
  'an expired QA worker cannot overwrite the next replica or send a repair after its host returns',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await turn(pool)
    let at = Date.now()
    let release, entered
    const hostEntered = new Promise((resolve) => {
      entered = resolve
    })
    const gate = new Promise((resolve) => {
      release = resolve
    })
    let prompts = 0
    const first = claimAndRunQa(
      pool,
      {
        now: () => at,
        log: { warn() {} },
        prompt: async () => {
          prompts++
          return true
        },
        demoQa: async () => {
          entered()
          await gate
          return { ok: true, body: { checks: [CSS_FAIL], pages: ['/'] } }
        }
      },
      { buildId: build }
    )
    await hostEntered
    at += 7 * 60000
    const second = await claimAndRunQa(pool, { ...fakes([PASS]).deps, now: () => at }, { buildId: build })
    assert.equal(second.results[0].state, 'passed')
    release()
    await first
    const held = await read(pool, build)
    assert.equal(held.qa.state, 'passed')
    assert.equal(held.qa.rounds.length, 1)
    assert.equal(held.qa_lease_until, null)
    assert.equal(prompts, 0)
  }
)

test(
  'only the held session and accepted prompt id can trigger QA; neither a nearby turn nor a missing receipt qualifies',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    await pool.query(
      `update wo_build set qa=qa || '{"expectedRequestIds":["accepted-prompt"]}'::jsonb where id=$1`,
      [build]
    )
    await turn(pool, { rpcId: 'unrelated-prompt' })
    await turn(pool, { session: 'another-session', rpcId: 'accepted-prompt' })
    const f = fakes([PASS])
    assert.equal((await claimAndRunQa(pool, f.deps, { buildId: build })).ran, 0)
    assert.equal(f.asked.length, 0)
    await turn(pool, { rpcId: 'accepted-prompt' })
    await pool.query("update wo_build set handoff=handoff-'promptSent' where id=$1", [build])
    assert.equal(
      (await claimAndRunQa(pool, f.deps, { buildId: build })).ran,
      0,
      'no QA before the acceptance receipt is durable'
    )
    await pool.query(
      'update wo_build set handoff=handoff || \'{"promptSent":{"requestId":"accepted-prompt"}}\'::jsonb where id=$1',
      [build]
    )
    assert.equal((await claimAndRunQa(pool, f.deps, { buildId: build })).results[0].state, 'passed')
  }
)

async function markAcceptedAttempt(
  pool,
  build,
  actionId,
  { state = 'pending', repairs = 0, fallback = false } = {}
) {
  const row = (await pool.query('select qa,qa_lease_token from wo_build where id=$1', [build])).rows[0]
  const qa = {
    ...row.qa,
    state,
    repairs,
    retryActionId: actionId,
    retryPromptSent: true,
    since: new Date(Date.now() - 1000).toISOString(),
    promptedAt: new Date(Date.now() - 120000).toISOString(),
    lastPrompt: `Repair only this attempt's round ${repairs}`,
    wakes: 0,
    acceptedRetry: {
      schemaVersion: 'tracy-wo-qa-retry/v1',
      acceptedActionId: actionId,
      buildId: build,
      failedQaGeneration: String(row.qa_lease_token),
      failedQaHash: failedQaHash(row.qa)
    }
  }
  delete qa.judgedTurnAt
  if (fallback) delete qa.expectedRequestIds
  else
    qa.expectedRequestIds = [
      repairs ? `wo-qa-retry:${actionId}:repair:${repairs}` : `wo-qa-retry:${actionId}`
    ]
  await pool.query(
    `update wo_build set qa=$2::jsonb,qa_lease_until=null,
       handoff=jsonb_set(handoff,'{state}','"ready"'::jsonb) where id=$1`,
    [build, JSON.stringify(qa)]
  )
  return qa
}

test('accepted QA actions on one build use distinct repair RPCs for both finite rounds', opts, async () => {
  const { pool } = db
  const { build } = await handedOver(pool)
  const first = 'f8c98dfe-6d36-4adc-bbb6-6eb5e6033521'
  const second = 'c3731bce-cb65-4303-9baf-d3d727554e04'
  const f = fakes([CSS_FAIL])
  await markAcceptedAttempt(pool, build, first)
  await turn(pool, { rpcId: `wo-qa-retry:${first}` })
  assert.equal((await claimAndRunQa(pool, f.deps)).results[0].state, 'retry')
  assert.equal(f.sent[0].requestId, `wo-qa-retry:${first}:repair:1`)
  await turn(pool, { rpcId: f.sent[0].requestId, openedAt: new Date(Date.now() + 5000) })
  assert.equal((await claimAndRunQa(pool, f.deps)).results[0].state, 'retry')
  assert.equal(f.sent[1].requestId, `wo-qa-retry:${first}:repair:2`)
  await turn(pool, { rpcId: f.sent[1].requestId, openedAt: new Date(Date.now() + 10000) })
  assert.equal((await claimAndRunQa(pool, f.deps)).results[0].state, 'failed')
  assert.equal(f.sent.length, 2)
  await markAcceptedAttempt(pool, build, second)
  await turn(pool, { rpcId: `wo-qa-retry:${second}`, openedAt: new Date(Date.now() + 15000) })
  assert.equal((await claimAndRunQa(pool, f.deps)).results[0].state, 'retry')
  assert.equal(f.sent[2].requestId, `wo-qa-retry:${second}:repair:1`)
  assert.equal(new Set(f.sent.map((s) => s.requestId)).size, 3)
  await turn(pool, { rpcId: f.sent[0].requestId, openedAt: new Date(Date.now() + 20000) })
  assert.equal(
    (await claimAndRunQa(pool, f.deps)).ran,
    0,
    'an older accepted action cannot satisfy this round'
  )
})

for (const state of ['pending', 'retry'])
  test(`marked ${state} SQL fallback and watchdog use the same action-scoped RPC`, opts, async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    const actionId = 'f8c98dfe-6d36-4adc-bbb6-6eb5e6033521'
    const repairs = state === 'retry' ? 1 : 0
    await markAcceptedAttempt(pool, build, actionId, { state, repairs, fallback: true })
    const base = repairs ? `wo-qa-retry:${actionId}:repair:1` : `wo-qa-retry:${actionId}`
    const f = fakes([PASS])
    await turn(pool, { rpcId: repairs ? `wo-qa-${build}-1` : 'initial-prompt' })
    assert.equal((await claimAndRunQa(pool, f.deps)).ran, 0)
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 1, stuck: 0 })
    assert.equal(f.sent[0].requestId, `${base}-wake`)
    const held = await read(pool, build)
    assert.equal(held.qa.repairs, repairs)
    assert.equal(held.qa.wakes, 1)
    assert.ok(held.qa.expectedRequestIds.includes(base))
    await turn(pool, { rpcId: `${base}-wake`, openedAt: new Date(Date.now() + 5000) })
    assert.equal((await claimAndRunQa(pool, f.deps)).results[0].state, 'passed')
  })

test(
  'each marked repair wakes its durable current RPC once; an already spent legacy wake never resets',
  opts,
  async () => {
    const { pool } = db
    const { build } = await handedOver(pool)
    const actionId = 'f8c98dfe-6d36-4adc-bbb6-6eb5e6033521'
    const f = fakes([PASS])
    for (const repairs of [1, 2]) {
      const before = await markAcceptedAttempt(pool, build, actionId, { state: 'retry', repairs })
      const base = before.expectedRequestIds[0]
      assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 1, stuck: 0 })
      assert.equal(f.sent.at(-1).requestId, `${base}-wake`)
      let held = await read(pool, build)
      assert.deepEqual(held.qa.expectedRequestIds, [base, `${base}-wake`])
      assert.equal(held.qa.repairs, repairs)
      assert.equal(held.qa.since, before.since)
      await pool.query(`update wo_build set qa=jsonb_set(qa,'{promptedAt}',to_jsonb($2::text)) where id=$1`, [
        build,
        new Date(Date.now() - 120000).toISOString()
      ])
      assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 0 })
      held = await read(pool, build)
      assert.equal(held.qa.wakes, 1)
    }
    const old = `wo-qa-${build}-1`
    const row = await read(pool, build)
    const history = [old, `${old}-wake`]
    const qa = {
      ...row.qa,
      repairs: 1,
      expectedRequestIds: history,
      wakes: 1,
      promptedAt: new Date(Date.now() - 11 * 60000).toISOString()
    }
    await pool.query('update wo_build set qa=$2::jsonb where id=$1', [build, JSON.stringify(qa)])
    const sent = f.sent.length
    assert.deepEqual(await wakeStuckRepairs(pool, f.deps), { woken: 0, stuck: 1 })
    const held = await read(pool, build)
    assert.equal(held.qa.state, 'failed')
    assert.equal(held.qa.repairs, 1)
    assert.equal(held.qa.wakes, 1)
    assert.deepEqual(held.qa.expectedRequestIds, history)
    assert.equal(f.sent.length, sent)
  }
)

test('automatic repairs preserve all cards and include failures beyond the old twelve-item limit', () => {
  const text = repairPrompt({
    round: 1,
    failed: [
      {
        id: 'no-empty-picture-slots',
        expected: 'filled',
        detail: Array.from({ length: 20 }, (_, i) => ({ selector: `frame-${i}` }))
      },
      { id: 'no-demo-words', expected: 'real copy', detail: [] }
    ]
  })
  assert.match(text, /frame-19/)
  assert.match(text, /Preserve every existing section, card, image frame and publication state/)
  assert.match(text, /conditionalTermMetadata/)
  assert.doesNotMatch(text, /Unpublish, hide or empty the item instead|or hide the frame|or remove it/)
})
