/**
 * The cookie ledger's three rules — see `COOKIE_LEDGER` in `src/lib/cookies.js` for why a ledger
 * exists at all (short version: `tracy_site` outlived sign-out for weeks, and no file was in a
 * position to notice, because minting and forgetting lived in different files).
 *
 * This is a source-scanning test in the shape of `module-graph.test.mjs`: it reads `src/`, so a
 * cookie minted by hand in a new route is red on the PR that adds it, not on the day a customer
 * meets it.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import {
  COOKIE_LEDGER,
  HANDOFF_COOKIE,
  INTENT_COOKIE,
  PREVIEW_COOKIE,
  SEAT_TOKEN_PREFIX,
  seatTokenCookieName,
  SHARD_COOKIE,
  SITE_COOKIE,
  WIDGET_COOKIE
} from '../src/lib/cookies.js'
import { SESSION_COOKIE, SHARD_SESSION_PREFIX, VIEW_COOKIE } from '../src/lib/session.js'
import { LANGUAGE_COOKIE } from '../src/lib/i18n/index.js'
import { OAUTH_STATE_COOKIE } from '../src/identity/oauth.js'
import { SIGNIN_BROWSER_COOKIE } from '../src/identity/signin-guard.js'
import { DOWNLOAD_COOKIE } from '../src/lib/desktop-download.js'

// The same env `identity.test.mjs` builds its app from — enough for the sign-out door, which
// touches no host and no database.
const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const SRC = resolve(new URL('../src/', import.meta.url).pathname)

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []
  })
}

const MINTERS = new Set(COOKIE_LEDGER.map((row) => row.mintedIn))

test('rule 1: a cookie is minted only in a file the ledger names — `Max-Age=` appears nowhere else', () => {
  const strays = []
  for (const file of files(SRC)) {
    const rel = relative(SRC, file)
    if (MINTERS.has(rel)) continue
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // A comment may mention the attribute; a template that WRITES it is what the rule is about.
        if (/^\s*(\*|\/\/)/.test(line)) return
        if (line.includes('Max-Age=')) strays.push(`${rel}:${i + 1}`)
      })
  }
  assert.deepEqual(
    strays,
    [],
    'mint cookies through a helper in a ledger file (lib/cookies.js, lib/session.js, identity/oauth.js) and add the row to COOKIE_LEDGER'
  )
})

test('rule 2: every *_COOKIE / *_PREFIX constant under src/ has a ledger row, and every row names a real file', () => {
  const declared = new Map()
  for (const file of files(SRC)) {
    for (const m of readFileSync(file, 'utf8').matchAll(
      /export const ([A-Z_]+_(?:COOKIE|PREFIX))\s*=\s*'([^']+)'/g
    )) {
      declared.set(m[2], `${relative(SRC, file)}:${m[1]}`)
    }
  }
  const covered = new Set(COOKIE_LEDGER.map((row) => row.name ?? row.prefix))
  const missing = [...declared]
    .filter(([value]) => !covered.has(value))
    .map(([v, where]) => `${where} = '${v}'`)
  assert.deepEqual(missing, [], 'add a row to COOKIE_LEDGER for each of these')
  for (const row of COOKIE_LEDGER) {
    assert.ok(statSync(join(SRC, row.mintedIn)).isFile(), `${row.mintedIn} does not exist`)
    if (row.outlivesSignout)
      assert.ok(
        row.why?.length > 40,
        `${row.name ?? row.prefix}: a cookie that outlives sign-out must say why`
      )
  }
  // The six the app mints today (`tracy_intent` since 20/09 — the press, for a `/new/` entered on
  // its session; `__Host-tracy_pv` since 27/09 — the comment picker's continuation on a site's
  // hostname; `tracy_lang` since 02/10 — read only, written by the dsh page on an explicit language
  // pick, #753). Another is fine — it just has to be in the ledger (above).
  assert.deepEqual(
    [...declared.keys()].sort(),
    [
      OAUTH_STATE_COOKIE,
      SESSION_COOKIE,
      VIEW_COOKIE,
      SITE_COOKIE,
      SEAT_TOKEN_PREFIX,
      SHARD_SESSION_PREFIX,
      INTENT_COOKIE,
      PREVIEW_COOKIE,
      LANGUAGE_COOKIE,
      DOWNLOAD_COOKIE,
      SIGNIN_BROWSER_COOKIE,
      SHARD_COOKIE,
      HANDOFF_COOKIE,
      WIDGET_COOKIE
    ].sort()
  )
})

test('rule 3: POST /auth/signout clears every ledger cookie that must not outlive the person', async () => {
  const app = buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail: { send: async () => {} },
    now: () => 1_700_000_000_000
  })
  // Two seat cookies, for two sites, plus everything else the ledger knows — the jar of a person
  // who used two sites and started (but never finished) a Google sign-in.
  const seatA = seatTokenCookieName('http://dsh-a:8080', 'wpdemo')
  const seatB = seatTokenCookieName('http://dsh-b:8080', 'shop')
  const jar = [
    `${SESSION_COOKIE}=s`,
    `${SITE_COOKIE}=wpdemo.localhost`,
    `${seatA}=fp~tokA`,
    `${seatB}=fp~tokB`,
    `${OAUTH_STATE_COOKIE}=nonce`,
    `${SHARD_COOKIE}=s1`,
    `${SHARD_SESSION_PREFIX}s1=shard-session`,
    `${HANDOFF_COOKIE}=0123456789abcdef0123456789abcdef`
  ].join('; ')
  const res = await app.fetch(
    new Request('http://tracy.test/auth/signout', { method: 'POST', headers: { cookie: jar } })
  )
  assert.equal(res.status, 200)
  const cleared = res.headers.getSetCookie()
  const clearedNames = cleared.map((v) => {
    assert.match(v, /; Max-Age=0$/, `not a clearing header: ${v}`)
    return v.slice(0, v.indexOf('='))
  })
  for (const row of COOKIE_LEDGER) {
    if (row.outlivesSignout) {
      assert.ok(
        !clearedNames.includes(row.name),
        `${row.name} is marked outlivesSignout but sign-out cleared it`
      )
      continue
    }
    if (row.name)
      assert.ok(clearedNames.includes(row.name), `sign-out did not clear ${row.name}: ${cleared.join(' | ')}`)
    else if (row.prefix === SEAT_TOKEN_PREFIX)
      for (const n of [seatA, seatB])
        assert.ok(clearedNames.includes(n), `sign-out did not clear seat cookie ${n}`)
    // The master clears every `tracy_sess_<n>` the browser presents (contract §3, N3): a shard's
    // own name is cleared by that shard (`shard-node-session-wiring.test.mjs`). Asserted apart
    // because the loop above reads any `prefix` row as a seat cookie and would not notice it missing.
    else if (row.prefix === SHARD_SESSION_PREFIX)
      assert.ok(
        clearedNames.includes(`${SHARD_SESSION_PREFIX}s1`),
        `sign-out did not clear the shard session: ${cleared.join(' | ')}`
      )
  }
  // And nothing is cleared twice or joined: one header per cookie.
  assert.equal(new Set(clearedNames).size, clearedNames.length)
})
