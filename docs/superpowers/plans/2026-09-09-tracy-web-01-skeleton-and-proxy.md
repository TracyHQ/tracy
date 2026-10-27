# Plan 1/5 — `apps/tracy-web` skeleton: Hono · Postgres · OTP sign-in · session proxy to dsh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Node service running at `localhost:8080` that lets a person sign in with an OTP code (printed to the log), then open
`/<siteKey>/` and **complete one chat turn** with the agent in the local `tracy-dsh` — both HTTP and WebSocket go through
`tracy-web`, with the seat session minted by `tracy-web` through the `/gateway/seat/session` door of `dsh-passwords`.

**Architecture:** Hono on `@hono/node-server`; one folder per domain with `route.js` + `store.js`;
`server.js` keeps `upgrade` **outside** Hono. Configuration comes from `process.env` through one function; an empty variable = off.
The site ledger in Plan 1 is a minimal resolver that reads `HOSTS` (Plan 2 replaces it with the `site` table).

**Tech Stack:** Node 24 · Hono 4 · `@hono/node-server` · `pg` 8 · `node --test` · Postgres 16 (compose) ·
local `tracy-dsh` from `packages/tools/tracy-subprocess-docker/dev/compose.yml`.

**Spec:** [`docs/superpowers/specs/2026-09-09-tracy-web-host-design.md`](../specs/2026-09-09-tracy-web-host-design.md)
— §3, §4.1, §4.2, §4.5, §6, §7, §13.5. Read the spec first; this plan does not repeat the reasoning.

## Global Constraints

- Node `^22.19.0 || >=24.0.0` (CLAUDE.md §5) — run the plan with Node **24.11.1** (`~/.nvm/versions/node/v24.11.1/bin`).
- pnpm as chosen by corepack: `11.18.0` at the root. No `npm i -g pnpm`.
- New code: JavaScript ESM `.js`/`.mjs`, **comments and strings in English** (CLAUDE.md §7; the `check-language` gate will scan `apps/`).
- Format per the repo's biome/oxlint (no semicolons, single quotes, 2 spaces). `pnpm lint` fixes it for you.
- No `link:`/`file:`/absolute paths in `package.json` (RULE #1). New dependencies only from npmjs, **pinned to the exact version** (`pnpm add hono@<version>`, no `^`).
- Do not change a single line in `vendor/`, `packages/`, `workers/` in this plan (except Task 1, which edits the repo root and `scripts/check-language.ts`).
- No secrets in the repo: `.env` is gitignored, only `.env.example` is committed.
- The `dsh-passwords` contract does not change: seat door signature `<timestamp>\n<nonce>\nPOST\n<path>\n<sha256hex(body)>`; grant `{ role, email, folders, site }`; the dsh session cookie is named `dsh_gateway_token`.
- Cookie `tracy_sess`: `v1.<payload>.<sig>`, HMAC-SHA256, `exp` 12 h, `Domain` from configuration (empty = host-only), `HttpOnly; SameSite=Lax`, `Secure` only when `TRACY_ORIGIN` is `https`.
- Every commit ends with the session's two attribution lines (see the system prompt).

---

## File map

```
apps/tracy-web/
  package.json                 @tracy/web · "type": "module" · scripts: start · test
  Dockerfile                   node:24-slim, COPY apps/tracy-web + workers/{fleet-bar,seat-door,shared}? — NO: Plan 1 does not import workers/
  src/config.js                readConfig(env) → { origin, siteDomain, sessionDomain, secure, databaseUrl, sessionSecret, mail, hosts, defaultHost, actorSecret }
  src/app.js                   buildApp(deps) → Hono app  (deps = { config, identity, sites, seatDoor, log })
  src/server.js                start(): createServer + app.fetch + server.on('upgrade', forwardUpgrade)
  src/lib/base64url.js         encode/decode
  src/lib/session.js           mintSession(email, secret, ttlS) · verifySession(token, secret, now) · cookie header helpers
  src/lib/hmac.js              hmacHex(secret, message) · sha256Hex(text)
  src/lib/cookies.js           parseCookies(header) · seatTokenCookieName(hostName, scope) · stripTracyCookies(header)
  src/db/index.js              createPool(url) · migrate(pool, dir)
  src/db/migrations/001-identity.sql
  src/identity/otp.js          generateCode(rng) · hashCode(code, email, pepper)  (pure)
  src/identity/store.js        pgIdentityStore(pool) · memoryIdentityStore()   — same interface
  src/identity/route.js        identityRoutes({ store, mail, config }) → Hono sub-app
  src/mail/transport.js        consoleTransport(log) · resendTransport(key, from)
  src/sites/resolver.js        hostsResolver(config) → { hostOf(siteKey), dshOf(hostName), labelOf(siteKey) }   (temporary, Plan 2 replaces)
  src/sites/label.js           fleetLabel(siteKey) — ported as-is from workers/seat-registry/src/fleet.js
  src/workspace/seat-door.js   signSeatCall · callSeatDoor · mintSeatSession   — ported from workers/seat-door/src/index.js
  src/workspace/proxy.js       forwardHttp(request, target, opts) · forwardUpgrade(req, socket, head, target, opts)
  src/workspace/route.js       workspaceRoutes(deps) → Hono sub-app (catch-all)
  test/*.test.mjs
deploy/compose.yml             postgres + tracy-web (+ profile server: cloudflared — Plan 5)
deploy/.env.example
```

Rule: `identity/`, `sites/`, `workspace/`, `mail/` **do not import each other**; only `app.js`, `lib/`, `db/` may import across. Task 9 guards that rule with a test.

---

### Task 1: The `@tracy/web` package stands up, and the gates know it exists

**Files:**
- Create: `apps/tracy-web/package.json`, `apps/tracy-web/src/app.js`, `apps/tracy-web/test/health.test.mjs`
- Modify: `pnpm-workspace.yaml:10-12` (the `packages:` block), `package.json:21` (`test:workers`), `scripts/check-language.ts:58` (`SCAN_DIRS`)

**Interfaces:**
- Produces: `buildApp(deps)` → Hono app with `GET /health` → `200 {"ok":true}`. `deps` is an object; Task 1 reads no field of it.

- [ ] **Step 1: Declare the package and add it to the workspace**

`apps/tracy-web/package.json`:
```json
{
  "name": "@tracy/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Tracy's own door: sign-in, the seat book, and the proxy into each host's dsh.",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test test/*.test.mjs"
  },
  "engines": { "node": "^22.19.0 || >=24.0.0" }
}
```

`pnpm-workspace.yaml` — add the first line under `packages:`:
```yaml
packages:
  - apps/*
  - packages/*/*
```

- [ ] **Step 2: Install dependencies with pinned versions**

```bash
cd apps/tracy-web && pnpm add hono @hono/node-server pg --save-exact && cd ../..
```
Record the three resolved versions in the commit message.

- [ ] **Step 3: Write the failing test**

`apps/tracy-web/test/health.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'

test('GET /health answers 200 with ok:true', async () => {
  const app = buildApp({})
  const res = await app.fetch(new Request('http://tracy.test/health'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})
```

- [ ] **Step 4: Run it to see it fail**

Run: `node --test apps/tracy-web/test/health.test.mjs`
Expected: FAIL — `Cannot find module '../src/app.js'`

- [ ] **Step 5: Minimal `app.js`**

`apps/tracy-web/src/app.js`:
```js
/**
 * The one Hono app. Every domain hangs its routes here, in this order — the order IS the module
 * graph, and nothing else in src/ may import across domains (test/module-graph.test.mjs).
 */
import { Hono } from 'hono'

export function buildApp(deps) {
  const app = new Hono()
  app.get('/health', (c) => c.json({ ok: true }))
  return app
}
```

- [ ] **Step 6: Green**

Run: `node --test apps/tracy-web/test/health.test.mjs`
Expected: PASS (1 test)

- [ ] **Step 7: The gates know about `apps/`**

`package.json`, the `test:workers` line:
```json
"test:workers": "node --test apps/*/test/*.test.mjs workers/*/test/*.test.mjs scripts/test/*.test.mjs packages/*/*/test/*.test.mjs",
```
`scripts/check-language.ts` line 58:
```ts
const SCAN_DIRS = ['apps', 'packages', 'workers', 'vendor/dsh-passwords/src']
```
Run: `pnpm test:workers 2>&1 | tail -3` → `pass` goes up by exactly 1, `fail 0`.
Run: `pnpm exec tsx scripts/check-language.ts` → green.

- [ ] **Step 8: Commit**

```bash
git add apps/tracy-web pnpm-workspace.yaml pnpm-lock.yaml package.json scripts/check-language.ts
git commit -m "feat(web): @tracy/web stands up — Hono app with /health, gates now scan apps/"
```

---

### Task 2: `config.js` — one function reads env, an empty variable means off

**Files:**
- Create: `apps/tracy-web/src/config.js`, `apps/tracy-web/test/config.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  readConfig(env: Record<string,string|undefined>): {
    origin: string            // TRACY_ORIGIN, no trailing /
    secure: boolean           // origin starts with https
    siteDomain: string        // SITE_DOMAIN
    sessionDomain: string|null// SESSION_DOMAIN, '' → null
    sessionSecret: string     // SESSION_SECRET — throws if missing
    databaseUrl: string|null  // DATABASE_URL, '' → null
    mail: { kind: 'console' } | { kind: 'resend', key: string, from: string }
    hosts: Map<string, { origin: string, dshOrigin: string, hostSecret: string, seatSecret: string }>
                              // from HOSTS + HOST_<h>_ORIGIN (tracy-host) + HOST_<h>_DSH_ORIGIN (the host's dsh) + HOST_<h>_SECRET + SEAT_<h>_SECRET
    defaultHost: string       // first name in HOSTS
    actorSecret: string|null  // MCP_TRACY_ACTOR_SECRET
  }
  ```
  Throws `ConfigError` (extends Error, `.key`) when `SESSION_SECRET` is missing, `HOSTS` is empty, or a host lacks one of its three lines.

- [ ] **Step 1: Failing test**

`apps/tracy-web/test/config.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig, ConfigError } from '../src/config.js'

const base = {
  TRACY_ORIGIN: 'http://localhost:8080/',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://127.0.0.1:8090',
  HOST_local_DSH_ORIGIN: 'http://127.0.0.1:51790',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

test('empty means off: no mail key is the console transport, no session domain is host-only', () => {
  const c = readConfig({ ...base, MAIL: '', SESSION_DOMAIN: '', DATABASE_URL: '' })
  assert.equal(c.origin, 'http://localhost:8080')
  assert.equal(c.secure, false)
  assert.deepEqual(c.mail, { kind: 'console' })
  assert.equal(c.sessionDomain, null)
  assert.equal(c.databaseUrl, null)
})

test('hosts are read as triplets and the first is the default', () => {
  const c = readConfig({
    ...base,
    HOSTS: 'prod1,host2',
    HOST_prod1_ORIGIN: 'https://prod1-agent.example.com',
    HOST_prod1_DSH_ORIGIN: 'https://prod1-agent.example.com',
    HOST_prod1_SECRET: 'a',
    SEAT_prod1_SECRET: 'b',
    HOST_host2_ORIGIN: 'https://host2-agent.example.com',
    HOST_host2_DSH_ORIGIN: 'https://host2-agent.example.com',
    HOST_host2_SECRET: 'c',
    SEAT_host2_SECRET: 'd'
  })
  assert.equal(c.defaultHost, 'prod1')
  assert.deepEqual(c.hosts.get('host2'), {
    origin: 'https://host2-agent.example.com',
    dshOrigin: 'https://host2-agent.example.com',
    hostSecret: 'c',
    seatSecret: 'd'
  })
})

test('a host missing one of its three lines is refused by name', () => {
  assert.throws(
    () => readConfig({ ...base, HOSTS: 'local', SEAT_local_SECRET: '' }),
    (e) => e instanceof ConfigError && e.key === 'SEAT_local_SECRET'
  )
})

test('resend mail needs a key and a from', () => {
  const c = readConfig({ ...base, MAIL: 'resend:re_123', MAIL_FROM: 'Tracy <no-reply@tracy.ai>' })
  assert.deepEqual(c.mail, { kind: 'resend', key: 're_123', from: 'Tracy <no-reply@tracy.ai>' })
  assert.throws(() => readConfig({ ...base, MAIL: 'resend:re_123' }), (e) => e.key === 'MAIL_FROM')
})
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module '../src/config.js'`)

