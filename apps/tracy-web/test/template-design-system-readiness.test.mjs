/**
 * The Template Design System Readiness check (ADR 0031): each static rule on small releases built in
 * memory, judged against the slot contracts this tree carries (`packages/design/tracy-ds-slot/templates`),
 * so a rule cannot pass on a contract nobody ships. Plus the weighing of a report and the assets a
 * check downloads.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

import { dsAssetsOf } from '../src/lib/template-design-system-readiness/assets.js'
import { checkRelease } from '../src/lib/template-design-system-readiness/index.js'
import { addedReads } from '../src/lib/template-design-system-readiness/readers/tokenized.js'
import { dubaiTime } from '../src/lib/template-design-system-readiness/rules/built-site.js'
import {
  DS_SEVERITY,
  phaseTwoOf,
  summarizeDsReadiness
} from '../src/lib/template-design-system-readiness/severity.js'
import { zipOf } from './template-customization-question-readiness-fixtures.mjs'
import { PREVIEW_PROBE_VERSION as CURRENT_PROBE } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

/**
 * The "Measured on" stamp of the tree's own measurement file of a Joomla line (version, day, machine):
 * read off the file, since every final measure writes it anew.
 */
const joomlaFile = (slug, version) =>
  `packages/cms/tracy-joomla-quickstart/contracts/${slug}/j6/${version}/design-system-measurement.json`
