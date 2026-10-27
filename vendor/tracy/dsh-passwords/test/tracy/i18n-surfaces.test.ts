/**
 * The language of the gateway's own pages (TCH #797, F-S1-007).
 *
 * Before this the gate knew two languages and fell back to Chinese, so a Vietnamese, German,
 * Italian, French, Dutch or Spanish browser with no dsh preference was handed a Chinese sign-in
 * page. The gate now serves the eight interface languages of the product and falls back to
 * English, per language and per key.
 *
 * Three layers are checked: the pure resolver (order of precedence, bad input), the dictionary
 * (per-key English fallback, translations taken from existing catalogues), and the pages a real
 * request gets (the lane sign-in page, the password page with its language switch, the refusal
 * page). The door itself is not widened: no site key still means no local page.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { createGatewayServer } from '../../src/gateway.js';
// The CLI keeps upstream's resolver (zh/en only); the gateway pages read Tracy's eight languages.
import { resolveCliLang } from '../../src/i18n.js';
import { GATEWAY_LANGS, htmlLangOf, resolveGatewayLang, t } from '../../src/tracy/i18n/index.js';
import type { PlatformConfig } from '../../src/config.js';

// The page cases drive the gateway: its pages speak through `src/tracy/i18n` (hook H9) and it
// serves the Tracy sign-in door (hook H7).

const NEW_LANGS = ['vi', 'de', 'it', 'fr', 'nl', 'es'] as const;
const JWT_SECRET = 'jwt-secret';

let scratch: string;
let upstream: http.Server;
const servers: http.Server[] = [];
const savedEnv = {
  MCP_DSH_SETTINGS_FILE: process.env.MCP_DSH_SETTINGS_FILE,
  DSH_HOME: process.env.DSH_HOME,
};

/** Point the gate at a settings file that does not exist: "no dsh preference", the issue's case. */
function noSettings(): void {
  process.env.MCP_DSH_SETTINGS_FILE = path.join(scratch, `absent-${Math.random().toString(36).slice(2)}.yaml`);
}

/** Write one settings fixture inside the scratch folder and make it the gate's settings file. */
function settings(name: string, text: string): string {
  const file = path.join(scratch, name);
  writeFileSync(file, text);
  process.env.MCP_DSH_SETTINGS_FILE = file;
  return file;
}

before(async () => {
  scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'dshpw-i18n-')));
  noSettings();
  upstream = http.createServer((_req, res) => res.end('{}'));
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
});

after(() => {
  for (const server of servers) server.close();
  upstream?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(scratch, { recursive: true, force: true });
});

// ── The resolver ────────────────────────────────────────────────────────────────────────────

test('I1: the gate serves the eight interface languages, in the product order', () => {
  assert.deepEqual([...GATEWAY_LANGS], ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']);
});

test('I1: a browser in any shipped language gets that language, never Chinese', () => {
  noSettings();
  for (const lang of NEW_LANGS) {
    assert.equal(resolveGatewayLang({ acceptLanguage: lang }), lang, `Accept-Language: ${lang}`);
  }
  assert.equal(resolveGatewayLang({ acceptLanguage: 'zh-CN,zh;q=0.9' }), 'zh');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'en-GB' }), 'en');
});

test('I1: regional tags, q-values and their order are honoured', () => {
  noSettings();
  assert.equal(resolveGatewayLang({ acceptLanguage: 'de-AT' }), 'de');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'pt-BR, fr-CA;q=0.8, en;q=0.5' }), 'fr');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'en;q=0.3, nl;q=0.9, es;q=0.6' }), 'nl');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'VI_vn' }), 'vi', 'case and underscore are tolerated');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'it, es' }), 'it', 'equal weights keep the header order');
});

