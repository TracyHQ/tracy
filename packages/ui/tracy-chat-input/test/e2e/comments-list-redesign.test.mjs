/**
 * The Comments list redesign A + L1 (Akemi 01/10/2026, `tasks/comments-list-redesign-plan.md`), driven in
 * a real browser: hover never moves a row's content; a stuck page header sits flush at the top of the
 * list and the card's border stays whole; the Open | Resolved filter, its counts and its narrow layout; a row opened is read
 * and "Mark as unread" makes it unread again (this person's marks, on the server); Delete → Undo, and
 * Delete → the window runs out → gone, never counted; the picture full screen closes on ✕, Esc and the
 * backdrop; Copy link asks the Browser tab inside the click, where the clipboard still takes a write.
 *
 * Seam: the real CommentsView and its bottom row mounted with react-dom in system Chrome, inside the
 * chain dsh draws for a conversation with a view on screen (its ConversationRoot CSS hashed as the build
 * does, as `comment-composer-row.test.mjs`), with this plugin's real CSS. The Browser tab (the fork) is
 * played on the page: it hears `tracy:comment-act` and answers with `tracy:comment-list`, as its
 * `commentListDetail` does (`deleting`, `thread`). The server's read doors are a fake `fetch`. Harness
 * rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system Chrome, and a missing
 * dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const SIDEBAR_STYLES = path.join(repoRoot, 'packages/ui/tracy-sidebar/src/client/styles.ts')
const DSH_ROOT_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css'
)
/** dsh's CSS-module classes this page uses, renamed the way the build hashes them; `:global()` unwrapped. */
const hashModuleClasses = (css) =>
  css
    .replace(/:global\(([^()]*)\)/g, '$1')
    .replace(/\.(root|body|scrollBody|viewArea|composerSeat)\b(?![\w-])/g, '._$1_x7k2')

const ORIGIN = 'https://kinetic.example'
const HOME = `${ORIGIN}/`
const PRICING = `${ORIGIN}/pricing/`
const AKEMI = { accountId: 'a1', email: 'kimdesigner@example.com', name: 'Akemi', initial: 'A' }
const LEE = { accountId: 'a2', email: 'lee@example.com', name: 'Lee', initial: 'L' }
/** A 1×1 PNG, so the picture chip and the full-screen view have a real image to load. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A comment as the Browser tab lists it. */
function comment(i, over = {}) {
  return {
    id: `c${i}`,
    n: i,
    url: HOME,
    text: `Comment ${i}: make this line say something a little longer than it does today, please.`,
    status: 'pending',
    createdAt: Date.now() - i * 60_000,
    element: { url: HOME, selector: `p:nth-of-type(${i})`, text: `words ${i}`, tag: 'p' },
    author: LEE,
    can: { edit: false, delete: false },
    replyCount: 0,
    sentToTracy: false,
    attachments: [],
    ...over
  }
}

