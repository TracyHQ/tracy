import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SHOWN_LANGUAGE_IDS } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import { makeStages, STAGES } from '../src/host/stages.mjs'
const job = {
  job: 'build-test',
  inspiration: 'apple',
  platform: 'joomla',
  targetSiteKey: 'new.example',
  runs: 1
}
function fixture() {
  const calls = []
  const state = { ok: true, contract: 'tracy-apple/j6/1.1.0' }
  const stages = makeStages({
    root: '/tmp/nowhere',
    apply: async (call) => {
      calls.push(call)
      return state
    },
    run: async () => {
      throw Error('Unexpected shell')
    },
    seeder: null,
    chrome: null
  })
  return { calls, state, stages }
}
test('the quickstart recipe only inspects and binds original presentation', async () => {
  // `language` sits between `seed` and `shot`: it translates what seeding has just written, and
  // the picture is taken of the site that exists afterwards.
  // Each stage is a line of the task list: it has a name in every interface language's words, in this order.
  for (const lang of SHOWN_LANGUAGE_IDS) {
    const named = Object.keys(
      JSON.parse(readFileSync(new URL(`../words/${lang}.json`, import.meta.url), 'utf8')).stages
    )
    assert.deepEqual(
      named.filter((id) => STAGES.includes(id)),
      [...STAGES],
      `words/${lang}.json stages`
    )
  }
  const f = fixture()
  for (const name of ['check', 'template', 'style']) assert.equal((await f.stages[name](job)).status, 'done')
  assert.deepEqual(
    f.calls.map((c) => [c.action, c.params.operation]),
    [
      ['content.contract', 'inspect'],
      ['content.contract', 'inspect'],
      ['content.contract', 'bind']
    ]
  )
})
test('a second design on the same base is built, not refused', async () => {
  // One base archive serves several designs now, so "not Apple" is no longer a reason to stop.
  // What the stage checks is the contract the SITE reports, which is the design that is on it.
  const f = fixture()
  f.state.contract = 'tracy-airbnb/j6/1.0.0'
  const airbnb = {
    ...job,
    inspiration: 'airbnb',
    designPlan: {
      requestedDesign: 'airbnb',
      effectiveDesign: 'airbnb',
      contractProfile: 'tracy-airbnb/j6/1.0.0',
      fallback: false
    }
  }
  assert.equal((await f.stages.check(airbnb)).status, 'done')
})
test('a build planned for one design refuses a site carrying another', async () => {
  const f = fixture()
  const airbnb = {
    ...job,
    inspiration: 'airbnb',
    designPlan: {
      requestedDesign: 'airbnb',
      effectiveDesign: 'airbnb',
      contractProfile: 'tracy-airbnb/j6/1.0.0',
      fallback: false
    }
  }
  // The site is bound to Apple; the plan that arrived says Airbnb. Dressing it anyway would label
  // the result with a design that is not on the site.
  assert.equal((await f.stages.check(airbnb)).status, 'failed')
})
test('a site reporting no contract cannot start seeding', async () => {
  const f = fixture()
  delete f.state.contract
  assert.equal((await f.stages.check(job)).status, 'failed')
})
test('a fallback build says so in the job, so the agent cannot describe a site that does not exist', async () => {
  const f = fixture()
  const fallback = {
    ...job,
    inspiration: 'stripe',
    designPlan: {
      requestedDesign: 'stripe',
      effectiveDesign: 'apple',
      contractProfile: 'tracy-apple/j6/1.1.0',
      fallback: true,
      fallbackReason: 'template_unavailable'
    }
  }
  const result = await f.stages.check(fallback)
  assert.equal(result.status, 'done')
  assert.match(result.detail, /stripe/)
  assert.match(result.detail, /apple template/)
})
test('a fallback build seeds the design the site actually carries', async () => {
  // The customer picked a design with no Joomla template; the site was built on Apple. The seeder
  // must be handed Apple, not the design that was asked for.
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-build-'))
  const stages = makeStages({
    root,
    apply: async () => ({ ok: true, contract: 'tracy-apple/j6/1.1.0' }),
    run: async () => {
      throw Error('Unexpected shell')
    },
    seeder: null,
    chrome: null
  })
  const fallback = {
    ...job,
    inspiration: 'stripe',
    answers: { name: 'Harbor', about: 'A harbour company' },
    designPlan: {
      requestedDesign: 'stripe',
      effectiveDesign: 'apple',
      contractProfile: 'tracy-apple/j6/1.1.0',
      fallback: true,
      fallbackReason: 'template_unavailable'
    }
  }
  assert.equal((await stages.copy(fallback)).status, 'done')
  const preview = JSON.parse(readFileSync(path.join(root, 'docs', 'agents', 'design-preview.json'), 'utf8'))
  assert.equal(preview.chosen.id, 'apple')
  assert.equal(preview.requestedDesign, 'stripe')
  rmSync(root, { recursive: true, force: true })
})
test('missing customer content waits without modifying the site', async () => {
  const f = fixture()
  assert.equal((await f.stages.copy(job)).status, 'waiting')
  assert.equal(f.calls.length, 0)
})
/** A site that answers `retire` in `chunks` calls, recording every call and every seeder run. */
function retiring({
  chunks = 1,
  refuse = null,
  inFlightFirst = false,
  source = null,
  oldCowork = false
} = {}) {
  const calls = [],
    runs = [],
    order = []
  let left = chunks
  let first = true
  // `source`: what the site's English edition is called, for a Claude Cowork plugin that knows sourceLanguage.*.
  let current = source
  const stages = makeStages({
    root: mkdtempSync(path.join(tmpdir(), 'retire-')),
    apply: async (call) => {
      calls.push(call)
      const op = call.params.operation
      // What a Claude Cowork plugin before 0.17.2 answers: its contract door knows no sourceLanguage.*.
      if (oldCowork && op.startsWith('sourceLanguage.'))
        return { ok: false, error: 'contract_failed', message: 'Unknown contract operation' }
      if (current !== null && op === 'sourceLanguage.plan') return { ok: true, published: 'en-GB', current }
      if (current !== null && op === 'sourceLanguage.set') {
        current = call.params.locale
        return { ok: true, status: 'completed', source: current }
      }
      if (current !== null && op === 'sourceLanguage.revert') {
        current = 'en-GB'
        return { ok: true, status: 'reverted', source: current }
      }
      if (op !== 'multilingual.retire') return { ok: true, contract: 'tracy-business/j6/1.1.0' }
      order.push('retire')
      if (refuse) return { ok: false, error: 'bad_params', message: refuse }
      if (inFlightFirst && first) {
        first = false
        return {
          ok: false,
          error: 'conflict',
          message: 'A language job is in flight for vi-VN at phase articles'
        }
      }
      first = false
      left -= 1
      return {
        ok: true,
        status: left > 0 ? 'running' : 'completed',
        hidden: { language: 40, module: 120 },
        remaining: left
      }
    },
    run: async (command, args) => {
      runs.push(args.at(-1))
      order.push(`derive ${args.at(-1)}`)
      return { code: 0, stdout: '', stderr: '' }
    },
    seeder: { command: 'node', args: ['seed.mjs'] },
    doorOrigin: 'http://127.0.0.1:1'
  })
  return { calls, runs, order, stages }
}
const retires = (calls) => calls.filter((c) => c.params.operation === 'multilingual.retire')

