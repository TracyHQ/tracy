// Template kit, site part: logo spots from fabricated browser reads in two themes, the Joomla adapter on a fake
// read-only source (settings files, a layout, menu rows), and the whole `site` built from them. All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { joomlaAdapter, prefixOf, readConfig } from '../template-kit/lib/site/adapters/joomla.mjs'
import { emptyShowsOf, variableOf } from '../template-kit/lib/site/adapters/joomla-t4.mjs'
import { mysqlPrefix, parseBatch, siteSource } from '../template-kit/lib/site/adapters/source.mjs'
import { stylesOfHtml } from '../template-kit/lib/site/browse-site.mjs'
import { buildLogoSpots, logoFrameIds } from '../template-kit/lib/site/logo-spots.mjs'
import { readLogos } from '../template-kit/lib/site/read-logos.js'
import { buildSite } from '../template-kit/lib/site/site-kit.mjs'

const LAYOUT = `<?php $name = $s->get('site_name'); $logo = $s->get('site_logo'); $logo_dark = $s->get('site_logo_dark'); ?>
<div class="brand"><?php if ($logo) : ?><span class="d-light"><img src="<?php echo $logo; ?>"></span>
<?php if ($logo_dark) : ?><span class="d-dark"><img src="<?php echo $logo_dark; ?>"></span><?php endif; ?>
<?php else : ?><?php if ($name) : ?><span class="site-name"><?php echo $name; ?></span><?php endif; ?><?php endif; ?></div>`

const map = {
  entities: [
    { key: 'siteSetting-1', kind: 'siteSetting', identity: { key: 'site_logo' } },
    { key: 'siteSetting-2', kind: 'siteSetting', identity: { key: 'site_logo_dark' } },
    { key: 'module-40', kind: 'module', identity: { module: 'mod_custom', position: 'foot-1' } },
    { key: 'module-41', kind: 'module', identity: { module: 'mod_menu', position: 'foot-2' } }
  ],
  slots: [
    {
      key: 'siteSetting-1.0',
      entity: 'siteSetting-1',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo-light.png#x'
    },
    {
      key: 'siteSetting-2.0',
      entity: 'siteSetting-2',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo-dark.png'
    },
    {
      key: 'module-40.1',
      entity: 'module-40',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo-dark.png'
    },
    {
      key: 'module-41.0',
      entity: 'module-41',
      type: 'text',
      role: 'business.name',
      sample: 'Harbour Swim Club'
    }
  ],
  pages: [{ entity: 'menuItem-11', route: 'home', link: 'index.php?option=com_content&view=featured' }]
}

const logo = (file, region, block, themeClass, shown, ground, extra = {}) => ({
  file,
  region,
  block,
  themeClass,
  shown,
  width: shown ? 180 : 0,
  height: shown ? 50 : 0,
  ground: { colour: ground, picture: false },
  ...extra
})
const logoReads = [
  {
    pageId: 'page-home',
    theme: 'dark-active',
    opening: true,
    logos: [
      logo('images/demo/logo-light.png', 'header', 'header', 'd-light', false, '#101418'),
      logo('images/demo/logo-dark.png', 'header', 'header', 'd-dark', true, '#101418'),
      logo('images/demo/logo-dark.png', 'footer', 'module-40', null, true, '#202020', {
        blockTextOnly: true
      }),
      logo('images/demo/partner.png', 'other', 'module-77', null, true, null, {
        ground: { colour: null, picture: true }
      })
    ]
  },
  {
    pageId: 'page-home',
    theme: 'light-active',
    opening: false,
    logos: [
      logo('images/demo/logo-light.png', 'header', 'header', 'd-light', true, '#ffffff'),
      logo('images/demo/logo-dark.png', 'header', 'header', 'd-dark', false, '#ffffff'),
      logo('images/demo/logo-dark.png', 'footer', 'module-40', null, true, '#202020', { blockTextOnly: true })
    ]
  }
]

test('a T4 layout says what prints when a logo setting is empty', () => {
  assert.equal(variableOf(LAYOUT, 'site_logo'), 'logo')
  assert.equal(emptyShowsOf(LAYOUT, 'logo'), 'name-as-text')
  assert.equal(emptyShowsOf(LAYOUT, 'logo_dark'), 'nothing')
  assert.equal(
    emptyShowsOf('<?php if ($logo) : ?>x<?php else : ?><?php echo $title; ?><?php endif; ?>', 'logo'),
    'template-text'
  )
  assert.equal(emptyShowsOf(LAYOUT, 'logo_small'), null)
})