let outDir = ''
let script = ''
let sheet = ''
let railSheet = ''
let browser

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-list-redesign-'))
  const outfile = path.join(outDir, 'page.js')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        import { createCommentsState, makeCommentsFooter, makeCommentsView, watchCommentsBadge } from './CommentsView'
        // The Browser tab, played: it keeps the list, answers acts as the fork does, re-lists after each.
        window.mount = (comments, { thread = null, unreadMarks = [], readsAfter = 0, holdReads = false, view = true, tabs = false } = {}) => {
          window.acts = []
          window.doors = []
          // holdReads: every /reads answer waits until the test calls releaseReads(), so "before the marks
          // are in" is a state the test holds, not a race against a timer.
          let release = () => {}
          const held = holdReads ? new Promise((done) => { release = done }) : null
          window.releaseReads = () => release()
          let list = { sessionId: 's1', tabId: 'tab-a', siteKey: 'kinetic', host: 'kinetic.example', active: true,
            url: '${HOME}', comments, thread }
          // The server's read marks, kept as the door keeps them: a later /reads answers what was filed.
          const marks = new Map(unreadMarks.map((r) => [r.id, r]))
          const fetch = async (url, init = {}) => {
            window.doors.push((init.method ?? 'GET') + ' ' + url)
            const json = (v) => new Response(JSON.stringify(v), { status: 200 })
            if (url.endsWith('/reads')) {
              if (held) await held
              if (readsAfter > 0) await new Promise((done) => setTimeout(done, readsAfter))
              return json({ reads: [...marks.values()] })
            }
            const file = (seenN) => {
              const read = { id: url.split('/').at(-2), seenN }
              marks.set(read.id, read)
              return json({ read })
            }
            // The number the tab saw, as the door keeps it (059-site-comment-read-seen-n.sql).
            if (url.endsWith('/read')) return file(JSON.parse(init.body).seenN)
            if (url.endsWith('/unread')) return file(null)
            return json({ comments: [] })
          }
          const state = createCommentsState({
            storage: null,
            server: { siteKey: 'kinetic', fetch },
            startCommenting: () => { window.started = (window.started ?? 0) + 1 }
          })
          window.state = state
          state.setViewer('${AKEMI.email}')
          const relist = () => state.lists.accept(list)
          let timer = null
          window.addEventListener('tracy:comment-act', (event) => {
            const act = event.detail
            window.acts.push(act)
            if (act.kind === 'link') {
              // The fork's copy runs inside the click: the clipboard still takes the write.
              window.copied = navigator.clipboard.writeText('${ORIGIN}/kinetic/?open=browser&page=/&mode=edit&comment=' + act.ids[0])
                .then(() => 'ok', (e) => String(e))
            }
            if (act.kind === 'reveal') { list = { ...list, thread: act.ids[0] }; relist() }
            if (act.kind === 'remove') {
              const until = Date.now() + 10000
              list = { ...list, comments: list.comments.map((c) => c.id === act.ids[0] ? { ...c, deleting: until } : c) }
              relist()
              timer = setTimeout(() => {
                list = { ...list, comments: list.comments.filter((c) => c.id !== act.ids[0]) }
                relist()
              }, 10000)
            }
            if (act.kind === 'undo') {
              clearTimeout(timer)
              list = { ...list, comments: list.comments.map(({ deleting, ...c }) => c) }
              relist()
            }
          })
          // The fork opening a thread card by itself: a click on a pin, or a link's comment=<id>.
          window.openThread = (id) => { list = { ...list, thread: id }; relist() }
          relist()
          state.lists.focus('s1')
          state.setFilter('page')
          // The Comments list on screen: dsh mounts it when its tab is shown, not before.
          window.showView = () => {
            createRoot(document.getElementById('view')).render(createElement(makeCommentsView(state), { sessionId: 's1' }))
            createRoot(document.getElementById('seat')).render(createElement(makeCommentsFooter(state), {}))
          }
          if (view) window.showView()
          // dsh's tab strip (Chat | Comments), fixed so it moves nothing else; the badge rides its Comments tab.
          if (tabs) {
            const strip = document.createElement('div')
            strip.setAttribute('data-conversation-tabs', '')
            strip.style.cssText = 'position:fixed;top:0;right:0;display:flex'
            for (const words of ['Chat', 'Comments']) {
              const tab = document.createElement('button')
              tab.setAttribute('role', 'tab')
              tab.textContent = words
              strip.append(tab)
            }
            document.body.append(strip)
            watchCommentsBadge(state, () => 'Comments')
          }
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  script = outfile
  const cssFile = path.join(outDir, 'css.cjs')
  await esbuild.build({
    stdin: {
      contents: `export { CSS } from './styles'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'ts'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: cssFile,
    logLevel: 'silent'
  })
  sheet = hashModuleClasses(readFileSync(DSH_ROOT_CSS, 'utf8')) + require(cssFile).CSS
  // The left column's own CSS (tracy-sidebar): its Settings button and the hairline above it.
  const railFile = path.join(outDir, 'rail.cjs')
  await esbuild.build({
    entryPoints: [SIDEBAR_STYLES],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    define: { __TAILWIND_CSS__: '""' },
    outfile: railFile,
    logLevel: 'silent'
  })
  railSheet = require(railFile).CSS
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * A page with the dsh chain, the view mounted on `comments`. `rail`: the left column's foot beside it, as
 * tracy-sidebar draws it (its real CSS; the footer wrapper's p-2 as 8px padding), both ending at the
 * window's bottom as in dsh. `width` is the window's.
 */
async function open(comments, options = {}, { height = 600, width = 420, clock = false, rail = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost' })
  const page = await context.newPage()
  if (clock) await page.clock.install()
  await page.route('http://localhost/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<style>html,body{margin:0;height:100%;font-family:Arial,sans-serif}' +
        ':root{--dsw-alias-bg-base:#fff;--border:#e3e7e9;--foreground:#172026;--background:#fff}</style>' +
        `<style>${sheet}${rail ? railSheet : ''}</style></head><body>` +
        (rail
          ? '<div style="display:flex;height:100%">' +
            '<div class="tsb-root tsb-rail" style="display:flex;flex-direction:column;width:56px;flex:none;border-right:1px solid var(--border)">' +
            '<div style="flex:1"></div><div style="padding:8px;display:flex;flex-direction:column;align-items:center">' +
            // The real seat: the account menu's anchor (`.ts-account`, Popover in @tracy/core/site-tabs) holds the face button.
            '<div data-slot="sidebar.settings" style="display:contents"><div class="ts-account" style="position:relative">' +
            '<button type="button" data-slot="button" ' +
            'style="border:0;background:none;display:inline-flex;align-items:center">&#9881;</button></div></div></div></div>' +
            '<div style="flex:1;min-width:0">'
          : '') +
        `<div class="_root_x7k2" data-phase="active" style="display:flex;flex-direction:column;height:${height}px">` +
        '<div class="_body_x7k2" data-conversation-content>' +
        '<div class="_scrollBody_x7k2" data-conversation-scroll>' +
        '<div data-slot="conversation.session" style="display:contents">' +
        '<div class="_viewArea_x7k2"><div data-slot="conversation.view" style="display:contents" id="view"></div></div></div>' +
        '<div class="_composerSeat_x7k2" data-composer-seat id="seat"></div>' +
        '</div></div></div>' +
        (rail ? '</div></div>' : '') +
        '</body></html>'
    })
  )
  await page.route('http://localhost/img/*', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(PIXEL.split(',')[1], 'base64') })
  )
  await page.goto('http://localhost/')
  await page.addScriptTag({ path: script })
  await page.evaluate(([c, o]) => window.mount(c, o), [comments, options])
  if (options.view !== false) await page.waitForSelector('[data-tracy-comments]')
  return { page, close: () => context.close() }
}

/** Every box a row draws its content with, rounded, keyed by what it is. */
const contentBoxes = (page, id) =>
  page.evaluate((rowId) => {
    const row = document.querySelector(`[data-comment="${rowId}"]`)
    const out = { row: row.getBoundingClientRect().toJSON() }
    for (const sel of [
      '.tv-ci-num',
      '.tv-ci-avatar',
      '.tv-ci-handle',
      '.tv-ci-age',
      '.tv-ci-text',
      '.tv-ci-tag',
      '.tv-ci-corner',
      '.tv-ci-replies'
    ])
      out[sel] = row.querySelector(sel)?.getBoundingClientRect().toJSON() ?? null
    return JSON.parse(JSON.stringify(out, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)))
  }, id)

test('hover never moves content: the row keeps its size, every piece its place; ✓ and ⋯ appear in the fixed corner where the unread dot was', async () => {
  const { page, close } = await open([comment(1, { replyCount: 2 }), comment(2)], { unreadMarks: [] })
  await page.waitForSelector('[data-comment="c1"][data-unread] .tv-ci-dot')
  const rest = await contentBoxes(page, 'c1')
  const dotAtRest = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-comment="c1"] .tv-ci-dot')).visibility
  )
  // The :hover rules applied as a class (the mock measured it the same way), then a real pointer hover.
  await page.evaluate(() => document.querySelector('[data-comment="c1"]').classList.add('tv-ci-hover'))
  const hovered = await contentBoxes(page, 'c1')
  const shown = await page.evaluate(() => {
    const row = document.querySelector('[data-comment="c1"]')
    return {
      acts: getComputedStyle(row.querySelector('.tv-ci-acts')).visibility,
      dot: getComputedStyle(row.querySelector('.tv-ci-dot')).visibility
    }
  })
  assert.deepEqual(hovered, rest)
  assert.equal(dotAtRest, 'visible')
  assert.deepEqual(shown, { acts: 'visible', dot: 'hidden' })
  await page.evaluate(() => document.querySelector('[data-comment="c1"]').classList.remove('tv-ci-hover'))
  await page.hover('[data-comment="c1"] .tv-ci-text')
  assert.deepEqual(await contentBoxes(page, 'c1'), rest, 'a real pointer hover too')
  await close()
})

test('a stuck page header sits flush at the top of the list, nothing above it; the card border stays whole; the toolbar keeps 10 px above it', async () => {
  const many = Array.from({ length: 14 }, (_, i) => comment(i + 1))
  const { page, close } = await open(many, {}, { height: 520 })
  const m = await page.evaluate(() => {
    const list = document.querySelector('[data-tracy-comment-list]')
    list.scrollTop = 400
    const head = list.querySelector('.tv-cv-card-head')
    const card = head.closest('.tv-cv-card')
    const bar = document.querySelector('[data-tracy-toolbar]')
    const control = bar.querySelector('.tv-cv-status-filter').getBoundingClientRect()
    const l = list.getBoundingClientRect()
    const h = head.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const cs = getComputedStyle(card)
    // What paints just inside the list's top edge, across the header: the header, nothing else.
    const hits = [h.left + 4, (h.left + h.right) / 2, h.right - 4].map((x) => {
      const el = document.elementFromPoint(x, l.top + 1)
      return el === head || head.contains(el) ? true : `${x}: ${el?.className ?? el?.tagName}`
    })
    // The card's own left and right borders, beside the stuck header.
    const edge = (x) => {
      const el = document.elementFromPoint(x, h.top + h.height / 2)
      return el === card
        ? true
        : `${x} (card ${c.left}..${c.right}, head ${h.left}..${h.right}): ${el?.className ?? el?.tagName}`
    }
    return {
      scrolled: list.scrollTop,
      gap: h.top - l.top,
      cardAbove: c.top < l.top,
      hits,
      borders: [cs.borderLeftWidth, cs.borderRightWidth],
      inside: h.left >= c.left + 1 - 0.01 && h.right <= c.right - 1 + 0.01,
      // Whole pixels: hit testing rounds a fractional point to the pixel.
      edges: [edge(Math.floor(c.left)), edge(Math.ceil(c.right) - 1)],
      toolbarGap: l.top - control.bottom
    }
  })
  assert.ok(m.scrolled > 0, 'the list scrolls')
  assert.ok(m.cardAbove, 'the card started above the list top: its header is stuck')
  assert.equal(Math.round(m.gap), 0, 'flush with the top of the list')
  assert.deepEqual(m.hits, [true, true, true], 'nothing shows above the stuck header')
  assert.deepEqual(m.borders, ['1px', '1px'])
  assert.ok(m.inside, 'the header sits inside the card border')
  assert.deepEqual(m.edges, [true, true], 'both side borders paint beside the stuck header')
  assert.ok(m.toolbarGap >= 10, `toolbar control to list: ${m.toolbarGap}px`)
  await close()
})

/** The status filter's two sides as `[status, aria-pressed, words, count]`; their counts are never pills. */
const statusSides = (page) =>
  page.$$eval('[data-tracy-status-filter] [data-tracy-status]', (els) =>
    els.map((el) => [
      el.dataset.tracyStatus,
      el.getAttribute('aria-pressed'),
      el.querySelector('.tv-cv-filter-long').textContent,
      el.querySelector('.tv-cv-pill') === null ? el.querySelector('.tv-cv-filter-num').textContent : 'PILL'
    ])
  )

test('Open | Resolved: both sides always on screen, each with its count, Open pressed by default; Resolved shows only resolved and hides Ask Tracy to edit all', async () => {
  const comments = [
    comment(1),
    comment(2),
    comment(3, { status: 'resolved', resolvedAt: new Date().toISOString() }),
    comment(4, { url: PRICING }),
    comment(5, { url: PRICING, status: 'resolved', resolvedAt: new Date().toISOString() }),
    comment(6, { url: PRICING, status: 'resolved', resolvedAt: new Date().toISOString() })
  ]
  const { page, close } = await open(comments)
  assert.equal(await page.getAttribute('[data-tracy-status-filter]', 'role'), 'group')
  assert.equal(await page.locator('[data-tracy-status-filter] [aria-haspopup]').count(), 0, 'no menu')
  // Current page: this page's comments.
  assert.deepEqual(await statusSides(page), [
    ['open', 'true', 'Open', '2'],
    ['resolved', 'false', 'Resolved', '1']
  ])
  assert.equal(await page.locator('.tv-cv-send-all').count(), 1)
  // All pages: the whole site.
  await page.click('[data-tracy-filter] .tv-cv-filter-side:nth-child(2)')
  assert.deepEqual(await statusSides(page), [
    ['open', 'true', 'Open', '3'],
    ['resolved', 'false', 'Resolved', '3']
  ])
  await page.click('[data-tracy-filter] .tv-cv-filter-side:nth-child(1)')
  await page.click('[data-tracy-status="resolved"]')
  assert.deepEqual(await page.$$eval('[data-comment]', (els) => els.map((e) => e.dataset.comment)), ['c3'])
  assert.equal(await page.locator('.tv-cv-send-all').count(), 0)
  assert.equal(await page.getAttribute('[data-tracy-status-filter]', 'data-tracy-status-filter'), 'resolved')
  assert.deepEqual(await statusSides(page), [
    ['open', 'false', 'Open', '2'],
    ['resolved', 'true', 'Resolved', '1']
  ])
  assert.equal(await page.locator('.tv-cv-del').count(), 1, 'Delete all stays for the resolved shown')
  await page.click('[data-tracy-status="open"]')
  assert.deepEqual(await page.$$eval('[data-comment]', (els) => els.map((e) => e.dataset.comment)), [
    'c1',
    'c2'
  ])
  await close()
})

test("the status filter is the page filter's control: same side height, same pressed look; its counts are plain muted numbers, the chosen one bolder; it sits left on the toolbar's row with the actions at the right", async () => {
  const { page, close } = await open([comment(1), comment(2)], { unreadMarks: [] })
  await page.waitForSelector('[data-tracy-filter] .tv-cv-pill')
  // A tab wide enough for the filter and both actions (a desktop chat column).
  await page.setViewportSize({ width: 560, height: 600 })
  const m = await page.evaluate(() => {
    const look = (el) => {
      const cs = getComputedStyle(el)
      return [cs.height, cs.borderRadius, cs.backgroundColor, cs.color, cs.fontWeight, cs.boxShadow].join(' ')
    }
    const page = document.querySelector('[data-tracy-filter]')
    const status = document.querySelector('[data-tracy-status-filter]')
    const pressed = (box) => box.querySelector('[aria-pressed="true"]')
    const idle = (box) => box.querySelector('[aria-pressed="false"]')
    const bar = document.querySelector('[data-tracy-toolbar]').getBoundingClientRect()
    const s = status.getBoundingClientRect()
    const actions = document.querySelector('.tv-cv-bar-actions').getBoundingClientRect()
    return {
      box: [look(page), look(status)],
      pressed: [look(pressed(page)), look(pressed(status))],
      idle: [look(idle(page)), look(idle(status))],
      pill: look(pressed(page).querySelector('.tv-cv-pill')),
      dot: (() => {
        const cs = getComputedStyle(pressed(page).querySelector('.tv-cv-pill'), '::after')
        return [cs.backgroundColor, cs.width, cs.height].join(' ')
      })(),
      nums: [...status.querySelectorAll('.tv-cv-filter-num')].map((el) => {
        const cs = getComputedStyle(el)
        const probe = document.body.appendChild(document.createElement('span'))
        probe.style.color = 'var(--muted-foreground, #6b7280)'
        const muted = getComputedStyle(probe).color
        probe.remove()
        return [cs.backgroundColor, cs.color === muted, cs.fontWeight]
      }),
      statusPills: status.querySelectorAll('.tv-cv-pill').length,
      oneRow: Math.abs(s.top + s.height / 2 - (actions.top + actions.height / 2)) < 1,
      left: Math.round(s.left - bar.left),
      right: Math.round(bar.right - actions.right)
    }
  })
  assert.equal(m.box[1], m.box[0], 'the control')
  assert.equal(m.pressed[1], m.pressed[0], 'the chosen side')
  assert.equal(m.idle[1], m.idle[0], 'the other side')
  // Lee 04/10/2026: the page filter's pill is grey (the open threads), the terracotta is its unread dot.
  assert.doesNotMatch(m.pill, /rgb\(191, 91, 61\)/, 'the page filter pill is not terracotta')
  assert.match(m.pill, /rgb\(107, 114, 128\)/, 'quiet grey figures')
  assert.equal(m.dot, 'rgb(191, 91, 61) 7px 7px', 'its unread dot is terracotta, 7 px')
  assert.equal(m.statusPills, 0, 'no pill in the status filter')
  assert.deepEqual(
    m.nums,
    [
      ['rgba(0, 0, 0, 0)', true, '600'],
      ['rgba(0, 0, 0, 0)', true, '400']
    ],
    'plain muted numbers, no background; the chosen side bolder'
  )
  assert.ok(m.oneRow, 'one row while it fits')
  assert.deepEqual([m.left, m.right], [0, 0], 'filter at the left edge, actions at the right edge')
  await close()
})

test('a narrow tab: the toolbar never overflows; the actions wrap whole under the status filter', async () => {
  const { page, close } = await open([comment(1), comment(2)])
  for (const width of [300, 240, 200]) {
    await page.setViewportSize({ width, height: 600 })
    const m = await page.evaluate(() => {
      const bar = document.querySelector('[data-tracy-toolbar]')
      const b = bar.getBoundingClientRect()
      const s = bar.querySelector('[data-tracy-status-filter]').getBoundingClientRect()
      const a = bar.querySelector('.tv-cv-bar-actions').getBoundingClientRect()
      const view = document.querySelector('.tv-cv')
      const out = [...bar.querySelectorAll('button, .tv-cv-pill')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.left < b.left - 0.5 || r.right > b.right + 0.5).length
      return {
        out,
        sideways: view.scrollWidth - view.clientWidth,
        wrapped: a.top >= s.bottom - 0.5,
        sameRow: Math.abs(s.top + s.height / 2 - (a.top + a.height / 2)) < 1
      }
    })
    assert.equal(m.out, 0, `${width}px: nothing past the toolbar's edge`)
    assert.equal(m.sideways, 0, `${width}px: the view never scrolls sideways`)
    assert.ok(m.wrapped || m.sameRow, `${width}px: the actions sit beside the filter or whole under it`)
  }
  await close()
})

test('a row opened is read (its mark goes to the server); "Mark as unread" makes it unread again', async () => {
  const { page, close } = await open([comment(1), comment(2)], { unreadMarks: [] })
  await page.waitForSelector('[data-comment="c1"][data-unread]')
  assert.equal(await page.locator('[data-comment="c1"] .tv-ci-dot').count(), 1)
  await page.click('[data-comment="c1"] .tv-ci-text')
  await page.waitForSelector('[data-comment="c1"]:not([data-unread])')
  assert.equal(await page.locator('[data-comment="c1"] .tv-ci-dot').count(), 0)
  assert.equal(
    await page.getAttribute('[data-comment="c1"]', 'data-selected'),
    '',
    'its thread is open: selected'
  )
  assert.ok((await page.evaluate(() => window.doors)).includes('POST /api/sites/kinetic/comments/c1/read'))
  assert.deepEqual(
    (await page.evaluate(() => window.acts)).filter((a) => a.kind === 'reveal').map((a) => a.ids),
    [['c1']]
  )
  await page.hover('[data-comment="c1"]')
  await page.click('[data-tracy-more="c1"]')
  const menu = await page.$$eval('[data-tracy-item-menu="c1"] [data-tracy-menu]', (els) =>
    els.map((e) => e.dataset.tracyMenu)
  )
  assert.deepEqual(menu, ['resolve', 'ask', 'unread', 'link'], "no Delete on someone else's comment")
  await page.click('[data-tracy-menu="unread"]')
  await page.waitForSelector('[data-comment="c1"][data-unread] .tv-ci-dot')
  assert.ok((await page.evaluate(() => window.doors)).includes('POST /api/sites/kinetic/comments/c1/unread'))
  await close()
})

/** The read marks this page filed on the server, in order. */
const readsFiled = (page) => page.evaluate(() => window.doors.filter((d) => /\/(read|unread)$/.test(d)))

test('a thread opened from its pin on the page is read too, the same as from its row', async () => {
  const { page, close } = await open([comment(1), comment(2)], { unreadMarks: [] })
  await page.waitForSelector('[data-comment="c1"][data-unread]')
  await page.evaluate(() => window.openThread('c1'))
  await page.waitForSelector('[data-comment="c1"]:not([data-unread])')
  assert.deepEqual(await readsFiled(page), ['POST /api/sites/kinetic/comments/c1/read'])
  assert.equal(await page.locator('[data-comment="c2"][data-unread]').count(), 1, 'the other stays unread')
  await close()
})

test("a thread opened by a link's comment= before this person's read marks are in is read once they are", async () => {
  // The link's thread card opens with the page, before the /reads answer: the row is not unread YET.
  const { page, close } = await open([comment(1), comment(2)], {
    thread: 'c1',
    unreadMarks: [],
    readsAfter: 300
  })
  await page.waitForSelector('[data-comment="c2"][data-unread]')
  await page.waitForSelector('[data-comment="c1"]:not([data-unread])', { timeout: 2000 })
  assert.deepEqual(await readsFiled(page), ['POST /api/sites/kinetic/comments/c1/read'])
  await close()
})

test('a thread opened while the Comments list is not on screen is read; the list shows it read when it comes', async () => {
  const { page, close } = await open([comment(1), comment(2)], { unreadMarks: [], view: false })
  // The plugin reads the marks when a conversation comes on screen (index.tsx), list shown or not.
  await page.evaluate(() => window.state.reload())
  await page.evaluate(() => window.openThread('c1'))
  await page.waitForFunction(() => window.doors.some((d) => d.endsWith('/c1/read')), null, { timeout: 2000 })
  await page.evaluate(() => window.showView())
  await page.waitForSelector('[data-comment="c2"][data-unread]')
  assert.equal(await page.locator('[data-comment="c1"][data-unread]').count(), 0)
  assert.deepEqual(await readsFiled(page), ['POST /api/sites/kinetic/comments/c1/read'])
  await close()
})

test('"Mark as unread" on the thread that is open keeps it unread: nothing marks it read again until it is opened again', async () => {
  const { page, close } = await open([comment(1), comment(2)], { unreadMarks: [] })
  await page.evaluate(() => window.openThread('c1'))
  await page.waitForSelector('[data-comment="c1"]:not([data-unread])')
  await page.hover('[data-comment="c1"]')
  await page.click('[data-tracy-more="c1"]')
  await page.click('[data-tracy-menu="unread"]')
  await page.waitForSelector('[data-comment="c1"][data-unread]')
  // The fork re-lists (a poll, a reply elsewhere) with the same thread open.
  await page.evaluate(() => window.openThread('c1'))
  await page.waitForTimeout(150)
  assert.equal(await page.locator('[data-comment="c1"][data-unread]').count(), 1)
  assert.deepEqual(await readsFiled(page), [
    'POST /api/sites/kinetic/comments/c1/read',
    'POST /api/sites/kinetic/comments/c1/unread'
  ])
  await close()
})

test('Delete → "Comment deleted" with Undo and a draining bar, counted nowhere; Undo puts it back', async () => {
  const mine = { author: AKEMI, can: { edit: true, delete: true } }
  const { page, close } = await open([comment(1, mine), comment(2)])
  // The page filter's two open-thread pills (Lee 04/10/2026; c1 is this person's own, c2 Lee's), then
  // the status filter's two totals; each pill's dot says c2 is unread.
  const pills = () => page.$$eval('.tv-cv-pill, .tv-cv-filter-num', (els) => els.map((e) => e.textContent))
  const dots = () => page.$$eval('[data-tracy-filter] .tv-cv-pill', (els) => els.map((e) => e.title))
  await page.waitForSelector('[data-tracy-filter] .tv-cv-pill')
  assert.deepEqual(await pills(), ['2', '2', '2', '0'])
  assert.deepEqual(await dots(), ['1 unread', '1 unread'])
  await page.hover('[data-comment="c1"]')
  await page.click('[data-tracy-more="c1"]')
  assert.deepEqual(
    await page.$$eval('[data-tracy-item-menu="c1"] [data-tracy-menu]', (els) =>
      els.map((e) => e.dataset.tracyMenu)
    ),
    ['resolve', 'ask', 'unread', 'link', 'delete']
  )
  await page.click('[data-tracy-menu="delete"]')
  await page.waitForSelector('[data-comment="c1"][data-gone]')
  assert.match(await page.textContent('[data-comment="c1"]'), /^#1A?Comment deletedUndo$/)
  const bar = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-comment="c1"] .tv-ci-drain > i')).animationName
  )
  assert.equal(bar, 'tv-drain')
  assert.deepEqual(await pills(), ['1', '1', '1', '0'], 'not counted during the window')
  assert.deepEqual(await dots(), ['1 unread', '1 unread'], 'c2 is still unread')
  await page.click('[data-tracy-undo-delete]')
  await page.waitForSelector('[data-comment="c1"]:not([data-gone])')
  assert.deepEqual(await pills(), ['2', '2', '2', '0'])
  assert.deepEqual(
    (await page.evaluate(() => window.acts)).map((a) => a.kind).filter((k) => k === 'remove' || k === 'undo'),
    ['remove', 'undo']
  )
  await close()
})

