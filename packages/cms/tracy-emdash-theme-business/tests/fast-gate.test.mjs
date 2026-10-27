// F15: the Fast Gate must pick a SMALL, DETERMINISTIC set of cases from the contract of the project at
// hand — never a hard-coded "Home + a list + a detail", never EN/RU — and must say what each case stands
// for and what only the full gate will see. Its verdict must refuse a run whose machine is clean but
// whose reviewers still owe notes or pictures, and a run whose inputs moved since it was taken.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { affectedCases, assessFastGate, deriveShots, resolveFastGate } from '../tools/fast-gate.mjs'
import { contractHash, hash } from '../tools/qa-contract.mjs'
import { pageHash } from '../tools/visual-lib.mjs'

// ---- a fake template tree: views import components; Base + global.css are chrome every page carries ----
function tree(views, { components = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'fg-'))
  const write = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  write('src/styles/global.css', 'body{margin:0}')
  write('src/layouts/Base.astro', "---\nimport '../styles/global.css'\n---\n<slot/>")
  write('src/components/site/Header.astro', '<header/>')
  write('src/components/site/Footer.astro', '<footer/>')
  for (const [name, body] of Object.entries(components))
    write(`src/components/${name}.astro`, body ?? `<div class="${name}"/>`)
  for (const [view, imports] of Object.entries(views)) {
    const lines = [
      "import Base from '../layouts/Base.astro'",
      "import Header from '../components/site/Header.astro'",
      "import Footer from '../components/site/Footer.astro'"
    ]
    for (const c of imports) {
      if (!existsSync(path.join(root, `src/components/${c}.astro`)))
        write(`src/components/${c}.astro`, `<div class="${c}"/>`)
      lines.push(`import ${c.replace(/\W/g, '')} from '../components/${c}.astro'`)
    }
    write(`src/views/${view}.astro`, `---\n${lines.join('\n')}\n---\n<Base><Header/><slot/><Footer/></Base>`)
  }
  write(
    'seed/seed.json',
    JSON.stringify({
      content: { home: [{ title: 'x' }], posts: [{ title: 'a' }, { title: 'b' }] },
      settings: {},
      menus: {}
    })
  )
  return root
}
const STAGES = [
  { id: 'light-desktop', variants: ['1440-light'] },
  { id: 'light-responsive', variants: ['768-light', '390-light'] },
  { id: 'dark-desktop', variants: ['1440-dark'] },
  { id: 'dark-responsive', variants: ['768-dark', '390-dark'] }
]
const VARIANTS = [
  { id: '1440-light', width: 1440, height: 900, theme: 'light' },
  { id: '1440-dark', width: 1440, height: 900, theme: 'dark' },
  { id: '768-light', width: 768, height: 1024, theme: 'light' },
  { id: '768-dark', width: 768, height: 1024, theme: 'dark' },
  { id: '390-light', width: 390, height: 844, theme: 'light' },
  { id: '390-dark', width: 390, height: 844, theme: 'dark' }
]
/**
 * Contract from a shape: layouts = {Home: {path:'/', states, content}, News: {path:'/news'}, …}; locales
 * beyond the default get a counterpart page per layout with `text` per locale for the content check.
 */
