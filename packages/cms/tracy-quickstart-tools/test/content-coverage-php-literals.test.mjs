/**
 * A template file writes visible words as PHP string literals, some with escapes: `'Don\'t'`, `"Mon\xe2\x80\x93Fri"`,
 * `"\u{2014}"`. The source index reads each literal the way PHP prints it, so the page text those literals render is
 * found in the template file instead of nowhere. The fixture is a made-up travel template.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { normText } from '../content-coverage/lib/normalize.mjs'
import { buildSourceIndex, searchSources } from '../content-coverage/lib/sources.mjs'

const LAYOUT = String.raw`<div class="hero">
  <p>It's the guide's pick, isn't it</p>
  <h2><?php echo 'Where do you dream of going? Don\'t wait'; ?></h2>
  <?php // A comment's apostrophe doesn't open a string
  $hours = "Mon\xe2\x80\x93Fri, 9am \u{2014} 5pm"; # and neither does this one's
  /* nor 'this' "one's" */ ?>
  <p class="hours"><?= $hours ?></p>
  <p><?php echo "Say \"hello\" to the \$crew\tnow"; ?></p>
  <p><?php echo 'Keep \n as \\ typed'; ?></p>
  <p><?php echo "Sm\303\266rg\303\245s on the corner"; ?></p>
  <?php echo <<<TXT
  Our "heredoc" crew\x21 \u{2764}
  TXT;
  echo <<<'RAW'
  Nowdoc keeps \x21 as typed
  RAW; ?>
  <p>After the code, Lisbon's tram</p>
</div>
`

function webroot() {
  const root = mkdtempSync(path.join(tmpdir(), 'php-literals-'))
  const dir = path.join(root, 'templates/ja_trip/html/com_content/featured')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'default_item.php'), LAYOUT)
  return root
}

const found = (index, text) =>
  searchSources(index, { norm: normText(text) }).map((h) => [h.file, h.origin.cls])

test('the source index reads a PHP string literal the way PHP prints it', () => {
  const index = buildSourceIndex(webroot(), 'ja_trip')
  const file = 'templates/ja_trip/html/com_content/featured/default_item.php'
  for (const text of [
    "Where do you dream of going? Don't wait",
    'Mon–Fri, 9am — 5pm',
    'Say "hello" to the $crew now',
    'Keep \\n as \\ typed',
    'Sm\u00f6rg\u00e5s on the corner',
    'Our "heredoc" crew! ❤',
    'Nowdoc keeps \\x21 as typed',
    "It's the guide's pick, isn't it",
    "After the code, Lisbon's tram"
  ])
    assert.deepEqual(found(index, text), [[file, 'b']], text)
})
