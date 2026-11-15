// What a build writes besides the blocks (ticket #597), declared by the mapping file so the write step never guesses.
// Pure. Called by `mappingProblems` (`ai-quickstart-mapping.mjs`) with the block store and the page recipes.
//   - `look.accent`: where the accent colour is written (the door) and how (`ACCENT_*`);
//   - `pages.<page type>`: for every page type of the recipes exactly one of
//       `menuItem: {link, templateStyle, params, parent?, home?, why}` the menu item of the page,
//       `under: {page, address, why}` with `ownItem` (a menuItem shape): an item page reached under its list page,
//       `unbuilt: {code, why}` a page type the write step cannot make;
//     and `record: {kind, category, base, why}` for the record a page creates (an article page, the contact page);
//     a link names what the build makes with `{record}`, `{category}`, `{category:<type>}`, `{page:<type>}` and a
//     kept record of the blank site with `{entity:<key>}`;
//   - every recipe's main block shows data the plan can give (a field of a kind that is not `editorial.*`): the plan
//     gate drops a page whose main block has none;
//   - the menu items of a menu block (`placements.<id>.menu.items`), the container copies (`holds.copies`), the row a
//     page type keys (`keyedRow`), a fact place not written by decision (`notWritten`) and the featured article
//     (`seo.featuredView.article`). The frames of created records: `ai-quickstart-frames.mjs`.
import { ASSIGN } from './ai-quickstart-placement.mjs'
import { framesProblems } from './ai-quickstart-frames.mjs'

export const MENU_ITEMS_FROM = Object.freeze(['main-menu', 'pages'])
export const MENU_ITEMS_ORDER = Object.freeze(['main-menu', 'plan'])
export const RECORD_KINDS = Object.freeze(['article', 'contact'])
const PLACEHOLDER = /\{([^}]*)\}/g
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])

function lookProblems(look, report) {
  const a = look?.accent
  if (!isObject(a)) return report('look.accent', 'declare where the accent colour is written: look.accent')
  if (!each(a.variables).length || !a.variables.every((v) => /^--[\w-]+$/.test(v)))
    report('look.accent.variables', 'the template variables the accent sets, each "--name"')
  if (a.value !== '#rrggbb') report('look.accent.value', 'the value format: "#rrggbb"')
  const s = a.sides
  if (!isObject(s) || !['light', 'dark'].includes(s.opensOn) || !isName(s.light) || !isName(s.dark))
    report(
      'look.accent.sides',
      'sides is {opensOn: light | dark, light, dark, darkHook?}: the marks of each side'
    )
  const w = a.writtenAs
  if (!isObject(w) || w.kind !== 'module' || ![w.module, w.title, w.position, w.content].every(isName))
    report(
      'look.accent.writtenAs',
      'writtenAs is {kind: "module", module, title, position, style?, assign, content}'
    )
  else if (!ASSIGN.includes(w.assign))
    report('look.accent.writtenAs.assign', `assign is one of ${ASSIGN.join(', ')}`)
  if (!isName(a.keeps) || !isName(a.why)) report('look.accent', 'say what the accent keeps (keeps) and why')
}

function linkProblems(link, at, ctx) {
  if (!isName(link) || !link.startsWith('index.php?')) return ctx.report(at, 'a link is "index.php?..."')
  for (const [, name] of link.matchAll(PLACEHOLDER)) {
    const [kind, ref] = name.split(':')
    const ok =
      name === 'record' ||
      name === 'category' ||
      (kind === 'page' && ctx.types.has(ref)) ||
      (kind === 'category' && isObject(ctx.pages[ref]?.record?.category)) ||
      // A kept record of the blank site: checked against the blank site contract by scripts/ai-quickstart/check.mjs.
      (kind === 'entity' && (ctx.kept.has(ref) || /^[a-zA-Z]+-\d+$/.test(String(ref))))
    if (!ok)
      ctx.report(
        at,
        `{${name}}: a placeholder names the record, a page type, a category it creates or a kept record`
      )
  }
}

