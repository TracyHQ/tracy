// Accessibility and phone width of the build cards (#613), in a real browser WITH the plugin's CSS and the Tracy
// tokens loaded (the scenario runner in tracy-core drops CSS, so it cannot see width or focus rings).
//
// - keyboard: Tab reach and order, Enter and Space, Escape, focus after a save, a cancel, an undo and a choice;
// - names: every control has an accessible name, groups are labelled, status is text, the working line is polite;
// - layout: at 390 and 1280 wide, light and dark, no horizontal scroll, nothing wider than the page, buttons at
//   least 40 px high on the phone, a visible focus ring.
//
// Screenshots of every state go to $A11Y_SHOTS when it is set (file names carry $A11Y_TAG, default "after").
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/e2e/a11y.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  STAGES,
  stageDocuments,
  TEMPLATES
} from '../../../../core/tracy-core/test/fixtures/build-chat/stages.mjs'
import { DESIGN_NOT_BUILDABLE_SAY, SITE_NOT_STARTED_SAY } from '../../src/host/build-tool.mjs'
import { DSH_COLUMN_CSS } from './dsh-column.css.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const pkg = path.resolve(here, '../..')
const require = createRequire(import.meta.url)
const fromAskForm = { paths: [path.join(root, 'packages/ui/tracy-ask-form')] }
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium
const SHOTS = process.env.A11Y_SHOTS ?? null
const TAG = process.env.A11Y_TAG ?? 'after'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 }
]
const THEMES = ['light', 'dark']

const scenarioOf = (name) => stageDocuments(STAGES.find((s) => s.name === name)).scenario
const planStage = scenarioOf('plan')
const PLAN = planStage.plan
const darkAccentPlan = structuredClone(PLAN)
darkAccentPlan.look.accentDark = '#7fd1a0'
// A logo the machine drew from the owner's logo (the brand step's `lookSources.logo`): the row says so.
const drawnLogoPlan = structuredClone(PLAN)
drawnLogoPlan.look.logo = { kind: 'own', source: 'Tracy, based on the logo on your website' }
const DRAWN = { logo: { from: 'drawn-from-logo', name: 'A logo Tracy drew, based on your logo' } }
// Eight things left out (one asked for twice over: the same line twelve times is one line), for "Show all".
const manyLeftOut = structuredClone(PLAN)
manyLeftOut.leftOut = [
  ...Array.from({ length: 12 }, () => ({
    what: 'Photo',
    kind: 'picture',
    reason: 'The photo is too small.'
  })),
  ...['Prices page', 'Blog', 'Shop', 'Events page', 'Team page', 'Careers page', 'Press page'].map(
    (what) => ({
      what,
      kind: 'page',
      reason: 'Nothing to show for it yet.'
    })
  )
]
// A change request note: the same sentence ten times is one line with a count.
const REVISED = {
  changed: [
    'Changed the tagline.',
    ...Array.from({ length: 10 }, () => 'Removed a photo from the gallery.'),
    'Renamed the second service.'
  ],
  notDone: [
    { what: 'Change the language', why: 'The language is set on the plan card.' },
    { what: 'Move the logo', why: 'The logo stays where the design puts it.' },
    { what: 'Move the logo', why: 'The logo stays where the design puts it.' }
  ]
}
// The same note as the server writes it in a live run: its lines already end with a full stop.
const REVISED_FULL_STOPS = {
  changed: ['The Gallery section is removed from the Coaches page.'],
  notDone: [
    { what: 'You want the opening hours on every page.', why: 'The plan has no place for them.' },
    { what: 'You want the opening hours on every page.', why: 'The plan has no place for them.' }
  ]
}
const run = (name) => scenarioOf(name).runs.at(-1)
// What the engine said, as `tracy_build` answers it (#609): a stop the owner may have run again, and one that may not.
const STOPPED = { stopped: true, say: 'Stopped.', step: 'compose', rerun: true }
const STOPPED_FOR_GOOD = { stopped: true, say: 'Stopped.' }
// A start refused for its limit (#575): Try again waits for retryAt.
const PAUSED = {
  paused: true,
  say: 'Paused.',
  retryAt: new Date(Date.now() + 40 * 60_000).toISOString(),
  rerun: true,
  again: { action: 'plan' }
}
const PAUSED_OVER = { ...PAUSED, retryAt: new Date(Date.now() - 60_000).toISOString() }
const MESSAGES = [
  { role: 'user', text: 'Build a website for my tennis club. https://sunrise-tennis.example' },
  { role: 'assistant', text: 'I found 4 services, 38 photos and 6 reviews. Two quick questions.' },
  { role: 'user', text: 'Make the tagline shorter.' }
]

