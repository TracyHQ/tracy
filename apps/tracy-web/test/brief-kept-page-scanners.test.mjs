import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeOutsideMap } from '../src/sites/brief-engines/joomla-outside-map.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const cards =
  '<body><section id="staff"><div class="row"><div class="col-md-3"><p>Owner</p></div><div class="col-md-3"><p>Editor</p></div><div class="col-md-3"><p></p></div><div class="col-md-3"><p></p></div></div></section></body>'

for (const [trade, prefix] of [
  ['bakery', '/index.php'],
  ['dental clinic', '']
]) {
  test(`${trade}: every kept collection is scanned at its served route, beyond the old sample`, async () => {
    const writes = []
    const notes = []
    const paths = Array.from({ length: 7 }, (_, n) => `/page-${n}`)
    const read = async (path) => {
      if (path === '/') return { status: 200, html: `<a href="${prefix}/page-6">Staff</a>` }
      if (paths.some((p) => path === `${prefix}${p}`))
        return { status: 200, html: path.endsWith('/page-6') ? cards : '<body><p>Kept page</p></body>' }
      return { status: 404, html: '' }
    }
    await writeOutsideMap({
      siteKey: 'fictional',
      applyId: 'scan',
      headOnly: true,
      plan: { outside: {}, pages: paths.map((path) => ({ path, decision: 'keep' })) },
      contentMap: { slots: [] },
      note: (line) => notes.push(line),
      reader: {
        text: async (path) => {
          const page = await read(path)
          if (page.status !== 200) throw new Error(`HTTP ${page.status}`)
          return page.html
        }
      },
      apply: async ({ action, params }) => {
        if (action === 'content.list')
          return {
            ok: true,
            items: params.kind === 'templateStyle' ? [{ id: 1, params: { snippet_close_head: '' } }] : []
          }
        if (action === 'content.update') writes.push(params.fields)
        return { ok: true }
      }
    })
    assert.match(
      writes.map((w) => w.params ?? w.content ?? '').join(''),
      /#staff[^{}]*\{[^{}]*justify-content:center/
    )
    assert.deepEqual(notes, [])
    const result = await runLeftoverCheck({
      readPage: read,
      paths,
      contentMap: {},
      brief: {},
      check: ({ pages }) => {
        assert.equal(pages.filter((p) => p.status === 200).length, 8)
        return { pass: true, findings: [], counts: {} }
      }
    })
    assert.deepEqual(result.missing, [])
    assert.deepEqual(result.broken, [])
  })
}

test('an unread kept page is reported by the head scanner and leftover check', async () => {
  const notes = []
  await writeOutsideMap({
    siteKey: 'fictional',
    applyId: 'scan',
    headOnly: true,
    plan: { outside: {}, pages: [{ path: '/staff', decision: 'keep' }] },
    reader: {
      text: async (path) => {
        if (path === '/') return '<body></body>'
        throw new Error('HTTP 503')
      }
    },
    contentMap: {},
    note: (line) => notes.push(line),
    apply: async () => ({ ok: true, items: [] })
  })
  assert.ok(notes.some((line) => line.includes('/staff') && line.includes('could not be read')))
  const result = await runLeftoverCheck({
    paths: ['/staff'],
    readPage: async () => null,
    contentMap: {},
    brief: {},
    check: () => ({ pass: true, findings: [], counts: {} })
  })
  assert.equal(result.pass, false)
  assert.ok(result.unread.includes('/staff'))
})

test('the overlap browser receives served routes and reports unread planned pages', async () => {
  const { overlapSafetyNet } = await import('../src/sites/brief-engines/picture-overlap-net.js')
  const notes = []
  let asked
  const result = await overlapSafetyNet({
    reader: {
      text: async (path) => {
        if (path === '/') return '<a href="/index.php/staff">Staff</a>'
        if (path === '/index.php/staff') return cards
        throw new Error('HTTP 404')
      }
    },
    check: async (_site, paths) => {
      asked = paths
      return { findings: [] }
    },
    plan: {
      pages: [
        { path: '/staff', decision: 'keep' },
        { path: '/unread', decision: 'keep' }
      ]
    },
    siteKey: 'fictional',
    pictures: [],
    rewrite: async () => {},
    note: (line) => notes.push(line)
  })
  assert.deepEqual(asked, ['/', '/index.php/staff'])
  assert.ok(notes.some((line) => line.includes('/unread')))
  assert.equal(result.checked, false)
})

test('leftover scans read every kept page even beyond the link discovery budget', async () => {
  const paths = Array.from({ length: 30 }, (_, n) => `/page-${n}`)
  const result = await runLeftoverCheck({
    paths,
    brief: {},
    contentMap: {},
    readPage: async (path) => ({
      status: paths.includes(path) || path === '/' ? 200 : 404,
      html: '<p>Owner content</p>'
    }),
    check: ({ pages }) => {
      assert.equal(pages.filter((p) => p.status === 200).length, 31)
      return { pass: true, findings: [], counts: {} }
    }
  })
  assert.equal(result.pass, true)
})

test('clean URL failures, empty bodies and stylesheet failures cannot be clean reports', async () => {
  for (const status of [404, 503, 200]) {
    const result = await runLeftoverCheck({
      paths: ['/staff'],
      brief: {},
      contentMap: {},
      readPage: async (path) =>
        path === '/' ? { status: 200, html: '<p>Fictional clinic</p>' } : { status, html: '' },
      check: () => ({ pass: true, findings: [], counts: {} })
    })
    assert.equal(result.pass, false)
    assert.ok(result.broken.some((page) => page.path === '/staff'))
  }
})

test('the shared resolver accepts relative Joomla routes and leaves clean 404s as failures', async () => {
  const { keptPageReader } = await import('../src/lib/kept-page-reader.js')
  const read = keptPageReader(async (path) => ({
    status: path === '/' || path === '/index.php/staff' ? 200 : 404,
    html: path === '/' ? '<a href="index.php/staff">Staff</a>' : cards
  }))
  assert.equal((await read('/staff')).servedPath, '/index.php/staff')
  const clean = keptPageReader(async (path) => ({
    status: path === '/' ? 200 : 404,
    html: '<body><p>Fictional clinic</p></body>'
  }))
  const failed = await clean('/staff')
  assert.equal(failed.servedPath, null)
  assert.deepEqual(failed.attempts, [{ path: '/staff', status: 404 }])
})

test('an unread stylesheet is reported without resolving it as a page', async () => {
  const asked = []
  const result = await runLeftoverCheck({
    paths: [],
    brief: {},
    contentMap: {},
    readPage: async (path) => {
      asked.push(path)
      return path === '/'
        ? { status: 200, html: '<link rel="stylesheet" href="/media/site.css"><p>Fictional bakery</p>' }
        : { status: 404, html: '' }
    },
    check: () => ({ pass: true, findings: [], counts: {} })
  })
  assert.equal(result.pass, false)
  assert.ok(result.unread.includes('/media/site.css'))
  assert.ok(!asked.includes('/index.php/media/site.css'))
})