test('a one-language site still hides the editions the quickstart shipped', async () => {
  // 🔒 A QUICKSTART MAY SHIP EDITIONS OF ITS OWN. The Business archive carries 43 content languages;
  // measured 23/09/2026 on `j-h0n2f4`, the switcher and hreflang offered all of them after the
  // build. A site asked for in one language is exactly the case where 42 of them are wrong, so the
  // stage no longer skips it: it retires, and nothing is translated.
  const f = retiring()
  const single = { ...job, answers: { name: 'Acme', about: 'We make things', languages: ['en'] } }
  const result = await f.stages.language(single)
  assert.equal(result.status, 'done')
  assert.deepEqual(
    retires(f.calls).map((c) => c.params.keep),
    [['en-GB']]
  )
  assert.match(retires(f.calls)[0].params.apply_id, /^mlang-/)
  assert.deepEqual(f.runs, [])
  assert.match(result.detail, /40 other language\(s\) hidden/)
})
test('the languages nobody asked for are hidden BEFORE a language is derived', async () => {
  // Before, not after: the archive's own zh-CN edition must leave before the copy made from the
  // customer's words arrives, or the site holds two zh-CN homes for the length of the stage.
  const f = retiring({ chunks: 3 })
  const many = { ...job, answers: { name: 'Acme', about: 'x', languages: ['en', 'zh-CN', 'vi-VN'] } }
  const result = await f.stages.language(many)
  assert.equal(result.status, 'done')
  // Three calls before (a running retire is asked again until it completes), one after the editions
  // land — which hides any archive row the derivation left showing.
  assert.deepEqual(f.order, ['retire', 'retire', 'retire', 'derive zh-CN', 'derive vi-VN', 'retire'])
  assert.deepEqual(retires(f.calls)[0].params.keep, ['en-GB', 'zh-CN', 'vi-VN'])
  assert.equal(new Set(retires(f.calls).map((c) => c.params.apply_id)).size, 1, 'one pass, one undo')
})
test('a language job left in flight is finished first, and the languages are hidden after it', async () => {
  // 🔒 MEASURED 23/09/2026 ON `j-ee6vsk`: a vi-VN job had stopped at phase `articles`, the retry asked
  // for the retire first, the Claude Cowork plugin rightly refused it while a job was in flight — and the stage
  // failed on that refusal, so the job that had to finish never ran again.
  const f = retiring({ inFlightFirst: true })
  const result = await f.stages.language({
    ...job,
    answers: { name: 'Acme', about: 'x', languages: ['en', 'vi-VN'] }
  })
  assert.equal(result.status, 'done')
  assert.deepEqual(f.order, ['retire', 'derive vi-VN', 'retire'])
})
const contractOps = (calls) => calls.map((c) => c.params.operation).filter((o) => o !== 'inspect')
test('an English variant renames the English edition before anything is hidden or derived', async () => {
  // Lee, 23/09/2026: the Business archive is en-GB and ships no en-US edition; a copy lost the main
  // menu. The source is RELABELLED (Claude Cowork plugin 0.17.2), first, so retire keeps it under its new tag.
  const f = retiring({ source: 'en-GB' })
  const result = await f.stages.language({
    ...job,
    answers: { name: 'Acme', about: 'x', languages: ['en-us', 'vi-VN'] }
  })
  assert.equal(result.status, 'done')
  const seen = contractOps(f.calls).filter(
    (o) => o.startsWith('sourceLanguage.') || o === 'multilingual.retire'
  )
  assert.deepEqual(seen, [
    'sourceLanguage.plan',
    'sourceLanguage.set',
    'multilingual.retire',
    'multilingual.retire'
  ])
  assert.equal(f.calls.find((c) => c.params.operation === 'sourceLanguage.set').params.locale, 'en-US')
  assert.match(f.calls.find((c) => c.params.operation === 'sourceLanguage.set').params.apply_id, /^srclang-/)
  assert.deepEqual(retires(f.calls)[0].params.keep, ['en-US', 'vi-VN'])
  assert.deepEqual(f.runs, ['vi-VN'], 'en-US is not derived as a second language')
  assert.match(result.detail, /vi-VN added beside en-US/)
  assert.match(result.detail, /English edition is now en-US/)
})
test('a site already called by the variant is not relabelled again', async () => {
  const f = retiring({ source: 'en-US' })
  const result = await f.stages.language({
    ...job,
    answers: { name: 'Acme', about: 'x', languages: ['en-US'] }
  })
  assert.equal(result.status, 'done')
  assert.deepEqual(
    contractOps(f.calls).filter((o) => o.startsWith('sourceLanguage.')),
    ['sourceLanguage.plan']
  )
  assert.match(result.detail, /Published in en-US/)
})
test('a customer who drops the variant gets the published English back', async () => {
  const f = retiring({ source: 'en-US' })
  const result = await f.stages.language({ ...job, answers: { name: 'Acme', about: 'x', languages: ['en'] } })
  assert.equal(result.status, 'done')
  assert.deepEqual(
    contractOps(f.calls).filter((o) => o.startsWith('sourceLanguage.')),
    ['sourceLanguage.plan', 'sourceLanguage.revert']
  )
  assert.deepEqual(retires(f.calls)[0].params.keep, ['en-GB'])
})
test('a Claude Cowork plugin too old to rename the English edition keeps en-GB, and says so', async () => {
  const f = retiring({ oldCowork: true })
  const result = await f.stages.language({
    ...job,
    answers: { name: 'Acme', about: 'x', languages: ['en-US', 'vi-VN'] }
  })
  assert.equal(result.status, 'done')
  assert.deepEqual(retires(f.calls)[0].params.keep, ['en-GB', 'vi-VN'])
  assert.match(result.detail, /cannot call the English edition en-US; it stays en-GB/)
})
test('an old Claude Cowork plugin is not asked anything for a site in the published English', async () => {
  const f = retiring({ oldCowork: true })
  const result = await f.stages.language({ ...job, answers: { name: 'Acme', about: 'x', languages: ['en'] } })
  assert.equal(result.status, 'done')
  assert.doesNotMatch(result.detail, /English edition/)
})
test('a Claude Cowork plugin too old to retire leaves the languages as they were, and says so', async () => {
  const f = retiring({ refuse: 'Unknown multilingual operation' })
  const many = { ...job, answers: { name: 'Acme', about: 'x', languages: ['en', 'zh-CN'] } }
  const result = await f.stages.language(many)
  assert.equal(result.status, 'done')
  assert.deepEqual(f.runs, ['zh-CN'])
  assert.match(result.detail, /cannot hide the other languages/)
})
test('a refused translation says a retry repeats the same check', async () => {
  // 🔒 MEASURED 23/09/2026 ON `j-h0n2f4`: "The translation is not usable: … the figure 2004 is missing"
  // reached the chat, and the agent told the customer it was a translation-quality gate and to
  // retry. The translations KEPT the figure — the check was wrong — and the seeder had already
  // asked the model again with the reason attached; a retry replays the cached words through the
  // same check. The stage now says so, so whoever reads it looks at the refusal, not the button.
  const failing = makeStages({
    root: mkdtempSync(path.join(tmpdir(), 'refused-')),
    apply: async (call) =>
      call.params.operation === 'multilingual.retire'
        ? { ok: true, status: 'completed', hidden: {} }
        : { ok: true, contract: 'tracy-business/j6/1.1.0' },
    run: async () => ({
      code: 1,
      stdout: '',
      stderr:
        'seed: The translation is not usable: zh-CN::module-441.0: the figure 2004 is missing from the translation\n'
    }),
    seeder: { command: 'node', args: ['seed.mjs'] },
    doorOrigin: 'http://127.0.0.1:1'
  })
  const result = await failing.language({
    ...job,
    answers: { name: 'Acme', about: 'x', languages: ['en', 'zh-CN'] }
  })
  assert.equal(result.status, 'failed')
  assert.match(result.detail, /figure 2004/)
  assert.match(result.detail, /asked again/)
  assert.match(result.detail, /retry repeats the same check/)
})
test('a retire the Claude Cowork plugin refuses for any other reason stops the stage', async () => {
  const f = retiring({ refuse: 'Presentation drift: module-441 — position' })
  const result = await f.stages.language({ ...job, answers: { name: 'Acme', about: 'x', languages: ['en'] } })
  assert.equal(result.status, 'failed')
  assert.match(result.detail, /Presentation drift/)
})
test('the copy stage no longer refuses a second language — it announces it', async () => {
  // It used to answer `waiting` here, which is why `language.add` could not finish for ANY
  // locale, French included.
  const f = fixture()
  const many = {
    ...job,
    answers: { name: 'Acme', about: 'We make things', languages: ['en', 'zh-CN'] }
  }
  const result = await f.stages.copy({ ...many, job: 'build-copy-langs' })
  assert.equal(result.status, 'done')
  assert.match(result.detail, /zh-CN follow the source edition/)
})
/** A ja-kinetic-shaped site: sealed, no multilingual profile, answering every contract call it is asked. */
function oneLanguage({
  setAnswer = { ok: true, status: 'completed', locale: 'vi-VN', packVersion: '4.2.2.1' }
} = {}) {
  const calls = []
  const root = mkdtempSync(path.join(tmpdir(), 'one-language-'))
  const stages = makeStages({
    root,
    apply: async (call) => {
      calls.push(call)
      if (call.params.operation === 'siteLanguage.set') return setAnswer
      return { ok: true, contract: 'ja-kinetic/j6/1.0.0' }
    },
    run: async () => {
      throw Error('Unexpected shell')
    },
    seeder: { command: 'node', args: ['seed.mjs'] },
    doorOrigin: 'http://127.0.0.1:1'
  })
  const plan = {
    designPlan: { workflow: 'template', contractProfile: 'ja-kinetic/j6/1.0.0', multilingual: false }
  }
  return { calls, root, stages, plan }
}
const ops = (calls) => calls.map((c) => c.params.operation)

