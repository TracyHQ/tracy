/**
 * MODE-3 of the Template Design System Readiness check: a template that supports both a light and a
 * dark scheme (its contract carries a dark palette, its measurement found a light/dark switch or ran a
 * second mode, or its own stylesheets paint a dark scheme) must get the Light | Dark choice in the Add
 * site design-system popup, which the popup shows only when the slot contract says `modes: true`
 * (`lib/ds-slot.js` `modesOf`, header `x-tracy-ds-modes: both`). Judged against the contracts and the
 * measurement files this tree carries.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

import { checkRelease, RULES } from '../src/lib/template-design-system-readiness/index.js'
import { darkPaletteWhy } from '../src/lib/template-design-system-readiness/rules/mode-3-popup-offers-both.js'
import { summarizeDsReadiness } from '../src/lib/template-design-system-readiness/severity.js'

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

/** A Joomla release of `template` (element name) at `version`, with optional webroot files; `slug` a JA slug or a whole tag. */
const joomla = (slug, template, label, version, webroot) => {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label,
    version,
    cms: '6.0.0',
    template,
    install: {
      webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
      database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
    }
  }
  const all = {
    'tracy_setting.json': Buffer.from(JSON.stringify(setting)),
    ...(webroot ? { 'w.tar.gz': tarGz(webroot) } : {})
  }
  return {
    tag: slug.includes('/') ? slug : `quickstart/${slug}/j6`,
    where: `memory:${slug}`,
    names: async () => Object.keys(all).sort(),
    read: async (name) => (name in all ? all[name] : null)
  }
}

const mode3 = async (source) =>
  (await checkRelease(source, { only: ['MODE-3'] })).results.find((r) => r.id === 'MODE-3')

test('MODE-3 is registered for every CMS, owned by the contract, and must-fix', async () => {
  const rule = RULES.find((r) => r.id === 'MODE-3')
  assert.ok(rule, 'MODE-3 is in RULES')
  assert.deepEqual(rule.platforms, ['joomla', 'wordpress', 'emdash'])
  assert.equal(rule.owner, 'contract')
  // a failing MODE-3 lands in the step's must-fix group and holds the grade at C
  const failing = await mode3(joomla('ja-titan', 'ja_titan', 'JA Titan', '1.0.1'))
  assert.equal(failing.status, 'fail')
  const summary = summarizeDsReadiness({ results: [failing] })
  assert.deepEqual(
    summary.mustFix.map((m) => m.rule),
    ['MODE-3']
  )
  assert.deepEqual(summary.worthFixing, [])
  assert.equal(summary.grade, 'C')
})

test('a template whose measurement found a light/dark switch fails while its contract offers one look', async () => {
  // JA Titan 1.0.1: the tree's measurement says themeToggle true, the contract has no `modes`
  const r = await mode3(joomla('ja-titan', 'ja_titan', 'JA Titan', '1.0.1'))
  assert.equal(r.status, 'fail')
  assert.match(r.message, /JA Titan Joomla 1\.0\.1/)
  assert.match(r.message, /light\/dark switch/)
  assert.match(r.message, /Light \| Dark/)
  assert.match(r.fix, /modes: true/)
  assert.match(r.fix, /joomla-ja-titan/)
})

test('a contract that carries a dark palette is a reason for both schemes; one without is not', () => {
  // Since batch 2 (17/10/2026) every contract this tree carries with darkTokens also says `modes: true`
  // (JA Voyara 1.0.8 was the last one-look case), so the reason is judged on a contract of its own.
  assert.equal(
    darkPaletteWhy({ name: 'joomla-ja-x', contract: { darkTokens: { bg: '#111111' } } }),
    'its contract joomla-ja-x carries a dark palette (darkTokens)'
  )
  assert.equal(darkPaletteWhy({ name: 'joomla-ja-x', contract: { darkTokens: {} } }), null)
  assert.equal(darkPaletteWhy({ name: 'joomla-ja-x', contract: null }), null)
})

