// What 0.1.2 changes (DECISIONS D-K5): the blog list's masonry deals its cards again once the web fonts and the pictures have
// settled (L1, Road to live TDSR LAYOUT-2 on 0.1.1), the home news slider fits its height again when the fonts are ready, and
// the doc gaps G1-G3 of the 0.1.1 independent handover; the state archive is a fresh seed (independent review of 0.1.2).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

test('the blog masonry deals again when the fonts are ready and on window load, never on a picture load nor while focus is in the list, moving only misplaced cards', () => {
  const view = read('src/views/BlogList.astro')
  const script = view.slice(view.indexOf('<script is:inline>'))
  assert.match(script, /function deal\(\)/)
  assert.match(
    script,
    /const again = function \(\) \{ clearTimeout\(settle\); settle = setTimeout\(requestDeal, 30\); \}/
  )
  assert.match(script, /document\.fonts\.ready\.then\(again\)/)
  assert.match(script, /window\.addEventListener\('load', again\)/)
  // F1 of the 0.1.2 review: a picture load dealt again and every deal re-appended every card, dropping keyboard focus
  assert.doesNotMatch(script, /img\.addEventListener/)
  assert.match(
    script,
    /if \(at !== card\) \{ cols\[k\]\.insertBefore\(card, at \|\| null\); moved = true; \}/
  )
  assert.match(script, /keep\.focus\(\{ preventScroll: true \}\)/)
  // N1 of the 0.1.2 visual review: no deal while focus is inside the list; the pending deal runs once focus leaves it
  assert.match(script, /if \(grid\.contains\(document\.activeElement\)\) \{ pending = true; return; \}/)
  assert.match(script, /grid\.addEventListener\('focusout'/)
  // N2 of the 0.1.2 visual review: a change in the number of columns deals at once, focus inside or not
  assert.match(script, /!== last\) \{ pending = false; deal\(\); \} \}, 120\)/)
  assert.doesNotMatch(script, /!== last\) requestDeal\(\)/)
  // the first deal still runs at once, so the page never waits for the fonts to show its cards
  assert.ok(script.indexOf('deal();') < script.indexOf('document.fonts.ready'))
})

test('a card picture keeps its box before it loads, so only the fonts move a card', () => {
  const card = read('src/components/site/BlogListCard.astro')
  assert.match(card, /<img src=\{cover\} alt="" width=\{[^}]+\} height=\{[^}]+\} loading="lazy"/)
  assert.match(read('src/styles/global.css'), /\.dn-card img \{ display: block; width: 100%; height: auto;/)
})

test('the home news slider fits its height again when the fonts are ready', () => {
  assert.match(read('src/views/Home.astro'), /document\.fonts\.ready\.then\(fitNews\)/)
})

test('G1: the recipient docs say the browser tools need a Playwright Chromium', () => {
  assert.match(read('docs/checks-and-recovery.md'), /pnpm exec playwright install chromium/)
})

test('G2: the release-tool tests that need contracts/ or a Tracy checkout skip in the package and say why', () => {
  assert.match(
    read('tests/release-site-pages.test.mjs'),
    /const needsCheckout = \{\s*skip: CHECKOUT \? false\s*: '/
  )
  assert.match(read('tests/release-0-1-1.test.mjs'), /const inRepo = \{\s*skip: existsSync\(/)
  assert.match(
    read('docs/checks-and-recovery.md'),
    /run only in the repository: in the package they are skipped and say why/
  )
})

test('G3: the release README bootstraps inside the container, where node_modules is', () => {
  const release = read('tools/release.mjs')
  assert.match(release, /docker run -d --name \$\{slug\} /)
  assert.match(
    release,
    /docker exec -u www-data -w \/app \$\{slug\} tools\/bootstrap-site\.sh http:\/\/127\.0\.0\.1:4321 \.\/data/
  )
  assert.doesNotMatch(release, /\ntools\/bootstrap-site\.sh http:\/\/127\.0\.0\.1:4321 \.\/data/)
})

test('the state archive is a fresh seed of the built site, scrubbed, and the release stops on any QA residue', () => {
  const release = read('tools/release.mjs')
  assert.match(release, /const seeded = await freshSeed\(site\)/)
  assert.match(release, /const dbSrc = path\.join\(seeded, 'data', 'data\.db'\)/)
  assert.match(release, /const uploads = walk\(path\.join\(seeded, 'uploads'\)\)/)
  assert.doesNotMatch(release, /path\.join\(site, 'data'|path\.join\(site, 'uploads'/)
  assert.match(release, /\['emdash-forms', 'submissions', /)
  assert.match(release, /\['emdash-smtp', 'deliveryLogs', /)
  assert.match(release, /scrubbed\['options:plugin:emdash-smtp:\*'\]/)
  assert.match(release, /if \(residue\.length > 0\) fail\(`the state is not a fresh seed/)
})
