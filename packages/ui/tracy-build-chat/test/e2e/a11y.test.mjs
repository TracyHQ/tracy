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
import { DSH_COLUMN_CSS } from './dsh-column.css.mjs'
import {
  STAGES,
  stageDocuments,
  TEMPLATES
} from '../../../../core/tracy-core/test/fixtures/build-chat/stages.mjs'

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
const run = (name) => scenarioOf(name).runs.at(-1)
// What the engine said, as `tracy_build` answers it (#609): a stop the owner may have run again, and one that may not.
const STOPPED = { stopped: true, say: 'Stopped.', step: 'compose', rerun: true }
const STOPPED_FOR_GOOD = { stopped: true, say: 'Stopped.' }
const MESSAGES = [
  { role: 'user', text: 'Build a website for my tennis club. https://sunrise-tennis.example' },
  { role: 'assistant', text: 'I found 4 services, 38 photos and 6 reviews. Two quick questions.' },
  { role: 'user', text: 'Make the tagline shorter.' }
]

/** Every state drawn: name, fixture state, data. */
const STATES = [
  ['template', 'template', { templates: TEMPLATES }],
  ['template-chosen', 'template', { templates: TEMPLATES, chosen: 'ja-boxing' }],
  ['template-none', 'template', { templates: [] }],
  ['plan', 'plan', { plan: PLAN }],
  ['plan-dark-accent', 'plan', { plan: darkAccentPlan }],
  ['plan-drawn-logo', 'plan', { plan: drawnLogoPlan, lookSources: DRAWN }],
  ['plan-revised', 'plan', { plan: PLAN, revised: REVISED }],
  ['plan-left-out-many', 'plan', { plan: manyLeftOut }],
  ['review', 'review', { plan: PLAN }],
  ['building', 'progress', { run: run('building') }],
  ['done', 'progress', { run: run('done') }],
  ['could-not-finish', 'progress', { run: run('could-not-finish') }],
  ['cancelled', 'progress', { run: run('cancelled') }],
  ['working', 'working', {}],
  ['try-again', 'retry', { results: [STOPPED] }],
  ['try-again-second', 'retry', { results: [STOPPED, STOPPED] }],
  ['try-again-no-rerun', 'retry', { results: [STOPPED_FOR_GOOD] }],
  ['try-again-after-two-retries', 'retry', { results: [STOPPED, STOPPED, STOPPED] }],
  ['try-again-build-locked', 'retry', { results: [STOPPED], run: run('building') }],
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

test('left out: six lines and Show all, expanded in place, with its state exposed', async () => {
  const { page } = await open(browser, VIEWPORTS[1], 'light', code)
  await mount(page, 'plan', { plan: manyLeftOut })
  const card = page.getByRole('article', { name: 'Sunrise Tennis Club site plan' })
  const lines = card.locator('.tv-bc-dropped li')
  // 12 photos collapse to one line, so 8 lines in all: six show first.
  assert.equal(await lines.count(), 6)
  const more = card.getByRole('button', { name: 'Show all (8)' })
  assert.equal(await more.getAttribute('aria-expanded'), 'false')
  assert.match(await lines.first().innerText(), /12 photos/)
  await more.focus()
  await page.keyboard.press('Enter')
  assert.equal(await lines.count(), 8)
  const fewer = card.getByRole('button', { name: 'Show fewer' })
  assert.equal(await fewer.getAttribute('aria-expanded'), 'true')
  assert.equal(await focused(page), 'Show fewer', 'focus stays on the control')
  await page.keyboard.press('Space')
  assert.equal(await lines.count(), 6)
  // Six or fewer lines: no control.
  await mount(page, 'plan', { plan: PLAN })
  assert.equal(await page.getByRole('button', { name: /Show all/ }).count(), 0)
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

test('working line sits in the message column of dsh at phone, tablet and desktop width', async () => {
  for (const width of [390, 768, 1280]) {
    const theme = width === 390 ? 'dark' : 'light'
    const { page } = await open(browser, { width, height: 800 }, theme, code)
    await mount(page, 'dsh-column', {})
    await page.waitForSelector('[data-build-working]')
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${TAG}-dock-column-${width}-${theme}.png`) })
    const edges = await page.evaluate(() => {
      const box = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect()
        return { left: r.left, right: r.right }
      }
      return { message: box('.dsh-column'), dock: box('.tv-bc-dock') }
    })
    assert.ok(
      Math.abs(edges.dock.left - edges.message.left) <= 1,
      `at ${width} the working line starts at ${edges.dock.left}, the message column at ${edges.message.left}`
    )
    assert.ok(
      Math.abs(edges.dock.right - edges.message.right) <= 1,
      `at ${width} the working line ends at ${edges.dock.right}, the message column at ${edges.message.right}`
    )
    await page.close()
  }
})

test('Try again: reached by Tab, pressed with Space, one fixed message, disabled while it goes', async () => {
  const { page } = await open(browser, VIEWPORTS[0], 'light', code)
  await mount(page, 'retry', { results: [STOPPED] })
  await page.keyboard.press('Tab')
  assert.equal(await focused(page), 'Try again')
  assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 1)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.probe.log().sent.length === 1)
  assert.deepEqual((await page.evaluate(() => window.probe.log())).sent, ['Please try again.'])
  assert.equal(await page.getByRole('button', { name: 'Try again' }).isDisabled(), true)
  // A second press cannot send a second message.
  await page
    .getByRole('button', { name: 'Try again' })
    .click({ force: true })
    .catch(() => {})
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
  // The stop sentence stays when the button goes.
  assert.match(await page.locator('#root').innerText(), /Something went wrong on our side/)
  await page.close()
})
