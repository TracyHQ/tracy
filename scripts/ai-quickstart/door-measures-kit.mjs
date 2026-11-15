/**
 * `door-measures.mjs` part K: the build declarations of the mapping file, measured as the kit declares them (the five
 * questions of the write step on #597). This file makes the pages and records the kit declares (`pages.<type>`: the
 * category of `record.category`, the list page of `menuItem`, the record of `record.base`) and measures the frames of
 * created records (`createdFrames`, fact K1). The positions, menus and containers are in `door-measures-kit-places.mjs`.
 */
import { count, K, pageFields } from './door-measures-lib.mjs'
import { measureKitPlaces } from './door-measures-kit-places.mjs'

const COMPONENTS = { com_content: 19, com_contact: 7 }
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])
/** A marker the plugin's guards and HTML both leave alone: letters only. */
const markerOf = (n) => `qk${n.toString(26).replace(/\d/g, (d) => 'abcdefghij'[d])}zq`

/** The record entity a page type's main block writes (`news-post` writes `article-6`), or null. */
function recordEntityOf(mapping, recipes, type) {
  const main = recipes.recipes.find((r) => r.pageType === type)?.mainBlock
  const out = []
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (isObject(v) && v.entity && v.column) out.push(v)
    else if (isObject(v)) for (const [k, x] of Object.entries(v)) if (k !== 'keyAt') walk(x)
  }
  walk(mapping.blocks?.[main])
  return out.find((l) => mapping.entities[l.entity]?.created)?.entity ?? null
}

/** Every location of a built block on one record value, with its xpath (a frame holds them). */
function framedLocations(mapping, recipes, entity) {
  const unbuilt = new Set(Object.keys(mapping.pages).filter((t) => mapping.pages[t].unbuilt))
  const built = new Set(recipes.recipes.filter((r) => !unbuilt.has(r.pageType)).flatMap((r) => r.blocks))
  const out = []
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (isObject(v) && v.entity === entity && v.column && v.xpath && v.xpath !== '/html/body/div')
      out.push(v)
    else if (isObject(v)) for (const [k, x] of Object.entries(v)) if (k !== 'keyAt') walk(x)
  }
  for (const [id, entry] of Object.entries(mapping.blocks)) if (built.has(id)) walk(entry)
  const seen = new Set()
  return out.filter((l) => {
    const key = JSON.stringify([l.column, l.jsonPath ?? null, l.xpath])
    return seen.has(key) ? false : seen.add(key)
  })
}

const valueKey = (l) => JSON.stringify([l.column, l.jsonPath ?? null])
/** Set `value` at a JSON path of an object, making the objects on the way. */
function setPath(object, steps, value) {
  let node = object
  for (const step of steps.slice(0, -1)) node = node[step] = isObject(node[step]) ? node[step] : {}
  node[steps.at(-1)] = value
}
const getPath = (object, steps) => steps.reduce((n, s) => n?.[s], object)

/** Resolve a kit link: `{category:<type>}`, `{page:<type>}`, `{entity:<key>}`, `{record}`. */
function resolve(link, made, mapping, record, type) {
  return String(link).replace(/\{([^}]*)\}/g, (_, name) => {
    const [kind, ref] = name.split(':')
    if (name === 'record') return String(record)
    if (name === 'category') return String(made.categories[type])
    if (kind === 'category') return String(made.categories[ref])
    if (kind === 'page') return String(made.pages[ref])
    if (kind === 'entity') return String(made.kept(ref))
    return `{${name}}`
  })
}

/** The template style id a kit menu item names: 0, or a template style entity of the mapping. */
const styleOf = (made, style) => (style === 0 ? 0 : made.kept(style))

