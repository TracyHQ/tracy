// Template kit on a T3 template: blocks found on T3 markup in a real browser, the T3 layer of the Joomla adapter on a
// fake read-only source (style params, block layouts, LESS variables), the brand colour a T3 template declares in LESS,
// logo spots joined to template style slots, the batched file read byte for byte, and `--exclude-path` escaping.
// All data made up.
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { excludePatternsOf, pathPattern } from '../template-kit/lib/exclude.mjs'
import { findBlocks } from '../template-kit/lib/find-blocks.js'
import { joomlaAdapter } from '../template-kit/lib/site/adapters/joomla.mjs'
import {
  isT3,
  t3ColourVariables,
  t3EmptyShows,
  t3LogoSettings,
  t3NameFallsBack,
  t3ReadOf
} from '../template-kit/lib/site/adapters/joomla-t3.mjs'
import { siteSource, splitBatch } from '../template-kit/lib/site/adapters/source.mjs'
import { buildBrandColours } from '../template-kit/lib/site/brand-colours.mjs'
import { buildLogoSpots, logoSlotsOf } from '../template-kit/lib/site/logo-spots.mjs'

// ── Blocks on T3 markup ──────────────────────────────────────────────────────────────────────────────────

const T3_PAGE = `<!doctype html><html><head><style>
body{margin:0;width:1200px} div,header,footer,section{display:block} .box{height:120px}
#t3-off-canvas{position:fixed;left:-400px;top:0;width:300px;height:400px}
</style></head><body><div class="t3-wrapper">
<header id="t3-header" class="t3-header box"><nav class="t3-mainnav">Menu</nav>
  <div id="t3-off-canvas" class="t3-off-canvas"><div class="t3-module module" id="Mod1">Mobile menu</div></div></header>
<div class="wrap t3-slideshow"><div class="block-slideshow box" id="block-slideshow-101"><div id="block-slider-101">Slide</div></div></div>
<div class="section-inner"><div class="acm-container-tabs box" id="mod-105">
  <a href="#mod-105 .mod-106">New</a><div class="tab-pane mod-106">Products</div></div></div>
<div class="box" id="uber-clients-133">Clients</div>
<div class="box" id="gallery-120">Gallery one</div><div class="box" id="photos-120">Gallery two</div>
<div class="box" id="product-131">A product whose number is no module of this page</div>
<div id="t3-mainbody" class="t3-mainbody box"><div id="t3-content" class="t3-content">Article</div></div>
<footer id="t3-footer" class="t3-footer"><div class="t3-module module box" id="Mod114">Footer links</div></footer>
</div></body></html>`

const T3_ASSIGNED = [
  { entity: 'module-1', position: 'off-canvas' },
  { entity: 'module-101', position: 'slideshow' },
  { entity: 'module-105', position: 'section-1' },
  { entity: 'module-106', position: '' },
  { entity: 'module-114', position: 'footer-1' },
  { entity: 'module-120', position: 'section-2' },
  { entity: 'module-133', position: 'section-3' }
]

async function launch() {
  try {
    return await chromium.launch()
  } catch {
    return null
  }
}

test('T3 markup: template header, main body, and modules printed only with an id ending in their number', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.setContent(T3_PAGE)
    const { blocks } = await page.evaluate(findBlocks, T3_ASSIGNED)
    const by = Object.fromEntries(blocks.map((b) => [b.block, b]))
    assert.equal(by.header?.kind, 'template-header', '#t3-header is the template header')
    assert.equal(by['main-body']?.kind, 'component')
    assert.equal(by['main-body'].visible, true, '#t3-mainbody is the component area')
    assert.equal(by['module-114']?.kind, 'module', 'a #Mod<N> wrapper is found as on T4')
    assert.equal(by['module-1']?.visible, false, 'the off-canvas module is not visible')
    assert.equal(by['module-101']?.kind, 'module-id', 'an ACM block id ending in its module id')
    assert.equal(by['module-105']?.kind, 'module-id', 'a raw-chrome module id #mod-<N>')
    assert.deepEqual(by['module-105'].contains, ['module-106'], 'the tab inside it stays its own module')
    assert.equal(by['module-133']?.kind, 'module-id', 'any words before the number')
    assert.equal(by['module-120'], undefined, 'two elements end in 120: no guess')
    assert.equal(by['module-131'], undefined, 'a number of no assigned module is never a block')
    assert.equal(
      blocks.filter((b) => b.block === 'module-101').length,
      1,
      'the inner #block-slider-101 is the same block'
    )
  } finally {
    await browser.close()
  }
})

