/**
 * `site.rebuild` on an EmDash site wearing a design-system slot names every class written since the last
 * build that pins a value the slot owns, with the slot-relative class to write instead (TCH #1100).
 *
 * Stand, images from 8323b61f7 (10/10/2026), dskeepem wearing Moxie: "make the main button at the top a bit
 * smaller" became one string replace that kept `!rounded-full` and wrote `!text-[16px]`; the rebuild
 * answered only "Tell the customer in one line what changed", and under MotherDuck (2px corners) the hero
 * stayed a pill. The container read below runs for real, on a fixture app folder.
 *
 *   node --test packages/site/tracy-site-build-emdash/test/slot-pins.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { rebuildSite } from '../src/host/requests.mjs'
import { SLOT_PINS_SCRIPT, parsePinsRead, pinsNext, slotPins, slotPinsArgv } from '../src/host/slot-pins.mjs'

const MOXIE = JSON.parse(
  readFileSync(
    new URL('../../../tools/tracy-site-tools/test/fixtures/ds-slot/emdash-dskeepem.json', import.meta.url),
    'utf8'
  )
).css

/** The hero's class before the turn (in the last build) and after it (the agent's write), as measured. */
const BEFORE =
  'btn-primary !rounded-full !px-[calc(var(--ds-btn-pad-x,30px)+17px)] !py-[calc(var(--ds-btn-pad-y,15px)+12px)] !text-[17px]'
const AFTER =
  'btn-primary !rounded-full !px-[calc(var(--ds-btn-pad-x,30px)+8px)] !py-[calc(var(--ds-btn-pad-y,15px)+6px)] !text-[16px]'
const BAND = 'btn-primary !px-[34px] !py-[17px] !text-[16px]'

/**
 * An `/app` folder: the slot, the last build's output holding `built` (an hour ago), the source as it is
 * now — `Home.astro` saved since that build — and a component no page uses, older than the build and
 * left out of its bundle (shadcn's `input.tsx` on the stand).
 */
// 🔒 EVERY MTIME IS SET FROM ONE FIXED INSTANT, NEVER FROM `Date.now()`. The read compares file times
// with each other only, but a file this test writes and does not touch carries the file system's clock,
// while `Date.now()` is the process's: under the clock-shift run (CI, 10/10/2026, clock moved 400 days)
// the build output "an hour ago" landed 400 days after the source and three tests went red. A fixed
// instant keeps the order the tests mean on any clock.
const SAVED = Date.UTC(2026, 9, 10, 12) / 1000
const ago = (/** @type {number} */ s) => SAVED - s

function app({ slot = MOXIE, built = [BEFORE, BAND], hero = AFTER, dist = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'slot-pins-'))
  mkdirSync(join(root, 'data'))
  if (slot !== null) writeFileSync(join(root, 'data', 'ds-slot.css'), slot)
  mkdirSync(join(root, 'src', 'views'), { recursive: true })
  mkdirSync(join(root, 'src', 'components', 'ui'), { recursive: true })
  const unused = join(root, 'src', 'components', 'ui', 'input.tsx')
  writeFileSync(unused, "export const cls = 'h-9 w-full rounded-md border px-3 py-1 text-base'\n")
  utimesSync(unused, ago(7200), ago(7200))
  const lines = Array.from({ length: 190 }, (_, i) => `<!-- line ${i + 1} -->`)
  lines[84] = `\t\t\t\t\t\t{h.hero_cta1_label && live(cta1Url) && <a href={cta1Url} class="${hero}" {...$page("hero_cta1_label")}>{h.hero_cta1_label}</a>}`
  lines[184] = `\t\t\t\t{live(bandUrl) && <a href={bandUrl} class="${BAND}" {...$page("band_button")}>{h.band_button}</a>}`
  writeFileSync(join(root, 'src', 'views', 'Home.astro'), lines.join('\n'))
  utimesSync(join(root, 'src', 'views', 'Home.astro'), SAVED, SAVED)
  if (dist) {
    mkdirSync(join(root, 'dist', 'server', 'chunks'), { recursive: true })
    const chunk = join(root, 'dist', 'server', 'chunks', 'Home_x.mjs')
    writeFileSync(chunk, built.map((cls) => `$$render\`<a class="${cls}">\``).join('\n'))
    utimesSync(chunk, ago(3600), ago(3600))
  }
  return root
}

/** The container read, run by this machine's node exactly as the container runs it. */
const read = (/** @type {string} */ root) =>
  parsePinsRead(execFileSync(process.execPath, ['-e', SLOT_PINS_SCRIPT, root], { encoding: 'utf8' }))

