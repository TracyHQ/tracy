// What a personalised site draws once Apply has emptied the demo company's claims (seed/personalize.json `facts`, only
// for a customer who described the business): no heading over an empty row, no empty tag line. Held at the SOURCE like
// apply-leftovers.test.mjs: no Astro renderer runs in this package's node tests, so each guard is read where it is
// written, and a refactor that drops one fails here.
//
// Measured 11/10/2026 on dev against the demo: the home page kept "Clients we have built for" over no logos, and every
// "Selected projects" card kept an empty orange `card_tag` line.
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
/** Every `{...}` render of `field` in `src` sits behind `{<owner>.field && `. */
const everyLineGuarded = (src, owner, field) => {
  const marks = src.match(new RegExp(`\\{${owner.replace('.', '\\.')}\\.${field}\\}`, 'g')) ?? []
  const guards = src.match(new RegExp(`\\{${owner.replace('.', '\\.')}\\.${field} && <`, 'g')) ?? []
  return marks.length > 0 && marks.length === guards.length
}

test('home: the clients strip is drawn only with a logo to show', () => {
  const src = read('src/views/Home.astro')
  assert.ok(guarded(src, '{(h.client_logos ?? []).length > 0 && (', '$page("clients_label")'))
})

test('home: the stats band is drawn only with a figure to show', () => {
  const src = read('src/views/Home.astro')
  assert.ok(guarded(src, '{(h.stats ?? []).length > 0 && (', '$page.block("stats")'))
})

test('home and project pages: an empty card tag draws no tag line', () => {
  const home = read('src/views/Home.astro')
  assert.ok(everyLineGuarded(home, 'big.data', 'card_tag'), 'the big card')
  assert.ok(everyLineGuarded(home, 'p.data', 'card_tag'), 'the small cards')
  assert.ok(
    everyLineGuarded(read('src/views/Project.astro'), 'o.data', 'card_tag'),
    'the next-projects cards'
  )
})

test('about: stats, history, offices, team, certifications and safety go with their rows', () => {
  const src = read('src/views/About.astro')
  assert.ok(guarded(src, '{has(a.stats) && (', '$page.block("stats")'))
  assert.ok(guarded(src, '{has(a.history) && (', '$page("history_title")'))
  assert.ok(guarded(src, '{showGeo && (', '$page("geo_title")'))
  assert.match(src, /const showGeo = has\(a\.geo_text\) \|\| has\(a\.geo_list\)/)
  assert.ok(guarded(src, '{has(a.team) && (', '$page("team_title")'))
  assert.ok(guarded(src, '{has(a.certs) && (', '$page("cert_title")'))
  assert.ok(guarded(src, '{showSafety && (', '$page("safety_title")'))
})

test('services, careers: a stats grid with no figure draws nothing; pricing goes with its rows', () => {
  assert.match(read('src/components/site/StatsGrid.astro'), /\{\(stats \?\? \[\]\)\.length > 0 && \(/)
  const services = read('src/views/Services.astro')
  assert.ok(guarded(services, '{(s.pricing ?? []).length > 0 && (', '$page("pricing_title")'))
})

test('projects: the featured block draws title, text and facts only when they are there; no year, no separator', () => {
  const src = read('src/views/Projects.astro')
  assert.ok(everyLineGuarded(src, 'p', 'featured_title'))
  assert.ok(everyLineGuarded(src, 'p', 'featured_text'))
  assert.ok(guarded(src, '{(p.featured_facts ?? []).length > 0 && <div', '$page.block("featured_facts")'))
  assert.match(src, /\{it\.data\.year && <span class="text-line-faint">·<\/span>\}/)
})

test('careers: no quote, no blockquote; no mailbox, the button leads to the contact page, never to "mailto:"', () => {
  const src = read('src/views/Careers.astro')
  assert.match(src, /\{c\.quote && <blockquote/)
  assert.match(src, /\{c\.quote_by && <div/)
  assert.match(
    src,
    /c\.cta_url \|\| \(c\.cta_mail \? `mailto:\$\{c\.cta_mail\}` : href\(locale, "\/contact"\)\)/
  )
})

test('article: an emptied author draws no empty name line', () => {
  assert.ok(everyLineGuarded(read('src/views/Article.astro'), 'a', 'author'))
})

// Measured 11/10/2026 on dev (g58-biz-emd-full, Tracy Business 1.7.5): /contact kept a "Chi nhánh" (branches) card over an
// empty list, and a "Hồ sơ mạng xã hội" (social profiles) card with its intro and no profile (K6 empties the demo's).
test('contact: the branches and social profiles cards go with their rows', () => {
  const src = read('src/views/Contact.astro')
  assert.ok(guarded(src, '{(c.branches ?? []).length > 0 && (', '$page("branches_title")'))
  assert.ok(guarded(src, '{(site.social ?? []).length > 0 && (', '$page("social_title")'))
})

// The registration line (`footer_legal_1`) is a claim (seed/personalize.json `facts`): emptied, it left a blank line
// above the address in the footer.
test('footer: an emptied registration line draws no blank line above the address', () => {
  assert.ok(everyLineGuarded(read('src/components/site/Footer.astro'), 'site', 'footer_legal_1'))
})