// Template pictures that never show: one whose address does not answer an image (the fixture page answers every
// address of its host with the page itself), and one with no picture at all.
const FITS = TEMPLATES.find((t) => t.quickstart === 'released' && t.fits === true)
const NO_PICTURES = [
  { ...FITS, picture: 'http://a11y.test/missing-picture.png' },
  { ...FITS, slug: 'example-court', name: 'Example Court', recommended: false, picture: undefined }
]

/** Every state drawn: name, fixture state, data. */
const STATES = [
  ['template', 'template', { templates: TEMPLATES }],
  ['template-chosen', 'template', { templates: TEMPLATES, chosen: 'ja-boxing' }],
  ['template-none', 'template', { templates: [] }],
  ['template-no-picture', 'template', { templates: NO_PICTURES }],
  ['plan', 'plan', { plan: PLAN }],
  ['plan-dark-accent', 'plan', { plan: darkAccentPlan }],
  ['plan-drawn-logo', 'plan', { plan: drawnLogoPlan, lookSources: DRAWN }],
  ['plan-revised', 'plan', { plan: PLAN, revised: REVISED }],
  ['plan-left-out-many', 'plan', { plan: manyLeftOut }],
  ['review', 'review', { plan: PLAN }],
  ['review-say', 'review', { plan: PLAN, say: true }],
  ['plan-revised-full-stops', 'plan', { plan: PLAN, revised: REVISED_FULL_STOPS }],
  ['building', 'progress', { run: run('building') }],
  ['done', 'progress', { run: run('done') }],
  ['could-not-finish', 'progress', { run: run('could-not-finish') }],
  ['cancelled', 'progress', { run: run('cancelled') }],
  ['not-started', 'progress', { run: { notStarted: 'site-not-started' } }],
  ['not-started-design', 'progress', { run: { notStarted: 'design-not-buildable' } }],
  ['working', 'working', {}],
  ['research-working', 'chat', { stage: 'working' }],
  ['research-done', 'chat', { stage: 'done', folded: true }],
  ['try-again', 'retry', { results: [STOPPED] }],
  ['try-again-second', 'retry', { results: [STOPPED, STOPPED] }],
  ['try-again-no-rerun', 'retry', { results: [STOPPED_FOR_GOOD] }],
  ['try-again-after-two-retries', 'retry', { results: [STOPPED, STOPPED, STOPPED] }],
  ['try-again-build-locked', 'retry', { results: [STOPPED], run: run('building') }],
  ['stop-limit-waiting', 'retry', { results: [PAUSED] }],
  ['stop-limit-over', 'retry', { results: [PAUSED_OVER] }],
  ['earlier', 'earlier', { plan: PLAN, messages: MESSAGES }]
]

const tokens = readFileSync(path.join(root, 'packages/ui/tracy-ui/src/tokens.css'), 'utf8')

async function bundle(entry, loader = 'tsx') {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    outdir: path.join(here, 'out'),
    loader: { '.css': 'empty', '.module.css': 'local-css' },
    nodePaths: [path.join(pkg, 'node_modules')],
    alias: {
      react: path.dirname(require.resolve('react/package.json', fromAskForm)),
      'react-dom': path.dirname(require.resolve('react-dom/package.json', fromAskForm))
    }
  })
  void loader
  return {
    js: result.outputFiles.find((f) => f.path.endsWith('.js')).text,
    css: result.outputFiles
      .filter((f) => f.path.endsWith('.css'))
      .map((f) => f.text)
      .join('\n')
  }
}

async function launch() {
  const args = ['--disable-features=MacAppCodeSignClone']
  return chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }))
}

/** The plugin's CSS string, read from styles.ts without importing TypeScript. */
const css = readFileSync(path.join(pkg, 'src/client/styles.ts'), 'utf8').match(/CSS = `([\s\S]*)`\s*$/)[1]

async function open(browser, viewport, theme, code) {
  const page = await browser.newPage({ viewport })
  page.setDefaultTimeout(5000)
  const dark = theme === 'dark' ? ' class="dark" data-ds-dark-theme=""' : ''
  const html = `<!doctype html><html data-theme="${theme}"${dark}><head><style>${tokens}
body{margin:0;padding:0 16px;background:var(--background);color:var(--foreground);font-family:system-ui,sans-serif}
</style><style>${css}</style><style>${code.css}</style><style>${DSH_COLUMN_CSS}</style></head><body><div id="root"></div></body></html>`
  await page.route('http://a11y.test/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html })
  )
  await page.goto('http://a11y.test/')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addScriptTag({ content: code.js })
  return { page, errors }
}

const mount = (page, state, view) =>
  page
    .evaluate(([s, v]) => window.probe.mount(s, v), [state, view])
    .then(() => page.waitForSelector(`[data-state="${state}"] *`, { state: 'attached' }).catch(() => {}))

