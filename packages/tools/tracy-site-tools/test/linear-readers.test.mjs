/**
 * The readers rewritten for the release's CodeQL run (ReDoS and sanitising): each still answers what
 * its old pattern answered on ordinary text — the old pattern is kept here as the oracle, compared on
 * fixed cases and on random text — and answers the old pathological input at once. A slow reader
 * holds the one dsh event loop every site on the host shares.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runsInterpreter } from '../src/host/build-fence.mjs'
import { withoutTrailingSlashes } from '../src/host/chat-design-route.mjs'
import { ROLES_JS, ROLES_PHP } from '../src/host/ds-slot-worn.mjs'
import { withoutComments } from '../src/host/html-units.mjs'
import { cssDeclarations } from '../src/host/look-set.mjs'
import { jsonLdNodes } from '../src/host/page-head.mjs'
import { storedSpellings } from '../src/host/rendered-words.mjs'
import { stripTags } from '../src/host/replace-wordpress.mjs'
import { lastWord, readablePage, toolNotFound, unlistedKind } from '../src/host/site.mjs'
import { shellConsequence } from '../src/host/shell-writes.mjs'
import { relink } from '../src/host/sweep-resolve.mjs'

/** Milliseconds `fn` takes. @param {() => unknown} fn */
const timed = (fn) => {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

/**
 * Asserts `run` grows linearly: twice the input takes about twice the time (best of five each), never the
 * four times a quadratic reader takes, and the larger input still answers at once.
 * @param {string} label @param {(n: number) => unknown} run @param {number} n
 */
const assertLinear = (label, run, n) => {
  const best = (/** @type {number} */ k) => Math.min(...Array.from({ length: 5 }, () => timed(() => run(k))))
  const one = best(n)
  const two = best(2 * n)
  assert.ok(two < 2.8 * one + 3, `${label}: ${one.toFixed(1)} ms at n, ${two.toFixed(1)} ms at 2n`)
  assert.ok(two < 300, `${label}: ${two.toFixed(1)} ms at 2n`)
}

/** A deterministic random text of `n` pieces drawn from `alphabet`. @param {string[]} alphabet @param {number} seed */
function* texts(alphabet, seed, count = 3000, n = 12) {
  let x = seed
  const next = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x
  }
  for (let i = 0; i < count; i += 1) {
    let s = ''
    for (let k = next() % n; k > 0; k -= 1) s += alphabet[next() % alphabet.length]
    yield s
  }
}

test('toolNotFound, unlistedKind and lastWord answer what their patterns answered', () => {
  const oldTool = (/** @type {string} */ s) => /tool .* not found/i.test(s)
  const oldKind = (/** @type {string} */ s) =>
    /content\.list serves kinds? [^;]*; "([^"]*)" is not listed/.exec(s)?.[1] ?? null
  const oldLast = (/** @type {string} */ s) => /(\S+)$/.exec(s)?.[1] ?? null
  for (const s of [
    'MCP error -32602: tool content_lst not found',
    'Tool "x" NOT FOUND',
    'tool not found',
    'tool  not found',
    'tool x\nnot found',
    'the tool x is gone; not found'
  ])
    assert.equal(toolNotFound(s), oldTool(s), s)
  for (const s of [
    'content.list serves kind "post" only; "page" is not listed',
    'content.list serves kinds "post", "templatePart" and "template"; "menu" is not listed',
    'content.list serves kinds "post"; "" is not listed',
    'content.list serves kind "post"; x; "page" is not listed',
    'content.list serves kind a; content.list serves kind b; "c" is not listed'
  ])
    assert.equal(unlistedKind(s), oldKind(s), s)
  for (const s of ['No fr edition of hero.title', 'ends in a space ', '', 'one', 'a\tb!'])
    assert.equal(lastWord(s), oldLast(s), s)
  const pieces = [
    'tool ',
    'TOOL',
    ' not found',
    '\n',
    'x',
    ' ',
    'content.list serves kind',
    's',
    ' ',
    ';',
    ' "',
    '"',
    ' is not listed',
    'k'
  ]
  for (const s of texts(pieces, 7)) {
    assert.equal(toolNotFound(s), oldTool(s), JSON.stringify(s))
    assert.equal(unlistedKind(s), oldKind(s), JSON.stringify(s))
    assert.equal(lastWord(s), oldLast(s), JSON.stringify(s))
  }
})

