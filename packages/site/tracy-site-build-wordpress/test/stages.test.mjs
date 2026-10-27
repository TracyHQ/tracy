/**
 * The two stages that are WordPress's own — the theme and the look — pinned against a fake door.
 * The four shared ones are core's (`tracy-site-build-core/test/stages-shared.test.mjs`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SHOWN_LANGUAGE_IDS } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import { makeStages, STAGES } from '../src/host/stages.mjs'

/** A door that records every call and answers per action. */
function fakeDoor(script = {}) {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    const answer = script[call.action]
    // A Claude Cowork plugin from before the contract door (0.11.0 and earlier) answers `bad_action`; a test
    // that wants a bound site scripts `content.contract` itself.
    if (answer === undefined && call.action === 'content.contract')
      return { ok: false, error: 'bad_action', message: 'unknown action' }
    return typeof answer === 'function' ? answer(call) : (answer ?? { ok: true })
  }
  return { apply, calls }
}

const deps = (door) => ({
  root: '/tmp/nowhere',
  ids: new Set(['airbnb']),
  run: async () => {
    throw new Error('no shell may run against a site')
  },
  copyHome: async () => ({ ok: true, version: { id: 'v', title: 'T' } }),
  seeder: null,
  chrome: null,
  apply: door.apply,
  doorOrigin: 'http://127.0.0.1:1'
})

const job = (over = {}) => ({
  inspiration: 'airbnb',
  platform: 'wordpress',
  targetSiteKey: 'new.example',
  ...over
})

/** The released package, as the manifest announces it. */
const manifest = async () => ({
  ok: true,
  text: async () => JSON.stringify({ package: 'https://x/tracy.zip' })
})

test('every stage has a function and a name in every interface language, in order', () => {
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
  const s = makeStages(deps(fakeDoor()))
  for (const name of STAGES) assert.equal(typeof s[name], 'function', name)
})

test('theme: absent → installed from its released URL and switched on; present → switched on; on → left alone', async () => {
  globalThis.fetch = manifest
  let door = fakeDoor({ 'theme.list': { ok: true, themes: [] } })
  let r = await makeStages(deps(door)).theme(job())
  assert.equal(r.status, 'done', r.detail)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['theme.list', 'theme.install', 'theme.activate']
  )
  assert.equal(door.calls[1].params.url, 'https://x/tracy.zip')
  assert.equal(door.calls[2].params.theme, 'tracy')

  door = fakeDoor({
    'theme.list': { ok: true, themes: [{ stylesheet: 'tracy', name: 'Tracy', active: false }] }
  })
  r = await makeStages(deps(door)).theme(job())
  assert.equal(r.status, 'done')
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['theme.list', 'theme.activate']
  )

  door = fakeDoor({
    'theme.list': { ok: true, themes: [{ stylesheet: 'tracy', name: 'Tracy', active: true }] }
  })
  r = await makeStages(deps(door)).theme(job())
  assert.equal(r.status, 'done')
  assert.match(r.detail, /already on/)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['theme.list']
  )
})

test('theme: a site that already carries Polylang is not asked to install it', async () => {
  // 🔒 Measured 23/09/2026 on every two-language `tracy-business/wp7` build (`wp-bbr145` to
  // `wp-g4bjus`): the archive ships Polylang, and the build still asked the Claude Cowork plugin to install it
  // by `slug` — refused with `url required`, reported as "polylang not installed".
  globalThis.fetch = manifest
  const themes = [{ stylesheet: 'tracy', active: true }]
  const two = job({ answers: { languages: ['en', 'de'] } })
  const on = fakeDoor({
    'theme.list': { ok: true, themes },
    'plugin.list': { ok: true, plugins: [{ file: 'polylang/polylang.php', active: true }] }
  })
  let r = await makeStages(deps(on)).theme(two)
  assert.match(r.detail, /polylang on$/)
  assert.deepEqual(
    on.calls.map((c) => c.action),
    ['theme.list', 'plugin.list'],
    'installed and on: nothing else is asked'
  )

  const off = fakeDoor({
    'theme.list': { ok: true, themes },
    'plugin.list': { ok: true, plugins: [{ file: 'polylang-pro/polylang.php', active: false }] }
  })
  r = await makeStages(deps(off)).theme(two)
  assert.match(r.detail, /polylang on$/)
  assert.equal(
    off.calls.some((c) => c.action === 'plugin.install'),
    false,
    'Pro is Polylang: no free edition beside it'
  )
  assert.ok(
    off.calls.some((c) => c.action === 'plugin.activate' && c.params.file === 'polylang-pro/polylang.php')
  )

  // Installed from the zip: switched on by the file the site says it unpacked into.
  const fresh = fakeDoor({
    'theme.list': { ok: true, themes },
    'plugin.list': { ok: true, plugins: [{ file: 'akismet/akismet.php', active: true }] },
    'plugin.install': { ok: true, installed: { ok: true, file: 'polylang-3.7/polylang.php' } }
  })
  r = await makeStages(deps(fresh)).theme(two)
  assert.match(r.detail, /polylang on$/)
  assert.ok(
    fresh.calls.some((c) => c.action === 'plugin.activate' && c.params.file === 'polylang-3.7/polylang.php')
  )
})