// ── The T3 layer of the Joomla adapter ───────────────────────────────────────────────────────────────────

const HEADER = `<?php
$sitename  = $this->params->get('sitename');
$logotype  = $this->params->get('logotype', 'text');
$logoimage = $logotype == 'image' ? $this->params->get('logoimage', T3Path::getUrl('images/logo.png', '', true)) : '';
$logoimgsm = ($logotype == 'image' && $this->params->get('enable_logoimage_sm', 0)) ? $this->params->get('logoimage_sm', T3Path::getUrl('images/logo-sm.png', '', true)) : false;
if (!$sitename) {
  $sitename = JFactory::getConfig()->get('sitename');
}
?>
<header id="t3-header"><div class="logo"><a title="<?php echo strip_tags($sitename) ?>">
<?php if($logotype == 'image'): ?><img class="logo-img" src="<?php echo $logoimage ?>" /><?php endif ?>
<?php if($logoimgsm) : ?><img class="logo-img-sm" src="<?php echo $logoimgsm ?>" /><?php endif ?>
<span><?php echo $sitename ?></span></a></div></header>`

const FOOTER = `<?php
$logotype  = $this->params->get('logofootertype', 'text');
$logoimage = $logotype == 'image' ? $this->params->get('logofooterimage', T3Path::getUrl('images/logo.png', '', true)) : '';
?><footer><?php if($logotype == 'image'): ?><img src="<?php echo $logoimage ?>" /><?php endif ?></footer>`

const PARAMS = {
  t3_template: '1',
  theme: '',
  logotype: 'image',
  logoimage: 'images/brand/main.png',
  enable_logoimage_sm: '1',
  logoimage_sm: 'images/brand/small.png',
  logofootertype: 'image',
  logofooterimage: 'images/brand/foot.png',
  sitename: ''
}

test('a T3 layout read through a ternary: the param, its default picture and what an empty value prints', () => {
  assert.deepEqual(t3ReadOf(HEADER, 'logoimage'), {
    variable: 'logoimage',
    fallback: "T3Path::getUrl('images/logo.png', '', true)",
    defaultFile: 'images/logo.png'
  })
  assert.equal(t3ReadOf(HEADER, 'logoimage_sm').variable, 'logoimgsm')
  assert.equal(t3ReadOf(HEADER, 'logofooterimage'), null)
  const has = (rel) => rel === 'images/logo.png'
  assert.equal(t3EmptyShows(HEADER, 'logoimage', has), 'template-picture')
  assert.equal(t3EmptyShows(HEADER, 'logoimage_sm', has), 'missing-picture')
  assert.equal(
    t3EmptyShows('<?php $l = $this->params->get("logo_x"); if ($l) : ?>x<?php endif; ?>', 'logo_x', has),
    'nothing'
  )
  assert.equal(t3NameFallsBack(HEADER), true)
  assert.equal(isT3('<extension><t3><base>base-bs3</base></t3></extension>'), true)
  assert.equal(isT3('<extension><name>tpl</name></extension>'), false)
  const settings = t3LogoSettings({
    params: PARAMS,
    layouts: [
      { where: 'header', php: HEADER, file: 'h' },
      { where: 'footer', php: FOOTER, file: 'f' }
    ],
    templateHas: has
  })
  assert.deepEqual(
    settings.map((s) => [s.key, s.value, s.prints.map((p) => `${p.where}:${p.emptyShows}`)]),
    [
      ['logotype', 'image', ['header:null']],
      ['logoimage', 'images/brand/main.png', ['header:template-picture']],
      ['logoimage_sm', 'images/brand/small.png', ['header:missing-picture']],
      ['logofootertype', 'image', ['footer:null']],
      ['logofooterimage', 'images/brand/foot.png', ['footer:template-picture']]
    ]
  )
})

