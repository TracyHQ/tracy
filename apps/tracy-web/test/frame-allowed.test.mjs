/**
 * Whether a page at one origin may frame a demo, read off the demo's own headers — the rule the
 * browser applies, computed on the server so a card can ask BEFORE it mounts an iframe. A
 * cross-origin frame that is refused still fires `load` and paints Chrome's error page, so nothing
 * on the client can tell; this is the only place that can.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { frameAllowed } from '../src/lib/frame-allowed.js'

const demo = 'https://business-joomla.tracy.site'
const apache =
  "frame-ancestors 'self' https://*.tracy.ai http://127.0.0.1:* http://localhost:* https://cowork.tracy.site"

test('the Apache line Tracy writes: the wildcard zone, loopback at any port, and the one named origin', () => {
  for (const origin of [
    'https://cowork.tracy.ai',
    'https://acme.tracy.ai',
    'https://cowork.tracy.site',
    'http://localhost:5200',
    'http://127.0.0.1:8080',
    demo
  ])
    assert.equal(frameAllowed({ csp: apache, demoOrigin: demo }, origin).allowed, true, origin)
  for (const origin of [
    'https://tracy.ai',
    'http://cowork.tracy.site',
    'https://evil.test',
    'https://localhost'
  ])
    assert.equal(frameAllowed({ csp: apache, demoOrigin: demo }, origin).allowed, false, origin)
})

test("the EmDash middleware line: 'self' plus exactly one origin", () => {
  const csp = "frame-ancestors 'self' https://cowork.tracy.site"
  assert.equal(frameAllowed({ csp, demoOrigin: demo }, 'https://cowork.tracy.site').allowed, true)
  assert.equal(frameAllowed({ csp, demoOrigin: demo }, 'https://cowork.tracy.ai').allowed, false)
  assert.equal(frameAllowed({ csp, demoOrigin: demo }, demo).allowed, true, "'self' is the demo itself")
})

test('CSP wins over X-Frame-Options, as the browsers rule; without CSP the old header decides', () => {
  const both = {
    csp: "frame-ancestors 'self' https://cowork.tracy.site",
    xfo: 'SAMEORIGIN',
    demoOrigin: demo
  }
  assert.equal(frameAllowed(both, 'https://cowork.tracy.site').allowed, true)
  const xfoOnly = { xfo: 'SAMEORIGIN', demoOrigin: demo }
  assert.equal(frameAllowed(xfoOnly, 'https://cowork.tracy.site').allowed, false)
  assert.equal(frameAllowed(xfoOnly, 'https://cowork.tracy.site').reason, 'x-frame-options')
  assert.equal(frameAllowed(xfoOnly, demo).allowed, true)
  assert.equal(frameAllowed({ xfo: 'DENY', demoOrigin: demo }, demo).allowed, false)
  assert.equal(
    frameAllowed({ demoOrigin: demo }, 'https://anyone.test').allowed,
    true,
    'no header at all: framable'
  )
})

test("'none', a scheme source, a bare '*', and a policy with no frame-ancestors directive", () => {
  assert.equal(frameAllowed({ csp: "frame-ancestors 'none'", demoOrigin: demo }, demo).allowed, false)
  assert.equal(
    frameAllowed({ csp: 'frame-ancestors https:', demoOrigin: demo }, 'https://x.test').allowed,
    true
  )
  assert.equal(
    frameAllowed({ csp: 'frame-ancestors https:', demoOrigin: demo }, 'http://x.test').allowed,
    false
  )
  assert.equal(frameAllowed({ csp: 'frame-ancestors *', demoOrigin: demo }, 'http://x.test').allowed, true)
  // A CSP that says nothing about framing does not forbid it — then X-Frame-Options speaks.
  assert.equal(
    frameAllowed({ csp: "default-src 'self'", xfo: 'SAMEORIGIN', demoOrigin: demo }, 'https://x.test')
      .allowed,
    false
  )
  assert.equal(frameAllowed({ csp: "default-src 'self'", demoOrigin: demo }, 'https://x.test').allowed, true)
})

test('two policies on one answer must BOTH allow — fetch joins repeated headers with a comma', () => {
  const csp = "frame-ancestors https://cowork.tracy.site 'self', frame-ancestors 'self'"
  assert.equal(
    frameAllowed({ csp, demoOrigin: demo }, 'https://cowork.tracy.site').allowed,
    false,
    'the second policy refuses it'
  )
  assert.equal(frameAllowed({ csp, demoOrigin: demo }, demo).allowed, true, 'both allow the demo itself')
})

test('an origin that is not one is never allowed', () => {
  for (const bad of ['', 'cowork.tracy.site', 'https://cowork.tracy.site/path', 'javascript:x', null])
    assert.equal(
      frameAllowed({ csp: 'frame-ancestors *', demoOrigin: demo }, bad).allowed,
      false,
      String(bad)
    )
})
