/**
 * REG-PR-1134-ds-minversion-audit: a slot contract offers Apply only for the template releases checked
 * to wear it (11/10/2026). `minVersion` alone said "every release from here on wears it", while other
 * lines re-release the same quickstarts and themes; one rebuilt from the untokenized source would be
 * offered and paint light text on a light band. Each ready contract now names `maxVersion`, the last
 * release checked, and a newer one is refused as TEMPLATE_VERSION_UNCHECKED — by tracy-web's door and,
 * on WordPress, by the write's own run (`maxTheme`).
 *   S1 the door, host and panel tests; S2 every ready contract's window; S3 contractFor at both edges;
 *   S4 the WordPress run's check and its payload validation; S5 the new strings in every language.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)

// S1
c.tapClean(
  'S1 door, host and panel tests',
  nodeTest([
    'apps/tracy-web/test/design-system-door.test.mjs',
    'apps/tracy-host/test/ds-slot.test.mjs',
    'packages/design/tracy-design-inspiration/test/design-system-button.test.mjs'
  ])
)

// S2
const { compareVersions, contractFor, maxVersionOf, slotContracts } = await imp(
  'apps/tracy-web/src/lib/ds-slot.js'
)
let windows = 0
for (const k of slotContracts().filter((x) => x.ready)) {
  for (const [key, min] of Object.entries(k.minVersion ?? {})) {
    if (min === null) continue
    const max = k.maxVersion?.[key]
    if (typeof max === 'string' && compareVersions(max, min) >= 0) windows++
    else c.check(`S2 ${k.name}: ${key} has maxVersion >= ${min}`, false, max)
  }
}
c.check('S2 every ready contract names a window for each key', windows > 80, windows)
const named = Object.fromEntries(slotContracts().map((k) => [k.name, k.maxVersion]))
// The last release checked when this case was written; re-releases checked since (develop, 12/10/2026:
// ja-spa 1.0.5, ja-morgan 1.0.5, ja-voyara 1.0.7, tracy-business 1.7.16, wp-ja-essence 1.0.17,
// wp-ja-vega 1.1.16) only move a window forward, never back.
const WINDOWS = [
  ['joomla-ja-spa', 'joomla/ja-spa', 'quickstart/ja-spa/j6', '1.0.4'],
  ['joomla-ja-morgan', 'joomla/ja-morgan', 'quickstart/ja-morgan/j6', '1.0.4'],
  ['joomla-ja-voyara', 'joomla/ja-voyara', 'quickstart/ja-voyara/j6', '1.0.6'],
  ['emdash-tracy-business', 'emdash/tracy-business', 'tracy-business/emdash-0.x', '1.7.14'],
  ['wordpress-ja-essence', 'wordpress/wp-ja-essence', 'wp-ja-essence', '1.0.16'],
  ['wordpress-ja-vega', 'wordpress/wp-ja-vega', 'wp-ja-vega', '1.1.15']
]
for (const [name, , key, floor] of WINDOWS) {
  const max = named[name]?.[key]
  c.check(
    `S2 ${name} checked up to ${floor} or later`,
    typeof max === 'string' && compareVersions(max, floor) >= 0,
    max
  )
}

// S3: both edges of each window, read from the contract as it stands
const at = (template, key, version) => JSON.stringify(contractFor(template, { key, version }))
const nextPatch = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) + 1))
c.eq(
  'S3 ja-spa 1.0.1',
  at('joomla/ja-spa', 'quickstart/ja-spa/j6', '1.0.1'),
  JSON.stringify({ reason: 'TEMPLATE_NEEDS_UPDATE', need: '1.0.2', have: '1.0.1' })
)
for (const [name, template, key] of WINDOWS.filter(([n]) =>
  ['joomla-ja-spa', 'emdash-tracy-business', 'wordpress-ja-vega'].includes(n)
)) {
  const max = named[name]?.[key]
  c.eq(`S3 ${name} at its last checked ${max}`, at(template, key, max), JSON.stringify({ contract: name }))
  c.eq(
    `S3 ${name} one past it (${nextPatch(max)})`,
    at(template, key, nextPatch(max)),
    JSON.stringify({ reason: 'TEMPLATE_VERSION_UNCHECKED', upTo: max, have: nextPatch(max) })
  )
}
const base = maxVersionOf('wordpress/tracy-base')
c.eq(
  'S3 maxVersionOf tracy-base names both theme slugs',
  Object.keys(base ?? {})
    .sort()
    .join(','),
  'tracy,tracy-base'
)
for (const [slug, v] of Object.entries(base ?? {}))
  c.check(`S3 maxVersionOf tracy-base ${slug} is 1.1.5 or later`, compareVersions(v, '1.1.5') >= 0, v)

// S4
const host = await imp('apps/tracy-host/src/ds-slot.js')
c.check(
  'S4 the WordPress run refuses a theme past maxTheme',
  host.WORDPRESS_DS_PHP.includes('version_compare($tv,$top,">")')
)
const body = (maxTheme) => ({
  kind: host.DS_SLOT_KIND,
  label: 'dsbtn',
  mode: 'apply',
  platform: 'wordpress',
  payload: { system: 'od:stripe', slug: 'ds-od-stripe', name: 'Stripe', variation: {}, maxTheme }
})
c.eq('S4 a malformed maxTheme', host.validateDsSlotBody(body({ 'wp-ja-kinetic': 'x' })), 'refused maxTheme')
c.eq('S4 a valid maxTheme', host.validateDsSlotBody(body({ 'wp-ja-kinetic': '1.1.12' })), null)

// S5
for (const [lang, dir] of [
  ['vi', 'packages/locale/tracy-locale-vi/vi'],
  ...['de', 'es', 'fr', 'it', 'nl', 'zh'].map((l) => [l, `packages/locale/tracy-locales/${l}`])
]) {
  const t = JSON.parse(readFileSync(join(ROOT, dir, 'tracy-design-inspiration.json'), 'utf8'))
  // The tab no longer says the version reasons (12/10/2026): their words are gone in every language.
  for (const key of ['ds.unsupported.TEMPLATE_VERSION_UNCHECKED', 'ds.version.upTo'])
    c.check(`S5 ${lang}: ${key} removed`, !(key in t))
}
c.done()
