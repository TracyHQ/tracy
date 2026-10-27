import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { main } from '../src/cli.mjs'
import jpeg from 'jpeg-js'
test('the default Joomla CLI waits for missing facts, then uses only the contract door', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery', price: '$12' } }))
  const calls = [],
    slot = { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' }
  const apply = async (c) => {
    calls.push(c)
    assert.equal(c.action, 'content.contract')
    return c.params.operation === 'inspect'
      ? { ok: true, contract: 'test/v1', revision: 'original', slots: [slot], pages: [] }
      : { ok: true }
  }
  const args = [
    '--platform',
    'joomla',
    '--preview',
    'preview.json',
    '--target-site',
    'bakery.example',
    '--fresh'
  ]
  await assert.rejects(
    () =>
      main(args, { cwd, env: {}, apply, generate: async () => ({ values: {}, pending: ['hero.title'] }) }),
    /CONTENT_REQUIRED/
  )
  assert(calls.every((c) => c.params.operation === 'inspect'))
  const result = await main(args, {
    cwd,
    env: {},
    apply,
    generate: async () => ({ values: { 'hero.title': 'Fresh bread' }, pending: [] })
  })
  assert.equal(result.applied.ok, true)
  assert.deepEqual(calls.at(-1).params.changes, { 'hero.title': 'Fresh bread' })
  assert(JSON.parse(readFileSync(join(cwd, 'seed', 'apply.json'))).applyId.startsWith('contract-'))
  await assert.rejects(
    () => main(['--platform', 'joomla', '--preview', 'preview.json'], { cwd, env: {} }),
    /target-site/
  )
})