test('a T4 layout says what prints when a logo setting is empty: compound fallback stays conservative', () => {
  const compound = `<?php $site_name = $s->get('site_name'); $logo = $s->get('site_logo'); ?>
<?php if ($logo && $logo_dark) : ?>
  <span class="d-light"><?php echo $printLogo($logo); ?></span>
  <span class="d-dark"><?php echo $printLogo($logo_dark); ?></span>
<?php elseif ($logo) : ?><?php echo $printLogo($logo); ?>
<?php else : ?>
  <?php if ($site_name) : ?><span class="site-name"><?php echo $site_name; ?></span><?php endif; ?>
<?php endif; ?>`
  assert.equal(emptyShowsOf(compound, 'logo'), 'name-as-text')
  assert.equal(emptyShowsOf(compound, 'logo_dark'), null)
  assert.equal(emptyShowsOf(compound, 'logo_small'), null)
  assert.equal(
    emptyShowsOf('<?php if ($logo && $dark) : ?>x<?php elseif ($logo) : ?>y<?php endif; ?>', 'logo'),
    'nothing'
  )
  assert.equal(emptyShowsOf(compound.replace('$logo && $logo_dark', '$logo || $logo_dark'), 'logo'), null)
  assert.equal(emptyShowsOf(compound.replace('$logo && $logo_dark', '$logo && ready()'), 'logo'), null)
  assert.equal(emptyShowsOf(compound.replace('elseif ($logo)', 'elseif ($other)'), 'logo'), null)
  assert.equal(emptyShowsOf(compound.replace('elseif ($logo)', 'elseif ($logo = pick())'), 'logo'), null)
  assert.equal(
    emptyShowsOf(compound.replace('<?php else : ?>', "<?php else : ?><?php $logo = 'new'; ?>"), 'logo'),
    null
  )
  assert.equal(
    emptyShowsOf(
      '<?php if ($logo && $dark) : ?>x<?php else : ?><span>site-name</span><?php endif; ?>',
      'logo'
    ),
    'template-text'
  )
})

test('logo spots: twins by theme, frame ids from the map, free HTML without a slot still listed', () => {
  const settings = [
    { key: 'site_logo', prints: [{ where: 'header', emptyShows: 'name-as-text' }] },
    { key: 'site_logo_dark', prints: [{ where: 'header', emptyShows: 'nothing' }] }
  ]
  const { logoSpots, errors } = buildLogoSpots({
    reads: logoReads,
    map,
    settings,
    isFreeHtml: (e) => e.identity?.module === 'mod_custom'
  })
  const by = Object.fromEntries(logoSpots.map((s) => [s.frameId ?? s.demoFiles[0], s]))
  const light = by['siteSetting-1.0']
  const dark = by['siteSetting-2.0']
  assert.deepEqual(
    [dark.where, dark.ground.side, dark.twinOf, dark.emptyShows],
    ['header', 'dark', null, 'nothing']
  )
  assert.deepEqual(
    [light.ground.colour, light.ground.side, light.twinOf, light.emptyShows],
    ['#ffffff', 'light', dark.id, 'name-as-text']
  )
  const footer = by['block-40.1']
  assert.deepEqual(
    [footer.where, footer.emptyShows, footer.shownIn.length, footer.width],
    ['footer', 'nothing', 2, 180]
  )
  const partner = by['images/demo/partner.png']
  assert.equal(partner.frameId, null)
  assert.ok(partner.ground.onPicture)
  assert.deepEqual(errors.map((e) => e.field).sort(), [
    `site.logoSpots[${partner.id}].emptyShows`,
    `site.logoSpots[${partner.id}].frameId`,
    `site.logoSpots[${partner.id}].ground`
  ])
  assert.deepEqual([...logoFrameIds(map, { logoSpots })].sort(), [
    'block-40.1',
    'siteSetting-1.0',
    'siteSetting-2.0'
  ])
})

