/**
 * `door-measures.mjs` part K, the places: which positions a page reached under its list page prints for a module
 * assigned to the list page (K6, `pages.<type>.under.detailPositions`), what the menu blocks print for the menu items
 * a build makes (K3, `placements.<id>.menu.items`), and what a container copy prints with and without a block it
 * holds (K5, `placements.<id>.holds.copies.keptWhen`). The pages and records come from `door-measures-kit.mjs`.
 */
import { count, K } from './door-measures-lib.mjs'

const list = (v) => (Array.isArray(v) ? v : [])

/** A copy of the store mod_custom 170 printing `words` at `position`, assigned to `pages`. */
async function probe(ctx, words, position, pages) {
  const record = await ctx.door.get('module', 170)
  const id = await ctx.door.made('module', 0, {
    ...K.copyFields(record),
    title: words,
    showtitle: 0,
    position,
    content: `<p>${words}</p>`,
    note: ctx.alias('kit-probe')
  })
  await ctx.door.made('moduleAssignment', id, { menuids: JSON.stringify(pages) })
  return id
}

/** Every position a recipe (and its variants) of an item page type places a block at, and the library's. */
function itemPagePositions(ctx, types) {
  const byId = new Map(ctx.store.blocks.map((b) => [b.id, b]))
  const out = new Set()
  for (const r of ctx.recipes.recipes.filter((x) => types.includes(x.pageType))) {
    for (const ids of [r.blocks, ...list(r.variants).map((v) => v.blocks)])
      for (const id of list(ids)) for (const p of list(byId.get(id)?.positions)) out.add(p)
    const library = ctx.mapping.library?.pageTypes?.[r.pageType]
    if (library) out.add(library)
  }
  return [...out].filter((p) => !p.startsWith('inside:')).sort()
}

const underAddress = (ctx, made, type) =>
  ctx.mapping.pages[type].under.address
    .replace('{record}', made.records[type])
    .replace('{category}', made.categories[type])
    .replace(/\{page:([^}]+)\}/, (_, t) => made.pages[t])

/** K6: per item page type, a probe per position assigned to its list page; where each prints. */
async function measureDetailPositions(ctx, made) {
  const types = Object.keys(ctx.mapping.pages).filter((t) => ctx.mapping.pages[t].under)
  const positions = itemPagePositions(ctx, types)
  for (const type of types) {
    const listType = ctx.mapping.pages[type].under.page
    const probes = {}
    for (const position of positions) {
      const words = `qkpos${type.replace(/-/g, '')}${position.replace(/-/g, '')}zq`
      probes[position] = { words, id: await probe(ctx, words, position, [made.pages[listType]]) }
    }
    const item = await ctx.html(underAddress(ctx, made, type))
    const listPage = await ctx.html(made.pages[listType])
    const on = (html) =>
      Object.entries(probes)
        .filter(([, p]) => count(html, p.words) > 0)
        .map(([position]) => position)
    ctx.fact(`K6 positions an item page under its list page prints, ${type}`, {
      list: listType,
      probed: positions,
      itemPage: { status: item.status, prints: on(item.html) },
      listPage: { status: listPage.status, prints: on(listPage.html) },
      declared: ctx.mapping.pages[type].under.detailPositions.positions
    })
    for (const p of Object.values(probes)) await ctx.door.made('module', p.id, { published: 0 })
  }
}

/** The menu items `<li>` a module prints: their words and links, in order. */
function menuOf(html, id) {
  const part = K.moduleHtml(html, id) ?? ''
  return [...part.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1],
    words: K.visibleText(m[2])
  }))
}