test('theme: a second language adds Polylang on EVERY way out, as a note that never fails the stage', async () => {
  globalThis.fetch = manifest
  for (const themes of [
    [],
    [{ stylesheet: 'tracy', active: false }],
    [{ stylesheet: 'tracy', active: true }]
  ]) {
    const door = fakeDoor({ 'theme.list': { ok: true, themes } })
    const r = await makeStages(deps(door)).theme(job({ answers: { languages: ['en', 'vi'] } }))
    assert.equal(r.status, 'done', r.detail)
    assert.match(r.detail, /polylang on$/)
    // The Claude Cowork plugin's own words: an https `.zip` to install, the plugin FILE to switch on.
    assert.ok(
      door.calls.some(
        (c) =>
          c.action === 'plugin.install' &&
          c.params.url === 'https://downloads.wordpress.org/plugin/polylang.latest-stable.zip'
      )
    )
    assert.ok(
      door.calls.some((c) => c.action === 'plugin.activate' && c.params.file === 'polylang/polylang.php')
    )
  }
  const refused = fakeDoor({
    'theme.list': { ok: true, themes: [] },
    'plugin.install': { ok: false, message: 'no' }
  })
  const r = await makeStages(deps(refused)).theme(job({ answers: { languages: ['en', 'vi'] } }))
  assert.equal(r.status, 'done', 'the look is what the stage is for')
  assert.match(r.detail, /polylang not installed: no/)
  const one = fakeDoor({ 'theme.list': { ok: true, themes: [] } })
  await makeStages(deps(one)).theme(job({ answers: { languages: ['en'] } }))
  assert.equal(
    one.calls.some((c) => c.action === 'plugin.install'),
    false,
    'one language installs no plugin'
  )
})

test('theme: a refusal from the door is the stage failing, in the door own words', async () => {
  globalThis.fetch = manifest
  const door = fakeDoor({
    'theme.list': { ok: true, themes: [] },
    'theme.install': { ok: false, error: 'install_failed', message: 'zip refused' }
  })
  const r = await makeStages(deps(door)).theme(job())
  assert.equal(r.status, 'failed')
  assert.equal(r.detail, 'zip refused')
})

test('style: one door call, theme.style, with the inspiration as the style', async () => {
  const door = fakeDoor()
  const r = await makeStages(deps(door)).style(job())
  assert.equal(r.status, 'done', r.detail)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['theme.style']
  )
  assert.equal(door.calls[0].params.theme, 'tracy')
  assert.equal(door.calls[0].params.style, 'airbnb')
  assert.match(door.calls[0].params.apply_id, /^build-/)
})

test('style: a component too old to know theme.style says so, and the stage repeats it', async () => {
  const door = fakeDoor({
    'theme.style': { ok: false, code: 'UNKNOWN_ACTION', error: 'unknown action theme.style' }
  })
  const r = await makeStages(deps(door)).style(job())
  assert.equal(r.status, 'failed')
  assert.equal(r.detail, 'unknown action theme.style')
})

test('no stage of this plugin ever runs a shell against the site', async () => {
  globalThis.fetch = manifest
  const door = fakeDoor({
    'theme.list': { ok: true, themes: [] },
    'core.manifest': { ok: true, platform: 'wordpress' }
  })
  const s = makeStages(deps(door))
  for (const name of ['check', 'theme', 'style']) {
    const r = await s[name](job())
    assert.equal(r.status, 'done', `${name}: ${r.detail}`)
  }
})

// ── The quickstart branch: a build on Tracy Base dresses a restored archive ─────────────────────
//
// Same six names, the Joomla quickstart's meaning (`stages.mjs` header). What is pinned: the stage
// picks the branch from the inspiration alone; `check` holds the plugin to the contract's floor and
// refuses a host whose seeder does not ship the contract; `theme` NEVER installs or activates;
// `style` is immutable; `seed` runs the seeder with `--contract` and nothing else that could lay
// pages out.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { olderThan, QUICKSTARTS, coworkContractVersionOf } from '../src/host/stages.mjs'