- [ ] **Step 3: Write `config.js`**

```js
/**
 * Every setting the service reads, read once, here. An empty variable means the feature is off —
 * that is the contract every deployment (laptop, dev host, production) shares.
 */
export class ConfigError extends Error {
  constructor(key, why) {
    super(`${key}: ${why}`)
    this.key = key
  }
}

const need = (env, key) => {
  const v = env[key]
  if (typeof v !== 'string' || v === '') throw new ConfigError(key, 'is required')
  return v
}
const opt = (env, key) => (typeof env[key] === 'string' && env[key] !== '' ? env[key] : null)

function readMail(env) {
  const raw = opt(env, 'MAIL') ?? 'console'
  if (raw === 'console') return { kind: 'console' }
  if (raw.startsWith('resend:')) return { kind: 'resend', key: raw.slice('resend:'.length), from: need(env, 'MAIL_FROM') }
  throw new ConfigError('MAIL', `unknown transport "${raw}" — use console or resend:<key>`)
}

function readHosts(env) {
  const names = need(env, 'HOSTS').split(',').map((s) => s.trim()).filter(Boolean)
  if (names.length === 0) throw new ConfigError('HOSTS', 'names no host')
  const hosts = new Map()
  for (const name of names) {
    hosts.set(name, {
      origin: need(env, `HOST_${name}_ORIGIN`).replace(/\/+$/, ''),
      dshOrigin: need(env, `HOST_${name}_DSH_ORIGIN`).replace(/\/+$/, ''),
      hostSecret: need(env, `HOST_${name}_SECRET`),
      seatSecret: need(env, `SEAT_${name}_SECRET`)
    })
  }
  return { hosts, defaultHost: names[0] }
}

export function readConfig(env) {
  const origin = need(env, 'TRACY_ORIGIN').replace(/\/+$/, '')
  return {
    origin,
    secure: origin.startsWith('https://'),
    siteDomain: need(env, 'SITE_DOMAIN'),
    sessionDomain: opt(env, 'SESSION_DOMAIN'),
    sessionSecret: need(env, 'SESSION_SECRET'),
    databaseUrl: opt(env, 'DATABASE_URL'),
    mail: readMail(env),
    ...readHosts(env),
    actorSecret: opt(env, 'MCP_TRACY_ACTOR_SECRET')
  }
}
```

- [ ] **Step 4: Run → PASS (4 tests)**

- [ ] **Step 5: Commit** — `feat(web): readConfig — one reader, empty means off, hosts as triplets`

---

### Task 3: `lib/session.js` — port the session cookie, with an equivalence test against the old version

**Files:**
- Create: `apps/tracy-web/src/lib/base64url.js`, `apps/tracy-web/src/lib/session.js`, `apps/tracy-web/test/session.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  mintSession(email: string, secret: string, now = Date.now()): Promise<string>   // 'v1.<payload>.<sig>'
  verifySession(token: string, secret: string, now = Date.now()): Promise<string|null> // lower-cased email, or null
  sessionFromCookieHeader(cookieHeader: string|null, secret: string): Promise<string|null>
  sessionCookie(token: string, { domain: string|null, secure: boolean }): string   // Set-Cookie value
  clearSessionCookie({ domain, secure }): string
  SESSION_COOKIE = 'tracy_sess'; SESSION_TTL_S = 43200
  ```

- [ ] **Step 1: Failing test — including equivalence with `workers/fleet-bar/src/session.js`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mintSession, verifySession, sessionCookie, clearSessionCookie, sessionFromCookieHeader } from '../src/lib/session.js'
import { sessionEmail as legacySessionEmail } from '../../../workers/fleet-bar/src/session.js'

const secret = 'x'.repeat(32)

test('a minted token verifies to the lower-cased email', async () => {
  const token = await mintSession('Ceo@Tracy.ai', secret)
  assert.equal(await verifySession(token, secret), 'ceo@tracy.ai')
})

test('a token the old Worker minted still verifies, and ours still verifies there', async () => {
  const token = await mintSession('ceo@tracy.ai', secret)
  const req = new Request('http://x/', { headers: { cookie: `tracy_sess=${token}` } })
  assert.equal(await legacySessionEmail(req, secret), 'ceo@tracy.ai')
})