function menuItemProblems(item, at, ctx) {
  if (!isObject(item))
    return ctx.report(at, 'a menu item is {link, templateStyle, params, parent?, home?, why}')
  linkProblems(item.link, `${at}.link`, ctx)
  const style = String(item.templateStyle)
  if (item.templateStyle !== 0 && !/^templateStyle-\d+$/.test(style) && ctx.styles?.has(style) !== true)
    ctx.report(`${at}.templateStyle`, 'templateStyle is 0 (the default style) or a templateStyle entity key')
  if (!isObject(item.params)) ctx.report(`${at}.params`, 'the params the menu item is written with')
  if (item.parent !== undefined && !ctx.types.has(item.parent))
    ctx.report(`${at}.parent`, 'parent names a page type of the recipes')
  if (!isName(item.why)) ctx.report(`${at}.why`, 'say where the menu item comes from (measured how)')
}

function recordProblems(rec, at, ctx) {
  if (!isObject(rec) || !RECORD_KINDS.includes(rec.kind) || !isObject(rec.base) || !isName(rec.why))
    return ctx.report(at, `a record is {kind: ${RECORD_KINDS.join(' | ')}, category, base, why}`)
  const c = rec.category
  if (
    !isObject(c) ||
    !isName(c.extension) ||
    c.parent !== 'root' ||
    !isName(c.title?.from) ||
    !isObject(c.params) ||
    !isName(c.why)
  )
    ctx.report(`${at}.category`, 'category is {extension, parent: "root", title: {from}, params, why}')
}

function pagesProblems(mapping, ctx) {
  const pages = isObject(mapping.pages) ? mapping.pages : {}
  if (!isObject(mapping.pages))
    ctx.report('pages', 'pages declares the page of every page type of the recipes')
  const inner = { ...ctx, pages }
  for (const type of ctx.types) {
    const p = pages[type]
    const at = `pages.${type}`
    const ways = ['menuItem', 'under', 'unbuilt'].filter((k) => p?.[k] !== undefined)
    if (ways.length !== 1) {
      ctx.report(at, 'a page type has one of menuItem, under (an item page), unbuilt')
      continue
    }
    if (p.unbuilt) {
      if (!isName(p.unbuilt.code) || !isName(p.unbuilt.why))
        ctx.report(`${at}.unbuilt`, 'unbuilt is {code, why}')
      continue
    }
    if (p.menuItem) menuItemProblems(p.menuItem, `${at}.menuItem`, inner)
    if (p.under) {
      const u = p.under
      if (!isObject(pages[u.page]?.menuItem) || !isName(u.why))
        ctx.report(`${at}.under`, 'under is {page: a page type with a menu item, address, why}')
      else if (!String(u.address).includes('{record}') || !String(u.address).includes(`{page:${u.page}}`))
        ctx.report(`${at}.under.address`, `the address names the record and the list page {page:${u.page}}`)
      else linkProblems(u.address, `${at}.under.address`, inner)
      menuItemProblems(p.ownItem, `${at}.ownItem`, inner)
    }
    const needsRecord = ctx.recordTypes.has(type)
    if (needsRecord || p.record !== undefined) recordProblems(p.record, `${at}.record`, inner)
    if (p.under && !needsRecord)
      ctx.report(`${at}.under`, 'only an article page is reached under a list page')
  }
  for (const type of Object.keys(pages))
    if (!ctx.types.has(type)) ctx.report(`pages.${type}`, 'no recipe has this page type')
}

function mainBlockProblems(ctx) {
  for (const r of ctx.recipes) {
    const b = ctx.byId.get(r.mainBlock)
    if (!b || ctx.unbuilt.has(r.pageType)) continue
    const fields = [
      ...each(b.fields),
      ...each(b.itemFields),
      ...[...each(b.lists), ...each(b.itemLists)].flatMap((l) => each(l.fields))
    ]
    if (!fields.some((f) => isName(f?.kind) && !f.kind.startsWith('editorial.')))
      ctx.report(
        `pages.${r.pageType}`,
        `main block ${r.mainBlock} shows no data (only editorial fields): the plan gate drops the page`
      )
  }
}

