#!/usr/bin/env node
/**
 * The wizard's inline customization page, driven in a real browser.
 * Only window.fetch is mocked; questions, alerts, styles and navigation use production components.
 */

import assert from 'node:assert/strict'
import { goToStep, submitCreate } from './wizard-navigation.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(here, '..', '..', '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

let outDir
let server
let base
let browser

before(async () => {
  // A task that keeps its scratch files beside its logs names the folder; otherwise the system's.
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tas-create-platform-'))
  // The plugin's real stylesheet, built the way `scripts/build-client.mjs` builds it. The questions
  // sheet is an absolute overlay over the panel: with no CSS it is not an overlay at all.
  const cssFile = path.join(outDir, 'add-site.css')
  execFileSync(
    process.execPath,
    [
      path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
      '--input',
      path.join(pkgRoot, 'src', 'client', 'add-site.css'),
      '--output',
      cssFile
    ],
    { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'create-platform-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    // `.module.css` too: the `via=sidebar` fixture bundles better-sidebar's real service, whose diff
    // view imports a CSS module the tab under test never renders.
    loader: { '.css': 'empty', '.module.css': 'empty' },
    // `apply()` injects this stylesheet, as it does in dsh.
    define: { __TAILWIND_CSS__: JSON.stringify(readFileSync(cssFile, 'utf8')) },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  // The creation workspace, where every press lands (`/new/`).
  writeFileSync(
    path.join(outDir, 'page.html'),
    // The side pane in dsh has the height of the window, and the Add site tab fills it: so does the fixture's root here,
    // or the panel grows with its content and the sheet, sized to the panel, could not be measured against the window.
    '<!doctype html><html><head><meta charset="utf-8"><base href="/new/">' +
      '<style>html,body{height:100%;margin:0}#root{height:100%}</style></head>' +
      '<body><div id="root"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0] === '/app.js' ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * Open the fixture page on `path` (default `/new/s/<session>`) with `query`, wait for the Add site
 * tab type to register, run `prepare` before load (cookies, storage), then `run`.
 */
async function withPage(query, run, { prepare, path: at = '/new/s/fixture-session' } = {}) {
  const context = await browser.newContext()
  try {
    if (prepare) await prepare(context)
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.goto(`${base}${at}${query ? `?${query}` : ''}`)
    await page.waitForFunction(() => window.__harness?.registered === true, null, { timeout: 8000 })
    await run(page)
    assert.deepEqual(pageErrors, [], 'no uncaught errors in the page')
  } finally {
    await context.close()
  }
}

/** The wizard's form is in sight and its start card has landed. */
async function formReady(page) {
  await goToStep(page, 'design')
  await page.locator('[data-start-template-gallery="1"]').waitFor({ timeout: 5000 })
}

/** Type a name, press Create site, and return the body the create door received. */
async function create(page, label) {
  await submitCreate(page, label)
  await page.waitForFunction(() => window.__harness.posts.length === 1, null, { timeout: 5000 })
  const payload = await page.evaluate(() => window.__harness.posts[0])
  assert.match(payload.buildId, /^[0-9a-f-]{36}$/)
  // The opening of the form this press came from (usage, #1415): one id per opening, sent with Create.
  assert.match(payload.wizardId, /^[0-9a-f-]{36}$/)
  const { buildId: _buildId, wizardId: _wizardId, ...fields } = payload
  return fields
}

/** Press a card the way `buildOpener` does. */
const press = async (page, card, platform, opts) => {
  const building = (await page.locator('[data-wizard-step]').count()) === 0
  await page.evaluate(([c, p, o]) => window.__harness.press(c, p, o), [card, platform, opts ?? {}])
  if (!building && !opts?.sessionId)
    await page.locator('[data-wizard-current="address"]').waitFor({ timeout: 5000 })
}

/** The selected starting design card, once it names `text`. */
async function names(page, text) {
  await goToStep(page, 'design')
  await page.waitForFunction(
    (want) =>
      document.querySelector('[data-start-template][aria-pressed="true"]')?.textContent?.includes(want),
    text,
    { timeout: 5000 }
  )
}

const card = (page) => page.locator('[data-wizard-step="customize"]')
/** The Customize your site page (option C, 14/10/2026: a page of its own in the tab, no longer a sheet). */
const sheet = (page) => page.locator('[data-questions-page="1"]')
const statusOf = (page) => page.locator('[data-wizard-footer] [data-ask-status="1"]')

/** All pending states stay inline and fit the page in either theme, including a narrow viewport. */
async function inlineState(page, state) {
  assert.equal(await card(page).locator('[data-questions-card], .tas-qcard').count(), 0)
  for (const width of [1000, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((dark) => {
        document.documentElement.toggleAttribute('data-ds-dark-theme', dark)
        document.body.toggleAttribute('data-ds-dark-theme', dark)
      }, theme === 'dark')
      const content = card(page).locator('.tas-questions-alert, .tas-questions-loading')
      assert.equal(
        await content.evaluate((el) =>
          [el, ...el.querySelectorAll('div, span')].every(
            (child) => child.scrollWidth <= child.clientWidth + 1
          )
        ),
        true,
        state + ' wraps at ' + width + ' in ' + theme
      )
      if (process.env.TRACY_TEST_ARTIFACT_DIR)
        await page.screenshot({
          path: path.join(process.env.TRACY_TEST_ARTIFACT_DIR, state + '-' + width + '-' + theme + '.png')
        })
    }
  }
}

/** The card is drawn with its questions read. */
async function cardReady(page) {
  await goToStep(page, 'customize')
  await sheet(page).waitFor({ timeout: 5000 })
}

/** Open the page from the card. */
async function openSheet(page) {
  await cardReady(page)
  await sheet(page).waitFor({ timeout: 5000 })
}

/** The titles of the question cards the sheet draws, the Recommended tag included where there is one. */
const labels = (page) => sheet(page).locator('[data-ask-item] .ask-card-t').allTextContents()

/** One question's card. */
const cardOf = (page, id) => sheet(page).locator(`[data-ask-item="${id}"]`)

/** Wait for one question's body (every question is open on the page; the helper keeps the old call sites). */
async function openCard(page, id) {
  const one = cardOf(page, id)
  if ((await one.getAttribute('data-ask-card')) === 'closed') await one.locator('.ask-card-btn').click()
  await one.locator('.ask-card-p').waitFor({ state: 'visible', timeout: 2000 })
}

/** Press Done and wait for the page to go. */
async function done(page) {
  await page.locator('[data-wizard-continue]').click()
  await sheet(page).waitFor({ state: 'detached', timeout: 5000 })
  await goToStep(page, 'design')
}

test('customization is a separate optional page and reads the chosen template', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    assert.equal(await sheet(page).count(), 0)
    await openSheet(page)
    assert.equal(await card(page).locator('[data-questions-card]').count(), 0)
    assert.deepEqual(await labels(page), [
      'Company name',
      'What does the company do?',
      'Site language',
      'Sector'
    ])
    assert.equal(await sheet(page).getByText('Contractor licence number').count(), 0)
    assert.match(await statusOf(page).innerText(), /^0 of 4 answered$/)
    assert.equal(await page.getByRole('heading', { name: 'Customize your site' }).count(), 1)
    assert.equal(await page.locator('[data-wizard-skip]').isVisible(), true)
    assert.equal(await page.locator('[data-start-template-gallery="1"]').count(), 0)
    assert.equal(await page.getByRole('textbox', { name: 'Site address', exact: true }).count(), 0)
    const call = new URL(await page.evaluate(() => window.__harness.questionCalls.at(-1)), 'http://x')
    assert.equal(call.searchParams.get('design'), 'tracy-business')
    assert.ok(call.searchParams.get('platform'))
  })
})

test('another template asks other questions, and with nothing flagged the sheet says how the answers are used', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await press(page, 'tracy', 'wordpress')
    await names(page, 'Tracy Base')
    await openSheet(page)
    assert.deepEqual(await labels(page), ['Business name', 'One line about your business'])
    assert.match(await statusOf(page).innerText(), /^0 of 2 answered$/)
  })
})

