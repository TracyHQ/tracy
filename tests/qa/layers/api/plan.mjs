// Case planning for the api layer: PURE tables, no IO. For every door of the pinned oracle and every
// required edge tag it answers one of three things —
//   cases : the partitions to execute (ids are derived from the item key, the tag and the variant),
//   na    : the tag cannot apply, with the reason and the source that proves it,
//   open  : the tag applies but this layer has no executable oracle yet (stays open, never PASS).
// Everything is derived from the door's entry in the pinned oracle (snapshot security, parameters,
// request schema, declared statuses, route reference text) — never from what the tree answers.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson } from './io.mjs'
import { HTTP_WRITE } from './oracle.mjs'

export const LAYER = 'api'
export const COMMON_TAGS = [
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
]
export const API_TAGS = [
  'anonymous',
  'expired-auth',
  'wrong-role',
  'other-tenant',
  'wrong-method',
  'malformed-body',
  'encoding-injection',
  'csrf-origin',
  'pagination',
  'rate-limit',
  'concurrent',
  'partial-write',
  'cancel-timeout',
  'no-secret-leak'
]
export const REQUIRED_TAGS = [...COMMON_TAGS, ...API_TAGS]
export const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export const sourceOf = (pin) => ({
  snapshot: `${pin.snapshot.path}@${pin.revision.slice(0, 9)}`,
  docs: `apps/tracy-web/src/api-reference/routes@${pin.revision.slice(0, 9)}`,
  csrf: `apps/tracy-web/test/csrf.test.mjs@${pin.revision.slice(0, 9)} (#662)`
})

/** What the pinned reference says about how a door is authenticated. */
export function authClass(door) {
  const a = door.doc?.auth
  if (a === 'none') return 'none'
  if (a === 'session' || a === 'session-or-actor') return 'session'
  if (a === 'admin') return 'admin'
  if (a === 'actor') return 'actor'
  if (a === 'otp' || a === 'oauth' || a === 'invite') return 'entry'
  if (a === 'signature') return 'signature'
  if (a === 'token') return door.security.length === 1 && door.security[0] === 'bearer' ? 'bearer' : 'token'
  // No reference entry (three catch-all pages): `/ops/*` is the staff surface (ops/admit.js refuses
  // anyone without a tracy_admin seat), the others fall back to the snapshot's security.
  if (!door.doc && door.path.startsWith('/ops/')) return 'admin'
  if (door.security.includes('bearer')) return 'bearer'
  if (door.security.length === 0) return 'none'
  if (door.security.includes('session')) return 'session'
  return 'unknown'
}

export const isV1 = (door) => door.path === '/v1' || door.path.startsWith('/v1/')
export const pathParams = (door) => door.params.filter((p) => p.in === 'path').map((p) => p.name)
export const queryParams = (door) => door.params.filter((p) => p.in === 'query').map((p) => p.name)
export const isSiteScoped = (door) => pathParams(door).includes('key')
export const isWorkspaceScoped = (door) => /^\/(me\/)?workspaces\/\{id\}/.test(door.path)
export const PAGE_PARAMS = ['limit', 'offset', 'cursor', 'after', 'before', 'blocksCursor', 'itemsCursor']
export const pageParams = (door) => queryParams(door).filter((n) => PAGE_PARAMS.includes(n))
export const hasBody = (door) => door.body !== null
export const requiredProps = (door) => door.body?.schema?.required ?? []
export const bodyProps = (door) => Object.entries(door.body?.schema?.properties ?? {})

/** Who can be sent to the door as a valid caller, or null when no fixture person can. */
export function validPrincipal(door) {
  switch (authClass(door)) {
    case 'admin':
      return 'staff'
    case 'session':
      return 'owner'
    case 'bearer':
      return isV1(door) ? 'bearer-owner' : null
    case 'actor':
      return 'actor-owner'
    default:
      return null
  }
}

export const INJECTION = Object.freeze(
  readJson(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'api', 'requests.json'))
    .injection
)
export const PATH_INJECTION = [
  'sql-quote',
  'sql-union',
  'traversal',
  'traversal-encoded',
  'null-byte',
  'header-crlf'
]
export const BODY_INJECTION = ['sql-quote', 'html', 'unicode-bidi']
export const QUERY_INJECTION = ['sql-quote', 'null-byte', 'header-crlf']