function placementBuildProblems(mapping, ctx) {
  for (const [id, p] of Object.entries(mapping.placements ?? {})) {
    const at = `placements[${id}]`
    if (p?.menu && !p.layout) {
      const i = p.menu.items
      if (!isObject(i) || !MENU_ITEMS_FROM.includes(i.from) || !isName(i.why))
        ctx.report(
          `${at}.menu.items`,
          `items is {from: ${MENU_ITEMS_FROM.join(' | ')}, ..., why}: which pages it lists`
        )
      else if (i.from === 'pages' && (!MENU_ITEMS_ORDER.includes(i.order) || !Number.isInteger(i.max)))
        ctx.report(
          `${at}.menu.items`,
          `a list of pages names its order (${MENU_ITEMS_ORDER.join(' | ')}) and max`
        )
      else if (each(i.pageTypes).some((t) => !ctx.types.has(t)))
        ctx.report(`${at}.menu.items.pageTypes`, 'pageTypes names page types of the recipes')
    }
    if (p?.holds) {
      const c = p.holds.copies
      if (!isObject(c) || c.perPage !== 1 || !isName(c.keptWhen) || !isName(c.why))
        ctx.report(`${at}.holds.copies`, 'copies is {perPage: 1, keptWhen, why}: a recipe lists a block once')
    }
    if (p?.keyedRow !== undefined) {
      const k = p.keyedRow
      if (
        !isObject(k) ||
        !ctx.types.has(k.pageType) ||
        !Number.isInteger(k.row) ||
        !isName(k.list) ||
        !each(k.fields).length ||
        !isName(k.why)
      )
        ctx.report(`${at}.keyedRow`, 'keyedRow is {pageType, row, list, fields, why}')
    }
  }
  // A block field keyed to a page type beside a list keyed by page: which row the page takes is declared.
  for (const b of ctx.blocks) {
    const keyed = each(b.fields).some((f) => f?.derived === 'the page of the row' && f.pageType !== undefined)
    const list = [...each(b.lists), ...each(b.itemLists)].some((l) =>
      each(l.fields).some((f) => f?.derived === 'the page of the row')
    )
    if (keyed && list && mapping.placements?.[b.id]?.keyedRow === undefined)
      ctx.report(
        `placements[${b.id}].keyedRow`,
        'a page type keys a row beside the rows of a list: declare keyedRow'
      )
  }
}

function factAndSeoProblems(mapping, ctx) {
  for (const [fact, places] of Object.entries(mapping.facts ?? {}))
    each(places).forEach((p, i) => {
      if (p?.notWritten === undefined) return
      const ok = isObject(p.notWritten) && p.notWritten.by === 'decision' && isName(p.notWritten.why)
      if (!ok || mapping.entities?.[p.entity]?.kind !== 'globalConfiguration')
        ctx.report(
          `facts.${fact}[${i}].notWritten`,
          'notWritten is {by: "decision", why}, on a global configuration place'
        )
    })
  const f = mapping.seo?.featuredView
  if (!f) return
  const a = f.article
  if (
    !isObject(a) ||
    mapping.pages?.[a.pageType]?.record?.kind !== 'article' ||
    !isName(a.set?.column) ||
    a.set?.value === undefined ||
    !isName(a.none) ||
    !isName(a.why)
  )
    ctx.report(
      'seo.featuredView.article',
      'article is {pageType: an article page type, set: {column, value}, none, why}'
    )
}

/** Every problem of the build declarations of a mapping file. */
export function buildDeclarationProblems(mapping, blocks, { report, pageRecipes }) {
  const recipes = each(pageRecipes?.recipes).filter((r) => isName(r?.pageType))
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const types = new Set(recipes.map((r) => r.pageType))
  const contact = recipes.filter(
    (r) => byId.get(r.mainBlock)?.type === 'contact' && byId.get(r.mainBlock)?.placement === 'created'
  )
  const recordTypes = new Set([
    ...Object.entries(mapping.seo?.pageTypes ?? {})
      .filter(([, v]) => v === 'article')
      .map(([t]) => t),
    ...contact.map((r) => r.pageType)
  ])
  const kept = new Set(
    Object.entries(mapping.entities ?? {})
      .filter(([, e]) => !e?.created)
      .map(([k]) => k)
  )
  const unbuilt = new Set(
    Object.entries(mapping.pages ?? {})
      .filter(([, p]) => p?.unbuilt)
      .map(([t]) => t)
  )
  const styles = new Set(
    Object.entries(mapping.entities ?? {})
      .filter(([, e]) => e?.kind === 'templateStyle')
      .map(([k]) => k)
  )
  const ctx = { report, recipes, byId, blocks, types, recordTypes, kept, unbuilt, styles }
  lookProblems(mapping.look, report)
  pagesProblems(mapping, ctx)
  mainBlockProblems(ctx)
  placementBuildProblems(mapping, ctx)
  factAndSeoProblems(mapping, ctx)
  framesProblems(mapping, pageRecipes, report)
}