/** The focused element's accessible name as the card gives it, and where it is. */
const focused = (page) =>
  page.evaluate(() => {
    const e = document.activeElement
    if (!e || e === document.body) return null
    return (
      e.getAttribute('aria-label') ||
      (e.labels?.[0]?.innerText ?? '').trim() ||
      (e.innerText ?? '').trim().split('\n')[0] ||
      e.tagName
    )
  })

/** Layout facts of the drawn state. */
const measure = (page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const wide = [...document.querySelectorAll('#root *')]
      // dsh's shimmer sweep is a moving overlay that its own row clips
      .filter((e) => !/Shimmer/.test(String(e.className)))
      .filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && (r.right > width + 0.5 || r.left < -0.5)
      })
      .map((e) => e.className || e.tagName)
    const small = [
      ...document.querySelectorAll(
        '#root button, #root a, #root label.tv-bc-opt, #root input:not([type=radio])'
      )
    ]
      .filter((e) => !e.disabled || e.tagName !== 'BUTTON' || true)
      .map((e) => ({
        name: (e.getAttribute('aria-label') || e.innerText || e.className).slice(0, 40),
        h: e.getBoundingClientRect().height
      }))
      .filter((x) => x.h > 0 && x.h < 40)
    const clipped = [...document.querySelectorAll('#root *')]
      .filter((e) => !/Shimmer/.test(String(e.className)))
      // a line for screen readers only is clipped on purpose
      .filter((e) => e.getBoundingClientRect().width > 1)
      .filter((e) => {
        const s = getComputedStyle(e)
        return (
          (s.overflowX === 'hidden' || s.overflowX === 'clip') &&
          s.textOverflow !== 'ellipsis' &&
          e.scrollWidth > e.clientWidth + 1
        )
      })
      .map((e) => e.className || e.tagName)
    return { scroll: document.documentElement.scrollWidth - width, wide, small, clipped }
  })

const code = await bundle(path.join(here, 'a11y-fixture.tsx'))
const browser = await launch()
after(() => browser.close())

test('layout: every state at phone and desktop width, light and dark', async (t) => {
  for (const viewport of VIEWPORTS)
    for (const theme of THEMES) {
      const { page, errors } = await open(browser, viewport, theme, code)
      for (const [name, state, view] of STATES)
        await t.test(`${name} at ${viewport.name}, ${theme}`, async () => {
          errors.length = 0
          await mount(page, state, view)
          if (SHOTS)
            await page
              .locator('#root')
              .screenshot({ path: path.join(SHOTS, `${TAG}-${name}-${viewport.name}-${theme}.png`) })
          const m = await measure(page)
          assert.ok(m.scroll <= 0, `horizontal page scroll of ${m.scroll}px`)
          assert.deepEqual(m.wide, [], 'nothing sticks out of the page')
          assert.deepEqual(m.clipped, [], 'nothing is clipped')
          if (viewport.name === 'phone') assert.deepEqual(m.small, [], 'tap targets are at least 40 px high')
          assert.deepEqual(errors, [])
        })
      await page.close()
    }
})

test('run 6: a template picture that does not load falls back to the no-picture look, its name still read', async () => {
  const { page, errors } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'template', { templates: NO_PICTURES })
  await page.waitForFunction(() => document.querySelectorAll('#root img').length === 0)
  const thumbs = page.locator('#root .tv-bc-thumb[data-no-picture]')
  assert.equal(await thumbs.count(), NO_PICTURES.length)
  for (const box of await thumbs.all()) {
    const { width, height } = await box.boundingBox()
    assert.ok(width > 0 && height > 0, 'the picture keeps its box')
  }
  for (const t of NO_PICTURES)
    assert.ok(await page.locator('#root .tv-bc-nm', { hasText: t.name }).first().isVisible(), t.name)
  assert.deepEqual(errors, [])
  await page.close()
})

test('run 6: a build refused before any step says the site was not started, with no task list', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  // The card's sentences equal the tool's (`guidance-contract.test.mjs`).
  for (const [notStarted, say] of [
    ['site-not-started', SITE_NOT_STARTED_SAY],
    ['design-not-buildable', DESIGN_NOT_BUILDABLE_SAY]
  ]) {
    await mount(page, 'progress', { run: { notStarted } })
    const notice = page.locator(`#root [data-not-started="${notStarted}"]`)
    assert.equal((await notice.innerText()).trim(), say)
    assert.equal(
      await page.locator('#root .tv-bc-todo').count(),
      0,
      'no task list, so no step reads as failed'
    )
  }
  await page.close()
})