test('tampered, expired and foreign-secret tokens all answer null', async () => {
  const token = await mintSession('a@b.c', secret)
  assert.equal(await verifySession(`${token}x`, secret), null)
  assert.equal(await verifySession(token, 'y'.repeat(32)), null)
  const old = await mintSession('a@b.c', secret, Date.now() - 13 * 3600 * 1000)
  assert.equal(await verifySession(old, secret), null)
})

test('cookie attributes follow the deployment: domain only when set, Secure only on https', () => {
  assert.equal(sessionCookie('t', { domain: null, secure: false }), 'tracy_sess=t; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200')
  assert.equal(sessionCookie('t', { domain: '.tracy.ai', secure: true }), 'tracy_sess=t; HttpOnly; Secure; SameSite=Lax; Domain=.tracy.ai; Path=/; Max-Age=43200')
  assert.match(clearSessionCookie({ domain: null, secure: false }), /^tracy_sess=; .*Max-Age=0$/)
})

test('the email is read straight off a cookie header', async () => {
  const token = await mintSession('a@b.c', secret)
  assert.equal(await sessionFromCookieHeader(`other=1; tracy_sess=${token}`, secret), 'a@b.c')
  assert.equal(await sessionFromCookieHeader(null, secret), null)
})
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Write the two files**

`src/lib/base64url.js`:
```js
export function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}
export function fromBase64Url(text) {
  return new Uint8Array(Buffer.from(text, 'base64url'))
}
```

`src/lib/session.js`:
```js
/**
 * The viewer's sign-in: one HMAC-signed cookie, ported verbatim in shape from
 * workers/fleet-bar/src/session.js so a token minted by either side verifies on the other during
 * the cut-over. Identity only, never rights — every door re-asks the seat book.
 */
import { toBase64Url, fromBase64Url } from './base64url.js'

export const SESSION_COOKIE = 'tracy_sess'
export const SESSION_TTL_S = 12 * 60 * 60
const encoder = new TextEncoder()

async function key(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

export async function mintSession(email, secret, now = Date.now()) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ email: email.toLowerCase(), exp: Math.floor(now / 1000) + SESSION_TTL_S })))
  const sig = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), encoder.encode(payload))
  return `v1.${payload}.${toBase64Url(new Uint8Array(sig))}`
}

export async function verifySession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null
  const [version, payload, signature] = token.split('.')
  if (version !== 'v1' || !payload || !signature) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret, 'verify'), fromBase64Url(signature), encoder.encode(payload))
    if (!ok) return null
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (typeof body.exp !== 'number' || body.exp * 1000 < now) return null
    return typeof body.email === 'string' && body.email ? body.email.toLowerCase() : null
  } catch {
    return null
  }
}

export async function sessionFromCookieHeader(cookieHeader, secret) {
  const raw = (cookieHeader ?? '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1]
  return raw ? verifySession(raw, secret) : null
}

function attrs({ domain, secure }) {
  return `HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax;${domain ? ` Domain=${domain};` : ''} Path=/`
}
export function sessionCookie(token, opts) {
  return `${SESSION_COOKIE}=${token}; ${attrs(opts)}; Max-Age=${SESSION_TTL_S}`
}
export function clearSessionCookie(opts) {
  return `${SESSION_COOKIE}=; ${attrs(opts)}; Max-Age=0`
}
```

- [ ] **Step 4: Run → PASS (5 tests)**. The second test loads the old Worker's code **only in the test** — it is an equivalence witness, not a dependency; `src/` code does not import `workers/`.

- [ ] **Step 5: Commit** — `feat(web): session cookie ported, verified against the Worker's own verifier`

---

### Task 4: `lib/hmac.js` + `workspace/seat-door.js` — the seat door signature, measured with the gateway's real verifier

**Files:**
- Create: `apps/tracy-web/src/lib/hmac.js`, `apps/tracy-web/src/workspace/seat-door.js`, `apps/tracy-web/test/seat-door.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  hmacHex(secret: string, message: string): Promise<string>
  sha256Hex(text: string): Promise<string>
  signSeatCall({ secret, path, body, now?, nonce? }): Promise<{ 'x-seat-timestamp', 'x-seat-nonce', 'x-seat-signature' }>
  callSeatDoor({ origin, secret, path, payload, headers?, fetchImpl? }): Promise<{ ok, status, body }>
  mintSeatSession({ origin, secret, grant, headers?, fetchImpl? }): Promise<string|null>
  revokeSeatAtDoor({ origin, secret, email, site?, headers?, fetchImpl? }): Promise<{ ok, revoked }>
  ```
  (exactly the signatures of `workers/seat-door/src/index.js`.)

- [ ] **Step 1: Failing test — the signature matches the old version byte for byte, and passes the `dsh-passwords` verifier**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signSeatCall, mintSeatSession } from '../src/workspace/seat-door.js'
import { signSeatCall as legacySign } from '../../../workers/seat-door/src/index.js'

test('same inputs, same three headers as the Worker package', async () => {
  const input = { secret: 'k', path: '/gateway/seat/session', body: '{"a":1}', now: 1_700_000_000_000, nonce: 'n'.repeat(32) }
  assert.deepEqual(await signSeatCall(input), await legacySign(input))
})

test('mintSeatSession returns the token on 200 and null on refusal', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ token: 'v1.t' }), { status: 200 })
  }
  const token = await mintSeatSession({ origin: 'http://dsh', secret: 'k', grant: { role: 'owner', email: 'a@b.c', folders: ['/site/x'], site: 'x.localhost' }, fetchImpl })
  assert.equal(token, 'v1.t')
  assert.equal(calls[0].url, 'http://dsh/gateway/seat/session')
  assert.equal(calls[0].init.method, 'POST')
  assert.ok(calls[0].init.headers['x-seat-signature'])
  const refused = await mintSeatSession({ origin: 'http://dsh', secret: 'k', grant: {}, fetchImpl: async () => new Response('{}', { status: 403 }) })
  assert.equal(refused, null)
})
```
Then add **one line** to `scripts/test/seat-door-interop.test.ts` (an existing test that runs the signature through the gateway's real verifier): also import `signSeatCall as newSign from '../../apps/tracy-web/src/workspace/seat-door.js'` and repeat the existing check for `newSign`. Read that file first to copy its shape exactly.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Write**

`src/lib/hmac.js`:
```js
const encoder = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}
```

`src/workspace/seat-door.js` — copy `workers/seat-door/src/index.js` verbatim, changing exactly two things: `import { hmacHex, sha256Hex } from '../lib/hmac.js'` in place of the two internal functions, and keep every comment (they are the reasoning). Do not change the signing string.

- [ ] **Step 4: Run → PASS**, and `node --import tsx --test scripts/test/seat-door-interop.test.ts` → PASS with both signers.

- [ ] **Step 5: Commit** — `feat(web): seat door client ported — byte-identical signature, proven on the gateway's verifier`

---

### Task 5: Postgres — pool, locked migrate, first migration

**Files:**
- Create: `apps/tracy-web/src/db/index.js`, `apps/tracy-web/src/db/migrations/001-identity.sql`, `apps/tracy-web/test/db.test.mjs`, `deploy/compose.yml`, `deploy/.env.example`

**Interfaces:**
- Produces:
  ```ts
  createPool(databaseUrl: string): pg.Pool
  migrate(pool, dir = <src/db/migrations>): Promise<{ applied: string[] }>   // pg_advisory_lock(7_243_001), table schema_migration(name pk, applied_at)
  ```

- [ ] **Step 1: Local compose with Postgres**

`deploy/compose.yml`:
```yaml
# One compose file for a laptop and a server. What differs is .env and --profile (Plan 5 adds server).
name: tracy
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tracy
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-tracy}
      POSTGRES_DB: tracy
    volumes: [tracy-pg:/var/lib/postgresql/data]
    ports: ["127.0.0.1:${POSTGRES_PORT:-5433}:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tracy"]
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  tracy-pg: {}
```
`deploy/.env.example` — copy the `.env` block from spec §6.1 verbatim, every secret left empty, add `POSTGRES_PORT=5433` and `TEST_DATABASE_URL=postgres://tracy:tracy@127.0.0.1:5433/tracy`.

Run: `docker compose -f deploy/compose.yml up -d postgres` → `docker compose -f deploy/compose.yml ps` shows `healthy`.

