#!/usr/bin/env node
/**
 * The Team start card's data (`src/client/team-card.mjs`): one site's count, faces and "only you"
 * out of a `GET /api/team` answer, held against the fixture of the face contract
 * (`tasks/evidence/team-badge-count/contract.md` §3–§4).
 *
 * `team-card.mjs` takes its rule from `@tracy/core/team/face`, a TSX file node does not run as it
 * is, so the module is bundled by esbuild in memory first (nothing is written to disk).
 *
 *   node --test packages/ui/tracy-chat-input/test/team-card.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** @type {typeof import('../src/client/team-card.mjs')} */
let card

before(async () => {
  const built = await require('esbuild').build({
    entryPoints: [path.join(here, '../src/client/team-card.mjs')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    write: false,
    logLevel: 'silent'
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  card = mod.exports
})

const seat = (id, email, status, initial, color, extra = {}) => ({
  id,
  email,
  displayName: null,
  initial,
  color,
  avatarUrl: null,
  role: 'editor',
  status,
  grantedAt: '2026-10-01T00:00:00Z',
  grantedBy: 'acc-lee',
  revokedAt: null,
  requestedAt: null,
  scope: 'site',
  ...extra
})

const LEE = 'lee@example.com'
const SITE_A = [
  seat('acc-lee', LEE, 'active', 'L', '#4f46e5', { role: 'owner' }),
  seat('acc-sam-1', 'sam.one@example.com', 'active', 'S', '#db2777', { displayName: 'Sam Tester' }),
  seat('acc-sam-2', 'sam.two@example.com', 'active', 'S', '#c026d3', { displayName: 'Sam Tester' }),
  seat('acc-invited', 'new@example.com', 'invited', 'N', '#7c3aed'),
  seat('acc-asked', 'asked@example.com', 'invited', 'A', '#059669', { requestedAt: '2026-10-03T00:00:00Z' }),
  seat('acc-revoked', 'gone@example.com', 'revoked', 'G', '#0284c7', { revokedAt: '2026-10-02T00:00:00Z' })
]
/** `GET /api/team`: site-a with the fixture's book, a second site, and one whose seat is pending. */
const BODY = {
  sites: [
    { siteKey: 'site-b', platform: 'wordpress', myRole: 'owner', status: 'accepted', seats: [SITE_A[0]] },
    { siteKey: 'site-a', platform: 'wordpress', myRole: 'owner', status: 'accepted', seats: SITE_A },
    { siteKey: 'site-p', platform: 'joomla', myRole: 'editor', status: 'pending', seats: null }
  ]
}

test('the card counts the site’s members straight and draws the others: 4, sam-1 · sam-2 · invited', () => {
  const got = card.teamCardOf(BODY, 'site-a', LEE)
  assert.equal(got?.count, 4)
  assert.equal(got?.onlyYou, false)
  assert.deepEqual(
    got?.faces.map((s) => [s.id, s.initial, s.color]),
    [
      ['acc-sam-1', 'S', '#db2777'],
      ['acc-sam-2', 'S', '#c026d3'],
      ['acc-invited', 'N', '#7c3aed']
    ]
  )
})

test('a viewer not known yet: the number still, no words', () => {
  const got = card.teamCardOf(BODY, 'site-a', null)
  assert.equal(got?.count, 4)
  assert.equal(got?.onlyYou, false)
  assert.equal(got?.faces.length, 3)
})

test('the viewer alone on a site: "only you", no faces; the site is picked by its key', () => {
  assert.deepEqual(card.teamCardOf(BODY, 'site-b', LEE), { count: 1, faces: [], onlyYou: true })
})

test('nothing to say: a pending seat, a site the answer does not list, an answer that is not a book', () => {
  assert.equal(card.teamCardOf(BODY, 'site-p', LEE), null)
  assert.equal(card.teamCardOf(BODY, 'site-z', LEE), null)
  for (const body of [undefined, null, 'oops', {}, { sites: 'x' }, { sites: [{ siteKey: 'site-a' }] }])
    assert.equal(card.teamCardOf(body, 'site-a', LEE), null, JSON.stringify(body))
})

test('the door is read once, root-absolute; signed out, refused or offline is no answer', async () => {
  const calls = []
  const answering = (status, body) => async (input, init) => {
    calls.push([input, init?.credentials])
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  assert.deepEqual(await card.readTeam(answering(200, BODY)), BODY)
  assert.deepEqual(calls, [['/api/team', 'same-origin']])
  assert.equal(await card.readTeam(answering(401, { error: 'signed out' })), null)
  assert.equal(await card.readTeam(answering(500, {})), null)
  assert.equal(
    await card.readTeam(async () => {
      throw new TypeError('offline')
    }),
    null
  )
})
