// Pure judges: observations in, verdict out. Nothing here touches the network or the database, so the
// selftests can feed a judge a known-good observation and an injected fault.
//
// An observation is { status, headers, text, json, ms, error? } as produced by harness.sender
// (status 0 = no answer: thrown or past the deadline). A judge returns { v, reason } with v one of
// PASS / FAIL / PENDING. A judge never returns ENV: a missing dependency is proven by a probe before
// any request, not inferred from a response.

export const pass = (reason = 'ok') => ({ v: 'PASS', reason })
export const fail = (reason) => ({ v: 'FAIL', reason })
export const pending = (reason) => ({ v: 'PENDING', reason })

export const REDIRECTS = new Set([301, 302, 303, 307, 308])
export const VALIDATION = new Set([400, 413, 415, 422])
export const is2xx = (o) => o.status >= 200 && o.status < 300
export const is4xx = (o) => o.status >= 400 && o.status < 500
export const is5xx = (o) => o.status >= 500 && o.status < 600
export const describe = (o) => (o.status === 0 ? `no answer (${o.error ?? 'unknown'})` : `HTTP ${o.status}`)

/**
 * 501–504 are how a door says "my dependency is not there" (host stub, mail off, model not
 * configured): the harness stubs those on purpose, so such an answer says nothing about the case.
 * No answer, 500 and the rest of 5xx are product failures: the dependency was proven ready.
 */
export const isDependencyAnswer = (o) => o.status >= 501 && o.status <= 504

function crashed(o, what) {
  if (o.status === 0) return fail(`${what}: ${describe(o)}`)
  if (is5xx(o) && !isDependencyAnswer(o)) return fail(`${what}: ${describe(o)}`)
  return null
}

/**
 * Did the credential get past the authentication gate? (a control, not a verdict) A 5xx, including a
 * stubbed dependency's 503, is NOT admission: the request may have failed before or after the gate.
 */
export function passedAuthGate(o) {
  return o.status !== 0 && o.status !== 401 && o.status !== 403 && !REDIRECTS.has(o.status) && !is5xx(o)
}

/**
 * The declared shape of a 2xx answer, when the snapshot has one: the content type must be a declared
 * one, and a schema that is a plain object (required keys) or an array is checked. oneOf/anyOf/allOf
 * schemas are not interpreted: only the content type is judged for them.
 */
export function shapeProblem(o, responses = {}) {
  const declared = responses[String(o.status)]
  if (!declared) return null
  const ct = String(o.headers?.['content-type'] ?? '')
    .split(';')[0]
    .trim()
  if (!declared.contentTypes.includes(ct))
    return `content-type ${ct || 'none'} is not one of the declared ${declared.contentTypes.join(', ')}`
  const schema = declared.schema
  if (!schema || schema.oneOf || schema.anyOf || schema.allOf || o.json === undefined) return null
  if (schema.type === 'array' && !Array.isArray(o.json)) return 'the schema says array, the body is not'
  if (schema.type === 'object' && Array.isArray(schema.required)) {
    const missing = schema.required.filter((k) => !o.json || typeof o.json !== 'object' || !(k in o.json))
    if (missing.length) return `required keys missing from the answer: ${missing.join(', ')}`
  }
  return null
}

export function judgeHappy(o, { served, responses }) {
  if (!served) return pending('route-not-mounted-in-harness')
  const c = crashed(o, 'valid caller')
  if (c) return c
  if (is2xx(o) || o.status === 304) {
    const bad = o.status === 304 ? null : shapeProblem(o, responses)
    return bad ? fail(`declared answer shape violated: ${bad}`) : pass(describe(o))
  }
  if (o.status === 401 || o.status === 403)
    return pending(`TEST_INVALID: fixture caller was refused (${o.status})`)
  if (REDIRECTS.has(o.status))
    return pending(`oracle gap: ${o.status} is not a declared response of this door`)
  return pending(`fixture-unbound: ${describe(o)} for the fixture identifiers`)
}