- [ ] **Step 2: Failing test (runs for real on Postgres, skips SAYING SO when there is no DB)**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPool, migrate } from '../src/db/index.js'

const url = process.env.TEST_DATABASE_URL
test('migrate applies every file once, and a second run applies nothing', { skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres' }, async () => {
  const pool = createPool(url)
  try {
    await pool.query('drop table if exists schema_migration, otp_code, oauth_state, account cascade')
    const first = await migrate(pool)
    assert.ok(first.applied.includes('001-identity.sql'))   // later plans add 002-…; the count is not the claim
    const second = await migrate(pool)
    assert.deepEqual(second.applied, [])
    const { rows } = await pool.query("select column_name from information_schema.columns where table_name='account' order by 1")
    assert.deepEqual(rows.map((r) => r.column_name), ['created_at', 'email', 'id', 'last_seen_at'])
  } finally {
    await pool.end()
  }
})
```

- [ ] **Step 3: Run → FAIL** (`TEST_DATABASE_URL=postgres://tracy:tracy@127.0.0.1:5433/tracy node --test apps/tracy-web/test/db.test.mjs`)

- [ ] **Step 4: Migration + migrate()**

`src/db/migrations/001-identity.sql`:
```sql
-- Who signed in, how, and the codes on their way.
create table if not exists account (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create table if not exists otp_code (
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  primary key (email)
);
create table if not exists oauth_state (
  state text primary key,
  provider text not null,
  next text not null,
  expires_at timestamptz not null
);
```

`src/db/index.js`:
```js
/**
 * The pool, and the migrator. Migrations are numbered .sql files applied in name order under one
 * advisory lock, so n replicas starting at once apply each file exactly once.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url)
const LOCK_ID = 7_243_001

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl })
}

export async function migrate(pool, dir = MIGRATIONS_DIR) {
  const client = await pool.connect()
  const applied = []
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_ID])
    await client.query('create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())')
    const done = new Set((await client.query('select name from schema_migration')).rows.map((r) => r.name))
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
    for (const name of files) {
      if (done.has(name)) continue
      const sql = await readFile(join(dir instanceof URL ? dir.pathname : dir, name), 'utf8')
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into schema_migration (name) values ($1)', [name])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
      applied.push(name)
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {})
    client.release()
  }
  return { applied }
}
```

- [ ] **Step 5: Run → PASS.** Without `TEST_DATABASE_URL` the test prints `skipped: set TEST_DATABASE_URL…` — one line that says so, not silence.

- [ ] **Step 6: Commit** — `feat(web): postgres pool and a locked migrator; deploy/compose.yml brings Postgres up locally`

---

### Task 6: OTP sign-in — `identity/`

**Files:**
- Create: `apps/tracy-web/src/identity/otp.js`, `apps/tracy-web/src/identity/store.js`, `apps/tracy-web/src/identity/route.js`, `apps/tracy-web/src/mail/transport.js`, `apps/tracy-web/src/lib/cookies.js`, `apps/tracy-web/test/otp.test.mjs`, `apps/tracy-web/test/identity.test.mjs`
- Modify: `apps/tracy-web/src/app.js`

**Interfaces:**
- Consumes: `mintSession`, `sessionFromCookieHeader`, `sessionCookie`, `clearSessionCookie` (Task 3); `readConfig` (Task 2).
- Produces:
  ```ts
  // otp.js (pure)
  generateCode(rng = crypto.getRandomValues): string          // 6 digits, leading zeros kept
  hashCode(code, email, pepper): Promise<string>              // sha256Hex(`${pepper}\n${email}\n${code}`)
  // store.js — both impls share this shape
  identityStore: {
    putCode({ email, codeHash, expiresAt }): Promise<void>     // upsert per email
    takeCode(email): Promise<{ codeHash, expiresAt, attempts }|null>
    bumpAttempts(email): Promise<number>
    deleteCode(email): Promise<void>
    touchAccount(email): Promise<{ id: string }>              // insert if missing, set last_seen_at
  }
  pgIdentityStore(pool) · memoryIdentityStore()
  // mail/transport.js
  transport.send({ to, subject, text }): Promise<void>
  consoleTransport(log = console.log) · resendTransport({ key, from, fetchImpl })
  // route.js
  identityRoutes({ store, mail, config, now = Date.now }): Hono   // GET/POST /login, POST /verify, GET /auth/me, POST /auth/signout
  // lib/cookies.js
  parseCookies(header: string|null): Map<string,string>
  ```
  Rules: a code lives 10 minutes, 5 attempts, one code per email (a new code replaces the old one). `/auth/me` returns `{ email, defaultSite: null }` — Plan 2 fills in `defaultSite`.

- [ ] **Step 1: Failing test for the pure part**

`test/otp.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateCode, hashCode } from '../src/identity/otp.js'

test('a code is six digits and keeps leading zeros', () => {
  const zeros = generateCode((arr) => arr.fill(0))
  assert.equal(zeros, '000000')
  assert.match(generateCode(), /^\d{6}$/)
})

test('the hash binds code, email and pepper', async () => {
  const a = await hashCode('123456', 'a@b.c', 'p')
  assert.notEqual(a, await hashCode('123456', 'x@b.c', 'p'))
  assert.notEqual(a, await hashCode('123456', 'a@b.c', 'q'))
  assert.equal(a, await hashCode('123456', 'A@B.C', 'p'))
})
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: `otp.js`**

```js
import { sha256Hex } from '../lib/hmac.js'

/** Six digits from a CSPRNG, zero-padded — a code is a string, never a number. */
export function generateCode(rng = (arr) => crypto.getRandomValues(arr)) {
  const [n] = rng(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}

export async function hashCode(code, email, pepper) {
  return sha256Hex(`${pepper}\n${email.toLowerCase()}\n${code}`)
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Failing test for the doors (in-memory store, a transport that captures mail)**

`test/identity.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'

const env = {
  TRACY_ORIGIN: 'http://tracy.test', SITE_DOMAIN: 'tracy.test', SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local', HOST_local_ORIGIN: 'http://host', HOST_local_DSH_ORIGIN: 'http://dsh', HOST_local_SECRET: 'h', SEAT_local_SECRET: 'k'
}

function harness(now = () => 1_700_000_000_000) {
  const sent = []
  const mail = { send: async (m) => { sent.push(m) } }
  const app = buildApp({ config: readConfig(env), identity: memoryIdentityStore(), mail, now })
  const post = (path, body, cookie) => app.fetch(new Request(`http://tracy.test${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body)
  }))
  return { app, sent, post }
}

test('login mails a six-digit code, verify sets the session cookie, /auth/me reads it back', async () => {
  const { app, sent, post } = harness()
  const started = await post('/login', { email: 'Ceo@tracy.ai' })
  assert.equal(started.status, 200)
  assert.equal(sent.length, 1)
  const code = sent[0].text.match(/\b\d{6}\b/)[0]
  const verified = await post('/verify', { email: 'ceo@tracy.ai', code })
  assert.equal(verified.status, 200)
  const cookie = verified.headers.get('set-cookie')
  assert.match(cookie, /^tracy_sess=v1\./)
  const me = await app.fetch(new Request('http://tracy.test/auth/me', { headers: { cookie: cookie.split(';')[0] } }))
  assert.deepEqual(await me.json(), { email: 'ceo@tracy.ai', defaultSite: null })
})

test('a wrong code five times burns the code; a stale code is refused; signout clears the cookie', async () => {
  let t = 1_700_000_000_000
  const { app, sent, post } = harness(() => t)
  await post('/login', { email: 'a@b.c' })
  for (let i = 0; i < 5; i++) assert.equal((await post('/verify', { email: 'a@b.c', code: '000000' })).status, 401)
  const real = sent[0].text.match(/\b\d{6}\b/)[0]
  assert.equal((await post('/verify', { email: 'a@b.c', code: real })).status, 401)
  await post('/login', { email: 'a@b.c' })
  t += 11 * 60 * 1000
  const late = sent[1].text.match(/\b\d{6}\b/)[0]
  assert.equal((await post('/verify', { email: 'a@b.c', code: late })).status, 401)
  const out = await app.fetch(new Request('http://tracy.test/auth/signout', { method: 'POST' }))
  assert.match(out.headers.get('set-cookie'), /tracy_sess=; .*Max-Age=0/)
})

