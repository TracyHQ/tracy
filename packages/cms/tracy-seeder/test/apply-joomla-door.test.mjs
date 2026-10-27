/**
 * The Joomla seeder against a site this machine does not hold. The stand below is a small Joomla:
 * it answers listings, mints ids, and REMEMBERS what was written, so a test can ask the questions a
 * customer would — is the front page mine, is the blog a blog, did the contact form get an address.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyJoomlaThroughDoor } from '../src/apply-joomla-door.mjs'

/** A Joomla that remembers. `rows` is what it already had; `wrote` is every write it took. */
function stand({ categories = [], articles = [], menu = [], modules = [], contacts = [] } = {}) {
  // Deep, not spread: the spread copied the arrays but shared the row OBJECTS, so one test's
  // writes landed in the next test's starting site.
  const rows = structuredClone({
    category: categories,
    article: articles,
    menuItem: menu,
    module: modules,
    contact: contacts
  })
  const wrote = []
  let next = 500
  const apply = async ({ action, params }) => {
    if (action === 'content.list') {
      const all = rows[params.kind] ?? []
      return { ok: true, items: all.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 100)) }
    }
    if (action === 'media.upload') {
      wrote.push({ action, ...params })
      return { ok: true, path: params.path }
    }
    if (action === 'content.update') {
      wrote.push({ action, kind: params.kind, id: params.id, fields: params.fields })
      const id = params.id > 0 ? params.id : ++next
      const list = rows[params.kind] ?? (rows[params.kind] = [])
      const found = list.find((r) => Number(r.id) === id)
      if (found) Object.assign(found, params.fields)
      else list.push({ id, ...params.fields })
      return { ok: true, id }
    }
    return { ok: false, code: 'UNKNOWN_ACTION', error: `no ${action} here` }
  }
  return { apply, wrote, rows }
}

const PLAN = {
  pages: [
    { slug: 'home', title: 'Cô Ba Bakery', kind: 'landing', body: '<h1>Bánh</h1>' },
    { slug: 'pricing', title: 'Pricing', kind: 'page', body: '<p>Giá</p>' }
  ],
  posts: [
    {
      slug: 'first-loaf',
      title: 'First loaf',
      excerpt: 'A loaf',
      paragraphs: ['One', 'Two'],
      imagePrompt: 'bread'
    }
  ],
  menu: [
    { slug: 'home', label: 'Home' },
    { slug: 'pricing', label: 'Pricing' },
    { slug: 'blog', label: 'Blog' },
    { slug: 'contact', label: 'Contact' }
  ],
  contact: { name: 'Cô Ba Bakery', email: 'hi@coba.vn', lead: 'Ghé tiệm' }
}

const STOCK = {
  categories: [
    { id: 2, alias: 'uncategorised', extension: 'com_content' },
    { id: 8, alias: 'uncategorised', extension: 'com_contact' }
  ],
  menu: [
    {
      id: 101,
      alias: 'home',
      menutype: 'mainmenu',
      link: 'index.php?option=com_content&view=featured',
      home: 1
    }
  ],
  modules: [{ id: 4, module: 'mod_menu', position: 'sidebar-right' }]
}