const treeStamp = (slug, version) => {
  const own = JSON.parse(
    readFileSync(new URL(`../../../${joomlaFile(slug, version)}`, import.meta.url), 'utf8')
  )
  return `${own.version}, ${dubaiTime(own.measuredAt)}, ${own.machine}`
}
const stampPattern = (stamp) => new RegExp(`Measured on ${stamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

/** A minimal ustar tar.gz of `files` (path -> text). */
function tarGz(files) {
  const blocks = []
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.fill(' ', 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

/** A release source over `assets` (name -> bytes), the shape `checkRelease` reads. */
const sourceOf = (tag, setting, assets) => {
  const all = { 'tracy_setting.json': JSON.stringify(setting), ...assets }
  return {
    tag,
    where: `memory:${tag}`,
    names: async () => Object.keys(all).sort(),
    read: async (name) => (name in all ? Buffer.from(all[name]) : null)
  }
}

/** A captured package: webroot + database (only the webroot is served; no rule reads the database). */
const JOOMLA_INSTALL = Object.freeze({
  webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
  database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
})

/**
 * The report as /ops scores it once the same file carries preview rows of the current probe: these
 * fixtures are sweep rows with no preview block, so the check marks them "not measured with preview
 * probe vN" (`previewProbe`); dropping that mark keeps scoring the built-site rules they hold.
 */
const atCurrentProbe = (report) => ({
  ...report,
  results: report.results.map(({ previewProbe: _gap, ...r }) => r)
})

const statusOf = (report) => Object.fromEntries(report.results.map((r) => [r.id, r.status]))
const resultOf = (report, id) => report.results.find((r) => r.id === id)

/** JA Essence Joomla as its contract knows it: palette #f8f8ff page, #4d6bff accent, off-canvas slot. */
const ESSENCE_TAG = 'quickstart/ja-essence/j6'
const essence = (version, files) =>
  sourceOf(
    ESSENCE_TAG,
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Essence',
      version,
      cms: '6.0.0',
      template: 'ja_essence',
      install: JOOMLA_INSTALL
    },
    {
      'w.tar.gz': tarGz({
        'templates/ja_essence/templateDetails.xml':
          '<extension><positions><position>off-canvas</position></positions></extension>',
        ...Object.fromEntries(Object.entries(files).map(([n, t]) => [`templates/ja_essence/${n}`, t]))
      })
    }
  )

const TOKENIZED = `body{background-color:var(--ds-c-bg, #f8f8ff)}a{color:var(--ds-c-accent-text, #4d6bff)}
.btn-primary{background-color:var(--ds-c-accent, #4d6bff);color:var(--ds-c-accent-on, #ffffff)}`
const UNTOKENIZED =
  'body{background-color:#f8f8ff}a{color:#4d6bff}.btn-primary{background-color:#4d6bff;color:#ffffff}'

test('a tokenized JA Joomla release inside its checked range passes the static rules; its kept band is named', async () => {
  const report = await checkRelease(essence('1.0.7', { 'css/template.css': TOKENIZED }))
  const s = statusOf(report)
  assert.deepEqual(
    ['SLOT-1', 'SLOT-2', 'CSS-1', 'CSS-2', 'DEF-1', 'PLAT-1'].map((id) => s[id]),
    ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']
  )
  // every kept band of the contract is declared in `bands` (13/10/2026, #1281: `.btn-dark` too) — the
  // failing case is the BAND-1 test below, on a contract built for it
  assert.equal(s['BAND-1'], 'pass')
  // What only a built site tells comes from the measurement file of this version (the 13/10 sweep,
  // #1316): decided, never passed on faith; a version nobody measured is not measured (#1313)
  for (const id of ['ROLE-1', 'SCREEN-1', 'CON-1', 'UNDO-1', 'FONT-1'])
    assert.ok(['pass', 'fail'].includes(s[id]), `${id}: ${s[id]}`)
  assert.match(resultOf(report, 'UNDO-1').message, stampPattern(treeStamp('ja-essence', '1.0.7')))
  // the IDENT-1 re-run of 14/10/2026 probed the logo (its site name, read on its own ground) and the
  // page's mode too; no light/dark switch, so MODE-2 does not apply
  assert.equal(s['IDENT-1'], 'pass')
  assert.ok(['pass', 'fail'].includes(s['MODE-1']), `MODE-1: ${s['MODE-1']}`)
  assert.equal(s['MODE-2'], 'not-applicable')
  // a version nobody measures (1.0.99): not measured, with the commands that measure it, filled in
  const unmeasured = await checkRelease(essence('1.0.99', { 'css/template.css': TOKENIZED }), {
    only: ['ROLE-1']
  })
  assert.equal(statusOf(unmeasured)['ROLE-1'], 'unmeasured')
  assert.match(resultOf(unmeasured, 'ROLE-1').message, /not measured yet on 1\.0\.99/)
  const fix = resultOf(unmeasured, 'ROLE-1').fix
  assert.match(fix, /stand\.mjs up quickstart\/ja-essence\/j6 --version 1\.0\.99 /)
  assert.match(
    fix,
    /flow\.mjs --cms joomla --template joomla-ja-essence .*--measure-version 1\.0\.99 --measure-tag quickstart\/ja-essence\/j6 --measure-template ja-essence/
  )
  assert.match(fix, /preview-check\.mjs .*--only quickstart\/ja-essence\/j6 .*--write/)
})

test('a preview detector rule not measured says how the PREVIEW is measured (preview-check.mjs), not the built-site run', async () => {
  const report = await checkRelease(essence('1.0.99', { 'css/template.css': TOKENIZED }), {
    only: ['IDENT-2', 'FONT-2', 'HOVER-1', 'FOREIGN-1']
  })
  for (const id of ['IDENT-2', 'FONT-2', 'HOVER-1', 'FOREIGN-1']) {
    const r = resultOf(report, id)
    assert.equal(r.status, 'unmeasured', id)
    assert.match(r.fix, /preview-check\.mjs/, id)
    assert.doesNotMatch(r.fix, /pass-joomla\.mjs/, id)
  }
})

test('CSS-1: a release rebuilt from the untokenized source fails, naming the sheet', async () => {
  const report = await checkRelease(essence('1.0.7', { 'css/template.css': UNTOKENIZED }))
  const css1 = resultOf(report, 'CSS-1')
  assert.equal(css1.status, 'fail')
  assert.match(
    css1.message,
    /The main stylesheet css\/template\.css paints \d+ palette colours and reads the slot nowhere/
  )
  assert.match(css1.fix, /tokenize\.mjs --template joomla-ja-essence/)
  // Most sheets untokenized fails too, even with the main one tokenized.
  const most = await checkRelease(
    essence('1.0.7', { 'css/template.css': TOKENIZED, 'css/a.css': UNTOKENIZED, 'css/b.css': UNTOKENIZED })
  )
  assert.equal(resultOf(most, 'CSS-1').status, 'fail')
  assert.match(
    resultOf(most, 'CSS-1').message,
    /2 of 3 stylesheets that paint the palette read the slot nowhere/
  )
})

test('CSS-1: one stray sheet painting a colour without the slot is a CSS-2 leftover, not a rebuild', async () => {
  // JA Donate 1.0.3, 12/10/2026: one small sheet paints one palette colour, every other sheet reads the slot.
  const report = await checkRelease(
    essence('1.0.7', {
      'css/template.css': TOKENIZED,
      'css/megamenu.css': TOKENIZED,
      'css/home.css': '.home-hero{background-color:#f8f8ff}'
    })
  )
  assert.equal(resultOf(report, 'CSS-1').status, 'pass')
  assert.match(resultOf(report, 'CSS-1').message, /1 stray one counted by CSS-2/)
  assert.equal(resultOf(report, 'CSS-2').status, 'fail')
  assert.match(resultOf(report, 'CSS-2').message, /css\/home\.css/)
})

test('CSS-2 leaves out the T4 sheets no customer page loads: css/rtl/ and the css/themes/ presets (#1313)', async () => {
  // JA Donate 1.0.3 held CSS-2 red on css/themes/dark/home.css, a preset the page never loads with a system
  const report = await checkRelease(
    essence('1.0.7', {
      'css/template.css': TOKENIZED,
      'css/themes/dark/home.css': '.home-hero{background-color:#f8f8ff}',
      'css/rtl/template.css': '.x{color:#4d6bff}'
    })
  )
  assert.equal(resultOf(report, 'CSS-1').status, 'pass')
  assert.equal(resultOf(report, 'CSS-2').status, 'pass')
})

test('CSS-2 counts what a second pass really adds: a swap the tokenizer undoes is no leftover', async () => {
  // A literal fill the palette does not hold keeps its text literal too: the tokenizer counts a swap
  // of #ffffff and undoes it (12/10/2026: JA Essence 1.0.7 read "6 left" for a pass that changed no byte).
  const sheet = `${TOKENIZED}\n.social-fb{background-color:#3b5999;color:#ffffff}`
  assert.deepEqual(addedReads(sheet, sheet, new Set()), { left: 0, leftByRole: {} })
  const report = await checkRelease(essence('1.0.7', { 'css/template.css': sheet }))
  assert.equal(resultOf(report, 'CSS-2').status, 'pass')
  // One real literal left beside the tokenized rules is counted, by role.
  const leftover = await checkRelease(
    essence('1.0.7', { 'css/template.css': `${TOKENIZED}\n.foot{background-color:#f8f8ff}` })
  )
  assert.equal(resultOf(leftover, 'CSS-2').status, 'fail')
  assert.match(
    resultOf(leftover, 'CSS-2').message,
    /1 palette colour does not read the slot in the role today's contract gives/
  )
})

test('SLOT-2: a version newer than the last one checked is refused by the door, and says how to move maxVersion', async () => {
  // The newest checked version moves each time a release is measured (1.0.10 since TEXT-1 batch 2, 21/10/2026).
  const report = await checkRelease(essence('1.0.11', { 'css/template.css': TOKENIZED }))
  const slot2 = resultOf(report, 'SLOT-2')
  assert.equal(slot2.status, 'fail')
  assert.match(slot2.message, /1\.0\.11 is newer than the last version .* was checked on \(1\.0\.10\)/)
  assert.match(slot2.fix, /move maxVersion\["quickstart\/ja-essence\/j6"\] to 1\.0\.11/)
  const older = await checkRelease(essence('1.0.5', { 'css/template.css': TOKENIZED }))
  assert.match(
    resultOf(older, 'SLOT-2').message,
    /older than the first version that wears the slot \(1\.0\.6\)/
  )
})

test('DEF-1: a slot read with no fallback of the template fails; a nested fallback that ends in a value passes', async () => {
  const bare = await checkRelease(
    essence('1.0.7', {
      'css/template.css': `${TOKENIZED}\nh1{color:var(--ds-c-fg)}\nh2{color:var(--ds-c-fgg, #111)}`
    })
  )
  const def1 = resultOf(bare, 'DEF-1')
  assert.equal(def1.status, 'fail')
  assert.match(def1.message, /1 slot read has no fallback/)
  assert.match(def1.message, /--ds-c-fgg/)
  const nested = await checkRelease(
    essence('1.0.7', {
      'css/template.css': `${TOKENIZED}\nh1{font-size:var(--ds-size-display-phone, var(--ds-size-display, clamp(38px, 5vw, 64px)))}`
    })
  )
  assert.equal(resultOf(nested, 'DEF-1').status, 'pass')
})

test('DEF-1: a role variable is a known role; a bare read in a template property passes only when every read of it falls back', async () => {
  // JA Kinetic Joomla 1.0.8 (16/10/2026): the standard role variables (role-variables.mjs) are emitted,
  // and its accent tints are template properties made of a bare read, each read with its own value
  const kept = await checkRelease(
    essence('1.0.7', {
      'css/template.css': `${TOKENIZED}\n:root{--kds-accent-8: color-mix(in srgb, var(--ds-c-accent) 8%, transparent)}\nh1{color:var(--ds-c-heading, #111);outline-color:var(--ds-c-focus-ring, #00f)}\n.a{background:var(--kds-accent-8, rgba(163, 230, 53, .08))}`
    })
  )
  assert.equal(resultOf(kept, 'DEF-1').status, 'pass', resultOf(kept, 'DEF-1').message)
  const unguarded = await checkRelease(
    essence('1.0.7', {
      'css/template.css': `${TOKENIZED}\n:root{--kds-accent-8: color-mix(in srgb, var(--ds-c-accent) 8%, transparent)}\n.a{background:var(--kds-accent-8)}`
    })
  )
  const def1 = resultOf(unguarded, 'DEF-1')
  assert.equal(def1.status, 'fail')
  assert.match(def1.message, /--ds-c-accent \(in --kds-accent-8\)/)
})

test('DEF-1: a bare read in a rule that applies only while a system is worn keeps the default look', async () => {
  // Batch 2 (18/10/2026): JA Spa, Tour, Trip, Vital and Impact write their worn-only rules under the
  // worn scope (:root:has(#tracy-ds-slot), the WORN_RULES :where(...) form, or an enclosing rule).
  const gated = await checkRelease(
    essence('1.0.7', {
      'css/template.css': [
        TOKENIZED,
        ':where(:root:has(#tracy-ds-slot)) .hero::after{background:color-mix(in srgb, var(--ds-c-accent) 20%, var(--ds-c-bg))}',
        'html[data-theme="dark"]:has(#tracy-ds-slot) .a:focus, html[data-theme="dark"]:has(#tracy-ds-slot) .b:focus{color:var(--ds-c-accent-text)}',
        '@media (min-width: 768px){:root:has(#tracy-ds-slot):not(#x) .c{color:var(--ds-c-on-ink)}}',
        ':root:has(#tracy-ds-slot){.d{color:var(--ds-c-fg)}}',
        ':root{--t-ink-10: color-mix(in srgb, var(--ds-c-on-ink) 10%, transparent)}',
        '.e{border-color:var(--t-ink-10, rgba(255,255,255,.1))}',
        ':root:has(#tracy-ds-slot) .f{background:var(--t-ink-10)}'
      ].join('\n')
    })
  )
  assert.equal(resultOf(gated, 'DEF-1').status, 'pass', resultOf(gated, 'DEF-1').message)
})

test('DEF-1: a bare read outside the worn scope is still caught, also when only part of the selector is gated', async () => {
  for (const rule of [
    '.ja-trip-accent-tint-wash{background:color-mix(in srgb, var(--ds-c-accent-text) 8%, var(--ds-c-bg))}',
    ':root:has(#tracy-ds-slot) .a, .b{color:var(--ds-c-fg)}',
    ':root:not(:has(#tracy-ds-slot)) .a{color:var(--ds-c-fg)}',
    ':is(:root:has(#tracy-ds-slot), .b) .a{color:var(--ds-c-fg)}',
    '@media (min-width: 1px){.a{color:var(--ds-c-fg)}}'
  ]) {
    const report = await checkRelease(essence('1.0.7', { 'css/template.css': `${TOKENIZED}\n${rule}` }))
    assert.equal(resultOf(report, 'DEF-1').status, 'fail', rule)
  }
})

test('PLAT-1 (Joomla): the slot module position must still be named by the template', async () => {
  const src = sourceOf(
    ESSENCE_TAG,
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Essence',
      version: '1.0.7',
      cms: '6.0.0',
      template: 'ja_essence',
      install: JOOMLA_INSTALL
    },
    {
      'w.tar.gz': tarGz({
        'templates/ja_essence/templateDetails.xml':
          '<extension><positions><position>header</position></positions></extension>',
        'templates/ja_essence/css/template.css': TOKENIZED
      })
    }
  )
  const plat = resultOf(await checkRelease(src), 'PLAT-1')
  assert.equal(plat.status, 'fail')
  assert.match(plat.message, /position "off-canvas"/)
})

test('SLOT-1: a template no contract names fails and the rules that need a contract wait for it', async () => {
  const src = sourceOf(
    'quickstart/ja-nothing/j6',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Nothing',
      version: '1.0.0',
      cms: '6.0.0',
      template: 'ja_nothing',
      install: JOOMLA_INSTALL
    },
    { 'w.tar.gz': tarGz({ 'templates/ja_nothing/css/template.css': UNTOKENIZED }) }
  )
  const s = statusOf(await checkRelease(src))
  assert.equal(s['SLOT-1'], 'fail')
  for (const id of ['SLOT-2', 'CSS-1', 'CSS-2', 'BAND-1', 'PLAT-1']) assert.equal(s[id], 'not-applicable', id)
})

test('WordPress: the theme zip names the stylesheet and version the door compares; tracy_apply_inspiration is required', async () => {
  const theme = (functions) =>
    sourceOf(
      'quickstart/ja-essence/wp7',
      {
        schemaVersion: 'tracy-setting/v1',
        platform: 'wordpress',
        label: 'JA Essence',
        version: '1.0.18',
        cms: '7.0',
        template: 'ja-essence',
        install: JOOMLA_INSTALL
      },
      {
        'wp-ja-essence-1.0.17.zip': zipOf({
          'wp-ja-essence/style.css': '/*\nTheme Name: JA Essence\nVersion: 1.0.17\n*/',
          'wp-ja-essence/functions.php': functions,
          'wp-ja-essence/assets/css/wp-ja-essence.css': 'body{color:var(--ds-c-fg, #252424)}'
        })
      }
    )
  const ok = await checkRelease(theme("<?php add_action('init', 'tracy_apply_inspiration');"))
  assert.equal(resultOf(ok, 'SLOT-2').status, 'pass')
  assert.match(resultOf(ok, 'SLOT-2').message, /wp-ja-essence 1\.0\.17/)
  assert.equal(resultOf(ok, 'PLAT-1').status, 'pass')
  const missing = await checkRelease(theme('<?php // nothing'))
  assert.equal(resultOf(missing, 'PLAT-1').status, 'fail')
})

test('EmDash: the slot reader and a layout that loads it are required; no palette rule applies', async () => {
  const emdash = (files) =>
    sourceOf(
      'tracy-business/emdash-0.x',
      {
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        label: 'Tracy Business',
        version: '1.7.16',
        cms: '1.1.0',
        template: 'tracy-business',
        install: {
          source: { file: 's.zip', sha256: 'a'.repeat(64) },
          state: { file: 'st.tar.gz', sha256: 'b'.repeat(64) }
        }
      },
      { 's.zip': zipOf(Object.fromEntries(Object.entries(files).map(([n, t]) => [`theme/${n}`, t]))) }
    )
  const ok = await checkRelease(
    emdash({
      'src/lib/ds-slot.ts': 'export const slot = 1',
      'src/layouts/Base.astro': "---\nimport { slot } from '../lib/ds-slot'\n---",
      'src/styles/global.css': ':root{--color-bg:var(--ds-bg, #f5f3ee)}'
    })
  )
  const s = statusOf(ok)
  assert.deepEqual([s['SLOT-1'], s['SLOT-2'], s['PLAT-1'], s['DEF-1']], ['pass', 'pass', 'pass', 'pass'])
  assert.deepEqual([s['CSS-1'], s['CSS-2']], ['not-applicable', 'not-applicable'])
  const without = await checkRelease(emdash({ 'src/layouts/Base.astro': '---\n---' }))
  assert.equal(resultOf(without, 'PLAT-1').status, 'fail')
})

test('the weighing: must-fix breaks a site, worth-fixing refuses politely or leaves a leftover', () => {
  const summary = summarizeDsReadiness({
    results: [
      { id: 'SLOT-1', status: 'fail', owner: 'contract', message: 'no contract', fix: null },
      { id: 'CSS-1', status: 'fail', owner: 'template', message: 'untokenized', fix: 'tokenize' },
      { id: 'DEF-1', status: 'pass', owner: 'template', message: 'ok', fix: null },
      { id: 'ROLE-1', status: 'live-only', owner: 'contract', message: 'built site', fix: null }
    ]
  })
  assert.deepEqual([summary.passed, summary.total], [1, 3])
  assert.deepEqual(
    summary.mustFix.map((m) => m.rule),
    ['CSS-1']
  )
  assert.deepEqual(
    summary.worthFixing.map((m) => m.rule),
    ['SLOT-1']
  )
})

test('a check downloads the setting, the archive with the stylesheets and, for PIC-1, the demo database and a WordPress webroot', () => {
  const joomla = {
    platform: 'joomla',
    install: { webroot: { file: 'w-1.0.7.tar.gz' }, database: { file: 'd-1.0.7.sql.gz' } }
  }
  assert.deepEqual(
    dsAssetsOf(joomla, [
      'tracy_setting.json',
      'w-1.0.6.tar.gz',
      'w-1.0.7.tar.gz',
      'd-1.0.7.sql.gz',
      'SHA256SUMS'
    ]),
    ['tracy_setting.json', 'SHA256SUMS', 'w-1.0.7.tar.gz', 'd-1.0.7.sql.gz']
  )
  const installer = { platform: 'joomla', install: { installer: { file: 'q.zip' } } }
  assert.deepEqual(dsAssetsOf(installer, ['tracy_setting.json', 'q.zip']), ['tracy_setting.json', 'q.zip'])
  const wp = {
    platform: 'wordpress',
    template: 'ja-nova',
    version: '1.1.12',
    install: { webroot: { file: 'w.tar.gz' }, database: { file: 'd.sql.gz' } }
  }
  assert.deepEqual(dsAssetsOf(wp, ['tracy_setting.json', 'w.tar.gz', 'd.sql.gz', 'wp-ja-nova-1.1.11.zip']), [
    'tracy_setting.json',
    'wp-ja-nova-1.1.11.zip',
    'w.tar.gz',
    'd.sql.gz'
  ])
  const emdash = { platform: 'emdash', install: { source: { file: 's.zip' }, state: { file: 'st.tar.gz' } } }
  assert.deepEqual(dsAssetsOf(emdash, ['tracy_setting.json', 's.zip', 'st.tar.gz']), [
    'tracy_setting.json',
    's.zip'
  ])
})

test('BAND-1 counts a kept band declared in `bands` (narrowed on the same element), never a block inside it or a fill entry', async () => {
  const { band1BandsFollow } = await import(
    '../src/lib/template-design-system-readiness/rules/band-1-bands-follow.js'
  )
  const { slotOf } = await import('../src/lib/template-design-system-readiness/readers/slot.js')
  const context = {
    release: { platform: 'joomla', version: '1.0.7', tag: ESSENCE_TAG },
    setting: { template: 'ja_essence' },
    source: null
  }
  const slot = await slotOf(context)
  const judge = (over) => {
    slot.contract = { ...slot.contract, keepScopes: ['.t4-footer', '.wtb-cta', '.t4-hero'], ...over }
    return band1BandsFollow.run(context)
  }
  const none = await judge({})
  assert.deepEqual(none.details, ['.t4-footer', '.wtb-cta', '.t4-hero'])
  const some = await judge({
    bands: {
      '.t4-footer': { ground: '#14171a', texts: ['#ffffff'] },
      '.wtb-cta:not(.wtb-cta--panel)': { ground: '#14483a', texts: ['#f5f3ee'] },
      '.t4-hero .promo': { ground: '#c2562f', texts: ['#ffffff'] },
      '.acm-call': { fill: true, ground: '#c2562f', texts: ['#ffffff'] }
    }
  })
  assert.deepEqual(some.details, ['.t4-hero'], 'the hero is only named by a block inside it')
  const kept = await judge({
    bands: { '.t4-footer': { ground: '#14171a', texts: [] }, '.wtb-cta': { ground: '#000', texts: [] } },
    keepWhole: { '.t4-hero': 'a photo with its own overlay' }
  })
  assert.equal(kept.status, 'pass')
})

/** The palette the hand-made sheets below paint with (JA Essence's own). */
const PALETTE = new Set(['#4d6bff', '#f8f8ff', '#ffffff', '#212529'])

test('CSS-2 counts only literals the template paints: not an accent variable it reads, a design page, or a Tailwind variable', async () => {
  // 13/10/2026: Tracy Business and JA Vega WordPress read "8 and 4 literals" that were
  // `color: var(--wp--preset--color--accent)` (already follows the variation); JA Kinetic counted its
  // fenced design pages; JA Morgan a `--tw-ring-offset-color: #fff`.
  assert.deepEqual(
    addedReads(
      'a{color:var(--wp--preset--color--accent)}',
      'a{color:var(--ds-c-accent-text, var(--wp--preset--color--accent))}',
      PALETTE
    ),
    { left: 0, leftByRole: {} }
  )
  assert.deepEqual(addedReads('a{color:#4d6bff}', 'a{color:var(--ds-c-accent-text, #4d6bff)}', PALETTE), {
    left: 1,
    leftByRole: { 'accent-text': 1 }
  })
  // A colour the palette does not hold, classified by contrast (JA Podcast's #FED90F), is not a leftover.
  assert.deepEqual(addedReads('a{color:#FED90F}', 'a{color:var(--ds-c-fg, #FED90F)}', PALETTE), {
    left: 0,
    leftByRole: {}
  })
  // A swap the pass takes back (a text kept literal beside a literal fill) never counts below zero.
  assert.deepEqual(addedReads('a{color:var(--ds-c-fg-2, #343a40)}', 'a{color:#343a40}', PALETTE), {
    left: 0,
    leftByRole: {}
  })
  const report = await checkRelease(
    essence('1.0.7', {
      'css/template.css': `${TOKENIZED}\n.ring{--tw-ring-offset-color:#f8f8ff}`
    })
  )
  assert.equal(resultOf(report, 'CSS-2').status, 'pass')
})

test('WordPress: the newest theme zip is the one judged and downloaded, not the one numbered like the release', async () => {
  const { newestThemeZips } = await import('../src/lib/template-design-system-readiness/newest-theme.js')
  // JA Impact quickstart 1.0.9 carries theme 1.0.9 and, after the 13/10 release, 1.0.10.
  const setting = { platform: 'wordpress', template: 'ja-impact', version: '1.0.9', install: {} }
  const names = [
    'wp-ja-impact.zip',
    'wp-ja-impact-1.0.9.zip',
    'wp-ja-impact-1.0.10.zip',
    'wp-ja-impact-1.0.2.zip'
  ]
  assert.deepEqual(newestThemeZips(setting, names), [
    'wp-ja-impact-1.0.10.zip',
    'wp-ja-impact-1.0.9.zip',
    'wp-ja-impact-1.0.2.zip',
    'wp-ja-impact.zip'
  ])
  assert.ok(dsAssetsOf(setting, ['tracy_setting.json', ...names]).includes('wp-ja-impact-1.0.10.zip'))
})

// ── Built-site rules from the measurement file (#1313, spec decision 15) ─────────────────────────────

const SWEEP = readFileSync(
  new URL(
    '../../../packages/design/tracy-ds-slot/test/fixtures/ds-sweep-2026-10-13-moxie/results.jsonl',
    import.meta.url
  ),
  'utf8'
)
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
const MEASURE_META = {
  measuredAt: '2026-10-13T12:40:11Z',
  machine: 'imac',
  measuredBy: 'tdsr pass-joomla.mjs'
}

/**
 * A measuredAt a minute after the tree's own measurement file of a line (the newest reading wins,
 * measuredAt or previewMeasuredAt, readers/measurement.js): read off the file, since every final
 * measure writes it anew.
 */
const afterTreeFile = (path) => {
  const own = JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'))
  const at = Math.max(Date.parse(own.measuredAt) || 0, Date.parse(own.previewMeasuredAt ?? '') || 0)
  return new Date(at + 60_000).toISOString()
}

// a document newer than the tree's own file of 1.0.3
const NEWER_META = {
  ...MEASURE_META,
  measuredAt: afterTreeFile(
    'packages/cms/tracy-joomla-quickstart/contracts/ja-sensei/j6/1.0.3/design-system-measurement.json'
  )
}
const NEWER_STAMP = `1.0.3, ${dubaiTime(NEWER_META.measuredAt)}, ${NEWER_META.machine}`

/** JA Sensei 1.0.3 as a release whose VERIFICATION.json carries the sweep's numbers. */
const senseiWith = async (version, docVersion = version, meta = MEASURE_META) => {
  const { fromSweepRow } = await import('../../../packages/design/tracy-ds-slot/src/measurement.mjs')
  const row = SWEEP.find((r) => r.id === 'ja-sensei' && r.cms === 'joomla')
  const doc = { ...fromSweepRow(row, meta), version: docVersion }
  return sourceOf(
    'quickstart/ja-sensei/j6',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Sensei',
      version,
      cms: '6.0.0',
      template: 'ja_sensei',
      install: JOOMLA_INSTALL
    },
    { 'VERIFICATION.json': JSON.stringify({ verified: true, designSystem: doc }) }
  )
}
const BUILT = ['ROLE-1', 'SCREEN-1', 'CON-1', 'UNDO-1', 'FONT-1', 'IDENT-1', 'MODE-1', 'MODE-2']

test('a measurement file in VERIFICATION.json scores the built-site rules: Sensei keeps 90% of its first screen', async () => {
  // newer than the tree's own file of 1.0.3 (#1317), so the release's document is the one read
  const report = await checkRelease(await senseiWith('1.0.3', '1.0.3', NEWER_META), { only: BUILT })
  const s = statusOf(report)
  assert.equal(s['SCREEN-1'], 'fail')
  assert.match(
    resultOf(report, 'SCREEN-1').message,
    new RegExp(`90% of the first screen.*${stampPattern(NEWER_STAMP).source}`)
  )
  assert.equal(s['ROLE-1'], 'fail', 'Moxie follows 80%, under the interim floor')
  assert.deepEqual([s['CON-1'], s['UNDO-1'], s['FONT-1']], ['pass', 'pass', 'pass'])
  assert.match(resultOf(report, 'UNDO-1').message, /0 differences.*Measured on 1\.0\.3/)
  // what that run did not probe is not measured, with the run's own words
  assert.equal(s['MODE-1'], 'unmeasured')
  assert.match(resultOf(report, 'MODE-1').message, /could not read it/)
  const summary = summarizeDsReadiness(atCurrentProbe(report))
  assert.equal(summary.grade, 'C')
  assert.equal(summary.measuredOn, NEWER_STAMP)
  assert.deepEqual(
    summary.unmeasured.map((u) => u.rule),
    ['IDENT-1', 'MODE-1', 'MODE-2']
  )
  assert.equal(summary.total, 8, 'not-measured rules count in the total')
  assert.equal(summary.passed, 3)
})

test('phase 2 of the Publish lock scores the same report harder: SCREEN-1 and IDENT-1 must-fix, not measured holds (#1319)', async () => {
  const report = await checkRelease(await senseiWith('1.0.3', '1.0.3', NEWER_META), { only: BUILT })
  const one = summarizeDsReadiness(atCurrentProbe(report))
  assert.equal(one.unmeasuredHolds, false, 'phase 1 is what the file says today')
  assert.ok(
    one.worthFixing.some((r) => r.rule === 'SCREEN-1'),
    'phase 1: SCREEN-1 only warns'
  )
  const two = summarizeDsReadiness(atCurrentProbe(report), phaseTwoOf())
  assert.equal(two.unmeasuredHolds, true)
  assert.ok(
    two.mustFix.some((r) => r.rule === 'SCREEN-1'),
    'phase 2: SCREEN-1 holds Publish'
  )
  assert.ok(!two.worthFixing.some((r) => r.rule === 'SCREEN-1'))
  assert.deepEqual(
    two.unmeasured.map((u) => u.rule),
    ['IDENT-1', 'MODE-1', 'MODE-2'],
    'the sweep did not probe these; in phase 2 they hold a version that is not live'
  )
  // the switch is three edits of the file, nothing else moves
  const t = phaseTwoOf(DS_SEVERITY)
  assert.deepEqual(
    [t.rules['SCREEN-1'].group, t.rules['IDENT-1'].group, t.unmeasured.group, t.rules['FONT-1'].group],
    ['must-fix', 'must-fix', 'must-fix', 'worth-fixing']
  )
  assert.equal(t.rules['SCREEN-1'].text, DS_SEVERITY.rules['SCREEN-1'].text)
})

test('a template with no light/dark switch: MODE-2 is not applicable, so phase 2 never holds it for that (#1319)', async () => {
  const report = await checkRelease(
    await senseiWith('1.0.3', '1.0.3', { ...NEWER_META, themeToggle: false }),
    {
      only: BUILT
    }
  )
  assert.equal(statusOf(report)['MODE-2'], 'not-applicable')
  assert.match(resultOf(report, 'MODE-2').message, /no light\/dark switch.*Measured on 1\.0\.3/)
  const two = summarizeDsReadiness(atCurrentProbe(report), phaseTwoOf())
  assert.deepEqual(
    two.unmeasured.map((u) => u.rule),
    ['IDENT-1', 'MODE-1']
  )
})

test('a measurement of another version does not count: the new version is not measured yet', async () => {
  const report = await checkRelease(await senseiWith('1.0.99', '1.0.3'), { only: BUILT })
  for (const id of BUILT) assert.equal(statusOf(report)[id], 'unmeasured', id)
  assert.match(
    resultOf(report, 'SCREEN-1').message,
    /not measured yet on 1\.0\.99 \(VERIFICATION\.json: measured 1\.0\.3, published 1\.0\.99\)/
  )
  // no file of this version at the current preview probe (JA Donate 1.0.6 on dev, 16/10/2026): the
  // summary says that alone, with no grade, no ratio and no must-fix built from rules nobody judged
  const summary = summarizeDsReadiness(report)
  assert.equal(summary.grade, null)
  assert.deepEqual([summary.passed, summary.total], [0, 0])
  assert.deepEqual([summary.mustFix, summary.worthFixing, summary.unmeasured], [[], [], []])
  assert.equal(summary.measuredOn, null)
  assert.deepEqual([summary.notAtProbe.current, summary.notAtProbe.measured], [CURRENT_PROBE, null])
  assert.match(
    summary.notAtProbe.measure,
    /^Measure 1\.0\.99 .*\n.*stand\.mjs up .*flow\.mjs .*--measure-version 1\.0\.99.*preview-check\.mjs .*--write.*stand\.mjs down/s
  )
})

/** JA Directory 1.0.3's tree file with every preview row at the current probe, a minute newer than the tree's. */
const directoryAtCurrentProbe = () => {
  const path =
    'packages/cms/tracy-joomla-quickstart/contracts/ja-directory/j6/1.0.3/design-system-measurement.json'
  const own = JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'))
  const at = afterTreeFile(path)
  return {
    ...own,
    measuredAt: at,
    previewMeasuredAt: at,
    preview: own.preview.map((r) => ({ ...r, probeVersion: CURRENT_PROBE }))
  }
}

test('a release measured at the current preview probe keeps its real verdict: JA Directory 1.0.3', async () => {
  const source = sourceOf(
    'quickstart/ja-directory/j6',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Directory',
      version: '1.0.3',
      cms: '6.0.0',
      template: 'ja_directory',
      install: JOOMLA_INSTALL
    },
    // the tree's file of 1.0.3 (16/10/2026, probe v9) as the release carries it once re-measured at the
    // current probe: newer than the tree's, every preview row at the current probe
    { 'VERIFICATION.json': JSON.stringify({ designSystem: directoryAtCurrentProbe() }) }
  )
  const report = await checkRelease(source, { only: ['ROLE-1', 'TPL-1', 'CON-2', 'BTN-1', 'GRAD-1'] })
  assert.ok(
    report.results.every((r) => !('previewProbe' in r)),
    `measured at v${CURRENT_PROBE}: no probe gap`
  )
  const summary = summarizeDsReadiness(report)
  assert.equal(summary.notAtProbe, undefined)
  assert.notEqual(summary.grade, null)
  assert.equal(summary.total, 5)
  assert.match(summary.measuredOn, /^1\.0\.3, /)
  // its findings are scored from that file, each stamped with that run
  const judged = [...summary.mustFix, ...summary.worthFixing, ...summary.measuredPassed]
  assert.ok(
    judged.some((r) => new RegExp(`^1\\.0\\.3, .*preview probe v${CURRENT_PROBE}$`).test(r.measuredOn ?? ''))
  )
})

// 1.7.18 (TCH #1321): the two-mode source measured 13/10 under its then number 1.7.16; 1.7.17 (TCH #1297) took that
// number with the one-look page, so the file moved with the source to contracts/1.7.18.
test('the file in the contract folder of the tree counts too: Tracy Business EmDash 1.7.18, measured 14/10 (#1309, #1317)', async () => {
  const source = sourceOf(
    'tracy-business/emdash-0.x',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'emdash',
      label: 'Tracy Business',
      version: '1.7.18',
      cms: '0.x',
      install: {
        source: { file: 's.zip', sha256: 'c'.repeat(64) },
        state: { file: 'st.tar.gz', sha256: 'd'.repeat(64) }
      }
    },
    {}
  )
  const report = await checkRelease(source, { only: ['ROLE-1', 'SCREEN-1', 'CON-1', 'UNDO-1', 'FONT-1'] })
  const s = statusOf(report)
  // re-measured 14/10 on the 1.7.18 release build (after derive.mjs dropped extraColours): wearing a dark
  // system stores the dark side in the visitor's browser (localStorage "ngi-theme"), so taking it off
  // leaves that visitor on the dark side: UNDO-1 fails, a theme fix for #1318
  assert.deepEqual(Object.values(s), ['pass', 'pass', 'pass', 'fail', 'pass'])
  assert.match(
    resultOf(report, 'CON-1').message,
    /Measured on 1\.7\.18, 2026-10-14 \d\d:\d\d Dubai time, imac/
  )
  assert.match(resultOf(report, 'UNDO-1').message, /2 control view\(s\) differ/)
})

