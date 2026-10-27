/**
 * How each AI-account vendor signs in on this page, and the one door that connects a vendor by a
 * pasted API key: `connectKey` sends it to tracy-web's `POST /api/seat-plan/connect/key` and answers
 * the account status or a typed failure. The sign-ins themselves start in `connect.ts`.
 */

import type { SeatPlanStatus } from './connect.ts'

/** How a vendor signs in: its page, a code typed on its page, or an API key pasted here. */
export type SignInKind = 'browser' | 'device' | 'key'

/**
 * How each vendor signs in when the server does not say (dsh-subscriptions 0.6.60,
 * `lib/vendors/*.js`, and a tracy-web older than the `signIn` field of `/api/seat-plan/status`):
 * `browser` for the ones with an OAuth code exchange that needs no client id of Tracy's own,
 * `device` for GitHub's device code. It must never gain a vendor an older server lacks a door for
 * (council 11/10/2026, Q2): the key vendors (Kimi, GLM, Qwen) are named only by the server
 * (`signInFor`).
 */
const SIGN_IN: Readonly<Record<string, 'browser' | 'device'>> = {
  claude: 'browser',
  codex: 'browser',
  grok: 'browser',
  copilot: 'device'
}

/**
 * The built-in table alone, for a caller with no server answer (`device-sign-in.ts`) and for a
 * tracy-web that sends no `signIn` (`signInFor`).
 * @param vendor - a vendor id.
 * @returns how it signs in here, or undefined when this section cannot start its sign-in.
 */
export function signInOf(vendor: string): 'browser' | 'device' | undefined {
  return Object.hasOwn(SIGN_IN, vendor) ? SIGN_IN[vendor] : undefined
}

/** Every `signIn` value this page knows how to draw. */
const SIGN_IN_KINDS: readonly unknown[] = ['browser', 'device', 'key']

/**
 * How a vendor the server lists signs in. Its `signIn` decides whenever the field is there; a value
 * this page does not know (or `null`) means no sign-in here, never a fallback to the browser. A
 * server that sends no `signIn` gets the built-in table (`signInOf`).
 * @param provider - the vendor as `/api/seat-plan/status` `providers[]` lists it.
 * @returns how it signs in here, or undefined when this section cannot start its sign-in.
 */
export function signInFor(provider: {
  readonly id: string
  readonly signIn?: unknown
}): SignInKind | undefined {
  if (Object.hasOwn(provider, 'signIn')) {
    return SIGN_IN_KINDS.includes(provider.signIn) ? (provider.signIn as SignInKind) : undefined
  }
  return signInOf(provider.id)
}

/**
 * Why a pasted API key did not connect, each with its own sentence on the screen: the vendor's
 * answer (`key`, `plan`, `vendor`), the server's (`invalid`, `conflict`, `disabled`), the person's
 * Tracy session (`signedOut`), and `failed` for everything with no sentence of its own.
 */
export type KeyFailureKind =
  | 'key'
  | 'plan'
  | 'vendor'
  | 'invalid'
  | 'conflict'
  | 'disabled'
  | 'signedOut'
  | 'failed'

/** What `connectKey` answers: the account status, or the one reason it failed. */
export type KeyResult =
  | { readonly kind: 'connected'; readonly status: SeatPlanStatus }
  | { readonly kind: KeyFailureKind }

/**
 * The refusal codes `connect/key` can answer, as tracy-web spells them, and what each means here
 * (`apps/tracy-web/src/seat-plan/broker.js` `connectKey`, `settings`, `account`; the viewer guard
 * `lib/http.js` `requireViewer`). Codes not listed (`CSRF_ORIGIN`, `noAccess`, `unavailable`, …)
 * are `failed`.
 */
const KEY_CODES: Readonly<Record<string, KeyFailureKind>> = {
  key: 'key',
  plan: 'plan',
  vendor: 'vendor',
  invalid: 'invalid',
  conflict: 'conflict',
  disabled: 'disabled',
  notSignedIn: 'signedOut',
  NOT_SIGNED_IN: 'signedOut'
}

/** A refusal with no code: what its status alone says. */
const KEY_STATUSES: Readonly<Record<number, KeyFailureKind>> = {
  400: 'invalid',
  401: 'key',
  403: 'plan',
  409: 'conflict',
  502: 'vendor'
}

/** The slice of `fetch` `connectKey` uses; injected so tests answer like tracy-web. */
export type KeyFetch = (
  url: string,
  init: { method: string; credentials: 'same-origin'; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Whether a 200 answer is an account status the section can draw. */
function isStatus(body: unknown): body is SeatPlanStatus {
  if (body === null || typeof body !== 'object') return false
  const { providers, connections } = body as Record<string, unknown>
  return Array.isArray(providers) && Array.isArray(connections)
}

/**
 * Connect a vendor that signs in with an API key: `POST /api/seat-plan/connect/key {provider, key}`
 * (tracy-web's broker checks the key with the vendor before keeping it). The key goes in that one
 * body and nowhere else: it is not logged, kept or put in any answer.
 *
 * Refusals (`{code, message}`; `{error}` is read too): 400 `invalid`, 401 `key` (the vendor
 * rejected the key), 403 `plan` (the vendor refused the key for this use: no plan, balance or
 * access), 502 `vendor` (the vendor could not be reached), 409 `conflict` (a Disconnect or another
 * paste landed meanwhile), 403/503 `disabled` (the operator turned the vendor or connecting off),
 * 401 `notSignedIn`/`NOT_SIGNED_IN` (no Tracy session). The code decides; with none, the status
 * does. Anything else, tracy-web not reached, or a 200 that is not a status, is `failed`.
 * @param provider - the vendor id, one whose `signInFor` is `key`.
 * @param key - what the person pasted, sent as is.
 * @param fetchFn - the page's fetch by default.
 */
export async function connectKey(
  provider: string,
  key: string,
  fetchFn: KeyFetch = (url, init) => fetch(url, init)
): Promise<KeyResult> {
  let res: Awaited<ReturnType<KeyFetch>>
  try {
    res = await fetchFn('/api/seat-plan/connect/key', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, key })
    })
  } catch {
    return { kind: 'failed' }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  if (res.ok) return isStatus(body) ? { kind: 'connected', status: body } : { kind: 'failed' }
  const answer = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const code = answer.error ?? answer.code
  if (typeof code === 'string') return { kind: Object.hasOwn(KEY_CODES, code) ? KEY_CODES[code] : 'failed' }
  return { kind: Object.hasOwn(KEY_STATUSES, res.status) ? KEY_STATUSES[res.status] : 'failed' }
}