test('I1: q=0, a malformed q and a wildcard are not choices', () => {
  noSettings();
  assert.equal(resolveGatewayLang({ acceptLanguage: 'zh;q=0, vi;q=0.5' }), 'vi');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'de;q=abc, it;q=0.4' }), 'it');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'de;q=1.5, es;q=0.2' }), 'es');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'fr;q=-1, nl;q=0.1' }), 'nl');
  assert.equal(resolveGatewayLang({ acceptLanguage: '*, zh;q=0' }), 'en');
});

test('I1: Traditional Chinese is never answered in Simplified: the next tag decides, or English', () => {
  noSettings();
  const traditional = ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh-hant-hk', 'zh_TW', 'zh-cmn-Hant', 'ZH-TW'];
  for (const tag of traditional) {
    assert.equal(resolveGatewayLang({ acceptLanguage: tag }), 'en', tag);
    assert.equal(resolveGatewayLang({ acceptLanguage: `${tag}, de;q=0.8` }), 'de', `${tag}, then German`);
    assert.equal(resolveGatewayLang({ acceptLanguage: `${tag}, zh;q=0.9, de;q=0.8` }), 'zh', `${tag}, then plain zh`);
    // Not a valid explicit choice either: `?lang=` and the cookie take the eight ids only.
    assert.equal(resolveGatewayLang({ queryLang: tag, cookieLang: tag, acceptLanguage: 'nl' }), 'nl', `${tag} as a choice`);
  }
  for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN', 'zh_CN']) {
    assert.equal(resolveGatewayLang({ acceptLanguage: tag }), 'zh', tag);
  }
});

test('I1: nothing usable falls back to English', () => {
  noSettings();
  const bad: unknown[] = [undefined, null, '', '   ', ',,,', 'pt-BR, ja', ';;q=1', 'x'.repeat(5000), 42, ['vi'], {}];
  for (const header of bad) {
    assert.equal(
      resolveGatewayLang({ acceptLanguage: header as string }),
      'en',
      `Accept-Language ${JSON.stringify(header)?.slice(0, 40)}`,
    );
  }
  assert.equal(resolveGatewayLang({}), 'en');
});

test('I1: precedence is unchanged: ?lang, then the cookie, then the dsh setting, then the browser', () => {
  settings('precedence.yaml', 'locale:\n  preference: it\n');
  assert.equal(resolveGatewayLang({ queryLang: 'de', cookieLang: 'fr', acceptLanguage: 'es' }), 'de');
  assert.equal(resolveGatewayLang({ cookieLang: 'fr', acceptLanguage: 'es' }), 'fr');
  assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'it');
  noSettings();
  assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'es');
});

test('I1: an unsupported, empty or wrongly typed choice is skipped, and the next source answers', () => {
  noSettings();
  for (const query of ['xx', '', 'ZH', 'vi-VN', ['vi'], 7, null, { lang: 'vi' }]) {
    assert.equal(
      resolveGatewayLang({ queryLang: query, cookieLang: 'nl', acceptLanguage: 'es' }),
      'nl',
      `query ${JSON.stringify(query)}`,
    );
  }
  for (const cookie of ['xx', '', 'de;evil', '../../etc', null]) {
    assert.equal(
      resolveGatewayLang({ cookieLang: cookie, acceptLanguage: 'es' }),
      'es',
      `cookie ${JSON.stringify(cookie)}`,
    );
  }
});

// ── The dsh setting ─────────────────────────────────────────────────────────────────────────

test('I1: the dsh language setting is read for every shipped language', () => {
  for (const lang of GATEWAY_LANGS) {
    settings(`pref-${lang}.yaml`, `ui-theme:\n  preference: dark\nlocale:\n  preference: "${lang}" # chosen\n`);
    assert.equal(resolveGatewayLang({ acceptLanguage: 'ja' }), lang);
  }
});

