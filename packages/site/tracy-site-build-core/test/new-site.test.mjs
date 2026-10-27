/**
 * The two readings the Build tab does on the way to a new site, and the one it does on the way back
 * from signing in. Pure: the fetch is handed in, so nothing here reaches the network.
 *
 * What is pinned: a site that is not ready is never treated as ready (a build into a half-built
 * webroot is the accident this guards), a refusal carries its own words to the customer, and the
 * sign-in reading never says "signed in" on a body it could not read.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { labelOf } from '../src/client/carry.mjs'

import {
  claimNewSite,
  createNewSite,
  savedPress,
  signInPlan,
  signedIn,
  siteFromJob,
  waitForProvision,
  waitForSignIn
} from '../src/client/new-site.mjs'

const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

test('signedIn: only an email counts; anything else is signed out', async () => {
  assert.equal(await signedIn(async () => ok({ email: 'lee@example.com' })), true)
  assert.equal(await signedIn(async () => ok({ email: null })), false)
  assert.equal(await signedIn(async () => ok({})), false)
  assert.equal(await signedIn(async () => ok('nope', 500)), false)
  assert.equal(
    await signedIn(async () => {
      throw new Error('offline')
    }),
    false
  )
})

// 19/09: "why does the system make the current user sign in again every time I create a new site
// from design inspiration?" — and the form's own comment says this must not happen ("a press by
// somebody already signed in must not flash a sign-in window"). It happened anyway, because the
// press opened the window for everything that was not a KNOWN email: `me` starts `undefined` and
// only becomes an address once `/auth/me` answers, so a press before that answer — or after a
// single failed read, since `whoAmI` turns every failure into `null` and is never asked again —
// opened a sign-in window at somebody already signed in, then closed it a moment later.
//
// The window has to be opened inside the click to survive a popup blocker, so the fix is not
// "check first, open later" for every case: it is to tell the three states apart.
test('signInPlan: a known email goes, a known absence opens, an unknown state asks first', () => {
  assert.equal(signInPlan('lee@example.com'), 'go')
  assert.equal(signInPlan(null), 'open')
  assert.equal(signInPlan(undefined), 'ask')
  // An empty string is not an address — it is the shape a door with no session sometimes answers.
  assert.equal(signInPlan(''), 'open')
})

test('siteFromJob: ready only on done WITH a live address', () => {
  assert.deepEqual(siteFromJob({ state: 'done', liveUrl: 'https://a.tracy.ai', adminUrl: null }), {
    state: 'done',
    liveUrl: 'https://a.tracy.ai',
    adminUrl: null,
    step: '',
    attached: false,
    laneError: null,
    custody: null
  })
  // What the job-poll door adds once the fleet is done: the site folder registered with dsh, or
  // why not, and the Claude Cowork plugin's custody. A handoff into the site stands on these, not on `done`.
  assert.equal(siteFromJob({ state: 'done', lane: '/' }).attached, true)
  assert.equal(siteFromJob({ state: 'done', laneError: 'LANE_FAILED' }).laneError, 'LANE_FAILED')
  assert.equal(siteFromJob({ state: 'done', custody: 'registered' }).custody, 'registered')
  // done without an address is not somewhere we can send a customer.
  assert.equal(siteFromJob({ state: 'done' }).liveUrl, null)
  assert.equal(siteFromJob({ state: 'running', step: 'installing' }).state, 'running')
  assert.equal(siteFromJob({ state: 'nonsense' }).state, 'unknown')
  assert.equal(siteFromJob(null).state, 'unknown')
})

test('createNewSite: one POST, then polls until the fleet says done', async () => {
  const calls = []
  let polls = 0
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' })
    if (String(url) === '/api/sites') return ok({ siteKey: 'coba.tracy.ai', jobId: 'j1' }, 202)
    polls++
    if (polls < 3) return ok({ state: 'running', step: 'installing' })
    return ok({ state: 'done', liveUrl: 'https://coba.tracy.ai', adminUrl: 'https://coba.tracy.ai/wp-admin' })
  }
  const steps = []
  const out = await createNewSite(
    { label: 'co-ba-bakery', platform: 'wordpress' },
    { fetch: fetchImpl, wait: async () => undefined, onStep: (s) => steps.push(s) }
  )
  assert.deepEqual(out, {
    ok: true,
    siteKey: 'coba.tracy.ai',
    liveUrl: 'https://coba.tracy.ai',
    adminUrl: 'https://coba.tracy.ai/wp-admin',
    attached: false,
    laneError: null,
    custody: null
  })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, '/api/sites')
  assert.equal(polls, 3)
  assert.deepEqual(steps.slice(0, 2), ['creating', 'installing'])
})

test('createNewSite: a refusal comes back in its own words, and a failed job is not a site', async () => {
  const refused = await createNewSite(
    { label: 'x', platform: 'wordpress' },
    {
      fetch: async () =>
        ok({ code: 'LIMIT_REACHED', message: 'You have as many sites as your plan allows.' }, 403)
    }
  )
  assert.equal(refused.ok, false)
  assert.match(refused.message, /as many sites/)

  let first = true
  const failed = await createNewSite(
    { label: 'x', platform: 'wordpress' },
    {
      fetch: async () => {
        if (first) {
          first = false
          return ok({ siteKey: 's', jobId: 'j' }, 202)
        }
        return ok({ state: 'failed', step: 'database' })
      },
      wait: async () => undefined
    }
  )
  assert.equal(failed.ok, false)
  assert.match(failed.message, /database/)
})

test('createNewSite: a fleet that never finishes gives up rather than hanging the press', async () => {
  let first = true
  const out = await createNewSite(
    { label: 'x', platform: 'wordpress' },
    {
      fetch: async () => {
        if (first) {
          first = false
          return ok({ siteKey: 's', jobId: 'j' }, 202)
        }
        return ok({ state: 'running', step: 'installing' })
      },
      wait: async () => undefined,
      tries: 4
    }
  )
  assert.equal(out.ok, false)
  assert.match(out.message, /still building|taking/i)
  assert.equal(out.siteKey, 's')
})

test('waitForSignIn: answers true the moment a session appears, false when the budget runs out', async () => {
  let asks = 0
  const appears = async () => {
    asks++
    return { ok: true, status: 200, json: async () => ({ email: asks >= 3 ? 'lee@example.com' : null }) }
  }
  assert.equal(await waitForSignIn({ fetch: appears, wait: async () => undefined, tries: 10 }), true)
  assert.equal(asks, 3)
  const never = async () => ({ ok: true, status: 200, json: async () => ({ email: null }) })
  assert.equal(await waitForSignIn({ fetch: never, wait: async () => undefined, tries: 4 }), false)
})

/**
 * A door that is not there is not a door somebody has yet to walk through.
 *
 * Pressing Send opens a sign-in window and then polls `/auth/me` — 150 times, 2 s apart, five
 * minutes — waiting for a cookie to appear. On a lane with no Worker in front of it that door
 * answers 404, and 404 was read as "not signed in yet", so the button span for five minutes
 * against a window that had opened on a page which does not exist. Measured 09/09; the same shape
 * `CLAUDE.md` §5 records from 08/09.
 *
 * 401 and 403 are the opposite case and must keep waiting: they mean the door is there and the
 * person has not finished.
 */
