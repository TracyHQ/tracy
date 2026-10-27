#!/usr/bin/env node
/**
 * The people cluster's count, faces and "only you" (`clusterOf`, `src/team/roster.ts`) — the rule the
 * My Sites row and the Team start card both draw, held against the fixture of the face contract
 * (`tasks/evidence/team-badge-count/contract.md` §3–§4).
 *
 *   node --test packages/core/tracy-core/test/team-cluster.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clusterOf, isMember } from '../src/team/roster.ts'

/** One row of `GET /api/team` as the server sends it after the face contract (§2). */
const seat = (id, email, role, status, initial, color, extra = {}) => ({
  id,
  email,
  displayName: null,
  initial,
  color,
  avatarUrl: null,
  role,
  status,
  grantedAt: '2026-10-01T00:00:00Z',
  grantedBy: 'acc-lee',
  revokedAt: null,
  requestedAt: null,
  scope: 'site',
  ...extra
})

const LEE = 'lee@example.com'
const SEATS = [
  seat('acc-lee', LEE, 'owner', 'active', 'L', '#4f46e5'),
  seat('acc-sam-1', 'sam.one@example.com', 'editor', 'active', 'S', '#db2777', { displayName: 'Sam Tester' }),
  seat('acc-sam-2', 'sam.two@example.com', 'editor', 'active', 'S', '#c026d3', { displayName: 'Sam Tester' }),
  seat('acc-invited', 'new@example.com', 'editor', 'invited', 'N', '#7c3aed'),
  seat('acc-asked', 'asked@example.com', 'editor', 'invited', 'A', '#059669', {
    requestedAt: '2026-10-03T00:00:00Z'
  }),
  seat('acc-revoked', 'gone@example.com', 'editor', 'revoked', 'G', '#0284c7', {
    revokedAt: '2026-10-02T00:00:00Z'
  })
]

test('a member is an active seat or an invitation; a request, a revoked or a declined row is not', () => {
  assert.deepEqual(
    SEATS.filter(isMember).map((s) => s.id),
    ['acc-lee', 'acc-sam-1', 'acc-sam-2', 'acc-invited']
  )
  assert.equal(isMember({ status: 'declined', requestedAt: null }), false)
})

test('the count is every member straight, the viewer included; the faces are the others, in book order', () => {
  const cluster = clusterOf(SEATS, LEE)
  assert.equal(cluster?.count, 4)
  assert.deepEqual(
    cluster?.faces.map((s) => s.id),
    ['acc-sam-1', 'acc-sam-2', 'acc-invited']
  )
  assert.equal(cluster?.onlyYou, false)
  // Two people with one name keep their own colours: the face is the server's, read as sent.
  assert.deepEqual(
    cluster?.faces.map((s) => [s.initial, s.color]),
    [
      ['S', '#db2777'],
      ['S', '#c026d3'],
      ['N', '#7c3aed']
    ]
  )
})

test('the viewer is matched by address whatever its case', () => {
  assert.deepEqual(
    clusterOf(SEATS, ' Lee@Example.com ')?.faces.map((s) => s.id),
    ['acc-sam-1', 'acc-sam-2', 'acc-invited']
  )
})

test('a viewer not known yet: the same number, no "only you", the faces need not leave the viewer out', () => {
  for (const viewer of [null, undefined, '']) {
    const cluster = clusterOf(SEATS, viewer)
    assert.equal(cluster?.count, 4, 'never "the others + 1"')
    assert.equal(cluster?.onlyYou, false)
    assert.equal(cluster?.faces.length, 3, 'at most three faces')
  }
  // The single member, not known to be the viewer, is a number — never "only you".
  assert.deepEqual(clusterOf([SEATS[0]], null), { count: 1, faces: [SEATS[0]], onlyYou: false })
})

test('"only you" once the viewer is known and is the only member; others that are not members do not count', () => {
  const alone = [SEATS[0], SEATS[4], SEATS[5]]
  assert.deepEqual(clusterOf(alone, LEE), { count: 1, faces: [], onlyYou: true })
  // Somebody else alone on the book is not "only you", even for a known viewer.
  assert.equal(clusterOf([SEATS[1]], LEE)?.onlyYou, false)
})

test('a book that could not be read says nothing at all', () => {
  assert.equal(clusterOf(null, LEE), null)
  assert.equal(clusterOf(null, null), null)
})