// Dev 14/10 (after #1333): /ops showed "A, 13/13 passed" for Tracy Business EmDash 1.7.18 with no rule rows.
// The server side holds: every built-site rule is measured from contracts/1.7.18 and passes with its own stamp.
test('Tracy Business EmDash 1.7.18: every built-site rule but UNDO-1 passes, each listed with its "Measured on" stamp', async () => {
  const source = sourceOf(
    'tracy-business/emdash-0.x',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'emdash',
      label: 'Tracy Business',
      version: '1.7.18',
      cms: '0.x',
      install: {
        source: { file: 's.zip', sha256: 'c'.repeat(64) },
        state: { file: 'st.tar.gz', sha256: 'd'.repeat(64) }
      }
    },
    {}
  )
  const summary = summarizeDsReadiness(atCurrentProbe(await checkRelease(source, { only: BUILT })))
  const STAMP = '1.7.18, 2026-10-14 04:46 Dubai time, imac'
  assert.deepEqual(summary.unmeasured, [], 'not measured yet never counts as passed, and none is here')
  // every rule but UNDO-1 (see the test above) passes, each with its own stamp
  const passing = BUILT.filter((id) => id !== 'UNDO-1')
  assert.equal(summary.passed, passing.length)
  assert.equal(summary.total, BUILT.length)
  assert.deepEqual(
    summary.measuredPassed.map((m) => [m.rule, m.measuredOn]),
    passing.map((id) => [id, STAMP])
  )
  assert.equal(summary.measuredOn, STAMP)
})

