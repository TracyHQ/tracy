/**
 * The Comments tab's real components rendered to markup, held against the stories of stage 6
 * (`packages/dev/tracy-design/src/mockups/browser-comment.mock.stories.tsx`): CommentsTabPeopleOnly,
 * SendNChecklist, PageCommentBox, CommentsTabPeopleOnlyEmpty. What a row carries and what it must NOT
 * (status words, Tracy lines, Reply, Edit, ticks, "Resolve all updated", "Answer in chat"), the Open
 * head, the checklist, the page box's two buttons, the empty hint word for word, and the CSS that keeps
 * the tab inside a 300 px column. Layout itself is measured in the browser harness
 * (`tasks/evidence/comment-people/t-render-t6/`).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let render

before(async () => {
  // The keys a button shows follow the system; Node reports the host's, so the test names one.
  Object.defineProperty(globalThis.navigator, 'platform', { get: () => 'Linux x86_64', configurable: true })
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-people-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { createCommentsState, makeCommentsFooter, makeCommentsView } from './CommentsView'
        import { CSS } from './styles'
        export { CSS }
        export function draw(lists, unticked, view = {}) {
          const state = createCommentsState({ storage: null })
          for (const list of lists) state.lists.accept(list)
          if (unticked) state.checklist.set(new Set(unticked))
          if (view.filter) state.setFilter(view.filter)
          if (view.status) state.status.set(view.status)
          return {
            view: renderToStaticMarkup(createElement(makeCommentsView(state), {})),
            footer: renderToStaticMarkup(createElement(makeCommentsFooter(state), {}))
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
  render = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const NOW = Date.now()
const MIN = 60_000
const HOME = 'https://northgate-ind.ru/'
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L', color: '#4f46e5' }
const MAI = { accountId: 'a-mai', email: 'mai@northgate.ru', name: 'Mai', initial: 'M', color: '#0d9488' }
const MENU = {
  url: HOME,
  selector: 'nav a:nth-of-type(3)',
  label: 'Menu item "Services"',
  tag: 'a',
  marks: ['menuItem:104']
}
const LEAD = {
  url: HOME,
  selector: 'p.lead',
  text: 'Plants, warehouses and heavy machine foundations',
  tag: 'p'
}
const STAT = { url: HOME, selector: '.stats p', text: '13 subsidiaries', tag: 'p' }
const HEADING = {
  url: HOME,
  selector: 'h1',
  text: 'Industrial construction, from foundation to handover',
  tag: 'h1'
}
const IMAGE = {
  url: HOME,
  selector: 'img',
  label: 'Image "news-1.png"',
  tag: 'img',
  image: { src: '/news-1.png' }
}
const c = (id, extra) => ({
  id,
  url: HOME,
  status: 'pending',
  can: { edit: true, delete: true },
  replyCount: 0,
  sentToTracy: false,
  ...extra
})
/** The story's five open comments and one resolved (CommentsTabPeopleOnly), three already sent once. */
const PEOPLE = [
  c('p5', {
    author: LEE,
    createdAt: NOW - 30 * MIN,
    element: MENU,
    text: 'Make only this menu item orange (#c8643b).',
    sentToTracy: true
  }),
  c('p6', {
    author: LEE,
    createdAt: NOW - 29 * MIN,
    element: LEAD,
    text: 'Say we also build cold storage.',
    sentToTracy: true
  }),
  c('p1', {
    author: MAI,
    createdAt: NOW - 28 * MIN,
    element: STAT,
    text: 'We have 14 subsidiaries now.',
    replyCount: 2,
    sentToTracy: true
  }),
  c('p2', {
    author: MAI,
    createdAt: NOW - 25 * MIN,
    element: HEADING,
    text: 'Can we make this heading shorter? It wraps on phones.'
  }),
  c('p3', {
    author: LEE,
    createdAt: NOW - 10_000,
    element: IMAGE,
    text: 'Mai, do we have a better photo for this one?'
  }),
  c('p4', {
    author: LEE,
    url: 'https://northgate-ind.ru/news',
    createdAt: NOW - 90 * MIN,
    element: {
      url: 'https://northgate-ind.ru/news',
      selector: 'article h2',
      text: 'Four typical mistakes in foundation work',
      tag: 'h2'
    },
    text: 'Put the author photo next to the byline.',
    status: 'resolved',
    resolvedAt: NOW - 60 * MIN,
    resolvedBy: MAI
  })
]
const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'acbj2709',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments
})
/** The text of one row, tags stripped. */
const rowText = (html, id) => {
  const start = html.indexOf(`data-comment="${id}"`)
  const next = html.indexOf('data-comment="', start + 1)
  return html
    .slice(start, next === -1 ? undefined : next)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
}

