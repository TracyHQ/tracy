// Ported from the 2.6.6 fork's test/gateway-tracy-door.test.ts (L5–L8, hooks H7 + H12); cases unchanged.
/**
 * The Tracy sign-in door (`/gateway/tracy/*`).
 *
 * What is worth checking here is NOT the HTML but four answers of "no":
 *
 *   1. Missing config → the door DOES NOT EXIST (404), not an error page inviting a retry.
 *   2. A nonce this lane did not issue → nothing changes.
 *   3. The seat book says this person has no seat → no session is granted.
 *   4. None of the four paths touches a password.
 *
 * All four are fail-closed, and fail-closed is the kind of thing that is wrong once and then silently right forever.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';

import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { createGatewayServer } from '../../src/gateway.js';
import type { PlatformConfig } from '../../src/config.js';

const SEAT_SECRET = 'lane-seat-secret';
const ACTOR_SECRET = 'tracy-actor-secret';
const NONCE = 'a'.repeat(64);

let tempDir: string;
let db: Database;
let upstream: http.Server;
const NOT_FOUND = { status: 404, body: { code: 'NOT_FOUND' } };

let seatsCalls: { path: string; body: unknown; actor: string | undefined }[] = [];
let seatsReply: (path: string) => { status: number; body: unknown } = () => NOT_FOUND;

/**
 * Fake seat book, and its most important rule: **any path not declared is 404**.
 *
 * The first version of this file used a ternary chain whose last branch answered the seat book for EVERY other path. So
 * the lane called `/sites/:key/roster` (a path the real seat book does NOT have: a concept name, not
 * a route name) and eight tests stayed green. On the real machine that door is 404, `book.ok` is false, and every
 * sign-in ended at "this address has no seat": the door refused the very site owner with the wording
 * of a permission error (measured 01/09, profile `native`).
 *
 * A fake that answers more broadly than what it imitates checks nothing; it only restates the test
 * author's belief about the path. So this table is explicit, and every path outside it is 404.
 */
function registry(routes: Record<string, unknown>): (path: string) => { status: number; body: unknown } {
  return (path) => (path in routes ? { status: 200, body: routes[path] } : NOT_FOUND);
}

const SITE_KEY = 'tracy.ai';
const SEATS_PATH = `/sites/${SITE_KEY}/seats`;
const LINK_STARTED = { nonce: NONCE, clientSecret: 'cs-secret' };
const TRACY_CONFIG = { origin: 'https://cowork.tracy.ai', siteKey: SITE_KEY, actorSecret: ACTOR_SECRET };
const servers: http.Server[] = [];
const realFetch = globalThis.fetch;

