/**
 * The creation workspace (`/new/`) names no site (bug 01/10/2026): the `tracy_site` pointer a
 * previous page left behind must not bind that old site to the creation screen.
 */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { currentSiteKey } from '../src/client/current-site.ts'

/** Stand a page up: its address, its `<base href>`, and its cookies. */
function page(pathname, base, cookie) {
  globalThis.location = {
    pathname,
    href: `https://cowork.tracy.site${pathname}`,
    origin: 'https://cowork.tracy.site'
  }
  globalThis.document = { cookie, querySelector: () => ({ getAttribute: () => base }) }
}

afterEach(() => {
  delete globalThis.location
  delete globalThis.document
})

test('on /new/ a leftover pointer cookie names no site', () => {
  page('/new/s/session-6eaa8fe4', '/new/', 'tracy_site=kineticakemi.tracy.site')
  assert.equal(currentSiteKey(), null)
})

test("a site's own mount still names its site, and the pointer still answers at a bare root", () => {
  page('/kineticakemi.tracy.site/s/session-1', '/kineticakemi.tracy.site/', 'tracy_site=other.tracy.site')
  assert.equal(currentSiteKey(), 'kineticakemi.tracy.site')
  page('/s/session-1', '/', 'tracy_site=other.tracy.site')
  assert.equal(currentSiteKey(), 'other.tracy.site')
})