test('Open, newest first; a row is the number, avatar, handle, short time, words, its tag — and "N replies" in terracotta (redesign A)', () => {
  const { view } = render.draw([list(PEOPLE)], undefined, { filter: 'all' })
  const order = [...view.matchAll(/data-comment="(\w+)"/g)].map((m) => m[1])
  // Newest first by the thread's last activity (Brian 23:25); the resolved p4 is the Resolved view's.
  assert.deepEqual(order, ['p3', 'p2', 'p1', 'p6', 'p5'])
  assert.match(rowText(view, 'p1'), /M mai 28m We have 14 subsidiaries now\. Asked Tracy 2 replies/)
  assert.match(rowText(view, 'p2'), /M mai 25m Can we make this heading shorter\? It wraps on phones\. Note/)
  // The block it points at is not on the row (its pin is on the page).
  assert.doesNotMatch(rowText(view, 'p5'), /Menu item "Services"/)
  // Author colour: the one avatar wears the author's.
  const from = view.indexOf('data-comment="p1"')
  const p1 = view.slice(from, view.indexOf('data-comment="', from + 1))
  assert.equal((p1.match(new RegExp(`background:${MAI.color}`, 'g')) ?? []).length, 1)
  assert.match(p1, /<span class="tv-ci-handle" title="mai@northgate\.ru">mai<\/span>/)
  assert.match(p1, /<span class="tv-ci-replies">2 replies<\/span>/)
})

test('a resolved row (Resolved view): no Resolve, under its page\'s card (no site name), and no "Resolved by" line (Brian 23:45)', () => {
  // All pages folds every card but the page shown: /news is folded, its count says 1.
  const all = render.draw([list(PEOPLE)], undefined, { filter: 'all', status: 'resolved' }).view
  assert.match(
    all,
    /data-tracy-page-group="\/news"><button type="button" class="tv-cv-card-head" aria-expanded="false">/
  )
  assert.match(all, /No resolved comments on this page\./, 'the page shown has none of that status')
  // With the Browser tab on /news, its card is the current one and open.
  const { view } = render.draw([{ ...list(PEOPLE), url: 'https://northgate-ind.ru/news' }], undefined, {
    status: 'resolved'
  })
  assert.deepEqual(
    [...view.matchAll(/data-comment="(\w+)"/g)].map((m) => m[1]),
    ['p4']
  )
  const p4 = rowText(view, 'p4')
  assert.doesNotMatch(view.slice(view.indexOf('data-comment="p4"')), /data-tracy-resolve/)
  assert.match(p4, /lee 1h/)
  assert.ok(view.indexOf('data-tracy-page-group="/news"') < view.indexOf('data-comment="p4"'))
  assert.doesNotMatch(p4, /acbj2709/)
  assert.doesNotMatch(p4, /Resolved by|reopens/)
  assert.match(view, /data-comment="p4" data-resolved=""/)
})

test('nothing from before stage 6: no status word, no Tracy line, no Reply, no Edit, no tick, no Reopen', () => {
  const { view, footer } = render.draw([list(PEOPLE)])
  for (const gone of [
    'Not sent',
    'Working',
    'Updated',
    'Failed',
    'Tracy asked',
    'Answered',
    'Tracy:',
    'Answer in chat',
    'Resolve all updated',
    '>Reply<',
    '>Edit<',
    'Reopen',
    'type="checkbox"',
    'Pending',
    'selected'
  ])
    assert.ok(!view.includes(gone), gone)
  assert.ok(!footer.includes('selected'))
})

test('a row is a button that reveals the comment on the page; Resolve and ⋯ are their own buttons in its corner', () => {
  const { view } = render.draw([list(PEOPLE)])
  assert.match(view, /<div class="tv-ci" data-comment="p2" role="button" tabindex="0">/)
  assert.match(
    view,
    /<button type="button" class="tv-ci-act" title="Resolve" aria-label="Resolve" data-tracy-resolve="">/
  )
  assert.match(
    view,
    /aria-label="More actions" aria-haspopup="menu" aria-expanded="false" data-tracy-more="p2"/
  )
})

