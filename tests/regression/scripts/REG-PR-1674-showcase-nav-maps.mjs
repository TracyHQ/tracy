/**
 * REG-PR-1674-showcase-nav-maps: the showcase-navigation maps that put a template's demo navigation away
 * at customer install are current, only hide (never unpublish or delete), and keep the routes the PO
 * named. S1: both builders' --check pass. S2: every operation is one of the hide-only kinds and every
 * Joomla menu edit sets menu_show to 0 from 1 or from unset (Joomla's default, shown). S3: Diner WP and Morgan WP keep Login and Smart Search in
 * their drawers and keep the drawers themselves. S4: Smallbiz J6 1.0.4 removes the mega column whose
 * items are all hidden (the column T3 otherwise rendered twice). S5: a failure in the showcase phase never
 * stops quickstart site creation (the fleet provisioning tests that cover it pass).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, run } from './lib.mjs'

const c = checks()
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

for (const cms of ['joomla', 'wordpress']) {
  const r = run('node', [`scripts/build-${cms}-showcase-nav.mjs`, '--check'])
  c.eq(`S1: ${cms} builder --check exit code`, r.status, 0)
}

const HIDE_ONLY = new Set([
  'menuItem.param',
  'module.published',
  'templateStyle.megaSubRemove',
  'templateStyle.megaColumnRemove',
  'navigation.removeLink',
  'templatePart.setNavigationRef',
  'templatePart.removeBlock'
])
const maps = []
const walk = (dir) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
    else if (name === 'showcase-nav-map.json') maps.push(rel)
  }
}
walk('packages/cms/tracy-joomla-quickstart/contracts')
walk('packages/cms/tracy-wordpress-quickstart/contracts')
c.check(`S2: found showcase maps (${String(maps.length)})`, maps.length >= 40, maps.length)
const odd = []
for (const path of maps) {
  for (const op of read(path).operations ?? []) {
    if (!HIDE_ONLY.has(op.op)) odd.push(`${path}: ${op.op}`)
    else if (
      op.op === 'menuItem.param' &&
      (op.path !== 'menu_show' || !['1', null].includes(op.from) || op.to !== '0')
    )
      odd.push(`${path}: ${op.key} ${op.path} ${op.from}->${op.to}`)
    else if (op.op === 'module.published' && op.to !== 0 && op.to !== '0')
      odd.push(`${path}: ${op.key} published -> ${String(op.to)}`)
  }
}
c.eq('S2: operations that are not hide-only', odd.length, 0)
if (odd.length) process.stdout.write(odd.slice(0, 10).join('\n') + '\n')

const WP = 'packages/cms/tracy-wordpress-quickstart/contracts'
for (const [release, nav] of [
  ['ja-diner/wp7/1.0.1', 278],
  ['ja-morgan/wp7/1.1.16', 160]
]) {
  const ops = read(`${WP}/${release}/showcase-nav-map.json`).operations
  const removed = ops.filter((o) => o.op === 'navigation.removeLink').map((o) => o.label.trim())
  c.eq(`S3: ${release} removes Login`, removed.includes('Login'), false)
  c.eq(`S3: ${release} removes Smart Search`, removed.includes('Smart Search'), false)
  c.eq(
    `S3: ${release} repoints or removes a header drawer`,
    ops.some((o) => o.op === 'templatePart.setNavigationRef' || o.op === 'templatePart.removeBlock'),
    false
  )
  c.check(
    `S3: ${release} hides sample screens inside drawer nav ${String(nav)}`,
    ops.some((o) => o.op === 'navigation.removeLink' && o.navigation?.id === nav),
    removed
  )
}

const smallbiz = read(
  'packages/cms/tracy-joomla-quickstart/contracts/ja-smallbiz/j6/1.0.4/showcase-nav-map.json'
)
c.check(
  'S4: ja-smallbiz/j6/1.0.4 removes a mega column',
  smallbiz.operations.some((o) => o.op === 'templateStyle.megaColumnRemove'),
  [...new Set(smallbiz.operations.map((o) => o.op))]
)

const fleet = 'packages/fleet/tracy-fleet-operation/test'
const provision = run('node', [
  '--test',
  `${fleet}/joomla-contract-bind.test.mjs`,
  `${fleet}/wordpress-quickstart.test.mjs`,
  `${fleet}/joomla-contract-fetch.test.mjs`
])
c.eq('S5: fleet provisioning tests (showcase phase non-fatal) exit code', provision.status, 0)

c.done()
