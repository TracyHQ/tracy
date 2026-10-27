/**
 * The audit's `dead-buttons` check (PAGE-5), decision of 11/10/2026: on BLANK the site is the demo, so a button that leads
 * nowhere is a defect only beyond the demo page's own ones; on FULL every action button that leads nowhere is one (a void
 * button leads to the Contact page there). Measured on g60-ess-j-blank: the demo's own `#` button was counted as a defect of
 * the build.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { auditBuiltSite } from '../lib/template-customization-question-readiness-built-site/audit.mjs'

const page = (/** @type {string} */ buttons) =>
  `<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1>${buttons}</main></body></html>`
const DEMO_HOME = page(
  '<a class="btn btn-primary" href="#">Learn more</a><a class="btn" href="/about">About</a>'
)
const SITE_HOME = page(
  '<a class="btn btn-primary" href="#">Learn more</a><a class="btn" href="#">Book a table</a><a class="btn" href="/about">About</a>'
)
const SITE = 'https://site.test'
const DEMO = 'https://demo.test'

function fetchOf(/** @type {Record<string, Record<string, string>>} */ pages) {
  return async (/** @type {string} */ url) => {
    const u = new URL(url)
    const body = pages[u.origin]?.[u.pathname] ?? null
    return new Response(body ?? 'Not found', { status: body === null ? 404 : 200 })
  }
}

const audit = (/** @type {'blank' | 'full'} */ set) =>
  auditBuiltSite({
    site: SITE,
    demo: DEMO,
    set,
    lang: 'en',
    names: ['Golden Crust'],
    demoNames: ['Demo Co'],
    fetch: /** @type {any} */ (
      fetchOf({
        [SITE]: { '/': SITE_HOME, '/about': page('') },
        [DEMO]: { '/': DEMO_HOME, '/about': page('') }
      })
    )
  })

const dead = async (/** @type {'blank' | 'full'} */ set) =>
  (await audit(set)).checks.find((c) => c.id === 'dead-buttons')

test('BLANK: the demo page’s own button to nowhere is the template’s; only the one beyond it is flagged', async () => {
  const check = await dead('blank')
  assert.equal(check.outcome, 'FAIL')
  assert.equal(check.items.length, 1, check.items.join(' | '))
  assert.match(check.items[0], /→ #/)
})

test('FULL: every action button that leads nowhere is flagged', async () => {
  const check = await dead('full')
  assert.equal(check.items.length, 2, check.items.join(' | '))
})