test('/auth/me without a session answers 200 with email null — that is a guest, not an error', async () => {
  const { app } = harness()
  const me = await app.fetch(new Request('http://tracy.test/auth/me'))
  assert.equal(me.status, 200)
  assert.deepEqual(await me.json(), { email: null, defaultSite: null })
})
```

- [ ] **Step 6: Run → FAIL**

- [ ] **Step 7: Write store, transport, cookies, route; wire them into `app.js`**

`src/lib/cookies.js`:
```js
export function parseCookies(header) {
  const out = new Map()
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
  }
  return out
}
```

`src/mail/transport.js`:
```js
/** Where a mail goes. `console` is the laptop: the OTP lands in the log, and that is the feature. */
export function consoleTransport(log = console.log) {
  return { send: async ({ to, subject, text }) => { log(`[mail] to=${to} subject=${JSON.stringify(subject)}\n${text}`) } }
}
export function resendTransport({ key, from, fetchImpl = fetch }) {
  return {
    send: async ({ to, subject, text }) => {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text })
      })
      if (!res.ok) throw new Error(`resend answered ${res.status}`)
    }
  }
}
export function transportFor(mailConfig, log) {
  return mailConfig.kind === 'resend' ? resendTransport(mailConfig) : consoleTransport(log)
}
```

`src/identity/store.js`:
```js
export function memoryIdentityStore() {
  const codes = new Map()
  const accounts = new Map()
  return {
    async putCode({ email, codeHash, expiresAt }) { codes.set(email, { codeHash, expiresAt, attempts: 0 }) },
    async takeCode(email) { return codes.get(email) ?? null },
    async bumpAttempts(email) { const c = codes.get(email); if (!c) return 0; c.attempts += 1; return c.attempts },
    async deleteCode(email) { codes.delete(email) },
    async touchAccount(email) {
      if (!accounts.has(email)) accounts.set(email, { id: crypto.randomUUID() })
      return accounts.get(email)
    }
  }
}

export function pgIdentityStore(pool) {
  return {
    async putCode({ email, codeHash, expiresAt }) {
      await pool.query(
        `insert into otp_code (email, code_hash, expires_at, attempts) values ($1, $2, $3, 0)
         on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now()`,
        [email, codeHash, new Date(expiresAt)]
      )
    },
    async takeCode(email) {
      const { rows } = await pool.query('select code_hash, expires_at, attempts from otp_code where email = $1', [email])
      return rows[0] ? { codeHash: rows[0].code_hash, expiresAt: rows[0].expires_at.getTime(), attempts: rows[0].attempts } : null
    },
    async bumpAttempts(email) {
      const { rows } = await pool.query('update otp_code set attempts = attempts + 1 where email = $1 returning attempts', [email])
      return rows[0]?.attempts ?? 0
    },
    async deleteCode(email) { await pool.query('delete from otp_code where email = $1', [email]) },
    async touchAccount(email) {
      const { rows } = await pool.query(
        `insert into account (email, last_seen_at) values ($1, now())
         on conflict (email) do update set last_seen_at = now() returning id`,
        [email]
      )
      return { id: rows[0].id }
    }
  }
}
```

`src/identity/route.js`:
```js
/**
 * Tracy's one sign-in: an email, a six-digit code, a cookie. No password, no Supabase.
 * OAuth (Google/GitHub) is Plan 2 — the doors keep the paths /signin/<provider> for it.
 */
import { Hono } from 'hono'
import { generateCode, hashCode } from './otp.js'
import { mintSession, sessionFromCookieHeader, sessionCookie, clearSessionCookie } from '../lib/session.js'

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function identityRoutes({ store, mail, config, now = Date.now }) {
  const app = new Hono()
  const cookieOpts = { domain: config.sessionDomain, secure: config.secure }

  app.get('/login', (c) => c.html(loginPage(c.req.query('next') ?? '/')))

  app.post('/login', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) return c.json({ code: 'INVALID_EMAIL' }, 400)
    const code = generateCode()
    await store.putCode({ email, codeHash: await hashCode(code, email, config.sessionSecret), expiresAt: now() + CODE_TTL_MS })
    await mail.send({ to: email, subject: 'Your Tracy sign-in code', text: `Your code is ${code}. It expires in 10 minutes.` })
    return c.json({ ok: true })
  })

  app.post('/verify', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const code = String(body.code ?? '').trim()
    const row = await store.takeCode(email)
    if (!row || row.expiresAt < now() || row.attempts >= MAX_ATTEMPTS) return c.json({ code: 'CODE_INVALID' }, 401)
    if (row.codeHash !== (await hashCode(code, email, config.sessionSecret))) {
      const attempts = await store.bumpAttempts(email)
      if (attempts >= MAX_ATTEMPTS) await store.deleteCode(email)
      return c.json({ code: 'CODE_INVALID' }, 401)
    }
    await store.deleteCode(email)
    await store.touchAccount(email)
    const token = await mintSession(email, config.sessionSecret, now())
    c.header('set-cookie', sessionCookie(token, cookieOpts))
    return c.json({ ok: true, email })
  })

  app.get('/auth/me', async (c) => {
    const email = await sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)
    return c.json({ email, defaultSite: null })
  })

  app.post('/auth/signout', (c) => {
    c.header('set-cookie', clearSessionCookie(cookieOpts))
    return c.json({ ok: true })
  })

  return app
}

function loginPage(next) {
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return `<!doctype html><meta charset="utf-8"><title>Sign in to Tracy</title>
<body style="font:15px system-ui;max-width:24rem;margin:4rem auto">
<h1>Sign in</h1>
<form id="f"><label>Email <input name="email" type="email" required autofocus></label>
<button>Send code</button></form>
<form id="v" hidden><label>Code <input name="code" inputmode="numeric" pattern="\\d{6}" required></label>
<button>Sign in</button></form>
<p id="m"></p>
<script>
const f=document.getElementById('f'),v=document.getElementById('v'),m=document.getElementById('m');let email='';
f.onsubmit=async e=>{e.preventDefault();email=f.email.value;const r=await fetch('/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});m.textContent=r.ok?'Code sent.':'Could not send a code.';if(r.ok){f.hidden=true;v.hidden=false}};
v.onsubmit=async e=>{e.preventDefault();const r=await fetch('/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,code:v.code.value})});if(r.ok)location.href=${JSON.stringify(safeNext)};else m.textContent='That code did not work.'};
</script>`
}
```

`src/app.js` (replace entirely):
```js
import { Hono } from 'hono'
import { identityRoutes } from './identity/route.js'

export function buildApp(deps) {
  const app = new Hono()
  app.get('/health', (c) => c.json({ ok: true }))
  if (deps.config) app.route('/', identityRoutes({ store: deps.identity, mail: deps.mail, config: deps.config, now: deps.now }))
  return app
}
```

- [ ] **Step 8: Run → PASS (health 1 + otp 2 + identity 3)**

- [ ] **Step 9: Commit** — `feat(web): sign in by a six-digit code — /login /verify /auth/me /auth/signout`

---

### Task 7: Temporary site resolver + fleet label

**Files:**
- Create: `apps/tracy-web/src/sites/label.js`, `apps/tracy-web/src/sites/resolver.js`, `apps/tracy-web/test/label.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  fleetLabel(siteKey: string, prefix = ''): Promise<string>   // ported as-is from workers/seat-registry/src/fleet.js — `<readable>-<8hex>`, or the label itself when siteKey is `<label>.<zone>`
  hostsResolver(config): {
    hostOf(siteKey): Promise<string|null>        // Plan 1: always config.defaultHost
    dshOf(hostName): { origin, seatSecret } | null
    labelOf(siteKey): Promise<string>            // fleetLabel with zone = config.siteDomain
    siteScope(siteKey): Promise<string>          // labelOf → [^a-z0-9] → '_' (matches seatCookieScope)
  }
  ```

- [ ] **Step 1: Failing test — the label matches the old version on the same input**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fleetLabel } from '../src/sites/label.js'
import { fleetLabel as legacy } from '../../../workers/seat-registry/src/fleet.js'

test('the label of a customer domain matches what the seat book computes today', async () => {
  for (const key of ['customer.example', 'https://www.joomlart.com/', 'wpdemo.localhost']) {
    assert.equal(await fleetLabel(key, 'tracy.ai'), await legacy(key))
  }
})

test('a site born under the zone keeps its label', async () => {
  assert.equal(await fleetLabel('lantern-1a2b3c4d.tracy.ai', 'tracy.ai'), 'lantern-1a2b3c4d')
  assert.equal(await fleetLabel('wpdemo.localhost', 'localhost'), 'wpdemo')
})
```
⚠ Read `workers/seat-registry/src/fleet.js` (46 lines) first: if the old function has a different signature (e.g. it reads `env`), fix the test to call it the way it expects — the goal is **same input, same label**.