test('a quickstart with no second edition is written in the ONE language chosen, not in en-GB', async () => {
  // ja-kinetic has no multilingual profile, so it can never carry two editions. The customer's
  // language is the site's language: it is the source the seed writes in, and en-GB is not forced
  // in front of it — forcing it is what put Vietnamese words into an "(en)" edition on 23/09.
  const f = oneLanguage()
  const vi = {
    ...job,
    ...f.plan,
    job: 'build-one-lang',
    answers: { name: 'Tôn Việt', about: 'Tôn lợp', languages: ['vi-vn'] }
  }
  const copied = await f.stages.copy(vi)
  assert.equal(copied.status, 'done')
  const preview = JSON.parse(readFileSync(path.join(f.root, 'docs', 'agents', 'design-preview.json'), 'utf8'))
  assert.deepEqual(preview.site.languages, ['vi-VN'])
  assert.equal(preview.site.sourceLanguage, 'vi-VN')
  rmSync(f.root, { recursive: true, force: true })
})

test('the language stage makes the chosen language the default instead of adding an edition', async () => {
  const f = oneLanguage()
  const vi = { ...job, ...f.plan, answers: { name: 'Tôn Việt', about: 'Tôn lợp', languages: ['vi-vn'] } }
  const result = await f.stages.language(vi)
  assert.equal(result.status, 'done')
  const set = f.calls.find((c) => c.params.operation === 'siteLanguage.set')
  assert.equal(set.params.locale, 'vi-VN')
  assert.match(set.params.apply_id, /^slang-/)
  assert.equal(ops(f.calls).includes('multilingual.retire'), false, 'nothing to retire: there is one edition')
  assert.match(result.detail, /vi-VN/)
  rmSync(f.root, { recursive: true, force: true })
})

