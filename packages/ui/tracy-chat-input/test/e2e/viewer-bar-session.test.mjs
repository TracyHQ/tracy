/**
 * The Viewer's bar stays right above the chat box through the whole session (ADR 0028), not only on
 * the start screen: one bar at a time, the same look in both places.
 *
 * Pinned here, in a real browser, with this plugin's real CSS (styles.ts) over the dock markup dsh
 * renders (`conversation.input.dock` above the composer card, inside dsh's hero before the first
 * message and outside it after):
 *   - on a Viewer's start screen the start block's own bar shows and the session bar steps aside;
 *   - once the conversation runs, after a / command, and while a session is active before its first
 *     message (the start block hidden), the session bar shows right above the chat box;
 *   - the bar is a 1px-bordered card, and its button's focus is the 1px border changing colour, no halo;
 *   - in a narrow column (~500px) the button goes on its own line under the sentence, lined up with
 *     the text after the eye, and the sentence keeps the full width; wide, one row as before.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system
 * Chrome, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

/** This plugin's real stylesheet, compiled from source. */
async function pluginCss() {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/client/styles.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent'
  })
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
  return mod.CSS
}

/** The sentence the bar says (strings.ts `viewer.bar`). */
const SENTENCE = 'You can view this site and ask about it. Changes need edit access.'

/** The markup ViewerBar renders, in one of its two places. */
const bar = (id, place) =>
  `<div class="tv-viewer-bar" data-viewer-bar="idle" data-viewer-bar-place="${place}" id="${id}">` +
  '<div class="tv-viewer-bar-body">' +
  `<svg class="tv-viewer-bar-icon" id="${id}-icon" aria-hidden="true"></svg>` +
  `<div class="tv-viewer-bar-text" id="${id}-text"><p class="tv-viewer-bar-line">${SENTENCE}</p></div>` +
  `<button type="button" class="tv-viewer-bar-button" id="${id}-button">Ask for edit access</button></div></div>`

/**
 * dsh's composer root around the card (InputBar.module.css .root): a centred column padded by
 * --dsh-composer-side-clearance on each side, the card capped at --dsh-composer-card-max-width.
 */
const card = (id) =>
  '<div style="display:flex;flex-direction:column;align-items:center;padding:0 var(--dsh-composer-side-clearance)">' +
  `<div data-composer-card id="${id}" style="box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);height:96px;border:1px solid #ddd"></div></div>`

/** dsh's composer stack (ConversationRoot.module.css): the hero is the card cap plus both clearances. */
const HERO_STYLE =
  'display:flex;flex-direction:column;align-self:center;width:min(calc(var(--dsh-composer-card-max-width) + 2 * var(--dsh-composer-side-clearance)), 100%)'
const STACK_STYLE = 'display:flex;flex-direction:column'

/** The start block as the Dock draws it: a Viewer's (with its bar), or the empty one after a / command. */
const startBlock = (kind, id) =>
  kind === 'viewer'
    ? `<div class="tv-dock" data-tracy-start="site" data-tracy-viewer=""><div class="tv-start"></div>${bar(id, 'start')}</div>`
    : '<div class="tv-dock" data-tracy-start="site" data-tracy-sent=""></div>'

/** dsh's hero before the first message: the dock slot, then the composer. */
const hero = (n, kind, width = 900) =>
  `<section id="s${n}" style="width:${width}px;height:600px;display:flex;flex-direction:column"><div class="_composerHero_q1" style="${HERO_STYLE}">` +
  `<div data-slot="conversation.input.dock">${startBlock(kind, `start${n}`)}${bar(`session${n}`, 'session')}</div>` +
  `<div data-slot="conversation.composer.bar">${card(`card${n}`)}</div></div></section>`

/** The docked composer once the conversation runs (no hero), optionally with the hidden start block. */
const docked = (n, withStart, width = 900) =>
  `<section id="s${n}" style="width:${width}px"><div class="_composerDock_q1" style="${STACK_STYLE}">` +
  `<div data-slot="conversation.input.dock">${withStart ? startBlock('viewer', `start${n}`) : ''}${bar(`session${n}`, 'session')}</div>` +
  `<div data-slot="conversation.composer.bar">${card(`card${n}`)}</div></div></section>`

let browser
let page

before(async () => {
  const sheet = await pluginCss()
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  await page.setContent(
    '<!doctype html><html style="--dsh-composer-card-max-width:640px;--dsh-composer-side-clearance:16px"><head><meta charset="utf-8">' +
      '<style>body{margin:0;font-family:Arial,sans-serif}</style>' +
      `<style>${sheet}</style></head><body>` +
      `${hero(1, 'viewer')}${docked(2, false)}${hero(3, 'sent')}${docked(4, true)}` +
      // Narrower than the card cap plus its clearances: the column, not the cap, sets the width.
      `${hero(5, 'viewer', 520)}${docked(6, false, 520)}</body></html>`
  )
})

