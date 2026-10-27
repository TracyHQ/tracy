// Writes the customer confirms first though they are not deletes (`src/host/consequence.mjs`, council
// 19/10/2026): hiding a record, a change every page shows, many places at once, a price.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  amountsIn,
  consequenceOf,
  emdashConsequenceOf,
  MANY_PLACES,
  priceChanges
} from '../src/host/consequence.mjs'

test('an update that takes a record off the pages asks first; one that changes its words does not', () => {
  const hide = consequenceOf('wordpress', 'content.update', {
    kind: 'page',
    id: 12,
    fields: { post_status: 'draft' }
  })
  assert.equal(hide?.reason, 'hides')
  assert.match(hide?.sentence ?? '', /page 12 off your site's pages/)
  const named = consequenceOf(
    'joomla',
    'content.update',
    { kind: 'article', id: 7, fields: { state: -2 } },
    { title: 'Giới thiệu' }
  )
  assert.equal(named?.reason, 'hides')
  assert.deepEqual(named?.facts, ['Giới thiệu'], 'the card must name it as the site does')
  assert.equal(
    consequenceOf('wordpress', 'content.update', { kind: 'page', id: 12, fields: { post_title: 'Hi' } }),
    null
  )
  assert.equal(
    consequenceOf('wordpress', 'content.update', {
      kind: 'page',
      id: 12,
      fields: { post_status: 'publish' }
    }),
    null
  )
  // Off the featured list, still on the site: runs at once (its receipt still reads it back).
  assert.equal(
    consequenceOf('joomla', 'content.update', { kind: 'article', id: 18, fields: { featured: 0 } }),
    null
  )
  assert.equal(
    consequenceOf('joomla', 'content.update', { kind: 'article', id: 18, fields: { state: '0' } })?.reason,
    'hides'
  )
})

test('a change every page shows asks first: the look at site scope, the theme style, the site name', () => {
  assert.equal(consequenceOf('wordpress', 'look.set', { scope: 'site', props: {} })?.reason, 'site')
  assert.equal(consequenceOf('wordpress', 'look.set', { scope: 'element', props: {} }), null)
  assert.equal(consequenceOf('wordpress', 'look.set', { scope: 'page', props: {} }), null)
  assert.equal(consequenceOf('wordpress', 'theme.style', { css: 'body{}' })?.reason, 'site')
  const renamed = consequenceOf('joomla', 'site.identity', {
    operation: 'set',
    fields: { sitename: 'Nhà Xưởng' }
  })
  assert.equal(renamed?.reason, 'site')
  assert.deepEqual(renamed?.facts, ['Nhà Xưởng'])
  assert.equal(consequenceOf('joomla', 'site.identity', { operation: 'read' }), null, 'a read asks nothing')
  assert.equal(
    consequenceOf('joomla', 'template.siteSettings', { fields: { logo: 'images/a.png' } })?.reason,
    'site'
  )
})

test('many places at once asks first from the sixth; five and fewer run', () => {
  // test-quality: contract the replace door's >5 and ADR 0034 name six
  assert.equal(MANY_PLACES, 6)
  const many = consequenceOf(
    'wordpress',
    'content.replace',
    {},
    { places: 6, find: 'Cửa hàng', replace: 'Shop' }
  )
  assert.equal(many?.reason, 'many')
  assert.deepEqual(many?.facts, ['6'])
  assert.equal(
    consequenceOf('wordpress', 'content.replace', {}, { places: 5, find: 'a', replace: 'b' }),
    null
  )
})

test('a price changed asks first, however few places, and the card names old and new', () => {
  const price = consequenceOf(
    'wordpress',
    'content.replace',
    {},
    { places: 1, find: 'Giá: 120.000đ', replace: 'Giá: 150.000đ' }
  )
  assert.equal(price?.reason, 'price')
  assert.deepEqual(price?.facts, ['120.000đ', '150.000đ'])
  assert.match(price?.sentence ?? '', /120\.000đ → 150\.000đ/)
  assert.equal(
    consequenceOf(
      'wordpress',
      'content.replace',
      {},
      { places: 1, find: 'Only $20 today', replace: 'Only $25 today' }
    )?.reason,
    'price'
  )
  // Numbers that are not money, and money that stays, change no price.
  assert.equal(
    consequenceOf(
      'wordpress',
      'content.replace',
      {},
      { places: 1, find: 'Since 2004', replace: 'Since 2005' }
    ),
    null
  )
  assert.equal(
    consequenceOf(
      'wordpress',
      'content.replace',
      {},
      { places: 1, find: 'Combo 99.000đ ngon', replace: 'Combo 99.000đ rất ngon' }
    ),
    null
  )
})

test('amounts of money are read in the ways sites write them', () => {
  assert.deepEqual(amountsIn('Gói A 1.200.000 ₫, gói B 990.000đ, ship $5.50, €12, 30 USD, 100 元'), [
    '1.200.000 ₫',
    '990.000đ',
    '$5.50',
    '€12',
    '30 USD',
    '100 元'
  ])
  assert.deepEqual(amountsIn('Founded 2004, 12 projects'), [])
  assert.deepEqual(priceChanges('A 100đ, B 200đ', 'A 100đ, B 250đ'), [{ from: '200đ', to: '250đ' }])
  assert.deepEqual(priceChanges('A 100đ', 'A 100đ'), [])
})

// 20/10/2026, staff on real customer sites: "when Tracy fixes one place it often breaks another place". An update
// of a record other pages show too asks first, naming that it is not this page alone.
test('an update of a record other pages show asks first: WordPress part, template, synced pattern, menu', () => {
  const part = consequenceOf(
    'wordpress',
    'content.update',
    {
      kind: 'templatePart',
      key: 'footer',
      fields: { content: '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->' }
    },
    { title: 'Footer' }
  )
  assert.equal(part?.reason, 'shared')
  assert.match(part?.sentence ?? '', /"Footer" part every page of your site shows, not this page alone/)
  assert.deepEqual(part?.facts, ['Footer'])
  assert.match(part?.error ?? '', /templatePart footer, which other pages show too/)
  for (const [postType, words] of [
    ['wp_template', /a layout every page built on it shows/],
    ['wp_template_part', /a part every page of your site shows/],
    ['wp_block', /a shared block that shows on every page it is used on/],
    ['wp_navigation', /the menu every page of your site shows/]
  ]) {
    const hit = consequenceOf(
      'wordpress',
      'content.update',
      { kind: 'post', id: 90, fields: { post_content: 'x' } },
      { postType }
    )
    assert.equal(hit?.reason, 'shared', postType)
    assert.match(hit?.sentence ?? '', words, postType)
    // A read that named it names it on the card too, and the card must keep that name (council 20/10/2026).
    const named = consequenceOf(
      'wordpress',
      'content.update',
      { kind: 'post', id: 90, fields: { post_content: 'x' } },
      { postType, title: 'Opening hours' }
    )
    assert.match(named?.sentence ?? '', /"Opening hours"/, postType)
    assert.deepEqual(named?.facts, ['Opening hours'], postType)
  }
  // A page or post of its own runs at once, and so does one whose type no read showed.
  for (const postType of ['page', 'post', ''])
    assert.equal(
      consequenceOf(
        'wordpress',
        'content.update',
        { kind: 'post', id: 12, fields: { post_title: 'Hi' } },
        { postType }
      ),
      null,
      postType
    )
  // A part with no key names nothing to ask about (the door refuses it on its own).
  assert.equal(consequenceOf('wordpress', 'content.update', { kind: 'templatePart', fields: {} }), null)
  // Hiding is still said as hiding: it comes first.
  assert.equal(
    consequenceOf(
      'wordpress',
      'content.update',
      { kind: 'post', id: 90, fields: { post_status: 'draft' } },
      { postType: 'wp_block' }
    )?.reason,
    'hides'
  )
})

test('a Joomla module update asks first, naming that it shows on every page it is assigned to; a new one does not', () => {
  const named = consequenceOf(
    'joomla',
    'content.update',
    { kind: 'module', id: 428, fields: { content: 'Hotline: 1900' }, apply_id: 'a1' },
    { title: 'Topbar' }
  )
  assert.equal(named?.reason, 'shared')
  assert.match(named?.sentence ?? '', /"Topbar" block, which shows on every page it is assigned to/)
  assert.deepEqual(named?.facts, ['Topbar'])
  assert.match(
    consequenceOf('joomla', 'content.update', { kind: 'module', id: 428, fields: { title: 'x' } })
      ?.sentence ?? '',
    /a block that shows on every page it is assigned to/
  )
  assert.equal(
    consequenceOf('joomla', 'content.update', { kind: 'module', id: 0, fields: { title: 'x' } }),
    null
  )
  assert.equal(
    consequenceOf('joomla', 'content.update', { kind: 'article', id: 7, fields: { title: 'x' } }),
    null
  )
  // A module is not a WordPress kind, nor a part a Joomla one.
  assert.equal(consequenceOf('wordpress', 'content.update', { kind: 'module', id: 4, fields: {} }), null)
  assert.equal(
    consequenceOf('joomla', 'content.update', { kind: 'templatePart', key: 'footer', fields: {} }),
    null
  )
})

test("EmDash: an update of the site entry asks first; any other collection's entry does not", () => {
  const site = emdashConsequenceOf('content_update', {
    collection: 'site',
    id: 'site-en',
    data: { phone: '1' }
  })
  assert.equal(site?.reason, 'shared')
  assert.match(
    site?.sentence ?? '',
    /shared details \(like the header and footer\) on every page, not this page alone/
  )
  assert.equal(
    emdashConsequenceOf('content_update', { collection: 'pages', id: 'about', data: { title: 'x' } }),
    null
  )
  assert.equal(emdashConsequenceOf('content_get', { collection: 'site', id: 'site-en' }), null)
})

test('a look at element or page scope that reaches further asks first: the header or footer, a rule painting several', async () => {
  const { lookReachOf } = await import('../src/host/consequence.mjs')
  const header = lookReachOf({ scope: 'element', everyPage: true, paints: null })
  assert.equal(header?.reason, 'shared')
  assert.match(header?.sentence ?? '', /header or footer looks on every page, not this page alone/)
  const several = lookReachOf({ scope: 'page', everyPage: false, paints: 4 })
  assert.match(several?.sentence ?? '', /4 items on this page/)
  assert.deepEqual(several?.facts, ['4'])
  assert.equal(lookReachOf({ scope: 'page', everyPage: false, paints: 1 }), null)
  assert.equal(lookReachOf({ scope: 'page', everyPage: false, paints: null }), null, 'not told: as before')
  assert.equal(
    lookReachOf({ scope: 'element', everyPage: false, paints: 9 }),
    null,
    'one element is one element'
  )
  assert.equal(lookReachOf({ scope: 'site', everyPage: true, paints: 9 }), null, 'site scope asks on its own')
})