// 1.7.19 (TCH #1318): the theme no longer stores the system's dark side in the visitor's browser, so the four
// controls (no system, undo; 1440, 390) are the template again. Re-measured 14/10 on the published release.
test('Tracy Business EmDash 1.7.19: every built-site rule passes, UNDO-1 included', async () => {
  const source = sourceOf(
    'tracy-business/emdash-0.x',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'emdash',
      label: 'Tracy Business',
      version: '1.7.19',
      cms: '0.x',
      install: {
        source: { file: 's.zip', sha256: 'c'.repeat(64) },
        state: { file: 'st.tar.gz', sha256: 'd'.repeat(64) }
      }
    },
    {}
  )
  const report = await checkRelease(source, { only: BUILT })
  assert.match(resultOf(report, 'UNDO-1').message, /4 controls, 0 differences/)
  const summary = summarizeDsReadiness(atCurrentProbe(report))
  assert.deepEqual(summary.unmeasured, [])
  assert.equal(summary.passed, BUILT.length)
  assert.equal(summary.measuredOn, '1.7.19, 2026-10-14 05:11 Dubai time, imac')
})

test('IDENT-1 and MODE-1 come from the run’s flags: an empty logo and a light page under a dark system fail (#1314)', async () => {
  const { fromSweepRow } = await import('../../../packages/design/tracy-ds-slot/src/measurement.mjs')
  const row = SWEEP.find((r) => r.id === 'tracy-business' && r.cms === 'wordpress')
  const doc = fromSweepRow(row, {
    ...MEASURE_META,
    // newer than the tree's own file of this version (#1317), so this one counts
    measuredAt: afterTreeFile(
      'packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.3.6/design-system-measurement.json'
    ),
    measuredBy: 'tdsr pass-wordpress.mjs',
    // Tracy Business WordPress 1.1.8: the logo slot rendered empty under every system
    ident: Object.fromEntries(row.systems.map((s) => [s, false])),
    // the page stayed light under the two dark systems
    modeMatch: {
      'od:bmw': true,
      'od:stripe': true,
      'od:spotify': false,
      'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0': false
    }
  })
  const source = sourceOf(
    'tracy-business/wp7',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'wordpress',
      label: 'Tracy Business',
      version: '1.3.6',
      cms: '7.0',
      template: 'tracy-business',
      install: {
        webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
        database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
      }
    },
    { 'VERIFICATION.json': JSON.stringify({ designSystem: doc }) }
  )
  const report = await checkRelease(source, { only: ['IDENT-1', 'MODE-1', 'MODE-2'] })
  const s = statusOf(report)
  assert.equal(s['IDENT-1'], 'fail')
  assert.match(resultOf(report, 'IDENT-1').message, /logo or brand mark is empty.*Measured on 1\.3\.6/)
  assert.equal(s['MODE-1'], 'fail')
  assert.match(resultOf(report, 'MODE-1').message, /Spotify\/1440, Spotify\/390, Moxie\/1440, Moxie\/390/)
  assert.equal(s['MODE-2'], 'unmeasured', 'the sweep did not watch the switch')
  const summary = summarizeDsReadiness(atCurrentProbe(report))
  assert.deepEqual(
    summary.worthFixing.map((w) => w.rule),
    ['IDENT-1', 'MODE-1']
  )
  assert.equal(summary.grade, 'C', 'one rule not measured')
})