test('I1: a setting that cannot be trusted is not guessed at: the request decides', () => {
  const cases: Record<string, string> = {
    'empty.yaml': '',
    'malformed.yaml': 'locale: [unterminated\n  preference: de\n::::',
    'no-preference.yaml': 'locale:\n  other: value\n',
    'unsupported.yaml': 'locale:\n  preference: ja\n',
    'system.yaml': 'locale:\n  preference: system\n',
    // A write caught half-way: the key is there, the value is not yet.
    'half-written.yaml': 'locale:\n  preference: ',
    // `preference` here belongs to ANOTHER namespace; the locale block has none.
    'other-namespace.yaml': 'locale:\n  other: value\nui-theme:\n  preference: de\n',
    'before-locale.yaml': 'ui-theme:\n  preference: de\nlocale:\n  other: value\n',
    'not-a-block.yaml': 'locale: de\npreference: de\n',
  };
  for (const [name, text] of Object.entries(cases)) {
    settings(name, text);
    assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'es', name);
    assert.equal(resolveGatewayLang({}), 'en', `${name}, no request language`);
  }
});

test('I1: the setting is read as YAML structure: only the top-level locale.preference counts', () => {
  const refused: Record<string, string> = {
    // `preference` one level too deep is not `locale.preference`.
    'nested.yaml': 'locale:\n  nested:\n    preference: de\n',
    'nested-list.yaml': 'locale:\n  - preference: de\n',
    'under-other-key.yaml': 'settings:\n  locale:\n    preference: de\n',
    // A document that breaks AFTER a well-formed preference line is still a broken document.
    'broken-after.yaml': 'locale:\n  preference: de\nui-theme: [unterminated\n',
    'broken-indent.yaml': 'locale:\n  preference: de\n other: value\n',
    'tab-indent.yaml': 'locale:\n  preference: de\n\tother: value\n',
    'duplicate-key.yaml': 'locale:\n  preference: de\n  preference: fr\n',
    'duplicate-block.yaml': 'locale:\n  preference: de\nlocale:\n  preference: fr\n',
    'two-documents.yaml': 'locale:\n  preference: de\n---\nlocale:\n  preference: fr\n',
    // Inside a block scalar the line is text, not a key.
    'block-scalar.yaml': 'locale: |\n  preference: de\n',
    'commented.yaml': 'locale:\n  # preference: de\n  other: value\n',
    'not-a-string.yaml': 'locale:\n  preference: [de]\n',
    'a-list.yaml': '- locale:\n    preference: de\n',
    'a-scalar.yaml': 'de\n',
  };
  for (const [name, text] of Object.entries(refused)) {
    settings(name, text);
    assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'es', name);
  }
  const accepted: Record<string, string> = {
    'plain.yaml': 'locale:\n  preference: de\n',
    'deeper-indent.yaml': 'ui-theme:\n    preference: dark\nlocale:\n    other: 1\n    preference: de\n',
    'single-quoted.yaml': "locale:\n  preference: 'de'\n",
    'flow.yaml': 'locale: { preference: de }\n',
    'crlf.yaml': 'locale:\r\n  preference: de\r\n',
    'with-other-shapes.yaml': 'list:\n  - a\n  - b: [1, 2]\ntext: |\n  preference: fr\nlocale:\n  preference: de # chosen\n',
  };
  for (const [name, text] of Object.entries(accepted)) {
    settings(name, text);
    assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'de', name);
  }
});

test('I1: a settings path that is a folder or a pipe is skipped without reading it', () => {
  const folder = path.join(scratch, 'settings-folder.yaml');
  mkdirSync(folder);
  process.env.MCP_DSH_SETTINGS_FILE = folder;
  assert.equal(resolveGatewayLang({ acceptLanguage: 'fr' }), 'fr');

  // Reading a pipe nobody writes to would block the gate for ever; the call must return.
  const pipe = path.join(scratch, 'settings-pipe.yaml');
  execFileSync('mkfifo', [pipe]);
  process.env.MCP_DSH_SETTINGS_FILE = pipe;
  assert.equal(resolveGatewayLang({ acceptLanguage: 'nl' }), 'nl');
});

