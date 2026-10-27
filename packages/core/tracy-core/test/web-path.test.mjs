import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tracyWebPath } from '../src/web-path/index.mjs'
test('only an explicit native widget mount selects the authenticated Tracy bridge', () => {
  assert.equal(
    tracyWebPath('/auth/me', { pathname: '/widget/native/s/session-widget-own' }),
    '/widget/native/backend/auth/me'
  )
  assert.equal(
    tracyWebPath('/api/sites?x=1', { pathname: '/widget/native/' }),
    '/widget/native/backend/api/sites?x=1'
  )
  for (const pathname of ['/new/s/session-widget-own', '/a.test/', '/widget/native-other/'])
    assert.equal(tracyWebPath('/auth/me', { pathname }), '/auth/me')
  for (const path of ['//outside.test', 'https://outside.test', '/api/%2fops', '/api/sites#x'])
    assert.throws(() => tracyWebPath(path), /TRACY_WEB_PATH_INVALID/)
})

test('an encoded slash in a query value is a value, not a way out of the door', () => {
  // URLSearchParams writes the quickstart tag quickstart/ja-kinetic/j6 with %2F (the Add site support door, 19/10/2026).
  const support = `/api/design-system/support?${new URLSearchParams({ quickstart: 'quickstart/ja-kinetic/j6', platform: 'joomla' })}`
  assert.equal(tracyWebPath(support, { pathname: '/new/s/session-1' }), support)
  assert.equal(tracyWebPath(support, { pathname: '/widget/native/' }), `/widget/native/backend${support}`)
  assert.equal(tracyWebPath('/api/x?next=%2E%2E%5Cy', { pathname: '/' }), '/api/x?next=%2E%2E%5Cy')
  // The path itself still refuses encoded traversal, and a fragment or backslash anywhere.
  for (const path of ['/api/%2e%2e/ops?x=1', '/api/%5Cops?x=1', '/api/x?y=1#z', '/api/x?y=\\z'])
    assert.throws(() => tracyWebPath(path), /TRACY_WEB_PATH_INVALID/)
})
