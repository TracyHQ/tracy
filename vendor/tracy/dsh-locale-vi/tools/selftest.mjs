/**
 * Self-test for the workflow's own machinery, run by `npm test`.
 *
 * The audit only earns trust if its detectors provably fire. Each case below
 * feeds a synthetic bundle or a mutated dictionary through the real code paths
 * and asserts on the finding, so a refactor that silently stops detecting a
 * reworded string fails here instead of shipping a stale translation.
 *
 * Usage: node tools/selftest.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compare, valid, parse } from './lib/semver.mjs'
import { extractEnglish, matchObject } from './lib/extract-en.mjs'
import { fingerprint, digest } from './lib/fingerprint.mjs'

let failures = 0
let checks = 0

/** Assert deep equality by JSON shape, reporting the first mismatch. */
function eq(actual, expected, what) {
  checks++
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) return
  failures++
  console.log(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`)
}

/** Assert a condition holds. */
function ok(condition, what) {
  checks++
  if (condition) return
  failures++
  console.log(`FAIL ${what}`)
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-locale-vi-selftest-'))

try {
  // ---- semver: the overlay rule depends on this ordering being right --------
  eq(compare('1.36.0', '1.17.1'), 1, 'semver: 1.36.0 > 1.17.1 (the dshmarket case)')
  eq(compare('1.17.1', '1.36.0'), -1, 'semver: reverse of the dshmarket case')
  eq(compare('2.0.4', '2.0.4'), 0, 'semver: equal versions')
  eq(compare('2.0.0', '10.0.0'), -1, 'semver: numeric, not lexical, release compare')
  eq(compare('0.1.2-alpha.1', '0.1.2'), -1, 'semver: prerelease sorts below its release')
  eq(compare('0.1.2', '0.1.2-alpha.1'), 1, 'semver: release sorts above its prerelease')
  eq(compare('0.1.2-alpha.1', '0.1.2-alpha.10'), -1, 'semver: numeric prerelease identifiers compare numerically')
  eq(compare('0.1.2-alpha', '0.1.2-alpha.1'), -1, 'semver: shorter prerelease list sorts lower')
  eq(compare('1.0.0-alpha', '1.0.0-beta'), -1, 'semver: alphanumeric prerelease compares lexically')
  eq(compare('1.0.0+build1', '1.0.0+build2'), 0, 'semver: build metadata is ignored')
  eq(compare('1.2.3', 'garbage'), undefined, 'semver: unparsable input yields undefined')
  eq(valid('1.2.3'), true, 'semver: valid accepts a release')
  eq(valid('garbage'), false, 'semver: valid rejects nonsense')
  eq(parse('v1.2.3')?.release, [1, 2, 3], 'semver: a leading v is tolerated')

  // ---- matchObject: brace inside copy must not end the literal -------------
  const tricky = 'x = { "a": "has } brace", "b": "ok" };'
  eq(
    JSON.parse(matchObject(tricky, tricky.indexOf('{'))),
    { a: 'has } brace', b: 'ok' },
    'matchObject: a brace inside a string does not terminate the literal',
  )
  const escaped = String.raw`x = { "a": "quote \" then } brace" };`
  ok(matchObject(escaped, escaped.indexOf('{')).endsWith('}'), 'matchObject: escaped quote does not break string tracking')

  // ---- extractEnglish: all three registration shapes the bundles use -------
  /** Write a synthetic bundle and return its path. */
  const bundle = (name, source) => {
    const dir = join(scratch, name, 'lib')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'client.js')
    writeFileSync(file, source, 'utf8')
    return file
  }

  const typedBundle = bundle('typed-pkg', `
    const LOCALE_NS = "typed";
    const en = { "greet": "Hello", "bye": "Goodbye" };
    const zh = { "greet": "你好", "bye": "再见" };
    ctx.locale.register(LOCALE_NS, { en, zh });
  `)
  const typed = extractEnglish([typedBundle], 'en')
  eq(typed.dicts, { typed: { bye: 'Goodbye', greet: 'Hello' } }, 'extract: typed register(NS, { en, zh })')
  eq(extractEnglish([typedBundle], 'zh').dicts.typed.greet, '你好', 'extract: the same bundle yields zh for the bilingual reference')

  const perLocaleBundle = bundle('perlocale-pkg', `
    const NS = "perlocale";
    ctx.locale.register(NS, "en", { "one": "One", "two": "Two {count}" });
    ctx.locale.register(NS, "zh", { "one": "一", "two": "二 {count}" });
  `)
  eq(
    extractEnglish([perLocaleBundle], 'en').dicts,
    { perlocale: { one: 'One', two: 'Two {count}' } },
    'extract: per-locale register(NS, "en", { ... })',
  )

  const tableBundle = bundle('table-pkg', `
    const LOCALE_NS = "tabled";
    for (const [locale, dict] of [["en", { "k": "English" }], ["zh", { "k": "中文" }]]) {
      ctx.locale.register(LOCALE_NS, locale, dict);
    }
  `)
  eq(extractEnglish([tableBundle], 'en').dicts, { tabled: { k: 'English' } }, 'extract: table form keyed by LOCALE_NS')

  const ownerBundle = extractEnglish([typedBundle, perLocaleBundle], 'en')
  eq(ownerBundle.owners.typed, 'typed-pkg', 'extract: owner package is reported per namespace')
  eq(ownerBundle.owners.perlocale, 'perlocale-pkg', 'extract: owners are tracked across bundles')

  const noLocale = bundle('plain-pkg', 'const x = 1; export { x };')
  eq(extractEnglish([noLocale], 'en').dicts, {}, 'extract: a bundle without locale.register contributes nothing')

  // ---- fingerprint: the reworded detector rests on this --------------------
  const before = fingerprint({ ns: { key: 'Ongoing Goal' } })
  const after = fingerprint({ ns: { key: 'Goal in progress' } })
  ok(before.ns.key !== after.ns.key, 'fingerprint: rewording a string changes its digest')
  eq(fingerprint({ ns: { key: 'Ongoing Goal' } }), before, 'fingerprint: identical text yields an identical digest')
  eq(digest('x').length, 16, 'fingerprint: digest is truncated to 16 hex characters')
  ok(!JSON.stringify(before).includes('Ongoing'), 'fingerprint: the baseline carries no upstream copy')
  eq(
    Object.keys(fingerprint({ ns: { b: 'B', a: 'A' } }).ns),
    ['a', 'b'],
    'fingerprint: keys are sorted so the committed baseline diffs cleanly',
  )
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exitCode = failures > 0 ? 1 : 0
