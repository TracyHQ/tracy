// The visual-review fixes of 1.0.2 (DECISIONS D65): what the stylesheet, the views and the seed must keep saying.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { cutAtWord } from '../src/lib/excerpt.ts'
import { telHref } from '../src/lib/tel.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const css = read('src/styles/global.css')
const seed = JSON.parse(read('seed/seed.json'))
const mediaMap = JSON.parse(read('seed/media-map.json'))

test('a list excerpt is cut at a whole word, never in the middle of one', () => {
  const text =
    'Once found mostly in Southeast Asian kitchens, fish sauce is now turning up in salad dressings, marinades and sauces'
  const cut = cutAtWord(text, 95)
  assert.ok(cut.endsWith('...'))
  assert.ok(text.startsWith(cut.slice(0, -3)))
  assert.match(text.slice(cut.length - 3), /^ /)
  assert.equal(cutAtWord('short text', 100), 'short text')
  // One long word: no space before the limit. The source (Joomla string.truncate, noSplit) prints the ellipsis alone;
  // 1.0.1 cut through the word at 100 characters, which is the defect this replaces.
  assert.equal(cutAtWord('x'.repeat(150), 95), '...')
  assert.equal(cutAtWord(`${'x'.repeat(120)} and more words`, 95), '...', 'the first space is past the limit')
  assert.equal(
    cutAtWord(`${'x'.repeat(90)} nextword here`, 95),
    `${'x'.repeat(90)}...`,
    'a space before the limit is used'
  )
  assert.equal(cutAtWord('a'.repeat(95), 95), 'a'.repeat(95), 'a text at the limit is whole')
})

test('the masthead photograph is fixed, as the source paints it', () => {
  assert.match(
    css,
    /\.rs-masthead \{ position: relative; padding-top: 41px; background-attachment: fixed; \}/
  )
})

test('the empty booking bar of the hero slideshow is not drawn', () => {
  assert.doesNotMatch(css, /rs-slide-bar/)
  assert.doesNotMatch(read('src/components/sections/Slideshow.astro'), /rs-slide-bar/)
})

