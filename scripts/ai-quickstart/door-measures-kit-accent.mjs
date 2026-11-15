/**
 * `door-measures.mjs` part L: the accent written as the mapping file declares it (`look.accent.writtenAs`), read in a
 * browser on both sides of the template (`?theme=light`, `?theme=dark`). The module text is the one the brand and
 * write steps build (`accentModule`, apps/tracy-web/src/lib/brand-accent) from the stylesheets the site serves, with a
 * different fill on each side, so the computed colours say which value prints on which side.
 */
import { accentModule } from '../../apps/tracy-web/src/lib/brand-accent/accent-module.js'
import { K } from './door-measures-lib.mjs'

// Invented colours, one per side, far from the template's own accent.
const LIGHT = '#1f6f5c'
const DARK = '#3fbf9c'

/** The computed accent of a page in the browser: the variables, a link and the active main menu item. */
async function readSide(chromium, url, variables) {
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext()).newPage()
    await page.goto(url, { waitUntil: 'load' })
    return await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement)
      const body = getComputedStyle(document.body)
      const link = document.querySelector('#t4-main-body a, .t4-footer a, a')
      return {
        bodyClass: document.body.className.split(/\s+/).filter((c) => /active|theme/.test(c)),
        root: Object.fromEntries(names.map((n) => [n, root.getPropertyValue(n).trim()])),
        body: Object.fromEntries(names.map((n) => [n, body.getPropertyValue(n).trim()])),
        tracyAccent: root.getPropertyValue('--tracy-accent').trim(),
        link: link ? getComputedStyle(link).color : null,
        styleElements: document.querySelectorAll('style#tracy-ds-slot').length
      }
    }, variables)
  } finally {
    await browser.close()
  }
}

export async function measureAccent(ctx) {
  const { door, mapping, fact } = ctx
  const accent = mapping.look.accent
  const w = accent.writtenAs
  const at = `index.php?Itemid=${ctx.pages.inner}`
  const html = (await ctx.html(at)).html
  const hrefs = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /rel="stylesheet"/.test(tag))
    .map((tag) => /href="([^"]+)"/.exec(tag)?.[1])
    .filter(Boolean)
  const sheets = []
  for (const href of hrefs) {
    const url = new URL(href.replace(/&amp;/g, '&'), `${ctx.base}/`)
    if (url.host !== new URL(ctx.base).host) continue
    const r = await fetch(url)
    if (r.ok) sheets.push(await r.text())
  }
  const made = accentModule({
    sheets,
    colours: {
      accent: LIGHT,
      replaces: '#f44141',
      shifts: [
        { side: 'dark', opens: accent.sides.opensOn === 'dark', colour: 'accent', to: DARK },
        { side: 'dark', colour: 'accent-text', to: DARK }
      ]
    },
    darkHook: accent.sides.darkHook ?? null
  })
  if (made.problem) return fact('L1 accent module', { problem: made.problem, sheets: sheets.length })
  const { chromium } = await import('@playwright/test')
  const url = (theme) => `${ctx.base}/${at}&theme=${theme}`
  const before = {
    light: await readSide(chromium, url('light'), accent.variables),
    dark: await readSide(chromium, url('dark'), accent.variables)
  }
  const record = await door.get('module', 170)
  const id = await door.made('module', 0, {
    ...K.copyFields(record),
    module: w.module,
    title: w.title,
    position: w.position,
    ordering: w.ordering ?? 0,
    showtitle: w.showtitle ?? 0,
    params: JSON.stringify({ ...JSON.parse(record.params || '{}'), style: w.style ?? '' }),
    content: made.html,
    note: ctx.alias('accent')
  })
  await door.made('moduleAssignment', id, { menuids: '[0]' })
  const after = {
    light: await readSide(chromium, url('light'), accent.variables),
    dark: await readSide(chromium, url('dark'), accent.variables)
  }
  const stored = await door.get('module', id)
  fact('L1 accent module written as look.accent.writtenAs declares it', {
    sent: {
      light: LIGHT,
      dark: DARK,
      darkHook: accent.sides.darkHook,
      bytes: made.bytes,
      routes: made.routes
    },
    readBack: stored?.content === made.html,
    toneRules: made.html
      .split('\n')
      .filter((l) => l.startsWith(':root'))
      .slice(0, 3),
    before,
    after,
    printedOnce: (await ctx.html(at)).html.split('id="tracy-ds-slot"').length - 1
  })
}