test('plan card keyboard: reach, edit, Escape, Save, undo and where focus goes', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'plan', { plan: PLAN })
  const card = page.getByRole('article', { name: 'Sunrise Tennis Club site plan' })
  // Tab order: Undo is disabled (skipped), then the values in reading order.
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Edit Business name: Sunrise Tennis Club')
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Edit Tagline: Tennis for every age and level')
  // Enter opens the editor with focus in it; Escape closes it and focus returns to the value.
  await page.keyboard.press('Enter')
  assert.equal(await focused(page), 'New value for Tagline')
  await page.keyboard.press('Escape')
  assert.equal(await focused(page), 'Edit Tagline: Tennis for every age and level')
  // Space opens it too (a real button), Tab inside the editor reaches Save then Cancel.
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Save')
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Cancel')
  await page.keyboard.press('Enter')
  assert.equal(await focused(page), 'Edit Tagline: Tennis for every age and level', 'Cancel returns focus')
  // Save by Enter in the input returns focus to the value, now offering Undo.
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(' now')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-changed]'))
  assert.equal(await focused(page), 'Edit Tagline: Tennis for every age and level now')
  // The undo button is reachable backwards with Shift+Tab and pressed with Space; focus does not fall to the page.
  const undo = card.getByRole('button', { name: 'Undo last change' })
  await undo.focus()
  await page.keyboard.press('Space')
  await page.waitForFunction(() => !document.querySelector('[data-changed]'))
  assert.notEqual(await focused(page), null, 'focus is not lost after undo')
  assert.equal(
    await focused(page),
    'Edit Tagline: Tennis for every age and level',
    'focus lands on the value undone'
  )
  await page.close()
})

test('plan card names: pencil buttons, radio group, editors', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'plan', { plan: PLAN })
  const card = page.getByRole('article', { name: 'Sunrise Tennis Club site plan' })
  const unnamed = await card.evaluate((el) =>
    [...el.querySelectorAll('button, input, [role=radio], textarea')]
      .filter((e) => !(e.getAttribute('aria-label') || e.labels?.length || e.innerText.trim()))
      .map((e) => e.outerHTML.slice(0, 80))
  )
  assert.deepEqual(unnamed, [])
  assert.equal(await card.getByRole('radiogroup', { name: 'Opening hours' }).count(), 1)
  assert.equal(await card.getByRole('button', { name: 'Edit Phone: 04 000 0000' }).count(), 1)
  assert.equal(await card.getByRole('button', { name: /^Edit Main colour: #1f7a4d$/ }).count(), 1)
  assert.equal(await card.getByRole('button', { name: 'Edit Service 2: Junior squad' }).count(), 1)
  // The radio group picks with the arrow key, and its focus stays on the checked radio.
  const hours = card.getByRole('radiogroup', { name: 'Opening hours' })
  await hours.getByRole('radio').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForFunction(() => window.probe.log().requests.length === 1)
  assert.match(await focused(page), /Every day, 6:00 to 22:00/)
  await page.close()
})

test('template card keyboard: Tab, Enter, and focus after the choice', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'template', { templates: TEMPLATES })
  const group = page.getByRole('group', { name: 'Designs for your site' })
  assert.equal(await group.getByRole('button', { pressed: true }).count(), 1, 'the pick is told as pressed')
  await page.keyboard.press('Tab')
  assert.match(await focused(page), /JA Boxing/)
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Use JA Boxing')
  await page.keyboard.press('Space')
  await page.getByText('Chosen: JA Boxing').waitFor()
  assert.notEqual(await focused(page), null, 'focus is not lost when the choose button goes')
  await page.close()
})

test('progress, stopped and working line expose status as text', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'progress', { run: run('could-not-finish') })
  const list = page.getByRole('region', { name: 'Building your site' })
  // Every row's state is a text name, not colour only.
  const states = await list
    .locator('li')
    .evaluateAll((rows) => rows.map((r) => r.querySelector('[role=img]')?.getAttribute('aria-label')))
  assert.ok(states.every(Boolean), 'each row names its state')
  assert.ok(states.includes('Failed') && states.includes('Completed'))
  // The head toggle is a button that says whether the list is open.
  const head = list.getByRole('button', { expanded: true })
  await head.focus()
  await page.keyboard.press('Enter')
  assert.equal(await list.getByRole('button', { expanded: false }).count(), 1)
  await mount(page, 'working', {})
  const live = page.locator('[aria-live="polite"]').filter({ hasText: 'Working on your site plan' })
  assert.equal(await live.count(), 1, 'the working line is announced politely')
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'no focus stolen')
  await page.close()
})

test('focus ring is visible in light and dark', async () => {
  for (const theme of THEMES) {
    const { page } = await open(browser, VIEWPORTS[1], theme, code)
    await mount(page, 'plan', { plan: PLAN })
    await page.keyboard.press('Tab')
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement)
      return { width: Number.parseFloat(s.outlineWidth), style: s.outlineStyle }
    })
    assert.ok(
      ring.style !== 'none' && ring.width >= 1,
      `${theme}: a ring of at least 1px, got ${JSON.stringify(ring)}`
    )
    await page.keyboard.press('Enter')
    const input = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement)
      return { outline: Number.parseFloat(s.outlineWidth), style: s.outlineStyle, border: s.borderTopColor }
    })
    assert.ok(input.style !== 'none' && input.outline >= 1, `${theme}: the editor has a ring too`)
    await page.close()
  }
})

