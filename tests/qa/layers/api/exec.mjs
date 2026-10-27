// Executes one case manifest against a booted app: builds the request(s) the variant names from the
// oracle's door entry, sends them through harness.sender, and hands the observations to a pure judge.
import { runScenario } from './scenarios.mjs'
import { FIXTURE, ORIGIN, SECRETS } from './harness.mjs'
import { JUDGES, pending } from './assertions.mjs'
import {
  INJECTION,
  ALL_METHODS,
  bodyProps,
  isV1,
  isWorkspaceScoped,
  malformedVariants,
  pathParams,
  queryParams,
  requiredProps,
  validPrincipal,
  wrongMethodsFor
} from './plan.mjs'

const UUID = '00000000-0000-4000-8000-000000000001'
const SAME_ORIGIN = { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }

/** A registered route matches (method or ALL), the way Hono would route it. */
export function makeRouteTable(app) {
  const compiled = app.routes.map((r) => ({
    method: r.method,
    re: new RegExp(
      `^${r.path
        .replace(/[.+?^$()|[\]\\]/g, '\\$&')
        .replace(/:[A-Za-z0-9_]+/g, '[^/]+')
        .replace(/\*/g, '.*')}/?$`
    )
  }))
  return (method, path) =>
    compiled.some((r) => (r.method === method || r.method === 'ALL') && r.re.test(path))
}

export function sampleValue(spec = {}) {
  if (Array.isArray(spec.enum)) return spec.enum[0]
  switch (spec.type) {
    case 'integer':
    case 'number':
      return typeof spec.minimum === 'number' ? spec.minimum : 1
    case 'boolean':
      return true
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return 'qa'
  }
}

/** The smallest body the schema accepts: every required property with a plausible value. */
export function sampleBody(door) {
  const out = {}
  const props = door.body?.schema?.properties ?? {}
  for (const f of requiredProps(door)) out[f] = sampleValue(props[f])
  return out
}

const wrongTyped = (spec = {}) => {
  switch (spec.type) {
    case 'string':
      return 12345
    case 'integer':
    case 'number':
      return 'not-a-number'
    case 'boolean':
      return 'yes'
    case 'array':
      return { not: 'an array' }
    case 'object':
      return ['not', 'an', 'object']
    default:
      return null
  }
}

/** The request body (as sent) for a malformed-body / empty / boundary variant. */
export function bodyFor(door, variant) {
  const base = sampleBody(door)
  const props = door.body?.schema?.properties ?? {}
  const bound = /^(.+):(minimum-1|maximum\+1|minLength-1|maxLength\+1|maxItems\+1)$/.exec(variant)
  const [kind, field] = bound ? [bound[2], bound[1]] : variant.split(':')
  switch (kind) {
    case 'json-truncated':
      return '{"a":'
    case 'json-array-root':
      return '[]'
    case 'json-null':
      return 'null'
    case 'json-string':
      return '"x"'
    case 'empty-body':
    case 'empty-object':
      return door.body?.schema ? '{}' : ''
    case 'missing': {
      const { [field]: _gone, ...rest } = base
      return rest
    }
    case 'wrong-type':
      return { ...base, [field]: wrongTyped(props[field]) }
    case 'enum-violation':
      return { ...base, [field]: 'qa-not-in-the-enum' }
    case 'additional-property':
      return { ...base, qa_unexpected_property: 1 }
    case 'minimum-1':
      return { ...base, [field]: props[field].minimum - 1 }
    case 'maximum+1':
      return { ...base, [field]: props[field].maximum + 1 }
    case 'minLength-1':
      return { ...base, [field]: 'x'.repeat(Math.max(0, props[field].minLength - 1)) }
    case 'maxLength+1':
      return { ...base, [field]: 'x'.repeat(props[field].maxLength + 1) }
    case 'maxItems+1':
      return { ...base, [field]: Array.from({ length: props[field].maxItems + 1 }, () => 'x') }
    default:
      throw new Error(`unknown body variant ${variant}`)
  }
}