test('Delete left alone: when the 10 s are up the row is gone, and it was never counted', async () => {
  const mine = { author: AKEMI, can: { edit: true, delete: true } }
  const { page, close } = await open([comment(1, mine), comment(2)], {}, { clock: true })
  await page.hover('[data-comment="c1"]')
  await page.click('[data-tracy-more="c1"]')
  await page.click('[data-tracy-menu="delete"]')
  await page.waitForSelector('[data-comment="c1"][data-gone]')
  await page.clock.fastForward(9000)
  assert.equal(await page.locator('[data-comment="c1"][data-gone]').count(), 1, 'still there at 9 s')
  await page.clock.fastForward(1500)
  await page.waitForFunction(() => document.querySelector('[data-comment="c1"]') === null)
  assert.deepEqual(
    await page.$$eval('.tv-cv-pill, .tv-cv-filter-num', (els) => els.map((e) => e.textContent)),
    ['1', '1', '1', '0']
  )
  await close()
})

test('the picture a comment is anchored on opens full screen; ✕, Esc and the backdrop close it, the picture itself does not', async () => {
  // A data: address is never a source the row loads (pictureOf), so the picture is served like a site's.
  const pic = {
    element: {
      url: HOME,
      selector: 'img',
      tag: 'img',
      image: { src: 'http://localhost/img/ship-fast.png', alt: 'Ship fast' }
    }
  }
  const { page, close } = await open([comment(1, pic)])
  const chip = page.locator('[data-comment="c1"] .tv-ci-att')
  assert.equal(await chip.count(), 1)
  const open1 = async () => {
    await chip.click()
    await page.waitForSelector('[data-tracy-lightbox]')
  }
  await open1()
  assert.equal(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-tracy-lightbox-close')),
    true
  )
  await page.click('[data-tracy-lightbox-close]')
  assert.equal(await page.locator('[data-tracy-lightbox]').count(), 0, '✕')
  await open1()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('[data-tracy-lightbox]').count(), 0, 'Esc')
  await open1()
  await page.click('.tv-lb-img', { force: true })
  assert.equal(await page.locator('[data-tracy-lightbox]').count(), 1, 'a click on the picture keeps it')
  await page.mouse.click(5, 300)
  assert.equal(await page.locator('[data-tracy-lightbox]').count(), 0, 'the backdrop')
  assert.equal(
    (await page.evaluate(() => window.acts)).filter((a) => a.kind === 'reveal').length,
    0,
    'the chip never opened the thread'
  )
  await close()
})

