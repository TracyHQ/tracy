// The heading font of a brand run (brand step trial bench, #320): the template's own files first, then the Google
// Fonts face the template declares, then a refusal. Fake fetch only, no network. Invented data only.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { googleFontFaces } from '../../../packages/design/tracy-ds-slot/src/library.mjs'
import {
  displayFaceOf,
  displayWeightOf,
  googleHrefOf,
  TemplateFontError,
  templateFont
} from '../src/brand-step/template-font.js'
import { FONT } from './_brand-tool-fixtures.mjs'

const dirs = []
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'brand-font-'))
  dirs.push(d)
  return d
}
const fontFiles = (entries) => ({ list: () => Object.keys(entries), read: (p) => entries[p] })
const contract = { discovered: { displayFace: 'Bebas Neue 400, tracking 0em' } }

const FILE_URL = 'https://fonts.gstatic.com/s/invented/v1/latin.woff2'
const CSS = `/* latin-ext */
@font-face { font-family: 'Bebas Neue'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/invented/v1/ext.woff2) format('woff2'); unicode-range: U+0100-02BA; }
/* latin */
@font-face { font-family: 'Bebas Neue'; font-style: normal; font-weight: 400; src: url(${FILE_URL}) format('woff2'); unicode-range: U+0000-00FF, U+0131; }`

/** A fake Google Fonts: the stylesheet for the declared link, the font file for the latin face. */
function fakeGoogle({ css = CSS, bytes = FONT.bytes, status = 200 } = {}) {
  const seen = []
  const fetchImpl = async (url) => {
    seen.push(String(url))
    if (String(url).startsWith('https://fonts.googleapis.com/css2?')) return new Response(css, { status })
    if (String(url) === FILE_URL) return new Response(bytes, { status })
    return new Response('', { status: 404 })
  }
  return { fetchImpl, seen }
}

test('the declared face and weight come from the contract; the link is the one ds-slot builds', () => {
  assert.equal(displayFaceOf(contract), 'Bebas Neue')
  assert.equal(displayFaceOf({ baseTokens: { '--font-display': '"Oswald", sans-serif' } }), 'Oswald')
  assert.equal(displayFaceOf({}), null)
  assert.equal(displayWeightOf(contract), 400)
  assert.equal(displayWeightOf({ discovered: { displayFace: 'Teko 700' } }), 700)
  assert.equal(displayWeightOf({}), 400)
  assert.equal(
    googleHrefOf('Bebas Neue', 400),
    'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&display=swap'
  )
})

test('step 1: a font file in the template own files wins, by @font-face rule or by its own family name', async () => {
  const css = '@font-face { font-family: "Teko"; src: url("../fonts/heading.woff2") format("woff2"); }'
  const t = fontFiles({
    'tpl/css/fonts.css': Buffer.from(css),
    'tpl/fonts/heading.woff2': FONT.bytes,
    'tpl/fonts/other.woff2': Buffer.from('nope')
  })
  const f = await templateFont({ contract: { discovered: { displayFace: 'Teko 700' } }, templateFiles: t })
  assert.equal(f.from, 'tpl/fonts/heading.woff2')
  assert.ok(Buffer.compare(f.bytes, FONT.bytes) === 0)
  const byFamily = await templateFont({
    contract: { discovered: { displayFace: 'Teko' } },
    templateFiles: fontFiles({ 'a/x.woff2': FONT.bytes })
  })
  assert.equal(byFamily.from, 'a/x.woff2')
})

test('step 2: a template that links Google Fonts gets the latin face downloaded, then served from the cache', async () => {
  const cacheDir = tempDir()
  const google = fakeGoogle()
  const first = await templateFont({ contract, fetchImpl: google.fetchImpl, googleFontFaces, cacheDir })
  assert.equal(first.family, 'Bebas Neue')
  assert.equal(first.from, googleHrefOf('Bebas Neue', 400))
  assert.ok(Buffer.compare(first.bytes, FONT.bytes) === 0)
  assert.deepEqual(google.seen, [googleHrefOf('Bebas Neue', 400), FILE_URL], 'the latin face, not latin-ext')
  assert.deepEqual(readdirSync(cacheDir), ['bebasneue-400.woff2'], 'one file per family and weight')
  const again = await templateFont({ contract, fetchImpl: google.fetchImpl, googleFontFaces, cacheDir })
  assert.equal(google.seen.length, 2, 'the second run does not ask Google again')
  assert.ok(Buffer.compare(again.bytes, FONT.bytes) === 0)
  assert.match(again.from, /^cache:/)
})

test('step 2 also runs when the template files exist but do not hold the face', async () => {
  const google = fakeGoogle()
  const f = await templateFont({
    contract,
    templateFiles: fontFiles({ 'tpl/fonts/icons.woff2': Buffer.from('not a font') }),
    fetchImpl: google.fetchImpl,
    googleFontFaces,
    cacheDir: tempDir()
  })
  assert.equal(f.from, googleHrefOf('Bebas Neue', 400))
})

test('step 3: refused with the reason when the face is nowhere', async () => {
  const refused = (input, pattern) =>
    assert.rejects(templateFont(input), (e) => e instanceof TemplateFontError && pattern.test(e.message))
  await refused({ contract: {} }, /declares no display face/)
  await refused({ contract }, /no Google Fonts door is wired/)
  const down = fakeGoogle({ status: 500 })
  await refused(
    { contract, fetchImpl: down.fetchImpl, googleFontFaces, cacheDir: tempDir() },
    /did not give the stylesheet.*500/
  )
  const empty = fakeGoogle({ css: '/* nothing */' })
  await refused(
    { contract, fetchImpl: empty.fetchImpl, googleFontFaces, cacheDir: tempDir() },
    /lists no face/
  )
  const junk = fakeGoogle({ bytes: Buffer.from('this is not a font') })
  const cacheDir = tempDir()
  await refused({ contract, fetchImpl: junk.fetchImpl, googleFontFaces, cacheDir }, /not a readable font/)
  assert.deepEqual(readdirSync(cacheDir), [], 'a refused download is not cached')
})