/** Builds a gateway with the Tracy config each test decides. */
async function gatewayWith(tracy: Partial<PlatformConfig['tracy']>): Promise<{ port: number; close: () => void; db: Database }> {
  const dbPath = path.join(tempDir, `t-${String(servers.length)}.db`);
  const local = new Database(dbPath, createFieldCrypto('k', 'k'));
  local.init();
  const upstreamPort = (upstream.address() as { port: number }).port;
  const config: PlatformConfig = {
    setupKey: 'setup-key', dbPath, dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${upstreamPort}`,
      tls: null, redirectPort: null, publicHost: '127.0.0.1', domain: '', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'jwt-secret', internalSecret: 'internal',
    seatSecret: SEAT_SECRET,
    tracy: { origin: '', siteKey: '', actorSecret: '', siteLabel: '', ...tracy },
    patch: { dshRoot: '', restartService: '' },
    webSocket: { adminAllowlist: [], userAllowlist: [] },
  };
  const server = createGatewayServer(config, new AuthService(config, local), local);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { port: (server.address() as { port: number }).port, close: () => server.close(), db: local };
}

function request(
  port: number,
  pathname: string,
  init: { method?: string; form?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
    const payload = init.form ? new URLSearchParams(init.form).toString() : null;
    const req = http.request(
      {
        host: '127.0.0.1', port, path: pathname, method: init.method ?? 'GET',
        headers: {
          ...(payload
            ? { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(payload)) }
            : {}),
          ...(init.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8') + String(res.headers.location ?? ''),
            setCookie: res.headers['set-cookie'] ?? [],
          }),
        );
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

before(async () => {
  tempDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'dshpw-tracy-')));
  db = new Database(path.join(tempDir, 'shared.db'), createFieldCrypto('k', 'k'));
  db.init();
  upstream = http.createServer((_req, res) => res.end('{}'));
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  // Fake seat book: records every outgoing call, answers per each test's script.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const headers = new Headers(init?.headers ?? {});
    seatsCalls.push({
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      actor: headers.get('x-tracy-actor') ?? undefined,
    });
    const reply = seatsReply(url.pathname);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  for (const server of servers) server.close();
  upstream?.close();
  db?.close();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test('ONE config variable missing: the local sign-in page DOES NOT EXIST — 404, not an error page', async () => {
  // 404, not 403, for the same reason the password door picks 404 when the seat door is on: a door that answers
  // "forbidden" invites people to look for a way around. This door is simply not there.
  //
  // `siteKey` stays in this list after 06/09, when it stopped gating the door itself: the pages
  // under `/gateway/tracy` ask THIS site's seat book, and a deployment with no site has no book
  // to ask. What changed is only where such a deployment sends people — see the host-dsh tests
  // at the end of this file.
  for (const missing of ['origin', 'siteKey', 'actorSecret'] as const) {
    const lane = await gatewayWith({ ...TRACY_CONFIG, [missing]: '' });
    const res = await request(lane.port, '/gateway/tracy');
    assert.notEqual(res.status, 200, `${missing} is missing yet the door is open`);
    lane.close();
  }
});

test('full config: the page draws all three ways in, and NO password field', async () => {
  const lane = await gatewayWith(TRACY_CONFIG);
  const res = await request(lane.port, '/gateway/tracy');

  assert.equal(res.status, 200);
  assert.match(res.body, /name="email"/);
  assert.match(res.body, /provider" value="google"/);
  assert.match(res.body, /provider" value="github"/);
  // This is the point of the whole thing: identity is proven at Tracy, the lane no longer asks for a password.
  assert.doesNotMatch(res.body, /type="password"/);
  lane.close();
});

test('OAuth button: a WAIT screen + the Tracy address, NOT a 302 with r=', async () => {
  // Tracy's `safeReturnUrl` only accepts `https://<something>.tracy.ai`, so a lane on loopback
  // cannot ask to be sent back, and should not. It waits and then ASKS, the same door Tracy Desk uses. The
  // previous version sent `r=<lane>` and Tracy silently dropped that field: after signing in the user was left on
  // Tracy's "signed in" page with nothing taking them back to the panel (measured in a browser 01/09).
  seatsCalls = [];
  seatsReply = registry({ '/auth/link/browser': LINK_STARTED });
  const lane = await gatewayWith(TRACY_CONFIG);

  const res = await request(lane.port, '/gateway/tracy/start', { method: 'POST', form: { provider: 'github', next: '/' } });

  assert.equal(res.status, 200);
  assert.match(res.body, /cowork\.tracy\.ai\/signin\?n=/);
  assert.match(res.body, /provider=github/);
  assert.doesNotMatch(res.body, /[?&]r=/, 'must not send r= — Tracy drops it');
  assert.equal(seatsCalls.at(-1)?.path, '/auth/link/browser');
  lane.close();
});

