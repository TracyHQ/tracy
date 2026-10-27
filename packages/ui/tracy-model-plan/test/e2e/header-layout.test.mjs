/** Real dsh header and job control measured with Tracy's actual chip and stylesheet in Chromium. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.resolve(here, '../..')
const repo = path.resolve(pkg, '../../..')
const dsh = path.join(repo, 'vendor/tracy/deepseek-harness/packages/client')
const require = createRequire(import.meta.url)
let browser
let script
let css
let scratch

before(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'tracy-header-layout-'))
  const tailwind = path.join(scratch, 'tailwind.css')
  execFileSync(
    process.execPath,
    [
      path.join(pkg, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
      '--input',
      path.join(pkg, 'src/client/model-plan.css'),
      '--output',
      tailwind,
      '--minify'
    ],
    { cwd: pkg, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const built = await require('esbuild').build({
    stdin: {
      resolveDir: path.join(pkg, 'src/client'),
      loader: 'tsx',
      contents: `
        import { createElement, useState } from 'react'
        import { createRoot } from 'react-dom/client'
        import { ConversationHeader } from '${dsh}/ui-conversation/src/client/skeleton/ConversationHeader.tsx'
        import header from '${dsh}/ui-conversation/src/client/skeleton/ConversationRoot.module.css'
        import { JobListAction } from '${dsh}/ui-jobs/src/client/JobListAction.tsx'
        import { en as jobsEn } from '${dsh}/ui-jobs/src/client/locales.ts'
        import { SiteChip, HEADER_CSS } from '${repo}/packages/site/tracy-my-sites/src/client/site-chip.tsx'
        import { ModelChipView } from './ModelChip'
        import { en } from './strings'
        import { STYLES } from './styles'
        import { installHeaderJobs } from './header-jobs'
        const translate = (dictionary) => (key, params = {}) => String(dictionary[key] ?? key)
          .replace(/\\{(\\w+)\\}/g, (_, name) => String(params[name] ?? ''))
        const noop = () => {}
        installHeaderJobs()
        function Harness() {
        const [count, setCount] = useState(1)
        window.setHeaderJobCount = setCount
        const jobs = { rows: { s1: Array.from({ length: count }, (_, i) => ({ id: 'j' + i, status: 'completed', startedAt: 1, finishedAt: 2 })) }, observed: {} }
        const slot = (name, children) => <div data-slot={name} style={{ display: 'contents' }}>{children}</div>
        const style = document.createElement('style')
        style.textContent = HEADER_CSS + '\\n' + STYLES
        document.head.append(style)
        const renderSlot = (name) => name === 'conversation.header.leading'
          ? slot(name, <SiteChip t={translate({ 'picker.label': 'Choose site' })} openMySites={noop} />)
          : slot(name, <div className={header.titleRow}>
              <div className={header.titleCluster}>
                <nav className={header.crumbs}><span className={header.crumbCurrent}>Chat</span></nav>
                <div className={header.headerActions}>
                  {slot('conversation.session.header.actions', <>
                    <span className="tracy-model-chip-row flex items-center gap-2">
                      <ModelChipView t={translate(en)} chip={{ kind: 'plan', vendor: 'Tracy AI', model: 'Claude Opus 5.5' }} />
                    </span>
                    <JobListAction sessionId="s1" useJobs={(select) => select(jobs)}
                      watchRows={() => noop} observe={() => noop} killJob={async () => true} t={translate(jobsEn)} />
                  </>)}
                </div>
              </div>
              <div className={header.headerUtilities}>
                {slot('conversation.session.header.utilities', <button aria-label="Chat options" style={{ width: 50, height: 28 }}>Voice</button>)}
              </div>
              <div className={header.headerCorner}>
                {slot('conversation.session.header.corner', <button aria-label="More" style={{ width: 28, height: 28 }}>⋯</button>)}
              </div>
            </div>)
        return <ConversationHeader sessionId="s1"
          useSession={(select) => select({ blank: false, running: false, awaitingFirstTurn: false })}
          useConversation={(select) => select({ activeTargets: new Set() })} renderSlot={renderSlot} />
        }
        createRoot(document.getElementById('root')).render(<Harness />)
      `
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json'))
    },
    loader: { '.css': 'text', '.module.css': 'local-css' },
    define: {
      __TAILWIND_CSS__: JSON.stringify(readFileSync(tailwind, 'utf8')),
      'process.env.NODE_ENV': '"production"'
    },
    outfile: path.join(scratch, 'header.js'),
    write: false,
    logLevel: 'silent'
  })
  script = built.outputFiles.find((file) => file.path.endsWith('.js')).text
  css = built.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? ''
  const { chromium } = createRequire(path.join(repo, 'apps/tracy-host/package.json'))('playwright')
  browser = await chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] })
})

after(async () => {
  await browser?.close()
  if (scratch) rmSync(scratch, { recursive: true, force: true })
})

/**
 * Measure the header at one width and theme, for one and twelve jobs. A long site name (as on dev,
 * `g66-ess-wp-blank`) leaves no room for the model too: the site chip keeps its name, the model gives
 * way, and every control stays in the header; the model's own steps are measured with a short name.
 */
