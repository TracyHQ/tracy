/**
 * `door-measures.mjs` part A: hiding a record (`published: 0`, an article's `state: 0`) and publishing it again,
 * on every page that showed it. The assignments and media are in `door-measures-assign.mjs`.
 */
import { count, K } from './door-measures-lib.mjs'

export const warningsOf = async (ctx) =>
  ((await ctx.inspect()).warnings ?? []).map((w) => `${w.code}: ${w.message}`)
export const shows = async (ctx, at, needle) => {
  const page = await ctx.html(at)
  return { status: page.status, shows: count(page.html, needle) }
}

/** A copy of store module 157 (features-intro) with `words` as its first row title, assigned to `pages`. */
export async function wordsCopy(ctx, words, pages) {
  const record = await ctx.door.get('module', 157)
  const at = {
    column: 'params',
    nestedJson: 'jatools-config',
    jsonPath: ['features-intro', 'features-intro[title]', 0]
  }
  const fields = K.setAt(K.copyFields(record), at, words, ctx.lib)
  const id = await ctx.door.made('module', 0, { ...fields, note: ctx.alias('note') })
  if (pages) await ctx.door.made('moduleAssignment', id, { menuids: JSON.stringify(pages) })
  return id
}

export async function measureHiding(ctx) {
  const { door, fact, pages } = ctx
  // Records to hide: a module copy, a page of the main menu, a category with two articles and its list page, an
  // article, a contact and its page.
  const moduleWords = 'Measure Hidden Module'
  const mod = await wordsCopy(ctx, moduleWords, [pages.home, pages.inner])
  const category = await door.made('category', 0, {
    title: 'Measure Category',
    alias: ctx.alias('cat'),
    extension: 'com_content',
    published: 1,
    language: '*',
    access: 1
  })
  const article = (title) =>
    door.made('article', 0, {
      title,
      alias: ctx.alias('art'),
      catid: category,
      state: 1,
      language: '*',
      access: 1,
      introtext: `<p>${title} body.</p>`
    })
  const first = await article('Measure First Article')
  const second = await article('Measure Second Article')
  const list = await ctx.page(
    'Measure List',
    ctx.styles.DEFAULT,
    `index.php?option=com_content&view=category&layout=blog&id=${category}`
  )
  const menuPage = await ctx.page('Measure Menu Page', ctx.styles.DEFAULT)
  const contactCategory = await door.made('category', 0, {
    title: 'Measure Contacts',
    alias: ctx.alias('ccat'),
    extension: 'com_contact',
    published: 1,
    language: '*',
    access: 1
  })
  const contact = await door.made('contact', 0, {
    name: 'Measure Contact Person',
    alias: ctx.alias('con'),
    catid: contactCategory,
    published: 1,
    language: '*',
    access: 1,
    // Columns of the contact table with no default value (measured: the door names the first one missing).
    params: '{}',
    metadata: '{}',
    metadesc: ''
  })
  const contactUrl = `index.php?option=com_contact&view=contact&id=${contact}&catid=${contactCategory}&Itemid=${pages.inner}`
  // Under a page of the Default style: an address with no menu item takes the home page's, whose layout prints no
  // component (measured in part D).
  const contactList = `index.php?option=com_contact&view=category&id=${contactCategory}&Itemid=${pages.inner}`
  const articleUrl = (id) =>
    `index.php?option=com_content&view=article&id=${id}&catid=${category}&Itemid=${list}`

  const cases = [
    {
      kind: 'module',
      id: mod,
      column: 'published',
      where: async () => ({
        home: await shows(ctx, pages.home, moduleWords),
        inner: await shows(ctx, pages.inner, moduleWords)
      })
    },
    {
      kind: 'menuItem',
      id: menuPage,
      column: 'published',
      where: async () => ({
        mainMenuOnHome: await shows(ctx, pages.home, 'Measure Menu Page'),
        directByItemid: await shows(ctx, menuPage, 'Measure Menu Page')
      })
    },
    {
      kind: 'category',
      id: category,
      column: 'published',
      where: async () => ({
        listPage: await shows(ctx, list, 'Measure First Article'),
        articleUrl: await shows(ctx, articleUrl(first), 'Measure First Article body.')
      })
    },
    {
      kind: 'article',
      id: second,
      column: 'state',
      where: async () => ({
        listPage: await shows(ctx, list, 'Measure Second Article'),
        articleUrl: await shows(ctx, articleUrl(second), 'Measure Second Article body.')
      })
    },
    {
      kind: 'contact',
      id: contact,
      column: 'published',
      where: async () => ({
        contactUrl: await shows(ctx, contactUrl, 'Measure Contact Person'),
        contactList: await shows(ctx, contactList, 'Measure Contact Person')
      })
    }
  ]
  for (const c of cases) {
    const before = await c.where()
    const hide = await door.update(c.kind, c.id, { [c.column]: 0 })
    const hidden = (await door.get(c.kind, c.id))?.[c.column]
    const whileHidden = await c.where()
    const warningsHidden = await warningsOf(ctx)
    const show = await door.update(c.kind, c.id, { [c.column]: 1 })
    const shown = (await door.get(c.kind, c.id))?.[c.column]
    const after = await c.where()
    fact(`A1 hide ${c.kind}`, {
      call: { kind: c.kind, id: c.id, fields: { [c.column]: 0 } },
      answer: hide,
      readBack: hidden,
      before,
      whileHidden,
      warningsHidden,
      publishAgain: { answer: show, readBack: shown, after }
    })
  }

  Object.assign(ctx.pages, { list, menuPage })
  Object.assign(ctx, { category, articles: [first, second], contact, contactCategory })
}
