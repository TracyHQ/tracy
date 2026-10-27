import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '../..')
const repoRoot = path.resolve(pkgRoot, '../../..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')
const playwright = await import(
  pathToFileURL(
    require.resolve('playwright', {
      paths: [path.join(repoRoot, 'apps/tracy-host')]
    })
  ).href
)
let browser
let script

before(async () => {
  const built = await esbuild.build({
    stdin: {
      contents: `
        import { createRoot } from 'react-dom/client'
        import { CreateStep, CreateRefusalProblem } from './src/client/create-step'
        import { CREATE_STEP_CSS } from './src/client/create-step-css'
        import { WIZARD_CSS } from './src/client/wizard-css'
        import { WizardSteps } from './src/client/wizard-steps'
        import { en } from './src/client/strings'
        const style = document.createElement('style')
        style.textContent = WIZARD_CSS + CREATE_STEP_CSS
        document.head.append(style)
        const root = createRoot(document.getElementById('root'))
        const t = (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), en[key] ?? key)
        const noop = () => {}
        window.openSiteCalls = 0
        window.editSiteCalls = 0
        window.reviewCalls = 0
        window.backActions = []
        window.mySitesCalls = 0
        const formSteps = ['source', 'platform', 'design', 'address', 'customize', 'review'].map(id => ({id, label: id}))
        window.showProgress = state => root.render(<div className="tas-root" data-progress={state}>
          <WizardSteps t={t} steps={state === 'form' ? formSteps : [...formSteps, {id:'create', label:t('submit')}]}
            current={state === 'form' ? 'review' : 'create'} done={formSteps.map(step => step.id)}
            currentState={state === 'form' ? undefined : state} />
        </div>)
        const job = { state: 'running', liveUrl: 'https://example.test' }
        window.showCase = name => {
          if (name === 'refusal' || name.startsWith('refusal:')) {
            root.render(<div data-case={name}><CreateRefusalProblem t={t} refused={name === 'refusal' ? {refusal:'taken',code:'TAKEN'} : JSON.parse(name.slice(8))} onBack={action => window.backActions.push(action)} onMySites={() => window.mySitesCalls++} /></div>)
            return
          }
          root.render(<div data-case={name}><CreateStep t={t} siteKey="example.test" platform="wordpress"
            phase={(['ready', 'design_gone', 'agent_failed'].includes(name) || name.startsWith('design:')) ? 'ready' : name === 'starting' ? 'starting' : 'building'}
            job={name === 'accepted' ? null : {...job,
              state:name === 'queued' ? 'queued' : name === 'failed' ? 'failed' : name === 'unknown' ? 'unknown' : 'running',
              ...(name === 'design_gone' || name.startsWith('design:') ? {designSystem: {reason: name === 'design_gone' ? 'SITE_UNKNOWN' : name.slice(7)}} : {})}}
            seen="" unreachable={name === 'unreachable'} signedOut={name === 'poll-signed-out'} slow={name === 'slow'} agent={name === 'agent_failed' ? 'failed' : 'up'}
            pickLine={name === 'design_gone' || name.startsWith('design:') ? {at: 'failed', name: 'Selected design'} : null}
            onBack={() => window.reviewCalls++} onStartAgent={noop} onWorkspace={() => window.editSiteCalls++} onOpenSite={() => window.openSiteCalls++}
            onDesignRetry={noop} onMySites={() => window.mySitesCalls++} /></div>)
        }
      `,
      resolveDir: pkgRoot,
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    loader: { '.css': 'empty', '.module.css': 'empty' },
    nodePaths: [
      path.join(pkgRoot, 'node_modules'),
      path.join(repoRoot, 'packages/core/tracy-core/node_modules')
    ],
    write: false,
    logLevel: 'silent'
  })
  script = built.outputFiles[0].text
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({
    headless: true,
    args: ['--disable-features=MacAppCodeSignClone']
  })
})

after(async () => {
  await browser?.close()
})

async function withPage(run) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent(
      '<!doctype html><html><head><style>:root { --primary: rgb(101, 51, 21); --destructive: rgb(181, 11, 31); --foreground: rgb(21, 21, 21); }</style></head><body><div id="root"></div></body></html>'
    )
    await page.addScriptTag({ content: script })
    await run(page)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
}

async function show(page, name) {
  await page.evaluate((value) => window.showCase(value), name)
  await page.locator(`[data-case="${name}"] .tas-create-status`).waitFor()
}