async function verifyHeader(page, { script, css, width, theme, siteName }) {
  await page.route('http://header.test/**', async (route) => {
    if (route.request().url().includes('/api/sites'))
      return route.fulfill({
        json: { sites: [{ siteKey: 'tracy.test', displayName: siteName, platform: 'wordpress' }] }
      })
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><div id="root"></div></body></html>'
    })
  })
  await page.goto('http://header.test/tracy.test/')
  await page.evaluate(
    (dark) => document.documentElement.toggleAttribute('data-ds-dark-theme', dark),
    theme === 'dark'
  )
  await page.addStyleTag({
    content: css + `body { margin: 0; font-family: sans-serif; } #root { width: ${width}px; }`
  })
  await page.addScriptTag({ content: script })
  await page.waitForSelector('.tracy-site-chip [title="WordPress"]')
  const results = []
  for (const count of [1, 12]) {
    await page.evaluate((count) => window.setHeaderJobCount(count), count)
    await page.waitForFunction(
      (count) =>
        document.querySelector('[data-tracy-job-count]')?.getAttribute('data-tracy-job-count') ===
        String(count),
      count
    )
    // The site chip's ceiling follows the header a frame after a change (tracy-my-sites header-room.ts).
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
    const measurements = await page.evaluate(() => {
      const header = document.querySelector('header')
      const chip = document.querySelector('[data-model-chip]')
      const job = document.querySelector(
        '[data-slot="conversation.session.header.actions"] button[aria-label]'
      )
      const count = job.querySelector('[class*="_count"]')
      const box = (node) => {
        const b = node.getBoundingClientRect()
        return { left: b.left, right: b.right, width: b.width, height: b.height }
      }
      return {
        header: box(header),
        job: box(job),
        count: box(count),
        jobLabel: job.getAttribute('aria-label'),
        jobTitle: job.getAttribute('title'),
        compactCount: job.getAttribute('data-tracy-job-count'),
        chip: box(chip),
        chipDisplay: getComputedStyle(chip).display,
        chipOverflow: getComputedStyle(chip).textOverflow,
        chipScrollWidth: chip.scrollWidth,
        chipTitle: chip.getAttribute('title'),
        countWhiteSpace: getComputedStyle(count).whiteSpace,
        badgeContent: getComputedStyle(job, '::before').content,
        // Every control of the header row, the site chip through the corner's More button.
        controls: [...header.querySelectorAll('button')].map((b) => [
          b.getAttribute('aria-label') ?? b.textContent,
          b.getBoundingClientRect().right
        ])
      }
    })
    const fullLabel = `${count} background ${count === 1 ? 'job' : 'jobs'}`
    results.push({ width, theme, count, ...measurements })
    assert.ok(measurements.job.height <= 32, `Job trigger wrapped: ${JSON.stringify(measurements)}`)
    assert.equal(measurements.jobLabel, fullLabel)
    assert.equal(measurements.compactCount, String(count))
    assert.equal(measurements.jobTitle, fullLabel)
    const short = siteName === 'tracy'
    if (short && width >= 300) {
      assert.ok(measurements.chip.width > 20, `Model chip disappeared: ${JSON.stringify(measurements)}`)
      assert.equal(measurements.chipOverflow, 'ellipsis')
      assert.equal(measurements.chipTitle, 'Tracy AI · Claude Opus 5.5')
    }
    if (width <= 400) {
      assert.ok(measurements.job.width <= 60, 'Narrow job action must show icon and count')
      assert.equal(measurements.badgeContent, `"${count}"`)
      assert.equal(measurements.count.width, 0, 'The full job label is hidden in compact mode')
    }
    if (short && width === 300)
      assert.ok(measurements.chipScrollWidth > measurements.chip.width, 'The model truncates before hiding')
    if (short && width === 220)
      assert.equal(measurements.chip.width, 0, 'The model hides only at the smallest header width')
    assert.ok(measurements.job.right <= measurements.header.right, 'Job action escaped the header')
    for (const [label, right] of measurements.controls)
      assert.ok(
        right <= measurements.header.right + 0.5,
        `${label} left the header at ${width}px: ${JSON.stringify(measurements.controls)}`
      )
  }
  return results
}

for (const siteName of ['tracy', 'g66-ess-wp-blank']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [800, 400, 300, 270, 250, 220]) {
      test(`header stays one line at ${width}px in ${theme}, site ${siteName}`, async () => {
        const page = await browser.newPage({ viewport: { width: 1000, height: 500 } })
        try {
          console.log(JSON.stringify(await verifyHeader(page, { script, css, width, theme, siteName })))
        } finally {
          await page.close()
        }
      })
    }
  }
}