test('an English one-language site asks for nothing at all', async () => {
  const f = oneLanguage()
  const en = { ...job, ...f.plan, answers: { name: 'Acme', about: 'x', languages: ['en'] } }
  const result = await f.stages.language(en)
  assert.equal(result.status, 'done')
  assert.equal(
    ops(f.calls).some((op) => op === 'siteLanguage.set' || op === 'multilingual.retire'),
    false
  )
  rmSync(f.root, { recursive: true, force: true })
})

test('a component too old to set the language fails the stage out loud', async () => {
  // A finished site in the wrong language is the "looks like it worked" failure: say it.
  const f = oneLanguage({
    setAnswer: { ok: false, error: 'contract_failed', message: 'Unknown contract operation' }
  })
  const vi = { ...job, ...f.plan, answers: { name: 'Tôn Việt', about: 'Tôn lợp', languages: ['vi-vn'] } }
  const result = await f.stages.language(vi)
  assert.equal(result.status, 'failed')
  assert.match(result.detail, /Tracy Cowork component/)
  rmSync(f.root, { recursive: true, force: true })
})

test('a language stage with no seeder says so rather than pretending', async () => {
  const f = fixture()
  const many = { ...job, answers: { name: 'Acme', about: 'x', languages: ['en', 'zh-CN'] } }
  const result = await f.stages.language(many)
  assert.equal(result.status, 'failed')
  assert.match(result.detail, /seeder is unavailable/)
})
test('a refused contract has no fallback writer', async () => {
  const f = fixture()
  f.state.ok = false
  await assert.rejects(() => f.stages.style(job), /unavailable/)
  assert.equal(f.calls.length, 1)
})

