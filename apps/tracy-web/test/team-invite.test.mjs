import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signTeamInvite, verifyTeamInvite, teamInviteUrl, siteTeamUrl } from '../src/lib/team-invite.js'

/**
 * Tokens `workers/shared/team-invite.js` signed with the secret `'k'`, captured off that file on the
 * last commit that carried it (`workers/` deleted 16/09/2026) — this test used to call it live.
 *
 * 🔒 THESE ARE NOT SYNTHETIC. An invitation link lives in a mail somebody already received; a
 * verifier that stops accepting this exact shape turns every unopened invitation into a dead link,
 * and the only symptom is a customer saying "the link does not work".
 */
const SIGNED_BY_THE_WORKER = {
  editorOnTwoSites:
    'eyJ2IjoxLCJlbWFpbCI6ImFAeC55Iiwicm9sZSI6ImVkaXRvciIsInNpdGVLZXlzIjpbIngueSIsInoudyJdLCJpYXQiOjE3ODk1NDA1NTZ9.ok7cB0FvT30EUShZLEEM2wmUFqumiiWFBSeVz_XZmX4',
  adminWithAPaddedAddress:
    'eyJ2IjoxLCJlbWFpbCI6ImFAeC55Iiwicm9sZSI6ImFkbWluIiwic2l0ZUtleXMiOlsieC55Il0sImlhdCI6MTc4OTU0MDU1Nn0.duhElcHBwhbFnBhzPFZKD-8gLIbRoVr1eoHXhIcIVJc',
  workspaceShaped:
    'eyJ2IjoxLCJlbWFpbCI6ImFAeC55Iiwicm9sZSI6Im93bmVyIiwid29ya3NwYWNlSWQiOiJ3MSIsImlhdCI6MTc4OTU0MDU1Nn0.KgOF-BhMJzIu4ASvONH604K9pjLy_iPPsr_1AWWc4oA'
}

test('a token the Worker signed still verifies here, wire format unchanged', async () => {
  const seen = await verifyTeamInvite(SIGNED_BY_THE_WORKER.editorOnTwoSites, 'k')
  assert.equal(seen.email, 'a@x.y')
  assert.equal(seen.role, 'editor')
  assert.deepEqual(seen.siteKeys, ['x.y', 'z.w'])
  assert.equal(typeof seen.iat, 'number')
})

test('email is lowercased and trimmed on the way in', async () => {
  const token = await signTeamInvite({ email: '  A@X.Y  ', role: 'editor', siteKeys: ['x.y'] }, 'k')
  assert.equal((await verifyTeamInvite(token, 'k')).email, 'a@x.y')
  // And the Worker's own token for the same padded address reads the same way here.
  assert.equal((await verifyTeamInvite(SIGNED_BY_THE_WORKER.adminWithAPaddedAddress, 'k')).email, 'a@x.y')
})

test('a link carrying a role ADR 0028 retired still opens, as editor', async () => {
  const seen = await verifyTeamInvite(SIGNED_BY_THE_WORKER.adminWithAPaddedAddress, 'k')
  assert.equal(seen.role, 'editor')
})

test('viewer and editor are signed and read back; owner and the retired roles are never signed', async () => {
  for (const role of ['viewer', 'editor']) {
    const token = await signTeamInvite({ email: 'a@x.y', role, siteKeys: ['x.y'] }, 'k')
    assert.equal((await verifyTeamInvite(token, 'k')).role, role)
  }
  for (const role of ['owner', 'admin', 'developer', 'bogus']) {
    await assert.rejects(
      signTeamInvite({ email: 'a@x.y', role, siteKeys: ['x.y'] }, 'k'),
      /cannot be invited/
    )
  }
})

test('a token signed with a different secret does not verify', async () => {
  const token = await signTeamInvite({ email: 'a@x.y', role: 'editor', siteKeys: ['x.y'] }, 'k1')
  assert.equal(await verifyTeamInvite(token, 'k2'), null)
})

test('malformed tokens verify as null, not throw', async () => {
  assert.equal(await verifyTeamInvite('not-a-token', 'k'), null)
  assert.equal(await verifyTeamInvite('a.b.c', 'k'), null)
  assert.equal(await verifyTeamInvite('', 'k'), null)
  assert.equal(await verifyTeamInvite(null, 'k'), null)
  assert.equal(await verifyTeamInvite('a.b', ''), null)
})

test('a workspace-shaped legacy token (owner role, no siteKeys) does not verify here', async () => {
  assert.equal(await verifyTeamInvite(SIGNED_BY_THE_WORKER.workspaceShaped, 'k'), null)
})

test('signTeamInvite refuses to sign with no secret', async () => {
  await assert.rejects(signTeamInvite({ email: 'a@x.y', role: 'editor', siteKeys: ['x.y'] }, ''))
})

test('teamInviteUrl and siteTeamUrl build the links the mail sends', () => {
  assert.equal(teamInviteUrl('TOK', 'https://tracy.test/'), 'https://tracy.test/invite/TOK')
  assert.equal(
    siteTeamUrl('x.y', { origin: 'https://tracy.test' }),
    'https://tracy.test/x.y?open=my-sites&team=x.y'
  )
  assert.equal(
    siteTeamUrl('x.y', { member: 'a@x.y', origin: 'https://tracy.test' }),
    'https://tracy.test/x.y?open=my-sites&team=x.y&member=a%40x.y'
  )
})