test('poll: not approved changes nothing; once approved the session is granted in that same poll', async () => {
  let approved = false;
  seatsCalls = [];
  const routes = registry({
    '/auth/link/browser': LINK_STARTED,
    [`/auth/link/${NONCE}/exchange`]: { email: 'lee@example.com' },
    [SEATS_PATH]: { seats: [{ email: 'lee@example.com', role: 'owner', status: 'active' }] },
  });
  seatsReply = (p) =>
    p === `/auth/link/${NONCE}` ? { status: 200, body: { status: approved ? 'approved' : 'pending' } } : routes(p);
  const lane = await gatewayWith(TRACY_CONFIG);

  const link = await startLink(lane.port);

  const pending = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });
  assert.match(pending.body, /"state":"pending"/);
  assert.ok(!pending.setCookie.some((c) => c.startsWith('dsh_gateway_token=')), 'a session granted before approval');

  approved = true;
  const done = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });
  assert.match(done.body, /"done":true/);
  assert.ok(done.setCookie.some((c) => c.startsWith('dsh_gateway_token=')), 'approved, so a session must exist');

  // The seat lookup must use the path the REAL seat book serves. Asserted here, explicitly, word for word,
  // because this is the only line that tells "called the right door" from "called a door that does not exist and got 404".
  assert.ok(
    seatsCalls.some((c) => c.path === SEATS_PATH),
    `must ask ${SEATS_PATH}; called ${JSON.stringify(seatsCalls.map((c) => c.path))}`,
  );
  lane.close();
});

/**
 * Start a Google/GitHub sign-in and return the cookie `/start` hands THIS browser: `/poll` answers
 * only the browser that started the link (a link approved elsewhere cannot sign in another browser).
 */
async function startLink(port: number): Promise<string> {
  const res = await request(port, '/gateway/tracy/start', { method: 'POST', form: { provider: 'google', next: '/' } });
  return res.setCookie.map((line) => line.split(';')[0]).join('; ');
}

/** The `ticket` the code page just issued — the key to the server-side row holding the address. */
const ticketOf = (body: string): string => /name="ticket" value="([a-f0-9]{64})"/.exec(body)?.[1] ?? '';

test('the mail path uses the CODE door, not the site\'s OTP door — that one requires an existing seat', async () => {
  seatsCalls = [];
  seatsReply = registry({ '/auth/otp/start': { ok: true } });
  const lane = await gatewayWith(TRACY_CONFIG);

  const res = await request(lane.port, '/gateway/tracy/email', {
    method: 'POST',
    form: { email: 'Lee@Example.com', next: '/' },
  });

  assert.equal(res.status, 200);
  assert.equal(seatsCalls.at(-1)?.path, '/auth/otp/start');
  // The address is lower-cased before it leaves the lane, the same rule as the seat book.
  assert.equal((seatsCalls.at(-1)?.body as { email: string }).email, 'lee@example.com');
  assert.ok(!seatsCalls.some((c) => c.path.includes('/sites/')), 'must not touch the site\'s OTP door');
  lane.close();
});

test('the mail path ENDS IN PLACE: one code field, no nonce, no polling loop', async () => {
  // The previous version called `/auth/link/start`, showed a WAITING screen and asked the seat book
  // every two seconds — as it had to, because step two happened in another browser (the button in
  // the mail approved the nonce at cowork.tracy.ai). A six-digit code travels the other way: the
  // person carries it BACK to this page, so there is nobody left to wait for.
  seatsCalls = [];
  seatsReply = registry({ '/auth/otp/start': { ok: true } });
  const lane = await gatewayWith(TRACY_CONFIG);

  const res = await request(lane.port, '/gateway/tracy/email', {
    method: 'POST',
    form: { email: 'lee@example.com', next: '/' },
  });

  assert.match(res.body, /action="\/gateway\/tracy\/code"/, 'the code field must be right here');
  assert.match(res.body, /one-time-code/, 'iOS must be able to autofill the code from the mail');
  assert.doesNotMatch(res.body, /gateway\/tracy\/poll/, 'no polling loop left for the mail path');
  assert.doesNotMatch(res.body, /window\.open/, 'no tab may open — step two is right here');
  // `redirect_to` is the switch that draws the button in the mail. It must not leave the lane under
  // any name.
  assert.doesNotMatch(JSON.stringify(seatsCalls.at(-1)?.body), /redirect/i);
  lane.close();
});

