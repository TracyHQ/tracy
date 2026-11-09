/**
 * The JA Diner Contact page shows the source's restaurant photograph beside the information text.
 *
 * The pattern looks for a media library attachment named banner-contact first. The quickstart's
 * prune step removes attachments that no content, meta, option or theme file names by file path,
 * and a lookup by post name is not such a reference, so on a shipped site the attachment is gone.
 * The fallback must therefore be the photograph bundled with the theme, never the grey placeholder.
 *
 * WHAT THIS FILE RUNS. A read of the overlay pattern and of every generated copy under src/, and a
 * check that the fallback file exists in the theme. It does not run WordPress or a browser.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const COPIES = ['overlays/wp-ja-diner', 'src/wp-ja-diner']

for (const copy of COPIES) {
  test(`${copy}: the Contact picture falls back to the bundled photograph`, () => {
    const pattern = readFileSync(path.join(PKG, copy, 'patterns/contact-form.php'), 'utf8')
    const line = pattern.split('\n').find((l) => l.startsWith('$jd_pic = $jd_pic ?'))
    assert.ok(line, 'the pattern resolves $jd_pic with a fallback')
    const fallback = line.match(/get_theme_file_uri\( '([^']+)' \)/)?.[1]
    assert.ok(fallback, 'the fallback is a theme file')
    assert.notEqual(path.basename(fallback), 'placeholder.svg', 'the fallback is not the grey placeholder')
    assert.ok(existsSync(path.join(PKG, copy, fallback)), `${fallback} ships in ${copy}`)
  })
}
