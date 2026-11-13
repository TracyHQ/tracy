// The no hue rule (#616) and the adjusted logo colour (D44) over EVERY template kit in the repo: a logo in black and grey only, read against each real kit,
// gives black on a light theme and white on a dark one, for the themes the kit has, and never throws. The logo and the
// brand file are invented; the kits are the repo's own contracts.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { MIN_RATIO, contrastOf, hexOfOklch, hueDistance, isNeutral, oklchOf } from '../domain/brand-hue.mjs'
import { themesOf } from '../domain/brand-look-accent.mjs'
import { groundsOf } from '../domain/brand-look-kit.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** Every `template-kit.json` under the CMS packages' contracts. */
function kitFiles() {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(path)
      else if (entry.name === 'template-kit.json') found.push(path)
    }
  }
  walk(join(root, 'packages/cms'))
  return found
}

const brief = {
  brand: {
    name: 'Inkwell Bindery',
    colorsFrom: 'logo',
    colors: [
      { hex: '#111111', role: 'primary' },
      { hex: '#f5f5f5', role: 'accent' }
    ],
    logo: 'logo-ib',
    logoResearch: { status: 'found', chosen: { mediaId: 'logo-ib', source: 'website' } }
  }
}
const brandFileFor = (doc) => ({
  kind: 'brand-file',
  version: 10,
  kit: 'kit',
  name: { value: 'Inkwell Bindery' },
  colours: {
    decision: 'kept-template',
    why: 'No logo colour has a hue.',
    accent: doc.site.brandColours.primary.value
  },
  logo: { material: { mediaId: 'logo-ib' }, mark: { decision: 'cut' } }
})

test('a logo with no hue reads on every template kit of the repo: 0 throws', () => {
  const files = kitFiles()
  assert.ok(files.length >= 17, `${files.length} kits found`)
  const failed = []
  for (const file of files) {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    if (!doc.site?.brandColours) continue
    const kit = { ref: 'kit', doc }
    try {
      const record = brandLookOf({ brandFile: brandFileFor(doc), brief, kit })
      const themes = themesOf(kit)
      const { look } = lookOfBrandRecord({ slug: 'kit', name: 'Kit', version: '1' }, record)
      assert.equal(look.accent, themes[0] === 'light' ? '#000000' : '#ffffff')
      assert.equal(look.accentDark, themes.length === 2 ? '#ffffff' : undefined)
      for (const theme of themes) {
        const accent = theme === 'light' ? '#000000' : '#ffffff'
        assert.ok(contrastOf(record.accent.onAccent[theme], accent) >= MIN_RATIO)
      }
    } catch (error) {
      failed.push(`${file.slice(root.length + 1)}: ${error.message}`)
    }
  }
  assert.deepEqual(failed, [])
})

/** Twelve hues, each as a pale and a very dark logo colour (OKLCH), rounded to #rrggbb. */
function logoColours() {
  const out = []
  for (let h = 0; h < 360; h += 30)
    for (const [L, C] of [
      [0.92, 0.06],
      [0.2, 0.05]
    ])
      out.push(hexOfOklch(L, C, h))
  return out.filter((hex) => !isNeutral(hex))
}

test('a logo with a hue the step could not wear, on every kit, 12 hues pale and very dark: reads on every theme', () => {
  const colours = logoColours()
  assert.equal(colours.length, 24)
  const failed = []
  let runs = 0
  let fallen = 0
  let maxHue = 0
  for (const file of kitFiles()) {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    if (!doc.site?.brandColours) continue
    const kit = { ref: 'kit', doc }
    for (const hex of colours) {
      runs += 1
      try {
        const coloured = { brand: { ...brief.brand, colors: [{ hex, role: 'accent' }] } }
        const record = brandLookOf({ brandFile: brandFileFor(doc), brief: coloured, kit })
        const { look } = lookOfBrandRecord({ slug: 'kit', name: 'Kit', version: '1' }, record)
        const themes = themesOf(kit)
        const byTheme = { [themes[0]]: look.accent, ...(themes[1] ? { [themes[1]]: look.accentDark } : {}) }
        for (const theme of themes) {
          const accent = byTheme[theme]
          assert.ok(contrastOf(record.accent.onAccent[theme], accent) >= MIN_RATIO, `${theme} words`)
          for (const ground of groundsOf(kit, theme))
            assert.ok(contrastOf(accent, ground) >= MIN_RATIO, `${accent} on ${ground}`)
        }
        if (record.accent.from === 'logo-hue-unreadable') fallen += 1
        else {
          assert.equal(record.accent.from, 'logo-adjusted')
          for (const accent of Object.values(byTheme)) {
            const d = hueDistance(oklchOf(hex).h, oklchOf(accent).h)
            maxHue = Math.max(maxHue, d)
            assert.ok(d < 3, `${hex} to ${accent}: hue moved ${d}`)
          }
        }
      } catch (error) {
        failed.push(`${file.slice(root.length + 1)} ${hex}: ${error.message}`)
      }
    }
  }
  console.log(
    `adjusted accent: ${runs} runs, ${failed.length} failed, ${fallen} fell back, largest hue move ${maxHue.toFixed(2)}`
  )
  assert.ok(runs >= 17 * 24)
  assert.deepEqual(failed, [])
})