test('a change refused while the site is built says so in the card words, never the door sentence', async () => {
  for (const viewport of VIEWPORTS)
    for (const theme of THEMES) {
      const { page } = await open(browser, viewport, theme, code)
      await mount(page, 'plan', { plan: PLAN })
      await page.evaluate(() => {
        globalThis.buildRunning = true
      })
      await page.getByRole('button', { name: 'Edit Tagline: Tennis for every age and level' }).click()
      await page.keyboard.insertText(' now')
      await page.keyboard.press('Enter')
      const alert = page.getByRole('alert')
      await alert.waitFor()
      assert.equal(
        await alert.innerText(),
        'Your site is being built from this plan, so the plan cannot change until the build ends.'
      )
      if (SHOTS)
        await page
          .locator('#root')
          .screenshot({ path: path.join(SHOTS, `${TAG}-plan-locked-${viewport.name}-${theme}.png`) })
      await page.close()
    }
})

test('a change refused for a fault of the plan says so truthfully, and the next change is saved at once', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'plan', { plan: PLAN })
  await page.evaluate(() => {
    globalThis.refuseOnce = true
  })
  await page.getByRole('button', { name: 'Edit Tagline: Tennis for every age and level' }).click()
  await page.keyboard.insertText(' now')
  await page.keyboard.press('Enter')
  const alert = page.getByRole('alert')
  await alert.waitFor()
  assert.match(await alert.innerText(), /has a problem of its own that Tracy has to fix first/)
  // The card is not left busy: the same edit goes through right after, within a short wait.
  await page
    .getByRole('button', { name: 'Edit Tagline: Tennis for every age and level' })
    .click({ timeout: 2000 })
  await page.keyboard.insertText(' now')
  await page.keyboard.press('Enter')
  await page
    .getByRole('button', { name: 'Edit Tagline: Tennis for every age and level now' })
    .waitFor({ timeout: 2000 })
  assert.equal(await page.getByRole('alert').count(), 0)
  await page.close()
})

test('an idle, empty search term field wears the quiet border, not the error looking ring', async () => {
  const plan = structuredClone(PLAN)
  plan.pages[0].seo = { titleIntent: 'Tennis lessons', searchTerms: ['tennis lessons'] }
  for (const theme of THEMES) {
    const { page } = await open(browser, VIEWPORTS[1], theme, code)
    await mount(page, 'plan', { plan })
    const input = page.locator('[data-field$=".seo.searchTerms"] input').first()
    await input.waitFor()
    const colours = await input.evaluate((el) => {
      const probe = document.createElement('div')
      el.parentElement.appendChild(probe)
      probe.style.color = 'var(--ring)'
      const ring = getComputedStyle(probe).color
      probe.remove()
      return { border: getComputedStyle(el).borderTopColor, ring }
    })
    assert.notEqual(colours.border, colours.ring, `${theme}: idle border ${colours.border}`)
    await page.close()
  }
})

test('not on the site: every line in a fold of its group with a count, opened from the keyboard (#575 C4)', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'plan', { plan: manyLeftOut })
  const card = page.getByRole('article', { name: 'Sunrise Tennis Club site plan' })
  const section = card.getByRole('region', { name: 'Not on the site' })
  // 12 photos collapse to one line, so 8 lines in all, none behind a show all button.
  assert.equal(await section.locator('.tv-bc-dropped li').count(), 8)
  assert.equal(await card.getByRole('button', { name: /Show all/ }).count(), 0)
  const fold = section.locator('details').first()
  assert.match(await fold.locator('summary').innerText(), /\d+ lines?/)
  assert.equal(await fold.evaluate((d) => d.open), false)
  await fold.locator('summary').focus()
  await page.keyboard.press('Enter')
  assert.equal(await fold.evaluate((d) => d.open), true)
  assert.ok(await fold.locator('.tv-bc-dropped li').first().isVisible())
  await page.close()
})

test("logo rows tell the truth: a drawn logo is not called the owner's own", async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  const rows = async () => page.locator('[data-field="look.logo"]').allInnerTexts()
  await mount(page, 'plan', { plan: drawnLogoPlan, lookSources: DRAWN })
  assert.deepEqual(await rows(), [
    'A logo Tracy drew, based on your logo',
    'A logo Tracy drew, based on your logo'
  ])
  // Without the brand step's record a logo the card calls own keeps its source, and a text logo is unchanged.
  await mount(page, 'plan', { plan: drawnLogoPlan })
  assert.match((await rows())[0], /^Your logo, from Tracy, based on the logo on your website/)
  const text = structuredClone(PLAN)
  text.look.logo = { kind: 'text' }
  await mount(page, 'plan', { plan: text, lookSources: { logo: { from: 'made-for-you' } } })
  assert.match((await rows())[0], /^Your business name as text/)
  await page.close()
})