for (const way of ['Continue', 'Back'])
  test(`${way} preserves optional answers and creates no site`, async () => {
    await withPage('start=plus', async (page) => {
      await formReady(page)
      await openSheet(page)
      await sheet(page).getByLabel('Company name').fill('Golden Crust')
      await sheet(page).getByRole('radio', { name: 'Bakery' }).click()
      await page.locator(way === 'Continue' ? '[data-wizard-continue]' : '[data-wizard-back]').click()
      assert.equal(await sheet(page).count(), 0)
      assert.equal(await page.evaluate(() => window.__harness.posts.length), 0)
      await openSheet(page)
      assert.equal(await sheet(page).getByLabel('Company name').inputValue(), 'Golden Crust')
      assert.match(await statusOf(page).innerText(), /^2 of 4 answered$/)
    })
  })

test('Create site sends the answers with the hash of the set they answer; a hidden answer does not travel', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await openSheet(page)
    await sheet(page).getByRole('radio', { name: 'Construction' }).click()
    await openCard(page, 'licence')
    await sheet(page).getByLabel('Contractor licence number').fill('LIC-77')
    await sheet(page).getByRole('radio', { name: 'Bakery' }).click()
    assert.equal(await sheet(page).getByText('Contractor licence number').count(), 0)
    await openCard(page, 'name')
    await sheet(page).getByLabel('Company name').fill('Golden Crust')
    await openCard(page, 'about')
    await sheet(page).getByLabel('What does the company do?').fill('We bake bread every morning')
    await done(page)
    await submitCreate(page, 'applied-brief')
    await page.waitForFunction(() => window.__harness.posts.length === 1, null, { timeout: 5000 })
    const { brief } = await page.evaluate(() => window.__harness.posts[0])
    assert.deepEqual(brief, {
      answers: { name: 'Golden Crust', about: 'We bake bread every morning', sector: 'bakery' },
      questionnaire: 'a'.repeat(64)
    })
  })
})

test('nothing answered: Create site makes the site at once with no brief, as it always did', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await cardReady(page)
    const fields = await create(page, 'asked-later')
    assert.equal('brief' in fields, false)
    assert.equal(fields.design, 'tracy-business')
  })
})

test('an answer emptied again is no answer: no brief travels', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await openSheet(page)
    await openCard(page, 'name')
    await sheet(page).getByLabel('Company name').fill('Golden Crust')
    await sheet(page).getByLabel('Company name').fill('   ')
    await done(page)
    const fields = await create(page, 'emptied')
    assert.equal('brief' in fields, false)
  })
})

test('loading questions renders inline without a summary card, then shows all questions', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => window.__harness.holdQuestions())
    await press(page, 'tracy', 'wordpress')
    await goToStep(page, 'customize')
    assert.equal(await card(page).locator('[data-questions-card]').count(), 0)
    await card(page).getByRole('status').filter({ hasText: 'Loading questions' }).waitFor({ timeout: 5000 })
    await inlineState(page, 'loading')
    await page.evaluate(() => window.__harness.releaseQuestions())
    await cardReady(page)
  })
})

test('failed questions render an inline alert without a summary card and Skip creates without a brief', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => {
      window.__harness.questionsAnswer = { status: 503, body: { code: 'UNAVAILABLE' } }
    })
    await press(page, 'tracy-business', 'wordpress')
    await names(page, 'Tracy Business')
    await goToStep(page, 'customize')
    await card(page).getByRole('alert').waitFor({ timeout: 5000 })
    assert.equal(await card(page).locator('[data-questions-card]').count(), 0)
    assert.equal(await page.locator('[data-wizard-skip]').isVisible(), true)
    assert.match(await card(page).innerText(), /The questions could not load\./)
    await inlineState(page, 'failed')
    assert.equal(
      await card(page)
        .getByRole('button', { name: 'Try again' })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgba(0, 0, 0, 0)'
    )
    await page.locator('[data-wizard-skip]').click()
    const fields = await create(page, 'no-questions')
    assert.equal('brief' in fields, false)
  })
})

// #1403 item 7: with no text model the answers were sent anyway, and the Apply run failed minutes after the build.
test('unwritable questions render a warning without a summary card and Continue creates without a brief', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => {
      window.__harness.questionsAnswer = {
        status: 200,
        body: { ...window.__harness.served(''), answersWritten: false }
      }
    })
    await press(page, 'tracy-business', 'wordpress')
    await goToStep(page, 'customize')
    assert.equal(await card(page).locator('[data-questions-card]').count(), 0)
    const warning = card(page).getByRole('alert')
    await warning.waitFor({ timeout: 5000 })
    assert.match(await warning.innerText(), /Tracy cannot write answers into a new site right now\./)
    assert.match(
      await warning.innerText(),
      /This site is built with the template's own text\. You can change it later in chat\./
    )
    assert.equal(await page.locator('[data-wizard-skip]').count(), 0)
    assert.equal(await page.locator('[data-wizard-continue]').innerText(), 'Continue')
    await inlineState(page, 'unwritable')
    assert.equal(await card(page).getByRole('textbox').count(), 0, 'nothing to answer')
    const fields = await create(page, 'no-model')
    assert.equal('brief' in fields, false)
  })
})

test('Try again on the inline failure reads the questions again and renders them in full', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => {
      window.__harness.questionsAnswer = { status: 503, body: { code: 'UNAVAILABLE' } }
    })
    await press(page, 'tracy-business', 'wordpress')
    await goToStep(page, 'customize')
    await card(page).getByRole('alert').waitFor({ timeout: 5000 })
    assert.equal(await card(page).locator('[data-questions-card]').count(), 0)
    assert.equal(await page.locator('[data-wizard-skip]').isVisible(), true)
    await page.evaluate(() => {
      window.__harness.questionsAnswer = null
    })
    const calls = await page.evaluate(() => window.__harness.questionCalls.length)
    await card(page).getByRole('button', { name: 'Try again' }).click()
    await cardReady(page)
    assert.equal(await page.evaluate(() => window.__harness.questionCalls.length), calls + 1)
  })
})

test('a template no content contract seals shows no card and sends no brief', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await press(page, 'unsealed-demo', 'joomla')
    await names(page, 'Unsealed demo')
    await page.waitForTimeout(300)
    await goToStep(page, 'customize')
    assert.equal(await card(page).getByRole('textbox').count(), 0, 'nothing to customize')
    const fields = await create(page, 'no-promise')
    assert.equal(fields.design, 'unsealed-demo')
    assert.equal('brief' in fields, false)
  })
})