const injectionValue = (name) => INJECTION[name]

export class Executor {
  /**
   * @param {{ send: Function, downSend: Function, routeTable: Function, ids: object, principals: object,
   *   fingerprint: () => Promise<object>, alive: () => Promise<boolean>, secrets: object,
   *   doorsByPath: Map<string, object[]>, history: Map<string, object[]>, doorIndex: Map<string, object> }} env
   */
  constructor(env) {
    this.env = env
  }

  where(door) {
    return isV1(door) ? 'api' : 'tracy'
  }

  bind(door, overrides = {}) {
    const { ids } = this.env
    return door.path.replace(/\{([^}]+)\}/g, (_, name) => {
      if (name in overrides) return overrides[name]
      if (name === 'key') return encodeURIComponent(FIXTURE.siteA)
      if (name === 'id') return isWorkspaceScoped(door) ? ids.workspaceA : UUID
      if (name === 'accountId') return UUID
      if (name === 'platform') return 'joomla'
      return 'qa-x'
    })
  }

  async authHeaders(who) {
    const p = this.env.principals
    switch (who) {
      case 'owner':
        return { cookie: await p.cookie(FIXTURE.owner) }
      case 'staff':
        return { cookie: await p.cookie(FIXTURE.staff) }
      case 'nobody':
        return { cookie: await p.cookie(FIXTURE.nobody) }
      case 'outsider':
        return { cookie: await p.cookie(FIXTURE.outsider) }
      case 'bearer-owner':
        return { authorization: `Bearer ${p.bearer.ownerA}` }
      case 'bearer-outsider':
        return { authorization: `Bearer ${p.bearer.outsiderB}` }
      case 'actor-owner':
        return { 'x-tracy-actor': await p.actor(FIXTURE.owner) }
      default:
        return {}
    }
  }

  /** One call; every observation is remembered under the door for the secret scan. */
  async call(
    door,
    { who = null, headers = {}, body, method = door.method, path, query = '', sameOrigin = true, send } = {}
  ) {
    const auth = who ? await this.authHeaders(who) : {}
    const h = { ...(sameOrigin && method !== 'GET' ? SAME_ORIGIN : {}), ...auth, ...headers }
    let payload = body
    if (payload !== undefined && !('content-type' in h)) h['content-type'] = 'application/json'
    if (payload !== undefined && typeof payload !== 'string') payload = JSON.stringify(payload)
    const obs = await (send ?? this.env.send)({
      method,
      path: `${path ?? this.bind(door)}${query}`,
      where: this.where(door),
      headers: h,
      body: payload
    })
    const list = this.env.history.get(door.id) ?? []
    list.push(obs)
    this.env.history.set(door.id, list)
    return obs
  }

  /** The valid caller of a door, sending a request that satisfies it (body: smallest valid sample). */
  validCall(door, extra = {}) {
    const who = validPrincipal(door)
    return this.call(door, {
      who,
      body: door.body && door.method !== 'GET' ? sampleBody(door) : undefined,
      ...extra
    })
  }

  served(door) {
    return this.env.routeTable(door.method, door.path.replace(/\{[^}]+\}/g, 'x'))
  }

  /** The api_key ids `who` authenticates with: the only rows whose bookkeeping a refused call may move. */
  ownKeys(who) {
    const ids = this.env.ids
    return { 'bearer-owner': [ids.keyOwnerA.id], 'bearer-outsider': [ids.keyOutsiderB.id] }[who] ?? []
  }

  witness(who) {
    return this.env.fingerprint(this.ownKeys(who))
  }

  async changed(before, who) {
    const after = await this.witness(who)
    const diff = Object.keys(after)
      .filter((t) => after[t] !== before[t])
      .map((t) => `${t} ${before[t]}→${after[t]}`)
    return diff.length ? diff.join(', ') : null
  }

  /** Returns { v, reason, observations: [...] } for a manifest. */
  async run(manifest) {
    if (manifest.scenario) return runScenario(manifest, this.env)
    const door = this.env.doorIndex.get(manifest.itemIds[0])
    if (!door)
      return { v: 'PENDING', reason: `door ${manifest.itemIds[0]} is not in the oracle`, observations: [] }
    const tag = manifest.edgeTags[0]
    const variant = manifest.variant
    const served = this.served(door)
    const judge = JUDGES[manifest.assertionIds[0]]
    if (!judge) return { v: 'PENDING', reason: `no judge for ${manifest.assertionIds[0]}`, observations: [] }
    const seen = []
    const note = (label, o) => (
      seen.push({
        label,
        status: o.status,
        ms: o.ms,
        text: (o.text ?? '').slice(0, 240),
        error: o.error,
        location: o.headers?.location
      }),
      o
    )
    const exceptions = this.env.exceptions ?? {}
    const verdict = await this[`do_${tag.replaceAll('-', '_')}`](door, variant, {
      served,
      judge,
      note,
      exceptions,
      manifest
    })
    return { ...verdict, observations: seen }
  }

  async do_happy(door, _variant, { served, judge, note }) {
    return judge(note('valid', await this.validCall(door)), { served, responses: door.responses })
  }

  async do_empty(door, variant, { served, judge, note }) {
    if (variant === 'empty-object') {
      const control = note('control', await this.validCall(door))
      const o = note(
        'empty',
        await this.call(door, { who: validPrincipal(door), body: bodyFor(door, 'empty-object') })
      )
      return judge(o, { served, control })
    }
    const principal = validPrincipal(door)
    const who =
      principal === 'bearer-owner' ? 'bearer-outsider' : principal === 'owner' ? 'nobody' : principal
    const o = note('no-data', await this.call(door, { who }))
    const foreign = [
      FIXTURE.canary,
      FIXTURE.siteA,
      FIXTURE.owner,
      FIXTURE.editor,
      FIXTURE.viewer,
      FIXTURE.staff
    ]
    return judge(o, { served, foreign })
  }

  async do_invalid(door, variant, { served, judge, note }) {
    const control = note('control', await this.validCall(door))
    const who = validPrincipal(door)
    if (variant === 'query-wrong-type') {
      const q = queryParams(door)
        .map((n) => `${encodeURIComponent(n)}=%FF%FE-not-a-number`)
        .join('&')
      return judge(note('invalid', await this.call(door, { who, query: `?${q}` })), {
        served,
        control,
        kind: 'query',
        declared: door.declaredStatuses
      })
    }
    const value = variant === 'path-overlong' ? 'a'.repeat(300) : 'NOT A VALID IDENTIFIER!!'
    const overrides = Object.fromEntries(pathParams(door).map((n) => [n, encodeURIComponent(value)]))
    return judge(note('invalid', await this.call(door, { who, path: this.bind(door, overrides) })), {
      served,
      control,
      kind: 'path',
      declared: door.declaredStatuses
    })
  }

  async do_boundary(door, variant, ctx) {
    const [kind, rest] = [variant.split(':')[0], variant.split(':').slice(1).join(':')]
    return kind === 'page' ? this.do_pagination(door, rest, ctx) : this.sendBody(door, rest, ctx)
  }

  async do_malformed_body(door, variant, ctx) {
    return this.sendBody(door, variant, ctx)
  }

  async sendBody(door, variant, { served, judge, note }) {
    const control = note('control', await this.validCall(door))
    const body = bodyFor(door, variant)
    const o = note(
      variant,
      await this.call(door, { who: validPrincipal(door), body: body === '' ? undefined : body })
    )
    return judge(o, { served, control })
  }

  async do_pagination(door, variant, { served, judge, note }) {
    const [name, v] = variant.split(':')
    const value = {
      zero: '0',
      negative: '-1',
      'above-max': '1000000000',
      'not-a-number': 'abc',
      garbage: '!!not-a-cursor!!',
      empty: ''
    }[v]
    const control = note('control', await this.validCall(door))
    const o = note(
      variant,
      await this.call(door, { who: validPrincipal(door), query: `?${name}=${encodeURIComponent(value)}` })
    )
    const maximum = door.params.find((q) => q.in === 'query' && q.name === name)?.schema?.maximum ?? null
    return judge(o, { served, control, maximum })
  }

  async do_dependency_failure(door, _variant, { served, judge, note }) {
    const o = note('host-down', await this.call(door, { who: validPrincipal(door), send: this.env.downSend }))
    return judge(o, { served, declared: door.declaredStatuses })
  }

  async do_repeat(door, _variant, { served, judge, note }) {
    const a = note('first', await this.validCall(door))
    const b = note('second', await this.validCall(door))
    return judge(a, b, { served })
  }

  async do_concurrent(door, _variant, { served, judge, note }) {
    const list = await Promise.all(Array.from({ length: 8 }, () => this.validCall(door)))
    list.forEach((o, i) => note(`parallel-${i}`, o))
    return judge(list, { served })
  }

  async control(door) {
    return this.validCall(door)
  }

  async do_anonymous(door, variant, { served, judge, note, exceptions }) {
    const control = validPrincipal(door) ? note('control', await this.validCall(door)) : null
    const headers =
      variant === 'malformed-credentials'
        ? {
            cookie: 'tracy_sess=garbage',
            authorization: 'Bearer trk_garbage.garbage',
            'x-tracy-actor': 'garbage'
          }
        : {}
    const before = await this.witness(null)
    const o = note(
      variant,
      await this.call(door, {
        headers,
        body: door.body && door.method !== 'GET' ? sampleBody(door) : undefined
      })
    )
    const exception = exceptions.anonymous?.[door.id]
    const verdict = judge(o, { served, control, exception })
    if (verdict.v === 'PASS' && !exception) {
      const changed = await this.changed(before, null)
      if (changed) return { v: 'FAIL', reason: `a refused anonymous call changed the database: ${changed}` }
    }
    return verdict
  }

  async do_expired_auth(door, variant, { served, judge, note }) {
    const control = note('control', await this.validCall(door))
    const p = this.env.principals
    const who = validPrincipal(door)
    const mail = who === 'staff' ? FIXTURE.staff : FIXTURE.owner
    const headers = {
      'expired-session': async () => ({ cookie: await p.expiredCookie(mail) }),
      'forged-signature': async () => ({ cookie: await p.forgedCookie(mail) }),
      'revoked-key': async () => ({ authorization: `Bearer ${this.env.ids.keyRevoked.key}` }),
      'wrong-secret': async () => ({
        authorization: `Bearer trk_${this.env.ids.keyOwnerA.id}.${'0'.repeat(43)}`
      }),
      'stale-actor': async () => ({ 'x-tracy-actor': await p.staleActor(FIXTURE.owner) })
    }[variant]
    const o = note(
      variant,
      await this.call(door, {
        headers: await headers(),
        body: door.body && door.method !== 'GET' ? sampleBody(door) : undefined
      })
    )
    return judge(o, { served, control, exception: this.env.exceptions?.anonymous?.[door.id] })
  }

  async do_wrong_role(door, variant, { served, judge, note }) {
    const control = note('control', await this.validCall(door))
    const who = variant === 'seatless-account' ? 'nobody' : 'owner'
    const o = note(
      variant,
      await this.call(door, { who, body: door.body && door.method !== 'GET' ? sampleBody(door) : undefined })
    )
    return judge(o, { served, control })
  }

  async do_other_tenant(door, _variant, { served, judge, note }) {
    const control = note('owner-control', await this.validCall(door))
    const who = isV1(door) ? 'bearer-outsider' : 'outsider'
    const before = await this.witness(who)
    const o = note(
      'foreign',
      await this.call(door, { who, body: door.body && door.method !== 'GET' ? sampleBody(door) : undefined })
    )
    const wroteRows = o.status >= 400 && o.status < 500 ? await this.changed(before, who) : null
    return judge(o, { served, control, canaries: [FIXTURE.canary], wroteRows })
  }

  async do_wrong_method(door, _variant, { served, judge, note, exceptions }) {
    const siblings = this.env.doorsByPath.get(door.path)
    const results = []
    // A principal that would be admitted by the path's own doors, so the refusal is about the method.
    const who = siblings.map(validPrincipal).find(Boolean) ?? 'owner'
    const path = this.bind(door)
    for (const method of wrongMethodsFor(door, siblings)) {
      // Another declared route with that method may match this concrete path (`/comments/clear` is
      // also `/comments/{id}`): then the method is not undeclared here, and the probe proves nothing.
      const shadowed = this.shadowed(method, path, door)
      const obs = shadowed
        ? { status: 0, headers: {}, text: '' }
        : note(method, await this.call(door, { who, method, body: method === 'GET' ? undefined : {} }))
      results.push({
        method,
        obs,
        path,
        shadowed,
        exception: exceptions['wrong-method']?.[`${method} ${door.path}`] ?? null
      })
    }
    return judge(results, { served })
  }

  shadowed(method, concretePath, own) {
    for (const other of this.env.doorIndex.values()) {
      if (other.method !== method || other.path === own.path) continue
      const re = new RegExp(
        `^${other.path.replace(/[.+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`
      )
      if (re.test(concretePath)) return true
    }
    return false
  }

  async do_encoding_injection(door, variant, { served, judge, note }) {
    const who = validPrincipal(door)
    const control = who ? note('control', await this.validCall(door)) : null
    const [slot, name] = [variant.split(':')[0], variant.split(':').slice(1).join(':')]
    const raw = injectionValue(name)
    const encoded = raw.includes('%') ? raw : encodeURIComponent(raw)
    const before = await this.witness(who)
    let req
    if (slot === 'path') {
      const target = pathParams(door).includes('key') ? 'key' : pathParams(door)[0]
      req = { path: this.bind(door, { [target]: encoded }) }
    } else if (slot === 'query') req = { query: `?${encodeURIComponent(queryParams(door)[0])}=${encoded}` }
    else {
      const body = sampleBody(door)
      for (const [f, s] of bodyProps(door)) if (s.type === 'string') body[f] = raw
      req = { body }
    }
    const o = note(variant, await this.call(door, { who, ...req }))
    const changedRows = o.status >= 400 && o.status < 500 ? await this.changed(before, who) : null
    const dbAlive = await this.env.alive()
    return judge(o, { served, control, changedRows, dbAlive, declared: door.declaredStatuses })
  }

  async do_csrf_origin(door, variant, { served, judge, note }) {
    const who = validPrincipal(door)
    const body = door.body ? sampleBody(door) : undefined
    const control = note('same-origin-control', await this.call(door, { who, body }))
    const headers =
      variant === 'foreign-origin'
        ? { origin: 'http://acme.tracy.test', 'content-type': 'text/plain' }
        : { 'sec-fetch-site': 'same-site', 'content-type': 'application/json' }
    const o = note(variant, await this.call(door, { who, body, headers, sameOrigin: false }))
    return judge(o, { served, control })
  }

  async do_partial_write(door, _variant, { served, judge, note }) {
    const steps = []
    const who = validPrincipal(door)
    for (const variant of malformedVariants(door)) {
      const before = await this.witness(who)
      const body = bodyFor(door, variant)
      const obs = note(variant, await this.call(door, { who, body: body === '' ? undefined : body }))
      steps.push({
        variant,
        obs,
        changed: obs.status >= 400 && obs.status < 500 ? await this.changed(before, who) : null
      })
    }
    return judge(steps, { served })
  }

  async do_no_secret_leak(door, _variant, { served, judge, note }) {
    const probes = [
      note('valid', await this.validCall(door)),
      note('anonymous', await this.call(door, {})),
      note('outsider', await this.call(door, { who: isV1(door) ? 'bearer-outsider' : 'outsider' }))
    ]
    const observations = [...probes, ...(this.env.history.get(door.id) ?? [])]
    return judge(observations, { served, secrets: this.env.secretValues })
  }
}

export { SECRETS, pending, ALL_METHODS }
