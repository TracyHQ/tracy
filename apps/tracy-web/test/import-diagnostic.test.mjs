import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importDiagnostic } from '../src/lib/import-diagnostic.js'

test('a door answered by a page keeps what each door answered, from closed sets only', () => {
  assert.deepEqual(
    importDiagnostic({
      at: 'api_door',
      check: 'page_after_proof',
      status: 200,
      path: '/administrator/index.php',
      answer: 'html',
      page: 'challenge',
      doors: [
        {
          path: '/index.php',
          status: 200,
          answer: 'html',
          page: 'challenge',
          head: '<title>secret word</title>'
        },
        { path: '/administrator/index.php', status: 200, answer: 'html', page: 'challenge' },
        { path: '/third', status: 200 }
      ]
    }),
    {
      at: 'api_door',
      check: 'page_after_proof',
      status: 200,
      path: '/administrator/index.php',
      answer: 'html',
      page: 'challenge',
      doors: [
        { path: '/index.php', status: 200, answer: 'html', page: 'challenge' },
        { path: '/administrator/index.php', status: 200, answer: 'html', page: 'challenge' }
      ]
    }
  )
})

test('values outside the closed sets are dropped, never passed through', () => {
  assert.deepEqual(
    importDiagnostic({
      at: 'export',
      check: 'permission_denied',
      page: '<html>',
      doors: [{ path: '/secret-admin', status: 999, answer: 'body', page: 'login' }, 'x']
    }),
    { at: 'export', check: 'permission_denied' }
  )
  for (const check of ['answered_page', 'page_after_ban', 'page_after_proof', 'permission_denied'])
    assert.equal(importDiagnostic({ at: 'export', check })?.check, check)
})