test('Copy link asks the Browser tab inside the click, so its clipboard write goes through; the link names the comment', async () => {
  const { page, close } = await open([comment(1)])
  await page.hover('[data-comment="c1"]')
  await page.click('[data-tracy-more="c1"]')
  await page.click('[data-tracy-menu="link"]')
  assert.deepEqual(
    (await page.evaluate(() => window.acts)).filter((a) => a.kind === 'link'),
    [{ tabId: 'tab-a', sessionId: 's1', kind: 'link', ids: ['c1'] }]
  )
  assert.equal(await page.evaluate(() => window.copied), 'ok')
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /&comment=c1$/)
  assert.equal(await page.locator('[data-tracy-item-menu]').count(), 0, 'the menu closed')
  await close()
})

test('an @mention is Tracy terracotta (--primary), never the dsh link colour; the dark theme lifts it from --primary so it still reads on a dark ground', async () => {
  const { page, close } = await open([comment(1, { text: 'Ask @lee to swap this picture' })])
  // dsh-brand puts --primary inline on <body>; dsh paints its links blue. Both present, as in the product.
  await page.evaluate(() => {
    document.body.style.setProperty('--primary', '#bf5b3d')
    document.body.style.setProperty('--dsw-alias-link', '#2f6fd1')
  })
  /** The mention's colour, a probe painted with `probe`, and the mention's contrast on --background. */
  const measure = (probe) =>
    page.evaluate((probeColor) => {
      const rgb = (css) => {
        const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')
        ctx.fillStyle = css
        ctx.fillRect(0, 0, 1, 1)
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
      }
      const lum = (c) =>
        c
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
      const mention = document.querySelector('[data-comment="c1"] .tv-ci-mention')
      const p = document.body.appendChild(document.createElement('span'))
      p.style.color = probeColor
      const out = {
        word: mention.textContent,
        mention: getComputedStyle(mention).color,
        probe: getComputedStyle(p).color,
        link: getComputedStyle(Object.assign(p, { style: 'color: var(--dsw-alias-link)' })).color
      }
      p.remove()
      const bg = getComputedStyle(document.body).getPropertyValue('--background').trim()
      const [a, b] = [lum(rgb(out.mention)), lum(rgb(bg))].sort((x, y) => y - x)
      return { ...out, contrast: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 }
    }, probe)

  const light = await measure('var(--primary)')
  assert.equal(light.word, '@lee')
  assert.equal(light.mention, light.probe, 'light: the mention is exactly --primary')
  assert.notEqual(light.mention, light.link, 'light: not the dsh link colour')

  await page.evaluate(() => {
    document.body.toggleAttribute('data-ds-dark-theme', true)
    document.body.style.setProperty('--foreground', '#ededef')
    document.body.style.setProperty('--background', '#151517')
  })
  const dark = await measure('color-mix(in oklab, var(--primary) 80%, var(--foreground))')
  assert.equal(dark.mention, dark.probe, 'dark: --primary lifted toward the foreground')
  assert.notEqual(dark.mention, dark.link, 'dark: not the dsh link colour')
  assert.ok(dark.contrast >= 4.5, `dark: the mention reads on the dark ground (${dark.contrast}:1)`)
  await close()
})

