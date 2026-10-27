// L3 / R12: a seat is fail-closed toward routes nobody listed (plan §5, assumption 1). Upstream
// 2.7.7 forwards a subuser's unregistered plugin routes to dsh untouched, and its runtime plugin
// manifest marks every route a loaded plugin registers as "official", so neither upstream label
// stops `/api/<plugin>/<anything>`. Measured on the 2.7.7 stand (e2e-run-bc.md, C5): these all
// reached dsh. A seat now reaches dsh only through the seat table (routes.ts), dsh's own RPC and
// shell surfaces, and a named allowlist of plugin routes the seat UI was measured to call.
// Real gateway + fake dsh; every refusal also asserts dsh heard nothing.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';

const SID = 'session-00000000-0000-4000-8000-000000000001';
let h: Harness;
let seat: Person;
let master: Person;

before(async () => {
  h = await startHarness((seen) => (/^\/api\/workspace[./]list/.test(seen.url)
    ? workspaceList([{ workspaceId: 'w-alpha', path: '/site/alpha', sessionIds: [SID] }])
    : undefined));
  seat = h.seat('route-seat', { folders: ['/site/alpha'], sessions: [SID], allowUpload: true });
  master = h.master();
  assert.equal((await h.send('POST', '/api/workspace.list', seat, '{}')).status, 200);
});

after(async () => { await h.close(); });

const pathOf = (url: string): string => url.split('?')[0]!;

/** Requests the stand measured as reaching dsh for a seat (e2e-run-bc.md C5) plus near misses. */
const UNLISTED: Array<[string, string, string?]> = [
  ['GET', '/api/pw277-unknown'],
  ['POST', '/api/pw277.unknown', '{}'],
  ['POST', '/api/tracy-site-tools/pw277-unknown', '{}'],
  ['GET', '/api/tracy-site-tools/held'],
  ['POST', '/api/tracy-site-tools/hello/extra', '{}'],
  ['POST', '/api/tracy-add-site/pw277', '{}'],
  ['GET', '/api/tracy-add-site/hold'],
  ['POST', '/api/tracy-add-site/holds', '{}'],
  ['POST', '/api/tracy-add-site/hold/forget', '{}'],
  ['GET', '/dsh-subscriptions/pw277'],
  ['DELETE', '/api/session/pw277'],
  ['PUT', '/api/session/list', '{}'],
  ['POST', '/s/' + SID, '{}'],
  ['GET', '/pw277-root-unknown'],
  ['POST', '/api/pw277/../x', '{}'],
  ['GET', '/api/%74racy-site-tools/pw277'],
  // Routes a loaded plugin registers that no seat UI calls (agent read of each plugin's client, 05/10).
  ['POST', '/api/tracy-site-tools/apply', '{}'],
  ['GET', '/api/tracy-design-inspiration/template/t1/shot.png'],
  ['POST', '/dsh-subscriptions/logout', '{}'],
  ['POST', '/dsh-subscriptions/import-token', '{}'],
  ['GET', '/dsh-subscriptions/oauth/start'],
  ['PUT', '/dsh-subscriptions/config', '{}'],
  ['GET', '/preview.html'],
  ['POST', '/api/tracy-site-build-wordpress/pw277', '{}'],
];

test('L3/R12: a seat\'s request to an unlisted route is refused 403 at the gateway; dsh hears nothing', async () => {
  for (const [method, url, body] of UNLISTED) {
    const before = h.seen.length;
    const res = await h.send(method, url, seat, body);
    assert.equal(res.status, 403, `${method} ${url} must be refused to a seat (got ${String(res.status)})`);
    assert.equal(h.seen.length, before, `${method} ${url} must not reach dsh`);
  }
});

/**
 * What the seat UI called on the stand (owner A and editor B on rc2wp01, 05/10: chat, Files, Tasks,
 * Browser, Side Chat, My Sites, Design inspirations, Comments, Site changes, Team, Inbox, Settings),
 * minus the routes upstream or the seat table already refuse. Each must still reach dsh.
 */
const MEASURED_UI: Array<[string, string, string?]> = [
  ['GET', '/'],
  ['GET', `/s/${SID}`],
  ['GET', '/assets/index-Dgv1gs4c.js'],
  ['GET', '/plugins/??@tracy/dsh-site-tools/client.js,@tracy/dsh-brand/client.js&rev=abc'],
  ['GET', '/plugins/events'],
  ['POST', '/api/agentPresets/list', '{}'],
  ['POST', '/api/session/list', '{}'],
  ['POST', '/api/settings/describe', '{}'],
  ['POST', '/api/tracy-site-tools/hello', '{}'],
  ['POST', '/api/tracy-site-tools/view', '{}'],
  ['POST', '/api/tracy-site-tabs/hello', '{}'],
  ['POST', '/api/tracy-site-tabs/turn', '{}'],
  ['POST', '/api/tracy-add-site/credentials', '{}'],
  ['GET', '/api/tracy-design-inspiration/catalog'],
  ['GET', '/api/tracy-design-inspiration/site'],
  ['GET', '/dsh-subscriptions/status'],
  ['GET', '/dsh-subscriptions/config'],
];