export function judgeAnonymous(o, { served, control, exception }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control))
    return pending(
      control
        ? `TEST_INVALID: positive control not admitted (${describe(control)})`
        : "no fixture caller can satisfy this door's authentication, so no positive control exists"
    )
  if (exception) return judgeException(o, exception)
  const c = crashed(o, 'anonymous call')
  if (c) return c
  if (o.status === 401 || o.status === 403 || REDIRECTS.has(o.status)) return pass(describe(o))
  if (is2xx(o)) return fail(`a door that needs a credential answered ${o.status} to a call with none`)
  if (o.status === 404)
    return pending('404 to an anonymous call: ambiguous between "no such thing" and a hidden refusal')
  return pending(`unclassified answer ${describe(o)}`)
}

/** Documented exception: the route reference says this door answers a signed-out caller. */
export function judgeException(o, exception) {
  const c = crashed(o, 'documented exception')
  if (c) return c
  if (exception.kind === 'gap') return pending(`oracle gap: ${exception.reason} (${exception.source})`)
  if (o.status !== exception.status)
    return fail(`expected the documented ${exception.status}, got ${describe(o)}`)
  for (const f of exception.jsonNull ?? [])
    if (!o.json || o.json[f] !== null)
      return fail(
        `documented field ${f} must be null for a signed-out caller, got ${JSON.stringify(o.json?.[f])}`
      )
  return pass(`documented: ${exception.source}`)
}

export function judgeRefusedCredential(o, { served, control, exception }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control))
    return pending(
      `TEST_INVALID: positive control not admitted (${control ? describe(control) : 'no valid principal'})`
    )
  if (exception) return judgeException(o, exception)
  const c = crashed(o, 'bad credential')
  if (c) return c
  if (o.status === 401 || o.status === 403 || REDIRECTS.has(o.status)) return pass(describe(o))
  if (is2xx(o)) return fail(`a credential that must be refused was accepted (${o.status})`)
  if (o.status === 404)
    return pending('404 to a bad credential: ambiguous between "no such thing" and a hidden refusal')
  return pending(`unclassified answer ${describe(o)}`)
}

export function judgeStaffOnly(o, { served, control }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control))
    return pending(`TEST_INVALID: staff control not admitted (${control ? describe(control) : 'none'})`)
  const c = crashed(o, 'non-staff caller')
  if (c) return c
  if (o.status === 403) return pass('403')
  if (is2xx(o)) return fail(`a staff-only door answered ${o.status} to a person with no tracy_admin seat`)
  if (REDIRECTS.has(o.status) || o.status === 401)
    return fail(`a signed-in non-staff caller must get 403, got ${o.status}`)
  return pending(`unclassified answer ${describe(o)}`)
}

export function judgeTenant(o, { served, control, canaries, wroteRows }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control) || control.status === 403)
    return pending(`TEST_INVALID: owner control not admitted (${control ? describe(control) : 'none'})`)
  const c = crashed(o, 'foreign principal')
  if (c) return c
  for (const needle of canaries)
    if (o.text.includes(needle)) return fail(`response to another tenant contains ${JSON.stringify(needle)}`)
  if (is2xx(o) || o.status === 304) return fail(`another tenant's principal got ${o.status}`)
  if (wroteRows) return fail(`a refused foreign write changed the database: ${wroteRows}`)
  if (o.status === 400 || o.status === 422)
    return pending('validation ran before authorisation: sample body not accepted, tenancy not exercised')
  if (o.status === 401 || o.status === 403 || o.status === 404) return pass(describe(o))
  return pending(`unclassified answer ${describe(o)}`)
}

/**
 * A method the path does not declare is not executed by the door. It is answered 404/405, or it
 * falls through to the workspace door (the dsh catch-all `ALL /*`), which redirects a signed-in
 * person to the same path under their site — it hands the request to dsh, it never runs a Tracy door.
 */
export const isWorkspaceHandoff = (obs, path) =>
  obs.status === 302 && typeof obs.headers?.location === 'string' && obs.headers.location.endsWith(path)

