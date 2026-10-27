/**
 * REG-PR-1134-ds-contracts-r3a: round 3 of the slot contracts (batch r3a, 11/10/2026) — five JA Joomla
 * j6 templates measured not ready (or with no release to wear it) in round 1: JA Resort, JA Symphony,
 * JA Vital, JA Company and JA Civica. Each ready one names the release that wears it (minVersion) and
 * its evidence; the others say what still fails.
 *   S1 the library's tests (paletteBands' ink role among them);
 *   S2 the contracts and the module sheets they make (JA Company's menu bar text on the accent, its
 *      still carousels; JA Civica's numbers band keeping the template's width);
 *   S3 tracy-web's door at each ready template's minVersion and the version before it;
 *   S4 the measuring probe: a one-colour gradient is that fill, a pseudo-element that draws nothing
 *      or is a small ornament is no picture, a positioned pseudo-element filling the box is the text's
 *      ground (flow.mjs source, run in a page-like scope).
 * No Docker, no network.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()
const EV = 'ds-contracts-r3a-2026-10-11'

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2: who is offered, from which release
const READY = {
  'ja-company': '1.0.1',
  'ja-civica': '1.0.1',
  'ja-vital': '1.0.3',
  'ja-symphony': '1.0.1',
  'ja-resort': '1.0.2'
}
const ALL = ['ja-resort', 'ja-symphony', 'ja-vital', 'ja-company', 'ja-civica']
const k = Object.fromEntries(ALL.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of ALL) {
  const ready = s in READY
  c.eq(`S2 ${s} offered`, k[s].ready === true, ready)
  c.check(
    `S2 ${s} every heading and text judged`,
    !!k[s].contrast?.heading && !!k[s].contrast?.text,
    k[s].contrast
  )
  if (ready) {
    c.eq(`S2 ${s} wears from`, k[s].minVersion?.[`quickstart/${s}/j6`], READY[s])
    c.check(`S2 ${s} names its evidence`, String(k[s].readyNote).includes(`${EV}/${s}-j6`), k[s].readyNote)
  } else c.check(`S2 ${s} says why not`, String(k[s].readyNote).startsWith('NOT offered yet'), k[s].readyNote)
}
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const sheet = (s) => joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, k[s]), k[s]).css ?? ''
const company = sheet('ja-company')
c.check(
  'S2 ja-company menu bar items take the accent text',
  /\.t3-mainnav \.navbar-nav\.level0 :is\(a, span\.separator\):not\(\.dropdown-menu \*\)[^{]*\{color:var\(--ds-c-accent-on\)\}/.test(
    company
  ),
  ''
)
c.check(
  'S2 ja-company hero keeps its size (no displaySize)',
  !k['ja-company'].selectors.displaySize,
  k['ja-company'].selectors
)
c.eq('S2 ja-company carousels measured still', k['ja-company'].measureStill, true)
c.check(
  'S2 ja-company slider arrows flow under a system',
  company.includes('.acm-features.style-1 .owl-controls{position:static}'),
  ''
)
c.check(
  'S2 ja-civica numbers band keeps its width',
  sheet('ja-civica').includes('div.cv-container:not(.acm-statistics .cv-container){max-width:'),
  ''
)

const symphony = sheet('ja-symphony')
c.check(
  'S2 ja-symphony content follows the page colour T4 writes as a literal',
  symphony.includes('.t4-content') && /\.t4-content[^{]*\{background-color:var\(--ds-c-bg\)\}/.test(symphony),
  ''
)
c.check(
  'S2 ja-symphony hero and header keep the template look',
  ['#t4-hero', '#t4-header'].every((s) => k['ja-symphony'].keepScopes.includes(s)),
  k['ja-symphony'].keepScopes
)

const resort = sheet('ja-resort')
c.check(
  'S2 ja-resort intro and rooms bands follow as ink bands',
  /\.t4-section-1:not\([^)]*\)\{background-color:var\(--ds-c-fg-2\);color:var\(--ds-c-bg\)\}/.test(resort) &&
    /\.t4-section-3:not\([^)]*\)\{background-color:var\(--ds-c-fg-2\);color:var\(--ds-c-bg\)\}/.test(resort),
  ''
)
c.check(
  'S2 ja-resort no longer keeps the T4 dark palette whole',
  !k['ja-resort'].keepScopes.includes('.t4-palette-dark') && k['ja-resort'].keepScopes.includes('#t4-header'),
  k['ja-resort'].keepScopes
)

// a re-release of a quickstart that has a tch contract carries the next one and its profile row
const profiles = JSON.parse(
  readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
).releases
for (const [s, v] of [
  ['ja-vital', '1.0.3'],
  ['ja-symphony', '1.0.1'],
  ['ja-resort', '1.0.2']
]) {
  const m = JSON.parse(
    readFileSync(
      join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts', s, 'j6', v, 'manifest.json'),
      'utf8'
    )
  )
  c.eq(`S2 ${s} tch contract ${v}`, m.id, `${s}/j6/${v}`)
  c.check(
    `S2 ${s} ${v} built from tokenized stylesheets`,
    /worn design system/.test(m.quickstart.builtFrom.change),
    m.quickstart.builtFrom
  )
  c.check(`S2 ${s} ${v} template-profiles row`, !!profiles[`quickstart/${s}/j6`]?.[v], '')
}

// S3: the door offers each ready one from its minVersion, and refuses the version before
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const before = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) - 1))
for (const [s, v] of Object.entries(READY)) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at ${v}`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: v })),
    JSON.stringify({ contract: `joomla-${s}` })
  )
  c.eq(
    `S3 ${s} at ${before(v)} needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: before(v) }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

// S4: the probe's ground rules, taken from flow.mjs's page source and run against fake styles
const flow = readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')
const line = (name) =>
  flow
    .split('\n')
    .find((l) => l.trimStart().startsWith(`const ${name} = `))
    ?.replace(/\\\\/g, '\\')
const { channels } = await imp('src/probe.mjs')
// the probe's own source, read from this repository, run with fake styles in place of the page's
const probe = (body, styles, rect) =>
  new Function(
    'getComputedStyle',
    'rgb',
    `const e = { getBoundingClientRect: () => (${JSON.stringify(rect)}) }; ${body}`
  )(
    (_e, p) =>
      styles[p ?? ''] ?? { backgroundImage: 'none', backgroundColor: 'rgba(0, 0, 0, 0)', content: 'none' },
    channels
  )
const ground = (styles, rect = { width: 100, height: 40 }) =>
  probe(
    `${line('drawn')}; ${line('pictured')}; ${line('flat')}; return { flat: flat(e), pictured: pictured(e) }`,
    styles,
    rect
  )
const one = ground({ '': { backgroundImage: 'linear-gradient(rgb(0, 113, 227), rgb(0, 113, 227))' } })
c.eq('S4 a one-colour gradient is its fill', JSON.stringify(one.flat?.slice(0, 3)), '[0,113,227]')
const two = ground({ '': { backgroundImage: 'linear-gradient(rgb(41, 78, 124), rgb(35, 66, 105))' } })
c.eq('S4 a two-colour gradient is a picture', two.flat, null)
const ornament = ground({
  '': { backgroundImage: 'none' },
  '::before': {
    backgroundImage: 'url("divi-menu.png")',
    content: '""',
    display: 'block',
    position: 'absolute',
    width: '2px',
    height: '32px'
  }
})
c.eq('S4 a 2 x 32 px divider is no picture', ornament.pictured, false)
const cover = ground({
  '': { backgroundImage: 'none' },
  '::before': {
    backgroundImage: 'url("photo.jpg")',
    content: '""',
    display: 'block',
    position: 'absolute',
    width: '100px',
    height: '40px'
  }
})
c.eq('S4 a covering ::before picture is a picture', cover.pictured, true)
const fill = (styles, rect = { width: 100, height: 40 }) =>
  // pfill has since read two more of the probe's helpers (masked: a masked ::before is no ground;
  // reaches: the ::before must reach the text) — taken from flow.mjs with it.
  probe(
    `${line('drawn')}; ${line('masked') ?? ''}; ${line('reaches') ?? ''}; ${line('pfill')}; return pfill(e)`,
    styles,
    rect
  )
const card = fill({
  '::before': {
    backgroundColor: 'rgb(26, 68, 68)',
    content: '""',
    display: 'block',
    position: 'absolute',
    width: '2000px',
    height: '40px'
  }
})
c.eq(
  'S4 a positioned ::before fill behind the text is its ground',
  JSON.stringify(card?.slice(0, 3)),
  '[26,68,68]'
)
const rule = fill({
  '::after': {
    backgroundColor: 'rgb(187, 190, 190)',
    content: '""',
    display: 'block',
    position: 'absolute',
    width: '80px',
    height: '4px'
  }
})
c.eq('S4 a 4 px underline ::after is no ground', rule, null)

c.done()