test('LESS colour variables: resolved through every imported file, functions left to the compiled CSS', () => {
  const vars = t3ColourVariables(
    [
      {
        file: 'plugins/system/t3/base-bs3/bootstrap/less/variables.less',
        text: '@gray-darker: #222;\n@brand-primary: #337ab7;'
      },
      {
        file: 'templates/demo_t3/less/variables.less',
        text: [
          '/* brand */',
          '@brand-primary:   #2e8b57; // the accent',
          '// @brand-primary: #000000;',
          '@link-hover-color: darken(@brand-primary, 15%);',
          '@headings-color: @gray-darker;',
          '@font-size-base: 16px;'
        ].join('\n')
      }
    ],
    'demo_t3'
  )
  assert.deepEqual(vars, [
    { name: '@brand-primary', value: '#2e8b57', declaredIn: 'templates/demo_t3/less/variables.less' },
    { name: '@headings-color', value: '#222222', declaredIn: 'templates/demo_t3/less/variables.less' }
  ])
})

/** A fake read-only Joomla source with a T3 template: style params, two block layouts, LESS variables. */
function fakeT3Source() {
  const files = {
    'configuration.php': "public $sitename = 'Harbour Swim Club';",
    'templates/demo_t3/templateDetails.xml': '<extension><t3><base>base-bs3</base></t3></extension>',
    'templates/demo_t3/tpls/blocks/header.php': HEADER,
    'templates/demo_t3/tpls/blocks/footer.php': FOOTER,
    'templates/demo_t3/less/variables.less': '@brand-primary: #2e8b57;\n@headings-color: #1a1a1a;'
  }
  const rows = {
    'SHOW TABLES': [{ t: 'ab_extensions' }, { t: 'ab_menu' }],
    template_styles: [{ template: 'demo_t3', params: JSON.stringify(PARAMS) }],
    menu: [],
    extensions: []
  }
  return {
    readFile: (rel) => files[rel] ?? null,
    listDir: (rel) => (rel === 'templates/demo_t3/images' ? ['logo.png'] : []),
    query: (sql) => rows[sql === 'SHOW TABLES' ? sql : /FROM ab_(\w+)/.exec(sql)?.[1]] ?? []
  }
}

test('the Joomla adapter on a T3 template: logo and name settings from the home style, LESS colours', () => {
  const adapter = joomlaAdapter(fakeT3Source())
  assert.equal(adapter.framework, 't3')
  assert.deepEqual(
    adapter.logoSettings().map((s) => s.key),
    ['logotype', 'logoimage', 'logoimage_sm', 'logofootertype', 'logofooterimage']
  )
  assert.equal(adapter.logoSettings()[1].prints[0].emptyShows, 'template-picture')
  assert.deepEqual(adapter.nameSettings().at(-1), {
    kind: 'setting',
    scope: 'template',
    setting: 'template style param sitename (home style)',
    value: '',
    whenEmpty: 'prints the CMS site name'
  })
  assert.deepEqual(
    adapter.colourVariables().map((v) => [v.name, v.value]),
    [
      ['@brand-primary', '#2e8b57'],
      ['@headings-color', '#1a1a1a']
    ]
  )
})

// ── Brand colours declared in LESS ───────────────────────────────────────────────────────────────────────

