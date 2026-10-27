/**
 * VARS-1 of the Template Design System Readiness check: a release declares every standard role
 * variable (`@tracy/ds-slot` `role-variables.mjs`) and hardcodes no role, as the packaging scanner's
 * report (`design-system-roles.json`) says; no report for this version is "Not scanned yet", must-fix.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkRelease, RULES } from '../src/lib/template-design-system-readiness/index.js'
import { ROLE_SCAN_FILE } from '../src/lib/template-design-system-readiness/readers/role-scan.js'
import { summarizeDsReadiness } from '../src/lib/template-design-system-readiness/severity.js'
import {
  REQUIRED_ROLE_VARIABLES,
  ROLE_SCAN_REPORT_SCHEMA
} from '../../../packages/design/tracy-ds-slot/src/role-variables.mjs'

const SETTING = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.7.20',
  cms: '1.1.0',
  template: 'tracy-business',
  install: {
    source: { file: 'q.zip', sha256: 'a'.repeat(64) },
    state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
  }
}

/** A release source over `assets` (name -> text), the shape `checkRelease` reads. */
const sourceOf = (assets) => {
  const all = { 'tracy_setting.json': JSON.stringify(SETTING), ...assets }
  return {
    tag: 'tracy-business/emdash-0.x',
    where: 'memory:tracy-business',
    names: async () => Object.keys(all).sort(),
    read: async (name) => (name in all ? Buffer.from(all[name]) : null)
  }
}

const scan = (over = {}) => ({
  schema: ROLE_SCAN_REPORT_SCHEMA,
  template: 'tracy-business',
  platform: 'emdash',
  version: '1.7.20',
  scannedAt: '2026-10-15T10:00:00.000Z',
  scanner: 'tracy-dev package 1.0.0',
  declared: [...REQUIRED_ROLE_VARIABLES],
  hardcoded: [],
  ...over
})

const vars1 = async (assets) =>
  (await checkRelease(sourceOf(assets), { only: ['VARS-1'] })).results.find((r) => r.id === 'VARS-1')

test('VARS-1 is registered for every CMS and owned by the template (its must-fix group: the next case)', () => {
  const rule = RULES.find((r) => r.id === 'VARS-1')
  assert.ok(rule, 'VARS-1 is in RULES')
  assert.deepEqual(rule.platforms, ['joomla', 'wordpress', 'emdash'])
  assert.equal(rule.owner, 'template')
})

test('no role scan, or one of another version, is "Not scanned yet" and holds Publish', async () => {
  const none = await vars1({})
  assert.equal(none.status, 'fail')
  assert.match(none.message, /^Not scanned yet: the release carries no design-system-roles\.json/)
  assert.match(none.fix, /version 1\.7\.20/)

  const old = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ version: '1.7.19' })) })
  assert.equal(old.status, 'fail')
  assert.match(
    old.message,
    /^Not scanned yet: design-system-roles\.json: made for version 1\.7\.19, not 1\.7\.20/
  )

  const broken = await vars1({ [ROLE_SCAN_FILE]: '{' })
  assert.match(broken.message, /^Not scanned yet: design-system-roles\.json is not JSON/)

  const wrongSchema = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ schema: 'x/v1' })) })
  assert.match(wrongSchema.message, /schema is "x\/v1", not tdsr-role-scan\/v1/)

  const summary = summarizeDsReadiness({ results: [none] })
  assert.deepEqual(
    summary.mustFix.map((m) => m.rule),
    ['VARS-1']
  )
  assert.equal(summary.grade, 'C')
})

test('a scan declaring every required role with no hardcoded role passes', async () => {
  const handledFlag = {
    file: 'src/components/LanguageMenu.tsx',
    line: 87,
    component: 'language flag',
    property: 'fill',
    value: '#c8102e',
    role: null,
    handled: true,
    reason: 'flag colours are part of a picture'
  }
  const r = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ hardcoded: [handledFlag] })) })
  assert.equal(r.status, 'pass', r.message)
  assert.match(r.message, /Scanned 2026-10-15 by tracy-dev package 1\.0\.0\./)
})