test('the toolbar: the status filter, then "Delete all" (quiet, trash icon) with its tooltip, then "Ask Tracy to edit all"; no OPEN label', () => {
  const { view } = render.draw([list(PEOPLE)])
  const bar = view.slice(view.indexOf('data-tracy-toolbar'), view.indexOf('data-tracy-comment-list'))
  assert.match(
    bar,
    /class="tv-cv-filter tv-cv-status-filter" role="group" aria-label="Show open or resolved comments" data-tracy-status-filter="open">/
  )
  assert.ok(
    bar.indexOf('data-tracy-status-filter') < bar.indexOf('tv-cv-bar-actions'),
    'the filter, then the actions'
  )
  assert.match(
    bar,
    /class="tv-cv-del" title="Delete every comment shown here" aria-label="Delete all">.*lucide-trash-2.*<span>Delete all<\/span>/
  )
  assert.ok(!view.includes('Clear all'))
  assert.ok(!view.includes('tv-cv-label-text'), 'no OPEN label')
  assert.match(
    bar,
    /title="Give every open comment and reply shown here to Tracy in the chat" aria-expanded="false">.*<span class="tv-cv-send-long">Ask Tracy to edit all<\/span>/
  )
  assert.ok(bar.indexOf('Delete all') < bar.indexOf('Ask Tracy to edit all'))
})

/** The toolbar's two action buttons, each as `<label>:<enabled|disabled>`. */
const headButtons = (view) => {
  const from = view.indexOf('data-tracy-toolbar')
  if (from < 0) return []
  const head = view.slice(view.indexOf('tv-cv-bar-actions', from), view.indexOf('data-tracy-comment-list'))
  return [
    ...head.matchAll(
      /<button type="button" class="(tv-cv-del|tv-cv-primary[^"]*)"( disabled="")?[^>]*>(.*?)<\/button>/g
    )
  ].map(
    (m) =>
      `${m[3]
        .replace(/<span class="tv-cv-send-(?:short|count)">.*?<\/span>/g, '')
        .replace(/<span class="tv-cv-sizer"[^>]*>.*?<\/span>/g, '')
        .replace(/<[^>]+>/g, '')}:${m[2] ? 'disabled' : 'enabled'}`
  )
}