/** The page filter's pills as `[side, count, dot]`: a side with no pill reads null, a pill with no dot null. */
const filterPills = (page) =>
  page.$$eval('[data-tracy-filter] .tv-cv-filter-side', (els) =>
    els.map((el) => {
      const pill = el.querySelector('.tv-cv-pill')
      return [
        el.querySelector('.tv-cv-filter-long').textContent,
        pill?.textContent ?? null,
        pill?.hasAttribute('data-dot') ? pill.title : null
      ]
    })
  )

/**
 * The Comments tab's badge (Lee 04/10/2026): `data-tracy-count` on dsh's tab, the All pages pill's open
 * number, with what its pill draws; `data-tracy-unread`, the dot, with the `title` and name it gives the
 * tab and whether a dot is painted. Nulls when there is none.
 */
const tabBadge = (page) =>
  page.evaluate(() => {
    const tab = [...document.querySelectorAll('[data-conversation-tabs] [role="tab"]')].find(
      (t) => t.textContent === 'Comments'
    )
    const count = tab.getAttribute('data-tracy-count')
    const pill = getComputedStyle(tab, '::before')
    return {
      count,
      drawn: count === null ? null : pill.content.replaceAll('"', ''),
      unread: tab.getAttribute('data-tracy-unread'),
      title: tab.getAttribute('title'),
      name: tab.getAttribute('aria-label'),
      painted: getComputedStyle(tab).backgroundImage.startsWith('radial-gradient')
    }
  })