after(async () => {
  await browser?.close()
})

/** Whether a bar is drawn, and where it sits against the composer card under it. */
const measure = (barId, cardId) =>
  page.evaluate(
    ([b, c]) => {
      const el = document.getElementById(b)
      const box = el.getBoundingClientRect()
      const cardBox = document.getElementById(c).getBoundingClientRect()
      const css = getComputedStyle(el)
      return {
        shown: css.display !== 'none' && box.height > 0,
        width: box.width,
        left: box.left - cardBox.left,
        right: box.right - cardBox.right,
        gap: cardBox.top - box.bottom,
        border: css.borderTopWidth,
        shadow: css.boxShadow
      }
    },
    [barId, cardId]
  )

test('a Viewer’s start screen: the start block’s bar shows, the session bar steps aside', async () => {
  assert.equal((await measure('start1', 'card1')).shown, true)
  assert.equal((await measure('session1', 'card1')).shown, false)
})

test('once the conversation runs: the bar stays right above the chat box, the same card', async () => {
  const m = await measure('session2', 'card2')
  assert.equal(m.shown, true)
  assert.ok(m.gap >= 0 && m.gap <= 12, `right above the chat box (gap ${m.gap}px)`)
  assert.ok(m.width <= 640, `no wider than the composer card (${m.width}px)`)
  assert.equal(m.border, '1px')
  assert.equal(m.shadow, 'none')
})

test('the bar’s left and right edges are the chat box’s, in both places, wide and narrow', async () => {
  for (const [b, c] of [
    ['start1', 'card1'],
    ['session2', 'card2'],
    ['session3', 'card3'],
    ['start5', 'card5'],
    ['session6', 'card6']
  ]) {
    const m = await measure(b, c)
    assert.equal(m.shown, true, `${b} is drawn`)
    assert.ok(
      Math.abs(m.left) <= 0.5 && Math.abs(m.right) <= 0.5,
      `${b} lines up with ${c} ${JSON.stringify(m)}`
    )
  }
})

test('after a / command and while active before the first message: the session bar shows', async () => {
  assert.equal((await measure('session3', 'card3')).shown, true, 'after a / command')
  assert.equal((await measure('start4', 'card4')).shown, false, 'the start block is hidden outside the hero')
  assert.equal((await measure('session4', 'card4')).shown, true, 'active before the first message')
})

test('the button’s focus is its 1px border changing colour, never a halo', async () => {
  const button = page.locator('#session2-button')
  const rest = await button.evaluate((el) => getComputedStyle(el).borderTopColor)
  await page.keyboard.press('Tab')
  await button.focus()
  const focused = await button.evaluate((el) => {
    const css = getComputedStyle(el)
    return {
      color: css.borderTopColor,
      width: css.borderTopWidth,
      shadow: css.boxShadow,
      outline: css.outlineStyle
    }
  })
  assert.equal(focused.width, '1px')
  assert.equal(focused.shadow, 'none')
  assert.equal(focused.outline, 'none')
  assert.notEqual(focused.color, rest, 'the border changes colour')
})

/** Where the sentence and the button sit inside one bar. */
const layout = (barId) =>
  page.evaluate((b) => {
    const box = (id) => document.getElementById(id).getBoundingClientRect()
    const text = box(`${b}-text`)
    const button = box(`${b}-button`)
    const line = parseFloat(getComputedStyle(document.querySelector(`#${b} .tv-viewer-bar-line`)).lineHeight)
    return {
      textLeft: text.left,
      textRight: text.right,
      textLines: Math.round(text.height / line),
      buttonLeft: button.left,
      buttonTop: button.top,
      textBottom: text.bottom,
      textTop: text.top,
      barRight: document.getElementById(b).getBoundingClientRect().right
    }
  }, barId)

test('narrow column: the button goes under the sentence, lined up with the text; the sentence keeps the width', async () => {
  // s6: a docked bar in a 520px column (the bar ~488px wide), where the sentence used to break into four lines.
  const m = await layout('session6')
  assert.ok(m.buttonTop >= m.textBottom, `the button is under the sentence ${JSON.stringify(m)}`)
  assert.ok(
    Math.abs(m.buttonLeft - m.textLeft) <= 0.5,
    `the button starts where the text starts ${JSON.stringify(m)}`
  )
  assert.ok(m.textLines <= 2, `the sentence keeps the full width (${m.textLines} lines)`)
  assert.ok(
    m.barRight - m.textRight <= 12,
    `the sentence reaches the bar's right padding ${JSON.stringify(m)}`
  )
})

test('wide column: the sentence and the button stay on one row', async () => {
  const m = await layout('session2')
  assert.ok(m.buttonLeft > m.textRight - 0.5, `the button is beside the sentence ${JSON.stringify(m)}`)
  assert.ok(m.buttonTop < m.textBottom, `on the same row ${JSON.stringify(m)}`)
})