test('change request note: collapsed lines, a reason for what was not done, dismissed by keyboard', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'plan', { plan: PLAN, revised: REVISED })
  const note = page.getByRole('region', { name: 'What changed' })
  const items = await note.locator('li').allInnerTexts()
  assert.equal(items.filter((x) => /Removed a photo/.test(x)).length, 1, 'ten identical lines are one')
  assert.ok(items.some((x) => x === 'Removed a photo from the gallery. (10)'))
  assert.ok(items.some((x) => /^Move the logo \(2\)\. The logo stays where the design puts it\.$/.test(x)))
  assert.ok(items.some((x) => /^Change the language\. The language is set on the plan card\.$/.test(x)))
  assert.equal(await note.getByRole('heading', { name: 'Not done' }).count(), 1)
  const hide = note.getByRole('button', { name: 'Hide this note' })
  await hide.focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByRole('region', { name: 'What changed' }).count(), 0)
  assert.equal(await focused(page), 'Sunrise Tennis Club site plan', 'focus goes to the card title')
  // A card with no note draws none.
  await mount(page, 'plan', { plan: PLAN })
  assert.equal(await page.getByRole('region', { name: 'What changed' }).count(), 0)
  await page.close()
})

/** What the owner can see of the build chat scene: visible text of the pieces the chrome rules govern. */
const sceneSeen = (page) =>
  page.evaluate(() => {
    // Drawn for the eye: rendered (not skipped under a hidden="until-found" fold), and more than a screen reader's 1px.
    const shown = (e) => {
      const r = e.getBoundingClientRect()
      return e.checkVisibility({ visibilityProperty: true }) && r.width > 1 && r.height > 1
    }
    const texts = (selector) =>
      [...document.querySelectorAll(selector)].filter(shown).map((e) => e.innerText.trim())
    return {
      rows: texts('.tv-bc-toolrow'),
      header: texts('[data-step-process] > div:not([data-step-process-body]) button'),
      think: texts('[data-variant="think"]'),
      running: texts('[data-chat-running]'),
      ask: texts('[data-tool="ask_user_question"]'),
      failed: texts('[data-state="error"]'),
      control: texts('[data-chat-flow-kind="turn-process"]'),
      dock: texts('.tv-bc-dock'),
      dockLive: [...document.querySelectorAll('.tv-bc-dock[aria-live="polite"]')].map((e) => e.textContent)
    }
  })

const PROGRESS_SHOTS = process.env.PROGRESS_SHOTS ?? null
if (PROGRESS_SHOTS) mkdirSync(PROGRESS_SHOTS, { recursive: true })

test('research working: one progress block in the conversation, no tool chrome, nothing drawn twice', async () => {
  for (const theme of THEMES) {
    const { page, errors } = await open(browser, VIEWPORTS[1], theme, code)
    await mount(page, 'chat', { stage: 'working', failedTool: true })
    await page.getByText('Reading your links').first().waitFor()
    if (PROGRESS_SHOTS)
      await page.screenshot({ path: path.join(PROGRESS_SHOTS, `research-working-${theme}.png`) })
    const seen = await sceneSeen(page)
    assert.equal(seen.rows.length, 1, `one block, saw ${JSON.stringify(seen.rows)}`)
    assert.match(seen.rows[0], /^Reading your links/)
    for (const line of ['Google Maps: read', 'example-court.example: reading', 'Instagram: reading'])
      assert.ok(seen.rows[0].includes(line), `the block names ${line}`)
    assert.ok(!seen.rows[0].includes('Waiting for you to choose'), 'the call it carried on gave way')
    assert.deepEqual(seen.header, [], 'no Calling tools header')
    assert.deepEqual(seen.think, [], 'no Think row')
    assert.deepEqual(seen.running, [], 'no Thinking for line')
    assert.deepEqual(seen.ask, [], 'no settled Ask question summary')
    assert.deepEqual(seen.dock, [], 'nothing drawn again above the input')
    assert.equal(seen.failed.length, 1, 'an error is never hidden')
    // The step is still announced politely, once, without being drawn twice.
    assert.deepEqual(seen.dockLive, ['Reading your links'])
    assert.deepEqual(errors, [])
    await page.close()
  }
})