test('Lee 04/10: the page filter and the Comments tab count OPEN threads in grey without waiting for the read marks; a dot says this person has unread ones — opening a thread takes it, Mark as unread brings it back, all read leaves the numbers and no dot', async () => {
  // c4 is Akemi's own, open on Pricing: 4 open comments on the site, never more than 3 unread.
  const comments = [
    comment(1),
    comment(2),
    comment(3, { url: PRICING }),
    comment(4, { url: PRICING, author: AKEMI })
  ]
  // The /reads answer is held until the "no dot yet" state has been read, then released (issue #1010).
  const { page, close } = await open(comments, { unreadMarks: [], holdReads: true, tabs: true })
  const plainTab = { count: '4', drawn: '4', unread: null, title: null, name: null, painted: false }
  /** The tab's dot: the All pages pill's unread number. */
  const dottedTab = (n) => ({
    count: '4',
    drawn: '4',
    unread: String(n),
    title: `${n} unread`,
    name: `Comments 4, ${n} unread`,
    painted: true
  })
  await page.waitForFunction(() =>
    window.doors.some((d) => d.startsWith('GET ') && d.endsWith('/comments/reads'))
  )
  await page.waitForSelector('[data-tracy-filter] .tv-cv-pill')
  assert.deepEqual(
    await filterPills(page),
    [
      ['Current page', '2', null],
      ['All pages', '4', null]
    ],
    'the open numbers at once, no dot before the marks are in'
  )
  const counted = await page.waitForSelector('[data-conversation-tabs] [data-tracy-count]').then(
    () => true,
    () => false
  )
  assert.ok(counted, 'the tab draws the open number while the read marks are still held')
  assert.deepEqual(await tabBadge(page), plainTab, 'the tab: the open number, no dot, no "0 unread"')
  await page.evaluate(() => window.releaseReads())
  await page.waitForSelector('[data-tracy-filter] .tv-cv-pill[data-dot]')
  assert.deepEqual(await filterPills(page), [
    ['Current page', '2', '2 unread'],
    ['All pages', '4', '3 unread']
  ])
  const dotted = await page.waitForSelector('[data-conversation-tabs] [data-tracy-unread]').then(
    () => true,
    () => false
  )
  assert.ok(dotted, 'once the read marks are in, the tab carries the dot')
  assert.deepEqual(await tabBadge(page), dottedTab(3), 'marks in: the number stays 4, the dot says 3')
  // The status filter keeps its totals, read or not.
  assert.deepEqual(await statusSides(page), [
    ['open', 'true', 'Open', '2'],
    ['resolved', 'false', 'Resolved', '0']
  ])
  await page.click('[data-comment="c1"] .tv-ci-text')
  await page.waitForFunction(
    () => document.querySelector('[data-tracy-filter] .tv-cv-pill')?.title === '1 unread'
  )
  assert.deepEqual(await filterPills(page), [
    ['Current page', '2', '1 unread'],
    ['All pages', '4', '2 unread']
  ])
  assert.deepEqual(await tabBadge(page), dottedTab(2), 'opening a thread moves the dot, not the number')
  await page.hover('[data-comment="c1"]')
  await page.click('[data-tracy-more="c1"]')
  await page.click('[data-tracy-menu="unread"]')
  await page.waitForFunction(
    () => document.querySelector('[data-tracy-filter] .tv-cv-pill')?.title === '2 unread'
  )
  assert.deepEqual(await filterPills(page), [
    ['Current page', '2', '2 unread'],
    ['All pages', '4', '3 unread']
  ])
  assert.deepEqual(await tabBadge(page), dottedTab(3), 'Mark as unread brings it back')
  await page.click('[data-comment="c1"] .tv-ci-text')
  await page.click('[data-comment="c2"] .tv-ci-text')
  await page.waitForSelector('[data-comment="c2"]:not([data-unread])')
  assert.deepEqual(
    await filterPills(page),
    [
      ['Current page', '2', null],
      ['All pages', '4', '1 unread']
    ],
    'this page all read: its dot goes, its number stays'
  )
  assert.deepEqual(await tabBadge(page), dottedTab(1), 'the other page still has one unread')
  // The other page's thread opened from its pin (the fork opens the card): nothing unread anywhere.
  await page.evaluate(() => window.openThread('c3'))
  await page.waitForFunction(
    () => document.querySelectorAll('[data-tracy-filter] .tv-cv-pill[data-dot]').length === 0
  )
  assert.deepEqual(await filterPills(page), [
    ['Current page', '2', null],
    ['All pages', '4', null]
  ])
  await page.waitForFunction(
    () => document.querySelector('[data-conversation-tabs] [data-tracy-unread]') === null
  )
  assert.deepEqual(await tabBadge(page), plainTab, 'nothing unread: the number stays, no dot, no "0"')
  assert.deepEqual(await statusSides(page), [
    ['open', 'true', 'Open', '2'],
    ['resolved', 'false', 'Resolved', '0']
  ])
  await close()
})