test('L3/R12: every route the seat UI was measured to call still reaches dsh', async () => {
  for (const [method, url, body] of MEASURED_UI) {
    const before = h.reached(pathOf(url));
    const res = await h.send(method, url, seat, body);
    assert.notEqual(res.status, 403, `${method} ${url} is what the seat UI calls: ${res.body.slice(0, 160)}`);
    assert.equal(h.reached(pathOf(url)), before + 1, `${method} ${url} must reach dsh`);
  }
});

/** Routes each plugin's own client calls (read from source, 05/10), beyond what the stand walk reached. */
const PLUGIN_CLIENT_CALLS: Array<[string, string, string?]> = [
  ['POST', '/api/tracy-add-site/detect', '{}'],
  ['POST', '/api/tracy-add-site/status', '{}'],
  ['POST', `/api/tracy-site-build-joomla/start?session=${SID}`, '{}'],
  ['GET', `/api/tracy-site-build-emdash/job?session=${SID}`],
  ['GET', `/api/tracy-site-build-wordpress/home.png?session=${SID}`],
  ['POST', '/api/tracy-design-inspiration/choose', '{}'],
  ['GET', '/api/tracy-design-inspiration/copy/c1/jobs/j1'],
  ['POST', '/api/tracy-design-inspiration/copy/c1/pages/home/versions', '{}'],
  ['DELETE', '/api/tracy-design-inspiration/copy/c1/pages/home/versions/v2'],
  ['PUT', '/api/tracy-design-inspiration/copy/c1/pages/home/selected', '{}'],
  ['GET', '/api/tracy-design-inspiration/systems/brand:acme.example/artifact-slots/page'],
  ['POST', '/api/tracy-brand-engine/extract', '{}'],
  ['GET', '/api/tracy-brand-engine/extract/acme.example'],
  ['GET', '/api/tracy-brand-engine/brands/acme.example/logos/logo.svg'],
  ['DELETE', '/api/tracy-brand-engine/brands/acme.example'],
  ['POST', '/api/tracy-add-site/extension', '{}'],
  ['POST', '/api/tracy-add-site/start', '{}'],
  ['POST', `/api/tracy-site-build-wordpress/answers?session=${SID}`, '{}'],
  ['POST', `/api/tracy-site-build-wordpress/rerun?session=${SID}`, '{}'],
  ['POST', `/api/tracy-site-build-wordpress/comment?session=${SID}`, '{}'],
  ['POST', `/api/tracy-site-build-wordpress/inspect?session=${SID}`, '{}'],
  ['POST', `/api/tracy-site-build-wordpress/provision?session=${SID}`, '{}'],
  ['GET', `/api/tracy-site-build-joomla/ask?session=${SID}`],
  ['GET', `/api/tracy-site-build-joomla/workspace?session=${SID}`],
  ['GET', '/api/tracy-design-inspiration/copy/c1'],
  ['GET', '/api/tracy-design-inspiration/systems/sys1/tokens.css'],
  ['POST', '/api/tracy-brand-engine/start-from', '{}'],
  ['GET', '/api/tracy-brand-engine/jobs'],
  ['GET', '/api/tracy-brand-engine/brands'],
  ['GET', '/api/tracy-brand-engine/brands/acme.example/imagery/hero.jpg'],
];

test('L3/R12: every route a loaded plugin\'s client calls for a seat still reaches dsh', async () => {
  for (const [method, url, body] of PLUGIN_CLIENT_CALLS) {
    const before = h.reached(pathOf(url));
    const res = await h.send(method, url, seat, body);
    assert.notEqual(res.status, 403, `${method} ${url}: ${res.body.slice(0, 160)}`);
    assert.equal(h.reached(pathOf(url)), before + 1, `${method} ${url} must reach dsh`);
  }
});

// tracy-web's own call (`apps/tracy-web/src/lib/add-site-host.js`), made as the onboarding seat:
// the plugin checks the seat-secret HMAC over the exact body, so both must arrive untouched.
test('L3/R12: tracy-web\'s signed hold call reaches dsh as a seat, body and signature intact', async () => {
  const path = '/api/tracy-add-site/hold';
  const body = JSON.stringify({ op: 'hold', siteKey: 'acme.example', quietForMs: 3_600_000 });
  const signed = { 'x-seat-timestamp': '1792000000000', 'x-seat-nonce': 'n0nce', 'x-seat-signature': 'ab'.repeat(32) };
  // Shaped like `onboardingGrant`: a home folder, no session, no upload right.
  const onboarding = h.seat('onboarding-seat', { folders: ['/home/onboarding'], email: 'owner@acme.example' });
  const before = h.reached(path);
  const res = await h.send('POST', path, onboarding, body, { 'content-type': 'application/json', ...signed });
  assert.equal(res.status, 200, res.body.slice(0, 160));
  assert.equal(h.reached(path), before + 1, 'POST hold must reach dsh');
  const row = h.seen.at(-1)!;
  assert.equal(row.body, body);
  for (const [name, value] of Object.entries(signed)) assert.equal(row.headers[name], value, name);
});

