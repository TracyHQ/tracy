// V1, V2, V6: taking a seat back reaches every connection it already holds, not just its next request.
// The pending-HTTP half of V1 runs through a real gateway in gateway-pending-revoke.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameVerdict } from '../../src/tracy/revocation.js';

test('V2: a frame from an account banned since the upgrade closes the socket with 1008 instead of being answered', () => {
  assert.equal(frameVerdict({ banned: false, credentialVersion: 3 }, 3), null);
  assert.deepEqual(frameVerdict({ banned: true, credentialVersion: 3 }, 3), { code: 1008, reason: 'account banned' });
});

test('V2/V3: a frame after the credential version moved (revoke, password change) closes the socket too', () => {
  assert.deepEqual(frameVerdict({ banned: false, credentialVersion: 4 }, 3), { code: 1008, reason: 'credentials changed' });
  assert.deepEqual(frameVerdict(null, 3), { code: 1008, reason: 'seat revoked' }, 'the account is gone');
});

test('V1/V6: revokeSeatConnections closes the seat\'s sockets and carriers with 1008, then drops its grant snapshot', async () => {
  const { revokeSeatConnections } = await import('../../src/tracy/revocation.js');
  const calls: string[] = [];
  revokeSeatConnections({
    closeWebSockets: (userId, code, reason) => calls.push(`ws ${userId} ${code} ${reason}`),
    closeMux: (userId, code, reason) => calls.push(`mux ${userId} ${code} ${reason}`),
    invalidate: (userId) => calls.push(`invalidate ${userId}`),
  }, { type: 'revoke', userId: 7 });
  assert.deepEqual(calls, ['ws 7 1008 seat revoked', 'mux 7 1008 seat revoked', 'invalidate 7']);
});

test('V1: a closer that throws does not keep the other connections open or the snapshot cached', async () => {
  const { revokeSeatConnections } = await import('../../src/tracy/revocation.js');
  const calls: string[] = [];
  revokeSeatConnections({
    closeWebSockets: () => { throw new Error('socket gone'); },
    closeMux: (userId, code) => calls.push(`mux ${userId} ${code}`),
    invalidate: (userId) => calls.push(`invalidate ${userId}`),
  }, { type: 'grant-change', userId: 3 });
  assert.deepEqual(calls, ['mux 3 1008', 'invalidate 3']);
});