// 🔒 A LANGUAGE LEFT HALF MADE BY AN EARLIER BUILD IS TAKEN BACK BEFORE NEW WORDS ARE WRITTEN. Its
// copies were translated from the old source, and the Claude Cowork plugin refuses a content apply while it
// stands (0.16.12) — measured 23/09/2026 on `j-ee6vsk`: a second Build died at `seed` on "Cannot
// replace a content-only baseline" (the older Claude Cowork plugin's wording). The `language` stage derives it
// again from the new words.
test('a language job an earlier build left in flight is taken back before the copy is written', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-inflight-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  const slot = { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' }
  const calls = []
  let held = true
  const apply = async (c) => {
    calls.push(c.params)
    if (c.params.operation === 'inspect')
      return {
        ok: true,
        contract: 'test/v1',
        revision: held ? 'held' : 'clean',
        slots: [slot],
        pages: [],
        job: held ? { locale: 'vi-VN', phase: 'menu' } : null
      }
    if (c.params.operation === 'multilingual.revert') {
      held = false
      return { ok: true, locale: c.params.locale, removed: true }
    }
    assert.equal(held, false, 'no content apply while the language job stands')
    return { ok: true }
  }
  const result = await main(
    ['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'bakery.example', '--fresh'],
    { cwd, env: {}, apply, generate: async () => ({ values: { 'hero.title': 'Fresh bread' }, pending: [] }) }
  )
  assert.equal(result.applied.ok, true)
  const reverts = calls.filter((p) => p.operation === 'multilingual.revert')
  assert.deepEqual(
    reverts.map((p) => p.locale),
    ['vi-VN']
  )
  assert.equal(calls.at(-1).expected_revision ?? 'clean', 'clean')
})

test('a component too old for the multilingual operations is refused before any write', async (t) => {
  // The release supports new sites only: there is no binding migration for an older component, so
  // the refusal has to happen at the plan, name the site and the language, and say the site is
  // unchanged — not leave the customer with the Claude Cowork plugin's own words.
  //
  // Both shapes are real, measured 12-13/09/2026 against installed Claude Cowork plugins: 0.13.0 has no
  // contract door at all and answers `unknown action: content.contract`; 0.14.0 has the door but
  // not the multilingual operations and answers `Unknown contract operation`. A refusal that
  // matched only the second handed the customer the first verbatim.
  for (const said of ['Unknown contract operation', 'unknown action: content.contract']) {
    const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-old-'))
    t.after(() => rmSync(cwd, { recursive: true, force: true }))
    writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
    const calls = []
    const apply = async (c) => {
      calls.push(c)
      return { ok: false, error: said }
    }
    await assert.rejects(
      () =>
        main(
          [
            '--platform',
            'joomla',
            '--preview',
            'preview.json',
            '--target-site',
            'old.example',
            '--add-language',
            'zh-CN'
          ],
          { cwd, env: {}, apply, generate: async () => ({ values: {}, pending: [] }) }
        ),
      (error) =>
        /does not offer the multilingual operations/.test(error.message) &&
        /zh-CN was refused before anything was written/.test(error.message) &&
        /old\.example/.test(error.message) &&
        /the site is unchanged/.test(error.message)
    )
    // One call, and it was the plan: nothing was packaged, nothing applied.
    assert.equal(calls.length, 1)
    assert.equal(calls[0].params.operation, 'multilingual.plan')
  }
})

test('a second brief keeps what the first brief already answered', async (t) => {
  // The brief hash is the cache key, so a follow-up answer used to re-plan every slot and re-roll
  // the model across the ones that were already right. Measured on two Airbnb runs of one site:
  // 546 pending from a short brief, 540 from a brief three times longer, with six article slots
  // filled by the SHORT one and pending by the long one.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-carry-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const slots = [
    { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' },
    { key: 'hero.price', sample: 'Demo', maxCharacters: 80, entity: 'module-1' }
  ]
  const apply = async (c) =>
    c.params.operation === 'inspect'
      ? { ok: true, contract: 'test/v1', revision: 'r', slots, pages: [] }
      : { ok: true }
  const args = (about) => [
    '--platform',
    'joomla',
    '--preview',
    `preview-${about}.json`,
    '--target-site',
    'bakery.example'
  ]
  writeFileSync(join(cwd, 'preview-one.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  writeFileSync(join(cwd, 'preview-two.json'), JSON.stringify({ site: { name: 'Bakery', price: '$12' } }))

  // First brief: the title lands, the price cannot be invented.
  await assert.rejects(
    () =>
      main(args('one'), {
        cwd,
        env: {},
        apply,
        generate: async () => ({ values: { 'hero.title': 'Fresh bread' }, pending: ['hero.price'] })
      }),
    /CONTENT_REQUIRED: hero\.price/
  )

  // Second brief: only the pending slot is asked about, and the title survives.
  const asked = []
  const result = await main(args('two'), {
    cwd,
    env: {},
    apply,
    generate: async ({ input }) => {
      asked.push(input.slots.map((s) => s.key))
      return { values: { 'hero.price': '$12' }, pending: [] }
    }
  })
  assert.deepEqual(asked, [['hero.price']])
  assert.deepEqual(result.plan.changes, { 'hero.title': 'Fresh bread', 'hero.price': '$12' })
  assert.deepEqual(result.plan.pending, [])
})

test('a fact the customer takes back sends its slot to the asked set again', async (t) => {
  // Accumulation must not swallow a RETRACTION. An evidence-required value is a verbatim excerpt
  // of the brief, so "the customer removed this fact" is decidable — and those are exactly the
  // slots whose only basis was the customer saying it.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-withdraw-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const slots = [
    { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' },
    { key: 'hero.price', sample: 'Demo', maxCharacters: 80, entity: 'module-1', requiresEvidence: true }
  ]
  const apply = async (c) =>
    c.params.operation === 'inspect'
      ? { ok: true, contract: 'test/v1', revision: 'r', slots, pages: [] }
      : { ok: true }
  const args = (name) => [
    '--platform',
    'joomla',
    '--preview',
    `${name}.json`,
    '--target-site',
    'bakery.example'
  ]
  writeFileSync(join(cwd, 'withprice.json'), JSON.stringify({ site: { name: 'Bakery', price: '$12' } }))
  writeFileSync(join(cwd, 'noprice.json'), JSON.stringify({ site: { name: 'Bakery' } }))

  // First brief carries the price, so the evidence slot is answerable; the title is not.
  await assert.rejects(
    () =>
      main(args('withprice'), {
        cwd,
        env: {},
        apply,
        generate: async () => ({ values: { 'hero.price': '$12' }, pending: ['hero.title'] })
      }),
    /CONTENT_REQUIRED: hero\.title/
  )

  // Second brief drops the price. The title is still asked for AND the price comes back with it.
  const asked = []
  await assert.rejects(
    () =>
      main(args('noprice'), {
        cwd,
        env: {},
        apply,
        generate: async ({ input }) => {
          asked.push(input.slots.map((s) => s.key).sort())
          return { values: {}, pending: input.slots.map((s) => s.key) }
        }
      }),
    /CONTENT_REQUIRED/
  )
  assert.deepEqual(asked, [['hero.price', 'hero.title']])
})

test('work applied straight to the site counts even when the brief has not moved', async (t) => {
  // An unchanged brief matches the cache key, so the cached plan is taken whole and no planning
  // runs at all. Measured by tch-90: a re-run with the same brief went 540 pending to 540 while
  // the agent had already written values to the site. The site is authoritative about its own
  // content, cache hit or not — and saying so costs no model call.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-applied-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  let current = 'Demo'
  const apply = async (c) =>
    c.params.operation === 'inspect'
      ? {
          ok: true,
          contract: 'test/v1',
          revision: 'r',
          pages: [],
          slots: [
            { key: 'hero.name', entity: 'module-1', sample: 'Demo', current: 'Demo', maxCharacters: 80 },
            { key: 'hero.title', entity: 'module-1', sample: 'Demo', current, maxCharacters: 80 }
          ]
        }
      : { ok: true }
  const args = ['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'bakery.example']

  await assert.rejects(
    () =>
      main(args, {
        cwd,
        env: {},
        apply,
        generate: async () => ({ values: { 'hero.name': 'Bakery' }, pending: ['hero.title'] })
      }),
    /CONTENT_REQUIRED: hero\.title/
  )

  // Someone writes the words through the contract door. The brief is untouched.
  current = 'Fresh bread'
  let asked = 0
  const result = await main(args, {
    cwd,
    env: {},
    apply,
    generate: async () => {
      asked += 1
      return { values: {}, pending: [] }
    }
  })
  assert.equal(asked, 0, 'the model is not asked again: the site already answered')
  assert.deepEqual(result.plan.pending, [])
})

test('a cached plan from before the derived-slot rule is cleaned of translated keys at load', async (t) => {
  // Otherwise the carried `changes` would hand the apply a translated key and it would refuse the
  // whole mapping — a site that had a language added could never finish its seed again.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-derived-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  const slots = [
    { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' },
    {
      key: 'zh-TW::hero.title',
      sample: 'Demo',
      current: '示範',
      maxCharacters: 80,
      entity: 'zh-TW::module-1',
      sourceKey: 'hero.title',
      translates: true
    }
  ]
  const apply = async (c) =>
    c.params.operation === 'inspect'
      ? { ok: true, contract: 'test/v1', revision: 'r', slots, pages: [] }
      : { ok: true }
  const args = ['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'bakery.example']
  // A stale cache with the same brief hash as the run will compute: build it by running once with
  // a planner that (wrongly) names the translated key, then let the next run load it.
  const first = await main(args, {
    cwd,
    env: {},
    apply,
    generate: async () => ({ values: { 'hero.title': 'Fresh bread' }, pending: [] })
  }).catch((e) => e)
  const file = join(cwd, 'seed', 'contract-mapping.json')
  const cached = JSON.parse(readFileSync(file, 'utf8'))
  cached.changes['zh-TW::hero.title'] = 'Fresh bread'
  cached.pending = ['zh-TW::hero.other']
  writeFileSync(file, JSON.stringify(cached))
  const asked = []
  const result = await main(args, {
    cwd,
    env: {},
    apply,
    generate: async ({ input }) => {
      asked.push(...input.slots.map((s) => s.key))
      return { values: {}, pending: [] }
    }
  })
  assert.deepEqual(asked, [], 'the poisoned cache is a cache hit; the model is not asked')
  assert.deepEqual(result.plan.changes, { 'hero.title': 'Fresh bread' })
  assert.deepEqual(result.plan.pending, [])
  void first
})

test('--keep-demo finishes the build and records which slots still hold demo words', async (t) => {
  // The default refuses to finish while a factual slot has no customer fact behind it, and that is
  // the right default: a stat the vendor invented must never be published as the customer's claim.
  // But a build that stops at seed asks the customer to write a site before they have seen one.
  // `--keep-demo` keeps the same refusal to WRITE — nothing unbacked is ever sent through the door
  // — and lets the stage finish, with the untouched slots named so the Quality tab can show them.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-keep-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  const slots = [
    { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' },
    { key: 'price.value', sample: '$100', maxCharacters: 20, entity: 'module-1', requiresEvidence: true }
  ]
  let applied = null
  const apply = async (c) => {
    if (c.params.operation === 'inspect')
      return { ok: true, contract: 'test/v1', revision: 'original', slots, pages: [] }
    applied = c.params
    return { ok: true }
  }
  const result = await main(
    [
      '--platform',
      'joomla',
      '--preview',
      'preview.json',
      '--target-site',
      'bakery.example',
      '--keep-demo',
      '--fresh'
    ],
    {
      cwd,
      env: {},
      apply,
      generate: async () => ({ values: { 'hero.title': 'Fresh bread', 'price.value': '$12' }, pending: [] })
    }
  )
  assert.equal(result.applied.ok, true)
  assert.deepEqual(applied.changes, { 'hero.title': 'Fresh bread' })
  assert.deepEqual(result.kept, ['price.value'])
  const mapping = JSON.parse(readFileSync(join(cwd, 'seed', 'contract-mapping.json')))
  assert.deepEqual(mapping.kept, ['price.value'])
  assert.deepEqual(mapping.pending, [])
  assert.equal(mapping.reasons['price.value'], 'evidence-missing')
})

test('a cached plan holding a value the Claude Cowork plugin refuses is swept before the apply, not after', async (t) => {
  // The plan is cached between runs, so a value written by an older seeder (or by a model turn
  // before the rule existed) survives a retry and fails the apply again — measured 16/09/2026 on
  // ja-kinetic, where `<400ms` in a metrics strip failed `seed` twice in a row with
  // `Markup and control characters are not content: module-194.15`. The sweep happens against the
  // slot inventory the site just answered with, so it also catches a rule the plan predates.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-sweep-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Pulse' } }))
  mkdirSync(join(cwd, 'seed'), { recursive: true })
  writeFileSync(
    join(cwd, 'seed', 'contract-mapping.json'),
    JSON.stringify({
      contract: 'test/v1',
      revision: 'original',
      changes: { 'stat.value': '<400ms', 'hero.title': 'Pulse' },
      evidence: {},
      pending: [],
      // The same key the CLI computes, so the cache is USED rather than re-planned: that is the
      // path this test is about.
      briefHash: createHash('sha256')
        .update(JSON.stringify({ site: { name: 'Pulse' }, target: 'pulse.example', contract: 'test/v1' }))
        .digest('hex')
    })
  )
  const slots = [
    { key: 'stat.value', sample: '99%', maxCharacters: 20, entity: 'module-1' },
    { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' }
  ]
  let applied = null
  const apply = async (c) => {
    if (c.params.operation === 'inspect')
      return { ok: true, contract: 'test/v1', revision: 'original', slots, pages: [] }
    applied = c.params
    return { ok: true }
  }
  const result = await main(
    ['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'pulse.example', '--keep-demo'],
    { cwd, env: {}, apply, generate: async () => ({ values: {}, pending: [] }) }
  )
  assert.equal(result.applied.ok, true)
  assert.deepEqual(applied.changes, { 'hero.title': 'Pulse' })
  assert.deepEqual(result.kept, ['stat.value'])
})

test('a rerun after the write already landed finishes instead of calling the plan empty', async (t) => {
  // Measured 23/09/2026 on `j-h0n2f4` (tracy-business): the first `apply` wrote every slot, then PHP
  // hit its 30-second limit and the door answered 500. The rerun read the same cached plan, found
  // every value already on the site, dropped them all — and failed with "The mapping contains no
  // customer content", on every retry, for a site that held exactly the customer's words.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-landed-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  const slot = { key: 'hero.title', sample: 'Demo', current: 'Demo', maxCharacters: 80, entity: 'module-1' }
  const calls = []
  const apply = async (c) => {
    calls.push(c.params.operation)
    if (c.params.operation === 'inspect')
      return { ok: true, contract: 'test/v1', revision: 'r1', slots: [{ ...slot }], pages: [] }
    // The write lands, then the answer is lost.
    slot.current = c.params.changes['hero.title']
    return { ok: false, code: 'COMPONENT_BAD_RESPONSE', status: 500, httpStatus: 502 }
  }
  const args = ['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'bakery.example']
  const generate = async () => ({ values: { 'hero.title': 'Fresh bread' }, pending: [] })
  await assert.rejects(() => main(args, { cwd, env: {}, apply, generate }))
  calls.length = 0
  const result = await main(args, { cwd, env: {}, apply, generate })
  assert.deepEqual(calls, ['inspect'], 'nothing left to write, so nothing is sent')
  assert.deepEqual(result.applied, { ok: true, unchanged: true, alreadyOnSite: 1 })
})

test('every model call a seed makes is metered beside the plan', async (t) => {
  // Cost per site could not be answered on 23/09/2026: `chat()` returned DeepSeek's usage and
  // nothing kept it, so a build that spent 22 model calls left no trace of them. Each call now
  // appends one line to `seed/usage.jsonl` — the model that ANSWERED (DeepSeek answers a retired
  // name with the one it bills), the one asked for, and the provider's own token counts.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-meter-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  const slot = { key: 'hero.title', sample: 'Demo', maxCharacters: 80, entity: 'module-1' }
  const apply = async (c) =>
    c.params.operation === 'inspect'
      ? { ok: true, contract: 'test/v1', revision: 'r1', slots: [slot], pages: [] }
      : { ok: true }
  const usage = { prompt_tokens: 5020, completion_tokens: 310, prompt_cache_hit_tokens: 4864 }
  const fetch = async () =>
    new Response(
      JSON.stringify({
        model: 'deepseek-flash',
        usage,
        choices: [
          { message: { content: JSON.stringify({ values: { 'hero.title': 'Fresh bread' }, pending: [] }) } }
        ]
      })
    )
  const args = ['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'bakery.example']
  await main(args, { cwd, env: { DEEPSEEK_API_KEY: 'test-only' }, apply, fetch })
  const lines = readFileSync(join(cwd, 'seed', 'usage.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].model, 'deepseek-flash')
  assert.equal(lines[0].requested, 'deepseek-flash')
  assert.equal(lines[0].provider, 'deepseek')
  assert.deepEqual(lines[0].usage, usage)
  assert.equal(lines[0].stage, 'seed')
  assert.match(lines[0].at, /^\d{4}-\d{2}-\d{2}T/)
})

// ── the hero picture ─────────────────────────────────────────────────────────────────────────────
//
// 🔒 A SEALED JOOMLA SITE KEPT EVERY DEMO PICTURE, AND THE HERO IS THE ONE A VISITOR SEES FIRST. Image
// slots are left out of the text plan on purpose — the Claude Cowork plugin takes only a path that already
// exists in the media library, and a model asked to "replace" one invented a path and lost a
// 19-minute seed (22/09/2026). The hero is now DRAWN, uploaded under its own content hash through
// `media.upload` (the path a sealed site accepts: `images/tracy-content/<sha256>.<ext>`, on an apply
// id of its own), and only then written into the slot. Client logos are never drawn: a logo is a
// fact about somebody else's brand. Measured 23/09/2026: gemini-3.1-flash-lite-image, $0.034 a hero.

/** A real JPEG of the given size, as a picture model would answer. */
function jpegOf(width, height) {
  return jpeg.encode({ width, height, data: Buffer.alloc(width * height * 4, 128) }, 80).data
}
/** The first 24 bytes of a PNG that says it is width × height — all a size reader looks at. */
function pngHeaderOf(width, height) {
  const b = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

function heroFixture(t, env, { webroot = true, size = [1376, 768], why = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-hero-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  // The site's webroot, read-only beside its build files in tracy-dsh: the demo hero is 16:10.
  if (webroot) {
    mkdirSync(join(cwd, '.webroot', 'images', 'northgate'), { recursive: true })
    writeFileSync(join(cwd, '.webroot', 'images', 'northgate', 'hero-ru.png'), pngHeaderOf(1600, 1000))
    writeFileSync(join(cwd, '.webroot', 'images', 'northgate', 'team-crew.png'), pngHeaderOf(1000, 880))
  }
  writeFileSync(
    join(cwd, 'preview.json'),
    JSON.stringify({ site: { name: 'Ton Hoa Sen', about: 'Metal roofing sheets', languages: ['en-GB'] } })
  )
  const data = join(cwd, 'data')
  mkdirSync(join(data, 'quickstart-contracts', 'test', 'j6', '1.0.0'), { recursive: true })
  writeFileSync(
    join(data, 'quickstart-contracts', 'test', 'j6', '1.0.0', 'content-map.json'),
    JSON.stringify({
      entities: [
        { key: 'module-441', identity: { language: 'en-GB' } },
        { key: 'module-447', identity: { language: 'en-GB' } },
        { key: 'module-9', identity: { language: 'ru-RU' } }
      ],
      slots: [],
      pages: []
    })
  )
  const slots = [
    {
      key: 'module-441.0',
      entity: 'module-441',
      type: 'text',
      sample: 'Demo',
      current: 'Demo',
      maxCharacters: 80,
      label: 'Home - Hero (en) / title'
    },
    {
      key: 'module-441.8',
      entity: 'module-441',
      type: 'image',
      sample: 'images/northgate/hero-ru.png',
      current: 'images/northgate/hero-ru.png',
      maxCharacters: 255,
      label: '[Tracy Business] Home - Hero (en) / image'
    },
    {
      key: 'module-447.1',
      entity: 'module-447',
      type: 'image',
      sample: 'images/northgate/logo-ru-1.png',
      current: 'images/northgate/logo-ru-1.png',
      maxCharacters: 255,
      label: '[Tracy Business] Home - Clients (en) / logo'
    },
    {
      key: 'module-9.8',
      entity: 'module-9',
      type: 'image',
      sample: 'images/northgate/hero-ru.png',
      current: 'images/northgate/hero-ru.png',
      maxCharacters: 255,
      label: '[Tracy Business] Home - Hero (ru) / image'
    },
    ...(why
      ? [
          {
            key: 'module-444.2',
            entity: 'module-444',
            type: 'image',
            sample: 'images/northgate/team-crew.png',
            current: 'images/northgate/team-crew.png',
            maxCharacters: 255,
            label: '[Tracy Business] Home - Why Northgate (en) / image'
          },
          {
            key: 'es-ES::module-444.2',
            entity: 'module-1444',
            type: 'image',
            sample: 'images/northgate/team-crew.png',
            current: 'images/northgate/team-crew.png',
            maxCharacters: 255,
            label: '[Tracy Business] Home - Why Northgate (en) / image',
            sourceKey: 'module-444.2'
          },
          {
            key: 'module-811.0',
            entity: 'module-811',
            type: 'image',
            sample: 'images/northgate/map-ru.png',
            current: 'images/northgate/map-ru.png',
            maxCharacters: 255,
            label: '[Tracy Business] Contact - Map (en) / image'
          }
        ]
      : [])
  ]
  const calls = []
  const apply = async (c) => {
    calls.push(c)
    if (c.action === 'media.upload') return { ok: true, path: c.params.path, created: true }
    if (c.params.operation === 'inspect')
      return { ok: true, contract: 'test/j6/1.0.0', revision: 'r1', slots, pages: [] }
    for (const [key, value] of Object.entries(c.params.changes ?? {})) {
      const slot = slots.find((s) => s.key === key)
      if (slot) slot.current = value
    }
    return { ok: true }
  }
  const picture = jpegOf(size[0], size[1])
  const drawn = []
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    drawn.push(body)
    return new Response(
      JSON.stringify({
        model: body.model,
        usage: { prompt_tokens: 60, completion_tokens: 1120, cost: 0.0336 },
        choices: [
          {
            message: {
              content: '',
              images: [{ image_url: { url: `data:image/jpeg;base64,${picture.toString('base64')}` } }]
            }
          }
        ]
      })
    )
  }
  const args = [
    '--platform',
    'joomla',
    '--preview',
    'preview.json',
    '--target-site',
    'bakery.example',
    '--data',
    data
  ]
  const generate = async () => ({ values: { 'module-441.0': 'Roofing that lasts' }, pending: [] })
  const run = (only = env) =>
    main(args, { cwd, env: { ...only, DSH_HOME: join(cwd, 'dsh') }, apply, fetch, generate })
  return { cwd, calls, drawn, picture, run }
}

test('the hero is drawn, uploaded under its hash, and written into its slot — never a logo', async (t) => {
  const f = heroFixture(t, { OPENROUTER_API_KEY: 'test-only' })
  const result = await f.run()
  const sent = Buffer.from(f.calls.find((c) => c.action === 'media.upload').params.content_b64, 'base64')
  const expected = `images/tracy-content/${createHash('sha256').update(sent).digest('hex')}.jpg`
  // Cut to the demo's 16:10 — the Claude Cowork plugin refuses a picture whose shape differs by more than 0.02,
  // and one refused value fails the whole seed (measured 23/09/2026 on j-ee6vsk: 1376×768 against
  // 1600×1000).
  const cut = jpeg.decode(sent)
  assert.ok(Math.abs(cut.width / cut.height - 1.6) <= 0.01, `${cut.width}x${cut.height}`)
  assert.equal(f.drawn.length, 1, 'one picture: the English hero; not the logo, not the Russian edition')
  assert.equal(f.drawn[0].model, 'google/gemini-3.1-flash-lite-image')
  assert.deepEqual(f.drawn[0].modalities, ['image', 'text'])
  const upload = f.calls.find((c) => c.action === 'media.upload')
  assert.equal(upload.params.path, expected)
  assert.doesNotMatch(
    upload.params.apply_id,
    /^contract-/,
    'a sealed site refuses a media upload on a contract receipt'
  )
  const write = f.calls.filter((c) => c.params.operation === 'apply').at(-1)
  assert.equal(write.params.changes['module-441.8'], expected)
  assert.equal(write.params.changes['module-447.1'], undefined, 'a logo is never drawn')
  assert.equal(write.params.changes['module-9.8'], undefined, 'an edition the customer did not choose')
  assert.equal(result.applied.ok, true)
  // The metered line says what the picture cost.
  const lines = readFileSync(join(f.cwd, 'seed', 'usage.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  assert.ok(lines.some((l) => l.stage === 'seed' && l.usage.cost === 0.0336))

  // A retry reuses the picture it already paid for.
  await f.run()
  assert.equal(f.drawn.length, 1)
})

test('the picture key may live in the credential store while the text runs on DeepSeek', async (t) => {
  // 🔒 THE DEV HOST'S SHAPE, 23/09/2026: `DEEPSEEK_API_KEY` in the environment, `OPENROUTER_API_KEY`
  // pushed by /ops into dsh's credential store. The text door stopped at the environment, so no
  // picture model was ever found although the key was on the machine.
  const f = heroFixture(t, { DEEPSEEK_API_KEY: 'test-only' })
  mkdirSync(join(f.cwd, 'dsh'), { recursive: true })
  writeFileSync(join(f.cwd, 'dsh', '.credentials.yaml'), 'refs:\n  OPENROUTER_API_KEY: test-only\n')
  await f.run()
  assert.equal(f.drawn.length, 1)
})

test('with no picture model the hero keeps the demo picture, and nothing is uploaded', async (t) => {
  const f = heroFixture(t, { DEEPSEEK_API_KEY: 'test-only' })
  await f.run()
  assert.equal(f.drawn.length, 0)
  assert.ok(!f.calls.some((c) => c.action === 'media.upload'))
  assert.equal(
    f.calls.filter((c) => c.params.operation === 'apply').at(-1).params.changes['module-441.8'],
    undefined
  )
})

test('a site whose words already landed still gets its hero on the next run', async (t) => {
  // A site seeded before pictures existed (j-h0n2f4, 23/09/2026) has every text slot on the site
  // already, so the plan reconciles to nothing — and a rerun that stopped at "nothing to write"
  // would never reach the hero.
  const f = heroFixture(t, { DEEPSEEK_API_KEY: 'test-only' })
  await f.run()
  assert.equal(f.drawn.length, 0, 'first run: no picture model, the words land')
  await f.run({ OPENROUTER_API_KEY: 'test-only' })
  assert.equal(f.drawn.length, 1, 'second run: the words are there, the hero is drawn')
  const write = f.calls.filter((c) => c.params.operation === 'apply').at(-1)
  assert.deepEqual(Object.keys(write.params.changes), ['module-441.8'])
})

test('the text is written by the provider and model /ops assigned, whatever the environment lists first', async (t) => {
  // The dev host's shape on 23/09/2026: DeepSeek's key in the environment, and /ops's push in the
  // credential store — OpenRouter's key plus seedText assigned to openai/gpt-5.4-mini.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-assigned-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Bakery' } }))
  mkdirSync(join(cwd, 'dsh'), { recursive: true })
  writeFileSync(
    join(cwd, 'dsh', '.credentials.yaml'),
    'refs:\n  OPENROUTER_API_KEY: "o"\n  TRACY_SEED_TEXT_PROVIDER: "openrouter"\n  TRACY_SEED_TEXT_MODEL: "openai/gpt-5.4-mini"\n'
  )
  const slot = { key: 'hero.title', sample: 'Demo', current: 'Demo', maxCharacters: 80, entity: 'module-1' }
  const apply = async (c) =>
    c.params.operation === 'inspect'
      ? { ok: true, contract: 'test/v1', revision: 'r1', slots: [slot], pages: [] }
      : { ok: true }
  const asked = []
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    asked.push({ url, model: body.model })
    return new Response(
      JSON.stringify({
        model: body.model,
        usage: {},
        choices: [
          { message: { content: JSON.stringify({ values: { 'hero.title': 'Fresh bread' }, pending: [] }) } }
        ]
      })
    )
  }
  await main(['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'bakery.example'], {
    cwd,
    env: { DEEPSEEK_API_KEY: 'd', DSH_HOME: join(cwd, 'dsh') },
    apply,
    fetch
  })
  assert.ok(asked.length > 0)
  assert.ok(
    asked.every((a) => a.model === 'openai/gpt-5.4-mini'),
    JSON.stringify(asked)
  )
  assert.ok(asked.every((a) => /openrouter\.ai/.test(a.url)))
})

test('a hero whose demo shape cannot be read is left alone rather than risked', async (t) => {
  // No webroot to measure the demo against means no way to know the Claude Cowork plugin will take the picture,
  // and a refused value fails the seed. The words still land.
  const f = heroFixture(t, { OPENROUTER_API_KEY: 'test-only' }, { webroot: false })
  await f.run()
  assert.ok(!f.calls.some((c) => c.action === 'media.upload'))
  assert.equal(f.drawn.length, 0, 'nothing is drawn that could not be used')
  assert.equal(
    f.calls.filter((c) => c.params.operation === 'apply').at(-1).params.changes['module-441.8'],
    undefined
  )
})

test('a picture cached before it was cut is cut on the next run, not drawn again', async (t) => {
  // j-ee6vsk, 23/09/2026: the first run drew and cached a 16:9 hero, and the Claude Cowork plugin refused it.
  // The retry must reuse the picture it paid for and cut it — not replay the refusal, not pay twice.
  const f = heroFixture(t, { OPENROUTER_API_KEY: 'test-only' })
  const cacheDir = join(f.cwd, 'seed', 'hero')
  mkdirSync(cacheDir, { recursive: true })
  const wide = jpegOf(1376, 768)
  const hash = createHash('sha256').update(wide).digest('hex')
  writeFileSync(join(cacheDir, `${hash}.jpg`), wide)
  // The record the first run left, under the id this prompt and sample produce.
  const { heroPrompt } = await import('../src/hero-images.mjs')
  const prompt = heroPrompt({ name: 'Ton Hoa Sen', about: 'Metal roofing sheets', languages: ['en-GB'] })
  const id = createHash('sha256')
    .update(
      JSON.stringify({
        prompt,
        sample: 'images/northgate/hero-ru.png',
        model: 'google/gemini-3.1-flash-lite-image'
      })
    )
    .digest('hex')
    .slice(0, 24)
  writeFileSync(
    join(cacheDir, `hero-${id}.json`),
    JSON.stringify({ file: `${hash}.jpg`, path: `images/tracy-content/${hash}.jpg` })
  )
  await f.run()
  assert.equal(f.drawn.length, 0, 'the cached picture is reused')
  const sent = jpeg.decode(
    Buffer.from(f.calls.find((c) => c.action === 'media.upload').params.content_b64, 'base64')
  )
  assert.ok(Math.abs(sent.width / sent.height - 1.6) <= 0.01, `${sent.width}x${sent.height}`)
})

test('a retry writes its cached plan against the revision the site has now', async (t) => {
  // Measured 23/09/2026 on `j-se6mii` (ja-voyara): the first apply was refused after the plan was
  // written, the site's revision moved, and every Retry after it sent the cached plan's OLD
  // revision — "Content changed; inspect again", forever. The cache is reconciled against the
  // inspect this run just made, slot by slot, so that inspect's revision is the one it holds.
  const cwd = mkdtempSync(join(tmpdir(), 'contract-cli-revision-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'preview.json'), JSON.stringify({ site: { name: 'Pulse' } }))
  mkdirSync(join(cwd, 'seed'), { recursive: true })
  writeFileSync(
    join(cwd, 'seed', 'contract-mapping.json'),
    JSON.stringify({
      contract: 'test/v1',
      revision: 'before-the-failed-apply',
      changes: { 'hero.title': 'Pulse' },
      evidence: {},
      pending: [],
      briefHash: createHash('sha256')
        .update(JSON.stringify({ site: { name: 'Pulse' }, target: 'pulse.example', contract: 'test/v1' }))
        .digest('hex')
    })
  )
  const slots = [
    { key: 'hero.title', sample: 'Demo', current: 'Demo', maxCharacters: 80, entity: 'module-1' }
  ]
  let applied = null
  const apply = async (c) => {
    if (c.params.operation === 'inspect')
      return { ok: true, contract: 'test/v1', revision: 'now', slots, pages: [] }
    applied = c.params
    return { ok: true }
  }
  await main(['--platform', 'joomla', '--preview', 'preview.json', '--target-site', 'pulse.example'], {
    cwd,
    env: {},
    apply,
    generate: async () => ({ values: {}, pending: [] })
  })
  assert.equal(applied.expected_revision, 'now')
})

// Measured 25/09/2026 on the Tracy Business stand build `j-56xke6` (a New York florist): the hero was
// drawn, but the home page's "Why" section kept the demo's construction crew in hard hats. Every
// photograph of the home page is drawn now, each for its own section and at its own demo shape —
// still never a logo, and never a map or a picture of another page.
test('every home-page photograph is drawn at its own shape — not a logo, not a map', async (t) => {
  const f = heroFixture(t, { OPENROUTER_API_KEY: 'test-only' }, { why: true })
  const result = await f.run()
  assert.equal(result.applied.ok, true)
  assert.equal(
    f.drawn.length,
    2,
    'the hero and the Why picture; not the logo, the map, or the Russian edition'
  )
  const prompts = f.drawn.map((d) => d.messages[0].content)
  assert.notEqual(prompts[0], prompts[1], 'each section is asked for its own picture')
  const uploads = f.calls.filter((c) => c.action === 'media.upload')
  const shapes = uploads.map((u) => {
    const img = jpeg.decode(Buffer.from(u.params.content_b64, 'base64'))
    return Math.round((img.width / img.height) * 100) / 100
  })
  assert.deepEqual(shapes.sort(), [1.14, 1.6])
  const write = f.calls.filter((c) => c.params.operation === 'apply').at(-1)
  assert.match(write.params.changes['module-444.2'], /^images\/tracy-content\/[0-9a-f]{64}\.jpg$/)
  assert.notEqual(write.params.changes['module-444.2'], write.params.changes['module-441.8'])
  assert.equal(write.params.changes['module-811.0'], undefined, 'a map is never drawn')
  assert.equal(
    write.params.changes['es-ES::module-444.2'],
    undefined,
    'a translated copy takes its source picture'
  )
  assert.equal(write.params.changes['module-447.1'], undefined, 'a logo is never drawn')
})