function contract(
  layouts,
  { locales = ['en'], defaultLocale = 'en', texts = {}, fonts, source, visual = {} } = {}
) {
  const pages = []
  const layoutList = []
  for (const [id, spec] of Object.entries(layouts)) {
    const ids = []
    for (const locale of locales) {
      const pid = `${locale}-${id.toLowerCase()}`
      ids.push(pid)
      const prefix = locale === defaultLocale ? '' : `/${locale}`
      pages.push({
        id: pid,
        path: spec.path === '/' ? prefix || '/' : `${prefix}${spec.path}`,
        locale,
        status: spec.status ?? 200,
        identity: 'main h1',
        source: spec.source ?? [locale === defaultLocale ? `${id}.html` : `${locale}/${id}.html`],
        variants: VARIANTS.map((v) => v.id),
        render: { view: `src/views/${id}.astro`, collections: spec.collections ?? ['home'] },
        states: spec.states ?? ['default'],
        rules: [],
        layout: id,
        content: [
          {
            id: 'h1',
            selector: 'main h1',
            source: `${id}.html`,
            owner: 'field',
            binding: 'x',
            attribute: 'text',
            expected: texts[locale]?.[id] ?? `${id} title`
          }
        ]
      })
    }
    layoutList.push({
      id,
      view: `src/views/${id}.astro`,
      representative: `${defaultLocale}-${id.toLowerCase()}`,
      pages: ids,
      states: spec.states ?? ['default'],
      ...(spec.family ? { family: spec.family } : {})
    })
  }
  return {
    schemaVersion: 1,
    id: 'fg',
    revision: 1,
    pending: [],
    locales,
    defaultLocale,
    source: source ?? {
      reference: 'x',
      kind: 'html',
      parity: 'two-sided',
      files: locales.flatMap((l) =>
        Object.keys(layouts).map((id) => ({
          path: l === defaultLocale ? `${id}.html` : `${l}/${id}.html`,
          sha256: hash(l + id),
          disposition: 'converted'
        }))
      )
    },
    variants: VARIANTS,
    design: {
      theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' } },
      rules: []
    },
    interactions: { resources: { trigger: '#t', panel: '#p', link: '#p a', open: 'click' } },
    fonts: fonts ?? { allowed: Object.fromEntries(locales.map((l) => [l, ['Inter']])) },
    pages,
    layouts: layoutList,
    visual: {
      stages: STAGES,
      shots: [
        {
          stages: STAGES.map((s) => s.id),
          side: 'site',
          locales: [defaultLocale],
          consumers: ['layout', 'color']
        }
      ],
      ...visual
    }
  }
}
const SITE = {
  Home: { path: '/', states: ['default', 'resources'], imports: ['Hero', 'Cards', 'Stats'] },
  News: { path: '/news', imports: ['Cards', 'Pager'], collections: ['posts'], family: 'list' },
  Article: { path: '/news/a', imports: ['Prose', 'Toc'], collections: ['posts'], family: 'detail' },
  About: { path: '/about', imports: ['Stats', 'Prose'] },
  Terms: { path: '/terms', imports: [] },
  Privacy: { path: '/privacy', imports: [] },
  NotFound: { path: '/nope', status: 404, imports: ['SearchForm'] }
}
const site = (over = {}) => {
  const views = Object.fromEntries(Object.entries(SITE).map(([k, v]) => [k, v.imports]))
  return { root: tree(views), c: contract(SITE, over) }
}
const pagesOf = (plan) => plan.cases.map((x) => x.page).sort()

