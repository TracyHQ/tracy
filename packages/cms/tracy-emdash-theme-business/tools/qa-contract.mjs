#!/usr/bin/env node
// Validate conversion scope before collecting evidence. No CMS or browser dependencies.
//   node tools/qa-contract.mjs qa.contract.json [--source <design-folder>]
//   node tools/qa-contract.mjs init <design-folder> <new qa.contract.json> [--config template.config.json]
// `init` hashes the source inventory and copies identity/theme/review defaults from the template
// config; pages, rules and interactions stay unauthored (and `pending` non-empty) so the skeleton
// cannot validate until an agent has mapped every converted page.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`
export const contractHash = (contract) => hash(JSON.stringify(contract))
export const relativeFile = (p) =>
  typeof p === 'string' &&
  p.length > 0 &&
  !path.isAbsolute(p) &&
  !p.includes('\\') &&
  p.split('/').every((x) => x && x !== '.' && x !== '..')
export function filesUnder(root, prefix = '') {
  return readdirSync(path.join(root, prefix))
    .sort()
    .flatMap((name) => {
      const file = prefix ? `${prefix}/${name}` : name
      const stat = lstatSync(path.join(root, file))
      if (stat.isSymbolicLink()) throw new Error(`Symlink is not a distributable file: ${file}`)
      if (stat.isDirectory()) return filesUnder(root, file)
      if (!stat.isFile()) throw new Error(`Not a regular file: ${file}`)
      return [file]
    })
}
// Gates a person or agent must witness and sign with a receipt; everything else qa.mjs measures itself.
export const REVIEW_GATES = [
  'build',
  'security',
  'visual-review',
  'font-review',
  'viewing-contexts',
  'editability',
  'forms',
  'recovery',
  'clean-install',
  'independent'
]
const list = (v) => (Array.isArray(v) ? v : [])
const text = (v) => typeof v === 'string' && v.trim().length > 0
const digest = (v) => /^sha256:[a-f0-9]{64}$/.test(v ?? '')
export function casesFor(c) {
  return list(c.pages).flatMap((page) =>
    list(page.variants).flatMap((variant) =>
      list(page.states).map((state) => ({
        id: `${page.id}/${variant}/${state}`,
        page: page.id,
        variant,
        state
      }))
    )
  )
}
export function validateContract(c, sourceRoot) {
  const errors = []
  const check = (ok, issue) => {
    if (!ok) errors.push(issue)
  }
  const unique = (values, label) =>
    check(new Set(values).size === values.length, `${label}: duplicate values`)
  check(c?.schemaVersion === 1, 'schemaVersion must be 1')
  if (!c || typeof c !== 'object') return errors
  check(text(c.id), 'id is required')
  check(Number.isInteger(c.revision) && c.revision > 0, 'revision must be positive')
  check(Array.isArray(c.pending) && c.pending.length === 0, 'pending decisions must be resolved')
  check(list(c.locales).length > 0 && list(c.locales).every(text), 'locales are required')
  unique(list(c.locales), 'locales')
  check(list(c.locales).includes(c.defaultLocale), 'defaultLocale must be declared')
  const sourceFiles = list(c.source?.files)
  check(
    sourceFiles.length > 0 && text(c.source?.reference),
    'source reference and complete file inventory required'
  )
  unique(
    sourceFiles.map((f) => f.path),
    'source files'
  )
  for (const f of sourceFiles) {
    check(relativeFile(f.path) && digest(f.sha256), `invalid source file/hash: ${f.path}`)
    // `reference`: a frame, picture or spec sheet a page cites as its design reference without any page
    // being converted from it (source.kind frames, or a mobile frame next to an HTML source)
    check(
      ['converted', 'asset', 'excluded', 'reference'].includes(f.disposition),
      `source disposition: ${f.path}`
    )
    if (f.disposition === 'excluded') check(text(f.reason), `excluded source needs reason: ${f.path}`)
  }
  // What the source PROVIDES, declared apart from what the output must meet: kind says how it can be
  // read, parity says what the visual pass may compare against. Frames cannot be rendered, so two-sided
  // parity has nothing to read from them; design.parity pairs read a rendered source.
  const SOURCE_KINDS = ['html', 'canvas', 'url', 'frames'],
    PARITY = ['two-sided', 'declared', 'none']
  const sourceKind = c.source?.kind ?? 'html',
    sourceParity = c.source?.parity ?? 'two-sided'
  check(SOURCE_KINDS.includes(sourceKind), `source.kind must be one of ${SOURCE_KINDS.join(', ')}`)
  check(PARITY.includes(sourceParity), `source.parity must be one of ${PARITY.join(', ')}`)
  if (sourceKind === 'frames') {
    check(
      sourceParity !== 'two-sided',
      'source.kind frames requires source.parity declared (or none): frames cannot be rendered'
    )
    check(
      sourceFiles.some((f) => f.disposition === 'reference'),
      'source.kind frames needs at least one reference file'
    )
  }
  if (c.design?.parity !== undefined)
    check(
      sourceParity === 'two-sided',
      'design.parity needs source.parity two-sided (it reads a rendered source)'
    )
  const variants = list(c.variants),
    pages = list(c.pages),
    rules = list(c.design?.rules)
  check(
    variants.length > 0 && pages.length > 0 && rules.length > 0,
    'variants, pages and design rules must be nonempty'
  )
  for (const [label, values] of [
    ['variants', variants],
    ['pages', pages],
    ['rules', rules]
  ]) {
    unique(
      values.map((x) => x.id),
      label
    )
    check(
      values.every((x) => /^[a-zA-Z0-9_-]+$/.test(x.id ?? '')),
      `${label}: invalid id`
    )
  }
  for (const v of variants) {
    check(
      Number.isInteger(v.width) && v.width > 0 && Number.isInteger(v.height) && v.height > 0,
      `invalid viewport: ${v.id}`
    )
    check(text(v.theme), `theme required: ${v.id}`)
    check(['reduce', 'no-preference'].includes(v.reducedMotion), `reducedMotion required: ${v.id}`)
  }
  check(
    text(c.design?.theme?.selector) && text(c.design?.theme?.attribute),
    'theme observation hook required'
  )
  // An observed value may be null: "the attribute is absent" is a legitimate theme state.
  const themeValues = c.design?.theme?.values
  check(
    themeValues &&
      typeof themeValues === 'object' &&
      variants.every(
        (v) => v.theme in themeValues && (text(themeValues[v.theme]) || themeValues[v.theme] === null)
      ),
    'every theme needs an observed value'
  )
  const sourcePaths = new Set(sourceFiles.map((f) => f.path))
  const variantIds = new Set(variants.map((v) => v.id)),
    ruleIds = new Set(rules.map((r) => r.id))
  unique(
    pages.map((p) => p.path),
    'page paths'
  )
  for (const p of pages) {
    check(text(p.path) && p.path.startsWith('/') && !p.path.startsWith('//'), `invalid route: ${p.id}`)
    check(list(c.locales).includes(p.locale), `unknown locale: ${p.id}`)
    check(Number.isInteger(p.status) && p.status >= 200 && p.status <= 599, `status required: ${p.id}`)
    check(text(p.identity), `identity selector required: ${p.id}`)
    check(
      list(p.source).length > 0 && p.source.every((f) => sourcePaths.has(f)),
      `source mapping required: ${p.id}`
    )
    check(
      list(p.variants).length > 0 && p.variants.every((v) => variantIds.has(v)),
      `variant mapping: ${p.id}`
    )
    unique(list(p.variants), `${p.id} variants`)
    check(list(p.states).includes('default'), `default state required: ${p.id}`)
    unique(list(p.states), `${p.id} states`)
    for (const state of list(p.states))
      check(state === 'default' || c.interactions?.[state], `unknown state ${p.id}/${state}`)
    check(list(p.rules).length > 0 && p.rules.every((r) => ruleIds.has(r)), `design rules required: ${p.id}`)
    check(list(p.content).length > 0, `content mappings required: ${p.id}`)
    for (const field of list(p.content)) {
      check(
        text(field.id) && text(field.selector) && sourcePaths.has(field.source),
        `invalid content mapping: ${p.id}/${field.id}`
      )
      check(
        ['field', 'setting', 'derived', 'static'].includes(field.owner),
        `content owner required: ${p.id}/${field.id}`
      )
      check(text(field.binding), `CMS binding or static rationale required: ${p.id}/${field.id}`)
      check(
        ['text', 'href', 'src', 'alt'].includes(field.attribute),
        `content attribute: ${p.id}/${field.id}`
      )
      check(typeof field.expected === 'string', `expected content required: ${p.id}/${field.id}`)
    }
    unique(
      list(p.content).map((f) => f.id),
      `${p.id} content`
    )
  }
  for (const locale of list(c.locales))
    check(
      pages.some((p) => p.locale === locale),
      `locale has no pages: ${locale}`
    )
  for (const f of sourceFiles.filter((f) => f.disposition === 'converted'))
    check(
      pages.some((p) => list(p.source).includes(f.path)),
      `unmapped source: ${f.path}`
    )
  for (const r of rules) {
    check(text(r.selector) && text(r.source), `rule selector/source required: ${r.id}`)
    for (const v of variants.filter((v) =>
      pages.some((p) => list(p.rules).includes(r.id) && list(p.variants).includes(v.id))
    )) {
      const expected = r.styles?.[v.id]
      check(
        expected && Object.keys(expected).length > 0 && Object.values(expected).every(text),
        `measured styles missing: ${r.id}/${v.id}`
      )
    }
  }
  for (const [id, i] of Object.entries(c.interactions ?? {})) {
    check(text(i.trigger) && text(i.panel) && text(i.link), `interaction selectors missing: ${id}`)
    check(['click', 'hover'].includes(i.open), `interaction open method: ${id}`)
    if ('fullWidth' in i)
      check(typeof i.fullWidth === 'boolean', `interaction fullWidth must be boolean: ${id}`)
    if ('inner' in i || 'maxInnerWidth' in i)
      check(
        text(i.inner) && Number.isInteger(i.maxInnerWidth) && i.maxInnerWidth > 0,
        `interaction inner selector and integer maxInnerWidth go together: ${id}`
      )
  }
  for (const gate of REVIEW_GATES) {
    const policy = c.reviews?.[gate]
    check(policy && ['required', 'not-applicable'].includes(policy.mode), `review policy required: ${gate}`)
    if (policy?.mode === 'not-applicable') {
      check(gate === 'forms' && text(policy.reason), `only absent forms can be not-applicable: ${gate}`)
      check(!c.capabilities?.includes('forms'), 'forms cannot be excluded when capability is enabled')
    }
  }
  const dist = c.distribution
  check(
    list(dist?.include).length > 0 && dist.include.every(relativeFile),
    'distribution include paths required'
  )
  check(
    list(dist?.required).length > 0 && dist.required.every(relativeFile),
    'distribution required files required'
  )
  if (sourceRoot && errors.length === 0) {
    try {
      // Compare as sets: filesUnder() sorts per directory, so a directory and a file sharing a stem
      // (`blog/` and `blog.html`) come out in a different order than a global sort of the paths.
      const actual = filesUnder(sourceRoot).sort()
      check(
        JSON.stringify([...sourcePaths].sort()) === JSON.stringify(actual),
        'source file inventory changed'
      )
      for (const f of sourceFiles)
        check(
          hash(readFileSync(path.join(sourceRoot, f.path))) === f.sha256,
          `source hash changed: ${f.path}`
        )
    } catch (error) {
      errors.push(error.message)
    }
  }
  // Visual-review criteria (visual-qa.mjs). Optional blocks, but when present they must be complete:
  // a half-written coverage map or an exception without a decision would silently widen the gate.
  const isRegex = (v) => {
    if (!text(v)) return false
    try {
      new RegExp(v)
      return true
    } catch {
      return false
    }
  }
  for (const [i, g] of list(c.design?.coverage).entries()) {
    check(text(g?.selector), `design.coverage[${i}]: selector required`)
    check(
      list(g?.properties).length > 0 && g.properties.every(text),
      `design.coverage[${i}]: properties required`
    )
  }
  if (c.design?.parity !== undefined) {
    const par = c.design.parity
    const sels =
      par && typeof par.selectors === 'object' && !Array.isArray(par.selectors)
        ? Object.entries(par.selectors)
        : []
    check(sels.length > 0, 'design.parity.selectors must name at least one pair')
    check(list(par?.properties).length > 0 && par.properties.every(text), 'design.parity.properties required')
    const contentIds = new Set(pages.flatMap((p) => list(p.content).map((x) => x.id)))
    for (const [k, v] of sels) {
      const ok =
        text(v) ||
        (v &&
          typeof v === 'object' &&
          (text(v.content)
            ? contentIds.has(v.content)
            : text(v.site) && (text(v.source) || text(v.source?.css) || text(v.source?.text))))
      check(ok, `design.parity.selectors.${k}: a CSS string, {site, source} or {content: <known content id>}`)
    }
    for (const t of ['hexTolerance', 'pxTolerance'])
      if (par?.[t] !== undefined)
        check(Number.isFinite(par[t]) && par[t] >= 0, `design.parity.${t} must be a non-negative number`)
  }
  for (const [i, x] of list(c.design?.exceptions).entries()) {
    check(text(x?.kind), `design.exceptions[${i}]: kind required`)
    check(isRegex(x?.match ?? x?.selector), `design.exceptions[${i}]: match must be a valid regex`)
    check(
      text(x?.reason) && text(x?.decision),
      `design.exceptions[${i}]: reason and a cited decision are both required`
    )
  }
  // pages[].images narrows the picture census: 'placeholders' (count is data-driven) or absent (count parity).
  for (const p of list(c.pages))
    check(
      p?.images === undefined || p.images === 'placeholders',
      `pages[${p?.id}].images must be 'placeholders' or absent`
    )
  // visual.stages: an ordered partition of the variants — each variant in exactly one stage, ids unique.
  // A stage is measured only after the previous one is clean, so the order is part of the criteria.
  if (c.visual !== undefined) {
    const stages = list(c.visual?.stages)
    check(stages.length > 0, 'visual.stages must name at least one stage')
    const ids = new Set(),
      seen = new Set()
    for (const [i, st] of stages.entries()) {
      check(text(st?.id) && !ids.has(st.id), `visual.stages[${i}]: unique id required`)
      ids.add(st?.id)
      check(list(st?.variants).length > 0, `visual.stages[${i}]: variants required`)
      for (const v of list(st?.variants)) {
        check(
          list(c.variants).some((x) => x?.id === v),
          `visual.stages[${st?.id}]: unknown variant ${v}`
        )
        check(!seen.has(v), `visual.stages: variant ${v} appears in two stages`)
        seen.add(v)
      }
    }
    for (const v of list(c.variants))
      check(seen.has(v?.id), `visual.stages: variant ${v?.id} belongs to no stage`)
    for (const [i, r] of list(c.visual?.renderInputs).entries())
      check(text(r), `visual.renderInputs[${i}] must be a path or dir/**`)
    for (const p of list(c.pages))
      if (p?.render !== undefined) {
        check(text(p.render?.view), `pages[${p?.id}].render.view required`)
        check(
          list(p.render?.collections).every(text),
          `pages[${p?.id}].render.collections must be collection slugs`
        )
      }
    // visual.shots: every picture names who consumes it (no consumer, no picture); stages and
    // variants must exist; a shot rule with `variants` must stay inside its stages' variants.
    const LENSES = ['layout', 'typography', 'color', 'images', 'interaction']
    const stageVariants = Object.fromEntries(stages.map((st) => [st?.id, list(st?.variants)]))
    for (const [i, sh] of list(c.visual?.shots).entries()) {
      check(
        list(sh?.stages).length > 0 && sh.stages.every((id) => ids.has(id)),
        `visual.shots[${i}]: stages must name known stages`
      )
      check(['site', 'source'].includes(sh?.side), `visual.shots[${i}]: side must be site or source`)
      check(
        list(sh?.locales).length > 0 && sh.locales.every((l) => list(c.locales).includes(l)),
        `visual.shots[${i}]: locales must be contract locales`
      )
      check(
        list(sh?.consumers).length > 0 && sh.consumers.every((x) => LENSES.includes(x)),
        `visual.shots[${i}]: consumers must be QA lenses (${LENSES.join(', ')})`
      )
      for (const v of list(sh?.variants))
        check(
          list(sh?.stages).some((id) => (stageVariants[id] ?? []).includes(v)),
          `visual.shots[${i}]: variant ${v} is not in its stages`
        )
    }
  }
  // layouts: what the eyes look at — each names a representative page that exists, and every page
  // belongs to exactly one layout (pages[].layout).
  if (c.layouts !== undefined) {
    const pageIds = new Set(list(c.pages).map((p) => p?.id))
    const seenPages = new Set()
    const layoutIds = new Set()
    for (const [i, l] of list(c.layouts).entries()) {
      check(text(l?.id) && !layoutIds.has(l.id), `layouts[${i}]: unique id required`)
      layoutIds.add(l?.id)
      check(pageIds.has(l?.representative), `layouts[${l?.id}]: representative must be a page id`)
      check(
        list(l?.pages).includes(l?.representative),
        `layouts[${l?.id}]: representative must be one of its pages`
      )
      check(
        l?.hasSource === undefined || typeof l.hasSource === 'boolean',
        `layouts[${l?.id}].hasSource must be boolean`
      )
      for (const pid of list(l?.pages)) {
        check(
          pageIds.has(pid) && !seenPages.has(pid),
          `layouts[${l?.id}]: page ${pid} unknown or in two layouts`
        )
        seenPages.add(pid)
      }
    }
    for (const p of list(c.pages)) {
      check(seenPages.has(p?.id), `layouts: page ${p?.id} belongs to no layout`)
      check(p?.layout === undefined || layoutIds.has(p.layout), `pages[${p?.id}].layout must be a layout id`)
    }
    for (const l of list(c.layouts))
      check(l?.family === undefined || text(l.family), `layouts[${l?.id}].family must be a non-empty string`)
    // visual.fastGate overrides (fast-gate.mjs): every add/drop names a page or layout that exists and
    // carries a reason — the resolver decides whether a drop still leaves everything covered.
    const fg = c.visual?.fastGate
    if (fg !== undefined) {
      for (const [i, o] of list(fg?.add).entries()) {
        check(
          (text(o?.page) && pageIds.has(o.page)) || (text(o?.layout) && layoutIds.has(o.layout)),
          `visual.fastGate.add[${i}]: unknown page or layout ${o?.page ?? o?.layout}`
        )
        check(text(o?.reason), `visual.fastGate.add[${i}]: reason required`)
      }
      for (const [i, o] of list(fg?.drop).entries()) {
        check(
          text(o?.layout) && layoutIds.has(o.layout),
          `visual.fastGate.drop[${i}]: unknown layout ${o?.layout}`
        )
        check(text(o?.reason), `visual.fastGate.drop[${i}]: reason required`)
      }
    }
  } else check(c.visual?.fastGate === undefined, 'visual.fastGate needs layouts[]')
  // designSystem: the sets the off-system scanner reads; colour strings must be normalised rgb()/rgba().
  if (c.designSystem !== undefined) {
    const ds = c.designSystem
    const RGB = /^rgba?\(\d+, \d+, \d+(, (0|0?\.\d+|1))?\)$/
    for (const theme of ['light', 'dark'])
      check(
        list(ds.colors?.[theme]).length > 0 && ds.colors[theme].every((v) => RGB.test(v)),
        `designSystem.colors.${theme}: non-empty list of rgb()/rgba() strings`
      )
    check(
      list(ds.colorsAlways).every((v) => RGB.test(v)),
      'designSystem.colorsAlways: rgb()/rgba() strings'
    )
    check(
      list(ds.type?.sizes).every((v) => /^\d+(\.\d+)?px$/.test(v)),
      'designSystem.type.sizes: px strings'
    )
    check(
      list(ds.type?.ranges).every(
        (r) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] <= r[1]
      ),
      'designSystem.type.ranges: [min, max] px pairs'
    )
    check(
      list(ds.radius).every((v) => v === 'full' || /^\d+(\.\d+)?px$/.test(v)),
      "designSystem.radius: px strings or 'full'"
    )
    check(
      text(ds.check?.scope) && list(ds.check?.colors).every(text),
      'designSystem.check needs scope and property lists'
    )
  }
  return errors
}

