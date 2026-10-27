/**
 * The language switch of the gate pages, measured on a phone-sized screen (TCH #797, F-S1-007).
 *
 * Eight languages do not fit on one row of a 400px card. The switch used to be an absolutely
 * positioned, non-wrapping row under a `body` that clipped: on a narrow screen some languages ran
 * off the card and could not be chosen. `i18n-surfaces.test.ts` keeps a fast check of the CSS
 * rule; a rule read with a regex is not a layout, so this file loads the pages a real gate serves
 * into Chrome at 320×568 and 375×667 and reads the boxes back.
 *
 * It needs a Chrome that already listens for the DevTools protocol, named by
 * `I18N_SURFACES_CDP_URL` (for example `http://127.0.0.1:9222`). With that variable set, a Chrome
 * that cannot be reached, answers wrongly or times out FAILS the run. Without it the measurement
 * is skipped by name: the check runners carry no browser. Only the targets this file opens are
 * closed; the browser is somebody else's and stays up.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { createGatewayServer } from '../../src/gateway.js';
import { GATEWAY_LANGS } from '../../src/tracy/i18n/index.js';
import type { PlatformConfig } from '../../src/config.js';

const CDP_URL = (process.env.I18N_SURFACES_CDP_URL ?? '').replace(/\/+$/, '');
const ARTIFACT_DIR = process.env.I18N_SURFACES_ARTIFACT_DIR ?? '';
// The gateway pages measured here speak eight languages through hook H9; the measurement itself
// needs a browser, which the check runners do not carry.
const SKIP = CDP_URL === '' ? 'I18N_SURFACES_CDP_URL is not set: no Chrome to measure in' : false;
const STEP_TIMEOUT_MS = 15_000;

const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
] as const;
// Shorter than either card, so the page has to scroll to show both of its ends.
const SHORT = { width: 320, height: 320 } as const;

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Link = { lang: string; text: string; box: Box; hit: boolean };
type Measure = {
  error?: string;
  innerWidth: number;
  innerHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  card: Box;
  links: Link[];
  /** The first box of the card after the switch (the logo). */
  content: Box;
  /** With the page scrolled to its top: is the switch on screen? */
  topReached: boolean;
  /** With the page scrolled to its end: is the lowest thing in the card on screen and on top? */
  endReached: boolean;
};

/**
 * Runs inside the page. Boxes are in document coordinates, so they compare across scroll
 * positions; `hit` asks the browser what a tap in the middle of each link would land on.
 */
const MEASURE = `(() => {
  const card = document.querySelector('.card');
  const row = document.querySelector('.card > .lang-switch');
  if (!card || !row) return { error: 'no .card > .lang-switch on the page' };
  // The entrance animation moves the card for half a second; measure where it comes to rest.
  for (const animation of card.getAnimations()) animation.finish();
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY,
      width: r.width, height: r.height,
    };
  };
  const onTop = (el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at !== null && (at === el || el.contains(at));
  };
  const links = [...row.querySelectorAll('a')].map((a) => {
    a.scrollIntoView({ block: 'center' });
    return {
      lang: new URL(a.href).searchParams.get('lang') ?? '',
      text: a.textContent.trim(),
      box: box(a),
      hit: onTop(a),
    };
  });
  scrollTo(0, 0);
  const rowTop = row.getBoundingClientRect();
  const topReached = scrollY === 0 && rowTop.top >= 0 && rowTop.bottom <= innerHeight;
  // Leaves only: a container that ends where its last child does can be taller than the screen.
  const boxed = [...card.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect();
    return el.children.length === 0 && r.width > 0 && r.height > 0;
  });
  const last = boxed.reduce((low, el) => (box(el).bottom > box(low).bottom ? el : low), row);
  scrollTo(0, document.documentElement.scrollHeight);
  const lastNow = last.getBoundingClientRect();
  const endReached = lastNow.top >= 0 && lastNow.bottom <= innerHeight && onTop(last);
  scrollTo(0, 0);
  return {
    innerWidth, innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    card: box(card), links, content: box(row.nextElementSibling ?? card),
    topReached, endReached,
  };
})()`;