test('a change of template keeps the answers the new set still asks for, says so, and drops the rest', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await openSheet(page)
    await openCard(page, 'name')
    await sheet(page).getByLabel('Company name').fill('Golden Crust')
    await sheet(page).getByRole('radio', { name: 'Bakery' }).click()
    await done(page)
    await press(page, 'tracy', 'wordpress')
    await names(page, 'Tracy Base')
    await cardReady(page)
    assert.equal(await sheet(page).getByLabel('Business name').inputValue(), 'Golden Crust')
    assert.equal(
      await sheet(page).locator('[data-questions-note="1"]').innerText(),
      'Answers kept for this design: 1. Answers that no longer apply: 1.'
    )
    await done(page)
    const { brief } = await create(page, 'kept-answers')
    assert.deepEqual(brief, { answers: { name: 'Golden Crust' }, questionnaire: 'b'.repeat(64) })
  })
})

test('a short language list is drawn as pills, starts with none chosen, and what is picked travels', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await openSheet(page)
    await openCard(page, 'languages')
    const languages = sheet(page).getByRole('group', { name: 'Site language' })
    assert.deepEqual(await languages.getByRole('button').allTextContents(), [
      'English',
      'Russian',
      'Vietnamese'
    ])
    assert.equal(await languages.locator('[aria-pressed="true"]').count(), 0, 'nothing is chosen for them')
    await languages.getByRole('button', { name: 'Vietnamese' }).click()
    await languages.getByRole('button', { name: 'English' }).click()
    await done(page)
    const { brief } = await create(page, 'speaks')
    assert.deepEqual(brief.answers, { languages: ['vi', 'en'] })
  })
})

test('a long language list is a search box with its words translated, and what is picked travels', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await press(page, 'long-languages', 'joomla')
    await names(page, 'Long languages')
    await openSheet(page)
    await openCard(page, 'languages')
    const languages = sheet(page).locator('[data-ask-item="languages"]')
    assert.equal(await languages.getByRole('group').count(), 0)
    const search = languages.getByPlaceholder('Choose a language...')
    await search.click()
    assert.doesNotMatch(
      await sheet(page).innerText(),
      /\blang\.[a-z]+\b/,
      'no untranslated key reaches the customer'
    )
    await search.fill('viet')
    await languages.getByRole('button', { name: 'Vietnamese' }).click()
    assert.ok(
      await languages.getByPlaceholder('Add another…').count(),
      'the box says what pressing does next'
    )
    await languages.getByPlaceholder('Add another…').fill('fren')
    await languages.getByRole('button', { name: 'French' }).click()
    await done(page)
    const { brief } = await create(page, 'many-tongues')
    assert.deepEqual(brief.answers, { languages: ['vi', 'fr'] })
  })
})

test('a long questionnaire keeps the wizard footer visible while the page scrolls', async () => {
  await withPage('start=plus', async (page) => {
    await page.setViewportSize({ width: 1280, height: 520 })
    await formReady(page)
    await openSheet(page)
    await sheet(page).getByRole('radio', { name: 'Construction' }).click()
    const next = page.locator('[data-wizard-continue]')
    const before = await next.boundingBox()
    assert.ok(before.y >= 0 && before.y + before.height <= 520)
    await cardOf(page, 'languages').scrollIntoViewIfNeeded()
    const after = await next.boundingBox()
    assert.ok(after.y >= 0 && after.y + after.height <= 520)
    assert.equal(await card(page).evaluate((el) => el.scrollWidth <= el.clientWidth), true)
  })
})

/** The long-text question of Tracy Business ("What does the company do?") and its box. */
const about = (page) => sheet(page).locator('[data-ask-item="about"]')

/** Open the sheet with the long-text question's card open. */
async function openAbout(page) {
  await openSheet(page)
  await openCard(page, 'about')
}
const aboutBox = (page) => sheet(page).getByLabel('What does the company do?')

test('AI rewrite is offered on the long-text question and not on the others; Undo puts the words back', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await openAbout(page)
    const rewrite = sheet(page).getByRole('button', { name: 'Rewrite', exact: true })
    assert.equal(await rewrite.count(), 1, 'one rewrite button in the whole sheet')
    assert.equal(
      await about(page).getByRole('button', { name: 'Rewrite', exact: true }).count(),
      1,
      'under the long text'
    )
    assert.equal(await rewrite.isDisabled(), false, 'an empty box can be rewritten: the answer is a sample')
    await aboutBox(page).fill('we bake bread')
    await rewrite.click()
    await about(page).getByRole('button', { name: 'Undo' }).waitFor({ timeout: 5000 })
    assert.equal(await aboutBox(page).inputValue(), 'In clearer words: we bake bread')
    assert.deepEqual(await page.evaluate(() => window.__harness.rewrites), ['we bake bread'])
    await about(page).getByRole('button', { name: 'Rewrite', exact: true }).click()
    await page.waitForFunction(() => window.__harness.rewrites.length === 2, null, { timeout: 5000 })
    assert.deepEqual(await page.evaluate(() => window.__harness.agains), [false, true])
    await about(page).getByRole('button', { name: 'Undo' }).click()
    assert.equal(await aboutBox(page).inputValue(), 'we bake bread', 'the customer’s own words are back')
  })
})

for (const [status, code, said] of [
  [429, 'RATE_LIMITED', 'That is enough rewrites for now. Try again in a little while.'],
  [503, 'MODEL_NOT_CONFIGURED', 'AI rewrite is not switched on here yet.']
])
  test(`a rewrite the door refuses with ${status} says so beside the button and leaves the words as typed`, async () => {
    await withPage('start=plus', async (page) => {
      await formReady(page)
      await page.evaluate(
        ([s, c]) => {
          window.__harness.rewriteAnswer = { status: s, body: { code: c } }
        },
        [status, code]
      )
      await openAbout(page)
      await aboutBox(page).fill('we bake bread')
      await sheet(page).getByRole('button', { name: 'Rewrite', exact: true }).click()
      await about(page).getByText(said).waitFor({ timeout: 5000 })
      assert.equal(await aboutBox(page).inputValue(), 'we bake bread', 'the draft is untouched')
      assert.equal(await about(page).getByRole('button', { name: 'Undo' }).count(), 0, 'nothing to undo')
      assert.equal(
        await sheet(page).getByRole('button', { name: 'Rewrite', exact: true }).isDisabled(),
        false
      )
    })
  })

test('a rewrite that comes back after the customer edited the text never overwrites the edit', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => window.__harness.holdRewrites())
    await openAbout(page)
    await aboutBox(page).fill('we bake bread')
    await sheet(page)
      .getByRole('button', { name: /Rewrite|Rewriting/ })
      .click()
    await page.waitForFunction(() => window.__harness.rewrites.length === 1, null, { timeout: 5000 })
    await aboutBox(page).fill('we bake bread and cakes')
    await page.evaluate(() => window.__harness.releaseRewrites())
    await sheet(page).getByRole('button', { name: 'Rewrite', exact: true }).waitFor({ timeout: 5000 })
    await page.waitForTimeout(200)
    assert.equal(await aboutBox(page).inputValue(), 'we bake bread and cakes', 'the edit stays')
    assert.equal(await about(page).getByRole('button', { name: 'Undo' }).count(), 0)
    await done(page)
    const { brief } = await create(page, 'late-rewrite')
    assert.deepEqual(brief.answers, { about: 'we bake bread and cakes' })
  })
})

