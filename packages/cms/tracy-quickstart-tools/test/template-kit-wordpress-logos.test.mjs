// Template kit, site part, WordPress: a block theme with a light and a dark Site Logo block (the Tracy convention of
// inc/brand-logo.php: option `tracy_logo_dark` for the `<prefix>-logo--dark` block, swapped by `data-theme` on the root).
// The adapter names both options, the browser reads the dark theme too, and the spots come out as twins. All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { wordpressAdapter } from '../template-kit/lib/site/adapters/wordpress.mjs'
import { buildLogoSpots } from '../template-kit/lib/site/logo-spots.mjs'
import { readLogos, switchTheme } from '../template-kit/lib/site/read-logos.js'

const LIGHT = 'wp-content/uploads/2030/01/mark.png'
const DARK = 'wp-content/uploads/2030/01/mark-white.png'
const HEADER = `<!-- wp:group {"className":"logo"} --><div class="wp-block-group logo">
<!-- wp:site-logo {"width":120,"className":"ab-logo ab-logo--light"} /-->
<!-- wp:site-logo {"width":120,"className":"ab-logo ab-logo--dark"} /-->
</div><!-- /wp:group -->`
const BRAND_LOGO_PHP =
  "<?php function tracy_dark_logo_option() { return (int) get_option( 'tracy_logo_dark', 0 ); }"

/** A read-only source for a made-up site: options, one header part in the theme, two attachments. */
function fakeSource({ darkOption = '12', brandLogo = true } = {}) {
  const options = { blogname: 'Harbour Swim Club', stylesheet: 'ab-theme', site_logo: '11' }
  if (darkOption !== null) options.tracy_logo_dark = darkOption
  const files = { 11: LIGHT.replace('wp-content/uploads/', ''), 12: DARK.replace('wp-content/uploads/', '') }
  const query = (sql) => {
    if (sql === 'SHOW TABLES') return ['ab_options', 'ab_posts', 'ab_postmeta'].map((t) => ({ t }))
    if (/FROM ab_options/.test(sql))
      return Object.entries(options)
        .filter(([k]) => sql.includes(`'${k}'`))
        .map(([option_name, option_value]) => ({ option_name, option_value }))
    const id = /post_id = (\d+) AND meta_key = '_wp_attached_file'/.exec(sql)?.[1]
    if (id) return files[id] ? [{ meta_value: files[id] }] : []
    return []
  }
  const theme = {
    'wp-content/themes/ab-theme/parts/header.html': HEADER,
    ...(brandLogo ? { 'wp-content/themes/ab-theme/inc/brand-logo.php': BRAND_LOGO_PHP } : {})
  }
  return { query, readFile: (rel) => theme[rel] ?? null }
}

test('a block theme that reads tracy_logo_dark names it as the setting of its dark Site Logo block', () => {
  const settings = wordpressAdapter(fakeSource()).logoSettings()
  assert.deepEqual(settings, [
    {
      key: 'site_logo',
      value: LIGHT,
      prints: [{ where: 'header', layout: 'parts/header', emptyShows: 'name-as-text' }]
    },
    {
      key: 'tracy_logo_dark',
      value: DARK,
      prints: [{ where: 'header', layout: 'parts/header', emptyShows: 'name-as-text' }]
    }
  ])
})

test('an empty tracy_logo_dark is still the setting of the dark block, holding no file', () => {
  const dark = wordpressAdapter(fakeSource({ darkOption: '0' }))
    .logoSettings()
    .find((s) => s.key === 'tracy_logo_dark')
  assert.equal(dark?.value, '')
})

test('a theme without the Tracy dark logo convention keeps the one site_logo setting core draws', () => {
  const settings = wordpressAdapter(fakeSource({ brandLogo: false })).logoSettings()
  assert.deepEqual(settings, [
    {
      key: 'site_logo',
      value: LIGHT,
      prints: [{ where: 'header', layout: 'parts/header', emptyShows: 'nothing' }]
    }
  ])
})

test('the browser reads a data-theme site in its other theme, and a --dark logo block is a twin', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage({ colorScheme: 'light' })
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const html = `<!doctype html><html><head><style>
      body { background: #fcfaf6 } header { background: #fcfaf6 }
      :root[data-theme='dark'] body, :root[data-theme='dark'] header { background: #1a1816 }
      .ab-logo--dark { display: none }
      :root[data-theme='dark'] .ab-logo--light { display: none }
      :root[data-theme='dark'] .ab-logo--dark { display: block }
      img { width: 120px; height: 75px }
    </style></head><body><header>
      <div class="wp-block-site-logo ab-logo ab-logo--light"><a class="custom-logo-link"><img src="/${LIGHT}"></a></div>
      <div class="wp-block-site-logo ab-logo ab-logo--dark"><a class="custom-logo-link"><img src="/${DARK}"></a></div>
    </header></body></html>`
    await page.route('http://site.example/**', (r) =>
      r.request().url().endsWith('.png')
        ? r.fulfill({ contentType: 'image/png', body: Buffer.from(png.split(',')[1], 'base64') })
        : r.fulfill({ contentType: 'text/html', body: html })
    )
    await page.goto('http://site.example/')
    const args = { logoFiles: [LIGHT, DARK], siteName: null, brand: [] }
    const first = await page.evaluate(readLogos, args)
    assert.deepEqual(first.opensOn.markers, [])
    assert.deepEqual(
      first.logos.map((l) => [l.file, l.shown, l.themeClass]),
      [
        [LIGHT, true, 'ab-logo--light'],
        [DARK, false, 'ab-logo--dark']
      ]
    )
    const other = await page.evaluate(switchTheme)
    assert.equal(other, '[data-theme=dark]')
    const second = await page.evaluate(readLogos, args)
    assert.deepEqual(second.opensOn.markers, ['[data-theme=dark]'])
    assert.deepEqual(
      second.logos.map((l) => [l.file, l.shown]),
      [
        [LIGHT, false],
        [DARK, true]
      ]
    )

    const reads = [
      { pageId: 'page-home', theme: 'base', opening: true, logos: first.logos },
      { pageId: 'page-home', theme: other, opening: false, logos: second.logos }
    ]
    const settings = wordpressAdapter(fakeSource()).logoSettings()
    const { logoSpots } = buildLogoSpots({
      reads,
      map: { entities: [], slots: [] },
      settings,
      isFreeHtml: () => false
    })
    assert.deepEqual(
      logoSpots.map((s) => [s.id, s.setting, s.shownIn, s.twinOf, s.ground.side, s.width, s.emptyShows]),
      [
        ['logo-header-1', 'site_logo', ['base'], null, 'light', 120, 'name-as-text'],
        [
          'logo-header-2',
          'tracy_logo_dark',
          ['[data-theme=dark]'],
          'logo-header-1',
          'dark',
          120,
          'name-as-text'
        ]
      ]
    )
  } finally {
    await browser.close()
  }
})

test('a page with no theme marker and no dark logo block has no other theme to switch to', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage()
    await page.setContent('<header><div class="logo"><img src="data:image/png;base64,AA=="></div></header>')
    assert.equal(await page.evaluate(switchTheme), null)
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-theme')), false)
  } finally {
    await browser.close()
  }
})
