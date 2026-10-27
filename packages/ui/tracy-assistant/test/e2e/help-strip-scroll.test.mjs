#!/usr/bin/env node
/**
 * The Help strip of the start screen keeps its newest row in view, and leaves a person who scrolled up
 * where they were — driven in a real browser over `fixtures/help-strip-entry.tsx`, which runs the
 * plugin's real `apply`, Help controller, rows and stylesheet in a page laid out like a site's start
 * screen (dsh's scroll body and composer stack under Tracy's rules, the dock slot above the chat box).
 *
 * Found on the stand 09/10/2026 (owner, right sidebar collapsed, a session holding two /help answers):
 * at 1000x600 the strip opened at `scrollTop` 0 of 358 with the newest answer cut off; a strip scrolled
 * to the bottom by hand jumped back to 0 when the window shrank by 20 px; on a 390x844 phone a bare
 * /help added its four questions at y=963-991 while the strip ended at y=638. The strip's fit
 * (`dock-fit.ts`) measures it without its height cap, which sets `scrollTop` to 0, and the follow to
 * the bottom was a passive effect that ran before the resize observer's first refit and whose
 * `atBottom` mark the measure's scroll event then cleared.
 *
 * Each check reads the strip after the page has settled (a few frames: the resize observer refits in
 * a frame of its own, and a scroll event is delivered in the next one). No screenshot is compared.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
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
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

// A site's start screen after something was sent, where the strip lives: dsh's conversation column
// (ConversationRoot.module.css `.body`, `.scrollBody`, `.composerSeat`, `.composerStack`, `.composerHero`
// and the hero phase's centring; the slot outlet's `[data-slot]` wrapper is `display: contents`) with
// the rules Tracy lays over it, copied as written: tracy-chat-input styles.ts puts the composer at the
// bottom of the column for a site (Case 2) and keeps the emptied start block as a spacer above the
// strip (`data-tracy-sent`); tracy-brand styles.ts orders the dock before the chat box with 28px under
// it. The hero's own title and workspace row are hidden there, so they are not drawn. The chat box is a
// plain card of the hero card's height. The left column is the sidebar, off on a phone.
const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html, body { margin:0; height:100% }
body { display:flex; font:14px system-ui; background:#f6f6f6 }
.left { flex:none; width:240px; background:#eee }
@media (max-width: 600px) { .left { display:none } }
._root_x9 { position:relative; display:flex; flex:1; flex-direction:column; height:100%; min-width:0 }
._body_x9 { position:relative; display:flex; flex:1; flex-direction:column; min-height:0;
  --dsh-chat-content-width:680px; --dsh-composer-card-max-width:calc(var(--dsh-chat-content-width) + 32px); --dsh-composer-side-clearance:16px }
._scrollBody_x9 { display:flex; flex:1; flex-direction:column; min-height:0; margin-right:2px; overflow-y:auto; scrollbar-gutter:stable }
._root_x9[data-phase='hero'] ._scrollBody_x9 { justify-content:center; overflow-y:auto }
._composerSeat_x9 { display:flex; flex:none; flex-direction:column }
._composerStack_x9 { display:flex; flex-direction:column; gap:6px }
._composerHero_x9 { align-self:center; gap:8px; padding-bottom:32px; width:min(calc(var(--dsh-composer-card-max-width) + 2 * var(--dsh-composer-side-clearance)), 100%); z-index:1 }
[class*="composerHero"] > [data-slot="conversation.input.dock"] > * { order:1; margin-top:0; margin-bottom:28px; }
[class*="composerHero"] > [data-slot="conversation.composer.bar"] > * { order:3; }
[data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="site"]) { justify-content:flex-start; }
[data-conversation-scroll]:has([class*="composerHero"] [data-tracy-start="site"]) > [data-composer-seat] { flex:1 0 auto; }
[class*="composerHero"]:has([data-tracy-start="site"]) { flex:1 0 auto; display:flex; flex-direction:column; align-self:stretch; width:100%; gap:0; padding-bottom:calc(var(--tc-composer-foot, 42px) + 4px); }
.tv-dock[data-tracy-start="site"] { display:none; }
[class*="composerHero"] > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"] { display:flex; flex:1 0 auto; justify-content:center; margin:0; padding:24px 0; }
[class*="composerHero"] > [data-slot="conversation.input.dock"] > .tv-dock[data-tracy-start="site"][data-tracy-sent] { padding:0; }
._card_x9 { box-sizing:border-box; height:130px; margin:0 16px; border:1px solid #ddd; border-radius:20px; background:#fff }
</style>
<div class="left"></div>
<div class="_root_x9" data-phase="hero"><div class="_body_x9"><div class="_scrollBody_x9" data-conversation-scroll>
  <div class="_composerSeat_x9" data-composer-seat><div class="_composerStack_x9 _composerHero_x9">
    <div data-slot="conversation.input.dock" style="display:contents" id="dock-slot"></div>
    <div data-slot="conversation.composer.bar" style="display:contents"><div class="_card_x9" data-composer-input="true"></div></div>
  </div></div>
</div></div></div>
<script src="/app.js"></script>`

/** A long answer, as Help writes one: several short paragraphs. */
const answer = (topic) =>
  [
    `Here is how ${topic} works in Tracy.`,
    'Open the site, then send what you want as a normal message in the chat. Tracy makes the change on the real site and lists it in Site changes.',
    'Every change can be undone from Site changes, and a Backup of files and database can be made and restored there too.',
    'If something looks wrong afterwards, open the change, read its Diff and press Undo; nothing else on the site moves.',
    'Ask me again if you want the steps for one part in more detail.'
  ].join('\n\n')

