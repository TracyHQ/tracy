import assert from 'node:assert/strict'
import test from 'node:test'
import { ownChange, relink, resolveSweepCall } from '../src/host/sweep-resolve.mjs'

/** A door that answers `content.get` from `records` and keeps every write it was sent. */
function door(records) {
  const writes = []
  const run = async (action, params) => {
    if (action === 'content.get' || action === 'content_get') {
      const key = params.collection
        ? `${params.collection}/${params.id}`
        : `${params.kind}/${params.id}${params.key ? `/${params.key}` : ''}`
      return records[key]
        ? { ok: true, item: structuredClone(records[key]) }
        : { ok: false, code: 'NOT_FOUND' }
    }
    if (action === 'menu_get') return { ok: true, items: structuredClone(records[`menu/${params.name}`]) }
    writes.push({ action, params })
    return { ok: true }
  }
  return { run, writes }
}

const HOME = `<!-- wp:paragraph {"className":"slide-btn"} -->
<p class="slide-btn"><a class="btn btn-primary" href="/about-us">Book a Table</a></p>
<!-- /wp:paragraph -->
<p><a href="/about-us">About us</a></p>`

test("relink: only the anchor with the call's address and words moves", () => {
  const r = relink(HOME, '/about-us', '/contact-us/', 'BOOK A TABLE')
  assert.equal(r.count, 1)
  assert.match(r.html, /href="\/contact-us\/">Book a Table/)
  assert.match(r.html, /href="\/about-us">About us/)
})

test("WordPress: a button kept in the page's content is written by content.get then content.update", async () => {
  const { run, writes } = door({ 'post/63': { post_content: HOME } })
  const answer = await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'wordpress',
        path: '/',
        href: '/about-us',
        to: '/contact-us/',
        text: 'Book a Table',
        records: [{ kind: 'post', id: 63 }],
        rendered: {
          find: '/about-us',
          replace: '/contact-us/',
          path: '/',
          all: 'page',
          expect: 1,
          href: true
        }
      }
    },
    { site: run }
  )
  assert.equal(answer.ok, true)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].action, 'content.update')
  assert.deepEqual(Object.keys(writes[0].params.fields), ['post_content'])
  assert.match(writes[0].params.fields.post_content, /href="\/about-us">About us/)
  // Its own change, never the turn's shared `wp-` id: the sweep reverts call by call.
  assert.match(writes[0].params.apply_id, /^sweep-link-[0-9a-z]+-[0-9a-f]{6}$/)
})

test("WordPress: a navigation block's link moves by its label; a theme-printed one falls to href:true", async () => {
  const nav = '<!-- wp:navigation-link {"label":"Reserve","url":"/reservation","kind":"custom"} /-->'
  const { run, writes } = door({ 'post/5': { post_content: '<p>none</p>' }, 'post/9': { post_content: nav } })
  const params = {
    platform: 'wordpress',
    path: '/',
    href: '/reservation',
    to: '/contact-us/',
    text: 'Reserve'
  }
  await resolveSweepCall(
    {
      action: 'link',
      params: {
        ...params,
        records: [
          { kind: 'post', id: 5 },
          { kind: 'post', id: 9 }
        ]
      }
    },
    { site: run }
  )
  assert.equal(writes.length, 1)
  assert.equal(writes[0].params.id, 9)
  assert.match(writes[0].params.fields.post_content, /"url":"\/contact-us\/"/)
  const theme = door({})
  const rendered = { find: '/x', replace: '/y', path: '/', all: 'page', expect: 1, href: true }
  await resolveSweepCall(
    { action: 'link', params: { ...params, href: '/x', to: '/y', records: [], rendered } },
    { site: theme.run }
  )
  assert.deepEqual(theme.writes, [{ action: 'content.replace', params: rendered }])
})

test("Joomla: a link in an article is rewritten there; a menu item takes the target page's own link", async () => {
  const { run, writes } = door({
    'article/3': { introtext: '<a href="https://www.joomlart.com">Join now</a>' }
  })
  await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'joomla',
        href: 'https://www.joomlart.com',
        to: '/contact-us',
        text: 'Join now',
        records: [{ kind: 'article', id: 3 }]
      }
    },
    { site: run }
  )
  assert.deepEqual(writes[0], {
    action: 'content.update',
    params: {
      kind: 'article',
      id: 3,
      fields: { introtext: '<a href="/contact-us">Join now</a>' },
      apply_id: writes[0].params.apply_id
    }
  })
  assert.match(writes[0].params.apply_id, /^sweep-link-/)
  const menu = door({ 'menuItem/9': { link: 'index.php?option=com_content&view=article&id=2' } })
  await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'joomla',
        href: '/about-us',
        to: '/contact-us',
        records: [{ kind: 'menuItem', id: 9, link: 'index.php?option=com_content&view=article&id=2' }],
        targetLink: 'index.php?option=com_contact&view=contact&id=1'
      }
    },
    { site: menu.run }
  )
  assert.deepEqual(menu.writes[0].params, {
    kind: 'menuItem',
    id: 9,
    fields: { link: 'index.php?option=com_contact&view=contact&id=1' },
    apply_id: menu.writes[0].params.apply_id
  })
})

test('EmDash: a link in an entry goes through tracy_emdash content_update; a menu through menu_set_items', async () => {
  const entry = { data: { title: 'Home', cta_url: 'https://vendor.example', body: 'x' } }
  const { run, writes } = door({ 'pages/home': entry, 'menu/primary': [{ label: 'Book', url: '/book' }] })
  const site = async () => assert.fail('an EmDash call never goes through tracy_site')
  await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'emdash',
        href: 'https://vendor.example',
        to: '/contact',
        records: [{ collection: 'pages', id: 'home', locale: 'en' }]
      }
    },
    { site, emdash: run }
  )
  assert.deepEqual(writes[0], {
    action: 'content_update',
    params: { collection: 'pages', id: 'home', locale: 'en', data: { cta_url: '/contact' } }
  })
  await resolveSweepCall(
    { action: 'link', params: { platform: 'emdash', menu: 'primary', href: '/book', to: '/contact' } },
    { site, emdash: run }
  )
  assert.deepEqual(writes[1], {
    action: 'menu_set_items',
    params: { name: 'primary', items: [{ label: 'Book', url: '/contact' }] }
  })
  // A post's date, planned as EmDash's own call, goes to EmDash.
  await resolveSweepCall(
    { action: 'content_update', params: { collection: 'posts', id: 'p1', data: { date: '2026-10-24' } } },
    { site, emdash: run }
  )
  assert.equal(writes[2].action, 'content_update')
})

