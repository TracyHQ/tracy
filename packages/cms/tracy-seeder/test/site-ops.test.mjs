/**
 * The two ways the seeder writes into a WordPress site, behind one interface: `wp` on the machine
 * that holds the webroot, and the seat door for a site this machine does not hold at all
 * (tasks/todo-build-new-site.md §B4). One plan-application above, two writers below — because the
 * plan is the same site either way, and a second copy of "what a seeded site looks like" would be
 * a second answer to the only question this package exists to answer.
 *
 * The door writer is pinned hardest on the parts that are silent when wrong: a create is `id: 0`
 * and its answer carries the new id; a rerun must FIND the page instead of making a second one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyWordPress } from '../src/apply-wordpress.mjs'
import { doorOps, wpCliOps } from '../src/site-ops.mjs'

test('wpCliOps: the commands are the ones a lane has always run', async () => {
  const ran = []
  const run = async (cmd, args, stdin) => {
    ran.push({ cmd, args, stdin })
    if (args[0] === 'post' && args[1] === 'list') return { code: 0, stdout: '', stderr: '' }
    return { code: 0, stdout: '41', stderr: '' }
  }
  const ops = wpCliOps({ run, webroot: '.webroot' })
  assert.equal(await ops.find('page', 'home'), null)
  const id = await ops.upsert({ type: 'page', slug: 'home', title: 'Home', content: '<p>Hi</p>' })
  assert.equal(id, 41)
  // upsert asks first (a second `post list`), then creates — so the create is the third command.
  assert.equal(ran[2].args[0], 'post')
  assert.equal(ran[2].args[1], 'create')
  assert.ok(ran[2].args.includes('--post_name=home'))
  assert.equal(ran[2].stdin, '<p>Hi</p>')
  await ops.setMeta(41, '_wp_page_template', 'artifact')
  assert.deepEqual(ran[3].args.slice(0, 4), ['post', 'meta', 'update', '41'])
  await ops.setOption('page_on_front', '41')
  assert.deepEqual(ran[4].args.slice(0, 3), ['option', 'update', 'page_on_front'])
})

test('doorOps: a create is id 0 and answers with the new id; a rerun finds instead of creating', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.list') {
      const name = call.params.name
      return { ok: true, items: name === 'home' ? [{ id: 9, slug: 'home' }] : [] }
    }
    // The door answers with the id it wrote: the one it was given on an update, a fresh one on a
    // create. A fake that always answered 51 would hide an update writing to the wrong row.
    return { ok: true, id: call.params.id > 0 ? call.params.id : 51 }
  }
  const ops = doorOps({ apply, siteKey: 'coba.tracy.ai', applyId: 'seed-1' })

  assert.equal(await ops.find('page', 'home'), 9)
  assert.equal(calls[0].siteKey, 'coba.tracy.ai')
  assert.deepEqual(calls[0].params, { name: 'home', post_type: 'page', limit: 1 })
  assert.equal(await ops.find('page', 'nope'), null)

  const made = await ops.upsert({ type: 'page', slug: 'about', title: 'About', content: '<p>Us</p>' })
  assert.equal(made, 51)
  const create = calls.at(-1)
  assert.equal(create.action, 'content.update')
  assert.equal(create.params.id, 0)
  assert.equal(create.params.kind, 'post')
  assert.equal(create.params.fields.post_name, 'about')
  assert.equal(create.params.fields.post_type, 'page')
  assert.equal(create.params.fields.post_status, 'publish')
  assert.ok(create.params.apply_id, 'every write carries the apply id its undo is filed under')

  // A page that is already there is UPDATED, by its id — never created a second time.
  const again = await ops.upsert({ type: 'page', slug: 'home', title: 'Home', content: '<p>Hi</p>' })
  assert.equal(again, 9)
  assert.equal(calls.at(-1).params.id, 9)
  assert.equal(calls.at(-1).params.fields.post_name, undefined, 'a slug is not rewritten on an update')
})

test('doorOps: meta, options and a refusal in the door own words', async () => {
  const calls = []
  let refuse = false
  const apply = async (call) => {
    calls.push(call)
    if (refuse) return { ok: false, error: 'write_failed', message: 'the site said no' }
    return { ok: true, id: 3 }
  }
  const ops = doorOps({ apply, siteKey: 's.tracy.ai', applyId: 'seed-2' })
  await ops.setMeta(9, 'tracy_artifact', 'landing')
  assert.equal(calls[0].params.kind, 'postmeta')
  assert.equal(calls[0].params.id, 9)
  assert.equal(calls[0].params.key, 'tracy_artifact')
  await ops.setOption('page_for_posts', '9')
  assert.equal(calls[1].params.kind, 'option')
  assert.equal(calls[1].params.key, 'page_for_posts')

  refuse = true
  await assert.rejects(() => ops.setOption('x', '1'), /the site said no/)
})

test('doorOps.readContent: one record through content.get — the list ignores include and carries no body', async () => {
  // The Claude Cowork plugin as measured (claude-cowork 0.11.0, `Engine::contentList`): `include`/`post__in` are
  // read nowhere and bodies ride only with `include_body`, so a list "for id 100" is the site's
  // first post without its content. `content.get` is `get_post($id, ARRAY_A)`.
  const markup = '<!-- wp:heading {"name":"hero.title"} --><h1>Northgate</h1><!-- /wp:heading -->'
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.list')
      return { ok: true, kind: 'post', items: [{ id: 7, post_title: 'Hello world' }] }
    if (call.action === 'content.get')
      return call.params.id === 100
        ? {
            ok: true,
            kind: 'post',
            id: 100,
            key: '',
            item: { ID: 100, post_name: 'home', post_content: markup }
          }
        : { ok: false, error: 'not_found', message: `no post at id ${call.params.id}, key ""` }
    return { ok: true }
  }
  const ops = doorOps({ apply, siteKey: 'wp-x.tracy.test', applyId: 'seed-3' })
  assert.equal(await ops.readContent(100), markup)
  assert.deepEqual(calls.at(-1), {
    siteKey: 'wp-x.tracy.test',
    action: 'content.get',
    params: { kind: 'post', id: 100 }
  })
  await assert.rejects(() => ops.readContent(5), /no post at id 5/)
})

test('doorOps: dates and categories ride the post, and the blog category is found or made', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.list') return { ok: true, items: [] }
    return { ok: true, id: 77 }
  }
  const ops = doorOps({ apply, siteKey: 's.tracy.ai', applyId: 'seed-3' })
  await ops.upsert({
    type: 'post',
    slug: 'a-post',
    title: 'A post',
    content: '<p>x</p>',
    excerpt: 'e',
    date: '2026-08-01 09:00:00',
    categories: [4]
  })
  const create = calls.at(-1)
  assert.equal(create.params.fields.post_date, '2026-08-01 09:00:00')
  assert.deepEqual(create.params.fields.post_category, [4])
  assert.equal(create.params.fields.post_excerpt, 'e')
})

test('applyWordPress writes through the ops it is given — the same plan, a site this machine does not hold', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.list') return { ok: true, items: [] }
    return { ok: true, id: 100 + calls.length }
  }
  const plan = {
    pages: [
      { slug: 'home', title: 'Home', kind: 'artifact', artifact: 'landing', body: [{ html: '<p>Hi</p>' }] },
      { slug: 'contact', title: 'Contact', kind: 'page', body: [{ html: '<p>Say hello</p>' }] }
    ],
    menu: [{ slug: 'home', label: 'Home', url: '/' }],
    posts: [],
    contact: { email: 'hi@coba.example' }
  }
  const out = await applyWordPress({
    plan,
    run: async () => {
      throw new Error('no shell may run for another site')
    },
    ops: doorOps({ apply, siteKey: 'coba.tracy.ai', applyId: 'seed-9' })
  })
  assert.ok(out.pages.home > 0)
  assert.ok(out.pages.contact > 0)
  // Every write named the site, and the front page was set through the door like everything else.
  assert.ok(calls.every((c) => c.siteKey === 'coba.tracy.ai'))
  const options = calls.filter((c) => c.params?.kind === 'option').map((c) => c.params.key)
  assert.ok(options.includes('show_on_front'))
  assert.ok(options.includes('page_on_front'))
  assert.ok(options.includes('tracy_contact_to'))
  const metas = calls.filter((c) => c.params?.kind === 'postmeta').map((c) => c.params.key)
  assert.ok(metas.includes('tracy_artifact'))
})

test('no shell touches this machine when the writes go through a door', async () => {
  // The bug this pins: three calls (the blog category, a cover, the cache flush) stayed on `wp`
  // after the rest moved to the door, so seeding another site ran wp-cli against THIS lane's
  // webroot — measured 08/09, "wp term list: Error establishing a database connection".
  const calls = []
  const apply = async (call) => {
    calls.push(call.action)
    if (call.action === 'content.list') return { ok: true, items: [] }
    return { ok: true, id: 42 }
  }
  const plan = {
    pages: [{ slug: 'home', title: 'Home', kind: 'page', body: [{ html: '<p>Hi</p>' }] }],
    menu: [{ slug: 'home', label: 'Home', url: '/' }],
    posts: [{ slug: 'a-post', title: 'A post', excerpt: 'e', paragraphs: ['x'], imagePrompt: 'a cat' }],
    contact: null
  }
  const out = await applyWordPress({
    plan,
    run: async (cmd) => {
      throw new Error(`no shell may run for another site, but ${cmd} did`)
    },
    images: new Map([['a-post', { bytes: Buffer.from('png'), mime: 'image/png' }]]),
    ops: doorOps({ apply, siteKey: 'coba.tracy.ai', applyId: 'seed-x' })
  })
  assert.ok(calls.includes('media.upload'), 'the cover went through the door')
  assert.ok(
    out.warnings.some((w) => /category/i.test(w)),
    'and the missing category is said out loud'
  )
})

test('setLanguage: wp runs Polylang through eval; the door asks for the verb by name', async () => {
  // `wp` on the lane's own webroot: Polylang has no WP-CLI command outside its Pro build
  // (wordpress.org #2653, measured 08/09), so the way in is its PHP API through `wp eval`.
  const ran = []
  const run = async (cmd, args, stdin) => {
    ran.push({ cmd, args, stdin })
    return { code: 0, stdout: '', stderr: '' }
  }
  const cli = wpCliOps({ run, webroot: '.webroot' })
  await cli.setLanguage(41, 'vi', { en: 40, vi: 41 })
  assert.equal(ran[0].args[0], 'eval')
  assert.match(ran[0].args[1], /pll_set_post_language\(\s*41\s*,\s*'vi'\s*\)/)
  assert.match(ran[0].args[1], /pll_save_post_translations\(/)
  assert.match(ran[0].args[1], /'en'\s*=>\s*40/)

  // The door has no PHP: the language is a verb of its own, and the component either knows it or
  // says so. A refusal is a warning, never a failed build — a site with its words in one language
  // is a site missing a translation, not a site missing its words.
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.language') return { ok: false, code: 'UNKNOWN_ACTION' }
    return { ok: true }
  }
  const door = doorOps({ apply, siteKey: 'x.tracy.ai', applyId: 'a-1' })
  await assert.rejects(() => door.setLanguage(41, 'vi', { en: 40, vi: 41 }))
  assert.equal(calls[0].action, 'content.language')
  assert.deepEqual(calls[0].params, {
    apply_id: 'a-1',
    id: 41,
    lang: 'vi',
    translations: { en: 40, vi: 41 }
  })
})

test('a second language: its own pages, its own slugs, and every page linked to its twin', async () => {
  const calls = []
  let next = 100
  const ops = {
    find: async () => null,
    upsert: async (page) => {
      calls.push({ op: 'upsert', slug: page.slug, title: page.title })
      next += 1
      return next
    },
    setMeta: async () => undefined,
    deleteMeta: async () => undefined,
    setOption: async () => undefined,
    setLanguage: async (id, lang, translations) => {
      calls.push({ op: 'lang', id, lang, translations })
    },
    category: async () => 7,
    cover: async () => true,
    flush: async () => undefined
  }
  const page = (slug, title) => ({ slug, title, kind: 'page', body: `<p>${title}</p>` })
  const plan = {
    system: 'airbnb',
    cms: 'wordpress',
    menu: [{ slug: 'home', label: 'Home', url: '/' }],
    pages: [page('home', 'Home'), page('product', 'Product')],
    posts: []
  }
  const vi = {
    ...plan,
    pages: [page('home', 'Trang chủ'), page('product', 'Sản phẩm')]
  }
  await applyWordPress({
    plan,
    ops,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    languages: ['en', 'vi'],
    translations: [{ lang: 'vi', plan: vi }]
  })

  // The translated pages carry their language in the slug: WordPress makes a slug unique per site,
  // so two pages both asking for `product` would silently become `product` and `product-2`.
  const slugs = calls.filter((c) => c.op === 'upsert').map((c) => c.slug)
  assert.ok(slugs.includes('product'), 'the first language keeps the plain slug')
  assert.ok(slugs.includes('product-vi'), 'the second language gets its own')

  // Every page of both languages is told what it is, and the pair is linked from BOTH sides —
  // Polylang stores one translation group, and a page told nothing is a page that vanishes from
  // the language switcher without an error anywhere.
  const langs = calls.filter((c) => c.op === 'lang')
  assert.deepEqual([...new Set(langs.map((c) => c.lang))].sort(), ['en', 'vi'])
  const product = langs.find((c) => c.lang === 'vi' && c.translations.en)
  assert.ok(product, 'a Vietnamese page names its English twin')
  assert.equal(Object.keys(product.translations).sort().join(','), 'en,vi')
})