test('research done: one short done line, folded turn or not, opened by keyboard', async () => {
  for (const theme of THEMES) {
    const { page, errors } = await open(browser, VIEWPORTS[1], theme, code)
    await mount(page, 'chat', { stage: 'done', folded: true })
    await page.getByText('Read 3 sources').waitFor()
    if (PROGRESS_SHOTS)
      await page.screenshot({ path: path.join(PROGRESS_SHOTS, `research-done-${theme}.png`) })
    const seen = await sceneSeen(page)
    assert.equal(seen.rows.length, 1)
    assert.match(seen.rows[0], /^Read 3 sources/)
    assert.ok(!/reading|: read/.test(seen.rows[0]), 'the per link lines are folded into the done line')
    assert.deepEqual(seen.control, [], 'no whole turn control')
    assert.deepEqual(seen.header, [])
    // The line opens on Enter to show what each link gave.
    const head = page.getByRole('button', { name: /Read 3 sources/ })
    await head.focus()
    await page.keyboard.press('Enter')
    await page.getByText('Instagram: read').waitFor()
    assert.equal(await page.getByRole('button', { name: /Read 3 sources/, expanded: true }).count(), 1)
    if (PROGRESS_SHOTS && theme === 'light')
      await page.screenshot({ path: path.join(PROGRESS_SHOTS, `research-done-open-${theme}.png`) })
    assert.deepEqual(errors, [])
    await page.close()
  }
})

test('reload: the same log draws the same single done line', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'chat', { stage: 'done', folded: true })
  const before = (await sceneSeen(page)).rows
  await page.reload()
  await page.addScriptTag({ content: code.js })
  await mount(page, 'chat', { stage: 'done', folded: true })
  await page.getByText('Read 3 sources').waitFor()
  assert.deepEqual((await sceneSeen(page)).rows, before)
  assert.equal(before.length, 1)
  await page.close()
})

test('the chrome rules reach build chats only: another chat keeps every dsh row', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'chat', { session: 'other', stage: 'working' })
  const seen = await sceneSeen(page)
  assert.deepEqual(seen.header, ['Calling tools'])
  assert.deepEqual(seen.running, ['Thinking for 27s ···'])
  // dsh's collapsed group keeps its rows folded there, as dsh decides.
  assert.deepEqual(seen.think, [])
  await page.close()
})

test('Try again: reached by Tab, pressed with Space, one fixed message, gone while it goes', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'retry', { results: [STOPPED] })
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Try again')
  assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 1)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.probe.log().sent.length === 1)
  assert.deepEqual((await page.evaluate(() => window.probe.log())).sent, ['Please try again.'])
  // Run 6: the button is gone while the retry runs, not drawn disabled; nothing is left to press a second time.
  assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 0)
  assert.equal((await page.evaluate(() => window.probe.log())).sent.length, 1)
  await page.close()
})

test('Try again: a message the chat did not take says so and leaves the button to press again', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'retry', { results: [STOPPED], sendResult: 'failed' })
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByText('Your request was not sent. Try again.').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Try again' }).isDisabled(), false)
  await page.close()
})

test('Try again: none for a stop that may not be rerun, after two retries, or while a build is locked', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  const offered = async (view) => {
    await mount(page, 'retry', view)
    return page.getByRole('button', { name: 'Try again' }).count()
  }
  assert.equal(await offered({ results: [STOPPED] }), 1)
  assert.equal(await offered({ results: [STOPPED, STOPPED] }), 1, 'one retry stopped again: still offered')
  assert.equal(await offered({ results: [STOPPED_FOR_GOOD] }), 0)
  assert.equal(await offered({ results: [STOPPED, STOPPED, STOPPED] }), 0)
  assert.equal(await offered({ results: [STOPPED], run: run('building') }), 0)
  assert.equal(await offered({ results: [STOPPED], run: run('cancelled') }), 0)
  // The card's sentence stays when the button goes, and it is the only explanation of why it stopped.
  await mount(page, 'retry', { results: [STOPPED_FOR_GOOD] })
  const text = await page.locator('#root').innerText()
  assert.match(text, /This step could not finish, so I stopped here/)
  assert.doesNotMatch(text, /Something went wrong on our side/)
  await page.close()
})

test('the stop card: a limit waits for its time, Start over asks once and calls the door only when confirmed', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'retry', { results: [PAUSED] })
  assert.equal(await page.getByRole('button', { name: 'Try again' }).isDisabled(), true)
  const waiting = await page.locator('#root').innerText()
  assert.match(
    waiting,
    /I paused because this step ran many times in a short while\. You can try again from /
  )
  // One explanation only: the agent's lead in above the card says no reason that could contradict the card.
  assert.doesNotMatch(waiting, /Something went wrong on our side|Tracy team can see/)
  await mount(page, 'retry', { results: [PAUSED_OVER] })
  assert.equal(await page.getByRole('button', { name: 'Try again' }).isDisabled(), false)
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByText('Starting over discards what Tracy has gathered so far').waitFor()
  await page.getByRole('button', { name: 'Cancel' }).click()
  assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 1)
  assert.equal(
    (await page.evaluate(() => window.probe.log())).requests.length,
    0,
    'nothing sent before a yes'
  )
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('button', { name: 'Discard and start over' }).click()
  await page.waitForFunction(() => window.probe.log().requests.some((r) => r.navigate))
  assert.deepEqual((await page.evaluate(() => window.probe.log())).requests, [
    { url: '/api/build-draft/start-over' },
    { navigate: '/new/build' }
  ])
  // A step that runs again takes the card away.
  await mount(page, 'retry', { results: [STOPPED], engine: { step: 'compose', state: 'running' } })
  await page.waitForFunction(() => !document.querySelector('[data-build-stop]'))
  await page.close()
})

