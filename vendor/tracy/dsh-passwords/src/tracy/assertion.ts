// Tracy: `ctx.tracyAssertion` — sign "I am asking on behalf of this address" for a sibling plugin.
//
// WHY IT LIVES HERE. The seat book decides what a write may do by the person's ROLE, so a write has
// to name a person. A plugin that writes (`tracy-site-tools`) used to name whoever's browser said
// hello last, which on a shared session is a coin toss. It now reads WHO TYPED off the session log
// (the stamp this gate puts on every prompt) and asks here for an assertion; `tracy-site-tabs` does
// the same to record a turn's moment.
//
// 🔒 THE SECRET DOES NOT LEAVE THIS FILE. `MCP_TRACY_ACTOR_SECRET` is shared across the fleet:
// whoever holds it can speak for anyone on any site, which is why `tracy-add-site` and
// `tracy-site-tabs` both refuse to hold it and go through the password gate instead. Keeping the
// signing in one place means one place to read when asking who could have signed what.
//
// Sixty seconds, matching tracy-web's own `verifyActor`: an assertion cannot be revoked, so a short
// life is the only thing bounding a captured one. Callers sign at the moment they call a door,
// never in advance.
import { createHmac } from 'node:crypto';

/** How long an assertion lives, in seconds. */
export const ASSERTION_TTL_SECONDS = 60;

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Sign an assertion for an address.
 * @param secret - the fleet's `MCP_TRACY_ACTOR_SECRET`.
 * @param email - the person who typed; trimmed and lower-cased before signing.
 * @param nowSeconds - the clock, in whole seconds (injected for tests).
 * @returns `v1.<payload>.<signature>`, or `null` when the address is not one.
 */
export function mintTracyAssertion(
  secret: string,
  email: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (address === '' || !ADDRESS.test(address)) return null;
  const payload = Buffer.from(JSON.stringify({ email: address, exp: nowSeconds + ASSERTION_TTL_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `v1.${payload}.${signature}`;
}

/** The slice of dsh's plugin context this needs. */
interface AssertionContext {
  effect(setup: () => () => void, label: string): unknown;
  reflect: { provide(name: string, value: unknown): () => void };
}

/**
 * Provide the `tracyAssertion` service to the plugins that `ctx.get` it. With no secret there is no
 * service at all: a sibling must see "no signer" and fall back, never a signer with an empty key.
 */
export function provideTracyAssertion(ctx: AssertionContext, secret: string): void {
  const key = typeof secret === 'string' ? secret.trim() : '';
  if (key === '') return;
  ctx.effect(
    () => ctx.reflect.provide('tracyAssertion', { mint: (email: string) => mintTracyAssertion(key, email) }),
    'dsh-passwords: tracyAssertion service',
  );
}
