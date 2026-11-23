import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const seen = new Map()
for (const u of [
  '/',
  '/menu',
  '/about',
  '/gallery',
  '/chiefs',
  '/offer',
  '/contact',
  '/blog',
  '/blog/savoring-the-art-of-cooking',
  '/search?q=food',
  '/404'
]) {
  await p.goto('http://127.0.0.1:4360' + u, { waitUntil: 'load' })
  const r = await p.evaluate(() =>
    [...document.querySelectorAll('main h1,main h2,main h3,main h4,.fr-footer h3,main p,main span')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map(
        (e) =>
          e.tagName.toLowerCase() +
          '.' +
          (e.className || '').toString().split(' ').filter(Boolean).join('.') +
          ' < ' +
          (e.parentElement?.className || '').toString().split(' ')[0]
      )
  )
  for (const k of r) seen.set(k, (seen.get(k) ?? new Set()).add(u))
}
for (const [k, v] of seen) if (/^h|fr-/.test(k)) console.log(k, [...v].join(' '))
await b.close()
