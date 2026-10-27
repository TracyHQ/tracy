/** Real synthetic sessions, database, API uploads and production React preview, in an owned browser/stand. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { lstat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { opsI18nPlugin } from '../support/ops-i18n-esbuild.mjs'
import { withRealDb } from '../../../../../apps/tracy-web/test/_invitations-real.mjs'
import { contentCampaign, contentZip } from '../../../../../apps/tracy-web/test/_invitations-real-content.mjs'
import { realOps } from '../../../../../apps/tracy-web/test/_invitations-real-ops.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const require = createRequire(resolve(repo, 'package.json'))
const hostRequire = createRequire(resolve(repo, 'apps/tracy-host/package.json'))
const webRequire = createRequire(resolve(repo, 'apps/tracy-web/package.json'))
const harnessRequire = createRequire(resolve(repo, 'packages/web/tracy-harness/package.json'))
test('authenticated ZIP previews isolate scripts, links, forms and network; managed images fit desktop/mobile and disappear after revocation', async () => {
  const artifactRoot = process.env.INVITATIONS_REAL_PREVIEW_ARTIFACTS
  if (artifactRoot)
    assert.ok(
      isAbsolute(artifactRoot) && (await lstat(artifactRoot)).isDirectory(),
      'an existing absolute artifact directory is required'
    )
  const artifacts = await mkdtemp(join(artifactRoot ?? tmpdir(), 'invitations-real-preview-'))
  try {
    await withRealDb(async (deps) => {
      const c = await contentCampaign({ ...deps, total: 5 })
      const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {RealCampaign} from './RealCampaign'; createRoot(document.getElementById('root')).render(React.createElement(RealCampaign,{campaignId:${JSON.stringify(c.campaignId)}}));`
      const built = await require('esbuild').build({
        stdin: {
          contents: entry,
          resolveDir: resolve(repo, 'packages/web/tracy-harness/src/invitations'),
          loader: 'tsx'
        },
        bundle: true,
        format: 'iife',
        platform: 'browser',
        jsx: 'automatic',
        loader: { '.css': 'empty' },
        define: { 'process.env.NODE_ENV': '"production"' },
        write: false,
        plugins: [opsI18nPlugin()],
        logLevel: 'silent'
      })
      // Compile the shipped stylesheet in memory; a clean CI checkout has no harness dist directory.
      const { build } = await import(harnessRequire.resolve('vite'))
      const harness = await build({
        root: resolve(repo, 'packages/web/tracy-harness'),
        configFile: resolve(repo, 'packages/web/tracy-harness/vite.config.ts'),
        build: { write: false },
        logLevel: 'silent'
      })
      const output = (Array.isArray(harness) ? harness : [harness]).flatMap((r) => r.output)
      const styles = output.filter((o) => o.type === 'asset' && o.fileName.endsWith('.css'))
      assert.ok(styles.length, 'the production harness must emit its stylesheet')
      const css = styles.map((o) => String(o.source)).join('\n')
      const { serve } = webRequire('@hono/node-server')
      let h, browser
      const server = serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (req) => {
          const path = new URL(req.url).pathname
          if (path === '/stand.js')
            return new Response(built.outputFiles[0].text, { headers: { 'content-type': 'text/javascript' } })
          if (path === '/stand.css') return new Response(css, { headers: { 'content-type': 'text/css' } })
          if (path === '/')
            return new Response(
              '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/stand.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/stand.js"></script></body></html>',
              { headers: { 'content-type': 'text/html' } }
            )
          return h.app.fetch(req)
        }
      })
      try {
        if (!server.listening) await once(server, 'listening')
        const base = `http://127.0.0.1:${server.address().port}`
        h = await realOps({ ...deps, origin: base })
        browser = await hostRequire('playwright').chromium.launch({
          args: ['--disable-features=MacAppCodeSignClone']
        })
        const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
        await context.addCookies([
          { name: 'tracy_sess', value: h.sessions.owner.slice('tracy_sess='.length), url: base }
        ])
        const page = await context.newPage(),
          externalRequests = [],
          navigations = [],
          errors = [],
          diagnostics = [],
          templateResponses = []
        page.on('console', (message) => {
          if (message.type() === 'error') diagnostics.push(message.text())
        })
        page.on('request', (req) => {
          const url = new URL(req.url())
          if (url.protocol.startsWith('http') && url.origin !== base) externalRequests.push(url.hostname)
        })
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame() && frame.url() !== `${base}/`)
            navigations.push(new URL(frame.url()).hostname)
        })
        page.on('pageerror', (e) => errors.push(e.message))
        page.on('response', (response) => {
          const path = new URL(response.url()).pathname
          if (path.includes('/templates/'))
            templateResponses.push({ path, method: response.request().method(), status: response.status() })
        })
        await page.goto(base)
        await page.getByRole('button', { name: 'Content / Templates', exact: true }).click()
        const malicious = await contentZip({
          html: '<html><head><style>p{color:red;background-image:url(https://external.example.test/x)}</style></head><body><script>top.__executed=1</script><form action="https://external.example.test/send"><input name="x"></form><a href="https://external.example.test/out" target="_blank">Outside link</a><p>Hello {{first_name}}</p><img src="images/logo.png" alt="Managed logo" onload="top.__executed=2"></body></html>'
        })
        // The subject starts empty and is required before a preview.
        await page.getByLabel('Template subject', { exact: true }).fill('Synthetic subject {{first_name}}')
        await page
          .locator('input[type="file"]')
          .setInputFiles({ name: 'synthetic.zip', mimeType: 'application/zip', buffer: malicious })
        await page.getByRole('button', { name: 'Preview ZIP', exact: true }).click()
        const iframe = page.locator('iframe[title="Email HTML preview"]')
        await iframe.waitFor()
        assert.equal(await iframe.getAttribute('sandbox'), '')
        const frame = page.frameLocator('iframe[title="Email HTML preview"]')
        await frame.locator('img').waitFor()
        await page.waitForFunction(() => [...document.querySelectorAll('iframe')].length === 1)
        const imageState = await frame.locator('img').evaluate(async (img) => {
          await img.decode().catch(() => {})
          return { complete: img.complete, width: img.naturalWidth, src: img.getAttribute('src') }
        })
        assert.deepEqual(
          { complete: imageState.complete, width: imageState.width },
          { complete: true, width: 3 },
          JSON.stringify({ imageState, diagnostics })
        )
        assert.equal(
          await frame.locator('script,form,[href],[target],[action],meta[http-equiv="refresh"]').count(),
          0
        )
        assert.equal(await page.evaluate(() => window.__executed ?? 0), 0)
        await page.screenshot({ path: resolve(artifacts, 'task-8-preview-light.png'), fullPage: true })
        await page.evaluate(() => document.documentElement.classList.add('dark'))
        const canvas = await frame.locator('body').evaluate((body) => ({
          background: getComputedStyle(body).backgroundColor,
          color: getComputedStyle(body).color,
          scheme: getComputedStyle(body).colorScheme
        }))
        assert.deepEqual(
          canvas,
          { background: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)', scheme: 'light' },
          'email canvas remains readable independently of the Ops dark theme'
        )
        // Wait for the shared controls' theme transitions, not an arbitrary screenshot delay.
        await page.waitForFunction(() => {
          const el = document.querySelector('[aria-label="Template subject"]')
          return el && getComputedStyle(el).color === getComputedStyle(el.parentElement).color
        })
        await page.screenshot({ path: resolve(artifacts, 'task-8-preview-dark.png'), fullPage: true })
        await page.getByRole('button', { name: 'Mobile', exact: true }).click()
        assert.ok((await iframe.boundingBox()).width <= 360)
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        await page.screenshot({ path: resolve(artifacts, 'task-8-preview-mobile.png'), fullPage: true })
        await page.setViewportSize({ width: 1280, height: 1000 })
        assert.deepEqual(externalRequests, [])
        assert.deepEqual(navigations, [])
        assert.equal(
          (await deps.pool.query('select count(*)::int n from invitations_real_template')).rows[0].n,
          0
        )
        await page.getByRole('button', { name: 'Confirm template', exact: true }).click()
        await page.getByText('Saved version 1', { exact: false }).waitFor()
        for (const group of ['group_2', 'group_3', 'group_4', 'group_5']) {
          await page.getByLabel('Template group', { exact: true }).selectOption(group)
          await page.getByLabel('Template subject', { exact: true }).fill(`Synthetic ${group} subject`)
          await page
            .locator('input[type="file"]')
            .setInputFiles({ name: 'synthetic.zip', mimeType: 'application/zip', buffer: await contentZip() })
          await page.getByRole('button', { name: 'Preview ZIP', exact: true }).click()
          await page.getByRole('button', { name: 'Confirm template', exact: true }).click()
          try {
            await page.getByText('Saved version 1', { exact: false }).waitFor()
          } catch (error) {
            console.log('Synthetic template failure:', {
              group,
              selected: await page
                .getByLabel('Template group', { exact: true })
                .evaluateAll((elements) => elements.map((element) => element.value)),
              alerts: await page.getByRole('alert').allTextContents(),
              templateResponses,
              diagnostics,
              saved: (
                await deps.pool.query(
                  'select group_key, version from invitations_real_template order by group_key,version'
                )
              ).rows
            })
            throw error
          }
        }
        assert.equal(
          (await deps.pool.query('select count(*)::int n from invitations_real_template')).rows[0].n,
          5
        )
        await page.getByLabel('Template group', { exact: true }).selectOption('group_1')
        await page.getByRole('button', { name: 'Generate missing drafts', exact: true }).click()
        await page.getByText(/drafts created\./).waitFor()
        await page.getByRole('button', { name: 'Recipients', exact: true }).click()
        await page.getByRole('button', { name: 'synthetic50@example.test', exact: true }).click()
        await page.getByRole('button', { name: 'Review this email', exact: true }).click()
        await page.getByRole('button', { name: 'Edit this email', exact: true }).click()
        await page.getByLabel('Draft HTML', { exact: true }).fill('<p>Customized synthetic text</p>')
        await page.getByRole('button', { name: 'Save this email', exact: true }).click()
        await page.getByRole('button', { name: 'Approve content and go to next', exact: true }).click()
        // Scoped to the list: the review-state filter has an option with the same words.
        const reviewList = page.getByRole('list', { name: 'Recipients to review', exact: true })
        await reviewList.getByText('Content approved', { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Content / Templates', exact: true }).click()
        await page
          .getByLabel('Template HTML', { exact: true })
          .fill('<p>Updated template</p><img src="images/logo.png" alt="Logo">')
        await page.getByRole('button', { name: 'Save template version', exact: true }).click()
        await page.getByText('Saved version 2', { exact: false }).waitFor()
        await page.getByRole('button', { name: 'Recipients', exact: true }).click()
        await page.getByRole('button', { name: 'synthetic50@example.test', exact: true }).click()
        await page.getByRole('button', { name: 'Review this email', exact: true }).click()
        await reviewList.getByText('Changed, review again', { exact: true }).first().waitFor()
        await page.getByRole('button', { name: 'Edit this email', exact: true }).click()
        assert.ok(
          (await page.getByLabel('Draft HTML', { exact: true }).inputValue()).includes(
            'Customized synthetic text'
          )
        )
        assert.equal(await reviewList.getByText('Content approved', { exact: true }).count(), 0)
        await page.screenshot({ path: resolve(artifacts, 'task-8-review-stale.png'), fullPage: true })
        await deps.pool.query('update seat_workspace set revoked_at=clock_timestamp() where account_id=$1', [
          h.ids.owner
        ])
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        await page.getByText('Private data is unavailable.', { exact: true }).waitFor()
        await page.screenshot({ path: resolve(artifacts, 'task-8-revoked.png'), fullPage: true })
        assert.equal(await page.locator('iframe').count(), 0)
        assert.ok(!(await page.locator('body').innerText()).includes('synthetic50@example.test'))
        await deps.pool.query('update seat_workspace set revoked_at=null where account_id=$1', [h.ids.owner])
        await deps.pool.query(
          "update invitations_real_campaign set expires_at=clock_timestamp()-interval '1 second' where id=$1",
          [c.campaignId]
        )
        await page.goto(base)
        await page.getByText('Private data is unavailable.', { exact: true }).waitFor()
        assert.ok((await page.getByRole('alert').innerText()).includes('REAL_EXPIRED'))
        assert.equal(await page.locator('iframe').count(), 0)
        await page.screenshot({ path: resolve(artifacts, 'task-8-expired.png'), fullPage: true })
        // Restore only this synthetic fixture's deadline, then make its private vault unavailable.
        await deps.pool.query(
          "update invitations_real_campaign set expires_at=clock_timestamp()+interval '1 day' where id=$1",
          [c.campaignId]
        )
        const { rename } = await import('node:fs/promises')
        await rename(deps.root, `${deps.root}-unavailable`)
        try {
          await page.goto(base)
          await page.getByText('Private data is unavailable.', { exact: true }).waitFor()
          assert.equal(await page.locator('iframe').count(), 0)
          assert.ok(!(await page.locator('body').innerText()).includes('synthetic50@example.test'))
          await page.screenshot({ path: resolve(artifacts, 'task-8-vault-error.png'), fullPage: true })
        } finally {
          await rename(`${deps.root}-unavailable`, deps.root)
        }
        assert.deepEqual(h.outbound, [])
        assert.deepEqual(externalRequests, [])
        assert.deepEqual(errors, [])
        await context.close()
      } finally {
        await browser?.close()
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
      }
    })
  } finally {
    if (artifactRoot) console.log(`Synthetic preview screenshots: ${artifacts}`)
    else await rm(artifacts, { recursive: true, force: true })
  }
})