test('a refused address keeps the answers: the next press sends them', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await openSheet(page)
    await openCard(page, 'name')
    await sheet(page).getByLabel('Company name').fill('Golden Crust')
    await done(page)
    await create(page, 'taken-domain')
    await page.getByText('That site address is already in use.', { exact: true }).waitFor()
    await openSheet(page)
    assert.match(await statusOf(page).innerText(), /^1 of 4 answered$/)
    assert.equal(await sheet(page).getByLabel('Company name').inputValue(), 'Golden Crust')
    await submitCreate(page, 'free-domain')
    await page.waitForFunction(() => window.__harness.posts.length === 2)
    const { brief } = await page.evaluate(() => window.__harness.posts[1])
    assert.deepEqual(brief.answers, { name: 'Golden Crust' })
  })
})

// 🔒 In dsh every plugin's stylesheet is injected into the same cascade layer, in the order the plugins load, so another
// plugin's copy of a base utility can come AFTER this plugin's own and, at equal specificity, win (measured 03/10/2026
// with the old popup). The page's place in the panel must not depend on that order.
test("the page keeps its place in the panel when another plugin's stylesheet loads after this one", async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.addStyleTag({
      content:
        '@layer utilities{.w-full{width:100%}.absolute{position:absolute}.h-full{height:100%}.relative{position:relative}}'
    })
    await page.setViewportSize({ width: 360, height: 640 })
    await page.waitForTimeout(150)
    await openSheet(page)
    const frame = await page.locator('[data-add-site-form="1"]').boundingBox()
    const box = await sheet(page).boundingBox()
    assert.ok(box.width <= 360, 'never wider than a phone')
    assert.ok(box.y >= frame.y && box.width <= frame.width + 1, 'stays within the wizard panel')
    assert.equal(
      await sheet(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
      'no sideways scroll'
    )
  })
})

function stringsOf(lang) {
  const dir = lang === 'vi' ? 'tracy-locale-vi/vi' : `tracy-locales/${lang}`
  const all = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages/locale', dir, 'tracy-add-site.json'), 'utf8')
  )
  return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith('sheet_')))
}

for (const width of [260, 320, 380, 480, 900])
  test(`at ${width}px the optional page and its answered count stay inside the panel`, async () => {
    await withPage('start=plus', async (page) => {
      await page.setViewportSize({ width, height: 800 })
      await formReady(page)
      await openSheet(page)
      await sheet(page)
        .getByLabel('Company name')
        .fill('Golden Crust Bakery and Pastry House of the Old Town')
      await sheet(page).getByRole('radio', { name: 'Bakery' }).click()
      const status = statusOf(page)
      assert.match(await status.innerText(), /2 of 4/)
      assert.equal(await status.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true)
      assert.equal(await card(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true)
    })
  })

for (const lang of ['de', 'vi', 'fr'])
  for (const width of [260, 320])
    test(`in ${lang} at ${width}px the optional page remains readable without horizontal scroll`, async () => {
      await withPage(
        'start=plus',
        async (page) => {
          await page.setViewportSize({ width, height: 800 })
          await formReady(page)
          await openSheet(page)
          assert.equal(await sheet(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true)
          assert.equal(await statusOf(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true)
        },
        {
          prepare: (context) =>
            context.addInitScript((table) => {
              window.__tasStrings = table
            }, stringsOf(lang))
        }
      )
    })

/** The colour a token resolves to inside the sheet, as the browser computes it. */
const tokenColour = (page, token) =>
  sheet(page).evaluate((root, name) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    root.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }, token)

/** Open the sheet of the template served the seven default questions. */
async function openSeven(page) {
  await formReady(page)
  await press(page, 'local-ja-kinetic', 'joomla')
  await names(page, 'ja_kinetic (local)')
  await openSheet(page)
}

test('the customization heading uses the wizard title and no separate close control', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    const title = page.getByRole('heading', { name: 'Customize your site', exact: true })
    assert.equal(await title.count(), 1)
    assert.equal(await title.evaluate((el) => getComputedStyle(el).fontSize), '20px')
    assert.equal(await sheet(page).getByRole('button', { name: 'Close' }).count(), 0)
    assert.equal(await page.locator('[data-wizard-back]').isVisible(), true)
  })
})

test('every question is open for good: no number, no accordion, the title over its hint and control', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    assert.deepEqual(await labels(page), [
      'Business name',
      'One line about your business',
      'Site language',
      'Tone',
      'Logo',
      'Favicon',
      'Pages'
    ])
    assert.equal(await sheet(page).locator('.ask-card-n').count(), 0, 'no numbers')
    assert.equal(
      await sheet(page).locator('.ask-card-btn, .ask-card-chev').count(),
      0,
      'nothing to open or close'
    )
    for (const id of ['name', 'logo', 'favicon', 'about', 'pages', 'languages', 'tone']) {
      assert.equal(await cardOf(page, id).getAttribute('data-ask-card'), 'open', id)
      assert.equal(await cardOf(page, id).locator('.ask-card-p').isVisible(), true, `${id} shows its body`)
    }
    const look = await cardOf(page, 'name').evaluate((el) => {
      const t = getComputedStyle(el.querySelector('.ask-card-t'))
      const card = getComputedStyle(el)
      return {
        title: `${t.fontSize} ${t.fontWeight}`,
        hint: getComputedStyle(el.querySelector('.ask-card-hint')).fontSize,
        input: Math.round(el.querySelector('input').getBoundingClientRect().height),
        radius: getComputedStyle(el.querySelector('input')).borderTopLeftRadius,
        box: `${card.borderTopWidth} ${card.borderBottomWidth} ${card.backgroundColor}`
      }
    })
    assert.deepEqual(look, {
      title: '13px 500',
      hint: '12px',
      input: 36,
      radius: '8px',
      box: '0px 0px rgba(0, 0, 0, 0)'
    })
    assert.equal(
      await cardOf(page, 'tone').evaluate((el) => getComputedStyle(el).borderBottomWidth),
      '0px',
      'no hairline under the last question'
    )
    assert.ok(
      (await sheet(page).getByLabel('One line about your business').boundingBox()).height >= 64,
      'the long answer is at least 64px'
    )
  })
})

test('answering a question says so in the footer and on the item', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await sheet(page).getByLabel('Business name').fill('Tamarind Bakery')
    assert.equal(await cardOf(page, 'name').getAttribute('data-answered'), '1')
    assert.match(await statusOf(page).innerText(), /^1 of 7 answered$/)
  })
})

test('the wizard tone hint stays inline on one line with its full tooltip', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await openCard(page, 'tone')
    const hint = cardOf(page, 'tone').locator('.ask-card-hint')
    assert.equal(await hint.innerText(), 'How Tracy writes your text')
    assert.equal(await hint.getAttribute('title'), 'How Tracy writes your text')
    assert.equal(await hint.evaluate((el) => getComputedStyle(el).whiteSpace), 'nowrap')
    const lines = await hint.evaluate((el) => Math.round(el.getBoundingClientRect().height / 16))
    assert.equal(lines, 1)
  })
})

