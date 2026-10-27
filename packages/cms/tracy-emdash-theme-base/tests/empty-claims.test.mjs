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
  ['Home.astro', 'h.stats', '<StatsBand items={h.stats'],
  ['Home.astro', 'h.team_quotes', 'title: "team_title"'],
  ['Home.astro', 'h.pricing_tiers', 'title: "pricing_title"'],
  ['About.astro', 'd.stats_figures', 'heading: "stats_heading"'],
  ['About.astro', 'd.team_members', 'heading: "team_heading"'],
  ['Landing.astro', 'd.stats_figures', 'heading: "stats_heading"'],
  ['Landing.astro', 'd.pricing_tiers', 'title: "pricing_heading"'],
  ['Landing.astro', 'd.testimonials_quotes', '{(d.testimonials_eyebrow || d.testimonials_heading)'],
  ['Landing.astro', 'd.clients_marks', 'eyebrow: "clients_eyebrow"'],
  ['Product.astro', 'd.stats_figures', 'heading: "stats_heading"'],
  ['Home2.astro', 'd.team_members', 'heading: "team_heading"'],
  ['Home2.astro', 'd.stats_figures', 'heading: "stats_heading"'],
  ['Onepage.astro', 'o.team_members', 'title: "team_title"']
]

for (const [view, list, mark] of SECTIONS)
  test(`${view}: the section of ${list} is drawn only with a row to show`, () => {
    assert.ok(guarded(read(`src/views/${view}`), `{(${list} ?? []).length > 0 && (`, mark))
  })