test("image: the template file in every size becomes the business's own, the block's attachment id with it", async () => {
  const body = `<!-- wp:image {"id":25,"sizeSlug":"full"} -->
<figure class="wp-block-image size-full"><img src="/wp-content/uploads/2026/10/item-1-1536x864.jpg" class="wp-image-25" srcset="/wp-content/uploads/2026/10/item-1-300x169.jpg 300w"/></figure>
<!-- /wp:image -->`
  const { run, writes } = door({ 'post/63': { post_content: body } })
  const answer = await resolveSweepCall(
    {
      action: 'image',
      params: {
        platform: 'wordpress',
        find: 'item-1-1536x864.jpg',
        attachment: 25,
        media: { id: 301, url: '/wp-content/uploads/2026/10/lr-dining-room.jpg' },
        records: [{ kind: 'post', id: 63 }]
      }
    },
    { site: run }
  )
  assert.equal(answer.ok, true)
  const out = writes[0].params.fields.post_content
  assert.doesNotMatch(out, /item-1/)
  assert.match(out, /"id":301/)
  assert.match(out, /wp-image-301/)
  assert.doesNotMatch(out, /srcset/)
  // Joomla's `images` column and an EmDash entry's picture field take the same file.
  const j = door({ 'article/3': { images: '{"image_intro":"images/item-1.jpg"}' } })
  await resolveSweepCall(
    {
      action: 'image',
      params: {
        platform: 'joomla',
        find: 'item-1.jpg',
        media: { url: 'images/lr/dining.jpg' },
        records: [{ kind: 'article', id: 3 }]
      }
    },
    { site: j.run }
  )
  assert.deepEqual(j.writes[0].params.fields, { images: '{"image_intro":"images/lr/dining.jpg"}' })
  const e = door({ 'posts/p1': { data: { featured_image: { src: '/_emdash/api/media/file/item-1.jpg' } } } })
  await resolveSweepCall(
    {
      action: 'image',
      params: {
        platform: 'emdash',
        find: 'item-1.jpg',
        media: { url: '/_emdash/api/media/file/lr-dining.jpg' },
        records: [{ collection: 'posts', id: 'p1' }]
      }
    },
    { site: async () => assert.fail('EmDash only'), emdash: e.run }
  )
  assert.deepEqual(e.writes[0].params.data, {
    featured_image: { src: '/_emdash/api/media/file/lr-dining.jpg' }
  })
})

test('a long WordPress body the site tool shows as its outline is read and written by its blocks', async () => {
  // The site tool answers a body over 4,000 characters as its outline, without post_content (W2).
  const blocks = [
    `<!-- wp:heading -->\n<h2>Menu</h2>\n<!-- /wp:heading -->`,
    `<!-- wp:image {"id":102} -->\n<figure class="wp-block-image"><img src="/wp-content/uploads/2026/10/item-2-1.jpg" class="wp-image-102"/></figure>\n<!-- /wp:image -->`,
    `<!-- wp:paragraph -->\n<p><a class="btn" href="/reservation">View full menu</a></p>\n<!-- /wp:paragraph -->`
  ]
  const writes = []
  const run = async (action, params) => {
    if (action === 'content.get' && params.block)
      return {
        ok: true,
        item: { ID: 63 },
        rev: 'r1',
        blocks: params.block.map((i) => ({ i, markup: blocks[i] }))
      }
    if (action === 'content.get')
      return {
        ok: true,
        item: { ID: 63, post_content_chars: 52383 },
        rev: 'r1',
        outline: blocks.map((_, i) => ({ i }))
      }
    writes.push({ action, params })
    return { ok: true }
  }
  const image = await resolveSweepCall(
    {
      action: 'image',
      params: {
        platform: 'wordpress',
        find: 'item-2-1.jpg',
        attachment: 102,
        media: { id: 301, url: '/wp-content/uploads/2026/10/lr-room.jpg' },
        records: [{ kind: 'post', id: 63 }]
      }
    },
    { site: run }
  )
  assert.equal(image.ok, true)
  assert.deepEqual(Object.keys(writes[0].params.blocks), ['1'])
  assert.equal(writes[0].params.rev, 'r1')
  assert.match(writes[0].params.blocks['1'], /lr-room\.jpg/)
  assert.match(writes[0].params.blocks['1'], /wp-image-301/)
  assert.equal(writes[0].params.fields, undefined)
  const link = await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'wordpress',
        href: '/reservation',
        to: '/#menu',
        text: 'View full menu',
        records: [{ kind: 'post', id: 63 }]
      }
    },
    { site: run }
  )
  assert.equal(link.ok, true)
  assert.deepEqual(Object.keys(writes[1].params.blocks), ['2'])
  assert.match(writes[1].params.blocks['2'], /href="\/#menu"/)
})

test('a record that does not hold the link is refused, never widened to another', async () => {
  const { run, writes } = door({ 'post/5': { post_content: '<a href="/a">A</a>' } })
  const answer = await resolveSweepCall(
    {
      action: 'link',
      params: { platform: 'wordpress', href: '/b', to: '/c', records: [{ kind: 'post', id: 5 }] }
    },
    { site: run }
  )
  assert.equal(answer.ok, false)
  assert.equal(answer.code, 'NOT_FOUND')
  assert.equal(writes.length, 0)
})

test('a template post left unwritten: one placeholder paragraph by position, read this call, with its fields', async () => {
  const body =
    '<!-- wp:paragraph -->\n<p>Convallis</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:quote -->\n<blockquote><p>Q</p></blockquote>\n<!-- /wp:quote -->'
  const { run, writes } = door({ 'post/58': { post_content: body } })
  const answer = await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: { post_title: 'Menu item' },
        body: 'Menu item'
      }
    },
    { site: run }
  )
  assert.equal(answer.ok, true)
  assert.equal(writes[0].action, 'content.update')
  assert.deepEqual(writes[0].params.blocks, {
    0: '<!-- wp:paragraph -->\n<p>Menu item</p>\n<!-- /wp:paragraph -->',
    1: null
  })
  assert.match(writes[0].params.rev, /^[0-9a-f]{12}$/)
  assert.deepEqual(writes[0].params.fields, { post_title: 'Menu item' })
  assert.match(writes[0].params.apply_id, /^sweep-post-/)
})

test('a long template post the site tool shows as its outline is read and written by its blocks', async () => {
  // Build 16 (25/10/2026): 4,674-character template posts came back NOT_FOUND, read whole with no post_content.
  const blocks = [
    '<!-- wp:paragraph -->\n<p>Convallis</p>\n<!-- /wp:paragraph -->',
    '<!-- wp:quote -->\n<blockquote><p>Q</p></blockquote>\n<!-- /wp:quote -->'
  ]
  const writes = []
  const run = async (action, params) => {
    if (action === 'content.get' && params.block)
      return {
        ok: true,
        item: { ID: 44 },
        rev: 'r7',
        blocks: params.block.map((i) => ({ i, markup: blocks[i] }))
      }
    if (action === 'content.get')
      return {
        ok: true,
        item: { ID: 44, post_content_chars: 4674 },
        rev: 'r7',
        outline: blocks.map((_, i) => ({ i }))
      }
    writes.push({ action, params })
    return { ok: true }
  }
  const answer = await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 44,
        fields: { post_title: 'Menu item' },
        body: 'Menu item',
        template: blocks.join('\n\n')
      }
    },
    { site: run }
  )
  assert.deepEqual(answer, { ok: true, count: 2 })
  assert.equal(writes[0].action, 'content.update')
  assert.equal(writes[0].params.rev, 'r7')
  assert.deepEqual(writes[0].params.blocks, {
    0: '<!-- wp:paragraph -->\n<p>Menu item</p>\n<!-- /wp:paragraph -->',
    1: null
  })
  assert.deepEqual(writes[0].params.fields, { post_title: 'Menu item' })
})

test("a template post whose picture the agent placed: only the template's own blocks give way, the agent's stays", async () => {
  const prose = '<!-- wp:paragraph -->\n<p>Convallis</p>\n<!-- /wp:paragraph -->'
  const quote = '<!-- wp:quote -->\n<blockquote><p>Q</p></blockquote>\n<!-- /wp:quote -->'
  const theirs = '<!-- wp:image {"id":9} -->\n<figure><img src="/t/news-1.jpg"/></figure>\n<!-- /wp:image -->'
  const ours = '<!-- wp:image {"id":301} -->\n<figure><img src="/u/a.jpg"/></figure>\n<!-- /wp:image -->'
  const { run, writes } = door({ 'post/58': { post_content: [ours, prose, quote].join('\n\n') } })
  const answer = await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: {},
        body: 'Menu item',
        template: [theirs, prose, quote].join('\n\n')
      }
    },
    { site: run }
  )
  assert.deepEqual(answer, { ok: true, count: 2 })
  assert.deepEqual(writes[0].params.blocks, {
    1: '<!-- wp:paragraph -->\n<p>Menu item</p>\n<!-- /wp:paragraph -->',
    2: null
  })
})

