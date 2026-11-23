/**
 * REG-PR-741-emdash-fresco-road-precheck: JA Fresco 0.1.0 clears the Road to live pre-check. One `ok -`/`not ok -` line per
 * `expect` of the case: S1 the package's own pins of the pre-check findings (LANG-2 derivation, PAGE-5, ABOUT-2, DEF-1, TEXT-1,
 * CON-1/CON-2, FORM-1, IDENT-2), S2 no `#` link field in the seed, S3 no `--ds-c-*` role outside what the slot defines in
 * the stylesheets, S4 the slot contract declares its theme toggle selector, S5 the kit json agrees with the content map and
 * keeps its approval on the approved image set (and, when TRACY_RELEASE_DIR names a release folder, is the json inside its kit zip).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT } from './lib.mjs'

const PKG = 'packages/cms/tracy-emdash-theme-fresco'
const c = checks()
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

// S1: the package's pins, each named so a deleted or renamed test turns this red.
const t = nodeTest(['tests/road-precheck.test.mjs'], { cwd: join(ROOT, PKG) })
if (Array.isArray(t.passed)) c.tapClean('S1 road-precheck tests', t)
else c.check('S1 the package has tests/road-precheck.test.mjs', false, t.output)
for (const name of Array.isArray(t.passed)
  ? [
      'PAGE-5: no link field',
      'LANG-2: personalize labels names',
      'LANG-2: every interface word the components print',
      'LANG-2: every text a component prints',
      'LANG-2: the derivation finds what is missing',
      'ABOUT-2: every keptText id',
      'PAGE-8: the Blog page is covered',
      'DEF-1 and TEXT-1:',
      'CON-1, CON-2, ICON-1, BORDER-1:',
      'FORM-1: the contact and search fields',
      'IDENT-2: under a system'
    ]
  : [])
  c.passes('S1', t, name)

// S2: a link field that is `#` is a dead link the pre-check (PAGE-5) refuses.
const hashLinks = (value, found = []) => {
  if (Array.isArray(value)) for (const v of value) hashLinks(v, found)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (k === 'link' && v === '#') found.push(k)
      else hashLinks(v, found)
    }
  return found
}
for (const file of ['seed/site-model.json', 'seed/seed.json'])
  c.eq(`S2 ${file}: link fields that are #`, hashLinks(json(`${PKG}/${file}`)).length, 0)

// S3: every `var(--ds-c-<role>` of the stylesheets is a role the slot defines (DEF-1).
const slot = (file) => import(pathToFileURL(join(ROOT, 'packages/design/tracy-ds-slot/src', file)).href)
const { COLOUR_TOKENS } = await slot('tokens56.mjs')
const { ROLE_VARIABLES } = await slot('role-variables.mjs')
const roles = new Set([
  ...COLOUR_TOKENS,
  'accent-text',
  'accent-text-hover',
  ...ROLE_VARIABLES.filter((r) => r.kind === 'color').map((r) => String(r.name).replace(/^--ds-c-/, ''))
])
const sheets = []
const walk = (dir) => {
  for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (f.isDirectory()) walk(join(dir, f.name))
    else if (f.name.endsWith('.css'))
      sheets.push([join(dir, f.name), readFileSync(join(ROOT, dir, f.name), 'utf8')])
  }
}
walk(`${PKG}/src/styles`)
const unknownRoles = new Set()
for (const [file, css] of sheets)
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/var\(\s*--ds-c-([\w-]+)/g))
    if (!roles.has(m[1])) unknownRoles.add(`--ds-c-${m[1]} (${file})`)
c.eq('S3 stylesheets: roles no system defines', [...unknownRoles].join(', '), '')
c.check(
  'S3 stylesheets: --ds-c-ink-raised is gone',
  !sheets.some(([, css]) => css.includes('--ds-c-ink-raised'))
)

// S4: the slot contract names the template's theme toggle, so MODE-2 reads "not applicable" for a template without one.
const slotContract = json('packages/design/tracy-ds-slot/templates/emdash-tracy-fresco.json')
c.check(
  'S4 slot contract: selectors.themeToggle is declared',
  typeof slotContract.selectors?.themeToggle === 'string' && slotContract.selectors.themeToggle !== '',
  slotContract.selectors
)

// S5: the kit json beside the contract. Every slot of the content map has a type that fits its sample, the kit names only
// slots of the content map, and its approval is the person's on the approved image set.
const map = json(`${PKG}/contracts/0.1.0/content-map.json`)
const kitText = readFileSync(join(ROOT, `${PKG}/contracts/0.1.0/template-kit.json`), 'utf8')
const kit = JSON.parse(kitText)
const slots = []
const collect = (x) => {
  if (Array.isArray(x)) x.forEach(collect)
  else if (x && typeof x === 'object') {
    if (typeof x.key === 'string' && typeof x.type === 'string' && x.target) slots.push(x)
    Object.values(x).forEach(collect)
  }
}
collect(map)
const keys = new Set(slots.map((s) => s.key))
const urlLike = (v) => /^(\/|https?:|tel:|mailto:|#)/.test(v)
const misfit = slots
  .filter(
    (s) =>
      typeof s.sample === 'string' &&
      s.sample !== '' &&
      (s.type === 'url') !== urlLike(s.sample) &&
      ['url', 'text'].includes(s.type)
  )
  .map((s) => `${s.key} (${s.type}, "${s.sample.slice(0, 20)}")`)
c.eq('S5 content map: slots whose type does not fit their sample', misfit.join('; '), '')
const kitIds = new Set(
  [
    ...kitText.matchAll(/"(?:slot|urlSlot|labelSlot|labelId)": "([a-z_]+\.[a-z0-9-]+\.[a-z0-9_.\[\]-]+)"/g)
  ].map((m) => m[1])
)
const stale = [...kitIds].filter(
  (id) =>
    !keys.has(id) &&
    keys.has(id.replace(/\.[^.]+$/, '')) === false &&
    /^(chrome|contact|hero|features_intro|menu|gallery|testimonials|teams|happyhours|book_table|masthead)\./.test(
      id
    )
)
c.eq('S5 kit: slot ids the content map does not hold', stale.join(', '), '')
c.eq('S5 kit: approval by', kit.approval?.by, 'hano-xbt')
c.eq(
  'S5 kit: approval imagesSha256',
  kit.approval?.imagesSha256,
  'aa181ec3ba6d80067b4a2a93eb7ddf85e913bbdc063fa52c5924b8b7b2bef703'
)
c.eq('S5 kit: approval is on the image set the kit lists', kit.approval?.imagesSha256, kit.imagesSha256)
c.eq('S5 kit: the 16 EmDash-inherent errors', kit.errors?.length, 16)
if (process.env.TRACY_RELEASE_DIR) {
  const zip = join(process.env.TRACY_RELEASE_DIR, 'template-kit-tracy-fresco-0.1.0.zip')
  if (existsSync(zip)) {
    const r = spawnSync('unzip', ['-p', zip, 'template-kit.json'], { maxBuffer: 256 * 1024 * 1024 })
    c.eq(
      'S5 release kit zip: its template-kit.json is the contract file (sha256)',
      createHash('sha256')
        .update(r.stdout ?? Buffer.alloc(0))
        .digest('hex'),
      createHash('sha256').update(kitText).digest('hex')
    )
  }
}
c.done()
