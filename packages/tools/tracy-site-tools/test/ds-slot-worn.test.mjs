/**
 * A site wearing a design system through Tracy's design-system slot is read FROM THE SITE, on each CMS,
 * and the agent is told so (10/10/2026). Measured 09–10/10 on the stand (dskeepem, dskeepwp, dskeepjo):
 * the system survived every modify, but `GET /api/sites/<key>/design` answered `{"design":null}`, the
 * context had no "Design system:" line, `tracy_design_check` answered "This site wears no design
 * system", and on EmDash "make the hero button bigger and rounder" pinned the system's own values as
 * `!rounded-full !px-[34px] !py-[17px]`, which the next system (2px corners) never reached.
 *
 * The fixtures are what each read printed on the stand (`fixtures/ds-slot/<cms>-<site>.json`, the JSON
 * inside the `TRACY_DS_SLOT` line), so the parsers are held to the real artefacts the writers leave.
 *
 *   node --test packages/tools/tracy-site-tools/test/ds-slot-worn.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { variationSlug } from '../../../design/tracy-ds-slot/src/wordpress.mjs'
import { skippedAnswer, checkedAnswer } from '../src/host/design-check-tool.mjs'
import {
  DS_SLOT_SHEET,
  EMDASH_SLOT_FILE,
  parseSlotRead,
  slotMarkerOf,
  slotPinNotes,
  slotReadArgv,
  templateRolesOf,
  wordpressSlotSlug,
  wornSlotReader
} from '../src/host/ds-slot-worn.mjs'
import { designLine, lookLine, siteContext, unreadDesignLine } from '../src/host/site-context.mjs'

const fixture = (/** @type {string} */ name) =>
  JSON.parse(readFileSync(new URL(`fixtures/ds-slot/${name}.json`, import.meta.url), 'utf8'))
/** The one line a read prints, around whatever else the runtime prints. */
const printed = (/** @type {unknown} */ payload) =>
  `PHP Deprecated: noise\nTRACY_DS_SLOT ${Buffer.from(JSON.stringify(payload)).toString('base64')}\n`

const EMDASH = fixture('emdash-dskeepem')
const WORDPRESS = fixture('wordpress-dskeepwp')
const JOOMLA = fixture('joomla-dskeepjo')

// ── the marker and the reads ─────────────────────────────────────────────────────────────────────

test('marker: the id on every CMS, the name where the writer put one, nothing without it', () => {
  assert.deepEqual(slotMarkerOf(EMDASH.css), {
    id: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
    name: 'Moxie'
  })
  assert.deepEqual(slotMarkerOf(WORDPRESS.css), {
    id: 'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c',
    name: null
  })
  assert.deepEqual(slotMarkerOf(JOOMLA.css), {
    id: 'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c',
    name: null
  })
  assert.equal(slotMarkerOf(':root{--bg:#fff}'), null)
})

test('the WordPress slug is the slot writer’s own, so a variation name is believed only for its system', () => {
  for (const id of [
    'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c',
    'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
    'od:apple',
    'od:Some Very_Long--Name!! With Spaces 2026'
  ])
    assert.equal(wordpressSlotSlug(id), variationSlug(id), id)
})

test('reads: one per CMS, as www-data, inside the site’s own web container; none for another platform', () => {
  const em = slotReadArgv('emdash', 'site1-web-1')
  assert.deepEqual(em?.slice(0, 5), ['exec', '-u', 'www-data', 'site1-web-1', 'node'])
  assert.equal(em?.at(-1), EMDASH_SLOT_FILE)
  const wp = slotReadArgv('wordpress', 'site1-web-1')
  assert.deepEqual(wp?.slice(0, 5), ['exec', '-u', 'www-data', 'site1-web-1', 'wp'])
  assert.ok(wp?.includes('--skip-plugins') && wp.includes('--skip-themes'), 'no plugin or theme code runs')
  assert.match(String(wp?.at(-1)), /get_user_data_from_wp_global_styles/)
  const jo = slotReadArgv('joomla', 'site1-web-1')
  assert.deepEqual(jo?.slice(0, 7), ['exec', '-u', 'www-data', '-w', '/var/www/html', 'site1-web-1', 'php'])
  assert.match(String(jo?.at(-1)), /mod_custom.*published=1.*modules_menu/s)
  assert.equal(slotReadArgv('drupal', 'site1-web-1'), null)
  assert.throws(() => slotReadArgv('emdash', 'tracy-dsh'), /not a site web container/)
})