test('I1: a settings symlink is followed only to a regular file', () => {
  const real = path.join(scratch, 'linked-target.yaml');
  writeFileSync(real, 'locale:\n  preference: vi\n');
  const link = path.join(scratch, 'linked.yaml');
  symlinkSync(real, link);
  // The fixture stays inside the scratch folder: the link resolves to a file created above.
  assert.equal(realpathSync(link).startsWith(scratch), true);
  process.env.MCP_DSH_SETTINGS_FILE = link;
  assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'vi');

  const toFolder = path.join(scratch, 'linked-folder.yaml');
  symlinkSync(scratch, toFolder);
  process.env.MCP_DSH_SETTINGS_FILE = toFolder;
  assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'es');

  const dangling = path.join(scratch, 'dangling.yaml');
  symlinkSync(path.join(scratch, 'never-created.yaml'), dangling);
  process.env.MCP_DSH_SETTINGS_FILE = dangling;
  assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'es');
});

test('I1: DSH_HOME is the settings folder when no file is named', () => {
  delete process.env.MCP_DSH_SETTINGS_FILE;
  const home = path.join(scratch, 'dsh-home');
  mkdirSync(home);
  writeFileSync(path.join(home, 'settings.yaml'), 'locale:\n  preference: nl\n');
  process.env.DSH_HOME = home;
  assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'nl');
  delete process.env.DSH_HOME;
  noSettings();
});

// ── The words ───────────────────────────────────────────────────────────────────────────────

test('I1: a key a language lacks reads in English, never in Chinese and never as a raw key', () => {
  for (const lang of NEW_LANGS) {
    assert.equal(t(lang, 'gw.banned'), 'This account has been banned by the owner', lang);
    assert.equal(
      t(lang, 'tracy.noSeat', { email: 'a@b.c' }),
      'a@b.c does not hold a seat on this site. Ask someone on the site to invite you.',
      lang,
    );
  }
  assert.equal(t('zh', 'gw.banned'), '账号已被主用户封禁，请联系主用户');
  assert.equal(t('en', 'gw.banned'), 'This account has been banned by the owner');
  assert.equal(t('de', 'no.such.key'), 'no.such.key');
});

