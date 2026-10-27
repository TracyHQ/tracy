/** The actual gallery picker and WO action, with a local catalogue and a recording build door. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { test } from 'node:test'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { buildCss, pkgRoot } from '../fixtures/template-body-page.mjs'

const require = createRequire(import.meta.url)
const repo = path.resolve(pkgRoot, '../../..')
const core = path.join(repo, 'packages/core/tracy-core')
const css = buildCss()
const built = await require('esbuild').build({
  stdin: {
    contents: `
    import {mountTemplatePicker} from './TemplatePicker'
    import {requestTemplatePick} from '@tracy/core/template-picker'
    import {runAction} from ${JSON.stringify(path.join(repo, 'packages/site/tracy-website-opportunities/src/client/row-actions.ts'))}
    import {createRequestIds} from ${JSON.stringify(path.join(repo, 'packages/site/tracy-website-opportunities/src/client/request-ids.ts'))}
    import {en} from './strings'
    import {RevisionView} from ${JSON.stringify(path.join(repo, 'packages/site/tracy-website-opportunities/src/client/detail.tsx'))}
    import {createRoot} from 'react-dom/client'
    const t=(key,values={}) => Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',v),en[key]??key)
    window.calls=[]
    const revisionApi={
      revision:async()=>({ok:true,body:{revision:{n:1,cms:'joomla'},builds:[],suggestedLabel:'fixture-site'}}),
      revisionMarkdown:async()=>({ok:true,body:'Fixture brief'}),
      detail:async()=>({ok:true,body:{opportunity:{name:'Fixture place'}}}),
      demoUsage:async()=>({ok:true,body:{usage:{used:0,limit:500}}}),
      // The Build form reads its CMS/template choices from /capabilities (435ac5f56c, 23/10/2026);
      // none offered here, so the Build button opens the template picker as before.
      capabilities:async()=>({ok:true,body:{}}),
      build:async()=>{throw Error('Legacy revision build must never run')},
      buildDemo:async(...args)=>{window.calls.push(args);return {ok:true,body:{actions:[],usage:{used:0,limit:500}}}}
    }
    window.showBrief=()=>createRoot(document.querySelector('#brief')).render(<RevisionView
      t={t} api={revisionApi} ids={createRequestIds(()=>crypto.randomUUID())}
      opportunityId="fixture-place" revisionId="old-revision" onList={()=>{}}
      onDetails={()=>{window.detailsOpened=(window.detailsOpened??0)+1}}
    />)

    window.dispose=mountTemplatePicker(t)
    window.pick=requestTemplatePick
    document.querySelector('button').onclick=()=>void runAction({buildDemo:async (...args)=>{window.calls.push(args);return {ok:true,body:{actions:[],usage:{used:0,limit:500}}}}}, createRequestIds(()=>crypto.randomUUID()),'build',{id:'fixture-place'})
    // The Build of a row whose opportunity has a known trade: the picker opens grouped by the server's ranking.
    window.buildRanked=()=>void runAction({
      templateRanking:async(ids)=>{window.rankedIds=ids;return {ok:true,status:200,body:{ranking:{trade:'fitness',recommended:['fixture-emdash'],generic:['fixture-template']}}}},
      buildDemo:async (...args)=>{window.calls.push(args);return {ok:true,body:{actions:[],usage:{used:0,limit:500}}}}
    }, createRequestIds(()=>crypto.randomUUID()),'build',{id:'ranked-place'})
  `,
    resolveDir: path.join(pkgRoot, 'src/client'),
    loader: 'tsx'
  },
  loader: { '.css': 'empty' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(core, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' }
})
const row = (id, platforms) => ({
  id,
  name: id,
  category: 'Business',
  nav: 'top-left',
  hero: 'split',
  dark: false,
  platforms,
  provider: 'Tracy',
  template: {
    quickstarts: Object.fromEntries(platforms.map((cms) => [cms, `${id}/${cms}`])),
    version: '1.0.0',
    image: null,
    demo: { url: 'http://127.0.0.1/fixture', version: '1.0.0' },
    languages: ['en'],
    layouts: []
  }
})

test('Build opens the existing preview, chooses CMS without Add site/chat writes, and cancel is free on desktop/mobile', async () => {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url })
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript')
      return res.end(built.outputFiles[0].text)
    }
    if (req.url.includes('/catalog')) {
      res.setHeader('Content-Type', 'application/json')
      return res.end(
        JSON.stringify({
          systems: [
            row('fixture-template', ['wordpress', 'joomla']),
            row('fixture-emdash', ['emdash']),
            { ...row('not-a-quickstart', ['wordpress']), template: undefined }
          ]
        })
      )
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(
      `<!doctype html><html><head><style>${css}</style></head><body><button id="build">Build</button><div id="brief"></div><script src="/app.js"></script></body></html>`
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  server.unref()
  const origin = `http://127.0.0.1:${server.address().port}`
  const playwright = await import(
    require.resolve('playwright', { paths: [path.join(repo, 'apps/tracy-host')] })
  )
  const chromium = playwright.chromium ?? playwright.default.chromium
  const browser = process.env.TEMPLATE_PICKER_CDP
    ? await chromium.connectOverCDP(process.env.TEMPLATE_PICKER_CDP)
    : await chromium.launch({ headless: true, args: ['--disable-features=MacAppCodeSignClone'] })
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(origin)
      await page.locator('#build').click()
      await page.locator('[data-inspiration="fixture-template"]').waitFor()
      assert.equal(await page.locator('[data-inspiration="not-a-quickstart"]').count(), 0)
      if (process.env.TEMPLATE_PICKER_EVIDENCE) {
        mkdirSync(process.env.TEMPLATE_PICKER_EVIDENCE, { recursive: true })
        await page.screenshot({
          path: path.join(process.env.TEMPLATE_PICKER_EVIDENCE, `picker-${width}.png`)
        })
      }
      await page.locator('[data-inspiration="fixture-template"]').click()
      await page.getByRole('button', { name: 'WordPress', exact: true }).last().waitFor()
      assert.equal(await page.getByRole('button', { name: 'EmDash', exact: true }).last().isDisabled(), true)
      await page.getByRole('button', { name: 'WordPress', exact: true }).last().click()
      await page.waitForFunction(() => window.calls.length === 1)
      assert.deepEqual(await page.evaluate(() => window.calls[0][3]), {
        cms: 'wordpress',
        design: 'fixture-template',
        quickstart: 'fixture-template/wordpress'
      })
      assert.equal(await page.locator('[data-template-picker]').count(), 0)
      let total = 1
      for (const cms of ['joomla', 'emdash']) {
        await page.locator('#build').click()
        const design = cms === 'emdash' ? 'fixture-emdash' : 'fixture-template'
        await page.locator(`[data-inspiration="${design}"]`).click()
        await page
          .getByRole('button', { name: cms === 'emdash' ? 'EmDash' : 'Joomla', exact: true })
          .last()
          .click()
        total++
        await page.waitForFunction((n) => window.calls.length === n, total)
        assert.deepEqual(await page.evaluate((n) => window.calls[n - 1][3], total), {
          cms,
          design,
          quickstart: `${design}/${cms}`
        })
      }
      await page.locator('#build').click()
      await page.locator('[data-inspiration="fixture-template"]').waitFor()
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => document.querySelector('[data-template-picker]') === null)
      assert.equal(await page.evaluate(() => window.calls.length), total)
      await page.evaluate(() => window.showBrief())
      const briefBuild = page.locator('#brief button').filter({ hasText: 'build.start' })
      await briefBuild.waitFor()
      await briefBuild.click()
      await page.locator('[data-template-picker]').waitFor()
      await page.keyboard.press('Escape')
      await page.locator('[data-template-picker]').waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => window.calls.length), total)
      assert.equal(await page.evaluate(() => window.detailsOpened ?? 0), 0)
      await briefBuild.click()
      await page.locator('[data-inspiration="fixture-template"]').click()
      await page.getByRole('button', { name: 'WordPress', exact: true }).last().click()
      total++
      await page.waitForFunction((n) => window.calls.length === n, total)
      assert.deepEqual(await page.evaluate(() => window.calls.at(-1).slice(0, 1)), ['fixture-place'])
      assert.equal(await page.evaluate(() => window.calls.at(-1)[3].cms), 'wordpress')
      assert.equal(await page.evaluate(() => window.calls.at(-1)[4]), 'fixture-site')
      assert.equal(await page.evaluate(() => window.detailsOpened), 1)
      await page.evaluate(() => {
        window.cancelled = 'pending'
        void window.pick().then((v) => (window.cancelled = v))
      })
      await page.locator('[data-template-picker]').waitFor()
      await page.evaluate(() => window.dispose())
      await page.waitForFunction(() => window.cancelled === null)
      assert.deepEqual(errors, [])
      await context.close()
    }
    assert.equal(
      requests.filter((r) => r.method !== 'GET').length,
      0,
      'picking never writes a design choice or starts an Add site/chat flow'
    )
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
  }
})

test('a known trade groups the picker: Recommended first with its badge, no suggestion block, per CMS chip', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript')
      return res.end(built.outputFiles[0].text)
    }
    if (req.url.includes('/catalog')) {
      res.setHeader('Content-Type', 'application/json')
      return res.end(
        JSON.stringify({
          systems: [
            row('fixture-other', ['wordpress', 'joomla']),
            row('fixture-template', ['wordpress', 'joomla']),
            row('fixture-emdash', ['emdash'])
          ]
        })
      )
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(
      `<!doctype html><html><head><style>${css}</style></head><body><button id="build">Build</button><div id="brief"></div><script src="/app.js"></script></body></html>`
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  server.unref()
  const origin = `http://127.0.0.1:${server.address().port}`
  const playwright = await import(
    require.resolve('playwright', { paths: [path.join(repo, 'apps/tracy-host')] })
  )
  const chromium = playwright.chromium ?? playwright.default.chromium
  const browser = process.env.TEMPLATE_PICKER_CDP
    ? await chromium.connectOverCDP(process.env.TEMPLATE_PICKER_CDP)
    : await chromium.launch({ headless: true, args: ['--disable-features=MacAppCodeSignClone'] })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(origin)
    // Without a ranking the grid has no group headings, as before.
    await page.evaluate(() => void window.pick())
    await page.locator('[data-inspiration="fixture-template"]').waitFor()
    assert.equal(await page.locator('[data-trade-group]').count(), 0)
    assert.equal(await page.locator('[data-trade-mark]').count(), 0)
    await page.keyboard.press('Escape')
    await page.locator('[data-template-picker]').waitFor({ state: 'hidden' })

    await page.evaluate(() => window.buildRanked())
    await page.locator('[data-trade-group="recommended"]').waitFor()
    assert.deepEqual(await page.evaluate(() => window.rankedIds), ['ranked-place'])
    assert.equal(
      await page.locator('[data-template-suggestion]').count(),
      0,
      'no suggestion block above the grid'
    )
    const groups = await page
      .locator('[data-trade-group]')
      .evaluateAll((els) =>
        els.map((el) => [
          el.getAttribute('data-trade-group'),
          el.querySelector('h3')?.textContent,
          [...el.querySelectorAll('[data-inspiration]')].map((c) => c.getAttribute('data-inspiration'))
        ])
      )
    assert.deepEqual(groups, [
      ['recommended', 'Recommended for a fitness business', ['fixture-emdash']],
      ['generic', 'Fits any business', ['fixture-template']],
      ['rest', 'All other templates', ['fixture-other']]
    ])
    if (process.env.TEMPLATE_PICKER_EVIDENCE) {
      mkdirSync(process.env.TEMPLATE_PICKER_EVIDENCE, { recursive: true })
      await page.screenshot({
        path: path.join(process.env.TEMPLATE_PICKER_EVIDENCE, 'picker-trade-groups.png')
      })
    }
    const recommended = page.locator('[data-inspiration="fixture-emdash"]')
    assert.equal(await recommended.getAttribute('data-trade-mark'), 'recommended')
    assert.match(await recommended.innerText(), /Recommended/)
    assert.match(await page.locator('[data-inspiration="fixture-template"]').innerText(), /Fits any business/)
    // The recommended border is the app's primary, not a literal.
    const border = await recommended.evaluate((el) => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--primary)'
      el.append(probe)
      const primary = getComputedStyle(probe).color
      probe.remove()
      return [getComputedStyle(el).borderTopColor, primary, getComputedStyle(el).borderTopWidth]
    })
    assert.equal(border[0], border[1])
    assert.equal(border[2], '2px')

    // The WordPress chip: no EmDash card, so no Recommended group; the rest keeps its groups.
    await page
      .getByRole('button', { name: /^WordPress/ })
      .first()
      .click()
    await page.locator('[data-trade-group="recommended"]').waitFor({ state: 'detached' })
    assert.deepEqual(
      await page
        .locator('[data-trade-group]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-trade-group'))),
      ['generic', 'rest']
    )
    // Picking a grouped card builds it as before.
    await page.locator('[data-inspiration="fixture-template"]').click()
    await page.getByRole('button', { name: 'WordPress', exact: true }).last().click()
    await page.waitForFunction(() => window.calls.length === 1)
    assert.deepEqual(await page.evaluate(() => window.calls[0].slice(0, 1)), ['ranked-place'])
    assert.deepEqual(errors, [])
    await context.close()
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
  }
})
