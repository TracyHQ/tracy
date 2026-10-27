// Issue #80 — the mainbody skip guard is read from PHP tokens: the supported guard must be the only `return` of
// the file. One fixture per form that used to be taken for a skip rule (scripts/test/fixtures/issue80/).
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { readT3Layout } from '../ingest/joomla-layout.mjs'
import { analyzeSkipGuard } from '../ingest/joomla-php-tokens.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FIX = join(here, 'fixtures', 'issue80')
const T3 = join(here, 'fixtures', 'issue67', 't3')
const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
const tmp = (prefix) => {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})

const memReader = (files) => ({ read: (rel) => (Object.hasOwn(files, rel) ? { path: `capture/${rel}`, text: files[rel] } : null) })
const read = (mainbody) =>
  readT3Layout(memReader({ 'etc/layout/x.ini': '[a]\nposition="a"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>", 'tpls/blocks/mainbody.php': mainbody }), 'x')
const GAP = /tpls\/blocks\/mainbody\.php has a return guard or mentions skip_component_content/
const FORMS = {
  'a second conditional return': 'second-guard.php',
  'a bare return': 'bare-return.php',
  'a return in a nested block': 'nested-return.php',
  'a return after comment, string and heredoc decoys': 'decoys-then-return.php'
}
const GUARD = readFileSync(join(FIX, 'bare-return.php'), 'utf8').split('\n')[1]

for (const [label, file] of Object.entries(FORMS)) {
  test(`skip guard: ${label} is not a skip rule; the body is kept and a gap names mainbody.php`, () => {
    const t3 = read(readFileSync(join(FIX, file), 'utf8'))
    assert.equal(t3.skipRule, false)
    assert.ok(t3.gaps.some((g) => GAP.test(g)), JSON.stringify(t3.gaps))
    assert.ok(t3.order.some((o) => o.kind === 'component'), 'the component stays drawn')
  })

  test(`skip guard (adapter): ${label} keeps the article body of a listed menu item`, () => {
    const dir = tmp('i80-t3-')
    cpSync(T3, dir, { recursive: true })
    cpSync(join(FIX, file), join(dir, 'capture', 'templates', 'ja_t3', 'tpls', 'blocks', 'mainbody.php'))
    const out = join(tmp('i80-out-'), 'pack')
    buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
    const content = JSON.parse(readFileSync(join(out, 'content.json'), 'utf8'))
    const skipped = content.pages.find((p) => p.file === 'skipped.html')
    assert.equal(skipped.droppedContent ?? null, null)
    assert.match(skipped.contentMarkup, /Skipped body text/)
    const cov = JSON.parse(readFileSync(join(out, 'adapter-coverage.json'), 'utf8'))
    assert.match(JSON.stringify(cov), /mainbody\.php has a return guard/)
  })
}

test('skip guard: the supported guard alone is a skip rule, with whitespace, comments and decoy text around it', () => {
  const ok = (src, label) => {
    const t3 = read(src)
    assert.equal(t3.skipRule, true, label)
    assert.ok(!t3.gaps.some((g) => GAP.test(g)), label)
  }
  ok(`<?php\n${GUARD}\n?>\n<jdoc:include type="component" />`, 'guard then body')
  ok(`\n<?php defined('_JEXEC') or die; /* return */ ${GUARD} // return\n$s = "return"; ?>return <jdoc:include type="component" />`, 'decoys that are not returns')
  ok(`<?php\n${GUARD.replace(/ && /g, '\n  &&\n\t')}\n?>x`, 'whitespace between clauses')
})

test('skip guard: altered, reordered, duplicated or else-carrying guards are unknown', () => {
  const no = (src, label) => assert.equal(read(src).skipRule, false, label)
  no(`<?php ${GUARD.replace('com_config', 'com_x')} ?>`, 'altered literal')
  no(`<?php ${GUARD}\n${GUARD} ?>`, 'the guard twice')
  no(`<?php ${GUARD.replace('return;', 'return; else echo 1;')} ?>`, 'else after the guard')
  no(`<?php echo 1; ${GUARD} ?>`, 'guard not first')
  no(`<?php if ($a) { ${GUARD} } ?>`, 'guard inside a block')
  no(`<?php ${GUARD} ?><p>x</p><?php return; ?>`, 'return after a PHP close and reopen')
  no(`<?php ${GUARD} function f() { return 1; }`, 'return inside a function')
})

test('skip guard: malformed PHP never establishes a skip rule', () => {
  const never = (src, label) => assert.equal(analyzeSkipGuard(src, () => true).skip, false, label)
  never('', 'empty')
  never(`<?php if ($a) return; "unterminated`, 'unterminated string')
  never(`<?php if ($a) return; /* unterminated`, 'unterminated comment')
  never(`<?php if ($a) return; $x = <<<E\nabc`, 'unterminated heredoc')
  never(`<?php if ($a) return; foo(`, 'unbalanced parenthesis')
  never(`<?php if ($a) return; }`, 'stray closer')
  never(`<?php return;`, 'bare return only')
  never(`if ($a) return;`, 'no open tag')
  never(`<?php if ($a) return; 'unterminated`, 'unterminated single-quoted string')
  never(`<?php if ($a) return; $x = ;`, 'syntax error after the guard')
  never(`<?php if ($a) return; if (`, 'truncated statement')
  const ok = (src, label) => assert.equal(analyzeSkipGuard(src, (e) => e === 'is_array($a)').skip, false, label)
  ok('<?php if (is_/**/array($a)) return; ?>', 'comment joining two tokens into the allowed spelling')
  ok('<?php if (is_ array($a)) return; ?>', 'whitespace joining two tokens into the allowed spelling')
  assert.equal(analyzeSkipGuard('<?php if (is_array($a)) return; ?>', (e) => e === 'is_array($a)').skip, true, 'control: the plain spelling')
  assert.equal(analyzeSkipGuard('<?php if ($a) return; ?>\n}\n', () => true).skip, true, 'control: a brace in inline HTML is text')
  assert.equal(analyzeSkipGuard('<?php if ($a) { ?>\n}\n', () => true).skip, false, 'a brace in inline HTML does not close a block')
  assert.equal(analyzeSkipGuard('<?php if ($a) return; ?>', (e) => e === '$a').skip, true, 'control: a well-formed guard the predicate accepts')
  assert.equal(analyzeSkipGuard('<?php if ($a) return; "x', (e) => e === '$a').failed, true, 'malformed input is reported as failed')
})

test('skip guard: a quoted literal that does not close is malformed, an escaped quote does not close it', () => {
  const skip = (src) => analyzeSkipGuard(src, () => true).skip
  assert.equal(skip(`<?php if ($a) return; $x = 'a\\\\'b`), false, 'escaped quote leaves the literal open')
  assert.equal(skip(`<?php if ($a) return; $x = 'a\\\\\\\\';`), true, 'control: an escaped backslash then the closing quote')
})