/** K3: url items to a page and to an item page, and an alias item, in the menus of blocks 173 and 174. */
async function measureMenus(ctx, made) {
  const { door, mapping } = ctx
  const menus = Object.entries(mapping.placements).filter(([, p]) => p.menu && !p.layout)
  const item = (title, menutype, fields) =>
    door.made('menuItem', 0, {
      title,
      alias: ctx.alias('kit-menu'),
      menutype,
      published: 1,
      language: '*',
      access: 1,
      template_style_id: 0,
      component_id: 0,
      params: '{}',
      ...fields
    })
  const made3 = {}
  const page = made.pages.classes
  const classUnder = underAddress(ctx, made, 'class')
  made3['site-map url to a page'] = await item('Kit Map Page', 'site-map', {
    type: 'url',
    link: `index.php?Itemid=${page}`
  })
  // An alias item as the write step sends it today (an empty link), then with the link Joomla stores for one.
  const aliasFields = (link) => ({
    title: 'Kit Map Alias',
    alias: ctx.alias('kit-menu'),
    menutype: 'site-map',
    published: 1,
    language: '*',
    access: 1,
    template_style_id: 0,
    component_id: 0,
    type: 'alias',
    link,
    params: JSON.stringify({ aliasoptions: String(made.pages.plans) })
  })
  const emptyLink = await door.update('menuItem', 0, aliasFields(''))
  made3['site-map alias of a page'] = await door.made('menuItem', 0, aliasFields('index.php?Itemid='))
  made3['classes url to an item page'] = await item('Kit Class Item', 'classes', {
    type: 'url',
    link: classUnder
  })
  for (const [id] of menus) {
    const n = Number(id.replace('block-', ''))
    await door.made('moduleAssignment', n, { menuids: '[0]' })
  }
  const html = (await ctx.html(made.pages.news)).html
  const read = {}
  for (const [id, p] of menus) {
    const n = Number(id.replace('block-', ''))
    read[id] = { menutype: p.menu.menutype, prints: menuOf(html, n) }
  }
  const stored = {}
  for (const [name, id] of Object.entries(made3)) {
    const got = await door.get('menuItem', id)
    stored[name] = { id, type: got?.type, link: got?.link, params: got?.params }
  }
  const target = await ctx.html(
    read['block-173']?.prints.find((x) => x.words === 'Kit Class Item')?.href ?? '/'
  )
  ctx.fact('K3 menu blocks and the items a build makes', {
    pages: made.pages,
    aliasWithEmptyLink: { ok: emptyLink.ok, error: emptyLink.error, message: emptyLink.message },
    items: stored,
    blocks: read,
    classItemLinkOpens: {
      status: target.status,
      detailList: count(target.html, 'layout-detail-article') > 0,
      bodyClass: /<body[^>]*class="([^"]*)"/.exec(target.html)?.[1]?.slice(0, 200)
    }
  })
}

/** K5: a container copy at a position of its own, with no held block, then with one. */
async function measureContainer(ctx, made) {
  const { door, mapping, lib } = ctx
  const [id, entry] = Object.entries(mapping.placements).find(([, p]) => p.holds) ?? []
  if (!id) return
  const page = made.pages.plans
  const box = await door.get('module', Number(entry.entity.replace('module-', '')))
  const copy = await door.made('module', 0, {
    ...K.copyFields(box),
    title: 'qkboxtitlezq',
    note: ctx.alias('box')
  })
  const record = await door.get('module', copy)
  const position = `tracy-tabs-${copy}`
  await door.made('module', copy, { params: K.setAt(record, entry.holds.position, position, lib).params })
  await door.made('moduleAssignment', copy, { menuids: JSON.stringify([page]) })
  const shape = (html) => {
    const part = K.moduleHtml(html, copy) ?? ''
    return {
      printed: part !== '',
      words: K.visibleText(part.slice(part.indexOf('>') + 1)).slice(0, 160),
      tabs: count(part, 'role="tab"') || count(part, 'nav-link'),
      bytes: part.length
    }
  }
  const empty = shape((await ctx.html(page)).html)
  const heldId = Number(entry.holds.blocks[0].replace('block-', ''))
  const held = await door.get('module', heldId)
  const tab = await door.made('module', 0, {
    ...K.copyFields(held),
    title: 'qkheldtabzq',
    position,
    note: ctx.alias('held')
  })
  await door.made('moduleAssignment', tab, { menuids: JSON.stringify([page]) })
  const one = shape((await ctx.html(page)).html)
  ctx.fact(`K5 container ${id} copy with and without a held block`, {
    container: copy,
    position,
    withoutHeldBlock: empty,
    withOneHeldBlock: { ...one, tabLabelPrinted: count((await ctx.html(page)).html, 'qkheldtabzq') > 0 },
    declared: entry.holds.copies
  })
}

export async function measureKitPlaces(ctx, made) {
  for (const part of [measureDetailPositions, measureMenus, measureContainer]) {
    try {
      await part(ctx, made)
    } catch (error) {
      ctx.fact(`${part.name} stopped`, { error: String(error?.stack ?? error).slice(0, 1500) })
    }
  }
}