test('I1: sentences an existing catalogue already translates are served in that language', () => {
  const dir = path.join(import.meta.dirname, '..', '..', 'src', 'tracy', 'i18n', 'locales');
  for (const lang of NEW_LANGS) {
    const dict = JSON.parse(readFileSync(path.join(dir, `${lang}.json`), 'utf8')) as Record<string, string>;
    assert.ok(Object.keys(dict).length > 0, `${lang}.json is empty`);
    for (const [key, text] of Object.entries(dict)) {
      assert.equal(typeof text, 'string', `${lang} ${key}`);
      assert.notEqual(text.trim(), '', `${lang} ${key}`);
      assert.notEqual(t('en', key), key, `${lang}.json has "${key}", which is not a key of the English dictionary`);
      const want = [...t('en', key).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const have = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(have, want, `${lang} ${key} placeholders`);
      assert.equal(t(lang, key), text, `${lang} ${key}`);
    }
  }
  assert.equal(t('de', 'err.INVALID_CREDENTIALS'), 'Benutzername oder Passwort falsch');
  assert.equal(
    t('vi', 'err.ACCOUNT_LOCKED_FRESH', { count: 5, minutes: 15 }),
    'Thất bại 5 lần liên tiếp, tài khoản bị khoá 15 phút',
  );
});

test('I1: <html lang> is the BCP 47 tag of the page language', () => {
  assert.equal(htmlLangOf('zh'), 'zh-CN');
  for (const lang of GATEWAY_LANGS) if (lang !== 'zh') assert.equal(htmlLangOf(lang), lang);
});

test('I1: the CLI keeps its two languages and its default', () => {
  const saved = { LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES, LANG: process.env.LANG };
  try {
    delete process.env.LC_ALL;
    delete process.env.LC_MESSAGES;
    process.env.LANG = 'en_US.UTF-8';
    assert.equal(resolveCliLang(), 'en');
    process.env.LANG = 'zh_CN.UTF-8';
    assert.equal(resolveCliLang(), 'zh');
    process.env.LANG = 'de_DE.UTF-8';
    assert.equal(resolveCliLang(), 'zh');
    delete process.env.LANG;
    assert.equal(resolveCliLang(), 'zh');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

// ── The pages a request gets ────────────────────────────────────────────────────────────────

type Reply = { status: number; body: string; setCookie: string[] };

async function gatewayWith(overrides: Partial<PlatformConfig>): Promise<{ port: number; db: Database; config: PlatformConfig }> {
  const dbPath = path.join(scratch, `gw-${String(servers.length)}.db`);
  const db = new Database(dbPath, createFieldCrypto('k', 'k'));
  db.init();
  const config: PlatformConfig = {
    setupKey: 'setup-key', dbPath, dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${(upstream.address() as { port: number }).port}`,
      tls: null, redirectPort: null, publicHost: '127.0.0.1', domain: '', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: JWT_SECRET, internalSecret: 'internal',
    patch: { dshRoot: '', restartService: '' },
    webSocket: { adminAllowlist: [], userAllowlist: [] },
    ...overrides,
  };
  const server = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { port: (server.address() as { port: number }).port, db, config };
}

function get(port: number, pathname: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          setCookie: res.headers['set-cookie'] ?? [],
        }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

const htmlLang = (body: string): string | undefined => /<html lang="([^"]*)"/.exec(body)?.[1];
/** Han characters: none may reach a reader who did not ask for Chinese. */
const HAN = /[一-鿿]/;
/** The page's visible markup, without the inline script and style blocks. */
const visible = (body: string): string => body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

const LANE = {
  seatSecret: 'lane-seat-secret',
  tracy: { origin: 'https://cowork.tracy.ai', siteKey: 'tracy.ai', actorSecret: 'tracy-actor-secret', siteLabel: '' },
};

test('I1: the lane sign-in page follows the browser in every shipped language', async () => {
  noSettings();
  const lane = await gatewayWith(LANE);
  for (const lang of NEW_LANGS) {
    const res = await get(lane.port, '/gateway/tracy', { 'accept-language': `${lang}-XX,${lang};q=0.9` });
    assert.equal(res.status, 200, lang);
    assert.equal(htmlLang(res.body), lang, lang);
    assert.doesNotMatch(visible(res.body), HAN, `${lang}: Chinese text on the page`);
    assert.match(res.body, /Sign in to Tracy Cowork/, `${lang}: the heading falls back to English`);
    assert.equal(res.setCookie.some((c) => c.startsWith('dshpw_lang=')), false, `${lang}: nothing was chosen`);
  }
  const german = await get(lane.port, '/gateway/tracy', { 'accept-language': 'de' });
  // "Email" stays English in every language now (kept term, 05/10/2026); a German-only line proves the page is German.
  assert.match(german.body, /Wird gesendet…/, 'the label an existing catalogue translates is German');
  const chinese = await get(lane.port, '/gateway/tracy', { 'accept-language': 'zh-CN' });
  assert.equal(htmlLang(chinese.body), 'zh-CN');
  assert.match(chinese.body, /登录 Tracy Cowork/);
  const none = await get(lane.port, '/gateway/tracy');
  assert.equal(htmlLang(none.body), 'en');
  assert.match(none.body, /Sign in to Tracy Cowork/);
});

test('I1: ?lang= and the cookie decide the lane page before the browser does', async () => {
  noSettings();
  const lane = await gatewayWith(LANE);
  const byQuery = await get(lane.port, '/gateway/tracy?lang=fr', { 'accept-language': 'zh-CN', cookie: 'dshpw_lang=es' });
  assert.equal(htmlLang(byQuery.body), 'fr');
  const byCookie = await get(lane.port, '/gateway/tracy', { 'accept-language': 'zh-CN', cookie: 'dshpw_lang=es' });
  assert.equal(htmlLang(byCookie.body), 'es');
  const badBoth = await get(lane.port, '/gateway/tracy?lang=%22%3E%3Cscript%3E', {
    'accept-language': 'nl',
    cookie: 'dshpw_lang=%22%3E%3Cscript%3E',
  });
  assert.equal(htmlLang(badBoth.body), 'nl');
  assert.doesNotMatch(badBoth.body, /"><script>/);
});

test('I1: no site key: the lane page still does not exist, in any language', async () => {
  noSettings();
  const host = await gatewayWith({ ...LANE, tracy: { ...LANE.tracy, siteKey: '' } });
  for (const lang of ['vi', 'de', 'zh', 'en']) {
    const res = await get(host.port, `/gateway/tracy?lang=${lang}`, { 'accept-language': lang });
    assert.equal(res.status, 404, lang);
    assert.doesNotMatch(res.body, /<form/, lang);
  }
  // The password door stays shut on a lane with a seat secret, whatever language is asked for.
  const password = await get(host.port, '/gateway/login?lang=vi');
  assert.equal(password.status, 404);
});

test('I1: the password page: eight languages in the switch, the chosen one marked and remembered', async () => {
  noSettings();
  const door = await gatewayWith({});
  for (const lang of GATEWAY_LANGS) {
    const res = await get(door.port, `/gateway/login?lang=${lang}&next=%2Fx`, { 'accept-language': 'zh-CN' });
    assert.equal(res.status, 200, lang);
    assert.equal(htmlLang(res.body), lang === 'zh' ? 'zh-CN' : lang, lang);
    const links = [...res.body.matchAll(/<a( class="on" aria-current="true")? href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].filter((m) =>
      m[2].includes('lang='),
    );
    assert.deepEqual(
      links.map((m) => /lang=([a-z]+)/.exec(m[2])?.[1]),
      [...GATEWAY_LANGS],
      `${lang}: the switch lists every language once, in order`,
    );
    assert.deepEqual(
      links.filter((m) => m[1]).map((m) => /lang=([a-z]+)/.exec(m[2])?.[1]),
      [lang],
      `${lang}: exactly the current language is marked`,
    );
    // A fresh database serves the first-run setup page here; its switch never carried `next`.
    for (const link of links) assert.match(link[2], /^\/gateway\/login\?lang=[a-z]+$/, 'the switch stays on the sign-in door');
    const cookie = res.setCookie.find((c) => c.startsWith('dshpw_lang='));
    assert.ok(cookie, `${lang}: the explicit choice is remembered`);
    assert.match(cookie, new RegExp(`^dshpw_lang=${lang}; Path=/gateway; SameSite=Lax; Max-Age=31536000$`));
    if (lang !== 'zh') assert.doesNotMatch(visible(res.body).replace(/>中文</, '><'), HAN, `${lang}: Chinese text`);
  }
});

test('I1: a Traditional Chinese browser gets the next language it reads, or English, on every gate page', async () => {
  noSettings();
  const lane = await gatewayWith(LANE);
  const door = await gatewayWith({});
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW']) {
    for (const [port, page, label] of [[lane.port, '/gateway/tracy', 'lane'], [door.port, '/gateway/login', 'password']] as const) {
      const alone = await get(port, page, { 'accept-language': tag });
      assert.equal(alone.status, 200, `${label} ${tag}`);
      assert.equal(htmlLang(alone.body), 'en', `${label} ${tag}`);
      assert.doesNotMatch(visible(alone.body).replace(/>中文</, '><'), HAN, `${label} ${tag}: Simplified text`);
      const next = await get(port, page, { 'accept-language': `${tag}, fr;q=0.7` });
      assert.equal(htmlLang(next.body), 'fr', `${label} ${tag}, then French`);
    }
  }
  const simplified = await get(door.port, '/gateway/login', { 'accept-language': 'zh-CN' });
  assert.equal(htmlLang(simplified.body), 'zh-CN');
});

test('I1: the language switch wraps inside the card instead of running off a narrow screen', async () => {
  noSettings();
  const door = await gatewayWith({});
  const res = await get(door.port, '/gateway/login?lang=nl');
  const rule = /\.lang-switch\{([^}]*)\}/.exec(res.body)?.[1] ?? '';
  const declarations = Object.fromEntries(rule.split(';').filter(Boolean).map((d) => d.split(':').map((part) => part.trim())));
  assert.equal(declarations.display, 'flex');
  assert.equal(declarations['flex-wrap'], 'wrap', 'eight labels are wider than the card: they must wrap');
  // In the flow of the card, so the rows it wraps onto push the content down instead of covering it.
  assert.equal(declarations.position, undefined, 'the switch is laid out in the flow of the card');
  assert.doesNotMatch(rule, /nowrap|overflow/);
  assert.match(res.body, /<div class="card">\s*<div class="lang-switch">/, 'the switch is the first thing in the card');
  // A card taller than a phone screen scrolls; clipped, its top (the switch) could not be reached.
  const bodyRule = /\nbody\{([^}]*)\}/.exec(res.body)?.[1] ?? '';
  assert.match(bodyRule, /(?:^|;)min-height:100%/);
  assert.doesNotMatch(bodyRule, /overflow:hidden|(?:^|;)height:/);
});

test('I1: the password page remembers nothing that was not a valid explicit choice', async () => {
  noSettings();
  const door = await gatewayWith({});
  for (const query of ['', '?lang=xx', '?lang=', '?lang=vi&lang=de', '?lang=DE', '?lang=zh-TW']) {
    const res = await get(door.port, `/gateway/login${query}`, { 'accept-language': 'it' });
    assert.equal(res.status, 200, query);
    assert.equal(htmlLang(res.body), 'it', `${query}: the browser decides`);
    assert.equal(res.setCookie.some((c) => c.startsWith('dshpw_lang=')), false, `${query}: no language cookie`);
  }
  const remembered = await get(door.port, '/gateway/login', { 'accept-language': 'it', cookie: 'dshpw_lang=es' });
  assert.equal(htmlLang(remembered.body), 'es');
});

test('I1: a refusal keeps its status and speaks the reader’s language, with English for what is untranslated', async () => {
  noSettings();
  const door = await gatewayWith({});
  const banned = door.db.createUser('banned-user', '$2a$10$dummyhashdummyhashdummyhashdu');
  door.db.setPermissions(banned.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: [], disabledSessions: [], banned: true, sandboxMode: null,
  });
  const cookie = `dsh_gateway_token=${jwt.sign({ sub: String(banned.id), username: banned.username, cv: 0 }, JWT_SECRET, { expiresIn: '1h' })}`;
  for (const lang of NEW_LANGS) {
    const res = await get(door.port, '/api/anything', { cookie, 'accept-language': lang });
    assert.equal(res.status, 403, lang);
    assert.equal(htmlLang(res.body), lang, lang);
    assert.match(res.body, /This account has been banned by the owner/, lang);
    assert.doesNotMatch(res.body, HAN, lang);
  }
  const chinese = await get(door.port, '/api/anything', { cookie, 'accept-language': 'zh' });
  assert.equal(chinese.status, 403);
  assert.equal(htmlLang(chinese.body), 'zh-CN');
  assert.match(chinese.body, /账号已被主用户封禁/);
  const plain = await get(door.port, '/api/anything', { cookie });
  assert.equal(plain.status, 403);
  assert.equal(htmlLang(plain.body), 'en');
});
