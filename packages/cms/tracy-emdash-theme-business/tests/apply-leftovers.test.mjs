// What a personalised site draws once Apply has taken things off it: no heading over nothing, no alternate in a
// language the site does not serve. Held at the SOURCE: no Astro or React renderer runs in this package's node tests,
// so each guard is read where it is written, and a refactor that drops one fails here.
//
// Measured 05/10/2026 on a site made with Apply (ledger of the add-site Apply audit): L18, every content page named
// 41 alternates though the site served two languages; L20, the Resources panel and the sitemap page kept the
// "Marketing Kit" heading with no kit page left under it; L21, with no demo post left the home page's news block is a
// heading over an empty grid.
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

test('a content page names a translation as its alternate only in a language the site serves (L18)', () => {
  const base = read('src/layouts/Base.astro')
  assert.match(
    base,
    /t\.status === 'published' && t\.slug && isLocale\(t\.locale\) && chrome\.locales\.includes\(t\.locale\)/,
    'a translation the switcher would not offer is not an alternate either'
  )
})

test('the Resources panel draws its kit column only when the kit menu has a link (L20)', () => {
  const src = read('src/components/islands/ResourcesMenu.tsx')
  assert.ok(
    guarded(src, '{p.kit.length > 0 && (', '{...p.marks?.kitTitle}'),
    'the kit heading sits under the guard'
  )
})

test('the sitemap page draws a group only when it has a link (L20, L21)', () => {
  assert.match(
    read('src/views/Sitemap.astro'),
    /groups\s*\.filter\(\(g\) => g\.items\.length > 0\)\s*\.map\(/
  )
})

test('the home page draws its news block only when there is a post to show (L21)', () => {
  const src = read('src/views/Home.astro')
  assert.ok(guarded(src, '{showNews && (', '$page("news_title")'), 'the news heading sits under the guard')
  assert.match(src, /const showNews = [^\n]*news\.length > 0/, 'the guard needs a post to show')
})

// TCH #1013, measured 08/10/2026 on dev (tamq-9e-bizvi, bizvi2): Projects unticked, /projects answered 404 as it
// should, and the home page still drew "Selected projects" with 10 links into /projects and /projects/sector/*, all
// 404. A home block whose only job is to show a page goes with that page, on the very test its list view answers 404
// on (`if (!entry)` in Projects.astro / News.astro): the record Apply unpublishes when the customer unticks it.
test('the home page draws its projects block only while the projects page is published (TCH #1013)', () => {
  const src = read('src/views/Home.astro')
  assert.ok(
    guarded(src, '{showProjects && (', 'id="sec-projects"'),
    'the projects block sits under the guard'
  )
  assert.match(src, /getEmDashEntry\('projects_page', 'projects'/, 'the guard reads the projects page record')
  assert.match(src, /const showProjects = Boolean\(projectsPage\)/)
  assert.match(
    read('src/views/Projects.astro'),
    /getEmDashEntry\('projects_page', 'projects'[\s\S]*if \(!entry\) return/
  )
})

test('the home page draws its news block only while the news page is published (TCH #1013)', () => {
  const src = read('src/views/Home.astro')
  assert.match(src, /getEmDashEntry\('news_page', 'news'/, 'the guard reads the news page record')
  assert.match(src, /const showNews = Boolean\(newsPage\) && news\.length > 0/)
  assert.match(read('src/views/News.astro'), /getEmDashEntry\('news_page', 'news'[\s\S]*if \(!entry\) return/)
})