test('waiting statuses separate the short headline from the explanation', async () => {
  await withPage(async (page) => {
    for (const [name, headline, explanation] of [
      ['accepted', 'Request accepted', 'Waiting for the first progress update.'],
      ['queued', 'Request queued', 'Tracy will start setting up your site automatically.']
    ]) {
      await show(page, name)
      assert.equal(await page.locator('.tas-create-status strong').innerText(), headline)
      assert.equal(await page.locator('.tas-create-explanation').innerText(), explanation)
      assert.equal(await page.locator('.tas-create-live').count(), 1)
      assert.deepEqual(
        await page.locator('.tas-create-status strong').evaluate((el) => {
          const css = getComputedStyle(el)
          return [css.fontWeight, css.display]
        }),
        ['500', 'block']
      )
    }
  })
})

test('step titles describe stopped, uncertain and completed stages without claiming creation is running', async () => {
  await withPage(async (page) => {
    for (const [name, title] of [
      ['failed', 'Site setup incomplete'],
      ['unknown', 'Checking your site'],
      ['poll-signed-out', 'Site status unknown'],
      ['unreachable', 'Checking your site'],
      ['starting', 'Preparing Tracy for editing'],
      ['ready', 'Your site is ready'],
      ['agent_failed', 'Your site has been created'],
      ['design_gone', 'Site update needs attention']
    ]) {
      await show(page, name)
      assert.equal(await page.getByRole('heading').innerText(), title, name)
    }
  })
})

test('viewing the site announces a new tab and invokes the open action', async () => {
  await withPage(async (page) => {
    await show(page, 'ready')
    const viewSite = page.getByRole('button', { name: 'View your site (opens in a new tab)', exact: true })
    assert.equal(await viewSite.innerText(), 'View your site')
    assert.equal(await viewSite.locator('svg[aria-hidden="true"]').count(), 1)
    await viewSite.click()
    assert.equal(await page.evaluate(() => window.openSiteCalls), 1)
    assert.equal(await page.getByRole('button', { name: 'View the live site', exact: true }).count(), 0)
  })
})

test('live status dots follow progress and stop for completed or failed outcomes', async () => {
  await withPage(async (page) => {
    for (const [name, live] of [
      ['running', 1],
      ['unreachable', 1],
      ['ready', 0],
      ['failed', 0],
      ['refusal', 0]
    ]) {
      await show(page, name)
      assert.equal(await page.locator('.tas-create-live').count(), live, name)
      assert.deepEqual(
        await page.locator('.tas-create-status').evaluate((el) => {
          const css = getComputedStyle(el)
          return [css.fontSize, css.lineHeight]
        }),
        ['14px', '20px'],
        name
      )
      if (['failed', 'refusal'].includes(name)) {
        assert.equal(await page.locator('.tas-create-notice[role="alert"]').count(), 1)
        assert.equal(await page.getByText('How to resolve', { exact: true }).count(), 0)
        assert.equal(await page.locator('.tas-create-guidance').count(), 1)
        assert.equal(await page.locator('.tas-create-guidance li').count(), 0)
        assert.equal(await page.locator('.tas-create-notice [data-slot="alert-description"]').count(), 1)
      }
    }
  })
})