/** A host with a seeder that ships (or does not ship) the wp7 contracts named. */
function host(withContract = true, contracts = ['tracy-base/wp7/1.0.0']) {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-wp-quickstart-'))
  const bin = path.join(root, 'cms')
  mkdirSync(bin, { recursive: true })
  const command = path.join(bin, 'seed-wordpress')
  writeFileSync(command, '#!/bin/sh\n', { mode: 0o755 })
  if (withContract) {
    for (const id of contracts) {
      const dir = path.join(bin, 'data', 'quickstart-contracts', ...id.split('/'))
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id }))
    }
  }
  return { root, seeder: { command, args: [] }, done: () => rmSync(root, { recursive: true, force: true }) }
}
const qjob = (over = {}) =>
  job({ inspiration: 'tracy-base', answers: { name: 'Harbor', about: 'We design harbours.' }, ...over })
const qdeps = (door, h, run) => ({ ...deps(door), root: h.root, seeder: h.seeder, ...(run ? { run } : {}) })

test('QUICKSTARTS says the same as capabilities.json, so the bundle and the catalog cannot drift', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/host/capabilities.json', import.meta.url), 'utf8'))
  assert.equal(catalog.platform, 'wordpress')
  const provider = catalog.providers['tracy-base-wp7']
  assert.deepEqual(QUICKSTARTS['tracy-base/wp7'], {
    contract: provider.contract,
    coworkMinVersion: provider.coworkMinVersion,
    theme: provider.theme
  })
  assert.equal(provider.recipe, 'quickstart.restore')
  assert.deepEqual(provider.platformMajors, [7])
  // Pinned from the draft release tracy-base/wp7 (14/09/2026): the provider is ready and its
  // artifact is the webroot tar with a real sha256 and asset id.
  assert.equal(provider.state, 'ready')
  const artifact = catalog.artifacts[provider.artifact]
  assert.equal(artifact.kind, 'tracy-runtime-quickstart')
  assert.match(artifact.sha256, /^[0-9a-f]{64}$/)
  assert.ok(artifact.bytes > 0 && Number.isInteger(artifact.githubAssetId))
  assert.equal('pendingArtifact' in provider, false)
})

test('olderThan compares by numeric parts; coworkContractVersionOf reads the shapes a manifest may carry', () => {
  assert.equal(olderThan('0.7.9', '0.8.0'), true)
  assert.equal(olderThan('0.8.0', '0.8.0'), false)
  assert.equal(olderThan('0.10.0', '0.9.0'), false)
  assert.equal(olderThan('1.0', '0.8.0'), false)
  assert.equal(coworkContractVersionOf({ version: '0.9.1' }), '0.9.1')
  assert.equal(coworkContractVersionOf({ cowork: { version: '0.8.0' } }), '0.8.0')
  assert.equal(coworkContractVersionOf({ platform: 'wordpress', platformVersion: '7.1' }), null)
  // v0.11+ Claude Cowork plugin: version is inside the extensions array, not a top-level field.
  assert.equal(
    coworkContractVersionOf({
      platform: 'wordpress',
      platformVersion: '6.7',
      extensions: [
        { type: 'plugin', element: 'akismet', core: false, enabled: true, version: '5.3' },
        { type: 'plugin', element: 'claude-cowork', core: false, enabled: true, version: '0.11.0' }
      ]
    }),
    '0.11.0'
  )
})

test('check: contract shipped + plugin at or above the floor → done; below the floor, unreported, or unshipped → failed', async () => {
  const h = host()
  try {
    let door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress', version: '0.9.0' } })
    let r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'done', r.detail)
    assert.match(r.detail, /tracy-base\/wp7/)
    assert.deepEqual(
      door.calls.map((c) => c.action),
      ['core.manifest', 'content.contract']
    )
    assert.match(r.detail, /unbound \(cowork has no contract door\)/)

    door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress', version: '0.7.5' } })
    r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /0\.7\.5.*0\.8\.0/)

    door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress' } })
    r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /did not report/)

    door = fakeDoor({ 'core.manifest': { ok: true, platform: 'joomla', version: '0.16.0' } })
    r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /runs joomla/)
  } finally {
    h.done()
  }
  const bare = host(false)
  try {
    const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress', version: '0.9.0' } })
    const r = await makeStages(qdeps(door, bare)).check(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /does not ship the tracy-base\/wp7\/1\.0\.0 contract/)
    assert.equal(door.calls.length, 0, 'the site is not asked when the host cannot write')
  } finally {
    bare.done()
  }
})