/** Restored Help turns: a question and its answer each. */
const turns = (topics) =>
  topics.flatMap((topic, i) => [
    { id: `u${i}`, role: 'user', text: `How does ${topic} work?`, anchorSeq: 0 },
    { id: `a${i}`, role: 'assistant', text: answer(topic) }
  ])

/** What the next restore answers with; each test sets it before opening its page. */
let restored = []

/** The pieces of a streamed answer; the last one is what a test waits for. */
const STREAM = [
  'To publish the site, ',
  'open My Sites and the site’s menu.\n\n',
  'Choose Publish: the site gets its public address at once.\n\n',
  'You can go back to draft from the same screen whenever you like.\n\n',
  'A domain of your own is connected from Publish as well, once you own it.\n\n',
  'Last step: press Publish.'
]

let outDir
let server
let base
let browser

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tas-help-strip-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'help-strip-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.css': 'empty' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  writeFileSync(path.join(outDir, 'page.html'), PAGE)
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    req.resume()
    // The operator's switches: nothing hidden, so `/help` is on.
    if (url === '/api/ui') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"hidden":[]}')
      return
    }
    if (url === '/api/assistant/conversation') {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ conversationId: 'c1', tipSeen: true, links: [], turns: restored }))
      return
    }
    if (url === '/api/assistant/turns' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`event: meta\ndata: ${JSON.stringify({ conversationId: 'c1', turnId: 'u9' })}\n\n`)
      let next = 0
      const timer = setInterval(() => {
        if (next < STREAM.length) {
          res.write(`event: delta\ndata: ${JSON.stringify({ text: STREAM[next++] })}\n\n`)
          return
        }
        clearInterval(timer)
        res.end(`event: done\ndata: ${JSON.stringify({ turnId: 'a9' })}\n\n`)
      }, 40)
      return
    }
    if (url.startsWith('/api/')) {
      res.writeHead(204).end()
      return
    }
    const name = url === '/app.js' ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  // This Mac's proxy auto-config stalls connections; the page is on 127.0.0.1 and needs none.
  const args = ['--disable-features=MacAppCodeSignClone', '--proxy-server=direct://', '--proxy-bypass-list=*']
  browser = await chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Opens the start screen with `topics` restored as earlier Help turns, once their rows are drawn. */