test('a field takes keyboard focus as one 1px stroke in the ring colour, never a halo', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    const field = sheet(page).getByLabel('Business name')
    await field.focus()
    await page.waitForTimeout(200)
    const focused = await field.evaluate((el) => {
      const s = getComputedStyle(el)
      return { width: s.borderTopWidth, colour: s.borderTopColor, shadow: s.boxShadow }
    })
    assert.deepEqual(focused, { width: '1px', colour: await tokenColour(page, '--ring'), shadow: 'none' })
  })
})

test('the seven-question sheet sends what was answered, by question id', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await sheet(page).getByLabel('Business name').fill('Tamarind Bakery')
    await openCard(page, 'tone')
    await sheet(page).getByRole('button', { name: 'Warm', exact: true }).click()
    await done(page)
    const { brief } = await create(page, 'seven-questions')
    assert.deepEqual(brief, {
      answers: { name: 'Tamarind Bakery', tone: 'warm' },
      questionnaire: 'e'.repeat(64)
    })
  })
})

// ── The logo and favicon tiles (T08 of TracyHQ/tch#1013, canvas 11-sheet-review-canvas.html, U5 U6 U7) ──────────────

/** CRC-32 of a PNG chunk (type and data). */
function crc32(bytes) {
  let c = ~0
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

/** A real PNG of `width` × `height`, each pixel `[r, g, b, a]` from `pixel(x, y)`. */
function png(width, height, pixel) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 6, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** A wordmark: a band of ink across the middle of a transparent (or white) canvas. */
const mark = (width, height, ink, ground = [0, 0, 0, 0]) =>
  png(width, height, (x, y) =>
    y > height * 0.3 && y < height * 0.7 && x > width * 0.1 && x < width * 0.9 ? ink : ground
  )
const TERRACOTTA = [191, 91, 61, 255]
const WHITE = [255, 255, 255, 255]

/** Open the seven-question sheet with the logo served on these tiles (`variants`), and its logo card. */
async function openBrand(page, variants, { brand = true } = {}) {
  await formReady(page)
  await page.evaluate(
    ([v, on]) => {
      const body = window.__harness.served('local-ja-kinetic')
      const logo = body.questions.find((q) => q.id === 'logo')
      if (v) logo.variants = v
      if (!on) body.questions = body.questions.filter((q) => q.kind !== 'logo' && q.kind !== 'favicon')
      window.__harness.questionsAnswer = { status: 200, body }
    },
    [variants, brand]
  )
  await press(page, 'local-ja-kinetic', 'joomla')
  await names(page, 'ja_kinetic (local)')
  await openSheet(page)
  if (brand) await openCard(page, 'logo')
}

const tile = (page, which) => cardOf(page, 'logo').locator(`.tas-customize-upload[data-tile="${which}"]`)
/** Pick a file for a tile the way a person does, through its hidden file input. */
const pickFile = (page, card, which, name, buffer, mimeType = 'image/png') =>
  cardOf(page, card).locator(`input[data-brand-file="${which}"]`).setInputFiles({ name, mimeType, buffer })

test('logo upload rows follow the served variants with compact 40px previews and visible upload buttons', async () => {
  for (const [variants, want] of [
    [
      ['light', 'dark'],
      ['Light theme', 'Dark theme']
    ],
    [['dark'], ['Dark theme']],
    [['single'], ['Logo']]
  ])
    await withPage('start=plus', async (page) => {
      await openBrand(page, variants)
      const card = cardOf(page, 'logo')
      assert.deepEqual(await card.locator('.tas-customize-upload-copy > span').allTextContents(), want)
      for (const variant of variants) {
        const preview = await tile(page, variant).locator('.tas-customize-upload-preview').boundingBox()
        assert.equal(preview.width, 40)
        assert.equal(preview.height, 40)
        assert.equal(
          await tile(page, variant).getByRole('button', { name: 'Upload', exact: true }).isVisible(),
          true
        )
      }
      assert.match(await card.innerText(), /PNG, transparent, 500px or more/)
      await sheet(page).getByLabel('Business name').fill('Tamarind Bakery')
      for (const variant of variants) {
        const preview = tile(page, variant).locator('.tas-customize-upload-preview')
        assert.equal(await preview.innerText(), '', 'the empty logo does not use business initials')
        assert.equal(await preview.locator('svg.lucide-image[aria-hidden="true"]').count(), 1)
        assert.equal(await preview.locator('svg.text-muted-foreground').count(), 1)
      }
    })
})

test('compact Upload stays visible and does not move its preview on hover or focus', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    const row = tile(page, 'light')
    const button = row.getByRole('button', { name: 'Upload', exact: true })
    await button.scrollIntoViewIfNeeded()
    const geometry = () =>
      row.evaluate((el) => {
        const a = el.getBoundingClientRect()
        const b = el.querySelector('.tas-customize-upload-preview').getBoundingClientRect()
        return { x: b.x - a.x, y: b.y - a.y, width: b.width, height: b.height }
      })
    const before = await geometry()
    await button.hover()
    assert.equal(await button.isVisible(), true)
    await button.focus()
    assert.deepEqual(await geometry(), before)
  })
})

test('an SVG is refused under its tile before any upload, and Create site still works', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    await pickFile(
      page,
      'logo',
      'light',
      'tamarind-logo.svg',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/svg+xml'
    )
    const alert = cardOf(page, 'logo').getByRole('alert')
    await alert.waitFor({ timeout: 3000 })
    assert.equal(
      (await alert.innerText()).replace(/\s+/g, ' ').trim(),
      '✕ tamarind-logo.svg was not added. PNG only.'
    )
    assert.equal(await tile(page, 'light').getAttribute('data-filled'), '0')
    assert.deepEqual(await page.evaluate(() => window.__harness.uploads), [], 'nothing sent')
    await done(page)
    await goToStep(page, 'review')
    assert.equal(await page.getByRole('button', { name: 'Create site' }).isEnabled(), true)
  })
})

test('a picked PNG uploads at once under its tile role and the tile becomes its preview', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    await pickFile(page, 'logo', 'dark', 'tamarind-white.png', mark(1240, 320, WHITE))
    await tile(page, 'dark').locator('img').waitFor({ timeout: 5000 })
    assert.deepEqual(await page.evaluate(() => window.__harness.uploads), ['logo-dark'])
    assert.equal(await tile(page, 'dark').getAttribute('data-filled'), '1')
    assert.equal(await cardOf(page, 'logo').getAttribute('data-answered'), '1')
    assert.equal(await tile(page, 'dark').getByRole('button', { name: 'Replace', exact: true }).count(), 1)
    assert.equal(await tile(page, 'dark').getByRole('button', { name: 'Remove' }).count(), 1)
    assert.equal(
      await cardOf(page, 'logo').getByRole('status').count(),
      0,
      'white ink on near-black reads well'
    )
    // Remove: the tile is empty again and shows the neutral image placeholder.
    await tile(page, 'dark').hover()
    await tile(page, 'dark').getByRole('button', { name: 'Remove' }).click()
    assert.equal(await tile(page, 'dark').getAttribute('data-filled'), '0')
    assert.equal(await cardOf(page, 'logo').getAttribute('data-answered'), '0')
    assert.equal(
      await tile(page, 'dark').locator('.tas-customize-upload-preview svg.lucide-image').count(),
      1
    )
  })
})

