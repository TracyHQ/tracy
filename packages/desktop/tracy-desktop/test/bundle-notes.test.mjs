/**
 * The build's own release notes (src/bundle-notes.js, tasks/todo-desktop-update-policy.md D5): read
 * from `<resources>/release-notes.txt` and `release-notes.json` (build/release-notes-page.mjs
 * `writeBundleNotes`), and the one changelog address the app opens.
 *
 *   node --test packages/desktop/tracy-desktop/test/bundle-notes.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { writeBundleNotes } from '../build/release-notes-page.mjs'

const require = createRequire(import.meta.url)
const { readBundleNotes, changelogUrl } = require('../src/bundle-notes.js')

const dir = () => mkdtempSync(path.join(tmpdir(), 'bundle-notes-'))

test('what the packaging writes is what the app reads', () => {
  const resources = dir()
  writeBundleNotes(resources, {
    version: '0.6.0',
    channel: 'stable',
    notes: '- Faster start\n- What’s new in Help'
  })
  assert.deepEqual(readBundleNotes(resources), {
    releaseNotes: '- Faster start\n- What’s new in Help',
    page: '0.6',
    docsOrigin: 'https://docs.tracy.ai'
  })
  const dev = dir()
  writeBundleNotes(dev, { version: '0.6.0-dev.12', channel: 'dev', notes: 'x' })
  assert.equal(readBundleNotes(dev).docsOrigin, 'https://docs.tracy.site')
  assert.equal(readBundleNotes(dev).page, '0.6')
})

test('a bundle without the notes (a hand build, an old one) reads as nothing, without an error', () => {
  assert.deepEqual(readBundleNotes(dir()), { releaseNotes: null, page: null, docsOrigin: null })
  const onlyJson = dir()
  writeBundleNotes(onlyJson, { version: '0.6.0', channel: 'stable' })
  assert.deepEqual(readBundleNotes(onlyJson), {
    releaseNotes: null,
    page: '0.6',
    docsOrigin: 'https://docs.tracy.ai'
  })
  assert.deepEqual(readBundleNotes(undefined), { releaseNotes: null, page: null, docsOrigin: null })
})

test('the changelog address: the docs origin and the X.Y page, nothing else', () => {
  assert.equal(
    changelogUrl({ docsOrigin: 'https://docs.tracy.ai', page: '0.6' }),
    'https://docs.tracy.ai/changelog/desktop/0.6/'
  )
  assert.equal(
    changelogUrl({ docsOrigin: 'https://docs.tracy.ai/', page: '0.6' }),
    'https://docs.tracy.ai/changelog/desktop/0.6/'
  )
  for (const bad of [
    { docsOrigin: 'http://docs.tracy.ai', page: '0.6' },
    { docsOrigin: 'https://user:pw@docs.tracy.ai', page: '0.6' },
    { docsOrigin: 'https://docs.tracy.ai/x', page: '0.6' },
    { docsOrigin: 'javascript:alert(1)', page: '0.6' },
    { docsOrigin: 'https://docs.tracy.ai', page: '../../x' },
    { docsOrigin: null, page: '0.6' },
    { docsOrigin: 'https://docs.tracy.ai', page: null }
  ])
    assert.equal(changelogUrl(bad), null, JSON.stringify(bad))
  // A test docs host on this machine is allowed over plain http.
  assert.equal(
    changelogUrl({ docsOrigin: 'http://127.0.0.1:51830', page: '0.6' }),
    'http://127.0.0.1:51830/changelog/desktop/0.6/'
  )
})