async function openStrip(viewport, topics) {
  restored = turns(topics)
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/`)
  // Each row sits in a flow item of its own, as in dsh's transcript (`[data-chat-flow-kind]`), so dsh's
  // rule of which answer keeps its action row out holds on the start screen too.
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll('.tv-help-dock > [data-chat-flow-kind="tracy-help"] > .tv-help').length ===
        n && document.querySelectorAll('.tv-help-dock [data-answer-actions]').length === n,
    topics.length
  )
  await settle(page)
  return { page, context, errors }
}

/** Lets the page finish what a change set off: six frames, then a short pause. */
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let left = 6
        const tick = () => (--left === 0 ? setTimeout(resolve, 30) : requestAnimationFrame(tick))
        requestAnimationFrame(tick)
      })
  )

/** The strip as the person sees it. */
const readStrip = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.tv-help-dock')
    const box = el.getBoundingClientRect()
    const rows = el.querySelectorAll('.tv-help')
    const chips = el.querySelectorAll('.tv-help-chip')
    const card = document.querySelector('[data-composer-input]').getBoundingClientRect()
    return {
      scrollTop: el.scrollTop,
      scrollMax: el.scrollHeight - el.clientHeight,
      fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
      height: el.clientHeight,
      cap: el.style.maxHeight,
      top: box.top,
      bottom: box.bottom,
      lastRowBottom: rows[rows.length - 1].getBoundingClientRect().bottom,
      chips: [...chips].map((chip) => {
        const r = chip.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom }
      }),
      cardBottom: card.bottom,
      window: innerHeight
    }
  })

/**
 * Evidence pictures, only when asked: `TRACY_HELP_STRIP_SHOTS=<folder>/<prefix>` saves the viewport at
 * each case's moment of truth as `<prefix><name>.png`, taken before the case's checks so a red run
 * leaves its picture too.
 */
async function shot(page, name) {
  const prefix = process.env.TRACY_HELP_STRIP_SHOTS
  if (prefix) await page.screenshot({ path: `${prefix}${name}.png` })
}

/** Scrolls the strip as a person would and lets its scroll event land. */
async function scrollStripTo(page, top) {
  await page.evaluate((y) => {
    const el = document.querySelector('.tv-help-dock')
    el.scrollTop = y === 'bottom' ? el.scrollHeight : y
  }, top)
  await settle(page)
}

test('restored answers open with the newest one in view (1000x600)', async () => {
  const { page, context, errors } = await openStrip({ width: 1000, height: 600 }, [
    'undo',
    'backups',
    'publishing'
  ])
  try {
    const s = await readStrip(page)
    await shot(page, '1-load-1000x600')
    // The strip is capped and has something to scroll; otherwise this proves nothing.
    assert.notEqual(s.cap, '', 'the strip is capped')
    assert.ok(s.scrollMax > 100, `the strip scrolls (max ${s.scrollMax})`)
    assert.ok(s.cardBottom <= s.window, `the chat box stays on screen (${s.cardBottom} of ${s.window})`)
    assert.ok(s.fromBottom <= 1, `at the bottom: scrollTop ${s.scrollTop} of ${s.scrollMax}`)
    assert.ok(
      s.lastRowBottom <= s.bottom + 1,
      `the newest answer ends inside the strip (${s.lastRowBottom} vs ${s.bottom})`
    )
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})

test('a strip at its bottom stays at its bottom when the window shrinks by 20 px and grows back', async () => {
  const { page, context, errors } = await openStrip({ width: 1000, height: 600 }, [
    'undo',
    'backups',
    'publishing'
  ])
  try {
    await scrollStripTo(page, 'bottom')
    const before = await readStrip(page)
    assert.ok(before.fromBottom <= 1, 'scrolled to the bottom by hand')
    await page.setViewportSize({ width: 1000, height: 580 })
    await settle(page)
    const shrunk = await readStrip(page)
    await shot(page, '2-shrunk-1000x580')
    assert.ok(
      shrunk.height < before.height - 10,
      `the strip gave back room (${before.height} -> ${shrunk.height})`
    )
    assert.ok(
      shrunk.fromBottom <= 1,
      `still at the bottom: scrollTop ${shrunk.scrollTop} of ${shrunk.scrollMax}`
    )
    await page.setViewportSize({ width: 1000, height: 640 })
    await settle(page)
    const grown = await readStrip(page)
    assert.ok(
      grown.height > shrunk.height + 10,
      `the strip took the room back (${shrunk.height} -> ${grown.height})`
    )
    assert.ok(
      grown.fromBottom <= 1,
      `still at the bottom: scrollTop ${grown.scrollTop} of ${grown.scrollMax}`
    )
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})

test('on a phone a bare /help puts its four questions inside the strip (390x844)', async () => {
  const { page, context, errors } = await openStrip({ width: 390, height: 844 }, [
    'undo',
    'backups',
    'publishing'
  ])
  try {
    await page.evaluate(() => window.__help.ask(''))
    await page.waitForFunction(() => document.querySelectorAll('.tv-help-dock .tv-help-chip').length === 4)
    await settle(page)
    const s = await readStrip(page)
    await shot(page, '3-phone-bare-help-390x844')
    assert.ok(s.scrollMax > 100, `the strip scrolls (max ${s.scrollMax})`)
    assert.ok(s.fromBottom <= 1, `at the bottom: scrollTop ${s.scrollTop} of ${s.scrollMax}`)
    for (const chip of s.chips)
      assert.ok(
        chip.top >= s.top - 1 && chip.bottom <= s.bottom + 1,
        `a question at y=${chip.top}-${chip.bottom} is inside the strip (y=${s.top}-${s.bottom})`
      )
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})

test('an answer streaming in keeps its newest line in view', async () => {
  const { page, context, errors } = await openStrip({ width: 1000, height: 600 }, ['undo', 'backups'])
  try {
    await page.evaluate(() => window.__help.ask('How do I publish?'))
    await page.waitForFunction(() =>
      document.querySelector('.tv-help-dock').textContent.includes('Last step: press Publish.')
    )
    await settle(page)
    const s = await readStrip(page)
    assert.ok(s.scrollMax > 100, `the strip scrolls (max ${s.scrollMax})`)
    assert.ok(s.fromBottom <= 1, `at the bottom: scrollTop ${s.scrollTop} of ${s.scrollMax}`)
    assert.ok(
      s.lastRowBottom <= s.bottom + 1,
      `the streamed answer ends inside the strip (${s.lastRowBottom} vs ${s.bottom})`
    )
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})

test('a person who scrolled up keeps their place when a row is added and when the window shrinks', async () => {
  const { page, context, errors } = await openStrip({ width: 1000, height: 600 }, [
    'undo',
    'backups',
    'publishing'
  ])
  try {
    await scrollStripTo(page, 60)
    const reading = await readStrip(page)
    assert.equal(reading.scrollTop, 60)
    // A bare /help adds a row below what they are reading: what they read does not move, and the strip
    // does not pull them down to it.
    await page.evaluate(() => window.__help.ask(''))
    await page.waitForFunction(() => document.querySelectorAll('.tv-help-dock .tv-help-chip').length === 4)
    await settle(page)
    const added = await readStrip(page)
    await shot(page, '4-scrolled-up-row-added-1000x600')
    assert.equal(added.scrollTop, 60, 'the rows being read stay where they were')
    assert.ok(added.fromBottom > reading.fromBottom, 'the new row waits below, the strip did not follow it')
    // The window shrinks: the strip gives back 20 px and the rows being read stay where they were;
    // the strip is neither sent back to its top nor pulled down to the newest row.
    await page.setViewportSize({ width: 1000, height: 580 })
    await settle(page)
    const shrunk = await readStrip(page)
    await shot(page, '5-scrolled-up-shrunk-1000x580')
    assert.ok(
      shrunk.height < added.height - 10,
      `the strip gave back room (${added.height} -> ${shrunk.height})`
    )
    assert.equal(shrunk.scrollTop, 60, 'the rows being read stay where they were')
    assert.ok(shrunk.fromBottom > 1, 'not pulled down to the newest row')
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})
