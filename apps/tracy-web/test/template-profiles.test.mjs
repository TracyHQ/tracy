/**
 * Template profiles (`src/lib/template-profiles.js`): how a released template takes a customer's
 * brand — how many logos, whether it already shows one, where the writers put it — looked up by
 * release and version, and the two checks the `design-templates` gate runs over the table.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { readContracts } from '../src/lib/contracts.js'
import {
  galleryCoverageProblems,
  LOGO_LAYOUTS,
  profileTableProblems,
  TEMPLATE_PROFILES,
  templateProfileOf
} from '../src/lib/template-profiles.js'

const row = (over = {}) => ({ logos: 'dark', brandReady: true, faviconReady: true, ...over })
const table = (releases) => ({ releases })

test('an exact row is answered as written, with the release and version it was filed under', () => {
  const t = table({ 'quickstart/ja-vega/wp7': { '1.1.11': row() } })
  assert.deepEqual(templateProfileOf('quickstart/ja-vega/wp7', '1.1.11', t), {
    release: 'quickstart/ja-vega/wp7',
    version: '1.1.11',
    ...row()
  })
})

test('a version with no row takes the nearest LOWER row of the same major, and says it did', () => {
  const t = table({ 'quickstart/ja-vega/wp7': { '1.1.4': row(), '1.0.9': row({ logos: 'pair' }) } })
  const got = templateProfileOf('quickstart/ja-vega/wp7', '1.1.10', t)
  assert.equal(got?.version, '1.1.4')
  assert.equal(got?.logos, 'dark')
  assert.equal(got?.fallbackFrom, '1.1.10')
})

test('never a higher version, another major, another release or a non-semver version', () => {
  const t = table({
    'quickstart/ja-vega/wp7': { '1.1.4': row() },
    'quickstart/ja-nova/wp7': { '1.0.0': row() }
  })
  assert.equal(templateProfileOf('quickstart/ja-vega/wp7', '1.1.3', t), null)
  assert.equal(templateProfileOf('quickstart/ja-vega/wp7', '2.0.0', t), null)
  assert.equal(templateProfileOf('quickstart/ja-vega/j6', '1.1.4', t), null)
  assert.equal(templateProfileOf('quickstart/ja-vega/wp7', '1.1.4-rc.1', t), null)
  assert.equal(templateProfileOf(undefined, '1.1.4', t), null)
})

test('a local pack is profiled as the release it stands for', () => {
  const t = table({ 'tracy-business/j6': { '1.2.0': row({ logos: 'pair' }) } })
  assert.equal(templateProfileOf('local/tracy-business/j6', '1.2.0', t)?.logos, 'pair')
})

test('the shipped table answers the values the plan names', () => {
  assert.equal(templateProfileOf('quickstart/ja-vega/wp7', '1.1.11')?.logos, 'dark')
  assert.equal(templateProfileOf('quickstart/ja-nova/j6', '1.0.4')?.logos, 'pair')
  assert.equal(templateProfileOf('quickstart/ja-prodex/j6', '1.0.0')?.logos, 'single')
  assert.equal(templateProfileOf('quickstart/ja-kinetic/wp7', '1.0.6')?.logos, 'pair')
  assert.equal(templateProfileOf('tracy-business/emdash-0.x', '1.6.0')?.logos, 'pair')
  // JA Resort j6: one logo key, shown only on its green bands, dark-mode switch off (release 1.0.1, 08/10/2026).
  const resort = templateProfileOf('quickstart/ja-resort/j6', '1.0.1')
  assert.equal(resort?.logos, 'dark')
  assert.ok(!resort?.unverified?.includes('logos'), 'JA Resort: the dark layout is measured, not guessed')
  // Brand-ready only where the template already shows a customer logo without a re-release.
  assert.equal(templateProfileOf('quickstart/ja-vega/wp7', '1.1.11')?.brandReady, true)
  assert.equal(templateProfileOf('quickstart/ja-nova/wp7', '1.1.9')?.brandReady, false)
  assert.equal(templateProfileOf('quickstart/ja-sensei/j6', '1.0.0')?.brandReady, false)
  // Every WordPress template shows `site_icon`; Joomla and EmDash wait for their own tickets.
  assert.equal(templateProfileOf('quickstart/ja-morgan/wp7', '1.1.10')?.faviconReady, true)
  assert.equal(templateProfileOf('quickstart/ja-sensei/j6', '1.0.0')?.faviconReady, false)
  assert.equal(templateProfileOf('tracy-business/emdash-0.x', '1.6.0')?.faviconReady, false)
})

test('the shipped table is clean against the contracts this tree carries', () => {
  assert.deepEqual(profileTableProblems(TEMPLATE_PROFILES, { contracts: readContracts() }), [])
})

// The gallery half of the `design-templates` gate needs TRACY_RELEASES_GITHUB_TOKEN, which CI never
// sets: on 10/10/2026 it listed 16 Design inspiration releases with no row of their own, every one
// the stylesheet-only next version `release-joomla.mjs` built on 09/10 (ja-voyara 1.0.5, ja-kinetic
// 1.0.4, …). Their contracts are in this tree and say so (`quickstart.builtFrom`), so this half needs
// no token: such a release keeps its source's logo spots, and its row says exactly that.
test('a release rebuilt only to tokenize its stylesheets has its own row, the same as its source but for the note', () => {
  const rebuilt = []
  for (const contract of readContracts().values()) {
    const manifest = JSON.parse(readFileSync(path.join(contract.dir, 'manifest.json'), 'utf8'))
    const q = manifest.quickstart
    if (q?.builtFrom?.by !== 'tracy-ds-slot release-joomla.mjs') continue
    const [tag, from] = String(q.builtFrom.from).split('@')
    if (!TEMPLATE_PROFILES.releases[tag]) continue
    rebuilt.push(`${tag}@${q.version}`)
    const own = TEMPLATE_PROFILES.releases[tag][q.version]
    assert.ok(own, `${tag}@${q.version} (built from ${from}) has no row of its own`)
    const source = templateProfileOf(tag, from)
    assert.ok(source, `${tag}@${from}: the version it was built from has no row`)
    const { note: _n, release: _r, version: _v, fallbackFrom: _f, ...fields } = source
    const { note, ...ownFields } = own
    assert.deepEqual(ownFields, fields, `${tag}@${q.version} differs from ${tag}@${from}`)
    // "and content" is left out when the re-cut also carries a demo-content edit (JA Donate 1.0.7); the logo
    // fields above are what must stay equal, and they are compared in full
    assert.match(String(note), new RegExp(`^Same logos?( and content)? as ${from.replaceAll('.', '\\.')};`))
  }
  assert.ok(rebuilt.length >= 17, `only ${rebuilt.length} rebuilt releases found: ${rebuilt.join(', ')}`)
})

test('an unknown logo layout is a problem that names the row, and `none` is no longer a layout', () => {
  assert.ok(!LOGO_LAYOUTS.includes('none'))
  for (const logos of ['none', 'two', undefined]) {
    const problems = profileTableProblems(table({ 'quickstart/ja-vega/wp7': { '1.1.11': row({ logos }) } }))
    assert.equal(problems.length, 1, String(logos))
    assert.match(problems[0], /quickstart\/ja-vega\/wp7@1\.1\.11/)
    assert.match(problems[0], /logos/)
  }
})

test('a row must say both readiness flags, a version must be x.y.z, and no field may be invented', () => {
  const problems = profileTableProblems(
    table({
      'quickstart/ja-vega/wp7': {
        '1.1.11': { logos: 'dark', brandReady: 'yes' },
        latest: row(),
        '1.0.0': row({ colour: 'blue' }),
        '1.0.1': row({ unverified: ['frame'] })
      }
    })
  )
  assert.equal(problems.length, 5, problems.join('\n'))
  assert.ok(problems.some((p) => /brandReady/.test(p)))
  assert.ok(problems.some((p) => /faviconReady/.test(p)))
  assert.ok(problems.some((p) => /latest/.test(p)))
  assert.ok(problems.some((p) => /colour/.test(p)))
  assert.ok(problems.some((p) => /unverified.*frame/.test(p)))
})

test('a logoHeight is a whole number of pixels above zero', () => {
  const ok = table({ 'quickstart/ja-rent/j6': { '1.0.0': row({ logoHeight: 17 }) } })
  assert.deepEqual(profileTableProblems(ok), [])
  for (const bad of [0, 17.5, '17', -1]) {
    const problems = profileTableProblems(
      table({ 'quickstart/ja-rent/j6': { '1.0.0': row({ logoHeight: bad }) } })
    )
    assert.equal(problems.length, 1, `${JSON.stringify(bad)}: ${problems.join('\n')}`)
    assert.match(problems[0], /logoHeight/)
  }
})

test('a footer slot must be an image slot of the profile that seals that release', () => {
  const contracts = readContracts()
  const ok = table({ 'quickstart/ja-nova/j6': { '1.0.4': row({ footerSlot: 'module-132.0' }) } })
  assert.deepEqual(profileTableProblems(ok, { contracts }), [])
  const bad = table({ 'quickstart/ja-nova/j6': { '1.0.4': row({ footerSlot: 'module-999.0' }) } })
  const [problem] = profileTableProblems(bad, { contracts })
  assert.match(problem, /module-999\.0/)
})

test('every gallery release needs its OWN row: a re-release does not inherit an older one', () => {
  const t = table({
    'quickstart/ja-vega/wp7': { '1.1.10': row() },
    'quickstart/ja-nova/wp7': { '1.1.9': row() }
  })
  assert.deepEqual(galleryCoverageProblems(t, [{ tag: 'quickstart/ja-nova/wp7', version: '1.1.9' }]), [])
  const problems = galleryCoverageProblems(t, [
    { tag: 'quickstart/ja-vega/wp7', version: '1.1.11' },
    { tag: 'quickstart/ja-impact/wp7', version: '1.0.6' }
  ])
  assert.equal(problems.length, 2)
  assert.match(problems[0], /quickstart\/ja-vega\/wp7@1\.1\.11/)
  assert.match(problems[1], /quickstart\/ja-impact\/wp7@1\.0\.6/)
})

test('darkLogo says a WordPress theme reads tracy_logo_dark: true or false, and on WordPress only', () => {
  const ok = table({ 'quickstart/ja-nova/wp7': { '1.1.9': row({ logos: 'pair', darkLogo: true }) } })
  assert.deepEqual(profileTableProblems(ok), [])
  const problems = profileTableProblems(
    table({
      'quickstart/ja-nova/wp7': { '1.1.9': row({ darkLogo: 'yes' }) },
      'quickstart/ja-nova/j6': { '1.0.4': row({ darkLogo: true }) }
    })
  )
  assert.equal(problems.length, 2, problems.join('\n'))
  assert.ok(problems.some((p) => /ja-nova\/wp7@1\.1\.9: darkLogo must be true or false/.test(p)))
  assert.ok(problems.some((p) => /ja-nova\/j6@1\.0\.4: darkLogo .*WordPress/.test(p)))
})

test('nameFallback says a WordPress theme shows the site title without a logo: true or false, and on WordPress only', () => {
  const ok = table({ 'quickstart/ja-nova/wp7': { '1.1.10': row({ logos: 'pair', nameFallback: true }) } })
  assert.deepEqual(profileTableProblems(ok), [])
  const problems = profileTableProblems(
    table({
      'quickstart/ja-nova/wp7': { '1.1.10': row({ nameFallback: 'yes' }) },
      'quickstart/ja-nova/j6': { '1.0.4': row({ nameFallback: true }) }
    })
  )
  assert.equal(problems.length, 2, problems.join('\n'))
  assert.ok(problems.some((p) => /ja-nova\/wp7@1\.1\.10: nameFallback must be true or false/.test(p)))
  assert.ok(problems.some((p) => /ja-nova\/j6@1\.0\.4: nameFallback .*WordPress/.test(p)))
})

test('nameFallback is set where the theme was proven to print the site title without a logo', () => {
  for (const [tag, version] of [
    ['tracy-base/wp7', '1.1.1'],
    ['tracy-business/wp7', '1.3.2'],
    ['quickstart/ja-nova/wp7', '1.1.10'],
    ['quickstart/ja-impact/wp7', '1.0.7'],
    ['quickstart/ja-vega/wp7', '1.1.12']
  ])
    assert.equal(templateProfileOf(tag, version)?.nameFallback, true, `${tag}@${version}`)
  for (const [tag, version] of [
    ['quickstart/ja-nova/wp7', '1.1.9'],
    ['quickstart/ja-impact/wp7', '1.0.6'],
    ['quickstart/ja-vega/wp7', '1.1.11']
  ])
    assert.equal(templateProfileOf(tag, version)?.nameFallback, undefined, `${tag}@${version}`)
})
