// Which written items a list block shows is the site's choice (ticket #586, review 4): a blog list sorts by date and
// the build writes every item within seconds, so ties fall in no fixed order, and a list shows a page of its items.
// An invented bakery news list of three posts, of which the page shows one: the posts the list did not choose are
// declared `list_item_not_shown` (stable whichever the site picks) only while no page that was read is the post's own
// (review 5 Y3): a post whose own page was read and does not print a value is no list's choice, the value stays
// unexplained. The guard derives the reason again from the pages the record says were read, never from a row field.
import assert from 'node:assert/strict'
import test from 'node:test'
import { codeOf, textMarker } from '../ai-quickstart/gate/marker-codec.mjs'
import { declareNotSeen, notSeenOf } from '../ai-quickstart/gate/not-seen.mjs'

const code = (n) => codeOf(100 + n)
const post = (n) => ({
  key: `article:post-${n}`,
  kind: 'article.create',
  values: [
    { value: textMarker(code(n * 10)), entry: `news.news-b6.post-${n}.title`, loc: { column: 'title' } },
    {
      value: textMarker(code(n * 10 + 1)),
      entry: `news.news-b6.post-${n}.paragraph`,
      loc: { column: 'introtext' }
    }
  ]
})
const writePlan = { ops: [post(1), post(2), post(3)] }
const uploaded = {
  'picture:news.news-b6.post-1.image': 'images/a.png',
  'picture:news.news-b6.post-2.image': 'images/b.png',
  'picture:news.news-b6.post-3.image': 'images/c.png'
}

/** The pages read: the news page always, and the own page of each post in `own`. */
const pagesOf = (own) => [
  { pageType: 'news', path: 'index.php?Itemid=2' },
  ...own.map((n) => ({
    pageType: `article:post-${n}`,
    path: `index.php?view=article&id=${n}`,
    from: `article:post-${n}`
  }))
]

/** The news page shows post `shown` (title and picture), and each post in `own` has its own page read showing its title. */
const run = (shown, own = []) => {
  const renders = [
    {
      pageType: 'news',
      html: `<h3>${textMarker(code(shown * 10))}</h3><img src="/images/${'abc'[shown - 1]}.png">`
    },
    ...own.map((n) => ({ pageType: `article:post-${n}`, html: `<h1>${textMarker(code(n * 10))}</h1>` }))
  ]
  const seen = new Set([code(shown * 10), ...own.map((n) => code(n * 10))])
  const notSeen = notSeenOf({
    writePlan,
    registry: [],
    seen,
    renders,
    uploaded,
    pictures: new Set([`images/${'abc'[shown - 1]}.png`])
  })
  return declareNotSeen(notSeen, { pages: pagesOf(own) })
}

test('list items: the posts a list did not choose, whose own page was not read, are declared', () => {
  const rows = run(1)
  const why = Object.fromEntries(rows.map((r) => [r.entry, r.declared]))
  assert.deepEqual(why, {
    'news.news-b6.post-1.paragraph': null,
    'news.news-b6.post-2.title': 'list_item_not_shown',
    'news.news-b6.post-2.paragraph': 'list_item_not_shown',
    'news.news-b6.post-3.title': 'list_item_not_shown',
    'news.news-b6.post-3.paragraph': 'list_item_not_shown',
    'news.news-b6.post-2.image': 'list_item_not_shown',
    'news.news-b6.post-3.image': 'list_item_not_shown'
  })
})

test('Y3: a post whose own page was read and prints nothing of a value is not excused by its list', () => {
  const rows = run(1, [2, 3])
  const why = Object.fromEntries(rows.map((r) => [r.entry, r.declared]))
  assert.deepEqual(why, {
    'news.news-b6.post-1.paragraph': null,
    'news.news-b6.post-2.paragraph': null,
    'news.news-b6.post-3.paragraph': null,
    'news.news-b6.post-2.image': null,
    'news.news-b6.post-3.image': null
  })
})

test('list items: only the shown post counts, so the unexplained count does not move with the post chosen', () => {
  const unexplained = (rows) => rows.filter((r) => !r.declared).length
  assert.equal(unexplained(run(1)), 1)
  assert.equal(unexplained(run(3)), 1)
})

test('Y3: the reason is derived again from the pages read, and a row field alone gives none', () => {
  const rows = run(2)
  const bare = rows.map(({ declared: _d, ...n }) => n)
  assert.deepEqual(
    declareNotSeen(bare, { pages: pagesOf([]) }).map((r) => r.declared),
    rows.map((r) => r.declared)
  )
  // Rows of posts whose own page was read, each claiming its post was left out by the list: no reason.
  const own = run(2, [1, 3]).filter((r) => /post-[13]\./.test(r.entry))
  assert.ok(own.length > 0)
  const forged = own.map(({ declared: _d, ...n }) => ({ ...n, listItem: { shown: 1, items: 3 } }))
  assert.ok(
    declareNotSeen(forged, { pages: pagesOf([1, 3]) }).every((r) => r.declared !== 'list_item_not_shown')
  )
  // No pages read are known: nothing is excused by a list.
  assert.ok(declareNotSeen(bare, {}).every((r) => r.declared !== 'list_item_not_shown'))
})
