import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { VISION_TEST_VERSION, visionTestInput, visionTestSvg } from '../src/lib/llm-vision-test.js'
import { GLYPHS, textPath } from '../src/lib/vision-test-glyphs.js'

const moduleUrl = new URL('../src/lib/llm-vision-test.js', import.meta.url).href
const fixture = {
  colors: ['red', 'blue', 'green'],
  nonce: '0123ABCD',
  bottomText: 'Opening hours unavailable'
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Counts dark pixels in a box of a rendered fixture; placeholder boxes and blank areas both fail the checks below.
async function ink(png, { left, top, width, height }) {
  const { data, info } = await sharp(png)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let dark = 0
  for (let i = 0; i < data.length; i += info.channels)
    if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) dark++
  return dark
}
const nonceBox = { left: 40, top: 395, width: 400, height: 55 }
const bottomBox = { left: 40, top: 485, width: 400, height: 32 }
const gapBox = { left: 40, top: 450, width: 400, height: 30 }

test('vision fixture version invalidates proofs made with the font-dependent image', () => {
  // test-quality: contract proofs stored under 'pixel-layout-ocr/1' were made with tofu text and must not count
  assert.equal(VISION_TEST_VERSION, 'pixel-layout-ocr/2')
})

test('vision fixture draws text as outlines and never asks for a system font', async () => {
  const svg = visionTestSvg(fixture)
  assert.doesNotMatch(svg, /<text/)
  assert.doesNotMatch(svg, /font-family/)
  const input = await visionTestInput()
  assert.match(input.expected.nonce, /^[0-9A-F]{8}$/)
})

test('every nonce and expected-text character has a glyph; an unknown one throws', () => {
  for (const char of `0123456789ABCDEFSITE REVIEW${fixture.bottomText}`) assert.ok(GLYPHS[char], char)
  assert.throws(() => textPath('Z', { x: 0, y: 0, size: 10 }), { code: 'VISION_GLYPH_MISSING' })
})

test('rendered fixture has ink where the nonce and bottom text are, and the ink follows the characters', async () => {
  const png = await sharp(Buffer.from(visionTestSvg(fixture)))
    .png()
    .toBuffer()
  assert.ok((await ink(png, nonceBox)) > 2000)
  assert.ok((await ink(png, bottomBox)) > 800)
  assert.equal(await ink(png, gapBox), 0)
  // Placeholder boxes look the same for every character; real glyphs do not.
  const other = await sharp(Buffer.from(visionTestSvg({ ...fixture, nonce: '89EF4567' })))
    .png()
    .toBuffer()
  const region = (bytes) => sharp(bytes).extract(nonceBox).raw().toBuffer()
  assert.notDeepEqual(await region(png), await region(other))
})

test('fixture pixels are identical with an empty fontconfig (a host with no fonts)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vision-glyphs-'))
  try {
    const config = join(dir, 'fonts.conf')
    await writeFile(
      config,
      '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig></fontconfig>\n'
    )
    const script = `import sharp from 'sharp'
      const { visionTestSvg } = await import(${JSON.stringify(moduleUrl)})
      const png = await sharp(Buffer.from(visionTestSvg(${JSON.stringify(fixture)}))).png().toBuffer()
      process.stdout.write(png.toString('base64'))`
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, FONTCONFIG_FILE: config },
      maxBuffer: 16 * 1024 * 1024
    })
    const isolated = Buffer.from(stdout, 'base64')
    const local = await sharp(Buffer.from(visionTestSvg(fixture)))
      .png()
      .toBuffer()
    assert.equal(sha(isolated), sha(local))
    assert.ok((await ink(isolated, nonceBox)) > 2000)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