test('theme: asserted only — tracy-base active is done; anything else fails; theme.install and theme.activate never happen', async () => {
  globalThis.fetch = manifest
  const h = host()
  try {
    let door = fakeDoor({
      'theme.list': { ok: true, themes: [{ stylesheet: 'tracy-base', name: 'Tracy Base', active: true }] }
    })
    let r = await makeStages(qdeps(door, h)).theme(qjob())
    assert.equal(r.status, 'done', r.detail)
    assert.deepEqual(
      door.calls.map((c) => c.action),
      ['theme.list']
    )

    door = fakeDoor({
      'theme.list': {
        ok: true,
        themes: [
          { stylesheet: 'tracy-base', active: false },
          { stylesheet: 'tracy', active: true }
        ]
      }
    })
    r = await makeStages(qdeps(door, h)).theme(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /runs tracy, not tracy-base/)
    assert.deepEqual(
      door.calls.map((c) => c.action),
      ['theme.list']
    )

    door = fakeDoor({ 'theme.list': { ok: true, themes: [] } })
    r = await makeStages(qdeps(door, h)).theme(qjob())
    assert.equal(r.status, 'failed')
    assert.equal(
      door.calls.some((c) => c.action === 'theme.install' || c.action === 'theme.activate'),
      false
    )

    // A second language still adds Polylang, as a note.
    door = fakeDoor({ 'theme.list': { ok: true, themes: [{ stylesheet: 'tracy-base', active: true }] } })
    r = await makeStages(qdeps(door, h)).theme(
      qjob({ answers: { name: 'H', about: 'A', languages: ['en', 'vi'] } })
    )
    assert.equal(r.status, 'done')
    assert.match(r.detail, /polylang on$/)
  } finally {
    h.done()
  }
})

test('style: immutable — Tracy Base ships its own look, and no door call is made', async () => {
  const h = host()
  try {
    const door = fakeDoor()
    const r = await makeStages(qdeps(door, h)).style(qjob())
    assert.equal(r.status, 'done')
    assert.match(r.detail, /ships its own look/)
    assert.equal(door.calls.length, 0)
  } finally {
    h.done()
  }
})

test('copy: waits for name and about, then writes the inputs for the seeder with the quickstart named', async () => {
  const h = host()
  try {
    const door = fakeDoor()
    const s = makeStages(qdeps(door, h))
    let r = await s.copy(qjob({ answers: {} }))
    assert.equal(r.status, 'waiting')
    assert.equal(r.detail, 'form:name,about')
    r = await s.copy(qjob({ job: 'build-1' }))
    assert.equal(r.status, 'done', r.detail)
    const preview = JSON.parse(
      readFileSync(path.join(h.root, 'docs', 'agents', 'design-preview.json'), 'utf8')
    )
    assert.equal(preview.chosen.id, 'tracy-base')
    assert.equal(preview.quickstart, 'tracy-base/wp7')
    assert.equal(preview.contract, 'tracy-base/wp7/1.0.0')
    assert.equal(preview.site.name, 'Harbor')
    assert.equal(door.calls.length, 0, 'no model take: the pages exist')
  } finally {
    h.done()
  }
})

test('seed: the seeder with --contract, --target-site and the door — and no --copy or --pages', async () => {
  const h = host()
  try {
    const runs = []
    const run = async (cmd, args) => {
      runs.push([cmd, args])
      return { code: 0, stdout: '', stderr: '' }
    }
    const r = await makeStages(qdeps(fakeDoor(), h, run)).seed(qjob({ ownerSessionId: 'sess-1' }))
    assert.equal(r.status, 'done', r.detail)
    assert.equal(runs.length, 1)
    const [cmd, args] = runs[0]
    assert.equal(cmd, h.seeder.command)
    assert.equal(args[args.indexOf('--contract') + 1], 'tracy-base/wp7/1.0.0')
    assert.equal(args[args.indexOf('--target-site') + 1], 'new.example')
    assert.equal(args[args.indexOf('--door') + 1], 'http://127.0.0.1:1')
    assert.equal(args[args.indexOf('--session') + 1], 'sess-1')
    assert.equal(args.includes('--copy'), false)
    assert.equal(args.includes('--pages'), false)

    const failing = async () => ({ code: 1, stdout: '', stderr: 'contract: x\nthe door refused blogname\n' })
    const f = await makeStages(qdeps(fakeDoor(), h, failing)).seed(qjob())
    assert.equal(f.status, 'failed')
    assert.equal(f.detail, 'the door refused blogname')
  } finally {
    h.done()
  }
})