describe('F15 — fast gate resolver', () => {
  it('covers every shared component, every layout family, every interaction state, home and the 404 page — with the fewest representatives, deterministically', () => {
    const { root, c } = site()
    const plan = resolveFastGate(c, { root })
    assert.deepEqual(plan.errors, [])
    // Home (root path, resources state, Cards + Stats), Article (declared family `detail`, and Prose —
    // shared with About), News (declared family `list`), the 404 page. About adds nothing Home and
    // Article do not already cover; Terms/Privacy carry chrome only and declare no family.
    assert.deepEqual(pagesOf(plan), ['en-article', 'en-home', 'en-news', 'en-notfound'].sort())
    assert.deepEqual(resolveFastGate(c, { root }).cases, plan.cases, 'same input, same plan')
    const home = plan.cases.find((x) => x.page === 'en-home')
    assert.ok(home.why.includes('home') && home.why.includes('state:resources'))
    assert.deepEqual(
      home.stages,
      STAGES.map((s) => s.id),
      'every stage of the output is required'
    )
    assert.deepEqual(
      home.variants,
      VARIANTS.map((v) => v.id)
    )
    // shared = in ≥ 2 layouts but not in all of them: Cards (Home, News), Stats (Home, About), Prose (Article, About)
    assert.deepEqual(plan.coverage.components, { total: 3, covered: 3, uncovered: [] })
    assert.deepEqual(plan.coverage.states, { total: 1, covered: 1, uncovered: [] })
    assert.deepEqual(plan.coverage.families, { total: 2, covered: 2, uncovered: [] })
    // what the fast gate does NOT look at is said, not hidden
    assert.deepEqual(plan.fullOnly.layouts, ['About', 'Privacy', 'Terms'])
    assert.deepEqual(plan.fullOnly.pages.sort(), ['en-about', 'en-privacy', 'en-terms'])
    assert.ok(plan.ratio > 0 && plan.ratio < 1 && plan.nearFull === false, JSON.stringify(plan.ratio))
  })

  it('a one-page site without search or article: no 404 page is an error, with one the gate is honestly near the full gate', () => {
    const one = { Home: { path: '/', imports: ['Hero'] } }
    let c = contract(one)
    let plan = resolveFastGate(c, { root: tree({ Home: ['Hero'] }) })
    assert.ok(
      plan.errors.some((e) => /unknown-route/.test(e)),
      plan.errors.join('\n')
    )
    const two = { ...one, NotFound: { path: '/nope', status: 404, imports: [] } }
    c = contract(two)
    plan = resolveFastGate(c, { root: tree({ Home: ['Hero'], NotFound: [] }) })
    assert.deepEqual(plan.errors, [])
    assert.deepEqual(pagesOf(plan), ['en-home', 'en-notfound'])
    assert.equal(plan.ratio, 1)
    assert.equal(plan.nearFull, true)
    assert.ok(plan.notes.some((n) => /close to the full gate/.test(n)))
  })
  it('many independent layouts (nothing shared, every family declared) → the plan says it is near the full gate rather than dropping coverage', () => {
    const layouts = {
      Home: { path: '/', imports: ['Hero'], family: 'home' },
      A: { path: '/a', imports: ['A1'], family: 'a' },
      B: { path: '/b', imports: ['B1'], family: 'b' },
      C: { path: '/c', imports: ['C1'], family: 'c' },
      NotFound: { path: '/nope', status: 404, imports: [] }
    }
    const plan = resolveFastGate(contract(layouts), {
      root: tree(Object.fromEntries(Object.entries(layouts).map(([k, v]) => [k, v.imports])))
    })
    assert.deepEqual(plan.errors, [])
    assert.equal(plan.cases.length, 5)
    assert.equal(plan.nearFull, true)
    assert.deepEqual(plan.fullOnly.layouts, [])
  })
  it('a locale with a risk of its own (script, longer text, other fonts) adds the chosen pages on the narrowest variant of each stage; a Latin locale of the same length adds nothing', () => {
    const views = Object.fromEntries(Object.entries(SITE).map(([k, v]) => [k, v.imports]))
    const texts = { ru: Object.fromEntries(Object.keys(SITE).map((k) => [k, `${k} заголовок страницы`])) }
    let plan = resolveFastGate(contract(SITE, { locales: ['en', 'ru'], texts }), { root: tree(views) })
    assert.deepEqual(plan.errors, [])
    assert.deepEqual(plan.coverage.locales.risks, { ru: ['script:cyrillic', 'long-text:7/7'] })
    const ru = plan.cases.filter((c) => c.locale === 'ru')
    assert.deepEqual(ru.map((c) => c.page).sort(), ['ru-article', 'ru-home', 'ru-news', 'ru-notfound'])
    assert.deepEqual(
      ru[0].variants,
      ['1440-light', '390-light', '1440-dark', '390-dark'],
      'narrowest variant of every stage'
    )
    assert.deepEqual(
      ru[0].stages,
      STAGES.map((s) => s.id)
    )
    assert.ok(
      plan.notes.some((n) => /locale ru: measured only/.test(n)),
      'no picture consumer for ru → said out loud'
    )
    // fonts differ alone is a risk too
    plan = resolveFastGate(
      contract(SITE, {
        locales: ['en', 'fr'],
        fonts: { allowed: { en: ['Inter'], fr: ['Inter', 'Georgia'] } }
      }),
      { root: tree(views) }
    )
    assert.deepEqual(plan.coverage.locales.risks, { fr: ['fonts:differ'] })
    // Latin, same length, same fonts: nothing to add
    plan = resolveFastGate(contract(SITE, { locales: ['en', 'de'] }), { root: tree(views) })
    assert.deepEqual(plan.coverage.locales.risks, {})
    assert.ok(plan.cases.every((c) => c.locale === 'en'))
    assert.ok(plan.fullOnly.pages.includes('de-home'))
  })
  it('overrides are explicit, reasoned and validated: unknown ids and missing reasons fail; a drop that removes the only coverage fails; an add is honoured', () => {
    const { root, c } = site()
    const withFg = (fastGate) => ({ ...c, visual: { ...c.visual, fastGate } })
    let plan = resolveFastGate(
      withFg({ add: [{ layout: 'Nope', reason: 'x' }], drop: [{ layout: 'About' }] }),
      { root }
    )
    assert.ok(plan.errors.some((e) => /add\[0\]: unknown/.test(e)))
    assert.ok(plan.errors.some((e) => /drop\[0\]: reason required/.test(e)))
    plan = resolveFastGate(withFg({ drop: [{ layout: 'News', reason: 'list is slow to seed' }] }), { root })
    assert.ok(
      plan.errors.some((e) => /override-breaks-coverage: family:list/.test(e)),
      plan.errors.join('\n')
    )
    plan = resolveFastGate(
      withFg({ add: [{ page: 'en-about', reason: 'about carries the stats band Lee cares about' }] }),
      { root }
    )
    assert.deepEqual(plan.errors, [])
    assert.ok(pagesOf(plan).includes('en-about'))
    assert.ok(plan.cases.find((x) => x.page === 'en-about').why[0].startsWith('override:'))
  })
  it('the plan depends on the output, not on what the source offers: frames without a DOM, or no mobile reference, still yield every stage; html and canvas sources yield the same plan', () => {
    const views = Object.fromEntries(Object.entries(SITE).map(([k, v]) => [k, v.imports]))
    const html = resolveFastGate(
      contract(SITE, { source: { reference: 'x', kind: 'html', parity: 'two-sided', files: [] } }),
      { root: tree(views) }
    )
    const canvas = resolveFastGate(
      contract(SITE, { source: { reference: 'x', kind: 'canvas', parity: 'two-sided', files: [] } }),
      { root: tree(views) }
    )
    assert.deepEqual(html.cases, canvas.cases)
    // frames: desktop pictures only, no DOM to read — the responsive and dark stages are still required
    const frames = {
      reference: 'figma export',
      kind: 'frames',
      parity: 'declared',
      files: Object.keys(SITE).map((id) => ({
        path: `${id}-1440-light.png`,
        sha256: hash(id),
        disposition: 'reference'
      }))
    }
    const framed = Object.fromEntries(
      Object.entries(SITE).map(([k, v]) => [k, { ...v, source: [`${k}-1440-light.png`] }])
    )
    const plan = resolveFastGate(contract(framed, { source: frames }), { root: tree(views) })
    assert.deepEqual(plan.errors, [])
    assert.deepEqual(plan.coverage.stages, { total: 4, covered: 4, uncovered: [] })
    assert.ok(
      plan.cases.every((x) => x.stages.includes('light-responsive') && x.stages.includes('dark-responsive'))
    )
  })
  it('--changed: a shared component or a global input names the cases to rerun; a file of one layout names only that case', () => {
    const { root, c } = site()
    const plan = resolveFastGate(c, { root })
    assert.deepEqual(
      affectedCases(plan, c, ['src/components/Prose.astro'], { root }).map((x) => x.page),
      ['en-article']
    )
    assert.deepEqual(
      affectedCases(plan, c, ['src/components/Cards.astro'], { root }).map((x) => x.page),
      ['en-home', 'en-news']
    )
    assert.equal(affectedCases(plan, c, ['src/styles/global.css'], { root }).length, plan.cases.length)
    assert.equal(affectedCases(plan, c, ['docs/install.md'], { root }).length, 0)
  })
})

