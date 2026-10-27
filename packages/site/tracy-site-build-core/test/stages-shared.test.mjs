/**
 * The four stages every Build shares, each pinned against a fake site behind a fake door: an
 * `apply` that records every call and answers from a script, a `run` that records argv, and a
 * `copyHome` that stands in for the model. What is pinned is WHAT each stage asks the site to do
 * and HOW it reads the answer — never the CMS itself.
 *
 * 🔒 NOTHING HERE RUNS A SHELL AGAINST A SITE. A build dresses a NEW site (Lee, 09/09), and this
 * lane holds neither its files nor a credential for it: every stage that touches the site goes
 * through `apply`. The two commands that still run HERE are the seeder and the browser.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  AUTH_REFUSALS,
  checkStage,
  copyStage,
  inputRootFor,
  patient,
  refusalWords,
  seedStage,
  shotStage,
  siteKeyOf,
  TRANSIENT_REFUSALS
} from '../src/host/stages-shared.mjs'

function folder({ site = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-stages-'))
  mkdirSync(path.join(root, 'docs', 'agents'), { recursive: true })
  if (site)
    writeFileSync(
      path.join(root, 'docs', 'agents', 'design-preview.json'),
      JSON.stringify({
        site: {
          name: 'Tracy',
          url: 'https://lucaswp.tracy.ai/',
          headline: 'One desk.',
          sub: 'For every site.'
        },
        pages: [{ path: '/', type: 'home', label: 'Home' }]
      })
    )
  return root
}

/** A door that records every call and answers per action. */
function fakeDoor(script = {}) {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    const answer = script[call.action]
    return typeof answer === 'function' ? answer(call) : (answer ?? { ok: true })
  }
  return { apply, calls }
}

/** A `run` that records argv and answers per command word. */
function fakeRun(script = {}) {
  const calls = []
  const run = async (cmd, args) => {
    calls.push([cmd, ...args])
    const hit = Object.entries(script).find(([k]) => cmd.endsWith(k))
    const answer = hit ? hit[1] : { code: 0, stdout: '', stderr: '' }
    return typeof answer === 'function' ? answer(args) : answer
  }
  return { run, calls }
}

const wpManifest = async () => ({
  ok: true,
  text: async () => JSON.stringify({ package: 'https://x/tracy.zip' })
})
const offline = async () => {
  throw new Error('offline')
}

const job = (over = {}) => ({
  inspiration: 'airbnb',
  platform: 'wordpress',
  targetSiteKey: 'new.example',
  ...over
})

test('siteKeyOf: the site a job dresses, or null when it names none', () => {
  assert.equal(siteKeyOf({ targetSiteKey: 'a.example' }), 'a.example')
  assert.equal(siteKeyOf({ targetSiteKey: '' }), null)
  assert.equal(siteKeyOf({}), null)
})

test('check: the door says the new site runs the platform, the release is reachable, the id is known → done', async () => {
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress' } })
  const check = checkStage({
    ids: new Set(['airbnb']),
    apply: door.apply,
    platform: 'wordpress',
    get: wpManifest
  })
  const r = await check(job())
  assert.equal(r.status, 'done', r.detail)
  assert.match(r.detail, /new\.example · tracy\.zip/)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['core.manifest']
  )
})

test('check: the site runs another CMS than this plugin builds → failed, naming both', async () => {
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'joomla' } })
  const check = checkStage({
    ids: new Set(['airbnb']),
    apply: door.apply,
    platform: 'wordpress',
    get: wpManifest
  })
  const r = await check(job())
  assert.equal(r.status, 'failed')
  assert.match(r.detail, /runs Joomla; this build is for WordPress/)
})

test('check: no site named, no door, an unknown id, the release out of reach — each a plain sentence; a brand passes the id check', async () => {
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress' } })
  const check = checkStage({
    ids: new Set(['airbnb']),
    apply: door.apply,
    platform: 'wordpress',
    get: wpManifest
  })
  assert.match((await check(job({ targetSiteKey: undefined }))).detail, /names no site/)
  const noDoor = checkStage({ ids: new Set(['airbnb']), apply: null, platform: 'wordpress', get: wpManifest })
  assert.match((await noDoor(job())).detail, /site tools/)
  // ADR 0023: a brand is not in the catalogue and needs no entry there — its look is made at build
  // time from Brand/<host>/tokens.css — so `check` lets it through to the site's own answers.
  assert.equal((await check(job({ inspiration: 'brand:x.example' }))).status, 'done')
  assert.match((await check(job({ inspiration: 'nope' }))).detail, /not a design template/)
  const down = checkStage({
    ids: new Set(['airbnb']),
    apply: door.apply,
    platform: 'wordpress',
    get: offline
  })
  assert.match((await down(job())).detail, /could not be reached/)
})