test('an inspiration that is a design system takes the generic road, untouched by the quickstart branch', async () => {
  globalThis.fetch = manifest
  const door = fakeDoor({ 'theme.list': { ok: true, themes: [] } })
  const r = await makeStages(deps(door)).theme(job())
  assert.equal(r.status, 'done', r.detail)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['theme.list', 'theme.install', 'theme.activate']
  )
  const style = await makeStages(deps(fakeDoor())).style(job())
  assert.equal(style.detail, 'airbnb on new.example')
})

// Measured 22/09 on the local stand, `site-h75639`: a site made from the Tracy Business card
// (`tracy-business/wp7`, installed as released, nothing sealing it then) stopped at `check` with
// "tracy-business" is not a design inspiration — the generic road only knows the 152 design
// systems, and the quickstart road only the sealed releases. Tracy Business has been sealed since
// (eb31cf580), so these cases name a card that is not: the road is for the NEXT unsealed one.
const templateCard = (over = {}) =>
  job({
    inspiration: 'tracy-unsealed',
    answers: { name: 'Northgate Bakery', about: 'A neighbourhood bakery.' },
    designPlan: {
      requestedDesign: 'tracy-unsealed',
      effectiveDesign: 'tracy-unsealed',
      contractProfile: null,
      workflow: 'template',
      fallback: false
    },
    ...over
  })

test('a template card with no contract is built as released, and its words are handed to the agent', async () => {
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress' } })
  const s = makeStages({ ...deps(door), root: mkdtempSync(path.join(tmpdir(), 'wp-template-')) })
  const card = templateCard()
  assert.equal((await s.check(card)).status, 'done')
  assert.equal((await s.theme(card)).status, 'done')
  assert.equal((await s.style(card)).status, 'skipped')
  assert.equal((await s.copy(card)).status, 'done')
  const seed = await s.seed(card)
  assert.equal(seed.status, 'skipped')
  assert.equal(seed.code, 'PERSONALIZE_BY_AGENT')
  assert.match(seed.detail, /tracy_site/)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['core.manifest'],
    "the template's own theme is never replaced by tracy, and nothing is written by the build"
  )
})

test('a template card on a site that is not WordPress still stops at check', async () => {
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'joomla' } })
  const r = await makeStages(deps(door)).check(templateCard())
  assert.equal(r.status, 'failed')
})

test("the template road is taken only on the plan's word: without it an unknown id still fails", async () => {
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress' } })
  const r = await makeStages(deps(door)).check(job({ inspiration: 'tracy-unsealed' }))
  assert.equal(r.status, 'failed')
  assert.match(r.detail, /not a design template/)
})

test('a sealed template card keeps the quickstart road even when its plan says template', async () => {
  // Tracy Business is sealed (tracy-business/wp7/1.0.0): the quickstart road comes first, and the
  // template road must never take a card that has a contract away from its seeder.
  const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress' } })
  const r = await makeStages(deps(door)).seed(
    job({
      inspiration: 'tracy-business',
      answers: { name: 'N', about: 'A' },
      designPlan: {
        requestedDesign: 'tracy-business',
        effectiveDesign: 'tracy-business',
        contractProfile: null,
        workflow: 'template',
        fallback: false
      }
    })
  )
  assert.notEqual(r.code, 'PERSONALIZE_BY_AGENT')
})

// ── The seal: the contract a restored site was sealed with wins over `QUICKSTARTS` ──────────────
//
// Measured 23/09/2026 on the local stand, `wp-bbr145` (built with the customer's page open, every
// stage `done`): the fleet sealed `tracy-business/wp7/1.1.0` (278 slots) and the build wrote
// through the table's 1.0.0 (2 slots) — `seed: tracy-business/wp7/1.0.0 slots written`. Only the
// site name and tagline were the customer's; `/` still said "Building the groundwork…".
import { sealOf } from '../src/host/stages.mjs'

/** A sites root holding one seal, as `provision/platform/wordpress.sh` writes it. */
function sitesWith(h, label, seal) {
  const dir = path.join(h.root, 'sites', '.content-contracts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, `${label}.json`),
    typeof seal === 'string' ? seal : `${JSON.stringify(seal)}\n`
  )
  return { TRACY_SITES_ROOT: path.join(h.root, 'sites') }
}
const business = {
  contract: 'tracy-business/wp7/1.1.0',
  platform: 'wordpress',
  quickstart: 'tracy-business/wp7',
  coworkMinVersion: '0.8.0',
  policy: 1
}
const bjob = (over = {}) =>
  job({
    inspiration: 'tracy-business',
    targetSiteKey: 'wp-bbr145.tracy.test',
    answers: { name: 'Toyota Hanoi', about: 'A Toyota dealer in Hanoi.' },
    ...over
  })

