// Which written items a list block shows is the site's choice (ticket #586, review 4): a blog list sorts by date and
// the build writes every item within seconds, so ties fall in no fixed order, and a list shows a page of its items.
// An invented bakery news list of three posts, of which the page shows one: the two posts the list did not choose
// are declared `list_item_not_shown` (stable whichever the site picks), the shown post's missing field stays
// unexplained, and the reason is read back from the row alone (a record holds no page HTML).
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

/** The news page shows post `shown` (title and picture), and each post's own article page shows its title. */
const run = (shown) => {
  const renders = [
    {
      pageType: 'news',
      html: `<h3>${textMarker(code(shown * 10))}</h3><img src="/images/${'abc'[shown - 1]}.png">`
    },
    ...[1, 2, 3].map((n) => ({ pageType: `article:post-${n}`, html: `<h1>${textMarker(code(n * 10))}</h1>` }))
  ]
  const seen = new Set([code(10), code(20), code(30)])
  const notSeen = notSeenOf({
    writePlan,
    registry: [],
    seen,
    renders,
    uploaded,
    pictures: new Set([`images/${'abc'[shown - 1]}.png`])
  })
  return declareNotSeen(notSeen, {})
}

test('list items: the posts a list did not choose are declared, the shown post keeps its missing field', () => {
  const rows = run(1)
  const why = Object.fromEntries(rows.map((r) => [r.entry, r.declared]))
  assert.deepEqual(why, {
    'news.news-b6.post-1.paragraph': null,
    'news.news-b6.post-2.paragraph': 'list_item_not_shown',
    'news.news-b6.post-3.paragraph': 'list_item_not_shown',
    'news.news-b6.post-2.image': 'list_item_not_shown',
    'news.news-b6.post-3.image': 'list_item_not_shown'
  })
})

test('list items: only the shown post counts, so the unexplained count does not move with the post chosen', () => {
  const unexplained = (rows) => rows.filter((r) => !r.declared).length
  assert.equal(unexplained(run(1)), 1)
  assert.equal(unexplained(run(3)), 1)
})

test('list items: the reason is read back from the row alone, as a record re-check does', () => {
  const rows = run(2)
  const again = declareNotSeen(
    rows.map(({ declared: _d, ...n }) => n),
    {}
  )
  assert.deepEqual(
    again.map((r) => r.declared),
    rows.map((r) => r.declared)
  )
})