const CONVERTED = /\.html?$/i
export function initContract(sourceRoot, config = {}) {
  const files = filesUnder(sourceRoot).map((p) => ({
    path: p,
    sha256: hash(readFileSync(path.join(sourceRoot, p))),
    disposition: CONVERTED.test(p) ? 'converted' : 'asset'
  }))
  const locales = list(config.locales).length ? config.locales : ['en']
  const theme = config.qa?.theme ?? {
    selector: 'html',
    attribute: 'data-theme',
    values: { light: null, dark: 'dark' }
  }
  const reviews = Object.fromEntries(REVIEW_GATES.map((g) => [g, { mode: 'required' }]))
  if (!list(config.forms?.bindings).length)
    reviews.forms = { mode: 'not-applicable', reason: 'template.config.json declares no form binding' }
  return {
    schemaVersion: 1,
    id: config.id ?? path.basename(path.resolve(sourceRoot)),
    revision: 1,
    pending: [
      'Map every converted source page under `pages` (content, rules, states); measure `design.rules` per variant; declare `interactions`; then empty this list'
    ],
    locales,
    defaultLocale: locales.includes(config.defaultLocale) ? config.defaultLocale : locales[0],
    source: { reference: path.relative(process.cwd(), sourceRoot) || '.', files },
    // 1440 (the canvas width), 768, 390. 1280 was dropped 2026-09-14: the design is drawn at 1440 and
    // no finding ever appeared at 1280 alone; every axis costs a picture someone has to look at.
    variants: [1440, 768, 390].flatMap((width) =>
      Object.keys(theme.values).map((t) => ({
        id: `${width}-${t}`,
        width,
        height: { 1440: 1000, 768: 1024, 390: 844 }[width],
        theme: t,
        reducedMotion: 'reduce'
      }))
    ),
    design: { theme, rules: [] },
    interactions: {},
    fonts: { selectors: ['h1', 'h2', 'p', 'a', 'button', 'input'] },
    pages: [],
    reviews,
    capabilities: list(config.forms?.bindings).length ? ['i18n', 'forms'] : ['i18n'],
    distribution: {
      include: [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'template.config.json',
        'astro.config.mjs',
        'tsconfig.json',
        'components.json',
        'public',
        'seed',
        'src',
        'tools',
        'tests',
        'docs',
        'README.md',
        'AGENTS.md',
        'PROVENANCE.md',
        'artifact.json',
        '.env.example'
      ],
      required: ['public/favicon.svg', 'seed/seed.json', 'seed/media-map.json']
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const opt = (name) => {
      const i = args.indexOf(name)
      return i < 0 ? undefined : args[i + 1]
    }
    if (args[0] === 'init') {
      const [, source, out] = args
      if (!source || !out)
        throw new Error(
          'usage: qa-contract.mjs init <design-folder> <new qa.contract.json> [--config template.config.json]'
        )
      if (existsSync(out))
        throw new Error(`Refusing to overwrite ${out}; delete it first if it is really unauthored`)
      const config = opt('--config') ? JSON.parse(readFileSync(opt('--config'), 'utf8')) : {}
      const c = initContract(source, config)
      writeFileSync(out, JSON.stringify(c, null, 2) + '\n')
      console.log(
        JSON.stringify(
          {
            status: 'skeleton',
            out,
            files: c.source.files.length,
            converted: c.source.files.filter((f) => f.disposition === 'converted').length,
            pending: c.pending
          },
          null,
          2
        )
      )
      process.exitCode = 0
    } else {
      if (!args[0])
        throw new Error(
          'usage: qa-contract.mjs <qa.contract.json> [--source <design-folder>] | init <design-folder> <out.json> [--config f]'
        )
      const c = JSON.parse(readFileSync(args[0], 'utf8'))
      const errors = validateContract(c, opt('--source'))
      console.log(
        JSON.stringify(
          {
            status: errors.length ? 'fail' : 'pass',
            contractHash: contractHash(c),
            cases: casesFor(c).length,
            errors
          },
          null,
          2
        )
      )
      process.exitCode = errors.length ? 1 : 0
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