test('a primary declared in LESS stays the brand colour though a status rule reuses it', () => {
  const styles = [
    {
      from: '/t3-assets/css/a.css',
      css: [
        'body{background:#ffffff;color:#333333}',
        'a{color:#1f6b40}a:hover{color:#c0392b}',
        '.btn-primary{color:#ffffff;background-color:#2e8b57}',
        '.bg-primary{background-color:#2e8b57}',
        '.invalid{border-color:#2e8b57}',
        '.text-danger{color:#1f6b40}'
      ].join('')
    }
  ]
  const before = buildBrandColours({ styles }).brandColours
  assert.equal(before.primary?.value, '#c0392b', 'without the LESS variable a status rule hides the accent')
  assert.equal(before.tokens.length, 0)
  const variables = [
    { name: '@brand-primary', value: '#2e8b57', declaredIn: 'templates/demo_t3/less/variables.less' },
    { name: '@brand-secondary', value: '#ff8800', declaredIn: 'templates/demo_t3/less/variables.less' },
    { name: '@headings-color', value: '#1a1a1a', declaredIn: 'templates/demo_t3/less/variables.less' }
  ]
  const { brandColours, errors } = buildBrandColours({ styles, variables })
  assert.equal(brandColours.primary.value, '#2e8b57')
  assert.ok(brandColours.primary.roles.includes('button-fill'))
  assert.ok(brandColours.primary.roles.includes('variable @brand-primary'))
  assert.equal(brandColours.secondary, null, 'a declared colour no rule paints casts no vote')
  assert.deepEqual(
    brandColours.tokens.map((t) => [t.name, t.value, t.side, t.brand ?? null]),
    [
      ['@brand-primary', '#2e8b57', 'base', 'primary'],
      ['@brand-secondary', '#ff8800', 'base', null],
      ['@headings-color', '#1a1a1a', 'base', null]
    ]
  )
  assert.equal(
    errors.some((e) => e.field === 'site.brandColours.tokens'),
    false
  )
  assert.ok(
    buildBrandColours({ styles }).errors.some((e) => e.field === 'site.brandColours.tokens'),
    'no variable anywhere is named, never passed silently'
  )
})

// ── Logo spots joined to template style slots ────────────────────────────────────────────────────────────

test('a T3 logo spot takes the template style slot of its file, and the setting it writes', () => {
  const map = {
    entities: [
      { key: 'templateStyle-9', kind: 'templateStyle', identity: { title: 'Demo - Default' } },
      { key: 'templateStyle-10', kind: 'templateStyle', identity: { title: 'Demo - Home' } }
    ],
    slots: [
      {
        key: 'templateStyle-9.0',
        entity: 'templateStyle-9',
        column: 'params',
        jsonPath: ['logoimage'],
        type: 'image',
        role: 'business.logo',
        sample: 'images/brand/main.png'
      },
      {
        key: 'templateStyle-9.1',
        entity: 'templateStyle-9',
        column: 'params',
        jsonPath: ['logofooterimage'],
        type: 'image',
        role: 'business.logo',
        sample: 'images/brand/foot.png'
      },
      {
        key: 'templateStyle-10.0',
        entity: 'templateStyle-10',
        column: 'params',
        jsonPath: ['logoimage'],
        type: 'image',
        role: 'business.logo',
        sample: 'images/brand/main.png'
      }
    ]
  }
  assert.deepEqual(
    logoSlotsOf(map).map((s) => s.setting),
    ['logoimage', 'logofooterimage', 'logoimage']
  )
  const logo = (file, region) => ({
    file,
    region,
    block: region === 'header' ? 'header' : null,
    shown: true,
    width: 60,
    height: 60,
    ground: { colour: region === 'footer' ? '#111111' : '#ffffff', picture: false },
    themeClass: null
  })
  const { logoSpots, errors } = buildLogoSpots({
    reads: [
      {
        pageId: 'page-home',
        theme: null,
        opening: true,
        logos: [logo('images/brand/main.png', 'header'), logo('images/brand/foot.png', 'footer')]
      }
    ],
    map,
    settings: [
      {
        key: 'logoimage',
        value: 'images/brand/main.png',
        prints: [{ where: 'header', emptyShows: 'template-picture' }]
      },
      {
        key: 'logofooterimage',
        value: 'images/brand/foot.png',
        prints: [{ where: 'footer', emptyShows: 'template-picture' }]
      }
    ],
    isFreeHtml: () => false
  })
  assert.deepEqual(
    logoSpots.map((s) => [s.where, s.frameId, s.setting, s.emptyShows]),
    [
      ['header', 'templateStyle-9.0', 'logoimage', 'template-picture'],
      ['footer', 'templateStyle-9.1', 'logofooterimage', 'template-picture']
    ]
  )
  assert.deepEqual(errors, [])
})

// ── The batched file read and the exclude patterns ───────────────────────────────────────────────────────

