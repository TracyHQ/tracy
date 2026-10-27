/**
 * REG-PR-1334-tb-emdash-1-7-18-pinned: Tracy Business EmDash 1.7.18 (the two-mode design-system slot of
 * #1315 / #1321) is the version the repo pins, on the parts published on ja-products, and every place
 * that names a Tracy Business version agrees with that pin:
 *   S1 both quickstarts.json copies (tracy-web and fleet provision) pin 1.7.18 on the same parts,
 *      with the published file names, sizes, sha256 and GitHub asset ids;
 *   S2 the theme's package.json, template.config.json and Dockerfile label say 1.7.18;
 *   S3 template-profiles.json has a 1.7.18 row, the where map names 1.7.18, and the slot contract's
 *      maxVersion is 1.7.18 with `modes: true`;
 *   S4 the theme's lib/ds-slot.ts reads the mode line and Base.astro sets data-theme from it.
 * No stand, no model, no network.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const text = (p) => readFileSync(join(ROOT, p), 'utf8')
const V = '1.7.18'
const THEME = 'packages/cms/tracy-emdash-theme-business'

// S1
const want = {
  source: {
    file: `tracy-business-emdash-quickstart-${V}.zip`,
    bytes: 6472598,
    sha256: '7804bad234f236680f7da61206e36aaa79cbe536c6386a85cd718631ad75e291',
    githubAssetId: 638263593
  },
  state: {
    file: `tracy-business-emdash-state-${V}.tar.gz`,
    bytes: 8471674,
    sha256: '974084e60a64328a36bb4d9b0b958e73a5d20fdebae7d604e6c21c4646cefc02',
    githubAssetId: 638263592
  }
}
for (const p of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const pin = json(p)['tracy-business/emdash']
  c.eq(`S1 ${p}: version`, pin.version, V)
  c.eq(`S1 ${p}: release`, pin.release, 'tracy-business/emdash-0.x')
  for (const part of ['source', 'state']) {
    for (const [k, v] of Object.entries(want[part])) c.eq(`S1 ${p}: ${part}.${k}`, pin[part][k], v)
    c.eq(
      `S1 ${p}: ${part}.url`,
      pin[part].url,
      `https://github.com/JoomlArt-Products/ja-products/releases/download/tracy-business%2Femdash-0.x/${want[part].file}`
    )
  }
}

// S2
c.eq('S2 package.json version', json(`${THEME}/package.json`).version, V)
c.eq('S2 template.config.json version', json(`${THEME}/template.config.json`).version, V)
c.check('S2 Dockerfile label names 1.7.18', text(`${THEME}/Dockerfile`).includes(V))

// S3
c.check(
  'S3 template-profiles has a 1.7.18 row',
  Boolean(json('apps/tracy-web/src/lib/template-profiles.json').releases['tracy-business/emdash-0.x']?.[V])
)
c.check(
  'S3 the where map names 1.7.18',
  JSON.stringify(json('apps/tracy-web/src/sites/where/emdash-tracy-business.json')).includes(`"${V}"`)
)
const slot = json('packages/design/tracy-ds-slot/templates/emdash-tracy-business.json')
c.eq('S3 slot contract maxVersion', slot.maxVersion['tracy-business/emdash-0.x'], V)
c.eq('S3 slot contract modes', slot.modes, true)

// S4
c.check(
  'S4 ds-slot.ts reads the mode line',
  /\/\\\* mode: \(light\|dark\)/.test(text(`${THEME}/src/lib/ds-slot.ts`))
)
c.check(
  'S4 Base.astro opens on the system side',
  text(`${THEME}/src/layouts/Base.astro`).includes(
    "data-theme={dsSlot?.mode === 'dark' ? 'dark' : undefined}"
  )
)

c.done()
