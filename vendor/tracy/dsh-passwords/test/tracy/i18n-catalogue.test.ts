// The merged gateway dictionary of the Tracy layer (`src/tracy/i18n`): upstream's zh/en strings,
// plus the 33 keys Tracy adds, plus the values Tracy rebrands, in eight languages. I1 counts the
// keys and the catalogue rows; I2 (no test in the 2.6.6 fork) pins the rebranded wording, on the
// gateway pages and in the settings card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t as upstreamT } from '../../src/i18n.js';
// Upstream's card, untouched: src/client/locales.ts now lays Tracy's tables over itself on import.
import { en as upstreamClientEn, zh as upstreamClientZh } from '../../.upstream-pristine/src/client/locales.js';
import { en as cardEn, zh as cardZh } from '../../src/client/locales.js';
import {
  CLIENT_BRAND,
  CLIENT_KEPT_TERMS,
  CLIENT_STRINGS,
  CATALOGUES,
  GATEWAY_LANGS,
  TRACY_STRINGS,
  gatewayPageKeys,
  gatewayStrings,
  resolveGatewayLang,
  t,
} from '../../src/tracy/i18n/index.js';
import { upstreamDictKeys } from './upstream-strings.js';

const SIX = ['vi', 'de', 'it', 'fr', 'nl', 'es'] as const;

/** The keys whose value Tracy rewrites from "dsh"/"DeepSeek Harness" to "Tracy". */
const REBRANDED = {
  zh: [
    'err.NOT_CONFIGURED', 'gw.titleLogin', 'gw.loginTitle', 'gw.titleSetup', 'gw.upstreamDown',
    'cli.noDshRoot', 'cli.dshDir', 'cli.bindAll', 'cli.restartFailed', 'cli.patchApplied',
    'cli.patchTargetMissing', 'cli.dshRootMissing', 'cli.watchParent', 'cli.parentGone',
  ],
  en: [
    'err.NOT_CONFIGURED', 'gw.titleLogin', 'gw.loginTitle', 'gw.titleSetup', 'gw.upstreamDown',
    'cli.noDshRoot', 'cli.dshDir', 'cli.bindAll', 'cli.restartFailed', 'cli.patchApplied',
    'cli.patchTargetMissing', 'cli.watchParent', 'cli.parentGone',
  ],
} as const;

test('I1: zh and en each hold upstream’s 109 keys plus the 33 Tracy adds — 142, none dropped', () => {
  for (const lang of ['zh', 'en'] as const) {
    const upstream = upstreamDictKeys(lang);
    assert.equal(upstream.length, 109, `${lang}: upstream 2.7.7 key count`);
    const added = Object.keys(TRACY_STRINGS[lang]).filter((key) => !upstream.includes(key));
    assert.equal(added.length, 33, `${lang}: Tracy keys`);
    assert.deepEqual(added.filter((key) => !key.startsWith('tracy.')), ['gw.loginTooFrequent']);
    const table = gatewayStrings(upstream)[lang];
    assert.equal(Object.keys(table).length, 142, `${lang}: merged key count`);
    for (const [key, value] of Object.entries(table)) {
      assert.notEqual(value.trim(), '', `${lang} ${key}`);
      assert.notEqual(value, key, `${lang} ${key} reads as its own key`);
    }
    assert.equal(table['gw.noSsh'], upstreamT(lang, 'gw.noSsh'), 'an upstream key Tracy does not touch keeps its text');
  }
});

test('I1: all eight languages answer every one of the 142 keys, the six through English where they lack one', () => {
  const merged = gatewayStrings(upstreamDictKeys('en'));
  assert.deepEqual(Object.keys(merged).sort(), [...GATEWAY_LANGS].sort());
  for (const lang of GATEWAY_LANGS) {
    assert.equal(Object.keys(merged[lang]).length, 142, lang);
    for (const [key, value] of Object.entries(merged[lang])) assert.equal(value, t(lang, key), `${lang} ${key}`);
  }
  for (const lang of SIX) {
    assert.equal(Object.keys(CATALOGUES[lang]).length, 49, `${lang}.json rows`);
    for (const key of Object.keys(CATALOGUES[lang])) assert.ok(key in merged.en, `${lang}.json: ${key} is not an English key`);
  }
});

test('I1: the page keys are err/gw/tracy keys of the merged English table, never the CLI’s', () => {
  const keys = gatewayPageKeys(upstreamDictKeys('en'));
  assert.ok(keys.includes('tracy.codeValid') && keys.includes('gw.noSsh') && keys.includes('err.NOT_CONFIGURED'));
  assert.equal(keys.some((key) => key.startsWith('cli.')), false);
  assert.equal(new Set(keys).size, keys.length);
});