test('measurement files in the tree: JA Sensei 1.0.3 and JA Social II 1.0.3 pass SCREEN-1, JA Symphony 1.0.2 passes ROLE-1, all "Measured on" (#1316, #1317)', async () => {
  const joomla = (slug, label, template, version) =>
    sourceOf(
      `quickstart/${slug}/j6`,
      {
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label,
        version,
        cms: '6.0.0',
        template,
        install: JOOMLA_INSTALL
      },
      {}
    )
  const sensei = await checkRelease(joomla('ja-sensei', 'JA Sensei', 'ja_sensei', '1.0.3'), { only: BUILT })
  // 90% on the #1317 run (13/10/2026): its gradient hero, kept as the template paints it, is keepWhole
  // since 14/10 and left out of the first screen's numerator and denominator (spec decision 4)
  assert.equal(statusOf(sensei)['SCREEN-1'], 'pass')
  assert.match(resultOf(sensei, 'SCREEN-1').message, stampPattern(treeStamp('ja-sensei', '1.0.3')))
  // 4% on the final measure of #1298 (15/10/2026, the fifteen featured systems)
  assert.match(resultOf(sensei, 'SCREEN-1').message, /at most 4% of the first screen/)
  // null on every view until 14/10: its fixed backdrop photo masked the white sections drawn over it
  const social = await checkRelease(joomla('ja-social-ii', 'JA Social II', 'ja_social_ii', '1.0.3'), {
    only: BUILT
  })
  assert.equal(statusOf(social)['SCREEN-1'], 'pass')
  const symphony = await checkRelease(joomla('ja-symphony', 'JA Symphony', 'ja_symphony', '1.0.2'), {
    only: BUILT
  })
  // the #1317 contract cleared the 8 texts of the sweep; its round 4 (14/10/2026) made the primary
  // button's fill (!important in the template) follow, so the role matches on every view now
  assert.equal(statusOf(symphony)['CON-1'], 'pass')
  assert.equal(statusOf(symphony)['ROLE-1'], 'pass')
  assert.match(resultOf(symphony, 'ROLE-1').message, stampPattern(treeStamp('ja-symphony', '1.0.2')))
  // a version nobody measured stays not measured, even with the file of the version before in the tree
  const next = await checkRelease(joomla('ja-sensei', 'JA Sensei', 'ja_sensei', '1.0.99'), {
    only: ['SCREEN-1']
  })
  assert.equal(statusOf(next)['SCREEN-1'], 'unmeasured')
  assert.match(resultOf(next, 'SCREEN-1').message, /not measured yet on 1\.0\.99/)
})