test('the quickstart seed finishes on its own: pages surface, demo words kept', async () => {
  // The seven stages have to end in a site, not in a question. A JoomlArt quickstart carries the
  // vendor's whole demo site — ja-kinetic: 250 articles, 3,634 of its 4,662 slots, 727 of them
  // evidence-required — so without these two flags `seed` stops at CONTENT_REQUIRED on every
  // unattended build. `--surface pages` plans what the routed pages show; `--keep-demo` leaves an
  // unbacked slot with the demo words instead of refusing to finish. Neither writes anything the
  // contract would not have accepted.
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-build-'))
  let argv = null
  const stages = makeStages({
    root,
    apply: async () => ({ ok: true, contract: 'ja-kinetic/j6/1.0.0' }),
    run: async (_command, args) => {
      argv = args
      return { code: 0, stdout: '', stderr: '' }
    },
    seeder: { command: 'seed-joomla', args: [] },
    doorOrigin: 'http://127.0.0.1:1',
    chrome: null
  })
  const seeded = { ...job, answers: { name: 'Harbor', about: 'A harbour company' } }
  assert.equal((await stages.copy(seeded)).status, 'done')
  assert.equal((await stages.seed(seeded)).status, 'done')
  assert(argv.includes('--keep-demo'), 'the seed stage asks the seeder to keep demo words')
  assert.equal(argv[argv.indexOf('--surface') + 1], 'pages')
  rmSync(root, { recursive: true, force: true })
})

