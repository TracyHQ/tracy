// The no hue rule (#616) over EVERY template kit in the repo: a logo in black and grey only, read against each real kit,
// gives black on a light theme and white on a dark one, for the themes the kit has, and never throws. The logo and the
// brand file are invented; the kits are the repo's own contracts.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { MIN_RATIO, contrastOf } from '../domain/brand-hue.mjs'
import { themesOf } from '../domain/brand-look-accent.mjs'

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
