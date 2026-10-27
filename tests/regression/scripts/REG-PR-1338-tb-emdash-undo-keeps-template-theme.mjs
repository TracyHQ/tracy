/**
 * REG-PR-1338-tb-emdash-undo-keeps-template-theme: taking a design system off a Tracy Business EmDash site
 * gives every visitor the template's own light/dark again (ADR 0031 decision 12, UNDO-1, #1318), and 1.7.19,
 * the release that carries the fix, is the version the repo pins:
 *   S1 the theme's own test runs the real pre-paint and toggle scripts on one shared storage: a dark system
 *      worn then taken off opens light, and opening on the system's mode stores nothing;
 *   S2 the toggle only writes on a click, under the worn system's own key (ngi-theme@<id>);
 *   S3 contracts/1.7.19/design-system-measurement.json measured on the release: four controls, no difference;
 *   S4 both quickstarts.json copies pin 1.7.19 on the published parts; package.json, template.config.json,
 *      the Dockerfile label and the slot contract's maxVersion say 1.7.19.
 * No stand, no model, no network.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const text = (p) => readFileSync(join(ROOT, p), 'utf8')
const V = '1.7.19'
const THEME = 'packages/cms/tracy-emdash-theme-business'

// S1
const t = spawnSync(process.execPath, ['--test', 'tests/theme-preference.test.mjs'], {
  cwd: join(ROOT, THEME),
  encoding: 'utf8'
})
c.check('S1 tests/theme-preference.test.mjs passes', t.status === 0)
c.check('S1 the UNDO-1 case ran', /UNDO-1: wearing a dark system, then taking it off/.test(t.stdout))

// S2
const topbar = text(`${THEME}/src/components/site/Topbar.astro`)
const toggle = topbar.slice(topbar.indexOf('// Theme toggle:'))
c.check('S2 the key follows the worn system', toggle.includes('`ngi-theme@${ds}`'))
c.check(
  'S2 opening on dark only shows, never stores',
  toggle.includes('if (document.documentElement.getAttribute("data-theme") === "dark") show(true);')
)
c.check(
  'S2 Base.astro reads the same key',
  text(`${THEME}/src/layouts/Base.astro`).includes('"ngi-theme@" + ds')
)

// S3
const m = json(`${THEME}/contracts/${V}/design-system-measurement.json`)
c.eq('S3 measured version', m.version, V)
c.eq('S3 controls', JSON.stringify(m.controls), JSON.stringify([0, 0, 0, 0]))

// S4
const want = {
  source: {
    file: `tracy-business-emdash-quickstart-${V}.zip`,
    bytes: 6475347,
    sha256: '4369ec6c9527e9bab1d8e4f14e55f8e11aaed55647f475ee376f70a059f2c26e',
    githubAssetId: 638772950
  },
  state: {
    file: `tracy-business-emdash-state-${V}.tar.gz`,
    bytes: 8472464,
    sha256: 'fb3a181aa3767e073790c3fc5ef34be68c76ed03c1778650bae50a1711442241',
    githubAssetId: 638772954
  }
}
for (const p of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const pin = json(p)['tracy-business/emdash']
  c.eq(`S4 ${p}: version`, pin.version, V)
  for (const part of ['source', 'state'])
    for (const [k, v] of Object.entries(want[part])) c.eq(`S4 ${p}: ${part}.${k}`, pin[part][k], v)
}
c.eq('S4 package.json version', json(`${THEME}/package.json`).version, V)
c.eq('S4 template.config.json version', json(`${THEME}/template.config.json`).version, V)
c.check('S4 Dockerfile label', text(`${THEME}/Dockerfile`).includes(`io.tracy.template.version="${V}"`))
c.eq(
  'S4 slot contract maxVersion',
  json('packages/design/tracy-ds-slot/templates/emdash-tracy-business.json').maxVersion[
    'tracy-business/emdash-0.x'
  ],
  V
)

c.done()