test('the read: only the class strings the last build does not contain, on a site wearing a slot', () => {
  const r = read(app())
  assert.ok(r)
  assert.match(String(r.slot), /^\/\* tracy-ds-slot: refero:7f70ee10/)
  assert.equal(r.dist, true)
  assert.deepEqual(
    r.found?.map((f) => [f.file, f.line, f.cls]),
    [['src/views/Home.astro', 85, AFTER]],
    'the band button (line 185) is unchanged since the last build, and the unused component is older than it: neither is judged'
  )
  assert.deepEqual(slotPinsArgv('dskeepem-web-1').slice(0, 6), [
    'exec',
    '-u',
    'www-data',
    'dskeepem-web-1',
    'node',
    '-e'
  ])
})

// Measured on the stand with nothing edited since its last build: 14 class strings of unused components
// were absent from dist. A file not saved since the build is not read at all.
test('the read: nothing saved since the last build, nothing judged — the unused component absent from dist included', () => {
  const root = app()
  utimesSync(join(root, 'src', 'views', 'Home.astro'), ago(7200), ago(7200))
  assert.deepEqual(read(root)?.found, [])
})

// Measured on the stand (dswalkem02, Tracy Business 1.7.11, 11/10/2026): Astro writes a static class
// attribute with `&` escaped, so the hero's `[[data-ds-worn]_&]:inline-flex` string was in dist only as
// `_&amp;]` and read as new on every save of Home.astro — its `!text-[15px]` named again each time.
test('the read: a class string with `&` that the last build holds escaped is not new', () => {
  const HERO = 'btn-primary !px-[var(--ds-btn-pad-x,28px)] !text-[15px] [[data-ds-worn]_&]:inline-flex'
  const root = app({ built: [HERO.replaceAll('&', '&amp;'), BAND], hero: HERO })
  assert.deepEqual(read(root)?.found, [], 'the unchanged hero, written escaped in dist, is not judged')
  const changed = read(
    app({ built: [HERO.replaceAll('&', '&amp;'), BAND], hero: HERO.replace('15px', '16px') })
  )
  assert.deepEqual(
    changed?.found?.map((f) => f.cls),
    [HERO.replace('15px', '16px')],
    'a changed string with `&` is still judged'
  )
})

test('the read: no slot, nothing else read; no build output yet, nothing judged', () => {
  assert.deepEqual(read(app({ slot: null })), { ok: true, slot: null })
  assert.equal(read(app({ slot: '/* not a slot */' }))?.slot, null)
  const none = read(app({ dist: false }))
  assert.equal(none?.dist, false)
  assert.deepEqual(none?.found, [])
})

test('🔒 the measured turn: the kept `!rounded-full` and the `!` before a literal size are named, with what to write — the TEMPLATE’s own value as the fallback', () => {
  // review of #1513 (21/10/2026): the fallback was the literal typed (`9999px`, the worn system's pill), so
  // taking the system off left the hero a pill; the template's own corner (999px here) is what comes back
  const pins = slotPins(/** @type {any} */ (read(worn())))
  assert.deepEqual(pins, [
    {
      at: 'src/views/Home.astro:85',
      class: '!rounded-full',
      use: '!rounded-[var(--ds-btn-radius,999px)]',
      why: "a literal corner radius over the slot's --ds-btn-radius"
    },
    { at: 'src/views/Home.astro:85', class: '!text-[16px]', use: 'text-[16px]', why: '`!` before a literal' }
  ])
  const next = pinsNext(pins)
  assert.match(
    next,
    /^Built, but 2 classes written since the last build pin a value the design-system slot owns/
  )
  assert.match(
    next,
    /src\/views\/Home\.astro:85 `!rounded-full` → `!rounded-\[var\(--ds-btn-radius,999px\)\]`/
  )
  assert.match(
    next,
    /Before you tell the customer anything, in this same turn: make each replacement .*then ONE site\.rebuild again\./
  )
})