test("a group whose picture the agent changed: the template's prose inside it gives way, the agent's picture stays", async () => {
  const prose = '<!-- wp:paragraph -->\n<p>Convallis lorem of the template</p>\n<!-- /wp:paragraph -->'
  const heading = '<!-- wp:heading -->\n<h2>Template heading</h2>\n<!-- /wp:heading -->'
  const quote = '<!-- wp:quote -->\n<blockquote><p>Q</p></blockquote>\n<!-- /wp:quote -->'
  const theirs = '<!-- wp:image {"id":9} -->\n<figure><img src="/t/news-1.jpg"/></figure>\n<!-- /wp:image -->'
  const ours = '<!-- wp:image {"id":301} -->\n<figure><img src="/u/a.jpg"/></figure>\n<!-- /wp:image -->'
  const group = (...inner) =>
    `<!-- wp:group {"className":"news"} -->\n<div class="wp-block-group news">${inner.join('\n\n')}</div>\n<!-- /wp:group -->`
  const placeholder = '<!-- wp:paragraph -->\n<p>Menu item</p>\n<!-- /wp:paragraph -->'
  const call = (body, template) => ({
    action: 'post',
    params: { platform: 'wordpress', kind: 'post', id: 58, fields: {}, body: 'Menu item', template }
  })
  // The group first, a template quote after it: the group's prose is the first to go, so it takes the placeholder.
  const first = door({ 'post/58': { post_content: [group(ours, prose), quote].join('\n\n') } })
  const answer = await resolveSweepCall(
    call([group(ours, prose), quote].join('\n\n'), [group(theirs, prose), quote].join('\n\n')),
    {
      site: first.run
    }
  )
  assert.deepEqual(answer, { ok: true, count: 2 })
  assert.deepEqual(first.writes[0].params.blocks, { 0: group(ours, placeholder), 1: null })
  assert.match(first.writes[0].params.rev, /^[0-9a-f]{12}$/)
  // A group nested in a group, the agent's picture and the template's heading and prose in it.
  const nested = (...inner) =>
    `<!-- wp:group -->\n<div class="wp-block-group">${group(...inner)}</div>\n<!-- /wp:group -->`
  const second = door({ 'post/58': { post_content: nested(ours, heading, prose) } })
  assert.deepEqual(
    await resolveSweepCall(call(nested(ours, heading, prose), nested(theirs, heading, prose)), {
      site: second.run
    }),
    {
      ok: true,
      count: 2
    }
  )
  assert.deepEqual(second.writes[0].params.blocks, { 0: nested(ours, placeholder, '') })
  // Prose the agent wrote inside the group stays: only the template's own words give way.
  const mine = '<!-- wp:paragraph -->\n<p>Our terrace opens in spring.</p>\n<!-- /wp:paragraph -->'
  const third = door({ 'post/58': { post_content: group(ours, mine) } })
  assert.deepEqual(
    await resolveSweepCall(call(group(ours, mine), group(theirs, prose)), { site: third.run }),
    {
      ok: true,
      count: 0
    }
  )
  assert.deepEqual(third.writes, [])
})

test('ownChange: each sweep call writes under one id of its own; a named id and a read pass as sent', async () => {
  const sent = []
  const run = async (name, params) => sent.push({ name, params })
  const first = ownChange(run, 'image')
  await first('content.get', { kind: 'post', id: 1 })
  await first('content.update', { kind: 'post', id: 1, fields: {} })
  await first('content.update', { kind: 'post', id: 2, fields: {} })
  await first('media.upload', { path: 'a.png', apply_id: 'sweep-logo-x' })
  await ownChange(run, 'image')('content.update', { kind: 'post', id: 3, fields: {} })
  assert.equal(sent[0].params.apply_id, undefined)
  assert.match(sent[1].params.apply_id, /^sweep-image-/)
  assert.equal(sent[2].params.apply_id, sent[1].params.apply_id)
  assert.equal(sent[3].params.apply_id, 'sweep-logo-x')
  assert.notEqual(sent[4].params.apply_id, sent[1].params.apply_id)
})

test('one call for buttons sharing an address: each named button moves, another anchor there stays', async () => {
  const html =
    '<a href="http://v.example">Facebook</a><a href="http://v.example">Twitter</a><a href="http://v.example">Shop</a>'
  const r = relink(html, 'http://v.example', '/contact-us/', ['facebook', 'TWITTER'])
  assert.equal(r.count, 2)
  assert.match(r.html, /href="http:\/\/v.example">Shop/)
})

test("a drawn wordmark is uploaded under a new name and set as WordPress's site_logo", async () => {
  const writes = []
  const run = async (action, params) => {
    writes.push({ action, params })
    return action === 'media.upload' ? { ok: true, attachment: 88 } : { ok: true }
  }
  const png = Buffer.from('wordmark').toString('base64')
  const answer = await resolveSweepCall(
    {
      action: 'logo',
      params: { platform: 'wordpress', path: '/', find: 'jd-site-logo.png', png, name: 'Ramen Bar' }
    },
    { site: run }
  )
  assert.deepEqual(answer, { ok: true, count: 1, attachment: 88 })
  assert.equal(writes[0].action, 'media.upload')
  assert.match(writes[0].params.path, /^wp-content\/uploads\/tracy-brand\/logo-[0-9a-f]{16}-\d+\.png$/)
  assert.equal(writes[0].params.content_b64, png)
  assert.deepEqual(writes[1], {
    action: 'content.update',
    params: {
      kind: 'option',
      id: 0,
      key: 'site_logo',
      // A string, as WordPress keeps an option: a number reads back changed and the change cannot be reverted.
      fields: { value: '88' },
      apply_id: writes[0].params.apply_id
    }
  })
  assert.match(writes[0].params.apply_id, /^sweep-logo-/)
})

test("the research's imported logo is set by its media id, nothing uploaded", async () => {
  const { run, writes } = door({})
  const answer = await resolveSweepCall(
    {
      action: 'logo',
      params: { platform: 'wordpress', path: '/', find: 'logo.png', media: { url: '/u/l.png', id: 41 } }
    },
    { site: run }
  )
  assert.equal(answer.ok, true)
  assert.deepEqual(
    writes.map((w) => [w.action, w.params.key, w.params.fields?.value]),
    [['content.update', 'site_logo', '41']]
  )
})

test('a CMS the sweep has no logo writer for answers the logo unresolved, writing nothing', async () => {
  const { run, writes } = door({})
  for (const platform of ['joomla', 'emdash']) {
    const answer = await resolveSweepCall(
      { action: 'logo', params: { platform, path: '/', find: 'logo.png', png: 'AAAA' } },
      { site: run, emdash: run }
    )
    assert.equal(answer.code, 'NEEDS_LOGO_DOOR')
    assert.equal(answer.unresolved, true)
    assert.match(answer.error, new RegExp(`no logo writer for ${platform}`))
  }
  assert.equal(writes.length, 0)
})