test('waitForSignIn: a missing door stops at once instead of spending five minutes', async () => {
  let asked = 0
  const gone = async () => {
    asked += 1
    return ok('not found', 404)
  }
  const said = await waitForSignIn({ fetch: gone, wait: async () => {}, tries: 150 })
  assert.equal(said, false)
  assert.equal(asked, 1, `asked ${asked} times; a 404 is an answer, not a wait`)
})

test('waitForSignIn: a door that says "not you yet" is waited on', async () => {
  let asked = 0
  const notYet = async () => {
    asked += 1
    return asked < 3 ? ok({ email: null }, 401) : ok({ email: 'lee@example.com' })
  }
  assert.equal(await waitForSignIn({ fetch: notYet, wait: async () => {}, tries: 150 }), true)
  assert.equal(asked, 3)
})

test('waitForSignIn: an unreachable door is waited on too — the lane may still be starting', async () => {
  let asked = 0
  const flaky = async () => {
    asked += 1
    if (asked < 2) throw new Error('connection refused')
    return ok({ email: 'lee@example.com' })
  }
  assert.equal(await waitForSignIn({ fetch: flaky, wait: async () => {}, tries: 150 }), true)
})

test('waitForSignIn: the budget still runs out when nobody ever signs in', async () => {
  let asked = 0
  const never = async () => {
    asked += 1
    return ok({ email: null }, 401)
  }
  assert.equal(await waitForSignIn({ fetch: never, wait: async () => {}, tries: 4 }), false)
  assert.equal(asked, 4)
})