test('I2: the rebranded gateway strings name Tracy, never dsh or DeepSeek Harness', () => {
  for (const lang of ['zh', 'en'] as const) {
    assert.equal(REBRANDED[lang].length, lang === 'zh' ? 14 : 13);
    for (const key of REBRANDED[lang]) {
      const said = t(lang, key);
      assert.match(said, /Tracy/, `${lang} ${key}: ${said}`);
      assert.doesNotMatch(said.replace(/dsh-passwords|MCP_DSH_ROOT|@deepseek-ai\/dsh/g, ''), /\bdsh\b|DeepSeek Harness/, `${lang} ${key}: ${said}`);
      assert.notEqual(said, upstreamT(lang, key), `${lang} ${key}: still upstream's wording`);
    }
  }
  // Keys Tracy does not rebrand keep upstream's text, in both languages.
  assert.equal(t('zh', 'gw.banned'), upstreamT('zh', 'gw.banned'));
  assert.equal(t('en', 'cli.dshRootMissing'), upstreamT('en', 'cli.dshRootMissing'));
});

test('I2: the settings card names Tracy where it named dsh, on keys upstream still has', () => {
  const upstream = { zh: upstreamClientZh as Record<string, string>, en: upstreamClientEn as Record<string, string> };
  assert.deepEqual(Object.keys(CLIENT_BRAND.zh).sort(), ['err.NOT_CONFIGURED', 'permsAgentPresetsUnavailable', 'sandboxNone', 'sectionDesc']);
  assert.deepEqual(Object.keys(CLIENT_BRAND.en).sort(), Object.keys(CLIENT_BRAND.zh).sort());
  for (const lang of ['zh', 'en'] as const) {
    for (const [key, value] of Object.entries(CLIENT_BRAND[lang])) {
      assert.ok(Object.hasOwn(upstream[lang], key), `${lang} ${key}: not a key of upstream's card`);
      assert.match(value, /Tracy/);
      assert.notEqual(value, upstream[lang][key]);
    }
  }
});

test('kept terms: the Chinese card keeps the English terms, only on keys upstream has, and differs from it', () => {
  const upstream = upstreamClientZh as Record<string, string>;
  assert.ok(Object.keys(CLIENT_KEPT_TERMS.zh).length > 0);
  for (const [key, value] of Object.entries(CLIENT_KEPT_TERMS.zh)) {
    assert.ok(Object.hasOwn(upstream, key), `zh ${key}: not a key of upstream's card`);
    assert.notEqual(value, upstream[key], `zh ${key}: same as upstream, nothing to lay over`);
    assert.match(value, /[A-Za-z]/, `zh ${key}: keeps no English term`);
  }
});

test('the card reads the Tracy tables over the upstream ones, the Tracy name winning where both have a key', () => {
  const zh = cardZh as Record<string, string>;
  const en = cardEn as Record<string, string>;
  for (const [key, value] of Object.entries(CLIENT_STRINGS.zh)) assert.equal(zh[key], value, `zh ${key}`);
  for (const [key, value] of Object.entries(CLIENT_STRINGS.en)) assert.equal(en[key], value, `en ${key}`);
  for (const [key, value] of Object.entries(CLIENT_BRAND.zh)) assert.equal(zh[key], value, `zh ${key}: the Tracy name`);
  // A key Tracy leaves alone still reads upstream's text.
  const untouched = Object.keys(upstreamClientZh).find((key) => !Object.hasOwn(CLIENT_STRINGS.zh, key));
  assert.ok(untouched);
  assert.equal(zh[untouched], (upstreamClientZh as Record<string, string>)[untouched]);
});

