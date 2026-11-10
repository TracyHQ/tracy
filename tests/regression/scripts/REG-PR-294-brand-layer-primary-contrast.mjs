import { createRequire } from 'node:module'
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  req = createRequire(join(root, 'package.json'))
execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/test/primary-contrast.test.mjs'], {
  cwd: root,
  stdio: 'inherit'
})
const dir = mkdtempSync(join(tmpdir(), 'tracy-primary-contrast-'))
execFileSync(
  'pnpm',
  [
    '--filter',
    '@tracy/dsh-add-site',
    'exec',
    'tailwindcss',
    '-i',
    'src/client/add-site.css',
    '-o',
    join(dir, 'style.css')
  ],
  { cwd: root, stdio: 'ignore' }
)
await req('esbuild').build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {Button} from './packages/ui/tracy-ui/src/components/ui/button'; export const html=renderToStaticMarkup(<main><h2>Primary controls</h2><Button id="primary">Save changes</Button><Button id="destructive" variant="destructive">Delete site</Button><Button id="link" variant="link">Read more</Button></main>);`,
    resolveDir: root,
    loader: 'tsx'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  nodePaths: [join(root, 'packages/core/tracy-core/node_modules')],
  outfile: join(dir, 'render.cjs')
})
const { html } = req(join(dir, 'render.cjs'))
const { primaryTokens } = await import(join(root, 'packages/brand/tracy-brand/src/shared/theme.mjs'))
const { chromium } = req(req.resolve('playwright', { paths: [join(root, 'apps/tracy-host')] }))
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
} catch {
  browser = await chromium.launch()
}
const page = await browser.newPage({ viewport: { width: 800, height: 360 } })
const results = []
try {
  for (const mode of ['light', 'dark'])
    for (const color of [
      '',
      '#5b8def',
      '#00b96b',
      '#ef4444',
      '#f59e0b',
      '#8b5cf6',
      '#ffd400',
      '#fff',
      '#000'
    ]) {
      const layer = primaryTokens(color),
        tokens = Object.entries(layer)
          .map(([k, v]) => `${k}:${v[mode]}`)
          .join(';')
      await page.setContent(
        `<html><head><style>${readFileSync(join(dir, 'style.css'), 'utf8')}body{font:14px system-ui;background:var(--background);color:var(--foreground);padding:40px}button{margin:8px}h2{margin-bottom:24px}main{padding:20px}</style></head><body ${mode === 'dark' ? 'data-ds-dark-theme' : ''} style="${tokens}">${html}</body></html>`
      )
      for (const id of ['primary', 'destructive'])
        for (const hover of [false, true]) {
          await page.mouse.move(0, 0)
          if (hover) await page.locator('#' + id).hover()
          await page.waitForTimeout(250)
          const measured = await page.locator('#' + id).evaluate((el) => {
            const ctx = document.createElement('canvas').getContext('2d')
            ctx.canvas.width = 1
            ctx.canvas.height = 1
            function rgb(color, bg) {
              ctx.clearRect(0, 0, 1, 1)
              if (bg) {
                ctx.fillStyle = bg
                ctx.fillRect(0, 0, 1, 1)
              }
              ctx.fillStyle = color
              ctx.fillRect(0, 0, 1, 1)
              return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
            }
            const style = getComputedStyle(el),
              background = getComputedStyle(document.body).backgroundColor
            const fg = rgb(style.color),
              bg = rgb(style.backgroundColor, background)
            const lum = (a) =>
              a
                .map((c) => c / 255)
                .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
                .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0)
            return {
              fg,
              bg,
              contrast: (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)
            }
          })
          results.push({ mode, color: color || 'default', id, hover, ...measured })
          if (measured.contrast < 4.5) throw new Error(JSON.stringify(results.at(-1)))
        }
      if (!color) await page.screenshot({ path: join(dir, `buttons-${mode}.png`) })
    }
  writeFileSync(join(dir, 'measurements.json'), JSON.stringify(results, null, 2))
  console.log(
    `ok - ${results.length} rendered primary/destructive states meet AA; minimum ${Math.min(...results.map((r) => r.contrast)).toFixed(2)}:1`
  )
  if (process.env.TRACY_CONTRAST_EVIDENCE) {
    const { cpSync, mkdirSync } = await import('node:fs')
    mkdirSync(process.env.TRACY_CONTRAST_EVIDENCE, { recursive: true })
    for (const name of ['buttons-light.png', 'buttons-dark.png', 'measurements.json'])
      cpSync(join(dir, name), join(process.env.TRACY_CONTRAST_EVIDENCE, name))
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