/** Where the rail's hairline and the Comments footer's hairline sit, and how the footer's pieces size. */
const footerAgainstRail = (page) =>
  page.evaluate(() => {
    const button = document.querySelector(
      '[data-slot="sidebar.settings"] > .ts-account > [data-slot="button"]'
    )
    const before = getComputedStyle(button, '::before')
    const railLine = button.getBoundingClientRect().top + Number.parseFloat(before.top)
    const seat = document.getElementById('seat')
    const footer = document.querySelector('.tv-cv-footer').getBoundingClientRect()
    const line = document.querySelector('.tv-cv-footer-line').getBoundingClientRect()
    const start = document.querySelector('.tv-cv-footer .tv-cv-start').getBoundingClientRect()
    return {
      railLine,
      railLineHeight: before.height,
      seatLine: seat.getBoundingClientRect().top,
      seatShadow: getComputedStyle(seat).boxShadow,
      bottom: innerHeight,
      footer: [footer.top, footer.bottom, footer.left, footer.right],
      lineMid: line.top + line.height / 2,
      startMid: start.top + start.height / 2,
      footerMid: footer.top + footer.height / 2,
      start: [start.height, getComputedStyle(document.querySelector('.tv-cv-footer .tv-cv-start')).fontSize],
      lineFont: getComputedStyle(document.querySelector('.tv-cv-footer-line')).fontSize,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }
  })