test('a server line that ends with a full stop is shown with one full stop, never two', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'plan', { plan: PLAN, revised: REVISED_FULL_STOPS })
  const items = await page.getByRole('region', { name: 'What changed' }).locator('li').allInnerTexts()
  assert.ok(
    items.includes('You want the opening hours on every page (2). The plan has no place for them.'),
    items.join(' | ')
  )
  assert.doesNotMatch(await page.locator('#root').innerText(), /\.\./)
  await page.close()
})

test('after a change request only the newest turn draws the plan card, and none while the review bar shows', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  const cards = (turn) =>
    page.locator(turn ? `[data-turn="${turn}"] article.tv-bc-plan` : 'article.tv-bc-plan').count()
  await mount(page, 'turns', { plan: PLAN })
  assert.equal(await cards(1), 1, 'the turn that made the plan draws it')
  assert.equal(await cards(), 1)
  await page.evaluate(() => window.probe.nextPlan())
  await page.waitForFunction(
    () => document.querySelectorAll('[data-turn="2"] article.tv-bc-plan').length === 1
  )
  assert.equal(await cards(1), 0, 'the earlier turn, drawn once and kept, gives its card up')
  assert.equal(await cards(), 1, 'exactly one plan card in the chat')
  await mount(page, 'turns', { plan: PLAN, reviewing: true })
  assert.equal(await cards(), 0, 'while the review bar shows, the bar draws the one card')
  await mount(page, 'review', { plan: PLAN })
  assert.equal(await cards(), 1)
  await page.close()
})

test('review bar: typing a change and pressing Enter sends it, then answers Change the plan', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'review', { plan: PLAN, say: true })
  const line = page.getByRole('textbox', { name: 'Or describe the change you want' })
  await line.fill('Make the tagline shorter')
  await line.press('Enter')
  await page.waitForFunction(() => window.probe.log().decisions.length === 1)
  const log = await page.evaluate(() => window.probe.log())
  assert.deepEqual(log.sent, ['Make the tagline shorter'])
  assert.deepEqual(log.decisions, [
    { answers: [{ id: `plan-review:${PLAN.id}:${PLAN.revision}`, selected: ['Change the plan'] }] }
  ])
  assert.equal(await line.inputValue(), '', 'the line is emptied once the words went out')
  // Change the plan with an empty line answers at once and sends no message.
  await mount(page, 'review', { plan: PLAN, say: true })
  await page.getByRole('button', { name: 'Change the plan' }).click()
  await page.waitForFunction(() => window.probe.log().decisions.length === 1)
  assert.deepEqual((await page.evaluate(() => window.probe.log())).sent, [])
  await page.close()
})

test('review bar: words the chat did not take stay typed, and the review is not answered', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'review', { plan: PLAN, say: true, sendResult: 'failed' })
  const line = page.getByRole('textbox', { name: 'Or describe the change you want' })
  await line.fill('Add a prices page')
  await page.getByRole('button', { name: 'Change the plan' }).click()
  await page.getByText('Your answer was not sent. Try again.').waitFor()
  assert.equal(await line.inputValue(), 'Add a prices page')
  assert.deepEqual((await page.evaluate(() => window.probe.log())).decisions, [])
  await page.close()
})

test('review bar and its plan card stay inside the chat column at phone, tablet and desktop width', async () => {
  for (const width of [390, 768, 1280]) {
    const theme = width === 390 ? 'dark' : 'light'
    const { page } = await open(browser, { width, height: 900 }, theme, code)
    await mount(page, 'review-column', { plan: PLAN })
    await page.waitForSelector('.tv-bc-review')
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${TAG}-review-column-${width}-${theme}.png`) })
    const edges = await page.evaluate(() => {
      const box = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect()
        return { left: r.left, right: r.right }
      }
      return {
        column: box('.dsh-column'),
        frame: box('.tv-bc-review-frame'),
        card: box('article.tv-bc-plan'),
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }
    })
    for (const part of ['frame', 'card']) {
      assert.ok(
        edges[part].left >= edges.column.left - 1 && edges[part].right <= edges.column.right + 1,
        `at ${width} the ${part} spans ${edges[part].left} to ${edges[part].right}, the column ${edges.column.left} to ${edges.column.right}`
      )
    }
    assert.ok(edges.scroll <= 0, `horizontal page scroll of ${edges.scroll}px at ${width}`)
    await page.close()
  }
})
