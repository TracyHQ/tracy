/**
 * `door-measures.mjs` part D: the featured view with no featured article; a created article in the template's frame
 * (bare, with the classes article layout, on its own page and under a list page); the class detail list (159) and
 * the post related items (191) on those article pages; a middle row taken out of a copy, and a middle menu item.
 */
import { count, K } from './door-measures-lib.mjs'

/** The words the main body of a page prints (its component), or null when the layout prints no main body. */
const mainBody = (html) => {
  const at = html.indexOf('id="t4-main-body"')
  if (at < 0) return null
  const end = html.indexOf('id="t4-footnav"', at)
  return K.visibleText(html.slice(at, end > 0 ? end : at + 4000)).slice(0, 300)
}
/** The sections of the T4 layout a page prints, by id. */
const sections = (html) => [...html.matchAll(/id="t4-([a-z0-9-]+)"/g)].map((m) => m[1])

export async function measurePages(ctx) {
  const { door, fact } = ctx
  // D1. The featured view with no featured article: on the home page (Landing style) and on an inner page.
  const home = (await ctx.html(ctx.pages.home)).html
  const inner = (await ctx.html(ctx.pages.inner)).html
  fact('D1 featured view with no featured article', {
    home: { sections: sections(home), mainBody: mainBody(home) },
    innerPageOfTheDefaultStyle: { sections: sections(inner), mainBody: mainBody(inner) }
  })

  // D2. Created articles: bare, and with the classes article layout; on a page of their own, under the list page
  // (the article address carries the list page's menu item) and with no menu item at all.
  const article = (title, extra = {}) =>
    door.made('article', 0, {
      title,
      alias: ctx.alias('d'),
      catid: ctx.category,
      state: 1,
      language: '*',
      access: 1,
      metakey: 'measure, related',
      introtext: `<p>${title} body.</p>`,
      ...extra
    })
  const bare = await article('Measure Bare Article')
  const laid = await article('Measure Laid Article', {
    attribs: JSON.stringify({ article_layout: 'ja_boxing:classes' })
  })
  const ownPage = (id) =>
    ctx.page(`Measure Page ${id}`, ctx.styles.DEFAULT, `index.php?option=com_content&view=article&id=${id}`)
  const under = (id) =>
    `index.php?option=com_content&view=article&id=${id}&catid=${ctx.category}&Itemid=${ctx.pages.list}`
  const addresses = {
    bareOwnPage: await ownPage(bare),
    laidOwnPage: await ownPage(laid),
    bareUnderList: under(bare),
    laidUnderList: under(laid),
    bareNoMenuItem: `index.php?option=com_content&view=article&id=${bare}&catid=${ctx.category}`
  }
  const shape = async (at) => {
    const page = await ctx.html(at)
    return {
      status: page.status,
      sections: sections(page.html),
      itemPage: count(page.html, 'com-content-article item-page'),
      classesLayout: count(page.html, 'view-classes-detail'),
      bodyClassLayout: page.html.match(/class="[^"]*\b(layout-[a-z0-9-]+)/)?.[1] ?? null
    }
  }
  const frames = {}
  for (const [name, at] of Object.entries(addresses))
    frames[name] = { address: typeof at === 'number' ? `menu item ${at}` : at, ...(await shape(at)) }
  fact('D2 a created article in the template frame', {
    attribsOfTheLaidArticle: { article_layout: 'ja_boxing:classes' },
    frames
  })

  // D3. Blocks 159 (article list, detail-bottom-1) and 191 (related items, main-bottom-2), assigned to the list page
  // and the article pages: a plain copy of 159, one whose category is the measurement's, and a plain copy of 191
  // beside articles sharing a meta keyword.
  const copyOf = async (store, edit) => {
    const id = await door.made('module', 0, edit(K.copyFields(await door.get('module', store))))
    await door.made('moduleAssignment', id, {
      menuids: JSON.stringify([ctx.pages.list, addresses.bareOwnPage, addresses.laidOwnPage])
    })
    return id
  }
  const modules = {
    plain159: await copyOf(159, (f) => f),
    reset159: await copyOf(159, (f) => ({
      ...f,
      params: JSON.stringify({ ...JSON.parse(f.params), catid: [String(ctx.category)] })
    })),
    plain191: await copyOf(191, (f) => f)
  }
  const drawn = {}
  for (const [name, at] of Object.entries(addresses)) {
    const html = (await ctx.html(at)).html
    drawn[name] = Object.fromEntries(
      Object.entries(modules).map(([k, id]) => {
        const piece = K.moduleHtml(html, id)
        return [k, piece === null ? null : K.visibleText(piece).slice(0, 200)]
      })
    )
  }
  const store159 = JSON.parse((await door.get('module', 159)).params)
  const store191 = JSON.parse((await door.get('module', 191)).params)
  fact('D3 blocks 159 and 191 on article pages', {
    store159: { catid: store159.catid, count: store159.count },
    store191: { maximum: store191.maximum ?? null },
    modules,
    articlesShareMetakey: 'measure, related',
    drawn
  })

  // D4. A middle row taken out of a copy: cut (the row's entries removed from every list) or left with empty words.
  const rowsPage = await ctx.page('Measure Rows', ctx.styles.LANDING)
  const store157 = await door.get('module', 157)
  const config = JSON.parse(JSON.parse(store157.params)['jatools-config'])
  const fi = config['features-intro']
  fi['features-intro[title]'] = ['Measure Row One', 'Measure Row Two', 'Measure Row Three', '']
  fi['features-intro[description]'] = ['first', 'second', 'third', '']
  const withRows = (edit) => {
    const c = structuredClone(config)
    edit(c['features-intro'])
    const params = JSON.parse(store157.params)
    params['jatools-config'] = JSON.stringify(c)
    return { ...K.copyFields(store157), params: JSON.stringify(params) }
  }
  const keep = (rows) => (data) => {
    for (const [k, v] of Object.entries(data))
      if (Array.isArray(v) && v.length === 4) data[k] = rows.map((i) => v[i])
  }
  const variants = {
    threeRowsKept: withRows(keep([0, 1, 2])),
    middleRowCut: withRows(keep([0, 2])),
    middleRowEmptied: withRows((data) => {
      data['features-intro[title]'][1] = ''
      data['features-intro[description]'][1] = ''
      keep([0, 1, 2])(data)
    })
  }
  const ids = {}
  for (const [name, fields] of Object.entries(variants)) {
    ids[name] = await door.made('module', 0, fields)
    await door.made('moduleAssignment', ids[name], { menuids: JSON.stringify([rowsPage]) })
  }
  const rowsHtml = (await ctx.html(rowsPage)).html
  const cards = {}
  for (const [name, id] of Object.entries(ids)) {
    const piece = K.moduleHtml(rowsHtml, id) ?? ''
    const items = piece
      .split('class="features-item')
      .slice(1)
      .map((c) => K.visibleText(`<div class="${c}`.split('<div class="col-')[0]))
    cards[name] = {
      module: id,
      cards: items.length,
      emptyCards: items.filter((t) => t === '').length,
      words: items
    }
  }
  fact('D4 a middle row taken out of a copy', { cards })

  // A middle item of a menu unpublished (the in-place menu blocks draw menu items): does the menu close up.
  const nav = []
  for (const title of ['Measure Nav One', 'Measure Nav Two', 'Measure Nav Three'])
    nav.push(await ctx.page(title, ctx.styles.DEFAULT))
  const hide = await door.update('menuItem', nav[1], { published: 0 })
  const html = (await ctx.html(ctx.pages.home)).html
  const from = html.indexOf('Measure Nav One')
  fact('D4 a middle menu item unpublished', {
    answer: hide,
    menuBetweenOneAndThree:
      from < 0 ? null : html.slice(from, html.indexOf('Measure Nav Three', from) + 17).replace(/\s+/g, ' ')
  })
}