test('right code → a LANE session, and the address does NOT travel through the form', async () => {
  // This is where the door stands or falls. A hidden `email` field would let someone ask for a code
  // for their own address and submit it alongside somebody else's; the seat book cannot catch that,
  // because it trusts the lane. The ticket is a key to a server-side row, and the address is there.
  seatsCalls = [];
  seatsReply = registry({
    '/auth/otp/start': { ok: true },
    '/auth/otp/verify': { ok: true, email: 'lee@example.com' },
    [SEATS_PATH]: { seats: [{ email: 'lee@example.com', role: 'owner', status: 'active' }] },
  });
  const lane = await gatewayWith(TRACY_CONFIG);

  const asked = await request(lane.port, '/gateway/tracy/email', {
    method: 'POST',
    form: { email: 'lee@example.com', next: '/' },
  });
  const res = await request(lane.port, '/gateway/tracy/code', {
    method: 'POST',
    form: { ticket: ticketOf(asked.body), code: '023058', email: 'victim@example.com' },
  });

  assert.equal(res.status, 303);
  assert.ok(res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')), 'a lane session must be granted');
  // The address taken to the seat book is STEP ONE's, not the one just typed into the form.
  const verified = seatsCalls.find((c) => c.path === '/auth/otp/verify');
  assert.equal((verified?.body as { email: string }).email, 'lee@example.com');
  lane.close();
});

test('unknown ticket: asks with nobody\'s code, and no session', async () => {
  seatsCalls = [];
  seatsReply = registry({ '/auth/otp/verify': { ok: true, email: 'victim@example.com' } });
  const lane = await gatewayWith(TRACY_CONFIG);

  const res = await request(lane.port, '/gateway/tracy/code', {
    method: 'POST',
    form: { ticket: 'a'.repeat(64), code: '023058' },
  });

  assert.equal(res.status, 400);
  assert.equal(seatsCalls.length, 0, 'not a single seat-book call');
  assert.ok(!res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')));
  lane.close();
});

test('wrong code: stays on the code step, not bounced to the email step, no session', async () => {
  seatsCalls = [];
  seatsReply = (p) =>
    p === '/auth/otp/verify'
      ? { status: 401, body: { code: 'BAD_CODE' } }
      : registry({ '/auth/otp/start': { ok: true } })(p);
  const lane = await gatewayWith(TRACY_CONFIG);

  const asked = await request(lane.port, '/gateway/tracy/email', {
    method: 'POST',
    form: { email: 'lee@example.com', next: '/' },
  });
  const res = await request(lane.port, '/gateway/tracy/code', {
    method: 'POST',
    form: { ticket: ticketOf(asked.body), code: '000000' },
  });

  assert.equal(res.status, 401);
  assert.match(res.body, /action="\/gateway\/tracy\/code"/);
  assert.ok(!res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')));
  lane.close();
});

test('a nonce this lane did not issue: nothing changes, no session', async () => {
  seatsCalls = [];
  seatsReply = registry({});
  const lane = await gatewayWith(TRACY_CONFIG);

  const res = await request(lane.port, `/gateway/tracy/poll?n=${'b'.repeat(64)}`);

  assert.match(res.body, /"state":"expired"/);
  assert.equal(seatsCalls.length, 0, 'not a single seat-book call');
  assert.ok(!res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')));
  lane.close();
});

test('an identity with NO seat: no session is granted', async () => {
  seatsCalls = [];
  seatsReply = registry({
    '/auth/link/browser': LINK_STARTED,
    [`/auth/link/${NONCE}`]: { status: 'approved' },
    [`/auth/link/${NONCE}/exchange`]: { email: 'nobody@example.com' },
    [SEATS_PATH]: { seats: [] },
  });
  const lane = await gatewayWith(TRACY_CONFIG);

  const link = await startLink(lane.port);
  const res = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });

  assert.match(res.body, /"done":false/);
  assert.ok(!res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')));
  lane.close();
});

test('a seat: a LANE session is granted, and the proof sent to the seat book carries the right address', async () => {
  seatsCalls = [];
  seatsReply = registry({
    '/auth/link/browser': LINK_STARTED,
    [`/auth/link/${NONCE}`]: { status: 'approved' },
    [`/auth/link/${NONCE}/exchange`]: { email: 'lee@example.com' },
    [SEATS_PATH]: { seats: [{ email: 'lee@example.com', role: 'owner', status: 'active' }] },
  });
  const lane = await gatewayWith({ ...TRACY_CONFIG, siteLabel: 'tracy-ai-8836f920' });

  const link = await startLink(lane.port);
  const res = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });

  assert.match(res.body, /"done":true/);
  const cookie = res.setCookie.find((c) => c.startsWith('dsh_gateway_token='));
  assert.ok(cookie, `a session must exist; saw ${JSON.stringify(res.setCookie)}`);
  assert.match(cookie, /HttpOnly/);
  // The seat lookup must carry the proof; without it the seat book answers for an anonymous person.
  const seat = seatsCalls.find((c) => c.path === SEATS_PATH);
  assert.ok(seat?.actor?.startsWith('v1.'), 'the seat lookup must sign the actor proof');
  lane.close();
});

test('a nonce is single-use: the second attempt changes nothing', async () => {
  seatsReply = registry({
    '/auth/link/browser': LINK_STARTED,
    [`/auth/link/${NONCE}`]: { status: 'approved' },
    [`/auth/link/${NONCE}/exchange`]: { email: 'lee@example.com' },
    [SEATS_PATH]: { seats: [{ email: 'lee@example.com', role: 'owner', status: 'active' }] },
  });
  const lane = await gatewayWith(TRACY_CONFIG);

  const link = await startLink(lane.port);
  const first = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });
  const second = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });

  assert.match(first.body, /"done":true/);
  assert.match(second.body, /"state":"expired"/);
  lane.close();
});