- [ ] **Step 2: FAIL → Step 3: Write `label.js`** by copying the logic of `fleet.js` (SHA-256 of the host, 8 hex, the readable part, cap of 63) with a `zone` parameter in place of `env.FLEET_ZONE`, and `resolver.js`:

```js
import { fleetLabel } from './label.js'

/** Plan 1: every site lives on the default host. Plan 2 replaces this with the `site` table. */
export function hostsResolver(config) {
  return {
    async hostOf() { return config.defaultHost },
    dshOf(hostName) {
      const h = config.hosts.get(hostName)
      // `dshOrigin` is the host's dsh (the seat door); `origin` is tracy-host — two different doors on one machine.
      return h ? { origin: h.dshOrigin, seatSecret: h.seatSecret } : null
    },
    async labelOf(siteKey) { return fleetLabel(siteKey, config.siteDomain) },
    async siteScope(siteKey) { return (await fleetLabel(siteKey, config.siteDomain)).replace(/[^a-z0-9]/gi, '_').toLowerCase() }
  }
}
```

- [ ] **Step 4: PASS → Step 5: Commit** — `feat(web): fleet label ported, and a default-host resolver until the site table lands`

---

### Task 8: Session proxy — HTTP + WebSocket, minted through the seat door, cookie per (host, site)

**Files:**
- Create: `apps/tracy-web/src/workspace/proxy.js`, `apps/tracy-web/src/workspace/route.js`, `apps/tracy-web/src/server.js`, `apps/tracy-web/test/proxy.test.mjs`
- Modify: `apps/tracy-web/src/app.js`, `apps/tracy-web/src/lib/cookies.js`

**Interfaces:**
- Consumes: `hostsResolver` (Task 7), `mintSeatSession` (Task 4), `sessionFromCookieHeader` (Task 3), `parseCookies` (Task 6).
- Produces:
  ```ts
  // lib/cookies.js (added)
  seatTokenCookieName(dshOrigin: string, scope: string): string     // `tracy_tok_<host safe>__<scope>`
  outgoingCookieHeader(incoming: string|null, seatToken: string|null): string|null
     // keep cookies that do NOT start with tracy_ / dsh_gateway_token, add `dsh_gateway_token=<token>`
  relabelSetCookie(setCookies: string[], name: string): string[]    // dsh_gateway_token=… → <name>=…
  // workspace/proxy.js
  forwardHttp(request: Request, target: URL, { mount, seatToken, viewerHost }): Promise<Response>
  forwardUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, target: URL, { seatToken }): void
  // workspace/route.js
  workspaceRoutes({ config, sites, seatDoor, now }): Hono   // app.all('/*') — every path nobody else took
  resolveSite(pathname: string, config): { siteKey: string|null, mount: string, rest: string }
     // `/<siteKey>/x` (siteKey contains a dot) → { siteKey, mount: '/<siteKey>', rest: '/x' }; `/` or `/agent` → mount ''
  // server.js
  start({ env = process.env, log = console }): Promise<{ server, close() }>
  ```
  Flow for a request to `/<siteKey>/…`:
  1. `email = sessionFromCookieHeader(...)`; none → **302 `/login?next=<path>`** (guest is Plan 2).
  2. `host = sites.hostOf(siteKey)`, `dsh = sites.dshOf(host)`; none → 501 `{ code: 'HOST_NOT_CONFIGURED' }`.
  3. `name = seatTokenCookieName(dsh.origin, await sites.siteScope(siteKey))`; token = that cookie if present.
  4. No token → `mintSeatSession({ origin: dsh.origin, secret: dsh.seatSecret, grant: { role: 'owner', email, folders: [`/site/${label}`], site: siteKey } })`; null → 502 `{ code: 'SEAT_DOOR_REFUSED' }`; otherwise → set cookie `name=<token>; Path=/; HttpOnly; SameSite=Lax[; Secure]; Max-Age=43200` then **302 back to the same path** (exactly how `cowork-web` does it, so the cookie is present on the next request).
  5. Token present → `forwardHttp`; if dsh returns 401 → delete that cookie and 302 back to the path (mint again on the next request).
  Plan 1 grants `role: 'owner'` to **everyone** who signs in — the seat ledger is Plan 2; say so explicitly in a comment.

- [ ] **Step 1: Failing test for the pure part and HTTP**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { outgoingCookieHeader, relabelSetCookie, seatTokenCookieName } from '../src/lib/cookies.js'
import { resolveSite } from '../src/workspace/route.js'
import { forwardHttp } from '../src/workspace/proxy.js'

test('cookies: Tracy cookies never reach dsh, the seat token goes as dsh_gateway_token', () => {
  assert.equal(outgoingCookieHeader('tracy_sess=a; tracy_tok_x__y=b; wp=1', 'T'), 'wp=1; dsh_gateway_token=T')
  assert.equal(outgoingCookieHeader('tracy_sess=a', null), null)
  assert.deepEqual(relabelSetCookie(['dsh_gateway_token=z; Path=/', 'other=1'], 'tracy_tok_h__s'), ['tracy_tok_h__s=z; Path=/', 'other=1'])
  assert.equal(seatTokenCookieName('http://127.0.0.1:51790', 'wpdemo'), 'tracy_tok_127_0_0_1_51790__wpdemo')
})

test('resolveSite: a dotted first segment is a site, anything else is the root', () => {
  assert.deepEqual(resolveSite('/wpdemo.localhost/agent/x'), { siteKey: 'wpdemo.localhost', mount: '/wpdemo.localhost', rest: '/agent/x' })
  assert.deepEqual(resolveSite('/wpdemo.localhost'), { siteKey: 'wpdemo.localhost', mount: '/wpdemo.localhost', rest: '/' })
  assert.deepEqual(resolveSite('/assets/a.js'), { siteKey: null, mount: '', rest: '/assets/a.js' })
})

test('forwardHttp: prefix header, cookies rewritten, redirects relativised, set-cookie relabelled', async () => {
  const seen = []
  const upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, prefix: req.headers['x-forwarded-prefix'], cookie: req.headers.cookie })
    res.writeHead(302, { location: 'http://127.0.0.1:' + upstream.address().port + '/next', 'set-cookie': 'dsh_gateway_token=NEW; Path=/' })
    res.end()
  }).listen(0, '127.0.0.1')
  await new Promise((r) => upstream.once('listening', r))
  const target = new URL(`http://127.0.0.1:${upstream.address().port}/agent/x`)
  const res = await forwardHttp(new Request('http://tracy.test/wpdemo.localhost/agent/x', { headers: { cookie: 'tracy_sess=a; k=v' } }), target, { mount: '/wpdemo.localhost', seatToken: 'T', seatCookieName: 'tracy_tok_h__s', viewerHost: 'tracy.test' })
  upstream.close()
  assert.equal(seen[0].url, '/agent/x')
  assert.equal(seen[0].prefix, '/wpdemo.localhost')
  assert.equal(seen[0].cookie, 'k=v; dsh_gateway_token=T')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/wpdemo.localhost/next')
  assert.deepEqual(res.headers.getSetCookie(), ['tracy_tok_h__s=NEW; Path=/'])
})
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Write**

`src/lib/cookies.js` (added):
```js
const SEAT_TOKEN_PREFIX = 'tracy_tok_'
const cookieSafe = (s) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase()

export function seatTokenCookieName(dshOrigin, scope) {
  return `${SEAT_TOKEN_PREFIX}${cookieSafe(new URL(dshOrigin).host)}__${scope}`
}

/** What dsh may see: every cookie that is not Tracy's, plus the seat token under dsh's own name. */
export function outgoingCookieHeader(incoming, seatToken) {
  const kept = (incoming ?? '').split(';').map((c) => c.trim())
    .filter((c) => c !== '' && !c.startsWith('tracy_') && !c.startsWith('dsh_gateway_token='))
  if (seatToken) kept.push(`dsh_gateway_token=${seatToken}`)
  return kept.length > 0 ? kept.join('; ') : null
}

export function relabelSetCookie(setCookies, name) {
  return setCookies.map((c) => (c.startsWith('dsh_gateway_token=') ? `${name}=${c.slice('dsh_gateway_token='.length)}` : c))
}
```