test('the read-only source: batch answers parsed, only SELECT and SHOW sent', () => {
  assert.deepEqual(parseBatch('id\tparams\n1\t{"a":"x\\ty"}\n2\tNULL\n'), [
    { id: '1', params: '{"a":"x\ty"}' },
    { id: '2', params: null }
  ])
  assert.deepEqual(mysqlPrefix('mysql://u:p%40ss@db.example:3307/site'), [
    'mysql',
    '-h',
    'db.example',
    '-P',
    '3307',
    '-u',
    'u',
    '-pp@ss',
    'site'
  ])
  const src = siteSource({ dbCommand: 'false' })
  assert.throws(() => src.query('UPDATE t SET a = 1'), /only SELECT/)
  assert.deepEqual(
    readConfig(
      "public $sitename = 'Harbour \\'Swim\\' Club';\npublic $password = 'secret';\npublic $sitename_pagetitles = '2';"
    ),
    {
      sitename: "Harbour 'Swim' Club",
      sitename_pagetitles: '2'
    }
  )
  assert.equal(prefixOf(['ab_action_logs_extensions', 'ab_extensions', 'ab_menu']), 'ab_')
})

test('stylesheets of a page: same-site links and inline blocks only', () => {
  const html =
    '<link rel="stylesheet" href="/css/a.css?v=1"><link rel="stylesheet" href="https://fonts.example/f.css"><style>a{color:red}</style>'
  assert.deepEqual(stylesOfHtml(html, 'http://site.example'), {
    links: ['/css/a.css?v=1'],
    inline: ['a{color:red}']
  })
})

/** A fake read-only Joomla source: a T4 template with settings files, one layout, one menu entry. */
function fakeSource() {
  const files = {
    'configuration.php': "public $sitename = 'Harbour Swim Club';\npublic $sitename_pagetitles = '0';",
    'templates/demo_t4/etc/site/default.json': JSON.stringify({
      site_name: '',
      site_logo: 'images/demo/logo-light.png#x',
      site_logo_dark: 'images/demo/logo-dark.png',
      other_faviconFile: ''
    }),
    'templates/demo_t4/etc/global.json': JSON.stringify({ system_opengraph: '0' }),
    'templates/demo_t4/html/layouts/t4/element/logo.php': LAYOUT,
    'templates/demo_t4/favicon.ico': 'ico',
    'plugins/system/t4/src/t4/Document/Template.php': "renderTag('og:title')"
  }
  const rows = {
    'SHOW TABLES': [{ t: 'ab_extensions' }, { t: 'ab_menu' }],
    template_styles: [{ template: 'demo_t4' }],
    menu: [
      {
        id: '11',
        title: 'Home',
        link: 'index.php?option=com_content&view=featured',
        menutype: 'main',
        home: '1',
        params: '{}'
      }
    ],
    extensions: [{ enabled: '1' }]
  }
  return {
    readFile: (rel) => files[rel] ?? null,
    query: (sql) => rows[sql === 'SHOW TABLES' ? sql : /FROM ab_(\w+)/.exec(sql)?.[1]] ?? []
  }
}

test('the whole site part from fabricated reads and a fake Joomla source', () => {
  const adapter = joomlaAdapter(fakeSource())
  assert.equal(adapter.framework, 't4')
  const reads = [
    {
      pageId: 'page-home',
      slug: 'home',
      path: '/',
      head: {
        title: 'Harbour Swim Club',
        icons: [{ rel: 'icon', href: '/templates/demo_t4/favicon.ico?v=2' }]
      },
      h1s: [{ text: 'Swim all year', shown: true }],
      names: [
        { where: 'text', block: 'module-41', region: 'footer', sample: 'Harbour Swim Club' },
        { where: 'alt-attribute', block: 'header', region: 'header', sample: 'Harbour Swim Club' }
      ],
      blocks: ['header', 'module-40', 'main-body'],
      bodyClass: 'view-featured',
      opensOn: { markers: ['dark-active'], ground: '#101418' },
      inlineIcons: [],
      pictures: []
    }
  ]
  const styles = [
    {
      from: '/css/t.css',
      css: ':root{--color-primary:#2a7de1}a{color:var(--color-primary)}body{background:#101418}'
    }
  ]
  const { site, mainHeadings, errors } = buildSite({
    map,
    adapter,
    reads,
    logoReads,
    notFound: { status: 404, read: { texts: ['Not found'] } },
    styles,
    htmls: []
  })
  assert.equal(site.favicon.currentFile, '/templates/demo_t4/favicon.ico')
  assert.match(site.favicon.mechanism.fallback, /favicon\.ico/)
  assert.deepEqual(
    site.nameSlots.map((n) => n.kind),
    ['setting', 'setting', 'slot', 'printed']
  )
  assert.equal(site.brandColours.primary.value, '#2a7de1')
  assert.deepEqual(
    [site.head.titleSuffix.value, site.head.og.supported, site.head.og.on],
    ['none', true, false]
  )
  assert.deepEqual(site.head.injection.position, { name: 'foot-1', block: 'block-40', onPages: 1, of: 1 })
  assert.equal(site.logoSpots.length, 4)
  assert.equal(mainHeadings[0].via, 'template')
  assert.ok(errors.some((e) => e.field === 'site.systemPages.articleLayoutForNewPage'))
  assert.ok(!JSON.stringify(site).includes('module-'), 'the site part speaks of blocks, never of modules')
})