test('no session yet: bounced to the door that IS OPEN, not the password door that is off', async () => {
  // Bug measured 01/09: after Google sign-in the lane bounced to `/gateway/login`, an endpoint that is 404
  // and answers JSON `{"ok":false,"error":"password login is disabled on this lane"}`. The "not signed in"
  // branches were written when only ONE door existed, so they hard-coded its path.
  const lane = await gatewayWith(TRACY_CONFIG);

  const res = await request(lane.port, '/api/session/list', { method: 'POST' });

  assert.equal(res.status, 302);
  assert.match(res.body, /\/gateway\/tracy/);
  assert.doesNotMatch(res.body, /\/gateway\/login/);
  lane.close();
});

test('a lane WITHOUT the Tracy door still bounces to the password door as before', async () => {
  const lane = await gatewayWith({});
  const res = await request(lane.port, '/api/session/list', { method: 'POST' });

  assert.equal(res.status, 302);
  assert.match(res.body, /\/gateway\/login/);
  lane.close();
});

// ── A dsh that belongs to no site (Plan 3: one dsh per fleet host) ────────────────────────────
//
// The seat secret is set on every one of these, so the password door is already a 404. That is
// what makes the redirect target the whole answer: send someone to `/gateway/login` here and they
// land on `{"ok":false,"error":"password login is disabled on this lane"}` with nothing else to
// try. Before 06/09 an empty `siteKey` did exactly that.

const HOST_DSH = { origin: 'https://cowork.tracy.ai', siteKey: '', actorSecret: ACTOR_SECRET, siteLabel: '' };

test('empty site key: with no session, bounce to Tracy, not to the password door that is off', async () => {
  const lane = await gatewayWith(HOST_DSH);

  // A BROWSER NAVIGATION — `Accept: text/html`, no Worker service token.
  // This is a real person typing the address, and they still get the same bounce to Tracy as before.
  const res = await request(lane.port, '/api/session/list', {
    method: 'POST',
    headers: { accept: 'text/html,application/xhtml+xml' },
  });

  assert.equal(res.status, 302);
  // `body` in this helper is the body + `Location` joined, so assert Tracy's ABSOLUTE address
  // is present, and none of the lane's `/gateway/...` paths is.
  assert.match(res.body, /https:\/\/cowork\.tracy\.ai/, `bounced where: ${JSON.stringify(res.body)}`);
  assert.doesNotMatch(res.body, /\/gateway\/tracy/, 'no local sign-in page to bounce to');
  assert.doesNotMatch(res.body, /\/gateway\/login/, 'the password door is 404 — bouncing there hits a wall');
  lane.close();
});