test('a template whose contract carries a dark palette and wears both sides passes', async () => {
  // JA Voyara 1.0.8: darkTokens in its contract and `modes: true` (batch 2)
  const r = await mode3(joomla('ja-voyara', 'ja_voyara', 'JA Voyara', '1.0.8'))
  assert.equal(r.status, 'pass', r.message)
  assert.match(r.message, /Light \| Dark for JA Voyara Joomla 1\.0\.8/)
})

test('a template whose own stylesheets paint a dark scheme fails while the popup offers one look', async () => {
  // JA Teline V 1.0.1: its measurement says no switch, but its css/darkmode.css paints html[data-theme=dark]
  const r = await mode3(
    joomla('ja-teline-v', 'ja_teline_v', 'JA Teline V', '1.0.1', {
      'templates/ja_teline_v/css/template.css': 'body{color:#222}',
      'templates/ja_teline_v/css/darkmode.css': 'html[data-theme=dark] body{background:#111}'
    })
  )
  assert.equal(r.status, 'fail')
  assert.match(r.message, /css\/darkmode\.css/)
})

test('a two-mode template whose contract says modes: true passes', async () => {
  // Tracy Business Joomla 1.2.3: switch measured, contract `modes: true`
  const r = await mode3(joomla('tracy-business/j6', 'tracy_business', 'Tracy Business', '1.2.3'))
  assert.equal(r.status, 'pass')
  assert.match(r.message, /offers Light \| Dark/)
})

test('a one-look template is not applicable', async () => {
  // JA Alpha 1.0.1: no switch measured, no dark palette, no stylesheet read
  const r = await mode3(joomla('ja-alpha', 'ja_alpha', 'JA Alpha', '1.0.1'))
  assert.equal(r.status, 'not-applicable')
  assert.match(r.message, /one look/)
})

test('a dark stylesheet the release leaves dormant does not count (JA Resort ships light only)', async () => {
  // JA Resort 2.3.2+: css/darkmode.css ships, but its site profile sets the switch off and the scheme
  // light, so index.php never loads the file and no visitor can see a dark page (dot 3, 19/10/2026).
  const files = (profiles) => ({
    'templates/ja_teline_v/css/template.css': 'body{color:#222}',
    'templates/ja_teline_v/css/darkmode.css': 'html[data-theme="dark"] body{background:#111}',
    ...profiles
  })
  const off = JSON.stringify({ other_darkmode: '0', other_default_theme: 'light' })
  const dormant = await mode3(
    joomla(
      'ja-teline-v',
      'ja_teline_v',
      'JA Teline V',
      '1.0.1',
      files({ 'templates/ja_teline_v/etc/site/default.json': off })
    )
  )
  assert.equal(dormant.status, 'not-applicable', dormant.message)
  // the JA default (keys left out: switch on, scheme auto) still counts
  const unset = await mode3(
    joomla(
      'ja-teline-v',
      'ja_teline_v',
      'JA Teline V',
      '1.0.1',
      files({ 'templates/ja_teline_v/etc/site/default.json': '{}' })
    )
  )
  assert.equal(unset.status, 'fail')
  // one profile that can be dark is enough to count
  const mixed = await mode3(
    joomla(
      'ja-teline-v',
      'ja_teline_v',
      'JA Teline V',
      '1.0.1',
      files({
        'templates/ja_teline_v/etc/site/default.json': off,
        'templates/ja_teline_v/etc/site/agency.json': JSON.stringify({
          other_darkmode: '0',
          other_default_theme: 'auto'
        })
      })
    )
  )
  assert.equal(mixed.status, 'fail')
  // switch on with a light default: visitors can still press dark
  const switchOn = await mode3(
    joomla(
      'ja-teline-v',
      'ja_teline_v',
      'JA Teline V',
      '1.0.1',
      files({
        'templates/ja_teline_v/etc/site/default.json': JSON.stringify({
          other_darkmode: '1',
          other_default_theme: 'light'
        })
      })
    )
  )
  assert.equal(switchOn.status, 'fail')
})