test('reduced motion disables the live helper animation', async () => {
  await withPage(async (page) => {
    await show(page, 'running')
    assert.notEqual(
      await page.locator('.tas-create-live').evaluate((el) => getComputedStyle(el).animationName),
      'none'
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(
      await page.locator('.tas-create-live').evaluate((el) => getComputedStyle(el).animationName),
      'none'
    )
  })
})

test('ready copy invites editing and retains the editing action', async () => {
  await withPage(async (page) => {
    await show(page, 'ready')
    assert.equal(await page.getByRole('heading').innerText(), 'Your site is ready')
    assert.equal(
      await page.locator('.tas-create-explanation').innerText(),
      'You can start editing it with Tracy now.'
    )
    await page.getByRole('button', { name: 'Start editing', exact: true }).click()
    assert.equal(await page.evaluate(() => window.editSiteCalls), 1)
    assert.doesNotMatch(await page.locator('[data-case="ready"]').innerText(), /workspace/i)
  })
})

async function showProgress(page, state) {
  await page.evaluate((value) => window.showProgress(value), state)
  await page.locator(`[data-progress="${state}"]`).waitFor()
}

test('creation adds a seventh segment with the standard numbered caption', async () => {
  await withPage(async (page) => {
    await showProgress(page, 'form')
    assert.equal(await page.locator('.tas-wizard-segment').count(), 6)
    assert.equal(await page.locator('.tas-wizard-position b').innerText(), 'Step 6 of 6')
    await showProgress(page, 'running')
    assert.equal(await page.locator('.tas-wizard-segment').count(), 7)
    assert.equal(await page.locator('.tas-wizard-position b').innerText(), 'Step 7 of 7')
    assert.equal(await page.locator('.tas-wizard-position span').innerText(), 'Create site')
    const final = page.getByRole('button', { name: 'Create site', exact: true })
    assert.equal(await final.getAttribute('aria-current'), 'step')
    assert.equal(await final.getAttribute('data-step-state'), 'running')
    assert.equal(await final.isDisabled(), true)
    assert.notEqual(await final.locator('span').evaluate((el) => getComputedStyle(el).animationName), 'none')
    const firstSix = page.locator('.tas-wizard-segment:not([data-wizard-goto="create"])')
    assert.deepEqual(
      await firstSix.evaluateAll((elements) =>
        elements.map((el) => [
          el.getAttribute('data-active'),
          getComputedStyle(el.firstElementChild).backgroundColor,
          getComputedStyle(el.firstElementChild).animationName
        ])
      ),
      Array.from({ length: 6 }, () => ['1', 'rgb(101, 51, 21)', 'none'])
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await final.locator('span').evaluate((el) => getComputedStyle(el).animationName), 'none')
  })
})

test('creation completion and failure stop animating and use the correct theme tokens', async () => {
  await withPage(async (page) => {
    for (const [state, color] of [
      ['done', 'rgb(101, 51, 21)'],
      ['failed', 'rgb(181, 11, 31)']
    ]) {
      await showProgress(page, state)
      const segment = page.locator('[data-wizard-goto="create"]')
      assert.equal(await segment.getAttribute('data-step-state'), state)
      assert.deepEqual(
        await segment
          .locator('span')
          .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).animationName]),
        [color, 'none']
      )
      assert.deepEqual(
        await page
          .locator('.tas-wizard-segment:not([data-wizard-goto="create"]) > span')
          .evaluateAll((elements) => elements.map((el) => getComputedStyle(el).backgroundColor)),
        Array(6).fill('rgb(101, 51, 21)')
      )
    }
  })
})