test('createNewSite: the buildId rides on every POST, and CREATE_PENDING is asked again with the same id — never a second build', async () => {
  const posts = []
  let asked = 0
  const fetchImpl = async (url, init) => {
    if (String(url) === '/api/sites') {
      posts.push(JSON.parse(init.body))
      asked++
      // The first two answers: somebody (a double press) is still mid-claim on this id.
      if (asked < 3) return ok({ code: 'CREATE_PENDING', buildId: 'b-1' }, 202)
      return ok({ siteKey: 'coba.tracy.ai', jobId: 'j1' }, 202)
    }
    return ok({ state: 'done', liveUrl: 'https://coba.tracy.ai', lane: '/', custody: 'registered' })
  }
  const waits = []
  const out = await createNewSite(
    { label: 'co-ba', platform: 'joomla', buildId: 'b-1', design: 'stripe', designRevision: 'r1' },
    { fetch: fetchImpl, wait: async (ms) => waits.push(ms) }
  )
  assert.equal(out.ok, true)
  assert.equal(out.attached, true)
  assert.equal(out.custody, 'registered')
  assert.equal(posts.length, 3)
  assert.ok(posts.every((p) => p.buildId === 'b-1' && p.label === 'co-ba' && p.design === 'stripe'))
  assert.deepEqual(waits.slice(0, 2), [1000, 1000])
})

test('createNewSite: a CREATE_PENDING that never resolves ends with words, and names the id so nothing is pressed twice', async () => {
  const out = await createNewSite(
    { label: 'x', platform: 'joomla', buildId: 'b-2' },
    {
      fetch: async () => ok({ code: 'CREATE_PENDING', buildId: 'b-2', siteKey: 'x.tracy.ai' }, 202),
      wait: async () => undefined
    }
  )
  assert.equal(out.ok, false)
  assert.equal(out.code, 'CREATE_PENDING')
  assert.equal(out.siteKey, 'x.tracy.ai')
})

test('claimNewSite: the name reserves the site and answers where its workspace is; a refusal keeps its code', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) })
    return new Response(
      JSON.stringify({
        siteKey: 'granite-works.localhost',
        label: 'granite-works',
        workspacePath: '/site/granite-works',
        next: '/granite-works/?inspiration=tracy-business&platform=emdash&site=granite-works.localhost&tab=tracy%3Abuild%3Aemdash'
      }),
      { status: 201, headers: { 'content-type': 'application/json' } }
    )
  }
  const ok = await claimNewSite(
    {
      label: 'granite-works',
      platform: 'emdash',
      buildId: 'b-1',
      design: 'tracy-business',
      designRevision: 'template'
    },
    { fetch: fetchImpl }
  )
  assert.equal(ok.ok, true)
  assert.equal(ok.siteKey, 'granite-works.localhost')
  assert.equal(ok.label, 'granite-works')
  assert.match(ok.next, /^\/granite-works\/\?/)
  assert.equal(seen[0].url, '/api/sites/claim')
  assert.deepEqual(seen[0].body, {
    label: 'granite-works',
    platform: 'emdash',
    buildId: 'b-1',
    design: 'tracy-business',
    designRevision: 'template'
  })

  const taken = await claimNewSite(
    { label: 'granite-works', platform: 'emdash', buildId: 'b-2' },
    {
      fetch: async () =>
        new Response(JSON.stringify({ code: 'TAKEN' }), {
          status: 409,
          headers: { 'content-type': 'application/json' }
        })
    }
  )
  assert.equal(taken.ok, false)
  assert.equal(taken.code, 'TAKEN')
  assert.equal(taken.message, 'TAKEN')

  const down = await claimNewSite(
    { label: 'granite-works', platform: 'emdash', buildId: 'b-3' },
    {
      fetch: async () => {
        throw new Error('offline')
      }
    }
  )
  assert.equal(down.ok, false)
  assert.equal(down.message, 'offline')
})