test('I1: a settings.yaml renamed by dsh 0.1.7 (settings.yaml.imported) is still read, as upstream does', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-imported-'));
  const saved = { file: process.env.MCP_DSH_SETTINGS_FILE, home: process.env.DSH_HOME };
  try {
    delete process.env.MCP_DSH_SETTINGS_FILE;
    process.env.DSH_HOME = dir;
    writeFileSync(path.join(dir, 'settings.yaml.imported'), 'locale:\n  preference: fr\n');
    assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'fr');
    // A second home (the preference is cached per list of files): both files, the live one wins.
    const both = path.join(dir, 'both');
    mkdirSync(both);
    writeFileSync(path.join(both, 'settings.yaml'), 'locale:\n  preference: nl\n');
    writeFileSync(path.join(both, 'settings.yaml.imported'), 'locale:\n  preference: fr\n');
    process.env.DSH_HOME = both;
    assert.equal(resolveGatewayLang({ acceptLanguage: 'es' }), 'nl', 'settings.yaml wins over the imported copy');
  } finally {
    if (saved.file === undefined) delete process.env.MCP_DSH_SETTINGS_FILE;
    else process.env.MCP_DSH_SETTINGS_FILE = saved.file;
    if (saved.home === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = saved.home;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('I2: every answer the plugin writes to a browser names Tracy, never dsh (as the 2.6.6 fork)', () => {
  // `apply()` needs a running dsh context; the answers are literals, so the source is the seam.
  const source = readFileSync(new URL('../../src/plugin.ts', import.meta.url), 'utf8');
  const answers = [...source.matchAll(/\b(?:error|message): (['`])((?:(?!\1).)*)\1/g)].map((m) => m[2]!);
  assert.ok(answers.length > 10, 'the plugin answers were found');
  const rebranded = answers.filter((said) => /Tracy/.test(said));
  assert.deepEqual(rebranded, [
    '未配置：请先完成 dsh-passwords 部署（.env 中 SETUP_KEY 等），再重启 Tracy',
    '补丁重载中：Tracy 网页服务即将重启（约 3-5 秒）',
  ]);
  for (const said of answers) {
    assert.doesNotMatch(said.replace(/dsh-passwords/g, ''), /\bdsh\b|DeepSeek Harness/i, said);
  }
});

// The proxy's refusal pages (gw.* keys proxy.ts renders) read in every language, and keep the
// terms Tracy never translates in any language (Brian 05/10/2026: folder, upload, sandbox, workspace).
const PROXY_KEYS = ['gw.bodyTooLarge', 'gw.folderDenied', 'gw.noUpload', 'gw.sandboxDenied', 'gw.upstreamDown', 'gw.workspaceDenied'];
const KEPT: Record<string, string[]> = {
  'gw.folderDenied': ['folder'],
  'gw.noUpload': ['upload'],
  'gw.sandboxDenied': ['sandbox'],
  'gw.workspaceDenied': ['workspace'],
};

test('I1: the proxy refusal pages read in each of the six, never falling back to English', () => {
  for (const lang of SIX) {
    for (const key of PROXY_KEYS) {
      assert.ok(key in CATALOGUES[lang], `${lang}.json lacks ${key}`);
      assert.notEqual(t(lang, key), t('en', key), `${lang} ${key} reads in English`);
    }
  }
});

test('I1: a proxy refusal keeps folder, upload, sandbox and workspace verbatim in all eight languages', () => {
  for (const lang of GATEWAY_LANGS) {
    for (const [key, terms] of Object.entries(KEPT)) {
      for (const term of terms) assert.match(t(lang, key), new RegExp(term, 'i'), `${lang} ${key} lost "${term}"`);
    }
  }
});

// Measured 07/10 in the desktop app: a `dshpw_lang=de` cookie (a language picked once on the
// switch) drew the password page with German field labels under an English heading, subtitle and
// placeholders — the catalogue held only the four words it had copied, the rest fell back.
const LOGIN_KEYS = [
  'gw.titleLogin', 'gw.loginTitle', 'gw.loginSub1', 'gw.loginSub2', 'gw.username', 'gw.password',
  'gw.usernamePlaceholder', 'gw.passwordPlaceholder', 'gw.login', 'gw.loggingIn', 'gw.dbHint',
  // What the same page says when a sign-in fails or its form expired.
  'gw.loginFailed', 'gw.csrfFailed',
];

test('I1: the password sign-in page reads in each of the six, never falling back to English', () => {
  for (const lang of SIX) {
    for (const key of LOGIN_KEYS) {
      assert.ok(key in CATALOGUES[lang], `${lang}.json lacks ${key}`);
      // Italian says "Password" too: the row exists, it just is the same word.
      if (lang === 'it' && key === 'gw.password') continue;
      assert.notEqual(t(lang, key), t('en', key), `${lang} ${key} reads in English`);
    }
    for (const key of ['gw.titleLogin', 'gw.loginTitle']) assert.match(t(lang, key), /Tracy Cowork/, `${lang} ${key}`);
    assert.match(t(lang, 'gw.loginSub1'), /dsh-passwords/, `${lang} gw.loginSub1 keeps the gateway's name as English does`);
  }
});
