/**
 * What the lane's code page says about a sign-in code's life (TCH #794, F-S1-005).
 *
 * The page said "The code works for one hour." The code is minted and checked by tracy-web, which
 * accepts it for ten minutes (`CODE_TTL_MS` in `apps/tracy-web/src/lib/policy.js`) and says so in
 * the mail that carries it. This gateway ships in its own image and cannot import that number, so
 * its page states no duration at all and points at the mail, which is written by the side that
 * enforces the lifetime.
 *
 * Checked here: the sentence in each of the eight gateway languages (no duration; no placeholder
 * left open), and that the code page prints that key. English and Chinese are written out in
 * `src/tracy/i18n/strings.ts`. No existing catalogue translates this sentence, so by the rule of
 * `src/tracy/i18n/locales/` the six catalogue languages hold no row for it and read in English (listed in
 * `scripts/test/fixtures/i18n-surface-provenance.json`). Not checked here: the page as a browser
 * draws it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GATEWAY_LANGS, t } from '../../src/tracy/i18n/index.js';


const KEY = 'tracy.codeValid';

/** Words for a stated duration, per language: hour, minute, and their plurals. */
const DURATION: Record<string, RegExp> = {
  en: /\b(?:hours?|minutes?)\b/i,
  vi: /giờ|phút|tiếng/i,
  de: /Stunde|Minute/i,
  it: /\b(?:ora|ore|minut[oi])\b/i,
  fr: /heure|minute/i,
  nl: /\b(?:uur|uren|minu(?:ut|ten))\b/i,
  zh: /小时|分钟/,
  es: /\b(?:horas?|minutos?)\b/i,
};

test('I3: the code page states no lifetime of its own, in any of the eight languages', () => {
  assert.deepEqual([...GATEWAY_LANGS].sort(), Object.keys(DURATION).sort());
  const english = t('en', KEY);
  for (const lang of GATEWAY_LANGS) {
    const said = t(lang, KEY);
    assert.notEqual(said, KEY, `${lang}: the key has no text`);
    assert.ok(said.trim().length > 0, `${lang}: empty`);
    assert.doesNotMatch(said, DURATION[lang]!, `${lang}: still states a duration: ${said}`);
    assert.doesNotMatch(said, /\d/, `${lang}: still prints a number: ${said}`);
    assert.doesNotMatch(said, /\{\w+\}/, `${lang}: an unfilled placeholder: ${said}`);
  }
  assert.notEqual(t('zh', KEY), english, 'zh: written out in full, never an English fallback');
});

test('I3: the six catalogue files hold no unsourced translation of it: those languages read the English sentence', () => {
  const english = t('en', KEY);
  for (const lang of ['vi', 'de', 'it', 'fr', 'nl', 'es'] as const) {
    const file = JSON.parse(readFileSync(new URL(`../../src/tracy/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
    assert.equal(Object.hasOwn(file, KEY), false, `${lang}.json carries ${KEY} without a catalogue source`);
    assert.equal(t(lang, KEY), english, `${lang}: does not fall back to the English sentence`);
  }
});

test('I3: the code page is where the sentence is printed', () => {
  // The Tracy door's pages live in src/tracy/door-pages.ts (hook H7), not in gateway.ts.
  const source = readFileSync(new URL('../../src/tracy/door-pages.ts', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function renderTracyCode('), source.indexOf('function renderTracyCode(') + 2500);
  assert.match(page, /<p class="foot">\$\{tr\('tracy\.codeValid'\)\}<\/p>/);
  assert.doesNotMatch(source, /one hour|一小时内有效/);
  assert.doesNotMatch(readFileSync(new URL('../../src/gateway.ts', import.meta.url), 'utf8'), /one hour|一小时内有效/);
});
