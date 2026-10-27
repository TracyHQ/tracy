/**
 * REG-PR-1134-ds-contracts-r2d: round 2, batch D of the design-system slot contracts (11/10/2026) —
 * JA Essence (Joomla), JA Restaurant (Joomla, T3) and Tracy Base (EmDash):
 *   S1 the library's tests;
 *   S2 the contracts: what is ready names the release that first wears it (minVersion) — JA Essence
 *      1.0.5 (keeps its dark button), Tracy Base EmDash 0.5.0; JA Restaurant ships with T3 dev mode
 *      off (t3DevmodeOff) and fails OpenTable's hanging script while measured (measureBlock);
 *   S3 tracy-web's door judges a site's release against those minimums;
 *   S4 the emitted slot: JA Essence's .btn-dark keeps --color-dark #212529, JA Restaurant's accent box
 *      and tag chips take the accent's own text;
 *   S5 the tch contract of ja-essence 1.0.5 is the published release (another line, #1013/#1161), not
 *      this round's build (minVersion null until the tokenized build ships as the next release); before 11/10 evening: the tch contract of ja-essence 1.0.5 was 1.0.4's with only stylesheet hashes changed, its
 *      .copy.json carried beside it (release-joomla.mjs), and its template-profiles row equals 1.0.4's
 *      but for the note;
 *   S6 the measuring browser fails a measureBlock URL at once: a page whose parser-blocking script
 *      never answers loads whole (cdp.mjs browser(port, { block })).
 * No model reads anything. S6 needs Chrome.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract, loadProfile, contractBase } = await import(
  pathToFileURL(join(LIB, 'src/library.mjs')).href
)
const { joomlaSlot } = await import(pathToFileURL(join(LIB, 'src/joomla.mjs')).href)
const c = checks()

// A contract re-measured since this round names that later measure (ds-remeasure-N / ds-reverify-X,
// 11-12/10/2026) instead; that folder of the template must be on disk.
const laterEvidence = (slug, note) =>
  [...String(note).matchAll(/tasks\/evidence\/ds-re(?:measure|verify)-[^\s),;]+/g)]
    .map((m) => m[0].replace(/[.:]$/, ''))
    .some((d) => d.includes(slug) && existsSync(join(ROOT, d)))
const READY = (k) => k.ready !== false

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(
    ['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs', 'test/release-manifest.test.mjs'],
    { cwd: 'packages/design/tracy-ds-slot' }
  )
)

// S2
const essence = loadContract('joomla-ja-essence')
c.eq('S2 ja-essence is ready', READY(essence), true)
// the measured tokenized build was 1.0.5; another line released a different 1.0.5 (#1013/#1161, not
// tokenized) first, so the contract names no release until the tokenized build ships as the next one
// ... and since the tokenized build was redone from that 1.0.5 and shipped as 1.0.6 (#1180), the contract
// names that release: whichever it is, never the other line's 1.0.5 or anything before it.
const vAfter = (v, floor) => {
  const [a, b] = [v, floor].map((x) => x.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}
const essenceMin = essence.minVersion?.['quickstart/ja-essence/j6']
c.check(
  'S2 ja-essence wears from no release yet, or from a release after 1.0.5',
  essenceMin === null || (typeof essenceMin === 'string' && vAfter(essenceMin, '1.0.5')),
  essenceMin
)
c.check(
  'S2 ja-essence says why',
  /released by another line/.test(essence.minVersionNote ?? ''),
  essence.minVersionNote
)
c.check('S2 ja-essence keeps .btn-dark', essence.keepScopes?.includes('.btn-dark'), essence.keepScopes)
c.eq('S2 ja-essence keeps its dark #212529', essence.keepDefaults?.['--color-dark'], '#212529')
c.check(
  'S2 ja-essence names its evidence',
  /ds-contracts-r2d-2026-10-11/.test(essence.readyNote ?? '') ||
    laterEvidence('ja-essence', essence.readyNote),
  essence.readyNote
)
const base = loadContract('emdash-base')
c.eq('S2 emdash-base is ready', READY(base), true)
c.eq('S2 emdash-base wears from 0.5.0', base.minVersion?.['tracy-base/emdash-0.x'], '0.5.0')
const rest = loadContract('joomla-ja-restaurant')
c.eq('S2 ja-restaurant ships T3 dev mode off', rest.t3DevmodeOff, true)
c.check(
  'S2 ja-restaurant blocks OpenTable while measured',
  (rest.measureBlock ?? []).some((x) => x.includes('opentable.com')),
  rest.measureBlock
)
const REST_READY = READY(rest)
if (REST_READY)
  // measured as 1.0.3; another line (#1175) released a different 1.0.3 first: no release named yet
  // measured as 1.0.3 then; the tokenized rebuild of the released 1.0.3 has since shipped as 1.0.4 (#1180)
  c.check(
    'S2 ja-restaurant wears from no release yet, or from a release after 1.0.3',
    rest.minVersion?.['quickstart/ja-restaurant/j6'] === null ||
      vAfter(String(rest.minVersion?.['quickstart/ja-restaurant/j6']), '1.0.3'),
    rest.minVersion
  )
else
  c.check(
    'S2 ja-restaurant says why',
    (rest.readyNote ?? '').startsWith('NOT offered yet — '),
    rest.readyNote
  )

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const at = (template, key, version) =>
  contractFor(templateKeyOf({ platform: 'joomla', template }), { key, version })
c.eq(
  'S3 ja_essence 1.0.5 (released by another line, not tokenized) needs the next release',
  JSON.stringify(at('ja_essence', 'quickstart/ja-essence/j6', '1.0.5')),
  JSON.stringify({ reason: 'TEMPLATE_NEEDS_UPDATE', need: essenceMin ?? null, have: '1.0.5' })
)
const em = (version) =>
  contractFor(templateKeyOf({ platform: 'emdash', quickstartTag: 'tracy-base/emdash-0.x' }), {
    key: 'tracy-base/emdash-0.x',
    version
  })
c.eq(
  'S3 Tracy Base EmDash 0.4.0 needs 0.5.0',
  JSON.stringify(em('0.4.0')),
  JSON.stringify({ reason: 'TEMPLATE_NEEDS_UPDATE', need: '0.5.0', have: '0.4.0' })
)
c.eq('S3 Tracy Base EmDash 0.5.0', JSON.stringify(em('0.5.0')), JSON.stringify({ contract: 'emdash-base' }))
c.eq(
  'S3 ja_restaurant 1.0.3 (released by another line) needs the next release',
  JSON.stringify(at('ja_restaurant', 'quickstart/ja-restaurant/j6', '1.0.3')),
  JSON.stringify(
    REST_READY
      ? {
          reason: 'TEMPLATE_NEEDS_UPDATE',
          need: rest.minVersion?.['quickstart/ja-restaurant/j6'] ?? null,
          have: '1.0.3'
        }
      : { reason: 'TEMPLATE_NOT_READY' }
  )
)

// S4
const css = (id, name) => {
  const k = loadContract(name)
  const r = joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k), k)
  return 'refused' in r ? '' : r.html
}
const spotify = css('od:spotify', 'joomla-ja-essence')
c.check(
  'S4 ja-essence under Spotify: .btn-dark keeps #212529',
  /\.btn-dark\{[^}]*--color-dark:#212529/.test(spotify),
  spotify.slice(0, 200)
)
const duck = css('refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567', 'joomla-ja-restaurant')
c.check(
  'S4 ja-restaurant under MotherDuck: the accent box takes accent-on',
  duck.includes('.features-item.odd .features-item-inner{color:var(--ds-c-accent-on)}'),
  duck.slice(0, 200)
)
c.check(
  'S4 ja-restaurant under MotherDuck: tag chips take accent-on',
  duck.includes('.tags .label-info{color:var(--ds-c-accent-on)}'),
  duck.slice(0, 200)
)

// S5: the tch contract of ja-essence 1.0.5 is the PUBLISHED 1.0.5 (develop, #1013: template
// ja_essence 1.3.4), not the tokenized build this round measured under the same number — so the slot
// contract names no release yet (S2, S3)
const K = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6')
const m105 = JSON.parse(readFileSync(join(K, '1.0.5', 'manifest.json'), 'utf8'))
c.check(
  'S5 ja-essence 1.0.5 in tch is the published release, not the slot build',
  !JSON.stringify(m105).includes('tracy-ds-slot release-joomla.mjs'),
  m105.builtFrom ?? m105
)

// S6
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)
const hang = createServer(() => {}) // accepts, never answers
await new Promise((r) => hang.listen(0, '127.0.0.1', r))
const hangPort = hang.address().port
const page = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(
    `<!doctype html><p id="a">before</p><script src="http://127.0.0.1:${hangPort}/form.js"></script><p id="b">after</p>`
  )
})
await new Promise((r) => page.listen(0, '127.0.0.1', r))
const { browser } = await import(pathToFileURL(join(LIB, 'scripts/cdp.mjs')).href)
const br = await browser(9893, { block: [`*127.0.0.1:${hangPort}/*`] })
try {
  const t0 = Date.now()
  await br.open(`http://127.0.0.1:${page.address().port}/`, 800)
  const got = await br.evaluate(`({ after: !!document.getElementById('b'), ready: document.readyState })`)
  c.check('S6 a blocked hanging script: the page loads whole', got.after && got.ready === 'complete', got)
  c.check('S6 … at once (under 60 s)', Date.now() - t0 < 60000, Date.now() - t0)
} finally {
  br.close()
  hang.closeAllConnections?.()
  hang.close()
  page.close()
}
c.done()