test('measurement files in the tree: eight Joomla rows pass every built-site rule but two single-take font misses, JA Vital passes BAND-1', async () => {
  // graded C on /ops only because IDENT-1, MODE-1 and MODE-2 were not measured yet (files of 13/10),
  // or nothing was (JA Voyara 1.0.8, a new release); re-measured with the flow of develop 7ffabc5793
  const rows = [
    ['ja-voyara', 'JA Voyara', 'ja_voyara', '1.0.8'],
    ['ja-vital', 'JA Vital', 'ja_vital', '1.0.4'],
    ['ja-kinetic', 'JA Kinetic', 'ja_kinetic', '1.0.6'],
    ['ja-trip', 'JA Trip', 'ja_trip', '1.0.5'],
    ['ja-tour', 'JA Tour', 'ja_tour', '1.0.2'],
    ['ja-podcast', 'JA Podcast', 'ja_podcast', '1.0.4'],
    ['ja-phio', 'JA Phio', 'ja_phio', '1.0.5'],
    ['ja-morgan', 'JA Morgan', 'ja_morgan', '1.0.5']
  ]
  // re-measured by the final measure of #1298 (15/10/2026, the fifteen featured systems): one take of each of
  // two had not loaded the system's face (the other width of the same system had), and FONT-1 names that take
  const FONT_MISS = {
    'ja-voyara': 'refero:194faa2f-2f69-4bbf-9e29-290f28fa8ca2/1440',
    'ja-podcast': 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671/1440'
  }
  for (const [slug, label, template, version] of rows) {
    const source = sourceOf(
      `quickstart/${slug}/j6`,
      {
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label,
        version,
        cms: '6.0.0',
        template,
        install: JOOMLA_INSTALL
      },
      {}
    )
    const report = await checkRelease(source, { only: [...BUILT, 'BAND-1'] })
    const s = statusOf(report)
    for (const id of BUILT.filter((r) => r !== 'MODE-2')) {
      if (id === 'FONT-1' && FONT_MISS[slug]) {
        assert.equal(s[id], 'fail', `${label} ${id}`)
        assert.match(
          resultOf(report, id).message,
          new RegExp(`no system font loaded on ${FONT_MISS[slug]}\\.`)
        )
        continue
      }
      assert.equal(s[id], 'pass', `${label} ${id}`)
      assert.match(resultOf(report, id).message, stampPattern(treeStamp(slug, version)))
    }
    // none of the eight has a light/dark switch but JA Podcast, whose moon toggle its contract names since
    // 15/10/2026 (#1298): a one-mode contract hides it under a system, and MODE-2 says so
    if (slug === 'ja-podcast') {
      assert.equal(s['MODE-2'], 'fail', `${label} MODE-2`)
      assert.match(resultOf(report, 'MODE-2').message, /the theme toggle disappears/)
    } else assert.equal(s['MODE-2'], 'not-applicable', `${label} MODE-2`)
    // JA Vital's white call-to-action button (.btn-white) is a kept scope named in keepWhole since 14/10
    assert.equal(s['BAND-1'], 'pass', `${label} BAND-1`)
  }
})