test('a logo only a phone shows is sized at phone width; a phone read adds no place', () => {
  const mobile = {
    ...logo('images/demo/logo-mobile.png', 'header', 'header', null, true, '#000000'),
    width: 60,
    height: 60
  }
  const reads = [
    {
      pageId: 'page-home',
      theme: 'base',
      opening: true,
      logos: [logo('images/demo/logo-mobile.png', 'header', 'header', null, false, '#000000')]
    },
    {
      pageId: 'page-home',
      theme: 'base',
      opening: true,
      width: 390,
      logos: [mobile, logo('images/demo/only-phone.png', 'offcanvas', null, null, true, '#ffffff')]
    }
  ]
  const { logoSpots, errors } = buildLogoSpots({ reads, map, settings: [], isFreeHtml: () => false })
  assert.equal(logoSpots.length, 1)
  assert.deepEqual([logoSpots[0].width, logoSpots[0].height, logoSpots[0].sizeAt], [60, 60, 390])
  assert.ok(!errors.some((e) => e.field.endsWith('.width')))
})

test('a "logo" class in the page body (client strip, feature icon) is no site logo; header and footer ones are', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage()
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const img = (src) => `<img src="${src}" width="40" height="20">`
    const html = `<header><div class="logo">${img(png + '#head')}</div></header>
      <main><div class="client-logos">${img(png + '#client')}</div>
        <div class="logo"><svg width="30" height="30"><rect width="30" height="30"/></svg></div>
        <a class="navbar-brand">${img(png + '#brand')}</a>
        <div>${img('images/logo/item-1.png')}</div></main>
      <footer><div class="footer-logo">${img(png + '#foot')}</div></footer>`
    // A page served from a made-up site address, so a picture path resolves as on a real page.
    await page.route('http://site.example/**', (r) =>
      r.request().url().endsWith('.png')
        ? r.fulfill({ status: 404 })
        : r.fulfill({ contentType: 'text/html', body: html })
    )
    await page.goto('http://site.example/')
    const { logos } = await page.evaluate(readLogos, {
      logoFiles: ['images/logo/item-1.png'],
      siteName: null,
      brand: []
    })
    assert.deepEqual(
      logos.map((l) => [l.region, l.found]),
      [
        ['header', 'logo-container'],
        ['other', 'logo-container'],
        ['other', 'logo-file'],
        ['footer', 'logo-container']
      ]
    )
  } finally {
    await browser.close()
  }
})

test('a logo inside a block that holds no slot with its file is the site setting; a block holding the file keeps its own', () => {
  const extra = {
    ...map,
    entities: [...map.entities, { key: 'module-50', kind: 'module', identity: { module: 'mod_custom' } }],
    slots: [
      ...map.slots,
      {
        key: 'module-50.2',
        entity: 'module-50',
        type: 'image',
        role: 'editorial.illustration',
        sample: 'images/demo/logo-light.png'
      }
    ]
  }
  const reads = [
    {
      pageId: 'page-home',
      theme: null,
      opening: true,
      logos: [
        // The template's footer logo element, found inside a module's footer section that holds no slot with this file.
        logo('images/demo/logo-light.png', 'footer', 'module-41', null, true, '#202020'),
        // Free HTML that types the same file into its own content.
        logo('images/demo/logo-light.png', 'footer', 'module-50', null, true, '#202020')
      ]
    }
  ]
  const { logoSpots } = buildLogoSpots({ reads, map: extra, settings: [], isFreeHtml: () => true })
  assert.deepEqual(
    logoSpots.map((s) => [s.block, s.frameId, s.setting]),
    [
      ['block-41', 'siteSetting-1.0', 'site_logo'],
      ['block-50', null, null]
    ]
  )
})