// ---- a fake `visual-qa.mjs --scope fast-gate` run: the files the verdict reads, nothing else ----
function fakeRun(
  root,
  c,
  plan,
  { notes = {}, machine = [], scope = 'fast-gate', measured = null, contractHashOver } = {}
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fg-run-'))
  mkdirSync(path.join(dir, 'notes'))
  const stages = c.visual.stages.map((s) => s.id)
  const pages = plan.cases.map((k) => {
    const spec = c.pages.find((p) => p.id === k.page)
    return {
      id: k.page,
      hash: pageHash(c, spec, { root }).hash,
      axes: (measured?.[k.page] ?? k.variants).map((variant) => ({ variant, findings: [] })),
      findings: []
    }
  })
  const shots = plan.cases.flatMap((k) =>
    k.variants.map((variant) => ({
      page: k.page,
      variant,
      stage: stages.find((id) => c.visual.stages.find((s) => s.id === id).variants.includes(variant)),
      file: `/shots/${k.page}--${variant}.png`,
      consumers: ['layout', 'color']
    }))
  )
  const write = (rel, obj) => writeFileSync(path.join(dir, rel), JSON.stringify(obj))
  write('visual.json', {
    scope: { kind: scope, plan },
    contractHash: contractHashOver ?? contractHash(c),
    site: 'http://127.0.0.1:1',
    at: '2026-09-14T10:00:00Z',
    stages: stages.map((id) => ({ id, status: 'pass' })),
    summary: { findings: machine.length },
    pages
  })
  write('index.json', { shots })
  write('notes/machine.json', machine)
  for (const id of stages)
    if (notes[id] !== false)
      write(`NOTES-${id}.json`, {
        counts: { open: 0, reopened: 0, lee: 0, leeFlagged: 0 },
        coverage: { missing: [] },
        lenses: ['layout', 'color'],
        todos: [],
        ...notes[id]
      })
  return dir
}

