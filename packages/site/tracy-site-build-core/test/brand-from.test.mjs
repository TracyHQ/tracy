/**
 * A brand press names the site its brand was extracted in (30/09/2026, stand `dsgnm`): the brand
 * engine writes `Brand/<host>/` into the folder of the site the viewer is in, a claim then moves the
 * form into the NEW site's workspace, and from there nothing could say where the brand was. The
 * carry keeps that site key across the move, and the create door is told it (`brandFrom`); the door
 * checks the viewer's seat on it and the host copies the folder.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readCarry, writeCarry } from '../src/client/carry.mjs'
import { createNewSite } from '../src/client/new-site.mjs'

function memory() {
  const map = new Map()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  }
}

test('the carry keeps the site a brand came from; any other value is not read back', () => {
  const store = memory()
  const base = { id: 'brand:basecamp.com', platform: 'wordpress', answers: {} }
  writeCarry({ ...base, brandFrom: 'extracted.tracy.site' }, store)
  assert.equal(readCarry(store)?.brandFrom, 'extracted.tracy.site')
  for (const brandFrom of ['', 7, { siteKey: 'x' }]) {
    writeCarry({ ...base, brandFrom }, store)
    assert.equal('brandFrom' in (readCarry(store) ?? {}), false, JSON.stringify(brandFrom))
  }
})

test('createNewSite tells the create door which site the brand comes from, and nothing when none', async () => {
  const bodies = []
  const fetchImpl = async (url, init) => {
    if (String(url) === '/api/sites') {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ siteKey: 'b.tracy.site', jobId: 'j1' }), { status: 202 })
    }
    return new Response(JSON.stringify({ state: 'done', liveUrl: 'https://b.tracy.site' }), { status: 200 })
  }
  const deps = { fetch: fetchImpl, wait: async () => undefined }
  await createNewSite(
    { label: 'b', platform: 'wordpress', design: 'brand:basecamp.com', brandFrom: 'extracted.tracy.site' },
    deps
  )
  await createNewSite({ label: 'b', platform: 'wordpress', design: 'brand:basecamp.com' }, deps)
  assert.equal(bodies[0].brandFrom, 'extracted.tracy.site')
  assert.equal('brandFrom' in bodies[1], false)
})