export async function measureKit(ctx) {
  const { door, fact, mapping } = ctx
  const recipes = ctx.recipes
  const made = { categories: {}, pages: {}, records: {}, markers: {} }
  // A record the blank site keeps, by its entity key: its id on the site (the blank site contract).
  made.kept = (key) =>
    mapping.entities[key]?.sourceId ?? ctx.contentMap.entities.find((e) => e.key === key)?.sourceId
  // The categories the kit declares (record.category), each as the write step sends it.
  for (const [type, p] of Object.entries(mapping.pages)) {
    const c = p.record?.category
    if (!c) continue
    made.categories[type] = await door.made('category', 0, {
      title: `Kit ${type} category`,
      alias: ctx.alias(`cat-${type}`),
      extension: c.extension,
      published: 1,
      language: '*',
      access: 1,
      params: JSON.stringify(c.params ?? {})
    })
  }
  const categoryRead = {}
  for (const [type, id] of Object.entries(made.categories)) {
    const got = await door.get('category', id)
    categoryRead[type] = { extension: got?.extension, params: got?.params, parent: got?.parent_id }
  }
  fact('K0 categories as record.category declares them', { made: made.categories, readBack: categoryRead })
  // The pages with a menu item (pages.<type>.menuItem), parents first; the contact page after its record.
  const order = Object.keys(mapping.pages).filter((t) => mapping.pages[t].menuItem && t !== 'contact')
  order.sort(
    (a, b) => (mapping.pages[a].menuItem.parent ? 1 : 0) - (mapping.pages[b].menuItem.parent ? 1 : 0)
  )
  const pageOf = async (type, record) => {
    const item = mapping.pages[type].menuItem
    const link = resolve(item.link, made, mapping, record)
    const component = /option=(com_\w+)/.exec(link)?.[1]
    const fields = pageFields(`Kit ${type}`, ctx.alias(type), styleOf(made, item.templateStyle), link, {
      component_id: COMPONENTS[component] ?? 19,
      params: JSON.stringify(item.params ?? {}),
      ...(item.parent ? { parent_id: made.pages[item.parent] } : {})
    })
    made.pages[type] = await door.made('menuItem', 0, fields)
    const got = await door.get('menuItem', made.pages[type])
    return { link, style: got?.template_style_id, parent: got?.parent_id, sentParent: fields.parent_id ?? 1 }
  }
  const pagesRead = {}
  for (const type of order.filter((t) => t !== 'home')) pagesRead[type] = await pageOf(type)
  // The records: one per page type that declares one, with its base columns and every frame filled with markers.
  let n = 0
  for (const [type, p] of Object.entries(mapping.pages)) {
    if (!p.record) continue
    const entity = recordEntityOf(mapping, recipes, type)
    const locs = framedLocations(mapping, recipes, entity)
    const values = {}
    for (const l of locs) {
      const key = valueKey(l)
      const frame = list(mapping.createdFrames).find(
        (f) => f.entities.includes(entity) && valueKey(f) === key
      )
      values[key] ??= { loc: l, html: frame?.html ?? null, sets: [] }
      values[key].sets.push({ xpath: l.xpath, marker: markerOf(n++) })
    }
    const base = structuredClone(p.record.base)
    const columns = { attribs: isObject(base.attribs) ? base.attribs : {} }
    const fails = []
    for (const v of Object.values(values)) {
      if (v.html === null) {
        fails.push({ value: valueKey(v.loc), problem: 'no frame declared' })
        continue
      }
      let html = v.html
      for (const s of v.sets) {
        try {
          html = K.pieces(ctx.lib, [{ value: html, xpath: s.xpath, set: s.marker }])[0].value
        } catch (error) {
          fails.push({ value: valueKey(v.loc), xpath: s.xpath, problem: String(error.message).slice(0, 200) })
        }
      }
      if (v.loc.jsonPath) setPath(columns[v.loc.column] ?? (columns[v.loc.column] = {}), v.loc.jsonPath, html)
      else columns[v.loc.column] = html
    }
    const kind = p.record.kind
    const fields = {
      ...Object.fromEntries(Object.entries(base).map(([k, x]) => [k, isObject(x) ? JSON.stringify(x) : x])),
      ...(kind === 'article'
        ? { title: `Kit ${type} record`, state: 1, introtext: '', fulltext: '' }
        : { name: `Kit ${type} record`, published: 1 }),
      ...Object.fromEntries(
        Object.entries(columns).map(([k, x]) => [k, isObject(x) ? JSON.stringify(x) : x])
      ),
      alias: ctx.alias(type),
      catid: made.categories[type],
      language: '*',
      access: 1
    }
    const answer = await door.update(kind, 0, fields)
    made.records[type] = answer.id ?? null
    const stored = made.records[type] ? await door.get(kind, made.records[type]) : null
    const sets = Object.values(values).flatMap((v) => v.sets.map((s) => ({ ...s, loc: v.loc })))
    const readBack = sets.filter((s) => {
      const raw = stored?.[s.loc.column]
      const at = s.loc.jsonPath ? getPath(JSON.parse(raw || '{}'), s.loc.jsonPath) : raw
      return String(at ?? '').includes(s.marker)
    }).length
    made.markers[type] = { entity, sets, readBack, fails, answer: answer.ok === true ? 'written' : answer }
  }
  if (made.records.contact) pagesRead.contact = await pageOf('contact', made.records.contact)
  fact('K0 pages as pages.<type>.menuItem declares them', { made: made.pages, readBack: pagesRead })
  await measureFrames(ctx, made)
  await measureKitPlaces(ctx, made)
}

/** K1: every marker written into a frame, read back and printed on the page that shows the record. */
async function measureFrames(ctx, made) {
  const { mapping, fact } = ctx
  for (const [type, m] of Object.entries(made.markers)) {
    const under = mapping.pages[type].under
    const at = under ? resolve(under.address, made, mapping, made.records[type], type) : made.pages[type]
    const page = await ctx.html(at)
    const body = page.html.slice(Math.max(0, page.html.indexOf('id="t4-main-body"')))
    const printed = m.sets.filter((s) => count(page.html, s.marker) > 0)
    fact(`K1 createdFrames ${type}`, {
      entity: m.entity,
      written: m.answer,
      values: [...new Set(m.sets.map((s) => valueKey(s.loc)))],
      markers: m.sets.length,
      readBack: m.readBack,
      printed: printed.length,
      inMainBody: m.sets.filter((s) => count(body, s.marker) > 0).length,
      notPrinted: m.sets.filter((s) => !printed.includes(s)).map((s) => `${valueKey(s.loc)} ${s.xpath}`),
      fails: m.fails,
      page: { at: typeof at === 'number' ? `Itemid=${at}` : at, status: page.status },
      phpWarnings: count(page.html, 'Warning</b>:') + count(page.html, 'Deprecated</b>:')
    })
  }
}
