// Inputs of the real-page check tests (#322): captures of an invented page drawn by code, in the shape the host's
// real-page views answer (tracy-host real-page-views.js), plus the invented brand file the checks are made against.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const KIT = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.10/template-kit.json',
      import.meta.url
    ),
    'utf8'
  )
)
export const kit = { doc: KIT }
export const brandFile = JSON.parse(
  readFileSync(new URL('./fixtures/brand-step/2-words-only/brand-file.json', import.meta.url), 'utf8')
)
export const PALETTE = ['#ffffff', '#121111', '#1f1e1e', '#f2e3b3', '#212529']
const BRAND = '/images/tracy-brand/'

/** A picture of `w` x `h` on `ground` with solid ink bars (`bars`: x, y, width, height) drawn on it. */
export async function shot(w, h, ground, ink, bars) {
  const bar = (b) => ({
    input: { create: { width: b[2], height: b[3], channels: 3, background: ink } },
    left: b[0],
    top: b[1]
  })
  return sharp({ create: { width: w, height: h, channels: 3, background: ground } })
    .composite(bars.map(bar))
    .png()
    .toBuffer()
}

const view = (id, scheme, png, logo, extra = {}) => ({
  id,
  scheme,
  ok: true,
  png,
  facts: { region: null, logo },
  ...extra
})
const logoFact = (src, rect) => ({ src, alt: '', naturalWidth: 100, naturalHeight: 40, rect })

/** Captures that pass every check; `over` changes one thing: contrast ink, name band height, menu picture, icons, colours. */
export async function goodCaptures(over = {}) {
  const dark = { ground: '#121111', ink: '#f2e3b3' }
  const light = { ground: '#ffffff', ink: over.lightInk ?? '#1a8480' }
  const band = over.band ?? 28
  const views = []
  for (const [scheme, c] of [
    ['light', light],
    ['dark', dark]
  ]) {
    const rect = { x: 20, y: 20, width: 195, height: 56 }
    views.push(
      view(
        'header',
        scheme,
        await shot(1440, 120, c.ground, c.ink, [[40, 20 + (56 - band) / 2, 150, band]]),
        logoFact(`${BRAND}logo-${scheme}-aa-t1.png`, rect)
      )
    )
    const fr = { x: 20, y: 20, width: 175, height: 60 }
    views.push(
      view(
        'footer',
        scheme,
        await shot(1440, 150, '#1f1e1e', '#f2e3b3', [
          [40, 26, 100, 16],
          [40, 54, 100, 16]
        ]),
        logoFact(over.footerSrc ?? `${BRAND}logo-dark-bb-t1.png`, fr)
      )
    )
    views.push(
      view(
        'menu',
        scheme,
        await shot(390, 844, c.ground, c.ink, [[26, 26, 28, 28]]),
        logoFact(over.menuSrc ?? `${BRAND}menu-mark-cc-t1.png`, { x: 20, y: 20, width: 40, height: 40 }),
        { opened: true }
      )
    )
    views.push({
      id: 'tab',
      scheme,
      ok: true,
      png: await shot(32, 32, '#ffffff', '#1a8480', [[8, 8, 16, 16]]),
      facts: {}
    })
  }
  const icon = (rel, kind, w, f) => ({
    rel,
    kind,
    width: w,
    height: w,
    status: 200,
    href: `https://trial.test${BRAND}${f}`
  })
  return {
    url: 'https://trial.test/',
    views,
    icons: over.icons ?? [
      icon('shortcut icon', 'ico', 32, 'favicon-ico-aa.ico'),
      icon('icon', 'png', 32, 'favicon-32-bb.png'),
      icon('icon', 'png', 512, 'favicon-512-cc.png'),
      icon('apple-touch-icon', 'png', 180, 'phone-180-dd.png')
    ],
    colours: over.colours ?? {
      light: [
        { hex: '#ffffff', count: 40 },
        { hex: '#1a8480', count: 6 },
        { hex: '#136764', count: 2 }
      ],
      dark: [
        { hex: '#121111', count: 40 },
        { hex: '#f2e3b3', count: 9 },
        { hex: '#2fb3ad', count: 3 }
      ]
    }
  }
}