test('🔒 a site message that repeats its start is read at once', () => {
  assertLinear('toolNotFound', (n) => toolNotFound('tool '.repeat(n)), 40_000)
  assertLinear(
    'unlistedKind',
    (n) => unlistedKind(`${'content.list serves kind '.repeat(n)}; "x" bad`),
    32_000
  )
  assertLinear('unlistedKind, no `;`', (n) => unlistedKind('content.list serves kind '.repeat(n)), 32_000)
  assertLinear('lastWord', (n) => lastWord(`${'!'.repeat(n)} `), 100_000)
})

test('withoutTrailingSlashes drops what `/\\/+$/` dropped, at once on a run of slashes', () => {
  for (const s of ['https://a.test/', 'https://a.test///', 'https://a.test', '/', '', 'a/b'])
    assert.equal(withoutTrailingSlashes(s), s.replace(/\/+$/, ''), s)
  assertLinear('withoutTrailingSlashes', (n) => withoutTrailingSlashes(`${'/'.repeat(n)}x`), 100_000)
})

test('withoutComments removes what the comment patterns removed, at once on unclosed comments', () => {
  const oldAll = (/** @type {string} */ s) => s.replace(/<!--[\s\S]*?-->/g, '')
  const oldNotes = (/** @type {string} */ s) => s.replace(/\n?<!--(?!\s*\/?wp:)[\s\S]*?-->/g, '')
  const WP = /\s*\/?wp:/y
  const keep = (/** @type {string} */ html, /** @type {number} */ at) => {
    WP.lastIndex = at + 4
    return WP.test(html)
  }
  const notes = (/** @type {string} */ s) => withoutComments(s, { keep, newlineBefore: true })
  assert.equal(
    notes('<!-- wp:group -->\n<!-- one more group per item -->\n<p>x</p>\n<!-- /wp:group -->'),
    '<!-- wp:group -->\n<p>x</p>\n<!-- /wp:group -->'
  )
  for (const s of texts(['<!--', '-->', '\n', ' ', 'wp:', '/', 'x', '<!-->', '-'], 11, 6000, 14)) {
    assert.equal(withoutComments(s), oldAll(s), JSON.stringify(s))
    assert.equal(notes(s), oldNotes(s), JSON.stringify(s))
  }
  assertLinear('withoutComments', (n) => withoutComments('<!--'.repeat(n)), 50_000)
  assertLinear('withoutComments, notes', (n) => notes('\n<!--'.repeat(n)), 50_000)
  // a page of them stays readable at once too
  assertLinear('readablePage', (n) => readablePage(`<p>a</p>${'<!--'.repeat(n)}`), 25_000)
  assert.equal(readablePage('<p>Hel<!-- x -->lo</p>').text, 'Hello')
})

test('runsInterpreter reads what INTERPRETER read, at once on a run of flags', () => {
  const OLD =
    /(?:^|[\s;&|(])(?:python3?|php|node|perl|ruby)(?=[\s;&|)]|$)|\bwp\s+(?:--?[\w-]+(?:=\S+)?\s+)*eval(?:-file)?\b/m
  for (const s of [
    'wp eval "echo 1;"',
    'wp --path=/var/www/html --allow-root eval-file x.php',
    'wp --path=/var/wp eval x',
    'wp option get blogname',
    'cd x && python3 - <<EOF',
    'nodejs x.js',
    'wp -x= eval'
  ])
    assert.equal(runsInterpreter(s), OLD.test(s), s)
  for (const s of texts(
    ['wp', ' ', '\t', '-', '--', 'x', '=', '=/a', 'eval', '-file', '\n', ';', 'php', '-wp'],
    3,
    8000,
    12
  ))
    assert.equal(runsInterpreter(s), OLD.test(s), JSON.stringify(s))
  assertLinear('runsInterpreter, flags', (n) => runsInterpreter(`wp ${'--\t-'.repeat(n)}`), 5_000)
  assertLinear('runsInterpreter, wp in flags', (n) => runsInterpreter(`wp ${'-wp '.repeat(n)}x`), 20_000)
})