test('the pager carries Start and End, and the card moves its category into the meta line below 768 px', () => {
  const pager = read('src/components/site/Pager.astro')
  assert.match(pager, /w\.pageStart/)
  assert.match(pager, /w\.pageEnd/)
  assert.match(read('src/lib/ui-words.ts'), /pageStart: 'Start',\n\s+pageEnd: 'End'/)
  assert.match(read('src/components/site/PostCard.astro'), /rs-cat-meta/)
  assert.match(css, /@media \(max-width: 767px\) \{\s+\.rs-post-thumb \.rs-cat-badge \{ display: none; \}/)
})

test('every dish photo of the four photo menus shows its own dish, not a dessert or a building', () => {
  const photoOf = {
    'Chili Chicken': 'food/fd-1',
    'Calamari Fritti': 'features-intro/intro-4',
    'Japanese Gyoza': 'gallery/intro-8',
    'Trio of Dips': 'food/fd-3',
    'Szechuan Edamame': 'features-intro/intro-3',
    'Cheeseburger Sliders': 'food/fd-5',
    'Lettuce Wraps': 'blog/rest-6',
    'Pesto Shrimp Flatbread': 'blog/rest-7',
    'Lime Juice': 'icream/ic-11',
    'Hot Wings': 'food/fd-2'
  }
  const menus = seed.content.menu.filter((m) =>
    ['sea-food', 'menu-with-image', 'icream-and-juice', '2-column-menu'].includes(m.slug)
  )
  assert.equal(menus.length, 4)
  for (const m of menus)
    for (const d of m.data.items)
      assert.equal(
        d.dish_image,
        `images/joomlart/${photoOf[d.dish_name.trim()]}.jpg`,
        `${m.slug}: ${d.dish_name}`
      )
  // the media map says the same, so the importer puts the same picture in
  for (const m of menus)
    m.data.items.forEach((d, i) => {
      const item = mediaMap.items.find((x) =>
        x.targets.some(
          (t) => t.collection === 'menu' && t.slug === m.slug && t.path === `items[${i}].dish_image`
        )
      )
      assert.equal(item?.file, d.dish_image, `${m.slug} items[${i}] in media-map.json`)
    })
})

test('the history milestone and the contact card no longer reuse a hotel building', () => {
  assert.equal(seed.content.timeline[0].data.items[0].image, 'images/joomlart/features-intro/intro-2.jpg')
  assert.equal(seed.content.contact[0].data.image, 'images/joomlart/blog/rest-8.jpg')
})

test('the reservation intro breaks after its first sentence, as the source does', () => {
  const spans = seed.content.reservation[0].data.intro[0].children.map((c) => c.text)
  assert.deepEqual(spans.slice(0, 3), [
    'We take reservations for lunch and dinner.',
    '\n',
    'To make a reservation, please call us at '
  ])
})

test('the Search button prints its word from the chrome entry, so the editor can change it and the kit sees one slot', () => {
  const chrome = seed.content.chrome[0].data
  assert.equal(chrome.search_label, 'Search')
  assert.ok(
    seed.collections.find((c) => c.slug === 'chrome').fields.some((f) => f.slug === 'search_label'),
    'the chrome collection declares search_label'
  )
  assert.match(read('src/views/Search.astro'), /\$c\('search_label'\)[^>]*>\{chrome\.site\.search_label/)
  const fieldMap = JSON.parse(read('seed/field-map.json'))
  assert.equal(fieldMap.fields['chrome.search_label'].role, 'editorial.button_label')
})

test('the contact card prints both telephone lines as tel: links in the card colour (D73)', () => {
  const contact = read('src/components/sections/Contact.astro')
  assert.match(contact, /\$c\('phone'\)[^\n]*href=\{telHref\(c\.phone\)\}/)
  assert.match(contact, /\$c\('mobile'\)[^\n]*href=\{telHref\(c\.mobile\)\}/)
  assert.match(css, /\.rs-contact-details a\[href\^="tel:"\]\s*\{\s*color:\s*inherit;?\s*\}/)
})

test('slot-limits.json holds only limits with a real source: a measured box, or a nonVisual declaration with no number', () => {
  const { limits } = JSON.parse(read('seed/slot-limits.json'))
  assert.ok(limits.length >= 7)
  for (const rule of limits) {
    assert.ok(
      String(rule.from).trim().length > 10,
      `${rule.slot} says where its number or its non-visual use comes from`
    )
    if (rule.nonVisual === true) {
      assert.equal('maxCharacters' in rule, false, `${rule.slot} is not drawn in a box: no invented number`)
    } else {
      assert.ok(Number.isInteger(rule.maxCharacters) && rule.maxCharacters > 0, rule.slot)
      assert.match(
        rule.from,
        /measured|filled|box|field is/i,
        `${rule.slot}: the number comes from a measured box`
      )
    }
  }
  const nonVisual = limits.filter((r) => r.nonVisual).map((r) => r.slot)
  assert.deepEqual(nonVisual.sort(), ['chrome.chrome.appearance_label', 'settings.title'])
})

test('the post category label never links to /pages (Chefs): the view links only a live blog category', () => {
  const view = read('src/views/Post.astro')
  // the old link was unconditional: a label link whose gate does not name the blog categories
  assert.match(
    view,
    /const termLink = Boolean\(terms\[0\] && BLOG_SIDEBAR\.includes\(terms\[0\]\.slug\) && termLive\)/
  )
  assert.doesNotMatch(view, /const termLink = Boolean\(terms\[0\]\)/)
  assert.doesNotMatch(view, /\{terms\[0\] && <a href=/)
  const chefs = seed.content.posts.find((p) => p.slug === 'chefs')
  assert.equal(
    chefs.taxonomies.category[0],
    'pages',
    'the Chefs article sits in the category with no list page'
  )
  const sidebar = /export const BLOG_SIDEBAR = \[([^\]]*)\]/.exec(read('src/lib/posts.ts'))[1]
  assert.doesNotMatch(sidebar, /'pages'/)
})

test('telHref: RFC 3966 form, a leading plus kept, every other character dropped, an extension as ;ext=, no digits no link', () => {
  assert.equal(telHref('(084) 555-0110'), 'tel:0845550110')
  assert.equal(telHref('+1 (084) 555-0110'), 'tel:+10845550110')
  assert.equal(telHref('  +44 20.7946-0958 '), 'tel:+442079460958')
  assert.equal(telHref('+1-084-555+0110'), 'tel:+10845550110', 'only a leading plus stays')
  assert.equal(telHref('555-0110 x23'), 'tel:5550110;ext=23')
  assert.equal(telHref('+1 084 555 0110 ext. 7'), 'tel:+10845550110;ext=7')
  assert.equal(telHref('call us'), null)
  assert.equal(telHref(''), null)
  assert.equal(telHref(null), null)
})

test('the contact card builds both telephone links with telHref, the one rule', () => {
  const contact = read('src/components/sections/Contact.astro')
  assert.match(contact, /import \{ telHref \} from '@\/lib\/tel'/)
  assert.equal((contact.match(/telHref\(c\./g) ?? []).length, 4)
  assert.doesNotMatch(contact, /replace\(\/\[\^\+\\d\]\/g/)
})
