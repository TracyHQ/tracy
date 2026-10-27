#!/usr/bin/env node
// Render every page of a design source served on a local origin, at the viewports and themes the
// acceptance matrix uses, and keep what a later comparison needs: screenshot, DOM, visible text,
// console errors, and a measurements JSON (document size, horizontal overflow, fonts used).
//
//   node tools/render-source.mjs <base-url> <out-dir> [--pages a.html,b.html] [--dark-attr data-theme]
//
// Browser: Playwright's bundled Chromium. Screenshots are JPEG to keep evidence small.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from './qa-browser.mjs'

const args = process.argv.slice(2)
const base = args[0]
const outDir = args[1]
if (!base || !outDir) {
  console.error(
    'usage: render-source.mjs <base-url> <out-dir> [--pages a.html,b.html] [--dark-attr data-theme]'
  )
  process.exit(2)
}
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const pages = (opt('--pages', '') || '').split(',').filter(Boolean)
const darkAttr = opt('--dark-attr', 'data-theme')
const VIEWPORTS = [
  ['1440', 1440, 1000],
  ['390', 390, 844]
]
const THEMES = ['light', 'dark']
mkdirSync(outDir, { recursive: true })

// The renderer is chosen once, in qa-browser.mjs: the Chromium Playwright itself ships by default,
// the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no silent fallback either
// way. This file used to prefer the installed Chrome -- measured 2026-09-17, that is 152.0.7977.84
// against Playwright's 153.0.8010.12, and Chrome updates itself, so two runs a week apart could
// not be compared and nothing in the output said which binary had drawn them. ⚠ This file does not
// record `browserIdentity()`; only visual-qa does. What it gains here is a renderer nobody has to
// guess at, not a trace in its own output.
// Both opt-ins this function used to spell out live in qa-browser.mjs now -- RENDER_CHROME_PATH for
// an explicit binary, RENDER_CHROME_CHANNEL for the installed Chrome -- and neither falls back to
// another browser when it cannot launch, because a quiet fallback renders with a browser nobody
// chose and leaves the pin true only on paper.
const browser = await launchBrowser()
const manifest = {
  base,
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  themes: THEMES,
  deviceScaleFactor: 1,
  pages: []
}
for (const page of pages) {
  for (const theme of THEMES) {
    for (const [vpName, w, h] of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce'
      })
      const p = await ctx.newPage()
      const errors = []
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      p.on('pageerror', (e) => errors.push(String(e)))
      const url = `${base}/${page.split('/').map(encodeURIComponent).join('/')}`
      await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
      await p
        .waitForFunction(() => document.body.innerText.trim().length > 200, null, { timeout: 30000 })
        .catch(() => {})
      if (theme === 'dark') {
        await p.evaluate((a) => document.documentElement.setAttribute(a, 'dark'), darkAttr)
        await p.waitForTimeout(300)
      }
      await p.evaluate(() => document.fonts.ready)
      const slug = page
        .replace(/\.html$/, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .toLowerCase()
      const stem = path.join(outDir, `${slug}--${vpName}-${theme}`)
      const m = await p.evaluate(() => ({
        title: document.title,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
        fonts: [
          ...new Set(
            [...document.querySelectorAll('body *')].slice(0, 3000).map((e) => getComputedStyle(e).fontFamily)
          )
        ].slice(0, 12),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
        links: document.querySelectorAll('a').length,
        images: document.querySelectorAll('image-slot, img').length
      }))
      if (theme === 'light' && vpName === '1440') {
        writeFileSync(`${stem}.html`, await p.evaluate(() => document.documentElement.outerHTML))
        writeFileSync(path.join(outDir, `${slug}.txt`), await p.evaluate(() => document.body.innerText))
      }
      await p.screenshot({ path: `${stem}.jpg`, fullPage: true, type: 'jpeg', quality: 72 })
      manifest.pages.push({ page, slug, viewport: vpName, theme, ...m, errors })
      await ctx.close()
      console.log(
        `ok ${slug} ${vpName} ${theme} ${m.scrollWidth}x${m.scrollHeight}${m.overflowX ? ' OVERFLOW' : ''}${errors.length ? ` errors=${errors.length}` : ''}`
      )
    }
  }
}
await browser.close()
writeFileSync(path.join(outDir, 'render-manifest.json'), JSON.stringify(manifest, null, '\t') + '\n')
console.log(`wrote ${manifest.pages.length} renders to ${outDir}`)