test('empty site key: a Worker caller (or a non-browser) gets 401, NOT a bounce to another origin', async () => {
  // 🔒 A MEASURED LOOP, NOT A HYPOTHESIS. `cowork-web` proxies a navigation and then READS the
  // answer to decide whether to mint a session. Its rule is 401, or a bounce to
  // `/gateway/{login,tracy}`; an ABSOLUTE `Location` to `https://cowork.tracy.ai` matches
  // neither, so the Worker passes that bounce straight to the browser, the browser comes back to the same site
  // with its `tracy_site` cookie, and the two loop forever. Neither side logs a single error, because
  // neither side thinks anything is wrong.
  //
  // The other half of the fix is `laneRejectedSession` on the Worker side; the two halves are pinned together in
  // `scripts/test/seat-door-interop.test.ts`.
  const lane = await gatewayWith(HOST_DSH);

  // The Cloudflare Access service token header: what `proxyToAgent` sets on EVERY call, and
  // the only thing that reaches this lane (Access is the only door).
  const proxied = await request(lane.port, '/api/session/list', {
    method: 'POST',
    headers: { accept: 'text/html', 'cf-access-client-id': 'worker.access' },
  });
  assert.equal(proxied.status, 401, `the Worker must be told there is no session: ${JSON.stringify(proxied.body)}`);
  assert.doesNotMatch(proxied.body, /https:\/\/cowork\.tracy\.ai/, 'no bounce to another origin');

  // And a non-browser client (not asking for HTML) gets the same: it cannot follow a bounce
  // to another origin, and a sign-in page is not the answer it asked for.
  const api = await request(lane.port, '/api/session/list', { method: 'POST' });
  assert.equal(api.status, 401);
  lane.close();
});

test('empty site key: NO local sign-in page, since there is no seat book to ask', async () => {
  // The pages under `/gateway/tracy` mint a lane session from THIS site's seat book. A host dsh
  // has no site, so a page that pretended to would have to guess which book — and a guess about
  // who somebody is, is the one thing this door exists to refuse.
  seatsCalls = [];
  seatsReply = registry({});
  const lane = await gatewayWith(HOST_DSH);

  const page = await request(lane.port, '/gateway/tracy');
  const start = await request(lane.port, '/gateway/tracy/start', { method: 'POST', form: { provider: 'google', next: '/' } });

  assert.notEqual(page.status, 200);
  assert.notEqual(start.status, 200);
  assert.equal(seatsCalls.length, 0, 'not a single seat-book call');
  lane.close();
});

test('empty site key: the password door stays closed — two doors are still one door too many', async () => {
  const lane = await gatewayWith(HOST_DSH);

  const res = await request(lane.port, '/gateway/login');

  assert.equal(res.status, 404);
  lane.close();
});

test('L6/Issue #35: an approved link signs in only the browser that started it — a poll from another browser gets nothing', async () => {
  seatsCalls = [];
  const routes = registry({
    '/auth/link/browser': LINK_STARTED,
    [`/auth/link/${NONCE}`]: { status: 'approved' },
    [`/auth/link/${NONCE}/exchange`]: { email: 'attacker@example.com' },
    [SEATS_PATH]: { seats: [{ email: 'attacker@example.com', role: 'owner', status: 'active' }] },
  });
  seatsReply = routes;
  const lane = await gatewayWith(TRACY_CONFIG);
  // The attacker starts (and approves) a link in their own browser…
  const attacker = await startLink(lane.port);
  assert.match(attacker, /=/, '/start hands its browser a cookie');
  // …then sends the victim's browser to the poll, with no cookie or another link's.
  for (const cookie of [undefined, 'dshpw_tracy_link=' + 'c'.repeat(64)]) {
    const res = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, cookie === undefined ? {} : { headers: { cookie } });
    assert.match(res.body, /"state":"expired"/, String(cookie));
    assert.ok(!res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')), 'no session for a browser that did not start the link');
  }
  assert.ok(!seatsCalls.some((c) => c.path.endsWith('/exchange')), 'the nonce was never exchanged for the attacker');
  // The browser that started it still finishes.
  const own = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: attacker } });
  assert.match(own.body, /"done":true/);
  lane.close();
});

