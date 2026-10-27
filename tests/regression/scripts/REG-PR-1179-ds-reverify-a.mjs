/**
 * REG-PR-1179-ds-reverify-a: eighteen ready Joomla slot contracts (JA Aiga … JA Directory)
 * re-verified on 12/10/2026 with the unified probe (fix/ds-remeasure flow.mjs) on the 1.0.1
 * release each contract's minVersion names. All eighteen held, so what must hold is:
 *   S1 the library's tests;
 *   S2 every contract stays ready inside [minVersion, maxVersion], its readyNote names the
 *      re-verify evidence, and that evidence's summary meets the ready rule (no control
 *      difference, no text below 4.5:1 worse than the template's own, at least half the page
 *      follows under every system, two eye pictures kept);
 *   S3 tracy-web's door offers each at its minVersion and refuses the version before.
 * No Docker, no network.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
const c = checks()
const EV = 'tasks/evidence/ds-reverify-a-2026-10-12'
const SLUGS = [
  'aiga',
  'alpha',
  'alumni',
  'artsy',
  'athena',
  'beauty',
  'blockk',
  'boxing',
  'campaign',
  'candidate',
  'cityguide',
  'civica',
  'coach',
  'colab',
  'comics',
  'company',
  'diner',
  'directory'
].map((s) => `ja-${s}`)
const V = '1.0.1'

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2: the contract and the re-verify summary behind it
const name = (s) => `joomla-${s}`
for (const s of SLUGS) {
  const k = loadContract(name(s))
  const q = `quickstart/${s}/j6`
  const dir = join(ROOT, EV, `${s}-j6`)
  c.eq(`S2 ${s} ready`, k.ready, true)
  c.eq(`S2 ${s} minVersion is the verified release`, k.minVersion?.[q], V)
  c.check(`S2 ${s} maxVersion set`, typeof k.maxVersion?.[q] === 'string', k.maxVersion)
  c.check(`S2 ${s} names its re-verify`, String(k.readyNote).includes(`${EV}/${s}-j6`), '')
  const file = join(dir, 'summary.json')
  if (!existsSync(file)) {
    c.check(`S2 ${s} summary kept`, false, file)
    continue
  }
  const sum = JSON.parse(readFileSync(file, 'utf8'))
  c.check(`S2 ${s} controls 0`, sum.controls.length > 0 && sum.controls.every((n) => n === 0), sum.controls)
  c.eq(`S2 ${s} no text worse than the template's own`, sum.lowContrast.length, 0)
  c.check(
    `S2 ${s} at least half the page follows`,
    sum.follows.length === 8 && sum.follows.every((f) => typeof f === 'number' && f >= 0.5),
    sum.follows
  )
  c.check(
    `S2 ${s} eye pictures kept`,
    existsSync(join(dir, '03-motherduck-desktop.jpg')) && existsSync(join(dir, '05-apple-desktop.jpg')),
    ''
  )
}

// S3: the door at minVersion and the version before it
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of SLUGS) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at ${V}`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: V })),
    JSON.stringify({ contract: name(s) })
  )
  c.eq(
    `S3 ${s} at 1.0.0 needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.0' }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

c.done()