test('L3/R12: the gateway master keeps upstream behaviour: an unlisted route still reaches dsh', async () => {
  for (const [method, url, body] of [['GET', '/api/pw277-unknown'], ['POST', '/api/tracy-site-tools/pw277-unknown', '{}']] as const) {
    const before = h.reached(pathOf(url));
    const res = await h.send(method, url, master, body);
    assert.equal(res.status, 200, `${method} ${url} for the master`);
    assert.equal(h.reached(pathOf(url)), before + 1);
  }
});

// Three dsh RPCs the dsh client of every seat calls on each page load, which upstream 2.7.7 refuses
// to subusers on purpose (`SUBUSER_BLOCKED_API_*`): the client printed each 403 as an error (~230
// console errors in 30 minutes on the stand, e2e-run-gh.md #3). They stay closed — nothing reaches
// dsh — but the seat gets the honest empty answer the client reads without complaint.
const envelope = (method: string, rpcId = 'rpc-1'): string =>
  JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: {} } });

test('L3/R12: dsh RPCs closed to seats answer empty at the gateway, not 403; dsh hears nothing', async () => {
  for (const [path, method, value] of [
    ['/api/dynamicCordisRunner/inventory', 'dynamicCordisRunner/inventory', []],
    ['/api/dynamicCordisRunner/syncInspectManifest', 'dynamicCordisRunner/syncInspectManifest', null],
    ['/api/session/canOpenWorkspacePath', 'session/canOpenWorkspacePath', false],
  ] as const) {
    const before = h.seen.length;
    const res = await h.send('POST', path, seat, envelope(method, `r-${method}`));
    assert.equal(res.status, 200, `${path}: ${res.body.slice(0, 120)}`);
    assert.deepEqual(JSON.parse(res.body), { type: 'server-response', rpcId: `r-${method}`, result: { ok: true, value } });
    assert.equal(h.seen.length, before, `${path} must not reach dsh`);
  }
});

test('L3/R12: anything else in those namespaces, or a mismatched envelope, is still refused 403 before dsh', async () => {
  for (const [path, body] of [
    ['/api/dynamicCordisRunner/define', envelope('dynamicCordisRunner/define')],
    ['/api/dynamicCordisRunner/inventory', envelope('dynamicCordisRunner/define')],
    ['/api/dynamicCordisRunner/inventory', JSON.stringify({ type: 'client-request', method: 'dynamicCordisRunner/inventory' })],
    ['/api/dynamicCordisRunner/inventory', 'not json'],
    ['/api/session/openWorkspacePath', envelope('session/openWorkspacePath')],
  ] as const) {
    const before = h.seen.length;
    const res = await h.send('POST', path, seat, body);
    assert.equal(res.status, 403, `${path} ${body.slice(0, 60)}`);
    assert.equal(h.seen.length, before);
  }
  const before = h.reached('/api/dynamicCordisRunner/inventory');
  assert.equal((await h.send('POST', '/api/dynamicCordisRunner/inventory', master, envelope('dynamicCordisRunner/inventory'))).status, 200);
  assert.equal(h.reached('/api/dynamicCordisRunner/inventory'), before + 1, 'the master still reaches dsh');
});

// The site tools and site tabs clients ping `/hello` with a bodyless POST (no content type). The
// write rule "JSON, or a held session in the query" refused it, since the gate cannot read what it
// forwards; a request with no body hides nothing (e2e-run-gh.md #4: 90 refusals in 30 minutes).
test('L3/Q2: a bodyless POST to a listed plugin route reaches dsh; a non-JSON body is still refused', async () => {
  for (const path of ['/api/tracy-site-tabs/hello', '/api/tracy-site-tools/hello']) {
    const before = h.reached(path);
    const res = await h.send('POST', path, seat);
    assert.equal(res.status, 200, `${path} without a body: ${res.body.slice(0, 120)}`);
    assert.equal(h.reached(path), before + 1);
    const opaque = await h.send('POST', path, seat, 'opaque', { 'content-type': 'text/plain' });
    assert.equal(opaque.status, 403, `${path} with a body the gate cannot read`);
    assert.equal(h.reached(path), before + 1);
  }
});