test('failed setup offers the form and My Sites; a missing site offers no editing actions', async () => {
  await withPage(async (page) => {
    await show(page, 'failed')
    assert.equal(await page.getByRole('button', { name: 'Review site details', exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Open My Sites', exact: true }).count(), 1)
    assert.deepEqual(await page.locator('.tas-create-actions button').allInnerTexts(), [
      'Open My Sites',
      'Review site details'
    ])
    const review = page.getByRole('button', { name: 'Review site details', exact: true })
    assert.equal(await review.evaluate((el) => el.classList.contains('border-border')), true)
    await page.getByRole('button', { name: 'Open My Sites', exact: true }).click()
    await review.click()
    assert.equal(await page.evaluate(() => window.mySitesCalls), 1)
    assert.equal(await page.evaluate(() => window.reviewCalls), 1)
    assert.equal(
      await page.getByText('Tracy could not finish setting up your site.', { exact: true }).count(),
      1
    )
    const copy = page.getByRole('button', { name: 'Copy details', exact: true })
    assert.equal(await copy.count(), 0)
    await page.locator('summary').click()
    assert.equal(await copy.count(), 1)
    await page.locator('summary').click()
    await show(page, 'design_gone')
    assert.deepEqual(await page.getByRole('button').allInnerTexts(), ['Open My Sites'])
    assert.equal(await page.getByRole('link', { name: 'Contact support', exact: true }).count(), 1)
  })
})

test('refusal recovery invokes the existing form and My Sites callbacks', async () => {
  await withPage(async (page) => {
    for (const [refusal, code, label, action] of [
      ['shape', 'INVALID_LABEL', 'Change site name', 'create_change_name'],
      ['reserved', 'INVALID_LABEL', 'Change site name', 'create_change_name'],
      ['looks_imported', 'INVALID_LABEL', 'Change site name', 'create_change_name'],
      ['taken', 'TAKEN', 'Change site name', 'create_change_name'],
      ['conflict', 'IDEMPOTENCY_CONFLICT', 'Change site name', 'create_change_name'],
      ['other', 'UNSUPPORTED_QUICKSTART', 'Choose another template', 'create_change_template'],
      ['other', 'UNSUPPORTED_PLATFORM', 'Choose another platform', 'create_change_platform'],
      ['other', 'DS_UNKNOWN', 'Change design system', 'create_change_system'],
      ['other', 'DS_TEMPLATE_LOCKED', 'Change design system', 'create_change_system'],
      ['other', 'TEMPLATE_VERSION_CHANGED', 'Choose another template', 'create_change_template'],
      ['other', 'DESIGN_PLAN_CHANGED', 'Choose another template', 'create_change_template'],
      ['other', 'INVALID_REQUEST', 'Review site details', 'create_review_details'],
      ['host_updating', 'HOST_UPDATING', 'Review site details', 'create_review_details']
    ]) {
      const name = 'refusal:' + JSON.stringify({ refusal, code })
      await page.evaluate((value) => window.showCase(value), name)
      const button = page.getByRole('button', { name: label, exact: true })
      await button.click()
      if (refusal === 'host_updating') {
        assert.deepEqual(await page.locator('.tas-create-actions button').allInnerTexts(), [
          'Open My Sites',
          'Review site details'
        ])
        assert.equal(await button.evaluate((el) => el.classList.contains('border-border')), true)
      }
      assert.equal(await page.evaluate(() => window.backActions.at(-1)), action)
      assert.equal(
        await page.getByRole('button', { name: 'Open My Sites', exact: true }).count(),
        ['taken', 'conflict', 'host_updating'].includes(refusal) ? 1 : 0
      )
    }
    await page.evaluate(() => window.showCase('refusal'))
    await page.getByRole('button', { name: 'Open My Sites', exact: true }).click()
    assert.equal(await page.evaluate(() => window.mySitesCalls), 1)
  })
})

test('signed-out recovery keeps the new-tab sign-in link with an accessible name', async () => {
  await withPage(async (page) => {
    await page.evaluate(() =>
      window.showCase('refusal:' + JSON.stringify({ refusal: 'signed_out', code: 'NOT_SIGNED_IN' }))
    )
    const link = page.getByRole('link', { name: 'Sign in again (opens in a new tab)', exact: true })
    assert.equal(await link.innerText(), 'Sign in again')
    assert.equal(await link.getAttribute('target'), '_blank')
    assert.equal(await link.getAttribute('href'), '/login')
  })
})

test('unsupported design outcomes keep editing and support without an ineffective apply action', async () => {
  await withPage(async (page) => {
    for (const reason of [
      'DS_UNKNOWN',
      'DS_REFUSED',
      'DS_TEMPLATE_CANNOT_WEAR',
      'PLATFORM_HAS_NO_SLOT',
      'DS_IMPORTED_SITE',
      'DS_TEMPLATE_LOCKED',
      'DS_THEME_CANNOT_WEAR'
    ]) {
      await show(page, 'design:' + reason)
      assert.deepEqual(
        await page.getByRole('button').allInnerTexts(),
        ['Start editing', 'View your site'],
        reason
      )
      assert.equal(await page.getByRole('link', { name: 'Contact support', exact: true }).count(), 1, reason)
    }
    await show(page, 'design:DS_READ_FAILED')
    assert.equal(
      await page.locator('.tas-create-explanation').innerText(),
      'Tracy could not check whether your site supports the design system.'
    )
    assert.equal(await page.getByRole('button', { name: 'Apply design system', exact: true }).count(), 1)
  })
})

test('recovery actions share one row before quiet diagnostics, and font size follows Settings', async () => {
  await withPage(async (page) => {
    for (const name of ['ready', 'failed', 'refusal', 'design:DS_TEMPLATE_CANNOT_WEAR']) {
      await show(page, name)
      assert.equal(await page.locator('.tas-create-actions').count(), 1, name)
      const actions = page.locator('.tas-create-actions')
      assert.equal(await actions.locator('.underline, .text-primary').count(), 0, name)
      if (name !== 'ready') {
        assert.equal(await actions.getByRole('link', { name: 'Contact support', exact: true }).count(), 1)
        assert.equal(await page.locator('.tas-create-actions + .tas-create-technical').count(), 1)
        assert.equal(await page.locator('.tas-create-notice .tas-create-actions').count(), 0)
      }
      const view = actions.getByRole('button', { name: 'View your site (opens in a new tab)', exact: true })
      if (await view.count()) {
        assert.equal(await view.evaluate((el) => el.classList.contains('border-border')), true)
      }
      for (const button of await actions.locator('[data-slot="button"]').all()) {
        assert.deepEqual(
          await button.evaluate((el) => {
            const css = getComputedStyle(el)
            return [css.height, css.borderRadius, css.fontSize]
          }),
          ['36px', '8px', '14px'],
          name
        )
      }
      const scope = page.locator('.tas-create-step, .tas-create-problem')
      await scope.evaluate((el) => el.style.setProperty('--dsh-content-font-size', '18px'))
      for (const selector of [
        '.tas-create-status',
        '.tas-create-guidance',
        '.tas-create-checklist li',
        '.tas-create-actions [data-slot="button"]'
      ]) {
        for (const element of await page.locator(selector).all()) {
          assert.equal(await element.evaluate((el) => getComputedStyle(el).fontSize), '18px', name + selector)
        }
      }
      await page
        .getByText('Technical details', { exact: true })
        .count()
        .then(async (count) => {
          if (count) assert.equal(await page.locator('[data-diagnosis]').isVisible(), false)
        })
      await scope.evaluate((el) => el.style.removeProperty('--dsh-content-font-size'))
    }
  })
})

test('an ended polling session preserves uncertainty and offers sign-in and My Sites without a live dot', async () => {
  await withPage(async (page) => {
    await show(page, 'poll-signed-out')
    assert.equal(
      await page.locator('.tas-create-explanation').innerText(),
      'Your session has ended. Your site may still be in progress.'
    )
    assert.equal(await page.locator('.tas-create-live').count(), 0)
    const signIn = page.getByRole('link', { name: 'Sign in again (opens in a new tab)', exact: true })
    assert.equal(await signIn.getAttribute('href'), '/login')
    assert.equal(await signIn.getAttribute('target'), '_blank')
    await page.getByRole('button', { name: 'Open My Sites', exact: true }).click()
    assert.equal(await page.evaluate(() => window.mySitesCalls), 1)
    assert.equal(await page.getByRole('button', { name: 'Review site details', exact: true }).count(), 0)
  })
})

test('slow setup explains background completion and offers My Sites as a secondary action', async () => {
  await withPage(async (page) => {
    await show(page, 'slow')
    assert.equal(
      await page.locator('.tas-create-status strong').innerText(),
      'This is taking longer than usual.'
    )
    assert.equal(
      await page.locator('.tas-create-explanation').innerText(),
      'You can leave this page; your new site will appear in My Sites when it is ready.'
    )
    assert.equal(await page.locator('.tas-create-live').count(), 1)
    const mySites = page.getByRole('button', { name: 'Open My Sites', exact: true })
    assert.equal(await mySites.evaluate((el) => el.classList.contains('border-border')), true)
    await mySites.click()
    assert.equal(await page.evaluate(() => window.mySitesCalls), 1)
  })
})

test('redirects expose recovery after five seconds when navigation has not completed', async () => {
  await withPage(async (page) => {
    // Paused, so only runFor moves the page's time. A clock left running also counts the real time a
    // slow runner spends between steps, and crossed the five seconds before runFor(4_999) ended
    // (red on develop's nightly and on CI, 25/10/2026).
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
    for (const code of ['USE_SHARD', 'SHARD_FULL']) {
      await page.evaluate(
        (code) =>
          window.showCase(
            'refusal:' +
              JSON.stringify({ refusal: 'elsewhere', code, url: 'https://example.test/new/' + code })
          ),
        code
      )
      await page.locator('[data-create-refusal="elsewhere"], [data-create-refusal="capacity"]').waitFor()
      assert.equal(await page.locator('.tas-create-actions').count(), 0)
      await page.clock.runFor(4_999)
      assert.equal(await page.locator('.tas-create-actions').count(), 0)
      await page.clock.runFor(1)
      await page.locator('[data-create-refusal="redirect_failed"]').waitFor()
      assert.equal(await page.getByRole('link', { name: 'Contact support', exact: true }).count(), 1)
      await page.getByRole('button', { name: 'Review site details', exact: true }).click()
      assert.equal(await page.evaluate(() => window.backActions.at(-1)), 'create_review_details')
    }
  })
})

test('a stale page refusal offers a reload action without asking the user to change site details', async () => {
  await withPage(async (page) => {
    await page.evaluate(() =>
      window.showCase('refusal:' + JSON.stringify({ refusal: 'other', code: 'CSRF_ORIGIN' }))
    )
    await page.locator('[data-create-refusal="reload"]').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Reload page', exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Review site details', exact: true }).count(), 0)
  })
})

test('unreachable setup sends the user to My Sites first and keeps support available', async () => {
  await withPage(async (page) => {
    await show(page, 'unreachable')
    assert.deepEqual(await page.locator('.tas-create-actions button').allInnerTexts(), ['Open My Sites'])
    assert.equal(await page.getByRole('link', { name: 'Contact support', exact: true }).count(), 1)
    const mySites = page.getByRole('button', { name: 'Open My Sites', exact: true })
    assert.equal(await mySites.evaluate((el) => el.classList.contains('border-border')), false)
    await mySites.click()
    assert.equal(await page.evaluate(() => window.mySitesCalls), 1)
  })
})