test('EmDash: the slot file names Moxie, lives in data/ds-slot.css, and its colours resolve through var() and color-mix', () => {
  const slot = parseSlotRead('emdash', printed(EMDASH))
  assert.ok(slot)
  assert.equal(slot.id, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  assert.equal(slot.name, 'Moxie')
  assert.match(slot.where, /data\/ds-slot\.css/)
  for (const name of ['--ds-btn-radius', '--ds-btn-pad-y', '--ds-c-accent', '--color-signal'])
    assert.ok(slot.vars.includes(name), name)
  assert.equal(slot.tokens['--ds-c-accent'], '#84acfb')
  assert.equal(slot.tokens['--color-signal'], '#84acfb', 'var(--ds-c-accent) resolved within the slot')
  // color-mix(in srgb, var(--ds-c-bg) 84%, var(--ds-c-fg)): #000000 and #f4efd4
  assert.equal(slot.tokens['--color-on-ink-muted'], '#272622')
  assert.equal(slot.tokens['--font-sans'], '"IBM Plex Sans", sans-serif')
  assert.equal(
    slot.tokens['--font-ds-font-display'],
    '"IBM Plex Serif", serif',
    'a font stack keyed as a font'
  )
  assert.ok(!('--ds-btn-radius' in slot.tokens), 'a radius is neither a colour nor a font')
})

test('WordPress: the global styles carry the marker; the name comes from the variation the theme recorded, only when it is that system', () => {
  const slot = parseSlotRead('wordpress', printed(WORDPRESS))
  assert.ok(slot)
  assert.equal(slot.id, 'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c')
  assert.equal(slot.name, 'Voiceflow')
  assert.match(slot.where, /global styles, style variation `ds-refero-03b3d707-2a30-4f53-a524`/)
  assert.ok(slot.vars.includes('--ds-c-accent'))
  assert.match(String(slot.tokens['--wp--preset--color--accent']), /^#[0-9a-f]{6}$/)
  assert.equal(
    slot.tokens['--ds-c-bg'],
    slot.tokens['--wp--preset--color--bg'],
    '--ds-c-* point at the presets'
  )
  assert.ok(Object.keys(slot.tokens).some((k) => k.startsWith('--font') && /Inter/.test(slot.tokens[k])))
  const other = parseSlotRead(
    'wordpress',
    printed({ ...WORDPRESS, variation: 'ds-refero-7f70ee10-123b-43cc-bd04' })
  )
  assert.equal(other?.name, null, 'the recorded variation is another system: no name is borrowed')
})

test('Joomla: the published module’s <style id="tracy-ds-slot"> is the slot, and the answer says which module', () => {
  const slot = parseSlotRead('joomla', printed(JOOMLA))
  assert.ok(slot)
  assert.equal(slot.id, 'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c')
  assert.match(slot.where, /^module 255 "Tracy design system"/)
  for (const name of ['--accent', '--radius-pill', '--font-display', '--ds-c-accent'])
    assert.ok(slot.vars.includes(name), name)
  assert.equal(slot.tokens['--font-display'], '"Source Serif 4", serif')
})

test('a read that did not answer is unknown; a site wearing nothing is known; a file the theme would not wear is nothing', () => {
  assert.equal(parseSlotRead('emdash', ''), undefined)
  assert.equal(parseSlotRead('emdash', 'TRACY_DS_SLOT not-base64-json'), undefined)
  assert.equal(
    parseSlotRead('joomla', printed({ ok: false, error: 'the database did not answer' })),
    undefined
  )
  assert.equal(parseSlotRead('wordpress', printed({ ok: true, css: null })), null)
  // `ds-slot.ts` wears the file only with its generated header first, never one carrying </style
  assert.equal(parseSlotRead('emdash', printed({ ok: true, css: `\n${EMDASH.css}` })), null)
  assert.equal(parseSlotRead('emdash', printed({ ok: true, css: `${EMDASH.css}</style>` })), null)
  assert.equal(parseSlotRead('joomla', printed({ ok: true, css: '<p>/* tracy-ds-slot: od:x */</p>' })), null)
})

// ── the reader the host keeps ────────────────────────────────────────────────────────────────────

test('reader: one read a minute per site, kept when a read fails, a slow read answers what was known and fills it for the next step', async () => {
  let clock = 0
  /** @type {any[]} */
  const runs = []
  /** @type {(value: any) => void} */
  let release = () => {}
  let mode = 'answer'
  const run = async (/** @type {any} */ input) => {
    runs.push(input)
    if (mode === 'fail') throw new Error('docker: no such container')
    if (mode === 'slow') await new Promise((resolve) => (release = resolve))
    return { code: 0, stdout: printed(EMDASH), stderr: '' }
  }
  const reader = wornSlotReader({ run, now: () => clock, freshMs: 60_000 })
  const first = await reader.read('site1', 'emdash')
  assert.equal(first?.name, 'Moxie')
  assert.equal(runs[0].stdin, '', 'stdin closed at once: no read takes input')
  assert.equal((await reader.read('site1', 'emdash'))?.name, 'Moxie')
  assert.equal(runs.length, 1, 'within the minute: no second read')
  clock = 61_000
  mode = 'fail'
  assert.equal((await reader.read('site1', 'emdash'))?.name, 'Moxie', 'a failed read keeps what was known')
  assert.equal(runs.length, 2)
  mode = 'slow'
  clock = 200_000
  const late = await reader.read('site1', 'emdash', { waitMs: 5 })
  assert.equal(late?.name, 'Moxie', 'the step went on with what was known')
  const joined = reader.read('site1', 'emdash', { fresh: true })
  release(undefined)
  assert.equal((await joined)?.name, 'Moxie')
  assert.equal(runs.length, 3, 'the read already on its way was joined, not started twice')
  // nothing known yet and the read is slow: unknown, not "none"
  const fresh = wornSlotReader({ run: () => new Promise(() => {}), now: () => 0 })
  assert.equal(await fresh.read('site2', 'joomla', { waitMs: 5 }), undefined)
  assert.equal(
    await fresh.read('site2', 'drupal'),
    null,
    'a platform with no slot reads as none, without docker'
  )
})

// ── what the agent is told ───────────────────────────────────────────────────────────────────────

const SLOTS = {
  emdash: parseSlotRead('emdash', printed(EMDASH)),
  wordpress: parseSlotRead('wordpress', printed(WORDPRESS)),
  joomla: parseSlotRead('joomla', printed(JOOMLA))
}

for (const [platform, slot] of Object.entries(SLOTS))
  test(`design line: a worn slot is named, where it lives, its variables, and edits relative to them — never its values pinned: ${platform}`, () => {
    const line = designLine(null, slot)
    assert.ok(line)
    assert.match(line, /^- Design system: /)
    assert.ok(line.includes(slot.id), 'the id')
    if (slot.name) assert.ok(line.includes(slot.name), 'the name')
    assert.ok(line.includes(slot.where), 'where it lives')
    assert.match(line, /owns what its variables set: colours, fonts, corner radius, button padding/)
    assert.match(line, /var\(--ds-c-accent/, 'an example built from a variable this slot sets')
    // stand, 10/10/2026 (em-I5): the agent made the padding relative but kept the leftover `!rounded-full`
    // and pinned `!text-[17px]`, so a 2px-corner system left the hero a pill
    assert.match(
      line,
      /replace every literal the element already carries for one \(`rounded-full`, `px-\[34px\]`, a hex, a font size the slot sets\) the same way, asked or not/
    )
    // review of #1513 (21/10/2026): the fallback is the template's own value, never the worn system's
    assert.match(
      line,
      /<T> is the template's own value \(grep "var\(--ds-"\), never this system's: removing it brings the template back/
    )
    assert.match(
      line,
      /`!` \(important\) only before such a `var\(\)` or `calc\(var\(\)\)` value, never before a literal/
    )
    assert.match(line, /already shows what is asked.* change nothing and say so/)
    assert.match(line, /A whole new look is choosing another design system, not editing CSS/)
    assert.doesNotMatch(line, /none bound|NO_DESIGN_BOUND|#[0-9a-f]{6}/i, 'names, never values')
    // a new element copies the template's own kind (Akemi, 20/10/2026)
    assert.match(
      line,
      /A NEW element \(button, card, section\) copies the classes of the template's own element of that kind, never a style of its own/
    )
    // 1400 → 1520 for that one sentence (20/10/2026); → 1610 for "a colour … never refused" (23/10/2026)
    assert.ok(Buffer.byteLength(line) <= 1610, `${Buffer.byteLength(line)} bytes`)
  })

test('design line: the examples are in the syntax of the CMS — Tailwind classes on EmDash, CSS elsewhere — with the slot’s own variables', () => {
  // the template's own values not known: each example carries the mark the next sentence names, never a value
  const em = designLine(null, SLOTS.emdash) ?? ''
  assert.match(em, /`bg-\[var\(--ds-c-accent,<T>\)\]`/)
  assert.match(
    em,
    /`!rounded-\[var\(--ds-btn-radius,<T>\)\]`/,
    'the radius pin swapped for the slot’s radius'
  )
  assert.match(em, /`!py-\[calc\(var\(--ds-btn-pad-y,<T>\)\+4px\)\]`/, 'bigger relative to the slot')
  const jo = designLine(null, SLOTS.joomla) ?? ''
  assert.match(jo, /`border-radius: var\(--radius-pill, <T>\)`/)
  assert.match(jo, /`calc\(var\(--radius-pill, <T>\) \+ 4px\)`/)
  assert.doesNotMatch(jo, /!rounded-|!py-/, 'no Tailwind class on a site that has none')
})

// Review of #1513 (21/10/2026): the examples read `var(--ds-c-accent)` with no fallback and the line said "keep
// the template's fallback" without giving it — copied as taught, the element painted nothing once the system
// was off, and a fallback copied off the page was the worn system's colour, which stayed.
test('🔒 design line, worn: every example carries the TEMPLATE’s own value as its fallback — never the worn system’s', () => {
  const template = /** @type {any} */ (
    templateRolesOf(
      '.btn{background:var(--ds-c-accent, #da5a2a);border-radius:var(--ds-btn-radius, 999px);padding:var(--ds-btn-pad-y, 14px) 28px}'
    )
  )
  const em = designLine(null, SLOTS.emdash, null, template) ?? ''
  assert.match(em, /`bg-\[var\(--ds-c-accent,#da5a2a\)\]`/)
  assert.match(em, /`!rounded-\[var\(--ds-btn-radius,999px\)\]`/)
  assert.match(em, /`!py-\[calc\(var\(--ds-btn-pad-y,14px\)\+4px\)\]`/)
  assert.match(
    em,
    /The fallback is the template's own value, never this system's: removing it brings the template back/
  )
  assert.doesNotMatch(em, /<T>/)
  assert.doesNotMatch(
    em,
    new RegExp(SLOTS.emdash.tokens['--ds-c-accent'], 'i'),
    "never the worn system's value"
  )
  assert.ok(Buffer.byteLength(em) <= 1610, `${Buffer.byteLength(em)} bytes`)
  const wp = designLine(null, SLOTS.wordpress, null, template) ?? ''
  assert.match(wp, /`var\(--ds-c-accent, #da5a2a\)`/)
  // a role the template does not read, or a value too long for the line: the mark, named in the next sentence
  const jo = designLine(null, SLOTS.joomla, null, template) ?? ''
  assert.match(jo, /`var\(--ds-c-accent, #da5a2a\)`, `border-radius: var\(--radius-pill, <T>\)`/)
  assert.match(jo, /<T> is the template's own value \(grep "var\(--ds-"\)/)
})

test('design line: the slot wins over a record — it is what the page prints; without a slot the record line is as before', () => {
  const record = {
    schemaVersion: 'tracy-site-design/v1',
    id: null,
    source: 'none',
    bound: false,
    platform: 'emdash'
  }
  assert.match(designLine(record) ?? '', /none bound/)
  assert.match(designLine(record, SLOTS.emdash) ?? '', /Moxie .*worn through Tracy's design-system slot/)
  assert.equal(designLine(null), null)
})

/** A site folder with a webroot and a platform record, as provision leaves it. */
function siteOn(/** @type {string} */ label, /** @type {string} */ platform) {
  const folder = path.join(mkdtempSync(path.join(tmpdir(), 'ds-slot-worn-')), label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
  )
  mkdirSync(path.join(folder, '.webroot'))
  return folder
}

for (const platform of /** @type {const} */ (['emdash', 'wordpress', 'joomla']))
  test(`site context: the slot's line stands where the design line stands, byte-stable while the slot stands: ${platform}`, async () => {
    const folder = siteOn(`slot-${platform}`, platform)
    const never = async () => {
      throw new Error('the platform comes from the record')
    }
    const without = await siteContext(folder, `slot-${platform}`, never, `designer-${platform}`)
    assert.doesNotMatch(
      without?.text ?? '',
      /^- Design system:/m,
      'BEFORE: nothing said about the system it wears'
    )
    const once = await siteContext(folder, `slot-${platform}`, never, `designer-${platform}`, {
      slot: SLOTS[platform]
    })
    const twice = await siteContext(folder, `slot-${platform}`, never, `designer-${platform}`, {
      slot: SLOTS[platform]
    })
    const lines = (once?.text ?? '').split('\n')
    const at = lines.findIndex((one) => one.startsWith('- Design system:'))
    assert.ok(at > 0, 'AFTER: the line is there')
    assert.equal(lines[at], designLine(null, SLOTS[platform]))
    assert.equal(once?.text, twice?.text, 'byte-stable')
    // the rest of the block is the block without the slot, plus this one line
    assert.equal(lines.filter((_, i) => i !== at).join('\n'), without?.text)
  })

test('site context, worn: the roles the same read found in the template are the fallback the line’s examples carry', async () => {
  const folder = siteOn('slot-roles-emdash', 'emdash')
  const roles = templateRolesOf(
    '.btn{background:var(--ds-c-accent, #da5a2a);border-radius:var(--ds-btn-radius, 999px)}'
  )
  const text =
    (
      await siteContext(folder, 'slot-roles-emdash', async () => 'emdash', 'designer-emdash', {
        slot: SLOTS.emdash,
        roles
      })
    )?.text ?? ''
  const line = text.split('\n').find((one) => one.startsWith('- Design system:'))
  assert.equal(line, designLine(null, SLOTS.emdash, null, roles))
  assert.match(
    String(line),
    /`bg-\[var\(--ds-c-accent,#da5a2a\)\]`, `!rounded-\[var\(--ds-btn-radius,999px\)\]`/
  )
})

// ── a site wearing NO system: the template's role variables (Akemi, 20/10/2026) ─────────────────

for (const platform of /** @type {const} */ (['emdash', 'wordpress', 'joomla']))
  test(`design line, nothing worn: the role variables the template reads, a value through them with the template's own as the fallback, a new element as the template's own kind: ${platform}`, () => {
    const line = designLine(null, null, { platform }) ?? ''
    assert.match(line, /^- Design system: none worn — the site shows its template's own look\. /)
    // the one list of roles (`role-variables.mjs`), by family
    assert.match(line, /`--ds-c-\{bg,surface,[^}]*\baccent\b[^}]*\bborder\b[^}]*\}`/)
    assert.match(line, /`--ds-\{btn,card,input,pill\}-radius`/)
    assert.match(line, /`--ds-font-\{display,body/)
    assert.match(line, /status colours `--ds-c-\{success,warn,danger,info\}\{,-bg,-text\}`/)
    assert.match(
      line,
      platform === 'emdash'
        ? /`bg-\[var\(--ds-c-accent,<the template's value>\)\]`/
        : /`background: var\(--ds-c-accent, <the template's value>\)`/
    )
    assert.match(line, /never a bare hex, font name or radius, asked or not/)
    assert.match(line, /follows a design system applied later/)
    assert.match(
      line,
      /A NEW element \(button, card, section\) copies the classes of the template's own element of that kind/
    )
    assert.match(line, /A value the customer names exactly is kept as they named it/)
    assert.doesNotMatch(line, /#[0-9a-f]{3,6}\b/i, 'names, never values')
    assert.ok(Buffer.byteLength(line) <= 1400, `${Buffer.byteLength(line)} bytes`)
  })

test('design line, nothing worn: a record the build bound keeps its line first, the roles follow; a worn slot still wins', () => {
  const record = {
    schemaVersion: 'tracy-site-design/v1',
    id: 'tracy-business',
    name: 'Tracy Business',
    source: 'quickstart',
    bound: true,
    platform: 'emdash',
    tokens: { '--color-signal': '#da5a2a' }
  }
  const line = designLine(record, null, { platform: 'emdash' }) ?? ''
  assert.ok(line.startsWith(`${designLine(record)} `), 'the record line, as before, then the roles')
  assert.match(line, /read Tracy's design-system role variables/)
  assert.doesNotMatch(line, /none worn/)
  assert.equal(designLine(record, SLOTS.emdash, { platform: 'emdash' }), designLine(null, SLOTS.emdash))
  // a record that binds nothing says no more than "none worn"
  const none = {
    schemaVersion: 'tracy-site-design/v1',
    id: null,
    source: 'none',
    bound: false,
    platform: 'joomla'
  }
  assert.equal(designLine(none, null, { platform: 'joomla' }), designLine(null, null, { platform: 'joomla' }))
})

for (const platform of /** @type {const} */ (['emdash', 'wordpress', 'joomla']))
  test(`site context, nothing worn: the roles line only when the read found none — unknown says nothing new, an imported site never: ${platform}`, async () => {
    const folder = siteOn(`roles-${platform}`, platform)
    const never = async () => {
      throw new Error('the platform comes from the record')
    }
    const ctx = (/** @type {any} */ opts) =>
      siteContext(folder, `roles-${platform}`, never, `designer-${platform}`, opts)
    const asked = (await ctx({ slot: undefined }))?.text ?? ''
    // review of #1513 (21/10/2026): a read that did not answer left no design line and no new-element rule
    const unknownLine = asked.split('\n').find((one) => one.startsWith('- Design system:')) ?? ''
    assert.equal(unknownLine, unreadDesignLine(null, platform))
    assert.match(unknownLine, /could not be read yet/)
    assert.doesNotMatch(
      unknownLine,
      /none worn|worn through/,
      'a read that did not answer is neither "none worn" nor worn'
    )
    assert.match(
      unknownLine,
      /A NEW element \(button, card, section\) copies the classes of the template's own element/
    )
    assert.match(unknownLine, /with the template's own value as the fallback .*grep "var\(--ds-"/)
    assert.match(
      unknownLine,
      platform === 'emdash'
        ? /`bg-\[var\(--ds-c-accent,<the template's value>\)\]`/
        : /`background: var\(--ds-c-accent, <the template's value>\)`/
    )
    const unknown = asked
      .split('\n')
      .filter((one) => one !== unknownLine)
      .join('\n')
    assert.equal(
      unknown,
      (await ctx({}))?.text,
      'a caller that never asked about the slot: no line, as before'
    )
    const none = (await ctx({ slot: null, roles: { vars: ['--ds-c-accent'] } }))?.text ?? ''
    const lines = none.split('\n')
    const at = lines.findIndex((one) => one.startsWith('- Design system:'))
    assert.ok(at > 0, 'the line is there')
    assert.equal(lines[at], designLine(null, null, { platform }))
    assert.equal(lines.filter((_, i) => i !== at).join('\n'), unknown, 'and nothing else changed')
    // an imported site reads no role variable: it is told nothing about them
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `roles-${platform}.tracy.test`, platform, origin: 'imported' })
    )
    assert.doesNotMatch(
      (await ctx({ slot: null, roles: { vars: ['--ds-c-accent'] } }))?.text ?? '',
      /role variables/
    )
  })

// Measured 20/10/2026: Tracy Business EmDash 1.7.4 (stand dskeepem) reads no `var(--ds-` at all, so a line
// naming role variables "the template's stylesheets read" would be false there.
test('design line, nothing worn, a template that reads no role: no role is claimed; its own classes and the new-element rule are', () => {
  for (const platform of ['emdash', 'wordpress', 'joomla']) {
    const line = designLine(null, null, { platform, roles: false }) ?? ''
    assert.match(
      line,
      /^- Design system: none worn — the site shows its template's own look; keep to the template's own classes and variables/
    )
    assert.match(
      line,
      /A NEW element \(button, card, section\) copies the classes of the template's own element of that kind/
    )
    assert.doesNotMatch(line, /--ds-|role variables/)
  }
  const record = {
    schemaVersion: 'tracy-site-design/v1',
    id: 'tracy-business',
    name: 'Tracy Business',
    source: 'quickstart',
    bound: true,
    platform: 'emdash',
    tokens: {}
  }
  const bound = designLine(record, null, { platform: 'emdash', roles: false }) ?? ''
  assert.ok(
    bound.startsWith(`${designLine(record)} A NEW element`),
    'the record line as before, then the new-element rule'
  )
})

// ── the LOOK rules ───────────────────────────────────────────────────────────────────────────────

for (const platform of ['wordpress', 'joomla', 'emdash'])
  test(`LOOK line: a change by hand is read back with page.look before the customer is told: ${platform}`, () => {
    const line = lookLine(platform, 'designer', true) ?? ''
    assert.match(
      line,
      /After a change by hand, read the element again with `page\.look` and tell the customer the value it now shows/
    )
    assert.doesNotMatch(
      lookLine(platform, 'writer', false) ?? '',
      /After a change by hand/,
      'a mode that cannot change the look'
    )
  })

test('LOOK line, EmDash: a value the slot sets beats tokens.css, so the class is written relative to its variable', () => {
  assert.match(
    lookLine('emdash', 'designer', true) ?? '',
    /A value the design-system slot sets \(the Design system line\) beats tokens\.css: write the element's class relative to the slot's variable \(`!py-\[calc\(var\(--ds-btn-pad-y,15px\)\+4px\)\]`\), never a literal\./
  )
})

// Stand, 10/10/2026 (em-I5, Moxie worn): "make the main button at the top a bit bigger" turned the padding
// relative but kept `!rounded-full` (left by an earlier turn) and added `!text-[17px]`; a 2px-corner system
// then left the hero a pill while the band button followed. The road says to swap the element's leftover
// literals for the slot's variables, and that `!` goes only before a slot value.
test('LOOK line, EmDash: the element’s leftover literal pins for what the slot sets are swapped too, and `!` stands only before a slot value', () => {
  const line = lookLine('emdash', 'designer', true) ?? ''
  assert.match(
    line,
    /Swap every literal the element already has for something the slot sets \(`!rounded-full` → `!rounded-\[var\(--ds-btn-radius,0\)\]`, `!px-\[34px\]` → `!px-\[var\(--ds-btn-pad-x,30px\)\]`\); `!` only before a `var\(--ds-…\)` value, never before a literal\./
  )
})

// ── the design check ─────────────────────────────────────────────────────────────────────────────

test('design check: measured against the slot’s own colours and fonts; a skipped measure points at the slot, not at a design.json the site lacks', () => {
  const slot = /** @type {any} */ (SLOTS.emdash)
  const answer = checkedAnswer({
    design: { id: slot.id, source: 'slot', tokens: slot.tokens },
    pages: [
      {
        path: '/',
        url: 'http://site/',
        probe: {
          href: 'http://site/',
          seen: 3,
          samples: [
            { prop: 'background-color', value: 'rgb(132, 172, 251)', count: 2, where: ['a.btn-primary'] },
            { prop: 'color', value: 'rgb(244, 239, 212)', count: 9, where: ['p'] },
            { prop: 'font-family', value: '"IBM Plex Serif", serif', count: 2, where: ['h1.h-hero'] }
          ]
        }
      }
    ],
    reportPath: 'docs/agents/build/design-check.json'
  })
  assert.equal(answer.checked, true)
  assert.deepEqual(answer.design, { id: slot.id, source: 'slot' })
  assert.deepEqual(
    answer.warnings,
    [],
    'the slot’s accent, text colour and display font are all on the system'
  )
  const skipped = skippedAnswer(
    'no browser in this site container',
    { id: slot.id, source: 'slot' },
    slot.where
  )
  assert.match(skipped.next, /the design-system slot this site wears \(`refero:7f70ee10/)
  assert.ok(skipped.next.includes(slot.where))
  assert.doesNotMatch(skipped.next, /design\.json/)
  assert.match(skippedAnswer('x', { id: 'apple', source: 'catalog' }).next, /docs\/agents\/design\.json/)
})

test('the slot’s sheet is named the way the cascade answer names an inline <style>', () => {
  // test-quality: contract the label look-style.mjs and exec.mjs build in the browser for an inline sheet with this id; that code runs only in a page
  assert.equal(DS_SLOT_SHEET, '<style id="tracy-ds-slot">')
})

// ── page.look: a literal over one of the slot's variables ───────────────────────────────────────────

// Stand, images from 8323b61f7 (10/10/2026), dskeepem wearing Moxie: page.look's reading of the hero button
// after the agent's write — padding through the slot's variables, the corner radius a literal pin. The
// agent left the pin; the reading now names it.
const heroReading = () => ({
  ok: true,
  url: 'http://127.0.0.1:4321/',
  el: '<a.btn-primary.!rounded-full>',
  text: 'See our capabilities',
  style: {
    padding: {
      value: '13px 29px',
      set: 'padding-block: calc(var(--ds-btn-pad-y,15px) + 6px) !important',
      by: '.\\!py-\\[calc\\(var\\(--ds-btn-p…',
      tokens: ['--ds-btn-pad-y = 7px · :root · <style id="tracy-ds-slot">', '+1 more']
    },
    'border-radius': {
      value: '3.35544e+07px',
      set: 'border-radius: 2147483647px !important',
      by: '.\\!rounded-full @layer utilit…',
      in: '/_astro/NotFound.OozZezoT.css'
    },
    'font-size': {
      value: '16px',
      set: 'font-size: 16px !important',
      by: '.\\!text-\\[16px\\] @layer utilities'
    }
  },
  next: 'tokens: the var() values this comes from.'
})

test('🔒 page.look on a slot site: a literal corner radius on a button is named as a pin over --ds-btn-radius; rows set through the slot are left alone', () => {
  const a = slotPinNotes(heroReading(), SLOTS.emdash)
  assert.equal(
    a.style['border-radius'].pin,
    "a literal over the slot's --ds-btn-radius: the next system will not reach it — write var(--ds-btn-radius, 2147483647px)"
  )
  assert.equal(a.style.padding.pin, undefined, 'set through the slot already')
  assert.equal(a.style['font-size'].pin, undefined, 'the slot has no button size to pin over')
  assert.match(
    a.next,
    /A row with `pin` is a literal over the design system's variable: write the var\(\) it names/
  )
})

test('page.look pin notes: a literal colour names the nearest slot colour; Joomla corners name --radius-pill; nothing to name, nothing said', () => {
  const colour = slotPinNotes(
    {
      ok: true,
      el: '<p.lead>',
      style: { color: { value: 'rgb(255, 255, 255)', hex: '#ffffff', set: 'color: #fff', by: '.lead' } },
      next: 'n.'
    },
    SLOTS.emdash
  )
  assert.equal(
    colour.style.color.pin,
    "a literal over the slot's --ds-c-fg: the next system will not reach it — write var(--ds-c-fg, #fff)"
  )
  const joomla = slotPinNotes(
    {
      ok: true,
      el: '<a.btn.btn-primary>',
      style: { 'border-radius': { value: '4px', set: 'border-radius: 4px', by: '.btn' } },
      next: 'n.'
    },
    SLOTS.joomla
  )
  assert.match(
    joomla.style['border-radius'].pin,
    /over the slot's --radius-pill: .* write var\(--radius-pill, 4px\)$/
  )
  const wp = slotPinNotes(
    {
      ok: true,
      el: '<a.wp-block-button__link>',
      style: { 'border-radius': { value: '4px', set: 'border-radius: 4px', by: '.x' } },
      next: 'n.'
    },
    SLOTS.wordpress
  )
  assert.equal(wp.style['border-radius'].pin, undefined, 'this slot sets no radius variable')
  assert.equal(wp.next, 'n.')
  const refused = { ok: false, code: 'LOOK_FAILED' }
  assert.equal(slotPinNotes(refused, SLOTS.emdash), refused)
})

// ── A layout is looked for in the record that prints it, and "done" means the items stand as asked ──────────
// (22/10/2026: a menu asked six times to lie in one row, said done six times, the page unchanged; the cause
// was a class on the menu module, not a CSS value.) The sentence is the LOOK_CHECK's own, so it is sent on
// every platform and in exactly the modes that can change a look.
for (const platform of ['wordpress', 'joomla', 'emdash'])
  test(`LOOK line: a layout is sought in the settings of the record that prints it, and done is said for what was asked: ${platform}`, () => {
    const line = lookLine(platform, 'designer', true) ?? ''
    assert.match(
      line,
      /A layout \(a row, columns, pills, stacked\) is often a class set in the settings of the menu, module or block that prints it, not in CSS/
    )
    assert.match(line, /look at the classes `page\.look` names around the element before writing a rule/)
    assert.match(line, /say done only when the items stand as asked/)
    // no platform, CMS, template or customer is named: the rule is the same on every road
    assert.doesNotMatch(line.slice(line.indexOf('A layout')), /Joomla|WordPress|EmDash|T4|nav-pills/)
    assert.doesNotMatch(
      lookLine(platform, 'writer', false) ?? '',
      /A layout \(a row/,
      'a mode that cannot change the look'
    )
  })

test('LOOK_CHECK costs about 250 characters on every step of a mode that changes a look, and nothing elsewhere', () => {
  // The old sentence was 154 characters; the layout sentence adds the rest, and the check of a rule for nothing
  // on the page (#1710, 25/10/2026) about 130 more. The bound is a tripwire for the next addition, not a
  // measurement of this one.
  const line = lookLine('joomla', 'designer', true) ?? ''
  const check = line.slice(line.indexOf('After a change by hand'))
  assert.ok(check.length >= 380 && check.length <= 560, `LOOK_CHECK is ${check.length} characters`)
})