/** What is wrong with a measured page; empty when every language can be chosen. */
function problems(m: Measure, viewport: { width: number; height: number }): string[] {
  if (m.error) return [m.error];
  const out: string[] = [];
  const slack = 0.5;
  if (m.innerWidth !== viewport.width) out.push(`laid out ${String(m.innerWidth)}px wide, not ${String(viewport.width)}px`);
  if (m.scrollWidth > m.innerWidth) out.push(`the page is ${String(m.scrollWidth)}px wide: it scrolls sideways`);
  const langs = m.links.map((link) => link.lang).join(',');
  if (langs !== GATEWAY_LANGS.join(',')) out.push(`the switch lists "${langs}"`);
  for (const link of m.links) {
    const { box } = link;
    if (link.text === '' || box.width <= 0 || box.height <= 0) out.push(`${link.lang}: nothing to see`);
    if (box.left < m.card.left - slack || box.right > m.card.right + slack) out.push(`${link.lang}: outside the card`);
    if (box.left < -slack || box.right > m.innerWidth + slack) out.push(`${link.lang}: outside the screen`);
    if (box.top < m.card.top - slack) out.push(`${link.lang}: above the card`);
    if (box.bottom > m.content.top + slack) out.push(`${link.lang}: over the content below the switch`);
    if (!link.hit) out.push(`${link.lang}: a tap on it lands on something else`);
  }
  for (const [i, a] of m.links.entries()) {
    for (const b of m.links.slice(i + 1)) {
      const apart =
        a.box.right <= b.box.left + slack || b.box.right <= a.box.left + slack ||
        a.box.bottom <= b.box.top + slack || b.box.bottom <= a.box.top + slack;
      if (!apart) out.push(`${a.lang} and ${b.lang} overlap`);
    }
  }
  const rows = new Set(m.links.map((link) => Math.round(link.box.top))).size;
  if (rows < 2) out.push(`the eight links sit on ${String(rows)} row`);
  if (!m.topReached) out.push('the switch cannot be scrolled to');
  if (!m.endReached) out.push('the end of the card cannot be scrolled to');
  return out;
}

// ── A DevTools protocol client small enough to read: one target, one socket ─────────────────

type Tab = {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  loaded: () => Promise<void>;
  close: () => Promise<void>;
};

function within<T>(what: string, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: no answer in ${String(STEP_TIMEOUT_MS)} ms`)), STEP_TIMEOUT_MS);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function openTab(): Promise<Tab> {
  const made = await fetch(`${CDP_URL}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
  assert.equal(made.status, 200, `${CDP_URL}/json/new`);
  const target = (await made.json()) as { id?: unknown; webSocketDebuggerUrl?: unknown };
  assert.equal(typeof target.id, 'string', 'the browser names the new target');
  assert.equal(typeof target.webSocketDebuggerUrl, 'string', 'the browser gives the new target a socket');
  const id = target.id as string;
  const closeTarget = async (): Promise<void> => {
    await fetch(`${CDP_URL}/json/close/${id}`, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) }).catch(() => undefined);
  };
  let socket: WebSocket;
  try {
    socket = new WebSocket(target.webSocketDebuggerUrl as string);
    await within(
      'DevTools socket',
      new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('DevTools socket refused')), { once: true });
      }),
    );
  } catch (error) {
    await closeTarget();
    throw error;
  }
  let seq = 0;
  const waiting = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  let onLoad: (() => void) | null = null;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number; method?: string; result?: Record<string, unknown>; error?: { message?: string };
    };
    if (message.method === 'Page.loadEventFired') onLoad?.();
    if (message.id === undefined) return;
    const call = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) call?.reject(new Error(message.error.message ?? 'DevTools error'));
    else call?.resolve(message.result ?? {});
  });
  socket.addEventListener('close', () => {
    for (const call of waiting.values()) call.reject(new Error('DevTools socket closed'));
    waiting.clear();
  });
  return {
    send(method, params = {}) {
      const call = ++seq;
      const answer = new Promise<Record<string, unknown>>((resolve, reject) => waiting.set(call, { resolve, reject }));
      socket.send(JSON.stringify({ id: call, method, params }));
      return within(method, answer);
    },
    loaded() {
      return within('page load', new Promise<void>((resolve) => (onLoad = resolve)));
    },
    async close() {
      socket.close();
      await closeTarget();
    },
  };
}

/** Load one URL at one screen size in a target of its own and read the layout back. */
async function measure(url: string, viewport: { width: number; height: number }): Promise<Measure> {
  const tab = await openTab();
  try {
    await tab.send('Page.enable');
    await tab.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 2, mobile: true });
    const loaded = tab.loaded();
    const went = await tab.send('Page.navigate', { url });
    assert.equal(went.errorText, undefined, `${url}: ${String(went.errorText)}`);
    await loaded;
    const answer = (await tab.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })) as {
      result?: { value?: Measure };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    assert.equal(answer.exceptionDetails, undefined, answer.exceptionDetails?.exception?.description ?? answer.exceptionDetails?.text);
    assert.ok(answer.result?.value, 'the page returned no measurement');
    return answer.result.value;
  } finally {
    await tab.close();
  }
}

// ── The gates under measurement ─────────────────────────────────────────────────────────────

let scratch = '';
let upstream: http.Server;
const servers: http.Server[] = [];
const evidence: Record<string, unknown>[] = [];
const savedSettings = process.env.MCP_DSH_SETTINGS_FILE;

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return (server.address() as { port: number }).port;
}

