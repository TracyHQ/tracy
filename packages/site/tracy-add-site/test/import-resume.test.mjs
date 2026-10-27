/** Closing an import panel keeps only a status pointer, never admin credentials. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IMPORT_PENDING_KEY, pendingImport, rememberImport } from '../src/client/import-resume.mjs'
const storage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  }
}
test('the pointer cannot persist credentials even if an entire form is passed', () => {
  const store = storage()
  rememberImport(store, {
    siteKey: 'customer.test',
    platform: 'joomla',
    runId: 'run-1',
    username: 'owner',
    password: 'secret',
    token: 'ccw_private',
    basicAuth: { password: 'private' }
  })
  assert.deepEqual(JSON.parse(store.getItem(IMPORT_PENDING_KEY)), {
    siteKey: 'customer.test',
    platform: 'joomla',
    runId: 'run-1'
  })
  assert.deepEqual(pendingImport(store), { siteKey: 'customer.test', platform: 'joomla', runId: 'run-1' })
  rememberImport(store, null)
  assert.equal(pendingImport(store), null)
})
test('bad values and unavailable storage cannot interrupt a new import', () => {
  const store = storage()
  for (const value of [
    '{',
    'null',
    JSON.stringify({ siteKey: 'javascript:alert(1)', platform: 'joomla', runId: 'r' }),
    JSON.stringify({ siteKey: 'customer.test', platform: 'html', runId: 'r' }),
    JSON.stringify({ siteKey: 'customer.test', platform: 'joomla', runId: '' })
  ]) {
    store.setItem(IMPORT_PENDING_KEY, value)
    assert.equal(pendingImport(store), null)
  }
  assert.equal(pendingImport(null), null)
  assert.doesNotThrow(() =>
    rememberImport(
      {
        setItem() {
          throw Error('disabled')
        }
      },
      { siteKey: 'customer.test', platform: 'joomla', runId: 'r' }
    )
  )
})