test('createNewSite announces the new site, so the sidebar lists it without a reload', async () => {
  // `tracy-sidebar`'s workspace list re-reads on `tracy:sites-changed`. Until 20/09/2026 only
  // `tracy-add-site`'s wizard fired it, so a site made from the build questionnaire — the road most
  // sites are made by now — stayed invisible in the sidebar until the page was reloaded by hand.
  const fired = []
  const original = globalThis.window
  globalThis.window = { dispatchEvent: (event) => fired.push(event.type) }
  try {
    const result = await createNewSite(
      { label: 'lantern', platform: 'wordpress' },
      {
        fetch: async () =>
          new Response(JSON.stringify({ siteKey: 'lantern.tracy.test' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
      }
    )
    assert.equal(result.ok, true)
    assert.deepEqual(fired, ['tracy:sites-changed'])
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})

test('labelOf: a name becomes the label; no name becomes a random label named by the CMS', () => {
  // The second half is the one that made a real, provisioned, addressless site on 20/09/2026:
  // the questionnaire never arrived, the form was submitted empty, and this is what named it.
  // It is correct in the creation workspace — a site must be called something — and it is why
  // `BuildForm` must not reach it while standing inside a site that already exists.
  assert.equal(
    labelOf({ name: 'bán xe nội thật' }, 'joomla'),
    'ban-xe-noi-that',
    'a typed name gets no CMS prefix'
  )
  assert.match(labelOf({}, 'joomla'), /^j-[a-z0-9]{6}$/)
  assert.match(labelOf({ name: '   ' }, 'wordpress'), /^wp-[a-z0-9]{6}$/)
  assert.match(labelOf({}, 'emdash'), /^ed-[a-z0-9]{6}$/)
  assert.match(labelOf({}), /^site-[a-z0-9]{6}$/, 'no platform known: the old address, not an invented one')
})

test('labelOf names a CMS exactly as the claim door does', async () => {
  // Two copies of one table (browser and server cannot share a module); this is what keeps them one.
  const { bornLabel } = await import('../../../../apps/tracy-web/src/lib/born-label.js')
  for (const platform of ['joomla', 'wordpress', 'emdash', 'other']) {
    const client = labelOf({}, platform).replace(/-[a-z0-9]{6}$/, '')
    const server = bornLabel(platform).replace(/-[a-z0-9]{6}$/, '')
    assert.equal(client, server, platform)
  }
})

// ── A door that stopped answering is not a provision in progress ────────────────────────────────
//
// `siteFromJob(null)` answers `state: 'unknown'` with an empty step. That falls through both
// endings of the poll loop, so the press simply waits again — and the empty step means the chat's
// to-do list is not repainted either. A door that has started refusing (an expired session, a
// revoked seat, a host that went away) therefore looked EXACTLY like a site still being built: a
// frozen list, no error, for the full 30-minute budget.
//
// Measured 22/09/2026 on three sites whose lists still read `fetching webroot` minutes after the
// provision had finished.

test('createNewSite: a run of unreadable polls ends the press instead of passing for progress', async () => {
  let first = true
  let polls = 0
  const out = await createNewSite(
    { label: 'x', platform: 'wordpress' },
    {
      fetch: async () => {
        if (first) {
          first = false
          return ok({ siteKey: 's', jobId: 'j' }, 202)
        }
        polls += 1
        return { ok: false, status: 403, json: async () => null }
      },
      wait: async () => undefined,
      // Larger than the unreadable cutoff on purpose: what ends this must be the run of refusals,
      // not the budget running out — otherwise the test would pass on the old behaviour too.
      tries: 400
    }
  )
  assert.equal(out.ok, false)
  assert.equal(out.siteKey, 's')
  assert.match(out.message, /could not read its progress/i)
  assert.ok(polls < 400, `stopped on the refusals (${polls} polls), not on the budget`)
})

test('createNewSite: one unreadable poll among good ones is ordinary, and does not end the press', async () => {
  let first = true
  let polls = 0
  const out = await createNewSite(
    { label: 'x', platform: 'wordpress' },
    {
      fetch: async () => {
        if (first) {
          first = false
          return ok({ siteKey: 's', jobId: 'j' }, 202)
        }
        polls += 1
        // Every third reading is unreadable — a reload, a restart, a dropped request. The counter
        // resets on the ones that come back, so this must still reach `done`.
        if (polls % 3 === 0) return { ok: false, status: 502, json: async () => null }
        if (polls >= 20) return ok({ state: 'done', step: 'ready', liveUrl: 'http://x.test/' })
        return ok({ state: 'running', step: 'installing' })
      },
      wait: async () => undefined,
      tries: 400
    }
  )
  assert.equal(out.ok, true)
  assert.equal(out.liveUrl, 'http://x.test/')
})

// ── A reload mid-provision: the resume waits for the same handover the press was waiting on ─────
//
// Measured 23/09/2026 on `wp-oyib7i`: a page reloaded mid-provision resumed its press as soon as the
// site answered, 107 s after the claim, before the job-poll door had answered `done` — the door that
// pairs the content component. `check` died `COMPONENT_NOT_REGISTERED`, and since #249 the sweep no
// longer builds Joomla/WordPress sites, so nothing ran it again.

test('createNewSite: the job is told the moment the door answers with one, before the first poll', async () => {
  const order = []
  const fetchImpl = async (url) => {
    if (String(url) === '/api/sites') return ok({ siteKey: 'wp-x.tracy.test', jobId: 'job-7' }, 202)
    order.push('poll')
    return ok({ state: 'done', liveUrl: 'http://wp-x.tracy.test' })
  }
  const out = await createNewSite(
    { label: 'wp-x', platform: 'wordpress', buildId: 'b1' },
    { fetch: fetchImpl, wait: async () => undefined, onJob: (job) => order.push(job) }
  )
  assert.equal(out.ok, true)
  assert.deepEqual(order, [{ siteKey: 'wp-x.tracy.test', jobId: 'job-7' }, 'poll'])
})

test('waitForProvision: polls THAT job of THAT site until done, says each step, and answers the handover', async () => {
  const urls = []
  let polls = 0
  const fetchImpl = async (url) => {
    urls.push(String(url))
    polls++
    if (polls < 3) return ok({ state: 'running', step: 'installing cowork' })
    return ok({ state: 'done', liveUrl: 'http://wp-x.tracy.test', lane: '/', custody: 'registered' })
  }
  const steps = []
  const out = await waitForProvision('wp-x.tracy.test', 'job-7', {
    fetch: fetchImpl,
    wait: async () => undefined,
    onStep: (s) => steps.push(s)
  })
  assert.deepEqual(out, {
    ok: true,
    siteKey: 'wp-x.tracy.test',
    liveUrl: 'http://wp-x.tracy.test',
    adminUrl: null,
    attached: true,
    laneError: null,
    custody: 'registered'
  })
  assert.deepEqual([...new Set(urls)], ['/api/sites/wp-x.tracy.test/jobs/job-7'])
  assert.equal(polls, 3)
  assert.deepEqual(steps, ['installing cowork', 'installing cowork'])

  const failed = await waitForProvision('wp-x.tracy.test', 'job-8', {
    fetch: async () => ok({ state: 'failed', step: 'binding contract' }),
    wait: async () => undefined
  })
  assert.equal(failed.ok, false)
  assert.match(failed.message, /could not finish the site \(binding contract\)/)
})

// ── A closed tab: the press it made is on the creation row, and the press door hands it back ────

test('savedPress: the press the door hands back, shaped for a resume; nothing usable is null', async () => {
  const asked = []
  const door =
    (body, status = 200) =>
    async (url) => {
      asked.push(String(url))
      return ok(body, status)
    }
  const press = {
    id: 'tracy-business',
    answers: { name: 'Lantern', languages: ['en-us'] },
    designPlan: { requestedDesign: 'tracy-business' },
    questionnaire: { set: { id: 'q' }, questions: [] }
  }
  assert.deepEqual(
    await savedPress('wp-x.tracy.test', { fetch: door({ press, jobId: 'job-7', state: 'done' }) }),
    {
      id: 'tracy-business',
      answers: { name: 'Lantern', languages: ['en-us'] },
      designPlan: { requestedDesign: 'tracy-business' },
      questionnaire: { set: { id: 'q' }, questions: [] },
      jobId: 'job-7'
    }
  )
  assert.equal(asked[0], '/api/sites/wp-x.tracy.test/press')
  assert.equal(await savedPress('s', { fetch: door({ press: null }) }), null, 'no press waiting')
  assert.equal(await savedPress('s', { fetch: door({ code: 'SEAT_NOT_AUTHORIZED' }, 403) }), null)
  assert.equal(
    await savedPress('s', { fetch: door({ press: { id: 'x', answers: {} } }) }),
    null,
    'no answers is no press'
  )
  assert.equal(
    await savedPress('s', { fetch: door({ press: { answers: { name: 'x' } } }) }),
    null,
    'no inspiration id'
  )
  assert.equal(
    (await savedPress('s', { fetch: door({ press: { id: 'x', answers: { name: 'x' } } }) }))?.jobId,
    null,
    'a press whose job is not known yet still resumes, without waiting on a job'
  )
  const thrown = await savedPress('s', {
    fetch: async () => {
      throw new Error('offline')
    }
  })
  assert.equal(thrown, null)
})