test('a fresh Joomla site is seeded entirely through the door', async () => {
  const s = stand(STOCK)
  const out = await applyJoomlaThroughDoor({
    plan: PLAN,
    apply: s.apply,
    siteKey: 'coba.tracy.ai',
    applyId: 'seed-1',
    images: new Map([['first-loaf', { mime: 'image/png', bytes: Buffer.from('png') }]])
  })

  // No shell, no webroot: every write is one door call.
  assert.ok(s.wrote.every((w) => w.action === 'content.update' || w.action === 'media.upload'))

  // The pages carry the template's layout, which is what makes them look like the design.
  const home = s.wrote.find((w) => w.kind === 'article' && w.fields.alias === 'home')
  assert.equal(JSON.parse(home.fields.attribs).article_layout, 'tpl_tracy:landing')
  assert.equal(home.fields.catid, 2)
  // `#__content` declares these NOT NULL with no default; an insert naming none of them is refused
  // by the database, with a message that never says which article it refused.
  for (const column of ['images', 'urls', 'metakey', 'metadesc', 'metadata'])
    assert.notEqual(home.fields[column], undefined, `a new article must name ${column}`)
  // 1 is Public. An article left on 0 is served as "You don't have permission to access this".
  assert.equal(home.fields.access, 1)

  // A blog category is made once, and the posts go in it.
  const madeCat = s.wrote.filter((w) => w.kind === 'category')
  assert.equal(madeCat.length, 1)
  assert.equal(madeCat[0].fields.title, 'Blog')
  const post = s.wrote.find((w) => w.kind === 'article' && w.fields.alias === 'first-loaf')
  const blog = s.rows.category.find((c) => c.title === 'Blog')
  assert.equal(post.fields.catid, blog.id)
  // Not the page category: a post filed with the pages would never appear in the blog listing.
  assert.notEqual(post.fields.catid, 2)

  // The cover is a FILE on Joomla, and the article points at it.
  const upload = s.wrote.find((w) => w.action === 'media.upload')
  assert.equal(upload.path, 'images/tracy/first-loaf.png')
  assert.equal(JSON.parse(post.fields.images).image_intro, 'images/tracy/first-loaf.png')

  // The contact record takes the address the customer gave, in the com_contact category.
  const contact = s.wrote.find((w) => w.kind === 'contact')
  assert.equal(contact.fields.email_to, 'hi@coba.vn')
  assert.equal(contact.fields.catid, 8)
  // Vietnamese folds to the ASCII a URL can carry, and the row's required columns are named.
  assert.equal(contact.fields.alias, 'co-ba-bakery')
  for (const column of ['metadesc', 'metadata', 'params'])
    assert.notEqual(contact.fields[column], undefined, `a new contact must name ${column}`)

  // And the front page is the customer's landing article, not Joomla's featured view.
  const homeItem = s.wrote.find((w) => w.kind === 'menuItem' && w.fields.home === 1)
  assert.ok(homeItem, 'some menu item must claim the home flag')
  assert.equal(out.warnings.filter((w) => w.includes('menu module')).length, 0)
})

test("Joomla's own Home item is stood down, not silently left pointing at the featured view", async () => {
  const s = stand(STOCK)
  const out = await applyJoomlaThroughDoor({
    plan: PLAN,
    apply: s.apply,
    siteKey: 'coba.tracy.ai',
    applyId: 'seed-2'
  })
  // The door writes no `link` on an update, so the stock item can never point at the landing page.
  // A new item takes the home flag and the stock one is unpublished — two visible Homes would be
  // the worse outcome of the two.
  const made = s.wrote.find((w) => w.kind === 'menuItem' && w.fields.home === 1)
  assert.equal(made.id, 0, 'the home item is created, not updated in place')
  assert.equal(made.fields.link, `index.php?option=com_content&view=article&id=${out.pages.home}`)
  // Created under a title that folds to a free alias, then renamed to what the reader sees: the
  // door has no `alias` on a create, and "Home" beside Joomla's own Home is a duplicate key.
  assert.equal(made.fields.title, 'Home Tracy')
  const renamed = s.wrote.find((w) => w.kind === 'menuItem' && w.id === out.menu.home)
  assert.equal(renamed.fields.title, 'Home')
  const stood = s.wrote.find((w) => w.kind === 'menuItem' && w.id === 101)
  assert.equal(stood.fields.published, 0)
  // And the menu module Joomla ships is moved into the position the template renders.
  const moved = s.wrote.find((w) => w.kind === 'module')
  assert.equal(moved.fields.position, 'nav')
  assert.equal(JSON.parse(moved.fields.params).menutype, 'mainmenu')
})

