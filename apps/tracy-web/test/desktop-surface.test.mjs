import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDesktopApp } from '../src/lib/desktop-surface.js'

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

test('the Tracy Desktop app is recognised by its TracyCowork/<version> token', () => {
  assert.equal(isDesktopApp(`${CHROME} Electron/38.2.0 TracyCowork/0.5.1`), true)
  assert.equal(isDesktopApp('TracyCowork/0.0.0-test'), true)
})

test('a browser, a missing header and a token without a version are not the app', () => {
  assert.equal(isDesktopApp(CHROME), false)
  assert.equal(isDesktopApp(null), false)
  assert.equal(isDesktopApp(undefined), false)
  assert.equal(isDesktopApp(''), false)
  assert.equal(isDesktopApp(`${CHROME} TracyCowork/`), false)
  assert.equal(isDesktopApp(`${CHROME} NotTracyCowork/1.0`), false)
})