export function judgeWrongMethod(results, { served }) {
  if (!served) return pending('route-not-mounted-in-harness')
  const bad = []
  const unclear = []
  let judged = 0
  for (const { method, obs, exception, shadowed, path } of results) {
    if (exception || shadowed) continue
    judged += 1
    const c = crashed(obs, method)
    if (c) bad.push(`${method} → ${describe(obs)}`)
    else if (obs.status === 404 || obs.status === 405 || isWorkspaceHandoff(obs, path)) continue
    else if (REDIRECTS.has(obs.status))
      unclear.push(
        `${method} → ${obs.status} to ${obs.headers?.location ?? 'no location'} (the catch-all door is a dynamic mount whose redirect target is not in the oracle)`
      )
    else if (is2xx(obs)) bad.push(`${method} → ${obs.status}`)
    else unclear.push(`${method} → ${obs.status}`)
  }
  if (judged === 0)
    return pending('every undeclared method is shadowed by another declared route that matches the path')
  if (bad.length) return fail(`undeclared methods were served: ${bad.join(', ')}`)
  if (unclear.length) return pending(`undeclared methods answered neither 404 nor 405: ${unclear.join(', ')}`)
  return pass(
    results
      .filter((r) => !r.shadowed)
      .map((r) => `${r.method}:${r.obs.status}`)
      .join(' ')
  )
}

export function judgeBodyRejected(o, { served, control }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control))
    return pending(`TEST_INVALID: valid caller not admitted (${control ? describe(control) : 'none'})`)
  const c = crashed(o, 'malformed body')
  if (c) return c
  if (VALIDATION.has(o.status)) return pass(describe(o))
  if (is2xx(o)) return fail(`a body the schema forbids was accepted (${o.status})`)
  if (o.status === 401 || o.status === 403) return pending(`TEST_INVALID: valid caller refused (${o.status})`)
  if (o.status === 404) return pending('fixture-unbound: 404 before the body was read')
  if (isDependencyAnswer(o)) return pending(`dependency answered before validation (${o.status})`)
  return pending(`unclassified answer ${describe(o)}`)
}

export function judgeEmptyBody(o, ctx) {
  return judgeBodyRejected(o, ctx)
}

export function judgeBoundary(o, ctx) {
  return judgeBodyRejected(o, ctx)
}

export function judgeInvalid(o, { served, control, kind, declared = [] }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control))
    return pending(`TEST_INVALID: valid caller not admitted (${control ? describe(control) : 'none'})`)
  const c = crashed(o, 'invalid input')
  if (c) return c
  if (kind === 'query') {
    if (is4xx(o) && o.status !== 401 && o.status !== 403) return pass(describe(o))
    if (is2xx(o) || o.status === 304)
      return pending(
        'oracle gap: a wrongly typed query value was ignored and the snapshot declares no 400 for it'
      )
    if (isDependencyAnswer(o))
      return pending(
        `a stubbed or unconfigured dependency answered ${o.status} before the query was validated`
      )
    return pending(`unclassified answer ${describe(o)}`)
  }
  if (is4xx(o) && o.status !== 401) return pass(describe(o))
  if (is2xx(o) && (declared.includes('404') || declared.includes('400')))
    return fail(
      `the snapshot declares a 4xx refusal for this door but an invalid identifier succeeded (${o.status})`
    )
  if (is2xx(o))
    return pending(
      'oracle gap: an unknown identifier answered 2xx and the snapshot declares no 400/404 for this door (an empty list or an idempotent no-op is legitimate)'
    )
  if (o.status === 401) return pending('TEST_INVALID: valid caller refused (401)')
  return pending(`unclassified answer ${describe(o)}`)
}

/**
 * A paging edge. The refusal (400/422) is the only answer that proves the bound is enforced. A 2xx
 * proves it only when the snapshot declares the maximum of the parameter (`schema.maximum`) AND the
 * list in the body honours it; with no declared bound the answer is an oracle gap, never a PASS.
 */
export function judgePage(o, { served, control, maximum = null }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || !passedAuthGate(control))
    return pending(`TEST_INVALID: valid caller not admitted (${control ? describe(control) : 'none'})`)
  const c = crashed(o, 'paging edge')
  if (c) return c
  if (o.status === 400 || o.status === 422) {
    if (!/json/i.test(String(o.headers?.['content-type'] ?? '')))
      return fail(
        `a paging refusal ${o.status} is not JSON (content-type ${o.headers?.['content-type'] ?? 'none'})`
      )
    return pass(describe(o))
  }
  if (is2xx(o) || o.status === 304) {
    if (typeof maximum !== 'number')
      return pending(
        'oracle gap: the snapshot declares no maximum for this paging parameter, so accepting the value proves nothing'
      )
    const list = Array.isArray(o.json) ? o.json : Object.values(o.json ?? {}).find(Array.isArray)
    if (!list) return pending('the 2xx body carries no list to compare with the declared maximum')
    return list.length <= maximum
      ? pass(`${list.length} <= declared maximum ${maximum}`)
      : fail(`${list.length} items exceed the declared maximum ${maximum}`)
  }
  if (o.status === 401 || o.status === 403) return pending(`TEST_INVALID: valid caller refused (${o.status})`)
  if (o.status === 404) return pending('fixture-unbound: 404 for the fixture identifiers')
  if (isDependencyAnswer(o))
    return pending(`dependency answered ${o.status} before the paging value was used`)
  return pending(`unclassified answer ${describe(o)}`)
}

