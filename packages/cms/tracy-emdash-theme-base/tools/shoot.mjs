#!/usr/bin/env node
// Screenshot site URLs at the acceptance viewports/themes and record console errors, overflow and
// hydration warnings. Same browser choice as render-source.mjs.
//
//   node tools/shoot.mjs <base-url> <out-dir> --paths /,/about[,...] [--viewports 1440,390] [--themes light,dark]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from './qa-browser.mjs'

const args = process.argv.slice(2)
const [base, outDir] = args
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
if (!base || !outDir) {
  console.error('usage: shoot.mjs <base-url> <out-dir> --paths /,/about')
  process.exit(2)
}
const paths = (opt('--paths', '/') || '/').split(',')
const viewports = (opt('--viewports', '1440,390') || '').split(',').map(Number)
const themes = (opt('--themes', 'light,dark') || '').split(',')
const config = JSON.parse(readFileSync(opt('--config', 'template.config.json'), 'utf8'))
const themeHook = config.qa?.theme
if (
  !themeHook?.selector ||
  !themeHook?.attribute ||
  !themeHook?.values ||
  themes.some((t) => !(t in themeHook.values))
) {
  console.error(
    'Configure qa.theme selector/attribute/values and optional storageKey before capturing themes'
  )
  process.exit(1)
}
const HEIGHTS = { 1440: 1000, 1280: 800, 768: 1024, 390: 844 }
mkdirSync(outDir, { recursive: true })
// The renderer is chosen once, in qa-browser.mjs: Playwright's own Chromium by default (the build
// the lockfile pins), the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no
// silent fallback either way. This file used to prefer the installed Chrome -- measured 2026-09-17,
// that is 152.0.7977.84 against the lockfile's 153.0.8010.12, and Chrome updates itself, so two
// runs a week apart could not be compared and nothing in the output said which had drawn them.
// Both opt-ins this function used to spell out live in qa-browser.mjs now -- RENDER_CHROME_PATH for
// an explicit binary, RENDER_CHROME_CHANNEL for the installed Chrome -- and neither falls back to
// another browser when it cannot launch, because a quiet fallback renders with a browser nobody
// chose and leaves the pin true only on paper.
const browser = await launchBrowser()
const manifest = { base, generatedAt: new Date().toISOString(), viewports, themes, shots: [] }
for (const p of paths) {
  for (const theme of themes) {
    for (const w of viewports) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: HEIGHTS[w] ?? 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce'
      })
      if (themeHook.storageKey)
        await ctx.addInitScript(
          ({ key, value }) => {
            try {
              value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)
            } catch {}
          },
          { key: themeHook.storageKey, value: themeHook.values[theme] ?? null }
        )
      const page = await ctx.newPage()
      const errors = [],
        warnings = []
      // "Failed to load resource" carries no URL and fires for the document itself on an expected
      // 404 page; failed sub-resources are taken from the response stream instead (with their URL).
      page.on('response', (r) => {
        if (r.status() >= 400 && r.request().resourceType() !== 'document')
          errors.push(`${r.status()} ${r.url()}`)
      })
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
        if (m.type() === 'warning') warnings.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(String(e)))
      let res = await page.goto(`${base}${p}`, { waitUntil: 'networkidle', timeout: 60000 })
      // A client-side redirect (e.g. a stored locale/theme) can replace the document right after
      // load; wait for it to settle and re-attach rather than dying mid-capture.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.evaluate(() => document.fonts.ready)
          break
        } catch (e) {
          if (!/Execution context was destroyed/.test(String(e)) || attempt === 2) throw e
          await page.waitForLoadState('networkidle').catch(() => {})
          res = res ?? null
        }
      }
      // Walk the page so lazy images load before the full-page capture.
      await page.evaluate(async () => {
        const h = document.documentElement.scrollHeight
        for (let y = 0; y < h; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 40))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(300)
      const m = await page.evaluate(() => ({
        title: document.title,
        h1: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        observedTheme: null,
        fonts: [
          ...new Set(
            [...document.querySelectorAll('body *')].slice(0, 2000).map((e) => getComputedStyle(e).fontFamily)
          )
        ].slice(0, 6),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        islands: document.querySelectorAll('astro-island').length,
        hydrated: [...document.querySelectorAll('astro-island')].filter(
          (e) => e.hasAttribute('ssr') === false
        ).length
      }))
      m.observedTheme = await page.locator(themeHook.selector).getAttribute(themeHook.attribute)
      const images = await page.locator('img').evaluateAll(async (els) =>
        Promise.all(
          els
            .filter((e) => e.getClientRects().length)
            .map(async (img) => {
              try {
                await img.decode()
              } catch {}
              return { src: img.currentSrc, complete: img.complete, naturalWidth: img.naturalWidth }
            })
        )
      )
      const slug = (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-')) || 'home'
      const file = path.join(outDir, `${slug}--${w}-${theme}.jpg`)
      await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 72 })
      const shot = {
        path: p,
        status: res?.status(),
        viewport: w,
        theme,
        file: path.basename(file),
        ...m,
        images,
        errors,
        warnings: warnings.filter((x) => /hydrat|mismatch/i.test(x))
      }
      manifest.shots.push(shot)
      console.log(
        `ok ${p} ${w} ${theme} status=${shot.status} ${m.scrollWidth}x${m.scrollHeight}${m.overflowX ? ' OVERFLOW' : ''} islands=${m.islands}/${m.hydrated}${errors.length ? ` errors=${errors.length}` : ''}`
      )
      await ctx.close()
    }
  }
}
await browser.close()
writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(manifest, null, '\t') + '\n')
const failures = manifest.shots.filter(
  (s) =>
    s.overflowX ||
    s.errors.length ||
    s.warnings.length ||
    s.hydrated !== s.islands ||
    s.observedTheme !== (themeHook.values[s.theme] ?? null) ||
    s.images.some((i) => !i.complete || i.naturalWidth === 0) ||
    s.status !== (config.qa?.expectedStatus?.[s.path] ?? 200)
)
process.exitCode = failures.length ? 1 : 0