test('a batched read gives every file back byte for byte, with or without a final newline', () => {
  const MARK = '@@m '
  assert.deepEqual(splitBatch(`${MARK}a.ini\nx=1\n\n${MARK}b.ini\nno newline\n${MARK}c.ini\n\n`, MARK), [
    { file: 'a.ini', text: 'x=1\n' },
    { file: 'b.ini', text: 'no newline' },
    { file: 'c.ini', text: '' }
  ])
  const dir = mkdtempSync(join(tmpdir(), 'kit-batch-'))
  try {
    const root = join(dir, 'web')
    mkdirSync(join(root, 'language/overrides'), { recursive: true })
    const files = {
      'language/overrides/en-GB.override.ini': 'KEY="Value"\n',
      'language/en-GB/joomla.ini': 'A="b"\n\n',
      'plain.txt': 'no final newline'
    }
    mkdirSync(join(root, 'language/en-GB'), { recursive: true })
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text)
    // A files command that runs on this machine, as a container prefix would run in the container.
    const runner = join(dir, 'run-here')
    writeFileSync(runner, '#!/bin/sh\nexec "$@"\n')
    chmodSync(runner, 0o755)
    const src = siteSource({ filesCommand: runner, webroot: root })
    const got = src.readMany([...Object.keys(files), 'missing.ini'])
    assert.deepEqual(
      got.map((f) => [f.file, f.text]),
      [...Object.entries(files), ['missing.ini', '']]
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--exclude-path: a comma inside a pattern is written \\,', () => {
  assert.deepEqual(excludePatternsOf('*/by\\,*,*/dirDesc,,/test-*'), ['*/by,*', '*/dirDesc', '/test-*'])
  assert.deepEqual(excludePatternsOf(undefined), [])
  const [sorted] = excludePatternsOf('*/by\\,*').map(pathPattern)
  assert.equal(sorted('/shop/hats/by,product_name'), true)
  assert.equal(sorted('/shop/hats'), false)
})

// ── The id-suffix rule stays a T3 rule ───────────────────────────────────────────────────────────────────

// A T4 page: its layout sections and grid columns end in small numbers that collide with module ids. The main menu
// (module 1) prints with no wrapper of its own inside the header, and must never become the section that holds an
// unrelated block.
const T4_PAGE = `<!doctype html><html><head><style>
body{margin:0;width:1200px} div,header,section{display:block} .box{height:120px}
</style></head><body><div class="t4-wrapper">
<header id="t4-header" class="t4-header box"><nav class="t4-megamenu"><ul class="nav"><li>Home</li></ul></nav></header>
<div id="t4-section-1" class="t4-section box"><div class="t4-section-inner"><h2>Morning drills</h2><p>Fabricated text</p>
  <div id="col-md-1">Column</div></div></div>
<div class="box"><ul><li id="item-1">Fabricated list entry</li></ul></div>
<div id="t4-main-body" class="t4-main-body box">Article</div>
</div></body></html>`

test('a T4 section or grid id ending in a module number is never that module', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    // Each candidate alone on the page, so the no-second-element guard cannot hide a wrong match.
    for (const keep of ['t4-section-1', 'item-1']) {
      const other = keep === 'item-1' ? 't4-section-1' : 'item-1'
      await page.setContent(T4_PAGE.replace(`id="${other}"`, ''))
      const { blocks } = await page.evaluate(findBlocks, [{ entity: 'module-1', position: 'mainnav' }])
      assert.deepEqual(
        blocks.filter((b) => b.block === 'module-1'),
        [],
        `module 1 is not matched to #${keep}`
      )
      const tagged = await page.evaluate(
        (id) => document.getElementById(id).getAttribute('data-kit-block'),
        keep
      )
      assert.equal(tagged, null, `#${keep} carries no block`)
    }
  } finally {
    await browser.close()
  }
})

test('on a T3 page a layout or grid id ending in a module number is never that module', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.setContent(
      T3_PAGE.replace(
        '<div id="t3-mainbody"',
        '<div id="t3-section-7" class="box">Layout row</div><div id="t3-mainbody"'
      )
    )
    const { blocks } = await page.evaluate(findBlocks, [...T3_ASSIGNED, { entity: 'module-7', position: '' }])
    assert.equal(
      blocks.find((b) => b.block === 'module-7'),
      undefined,
      '#t3-section-7 is template layout'
    )
  } finally {
    await browser.close()
  }
})