test('a logo that blends into its tile is a warning, not a refusal; a white box on the dark tile says so', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    await pickFile(page, 'logo', 'light', 'tamarind-white.png', mark(1240, 320, WHITE))
    const warning = cardOf(page, 'logo').getByRole('status')
    await warning.first().waitFor({ timeout: 5000 })
    assert.equal(
      (await warning.innerText()).replace(/\s+/g, ' ').trim(),
      '! Part of this logo blends into light backgrounds. Use a dark or coloured version.'
    )
    assert.equal(await tile(page, 'light').getAttribute('data-filled'), '1', 'kept')
    await pickFile(page, 'logo', 'dark', 'tamarind-box.png', mark(1240, 420, [17, 17, 17, 255], WHITE))
    await tile(page, 'dark').locator('img').waitFor({ timeout: 5000 })
    assert.deepEqual(
      (await cardOf(page, 'logo').getByRole('status').allInnerTexts()).map((t) =>
        t.replace(/\s+/g, ' ').trim()
      ),
      [
        '! Part of this logo blends into light backgrounds. Use a dark or coloured version.',
        '! This PNG has a solid white background, so it shows as a white box on dark areas. Use a version with a transparent background.'
      ]
    )
    // A coloured logo on the light tile: no warning left for it.
    await pickFile(page, 'logo', 'light', 'tamarind.png', mark(1240, 320, TERRACOTTA))
    await page.waitForFunction(() => window.__harness.uploads.length === 3, null, { timeout: 5000 })
    await page.waitForTimeout(100)
    assert.equal(await cardOf(page, 'logo').getByRole('status').count(), 1)
  })
})

test('a door refusal or failure is said under the tile and leaves the tile as it was', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['single'])
    await page.evaluate(() => {
      window.__harness.brandAnswer = { status: 502, body: { code: 'BRAND_STORE_FAILED' } }
    })
    await pickFile(page, 'logo', 'single', 'tamarind.png', mark(1240, 320, TERRACOTTA))
    const alert = cardOf(page, 'logo').getByRole('alert')
    await alert.waitFor({ timeout: 5000 })
    assert.match(
      await alert.innerText(),
      /tamarind\.png was not added\. This file could not be uploaded\. Try again in a moment\./
    )
    assert.equal(await tile(page, 'single').getAttribute('data-filled'), '0')
    // A logo under 500px on its long side is refused in the browser, with its numbers.
    await pickFile(page, 'logo', 'single', 'tiny.png', mark(240, 62, TERRACOTTA))
    await page.waitForFunction(
      () =>
        document.querySelector('[data-ask-item="logo"] [role="alert"]')?.textContent?.includes('240 × 62'),
      null,
      { timeout: 5000 }
    )
    assert.match(
      await alert.innerText(),
      /This logo is 240 × 62 px\. Use one at least 500 px on its long side so it stays sharp\./
    )
  })
})

test('the favicon uses a compact square preview and preserves PNG validation', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    const card = cardOf(page, 'favicon')
    const preview = card.locator('.tas-customize-upload-preview')
    const square = await preview.boundingBox()
    assert.equal(square.width, 40)
    assert.equal(square.height, 40)
    assert.equal(await preview.locator('img').count(), 0, 'no replacement before upload')
    await pickFile(page, 'favicon', 'favicon', 'tamarind-wide.png', mark(1240, 320, TERRACOTTA))
    const alert = card.getByRole('alert')
    await alert.waitFor({ timeout: 5000 })
    assert.match(await alert.innerText(), /The favicon must be square\. This one is 1240 × 320 px\./)
    await pickFile(
      page,
      'favicon',
      'favicon',
      'tamarind-icon.png',
      png(512, 512, () => TERRACOTTA)
    )
    await preview.locator('img').waitFor({ timeout: 5000 })
    assert.equal(await card.getByRole('alert').count(), 0, 'a good file clears the refusal')
    assert.deepEqual(await page.evaluate(() => window.__harness.uploads), ['favicon'])
  })
})

test('Create site sends the logo tiles and the favicon as upload ids', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    await pickFile(page, 'logo', 'light', 'ink.png', mark(1240, 320, TERRACOTTA))
    await tile(page, 'light').locator('img').waitFor({ timeout: 5000 })
    await pickFile(page, 'logo', 'dark', 'white.png', mark(1240, 320, WHITE))
    await tile(page, 'dark').locator('img').waitFor({ timeout: 5000 })
    await openCard(page, 'favicon')
    await pickFile(
      page,
      'favicon',
      'favicon',
      'icon.png',
      png(512, 512, () => TERRACOTTA)
    )
    await cardOf(page, 'favicon').locator('.tas-customize-upload-preview img').waitFor({ timeout: 5000 })
    assert.equal(await statusOf(page).innerText(), '2 of 7 answered')
    await done(page)
    const { brief } = await create(page, 'brand-files')
    assert.deepEqual(brief, {
      answers: {
        logo: {
          light: '00000000-0000-4000-8000-000000000001',
          dark: '00000000-0000-4000-8000-000000000002'
        },
        favicon: '00000000-0000-4000-8000-000000000003'
      },
      questionnaire: 'e'.repeat(64)
    })
  })
})

test('brand uploads off: the server serves no logo or favicon question and the sheet asks five', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, null, { brand: false })
    assert.deepEqual(await labels(page), [
      'Business name',
      'One line about your business',
      'Site language',
      'Tone',
      'Pages'
    ])
  })
})

test('a change of template keeps the logo: the light logo becomes the single one, its preview kept', async () => {
  await withPage('start=plus', async (page) => {
    await openBrand(page, ['light', 'dark'])
    await pickFile(page, 'logo', 'light', 'ink.png', mark(1240, 320, TERRACOTTA))
    await tile(page, 'light').locator('img').waitFor({ timeout: 5000 })
    await done(page)
    await page.evaluate(() => {
      const body = window.__harness.served('local-ja-kinetic')
      body.questions.find((q) => q.id === 'logo').variants = ['single']
      window.__harness.questionsAnswer = { status: 200, body }
    })
    await press(page, 'long-languages', 'joomla')
    await names(page, 'Long languages')
    await openSheet(page)
    await openCard(page, 'logo')
    assert.equal(await tile(page, 'single').getAttribute('data-filled'), '1')
    assert.equal(
      await tile(page, 'single').locator('img').count(),
      1,
      'the same picture, read in the browser'
    )
    await done(page)
    const { brief } = await create(page, 'brand-carried')
    assert.deepEqual(brief.answers.logo, { single: '00000000-0000-4000-8000-000000000001' })
  })
})

// ── One language, Pages with a locked home, "Start with", Tone (T09 of TracyHQ/tch#1013, canvas U8–U11) ────────────

