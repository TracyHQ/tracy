// An invented brand file of the JA Boxing kit (the release kit of the step chain, `contracts/ja-boxing/j6/1.0.11`) with
// its pictures written into a folder of its own: every logo spot of the kit, the favicon set and the colour shifts of
// the dark side. The business, its colours and every pixel are invented.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { pngsToIco } from '../src/brand-step/tools/ico.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const KIT_FILE = path.join(
  here,
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json'
)

/** The step chain's kit value of JA Boxing 1.0.11: `{ref, doc}`. */
export const boxingKitValue = () => ({
  ref: 'ja-boxing/j6/1.0.11',
  doc: JSON.parse(readFileSync(KIT_FILE, 'utf8'))
})

export const SPOTS = [
  'logo-header-1',
  'logo-header-2',
  'logo-offcanvas-1',
  'logo-offcanvas-2',
  'logo-footer-1'
]
/** The colour every spot's invented picture is filled with: light ground spots dark ink, dark ground spots pale. */
export const INK = {
  'logo-header-1': '#1d3b2a',
  'logo-header-2': '#e6f0e9',
  'logo-offcanvas-1': '#1d3b2a',
  'logo-offcanvas-2': '#e6f0e9',
  'logo-footer-1': '#d8e8dd'
}

/** The invented brand file of the Fernway Boxing Club, as the bench writes it (version 10). */
export const keptBrandFile = (over = {}) => ({
  kind: 'brand-file',
  version: 10,
  kit: 'ja-boxing@1.0.11',
  name: { value: 'Fernway Boxing Club', from: 'brief.brand.name', slots: [] },
  colours: {
    decision: 'new-accent',
    why: 'The logo green reads on both grounds once lifted on the dark side.',
    brandColour: '#2f6d4a',
    lift: null,
    accent: '#2f6d4a',
    shifts: [
      { side: 'dark', colour: 'accent', to: '#5fae80', opens: false },
      { side: 'dark', colour: 'accent-text', to: '#8fd0a8' }
    ]
  },
  logo: {
    material: { mediaId: 'logo-fernway' },
    mark: { decision: 'cut' },
    spots: SPOTS.map((spot) => ({ spot, shows: 'logo', file: `spots/${spot}.png` }))
  },
  favicon: {
    ico: 'favicon/favicon.ico',
    png32: 'favicon/favicon-32.png',
    png512: 'favicon/favicon-512.png',
    phone180: 'favicon/apple-touch-icon-180.png'
  },
  ownerTasks: [],
  ...over
})

export const keptBrief = {
  brand: {
    name: 'Fernway Boxing Club',
    colorsFrom: 'logo',
    colors: [{ hex: '#2f6d4a', role: 'primary' }],
    logo: 'logo-fernway',
    logoResearch: { status: 'found', chosen: { mediaId: 'logo-fernway', source: 'website' } }
  }
}

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }
const square = (n, colour) =>
  sharp({ create: { width: n, height: n, channels: 4, background: colour } })
    .png()
    .toBuffer()

/**
 * The brand file written into a new folder with every picture it names; `leave` names files not written.
 * @returns {Promise<{dir: string, file: string, brandFile: object}>}
 */
export async function writeBrandFolder({ brandFile = keptBrandFile(), leave = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-kept-'))
  const kit = boxingKitValue().doc
  const put = (name, bytes) => {
    if (leave.includes(name)) return
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), bytes)
  }
  for (const s of brandFile.logo?.spots ?? []) {
    const k = kit.site.logoSpots.find((x) => x.id === s.spot)
    // As the bench fits a spot: the logo's ink on a clear ground, at twice the spot's size.
    const [w, h] = [k.width * 2, k.height * 2]
    const ink = await sharp({
      create: { width: w - 20, height: h - 20, channels: 4, background: INK[s.spot] ?? '#777777' }
    })
      .png()
      .toBuffer()
    const bytes = await sharp({ create: { width: w, height: h, channels: 4, background: CLEAR } })
      .composite([{ input: ink, gravity: 'centre' }])
      .png()
      .toBuffer()
    put(s.file, bytes)
  }
  const f = brandFile.favicon ?? {}
  if (f.ico)
    put(
      f.ico,
      pngsToIco([await square(16, '#2f6d4a'), await square(32, '#2f6d4a'), await square(48, '#2f6d4a')])
    )
  if (f.png32) put(f.png32, await square(32, '#2f6d4a'))
  if (f.png512) put(f.png512, await square(512, '#2f6d4a'))
  if (f.phone180) put(f.phone180, await square(180, '#2f6d4a'))
  const file = path.join(dir, 'brand-file.json')
  writeFileSync(file, JSON.stringify(brandFile))
  return { dir, file, brandFile }
}