describe('F15 — fast gate verdict', () => {
  it('passes only a clean, merged, fully reviewed run whose inputs have not moved; a clean machine alone is not enough', () => {
    const { root, c } = site()
    const plan = resolveFastGate(c, { root })
    const ok = assessFastGate(fakeRun(root, c, plan), { contract: c, root })
    assert.deepEqual(ok.reasons, [])
    assert.equal(ok.status, 'pass')
    assert.equal(ok.scope, 'fast-gate')
    // a lens still owes a note
    let v = assessFastGate(
      fakeRun(root, c, plan, {
        notes: { 'dark-desktop': { counts: { open: 1, reopened: 0, lee: 0, leeFlagged: 0 } } }
      }),
      { contract: c, root }
    )
    assert.match(v.reasons.join(' '), /dark-desktop: 1 todo\(s\) open/)
    // a consumer never reported on a stage
    v = assessFastGate(fakeRun(root, c, plan, { notes: { 'light-desktop': { lenses: ['layout'] } } }), {
      contract: c,
      root
    })
    assert.match(v.reasons.join(' '), /light-desktop: lens color never reported/)
    // a picture with a consumer nobody opened
    v = assessFastGate(
      fakeRun(root, c, plan, {
        notes: { 'light-responsive': { coverage: { missing: [{ file: '/x', lens: 'layout' }] } } }
      }),
      { contract: c, root }
    )
    assert.match(v.reasons.join(' '), /light-responsive: 1 picture\(s\) not opened/)
    // notes never merged for a stage
    v = assessFastGate(fakeRun(root, c, plan, { notes: { 'dark-responsive': false } }), { contract: c, root })
    assert.match(v.reasons.join(' '), /dark-responsive: notes not merged/)
    // a note fixed but not closed by its lens
    v = assessFastGate(
      fakeRun(root, c, plan, { notes: { 'light-desktop': { todos: [{ id: 'N-abc', status: 'done' }] } } }),
      { contract: c, root }
    )
    assert.match(v.reasons.join(' '), /1 note\(s\) not closed/)
    // the machine still lists a finding
    v = assessFastGate(fakeRun(root, c, plan, { machine: [{ id: 'M1', stage: 'light-desktop' }] }), {
      contract: c,
      root
    })
    assert.match(v.reasons.join(' '), /machine finding/)
    // a planned case not measured on one of its axes
    v = assessFastGate(fakeRun(root, c, plan, { measured: { 'en-news': ['1440-light'] } }), {
      contract: c,
      root
    })
    assert.match(v.reasons.join(' '), /case en-news\/768-light: not measured/)
    // a targeted or full run is not a fast gate
    v = assessFastGate(fakeRun(root, c, plan, { scope: 'targeted-debug' }), { contract: c, root })
    assert.match(v.reasons.join(' '), /scope is targeted-debug, not fast-gate/)
  })
  it('is stale once a shared input moved: global CSS, a shared component, the seed of a rendered collection, the source reference, or the contract', () => {
    const { root, c } = site()
    const plan = resolveFastGate(c, { root })
    const run = fakeRun(root, c, plan)
    assert.equal(assessFastGate(run, { contract: c, root }).status, 'pass')
    // shared CSS → every page
    writeFileSync(path.join(root, 'src/styles/global.css'), 'body{margin:1px}')
    let v = assessFastGate(run, { contract: c, root })
    assert.match(v.reasons.join(' '), /stale: 4 page\(s\) changed/)
    writeFileSync(path.join(root, 'src/styles/global.css'), 'body{margin:0}')
    assert.equal(assessFastGate(run, { contract: c, root }).status, 'pass', 'restored → current again')
    // one shared component → the pages rendering it (Prose: Article; About is not in the plan)
    writeFileSync(path.join(root, 'src/components/Prose.astro'), '<div class="Prose changed"/>')
    v = assessFastGate(run, { contract: c, root })
    assert.deepEqual(v.stale, ['en-article'])
    writeFileSync(path.join(root, 'src/components/Prose.astro'), '<div class="Prose"/>')
    // seed of a rendered collection → the pages rendering it (posts: News, Article)
    const seedFile = path.join(root, 'seed/seed.json')
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'))
    writeFileSync(
      seedFile,
      JSON.stringify({ ...seed, content: { ...seed.content, posts: [{ title: 'changed' }] } })
    )
    v = assessFastGate(run, { contract: c, root })
    assert.deepEqual(v.stale, ['en-article', 'en-news'])
    writeFileSync(seedFile, JSON.stringify(seed))
    // the source reference of one page (its hash in source.files) → that page
    const c2 = structuredClone(c)
    c2.source.files.find((f) => f.path === 'News.html').sha256 = hash('new render of News')
    v = assessFastGate(run, { contract: c2, root })
    assert.ok(v.stale.includes('en-news') && !v.stale.includes('en-home'), JSON.stringify(v.stale))
    // the contract's criteria → the contract hash
    const c3 = { ...c, revision: 2 }
    v = assessFastGate(run, { contract: c3, root })
    assert.match(v.reasons.join(' '), /stale: the contract changed/)
  })
})