test('sealOf: no seal → null; a seal → its contract, floor, quickstart, platform; broken or contract-less → unreadable', () => {
  const h = host(false)
  try {
    const env = sitesWith(h, 'wp-bbr145', business)
    assert.deepEqual(sealOf('wp-bbr145.tracy.test', env), {
      contract: 'tracy-business/wp7/1.1.0',
      coworkMinVersion: '0.8.0',
      // A marker from before the pin (or a release pinning none) names no Claude Cowork plugin version.
      coworkContractVersion: null,
      quickstart: 'tracy-business/wp7',
      platform: 'wordpress'
    })
    assert.equal(sealOf('wp-other.tracy.test', env), null)
    assert.equal(sealOf(null, env), null)
    assert.equal(sealOf('../wp-bbr145', env), null, 'a key that is not a label names no file')
    sitesWith(h, 'wp-broken', '{"contract": ')
    assert.match(sealOf('wp-broken.tracy.test', env)?.unreadable ?? '', /wp-broken\.json/)
    sitesWith(h, 'wp-empty', { platform: 'wordpress' })
    assert.match(sealOf('wp-empty.tracy.test', env)?.unreadable ?? '', /names no contract/)
  } finally {
    h.done()
  }
})

test('sealOf: a seal written before the rename (27/09/2026) still gives its floor and pinned version', () => {
  const h = host(false)
  try {
    const { coworkMinVersion: _, ...rest } = business
    const env = sitesWith(h, 'wp-old', { ...rest, receiverFloor: '0.8.0', receiverVersion: '0.13.2' }) // vocabulary-allow: pre-rename key in published data
    const seal = sealOf('wp-old.tracy.test', env)
    assert.equal(seal?.coworkMinVersion, '0.8.0')
    assert.equal(seal?.coworkContractVersion, '0.13.2')
  } finally {
    h.done()
  }
})

test("a sealed site is built through ITS contract: check, copy and seed name 1.1.0, not the table's 1.0.0", async () => {
  const h = host(true, ['tracy-business/wp7/1.0.0', 'tracy-business/wp7/1.1.0'])
  try {
    const env = sitesWith(h, 'wp-bbr145', business)
    const runs = []
    const run = async (_cmd, args) => {
      runs.push(args)
      return { code: 0, stdout: '', stderr: '' }
    }
    const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress', version: '0.11.0' } })
    const s = makeStages({ ...qdeps(door, h, run), env })
    const check = await s.check(bjob())
    assert.equal(check.status, 'done', check.detail)
    assert.match(check.detail, /tracy-business\/wp7\/1\.1\.0/, 'the Build card says which contract it writes')
    assert.equal((await s.copy(bjob())).status, 'done')
    const preview = JSON.parse(
      readFileSync(path.join(h.root, 'docs', 'agents', 'design-preview.json'), 'utf8')
    )
    assert.equal(preview.contract, 'tracy-business/wp7/1.1.0')
    const seed = await s.seed(bjob())
    assert.equal(seed.detail, 'tracy-business/wp7/1.1.0 slots written')
    assert.equal(runs[0][runs[0].indexOf('--contract') + 1], 'tracy-business/wp7/1.1.0')

    // The floor is the seal's too: it belongs to the contract version, not to the quickstart.
    const high = sitesWith(h, 'wp-bbr145', { ...business, coworkMinVersion: '0.12.0' })
    const low = await makeStages({ ...qdeps(door, h, run), env: high }).check(bjob())
    assert.equal(low.status, 'failed')
    assert.match(low.detail, /Cowork 0\.11\.0; tracy-business\/wp7\/1\.1\.0 needs 0\.12\.0/)

    // A site restored before seals were written keeps the road it had: the table.
    runs.length = 0
    const unsealed = makeStages({
      ...qdeps(fakeDoor(), h, run),
      env: { TRACY_SITES_ROOT: path.join(h.root, 'none') }
    })
    assert.equal((await unsealed.seed(bjob())).detail, 'tracy-business/wp7/1.0.0 slots written')
  } finally {
    h.done()
  }
})