test('the seed card counts the facts the model invented, so the customer knows which to replace', async () => {
  // Lee, 23/09/2026: a missing phone, email or address is written as a believable one rather than
  // left as the archive's; the card is where the customer learns those lines are not theirs yet.
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-build-'))
  const stages = makeStages({
    root,
    apply: async () => ({ ok: true, contract: 'tracy-business/j6/1.1.0' }),
    run: async (_command, args) => {
      const seedDir = path.join(path.dirname(args[args.indexOf('--preview') + 1]), 'seed')
      mkdirSync(seedDir, { recursive: true })
      writeFileSync(
        path.join(seedDir, 'contract-mapping.json'),
        JSON.stringify({
          changes: { 'contact.phone': '+84 28 5555 0167', 'contact.email': 'hello@example.com' },
          invented: ['contact.phone', 'contact.email', 'dropped.later']
        })
      )
      return { code: 0, stdout: '', stderr: '' }
    },
    seeder: { command: 'seed-joomla', args: [] },
    doorOrigin: 'http://127.0.0.1:1',
    chrome: null
  })
  const seeded = { ...job, answers: { name: 'Sarah', about: 'Weddings' } }
  await stages.copy(seeded)
  const done = await stages.seed(seeded)
  assert.equal(done.status, 'done')
  assert.match(done.detail, /2 invented fact\(s\) for the customer to replace/)
  rmSync(root, { recursive: true, force: true })
})

test('the quickstart seed hides the demo, and the card says how much — or why not', async () => {
  // ja-kinetic ships 240 demo blog posts about a company that does not exist. The Claude Cowork plugin hides
  // what the contract's reviewed demo-trim profile lists; the card is the one place the customer
  // learns whether that happened, so both outcomes have to reach it in words.
  for (const [record, said] of [
    [{ status: 'hidden', hidden: 247 }, /247 demo row\(s\) hidden/],
    [
      {
        status: 'skipped',
        reason: "the site's Tracy component is older than 0.16.8, so the demo posts stay visible"
      },
      /older than 0\.16\.8/
    ]
  ]) {
    const root = mkdtempSync(path.join(tmpdir(), 'tracy-build-'))
    let argv = null
    const stages = makeStages({
      root,
      apply: async () => ({ ok: true, contract: 'ja-kinetic/j6/1.0.0' }),
      run: async (_command, args) => {
        argv = args
        const seedDir = path.join(path.dirname(args[args.indexOf('--preview') + 1]), 'seed')
        mkdirSync(seedDir, { recursive: true })
        writeFileSync(path.join(seedDir, 'demo-trim.json'), JSON.stringify(record))
        return { code: 0, stdout: '', stderr: '' }
      },
      seeder: { command: 'seed-joomla', args: [] },
      doorOrigin: 'http://127.0.0.1:1',
      chrome: null
    })
    const seeded = { ...job, answers: { name: 'Harbor', about: 'A harbour company' } }
    await stages.copy(seeded)
    const done = await stages.seed(seeded)
    assert(argv.includes('--trim-demo'), 'the seed stage asks the Claude Cowork plugin to hide the demo')
    assert.equal(done.status, 'done')
    assert.match(done.detail, said)
    rmSync(root, { recursive: true, force: true })
  }
})