const LEAKY_ERRORS = [
  /syntax error at or near/i,
  /unterminated quoted string/i,
  /relation "[^"]+" does not exist/i,
  /column "[^"]+" (of relation|does not exist)/i,
  /invalid input syntax for type/i,
  /\n\s+at\s+\S+\s+\(.+:\d+:\d+\)/,
  /node_modules|node:internal/
]
export const leaksInternals = (text) => LEAKY_ERRORS.find((re) => re.test(text)) ?? null

export function judgeInjection(o, { served, control, changedRows, dbAlive, declared = [], slowMs = 4000 }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (control && !passedAuthGate(control) && control.status !== 0)
    return pending(`TEST_INVALID: valid caller not admitted (${describe(control)})`)
  const c = crashed(o, 'hostile input')
  if (c) return c
  if (isDependencyAnswer(o) && !declared.includes(String(o.status)))
    return pending(`a stubbed or unconfigured dependency answered ${o.status} before the input was used`)
  const leak = leaksInternals(o.text)
  if (leak) return fail(`the answer echoes an internal error (${leak})`)
  const setCookie = String(o.headers['set-cookie'] ?? '')
  if (/(^|\n|;\s*)qa=1/.test(setCookie) || o.headers.qa !== undefined)
    return fail('hostile text became a response header (header injection)')
  if (o.ms >= slowMs) return fail(`the answer took ${o.ms} ms: injected SQL may have run`)
  if (!dbAlive) return fail('the database no longer answers after the request')
  if (is4xx(o) && changedRows) return fail(`a refused request changed the database: ${changedRows}`)
  return pass(describe(o))
}

export function judgeCsrf(o, { served, control }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (!control || (control.status === 403 && control.json?.code === 'CSRF_ORIGIN') || control.status === 0)
    return pending(
      `TEST_INVALID: the same-origin control was itself refused by the origin guard (${control ? describe(control) : 'none'})`
    )
  const c = crashed(o, 'foreign-origin write')
  if (c) return c
  if (o.status === 403 && o.json?.code === 'CSRF_ORIGIN') return pass('403 CSRF_ORIGIN')
  return fail(
    `a cookie-carrying write from a foreign page was answered ${o.status}${o.json?.code ? ` ${o.json.code}` : ''}, not 403 CSRF_ORIGIN`
  )
}

export function judgeDependency(o, { served, declared }) {
  if (!served) return pending('route-not-mounted-in-harness')
  if (o.status === 0) return fail(`host down: ${describe(o)}`)
  if (is2xx(o) || o.status === 304) return pass(`${o.status} without the host`)
  if (declared.includes(String(o.status))) return pass(`declared ${o.status}`)
  if (isDependencyAnswer(o))
    return pending(
      `${o.status} from a stubbed or unconfigured dependency that the snapshot does not declare for this door`
    )
  if (is5xx(o)) return fail(`host down: undeclared ${o.status} (declared: ${declared.join(',')})`)
  return pending(`fixture/auth: ${describe(o)} is a 4xx the snapshot does not declare`)
}

const keyset = (j) =>
  j && typeof j === 'object' && !Array.isArray(j)
    ? Object.keys(j).sort().join(',')
    : Array.isArray(j)
      ? 'array'
      : typeof j
export function judgeRepeat(a, b, { served }) {
  if (!served) return pending('route-not-mounted-in-harness')
  for (const o of [a, b]) {
    const c = crashed(o, 'repeated read')
    if (c) return c
  }
  if (a.status !== b.status) return fail(`identical reads answered ${a.status} then ${b.status}`)
  if (!(is2xx(a) || a.status === 304))
    return pending(`fixture-unbound: ${describe(a)}; stability of a refusal proves nothing about the read`)
  if (keyset(a.json) !== keyset(b.json))
    return fail(`identical reads gave different JSON shapes: ${keyset(a.json)} vs ${keyset(b.json)}`)
  return pass(describe(a))
}