// Dev 14/10 (after #1321): JA Nova j6 1.0.6 showed "Measured on" only inside the prompt, never on a rule
// row. Every measured rule carries its own stamp so /ops can put the sub line under that row, and the
// rules that passed on the run are listed too (pass, fail and Not measured yet are the three states).
test('JA Nova 1.0.6: every measured rule carries its own "Measured on" stamp, passed ones included', async () => {
  const nova = sourceOf(
    'quickstart/ja-nova/j6',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Nova',
      version: '1.0.6',
      cms: '6.0.0',
      template: 'ja_nova',
      install: JOOMLA_INSTALL
    },
    {}
  )
  const summary = summarizeDsReadiness(atCurrentProbe(await checkRelease(nova, { only: BUILT })))
  const STAMP = treeStamp('ja-nova', '1.0.6')
  // the final measure of #1298 (15/10/2026, the fifteen featured systems): under Moxie 65% of the page follows
  // (the floor is 85%) and one take missed the system's face; every rule, failed or passed, carries its stamp
  assert.deepEqual(
    summary.mustFix.map((m) => [m.rule, m.measuredOn]),
    [['ROLE-1', STAMP]]
  )
  assert.deepEqual(
    summary.worthFixing.map((m) => [m.rule, m.measuredOn]),
    [['FONT-1', STAMP]]
  )
  assert.deepEqual(
    summary.measuredPassed.map((m) => [m.rule, m.measuredOn]),
    [
      ['SCREEN-1', STAMP],
      ['CON-1', STAMP],
      ['UNDO-1', STAMP],
      ['IDENT-1', STAMP],
      ['MODE-1', STAMP]
    ]
  )
  for (const m of summary.measuredPassed) {
    assert.doesNotMatch(m.text, /Measured on/, `${m.rule}: the stamp is the sub line, not the text`)
    assert.equal(m.question, 'Built site')
  }
  // MODE-2 is not applicable (the template has no switch): neither measured nor waiting
  assert.deepEqual(
    summary.unmeasured.map((u) => [u.rule, u.measuredOn ?? null]),
    []
  )
})

// Dev 14/10 (after #1352): /ops showed Tracy Base EmDash 0.5.4 "C 5/13, Not measured yet on 0.5.4" while the file was in
// packages/cms/tracy-emdash-theme-base/contracts/0.5.4: the tracy-web image copied only Tracy Business's EmDash
// contracts, so the reader found nothing on the server. Each theme's file of the tree is read, and each is in the image.
for (const [tag, version, label] of [
  ['tracy-base/emdash-0.x', '0.5.4', 'Tracy Base'],
  ['tracy-saas/emdash-0.x', '1.4.14', 'Tracy SaaS']
]) {
  test(`${label} EmDash ${version}: the file in its theme's contract folder measures every built-site rule`, async () => {
    const source = sourceOf(
      tag,
      {
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        label,
        version,
        cms: '0.x',
        install: {
          source: { file: 's.zip', sha256: 'c'.repeat(64) },
          state: { file: 'st.tar.gz', sha256: 'd'.repeat(64) }
        }
      },
      {}
    )
    const summary = summarizeDsReadiness(atCurrentProbe(await checkRelease(source, { only: BUILT })))
    assert.deepEqual(summary.unmeasured, [])
    assert.equal(summary.passed, BUILT.length)
    assert.match(String(summary.measuredOn), new RegExp(`^${version.replace(/\./g, '\\.')}, 2026-10-14`))
  })
}

test("the image copies every EmDash theme's contract folder where the measurement reader looks for it", () => {
  const cms = new URL('../../../packages/cms/', import.meta.url)
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
  const themes = readdirSync(cms).filter((d) => {
    if (!d.startsWith('tracy-emdash-theme-')) return false
    try {
      return readdirSync(new URL(`${d}/contracts/`, cms)).length > 0
    } catch {
      return false
    }
  })
  assert.ok(themes.length >= 3, `found ${themes.join(', ')}`)
  for (const theme of themes) {
    const slug = `tracy-${theme.slice('tracy-emdash-theme-'.length)}`
    assert.ok(
      dockerfile.includes(`COPY packages/cms/${theme}/contracts ./src/contracts/${slug}/emdash-0.x`),
      `${theme}'s contracts are copied to src/contracts/${slug}/emdash-0.x`
    )
  }
})

// ── PR 2 of 14/10/2026: every template error a preview shows, and what the customer's panel gets ──

test('the preview switch: a preview rule not measured is must-fix and held; other built-site rules stay "Not measured yet"', () => {
  const report = {
    results: [
      { id: 'SLOT-1', status: 'pass', owner: 'contract', message: 'ok' },
      { id: 'TPL-1', status: 'unmeasured', owner: 'contract', message: 'TPL-1 not measured', fix: 'measure' },
      { id: 'BTN-1', status: 'unmeasured', owner: 'contract', message: 'BTN-1 not measured', fix: 'measure' },
      {
        id: 'ROLE-1',
        status: 'unmeasured',
        owner: 'contract',
        message: 'ROLE-1 not measured',
        fix: 'measure'
      }
    ]
  }
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(DS_SEVERITY.unmeasuredPreview?.group, 'must-fix', 'switched on in rule-severity.json')
  const summary = summarizeDsReadiness(report)
  // BTN-1 fails only as worth-fixing, but a preview not measured is held whatever the rule's group
  assert.deepEqual(
    summary.mustFix.map((m) => [m.rule, m.unmeasured, m.text]),
    [
      ['TPL-1', true, DS_SEVERITY.unmeasuredPreview.text],
      ['BTN-1', true, DS_SEVERITY.unmeasuredPreview.text]
    ]
  )
  assert.deepEqual(
    summary.unmeasured.map((m) => m.rule),
    ['ROLE-1']
  )
  assert.deepEqual([summary.passed, summary.total, summary.grade], [1, 4, 'C'])
  // phase two keeps the preview switch
  assert.equal(phaseTwoOf().unmeasuredPreview?.group, 'must-fix')
  // switched off: the preview rules weigh like every other unmeasured rule again
  const off = summarizeDsReadiness(report, { ...DS_SEVERITY, unmeasuredPreview: null })
  assert.deepEqual(off.mustFix, [])
  assert.deepEqual(
    off.unmeasured.map((m) => m.rule),
    ['TPL-1', 'BTN-1', 'ROLE-1']
  )
})

test('a failing preview rule carries each detector finding: what, on which system/scheme, where, fix', () => {
  const kinds = [
    {
      kind: 'glare-band',
      what: 'a glare band stays',
      fix: 'point the band at the ground',
      measured: true,
      count: 3,
      on: ['Moxie/dark 2', 'Ink/light 1'],
      // the pages it fired on (preview probe 4: every declared page is measured)
      pages: ['/pricing 2', '/ 1'],
      // the elements shared by several pages, told once (15/10/2026)
      sitewide: [
        { at: 'footer.t4-footer', pages: 27, of: 27, on: ['Moxie/dark'] },
        { at: 'header .btn', pages: 9, of: 27, on: ['Ink/light'] }
      ],
      where: ['section.hero']
    },
    { kind: 'kept-text', what: 'brand text stays', fix: 'x', measured: true, count: 0, on: [], where: [] }
  ]
  const summary = summarizeDsReadiness({
    results: [
      {
        id: 'TPL-1',
        status: 'fail',
        owner: 'contract',
        message: 'TPL-1: blocks. Measured on 1.0.3, 2026-10-14, imac.',
        fix: 'f',
        kinds
      }
    ]
  })
  assert.deepEqual(summary.mustFix[0].findings, [
    {
      kind: 'glare-band',
      what: 'a glare band stays',
      on: ['Moxie/dark 2', 'Ink/light 1'],
      pages: ['/pricing 2', '/ 1'],
      sitewide: ['footer.t4-footer on every page', 'header .btn on 9 of 27 pages'],
      where: ['section.hero'],
      fix: 'point the band at the ground'
    }
  ])
  assert.equal(summary.mustFix[0].measuredOn, '1.0.3, 2026-10-14, imac')
})

