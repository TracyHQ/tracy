// Tracy: the `tracyAssertion` service. The password gate signs "I am asking on behalf of this
// address" for sibling plugins (tracy-site-tabs, tracy-site-tools); the secret stays in this plugin.
// 2.7.7 dropped it with the rest of the 2.6.6 plugin entry, and the siblings fell back to the
// viewer's cookie — found on dev, 06/10/2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mintTracyAssertion, provideTracyAssertion } from '../../src/tracy/assertion.js';
// The verifier on the other end of the wire: the same one tracy-web uses.
import { verifyActor } from '../../../../../apps/tracy-web/src/lib/actor.js';

const SECRET = 'fleet-actor-secret-for-tests';

test('a signed assertion lives sixty seconds and names the lower-cased address', () => {
  const token = mintTracyAssertion(SECRET, '  Ada@Example.TEST ', 1_700_000_000);
  assert.ok(token !== null);
  const [version, payload, signature] = token.split('.');
  assert.equal(version, 'v1');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), { email: 'ada@example.test', exp: 1_700_000_060 });
  assert.equal(signature, createHmac('sha256', SECRET).update(payload).digest('base64url'));
});

test('an address that is not one is never signed', () => {
  for (const bad of ['', '   ', 'no-at-sign', 'a@b', 'two words@x.test', 'a@b@c.test']) {
    assert.equal(mintTracyAssertion(SECRET, bad, 1_700_000_000), null, JSON.stringify(bad));
  }
  assert.equal(mintTracyAssertion(SECRET, undefined as unknown as string, 1_700_000_000), null);
  assert.equal(mintTracyAssertion(SECRET, 42 as unknown as string, 1_700_000_000), null);
});

test('what this gate signs, tracy-web accepts; another secret or an expired one it refuses', async () => {
  const now = Date.now();
  const token = mintTracyAssertion(SECRET, 'ada@example.test', Math.floor(now / 1000));
  assert.ok(token !== null);
  const accepted = await verifyActor(token, SECRET, now);
  assert.ok(accepted, 'the real verifier accepts it');
  assert.equal(await verifyActor(token, 'another-secret', now), null);
  assert.equal(await verifyActor(token, SECRET, now + 61_000), null, 'after sixty seconds it is dead');
});

function fakeCtx() {
  const provided = new Map<string, { mint(email: string): string | null }>();
  const labels: string[] = [];
  const ctx = {
    effect(setup: () => () => void, label: string) {
      labels.push(label);
      setup();
    },
    reflect: {
      provide(name: string, value: { mint(email: string): string | null }) {
        provided.set(name, value);
        return () => provided.delete(name);
      },
    },
  };
  return { ctx, provided, labels };
}

test('the service is provided as `tracyAssertion` when the fleet secret is set, and not at all when it is not', () => {
  const on = fakeCtx();
  provideTracyAssertion(on.ctx as never, SECRET);
  assert.deepEqual([...on.provided.keys()], ['tracyAssertion']);
  const token = on.provided.get('tracyAssertion')!.mint('ada@example.test');
  assert.ok(token?.startsWith('v1.'));

  for (const secret of ['', '   ']) {
    const off = fakeCtx();
    provideTracyAssertion(off.ctx as never, secret);
    assert.equal(off.provided.size, 0, `secret ${JSON.stringify(secret)}: a sibling must see no signer, not a signer with no key`);
  }
});

test('the plugin entry provides it from the fleet secret, outside the "gateway configured" branch', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/plugin.ts', import.meta.url), 'utf8');
  const call = source.indexOf("provideTracyAssertion(ctx, cfg.tracy?.actorSecret ?? '')");
  assert.ok(call > 0, 'plugin.ts calls provideTracyAssertion with the fleet actor secret');
  const configured = source.indexOf('if (configured) {\n    startGateway(');
  assert.ok(configured > call, 'the call comes before, not inside, the branch that starts the gateway');
});