/** A WordPress site whose `media.usage` answers `pages` in turn, and whose replacement picture has `sizes`. */
function storage(pages, sizes = { medium_large: { file: 'lr-wide-768x432.jpg' } }) {
  const writes = []
  const reads = []
  const site = async (action, params) => {
    if (action === 'content.get')
      return params.key === '_wp_attachment_metadata' && params.id === 302
        ? { ok: true, value: { file: '2026/10/lr-wide.jpg', sizes } }
        : { ok: false, code: 'NOT_FOUND' }
    writes.push({ action, params })
    return { ok: true }
  }
  const usage = async (action, params) => {
    reads.push({ action, params })
    return pages[reads.length - 1] ?? { ok: false, code: 'read_failed', error: 'no more pages' }
  }
  return { site, usage, writes, reads }
}

const complete = (through = 900) => ({
  postmeta: { after: 0, through, lastId: through, complete: true },
  options: { after: 0, through: 40, lastId: 40, complete: true }
})
const USAGE_CALL = {
  action: 'usage',
  params: {
    platform: 'wordpress',
    path: '/',
    find: 'business-1.jpg',
    url: 'https://diner.test/wp-content/uploads/2026/10/business-1.jpg',
    media: { url: 'https://diner.test/wp-content/uploads/2026/10/lr-wide.jpg', id: 302 }
  }
}

test('usage: each post meta and option holding the template picture keeps its shape, under an apply id of its own', async () => {
  const { site, usage, writes, reads } = storage([
    {
      ok: true,
      id: 25,
      usedInStorage: {
        postmeta: [
          { post_id: 41, key: 'jd_card_image', shape: 'id' },
          { post_id: 41, key: 'jd_card_image', shape: 'id' },
          { post_id: 63, key: 'jd_banner_url', shape: 'url', size: 'medium_large' },
          { post_id: 63, key: 'jd_full_url', shape: 'url', size: 'full' },
          { post_id: 70, key: 'jd_gallery', shape: 'serialized' }
        ],
        options: [
          { option: 'wp_ja_diner_blog_banner_image', shape: 'url', size: 'full' },
          { option: 'site_icon', shape: 'id', locked: true },
          { option: 'jd_pinned', shape: 'id', pinned: true }
        ],
        truncated: false,
        scanned: complete()
      }
    }
  ])
  const answer = await resolveSweepCall(USAGE_CALL, { site, usage })
  assert.deepEqual(reads, [{ action: 'media.usage', params: { url: USAGE_CALL.params.url } }])
  assert.deepEqual(
    writes.map((w) => [w.params.kind, w.params.id, w.params.key, w.params.fields.value]),
    [
      ['postmeta', 41, 'jd_card_image', '302'],
      ['postmeta', 63, 'jd_banner_url', 'https://diner.test/wp-content/uploads/2026/10/lr-wide-768x432.jpg'],
      ['postmeta', 63, 'jd_full_url', 'https://diner.test/wp-content/uploads/2026/10/lr-wide.jpg'],
      [
        'option',
        0,
        'wp_ja_diner_blog_banner_image',
        'https://diner.test/wp-content/uploads/2026/10/lr-wide.jpg'
      ]
    ]
  )
  assert.ok(
    writes.every((w) => w.action === 'content.update' && w.params.apply_id.startsWith('sweep-usage-'))
  )
  assert.equal(new Set(writes.map((w) => w.params.apply_id)).size, writes.length)
  assert.equal(answer.ok, true)
  assert.equal(answer.count, 4)
  assert.deepEqual(
    answer.left.map((l) => l.split(' ').slice(0, 4).join(' ')),
    ['post 70 meta jd_gallery', 'option site_icon is one', 'option jd_pinned is pinned']
  )
})

test('usage: a sized copy the Media Library does not know is looked up by its original, as the plugin refuses', async () => {
  const sized = 'https://diner.test/wp-content/uploads/2026/10/item-2-1024x576.jpg'
  const call = { action: 'usage', params: { ...USAGE_CALL.params, find: 'item-2-1024x576.jpg', url: sized } }
  const { site, usage, writes, reads } = storage([
    { ok: false, error: 'not_found', message: 'url did not resolve to one attachment' },
    {
      ok: true,
      usedInStorage: {
        postmeta: [{ post_id: 41, key: 'jd_card_image', shape: 'id' }],
        options: [],
        truncated: false,
        scanned: complete()
      }
    }
  ])
  const answer = await resolveSweepCall(call, { site, usage })
  assert.deepEqual(
    reads.map((r) => r.params.url),
    [sized, 'https://diner.test/wp-content/uploads/2026/10/item-2.jpg']
  )
  assert.deepEqual([answer.ok, answer.count], [true, 1])
  assert.deepEqual(
    writes.map((w) => w.params.fields.value),
    ['302']
  )
  // Not in the library under either name: NOT_FOUND from the plugin's own `error` slug, its message said.
  const none = storage([
    { ok: false, error: 'not_found', message: 'url did not resolve to one attachment' },
    { ok: false, error: 'not_found', message: 'url did not resolve to one attachment' }
  ])
  const gone = await resolveSweepCall(call, { site: none.site, usage: none.usage })
  assert.deepEqual([gone.code, gone.unresolved, none.reads.length], ['NOT_FOUND', true, 2])
})

test('usage: a walk cut short resumes after where it stopped; a size the replacement lacks is reported', async () => {
  const { site, usage, writes, reads } = storage(
    [
      {
        ok: true,
        usedInStorage: {
          postmeta: [{ post_id: 41, key: 'jd_card_image', shape: 'id' }],
          options: [],
          truncated: true,
          scanned: {
            postmeta: { after: 0, through: 100000, lastId: 250000, complete: false },
            options: { after: 0, through: 40, lastId: 40, complete: true }
          }
        }
      },
      {
        ok: true,
        usedInStorage: {
          postmeta: [{ post_id: 90, key: 'jd_thumb_url', shape: 'url', size: 'thumbnail' }],
          options: [],
          truncated: false,
          scanned: complete(250000)
        }
      }
    ],
    {}
  )
  const answer = await resolveSweepCall(USAGE_CALL, { site, usage })
  assert.deepEqual(reads[1].params.after, { postmeta: 100000, options: 40 })
  assert.deepEqual(
    writes.map((w) => [w.params.id, w.params.key]),
    [[41, 'jd_card_image']]
  )
  assert.equal(answer.ok, true)
  assert.match(answer.left[0], /post 90 meta jd_thumb_url holds the thumbnail size/)
})

test('usage: an error is never read as "held nowhere", and nothing is written', async () => {
  for (const page of [
    { ok: false, code: 'read_failed', error: 'could not search post bodies' },
    {
      ok: true,
      usedInStorage: { postmeta: [], options: [], truncated: true, errors: { postmeta: 'Table is locked' } }
    },
    { ok: true, usedInStorage: { postmeta: [], options: [], truncated: true, error: 'boom' } },
    { ok: true, usedIn: [] }
  ]) {
    const { site, usage, writes } = storage([page])
    const answer = await resolveSweepCall(USAGE_CALL, { site, usage })
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'USAGE_READ_FAILED')
    assert.equal(answer.unresolved, true)
    assert.deepEqual(writes, [])
  }
  // A walk that says it was cut but did not move is not read again.
  const stuck = {
    ok: true,
    usedInStorage: {
      postmeta: [],
      options: [],
      truncated: true,
      scanned: {
        postmeta: { after: 0, through: 0, lastId: 9, complete: false },
        options: { after: 0, through: 0, lastId: 9, complete: false }
      }
    }
  }
  const s = storage([stuck, stuck])
  const answer = await resolveSweepCall(USAGE_CALL, { site: s.site, usage: s.usage })
  assert.equal(answer.code, 'USAGE_READ_FAILED')
  assert.equal(s.reads.length, 1)
  // The picture is not in the Media Library: said, nothing written.
  const missing = storage([{ ok: false, code: 'not_found', error: 'url did not resolve to one attachment' }])
  const gone = await resolveSweepCall(USAGE_CALL, { site: missing.site, usage: missing.usage })
  assert.deepEqual([gone.code, gone.unresolved], ['NOT_FOUND', true])
})

