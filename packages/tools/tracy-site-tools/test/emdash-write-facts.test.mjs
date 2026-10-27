#!/usr/bin/env node
/**
 * What `tracy_emdash` tells Tracy about a write, beyond the entry it named (dev e2e 04/10/2026):
 *
 *   E3.2  a row of Site changes read "Updated home 01M3PJRBF0GQ7B4HVY1WVH70XN": the report named the
 *         entry by its ULID only. It now carries the entry's title (or slug), and a media item's file
 *         name, as the write's own answer had them — never looked up later.
 *   E5.e5 a `content_update {status: "published"}` that put the entry live showed as an Unknown
 *         "Published home" row: the collector reads the publish off the entry, and Tracy's report did
 *         not say this write was one. It now says `state: "published"` (or `"draft"`) ONLY when the
 *         write moved the entry's live state, by the same rule the collector reads it with — so a
 *         person's publish of the same entry is never Tracy's.
 *
 *   node --test packages/tools/tracy-site-tools/test/emdash-write-facts.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { emdashWriteTarget, writeFacts } from '../src/host/emdash.mjs'
import { A, answer, fakeSite, runDoor } from './emdash-door-fixture.mjs'

const HOME = A.homeGet.item.id
const update = (extra = {}) => ({
  tool: 'content_update',
  arguments: { collection: 'home', id: HOME, data: { hero_title: 'New words' }, ...extra }
})

test('E3.2: an EmDash content write reports the entry title the write answered with', async () => {
  const site = fakeSite()
  const args = update()
  const out = await runDoor(site, args)
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(emdashWriteTarget(args, out), { kind: 'home', id: HOME, title: 'Home' })
})

test('E3.2: no title in the entry falls back to its slug; a media write reports its file name', async () => {
  const untitled = {
    ...A.homeStagedUpdate,
    item: { ...A.homeStagedUpdate.item, data: { ...A.homeStagedUpdate.item.data, title: '' } }
  }
  const site = fakeSite({ on: { content_update: () => answer(untitled) } })
  const args = update()
  const out = await runDoor(site, args)
  assert.equal(emdashWriteTarget(args, out).title, 'home')

  const media = fakeSite({
    on: {
      media_update: () =>
        answer({ item: { id: '01M3PJRPQKF2ARBKGSTW09N8TV', filename: 'hero-team.jpg', alt: 'Team' } })
    }
  })
  const margs = { tool: 'media_update', arguments: { id: '01M3PJRPQKF2ARBKGSTW09N8TV', alt: 'Team' } }
  const mout = await runDoor(media, margs)
  assert.deepEqual(emdashWriteTarget(margs, mout), {
    kind: 'media',
    id: '01M3PJRPQKF2ARBKGSTW09N8TV',
    title: 'hero-team.jpg'
  })
})

test('E5.e5: an update that put a live entry’s new revision live reports state "published"', async () => {
  const site = fakeSite()
  const args = update({ status: 'published' })
  const out = await runDoor(site, args)
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(emdashWriteTarget(args, out), {
    kind: 'home',
    id: HOME,
    title: 'Home',
    state: 'published'
  })
  // The model's answer is unchanged: the state rides for Tracy only.
  assert.doesNotMatch(JSON.stringify(out), /"state"/)
})

test('E5.e5: an update that staged a draft, or changed nothing live, reports no state', async () => {
  // A no-status update of a live entry stages a draft: the live state did not move.
  const staged = await runDoor(fakeSite(), update())
  assert.equal(emdashWriteTarget(update(), staged).state, undefined)
  // status:"published" answered with the SAME live revision (nothing went live): no publish either.
  const same = fakeSite({ on: { content_update: () => answer(A.homeGet) } })
  const args = update({ status: 'published' })
  const out = await runDoor(same, args)
  assert.equal(emdashWriteTarget(args, out).state, undefined)
})

test('E5.e5: the state rule — offline is "draft", a draft kept a draft is nothing (the door itself refuses status:"draft" on a live entry)', async () => {
  const live = A.homeGet.item
  const offline = { ...live, status: 'draft', liveRevisionId: null }
  const args = { collection: 'home', id: HOME }
  assert.deepEqual(writeFacts({ tool: 'content_update', args, data: { item: offline }, before: live }), {
    title: 'Home',
    state: 'draft'
  })
  assert.deepEqual(writeFacts({ tool: 'content_update', args, data: { item: offline }, before: offline }), {
    title: 'Home'
  })
  // No read before (nothing known of the old state): no state is claimed.
  assert.deepEqual(
    writeFacts({ tool: 'content_update', args, data: { item: A.homePublish.item }, before: null }),
    {
      title: 'Home'
    }
  )
  // A content_publish is matched by its own tool name; its facts carry the title only.
  assert.deepEqual(writeFacts({ tool: 'content_publish', args, data: A.homePublish, before: live }), {
    title: 'Home'
  })

  const site = fakeSite({ on: { content_update: () => answer({ ...A.homeGet, item: offline }) } })
  const refused = await runDoor(site, update({ status: 'draft' }))
  assert.equal(refused.code, 'WOULD_UNPUBLISH')
  assert.equal(emdashWriteTarget(update({ status: 'draft' }), refused).state, undefined)
})
