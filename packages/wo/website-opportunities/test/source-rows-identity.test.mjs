// The actual Arabian Tea House failure used a discovered ?hl=en link and a pasted private alias.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeSamePageRows, privateSourceRows, samePageKey } from '../src/source-rows.js'
import { placeViewOf } from '../src/place-view.js'

const SHARED = 'https://www.instagram.com/arabianteahouse/?hl=en'
const PRIVATE = 'https://www.instagram.com/arabianteahouse'
const complete = (ref = SHARED) => ({
  source: 'instagram',
  ref,
  status: 'complete',
  reason: null,
  coverage: { fetched: 12 }
})
const blocked = (ref = PRIVATE) => ({
  source: 'instagram',
  ref,
  status: 'blocked',
  reason: 'credential_invalid',
  coverage: { fetched: 0 }
})

test('a successful shared Instagram source represents pasted www, trailing-slash and language-query aliases', () => {
  const publicRow = complete()
  for (const ref of [
    PRIVATE,
    PRIVATE + '/',
    'https://instagram.com/ArabianTeaHouse/?hl=en',
    PRIVATE + '?igsh=share'
  ]) {
    assert.deepEqual(privateSourceRows([publicRow], [blocked(ref)]), [])
    assert.equal(samePageKey('instagram', ref), samePageKey('instagram', SHARED))
  }
  assert.equal(publicRow.coverage.fetched, 12, 'selection never rewrites status or coverage')
})

test('distinct handles, Facebook IDs, source kinds and case-sensitive YouTube channel IDs stay distinct', () => {
  for (const [source, first, second] of [
    ['instagram', PRIVATE, 'https://instagram.com/arabianteahouse.other/'],
    ['facebook', 'https://facebook.com/profile.php?id=100001', 'https://facebook.com/profile.php?id=100002'],
    [
      'youtube',
      'https://youtube.com/channel/UCabcdefghijklmnopqrstuv',
      'https://youtube.com/channel/UCAbcdefghijklmnopqrstuv'
    ]
  ]) {
    assert.notEqual(samePageKey(source, first), samePageKey(source, second))
    const own = { ...blocked(second), source }
    assert.deepEqual(privateSourceRows([{ ...complete(first), source }], [own]), [own])
  }
  const otherSource = { ...blocked(), source: 'website' }
  assert.deepEqual(privateSourceRows([complete()], [otherSource]), [otherSource])
})

test('a failed shared source cannot erase a private failure or overwrite either attempt status', () => {
  const shared = { ...complete(), status: 'failed', reason: 'timeout' }
  const own = blocked()
  assert.deepEqual(privateSourceRows([shared], [own]), [own])
  const separate = blocked('https://instagram.com/another.restaurant/')
  assert.deepEqual(privateSourceRows([complete()], [separate]), [separate])
  assert.equal(own.reason, 'credential_invalid')
})

test('the display dedupe preserves different numeric Facebook profiles and exact YouTube channel identity', () => {
  const rows = [
    { source: 'facebook', ref: 'https://facebook.com/profile.php?id=100001', status: 'complete' },
    { source: 'facebook', ref: 'https://facebook.com/profile.php?id=100002', status: 'blocked' },
    { source: 'youtube', ref: 'https://youtube.com/channel/UCabcdefghijklmnopqrstuv', status: 'complete' },
    { source: 'youtube', ref: 'https://youtube.com/channel/UCAbcdefghijklmnopqrstuv', status: 'failed' }
  ]
  assert.deepEqual(mergeSamePageRows(rows), rows)
})

/** Only stored rows, no network or writes: exercise the real shared/private profile assembly. */
async function viewOf({ shared = complete(), own = [blocked()] } = {}) {
  const opportunity = { id: 'opportunity', place_id: 'place', name: 'Arabian Tea House', candidate: {} }
  const db = {
    async query(sql) {
      if (sql.includes('join wo_place_snapshot s')) return { rows: [{ id: 'snapshot', place_id: 'place' }] }
      if (sql.includes('from wo_place_snapshot_source'))
        return {
          rows: [
            {
              ...shared,
              collected_at: '2026-11-11T16:52:36.357Z',
              collected: { profile: { name: 'Arabian Tea House' }, posts: [] }
            }
          ]
        }
      if (sql.includes('from wo_source')) return { rows: own }
      if (sql.includes('from wo_place_snapshot_profile')) return { rows: [{ profile: {}, brand: null }] }
      if (sql.includes('from wo_place_snapshot_media') || sql.includes('from wo_media')) return { rows: [] }
      throw new Error('Unexpected query: ' + sql)
    }
  }
  return placeViewOf(db, opportunity)
}

test('real place view uses the same one successful source for profile.sources, source data and display', async () => {
  const view = await viewOf()
  assert.equal(view.sources.length, 1)
  assert.equal(view.shown.length, 1)
  assert.equal(view.profile.sources.length, 1)
  for (const row of [view.sources[0], view.shown[0], view.profile.sources[0]]) {
    assert.equal(row.status, 'complete')
    assert.equal(row.coverage.fetched, 12)
    assert.equal(row.reason, null)
  }
  assert.equal(view.sources[0].ref, SHARED, 'the collected source ref stays authoritative')
})

test('real place view keeps failed distinct social profiles visible and retains operator failure reason', async () => {
  const other = blocked('https://instagram.com/another.restaurant/')
  const view = await viewOf({ own: [blocked(), other] })
  assert.equal(view.sources.length, 2)
  assert.equal(view.profile.sources.length, 2)
  assert.equal(view.shown.length, 2)
  assert.equal(view.sources[1].ref, other.ref)
  assert.equal(view.sources[1].status, 'blocked')
  assert.equal(view.sources[1].reason, 'credential_invalid')
})