test('usage: off WordPress, or with no door to ask, the picture waits unresolved; the contract unknown holds every option', async () => {
  const off = await resolveSweepCall(
    { action: 'usage', params: { ...USAGE_CALL.params, platform: 'joomla' } },
    storage([])
  )
  assert.deepEqual([off.code, off.unresolved], ['NEEDS_USAGE_DOOR', true])
  const noDoor = await resolveSweepCall(USAGE_CALL, { site: storage([]).site })
  assert.equal(noDoor.code, 'NEEDS_USAGE_DOOR')
  const { site, usage, writes } = storage([
    {
      ok: true,
      usedInStorage: {
        postmeta: [],
        options: [{ option: 'jd_banner', shape: 'id' }],
        truncated: false,
        scanned: complete(),
        pinnedUnknown: true
      }
    }
  ])
  const answer = await resolveSweepCall(USAGE_CALL, { site, usage })
  assert.deepEqual(writes, [])
  assert.equal(answer.code, 'NOT_WRITTEN')
  assert.match(answer.error, /option jd_banner may be pinned/)
})

test('EmDash: an entry read in the answer shape tracy_emdash really gives (`result.item`) is relinked and re-pictured', async () => {
  const stored = {
    status: 'published',
    data: { cta_url: 'https://vendor.example', hero: { src: '/uploads/hero-template.jpg' } }
  }
  const writes = []
  // runEmdashTool answers `{ ok, site, tool, result: { item } }`, never a bare `item`.
  const emdash = async (action, params) => {
    if (action === 'content_get')
      return {
        ok: true,
        site: 's',
        tool: action,
        result: { item: { id: params.id, _rev: 'r1', ...structuredClone(stored) } }
      }
    writes.push({ action, params })
    return { ok: true, site: 's', tool: action, result: {} }
  }
  const site = async () => assert.fail('an EmDash call never goes through tracy_site')
  const record = { collection: 'pages', id: 'home', locale: 'en' }
  const link = await resolveSweepCall(
    {
      action: 'link',
      params: { platform: 'emdash', href: 'https://vendor.example', to: '/contact', records: [record] }
    },
    { site, emdash }
  )
  assert.equal(link.ok, true, JSON.stringify(link))
  assert.deepEqual(writes[0].params.data, { cta_url: '/contact' })
  // A live entry is written live: without `status:"published"` EmDash only stages a draft (`live:false`).
  assert.equal(writes[0].params.status, 'published')
  const image = await resolveSweepCall(
    {
      action: 'image',
      params: {
        platform: 'emdash',
        find: 'hero-template.jpg',
        media: { url: '/uploads/hero-own.jpg' },
        records: [record]
      }
    },
    { site, emdash }
  )
  assert.equal(image.ok, true, JSON.stringify(image))
  assert.equal(writes[1].params.data.hero.src, '/uploads/hero-own.jpg')
  assert.equal(writes[1].params.status, 'published')
})

test('terms: a WordPress term whose description is still lorem is cleared; a real one is left alone', async () => {
  const sql = [
    "INSERT INTO `wp_term_taxonomy` VALUES (1,1,'category','',0,3),(2,5,'category','Lorem ipsum dolor sit amet (x).',0,2),",
    "(3,7,'post_tag','Our Sunday brunch.',0,1);"
  ].join('')
  const records = {
    'term/1/category': { name: 'Uncategorized', description: '' },
    'term/5/category': { name: 'News', description: 'Lorem ipsum dolor sit amet (x).' },
    'term/7/post_tag': { name: 'Brunch', description: 'Our Sunday brunch.' }
  }
  const writes = []
  const run = async (action, params) => {
    if (action === 'db.tables') return { ok: true, tables: ['wp_posts', 'wp_term_taxonomy'] }
    if (action === 'db.dump')
      return { ok: true, sql_b64: Buffer.from(sql).toString('base64'), rows: 3, total: 3, done: true }
    if (action === 'content.get')
      return { ok: true, item: records[`${params.kind}/${params.id}/${params.key}`] }
    writes.push({ action, params })
    return { ok: true }
  }
  const answer = await resolveSweepCall({ action: 'terms', params: { platform: 'wordpress' } }, { site: run })
  assert.deepEqual(answer, { ok: true, count: 1, cleared: ['category 5'] })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].action, 'content.update')
  assert.deepEqual(
    { ...writes[0].params, apply_id: undefined },
    { kind: 'term', key: 'category', id: 5, fields: { description: '' }, apply_id: undefined }
  )
  assert.match(writes[0].params.apply_id, /^sweep-terms-/)
})

test('terms: a Joomla category and an EmDash term still lorem are cleared through their own doors', async () => {
  const joomla = door({
    'category/8': { title: 'Blog', description: '<p>Lorem ipsum dolor sit amet.</p>' },
    'category/9': { title: 'Menu', description: '<p>Our dishes.</p>' }
  })
  const site = async (action, params) =>
    action === 'content.list' ? { ok: true, items: [{ id: 8 }, { id: 9 }] } : joomla.run(action, params)
  const j = await resolveSweepCall({ action: 'terms', params: { platform: 'joomla' } }, { site })
  assert.deepEqual(j, { ok: true, count: 1, cleared: ['category 8'] })
  assert.deepEqual(
    joomla.writes.map((w) => [w.params.kind, w.params.id, w.params.fields]),
    [['category', 8, { description: '' }]]
  )
  const sent = []
  const emdash = async (tool, args) => {
    if (tool === 'taxonomy_list') return { items: [{ name: 'categories' }] }
    if (tool === 'taxonomy_list_terms')
      return {
        items: [
          { slug: 'news', description: 'Lorem ipsum.' },
          { slug: 'menu', description: 'Dishes.' }
        ]
      }
    sent.push({ tool, args })
    return { ok: true }
  }
  const e = await resolveSweepCall(
    { action: 'terms', params: { platform: 'emdash' } },
    { site: async () => ({ ok: false }), emdash }
  )
  assert.deepEqual(e, { ok: true, count: 1, cleared: ['categories news'] })
  assert.deepEqual(sent, [
    { tool: 'taxonomy_update_term', args: { taxonomy: 'categories', termSlug: 'news', description: '' } }
  ])
})

