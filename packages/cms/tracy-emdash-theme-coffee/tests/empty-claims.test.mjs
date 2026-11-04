// What a personalised site draws once Apply has emptied the demo company's claims (seed/personalize.json `facts`, only
// for a customer who described the business): a section whose rows were all claims goes with them, never a heading over
// an empty grid. Held at the SOURCE: no Astro renderer runs in this package's node tests, so each guard is read where it
// is written, and a refactor that drops one fails here (TCH #1013, measured on Tracy Business 11/10/2026).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
/** The guard `guard` opens before `mark` in `src`, with no other `&& (` block opened in between. */
const guarded = (src, guard, mark) => {
  const at = src.indexOf(mark)
  assert.ok(at !== -1, `${mark} is still in the source`)
  const open = src.lastIndexOf(guard, at)
  return open !== -1 && !src.slice(open + guard.length, at).includes('&& (')
}

/** [view, the list a `facts` rule empties, a mark inside the section it fills]. */
const SECTIONS = [
  ['About.astro', 'd.stats_figures', 'heading: "stats_heading"'],
  ['About.astro', 'd.team_members', 'heading: "team_heading"']
]

// The home page's own empty rows: the shop photos stay empty until the customer adds some, a menu item may have no
// price; neither leaves a heading over nothing or a price tag with no price.
test('Home.astro: the shop photos and their heading are drawn only with a photo to show', () => {
  const src = read('src/views/Home.astro')
  assert.ok(guarded(src, '{photos.length > 0 && (', '{h.space_title &&'))
  assert.ok(src.includes('.filter((p: any) => mediaUrl(p.image))'), 'a row with no image is not a photo')
})

test('Home.astro: a featured card shows a price only when the item has one', () => {
  assert.ok(read('src/views/Home.astro').includes('{d.price && <span class="home-card__price"'))
})

test('Home.astro: with no published menu item, section 5 introduces the shop beside the cup instead of the menu', () => {
  const src = read('src/views/Home.astro')
  const cards = src.indexOf('{cards.length > 0 ? (')
  const none = src.indexOf(') : (', cards)
  assert.ok(cards !== -1 && none !== -1, 'section 5 branches on the cards')
  // the menu heading, its lead, the cards and the button to the menu are drawn only with cards
  for (const mark of [
    '{h.featured_title &&',
    '{h.featured_lead &&',
    '<ul class="home-cards">',
    '{h.featured_cta_label &&'
  ]) {
    const at = src.indexOf(mark)
    assert.ok(at > cards && at < none, `${mark} is inside the cards branch`)
  }
  // without: the shop's own name and tagline (fields with a role), the cup docked beside them
  const empty = src.slice(none, src.indexOf('</section>', none))
  for (const mark of ['$site("brand_name")', '$site("brand_tagline")', 'data-cup-dock'])
    assert.ok(empty.includes(mark), mark)
})

for (const [view, list, mark] of SECTIONS)
  test(`${view}: the section of ${list} is drawn only with a row to show`, () => {
    assert.ok(guarded(read(`src/views/${view}`), `{(${list} ?? []).length > 0 && (`, mark))
  })