test('a site with no menu module at all says so rather than building one nothing shows', async () => {
  const s = stand({ ...STOCK, modules: [] })
  const out = await applyJoomlaThroughDoor({
    plan: PLAN,
    apply: s.apply,
    siteKey: 'coba.tracy.ai',
    applyId: 'seed-3'
  })
  assert.ok(out.warnings.some((w) => w.includes('menu module')))
})

test('a refusal is carried back in the door own words', async () => {
  const apply = async ({ action }) =>
    action === 'content.list'
      ? { ok: false, code: 'TOOLSET_NOT_GRANTED', message: 'Ask the Owner for the content toolset.' }
      : { ok: true, id: 1 }
  await assert.rejects(
    applyJoomlaThroughDoor({ plan: PLAN, apply, siteKey: 'coba.tracy.ai', applyId: 'seed-4' }),
    /Ask the Owner for the content toolset\./
  )
})

test('a second language: its own articles and its own menu, tagged with the Joomla tag', async () => {
  const s = stand(STOCK)
  const vi = {
    ...PLAN,
    pages: [
      { slug: 'home', title: 'Trang chủ', kind: 'landing', body: '<h1>Bánh mì</h1>' },
      { slug: 'pricing', title: 'Bảng giá', kind: 'page', body: '<p>Giá</p>' }
    ]
  }
  const out = await applyJoomlaThroughDoor({
    plan: PLAN,
    apply: s.apply,
    siteKey: 'coba.tracy.ai',
    applyId: 'a-1',
    languages: ['en', 'vi'],
    translations: [{ lang: 'vi', plan: vi }]
  })

  const articles = s.wrote.filter((w) => w.kind === 'article' && w.fields.alias)
  // The first language keeps `*` — "all languages" is what a one-language Joomla site uses, and a
  // site that later drops back to one must not have its original articles stranded behind a tag.
  const en = articles.find((a) => a.fields.alias === 'pricing')
  assert.equal(en.fields.language, '*')
  // The second gets a Joomla content tag, which is `xx-XX` and never the bare `xx` a form collects.
  const twin = articles.find((a) => a.fields.alias === 'pricing-vi')
  assert.ok(twin, 'the translated article has its own alias')
  assert.equal(twin.fields.language, 'vi-VN')
  assert.equal(twin.fields.title, 'Bảng giá')

  // Joomla switches language by MENU, so a language with no menu of its own is a language with no
  // way in. Its items point at its own articles.
  const menutypes = s.wrote.filter((w) => w.kind === 'menutype').map((w) => w.fields.menutype)
  assert.ok(menutypes.includes('mainmenu-vi'), `made ${JSON.stringify(menutypes)}`)
  const viItems = s.wrote.filter((w) => w.kind === 'menuItem' && w.fields.menutype === 'mainmenu-vi')
  assert.ok(viItems.length > 0)
  assert.equal(viItems[0].fields.language, 'vi-VN')

  assert.ok(Array.isArray(out.warnings))
})

test('the second language is made a language, given its pack, and the filter turned on', async () => {
  const s = stand(STOCK)
  const asked = []
  const apply = async (call) => {
    asked.push(call)
    if (call.action === 'extension.install' || call.action === 'extension.enable') return { ok: true }
    return s.apply(call)
  }
  await applyJoomlaThroughDoor({
    plan: PLAN,
    apply,
    siteKey: 'coba.tracy.ai',
    applyId: 'a-1',
    languages: ['en', 'vi'],
    translations: [{ lang: 'vi', plan: PLAN }]
  })

  // The row without which every article below is filed under a language Joomla does not know.
  const made = s.wrote.find((w) => w.kind === 'language')
  assert.ok(made, 'the content language is created')
  assert.equal(made.fields.lang_code, 'vi-VN')
  assert.equal(made.fields.sef, 'vi', 'the URL segment is the short slug, not the tag')

  // Joomla cannot switch without the pack and without the plugin that reads the menu.
  assert.ok(asked.some((c) => c.action === 'extension.install' && String(c.params.url).includes('vi-VN')))
  assert.ok(asked.some((c) => c.action === 'extension.enable' && c.params.element === 'languagefilter'))
})