test('a seal the build cannot honour stops every stage with its reason; nothing reaches the site or the seeder', async () => {
  const h = host(true, ['tracy-base/wp7/1.0.0', 'tracy-business/wp7/1.0.0', 'tracy-business/wp7/1.1.0'])
  try {
    const cases = [
      [
        { ...business, contract: 'tracy-base/wp7/1.0.0', quickstart: 'tracy-base/wp7' },
        /restored from tracy-base\/wp7, not tracy-business\/wp7/
      ],
      [{ ...business, contract: 'tracy-business/j6/1.0.0', platform: 'joomla' }, /sealed for joomla/],
      ['{"contract": ', /cannot be read/],
      [{ platform: 'wordpress', quickstart: 'tracy-business/wp7' }, /names no contract/]
    ]
    for (const [seal, reason] of cases) {
      const env = sitesWith(h, 'wp-bbr145', seal)
      const runs = []
      const run = async (_cmd, args) => {
        runs.push(args)
        return { code: 0, stdout: '', stderr: '' }
      }
      const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress', version: '0.11.0' } })
      const s = makeStages({ ...qdeps(door, h, run), env })
      for (const name of ['check', 'theme', 'style', 'copy', 'seed']) {
        const r = await s[name](bjob())
        assert.equal(r.status, 'failed', `${name} with ${JSON.stringify(seal)}`)
        assert.match(r.detail, reason)
      }
      assert.equal(door.calls.length, 0, 'the site is not asked')
      assert.equal(runs.length, 0, 'the seeder never runs')
    }
  } finally {
    h.done()
  }
})

test("a seal naming a contract this host's seeder does not ship fails check, instead of writing the table's", async () => {
  const h = host(true, ['tracy-business/wp7/1.0.0'])
  try {
    const env = sitesWith(h, 'wp-bbr145', { ...business, contract: 'tracy-business/wp7/1.2.0' })
    const door = fakeDoor({ 'core.manifest': { ok: true, platform: 'wordpress', version: '0.11.0' } })
    const r = await makeStages({ ...qdeps(door, h), env }).check(bjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /does not ship the tracy-business\/wp7\/1\.2\.0 contract/)
  } finally {
    h.done()
  }
})

/**
 * A host like `host()`, plus a `.content-contracts/<label>.json` marker for the test job's site
 * (`new.example` → label `new`), so `sealOf` answers with what provision wrote.
 */
function sealedHost(h, marker) {
  const root = mkdtempSync(path.join(tmpdir(), 'wp-sealed-'))
  mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
  writeFileSync(
    path.join(root, '.content-contracts', 'new.json'),
    JSON.stringify({
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7',
      coworkMinVersion: '0.8.0',
      policy: 1,
      ...marker
    })
  )
  return {
    deps: (door) => ({ ...qdeps(door, h), env: { ...process.env, TRACY_SITES_ROOT: root } }),
    done: () => rmSync(root, { recursive: true, force: true })
  }
}

test('check: a Claude Cowork plugin with the contract door must hold a BINDING to this contract — unbound or bound elsewhere is failed, bound is done', async () => {
  const h = host()
  try {
    const manifest = { ok: true, platform: 'wordpress', version: '0.12.0' }
    let door = fakeDoor({
      'core.manifest': manifest,
      'content.contract': { ok: true, bound: true, contract: 'tracy-base/wp7/1.0.0', revision: 'r1' }
    })
    let r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'done', r.detail)
    assert.match(r.detail, /· bound$/)

    door = fakeDoor({
      'core.manifest': manifest,
      'content.contract': { ok: true, bound: false, contract: 'tracy-base/wp7/1.0.0', revision: 'r0' }
    })
    // Unbound with the door present: failed only when the marker says provision pinned a Claude Cowork plugin
    // (a release that pins none took the old road on purpose, and is built the old way).
    r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'done', r.detail)
    assert.match(r.detail, /unbound \(release pins no Claude Cowork plugin\)/)
    const sealed = sealedHost(h, { contract: 'tracy-base/wp7/1.0.0', coworkContractVersion: '0.12.2' })
    try {
      r = await makeStages(sealed.deps(door)).check(qjob())
      assert.equal(r.status, 'failed')
      assert.match(r.detail, /not bound to tracy-base\/wp7\/1\.0\.0/)
    } finally {
      sealed.done()
    }

    door = fakeDoor({
      'core.manifest': manifest,
      'content.contract': { ok: true, bound: true, contract: 'tracy-business/wp7/1.1.0', revision: 'r1' }
    })
    r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /bound to tracy-business\/wp7\/1\.1\.0, not tracy-base/)

    door = fakeDoor({
      'core.manifest': manifest,
      'content.contract': {
        ok: false,
        error: 'contract_failed',
        message: 'Presentation asset changed: wp-content/themes/wp-tracy-business/style.css'
      }
    })
    r = await makeStages(qdeps(door, h)).check(qjob())
    assert.equal(r.status, 'failed')
    assert.match(r.detail, /Presentation asset changed/)
  } finally {
    h.done()
  }
})