`src/workspace/proxy.js`:
```js
/**
 * The two ways a request reaches a host's dsh. HTTP goes through fetch; a WebSocket upgrade is
 * spliced at the socket — Hono never sees it, which is why server.js owns the `upgrade` event.
 * Ported from cowork-web's proxyToAgent (headers) and dev-fleet.mjs (the splice).
 */
import net from 'node:net'
import { outgoingCookieHeader, relabelSetCookie } from '../lib/cookies.js'

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'origin', 'referer']

export async function forwardHttp(request, target, { mount, seatToken, seatCookieName, viewerHost }) {
  const headers = new Headers(request.headers)
  for (const h of HOP_BY_HOP) headers.delete(h)
  if (mount) headers.set('x-forwarded-prefix', mount)
  else headers.delete('x-forwarded-prefix')
  const cookie = outgoingCookieHeader(request.headers.get('cookie'), seatToken)
  if (cookie) headers.set('cookie', cookie)
  else headers.delete('cookie')
  headers.set('x-forwarded-host', viewerHost)
  headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(':', ''))
  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }
  const upstream = await fetch(target, init)
  const out = new Headers(upstream.headers)
  const location = upstream.headers.get('location')
  if (location) {
    const to = new URL(location, target)
    if (to.origin === target.origin) out.set('location', `${mount}${to.pathname}${to.search}`)
  }
  const planted = upstream.headers.getSetCookie?.() ?? []
  if (planted.length > 0) {
    out.delete('set-cookie')
    for (const c of relabelSetCookie(planted, seatCookieName)) out.append('set-cookie', c)
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}

export function forwardUpgrade(req, socket, head, target, { seatToken, mount }) {
  const upstream = net.connect(Number(target.port || 80), target.hostname, () => {
    const headers = { ...req.headers }
    const cookie = outgoingCookieHeader(req.headers.cookie ?? null, seatToken)
    if (cookie) headers.cookie = cookie
    else delete headers.cookie
    if (mount) headers['x-forwarded-prefix'] = mount
    headers.host = target.host
    const lines = Object.entries(headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    upstream.write(`${req.method} ${target.pathname}${target.search} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
}
```

`src/workspace/route.js`:
```js
import { Hono } from 'hono'
import { sessionFromCookieHeader } from '../lib/session.js'
import { parseCookies, seatTokenCookieName } from '../lib/cookies.js'
import { forwardHttp } from './proxy.js'
import { mintSeatSession } from './seat-door.js'

const SITE_PATH = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(\/.*)?$/

export function resolveSite(pathname) {
  const m = SITE_PATH.exec(pathname)
  if (!m) return { siteKey: null, mount: '', rest: pathname }
  return { siteKey: m[1], mount: `/${m[1]}`, rest: m[2] && m[2] !== '' ? m[2] : '/' }
}

/**
 * Everything not claimed by another domain goes to a host's dsh. Plan 1 grants `owner` to anyone
 * signed in — the seat book that decides the real role is Plan 2 (spec §4.3).
 */
export function workspaceRoutes({ config, sites, seatDoor = { mintSeatSession }, now = Date.now }) {
  const app = new Hono()

  app.all('/*', async (c) => {
    const url = new URL(c.req.url)
    const { siteKey, mount, rest } = resolveSite(url.pathname)
    const email = await sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret)
    if (!email) return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302)
    // `/` with no site: Plan 2 T9 sends the viewer to `defaultSite` (or the guest landing, spec §10 #11).
    // Until then a plain 404 that says what to type is honest — nothing here is pretending to be the shell.
    if (!siteKey) return c.text('Open a site: /<siteKey>/', 404)

    const host = await sites.hostOf(siteKey)
    const dsh = host ? sites.dshOf(host) : null
    if (!dsh) return c.json({ code: 'HOST_NOT_CONFIGURED', host }, 501)

    const name = seatTokenCookieName(dsh.origin, await sites.siteScope(siteKey))
    const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax;${config.secure ? ' Secure;' : ''}`
    let token = parseCookies(c.req.header('cookie')).get(name) ?? null
    if (!token) {
      token = await seatDoor.mintSeatSession({
        origin: dsh.origin,
        secret: dsh.seatSecret,
        grant: { role: 'owner', email, folders: [`/site/${await sites.labelOf(siteKey)}`], site: siteKey }
      })
      if (!token) return c.json({ code: 'SEAT_DOOR_REFUSED' }, 502)
      c.header('set-cookie', `${name}=${token}; ${cookieAttrs} Max-Age=43200`)
      return c.redirect(url.pathname + url.search, 302)
    }

    const target = new URL(dsh.origin)
    target.pathname = rest
    target.search = url.search
    const res = await forwardHttp(c.req.raw, target, { mount, seatToken: token, seatCookieName: name, viewerHost: url.host })
    if (res.status === 401) {
      const h = new Headers({ location: url.pathname + url.search })
      h.append('set-cookie', `${name}=; ${cookieAttrs} Max-Age=0`)
      return new Response(null, { status: 302, headers: h })
    }
    return res
  })

  return app
}
```

`src/app.js` — after `identityRoutes`, add: `if (deps.sites) app.route('/', workspaceRoutes({ config: deps.config, sites: deps.sites, seatDoor: deps.seatDoor, now: deps.now }))`. Order: health → identity → workspace (catch-all last).

`src/server.js`:
```js
import { createServer } from 'node:http'
import { serve } from '@hono/node-server'
import { buildApp } from './app.js'
import { readConfig } from './config.js'
import { createPool, migrate } from './db/index.js'
import { pgIdentityStore, memoryIdentityStore } from './identity/store.js'
import { transportFor } from './mail/transport.js'
import { hostsResolver } from './sites/resolver.js'
import { forwardUpgrade } from './workspace/proxy.js'
import { resolveSite } from './workspace/route.js'
import { sessionFromCookieHeader } from './lib/session.js'
import { parseCookies, seatTokenCookieName } from './lib/cookies.js'

export async function start({ env = process.env, log = console } = {}) {
  const config = readConfig(env)
  let identity = memoryIdentityStore()
  if (config.databaseUrl) {
    const pool = createPool(config.databaseUrl)
    const { applied } = await migrate(pool)
    log.log(`[db] migrated: ${applied.length === 0 ? 'nothing new' : applied.join(', ')}`)
    identity = pgIdentityStore(pool)
  } else {
    log.warn('[db] DATABASE_URL is empty — sign-ins live in memory and vanish on restart')
  }
  const sites = hostsResolver(config)
  const app = buildApp({ config, identity, mail: transportFor(config.mail, log.log), sites })

  const server = serve({ fetch: app.fetch, port: Number(env.PORT ?? 8080), hostname: '0.0.0.0', createServer }, (info) => {
    log.log(`[web] ${config.origin} ← listening on ${info.port}`)
  })

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', config.origin)
    const { siteKey, mount, rest } = resolveSite(url.pathname)
    const email = await sessionFromCookieHeader(req.headers.cookie ?? null, config.sessionSecret)
    const host = siteKey ? await sites.hostOf(siteKey) : null
    const dsh = host ? sites.dshOf(host) : null
    if (!email || !dsh) return socket.destroy()
    const token = parseCookies(req.headers.cookie).get(seatTokenCookieName(dsh.origin, await sites.siteScope(siteKey))) ?? null
    if (!token) return socket.destroy()
    const target = new URL(dsh.origin)
    target.pathname = rest
    target.search = url.search
    forwardUpgrade(req, socket, head, target, { seatToken: token, mount })
  })

  return { server, close: () => new Promise((r) => server.close(r)) }
}

if (import.meta.url === `file://${process.argv[1]}`) start().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: PASS (3 new tests)**

- [ ] **Step 5: Measure in a real browser — this is the acceptance for the whole plan**

Precondition: the local dsh cluster is running per [`packages/tools/tracy-subprocess-docker/dev/README.md`](../../../packages/tools/tracy-subprocess-docker/dev/README.md) (site `wpdemo`, door `127.0.0.1:51790`), plus `MCP_SEAT_SECRET` **set** on the `dsh` service — "level C" of [`running-tracy-locally.md`](../../references/running-tracy-locally.md) §6; the value is self-generated with `openssl rand -hex 32`, and the same value is written into `SEAT_local_SECRET`).