describe('F15 — fast-gate CLI', () => {
  it('plan prints the table and exits 2 on a contract that cannot support a fast gate; verdict writes FAST-GATE.json/.md and exits by status', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = async (args, cwd) => {
      try {
        const r = await promisify(execFile)(
          process.execPath,
          [path.resolve(path.dirname(new URL(import.meta.url).pathname), '../tools/fast-gate.mjs'), ...args],
          { cwd }
        )
        return { code: 0, out: r.stdout + r.stderr }
      } catch (e) {
        return { code: e.code, out: (e.stdout ?? '') + (e.stderr ?? '') }
      }
    }
    const { root, c } = site()
    writeFileSync(path.join(root, 'qa.contract.json'), JSON.stringify(c))
    let r = await run(['plan', '--contract', 'qa.contract.json', '--json', 'plan.json'], root)
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /# Fast Gate plan — 4 case\(s\)/)
    assert.match(r.out, /\| en-news \| News \| list \|/)
    assert.match(r.out, /Only at the full gate/)
    const plan = JSON.parse(readFileSync(path.join(root, 'plan.json'), 'utf8'))
    assert.equal(plan.cases.length, 4)
    r = await run(['plan', '--contract', 'qa.contract.json', '--changed', 'src/components/Cards.astro'], root)
    assert.deepEqual(JSON.parse(r.out).cases, ['en-home', 'en-news'])
    const broken = {
      ...c,
      visual: { ...c.visual, fastGate: { drop: [{ layout: 'Article', reason: 'too slow' }] } }
    }
    writeFileSync(path.join(root, 'qa.contract.json'), JSON.stringify(broken))
    r = await run(['plan', '--contract', 'qa.contract.json'], root)
    assert.equal(r.code, 2)
    assert.match(r.out, /override-breaks-coverage: family:detail/)
    writeFileSync(path.join(root, 'qa.contract.json'), JSON.stringify(c))
    const dir = fakeRun(root, c, plan)
    r = await run(['verdict', dir, '--contract', 'qa.contract.json'], root)
    assert.equal(r.code, 0, r.out)
    const v = JSON.parse(readFileSync(path.join(dir, 'FAST-GATE.json'), 'utf8'))
    assert.equal(v.status, 'pass')
    assert.match(readFileSync(path.join(dir, 'FAST-GATE.md'), 'utf8'), /Fast Gate verdict — PASS/)
    writeFileSync(path.join(root, 'src/styles/global.css'), 'body{margin:2px}')
    r = await run(['verdict', dir, '--contract', 'qa.contract.json'], root)
    assert.equal(r.code, 1)
    assert.match(r.out, /stale/)
  })
})

