#!/usr/bin/env node
// Hover and keyboard-focus states of this template's interactive parts, measured and photographed.
// For each role (a selector on a page) in both themes: the element's computed look at rest, under the pointer
// (`:hover`) and with keyboard focus (`:focus-visible`); a role passes when hover changes something the visitor
// can see (colour, background, border, underline, shadow, opacity, transform) and focus draws something
// (outline, ring, border or colour). Every state is also cut out as a picture (`<out>/<role>--<theme>--<state>.png`,
// the element plus 14 px) so the `interaction` lens can look at it.
//   node tools/states-check.mjs <site-origin> <out-dir> [--source-site <origin>]
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from './qa-browser.mjs'

const [site, out] = process.argv.slice(2)
if (!site || !out) {
  console.error('usage: states-check.mjs <site-origin> <out-dir>')
  process.exit(2)
}
mkdirSync(out, { recursive: true })

// role id, page, selector, [pre-step selector to click first], [why hover is not required]
const ROLES = [
  ['nav-link', '/about-us', '.dn-nav-inner li:not(.is-active) a'],
  [
    'nav-link-active',
    '/about-us',
    '.dn-nav-inner li.is-active a',
    null,
    'the current page already shows the accent colour'
  ],
  [
    'menu-button',
    '/',
    '.dn-nav-btn.is-first',
    null,
    'source: the toggle keeps its colour under the pointer (measured on the source render, #c36349 at rest and on hover)'
  ],
  ['theme-button', '/', '.dn-nav-btn.is-last'],
  ['offcanvas-link', '/', '#offcanvas li:nth-child(3) a', '[data-offcanvas-toggle]'],
  ['button', '/offers', 'main .dn-btn'],
  ['button-inverse', '/', '.dn-btn.is-inverse'],
  ['text-link', '/', '.dn-link'],
  ['card-title', '/', '.dn-card h3 a'],
  ['read-more', '/our-blog', '.dn-readmore'],
  ['card-image', '/our-blog', '.dn-card-img'],
  ['pagination', '/our-blog', '.dn-pagination a[href]:not(.is-active)'],
  ['aside-link', '/our-blog', '.dn-aside a'],
  ['footer-link', '/', '.dn-footer-cols a'],
  ['social-icon', '/about-us', '.is-facebook'],
  [
    'subscribe-input',
    '/',
    '.dn-subscribe-form input[type=email]',
    null,
    'a text field has no hover look (the source has none); focus is what matters'
  ],
  ['subscribe-button', '/', '.dn-subscribe-form button'],
  ['search-input', '/search?q=menu', '#dn-q', null, 'a text field has no hover look; focus is what matters'],
  ['search-button', '/search?q=menu', '.dn-search-row .dn-btn'],
  ['search-result', '/search?q=menu', '.dn-search-results a'],
  [
    'form-input',
    '/contact-us',
    '.ec-form-input',
    null,
    'a text field has no hover look; focus is what matters'
  ],
  ['form-submit', '/contact-us', '.ec-form-submit'],
  ['gallery-next', '/', '[data-gallery-next]'],
  ['tab', '/', '[role=tab][aria-selected=false]']
]
const PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-style',
  'outline-width',
  'outline-color',
  'box-shadow',
  'text-decoration-line',
  'opacity',
  'transform'
]
const VIEWPORT = { width: 1440, height: 900 }
const browser = await launchBrowser()
const results = []

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: VIEWPORT })
  await context.addInitScript((t) => {
    try {
      if (t === 'dark') localStorage.setItem('tracy-diner-theme', 'dark')
      else localStorage.removeItem('tracy-diner-theme')
    } catch {}
  }, theme)
  const page = await context.newPage()
  for (const [id, url, selector, pre, noHover] of ROLES) {
    const record = { role: id, theme, page: url, selector, states: {}, findings: [] }
    results.push(record)
    await page.goto(new URL(url, site).href, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({
      content: '*,*::before,*::after{transition:none!important;animation:none!important}'
    })
    if (pre) await page.locator(pre).first().click()
    const loc = page.locator(selector).first()
    if (!(await loc.count())) {
      record.findings.push(`selector matches nothing: ${selector}`)
      continue
    }
    await loc.scrollIntoViewIfNeeded()
    // lazy pictures above the element load as it scrolls into view and move it: let the page settle before any box is read
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    const read = () =>
      loc.evaluate((e, props) => {
        const s = getComputedStyle(e)
        const o = Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]))
        const r = e.getBoundingClientRect()
        o.box = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`
        return o
      }, PROPS)
    const crop = async (state) => {
      const box = await loc.boundingBox()
      if (!box) return
      const x = Math.max(0, box.x - 14),
        y = Math.max(0, box.y - 14)
      const file = `${id}--${theme}--${state}.png`
      await page.screenshot({
        path: path.join(out, file),
        clip: {
          x,
          y,
          width: Math.min(VIEWPORT.width - x, box.width + 28),
          height: Math.min(VIEWPORT.height - y, box.height + 28)
        }
      })
      record.states[state].picture = file
    }
    await page.mouse.move(2, 2)
    record.states.rest = { style: await read() }
    await crop('rest')
    // pointer
    const b = await loc.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    record.states.hover = { style: await read() }
    await crop('hover')
    await page.mouse.move(2, 2)
    // keyboard: one Tab sets the keyboard modality, then focus the element
    await page.keyboard.press('Tab')
    await loc.focus()
    record.states.focus = {
      style: await read(),
      focusVisible: await loc.evaluate((e) => e.matches(':focus-visible'))
    }
    await crop('focus')
    const diff = (a, c) => PROPS.filter((p) => a[p] !== c[p])
    const rest = record.states.rest.style
    record.hoverChanges = diff(rest, record.states.hover.style)
    record.focusChanges = diff(rest, record.states.focus.style)
    // the box must not jump on hover or focus
    if (rest.box !== record.states.hover.style.box)
      record.findings.push(`box moves on hover: ${rest.box} → ${record.states.hover.style.box}`)
    if (noHover) record.hoverExempt = noHover
    else if (!record.hoverChanges.length) record.findings.push('hover changes nothing the visitor can see')
    if (!record.states.focus.focusVisible)
      record.findings.push('keyboard focus does not match :focus-visible')
    else if (!record.focusChanges.length) record.findings.push('keyboard focus draws nothing')
  }
  await context.close()
}

// the open off-canvas menu (the tablet menu included): one picture per width and theme for the `interaction` lens
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } })
    await context.addInitScript((t) => {
      try {
        if (t === 'dark') localStorage.setItem('tracy-diner-theme', 'dark')
        else localStorage.removeItem('tracy-diner-theme')
      } catch {}
    }, theme)
    const page = await context.newPage()
    await page.goto(new URL('/', site).href, { waitUntil: 'networkidle' })
    await page.locator('[data-offcanvas-toggle]').click()
    const links = await page.locator('#offcanvas a:visible').count()
    const file = `menu-open--${width}--${theme}.png`
    await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: 0, width, height: 520 } })
    const rec = {
      role: `menu-open-${width}`,
      theme,
      page: '/',
      selector: '#offcanvas a',
      states: { open: { picture: file } },
      findings: []
    }
    if (links !== 6) rec.findings.push(`the open menu shows ${links} links, expected 6`)
    results.push(rec)
    await context.close()
  }
}
await browser.close()
const failed = results.filter((r) => r.findings.length)
writeFileSync(
  path.join(out, 'states.json'),
  `${JSON.stringify({ site, capturedAt: new Date().toISOString(), roles: results.length, failed: failed.length, results }, null, 2)}\n`
)
for (const r of failed) console.log(`FAIL ${r.role} ${r.theme}: ${r.findings.join(' | ')}`)
console.log(
  `states-check: ${results.length - failed.length}/${results.length} role×theme pass -> ${path.join(out, 'states.json')}`
)
process.exitCode = failed.length ? 1 : 0