// ── T1 (#1036): only a LIVE seat gets a lane session, and it carries its role's toolsets ─────────
//
// The seat book's `/sites/:key/seats` answers every row of a site, including invitations nobody
// accepted and ones that were declined (`rosterRow` status `invited` / `declined`). The door used
// to skip only `revoked`, so an address that was merely invited signed in with the invited role.

/** Sign `email` in through Google with the roster `seats`; returns the poll answer and the lane. */
async function signInWithRoster(email: string, seats: unknown[], tracy = TRACY_CONFIG) {
  seatsCalls = [];
  seatsReply = registry({
    '/auth/link/browser': LINK_STARTED,
    [`/auth/link/${NONCE}`]: { status: 'approved' },
    [`/auth/link/${NONCE}/exchange`]: { email },
    [SEATS_PATH]: { seats },
  });
  const lane = await gatewayWith(tracy);
  const link = await startLink(lane.port);
  const res = await request(lane.port, `/gateway/tracy/poll?n=${NONCE}`, { headers: { cookie: link } });
  return { res, lane };
}

for (const status of ['invited', 'declined', 'revoked', undefined] as const) {
  test(`T1: a seat whose status is ${String(status)} gets NO lane session`, async () => {
    const { res, lane } = await signInWithRoster('ana@example.com', [{ email: 'ana@example.com', role: 'editor', status }]);
    assert.match(res.body, /"done":false/, `a ${String(status)} seat must not sign in: ${res.body}`);
    assert.ok(!res.setCookie.some((c) => c.startsWith('dsh_gateway_token=')), 'no session cookie');
    lane.close();
  });
}

test('T1: a declined row and a live row for one address: the LIVE row decides the role', async () => {
  const rows = [
    { email: 'ana@example.com', role: 'owner', status: 'declined' },
    { email: 'ana@example.com', role: 'viewer', status: 'active' },
  ];
  const { res, lane } = await signInWithRoster('ana@example.com', rows);
  assert.match(res.body, /"done":true/, res.body);
  const user = lane.db.listUsers().find((row) => row.role !== 'admin');
  assert.ok(user, 'the seat account exists');
  // The live viewer row, not the declined owner row above it.
  assert.equal(lane.db.getPermissions(user.id)?.sandbox_mode, 'read-only');
  lane.close();
});

test('T1: a live viewer seat signs in READ-ONLY — the session carries the role toolsets, not a default', async () => {
  const { res, lane } = await signInWithRoster('vi@example.com', [{ email: 'vi@example.com', role: 'viewer', status: 'active' }]);
  assert.match(res.body, /"done":true/, res.body);
  const user = lane.db.listUsers().find((row) => row.role !== 'admin');
  assert.ok(user);
  const perms = lane.db.getPermissions(user.id);
  assert.equal(perms?.sandbox_mode, 'read-only');
  assert.equal(perms?.allow_upload, false);
  assert.equal(perms?.allow_git_download, false);
  assert.equal(perms?.allow_workspace_create, false);
  assert.equal(perms?.hourly_token_limit, null, 'a viewer is not a capped visitor');
  lane.close();
});

test('T1/ADR 0028: a retired role from an old seat book (admin, developer) signs in as an editor', async () => {
  for (const role of ['admin', 'developer']) {
    const { res, lane } = await signInWithRoster('old@example.com', [{ email: 'old@example.com', role, status: 'active' }]);
    assert.match(res.body, /"done":true/, `${role}: ${res.body}`);
    const user = lane.db.listUsers().find((row) => row.role !== 'admin');
    assert.ok(user);
    assert.equal(lane.db.getPermissions(user.id)?.sandbox_mode, null, `${role} runs as an editor`);
    lane.close();
  }
});
