// Every web font of the template is cut in the subsets of the languages Tracy writes (LANG-2, TCH #1013, g62). Measured
// 11/10/2026 on dev g61-biz-emd-full (Tracy Business 1.7.9, a site in Vietnamese): Archivo and Newsreader were downloaded in
// `latin` and `latin-ext` only, so `ệ ể ụ ầ ế ố ủ ớ` had no face and were drawn as a base letter with a loose accent (audit
// `font-glyphs`). The design's `src/fonts.json` names the subsets it was drawn for; the language is chosen later, per site.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { LANGUAGE_SUBSETS, withLanguageSubsets } from '../src/lib/font-subsets.mjs'

const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8')
const fonts = JSON.parse(readFileSync(new URL('../src/fonts.json', import.meta.url), 'utf8'))

test('withLanguageSubsets adds the language subsets after the design’s own, once', () => {
  const out = withLanguageSubsets([
    { name: 'A', subsets: ['latin', 'latin-ext'] },
    { name: 'B', subsets: ['latin', 'vietnamese'] },
    { name: 'C' }
  ])
  assert.deepEqual(out[0].subsets, ['latin', 'latin-ext', ...LANGUAGE_SUBSETS])
  assert.deepEqual(out[1].subsets, ['latin', 'vietnamese'])
  assert.deepEqual(out[2].subsets, ['latin', ...LANGUAGE_SUBSETS])
  assert.ok(LANGUAGE_SUBSETS.includes('vietnamese'))
})

test('astro.config.mjs hands Astro every font through withLanguageSubsets', () => {
  assert.match(config, /import \{ withLanguageSubsets \} from '\.\/src\/lib\/font-subsets\.mjs'/)
  assert.match(config, /fonts:\s*withLanguageSubsets\(fonts\)/)
  assert.doesNotMatch(
    config,
    /fonts:\s*fonts\.map/,
    'the design’s subsets alone leave Vietnamese letters without a face'
  )
})

test('every font the design names is downloaded with the language subsets', () => {
  for (const font of withLanguageSubsets(fonts))
    for (const subset of LANGUAGE_SUBSETS) assert.ok(font.subsets.includes(subset), `${font.name}: ${subset}`)
})