// ── brand on WordPress (ADR 0023): the customer's own look, made at build time ──────────────────
import { fileURLToPath as toPath } from 'node:url'

const REPO = path.resolve(path.dirname(toPath(import.meta.url)), '..', '..', '..', '..')
/** A site folder whose brand engine has run: `Brand/<host>/` in the library's shape. */
function brandRoot(host = 'acme.example') {
  const root = mkdtempSync(path.join(tmpdir(), 'brand-wp-'))
  mkdirSync(path.join(root, 'Brand', host), { recursive: true })
  writeFileSync(
    path.join(root, 'Brand', host, 'tokens.css'),
    readFileSync(
      path.join(REPO, 'vendor', 'tracy', 'od-design-system', 'systems', 'apple', 'tokens.css'),
      'utf8'
    )
  )
  writeFileSync(path.join(root, 'Brand', host, 'brand.json'), JSON.stringify({ name: 'Acme Tools' }))
  return root
}

test('style: a brand is worn as a variation MADE HERE from Brand/<host>/tokens.css, sent through theme.style', async () => {
  const root = brandRoot()
  const door = fakeDoor()
  const r = await makeStages({ ...deps(door), root }).style(job({ inspiration: 'brand:acme.example' }))
  assert.equal(r.status, 'done', r.detail)
  assert.deepEqual(
    door.calls.map((c) => c.action),
    ['theme.style']
  )
  const p = door.calls[0].params
  assert.equal(p.theme, 'tracy')
  assert.equal(p.style, 'brand-acme-example', 'a slug the theme can spell, never the raw host')
  assert.equal(p.variation.version, 3)
  assert.equal(p.variation.title, 'Acme Tools')
  assert.equal(p.variation.settings.color.palette.length, 16, 'the same variation shape the theme bakes')
  assert.equal(p.variation.settings.custom.tracy.inspiration, 'brand-acme-example')
  assert.deepEqual(p.meta, {
    name: 'Acme Tools',
    category: 'Your brand',
    nav: 'top-left',
    hero: 'split',
    dark: false
  })
})

test('style: a brand whose folder has no tokens.css fails with the folder named, and calls no door', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'brand-wp-'))
  const door = fakeDoor()
  const r = await makeStages({ ...deps(door), root }).style(job({ inspiration: 'brand:nowhere.example' }))
  assert.equal(r.status, 'failed')
  assert.match(r.detail, /Brand\/nowhere\.example/)
  assert.equal(door.calls.length, 0)
})

test('style: a Claude Cowork plugin that cannot take a variation yet answers as before, and the stage repeats it', async () => {
  const root = brandRoot()
  const door = fakeDoor({
    'theme.style': {
      ok: false,
      code: 'style_failed',
      error: 'the theme has no styles/brand-acme-example.json'
    }
  })
  const r = await makeStages({ ...deps(door), root }).style(job({ inspiration: 'brand:acme.example' }))
  assert.equal(r.status, 'failed')
  assert.match(r.detail, /no styles\/brand-acme-example\.json/)
})

test('seed: a brand hands the seeder its folder with --system-dir; a library system does not', async () => {
  const root = brandRoot()
  const argv = []
  const d = {
    ...deps(fakeDoor()),
    root,
    seeder: { command: '/opt/tracy/cms/seed-wordpress', args: [] },
    run: async (cmd, args) => {
      argv.push(args)
      return { code: 1, stdout: '', stderr: 'CONTENT_REQUIRED: name' }
    }
  }
  await makeStages(d).seed(job({ inspiration: 'brand:acme.example' }))
  const i = argv[0].indexOf('--system-dir')
  assert.ok(i >= 0, `--system-dir passed: ${argv[0].join(' ')}`)
  assert.equal(argv[0][i + 1], path.join(root, 'Brand', 'acme.example'))
  assert.ok(
    argv[0].includes('docs/agents/design-copy/brand--acme.example.json') ||
      argv[0].some((a) => a.endsWith('design-copy/brand--acme.example.json')),
    'the copy file keeps its brand spelling'
  )
  await makeStages(d).seed(job())
  assert.equal(argv[1].indexOf('--system-dir'), -1)
})