/** A gate on a scratch database. A fresh one serves the first-run page; with a user, the sign-in page. */
async function gate(name: string, withUser: boolean): Promise<number> {
  const dbPath = path.join(scratch, `${name}.db`);
  const db = new Database(dbPath, createFieldCrypto('k', 'k'));
  db.init();
  if (withUser) db.createUser('owner', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const config: PlatformConfig = {
    setupKey: 'setup-key', dbPath, dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${String((upstream.address() as { port: number }).port)}`,
      tls: null, redirectPort: null, publicHost: '127.0.0.1', domain: '', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'jwt-secret', internalSecret: 'internal',
    patch: { dshRoot: '', restartService: '' },
    webSocket: { adminAllowlist: [], userAllowlist: [] },
  };
  return listen(createGatewayServer(config, new AuthService(config, db), db));
}

async function page(port: number, lang: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${String(port)}/gateway/login?lang=${lang}`, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
  assert.equal(res.status, 200);
  return res.text();
}

const PAGES = [
  { name: 'sign-in', marker: 'id="login-form"', withUser: true },
  { name: 'first-run setup', marker: 'id="setup-form"', withUser: false },
] as const;
const ports = new Map<string, number>();

before(async () => {
  if (SKIP) return;
  scratch = mkdtempSync(path.join(ARTIFACT_DIR || os.tmpdir(), 'dshpw-i18n-mobile-'));
  // No dsh preference: the query decides the language of every page measured here.
  process.env.MCP_DSH_SETTINGS_FILE = path.join(scratch, 'absent.yaml');
  upstream = http.createServer((_req, res) => res.end('{}'));
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  for (const { name, marker, withUser } of PAGES) {
    const port = await gate(name.replace(/\W/g, '-'), withUser);
    assert.ok((await page(port, 'en')).includes(marker), `${name}: the gate serves another page`);
    ports.set(name, port);
  }
});

after(() => {
  // Chrome and fetch keep their connections open; a close() alone would wait for them.
  for (const server of [...servers, upstream]) {
    server?.close();
    server?.closeAllConnections();
  }
  if (savedSettings === undefined) delete process.env.MCP_DSH_SETTINGS_FILE;
  else process.env.MCP_DSH_SETTINGS_FILE = savedSettings;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  if (ARTIFACT_DIR && evidence.length > 0) {
    writeFileSync(path.join(ARTIFACT_DIR, 'i18n-mobile-measure.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  }
});

for (const { name } of PAGES) {
  for (const viewport of PHONES) {
    const size = `${String(viewport.width)}×${String(viewport.height)}`;
    test(`${name} page at ${size}: all eight languages are inside the card and can be tapped`, { skip: SKIP }, async () => {
      // Dutch and Vietnamese carry the widest labels and sentences; Chinese the narrowest.
      for (const lang of ['nl', 'vi', 'zh']) {
        const url = `http://127.0.0.1:${String(ports.get(name))}/gateway/login?lang=${lang}`;
        const m = await measure(url, viewport);
        evidence.push({ page: name, lang, viewport, measure: m });
        assert.deepEqual(problems(m, viewport), [], `${name} ${size} ${lang}`);
      }
    });
  }

  test(`${name} page taller than the screen scrolls to both of its ends`, { skip: SKIP }, async () => {
    const m = await measure(`http://127.0.0.1:${String(ports.get(name))}/gateway/login?lang=nl`, SHORT);
    evidence.push({ page: name, lang: 'nl', viewport: SHORT, measure: m });
    assert.ok(m.scrollHeight > m.innerHeight, `the card (${String(m.scrollHeight)}px) fits a ${String(SHORT.height)}px screen: nothing was proven`);
    assert.deepEqual(problems(m, SHORT), []);
  });
}

test('I1: the measurement sees the old layout: one clipped, absolutely positioned row', { skip: SKIP }, async () => {
  // The rules the gate shipped before, put back on today's page. If the measurement above could
  // not tell this page from the fixed one, its green would mean nothing.
  const html = await page(ports.get('sign-in') ?? 0, 'nl');
  const rule = /\.lang-switch\{[^}]*\}/;
  assert.match(html, rule);
  const old = html
    .replace(rule, '.lang-switch{position:absolute;top:14px;right:16px;display:flex;gap:12px;font-size:12px}')
    .replace('</style>', 'html,body{height:100%}body{overflow:hidden}</style>');
  const port = await listen(http.createServer((_req, res) => res.setHeader('content-type', 'text/html; charset=utf-8').end(old)));
  for (const viewport of PHONES) {
    const m = await measure(`http://127.0.0.1:${String(port)}/`, viewport);
    const found = problems(m, viewport);
    evidence.push({ page: 'old layout, emulated', lang: 'nl', viewport, problems: found });
    assert.ok(found.some((p) => p.endsWith('outside the card')), `${String(viewport.width)}px: ${found.join('; ')}`);
    assert.ok(found.includes('the eight links sit on 1 row'), `${String(viewport.width)}px: ${found.join('; ')}`);
  }
});