// 🔒 Review of round 12 (26/10/2026): a Joomla article's or EmDash entry's body is written like WordPress's, only
// while the field still holds the template's words, read this call; a body the agent wrote since is kept.
test("a Joomla or EmDash template post's body: written over the template's own, read this call, never over the agent's", async () => {
  const introtext = '<p>Lorem ipsum of the template.</p>'
  const call = {
    action: 'post',
    params: {
      platform: 'joomla',
      kind: 'article',
      id: 7,
      fields: { title: 'Reservations' },
      bodyFields: { introtext: '<p>Groups can book.</p>', fulltext: '' },
      template: { introtext, fulltext: '<p>More lorem.</p>' }
    }
  }
  const picture = '<img src="images/tracy/a.jpg" alt="">'
  const joomla = door({
    'article/7': {
      introtext: `${picture}<p>Lorem ipsum of the template.</p>`,
      fulltext: '<p>More lorem.</p>'
    }
  })
  assert.deepEqual(await resolveSweepCall(call, { site: joomla.run }), { ok: true, count: 2 })
  assert.equal(joomla.writes[0].action, 'content.update')
  assert.deepEqual(joomla.writes[0].params.fields, {
    title: 'Reservations',
    introtext: `${picture}<p>Groups can book.</p>`,
    fulltext: ''
  })
  // The agent wrote the intro since the plan: only its title and the template's fulltext are written.
  const theirs = door({ 'article/7': { introtext: '<p>Our own story.</p>', fulltext: '<p>More lorem.</p>' } })
  assert.deepEqual(await resolveSweepCall(call, { site: theirs.run }), { ok: true, count: 1 })
  assert.deepEqual(theirs.writes[0].params.fields, { title: 'Reservations', fulltext: '' })
  const block = (text) => ({
    _type: 'block',
    _key: 'k',
    style: 'normal',
    children: [{ _type: 'span', text }]
  })
  const emdash = door({
    'posts/p1': { status: 'published', data: { title: 'Sample', content: [block('Lorem.')] } }
  })
  const site = door({})
  const answer = await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'emdash',
        collection: 'posts',
        id: 'p1',
        locale: 'en',
        fields: { title: 'Hours' },
        bodyFields: { content: [block('Monday 09:00-22:00.')] },
        template: { content: [block('Lorem.')] }
      }
    },
    { site: site.run, emdash: emdash.run }
  )
  assert.deepEqual(answer, { ok: true, count: 1 })
  assert.equal(site.writes.length, 0)
  assert.deepEqual(emdash.writes, [
    {
      action: 'content_update',
      params: {
        collection: 'posts',
        id: 'p1',
        locale: 'en',
        data: { title: 'Hours', content: [block('Monday 09:00-22:00.')] },
        status: 'published'
      }
    }
  ])
})

// 🔒 Review of round 12, second pass (26/10/2026): the sweep's plain fields were written unchecked, so a title the
// agent changed after the plan was overwritten. Each field it planned over (`was`) is written only while it holds it.
test('a post field the agent changed after the sweep planned is kept: every sweep post write checks its fields', async () => {
  const lorem = '<p>Lorem ipsum of the template.</p>'
  const joomla = door({ 'article/7': { title: 'Our own title', introtext: lorem } })
  const j = await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'joomla',
        kind: 'article',
        id: 7,
        fields: { title: 'Reservations' },
        was: { title: 'Sample 7' },
        bodyFields: { introtext: '<p>Groups can book.</p>' },
        template: { introtext: lorem }
      }
    },
    { site: joomla.run }
  )
  assert.deepEqual(j, { ok: true, count: 1 })
  assert.deepEqual(joomla.writes[0].params.fields, { introtext: '<p>Groups can book.</p>' })
  // WordPress: the body is written, the title the agent changed is not; a featured picture carries no `was`.
  const body = '<!-- wp:paragraph -->\n<p>Lorem ipsum.</p>\n<!-- /wp:paragraph -->'
  const wp = door({
    'post/58': { post_title: 'Our own title', post_date: '2021-09-10 01:38:00', post_content: body }
  })
  await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: { post_title: 'Reservations', post_date: '2026-10-24 00:00:00', featured_image_id: 301 },
        was: { post_title: 'Burger King takes a stand', post_date: '2021-09-10 01:38:00' },
        body: 'Groups can book.',
        template: body
      }
    },
    { site: wp.run }
  )
  assert.deepEqual(wp.writes[0].params.fields, { post_date: '2026-10-24 00:00:00', featured_image_id: 301 })
  // A plain update of the sweep, on WordPress or Joomla and on EmDash: the changed field is dropped, the rest kept.
  const plain = door({ 'post/59': { post_title: 'Our own title', post_excerpt: 'Convallis nulla mauris.' } })
  const p = await resolveSweepCall(
    {
      action: 'content.update',
      params: {
        kind: 'post',
        id: 59,
        fields: { post_title: 'Hours', post_excerpt: 'Open daily.' },
        was: { post_title: 'Sample 59', post_excerpt: 'Convallis nulla mauris.' }
      }
    },
    { site: plain.run }
  )
  assert.deepEqual(p, { ok: true, count: 1 })
  assert.deepEqual(
    plain.writes.map((w) => [w.action, w.params.fields]),
    [['content.update', { post_excerpt: 'Open daily.' }]]
  )
  const emdash = door({ 'posts/p1': { status: 'published', data: { title: 'Our own title' } } })
  const e = await resolveSweepCall(
    {
      action: 'content_update',
      params: {
        collection: 'posts',
        id: 'p1',
        data: { title: 'Hours' },
        was: { title: 'Sample' },
        status: 'published'
      }
    },
    { site: door({}).run, emdash: emdash.run }
  )
  assert.deepEqual(e, { ok: true, count: 0 })
  assert.deepEqual(emdash.writes, [])
})

test('a link to a moved post counted by the plan: a record holding another number of them is refused unwritten', async () => {
  const page = '<p><a href="/burger/">Read</a> <a href="/burger/">More</a></p>'
  const wp = door({ 'post/2': { post_content: page } })
  const call = (expect) => ({
    action: 'link',
    params: {
      platform: 'wordpress',
      href: '/burger/',
      to: '/reservations/',
      records: [{ kind: 'post', id: 2 }],
      expect
    }
  })
  const off = await resolveSweepCall(call(1), { site: wp.run })
  assert.equal(off.ok, false)
  assert.equal(off.code, 'COUNT_MISMATCH')
  assert.deepEqual(wp.writes, [])
  const on = await resolveSweepCall(call(2), { site: wp.run })
  assert.equal(on.ok, true)
  assert.equal(
    wp.writes[0].params.fields.post_content,
    '<p><a href="/reservations/">Read</a> <a href="/reservations/">More</a></p>'
  )
  // EmDash: an entry's field and a menu, each counted.
  const emdash = door({
    'pages/home': { data: { hero: { cta_url: '/posts/sample' } } },
    'menu/primary': [
      { label: 'Story', url: '/posts/sample' },
      { label: 'Again', url: '/posts/sample' }
    ]
  })
  const site = async () => assert.fail('an EmDash call never goes through tracy_site')
  const entry = await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'emdash',
        href: '/posts/sample',
        to: '/posts/our-story',
        records: [{ collection: 'pages', id: 'home' }],
        expect: 2
      }
    },
    { site, emdash: emdash.run }
  )
  assert.equal(entry.code, 'COUNT_MISMATCH')
  const menu = await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'emdash',
        menu: 'primary',
        href: '/posts/sample',
        to: '/posts/our-story',
        expect: 1
      }
    },
    { site, emdash: emdash.run }
  )
  assert.equal(menu.code, 'COUNT_MISMATCH')
  assert.deepEqual(emdash.writes, [])
})