test('missing required roles and unhandled literals fail, naming file, line and component', async () => {
  const declared = REQUIRED_ROLE_VARIABLES.filter((n) => n !== '--ds-c-heading' && n !== '--ds-pill-radius')
  const hardcoded = [
    {
      file: 'src/styles/global.css',
      line: 163,
      component: 'button',
      property: 'color',
      value: '#fff',
      role: '--ds-c-accent-on',
      handled: false
    },
    // handled without a reason is not handled
    { file: 'src/components/Topbar.astro', line: 111, component: 'theme toggle', handled: true }
  ]
  const r = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ declared, hardcoded })) })
  assert.equal(r.status, 'fail')
  assert.match(r.message, /2 required role variable\(s\) not declared: --ds-c-heading, --ds-pill-radius/)
  assert.match(r.message, /2 hardcoded value\(s\) left: src\/styles\/global\.css:163 \(button, color #fff\)/)
  assert.match(r.message, /src\/components\/Topbar\.astro:111 \(theme toggle\)/)
  assert.match(r.fix, /var\(--ds-c-heading, <the template's value>\)/)
  assert.match(r.fix, /var\(--ds-c-accent-on, <the literal>\)/)
  assert.deepEqual(r.details, [
    'missing: --ds-c-heading',
    'missing: --ds-pill-radius',
    'hardcoded: src/styles/global.css:163 (button, color #fff) -> --ds-c-accent-on',
    'hardcoded: src/components/Topbar.astro:111 (theme toggle)'
  ])
  const summary = summarizeDsReadiness({ results: [r] })
  assert.deepEqual(
    summary.mustFix.map((m) => [m.rule, m.question]),
    [['VARS-1', 'Role variables']]
  )
})

test('a long list is cut with how many more, and a spot without file/line does not count as a scan', async () => {
  const hardcoded = Array.from({ length: 11 }, (_, i) => ({
    file: 'src/a.css',
    line: i + 1,
    component: 'card',
    handled: false
  }))
  const r = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ hardcoded })) })
  assert.match(r.message, /11 hardcoded value\(s\) left: .*src\/a\.css:8 \(card\), and 3 more\./)
  assert.equal(r.details.length, 11)

  const bad = await vars1({
    [ROLE_SCAN_FILE]: JSON.stringify(scan({ hardcoded: [{ file: 'a.css', component: 'x', handled: false }] }))
  })
  assert.match(
    bad.message,
    /^Not scanned yet: .*hardcoded\[0\] needs file, line \(from 1\), component and handled/
  )
})

test('a component the scanner found reading no corner role (class missing) blocks, named by the property it never sets', async () => {
  const hardcoded = [
    {
      file: 'src/styles/global.css',
      line: 221,
      component: '.chip',
      property: 'border-radius',
      role: '--ds-pill-radius',
      handled: false,
      class: 'missing',
      why: '.chip draws a box but sets no corner: it never reads --ds-pill-radius'
    }
  ]
  const r = await vars1({
    [ROLE_SCAN_FILE]: JSON.stringify(scan({ hardcoded, totals: { auto: 0, flag: 0, keep: 0, missing: 1 } }))
  })
  assert.equal(r.status, 'fail')
  assert.match(
    r.message,
    /1 hardcoded value\(s\) left: src\/styles\/global\.css:221 \(\.chip, border-radius not set\)/
  )
  assert.deepEqual(r.details, [
    'hardcoded: src/styles/global.css:221 (.chip, border-radius not set) -> --ds-pill-radius'
  ])
  assert.match(r.fix, /component that sets no corner/)
})

test('a compiled twin (CSS built from a scanned Sass/LESS source) is not counted twice; its source still counts', async () => {
  const source = {
    file: 'less/template.less',
    line: 12,
    component: '.btn',
    property: 'color',
    value: '#0a66c2',
    role: '--ds-c-accent',
    handled: false,
    class: 'auto'
  }
  const twin = { ...source, file: 'css/template.css', line: 340, twin: 'less/template.less' }
  const r = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ hardcoded: [source, twin] })) })
  assert.equal(r.status, 'fail')
  assert.match(r.message, /1 hardcoded value\(s\) left: less\/template\.less:12 \(\.btn, color #0a66c2\)\./)
  assert.deepEqual(r.details, ['hardcoded: less/template.less:12 (.btn, color #0a66c2) -> --ds-c-accent'])

  const onlyTwin = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ hardcoded: [twin] })) })
  assert.equal(onlyTwin.status, 'pass', onlyTwin.message)
})

test('a role the template declares not used, with its reason, is not missing; an always-required one is', async () => {
  const declared = REQUIRED_ROLE_VARIABLES.filter((n) => !['--ds-c-ink', '--ds-c-on-ink'].includes(n))
  const without = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ declared })) })
  assert.equal(without.status, 'fail')
  const notUsed = [
    { name: '--ds-c-ink', reason: 'no ink band in this theme' },
    { name: '--ds-c-on-ink', reason: 'no ink band in this theme' }
  ]
  const declaredNotUsed = await vars1({ [ROLE_SCAN_FILE]: JSON.stringify(scan({ declared, notUsed })) })
  assert.equal(declaredNotUsed.status, 'pass')
  // no reason: declares nothing
  const bare = await vars1({
    [ROLE_SCAN_FILE]: JSON.stringify(scan({ declared, notUsed: notUsed.map((n) => ({ ...n, reason: ' ' })) }))
  })
  assert.equal(bare.status, 'fail')
  // the page ground can never be declared not used
  const noBg = await vars1({
    [ROLE_SCAN_FILE]: JSON.stringify(
      scan({
        declared: REQUIRED_ROLE_VARIABLES.filter((n) => n !== '--ds-c-bg'),
        notUsed: [{ name: '--ds-c-bg', reason: 'none' }]
      })
    )
  })
  assert.equal(noBg.status, 'fail')
  assert.match(noBg.message, /--ds-c-bg/)
})
