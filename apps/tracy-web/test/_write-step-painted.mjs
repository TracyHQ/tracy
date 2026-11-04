// Fixtures for the painted frames of the write step: an invented picture package whose painted items carry real recipes,
// an invented brand with a Design system module, and small pictures generated here. No real picture, name or colour.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { contentMapKey } from '../src/site-writer/contract-mapping.js'
import { PHOSPHOR_SET } from '../src/site-pictures/icons/phosphor-set.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { brandFile, brandKit, frozenWithBrand } from './_write-step-brand.mjs'
import { SITE } from './_write-step-run.mjs'
import {
  BACKGROUND,
  frozenWithPictures,
  HERO,
  PREVIEW,
  pictureKit,
  picturePackage,
  pictureSite
} from './_write-step-pictures.mjs'

export const ACCENT = '#0f7a6b'
export const OTHER_ACCENT = '#7a2f9c'
export const SURFACE = '#1c1c20'
export const ON_DARK = '#eeeeee'
export const TEXT = '#333333'

/** A Design system module with both sides, in the form the slot emits it. */
export const moduleHtml = (accent = ACCENT) =>
  `<style id="tracy-ds-slot">/* tracy-ds-slot: brand:accent-only-test */ ` +
  `:root:where(:not(:has(> body.dark-active))) body{--ds-c-bg:#ffffff;--ds-c-surface:#f5f5f5;--ds-c-fg:${TEXT};--ds-c-accent:${accent};--ds-c-accent-on:#ffffff}` +
  `:root:where(:has(> body.dark-active)) body{--ds-c-bg:#101010;--ds-c-surface:${SURFACE};--ds-c-fg:${ON_DARK};--ds-c-accent:${accent};--ds-c-accent-on:#ffffff}</style>`

/** A transparent picture with an opaque square in its middle, as a cut-out figure is. */
export async function makeFigure(size = 40) {
  const square = Math.round(size / 4)
  const bytes = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: {
          create: { width: square, height: square, channels: 4, background: '#ffcc00' }
        },
        left: Math.round((size - square) / 2),
        top: Math.round((size - square) / 2)
      }
    ])
    .png()
    .toBuffer()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    bytes,
    entry: {
      sitePath: `images/tracy-content/${sha256}.png`,
      file: `files/${sha256}.png`,
      sha256,
      width: size,
      height: size
    }
  }
}

const previewOf = () => PREVIEW.entry

export const iconItem = (frame, over = {}) => ({
  frame,
  key: contentMapKey(frame),
  kind: 'icon',
  paint: { light: { glyph: 'accent', plate: null }, dark: { glyph: 'accent', plate: null } },
  holds: 'light',
  draw: { icon: 'star', set: PHOSPHOR_SET, weight: 'regular' },
  width: 32,
  height: 32,
  preview: previewOf(),
  previewDark: null,
  ...over
})

export const initialsItem = (frame, letters = 'QF', over = {}) => ({
  frame,
  key: contentMapKey(frame),
  kind: 'initials',
  paint: { background: 'accent', foreground: 'on-accent' },
  holds: null,
  draw: { letters },
  width: 60,
  height: 60,
  preview: previewOf(),
  previewDark: null,
  ...over
})

export const backdropItem = (frame, figure, over = {}) => ({
  frame,
  key: contentMapKey(frame),
  kind: 'backdrop',
  paint: { circle: 'surface', stripes: 'accent' },
  holds: null,
  draw: {
    backdrop: {
      circle: { x: 0.5, y: 0.5, r: 0.5 },
      stripes: {
        pattern: 'chevron',
        angle: 45,
        apex: { x: 0, y: -0.6 },
        band: 0.3,
        gap: 0.1,
        count: 4,
        texture: null
      }
    },
    figure: figure.entry.sitePath
  },
  width: figure.entry.width,
  height: figure.entry.height,
  preview: {
    file: PREVIEW.entry.file,
    width: figure.entry.width,
    height: figure.entry.height,
    sha256: PREVIEW.entry.sha256,
    preview: true
  },
  previewDark: null,
  ...over
})

const BASE_KEYS = ['module-2.pic', 'article-7.5', 'module-2.gone', 'module-88.0', 'module-88.1']

/**
 * The write step with a brand file and a picture package whose `painted` list is the one given.
 * @param {{ items: (figure: object) => object[], accent?: string, brand?: object, module?: string, contentMap?: object,
 *   site?: object }} input
 */
export async function runPainted({
  items,
  accent = ACCENT,
  brand,
  module,
  contentMap = null,
  site: over = {},
  templateFiles,
  templateAccent = null,
  last
}) {
  const figure = await makeFigure()
  const painted = items(figure)
  const pictures = picturePackage()
  pictures.painted = painted
  pictures.mapping.changes = {
    'module-2.pic': HERO.entry.sitePath,
    'article-7.5': HERO.entry.sitePath,
    ...Object.fromEntries(
      painted.filter((p) => p.kind === 'backdrop').map((p) => [p.key, figure.entry.sitePath])
    )
  }
  const backed = painted.some((p) => p.kind === 'backdrop')
  pictures.uploads = backed ? [HERO.entry, figure.entry] : [HERO.entry]
  const site = pictureSite({
    ...over,
    contract: { extraKeys: [...BASE_KEYS, ...painted.map((p) => p.key)], ...over.contract }
  })
  const brandDoc = brand ?? brandFile()
  if (!brand) brandDoc.colours = { ...brandDoc.colours, accent }
  const withBrand = frozenWithBrand({ brand: brandDoc })
  if (brandDoc.colours?.module)
    writeFileSync(
      path.join(path.dirname(withBrand.files.brand), brandDoc.colours.module.file),
      module ?? moduleHtml(accent)
    )
  const frozen = frozenWithPictures({ pictures, files: [HERO, figure, BACKGROUND, PREVIEW] })
  const kit = brandKit()
  kit.doc.site = { ...pictureKit().doc.site, ...kit.doc.site }
  if (templateAccent) kit.doc.site.brandColours = { primary: { value: templateAccent } }
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit,
      contentMap,
      files: { ...withBrand.files, pictures: frozen.files.pictures },
      sleep: async () => {},
      ...(templateFiles ? { templateFiles } : {}),
      ...(last ? { last } : {}),
      accentPlace: async () => ({ title: 'Tracy design system', position: 'top-a', ordering: 0 })
    })
    return {
      report,
      site,
      figure,
      line: (slot) => report.slots.find((s) => s.slot === slot),
      uploaded: site.of('media.upload').map((c) => c.params.path),
      sent: site.of('content.contract', 'apply').at(-1)?.params.changes ?? {},
      bytesAt: (sitePath) => Buffer.from(site.uploads.get(sitePath), 'base64')
    }
  } finally {
    withBrand.done()
    frozen.done()
  }
}

/** The colours a picture holds: `#rrggbb` to how many fully opaque pixels have it. */
export async function coloursIn(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const found = new Map()
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] !== 255) continue
    const hex = `#${[data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    found.set(hex, (found.get(hex) ?? 0) + 1)
  }
  return found
}

export { HERO, PREVIEW }