// Measured 21/09 on `site-gfxzba`: a JoomlArt template card (ja-vega) is installed as released,
// with nothing sealing it and the Claude Cowork plugin the manifest names (0.12.0). Every stage asked
// `content.contract` and the build died at `check` with `unknown action: content.contract`.
function unsealedFixture(answer) {
  const calls = []
  const stages = makeStages({
    root: '/tmp/nowhere',
    apply: async (call) => {
      calls.push(call)
      return answer
    },
    run: async () => {
      throw Error('Unexpected shell')
    },
    seeder: { command: 'seed-joomla', args: [] },
    chrome: null
  })
  return { calls, stages }
}
const OLD_COWORK = { ok: false, error: 'bad_action', message: 'unknown action: content.contract' }
const templateCard = {
  ...job,
  inspiration: 'ja-vega',
  answers: { name: 'Vega', about: 'A landing page', languages: ['en', 'fr-FR'] },
  designPlan: {
    requestedDesign: 'ja-vega',
    effectiveDesign: 'ja-vega',
    contractProfile: null,
    workflow: 'template',
    fallback: false
  }
}
test('a quickstart with no contract is built, and its words are handed to the agent', async () => {
  const f = unsealedFixture(OLD_COWORK)
  const check = await f.stages.check(templateCard)
  assert.equal(check.status, 'done')
  assert.match(check.detail, /no content contract/)
  assert.equal((await f.stages.template(templateCard)).status, 'done')
  assert.equal((await f.stages.style(templateCard)).status, 'skipped')
  const seed = await f.stages.seed(templateCard)
  assert.equal(seed.status, 'skipped')
  assert.equal(seed.code, 'PERSONALIZE_BY_AGENT', 'the code the notification and the Build tab key on')
  assert.match(seed.detail, /tracy_site/)
  const language = await f.stages.language(templateCard)
  assert.equal(language.status, 'skipped')
  assert.match(language.detail, /fr-FR/)
  assert(
    f.calls.every((c) => c.action === 'content.contract'),
    'nothing is written: every call was a question the Claude Cowork plugin refused'
  )
})
test('a Claude Cowork plugin older than the door is unsealed whatever the plan says', async () => {
  // It cannot have bound anything: binding IS a `content.contract` call.
  const f = unsealedFixture(OLD_COWORK)
  assert.equal((await f.stages.check(job)).status, 'done')
})
test('`unavailable` reads as unsealed only when the plan agrees', async () => {
  // A Claude Cowork plugin with the door and no profile says `unavailable` — and so does a sealed site whose
  // profile broke. The second must stay a failure, so the plan breaks the tie, never alone.
  const unavailable = {
    ok: false,
    error: 'unavailable',
    message: 'Quickstart contract Claude Cowork plugin is unavailable'
  }
  assert.equal((await unsealedFixture(unavailable).stages.check(templateCard)).status, 'done')
  await assert.rejects(() => unsealedFixture(unavailable).stages.check(job), /unavailable/)
})
test('a sealed site is never read as unsealed because the plan says template', async () => {
  // The plan rode in from the browser; the site answers with its contract, and that wins.
  const f = fixture()
  assert.equal((await f.stages.style(templateCard)).status, 'done')
  assert.deepEqual(
    f.calls.map((c) => c.params.operation),
    ['bind']
  )
})

test('a 0.16 cowork that falls back to the Apple profile reads as unsealed when the plan agrees', async () => {
  // Measured 22/09 on `site-ywpw1f` (ja-vega, Claude Cowork plugin 0.16.4): with no `contract` param the
  // component verifies the site against its DEFAULT profile, tracy-apple, and every inspection of a
  // JoomlArt site fails on a Tracy template file that was never there.
  const failed = {
    ok: false,
    error: 'contract_failed',
    message: 'Presentation asset changed: templates/tracy/acm/accordion/config.xml'
  }
  assert.equal((await unsealedFixture(failed).stages.check(templateCard)).status, 'done')
  // Without the plan's word it is what a sealed site that drifted says, and it stays a failure.
  await assert.rejects(() => unsealedFixture(failed).stages.check(job), /Presentation asset changed/)
})