test('a logo with no slot is written by the template setting whose layout prints there, holding its file or empty', () => {
  const reads = [
    {
      pageId: 'page-home',
      theme: null,
      opening: true,
      logos: [
        logo('inline-svg', 'header', 'header', null, true, '#ffffff'),
        logo('images/demo/partner.png', 'footer', 'module-77', null, true, '#202020'),
        logo('images/demo/logo.png', 'offcanvas', null, null, true, '#ffffff')
      ]
    }
  ]
  const settings = [
    { key: 'site_logo', value: '', prints: [{ where: 'header', emptyShows: 'template-text' }] },
    {
      key: 'site_logo_small',
      value: 'images/demo/logo.png',
      prints: [{ where: 'offcanvas', emptyShows: 'nothing' }]
    },
    { key: 'site_logo_dark', value: '', prints: [{ where: 'header', emptyShows: null }] }
  ]
  const { logoSpots } = buildLogoSpots({
    reads,
    map: { entities: [], slots: [] },
    settings,
    isFreeHtml: () => false
  })
  assert.deepEqual(
    logoSpots.map((s) => [s.where, s.frameId, s.setting, s.emptyShows]),
    [
      ['header', null, 'site_logo', 'template-text'],
      ['offcanvas', null, 'site_logo_small', 'nothing'],
      ['footer', null, null, null]
    ]
  )
})

// A block layout of the template (a T4 ACM block) that prints the site profile logo itself, as a footer brand does.
const ACM_BRAND = `<?php
$fbSite = $doc->params->get('site-settings');
$fbClean = function ($url) { return $url; };
$fbLogo = $fbSite ? $fbClean($fbSite->get('site_logo')) : '';
$fbText = '<span class="mark"><svg></svg></span>';
?><a class="brand"><?php if ($fbLogo) : ?><img src="<?php echo $fbLogo; ?>"><?php else : ?><?php echo $fbText; ?><?php endif; ?></a>`

function acmSource() {
  const files = {
    'configuration.php': "public $sitename = 'Wren Example Tours';",
    'templates/demo_t4/etc/site/default.json': JSON.stringify({ site_logo: '' }),
    'templates/demo_t4/html/layouts/t4/element/logo.php': LAYOUT,
    'templates/demo_t4/acm/footer-brand/tmpl/style-1.php': ACM_BRAND,
    'templates/demo_t4/acm/hero/tmpl/style-1.php': '<h1><?php echo $title; ?></h1>'
  }
  const dirs = {
    'templates/demo_t4/acm': ['footer-brand', 'hero'],
    'templates/demo_t4/acm/footer-brand/tmpl': ['style-1.php', 'style-1.xml'],
    'templates/demo_t4/acm/hero/tmpl': ['style-1.php']
  }
  const acm = (type, style) =>
    JSON.stringify({
      'jatools-config': JSON.stringify({
        ':type': `demo_t4:${type}`,
        [type]: { [`jatools-layout-${type}`]: style }
      })
    })
  const rows = {
    'SHOW TABLES': [{ t: 'ab_extensions' }, { t: 'ab_menu' }],
    template_styles: [{ template: 'demo_t4' }],
    menu: [],
    extensions: [],
    modules: [
      { id: '460', params: acm('footer-brand', 'style-1') },
      { id: '461', params: acm('hero', 'style-1') },
      { id: '462', params: '{}' }
    ]
  }
  return {
    readFile: (rel) => files[rel] ?? null,
    listDir: (rel) => dirs[rel] ?? [],
    query: (sql) => rows[sql === 'SHOW TABLES' ? sql : /FROM ab_(\w+)/.exec(sql)?.[1]] ?? []
  }
}