test('the site language is a select: focus lists every language, typing filters, a pick replaces and wears a tick', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await openCard(page, 'languages')
    const box = cardOf(page, 'languages').getByRole('combobox')
    assert.equal(await box.getAttribute('placeholder'), 'Choose a language...')
    await box.click()
    const list = cardOf(page, 'languages').getByRole('listbox')
    assert.deepEqual(await list.getByRole('option').allTextContents(), [
      'British English',
      'American English',
      'Vietnamese',
      'German',
      'French'
    ])
    await box.fill('germ')
    assert.deepEqual(await list.getByRole('option').allTextContents(), ['German'])
    await list.getByRole('option', { name: 'German' }).click()
    assert.equal(await list.count(), 0, 'a pick closes the list')
    assert.equal(await box.inputValue(), 'German')
    await box.click()
    await box.fill('viet')
    await list.getByRole('option', { name: 'Vietnamese' }).click()
    assert.equal(await box.inputValue(), 'Vietnamese', 'the new pick replaces the old one')
    // Typed key by key (not filled) right after a pick: the picked name must not swallow the new search.
    await box.click()
    await box.pressSequentially('germ')
    assert.equal(await box.inputValue(), 'germ', 'typing after a pick starts over, never "Vietnamesegerm"')
    assert.deepEqual(await list.getByRole('option').allTextContents(), ['German'])
    await page.keyboard.press('Escape')
    assert.equal(await box.inputValue(), 'Vietnamese', 'Escape keeps the pick')
    await box.click()
    assert.equal(await list.getByRole('option', { name: 'Vietnamese' }).getAttribute('aria-selected'), 'true')
    assert.equal(await list.getByRole('option', { name: 'Vietnamese' }).locator('svg').count(), 1, 'the tick')
    await box.fill('zzz')
    assert.equal(await list.innerText(), 'No language matches.')
    // Escape closes the list, not the sheet.
    await page.keyboard.press('Escape')
    assert.equal(await list.count(), 0)
    assert.equal(await sheet(page).count(), 1)
    assert.equal(await box.inputValue(), 'Vietnamese')
    await done(page)
    const { brief } = await create(page, 'one-language')
    assert.deepEqual(brief.answers, { languages: ['vi-vn'] })
  })
})

test("Pages: the template's pages all ticked, home locked with its reason; an untick travels with home", async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await openCard(page, 'pages')
    const chips = cardOf(page, 'pages').getByRole('checkbox')
    assert.deepEqual(
      await cardOf(page, 'pages').locator('.tas-customize-page > span:last-child').allTextContents(),
      ['Home', 'Features', 'Pricing', 'Contact']
    )
    for (const chip of await chips.all()) assert.equal(await chip.getAttribute('aria-checked'), 'true')
    const home = cardOf(page, 'pages').getByRole('checkbox', { name: 'Home' })
    assert.equal(await home.isDisabled(), true)
    assert.equal(await home.locator('..').getAttribute('title'), 'Your site always has a home page.')
    await home.evaluate((el) => el.click())
    assert.equal(await home.getAttribute('aria-checked'), 'true', 'home cannot be unticked')
    assert.equal(
      await cardOf(page, 'pages').getAttribute('data-answered'),
      '0',
      'every page ticked is no answer yet'
    )
    await cardOf(page, 'pages').getByRole('checkbox', { name: 'Pricing' }).click()
    assert.equal(
      await cardOf(page, 'pages').getByRole('checkbox', { name: 'Pricing' }).getAttribute('aria-checked'),
      'false'
    )
    assert.equal(await cardOf(page, 'pages').getAttribute('data-answered'), '1')
    await done(page)
    const { brief } = await create(page, 'pages-picked')
    assert.deepEqual(brief.answers, { pages: ['home', 'features', 'contact'] })
  })
})

test('a change of template ticks every page of the new design again, and says nothing about it', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await openCard(page, 'pages')
    await cardOf(page, 'pages').getByRole('checkbox', { name: 'Pricing' }).click()
    await done(page)
    await page.evaluate(() => {
      const body = window.__harness.served('local-ja-kinetic')
      const pages = body.questions.find((q) => q.id === 'pages')
      pages.options = ['home', 'about', 'pricing']
      pages.optionLabels = { home: 'Home', about: 'About us', pricing: 'Pricing' }
      window.__harness.questionsAnswer = { status: 200, body }
    })
    await press(page, 'long-languages', 'joomla')
    await names(page, 'Long languages')
    await openSheet(page)
    await openCard(page, 'pages')
    for (const chip of await cardOf(page, 'pages').getByRole('checkbox').all())
      assert.equal(await chip.getAttribute('aria-checked'), 'true', await chip.innerText())
    assert.equal(await sheet(page).locator('[data-questions-note="1"]').count(), 0)
  })
})

test('a template with no page list still asks Pages, and says every page is kept', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => {
      const body = window.__harness.served('local-ja-kinetic')
      const pages = body.questions.find((q) => q.id === 'pages')
      delete pages.options
      delete pages.optionLabels
      pages.keepsAllPages = true
      window.__harness.questionsAnswer = { status: 200, body }
    })
    await press(page, 'local-ja-kinetic', 'joomla')
    await names(page, 'ja_kinetic (local)')
    await openSheet(page)
    await openCard(page, 'pages')
    assert.deepEqual((await cardOf(page, 'pages').locator('.ask-card-p').innerText()).split(/\n+/), [
      'Every page of this design is kept.'
    ])
    assert.equal(await cardOf(page, 'pages').getByRole('checkbox').count(), 0, 'nothing to untick')
    assert.equal(await statusOf(page).innerText(), '0 of 7 answered')
  })
})

test('the business description keeps starter chips and Rewrite inside its compact bottom bar', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    await openCard(page, 'about')
    const card = cardOf(page, 'about')
    assert.equal(
      (await card.locator('.tas-customize-textarea-foot').innerText()).replace(/\s+/g, ' ').trim(),
      'What you make Who it is for Where you are What makes you different Rewrite'
    )
    const box = card.getByRole('textbox')
    assert.equal(await box.getAttribute('rows'), '3')
    const height = (await box.boundingBox()).height
    assert.ok(height >= 64 && height < 80, `64px high, got ${height}`)
    await card.getByRole('button', { name: 'What you make' }).click()
    assert.equal(await box.inputValue(), 'We make ')
    // The caret goes into the box.
    await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA', null, { timeout: 2000 })
    await box.pressSequentially('bread')
    await card.getByRole('button', { name: 'Who it is for' }).click()
    assert.equal(await box.inputValue(), 'We make bread. Our customers are ')
    assert.equal(await card.getByRole('button', { name: 'Rewrite', exact: true }).count(), 1)
  })
})

test('Tone uses three segments with tooltip descriptions and deselectable single choice', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    const radio = (name) => cardOf(page, 'tone').getByRole('button', { name, exact: true })
    assert.deepEqual(
      await cardOf(page, 'tone')
        .getByRole('button')
        .evaluateAll((els) => els.map((el) => el.title)),
      ['Clear and direct', 'Friendly and personal', 'Confident and assertive']
    )
    const positions = await cardOf(page, 'tone')
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y))
    assert.equal(new Set(positions).size, 1, 'all three segments share one row')
    await radio('Warm').click()
    await radio('Bold').click()
    assert.deepEqual(
      await cardOf(page, 'tone')
        .getByRole('button')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-pressed'))),
      ['false', 'false', 'true']
    )
    await radio('Bold').click()
    assert.equal(await radio('Bold').getAttribute('aria-pressed'), 'false')
    await radio('Bold').click()
    await done(page)
    const { brief } = await create(page, 'tone-bold')
    assert.deepEqual(brief.answers, { tone: 'bold' })
  })
})

