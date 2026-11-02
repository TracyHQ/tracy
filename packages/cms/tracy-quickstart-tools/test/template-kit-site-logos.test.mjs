// Template kit, site part: logo spots from fabricated browser reads in two themes, the Joomla adapter on a fake
// read-only source (settings files, a layout, menu rows), and the whole `site` built from them. All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { joomlaAdapter, prefixOf, readConfig } from '../template-kit/lib/site/adapters/joomla.mjs'
import { emptyShowsOf, variableOf } from '../template-kit/lib/site/adapters/joomla-t4.mjs'
import { mysqlPrefix, parseBatch, siteSource } from '../template-kit/lib/site/adapters/source.mjs'
import { stylesOfHtml } from '../template-kit/lib/site/browse-site.mjs'
import { buildLogoSpots, logoFrameIds } from '../template-kit/lib/site/logo-spots.mjs'
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
