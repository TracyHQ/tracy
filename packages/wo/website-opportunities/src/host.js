/**
 * The ONE seam between the open Website Opportunities layer and the infrastructure that mounts it (ADR 0036, decisions
 * 2 and 3). Nothing in `opportunities/` imports that infrastructure; every module that needs it receives `host` and
 * asks for its members with `requireHost`, so an adapter missing one fails at boot, not on the first request.
 * Tracy's adapter: `src/wo-host.js`.
 *
 * @typedef {object} WoHost
 * @property {(c: any, body: any, status?: number) => Response} json  JSON answer of a door, with the host's headers.
 * @property {(c: any, config: any) => Promise<string | Response>} requireViewer  The signed-in person's email, or a refusal Response.
 * @property {(c: any) => string | null} clientIp  The caller's address as the host's proxy reports it.
 * @property {(pool: any, bucket: string, limit: number, now: number, windowMs?: number) => Promise<boolean>} overLimitOrClosed
 *   Counts one call in `bucket`; true when over `limit` in the window, also when the count cannot be read (fails closed).
 * @property {(pool: any, bucket: string, now: number, windowMs?: number) => Promise<void>} refundOne  Gives one count back.
 * @property {(a: string | undefined, b: string | undefined) => boolean} sameSecret  Constant-time secret comparison.
 * @property {(pool: any, id: string) => Promise<boolean>} uiSwitchOn  Whether an operator switch (`WO_SWITCH`) is on.
 * @property {(pool: any, door: string, secret: string) => Promise<any>} lookupDoor  The model assigned to a door
 *   (`vision`), as `{state, credential, snapshot}`.
 * @property {(a: {presetId: string, baseUrl: string, metadata: any}) => {parameter: string | null, choices: string[]}} effortOptions
 *   The reasoning-effort control a model's provider offers.
 * @property {(a: {snapshot: any, baseUrl: string, model: string}) => string} visionFingerprint  What a vision test proves.
 * @property {(a: {pool: any, fingerprint: string}) => Promise<any>} currentVisionProof  The passed pixel test for that
 *   fingerprint, or null.
 * @property {(bytes: Buffer) => Promise<{dhash: string, top2Share: number, edgeDensity: number, centreLuminance: number}>} pictureFeatures
 *   Measured numbers of a picture (perceptual hash, colour share, edges, centre light).
 * @property {(cipher: string, secret: string) => Promise<string | null>} openSecret  Opens a provider key the host
 *   sealed in `wo_ops_setting`; null when it cannot.
 * @property {(pool: any, email: string) => Promise<string | null>} principalOf  The `wo_principal` id the signed-in person
 *   acts as, null when they have none yet (the open layer never reads the host's own user table).
 * @property {(pool: any, principalId: string) => Promise<string>} displayNameOf  The name that signs a principal's outreach
 *   drafts; empty when there is none.
 * @property {(pool: any, principalId: string) => Promise<string | null>} [emailOf]  OPTIONAL: the email of a principal,
 *   shown to the operator beside the accounts that saved a place (`placeDetail`); without it those rows carry no email.
 * @property {(pool: any, principalId: string) => Promise<string | null>} [hubAccountOf]  OPTIONAL: the hub account a
 *   signed-in principal may manage (`ensureHubAccount` in `hub/tokens.js` makes one), null to refuse. With it the hub
 *   offers that person the token doors `/hub/v1/account/token` (`hub/intake-routes.js`); without it, no such door.
 * @property {(c: any, options?: {write?: boolean}) => Promise<string | Response>} [requireOperator]  OPTIONAL: the
 *   operator's email when the caller may run this deployment (settings, keys, spend, research queue, hub admin), or a
 *   refusal Response. `write` is true for a door that changes something, so a host can ask more of it (a role, the
 *   page's own origin). Without it the operator doors (`ops/operator-routes.js`) are not mounted.
 * @property {(plain: string, secret: string) => Promise<string>} [sealSecret]  OPTIONAL: seals a provider key for
 *   `wo_ops_setting`, the inverse of `openSecret`. Without it provider keys are read-only (the environment's).
 * @property {(pool: any, buckets: string[], windowStart: Date, windowMs: number) => Promise<Map<string, number>>} [rateCountsOf]
 *   OPTIONAL: how much of each `overLimitOrClosed` bucket the window starting at `windowStart` used. Without it a
 *   provider's daily cap is never shown as reached.
 * @property {(pool: any, args: {accountId: string, opportunityId: string}) => Promise<{revisionId: string, profile: any,
 *   origin: string, at: string | null, seenAt: Record<string, string>, factIds: string[] | null} | null>} [frozenPlaceProfileOf]
 *   OPTIONAL: the place profile the opportunity's latest brief revision froze, with its assessment's time and dates and
 *   the ids of the facts its brief states (#1791). With it the Profile card judges exactly the brief's facts; without
 *   it the card reads the place profile of the current research.
 */

export const HOST_MEMBERS = Object.freeze([
  'json',
  'requireViewer',
  'clientIp',
  'overLimitOrClosed',
  'refundOne',
  'sameSecret',
  'uiSwitchOn',
  'lookupDoor',
  'effortOptions',
  'visionFingerprint',
  'currentVisionProof',
  'pictureFeatures',
  'openSecret',
  'principalOf',
  'displayNameOf'
])

/** Members a host MAY have; a door that needs one is mounted only when it is there. */
export const OPTIONAL_HOST_MEMBERS = Object.freeze([
  'emailOf',
  'hubAccountOf',
  'requireOperator',
  'sealSecret',
  'rateCountsOf',
  'frozenPlaceProfileOf'
])

/**
 * `host` itself when it has every member in `names`; otherwise throws naming each one missing.
 * @param {Partial<WoHost> | undefined} host
 * @param {readonly string[]} names
 * @returns {WoHost}
 */
export function requireHost(host, names) {
  const missing = names.filter((name) => typeof host?.[name] !== 'function')
  if (missing.length) throw new Error(`Website Opportunities host is missing: ${missing.join(', ')}`)
  return host
}