test('the shell rules answer what their patterns answered, in linear time on runs of flags and clients', () => {
  const WP = String.raw`\bwp\s+(?:--?[\w-]+(?:=\S+)?\s+)*`
  const OLD_RULES = [
    new RegExp(
      `${WP}(?:post|term|comment|user|menu|media|widget|sidebar)(?:\\s+(?:item|meta))?\\s+delete\\b`
    ),
    new RegExp(`${WP}site\\s+(?:empty|delete)\\b`),
    new RegExp(`${WP}post\\s+update\\b[^\\n;&|]*--post_status=["']?(?:draft|pending|private|trash)\\b`),
    new RegExp(`${WP}search-replace\\b(?![^\\n;&|]*--dry-run)`),
    new RegExp(`${WP}db\\s+(?:reset|drop|import|clean)\\b`),
    new RegExp(
      `${WP}(?:plugin|theme)\\s+(?:install|activate|deactivate|delete|uninstall|update|toggle|enable|disable)\\b`
    ),
    new RegExp(`${WP}core\\s+(?:update|update-db|download)\\b`),
    new RegExp(`${WP}option\\s+(?:update|delete|add|set|patch)\\b`),
    /\bjoomla\.php\b[^\n;&|]*\b(?:extension:(?:install|remove|discover:install)|core:update|database:import|user:delete|config:set|site:down)\b/
  ]
  const DB_CLIENT = new RegExp(String.raw`\b(?:mysql|mariadb|sqlite3|psql)\b|${WP}db\s+query\b`)
  const SQL_WRITE =
    /\b(?:update\s+[`"\w.]+\s+set\b|delete\s+from\b|drop\s+(?:table|database|schema)\b|truncate\s+(?:table\s+)?[`"\w]|alter\s+table\b|insert\s+(?:ignore\s+)?into\b|replace\s+into\b)/i
  const SQL_IMPORT = /\b(?:mysql|mariadb|sqlite3|psql)\b[^\n;&|]*<\s*\S/
  /** The old reading: `database` for SQL, else the index of the first rule a part matches. @param {string} command */
  const old = (command) => {
    if (DB_CLIENT.test(command) && (SQL_WRITE.test(command) || SQL_IMPORT.test(command))) return 'sql'
    for (const part of command.split(/\n|;|&&|\|\||\|/))
      for (const [i, re] of OLD_RULES.entries()) if (re.test(part)) return i
    return null
  }
  const sentences = [
    'This deletes something from your site, with no undo.',
    "This empties your site's content, with no undo.",
    "This takes something off your site's pages.",
    'This changes words in many places on your site at once, with no undo.',
    "This replaces or empties your site's database, with no undo.",
    'This installs or switches something your site runs.',
    'This upgrades the software your site runs on.',
    "This changes your site's settings on every page.",
    'This changes how your site runs, with no undo.'
  ]
  /** @param {string} command */
  const now = (command) => {
    const found = shellConsequence('bash', { command })
    if (found === null) return null
    return found.sentence.includes('database directly') ? 'sql' : sentences.indexOf(found.sentence)
  }
  for (const command of [
    'wp --path=/var/www --allow-root option update blogname x',
    'wp option get blogname',
    'wp post update 12 --post_status=draft',
    'wp post update 12 --post_title=x & echo --post_status=draft',
    'wp search-replace a b --dry-run',
    'wp search-replace a b',
    'wp search-replace a b & --dry-run',
    'wp db query "DELETE FROM wp_posts"',
    'mysql site < dump.sql',
    'mysql site; cat < x',
    'php joomla.php extension:install --path=x',
    'wp post meta delete 3 k',
    'wp plugin install x && wp core update'
  ])
    assert.equal(now(command), old(command), command)
  const pieces = [
    'wp',
    ' ',
    '-',
    '--path=/x',
    '-wp',
    'post',
    'update',
    'delete',
    'meta',
    '--post_status=draft',
    'search-replace',
    '--dry-run',
    '&',
    ';',
    '\n',
    '|',
    'db',
    'query',
    'mysql',
    '<',
    'x',
    'joomla.php',
    'extension:install',
    'option',
    'add',
    'set'
  ]
  for (const command of texts(pieces, 5, 20000, 10))
    if (command.trim() !== '') assert.equal(now(command), old(command), JSON.stringify(command))

  assert.equal(
    shellConsequence('bash', { command: 'wp --path=/var/www --allow-root option update blogname x' })
      ?.command,
    'wp --path=/var/www --allow-root option update blogname x'
  )
  assert.equal(shellConsequence('bash', { command: 'wp option get blogname' }), null)
  const shell = (/** @type {string} */ command) => shellConsequence('bash', { command })
  assertLinear('shell, flags', (n) => shell(`wp ${'--\t-'.repeat(n)}`), 5_000)
  assertLinear('shell, wp in flags', (n) => shell(`wp ${'-wp '.repeat(n)}x`), 4_000)
  assertLinear('shell, many commands', (n) => shell(`${'wp post update 1 '.repeat(n)}x`), 4_000)
  assertLinear(
    'shell, many search-replace',
    (n) => shell(`${'wp search-replace a b --dry-run '.repeat(n)}x`),
    4_000
  )
  assertLinear('shell, many joomla', (n) => shell(`${'joomla.php '.repeat(n)}x`), 4_000)
  assertLinear('shell, many clients', (n) => shell(`${'mysql '.repeat(n)}update t set a=1`), 4_000)
})

test('unescape reads an attribute address once: `&amp;quot;` stays `&quot;`', () => {
  const html = '<a href="/a?x=1&amp;y=2">A</a><a href="/q&amp;quot;">B</a>'
  assert.equal(relink(html, '/a?x=1&y=2', '/b').count, 1)
  assert.equal(relink(html, '/q"', '/b').count, 0)
  assert.equal(relink(html, '/q&quot;', '/b').count, 1)
  assert.equal(relink('<a href="/it&#039;s&#38;">C</a>', "/it's&", '/b').count, 1)
})

test('stripTags removes tags as before and never joins the pieces into a new tag', () => {
  const old = (/** @type {string} */ s) => s.replace(/<[^>]*>/g, '')
  for (const s of ['<p>Hello <b>world</b></p>', 'a &lt; b', '<br/>x', '', 'a > b', '<a href="/x">x</a>'])
    assert.equal(stripTags(s), old(s), s)
  // a `<` that opens no tag reads as `<` either way
  assert.equal(stripTags('x<y'), 'x&lt;y')
  // the old reader left `<script` bare when no `>` followed, and the text written beside it may bring one
  assert.equal(stripTags('<b>x</b><script'), 'x&lt;script')
  assert.doesNotMatch(`${stripTags('<b>x</b><script')} a > b`, /<script/i)
})

test('cssDeclarations reads properties after comments, at once on a run of comment ends', () => {
  const [d] = cssDeclarations('a { /* note */ color: red; }')
  assert.equal(d?.name, 'color')
  assert.equal(d?.value, 'red')
  assert.ok(timed(() => cssDeclarations(`a { /*${'*//*'.repeat(40)} }`)) < 200)
})

test('a JSON-LD block wrapped in a comment closed by `--!>` still parses', () => {
  const read = (/** @type {string} */ text) =>
    jsonLdNodes(/** @type {any} */ ({ ld: [{ text, cut: false }] }))
  assert.equal(read('<!--{"@type":"Organization"}-->').nodes.length, 1)
  assert.equal(read('<!--{"@type":"Organization"}--!>').nodes.length, 1)
})

test('storedSpellings escapes a backslash before the slashes it escapes', () => {
  assert.deepEqual(storedSpellings('/a/b'), ['/a/b', '\\/a\\/b'])
  assert.ok(storedSpellings('/a\\b').includes(JSON.stringify('/a\\b').slice(1, -1).replace(/\//g, '\\/')))
})

test('🔒 the role scripts carry their patterns with no bare `<`, `>` or `/` inside a string', () => {
  /** The double-quoted literals of `code`. @param {string} code */
  const literals = (code) => [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
  /** PHP's and node's reading of the escapes `codeString` writes. @param {string} body */
  const read = (body) =>
    JSON.parse(
      `"${body.replace(/\\x([0-9A-F]{2})/g, (_, h) => `\\u00${h}`).replace(/\\u\{(\w+)\}/g, (_, h) => `\\u${h}`)}"`
    )
  for (const code of [ROLES_PHP, ROLES_JS]) {
    const long = literals(code).filter((body) => body.length > 40)
    assert.ok(long.length >= 3)
    for (const body of long) {
      assert.doesNotMatch(body, /[<>]/)
      assert.ok(typeof read(body) === 'string')
    }
  }
  assert.ok(literals(ROLES_JS).some((body) => read(body).startsWith('(?<=')))
})