```bash
cp deploy/.env.example deploy/.env    # fill in: SESSION_SECRET, SEAT_local_SECRET (= dsh's MCP_SEAT_SECRET), HOST_local_DSH_ORIGIN=http://127.0.0.1:51790, HOST_local_ORIGIN=http://127.0.0.1:8090 (nothing listens yet — Plan 3), HOST_local_SECRET=anything
docker compose -f deploy/compose.yml up -d postgres
set -a; . deploy/.env; set +a; DATABASE_URL=postgres://tracy:tracy@127.0.0.1:5433/tracy node apps/tracy-web/src/server.js
```
Browser: `http://localhost:8080/wpdemo.localhost/` (in Plan 1 the siteKey is just a name with a dot — nobody dials it yet) → 302 `/login` → enter email → the code appears in the server's **log** → enter it → back to `/wpdemo.localhost/` → dsh draws the workspace → **send "What is this site?" and get an answer**. Record in the commit message: the `session-<id>` created, and one log line from `forwardUpgrade` (add `log.log('[ws] …')` when it connects).

Common failures and what they mean: 502 `SEAT_DOOR_REFUSED` = `SEAT_local_SECRET` ≠ `MCP_SEAT_SECRET` (check with `docker exec tracy-dsh grep MCP_SEAT_SECRET /desk-home/dsh-passwords.env`); a blank page with no error = the WebSocket did not connect (see the `[ws]` log); a repeating 401 = dsh rejects the token → see the gateway log `docker logs tracy-dsh | grep seat`.

- [ ] **Step 6: Commit** — `feat(web): the workspace proxy — HTTP and WebSocket into a host's dsh, seats minted at the door`

---

### Task 9: Module graph, Dockerfile, and green gates

**Files:**
- Create: `apps/tracy-web/test/module-graph.test.mjs`, `apps/tracy-web/Dockerfile`, `apps/tracy-web/.dockerignore`
- Modify: `deploy/compose.yml` (add the `tracy-web` service)

- [ ] **Step 1: Import graph test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

const SRC = resolve(new URL('../src/', import.meta.url).pathname)
const SHARED = new Set(['lib', 'db'])

function files(dir) {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [] })
}

test('a domain directory imports only lib/ and db/, never another domain', () => {
  const bad = []
  for (const file of files(SRC)) {
    const from = relative(SRC, file).split('/')[0]
    if (from.endsWith('.js') || SHARED.has(from)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const to = relative(SRC, resolve(dirname(file), m[1])).split('/')[0]
      if (to !== from && !SHARED.has(to)) bad.push(`${relative(SRC, file)} → ${m[1]}`)
    }
  }
  assert.deepEqual(bad, [])
})
```
Run → PASS straight away (the code from Tasks 1–8 follows the rule). Keep the test: it is the lock.

- [ ] **Step 2: Dockerfile**

```dockerfile
FROM node:24-slim
WORKDIR /opt/tracy-web
COPY apps/tracy-web/package.json ./
RUN corepack enable pnpm && pnpm install --prod --ignore-scripts
COPY apps/tracy-web/src ./src
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
```
`.dockerignore`: `node_modules`, `test`. Build from the **repo root**: `docker build -f apps/tracy-web/Dockerfile -t tracy/web:dev .`

⚠ `pnpm install` in the image needs the package's own lockfile: run `cd apps/tracy-web && pnpm install --lockfile-only --ignore-workspace` to generate `apps/tracy-web/pnpm-lock.yaml` and COPY it along with `package.json`. If pnpm refuses because it is inside a workspace, replace the first two lines with `npm ci` and a `package-lock.json` generated by `npm i --package-lock-only`. Record the chosen approach in a comment at the top of the Dockerfile.

- [ ] **Step 3: Service in compose**

Add to `deploy/compose.yml`:
```yaml
  tracy-web:
    build: { context: .., dockerfile: apps/tracy-web/Dockerfile }
    image: tracy/web:dev
    env_file: [.env]
    environment:
      DATABASE_URL: postgres://tracy:${POSTGRES_PASSWORD:-tracy}@postgres:5432/tracy
    depends_on:
      postgres: { condition: service_healthy }
    ports: ["127.0.0.1:${WEB_PORT:-8080}:8080"]
    extra_hosts: ["host.docker.internal:host-gateway"]
```
In the local `.env`, `HOST_local_DSH_ORIGIN=http://host.docker.internal:51790` when `tracy-web` runs in a container (dsh is still in the old `dev/` cluster — Plan 3 merges it). Run: `docker compose -f deploy/compose.yml up -d --build` → repeat the browser measurement of Task 8 Step 5 through `http://localhost:8080`.

- [ ] **Step 4: All gates**

```bash
pnpm lint && pnpm test:workers 2>&1 | tail -4 && pnpm build:check 2>&1 | tail -5
```
Expected: `fail 0`; `build:check` green 28/28. Any gate that goes red because of `apps/` (e.g. `check-self-contained` does not know `apps/*` yet, or biome wants to reformat) — fix **the gate following its existing shape**, do not switch the gate off; record why in the commit.

- [ ] **Step 5: Journal + commit**

Add an entry at the top of `tasks/nhat-ky-main.md` (template at the top of that file): work — `apps/tracy-web` skeleton, OTP sign-in, proxy into dsh; affects — whoever is editing `workers/cowork-web` (the proxy path will replace it), whoever runs `test:workers` (the glob adds `apps/`). Then:
```bash
git add apps/tracy-web deploy tasks/nhat-ky-main.md
git commit -m "feat(web): module-graph gate, Dockerfile, and tracy-web in deploy/compose.yml — Plan 1 done"
```

---

## Self-review after writing

- **Spec coverage:** §4.1 (layout, import rule) — Task 1, 9. §4.2 OTP/`/auth/me`/signout — Task 6; OAuth and `/invite`, `/<label>/team` → **Plan 2**. §4.5 proxy + cookie (host, site) + mint — Task 8. §6 compose/`.env` — Task 5, 9 (server profile → Plan 5). §7 session/seat-door signature — Task 3, 4. §13.5 the `dev-fleet.mjs` seed — Task 8 takes `upgrade`; its `/api/sites` part → Plan 3.
- **No placeholders:** every step has code; the two conditional spots (Task 4 the `fleet.js` function signature; Task 9 lockfile) spell out how to handle each branch.
- **Consistent names:** `sites.hostOf/dshOf/labelOf/siteScope` (Task 7) used in Task 8 and `server.js`; `seatTokenCookieName(origin, scope)` (Task 8) used in both branches; `mintSeatSession` has the same signature as the old `seat-door` (Task 4) — Task 8 passes exactly `{ origin, secret, grant }`.

---

## The four remaining plans (write each one when the previous plan is green)

| Plan | Spec | Delivers |
|---|---|---|
| **2 — Ledger** | §4.3, §4.4, §4.6 (partly), §4.7, §8 | port `seats/` `sites/` `workspaces/` `github/` `mail/` from `seat-registry` + `cowork-web` to Hono; full tables; `/api/*` with exactly 14 signatures + `/invite` + `/<label>/team`; OAuth; old tests run on the new app; Task 7's `resolver` replaced by the `site` table |
| **3 — Host** | §5, §13.1–13.2, §6 (absolute paths) | `apps/tracy-host`: HMAC-signed door, real `provision.sh --fresh` through a container, two-root layout, 17 webroot jobs, `/attach`, MinIO artifacts; merge the `dev/` cluster into `deploy/compose.yml`; **Add site from the local UI yields a working site** |
| **4 — Bar · Ops · Public** | §4.6, §4.8 (`/ops`), `public/` | `*.<SITE_DOMAIN>` → `tracy-web`: badge, `/__tracy/*`, admin guard, robots; `/ops` SPA; `/design-inspiration`; **13/13 (+14–16) on dev** |
| **5 — Cutover** | §9 steps 5–7, §5.2 migrate, §11 | export Supabase → Postgres, migrate 15 sites on prod1, `server` profile (cloudflared, R2, GitHub App), cut over DNS, clean up `workers/` + docs + ADR 0015 |