test("a post's slug written with its title: EmDash's beside the data, kept only while the entry holds the planned one", async () => {
  const lorem = '<p>Lorem ipsum of the template.</p>'
  const call = {
    action: 'post',
    params: {
      platform: 'emdash',
      collection: 'posts',
      id: 'p1',
      locale: 'en',
      fields: { title: 'Reservations' },
      slug: 'reservations',
      was: { title: 'Sample', slug: 'sample' },
      bodyFields: {},
      template: {}
    }
  }
  const site = async () => assert.fail('an EmDash call never goes through tracy_site')
  const held = door({
    'posts/p1': { status: 'published', slug: 'sample', data: { title: 'Sample', body: lorem } }
  })
  const a = await resolveSweepCall(call, { site, emdash: held.run })
  assert.equal(a.ok, true)
  assert.deepEqual(held.writes[0], {
    action: 'content_update',
    params: {
      collection: 'posts',
      id: 'p1',
      locale: 'en',
      data: { title: 'Reservations' },
      slug: 'reservations',
      status: 'published'
    }
  })
  // The agent gave the entry a slug of its own since the plan: the title is still the template's and is written,
  // the slug is not.
  const moved = door({
    'posts/p1': { status: 'published', slug: 'our-story', data: { title: 'Sample', body: lorem } }
  })
  await resolveSweepCall(call, { site, emdash: moved.run })
  assert.deepEqual(moved.writes[0].params.data, { title: 'Reservations' })
  assert.ok(!('slug' in moved.writes[0].params))
  // A plain update carries the same rule.
  const plain = door({ 'posts/p2': { status: 'published', slug: 'our-own', data: { title: 'Sample 2' } } })
  const p = await resolveSweepCall(
    {
      action: 'content_update',
      params: {
        platform: 'emdash',
        collection: 'posts',
        id: 'p2',
        data: { title: 'Hours' },
        slug: 'hours',
        was: { title: 'Sample 2', slug: 'sample-2' }
      }
    },
    { site, emdash: plain.run }
  )
  assert.equal(p.count, 1)
  assert.ok(!('slug' in plain.writes[0].params))
})

test('the slug a post write left is read back and answered, never assumed: WordPress makes it unique itself', async () => {
  const records = {
    'post/58': { post_title: 'Burger King takes a stand', post_name: 'burger-king-takes-a-stand' }
  }
  const writes = []
  const run = async (action, params) => {
    if (action === 'content.get')
      return { ok: true, item: structuredClone(records[`${params.kind}/${params.id}`]) }
    writes.push({ action, params })
    // WordPress stores `reservations-2`: another post already holds `reservations`.
    Object.assign(records[`${params.kind}/${params.id}`], params.fields, { post_name: 'reservations-2' })
    return { ok: true }
  }
  const a = await resolveSweepCall(
    {
      action: 'content.update',
      params: {
        kind: 'post',
        id: 58,
        fields: { post_title: 'Reservations', post_name: 'reservations' },
        was: { post_title: 'Burger King takes a stand', post_name: 'burger-king-takes-a-stand' }
      }
    },
    { site: run }
  )
  assert.deepEqual(a, { ok: true, count: 2, slug: 'reservations-2' })
  assert.deepEqual(writes[0].params.fields, { post_title: 'Reservations', post_name: 'reservations' })
  // Joomla's alias, through the template post's write.
  const joomla = door({
    'article/7': { title: 'Sample 7', alias: 'sample-7', introtext: '<p>Lorem ipsum.</p>' }
  })
  const j = await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'joomla',
        kind: 'article',
        id: 7,
        fields: { title: 'Reservations', alias: 'reservations' },
        was: { title: 'Sample 7', alias: 'sample-7' },
        bodyFields: {},
        template: {}
      }
    },
    { site: joomla.run }
  )
  assert.deepEqual(joomla.writes[0].params.fields, { title: 'Reservations', alias: 'reservations' })
  // The door keeps no write, so the read-back answers what the article holds.
  assert.equal(j.slug, 'sample-7')
  // EmDash's entry slug.
  const emdash = door({ 'posts/p1': { status: 'published', slug: 'sample', data: { title: 'Sample' } } })
  const e = await resolveSweepCall(
    {
      action: 'content_update',
      params: {
        platform: 'emdash',
        collection: 'posts',
        id: 'p1',
        data: { title: 'Hours' },
        slug: 'hours',
        was: { title: 'Sample', slug: 'sample' }
      }
    },
    { site: door({}).run, emdash: emdash.run }
  )
  assert.equal(e.ok, true)
  assert.equal(emdash.writes[0].params.slug, 'hours')
  assert.equal(e.slug, 'sample')
  // A write without a slug reads nothing back.
  const none = door({ 'post/59': { post_title: 'Sample', post_name: 'sample' } })
  const n = await resolveSweepCall(
    {
      action: 'content.update',
      params: { kind: 'post', id: 59, fields: { post_title: 'Hours' }, was: { post_title: 'Sample' } }
    },
    { site: none.run }
  )
  assert.deepEqual(n, { ok: true, count: 1 })
})

test("a slug made of the sweep's title goes with that title: the agent changed the title since, neither is written", async () => {
  const lorem = '<p>Lorem ipsum of the template.</p>'
  // Joomla, the template post's write with its body.
  const joomla = door({ 'article/7': { title: 'Agent title', alias: 'sample-7', introtext: lorem } })
  await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'joomla',
        kind: 'article',
        id: 7,
        fields: { title: 'Sweep title', alias: 'sweep-title' },
        was: { title: 'Sample 7', alias: 'sample-7' },
        slugFrom: 'title',
        bodyFields: { introtext: '<p>Groups can book.</p>' },
        template: { introtext: lorem }
      }
    },
    { site: joomla.run }
  )
  assert.deepEqual(joomla.writes[0].params.fields, { introtext: '<p>Groups can book.</p>' })
  // Joomla with nothing else to write: no write at all.
  const alone = door({ 'article/8': { title: 'Agent title', alias: 'sample-8' } })
  const a = await resolveSweepCall(
    {
      action: 'content.update',
      params: {
        kind: 'article',
        id: 8,
        fields: { title: 'Sweep title', alias: 'sweep-title' },
        was: { title: 'Sample 8', alias: 'sample-8' },
        slugFrom: 'title'
      }
    },
    { site: alone.run }
  )
  assert.deepEqual(a, { ok: true, count: 0 })
  assert.deepEqual(alone.writes, [])
  // WordPress, a plain update and the template post's body write; a plan naming no `slugFrom` reads the title.
  const wp = door({
    'post/59': { post_title: 'Agent title', post_name: 'sample', post_date: '2021-09-10 01:38:00' }
  })
  await resolveSweepCall(
    {
      action: 'content.update',
      params: {
        kind: 'post',
        id: 59,
        fields: { post_title: 'Sweep title', post_name: 'sweep-title', post_date: '2026-10-24 00:00:00' },
        was: { post_title: 'Sample', post_name: 'sample', post_date: '2021-09-10 01:38:00' }
      }
    },
    { site: wp.run }
  )
  assert.deepEqual(wp.writes[0].params.fields, { post_date: '2026-10-24 00:00:00' })
  const body = '<!-- wp:paragraph -->\n<p>Lorem ipsum.</p>\n<!-- /wp:paragraph -->'
  const wpBody = door({ 'post/58': { post_title: 'Agent title', post_name: 'sample', post_content: body } })
  await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: { post_title: 'Sweep title', post_name: 'sweep-title' },
        was: { post_title: 'Sample', post_name: 'sample' },
        slugFrom: 'post_title',
        body: 'Groups can book.',
        template: body
      }
    },
    { site: wpBody.run }
  )
  assert.ok(wpBody.writes.length > 0)
  for (const w of wpBody.writes)
    assert.ok(!('post_name' in (w.params.fields ?? {})), JSON.stringify(w.params))
  // EmDash: the slug beside the data goes with the title, in both write shapes.
  const site = async () => assert.fail('an EmDash call never goes through tracy_site')
  const emdash = door({
    'posts/p1': { status: 'published', slug: 'sample', data: { title: 'Agent title', body: lorem } },
    'posts/p2': { status: 'published', slug: 'sample-2', data: { title: 'Agent title', date: '2021-01-01' } }
  })
  await resolveSweepCall(
    {
      action: 'post',
      params: {
        platform: 'emdash',
        collection: 'posts',
        id: 'p1',
        fields: { title: 'Sweep title' },
        slug: 'sweep-title',
        was: { title: 'Sample', slug: 'sample' },
        slugFrom: 'title',
        bodyFields: { body: '<p>Groups can book.</p>' },
        template: { body: lorem }
      }
    },
    { site, emdash: emdash.run }
  )
  await resolveSweepCall(
    {
      action: 'content_update',
      params: {
        platform: 'emdash',
        collection: 'posts',
        id: 'p2',
        data: { title: 'Sweep title', date: '2026-10-24' },
        slug: 'sweep-title',
        was: { title: 'Sample 2', slug: 'sample-2', date: '2021-01-01' },
        slugFrom: 'title'
      }
    },
    { site, emdash: emdash.run }
  )
  assert.equal(emdash.writes.length, 2)
  for (const w of emdash.writes) assert.ok(!('slug' in w.params), JSON.stringify(w.params))
  assert.deepEqual(emdash.writes[1].params.data, { date: '2026-10-24' })
})