export const PAGE_VARIANTS = {
  limit: ['zero', 'negative', 'above-max', 'not-a-number'],
  offset: ['negative', 'not-a-number'],
  cursor: ['garbage', 'empty']
}
const CURSORS = new Set(['cursor', 'after', 'before', 'blocksCursor', 'itemsCursor'])
export const pageVariantsFor = (door) =>
  pageParams(door).flatMap((name) => {
    const family =
      name === 'limit' ? 'limit' : name === 'offset' ? 'offset' : CURSORS.has(name) ? 'cursor' : null
    return family ? PAGE_VARIANTS[family].map((v) => `${name}:${v}`) : []
  })

/** Violations of the bounds a request schema declares (min-1 / max+1), one variant per property keyword. */
export function schemaBoundaryVariants(door) {
  const out = []
  for (const [name, spec] of bodyProps(door)) {
    if (typeof spec.minimum === 'number') out.push(`${name}:minimum-1`)
    if (typeof spec.maximum === 'number') out.push(`${name}:maximum+1`)
    if (typeof spec.minLength === 'number' && spec.minLength > 0) out.push(`${name}:minLength-1`)
    if (typeof spec.maxLength === 'number') out.push(`${name}:maxLength+1`)
    if (typeof spec.maxItems === 'number') out.push(`${name}:maxItems+1`)
  }
  return out.slice(0, 6)
}

/** The partitions of "a body that does not match what the schema says". */
export function malformedVariants(door) {
  const out = ['json-truncated', 'json-array-root', 'json-null', 'json-string']
  if (door.body.required) out.push('empty-body')
  for (const f of requiredProps(door).slice(0, 2)) out.push(`missing:${f}`)
  const typed = bodyProps(door).filter(([, s]) =>
    ['string', 'integer', 'number', 'boolean', 'array', 'object'].includes(s.type)
  )
  for (const [f] of typed.slice(0, 2)) out.push(`wrong-type:${f}`)
  const enums = bodyProps(door).filter(([, s]) => Array.isArray(s.enum))
  for (const [f] of enums.slice(0, 1)) out.push(`enum-violation:${f}`)
  if (door.body.schema?.additionalProperties === false) out.push('additional-property')
  return out
}

export const wrongMethodsFor = (door, siblings) => {
  const declared = new Set(siblings.map((d) => d.method))
  return ALL_METHODS.filter((m) => !declared.has(m))
}

export const itemKey = (door) => `${door.method}:${door.path}`
export const caseId = (door, tag, variant) => `QA-API-${itemKey(door)}-${tag}${variant ? `-${variant}` : ''}`

export const ASSERTIONS = Object.freeze({
  happy: 'api.happy.success-status',
  empty: 'api.empty.no-foreign-data',
  'empty-body': 'api.empty.body-rejected',
  invalid: 'api.invalid.refused',
  boundary: 'api.boundary.rejected',
  'dependency-failure': 'api.dependency.declared-status',
  repeat: 'api.repeat.stable',
  anonymous: 'api.anonymous.refused',
  'expired-auth': 'api.credentials.refused',
  'wrong-role': 'api.role.staff-only',
  'other-tenant': 'api.tenant.isolated',
  'wrong-method': 'api.method.not-served',
  'malformed-body': 'api.body.rejected',
  'encoding-injection': 'api.injection.contained',
  'csrf-origin': 'api.csrf.foreign-origin-refused',
  pagination: 'api.page.bounded',
  concurrent: 'api.concurrent.stable',
  'partial-write': 'api.write.unchanged-after-refusal',
  'no-secret-leak': 'api.secret.none'
})

/**
 * @param {object} door entry of oracle doors
 * @param {{siblings: object[], src: ReturnType<typeof sourceOf>, exceptions?: object}} ctx
 */