/** The dark theme as dsh switches it: its flag, and Tracy's tokens on a dark ground. */
const goDark = (page) =>
  page.evaluate(() => {
    const b = document.body
    b.toggleAttribute('data-ds-dark-theme', true)
    for (const [k, v] of Object.entries({
      '--background': '#151517',
      '--foreground': '#ededef',
      '--border': '#2b2b30',
      '--input': '#2b2b30',
      '--muted-foreground': '#a1a1aa',
      '--sidebar': '#1b1b1d',
      '--sidebar-foreground': '#ededef',
      '--dsw-alias-bg-base': '#151517'
    }))
      b.style.setProperty(k, v)
    b.style.background = 'var(--background)'
    b.style.color = 'var(--foreground)'
  })

test("the Comments footer's hairline is on the same line as the rail's hairline over Settings, wide, with a 340 px column and in a narrower one, light and dark; the hint and the button sit centred, matched in size", async () => {
  const shots = process.env.TRACY_SHOT_DIR
  const comments = [comment(1), comment(2), comment(3, { url: PRICING })]
  // Windows: a wide one; a 340 px chat column beside the 56 px rail (396); a narrower column still (300).
  for (const width of [900, 396, 300]) {
    for (const theme of ['light', 'dark']) {
      const { page, close } = await open(comments, { unreadMarks: [] }, { width, height: 640, rail: true })
      if (theme === 'dark') await goDark(page)
      await page.waitForSelector('[data-tracy-comments-footer]')
      await page.waitForSelector('[data-tracy-filter] .tv-cv-pill')
      const m = await footerAgainstRail(page)
      const at = `${width}px ${theme}`
      assert.equal(m.railLineHeight, '1px', at)
      assert.match(
        m.seatShadow,
        / 0px 1px 0px 0px inset$/,
        `${at}: the seat draws its hairline inside its top edge`
      )
      assert.equal(m.bottom - m.railLine, 59, `${at}: the rail hairline is 59 px above the bottom`)
      assert.equal(
        m.seatLine,
        m.railLine,
        `${at}: the footer hairline is on the rail hairline (${m.seatLine} vs ${m.railLine})`
      )
      assert.ok(Math.abs(m.lineMid - m.footerMid) <= 1, `${at}: the hint is centred in the band`)
      assert.ok(Math.abs(m.startMid - m.footerMid) <= 1, `${at}: the button is centred in the band`)
      assert.deepEqual(m.start, [32, '13px'], `${at}: the button`)
      assert.equal(m.lineFont, '13px', `${at}: the hint matches the button's words`)
      assert.equal(m.sideways, 0, `${at}: no sideways scroll`)
      // Whether the hint fits a narrow column depends on the font's widths: the harness asks for Arial,
      // which a Linux runner may lack and replace with a wider sans, so at 340 px the words can need a
      // third line there and fit two on a Mac. So the check is the guarantee, not the font: the band
      // never grows, the hint is cut exactly when its words need more than two lines at that width
      // (measured on an unclamped copy), and a cut is the two-line clamp, not an overflow.
      const words = await page.$eval('.tv-cv-footer-words', (el) => {
        const copy = el.cloneNode(true)
        copy.style.cssText = `position:absolute;visibility:hidden;display:block;width:${el.clientWidth}px`
        el.parentElement.append(copy)
        const needed = copy.getBoundingClientRect().height
        copy.remove()
        const cs = getComputedStyle(el)
        const icon = el.parentElement.querySelector('.tv-cv-small-icon')
        return {
          cut: el.scrollHeight > el.clientHeight + 1,
          height: el.getBoundingClientRect().height,
          needsMoreThanTwo: needed > 41,
          clamp: [cs.webkitLineClamp, cs.overflow],
          icon: getComputedStyle(icon).display
        }
      })
      assert.ok(words.height <= 40, `${at}: the hint takes two lines at most (${words.height} px)`)
      assert.equal(
        words.cut,
        words.needsMoreThanTwo,
        `${at}: the hint is cut only when it needs a third line`
      )
      assert.deepEqual(words.clamp, ['2', 'hidden'], `${at}: a long hint is clamped at two lines`)
      if (width === 900) assert.equal(words.cut, false, `${at}: the hint reads whole, nothing cut`)
      assert.equal(
        words.icon === 'none',
        width !== 900,
        `${at}: the icon gives its room to the words in a column of 340 px and under`
      )
      if (shots && width !== 300)
        await page.screenshot({ path: path.join(shots, `counters-${theme}-${width}.png`) })
      await close()
    }
  }
})
