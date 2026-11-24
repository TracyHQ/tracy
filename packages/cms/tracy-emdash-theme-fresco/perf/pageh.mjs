// node perf/pageh.mjs <origin> <width> <path>... : the document height of each page (a quick drift check between two sites)
import { chromium } from 'playwright'
const [, , origin, width, ...paths] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
for (const path of paths) {
  await p.goto(origin + path, { waitUntil: 'load' })
  await p.waitForTimeout(700)
  process.stdout.write(`${path}:${await p.evaluate(() => document.documentElement.scrollHeight)} `)
}
console.log()
await b.close()