test('the toolbar keeps its shape whatever was sent before; Delete all and Ask Tracy to edit all show only with something to act on', () => {
  const allSent = PEOPLE.map((x) => ({ ...x, sentToTracy: true }))
  assert.deepEqual(headButtons(render.draw([list(allSent)]).view), [
    'Delete all:enabled',
    'Ask Tracy to edit all:enabled'
  ])
  // A row click revealed a comment on /about: the Browser tab shows a page with none of these comments.
  const elsewhere = PEOPLE.map((x) => ({ ...x, url: 'https://northgate-ind.ru/about' }))
  // Current page has nothing open: the status filter stays, no buttons; All pages keeps them (U15).
  assert.deepEqual(headButtons(render.draw([list(elsewhere)]).view), [])
  assert.match(render.draw([list(elsewhere)]).view, /data-tracy-status-filter="open"/)
  assert.deepEqual(headButtons(render.draw([list(elsewhere)], undefined, { filter: 'all' }).view), [
    'Delete all:enabled',
    'Ask Tracy to edit all:enabled'
  ])
  // Resolved: Delete all only — Ask Tracy to edit all is for open comments.
  assert.deepEqual(
    headButtons(render.draw([list(PEOPLE)], undefined, { filter: 'all', status: 'resolved' }).view),
    ['Delete all:enabled']
  )
  const noneOpen = PEOPLE.filter((x) => x.status === 'resolved')
  const { view } = render.draw([list(noneOpen)])
  assert.doesNotMatch(view, /tv-cv-del|tv-cv-send-all/)
  assert.doesNotMatch(view, /\(0\)/)
  assert.match(
    render.CSS,
    /\.tv-cv-outline:disabled, \.tv-cv-primary:disabled \{[^}]*background: color-mix\(in oklab, var\(--foreground, #172026\) 7%, transparent\);/
  )
})

test('the checklist (story SendNChecklist): all ticked but what was unticked, "N of M comments" (threads, round 2 rule 7), Cancel, Ask Tracy to edit ↵', () => {
  const never = PEOPLE.map((x) => (x.status === 'resolved' ? x : { ...x, sentToTracy: false }))
  const { view } = render.draw([list(never)], ['p3'])
  const box = view.slice(view.indexOf('class="tv-cv-checklist"'))
  assert.match(box, /role="dialog" aria-label="Ask Tracy to edit"/)
  assert.match(
    box,
    /Ask Tracy to edit<\/span><span class="tv-cv-checklist-hint">Untick what is only for your team\.<\/span>/
  )
  const ticks = [
    ...box.matchAll(/<input type="checkbox" class="tv-cv-check" aria-label="([^"]+)"( checked="")?/g)
  ].map((m) => `${m[1].replace('&#x27;', "'")}:${m[2] ? 'on' : 'off'}`)
  // The checklist lists newest first too: Lee's image (unticked) on top.
  assert.deepEqual(ticks, [
    "Send Lee's comment:off",
    "Send Mai's comment:on",
    "Send Mai's comment:on",
    "Send Lee's comment:on",
    "Send Lee's comment:on"
  ])
  assert.match(
    box,
    /4 of 5 comments/,
    'threads: Mai’s figure is 1 whatever its replies; Lee’s image unticked'
  )
  assert.match(box, />Cancel<\/button>/)
  // No extra hotkey (Brian): Enter sends while the checklist is open, on every system alike.
  assert.match(
    box,
    /title="Ask Tracy to edit \(Enter\)">Ask Tracy to edit<kbd class="tv-cv-key">↵<\/kbd><\/button>/
  )
  assert.doesNotMatch(box, /Ctrl\+↵|⌘↵/)
  assert.match(view, /aria-expanded="true"/)
})

test('the checklist with everything unticked: Send is disabled', () => {
  const never = PEOPLE.slice(0, 2).map((x) => ({ ...x, sentToTracy: false }))
  const { view } = render.draw([list(never)], ['p5', 'p6'])
  assert.match(view, /0 of 2 comments/)
  assert.match(view, /<button type="button" class="tv-cv-primary tv-cv-tall" disabled=""/)
})

test('layout B (Akemi 01/10/2026): no page box; the bottom row says how to comment and offers Start commenting', () => {
  const { footer } = render.draw([list(PEOPLE)])
  assert.match(
    footer,
    /<div class="tv-cv-footer" data-tracy-comments-footer=""><p class="tv-cv-footer-line"><svg[^>]*lucide-message-square[^>]*>.*?<\/svg><span class="tv-cv-footer-words">Click any block on the page to comment on it\.<\/span><\/p><button type="button" class="tv-cv-outline tv-cv-start" data-tracy-start-commenting="" disabled="">Start commenting<\/button><\/div>/
  )
  for (const gone of ['textarea', 'Add a comment', 'Note for team', 'New comment on', 'Attach'])
    assert.ok(!footer.includes(gone), gone)
})

test('a whole-page comment has no block chip on its row: its card names the page (redesign A)', () => {
  const { view } = render.draw([
    list([
      c('g1', {
        author: MAI,
        createdAt: NOW - 10 * MIN,
        element: null,
        text: 'The page feels long on phones.'
      })
    ])
  ])
  assert.match(rowText(view, 'g1'), /M mai 10m The page feels long on phones\. Note $/)
  assert.doesNotMatch(view, /lucide-globe|Whole page/)
})

test('the empty tab (empty state E1): a centred block — icon tile, its title, one line, Start commenting — no dashed box, no bottom row', () => {
  const { view, footer } = render.draw([list([])])
  assert.match(
    view,
    /<div class="tv-cv-empty" data-tracy-empty=""><span class="tv-cv-empty-icon" aria-hidden="true"><svg[^>]*lucide-message-square[^>]*>.*?<\/svg><\/span><p class="tv-cv-empty-title">No comments yet<\/p><p class="tv-cv-empty-line">Click any block on the page to leave a note for your team or ask Tracy to change it\.<\/p><button type="button" class="tv-cv-primary tv-cv-start" data-tracy-start-commenting="" disabled="">Start commenting<\/button><\/div>/
  )
  assert.doesNotMatch(view, /tv-cv-none|data-tracy-other-pages|data-tracy-filter/)
  assert.equal(footer, '')
})

test('the CSS: nothing widens the column, names never wrap, the badge is a round grey pill with a terracotta unread dot, the chat chip draws the author’s bubble', () => {
  const css = render.CSS
  assert.match(css, /\.tv-cv \{[^}]*overflow-x: hidden/)
  assert.match(css, /\[data-conversation-content\]:has\(\[data-tracy-comments\]\) \{ overflow-x: clip; \}/)
  assert.match(css, /\.tv-cv-name \{[^}]*white-space: nowrap/)
  assert.match(
    css,
    /\[data-tracy-count\]::before \{[^}]*border-radius: 999px; background: var\(--muted, #f4f4f5\); color: var\(--muted-foreground, #6b7280\)/
  )
  // The dot is the tab's own background (its ::before is the pill, its ::after dsh's selection bar).
  assert.match(
    css,
    /\[data-tracy-count\]\[data-tracy-unread\] \{[^}]*background: radial-gradient\(circle, var\(--primary, #bf5b3d\)/
  )
  assert.doesNotMatch(css, /\[data-tracy-count\]::after|\[data-tracy-unread\]::after/)
  assert.doesNotMatch(css, /tv-comment-chip-n|--tv-cv-asked|tv-cv-question/)
  assert.match(css, /\.tv-comment-chip-author \{[^}]*border-radius: 8px 8px 8px 0/)
  assert.match(css, /\.tv-cv-checklist \{[^}]*position: absolute/)
  // The time never shrinks; the handle gives way first.
  assert.match(css, /\.tv-ci-age \{ flex: none;/)
  assert.match(css, /\.tv-ci-handle \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap/)
  // The checklist keeps the namesake rules (e2e v4 V4-7, v7 INTH-2).
  assert.match(css, /\.tv-cv-name-main \{ flex: 0 1000 auto;[^}]*text-overflow: ellipsis/)
  assert.match(
    css,
    /\.tv-cv-name-tag \{ flex: 0 1 auto; min-width: 5\.5em; overflow: hidden; text-overflow: ellipsis;/
  )
})

test('UI fine-tune U6/U7, redesign A: the name line is avatar, handle, time; it keeps room for the corner, so hover moves nothing', () => {
  const { view } = render.draw([list(PEOPLE)])
  const from = view.indexOf('data-comment="p1"')
  const p1 = view.slice(from, view.indexOf('data-comment="', from + 1))
  assert.match(
    p1,
    /<div class="tv-ci-head"><span class="tv-ci-avatar"[^>]*>M<\/span><span class="tv-ci-handle"[^>]*>mai<\/span><span class="tv-ci-age" title="[^"]+">28m<\/span><\/div>/
  )
  const css = render.CSS
  assert.match(css, /\.tv-ci-head \{[^}]*padding-right: 52px/)
  assert.match(css, /\.tv-ci-corner \{ position: absolute; top: 8px; right: 8px;/)
  assert.doesNotMatch(css, /data-here/)
})

test('the vi dictionary carries every key of the tab, and no key the tab no longer has', () => {
  const vi = JSON.parse(
    readFileSync(
      path.resolve(pkgRoot, '..', '..', 'locale', 'tracy-locale-vi', 'vi', 'tracy-chat-input.json'),
      'utf8'
    )
  )
  const src = readFileSync(path.join(pkgRoot, 'src', 'client', 'strings.ts'), 'utf8')
  const keys = [...src.matchAll(/^\s+'(comments\.[^']+)':/gm)].map((m) => m[1])
  for (const key of keys) assert.equal(typeof vi[key], 'string', key)
  for (const key of Object.keys(vi).filter((k) => k.startsWith('comments.')))
    assert.ok(keys.includes(key), key)
})

test('an author with a photo is drawn with it: the row’s face is the server’s whole face', () => {
  const photo = 'https://cdn.example.test/mai.png'
  const { view } = render.draw([
    list([c('ph', { author: { ...MAI, avatarUrl: photo }, createdAt: NOW - MIN, element: MENU, text: 'Hi' })])
  ])
  assert.match(view, new RegExp(`<span[^>]*data-tracy-face=""[^>]*><img src="${photo}"`))
})