test("a Joomla menu item's link is written only while it still holds the link the plan saw", async () => {
  const planned = 'https://site.invalid/index.php/blog/12-sample-12'
  const call = (record) => ({
    action: 'link',
    params: {
      platform: 'joomla',
      href: planned,
      to: 'https://site.invalid/index.php/blog/12-our-story',
      records: [record],
      targetLink: 'https://site.invalid/index.php/blog/12-our-story'
    }
  })
  // The agent pointed the item elsewhere after the plan: refused, unwritten.
  const changed = door({ 'menuItem/31': { link: 'index.php?option=com_contact&view=contact&id=1' } })
  const c = await resolveSweepCall(call({ kind: 'menuItem', id: 31, link: planned }), { site: changed.run })
  assert.equal(c.ok, false)
  assert.equal(c.code, 'CHANGED')
  assert.deepEqual(changed.writes, [])
  // A plan that did not say what the item held writes nothing either.
  const blind = door({ 'menuItem/31': { link: planned } })
  const b = await resolveSweepCall(call({ kind: 'menuItem', id: 31 }), { site: blind.run })
  assert.equal(b.ok, false)
  assert.deepEqual(blind.writes, [])
  // Still the planned link: written.
  const held = door({ 'menuItem/31': { link: planned } })
  const h = await resolveSweepCall(call({ kind: 'menuItem', id: 31, link: planned }), { site: held.run })
  assert.equal(h.ok, true)
  assert.deepEqual(held.writes[0].params.fields, { link: 'https://site.invalid/index.php/blog/12-our-story' })
})

test("a WordPress button's block comment moves with its <a> and is not counted again; an image's link moves too", async () => {
  const page = [
    '<!-- wp:button {"url":"/old/"} --><div class="wp-block-button"><a class="wp-block-button__link" href="/old/">Read</a></div><!-- /wp:button -->',
    '<!-- wp:image {"id":5,"href":"/old/"} --><figure class="wp-block-image"><a href="/old/"><img src="/a.jpg"/></a></figure><!-- /wp:image -->',
    '<!-- wp:navigation-link {"label":"News","url":"/old/"} /-->'
  ].join('\n')
  const wp = door({ 'post/2': { post_content: page } })
  const answer = await resolveSweepCall(
    {
      action: 'link',
      params: {
        platform: 'wordpress',
        href: '/old/',
        to: '/new/',
        records: [{ kind: 'post', id: 2 }],
        expect: 3
      }
    },
    { site: wp.run }
  )
  assert.equal(answer.ok, true, JSON.stringify(answer))
  const written = wp.writes[0].params.fields.post_content
  assert.ok(!written.includes('/old/'), written)
  assert.equal(written.match(/\/new\//g).length, 5)
})

test("a WordPress link scoped to one anchor's words moves only that anchor and its own block's comment: the image beside it keeps both", async () => {
  const page = [
    '<!-- wp:button {"url":"/old/"} --><div class="wp-block-button"><a class="wp-block-button__link" href="/old/">Book</a></div><!-- /wp:button -->',
    '<!-- wp:image {"id":5,"href":"/old/"} --><figure class="wp-block-image"><a href="/old/"><img src="/a.jpg" alt="Our dining room"/></a></figure><!-- /wp:image -->'
  ].join('\n')
  const scoped = async (text) => {
    const wp = door({ 'post/2': { post_content: page } })
    const answer = await resolveSweepCall(
      {
        action: 'link',
        params: {
          platform: 'wordpress',
          href: '/old/',
          to: '/new/',
          text,
          records: [{ kind: 'post', id: 2 }],
          expect: 1
        }
      },
      { site: wp.run }
    )
    assert.equal(answer.ok, true, JSON.stringify(answer))
    assert.equal(answer.count, 1)
    const [button, image] = wp.writes[0].params.fields.post_content.split('\n')
    return { button, image }
  }
  // The probe: "Book" moves, the image's comment and anchor both stay.
  const book = await scoped('Book')
  assert.equal(book.button.match(/\/new\//g)?.length, 2, book.button)
  assert.ok(!book.image.includes('/new/'), book.image)
  // The reverse: the image's link (read by its picture's alt) moves with its comment, "Book" stays.
  const image = await scoped('Our dining room')
  assert.equal(image.image.match(/\/new\//g)?.length, 2, image.image)
  assert.ok(!image.button.includes('/new/'), image.button)
})

test('a WordPress cover and a navigation link: a button inside a cover moves with its own comment, the cover keeps its picture, a navigation link moves by its label', async () => {
  const page = [
    '<!-- wp:cover {"url":"/c.jpg"} --><div class="wp-block-cover"><!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"url":"/old/"} --><div class="wp-block-button"><a class="wp-block-button__link" href="/old/">Book</a></div><!-- /wp:button --></div><!-- /wp:buttons --></div><!-- /wp:cover -->',
    '<!-- wp:navigation-link {"label":"News","url":"/old/"} /-->'
  ].join('\n')
  const run = async (text, expect) => {
    const wp = door({ 'post/2': { post_content: page } })
    const answer = await resolveSweepCall(
      {
        action: 'link',
        params: {
          platform: 'wordpress',
          href: '/old/',
          to: '/new/',
          text,
          records: [{ kind: 'post', id: 2 }],
          expect
        }
      },
      { site: wp.run }
    )
    assert.equal(answer.ok, true, JSON.stringify(answer))
    return wp.writes[0].params.fields.post_content.split('\n')
  }
  const [cover, nav] = await run('News', 1)
  assert.equal(cover, page.split('\n')[0])
  assert.equal(nav, '<!-- wp:navigation-link {"label":"News","url":"/new/"} /-->')
  const [cover2, nav2] = await run('Book', 1)
  assert.equal(cover2.match(/\/new\//g)?.length, 2, cover2)
  assert.ok(cover2.includes('"url":"/c.jpg"'), cover2)
  assert.ok(!nav2.includes('/new/'), nav2)
  const [cover3, nav3] = await run(null, 2)
  assert.ok(!`${cover3}${nav3}`.includes('/old/'))
})