export function planDoor(door, ctx) {
  const { siblings, src } = ctx
  const cases = []
  const na = {}
  const open = {}
  const covered = {}
  const add = (tag, variant, extra = {}) =>
    cases.push({ tag, variant: variant ?? null, assertionId: ASSERTIONS[extra.assertion ?? tag], ...extra })
  const auth = authClass(door)
  const isGet = door.method === 'GET'
  const write = HTTP_WRITE.has(door.method)
  const principal = validPrincipal(door)
  const authRequired = ['session', 'admin', 'actor', 'bearer', 'token', 'signature'].includes(auth)
  const inputs = door.params.length > 0 || hasBody(door)

  // ---- happy
  if (isGet && principal && !hasBody(door)) add('happy', 'control')
  else
    open.happy = principal
      ? `a ${door.method} door needs a per-door valid request body and a state oracle; the snapshot declares only that it answers 200`
      : `no fixture caller can satisfy this door's ${auth} authentication`

  // ---- empty
  if (isGet && !pathParams(door).length && principal && auth !== 'admin') add('empty', 'no-data-account')
  else if (isGet && auth === 'admin')
    open.empty =
      'a staff list over an empty book needs a fixture with every table emptied; the fixture always holds the staff seat itself'
  else if (hasBody(door) && principal && requiredProps(door).length)
    add('empty', 'empty-object', { assertion: 'empty-body' })
  else if (hasBody(door) && !requiredProps(door).length)
    na.empty = `{} satisfies the schema: ${door.id} declares no required property, so an empty body is a valid request (${src.snapshot})`
  else if (!inputs && write)
    na.empty = `no input to leave empty: ${door.id} declares no parameter and no request body (${src.snapshot})`
  else
    open.empty = isGet
      ? 'a parameterised read has no per-door fixture for "exists but empty" in the pinned oracle'
      : 'no caller fixture for this door'

  // ---- invalid
  if (principal && (pathParams(door).length > 0 || queryParams(door).length > 0)) {
    if (pathParams(door).length > 0) {
      add('invalid', 'path-garbage')
      add('invalid', 'path-overlong')
    }
    if (queryParams(door).length > 0) add('invalid', 'query-wrong-type')
  } else if (!inputs)
    na.invalid = `${door.id} takes no path parameter, query parameter or body (${src.snapshot})`
  else if (hasBody(door) && !pathParams(door).length && !queryParams(door).length)
    na.invalid = `the only input is the body; its invalid forms are the malformed-body partitions (${src.snapshot})`
  else open.invalid = 'no fixture caller can satisfy this door authentication'

  // ---- boundary
  const bounds = [
    ...pageVariantsFor(door).map((v) => `page:${v}`),
    ...schemaBoundaryVariants(door).map((v) => `schema:${v}`)
  ]
  if (bounds.length && principal)
    for (const v of bounds)
      add('boundary', v, { assertion: v.startsWith('page:') ? 'pagination' : 'boundary' })
  else if (door.declaredStatuses.includes('413'))
    open.boundary = 'snapshot declares 413 but not the size limit; no oracle for the byte boundary'
  else if (!bounds.length)
    na.boundary = `no numeric, length or size bound is declared for ${door.id}: no limit/offset/cursor parameter, no minimum/maximum/length keyword, no 413 (${src.snapshot})`
  else open.boundary = 'no fixture caller can satisfy this door authentication'

  // ---- dependency-failure
  if (isGet && principal && !hasBody(door)) add('dependency-failure', 'host-down')
  else
    open['dependency-failure'] = write
      ? 'a write door needs a valid request body to reach its dependency; per-door body fixtures are not built'
      : 'no fixture caller can satisfy this door authentication'

  // ---- repeat
  if (isGet && principal && !hasBody(door)) add('repeat', 'twice')
  else
    open.repeat = write
      ? 'idempotency of a write is not stated in the snapshot; needs a per-door contract'
      : 'no fixture caller'

  // ---- cleanup
  if (isGet) na.cleanup = `a ${door.method} door creates no resource to clean up (${src.snapshot}: GET)`
  else open.cleanup = 'needs a per-door model of what the door creates and the call that removes it'

  // ---- anonymous / expired-auth
  if (authRequired) {
    add('anonymous', 'no-credentials')
    add('anonymous', 'malformed-credentials')
  } else
    na.anonymous = `${door.id} needs no credential before the door (${src.docs}: auth=${door.doc?.auth ?? 'n/a'}; ${src.snapshot}: security [${door.security}])`
  if (['session', 'admin'].includes(auth)) {
    add('expired-auth', 'expired-session')
    add('expired-auth', 'forged-signature')
  } else if (auth === 'bearer') {
    add('expired-auth', 'revoked-key')
    add('expired-auth', 'wrong-secret')
  } else if (auth === 'actor') add('expired-auth', 'stale-actor')
  else if (authRequired)
    open['expired-auth'] = `${auth}-authenticated: no fixture can mint or age a ${auth} credential`
  else
    na['expired-auth'] =
      `${door.id} has no credential that can expire (${src.docs}: auth=${door.doc?.auth ?? 'n/a'})`

  // ---- wrong-role
  if (auth === 'admin') {
    add('wrong-role', 'customer-owner')
    add('wrong-role', 'seatless-account')
  } else if (authRequired && isSiteScoped(door) && write)
    open['wrong-role'] =
      'the snapshot gives no per-door minimum role for a site door (only the session scheme); no role matrix oracle'
  else if (!authRequired)
    na['wrong-role'] =
      `${door.id} is not role-gated: no authentication (${src.docs}: auth=${door.doc?.auth ?? 'n/a'})`
  else
    na['wrong-role'] =
      `${door.id} is gated by identity only, not by a role (${src.docs}: auth=${door.doc?.auth})`

  // ---- other-tenant
  const outsiderOk = ctx.exceptions?.['other-tenant']?.[door.id]
  if (outsiderOk) na['other-tenant'] = `${outsiderOk.reason} (${outsiderOk.source})`
  else if ((isSiteScoped(door) || isWorkspaceScoped(door)) && ['session', 'bearer'].includes(auth))
    add('other-tenant', 'foreign-site-owner')
  else if (isSiteScoped(door) || isWorkspaceScoped(door))
    open['other-tenant'] = `${auth}-authenticated tenant door: no fixture for a foreign principal`
  else
    na['other-tenant'] =
      `${door.id} names no site or workspace: nothing tenant-scoped is addressed (${src.snapshot} path parameters [${pathParams(door)}])`

  // ---- wrong-method (path level)
  const wrong = wrongMethodsFor(door, siblings)
  const first = siblings[0]
  if (!wrong.length) na['wrong-method'] = `every method of ${door.path} is declared (${src.snapshot})`
  else if (first.id !== door.id) covered['wrong-method'] = caseId(first, 'wrong-method', null)
  else add('wrong-method', null)

  // ---- malformed-body
  if (hasBody(door) && principal) for (const v of malformedVariants(door)) add('malformed-body', v)
  else if (hasBody(door))
    open['malformed-body'] = `no fixture caller can satisfy this door's ${auth} authentication`
  else na['malformed-body'] = `${door.id} declares no request body (${src.snapshot})`

  // ---- encoding-injection
  if (principal || !authRequired) {
    if (pathParams(door).length) for (const v of PATH_INJECTION) add('encoding-injection', `path:${v}`)
    if (queryParams(door).length) for (const v of QUERY_INJECTION) add('encoding-injection', `query:${v}`)
    if (hasBody(door) && bodyProps(door).some(([, s]) => s.type === 'string'))
      for (const v of BODY_INJECTION) add('encoding-injection', `body:${v}`)
    if (!cases.some((c) => c.tag === 'encoding-injection'))
      na['encoding-injection'] =
        `${door.id} has no string input a caller controls: no path/query parameter and no string body property (${src.snapshot})`
  } else open['encoding-injection'] = `no fixture caller can satisfy this door's ${auth} authentication`

  // ---- csrf-origin
  if (write && ['session', 'admin'].includes(auth)) {
    add('csrf-origin', 'foreign-origin')
    add('csrf-origin', 'same-site-fetch-metadata')
  } else if (!write)
    na['csrf-origin'] =
      `a ${door.method} does not change state; the guard covers cookie-carrying writes (${src.csrf})`
  else
    na['csrf-origin'] =
      `${door.id} is not cookie-authenticated (${auth}); the guard leaves doors that never read the session alone (${src.csrf})`

  // ---- pagination
  if (pageParams(door).length && principal) for (const v of pageVariantsFor(door)) add('pagination', v)
  else if (!pageParams(door).length)
    na.pagination = `${door.id} declares no limit, offset or cursor parameter (${src.snapshot})`
  else open.pagination = 'no fixture caller can satisfy this door authentication'

  // ---- rate-limit
  if (door.declaredStatuses.includes('429'))
    open['rate-limit'] =
      'the snapshot declares 429 but no threshold or window; no oracle for how many calls trip it'
  else
    na['rate-limit'] =
      `${door.id} declares no 429 response (${src.snapshot}); no limit obligation in the contract`

  // ---- concurrent
  if (isGet && principal && !hasBody(door)) add('concurrent', 'parallel-reads')
  else
    open.concurrent = write
      ? 'concurrent writes need a per-door state oracle (no lost update, no double create)'
      : 'no fixture caller'

  // ---- partial-write
  if (hasBody(door) && principal && write) add('partial-write', 'refused-writes-leave-no-trace')
  else if (!write) na['partial-write'] = `a ${door.method} door writes nothing (${src.snapshot})`
  else open['partial-write'] = 'a write with no declared body or no fixture caller: no rollback oracle'

  // ---- cancel-timeout
  open['cancel-timeout'] =
    'needs a per-door deadline/abort contract and a stalled dependency; neither is in the snapshot'

  // ---- no-secret-leak
  add('no-secret-leak', 'planted-secrets')

  return { cases, na, open, covered }
}