test('a T4 block layout that prints the site profile logo is a place that setting prints, for the blocks using it', () => {
  assert.equal(variableOf(ACM_BRAND, 'site_logo'), 'fbLogo')
  assert.equal(emptyShowsOf(ACM_BRAND, 'fbLogo'), 'template-text')
  const settings = joomlaAdapter(acmSource()).logoSettings()
  const logo = settings.find((s) => s.key === 'site_logo')
  assert.deepEqual(
    logo.prints.filter((p) => p.blocks),
    [
      {
        where: 'module',
        layout: 'templates/demo_t4/acm/footer-brand/tmpl/style-1.php',
        blocks: ['module-460'],
        emptyShows: 'template-text'
      }
    ]
  )
  const reads = [
    {
      pageId: 'page-home',
      theme: null,
      opening: true,
      logos: [
        logo_('inline-svg', 'footer', 'module-460'),
        logo_('images/demo/partner.png', 'footer', 'module-77')
      ]
    }
  ]
  const { logoSpots } = buildLogoSpots({
    reads,
    map: { entities: [], slots: [] },
    settings,
    isFreeHtml: () => false
  })
  assert.deepEqual(
    logoSpots.map((s) => [s.block, s.setting, s.emptyShows]),
    [
      ['block-460', 'site_logo', 'template-text'],
      ['block-77', null, null]
    ]
  )
})

function logo_(file, region, block) {
  return logo(file, region, block, null, true, '#ffffff')
}

test('T4 footer logo placement follows effective layout files, not PHP or module names', () => {
  const footer = (content) =>
    JSON.stringify({ layout: { sections: [{ name: 'footer', contents: [content] }] } })
  const element = { type: 'element', element: 'logo', name: 'logo' }
  const shipped = 'templates/demo_t4/etc/layout/default.json'
  const local = 'templates/demo_t4/local/etc/layout/default.json'
  const settingsOf = (extra) => {
    const source = fakeSource()
    return joomlaAdapter({
      ...source,
      readFile: (file) => (Object.hasOwn(extra, file) ? extra[file] : source.readFile(file)),
      listDir: (dir) =>
        Object.keys(extra)
          .filter((f) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'))
          .map((f) => f.slice(dir.length + 1))
    })
      .logoSettings()
      .find((s) => s.key === 'site_logo')
  }
  const atFooter = (extra) => settingsOf(extra).prints.find((p) => p.where === 'footer')
  assert.equal(atFooter({ [shipped]: footer(element) }).emptyShows, 'name-as-text')
  assert.equal(atFooter({ [local]: footer(element) }).emptyShows, 'name-as-text')
  for (const replacement of [footer({ type: 'positions', name: 'logo' }), '{broken', ''])
    assert.equal(
      atFooter({ [shipped]: footer(element), [local]: replacement }),
      undefined,
      'local presence masks shipped placement'
    )
  assert.equal(atFooter({ [shipped]: footer({ type: 'block', block: 'logo' }) }), undefined)
  assert.equal(
    atFooter({
      [shipped]: JSON.stringify({ layout: { sections: [{ name: 'header', contents: [element] }] } })
    }),
    undefined
  )
  assert.equal(atFooter({}), undefined, 'the logo PHP alone proves no footer placement')

  const source = fakeSource()
  const settings = joomlaAdapter({
    ...source,
    readFile: (file) => (file === shipped ? footer(element) : source.readFile(file)),
    listDir: (dir) => (dir === 'templates/demo_t4/etc/layout' ? ['default.json'] : [])
  }).logoSettings()
  const { logoSpots } = buildLogoSpots({
    reads: logoReads,
    map,
    settings,
    isFreeHtml: (e) => e.identity?.module === 'mod_custom'
  })
  assert.equal(
    logoSpots.find((s) => s.frameId === 'block-40.1').emptyShows,
    'nothing',
    'free HTML still owns its logo'
  )
})

test('T4 explicit footer element preserves the independent ACM fallback', () => {
  const source = acmSource()
  const file = 'templates/demo_t4/etc/layout/default.json'
  const settings = joomlaAdapter({
    ...source,
    readFile: (f) =>
      f === file
        ? JSON.stringify({
            layout: { sections: [{ name: 'Footer', contents: [{ type: 'element', element: 'logo' }] }] }
          })
        : source.readFile(f),
    listDir: (dir) => (dir === 'templates/demo_t4/etc/layout' ? ['default.json'] : source.listDir(dir))
  }).logoSettings()
  assert.equal(settings[0].prints.find((p) => p.where === 'footer').emptyShows, 'name-as-text')
  const { logoSpots } = buildLogoSpots({
    reads: [{ pageId: 'page-home', opening: true, logos: [logo_('inline-svg', 'footer', 'module-460')] }],
    map: { entities: [], slots: [] },
    settings,
    isFreeHtml: () => false
  })
  assert.equal(logoSpots[0].emptyShows, 'template-text')
})