test('DEMO-1 is judged from the preview door predicate, only for a template with a slot', async () => {
  const { previewDemoGap } = await import('../src/lib/preview-demo.js')
  assert.equal(previewDemoGap(null), 'NO_DEMO')
  assert.equal(previewDemoGap({ address: '', platform: 'emdash' }), 'NO_DEMO')
  assert.equal(previewDemoGap({ address: 'ftp://d/', platform: 'emdash' }), 'NO_DEMO')
  assert.equal(previewDemoGap({ address: 'https://d/', platform: null }), 'NO_SLOT')
  assert.equal(
    previewDemoGap({ url: 'https://d/', platform: 'emdash' }),
    null,
    'the road entry spells it url'
  )
  const slot = { results: [{ id: 'SLOT-1', status: 'pass', owner: 'contract', message: 'ok' }] }
  const none = summarizeDsReadiness(slot, DS_SEVERITY, { previewGap: 'NO_DEMO' })
  assert.deepEqual(
    none.mustFix.map((m) => [m.rule, m.question, m.owner]),
    [['DEMO-1', 'Preview', 'ops']]
  )
  assert.match(none.mustFix[0].message, /DS_PREVIEW_UNAVAILABLE \(NO_DEMO\)/)
  assert.deepEqual([none.passed, none.total, none.grade], [1, 2, 'C'])
  const live = summarizeDsReadiness(slot, DS_SEVERITY, { previewGap: null })
  assert.deepEqual([live.passed, live.total, live.grade, live.mustFix.length], [2, 2, 'A', 0])
  // not asked (a caller without the world, or a template the button refuses): no DEMO-1
  assert.equal(summarizeDsReadiness(slot).total, 1)
  const refused = { results: [{ id: 'SLOT-1', status: 'fail', owner: 'contract', message: 'no' }] }
  assert.equal(
    summarizeDsReadiness(refused, DS_SEVERITY, { previewGap: 'NO_DEMO' }).mustFix.some(
      (m) => m.rule === 'DEMO-1'
    ),
    false
  )
})

// Akemi, 14/10/2026: a reader of /ops sees WHEN the run measured (Dubai time, not only the date) and,
// on a preview rule, which preview probe measured it; rows of an older probe never pass.
test('the stamp carries the Dubai time, and a preview rule names its probe; an older probe needs re-measuring', async () => {
  const { dubaiTime } = await import('../src/lib/template-design-system-readiness/rules/built-site.js')
  assert.equal(dubaiTime('2026-10-14T17:57:00Z'), '2026-10-14 21:57 Dubai time')
  assert.equal(dubaiTime('2026-10-14T23:59:00Z'), '2026-10-15 03:59 Dubai time', 'the date is Dubai’s too')
  assert.equal(dubaiTime('not a date'), 'not a date')
  const { fromSweepRow, PREVIEW_KINDS } = await import(
    '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
  )
  const { PREVIEW_PROBE_VERSION } = await import(
    '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
  )
  const sweep = SWEEP.find((r) => r.id === 'tracy-business' && r.cms === 'wordpress')
  const previewRow = (probe) => ({
    system: 'od:bmw',
    scheme: 'light',
    ...(probe === undefined ? {} : { probeVersion: probe }),
    kept: 0,
    keptShare: 0,
    glare: 0,
    keptText: 0,
    lowText: 0,
    lostButtons: 0,
    failedFonts: 0,
    empty: 0,
    docs: 1,
    detectors: Object.fromEntries(Object.keys(PREVIEW_KINDS).map((k) => [k, { count: 0, where: [] }]))
  })
  const reportOf = async (probe) => {
    const doc = {
      // newer than the file in the tree (the newer measuredAt wins), so this release block is read
      ...fromSweepRow(sweep, { ...MEASURE_META, measuredAt: '2026-10-20T23:59:00Z' }),
      preview: [previewRow(probe)],
      previewMeasuredAt: '2026-10-14T17:57:00Z'
    }
    const source = sourceOf(
      'tracy-business/wp7',
      {
        schemaVersion: 'tracy-setting/v1',
        platform: 'wordpress',
        label: 'Tracy Business',
        version: '1.3.6',
        cms: '7.0',
        template: 'tracy-business',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        }
      },
      { 'VERIFICATION.json': JSON.stringify({ designSystem: doc }) }
    )
    return checkRelease(source, { only: ['ROLE-1', 'BTN-1'] })
  }
  const current = await reportOf(PREVIEW_PROBE_VERSION)
  assert.equal(resultOf(current, 'BTN-1').status, 'pass')
  assert.match(
    resultOf(current, 'BTN-1').message,
    new RegExp(
      `Measured on 1\\.3\\.6, 2026-10-14 21:57 Dubai time, imac, preview probe v${PREVIEW_PROBE_VERSION}\\.`
    )
  )
  // a built-site rule is stamped with the built-site run and no probe
  assert.match(
    resultOf(current, 'ROLE-1').message,
    /Measured on 1\.3\.6, 2026-10-21 03:59 Dubai time, imac\./
  )
  // a file made before probeVersion existed (every row of 14/10 before this change)
  {
    const old = undefined
    const report = await reportOf(old)
    const r = resultOf(report, 'BTN-1')
    assert.equal(r.status, 'unmeasured', `probe ${old}: never a pass`)
    // /ops says it is not measured at the current probe, and the fix runs the preview again, filled in
    assert.match(
      r.message,
      new RegExp(`not measured with the current preview probe v${PREVIEW_PROBE_VERSION}\\.`)
    )
    assert.match(
      r.message,
      new RegExp(
        `Measured on 1\\.3\\.6, 2026-10-14 21:57 Dubai time, imac, older preview probe \\(rows without a probe version; the current probe is v${PREVIEW_PROBE_VERSION}\\)\\.`
      )
    )
    assert.match(r.fix, /stand\.mjs up tracy-business\/wp7 --version 1\.3\.6 /)
    assert.match(r.fix, /preview-check\.mjs .*--only tracy-business\/wp7 .*--scheme \$sc --pages all --write/)
    assert.doesNotMatch(r.fix, /flow\.mjs/, 'only the preview is older: the built-site run stays')
    const summary = summarizeDsReadiness(report)
    assert.equal(
      summary.measuredPassed.some((m) => m.rule === 'BTN-1'),
      false,
      'an older probe is not listed under Passed'
    )
  }
})

test('a preview re-measured in the tree wins over the release VERIFICATION.json of the same built-site run (Tracy Base WP 1.1.6, 16/10/2026)', async () => {
  // the release carries the built-site run with the preview rows of an older probe; the tree's file of
  // the same version is that run (same measuredAt) with the preview measured again by the current probe
  const tree = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.1.6/design-system-measurement.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  const shipped = {
    ...tree,
    preview: tree.preview.map((r) => ({ ...r, probeVersion: 1 })),
    previewMeasuredAt: tree.measuredAt
  }
  const source = sourceOf(
    'tracy-base/wp7',
    {
      schemaVersion: 'tracy-setting/v1',
      platform: 'wordpress',
      label: 'Tracy Base',
      version: '1.1.6',
      cms: '7.0',
      template: 'tracy-base',
      install: {
        webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
        database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
      }
    },
    { 'VERIFICATION.json': JSON.stringify({ designSystem: shipped }) }
  )
  const report = await checkRelease(source, { only: ['TPL-1', 'CON-2'] })
  const treeProbe = Math.min(...tree.preview.map((r) => r.probeVersion ?? 0))
  for (const id of ['TPL-1', 'CON-2']) {
    const r = resultOf(report, id)
    if (treeProbe >= CURRENT_PROBE) assert.equal(r.status, 'pass', r.message)
    // the tree's file is of an older probe than the current one: the stamp still is the tree's (its probe),
    // never the release's rows of probe 1
    else
      assert.match(
        r.message,
        new RegExp(`older preview probe \\(v${treeProbe}; the current probe is v${CURRENT_PROBE}\\)`)
      )
  }
})