export function judgeConcurrent(list, { served }) {
  if (!served) return pending('route-not-mounted-in-harness')
  for (const o of list) {
    const c = crashed(o, 'parallel read')
    if (c) return c
  }
  const statuses = new Set(list.map((o) => o.status))
  if (statuses.size !== 1) return fail(`parallel identical reads answered ${[...statuses].sort().join(',')}`)
  const [only] = [...statuses]
  if (!(only >= 200 && only < 300) && only !== 304) return pending(`fixture-unbound: all answered ${only}`)
  return pass(`${list.length}× ${only}`)
}

export function judgeEmptyAccount(o, { served, foreign }) {
  if (!served) return pending('route-not-mounted-in-harness')
  const c = crashed(o, 'account with no data')
  if (c) return c
  for (const needle of foreign)
    if (o.text.includes(needle)) return fail(`an account with no data was shown ${JSON.stringify(needle)}`)
  if (is2xx(o) || o.status === 304) return pass(describe(o))
  if (o.status === 401 || o.status === 403)
    return pending(
      `the door refused the data-less account (${o.status}); nothing was shown, but emptiness was not exercised`
    )
  return pending(`unclassified answer ${describe(o)}`)
}

export function judgeUnchanged(steps, { served }) {
  if (!served) return pending('route-not-mounted-in-harness')
  const bad = []
  let refused = 0
  for (const s of steps) {
    if (s.obs.status === 0 || (is5xx(s.obs) && !isDependencyAnswer(s.obs)))
      bad.push(`${s.variant}: ${describe(s.obs)}`)
    else if (is4xx(s.obs)) {
      refused += 1
      if (s.changed) bad.push(`${s.variant}: HTTP ${s.obs.status} but ${s.changed}`)
    }
    // 2xx (accepted: the body judges that) and 501–504 (a dependency answered first) are not refusals.
  }
  if (bad.length) return fail(`refused writes left traces: ${bad.join('; ')}`)
  if (refused === 0) return pending('no request was refused by the door itself: nothing to compare')
  return pass(`${refused} refused requests, no table changed`)
}

/** Secrets: planted values must not appear anywhere in what a door produced. */
export function judgeNoSecret(observations, { secrets, served }) {
  if (!served) return pending('route-not-mounted-in-harness')
  const real = observations.filter((o) => o.status !== 0)
  if (real.length === 0) return pending('no response was observed for this door')
  for (const o of real) {
    const haystack = `${o.text}\n${JSON.stringify(o.headers)}`
    for (const [name, value] of Object.entries(secrets))
      if (value && haystack.includes(value))
        return fail(`planted secret ${name} appears in a response (HTTP ${o.status})`)
    const cookies = String(o.headers['set-cookie'] ?? '')
    for (const line of cookies.split('\n').filter((l) => l.startsWith('tracy_sess=')))
      if (!/;\s*HttpOnly/i.test(line)) return fail('the session cookie is set without HttpOnly')
  }
  return pass(`${real.length} responses scanned for ${Object.keys(secrets).length} planted secrets`)
}

export const JUDGES = Object.freeze({
  'api.happy.success-status': judgeHappy,
  'api.empty.no-foreign-data': judgeEmptyAccount,
  'api.empty.body-rejected': judgeEmptyBody,
  'api.invalid.refused': judgeInvalid,
  'api.boundary.rejected': judgeBoundary,
  'api.dependency.declared-status': judgeDependency,
  'api.repeat.stable': judgeRepeat,
  'api.anonymous.refused': judgeAnonymous,
  'api.credentials.refused': judgeRefusedCredential,
  'api.role.staff-only': judgeStaffOnly,
  'api.tenant.isolated': judgeTenant,
  'api.method.not-served': judgeWrongMethod,
  'api.body.rejected': judgeBodyRejected,
  'api.injection.contained': judgeInjection,
  'api.csrf.foreign-origin-refused': judgeCsrf,
  'api.page.bounded': judgePage,
  'api.concurrent.stable': judgeConcurrent,
  'api.write.unchanged-after-refusal': judgeUnchanged,
  'api.secret.none': judgeNoSecret
})