describe('F15 — shot rules derived from the contract, not copied from one project', () => {
  const rulesOf = (c) =>
    deriveShots(c).map(
      (r) =>
        `${r.side}:${r.locales.join('+')}:${r.stages.join('+')}:${(r.variants ?? []).join('+') || '*'}:${r.consumers.join('+')}`
    )
  it('default locale: site pictures on every stage with the lenses that stage needs, source pictures on the light stages when the locale has a source', () => {
    const c = contract(SITE)
    assert.deepEqual(rulesOf(c), [
      'site:en:light-desktop:*:layout+typography+color+images+interaction',
      'site:en:light-responsive:*:layout+typography+images',
      'site:en:dark-desktop:*:color+layout',
      'site:en:dark-responsive:*:layout+color',
      'source:en:light-desktop+light-responsive:*:layout+typography+images'
    ])
    assert.ok(
      deriveShots(c)
        .filter((r) => r.side === 'source')
        .every((r) => r.ownSourceOnly === true),
      'a layout without a canvas page of its own gets no source picture'
    )
  })
  it('a locale with a risk of its own gets site pictures on the narrowest variant of each stage for the typography lens, and its own source pictures beside them when the source has that locale; a Latin locale of the same length gets none', () => {
    const texts = { ru: Object.fromEntries(Object.keys(SITE).map((k) => [k, `${k} заголовок страницы`])) }
    let rules = rulesOf(contract(SITE, { locales: ['en', 'ru'], texts }))
    assert.ok(
      rules.includes('site:ru:light-responsive+dark-responsive:390-light+390-dark:typography'),
      rules.join('\n')
    )
    assert.ok(
      rules.includes('source:ru:light-responsive:390-light:typography'),
      'the Russian source at the same width, not the English one'
    )
    // RTL: the layout lens looks too
    const ar = { ar: Object.fromEntries(Object.keys(SITE).map((k) => [k, `${k} عنوان الصفحة`])) }
    rules = rulesOf(contract(SITE, { locales: ['en', 'ar'], texts: ar }))
    assert.ok(
      rules.includes('site:ar:light-responsive+dark-responsive:390-light+390-dark:typography+layout'),
      rules.join('\n')
    )
    // no risk → no extra picture, and no source picture either
    rules = rulesOf(contract(SITE, { locales: ['en', 'de'] }))
    assert.ok(
      rules.every((r) => !r.includes(':de:')),
      rules.join('\n')
    )
  })
  it('a locale whose pages have no source of their own gets site pictures but no source pictures; frames count as a source', () => {
    const texts = { ru: Object.fromEntries(Object.keys(SITE).map((k) => [k, `${k} заголовок`])) }
    const c = contract(SITE, { locales: ['en', 'ru'], texts })
    // the Russian pages point at the English source files (translation only, no Russian design)
    for (const p of c.pages) if (p.locale === 'ru') p.source = [`${p.layout}.html`]
    let rules = rulesOf(c)
    assert.ok(rules.includes('site:ru:light-responsive+dark-responsive:390-light+390-dark:typography'))
    assert.ok(!rules.some((r) => r.startsWith('source:ru')), 'no Russian source → no Russian source picture')
    const frames = {
      reference: 'x',
      kind: 'frames',
      parity: 'declared',
      files: Object.keys(SITE).map((id) => ({
        path: `${id}-390.png`,
        sha256: hash(id),
        disposition: 'reference'
      }))
    }
    const framed = Object.fromEntries(
      Object.entries(SITE).map(([k, v]) => [k, { ...v, source: [`${k}-390.png`] }])
    )
    rules = rulesOf(contract(framed, { source: frames }))
    assert.ok(rules.includes('source:en:light-desktop+light-responsive:*:layout+typography+images'))
  })
})