test('the answered counter lives beside Skip in the wizard footer, with no counter at the top', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    const status = statusOf(page)
    assert.equal(await status.innerText(), '0 of 7 answered')
    assert.equal(await sheet(page).locator('[data-ask-status]').count(), 0)
    await sheet(page).getByLabel('Business name').fill('Tamarind')
    assert.equal(await status.innerText(), '1 of 7 answered')
    assert.match(await status.innerText(), /^1 of 7 answered$/)
  })
})

test('the textarea keeps readable typed text and one focus border in both themes', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    const field = cardOf(page, 'about').getByRole('textbox')
    await field.fill('A description that remains readable.')
    for (const dark of [false, true]) {
      await page.evaluate((value) => {
        document.documentElement.toggleAttribute('data-ds-dark-theme', value)
        document.body.toggleAttribute('data-ds-dark-theme', value)
      }, dark)
      await field.focus()
      // Wait for the real condition: the theme switch has recomputed styles, so the
      // textarea colour equals the --foreground token of the active theme. A fixed
      // sleep raced the recompute on slow CI runners.
      await page.waitForFunction(
        (isDark) => {
          const el = document.querySelector('.tas-customize-textarea textarea')
          const probe = document.createElement('span')
          probe.style.color = 'var(--foreground)'
          el.parentElement.append(probe)
          const token = getComputedStyle(probe).color
          probe.remove()
          return (
            document.documentElement.hasAttribute('data-ds-dark-theme') === isDark &&
            getComputedStyle(el).color === token
          )
        },
        dark,
        { timeout: 10000 }
      )
      const styles = await field.evaluate((el) => ({
        color: getComputedStyle(el).color,
        shadow: getComputedStyle(el).boxShadow
      }))
      assert.equal(styles.color, await tokenColour(page, '--foreground'))
      assert.equal(styles.shadow, 'none')
      assert.equal(
        await cardOf(page, 'about')
          .locator('.tas-customize-textarea')
          .evaluate((el) => getComputedStyle(el).borderTopWidth),
        '1px'
      )
    }
  })
})

test('a server-added question lands in More and keeps its answer through Review changes', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => {
      const body = window.__harness.served('local-ja-kinetic')
      body.questions.push({
        id: 'opening-hours',
        kind: 'text',
        step: 3,
        label: 'Opening hours',
        feeds: ['agent']
      })
      window.__harness.questionsAnswer = { status: 200, body }
    })
    await press(page, 'local-ja-kinetic', 'joomla')
    await openSheet(page)
    const more = sheet(page).locator('[data-ask-group="More"]')
    assert.equal(await more.getByRole('heading', { name: 'More', exact: true }).count(), 1)
    await more.getByLabel('Opening hours').fill('Monday to Friday')
    assert.equal(await statusOf(page).innerText(), '1 of 8 answered')
    await goToStep(page, 'review')
    assert.equal(
      await page.getByRole('heading', { name: 'Ready to create your site', exact: true }).count(),
      1
    )
    assert.equal(await page.locator('[data-wizard-review-row="source"]').count(), 0, 'no Adding row')
    assert.equal(
      await page
        .locator('[data-wizard-review-row] dt')
        .filter({ hasText: /^Adding$/ })
        .count(),
      0
    )
    await page
      .locator('[data-wizard-review-row="customize"]')
      .getByRole('button', { name: /Change/ })
      .click()
    await sheet(page).getByLabel('Opening hours').fill('Every day')
    await page.locator('[data-wizard-continue]').click()
    assert.equal(await page.locator('[data-wizard-current]').getAttribute('data-wizard-current'), 'review')
    const fields = await create(page, 'unknown-question')
    assert.equal(fields.brief.answers['opening-hours'], 'Every day')
  })
})

test('a narrow wizard panel stacks grouped fields inside a wide desktop viewport', async () => {
  await withPage('start=plus', async (page) => {
    await page.setViewportSize({ width: 1300, height: 1000 })
    await openSeven(page)
    await page.locator('[data-add-site-form]').evaluate((el) => {
      el.style.width = '500px'
    })
    for (const group of ['LanguageTone', 'Brand']) {
      const box = sheet(page).locator(`[data-group-layout="${group}"]`)
      const columns = await box.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length)
      assert.equal(columns, 1, `${group} stacks for the panel width`)
      assert.equal(await box.evaluate((el) => el.scrollWidth <= el.clientWidth), true)
    }
  })
})

test('wizard examples and Language and tone controls align at 1300px', async () => {
  await withPage('start=plus', async (page) => {
    await page.setViewportSize({ width: 1300, height: 1000 })
    await openSeven(page)
    const language = await cardOf(page, 'languages').getByRole('combobox').boundingBox()
    const tone = await cardOf(page, 'tone').locator('.tas-customize-tone').boundingBox()
    assert.ok(Math.abs(language.y - tone.y) <= 1, `control tops: ${language.y} and ${tone.y}`)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((dark) => {
        document.documentElement.toggleAttribute('data-ds-dark-theme', dark)
        document.body.toggleAttribute('data-ds-dark-theme', dark)
      }, theme === 'dark')
      if (process.env.TRACY_TEST_ARTIFACT_DIR)
        await page.screenshot({
          path: path.join(process.env.TRACY_TEST_ARTIFACT_DIR, `wizard-fields-${theme}.png`)
        })
    }
  })
})

test('wizard business fields have example placeholders', async () => {
  await withPage('start=plus', async (page) => {
    await openSeven(page)
    for (const id of ['name', 'about']) {
      assert.ok(
        await cardOf(page, id).getByRole('textbox').getAttribute('placeholder'),
        `${id} has an example`
      )
    }
  })
})

test('wizard preserves served placeholders and examples without guessing unknown fields', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await page.evaluate(() => {
      const body = window.__harness.served('local-ja-kinetic')
      body.questions.find((q) => q.id === 'name').placeholder = 'e.g. Served business'
      body.questions.find((q) => q.id === 'about').example = 'e.g. Served description'
      body.questions.find((q) => q.kind === 'languages').placeholder = 'Select your site language'
      body.questions.push(
        { id: 'hours', kind: 'text', label: 'Opening hours', placeholder: 'e.g. 9 to 5' },
        { id: 'services', kind: 'longtext', label: 'Services', example: 'e.g. Dental care' },
        { id: 'unknown', kind: 'text', label: 'Unknown field' }
      )
      window.__harness.questionsAnswer = { status: 200, body }
    })
    await press(page, 'local-ja-kinetic', 'joomla')
    await openSheet(page)
    for (const [id, expected] of [
      ['name', 'e.g. Served business'],
      ['about', 'e.g. Served description'],
      ['hours', 'e.g. 9 to 5'],
      ['services', 'e.g. Dental care']
    ]) {
      assert.equal(await cardOf(page, id).getByRole('textbox').getAttribute('placeholder'), expected)
    }
    assert.equal(
      await sheet(page).getByRole('combobox').getAttribute('placeholder'),
      'Select your site language'
    )
    assert.equal(await cardOf(page, 'unknown').getByRole('textbox').getAttribute('placeholder'), null)
  })
})