test('what counts as a pin: radius, button padding, colours and heading sizes the slot owns; relative classes and non-button padding pass', () => {
  const judged = (/** @type {string} */ cls, /** @type {string} */ text = '') =>
    slotPins({
      ok: true,
      slot: MOXIE,
      roles: TEMPLATE_CSS,
      dist: true,
      found: [{ file: 'src/x.astro', line: 1, cls, text }]
    }).map((p) => [p.class, p.use])
  // the role is the slot's; the fallback the template's own value for it, never the literal copied off the page
  assert.deepEqual(judged('btn-primary px-[34px] !py-4'), [
    ['px-[34px]', 'px-[var(--ds-btn-pad-x,28px)]'],
    ['!py-4', '!py-[var(--ds-btn-pad-y,14px)]']
  ])
  assert.deepEqual(judged('btn-primary p-[12px]'), [
    ['p-[12px]', 'px-[var(--ds-btn-pad-x,28px)] py-[var(--ds-btn-pad-y,14px)]']
  ])
  assert.deepEqual(judged('card rounded-lg md:rounded-[6px]'), [
    ['rounded-lg', 'rounded-[var(--ds-card-radius,0px)]'],
    ['md:rounded-[6px]', 'md:rounded-[var(--ds-card-radius,0px)]']
  ])
  assert.deepEqual(judged('bg-[#84acfb] hover:text-[#ffffff]'), [
    ['bg-[#84acfb]', 'bg-[var(--ds-c-accent,#da5a2a)]'],
    ['hover:text-[#ffffff]', 'hover:text-[var(--ds-c-fg,#14171a)]']
  ])
  assert.deepEqual(judged('h-hero text-[48px]', '<h1 class="h-hero text-[48px]">'), [
    ['text-[48px]', 'text-[var(--ds-size-display,64px)]']
  ])
  // already relative with a fallback of its own, padding of something that is not a button, a plain literal
  // size: nothing to say
  assert.deepEqual(
    judged(
      'btn-primary !rounded-[var(--ds-btn-radius,9999px)] !px-[calc(var(--ds-btn-pad-x,30px)+8px)] bg-[var(--ds-c-accent,#da5a2a)] text-[16px]'
    ),
    []
  )
  assert.deepEqual(judged('section px-6 py-[72px]'), [])
  assert.deepEqual(judged('section !px-6'), [['!px-6', 'px-6']], 'a `!` before a literal is named anywhere')
  // no slot, nothing judged
  assert.deepEqual(slotPins({ ok: true, slot: null }), [])
})

