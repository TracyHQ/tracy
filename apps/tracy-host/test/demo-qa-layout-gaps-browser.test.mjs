/**
 * Two layout gaps the page measures read (`measurePages`): an orphan card row (a grid or wrapping row of cards of one kind
 * whose last line holds fewer cards, pushed to the left with a visible hole on its right) and a blank footer column (a
 * footer column that prints no words, link or picture). Invented pages served from here, read at 1440 and 390.
 * Launches its own headless Chromium; skipped when Playwright or its browser is not installed.
 *   node --test --test-concurrency=1 apps/tracy-host/test/demo-qa-layout-gaps-browser.test.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'

import { readDemoPage } from '../src/demo-qa-browser.js'

let playwright = null
try {
  playwright = await import('playwright')
} catch {}
const opts = { skip: playwright ? false : 'playwright is not installed' }
after(() => setTimeout(() => process.exit(), 200))

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const head = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px sans-serif }
  .wrap { width: 1200px; max-width: 100%; margin: 0 auto }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px }
  .card { height: 160px; background: #eee }
  .flex { display: flex; flex-wrap: wrap; gap: 24px }
  .flex > .card { flex: 0 0 calc((100% - 48px) / 3) }
  .centered { justify-content: center }
  .between { justify-content: space-between }
  .ghost::before { content: ""; display: block; width: 24px; height: 24px; mask-image: url(/logo.png); background-color: transparent }
  .ico::before { content: "\\2605"; font-size: 24px }
  .grow > .card { flex: 1 0 calc((100% - 48px) / 3) }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; width: 300px }
  .tags a { padding: 4px 8px; background: #ddd }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr } .flex > .card { flex-basis: 100% } }
  footer .row { display: flex; gap: 24px; padding: 24px }
  footer .col { flex: 1 1 0; min-height: 120px }
  @media (max-width: 600px) { footer .row { flex-direction: column } }
</style>`
const cards = (n, cls = 'card') =>
  Array.from({ length: n }, (_, i) => `<div class="${cls}">Card ${i + 1}</div>`).join('')
const PAGES = {
  '/orphan': `${head}<div class="wrap"><div id="services" class="grid">${cards(5)}</div></div>`,
  '/orphan-flex': `${head}<div class="wrap"><div id="team" class="flex">${cards(4)}</div></div>`,
  '/rows-fine': `${head}<div class="wrap">
    <div id="full" class="grid">${cards(6)}</div>
    <div id="centered" class="flex centered">${cards(5)}</div>
    <div id="grown" class="flex grow">${cards(5)}</div>
    <div id="spread" class="flex between">${cards(5)}</div>
    <div id="one-row" class="grid">${cards(2)}</div>
    <div id="mixed" class="grid">${cards(4)}<div class="cta">See all</div></div>
    <nav><div class="tags"><a href="/a">Jab</a><a href="/b">Hook and cross</a><a href="/c">Uppercut drills</a><a href="/d">Footwork</a><a href="/e">Pads</a></div></nav>
  </div>`,
  '/footer': `${head}<main><p>Body</p></main><footer><div class="row">
    <div class="col" id="about"><h3>About</h3><p>A fictional gym.</p></div>
    <div class="col" id="links"><a href="/classes">Classes</a></div>
    <div class="col" id="social"><a href="https://social.example/x" aria-label="Social"><svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg></a></div>
    <div class="col" id="icon-font"><a href="https://social.example/y" aria-label="Other"><i class="ico"></i></a></div>
    <div class="col" id="logo"><img src="/logo.png" width="80" height="40" alt=""></div>
    <div class="col" id="blank"><div class="moduletable"><div class="custom"> </div></div></div>
    <div class="col" id="ghost"><span class="ghost"></span></div>
    <div class="col" id="spacer"></div>
  </div></footer>`
}

function site() {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (path === '/logo.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
    const html = PAGES[path]
    if (!html) return res.writeHead(404, { 'content-type': 'text/html' }).end('<p>Not found</p>')
    res.writeHead(200, { 'content-type': 'text/html' }).end(html)
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    )
  )
}

async function read(path) {
  const { server, base } = await site()
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await (await browser.newContext()).newPage()
    const r = await readDemoPage(page, `${base}${path}`, path, { measurePages: true })
    return Object.fromEntries(r.measures.map((m) => [m.width, m]))
  } finally {
    await browser.close()
    server.close()
  }
}

test(
  'a grid whose last row holds fewer cards, pushed left, is an orphan row at 1440, not at 390',
  opts,
  async () => {
    const at = await read('/orphan')
    assert.deepEqual(
      at[1440].orphanRows.map(({ selector, perRow, lastRow, rows }) => ({ selector, perRow, lastRow, rows })),
      [{ selector: 'div#services.grid', perRow: 3, lastRow: 2, rows: 2 }]
    )
    assert.ok(at[1440].orphanRows[0].gap > 300, 'the hole is about one card wide')
    assert.deepEqual(at[390].orphanRows, [], 'one card per row has no orphan')
  }
)

test('a wrapping flex row of fixed cards leaves an orphan the same way', opts, async () => {
  const at = await read('/orphan-flex')
  assert.deepEqual(
    at[1440].orphanRows.map((o) => [o.selector, o.perRow, o.lastRow]),
    [['div#team.flex', 3, 1]]
  )
})

test(
  'a final category pager explains only its own remaining row and keeps the raw geometry',
  opts,
  async () => {
    const pager = (
      path,
      {
        next = false,
        later = false,
        missingEnd = false,
        current = true,
        foreign = false,
        priorQuery = '',
        topology = 'wrapped',
        multiple = false
      } = {}
    ) =>
      `<div class="com-content-category-blog__navigation"><div class="com-content-category-blog__pagination">
    <nav aria-label="Pagination">${topology === 'direct' ? '' : `<div class="${topology === 'wrapped' ? 'pagination' : 'unsupported'}">`}<ul class="pagination">
    <li class="page-item"><a href="${path}">First</a></li><li class="page-item"><a href="${path}">Previous</a></li>
    <li class="page-item"><a href="${foreign ? '/another-list' : path}${priorQuery ? `?${priorQuery}` : ''}">1</a></li>
    <li class="active page-item"><span ${current ? 'aria-current="true"' : ''}>2</span></li>
    ${later ? `<li class="page-item"><a href="${path}?start=18">3</a></li>` : ''}
    ${next ? `<li class="page-item"><a href="${path}?start=18">Next</a></li>` : '<li class="disabled page-item"><span>Next</span></li>'}
    ${missingEnd ? '' : '<li class="disabled page-item"><span>End</span></li>'}
    </ul>${multiple ? '<ul class="pagination"><li class="page-item">Other pager</li></ul>' : ''}${topology === 'direct' ? '' : '</div>'}</nav></div></div>`
    const grid = `<div class="items-row grid">${cards(4)}</div>`
    const cases = [
      { path: '/direct', options: { topology: 'direct' }, proof: true },
      { path: '/final', proof: true },
      { path: '/unsupported-wrapper', options: { topology: 'unsupported' } },
      { path: '/multiple-pagers', options: { topology: 'direct', multiple: true } },
      { path: '/next', options: { next: true } },
      { path: '/later', options: { later: true } },
      { path: '/missing-end', options: { missingEnd: true } },
      { path: '/no-current', options: { current: false } },
      { path: '/foreign', options: { foreign: true } },
      {
        path: '/identity',
        query: 'Itemid=101&catid=5',
        options: { priorQuery: 'catid=5&Itemid=101' },
        proof: true
      },
      { path: '/other-itemid', query: 'Itemid=101', options: { priorQuery: 'Itemid=102' } },
      { path: '/other-category', query: 'catid=5', options: { priorQuery: 'catid=6' } },
      { path: '/missing-filter', query: 'filter=featured' },
      { path: '/extra-filter', options: { priorQuery: 'filter=featured' } },
      { path: '/query-only', noPager: true },
      { path: '/other-owner', separate: true },
      { path: '/multiple-lists', extra: grid }
    ]
    for (const c of cases) {
      const nav = c.noPager ? '' : pager(c.path, c.options)
      PAGES[c.path] = `${head}<div class="wrap"><div class="com-content-category-blog blog donation-layout">
      <div class="container-fluid com-content-category-blog__items blog-items">${grid}${c.extra ?? ''}</div>
      ${c.separate ? '' : nav}</div>
      ${c.separate ? `<div class="com-content-category-blog">${nav}</div>` : ''}</div>`
    }
    const { server, base } = await site()
    const browser = await playwright.chromium.launch({ headless: true })
    try {
      const page = await (await browser.newContext()).newPage()
      for (const c of cases) {
        const path = `${c.path}?${c.query ? `${c.query}&` : ''}start=9`
        const read = await readDemoPage(page, `${base}${path}`, path, { measurePages: true })
        assert.deepEqual(
          read.measures.map((m) => m.width),
          [1440, 390],
          c.path
        )
        const rows = read.measures.find((m) => m.width === 1440).orphanRows
        assert.equal(rows.length, c.extra ? 2 : 1, c.path)
        for (const row of rows) {
          assert.deepEqual([row.perRow, row.lastRow, row.rows], [3, 1, 2], c.path)
          assert.ok(row.gap > 300, c.path)
          assert.equal(Boolean(row.pagination), Boolean(c.proof), c.path)
        }
        if (c.proof) {
          const navigation = 'div.com-content-category-blog > .com-content-category-blog__navigation'
          assert.equal(
            rows[0].pagination.association.pager,
            `${navigation} > .com-content-category-blog__pagination > nav[aria-label] > ${c.options?.topology === 'direct' ? '' : '.pagination > '}ul.pagination`,
            c.path
          )
          assert.deepEqual(rows[0].pagination.pages, [
            {
              number: 1,
              current: false,
              href: `${c.path}${c.options?.priorQuery ? `?${c.options.priorQuery}` : ''}`
            },
            { number: 2, current: true, href: null }
          ])
          assert.deepEqual(rows[0].pagination.next, { disabled: true, href: null })
          assert.deepEqual(rows[0].pagination.end, { disabled: true, href: null })
        }
      }
    } finally {
      await browser.close()
      server.close()
    }
  }
)

test(
  'full rows, a centred, stretched or spread last row, one row, mixed items and a tag cloud are no orphan rows',
  opts,
  async () => {
    const at = await read('/rows-fine')
    assert.deepEqual(at[1440].orphanRows, [])
    assert.deepEqual(at[390].orphanRows, [])
  }
)

test(
  'a footer column that prints nothing is blank; words, a link, an icon, an icon font, a picture or a bare spacer are not',
  opts,
  async () => {
    const at = await read('/footer')
    assert.deepEqual(
      at[1440].blankFooterColumns.map((c) => c.selector),
      ['div#blank.col', 'div#ghost.col']
    )
    assert.deepEqual(at[390].blankFooterColumns, [], 'stacked columns leave no hole beside a filled one')
  }
)
