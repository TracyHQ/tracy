/**
 * `tracy_design_check`, the pure half: always ok:true, three kinds of answer, each with a `next`.
 *
 *   node --test packages/tools/tracy-site-tools/test/design-check-tool.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkedAnswer,
  designCheckPaths,
  noDesignAnswer,
  skippedAnswer
} from '../src/host/design-check-tool.mjs'

const tokens = {
  '--bg': '#ffffff',
  '--fg': '#1d1d1f',
  '--accent': '#0071e3',
  '--font-body': '"SF Pro Text", system-ui, sans-serif'
}
const design = { id: 'apple', source: 'catalog', tokens }

test('paths: the default page, up to three named pages, and a path that is not one', () => {
  assert.deepEqual(designCheckPaths({}), { ok: true, paths: ['/'], siteKey: null })
  assert.deepEqual(designCheckPaths({ path: '/about' }).paths, ['/about'])
  assert.deepEqual(designCheckPaths({ paths: ['/', '/a', '/b', '/c', '/d'] }).paths, ['/', '/a', '/b'])
  assert.equal(designCheckPaths({ path: 'about' }).code, 'BAD_PATH')
  assert.equal(designCheckPaths({ path: '//evil' }).code, 'BAD_PATH')
  assert.equal(designCheckPaths({ siteKey: 'x.tracy.test' }).siteKey, 'x.tracy.test')
})

test('no design bound: ok, not checked, NO_DESIGN_BOUND, a next that names the way to bind one', () => {
  const a = noDesignAnswer(null)
  assert.equal(a.ok, true)
  assert.equal(a.checked, false)
  assert.deepEqual(a.warnings, [{ code: 'NO_DESIGN_BOUND' }])
  assert.match(a.next, /design template/)
  assert.equal(noDesignAnswer({ id: null, source: 'template' }).design, null)
})

test('skipped: ok, not checked, the reason in the warning and in next', () => {
  const a = skippedAnswer('no browser in this site container', { id: 'apple', source: 'catalog' })
  assert.equal(a.ok, true)
  assert.deepEqual(a.warnings, [{ code: 'DESIGN_CHECK_SKIPPED', why: 'no browser in this site container' }])
  assert.match(a.next, /no browser in this site container/)
})

test('checked: one warning per offender with its page, the worst page sets score and next, a clean page says so', () => {
  const leaky = {
    href: 'http://s/',
    seen: 6,
    samples: [
      { prop: 'color', value: 'rgb(29, 29, 31)', count: 4, where: ['p'] },
      { prop: 'background-color', value: 'rgb(120, 200, 40)', count: 1, where: ['.promo'] },
      { prop: 'font-family', value: 'Arial, sans-serif', count: 2, where: ['.legacy'] }
    ]
  }
  const clean = {
    href: 'http://s/about',
    seen: 3,
    samples: [{ prop: 'color', value: 'rgb(29, 29, 31)', count: 3, where: ['p'] }]
  }
  const a = checkedAnswer({
    design,
    pages: [
      { path: '/about', url: 'http://s/about', probe: clean },
      { path: '/', url: 'http://s/', probe: leaky }
    ],
    reportPath: 'docs/agents/build/design-check.json',
    now: () => new Date('2026-09-29T00:00:00Z')
  })
  assert.equal(a.ok, true)
  assert.equal(a.checked, true)
  assert.deepEqual(a.design, { id: 'apple', source: 'catalog' })
  assert.deepEqual(
    a.pages.map((p) => [p.path, p.score]),
    [
      ['/about', 100],
      ['/', 57]
    ]
  )
  assert.equal(a.score, 57, 'the worst page')
  assert.equal(a.warnings.length, 2)
  assert.equal(a.warnings[0].code, 'OFF_PALETTE_COLOR')
  assert.equal(a.warnings[0].path, '/')
  assert.equal(a.warnings[0].band, 'off')
  assert.equal(a.warnings[1].code, 'OFF_SYSTEM_FONT')
  assert.equal(a.warnings[1].family, 'Arial')
  assert.match(a.next, /rgb\(120, 200, 40\)/)
  assert.equal(a.report, 'docs/agents/build/design-check.json')
  assert.equal(a.reports.length, 2)
  const only = checkedAnswer({
    design,
    pages: [{ path: '/about', url: 'http://s/about', probe: clean }],
    reportPath: 'r'
  })
  assert.deepEqual(only.warnings, [])
  assert.match(only.next, /Nothing drifted/)
  assert.equal(only.score, 100)
})

test('a page measured in dsh with scripts off says its score is not the build score', () => {
  // Measured 29/09/2026 on the private stand (dfinj1, tracy-business/j6, /en/): the build's `shot`
  // probe (scripts on) judged 785 samples and scored 88; this tool in host mode judged 626 and
  // scored 84, with the SAME offenders. The 69 elements only the scripts-on page has are the ones
  // T4's scripts build (the off-canvas menu, a second brand block, dropdown items). The two numbers
  // differ by design, so the answer must say so rather than let an agent chase the gap.
  const design = { id: 'apple', source: 'catalog', tokens: { '--fg': '#1d1d1f' } }
  const probe = {
    href: 'http://s/',
    seen: 1,
    samples: [{ prop: 'color', value: 'rgb(29, 29, 31)', count: 1, where: ['p'] }]
  }
  const host = checkedAnswer({
    design,
    pages: [{ path: '/', url: 'http://s/', probe, browser: 'host' }],
    reportPath: 'r'
  })
  assert.equal(host.pages[0].browser, 'host')
  assert.match(host.note, /scripts off/)
  assert.match(host.note, /shot/)
  const site = checkedAnswer({
    design,
    pages: [{ path: '/', url: 'http://s/', probe, browser: 'site' }],
    reportPath: 'r'
  })
  assert.equal(site.note, undefined)
})
