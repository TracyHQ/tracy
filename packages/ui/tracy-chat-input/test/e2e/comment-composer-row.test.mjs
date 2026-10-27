/**
 * The Comments tab's bottom row is its own row under the list, never drawn over it (Akemi, 01/10/2026,
 * option a; since layout B the row says how to comment and offers Start commenting, where the
 * "Add a comment…" box stood).
 *
 * Measured on cowork.tracy.site (kineticakemi, 11 comments, ~800 px window): the scroll box was dsh's
 * conversation scroll body (top 78 → bottom 792, scrollHeight 1191) and the composer seat sat sticky
 * at its bottom, so "New comment on /" (top 675) was painted over the bottom ~117 px of the list.
 * Scrolled part-way, a comment's words showed under the label.
 *
 * Pinned here, in a real browser, with ~12 comments in a 600 px tall column:
 *   - scrolled to the middle, the composer's top edge is at or below the bottom of the box that
 *     scrolls the list (no overlap at any scroll position);
 *   - the list still scrolls, and at its end the last comment shows whole above the composer;
 *   - a hairline divides the two rows.
 *
 * Seam: the real CommentsView and its composer (CommentsView.tsx) rendered to markup with a filled
 * state, inside the DOM skeleton dsh's ConversationRoot draws (the same stable attributes and
 * CSS-module class tails), dsh's own ConversationRoot.module.css read from the fork with its classes
 * hashed as the build does, and this plugin's real CSS (styles.ts) loaded after it, as in dsh's page.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system Chrome,
 * and a missing dependency or browser FAILS instead of skipping.
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

const DSH_ROOT_CSS = path.join(
  repoRoot,
  'vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css'
)

/** dsh's CSS-module classes this page uses, renamed the way the build hashes them; `:global()` unwrapped. */
function hashModuleClasses(css) {
  return css
    .replace(/:global\(([^()]*)\)/g, '$1')
    .replace(/\.(root|body|scrollBody|viewArea|composerSeat)\b(?![\w-])/g, '._$1_x7k2')
}

const NOW = Date.now()
const MIN = 60_000
const HOME = 'https://kinetic.example/'
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }
const comments = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  url: HOME,
  status: 'pending',
  can: { edit: true, delete: true },
  replyCount: 0,
  sentToTracy: false,
  author: LEE,
  createdAt: NOW - (i + 1) * MIN,
  element: {
    url: HOME,
    selector: `section:nth-of-type(${i + 1}) p`,
    text: `Trusted by 2,000+ teams ${i}`,
    tag: 'p'
  },
  text: `Comment number ${i}: make this line say something a little longer than it does today.`
}))
const LIST = {
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'kinetic',
  host: 'kinetic.example',
  active: true,
  url: HOME,
  comments
}

let outDir = ''
let browser
let page

before(async () => {
  Object.defineProperty(globalThis.navigator, 'platform', { get: () => 'Linux x86_64', configurable: true })
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-composer-row-'))
  const outfile = path.join(outDir, 'render.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsFooter, makeCommentsView } from './CommentsView'
        import { CSS } from './styles'
        export { CSS }
        export function draw(list) {
          const state = createCommentsState({ storage: null })
          state.lists.accept(list)
          state.setFilter('all')
          return {
            view: renderToStaticMarkup(createElement(makeCommentsView(state), {})),
            composer: renderToStaticMarkup(createElement(makeCommentsFooter(state), {}))
          }
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  const render = require(outfile)
  const { view, composer } = render.draw(LIST)
  const sheet = hashModuleClasses(readFileSync(DSH_ROOT_CSS, 'utf8')) + render.CSS

  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 420, height: 600 } })
  // The chain dsh draws for an active session with a view on screen (measured on cowork.tracy.site):
  // root > body > scrollBody[data-conversation-scroll] > session (contents) > viewArea > view (contents),
  // and the composer seat as the scroll body's last child.
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8">' +
      '<style>html,body{margin:0;height:100%;font-family:Arial,sans-serif}' +
      ':root{--dsw-alias-bg-base:#fff;--border:#e3e7e9}</style>' +
      `<style>${sheet}</style></head><body>` +
      '<div class="_root_x7k2" data-phase="active" style="display:flex;flex-direction:column;height:600px">' +
      '<div class="_body_x7k2" data-conversation-content>' +
      '<div class="_scrollBody_x7k2" data-conversation-scroll id="scroll">' +
      '<div data-slot="conversation.session" style="display:contents">' +
      '<div class="_viewArea_x7k2"><div data-slot="conversation.view" style="display:contents">' +
      view +
      '</div></div></div>' +
      `<div class="_composerSeat_x7k2" data-composer-seat id="seat">${composer}</div>` +
      '</div></div></div></body></html>'
  )
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** The nearest element at or above the list that actually scrolls it. */
async function measure(where) {
  return page.evaluate((to) => {
    const rows = document.querySelectorAll('[data-comment]')
    const last = rows[rows.length - 1]
    let scroller = last.parentElement
    while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) scroller = scroller.parentElement
    if (to === 'middle') scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2
    if (to === 'end') scroller.scrollTop = scroller.scrollHeight
    const box = scroller.getBoundingClientRect()
    const composer = document.querySelector('.tv-cv-footer').getBoundingClientRect()
    const seat = document.getElementById('seat')
    return {
      rows: rows.length,
      scrollerIsList: scroller.matches('[data-tracy-comment-list]'),
      canScroll: scroller.scrollHeight > scroller.clientHeight,
      listBottom: box.bottom,
      composerTop: composer.top,
      seatTop: seat.getBoundingClientRect().top,
      seatLine: getComputedStyle(seat).boxShadow,
      lastTop: last.getBoundingClientRect().top,
      lastBottom: last.getBoundingClientRect().bottom,
      boxTop: box.top
    }
  }, where)
}

test('scrolled to the middle, the composer starts below the list, never over it', async () => {
  const m = await measure('middle')
  assert.equal(m.rows, 12)
  assert.ok(m.canScroll, 'the list holds more than the column and scrolls')
  assert.ok(
    m.composerTop >= m.listBottom,
    `composer top ${m.composerTop} must not overlap the list's scroll box (bottom ${m.listBottom})`
  )
  assert.ok(m.seatTop >= m.listBottom, `seat top ${m.seatTop} >= list bottom ${m.listBottom}`)
})

test('the list owns its scroll, and at its end the last comment shows whole above the composer', async () => {
  const m = await measure('end')
  assert.ok(
    m.scrollerIsList,
    'the Comments list itself scrolls (redesign A: filter and toolbar stay put), not dsh body behind the composer'
  )
  assert.ok(m.lastTop >= m.boxTop, `last comment top ${m.lastTop} inside the list (top ${m.boxTop})`)
  assert.ok(
    m.lastBottom <= m.listBottom && m.lastBottom <= m.composerTop,
    `last comment bottom ${m.lastBottom} above list bottom ${m.listBottom} and composer ${m.composerTop}`
  )
})

test('a hairline divides the list from the composer row', async () => {
  const m = await measure('middle')
  // An inset 1px shadow at the seat's top edge (lines up with the left column's hairline at any zoom).
  assert.match(m.seatLine, / 0px 1px 0px 0px inset$/)
})