test('check: a refusal from the door is the stage failing, in the door own words', async () => {
  const door = fakeDoor({
    'core.manifest': { ok: false, code: 'TOOLSET_NOT_GRANTED', error: 'ask your Owner' }
  })
  const check = checkStage({
    ids: new Set(['airbnb']),
    apply: door.apply,
    platform: 'wordpress',
    get: wpManifest
  })
  const r = await check(job())
  assert.equal(r.status, 'failed')
  assert.equal(r.detail, 'ask your Owner')
})

test('copy: nothing to write from → waiting for the form; with words → one take on the design system landing', async () => {
  const root = folder({ site: false })
  try {
    const asked = []
    const copyHome = async (req) => {
      asked.push(req)
      return { ok: true, version: { id: 'v1', title: 'One desk for every site' } }
    }
    const copy = copyStage({ root, copyHome })
    let r = await copy(job({ answers: {} }))
    assert.equal(r.status, 'waiting')
    assert.equal(r.detail, 'form:name,about')
    r = await copy(job({ answers: { name: 'Cô Ba', about: 'Bakes bread.' } }))
    assert.equal(r.status, 'done', r.detail)
    // No page was read off a site that does not exist yet: the take goes on the design system's own landing.
    assert.equal(asked[0].chip, 'landing')
    assert.match(asked[0].prompt, /Cô Ba/)
    const preview = JSON.parse(readFileSync(path.join(root, 'docs', 'agents', 'design-preview.json'), 'utf8'))
    assert.equal(preview.site.name, 'Cô Ba')
    assert.equal(preview.chosen.id, 'airbnb')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('copy: every requested language is required, including a failed translation', async () => {
  const root = folder()
  try {
    const copyHome = async ({ lang }) =>
      lang === 'vi' ? { ok: false, message: 'model down' } : { ok: true, version: { id: 'v', title: 'T' } }
    const r = await copyStage({ root, copyHome })(job({ answers: { languages: ['en', 'vi'] } }))
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /vi · not written \(model down\)/)
    const first = await copyStage({ root, copyHome: async () => ({ ok: false, message: 'nope' }) })(job())
    assert.equal(first.status, 'failed')
    assert.equal(first.detail, 'nope')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('seed: missing executor fails the build; a seeder runs HERE with the target site and door', async () => {
  const root = folder()
  try {
    assert.equal(
      (await seedStage({ root, run: fakeRun().run, seeder: null, doorOrigin: 'http://127.0.0.1:1' })(job()))
        .status,
      'failed'
    )
    const fake = fakeRun()
    const seed = seedStage({
      root,
      run: fake.run,
      seeder: { command: '/opt/tracy/cms/seed-wordpress', args: [] },
      doorOrigin: 'http://127.0.0.1:51700'
    })
    const r = await seed(job())
    assert.equal(r.status, 'done', r.detail)
    const argv = fake.calls[0]
    assert.equal(argv[0], '/opt/tracy/cms/seed-wordpress')
    assert.ok(argv.includes('--target-site') && argv[argv.indexOf('--target-site') + 1] === 'new.example')
    assert.ok(argv.includes('--door') && argv[argv.indexOf('--door') + 1] === 'http://127.0.0.1:51700')
    assert.ok(argv.includes('--pages') && argv.at(-1) === 'all')
    // A rerun for one page relays only that page.
    await seed(job({ rerun: { stage: 'seed', pages: ['/'] } }))
    assert.equal(fake.calls[1].at(-1), '/')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('seed: a brief revision does NOT pass --fresh — the seeder keeps what the previous brief answered', async () => {
  // Measured 13/09/2026 on the integrated Airbnb build, through the product's own answers route:
  // one paragraph added to the brief took the required list from 388 to 539 with 404 keys that had
  // never been pending before. The revise path reruns from `copy`, and the seed stage handed the
  // seeder `--fresh` whenever `rerun.stage === 'copy'` — which is the one flag that discards the
  // cached plan, and with it the three layers that make a follow-up answer accumulate. A brief
  // revision is an addition; only an explicit rewrite may start from scratch.
  const root = folder()
  try {
    const fake = fakeRun()
    const seed = seedStage({
      root,
      run: fake.run,
      seeder: { command: '/opt/tracy/cms/seed-joomla', args: [] },
      doorOrigin: 'http://127.0.0.1:51700'
    })
    await seed(job({ rerun: { stage: 'copy' } }))
    assert.ok(
      !fake.calls[0].includes('--fresh'),
      `a revision must not discard the plan: ${fake.calls[0].join(' ')}`
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('seed: a failed seeder reports its final error after progress output', async () => {
  const root = folder()
  try {
    const seed = seedStage({
      root,
      run: fakeRun({
        'seed-wordpress': {
          code: 1,
          stdout: '',
          stderr: 'seed: sections: 13 sections written\nseed: no plan for /pricing\n'
        }
      }).run,
      seeder: { command: 'seed-wordpress', args: [] },
      doorOrigin: 'http://127.0.0.1:1'
    })
    const r = await seed(job())
    assert.equal(r.status, 'failed')
    assert.equal(r.detail, 'seed: no plan for /pricing')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('shot: no browser → skipped; no address from the fleet → skipped; a browser → one picture of THAT address', async () => {
  const root = folder()
  try {
    assert.equal((await shotStage({ root, run: fakeRun().run, chrome: null })(job())).status, 'skipped')
    const noUrl = await shotStage({ root, run: fakeRun().run, chrome: '/usr/bin/chrome' })(job())
    assert.equal(noUrl.status, 'skipped')
    assert.match(noUrl.detail, /no address/)
    const fake = fakeRun({
      chrome: (args) => {
        const out = args.find((a) => a.startsWith('--screenshot='))?.slice('--screenshot='.length)
        writeFileSync(out, 'png')
        return { code: 0, stdout: '', stderr: '' }
      }
    })
    const r = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async () => new Response('home')
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(r.status, 'done', r.detail)
    assert.equal(fake.calls[0].at(-1), 'https://new.example/')
    assert.ok(existsSync(path.join(root, 'docs', 'agents', 'build', 'home.png')))
    const blocked = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async () => new Response('Private copy', { status: 403 })
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(blocked.status, 'skipped')
    assert.match(blocked.detail, /sign-in/)
    assert.equal(fake.calls.length, 1)
    assert.ok(!existsSync(path.join(root, 'docs', 'agents', 'build', 'home.png')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('shot: with a design record the same page is measured — a report beside the picture, scalar facts on the stage; a probe that cannot run leaves the picture done', async () => {
  const root = folder()
  try {
    const tokens = {
      '--bg': '#ffffff',
      '--fg': '#1d1d1f',
      '--accent': '#0071e3',
      '--font-body': '"SF Pro Text", system-ui, sans-serif'
    }
    mkdirSync(path.join(root, 'docs', 'agents'), { recursive: true })
    writeFileSync(
      path.join(root, 'docs', 'agents', 'design.json'),
      JSON.stringify({
        schemaVersion: 'tracy-site-design/v1',
        id: 'apple',
        source: 'catalog',
        bound: true,
        platform: 'wordpress',
        tokens
      })
    )
    const probe = {
      href: 'https://new.example/',
      seen: 5,
      samples: [
        { prop: 'color', value: 'rgb(29, 29, 31)', count: 4, where: ['p'] },
        { prop: 'background-color', value: 'rgb(120, 200, 40)', count: 1, where: ['.promo'] },
        { prop: 'font-family', value: 'Arial, sans-serif', count: 2, where: ['.legacy'] }
      ]
    }
    const fake = fakeRun({
      chrome: (args) => {
        writeFileSync(args.find((a) => a.startsWith('--screenshot='))?.slice('--screenshot='.length), 'png')
        return { code: 0, stdout: '', stderr: '' }
      },
      node: () => ({
        code: 0,
        stdout: `TRACY_STYLES OK https://new.example/\n${JSON.stringify(probe)}`,
        stderr: ''
      })
    })
    const r = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async () => new Response('home')
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(r.status, 'done', r.detail)
    assert.match(r.detail, /home\.png · design 57\/100, 1 colours off, 2 fonts off/)
    assert.deepEqual(r.facts, {
      designId: 'apple',
      score: 57,
      offColors: 1,
      nearColors: 0,
      offFonts: 2,
      judged: 7
    })
    const probeCall = fake.calls.find((c) => c[0] === process.execPath)
    assert.equal(
      probeCall.at(-1),
      'https://new.example/',
      'the probe measures the address the picture was taken at'
    )
    assert.equal(probeCall[3], '/usr/bin/chrome', 'with the build browser')
    const report = JSON.parse(
      readFileSync(path.join(root, 'docs', 'agents', 'build', 'design-check.json'), 'utf8')
    )
    assert.equal(report.schemaVersion, 'tracy-design-check/v1')
    assert.deepEqual(report.design, { id: 'apple', source: 'catalog' })
    assert.equal(report.colors.offenders[0].nearest.token, '--fg')
    // The probe that cannot run: the picture stays done, the stage says why the check did not.
    const dead = fakeRun({
      chrome: (args) => {
        writeFileSync(args.find((a) => a.startsWith('--screenshot='))?.slice('--screenshot='.length), 'png')
        return { code: 0, stdout: '', stderr: '' }
      },
      node: () => ({ code: 0, stdout: 'TRACY_STYLES NOCHROME chromium exited (1)', stderr: '' })
    })
    const skipped = await shotStage({
      root,
      run: dead.run,
      chrome: '/usr/bin/chrome',
      get: async () => new Response('home')
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(skipped.status, 'done')
    assert.equal(skipped.facts.designCheck, 'skipped')
    assert.match(skipped.facts.designCheckWhy, /chromium exited/)
    // No record at all: the picture, and a fact saying no design was measured.
    rmSync(path.join(root, 'docs', 'agents', 'design.json'))
    const none = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async () => new Response('home')
    })(job({ targetUrl: 'https://new.example/' }))
    assert.deepEqual(none.facts, { designCheck: 'no-design' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('parallel owned builds snapshot only their brief and copy; seed carries the owner session', async () => {
  const root = folder()
  try {
    const copy = copyStage({
      root,
      copyHome: async ({ prompt }) => ({
        ok: true,
        version: {
          id: prompt.includes('Bakery') ? 'bakery' : 'hotel',
          title: 'Words',
          slots: { title: prompt }
        }
      })
    })
    const builds = ['Bakery', 'Hotel'].map((name) =>
      job({ job: name, ownerSessionId: `owner-${name}`, answers: { name, about: `${name} services` } })
    )
    await Promise.all(builds.map((build) => copy(build)))
    for (const build of builds) {
      const inputs = inputRootFor(root, build)
      const preview = JSON.parse(readFileSync(path.join(inputs, 'docs/agents/design-preview.json')))
      assert.equal(preview.site.name, build.answers.name)
      assert.equal(preview.site.headline, undefined)
      const words = JSON.parse(readFileSync(path.join(inputs, 'docs/agents/design-copy/airbnb.json')))
      assert.equal(words.pages.landing.selected, build.answers.name.toLowerCase())
      const fake = fakeRun()
      await seedStage({
        root,
        run: fake.run,
        seeder: { command: 'seed', args: [] },
        doorOrigin: 'http://127.0.0.1:1'
      })(build)
      assert.equal(fake.calls[0][fake.calls[0].indexOf('--session') + 1], build.ownerSessionId)
      assert.equal(
        fake.calls[0][fake.calls[0].indexOf('--preview') + 1],
        path.join(inputs, 'docs/agents/design-preview.json')
      )
    }
    assert.equal(
      JSON.parse(readFileSync(path.join(root, 'docs/agents/design-preview.json'))).site.name,
      'Tracy'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('patient: asks again while the lane is not ready, and never argues with a decision', async () => {
  /** @param {unknown[]} script */
  const door = (script) => {
    const calls = []
    const apply = async (call) => {
      calls.push(call)
      return script[Math.min(calls.length - 1, script.length - 1)]
    }
    return { apply, calls }
  }
  const slept = []
  const wait = async (ms) => {
    slept.push(ms)
  }

  // "Not yet" three times, then the door answers. One call would have failed the build.
  const notYet = door([
    { ok: false, code: 'NOT_SIGNED_IN' },
    { ok: false, code: 'NO_VIEWER' },
    { ok: false, code: 'WORKSPACE_UNREACHABLE' },
    { ok: true, contract: 'tracy-apple/j6/1.2.0' }
  ])
  const got = await patient(notYet.apply, { wait })({ siteKey: 's.tracy.site', action: 'content.contract' })
  assert.deepEqual(got, { ok: true, contract: 'tracy-apple/j6/1.2.0' })
  assert.equal(notYet.calls.length, 4)
  assert.deepEqual(slept, [2000, 2000, 2000])

  // A decision is answered once and returned as it came: asking a seat book six times whether this
  // person may write gets the same no, six times slower.
  for (const code of ['SEAT_NOT_AUTHORIZED', 'COMPONENT_NOT_REGISTERED', 'ACTION_NOT_ALLOWED']) {
    const flat = door([{ ok: false, code }])
    const answer = await patient(flat.apply, { wait })({ siteKey: 's.tracy.site', action: 'info' })
    assert.equal(flat.calls.length, 1, code)
    assert.deepEqual(answer, { ok: false, code })
  }

  // 🔒 A SECRET THAT DOES NOT PAIR DOES NOT START PAIRING BECAUSE WE ASKED AGAIN.
  assert.equal(TRANSIENT_REFUSALS.has('ACTOR_NOT_ACCEPTED'), false)
  const unpaired = door([{ ok: false, code: 'ACTOR_NOT_ACCEPTED' }])
  await patient(unpaired.apply, { wait })({ siteKey: 's.tracy.site', action: 'info' })
  assert.equal(unpaired.calls.length, 1)

  // Patience is bounded, and the last answer is what the caller gets — not a made-up one.
  const never = door([{ ok: false, code: 'NOT_SIGNED_IN' }])
  const last = await patient(never.apply, { wait, tries: 3 })({ siteKey: 's.tracy.site', action: 'info' })
  assert.equal(never.calls.length, 3)
  assert.deepEqual(last, { ok: false, code: 'NOT_SIGNED_IN' })
})

test('refusalWords: a person reads a sentence, never an identifier', () => {
  // What Tracy's own doors answer: a code and nothing else. This is the exact shape that put the
  // word NOT_SIGNED_IN in front of a customer on 17/09.
  assert.match(refusalWords({ ok: false, code: 'NOT_SIGNED_IN' }, 'fallback'), /Reload this page/)
  const unpaired = refusalWords({ ok: false, code: 'ACTOR_NOT_ACCEPTED' }, 'fallback')
  assert.match(unpaired, /not your sign-in/)
  assert.match(unpaired, /signing in again will not help/)

  // The door's own words still win when it has any: a component that explains itself is not
  // improved by a sentence written months earlier.
  assert.equal(
    refusalWords({ ok: false, code: 'NOT_SIGNED_IN', message: 'the door said this' }, 'f'),
    'the door said this'
  )
  assert.equal(
    refusalWords({ ok: false, code: 'install_failed', error: 'no disk space' }, 'f'),
    'no disk space'
  )

  // A code nobody has written a line for falls back to `say`, which still prefers the code to
  // nothing — and a shapeless answer gets the caller's own fallback.
  assert.equal(
    refusalWords({ ok: false, code: 'A_CODE_NOBODY_HAS_WRITTEN_YET' }, 'f'),
    'A_CODE_NOBODY_HAS_WRITTEN_YET'
  )
  assert.equal(refusalWords(null, 'f'), 'f')
  assert.equal(refusalWords({ ok: false }, 'f'), 'f')

  // Every refusal that is about WHO the call acts as has a sentence of its own: the set and the
  // wording must not drift apart, or the Build tab offers a sign-in over an identifier.
  for (const code of AUTH_REFUSALS) {
    assert.notEqual(refusalWords({ ok: false, code }, 'f'), code, code)
    assert.notEqual(refusalWords({ ok: false, code }, 'f'), 'f', code)
  }
})

test('shot: a same-site redirect (Joomla sends / to /en/) is followed and THAT page is photographed; a redirect to another site is not (29/09)', async () => {
  const root = folder()
  try {
    const fake = fakeRun({
      chrome: (args) => {
        const out = args.find((a) => a.startsWith('--screenshot='))?.slice('--screenshot='.length)
        writeFileSync(out, 'png')
        return { code: 0, stdout: '', stderr: '' }
      }
    })
    const asked = []
    const r = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async (url) => {
        asked.push(url)
        return url === 'https://new.example/'
          ? new Response('', { status: 301, headers: { location: '/en/' } })
          : new Response('home')
      }
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(r.status, 'done', r.detail)
    assert.deepEqual(asked, ['https://new.example/', 'https://new.example/en/'])
    assert.equal(fake.calls[0].at(-1), 'https://new.example/en/')

    const away = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example/' } })
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(away.status, 'skipped')
    assert.match(away.detail, /another address/)
    assert.equal(fake.calls.length, 1)

    let hops = 0
    const loop = await shotStage({
      root,
      run: fake.run,
      chrome: '/usr/bin/chrome',
      get: async () => {
        hops += 1
        return new Response('', { status: 302, headers: { location: `/r${hops}/` } })
      }
    })(job({ targetUrl: 'https://new.example/' }))
    assert.equal(loop.status, 'skipped')
    assert.ok(hops <= 4, `${hops} requests`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