test('🔒 rebuildSite: reads the pins BEFORE the build, builds anyway, and answers with findings and a next that puts the fix before the reply', async () => {
  const calls = []
  const printed = `TRACY_SLOT_PINS ${Buffer.from(JSON.stringify(read(app()))).toString('base64')}\n`
  const run = async (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
    calls.push([cmd, ...args])
    if (args.includes(SLOT_PINS_SCRIPT)) return { code: 0, stdout: printed, stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 200 })
  /** @type {any} */
  let done
  try {
    done = await rebuildSite({ targetSiteKey: 'dskeepem.tracy.test' }, { run, env: {} })
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(done.ok, true, done.detail)
  const at = (/** @type {(c: string[]) => boolean} */ is) => calls.findIndex(is)
  assert.ok(
    at((c) => c.includes(SLOT_PINS_SCRIPT)) < at((c) => c.includes('node_modules/.bin/astro')),
    'the pins are read while dist is still the last build'
  )
  assert.equal(done.findings.length, 2)
  assert.equal(done.findings[0].class, '!rounded-full')
  assert.match(done.next, /Before you tell the customer anything/)
  assert.match(done.detail, /2 classes to change before the reply: see findings\./)
})

test('rebuildSite on a site wearing no slot, or whose read did not answer, answers as before', async () => {
  for (const stdout of [
    `TRACY_SLOT_PINS ${Buffer.from('{"ok":true,"slot":null}').toString('base64')}\n`,
    ''
  ]) {
    const run = async (/** @type {string} */ _cmd, /** @type {string[]} */ args) =>
      args.includes(SLOT_PINS_SCRIPT) ? { code: 0, stdout, stderr: '' } : { code: 0, stdout: '', stderr: '' }
    const realFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('', { status: 200 })
    /** @type {any} */
    let done
    try {
      done = await rebuildSite({ targetSiteKey: 'dskeepem.tracy.test' }, { run, env: {} })
    } finally {
      globalThis.fetch = realFetch
    }
    assert.equal(done.ok, true)
    assert.equal(done.findings, undefined)
    assert.equal(done.next, undefined)
    assert.doesNotMatch(done.detail, /findings/)
  }
})

// ── A site wearing NO system: the template's own roles are the ruler (Akemi, 20/10/2026) ─────────
// "A new button follows the template when no design system is worn, and the new system's rules when one
// is": a literal written today matches the template, and the first system applied never reaches it.

/** The template's own stylesheet as Tracy templates write it: each role read with its value as fallback. */
const TEMPLATE_CSS = [
  '@theme {',
  '  --color-signal: var(--ds-c-accent, #da5a2a);',
  '  --color-ink: var(--ds-c-fg, #14171a);',
  '  --color-head: var(--ds-c-heading, #14171a);',
  '  --color-paper: var(--ds-c-bg, #f5f3ee);',
  '}',
  '.btn-primary { border-radius: var(--ds-btn-radius, 999px); padding: var(--ds-btn-pad-y, 14px) var(--ds-btn-pad-x, 28px); }',
  '.card { border-radius: var(--ds-card-radius, 0px); }',
  'h1 { font-size: var(--ds-size-display, 64px); font-family: var(--ds-font-display, "Fraunces", serif); }'
].join('\n')

/** An `/app` wearing the slot, with the template's own stylesheet under `src/styles/` beside it. */
function worn(/** @type {Parameters<typeof app>[0]} */ opts = {}) {
  const root = app(opts)
  mkdirSync(join(root, 'src', 'styles'), { recursive: true })
  writeFileSync(join(root, 'src', 'styles', 'tokens.css'), TEMPLATE_CSS)
  return root
}

/** The same `/app` with no slot and the template's stylesheet under `src/styles/`. */
function bare(/** @type {{ hero?: string, css?: string }} */ opts = {}) {
  const root = app({ slot: null, ...(opts.hero ? { hero: opts.hero } : {}) })
  mkdirSync(join(root, 'src', 'styles'), { recursive: true })
  writeFileSync(join(root, 'src', 'styles', 'tokens.css'), opts.css ?? TEMPLATE_CSS)
  return root
}

test('the read, nothing worn: the template stylesheets come back as the ruler; a template that reads no role reads nothing', () => {
  const r = read(bare())
  assert.equal(r?.slot, null)
  assert.match(String(r?.roles), /var\(--ds-btn-radius, 999px\)/)
  assert.deepEqual(
    r?.found?.map((f) => f.cls),
    [AFTER],
    'the same changed strings as on a worn site'
  )
  assert.deepEqual(read(bare({ css: '.btn { border-radius: 999px; }' })), { ok: true, slot: null })
})

test('🔒 nothing worn: a new button’s literal corner and colour are named over the template’s roles, its own value kept as the fallback', () => {
  const NEW = 'btn-primary rounded-full bg-[#da5a2a] text-[#14171a]'
  const pins = slotPins(/** @type {any} */ (read(bare({ hero: NEW }))))
  assert.deepEqual(
    pins.map((p) => [p.class, p.use]),
    [
      ['rounded-full', 'rounded-[var(--ds-btn-radius,9999px)]'],
      ['bg-[#da5a2a]', 'bg-[var(--ds-c-accent,#da5a2a)]'],
      // two roles share the value: both named, the element's own is the template's to say
      ['text-[#14171a]', 'text-[var(--ds-c-fg,#14171a)] or text-[var(--ds-c-heading,#14171a)]']
    ]
  )
  assert.match(pins[0].why, /over the template's role --ds-btn-radius/)
  assert.match(pins[2].why, /nearest --ds-c-fg or --ds-c-heading: the one this element plays/)
  const next = pinsNext(pins, false)
  assert.match(
    next,
    /pin a value of the template's design-system roles, so a design system applied later will not reach them/
  )
  assert.match(next, /then ONE site\.rebuild again\./)
  // a class written relative to a role passes, as on a worn site
  assert.deepEqual(
    slotPins(
      /** @type {any} */ (read(bare({ hero: 'btn-primary rounded-[var(--ds-btn-radius,9999px)] bg-signal' })))
    ),
    []
  )
})

test('rebuildSite, nothing worn: the pins over the template’s roles come back with their own next', async () => {
  const root = bare({ hero: 'btn-primary rounded-full' })
  const stdout = execFileSync(process.execPath, ['-e', SLOT_PINS_SCRIPT, root], { encoding: 'utf8' })
  const run = async (/** @type {string} */ _cmd, /** @type {string[]} */ args) =>
    args.includes(SLOT_PINS_SCRIPT) ? { code: 0, stdout, stderr: '' } : { code: 0, stdout: '', stderr: '' }
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 200 })
  /** @type {any} */
  let done
  try {
    done = await rebuildSite({ targetSiteKey: 'dsbare.tracy.test' }, { run, env: {} })
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(done.ok, true)
  assert.deepEqual(
    done.findings.map((/** @type {any} */ p) => p.use),
    ['rounded-[var(--ds-btn-radius,9999px)]']
  )
  assert.match(done.next, /a design system applied later will not reach it/)
})

// ── Review of #1513 (21/10/2026): the template's value as the fallback, and a role read judged too ─────

test('🔒 worn, the template’s value not known: the replacement says so, never the literal copied off the worn system', () => {
  const pins = slotPins(/** @type {any} */ (read(app())))
  assert.equal(pins[0].class, '!rounded-full')
  assert.equal(pins[0].use, "!rounded-[var(--ds-btn-radius,<the template's value>)]")
  assert.match(
    pins[0].why,
    /not known here: take it from the template's stylesheet \(grep "var\(--ds-btn-radius"\)/
  )
  assert.doesNotMatch(pins[0].use, /9999px|1000px/, 'neither the literal typed nor the worn value')
})

test('the read on a worn site: the template stylesheets come back too — the fallback a value written there keeps', () => {
  const r = read(worn())
  assert.match(String(r?.slot), /^\/\* tracy-ds-slot: /)
  assert.match(String(r?.roles), /var\(--ds-btn-radius, 999px\)/)
  assert.equal(read(app())?.roles, null, 'a template that reads no role: none')
})

test('🔒 a class that reads a role with no fallback, or with the worn system’s value as one, is named with the template’s value', () => {
  const on = (/** @type {string | null} */ slot, /** @type {string} */ cls) =>
    slotPins({
      ok: true,
      slot,
      roles: TEMPLATE_CSS,
      dist: true,
      found: [{ file: 'src/x.astro', line: 4, cls, text: `<a class="${cls}">` }]
    }).map((p) => [p.class, p.use, p.why])
  // worn: no fallback paints nothing once the system is off; the worn value as fallback keeps the system
  const worn = on(
    MOXIE,
    'btn-primary bg-[var(--ds-c-accent)] rounded-[var(--ds-btn-radius,1000px)] !py-[calc(var(--ds-btn-pad-y)+4px)] text-[var(--ds-c-fg,#F4EFD4)]'
  )
  assert.deepEqual(
    worn.map(([cls, use]) => [cls, use]),
    [
      ['bg-[var(--ds-c-accent)]', 'bg-[var(--ds-c-accent,#da5a2a)]'],
      ['rounded-[var(--ds-btn-radius,1000px)]', 'rounded-[var(--ds-btn-radius,999px)]'],
      ['!py-[calc(var(--ds-btn-pad-y)+4px)]', '!py-[calc(var(--ds-btn-pad-y,14px)+4px)]'],
      ['text-[var(--ds-c-fg,#F4EFD4)]', 'text-[var(--ds-c-fg,#14171a)]']
    ]
  )
  assert.match(String(worn[0][2]), /has no fallback: it paints nothing wherever no design system sets it/)
  assert.match(String(worn[1][2]), /is the worn system's value, not the template's/)
  // the template's own value as the fallback, or a fallback of the agent's own that is not the worn value: passes
  assert.deepEqual(on(MOXIE, 'bg-[var(--ds-c-accent,#da5a2a)] rounded-[var(--ds-btn-radius,4px)]'), [])
  // wearing nothing: a read with no fallback paints nothing now; one with any fallback is today's look
  assert.deepEqual(
    on(null, 'font-[var(--ds-font-display)] bg-[var(--ds-c-accent,#123456)]').map(([cls, use]) => [cls, use]),
    [['font-[var(--ds-font-display)]', 'font-[var(--ds-font-display,"Fraunces",_serif)]']]
  )
  const next = pinsNext(
    slotPins({
      ok: true,
      slot: MOXIE,
      roles: TEMPLATE_CSS,
      dist: true,
      found: [{ file: 'src/x.astro', line: 4, cls: 'bg-[var(--ds-c-accent)]' }]
    })
  )
  assert.match(
    next,
    /will not follow the next design system, or the template's own look once this one is taken off, as written/
  )
  assert.doesNotMatch(next, /it looks the same today/)
})

test('the read: a changed class string that reads a role is judged even with no other utility the check knows', () => {
  const r = read(worn({ hero: 'btn-primary font-[var(--ds-font-display)]' }))
  assert.deepEqual(
    r?.found?.map((f) => f.cls),
    ['btn-primary font-[var(--ds-font-display)]']
  )
  assert.deepEqual(
    slotPins(/** @type {any} */ (r)).map((p) => p.use),
    ['font-[var(--ds-font-display,"Fraunces",_serif)]']
  )
})
