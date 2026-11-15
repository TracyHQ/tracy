/**
 * scripts/capture-contract.py run as a person runs it, on a few hand-written inventory rows.
 *
 * The Claude Cowork plugin binds a contract by finding each entity among EVERY row of the site's
 * table (trashed, unpublished and other-language rows included; menus on the site side only) and
 * refuses unless exactly one row matches. Measured 01/10 on JA Space 1.0.1: two `Hero` and two
 * `Clients` modules agreed on all five identity fields, every gate stayed green, and the bind
 * failed with `Missing or ambiguous entity: module-98` — on the customer's site, not at capture.
 * So the tool now tells such modules apart by the release's id, and refuses, writing nothing, a
 * contract that still cannot bind or that captured 0 entities, slots or pages.
 *
 * The plugin's two PHP helpers are stand-ins (`fixtures/capture-contract/`); nothing here
 * depends on what the real ones answer.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ungatedFactSlots } from '../../../../apps/tracy-web/src/lib/fact-fields.js'

const SCRIPT = fileURLToPath(new URL('../scripts/capture-contract.py', import.meta.url))
const SLOTS_HELPER = fileURLToPath(new URL('fixtures/capture-contract/ContentSlots.php', import.meta.url))
// Answers like the real helper: one slot per text node (the stub above answers none).
const PER_TEXT_HELPER = fileURLToPath(
  new URL('fixtures/capture-contract/ContentSlotsPerText.php', import.meta.url)
)
const FILES = ['manifest.json', 'content-map.json', 'presentation-lock.json']
// The tool spawns `php` itself (the access snapshot), so `scripts/test-support/php.mjs`'s docker
// fallback cannot stand in; its rule still holds: fail on CI, skip with the reason on a laptop.
const needsPhp = {
  skip:
    spawnSync('php', ['-v']).status === 0
      ? false
      : process.env.CI
        ? assert.fail('capture-contract.py runs `php`, and this CI host has none on PATH')
        : 'capture-contract.py runs `php`, and this host has none on PATH'
}

const style = (id, extra) => ({
  id,
  template: 'tracy',
  title: 'Tracy - Default',
  client_id: '0',
  home: '0',
  params: '{}',
  ...extra
})
const category = (id, extra) => ({
  id,
  extension: 'com_content',
  path: 'blog',
  language: '*',
  published: '1',
  title: 'Blog',
  ...extra
})
const module = (id, extra) => ({
  id,
  title: 'Hero',
  module: 'mod_custom',
  position: 'top',
  language: '*',
  client_id: '0',
  published: '1',
  note: '',
  access: '1',
  publish_up: null,
  publish_down: null,
  content: '',
  ...extra
})
const article = (id, extra) => ({
  id,
  alias: 'welcome',
  catid: '8',
  language: '*',
  state: '1',
  title: 'Welcome',
  introtext: '',
  fulltext: '',
  ...extra
})
const menu = (id, extra) => ({
  id,
  path: 'home',
  menutype: 'tracy',
  language: '*',
  client_id: '0',
  published: '1',
  title: 'Home',
  link: 'index.php?option=com_content&view=article&id=3',
  template_style_id: '0',
  ...extra
})

/** One of each kind, nothing shared: binds as captured. */
const clean = () => ({
  categories: [category('8')],
  modules: [module('1')],
  content: [article('3')],
  menu: [menu('101')],
  template_styles: [style('9', { home: '1' })],
  modules_menu: [],
  viewlevels: [],
  usergroups: [],
  assets: []
})

/** Run the tool on `inventory` (and `countsFrom`, when given) into a fresh output folder. */
function capture(
  inventory,
  {
    countsFrom,
    args = [],
    existing,
    previous,
    blockFolders = [],
    schemas = {},
    files = {},
    helper = SLOTS_HELPER
  } = {}
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'capture-contract-'))
  mkdirSync(path.join(dir, 'webroot/templates/tracy'), { recursive: true })
  writeFileSync(path.join(dir, 'webroot/templates/tracy/index.php'), '<?php\n')
  // `files`: webroot-relative path -> content (a template's form XML, a module's manifest).
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, 'webroot', rel)), { recursive: true })
    writeFileSync(path.join(dir, 'webroot', rel), body)
  }
  for (const block of [...blockFolders, ...Object.keys(schemas)])
    mkdirSync(path.join(dir, 'webroot/templates/tracy/acm', block, 'tmpl'), { recursive: true })
  // `schemas`: block name -> its style-1.xml, the ACM schema the tool reads field types from.
  for (const [block, xml] of Object.entries(schemas))
    writeFileSync(path.join(dir, 'webroot/templates/tracy/acm', block, 'tmpl/style-1.xml'), xml)
  writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify(inventory))
  writeFileSync(
    path.join(dir, 'release.json'),
    JSON.stringify({ id: 'quickstart/test/j6', version: '1.0.0' })
  )
  const out = path.join(dir, 'out')
  if (existing) {
    mkdirSync(out)
    for (const name of FILES) writeFileSync(path.join(out, name), existing)
  }
  if (countsFrom) {
    writeFileSync(path.join(dir, 'counts.json'), JSON.stringify(countsFrom))
    args = [...args, '--counts-from', path.join(dir, 'counts.json')]
  }
  // `previous`: the previous version's content map, handed to --previous-map.
  if (previous) {
    writeFileSync(path.join(dir, 'previous-map.json'), JSON.stringify(previous))
    args = [...args, '--previous-map', path.join(dir, 'previous-map.json')]
  }
  const run = spawnSync(
    'python3',
    [
      SCRIPT,
      '--webroot',
      path.join(dir, 'webroot'),
      '--inventory',
      path.join(dir, 'inventory.json'),
      '--manifest',
      path.join(dir, 'release.json'),
      '--slots-helper',
      helper,
      '--out',
      out,
      '--file-roots',
      'templates/tracy',
      ...args
    ],
    { encoding: 'utf8' }
  )
  const read = (name) => JSON.parse(readFileSync(path.join(out, name), 'utf8'))
  return { ...run, out, read }
}

function assertWritten(run) {
  assert.equal(run.status, 0, run.stderr)
  for (const name of FILES) assert.ok(existsSync(path.join(run.out, name)), name)
  assert.deepEqual(Object.keys(JSON.parse(run.stdout.trim().split('\n').at(-1))), [
    'entities',
    'slots',
    'files'
  ])
}

/** A refusal: non-zero exit, a message on stderr rather than a Python trace, and no file written. */
function assertRefused(run) {
  assert.notEqual(run.status, 0, run.stdout)
  assert.match(run.stderr, /^Contract not written:/m)
  assert.doesNotMatch(run.stderr, /Traceback/)
  assert.ok(!existsSync(run.out) || readdirSync(run.out).length === 0, 'nothing written')
}

const identities = (run) =>
  Object.fromEntries(run.read('content-map.json').entities.map((e) => [e.key, e.identity]))

test(
  'two modules agreeing on all five identity fields both carry their own id; the others do not',
  needsPhp,
  () => {
    const inv = clean()
    inv.modules = [module('1'), module('2'), module('5', { title: 'Footer' })]
    const run = capture(inv)
    assertWritten(run)
    const ids = identities(run)
    assert.deepEqual(Object.entries(ids['module-1']), [
      ['title', 'Hero'],
      ['module', 'mod_custom'],
      ['position', 'top'],
      ['language', '*'],
      ['client_id', '0'],
      ['id', '1']
    ])
    assert.equal(ids['module-2'].id, '2')
    assert.equal('id' in ids['module-5'], false)
  }
)

test('a module duplicated only in the --counts-from inventory still carries its id', needsPhp, () => {
  const inv = clean()
  const whole = clean()
  whole.modules = [module('1'), module('2')]
  const run = capture(inv, { countsFrom: whole })
  assertWritten(run)
  assert.equal(identities(run)['module-1'].id, '1')
})

test(
  'a null and an empty identity field are the same to the plugin, so those modules carry their id',
  needsPhp,
  () => {
    const inv = clean()
    inv.modules = [module('1', { position: null }), module('2', { position: '' })]
    const run = capture(inv)
    assertWritten(run)
    assert.equal(identities(run)['module-1'].id, '1')
    assert.equal(identities(run)['module-2'].id, '2')
  }
)

test('without duplicates no identity carries an id', needsPhp, () => {
  const run = capture(clean())
  assertWritten(run)
  for (const [key, identity] of Object.entries(identities(run))) assert.equal('id' in identity, false, key)
})

test(
  'a duplicate the tool cannot tell apart is refused, naming the entity and every matching row',
  needsPhp,
  () => {
    const inv = clean()
    inv.template_styles.push(style('10'))
    const run = capture(inv, { existing: '{"kept": true}\n' })
    assert.notEqual(run.status, 0)
    assert.doesNotMatch(run.stderr, /Traceback/)
    for (const key of ['templateStyle-9', 'templateStyle-10'])
      assert.match(run.stderr, new RegExp(`${key} \\(templateStyle\\) .* matches 2 rows`))
    assert.match(run.stderr, /row 9: \{"title": "Tracy - Default", "template": "tracy", "client_id": "0"\}/)
    assert.match(run.stderr, /row 10: /)
    assert.deepEqual(readdirSync(run.out).sort(), [...FILES].sort())
    for (const name of FILES)
      assert.equal(readFileSync(path.join(run.out, name), 'utf8'), '{"kept": true}\n', name)
  }
)

test('a capture of nothing is refused, naming all three counts', needsPhp, () => {
  const inv = clean()
  inv.categories = [category('8', { extension: 'com_users' })]
  inv.modules = [module('1', { client_id: '1' })]
  inv.content = [article('3', { state: '0' })]
  inv.menu = [menu('101', { menutype: 'mainmenu' })]
  inv.template_styles = [style('9', { template: 'cassiopeia', home: '1' })]
  const run = capture(inv)
  assertRefused(run)
  assert.match(run.stderr, /captured 0 entities, 0 slots, 0 pages/)
})

test('entities with no slot and no page are refused, naming only the counts that are 0', needsPhp, () => {
  const inv = clean()
  inv.modules = []
  inv.content = []
  inv.menu = []
  inv.template_styles = []
  const run = capture(inv)
  assertRefused(run)
  assert.match(run.stderr, /captured 0 slots, 0 pages/)
  assert.doesNotMatch(run.stderr, /0 entities/)
})

test(
  'a trashed article sharing alias, language and category with a captured one is refused',
  needsPhp,
  () => {
    const inv = clean()
    inv.content.push(article('4', { state: '-2' }))
    const run = capture(inv)
    assertRefused(run)
    assert.match(
      run.stderr,
      /article-3 \(article\) \{"alias": "welcome", "language": "\*"\} references \{"catid": "category-8"\} matches 2 rows/
    )
    assert.match(run.stderr, /row 3: .* state=1/)
    assert.match(run.stderr, /row 4: \{"alias": "welcome", "language": "\*", "catid": "8"\} state=-2/)
  }
)

test('a trashed article found only in the --counts-from inventory is refused too', needsPhp, () => {
  const whole = clean()
  whole.content.push(article('4', { state: '-2' }))
  const run = capture(clean(), { countsFrom: whole })
  assertRefused(run)
  assert.match(run.stderr, /row 4: .* state=-2/)
})

test('two articles with one alias and language in different categories are not duplicates', needsPhp, () => {
  const inv = clean()
  inv.categories.push(category('12', { path: 'news' }))
  inv.content.push(article('4', { catid: '12' }))
  assertWritten(capture(inv))
})

test('an administrator menu item does not count against a site menu item', needsPhp, () => {
  const inv = clean()
  inv.menu.push(menu('102', { client_id: '1' }))
  assertWritten(capture(inv))
})

test(
  '--languages without --counts-from: filtered rows cause no duplicate and counts stay on the filtered rows',
  needsPhp,
  () => {
    const inv = clean()
    inv.modules.push(module('2', { language: 'fr-FR' }))
    inv.content.push(article('4', { language: 'fr-FR' }))
    const run = capture(inv, { args: ['--languages', 'en-GB,*'] })
    assertWritten(run)
    assert.equal('id' in identities(run)['module-1'], false)
    assert.equal(run.read('presentation-lock.json').inventoryCounts.module, 1)
  }
)

test('an article whose category is not in the contract is refused with 0 matching rows', needsPhp, () => {
  const inv = clean()
  inv.content = [article('3', { catid: '99' })]
  const run = capture(inv)
  assertRefused(run)
  assert.match(run.stderr, /article-3 \(article\) .* references \{"catid": "category-99"\} matches 0 rows/)
})

test('every problem of one run is reported in one refusal', needsPhp, () => {
  const inv = clean()
  inv.template_styles.push(style('10'))
  inv.menu = []
  const run = capture(inv)
  assertRefused(run)
  assert.match(run.stderr, /templateStyle-9 /)
  assert.match(run.stderr, /templateStyle-10 /)
  assert.match(run.stderr, /captured 0 pages/)
  assert.doesNotMatch(run.stderr, /0 slots/)
})

/** A trashed ACM module whose block the template does not ship: the one thing --skip-trashed-modules is for. */
const trashedAcm = () => {
  const inv = clean()
  const config = JSON.stringify({ ':type': 'acm:teams', teams: { 'jatools-layout-teams': 'style-1' } })
  inv.modules = [
    module('1'),
    module('7', {
      title: '[Tracy] Team',
      module: 'mod_ja_acm',
      published: '-2',
      params: JSON.stringify({ 'jatools-config': config })
    })
  ]
  inv.modules_menu = [
    { id: '1', moduleid: '1', menuid: '101' },
    { id: '2', moduleid: '7', menuid: '101' }
  ]
  return inv
}

test(
  'a trashed module with a missing ACM schema is left out, with or without the flag (JA Directory #118, JA Vega #112)',
  needsPhp,
  () => {
    const plain = capture(trashedAcm())
    assertWritten(plain)
    assert.equal(
      plain.read('content-map.json').entities.some((e) => e.key === 'module-7'),
      false
    )
    assert.deepEqual(
      plain.read('presentation-lock.json').assignments.map((a) => a.moduleid),
      ['1']
    )
    const run = capture(trashedAcm(), { args: ['--skip-trashed-modules'] })
    assertWritten(run)
    const map = run.read('content-map.json')
    assert.equal(
      map.entities.some((e) => e.key === 'module-7'),
      false
    )
    assert.equal(
      map.entities.some((e) => e.key === 'module-1'),
      true
    )
    assert.deepEqual(
      run.read('presentation-lock.json').assignments.map((a) => a.moduleid),
      ['1']
    )
  }
)

test('--skip-trashed-modules changes nothing when no module is trashed', needsPhp, () => {
  const plain = capture(clean())
  const flagged = capture(clean(), { args: ['--skip-trashed-modules'] })
  assertWritten(flagged)
  for (const name of FILES)
    assert.equal(
      readFileSync(path.join(flagged.out, name), 'utf8'),
      readFileSync(path.join(plain.out, name), 'utf8')
    )
})

/** A PUBLISHED ACM module whose block the template has no folder for: it renders nothing (JA Vega j6 #121). */
const unshippedAcm = () => {
  const inv = trashedAcm()
  inv.modules[1].published = '1'
  return inv
}

test(
  'a published module of a block the template does not ship refuses the capture unless the flag is passed',
  needsPhp,
  () => {
    assert.notEqual(capture(unshippedAcm()).status, 0)
    assert.notEqual(
      capture(unshippedAcm(), { args: ['--skip-trashed-modules'] }).status,
      0,
      'the trashed flag does not cover a published module'
    )
    const run = capture(unshippedAcm(), { args: ['--skip-unshipped-block-modules'] })
    assertWritten(run)
    const map = run.read('content-map.json')
    assert.equal(
      map.entities.some((e) => e.key === 'module-7'),
      false
    )
    assert.equal(
      map.entities.some((e) => e.key === 'module-1'),
      true
    )
    assert.deepEqual(
      run.read('presentation-lock.json').assignments.map((a) => a.moduleid),
      ['1']
    )
  }
)

test(
  '--skip-unshipped-block-modules still refuses a block whose folder exists but lacks the schema',
  needsPhp,
  () => {
    const run = capture(unshippedAcm(), { args: ['--skip-unshipped-block-modules'], blockFolders: ['teams'] })
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /Missing ACM schema/)
  }
)

test('--skip-unshipped-block-modules changes nothing when every block is shipped', needsPhp, () => {
  const plain = capture(clean())
  const flagged = capture(clean(), { args: ['--skip-unshipped-block-modules'] })
  assertWritten(flagged)
  for (const name of FILES)
    assert.equal(
      readFileSync(path.join(flagged.out, name), 'utf8'),
      readFileSync(path.join(plain.out, name), 'utf8')
    )
})

/** One published ACM module of `block` holding `config` (the block's own object), titled like Tracy's. */
const acmInventory = (block, config) => {
  const inv = clean()
  inv.modules = [
    module('1'),
    module('7', {
      title: '[Tracy] Block',
      module: 'mod_ja_acm',
      params: JSON.stringify({
        'jatools-config': JSON.stringify({ ':type': `tracy:${block}`, [block]: config })
      })
    })
  ]
  inv.modules_menu = [
    { id: '1', moduleid: '1', menuid: '101' },
    { id: '2', moduleid: '7', menuid: '101' }
  ]
  return inv
}
const slotsOf = (run) =>
  run
    .read('content-map.json')
    .slots.filter((s) => s.entity === 'module-7')
    .map((s) => [s.jsonPath.map(String).join('|'), s.type, s.sample])

/** JA Smallbiz j6 `acm/pricing/tmpl/style-1.xml`, cut to the jatable field. */
const PRICING_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="pricing"><fieldset name="pricing-col">
  <field name="data" type="jatable">
    <item name="pricing-col-name" type="text"/>
    <item name="pricing-col-featured" type="radio"/>
    <item name="pricing-col-buttonlink" type="text"/>
  </field>
</fieldset></fields></form>`
/** JA Directory j6 module 88, cut: two feature rows of three columns. */
const PRICING = {
  'jatools-layout-pricing': 'style-1',
  'pricing[data]': {
    'pricing[data][pricing-col-name]': ['Platinum', 'Gold', 'Silver'],
    'pricing[data][pricing-col-featured]': ['0', '1', '0'],
    'pricing[data][pricing-col-buttonlink]': ['#', '#', '#'],
    data: [
      ['Unlimited bandwidth', 'b1', 'b1', 'b1'],
      ['1 GB File storage', 'b1', 'b1', 'b0']
    ],
    rows: 2,
    cols: 3,
    type: 'table'
  }
}

test(
  '--list-items captures the row labels of a jatable pricing table as text slots, not its ticks',
  needsPhp,
  () => {
    const plain = capture(acmInventory('pricing', PRICING), { schemas: { pricing: PRICING_XML } })
    assertWritten(plain)
    assert.equal(
      slotsOf(plain).some(([p]) => p.includes('|data|')),
      false,
      'without the flag the capture is the published one'
    )
    const run = capture(acmInventory('pricing', PRICING), {
      args: ['--list-items'],
      schemas: { pricing: PRICING_XML }
    })
    assertWritten(run)
    const rows = slotsOf(run).filter(([p]) => p.includes('|data|'))
    assert.deepEqual(rows, [
      ['pricing|pricing[data]|data|0|0', 'text', 'Unlimited bandwidth'],
      ['pricing|pricing[data]|data|1|0', 'text', '1 GB File storage']
    ])
    assert.ok(slotsOf(run).some(([p, t]) => p.endsWith('pricing-col-name]|0') && t === 'text'))
  }
)

/** JA Voyara j6 `acm/hero/tmpl/style-1.xml`, cut to the two buttons. */
const HERO_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="hero"><fieldset name="basic">
  <field name="button" type="text"/><field name="btn-link" type="text"/>
  <field name="button-2" type="text"/><field name="btn-link-2" type="text"/>
</fieldset></fields></form>`
/** JA Voyara j6 1.0.6 module 400, cut: the second button's link is "#". */
const HERO = {
  'jatools-layout-hero': 'style-1',
  button: 'Plan a trip',
  'btn-link': '/pages/contact',
  'button-2': 'Watch the film',
  'btn-link-2': '#'
}

test(
  '--link-fields-by-role captures a numbered ACM link field as a url slot whatever its value',
  needsPhp,
  () => {
    const plain = capture(acmInventory('hero', HERO), { schemas: { hero: HERO_XML } })
    assertWritten(plain)
    assert.deepEqual(
      slotsOf(plain).find(([p]) => p === 'hero|btn-link-2'),
      ['hero|btn-link-2', 'text', '#'],
      'without the flag the capture is the published one'
    )
    const run = capture(acmInventory('hero', HERO), {
      args: ['--link-fields-by-role'],
      schemas: { hero: HERO_XML }
    })
    assertWritten(run)
    assert.deepEqual(slotsOf(run), [
      ['hero|button', 'text', 'Plan a trip'],
      ['hero|btn-link', 'url', '/pages/contact'],
      ['hero|button-2', 'text', 'Watch the film'],
      ['hero|btn-link-2', 'url', '#']
    ])
  }
)

/** An invented social block: a repeatable row (an icon class, a name, a link) and one option named like an icon. */
const SOCIAL_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="social"><fieldset name="social-intro" multiple="1">
  <field name="font-icon" type="text"/><field name="title" type="text"/><field name="link" type="text"/>
</fieldset><fieldset name="basic"><field name="heading-icon" type="text"/></fieldset></fields></form>`
const SOCIAL = {
  'jatools-layout-social': 'style-1',
  'heading-icon': 'fa fa-star',
  'social-intro[font-icon]': ['fa fa-kite', 'fa fa-lantern'],
  'social-intro[title]': ['Kiteline', 'Lanternly'],
  'social-intro[link]': ['#', '#']
}

test(
  "--repeat-icons declares the icon field of a repeatable row, after the module's other slots and kept from Customize",
  needsPhp,
  () => {
    const plain = capture(acmInventory('social', SOCIAL), { schemas: { social: SOCIAL_XML } })
    assertWritten(plain)
    const before = slotsOf(plain)
    assert.equal(
      before.some(([p]) => p.includes('font-icon')),
      false,
      'without the flag the capture is the published one'
    )
    const run = capture(acmInventory('social', SOCIAL), {
      args: ['--repeat-icons'],
      schemas: { social: SOCIAL_XML }
    })
    assertWritten(run)
    assert.deepEqual(slotsOf(run), [
      ...before,
      ['social|social-intro[font-icon]|0', 'text', 'fa fa-kite'],
      ['social|social-intro[font-icon]|1', 'text', 'fa fa-lantern']
    ])
    const icons = run
      .read('content-map.json')
      .slots.filter((s) => (s.jsonPath ?? []).join('|').includes('font-icon'))
    assert.deepEqual(
      icons.map((s) => [s.key, s.customize]),
      [
        ['module-7.' + before.length, 'keep'],
        ['module-7.' + (before.length + 1), 'keep']
      ]
    )
  }
)

test(
  '--repeat-icons with --full-coverage still adds the row icons last, so no other slot key moves',
  needsPhp,
  () => {
    const keys = (run) =>
      run
        .read('content-map.json')
        .slots.filter((s) => s.entity === 'module-7')
        .map((s) => [s.key, s.column, (s.jsonPath ?? []).map(String).join('|'), s.sample])
    // A section heading the template's module form adds beside the block config: a slot the full coverage rules
    // declare after the block's own fields.
    const inventory = () => {
      const inv = acmInventory('social', SOCIAL)
      const block = inv.modules.find((m) => m.id === '7')
      block.params = JSON.stringify({ ...JSON.parse(block.params), 'main-section': 'Find us online' })
      return inv
    }
    const options = (args) => ({
      args,
      schemas: { social: SOCIAL_XML },
      files: { 'templates/tracy/etc/form/com_modules.module.xml': MODULE_FORM_XML }
    })
    const plain = capture(inventory(), options(['--full-coverage']))
    assertWritten(plain)
    const before = keys(plain)
    assert.ok(
      before.some(([, , p]) => p === 'main-section'),
      'the full coverage rules add a slot after the block fields'
    )
    const run = capture(inventory(), options(['--full-coverage', '--repeat-icons']))
    assertWritten(run)
    const after = keys(run)
    assert.deepEqual(after.slice(0, before.length), before)
    assert.deepEqual(
      after.slice(before.length).map(([, , p, sample]) => [p, sample]),
      [
        ['social|social-intro[font-icon]|0', 'fa fa-kite'],
        ['social|social-intro[font-icon]|1', 'fa fa-lantern']
      ]
    )
  }
)

test(
  'a trashed module whose ACM schema is shipped is still captured unless --skip-trashed-modules is passed',
  needsPhp,
  () => {
    const inv = trashedAcm()
    const schemas = {
      teams:
        '<?xml version="1.0"?><form><fields name="teams"><field name="title" type="text"/></fields></form>'
    }
    inv.modules[1].params = JSON.stringify({
      'jatools-config': JSON.stringify({
        ':type': 'acm:teams',
        teams: { 'jatools-layout-teams': 'style-1', title: 'Our team' }
      })
    })
    const kept = capture(inv, { schemas })
    assertWritten(kept)
    assert.ok(kept.read('content-map.json').entities.some((e) => e.key === 'module-7'))
    const skipped = capture(inv, { schemas, args: ['--skip-trashed-modules'] })
    assertWritten(skipped)
    assert.equal(
      skipped.read('content-map.json').entities.some((e) => e.key === 'module-7'),
      false
    )
  }
)

/** Tracy Business j6 `acm/tb-hero/tmpl/style-1.xml`, cut to the words, two counters and a branch. */
const HERO_STATS_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="tb-hero"><fieldset name="basic">
  <field name="title" type="text"/><field name="lead" type="textarea"/>
  <field name="stat-value" type="text"/><field name="stat-label" type="text"/>
  <field name="city" type="text"/><field name="addr" type="text"/>
</fieldset></fields></form>`
/** Tracy Business j6 1.2.2 module 441 and 812, cut: the title the pattern never names. */
const HERO_STATS = {
  'jatools-layout-tb-hero': 'style-1',
  title: 'Building the groundwork for',
  lead: 'Design–build main contractor for industrial parks',
  'tb-hero[stat-value]': ['380+', '0'],
  'tb-hero[stat-label]': ['Projects delivered', 'Serious incidents in 2025'],
  city: 'Moscow',
  addr: '7/22 Derbenevskaya emb., 8th floor'
}
/** path → requiresEvidence of the ACM module's slots. */
const gatedOf = (run) =>
  Object.fromEntries(
    run
      .read('content-map.json')
      .slots.filter((s) => s.entity === 'module-7')
      .map((s) => [s.jsonPath.map(String).join('|'), s.requiresEvidence])
  )

test(
  '--evidence-by-field gates a counter, a city and an address by the field, in a module no title pattern names',
  needsPhp,
  () => {
    const plain = capture(acmInventory('tb-hero', HERO_STATS), { schemas: { 'tb-hero': HERO_STATS_XML } })
    assertWritten(plain)
    assert.deepEqual(
      Object.values(gatedOf(plain)),
      Array.from({ length: 8 }, () => false),
      'without the flag the capture is the published one: by title only'
    )
    const run = capture(acmInventory('tb-hero', HERO_STATS), {
      args: ['--evidence-by-field'],
      schemas: { 'tb-hero': HERO_STATS_XML }
    })
    assertWritten(run)
    assert.deepEqual(gatedOf(run), {
      'tb-hero|title': false,
      'tb-hero|lead': false,
      'tb-hero|tb-hero[stat-value]|0': true,
      'tb-hero|tb-hero[stat-value]|1': true,
      'tb-hero|tb-hero[stat-label]|0': true,
      'tb-hero|tb-hero[stat-label]|1': true,
      'tb-hero|city': true,
      'tb-hero|addr': true
    })
  }
)

test(
  'regate-contract.mjs over a profile captured without the flag gives the flagged capture, byte for byte',
  needsPhp,
  async () => {
    const { regateProfile } = await import('../../../../scripts/regate-contract.mjs')
    const plain = capture(acmInventory('tb-hero', HERO_STATS), { schemas: { 'tb-hero': HERO_STATS_XML } })
    assertWritten(plain)
    const flagged = capture(acmInventory('tb-hero', HERO_STATS), {
      args: ['--evidence-by-field'],
      schemas: { 'tb-hero': HERO_STATS_XML }
    })
    assertWritten(flagged)
    assert.equal(regateProfile(plain.out), 6)
    assert.equal(
      readFileSync(path.join(plain.out, 'content-map.json'), 'utf8'),
      readFileSync(path.join(flagged.out, 'content-map.json'), 'utf8')
    )
    assert.equal(regateProfile(plain.out), 0, 'a gated profile is left as it is')
  }
)

// ── --full-coverage: every piece of demo content a visitor reads is declared ─────────────────────
// Measured 24/10/2026 on JA Boxing 1.0.2: 73% of its distinct demo text and 28% of its pictures were
// slots. The rest sat in an article's `images` and template extra fields, a module's template fields and
// shown title, a category title, a menu item's page title, contacts and tags. Each is declared with
// `customize: "keep"`: the site agent can find and edit it, the Customize engine leaves it alone.

const EXTRA_FIELDS_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="attribs"><fieldset name="extra-fields">
  <field name="ft-title" type="text"/>
  <field name="classes-level" type="list"/>
  <field name="classes-type" type="text"/>
  <field name="classes-video-lead" type="text"/>
  <field name="classes-info" type="subform" multiple="true"><form>
    <field name="project_label" type="text"/>
    <field name="feature_img" type="media"/>
    <field name="item_class" type="text"/>
  </form></field>
</fieldset></fields></form>`
const MODULE_FORM_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="params"><fieldset name="custom-field">
  <field name="bg-color" type="list"/>
  <field name="main-section" type="textarea"/>
  <field name="top-desc" type="textarea"/>
  <field name="title-btn" type="text"/>
  <field name="link-btn" type="text"/>
</fieldset></fields></form>`
const MOD_NEWS_XML = `<?xml version="1.0" encoding="utf-8"?>
<extension type="module"><config><fields name="params"><fieldset name="basic">
  <field name="introtext" type="textarea"/>
  <field name="date_format" type="text"/>
  <field name="count" type="number"/>
</fieldset></fields></config></extension>`
const ICONS_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="features"><fieldset name="basic">
  <field name="title" type="text"/>
  <field name="img-icon" type="media"/>
</fieldset></fields></form>`
const FULL_FILES = {
  'templates/tracy/etc/extrafields/classes.xml': EXTRA_FIELDS_XML,
  'templates/tracy/etc/form/com_modules.module.xml': MODULE_FORM_XML,
  'modules/mod_news/mod_news.xml': MOD_NEWS_XML
}
const fullInventory = () => {
  // The picture comes first in the module's JSON (as on JA Boxing): its new slot must still not shift the keys.
  const inv = acmInventory('features', {
    'features[img-icon]': ['images/icon-1.png', 'images/icon-2.png'],
    title: 'The workout'
  })
  inv.content = [
    article('5', { alias: 'from-the-owner', title: 'From the owner', created_by: '42' }),
    article('3', {
      created_by: '44',
      images: JSON.stringify({
        image_intro: 'images/intro-1.jpg#joomlaImage://local-images/intro-1.jpg?width=10&height=10',
        image_intro_alt: 'A boxer',
        image_fulltext: '',
        float_intro: 'left'
      }),
      attribs: JSON.stringify({
        show_title: '1',
        'ft-title': 'WHAT TO BRING',
        'classes-level': 'monthly',
        // JA Boxing: a text field whose name has "class" in it, holding words a visitor reads.
        'classes-type': 'Includes 2 fixed calendars:',
        'classes-video-lead': '7CZ5I-PZjEg',
        'classes-info': {
          'classes-info0': { project_label: 'MONDAY', feature_img: 'images/icon.png', item_class: 'wide' }
        }
      })
    })
  ]
  inv.modules.push(
    module('9', {
      title: 'Our Classes',
      module: 'mod_news',
      showtitle: '1',
      params: JSON.stringify({
        introtext: 'Sign up today',
        date_format: 'Y-m-d',
        count: 4,
        'bg-color': 'dark',
        'main-section': 'Our',
        'top-desc': 'Join over 100k',
        'title-btn': 'Start practicing',
        'link-btn': '#classes',
        header_class: 'big'
      })
    })
  )
  inv.modules_menu.push({ id: '3', moduleid: '9', menuid: '101' })
  inv.menu = [
    menu('101', {
      params: JSON.stringify({
        page_title: 'JA Boxing Gym',
        'menu-meta_description': 'Boxing studio',
        menu_show: 1
      })
    })
  ]
  inv.contact_details = [
    {
      id: '1',
      name: 'GET IN TOUCH',
      alias: 'contact',
      catid: '4',
      language: '*',
      published: '1',
      email_to: 'sale@getfit.com',
      telephone: '',
      misc: ''
    }
  ]
  inv.tags = [
    { id: '1', title: 'ROOT', path: '', parent_id: '0', language: '*', published: '1', description: '' },
    { id: '4', title: 'Boxer', path: 'boxer', parent_id: '1', language: '*', published: '1', description: '' }
  ]
  inv.fields = [
    {
      id: '1',
      name: 'phone',
      context: 'com_contact.mail',
      label: 'Phone',
      state: '1',
      params: '{"hint":"Your phone"}'
    }
  ]
  // The author of article 3, a second account nobody's post names, and the site owner's profile keys the dump never holds.
  inv.users = [
    { id: '44', name: 'Drew Stokes ', username: 'Drew_Stokes', admin: '0' },
    { id: '52', name: 'Site Owner', username: 'owner', admin: '0' },
    // The release's administrator wrote a post too; its public name remains author content.
    { id: '42', name: 'Tracy Agent', username: 'tracyagent', admin: '1' }
  ]
  inv.user_profiles = [
    { user_id: '44', profile_key: 'profile.aboutme', profile_value: '"<p>Loves to <b>box</b></p>"' },
    { user_id: '44', profile_key: 'profile.user_jobtitle', profile_value: '"Boxer"' },
    { user_id: '44', profile_key: 'profile.user_tagline', profile_value: '""' },
    { user_id: '44', profile_key: 'profile.user_avatar', profile_value: '"images\\/author\\/pic-4.jpg"' },
    // JA Impact prints the author's address under "Live in" on the author page.
    { user_id: '44', profile_key: 'profile.address1', profile_value: '"Brooklyn, New York"' },
    { user_id: '52', profile_key: 'profile.user_jobtitle', profile_value: '"Owner"' },
    // The release's Super User has a picture too: demo content, though its account is not.
    {
      user_id: '42',
      profile_key: 'profile.user_avatar',
      profile_value: '"images\\/author\\/pic-1.jpg#joomlaImage:\\/\\/local-images\\/author\\/pic-1.jpg"'
    }
  ]
  return inv
}
/** Each slot as `entity column path|xpath type sample customize`, for one readable comparison. */
const described = (run) =>
  run
    .read('content-map.json')
    .slots.map((s) =>
      [s.entity, s.column, (s.jsonPath ?? []).join('|'), s.type, s.sample, s.customize ?? '-'].join(' ')
    )

test(
  '--full-coverage keeps shipped administrator author names without exposing account fields',
  needsPhp,
  () => {
    const inv = clean()
    inv.content[0].created_by = '73'
    inv.content.push(article('4', { alias: 'second-post', created_by: '74' }))
    inv.users = [
      { id: '73', name: 'Release Author', username: 'release-author', admin: '1' },
      { id: '74', name: 'Other Author', username: 'other-author', admin: '0' },
      { id: '75', name: 'Unused Administrator', username: 'unused-admin', admin: '1' },
      { id: '76', name: 'Added Account', username: 'added-account', admin: '0' }
    ].map((user) => ({
      ...user,
      password: 'synthetic-security-sentinel',
      email: 'synthetic-security-sentinel',
      groups: ['synthetic-security-sentinel'],
      otpKey: 'synthetic-security-sentinel'
    }))
    inv.user_profiles = [
      { user_id: '73', profile_key: 'profile.user_avatar', profile_value: '"images/owner.png"' },
      { user_id: '74', profile_key: 'profile.user_jobtitle', profile_value: '"Editor"' }
    ]
    const run = capture(inv, { args: ['--full-coverage'] })
    assertWritten(run)
    const map = run.read('content-map.json')
    const lock = run.read('presentation-lock.json')
    const owner = map.entities.find((e) => e.key === 'user-73')
    assert.deepEqual(owner, {
      key: 'user-73',
      kind: 'user',
      identity: { username: 'release-author' },
      sourceId: 73
    })
    for (const [id, name] of [
      ['73', 'Release Author'],
      ['74', 'Other Author']
    ]) {
      const slots = map.slots.filter((s) => s.entity === `user-${id}`)
      assert.equal(slots.length, 1)
      assert.equal(slots[0].key, `user-${id}.0`)
      assert.equal(slots[0].column, 'name')
      assert.equal(slots[0].sample, name)
      assert.equal(slots[0].type, 'text')
      assert.equal(slots[0].customize, 'keep')
    }
    assert.deepEqual(lock.entities['user-73'], { name: 'Release Author', username: 'release-author' })
    assert.deepEqual(lock.entities['user-74'], { name: 'Other Author', username: 'other-author' })
    assert.deepEqual(
      map.entities.find((e) => e.key === 'userProfile-7303'),
      {
        key: 'userProfile-7303',
        kind: 'userProfile',
        identity: { field: 'user_avatar', user_id: '73' },
        sourceId: 7303
      }
    )
    assert.deepEqual(
      map.entities.find((e) => e.key === 'userProfile-7401'),
      {
        key: 'userProfile-7401',
        kind: 'userProfile',
        identity: { field: 'user_jobtitle' },
        identityReferences: { user_id: 'user-74' },
        sourceId: 7401
      }
    )
    for (const id of ['75', '76']) {
      assert.ok(!map.entities.some((e) => e.key === `user-${id}`))
      assert.ok(!lock.entities[`user-${id}`])
    }
    assert.ok(!('user' in lock.inventoryCounts) && !('userProfile' in lock.inventoryCounts))
    assert.ok(!JSON.stringify([map, lock]).includes('synthetic-security-sentinel'))
  }
)

test('--full-coverage refuses ambiguous shipped author usernames across admin categories', needsPhp, () => {
  const inv = clean()
  inv.content[0].created_by = '73'
  inv.users = [
    { id: '73', name: 'Release Author', username: 'same-author', admin: '1' },
    { id: '74', name: 'Unused Account', username: 'same-author', admin: '0' }
  ]
  const run = capture(inv, { args: ['--full-coverage'] })
  assertRefused(run)
  assert.match(run.stderr, /user-73 \(user\).*matches 2 rows/)
})

test(
  '--full-coverage keeps numeric administrator custom-field identities beside their public name',
  needsPhp,
  () => {
    const inv = clean()
    inv.content[0].created_by = '73'
    inv.content.push(article('4', { alias: 'second-post', created_by: '74' }))
    inv.users = [
      { id: '73', name: 'Release Author', username: 'release-author', admin: '1' },
      { id: '74', name: 'Other Author', username: 'other-author', admin: '0' }
    ]
    inv.fields = [{ id: '1', name: 'bio', context: 'com_users.user', state: '1', type: 'text' }]
    inv.fields_values = [
      { field_id: '1', item_id: '73', value: 'Owner biography' },
      { field_id: '1', item_id: '74', value: 'Editor biography' }
    ]
    const run = capture(inv, { args: ['--full-coverage'] })
    assertWritten(run)
    const fields = run.read('content-map.json').entities.filter((e) => e.kind === 'fieldValue')
    assert.deepEqual(fields, [
      {
        key: 'fieldValue-1000000073',
        kind: 'fieldValue',
        identity: { field: 'bio', context: 'com_users.user', item_id: '73' },
        sourceId: 1000000073
      },
      {
        key: 'fieldValue-1000000074',
        kind: 'fieldValue',
        identity: { field: 'bio', context: 'com_users.user' },
        identityReferences: { item_id: 'user-74' },
        sourceId: 1000000074
      }
    ])
  }
)

test('--full-coverage declares the rest of what a visitor reads, each kept from Customize', needsPhp, () => {
  const args = ['--module-prefix', '', '--list-items']
  const plain = capture(fullInventory(), { args, schemas: { features: ICONS_XML }, files: FULL_FILES })
  assertWritten(plain)
  const run = capture(fullInventory(), {
    args: [...args, '--full-coverage'],
    schemas: { features: ICONS_XML },
    files: FULL_FILES
  })
  assertWritten(run)
  const slots = described(run)
  // What a capture without the flag declared is still there, in the same order, under the same keys.
  const before = plain.read('content-map.json').slots
  const after = new Map(run.read('content-map.json').slots.map((s) => [s.key, s]))
  for (const slot of before) assert.deepEqual(after.get(slot.key), slot, slot.key)
  for (const want of [
    'article-3 images image_intro image images/intro-1.jpg#joomlaImage://local-images/intro-1.jpg?width=10&height=10 keep',
    'article-3 images image_intro_alt text A boxer keep',
    'article-3 attribs ft-title text WHAT TO BRING keep',
    'article-3 attribs classes-type text Includes 2 fixed calendars: keep',
    'article-3 attribs classes-video-lead text 7CZ5I-PZjEg keep',
    'article-3 attribs classes-info|classes-info0|project_label text MONDAY keep',
    'article-3 attribs classes-info|classes-info0|feature_img image images/icon.png keep',
    'module-7 params features|features[img-icon]|0 image images/icon-1.png keep',
    'module-9 title  text Our Classes keep',
    'module-9 params introtext text Sign up today keep',
    'module-9 params main-section text Our keep',
    'module-9 params top-desc text Join over 100k keep',
    'module-9 params title-btn text Start practicing keep',
    'module-9 params link-btn url #classes keep',
    'category-8 title  text Blog keep',
    'menuItem-101 params page_title text JA Boxing Gym keep',
    'menuItem-101 params menu-meta_description text Boxing studio keep',
    'contact-1 name  text GET IN TOUCH keep',
    'contact-1 email_to  text sale@getfit.com keep',
    'tag-4 title  text Boxer keep',
    'field-1 label  text Phone keep',
    'field-1 params hint text Your phone keep',
    'user-42 name  text Tracy Agent keep',
    'user-44 name  text Drew Stokes  keep',
    'userProfile-4401 value  text Boxer keep',
    'userProfile-4403 value  image images/author/pic-4.jpg keep',
    'userProfile-4404 value  text Brooklyn, New York keep',
    'userProfile-4203 value  image images/author/pic-1.jpg#joomlaImage://local-images/author/pic-1.jpg keep'
  ])
    assert.ok(slots.includes(want), `missing: ${want}\n${slots.join('\n')}`)
  // Options are not words: a list field, a class, a date format, a number, the module chrome's own params.
  for (const name of [
    'classes-level',
    'item_class',
    'date_format',
    'count',
    'bg-color',
    'header_class',
    'float_intro'
  ])
    assert.ok(!slots.some((s) => s.split(' ')[2].split('|').includes(name)), `${name} is not content`)
  // Joomla's tag tree root is not a tag a visitor reads.
  assert.ok(!slots.some((s) => s.startsWith('tag-1 ')))
  const map = run.read('content-map.json')
  assert.deepEqual(
    map.entities.filter((e) => ['contact', 'tag', 'field'].includes(e.kind)).map((e) => [e.key, e.identity]),
    [
      ['contact-1', { alias: 'contact', catid: '4', language: '*' }],
      ['tag-4', { path: 'boxer', language: '*' }],
      ['field-1', { name: 'phone', context: 'com_contact.mail' }]
    ]
  )
  // (The bio is markup: the test helper answers no HTML slots, so it has no entity here.)
  // An author is matched by username, an author's profile value by its field and its author (the plugin's
  // UserProfileKey id: user id x 100 + the key's place); an account no captured post names is not one.
  assert.deepEqual(
    map.entities
      .filter((e) => ['user', 'userProfile'].includes(e.kind))
      .map((e) => [e.key, e.identity, e.identityReferences ?? null, e.sourceId]),
    [
      ['user-42', { username: 'tracyagent' }, null, 42],
      ['user-44', { username: 'Drew_Stokes' }, null, 44],
      ['userProfile-4401', { field: 'user_jobtitle' }, { user_id: 'user-44' }, 4401],
      ['userProfile-4403', { field: 'user_avatar' }, { user_id: 'user-44' }, 4403],
      ['userProfile-4404', { field: 'address1' }, { user_id: 'user-44' }, 4404],
      // The existing administrator profile keeps its numeric identity beside the new public name slot.
      ['userProfile-4203', { field: 'user_avatar', user_id: '42' }, null, 4203]
    ]
  )
  // The lock keeps an author's name and username, never the account.
  const lock = run.read('presentation-lock.json')
  assert.deepEqual(lock.entities['user-42'], { name: 'Tracy Agent', username: 'tracyagent' })
  assert.deepEqual(lock.entities['user-44'], { name: 'Drew Stokes ', username: 'Drew_Stokes' })
  // The plugin counts every row of a kind it governs; the lock says how many the release has.
  // People are not counted: every provision adds the owner's account.
  const counts = lock.inventoryCounts
  assert.ok(!('user' in counts) && !('userProfile' in counts))
  assert.deepEqual([counts.contact, counts.tag, counts.field], [1, 2, 1])
  // A contact's address book is the customer's to state.
  assert.equal(
    map.slots.find((s) => s.entity === 'contact-1' && s.column === 'email_to').requiresEvidence,
    true
  )
})

test(
  '--full-coverage leaves out a module option typed as text: how many items, how many per row, an opacity',
  needsPhp,
  () => {
    // A shop module (VirtueMart's product module) types its counts as text fields; their demo values are numbers.
    const shopXml = `<?xml version="1.0" encoding="utf-8"?>
<extension type="module"><config><fields name="params"><fieldset name="basic">
  <field name="headerText" type="text"/>
  <field name="max_items" type="text"/>
  <field name="products_per_row" type="text"/>
  <field name="img-opacity" type="text"/>
</fieldset></fields></config></extension>`
    const inv = fullInventory()
    inv.modules.push(
      module('12', {
        title: 'New Arrivals',
        module: 'mod_shop_products',
        params: JSON.stringify({
          headerText: 'Fresh in this week',
          max_items: '8',
          products_per_row: '4',
          'img-opacity': '100'
        })
      })
    )
    inv.modules_menu.push({ id: '12', moduleid: '12', menuid: '101' })
    const run = capture(inv, {
      args: ['--module-prefix', '', '--list-items', '--full-coverage'],
      schemas: { features: ICONS_XML },
      files: { ...FULL_FILES, 'modules/mod_shop_products/mod_shop_products.xml': shopXml }
    })
    assertWritten(run)
    assert.deepEqual(
      described(run).filter((s) => s.startsWith('module-12 ')),
      ['module-12 params headerText text Fresh in this week keep']
    )
  }
)

test(
  "--full-coverage reads a module's template fields from the template's form for that module, and a contact's links",
  needsPhp,
  () => {
    // JA Kids Corner: `etc/form/mod_articles_category.xml` adds a "view all" link to the category module, and the
    // contact's social links sit in its `params` (Joomla's own `linka` … `linke`).
    const categoryForm = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="params"><fieldset name="custom-field">
  <field name="show-link" type="list"/>
  <field name="title-category" type="text"/>
</fieldset></fields></form>`
    const inv = fullInventory()
    inv.modules.push(
      module('13', {
        title: 'Programs',
        module: 'mod_articles_category',
        params: JSON.stringify({ 'show-link': '1', 'title-category': 'View All Programs' })
      })
    )
    inv.modules_menu.push({ id: '13', moduleid: '13', menuid: '101' })
    inv.contact_details[0].params = JSON.stringify({
      show_links: '1',
      linka_name: 'facebook',
      linka: 'https://joomlart.com',
      linkb_name: '',
      linkb: false
    })
    const run = capture(inv, {
      args: ['--module-prefix', '', '--list-items', '--full-coverage'],
      schemas: { features: ICONS_XML },
      files: { ...FULL_FILES, 'templates/tracy/etc/form/mod_articles_category.xml': categoryForm }
    })
    assertWritten(run)
    const slots = described(run)
    assert.deepEqual(
      slots.filter((s) => s.startsWith('module-13 params')),
      ['module-13 params title-category text View All Programs keep']
    )
    assert.deepEqual(
      slots.filter((s) => s.startsWith('contact-1 params')),
      [
        'contact-1 params linka_name text facebook keep',
        'contact-1 params linka url https://joomlart.com keep'
      ]
    )
    // A contact's own links are the customer's to state, as its web page is.
    const link = run
      .read('content-map.json')
      .slots.find((s) => s.entity === 'contact-1' && s.jsonPath?.[0] === 'linka')
    assert.equal(link.requiresEvidence, true)
  }
)

test(
  "--full-coverage reads JA content types, Joomla's own article fields, an article's meta description and byline, a login page's words, a jaitems field's rows and a contact's picture",
  needsPhp,
  () => {
    // JA Symphony 1.0.5: an audio article keeps its tracks in `ctm_audio`, a `jaitems` field of the template's
    // content type (`contenttype/types/audio.xml`, not `etc/extrafields/`), and a video its poster in `ctm_thumbnail`.
    const audioXml = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="attribs"><fieldset name="content_meta">
  <field name="ctm_content_type" type="hidden"/>
  <field name="ctm_audio" type="jaitems">
    <item name="audio-src" type="text"/>
    <item name="audio-title" type="text"/>
  </field>
  <field name="ctm_thumbnail" type="media"/>
  <field name="ctm_width" type="text"/>
</fieldset></fields></form>`
    // JA Impact 1.0.5: an event's button prints Joomla's own "Read more" text field (`alternative_readmore`).
    const coreArticleXml = `<?xml version="1.0" encoding="utf-8"?>
<form><field name="note" type="text"/><fields name="attribs"><fieldset name="basic">
  <field name="show_title" type="list"/>
  <field name="alternative_readmore" type="text"/>
</fieldset></fields></form>`
    // JA Impact 1.0.5: JA Masthead keeps a title per page in `menuitem_config`, a `jaitems` field whose rows are
    // stored under the keys "0", "1"… (an object), not as a list.
    const mastheadXml = `<?xml version="1.0" encoding="utf-8"?>
<extension type="module"><config><fields name="params"><fieldset name="basic">
  <field name="menuitem_config" type="jaitems">
    <item name="item_id" type="menuitem"/>
    <item name="title" type="text"/>
    <item name="background" type="media"/>
  </field>
</fieldset></fields></config></extension>`
    const inv = fullInventory()
    inv.content[1].attribs = JSON.stringify({
      ...JSON.parse(inv.content[1].attribs),
      alternative_readmore: 'Join our event',
      note: 'not an attribs field',
      ctm_content_type: 'audio',
      ctm_audio: { 'audio-src': ['images/audio/item-1.mp3'], 'audio-title': ['Bit Rush'] },
      ctm_thumbnail: 'images/tours/item-1.jpg',
      ctm_width: '640'
    })
    inv.modules.push(
      module('14', {
        title: 'JA Masthead',
        module: 'mod_jamasthead',
        params: JSON.stringify({
          menuitem_config: {
            item_id: { 0: ['102'], 2: ['116'] },
            title: { 0: 'Who we are', 2: 'Blog' },
            background: { 0: 'images/hero/hero-1.jpg', 2: '' }
          }
        })
      })
    )
    inv.modules_menu.push({ id: '14', moduleid: '14', menuid: '101' })
    inv.contact_details[0].image = 'images/others/avatar-contact.jpg'
    // JA Kinetic 1.0.10: a blog post prints its meta description and the byline `created_by_alias`.
    inv.content[1].metadesc = 'How we cut retries to survive it.'
    inv.content[1].created_by_alias = 'Dana Reyes'
    // JA Kinetic 1.0.10: the sign-in page prints its menu item's login description above the form.
    inv.menu[0].params = JSON.stringify({ login_description: 'Pick up right where you left off.' })
    const run = capture(inv, {
      args: ['--module-prefix', '', '--list-items', '--full-coverage'],
      schemas: { features: ICONS_XML },
      files: {
        ...FULL_FILES,
        'templates/tracy/contenttype/types/audio.xml': audioXml,
        'administrator/components/com_content/forms/article.xml': coreArticleXml,
        'modules/mod_jamasthead/mod_jamasthead.xml': mastheadXml
      }
    })
    assertWritten(run)
    const slots = described(run)
    for (const want of [
      'article-3 attribs alternative_readmore text Join our event keep',
      'article-3 attribs ctm_audio|audio-src|0 image images/audio/item-1.mp3 keep',
      'article-3 attribs ctm_audio|audio-title|0 text Bit Rush keep',
      'article-3 attribs ctm_thumbnail image images/tours/item-1.jpg keep',
      'module-14 params menuitem_config|title|0 text Who we are keep',
      'module-14 params menuitem_config|title|2 text Blog keep',
      'module-14 params menuitem_config|background|0 image images/hero/hero-1.jpg keep',
      'contact-1 image  image images/others/avatar-contact.jpg keep',
      'article-3 metadesc  text How we cut retries to survive it. keep',
      'article-3 created_by_alias  text Dana Reyes keep',
      'menuItem-101 params login_description text Pick up right where you left off. keep'
    ])
      assert.ok(slots.includes(want), `missing: ${want}\n${slots.join('\n')}`)
    // The form types the masthead's fields, so the JSON walk declares them; the per-page masthead rule adds no second
    // slot for the same field.
    const masthead = slots.filter((s) => s.startsWith('module-14 params menuitem_config|'))
    assert.deepEqual(
      masthead.map((s) => s.split(' ')[2]).sort(),
      ['menuitem_config|background|0', 'menuitem_config|title|0', 'menuitem_config|title|2'],
      masthead.join('\n')
    )
    // Options and ids are not words, and a core field outside `attribs` is not an article extra field.
    for (const name of ['ctm_content_type', 'ctm_width', 'item_id', 'note'])
      assert.ok(!slots.some((s) => s.split(' ')[2].split('|').includes(name)), `${name} is not content`)
    // A contact's picture is not a fact the customer has to prove.
    const picture = run
      .read('content-map.json')
      .slots.find((s) => s.entity === 'contact-1' && s.column === 'image')
    assert.equal(picture.requiresEvidence, false)
  }
)

test(
  '--full-coverage with --evidence-by-field leaves no fact field the contracts gate refuses',
  needsPhp,
  () => {
    const run = capture(fullInventory(), {
      args: ['--module-prefix', '', '--list-items', '--full-coverage', '--evidence-by-field'],
      schemas: { features: ICONS_XML },
      files: FULL_FILES
    })
    assertWritten(run)
    const { slots } = run.read('content-map.json')
    // The new slots of a plain column (a contact's name) carry their field only in the label, as the gate reads it.
    assert.deepEqual(ungatedFactSlots(slots), [])
    assert.equal(slots.find((s) => s.entity === 'contact-1' && s.column === 'name').requiresEvidence, true)
  }
)

test(
  '--full-coverage leaves a capture without the new tables or fields as it was, plus nothing',
  needsPhp,
  () => {
    const plain = capture(clean())
    assertWritten(plain)
    const run = capture(clean(), { args: ['--full-coverage'] })
    assertWritten(run)
    const before = plain.read('content-map.json')
    const after = run.read('content-map.json')
    assert.deepEqual(after.entities, before.entities)
    // Only the category's title is new: the article and menu item have no images, attribs or page title.
    assert.deepEqual(
      after.slots.filter((s) => s.customize === 'keep').map((s) => [s.entity, s.column]),
      [['category-8', 'title']]
    )
  }
)

test(
  "--full-coverage declares an article's note, which a card can print as its label, after its other slots",
  needsPhp,
  () => {
    // JA Voyara 1.0.12: the featured view prints each article's note as the card's label chip.
    const plain = fullInventory()
    plain.content[1].created_by_alias = 'Wren Harbor'
    const noted = fullInventory()
    noted.content[1].created_by_alias = 'Wren Harbor'
    noted.content[1].note = 'Outdoors'
    noted.content[0].note = ''
    const args = {
      args: ['--module-prefix', '', '--list-items', '--full-coverage'],
      schemas: { features: ICONS_XML },
      files: FULL_FILES
    }
    const before = capture(plain, args)
    const after = capture(noted, args)
    assertWritten(before)
    assertWritten(after)
    const slotsOf = (run) => run.read('content-map.json').slots
    const note = slotsOf(after).filter((s) => s.column === 'note')
    assert.deepEqual(
      note.map((s) => [s.entity, s.type, s.sample, s.customize]),
      [['article-3', 'text', 'Outdoors', 'keep']]
    )
    // Every slot the old rules made keeps its key; the note is the article's last slot.
    const keys = (run) =>
      slotsOf(run)
        .filter((s) => s.column !== 'note')
        .map((s) => [s.key, s.column, s.sample])
    assert.deepEqual(keys(after), keys(before))
    const article = slotsOf(after).filter((s) => s.entity === 'article-3')
    assert.equal(article.at(-1).column, 'note')
    assert.equal(note[0].key, `article-3.${article.length - 1}`)
  }
)

// ── Template language strings and titles a layout prints (--full-coverage) ─────────────────────────
// JA Boxing 1.0.2 keeps visitor words in its language file ("Try a class" is `Text::_('TPL_TRY_CLASS')`), and
// prints module titles its modules hide (`showtitle` 0): a tab bar of an ACM container (`$mod->title` of the
// modules in its position), the breadcrumbs' `aria-label` (`$module->title`).
const languageStringId = (extension, language, key) =>
  Number.parseInt(
    createHash('sha1').update(`${extension}|${language}|${key}`).digest('hex').slice(0, 7),
    16
  ) + 1
const STRING_FILES = {
  // The site's copy is the one Joomla loads; the template's own copy is read only when there is none.
  'language/en-GB/en-GB.tpl_tracy.ini':
    '; Tracy\nTPL_TRY_CLASS = "Try a class"\nTPL_LEAD = "The 6 <span>punches</span>"\nTPL_CONTACT_SEND="Submit"\nTPL_UNUSED = "Not on any page"\nTPL_T4_SUPPORT="Support"\nTPL_MAP_OPEN="Open in Google Maps"\nTPL_MAP_ALT="Street map of %s"\n',
  'templates/tracy/language/en-GB/en-GB.tpl_tracy.ini': 'TPL_TRY_CLASS = "Try a class (template copy)"\n',
  'language/en-GB/en-GB.tpl_tracy.sys.ini': 'TPL_TRACY_POSITION_MAIN="Main"\n',
  // An override the release ships is what a visitor reads.
  'language/overrides/en-GB.override.ini': 'TPL_CONTACT_SEND="Send it"\n',
  'language/en-GB/com_finder.ini': 'COM_FINDER_SEARCH="Search"\n',
  'templates/tracy/html/com_content/article/classes.php':
    "<?php echo Text::_('TPL_TRY_CLASS'); ?><h2><?php echo Text::_('TPL_LEAD'); ?></h2><?php echo JText::_(\"TPL_FOLLOW_US\"); echo Text::sprintf('TPL_CONTACT_SEND', 1);",
  // A layout that hands the key to a helper of its own as a plain string; a key built at run time names nothing.
  'templates/tracy/html/jagooglemap/default.php':
    "<?php $say = function ($key, $english) { return Text::_($key); }; echo $say('TPL_MAP_OPEN', 'Open'); echo sprintf($say(\"TPL_MAP_ALT\", 'Map of %s'), $place); echo Text::_('TPL_' . $name);",
  'templates/tracy/html/mod_menu/main.php':
    "<?php echo Text::_('TPL_TRACY_POSITION_MAIN'); echo Text::_('COM_FINDER_SEARCH');",
  // The T4 error page (shown only when the framework is missing) and the administrator's overview are no visitor page.
  'templates/tracy/error-t4.php': "<?php echo Text::_('TPL_T4_SUPPORT');",
  'templates/tracy/templateInfo.php': "<?php echo Text::_('TPL_UNUSED');",
  'modules/mod_breadcrumbs/tmpl/default.php':
    '<nav aria-label="<?php echo htmlspecialchars($module->title); ?>">',
  'modules/mod_login/tmpl/default.php': '<form></form>',
  'templates/tracy/acm/container-tabs/tmpl/style-1.php':
    "<?php $mods = ModuleHelper::getModules($helper->get('position')); foreach ($mods as $mod) echo $mod->title;"
}
const stringsInventory = () => {
  const inv = clean()
  inv.modules = [
    module('1'),
    module('20', {
      title: 'Breadcrumbs',
      module: 'mod_breadcrumbs',
      showtitle: '0',
      params: '{"layout":"_:default"}'
    }),
    module('21', { title: 'Login', module: 'mod_login', showtitle: '0', params: '{}' }),
    module('22', {
      title: 'Plans',
      module: 'mod_ja_acm',
      showtitle: '0',
      params: JSON.stringify({
        'jatools-config': JSON.stringify({
          ':type': 'tracy:container-tabs',
          'container-tabs': {
            'jatools-layout-container-tabs': 'style-1',
            'container-tabs[position]': ['container-tabs']
          }
        })
      })
    }),
    module('23', {
      title: 'Credit Bundles',
      module: 'mod_custom',
      position: 'container-tabs',
      showtitle: '0'
    })
  ]
  inv.modules_menu = ['1', '20', '21', '22', '23'].map((id) => ({ id, moduleid: id, menuid: '0' }))
  return inv
}
const CONTAINER_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="container-tabs"><fieldset name="basic">
  <field name="position" type="modulepositions"/>
</fieldset></fields></form>`

test(
  '--full-coverage declares the template language strings its front-end code names, read as Joomla reads them',
  needsPhp,
  () => {
    const run = capture(stringsInventory(), {
      args: ['--module-prefix', '', '--full-coverage'],
      schemas: { 'container-tabs': CONTAINER_XML },
      files: STRING_FILES
    })
    assertWritten(run)
    const map = run.read('content-map.json')
    const lock = run.read('presentation-lock.json')
    const strings = map.entities.filter((e) => e.kind === 'languageString')
    const want = [
      ['tpl_tracy', 'TPL_CONTACT_SEND', 'Send it'],
      ['tpl_tracy', 'TPL_FOLLOW_US', 'TPL_FOLLOW_US'],
      ['tpl_tracy', 'TPL_MAP_ALT', 'Street map of %s'],
      ['tpl_tracy', 'TPL_MAP_OPEN', 'Open in Google Maps'],
      ['tpl_tracy', 'TPL_TRY_CLASS', 'Try a class'],
      ['tpl_tracy.sys', 'TPL_TRACY_POSITION_MAIN', 'Main']
    ]
    // The test's HTML helper answers no slots, so the marked-up TPL_LEAD has none and is no entity here; a key
    // only an excluded file names, a key of another extension and a key no code names are never declared.
    assert.deepEqual(
      strings.map((e) => [e.identity.extension, e.identity.key, lock.entities[e.key].value]),
      want
    )
    for (const e of strings) {
      const id = languageStringId(e.identity.extension, 'en-GB', e.identity.key)
      assert.equal(e.key, `languageString-${id}`)
      assert.equal(e.sourceId, id)
      assert.deepEqual(Object.keys(e.identity), ['extension', 'key', 'language'])
      assert.equal(e.identity.language, 'en-GB')
      assert.deepEqual(lock.entities[e.key], { ...e.identity, value: lock.entities[e.key].value })
      const slots = map.slots.filter((s) => s.entity === e.key)
      assert.deepEqual(
        slots.map((s) => [s.column, s.type, s.sample, s.customize, s.requiresEvidence]),
        [['value', 'text', lock.entities[e.key].value, 'keep', false]]
      )
    }
    // A language file is not inventory: nothing counts the strings.
    assert.ok(!('languageString' in lock.inventoryCounts))
  }
)

test(
  '--full-coverage declares a module title a layout prints though the module hides its title',
  needsPhp,
  () => {
    const run = capture(stringsInventory(), {
      args: ['--module-prefix', '', '--full-coverage'],
      schemas: { 'container-tabs': CONTAINER_XML },
      files: STRING_FILES
    })
    assertWritten(run)
    const titled = run
      .read('content-map.json')
      .slots.filter((s) => s.column === 'title' && s.customize === 'keep')
      .map((s) => [s.entity, s.sample])
    // The breadcrumbs' aria-label and a tab of the container; not a login form, and not the container itself.
    assert.deepEqual(
      titled.filter(([e]) => e.startsWith('module-')),
      [
        ['module-20', 'Breadcrumbs'],
        ['module-23', 'Credit Bundles']
      ]
    )
  }
)

// A language string is HTML: Joomla prints `Text::_` as it stands, so a file writes "&" as `&amp;` and a curly quote as
// `&rsquo;`. Such a value is read as the HTML it is, so its sample is the words a visitor reads ("Rooms & suites"), not
// the entity a model would copy into a business name, and the plugin writes the slot back through its node.
test('--full-coverage reads a template string written with HTML entities as plain words', needsPhp, () => {
  const run = capture(stringsInventory(), {
    args: ['--module-prefix', '', '--full-coverage'],
    schemas: { 'container-tabs': CONTAINER_XML },
    helper: PER_TEXT_HELPER,
    files: {
      ...STRING_FILES,
      'language/en-GB/en-GB.tpl_tracy.ini': `${STRING_FILES['language/en-GB/en-GB.tpl_tracy.ini']}TPL_ROOMS="Rooms &amp; suites"\nTPL_OPEN="We&rsquo;re open &#8211; daily"\nTPL_PLAIN="Tea & cake"\n`,
      'templates/tracy/html/mod_menu/rooms.php':
        "<?php echo Text::_('TPL_ROOMS'); echo Text::_('TPL_OPEN'); echo Text::_('TPL_PLAIN');"
    }
  })
  assertWritten(run)
  const map = run.read('content-map.json')
  const lock = run.read('presentation-lock.json')
  const slotOf = (key) => {
    const e = map.entities.find((x) => x.kind === 'languageString' && x.identity.key === key)
    assert.ok(e, key)
    return [map.slots.filter((s) => s.entity === e.key), lock.entities[e.key].value]
  }
  const [rooms, roomsValue] = slotOf('TPL_ROOMS')
  assert.deepEqual(
    rooms.map((s) => [s.type, s.sample, s.xpath]),
    [['text', 'Rooms & suites', '/html/body/div/text()']]
  )
  // The lock keeps the value as the file has it: the plugin finds the row by it.
  assert.equal(roomsValue, 'Rooms &amp; suites')
  const [open] = slotOf('TPL_OPEN')
  assert.deepEqual(
    open.map((s) => [s.sample, s.xpath]),
    [['We’re open – daily', '/html/body/div/text()']]
  )
  // A bare "&" is no entity: the value stays one plain text slot, as before.
  const [plain] = slotOf('TPL_PLAIN')
  assert.deepEqual(
    plain.map((s) => [s.sample, 'xpath' in s]),
    [['Tea & cake', false]]
  )
})

test('without --full-coverage no template string and no hidden title is declared', needsPhp, () => {
  const run = capture(stringsInventory(), {
    args: ['--module-prefix', ''],
    schemas: { 'container-tabs': CONTAINER_XML },
    files: STRING_FILES
  })
  assertWritten(run)
  const map = run.read('content-map.json')
  assert.deepEqual(
    map.entities.filter((e) => e.kind === 'languageString'),
    []
  )
  assert.ok(!map.slots.some((s) => s.customize === 'keep'))
})

// ── T4 site settings: the logos a profile file holds (--full-coverage) ─────────────────────────────
// JA Boxing 1.0.3: the light-variant logo `item-2.png` lives only in `etc/site/default.json`, and the coverage audit
// found it on 59 pages with no slot. A T4 profile's picture keys are demo content like any picture.
const siteSettingId = (template, profile, key) =>
  Number.parseInt(createHash('sha1').update(`${template}|${profile}|${key}`).digest('hex').slice(0, 7), 16) +
  1
const SITE_PROFILE = JSON.stringify({
  site_name: 'JA Boxing',
  site_logo: 'images/logo/item-2.png#joomlaImage://local-images/logo/item-2.png?width=175&height=56',
  site_logo_small: '',
  site_logo_dark: 'images/logo/item-1.png',
  other_faviconFile: 'images/fav.ico',
  body_bg_img: 'images/bg.jpg'
})

test(
  '--full-coverage declares the pictures of the T4 site profile a style uses, once per key, kept from Customize',
  needsPhp,
  () => {
    const inv = clean()
    // Two styles share the `default` profile (none named); a third names a profile whose file the local/ copy replaces.
    inv.template_styles = [
      style('9', { home: '1' }),
      style('10', { title: 'Tracy - Two', params: '{"typelist-site":"default"}' }),
      style('11', { title: 'Tracy - Dark', params: '{"typelist-site":"dark"}' })
    ]
    const files = {
      'templates/tracy/etc/site/default.json': SITE_PROFILE,
      'templates/tracy/etc/site/dark.json': '{"site_logo":"images/logo/dark-a.png"}',
      'templates/tracy/local/etc/site/dark.json': '{"site_logo":"images/logo/dark-b.png"}'
    }
    const run = capture(inv, { args: ['--module-prefix', '', '--full-coverage'], files })
    assertWritten(run)
    const map = run.read('content-map.json')
    const lock = run.read('presentation-lock.json')
    const settings = map.entities.filter((e) => e.kind === 'siteSetting')
    assert.deepEqual(
      settings.map((e) => [e.identity, lock.entities[e.key].value]),
      [
        [{ template: 'tracy', profile: 'dark', key: 'site_logo' }, 'images/logo/dark-b.png'],
        [
          { template: 'tracy', profile: 'default', key: 'site_logo' },
          'images/logo/item-2.png#joomlaImage://local-images/logo/item-2.png?width=175&height=56'
        ],
        [{ template: 'tracy', profile: 'default', key: 'site_logo_dark' }, 'images/logo/item-1.png']
      ]
    )
    for (const e of settings) {
      const id = siteSettingId('tracy', e.identity.profile, e.identity.key)
      assert.equal(e.key, `siteSetting-${id}`)
      assert.equal(e.sourceId, id)
      assert.deepEqual(Object.keys(e.identity), ['template', 'profile', 'key'])
      assert.deepEqual(lock.entities[e.key], { ...e.identity, value: lock.entities[e.key].value })
      assert.deepEqual(
        map.slots
          .filter((s) => s.entity === e.key)
          .map((s) => [s.column, s.type, s.sample, s.customize, s.requiresEvidence]),
        [['value', 'image', lock.entities[e.key].value, 'keep', false]]
      )
    }
    // An empty key, a name, a favicon and a background are no logo; a settings file is not inventory.
    assert.ok(!('siteSetting' in lock.inventoryCounts))
    // Without the flag nothing is declared.
    const plain = capture(inv, { args: ['--module-prefix', ''], files })
    assertWritten(plain)
    assert.ok(!plain.read('content-map.json').entities.some((e) => e.kind === 'siteSetting'))
  }
)

// ── T4 layout and navigation profiles, and users' custom field values (--full-coverage) ─────────────
// JA Vega 1.0.8 / JA Kinetic 1.0.10: the mega menu's column titles ("Our Portfolio", "Company") live only in
// `etc/navigation/default.json` (`mega_settings`, a JSON string), a section's background picture only in its layout profile,
// and each team member's skill bars in a user custom field (`#__fields_values`).
const templateConfigId = (template, group, profile) =>
  Number.parseInt(
    createHash('sha1').update(`${template}|${group}|${profile}`).digest('hex').slice(0, 7),
    16
  ) + 1
const MEGA = JSON.stringify({
  mainmenu: {
    120: {
      settings: [
        {
          contents: [
            { name: 'Mega Title', type: 'module', title: '' },
            { name: 'Selected Items', type: 'items', title: 'Our Portfolio' }
          ]
        }
      ]
    },
    101: { settings: [{ contents: [{}] }] }
  }
})
const SECTION_PICTURE = 'images/bg/wave.jpg#joomlaImage://local-images/bg/wave.jpg?width=1920&height=959'

test(
  '--full-coverage declares the mega menu titles and section pictures of the T4 profiles a style uses, and the words of a user or article custom field',
  needsPhp,
  () => {
    const inv = clean()
    // The home style names layout `home` and sub-layout `sub`; the second style names layout `missing`, which T4 reads as `default`.
    inv.template_styles = [
      style('9', {
        home: '1',
        params: '{"typelist-layout":"home","sub-layout":"sub","typelist-navigation":"default"}'
      }),
      style('10', { title: 'Tracy - Two', params: '{"typelist-layout":"missing","sub-layout":""}' })
    ]
    inv.users = [
      { id: '43', name: 'Priya Raman', username: 'priya', admin: '0' },
      { id: '42', name: 'Tracy Agent', username: 'tracyagent', admin: '1' }
    ]
    inv.fields = [
      {
        id: '1',
        name: 'info',
        context: 'com_users.user',
        type: 'editor',
        state: '1',
        title: 'Info',
        label: 'Info',
        params: '{}'
      },
      {
        id: '2',
        name: 'author_role',
        context: 'com_content.article',
        type: 'text',
        state: '1',
        title: 'Role',
        label: 'Role',
        params: '{}'
      }
    ]
    inv.fields_values = [
      { field_id: '1', item_id: '43', value: '<h5>IT Management</h5><div class="progress">90%</div>' },
      // A pair of several rows has no one value; a field of a user the dump does not know is not a visitor's.
      { field_id: '1', item_id: '42', value: '<h5>A</h5>' },
      { field_id: '1', item_id: '42', value: '<h5>B</h5>' },
      { field_id: '1', item_id: '77', value: '<h5>Ghost</h5>' },
      // An article's field (JA Kinetic's author line under a post); an article the map does not hold is not a visitor's.
      { field_id: '2', item_id: '3', value: 'Platform Engineer' },
      { field_id: '2', item_id: '88', value: 'Staff SRE' }
    ]
    const files = {
      'templates/tracy/etc/navigation/default.json': JSON.stringify({
        menu_type: 'mainmenu',
        mega_settings: MEGA
      }),
      'templates/tracy/etc/layout/default.json': JSON.stringify({
        sections: [{ name: 'header', background_image: '' }]
      }),
      'templates/tracy/etc/layout/home.json': JSON.stringify({
        sections: [{ name: 'hero', background_image: SECTION_PICTURE }]
      }),
      'templates/tracy/etc/layout/sub.json':
        '{"sections":[{"name":"top","background_image":"images/bg/top.jpg"}]}',
      'templates/tracy/local/etc/layout/sub.json':
        '{"sections":[{"name":"top","background_image":"images/bg/top-local.jpg"}]}'
    }
    const run = capture(inv, {
      args: ['--module-prefix', '', '--full-coverage'],
      files,
      helper: PER_TEXT_HELPER
    })
    assertWritten(run)
    const map = run.read('content-map.json')
    const lock = run.read('presentation-lock.json')
    const configs = map.entities.filter((e) => e.kind === 'templateConfig')
    assert.deepEqual(
      configs.map((e) => e.identity),
      [
        { template: 'tracy', group: 'layout', profile: 'home' },
        { template: 'tracy', group: 'layout', profile: 'sub' },
        { template: 'tracy', group: 'navigation', profile: 'default' }
      ]
    )
    for (const e of configs) {
      const id = templateConfigId('tracy', e.identity.group, e.identity.profile)
      assert.equal(e.key, `templateConfig-${id}`)
      assert.equal(e.sourceId, id)
    }
    assert.equal(lock.entities[configs[1].key].value, files['templates/tracy/local/etc/layout/sub.json'])
    const slotsOf = (key) =>
      map.slots
        .filter((s) => s.entity === key)
        .map((s) => [
          s.column,
          s.nestedJson ?? '-',
          (s.jsonPath ?? []).join('|'),
          s.type,
          s.sample,
          s.customize
        ])
    assert.deepEqual(slotsOf(configs[0].key), [
      ['value', '-', 'sections|0|background_image', 'image', SECTION_PICTURE, 'keep']
    ])
    assert.deepEqual(slotsOf(configs[1].key), [
      ['value', '-', 'sections|0|background_image', 'image', 'images/bg/top-local.jpg', 'keep']
    ])
    assert.deepEqual(slotsOf(configs[2].key), [
      ['value', 'mega_settings', 'mainmenu|120|settings|0|contents|1|title', 'text', 'Our Portfolio', 'keep']
    ])
    const values = map.entities.filter((e) => e.kind === 'fieldValue')
    assert.deepEqual(
      values.map((e) => [e.key, e.identity, e.identityReferences ?? null, lock.entities[e.key]]),
      [
        [
          'fieldValue-1000000043',
          { field: 'info', context: 'com_users.user', item_id: '43' },
          null,
          { value: '<h5>IT Management</h5><div class="progress">90%</div>' }
        ],
        [
          'fieldValue-2000000003',
          { field: 'author_role', context: 'com_content.article' },
          { item_id: 'article-3' },
          { value: 'Platform Engineer' }
        ]
      ]
    )
    assert.deepEqual(
      map.slots.filter((s) => s.entity === 'fieldValue-2000000003').map((s) => [s.column, s.type, s.sample]),
      [['value', 'text', 'Platform Engineer']]
    )
    assert.deepEqual(
      map.slots.filter((s) => s.entity === 'fieldValue-1000000043').map((s) => [s.column, s.type, s.sample]),
      [
        ['value', 'text', 'IT Management'],
        ['value', 'text', '90%']
      ]
    )
    for (const kind of ['templateConfig', 'fieldValue']) assert.ok(!(kind in lock.inventoryCounts))
    const plain = capture(inv, { args: ['--module-prefix', ''], files })
    assertWritten(plain)
    assert.ok(
      !plain.read('content-map.json').entities.some((e) => ['templateConfig', 'fieldValue'].includes(e.kind))
    )
  }
)

/** A fictional banner block: three fields the rule tables place, one they cannot. */
const BANNER_XML = `<?xml version="1.0" encoding="utf-8"?>
<form><fields name="banner"><fieldset name="basic">
  <field name="eyebrow" type="text"/><field name="heading" type="text"/>
  <field name="intro" type="text"/><field name="panel_size" type="text"/>
  <field name="support" type="text"/>
</fieldset></fields></form>`
const BANNER = {
  'jatools-layout-banner': 'style-1',
  eyebrow: 'Harbour Studio',
  heading: 'Boats built by hand',
  intro: 'Small yard on the north quay.',
  panel_size: 'Launch day, spring'
}
const bannerRun = (config, previous) =>
  capture(acmInventory('banner', config), { schemas: { banner: BANNER_XML }, previous })
const roleOf = (run, field) =>
  run.read('content-map.json').slots.find((s) => s.jsonPath?.join('|') === `banner|${field}`)
// The keys of the banner module's slots the capture listed as unplaced (the fixture's article and menu item slots
// are outside what these tests are about).
const unplacedBanner = (run) =>
  (run.stdout.split('\n').find((l) => l.startsWith('Slots without a role')) ?? '')
    .split(': ')
    .at(-1)
    .split(', ')
    .filter((k) => k.startsWith('module-7.'))

test(
  'a first capture writes a role and a group on every slot the rule tables place and lists the rest',
  needsPhp,
  () => {
    const run = bannerRun(BANNER)
    assertWritten(run)
    const map = run.read('content-map.json')
    assert.equal(map.roleVocabularyVersion, 'place-content-roles/2')
    assert.equal(
      roleOf(run, 'eyebrow').role,
      'editorial.heading',
      'an eyebrow is words, not the business category'
    )
    assert.equal(roleOf(run, 'heading').role, 'business.tagline')
    assert.equal(roleOf(run, 'intro').role, 'business.summary')
    assert.equal(roleOf(run, 'heading').group.kind, 'business')
    assert.equal('role' in roleOf(run, 'panel_size'), false)
    assert.equal(unplacedBanner(run).length, 1)
    assert.equal(JSON.stringify(map).includes('unplaced'), false, 'the report stays out of the content map')
  }
)

test(
  'a recapture keeps the role and group of every slot whose key and sample are unchanged',
  needsPhp,
  () => {
    const first = bannerRun(BANNER)
    const previous = first.read('content-map.json')
    const heading = previous.slots.find((s) => s.jsonPath?.join('|') === 'banner|heading')
    const panel_size = previous.slots.find((s) => s.jsonPath?.join('|') === 'banner|panel_size')
    heading.role = 'business.summary'
    heading.group = { id: 'agent.group', item: 0, kind: 'business' }
    panel_size.role = 'business.category_label'
    panel_size.group = { id: 'agent.group', item: 0, kind: 'business' }
    const run = bannerRun(BANNER, previous)
    assertWritten(run)
    assert.deepEqual(
      [roleOf(run, 'heading').role, roleOf(run, 'heading').group.id],
      ['business.summary', 'agent.group']
    )
    assert.equal(
      roleOf(run, 'panel_size').role,
      'business.category_label',
      'a role the agent bound is carried too'
    )
    assert.deepEqual(unplacedBanner(run), [])
  }
)

test('a slot whose sample changed is rebound by the rule tables, not carried', needsPhp, () => {
  const previous = bannerRun(BANNER).read('content-map.json')
  const heading = previous.slots.find((s) => s.jsonPath?.join('|') === 'banner|heading')
  heading.role = 'business.summary'
  heading.group = { id: 'agent.group', item: 0, kind: 'business' }
  const run = bannerRun({ ...BANNER, heading: 'Boats built by hand since 1962' }, previous)
  assertWritten(run)
  assert.equal(roleOf(run, 'heading').role, 'business.tagline')
  assert.notEqual(roleOf(run, 'heading').group.id, 'agent.group')
})

test('a new slot is bound by the rule tables, or listed when they cannot place it', needsPhp, () => {
  const previous = bannerRun(BANNER).read('content-map.json')
  const withSupport = { ...BANNER, support: 'Repairs and refits all year.' }
  const run = bannerRun(withSupport, previous)
  assertWritten(run)
  assert.equal(roleOf(run, 'support').role, 'business.summary')
  assert.equal(
    roleOf(run, 'eyebrow').role,
    'editorial.heading',
    'an eyebrow is words, not the business category'
  )
  assert.equal(unplacedBanner(run).length, 1, 'only the panel size remains')
})

/** A module body the way a template writes one: a cut heading, a sentence with a link, a footer link list. */
const bodyInventory = (content) => {
  const inv = clean()
  inv.modules = [module('1'), module('2', { title: '[Tracy] Yard', content })]
  inv.modules_menu = [
    { id: '1', moduleid: '1', menuid: '101' },
    { id: '2', moduleid: '2', menuid: '101' }
  ]
  return inv
}
const bodySlots = (run) =>
  run
    .read('content-map.json')
    .slots.filter((s) => s.entity === 'module-2')
    .map((s) => [s.type, s.sample, s.xpath, s.role ?? null, s.group?.id ?? null])
const bodyRun = (content, args = []) => capture(bodyInventory(content), { helper: PER_TEXT_HELPER, args })

const CUT_HEADING = '<h2>No1 <span>boxing</span> since 2008</h2><h3>Plain</h3>'

test(
  'C1: a heading the helper cuts in three is three slots without the flag and one with it',
  needsPhp,
  () => {
    const plain = bodyRun(CUT_HEADING)
    assertWritten(plain)
    assert.equal(bodySlots(plain).length, 4, 'the helper cuts "No1", "boxing" and "since 2008", then "Plain"')
    const run = bodyRun(CUT_HEADING, ['--whole-units'])
    assertWritten(run)
    assert.deepEqual(
      bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
      [
        ['text', 'No1 boxing since 2008', '/html/body/div/h2'],
        ['text', 'Plain', '/html/body/div/h3/text()']
      ]
    )
    assert.equal(bodySlots(run)[0][3], 'editorial.heading', 'the whole heading reads as a heading')
  }
)

test(
  'C1: a sentence with a link keeps its pieces apart, so writing it never empties the link',
  needsPhp,
  () => {
    // The plugin writes an element slot as one text node and keeps any element carrying href/src/alt/title, so a
    // merged `Call <a href="tel:...">us</a> today` would come back as `New text<a href="tel:..."></a>`: a link with
    // no words. The unit stays three text slots, each written in place, beside the link's url slot.
    const run = bodyRun('<p>Call <a href="tel:+000-0100">us</a> today</p>', ['--whole-units'])
    assertWritten(run)
    assert.deepEqual(
      bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
      [
        ['text', 'Call', '/html/body/div/p/text()[1]'],
        ['url', 'tel:+000-0100', '/html/body/div/p/a/@href'],
        ['text', 'us', '/html/body/div/p/a/text()'],
        ['text', 'today', '/html/body/div/p/text()[2]']
      ]
    )
  }
)

test('C1: text inside an element with a title or alt of its own also keeps the unit apart', needsPhp, () => {
  const run = bodyRun('<h3>Read the <abbr title="Frequently asked">FAQ</abbr> first</h3>', ['--whole-units'])
  assertWritten(run)
  assert.deepEqual(
    bodySlots(run).map(([, sample, xpath]) => [sample, xpath]),
    [
      ['Read the', '/html/body/div/h3/text()[1]'],
      ['Frequently asked', '/html/body/div/h3/abbr/@title'],
      ['FAQ', '/html/body/div/h3/abbr/text()'],
      ['first', '/html/body/div/h3/text()[2]']
    ]
  )
})

test(
  'C1: an image beside the words keeps the unit apart, so writing it never drops the words',
  needsPhp,
  () => {
    // The image carries no text of its own, so no text node sits inside it; still, one text node written over the unit
    // would sit beside the kept image and lose the words around it. The pieces stay separate slots.
    const run = bodyRun('<p><img src="/images/sample-glove.png"> Train <b>hard</b> daily</p>', [
      '--whole-units'
    ])
    assertWritten(run)
    assert.deepEqual(
      bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
      [
        ['image', '/images/sample-glove.png', '/html/body/div/p/img/@src'],
        ['text', 'Train', '/html/body/div/p/text()[1]'],
        ['text', 'hard', '/html/body/div/p/b/text()'],
        ['text', 'daily', '/html/body/div/p/text()[2]']
      ]
    )
  }
)

test('C1: a heading cut by a span and a br is still one slot', needsPhp, () => {
  const run = bodyRun('<h2>Strong <span>arms</span><br>calm minds</h2>', ['--whole-units'])
  assertWritten(run)
  assert.deepEqual(
    bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
    [['text', 'Strong arms calm minds', '/html/body/div/h2']]
  )
})

test('C1: a list item with an icon and cut text is still one slot', needsPhp, () => {
  const run = bodyRun('<ul><li><i class="icon-clock"></i> Open <strong>daily</strong> from nine</li></ul>', [
    '--whole-units'
  ])
  assertWritten(run)
  assert.deepEqual(
    bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
    [['text', 'Open daily from nine', '/html/body/div/ul/li']]
  )
})

test('C1: a fragment with no heading or paragraph at all is one slot for the whole field', needsPhp, () => {
  const run = bodyRun('THE <br>WORKOUT <b>YARD</b>', ['--whole-units'])
  assertWritten(run)
  assert.deepEqual(
    bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
    [['text', 'THE WORKOUT YARD', '/html/body/div']]
  )
})

test('inline markup: a merged unit keeps its inline tags in the content map notation', needsPhp, () => {
  const run = bodyRun('<h2>Strong <span class="accent">arms</span><br>calm minds</h2>', [
    '--whole-units',
    '--inline-markup'
  ])
  assertWritten(run)
  assert.deepEqual(
    bodySlots(run).map(([type, sample, xpath]) => [type, sample, xpath]),
    [['text', 'Strong ((span class="accent"))arms((/span))((br/))calm minds', '/html/body/div/h2']]
  )
  const field = bodyRun('More<br>\r\n<span>Blogs</span>', ['--whole-units', '--inline-markup'])
  assertWritten(field)
  assert.deepEqual(
    bodySlots(field).map(([, sample, xpath]) => [sample, xpath]),
    [['More((br/)) ((span))Blogs((/span))', '/html/body/div']]
  )
})

test('inline markup: the limit is counted on the plain text, not on the markup', needsPhp, () => {
  const heading = '<h2>Our <span class="a-rather-long-accent-class-name">classes</span></h2>'
  const plain = bodyRun(heading, ['--whole-units']).read('content-map.json')
  const marked = bodyRun(heading, ['--whole-units', '--inline-markup']).read('content-map.json')
  const slotOf = (map) => map.slots.find((s) => s.entity === 'module-2')
  assert.equal(slotOf(plain).sample, 'Our classes')
  assert.match(slotOf(marked).sample, /\(\(span class=/)
  assert.equal(slotOf(marked).maxCharacters, slotOf(plain).maxCharacters)
})

test('inline markup: a role carried by --previous-map stays when only markup changed', needsPhp, () => {
  const content = '<h2>Strong <span>arms</span> calm minds</h2>'
  const previous = bodyRun(content, ['--whole-units']).read('content-map.json')
  const slot = previous.slots.find((s) => s.entity === 'module-2')
  slot.role = 'claim.heading'
  const run = capture(bodyInventory(content), {
    helper: PER_TEXT_HELPER,
    args: ['--whole-units', '--inline-markup'],
    previous
  })
  assertWritten(run)
  const now = run.read('content-map.json').slots.find((s) => s.entity === 'module-2')
  assert.equal(now.sample, 'Strong ((span))arms((/span)) calm minds')
  assert.equal(now.role, 'claim.heading')
})

test('inline markup needs whole units', needsPhp, () => {
  const run = bodyRun('<h2>One <b>two</b></h2>', ['--inline-markup'])
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /--inline-markup needs --whole-units/)
})

test('C1: loose text beside real paragraphs is not glued into one slot', needsPhp, () => {
  const run = bodyRun('lead <i>in</i><p>One</p><p>Two <b>more</b></p>', ['--whole-units'])
  assertWritten(run)
  assert.deepEqual(
    bodySlots(run).map(([, sample, xpath]) => [sample, xpath]),
    [
      ['lead', '/html/body/div/text()'],
      ['in', '/html/body/div/i/text()'],
      ['One', '/html/body/div/p[1]/text()'],
      ['Two more', '/html/body/div/p[2]']
    ]
  )
})

const LINK_LIST =
  '<ul><li><a href="index.php?Itemid=21">Classes</a></li><li><a href="index.php?Itemid=22">Prices</a></li>' +
  '<li><a href="https://www.facebook.com/larkspurtearoom">Facebook</a></li></ul>'

test('C2: a link list is one slot per item, grouped; version 3 labels its page links', needsPhp, () => {
  const run = bodyRun(LINK_LIST, ['--whole-units', '--role-vocabulary', '3'])
  assertWritten(run)
  const map = run.read('content-map.json')
  assert.equal(map.roleVocabularyVersion, 'place-content-roles/3')
  assert.deepEqual(
    bodySlots(run).map(([type, sample, , role, group]) => [type, sample, role, group]),
    [
      ['url', 'index.php?Itemid=21', 'editorial.navigation_url', 'module-2.content.ul.0'],
      ['text', 'Classes', 'editorial.menu_label', 'module-2.content.ul.0'],
      ['url', 'index.php?Itemid=22', 'editorial.navigation_url', 'module-2.content.ul.1'],
      ['text', 'Prices', 'editorial.menu_label', 'module-2.content.ul.1'],
      ['url', 'https://www.facebook.com/larkspurtearoom', 'contact.social_url', 'module-2.content.ul.2'],
      ['text', 'Facebook', 'contact.social_label', 'module-2.content.ul.2']
    ]
  )
  // The map the capture wrote passes the contract check of its own vocabulary.
  const roles = spawnSync(
    'node',
    [
      '--input-type=module',
      '-e',
      "import {checkContentMapRoles} from './packages/wo/website-opportunities/domain/content-map-roles.mjs';" +
        "import {readFileSync} from 'node:fs';" +
        'const r=checkContentMapRoles(JSON.parse(readFileSync(process.argv[1],"utf8")));' +
        'process.stdout.write(JSON.stringify(r.errors))',
      path.join(run.out, 'content-map.json')
    ],
    { encoding: 'utf8', cwd: fileURLToPath(new URL('../../../../', import.meta.url)) }
  )
  assert.equal(roles.stdout, '[]', roles.stdout + roles.stderr)
})

test(
  'C2: the default vocabulary stays 2: page links get no role and only the social item is grouped',
  needsPhp,
  () => {
    const run = bodyRun(LINK_LIST, ['--whole-units'])
    assertWritten(run)
    assert.equal(run.read('content-map.json').roleVocabularyVersion, 'place-content-roles/2')
    assert.deepEqual(
      bodySlots(run).map(([type, sample, , role, group]) => [type, sample, role, group]),
      [
        ['url', 'index.php?Itemid=21', null, null],
        ['text', 'Classes', 'editorial.menu_label', null],
        ['url', 'index.php?Itemid=22', null, null],
        ['text', 'Prices', 'editorial.menu_label', null],
        ['url', 'https://www.facebook.com/larkspurtearoom', 'contact.social_url', 'module-2.content.ul.2'],
        ['text', 'Facebook', 'contact.social_label', 'module-2.content.ul.2']
      ]
    )
  }
)

// ── T3 templates: logos in the style params, trashed menu items ──────────────────────────────────────

/** A T3 style: its logos are params of the style row (invented files). */
const t3Inventory = () => {
  const inv = clean()
  inv.template_styles = [
    style('9', {
      home: '1',
      title: 'Tracy - Default',
      params: JSON.stringify({
        logotype: 'image',
        logoimage: 'images/brand/logo-main.png',
        enable_logoimage_sm: '1',
        logoimage_sm: 'images/brand/logo-small.png',
        logofootertype: 'image',
        logofooterimage: 'images/brand/logo-foot.png',
        logoimage_dark: '',
        sitename: ''
      })
    })
  ]
  inv.menu = [menu('101'), menu('102', { path: 'old-shop', title: 'Old shop', published: '-2' })]
  return inv
}

test(
  '--template-style-logos declares every logo picture a T3 style sets as a business.logo slot of that style',
  needsPhp,
  () => {
    const plain = capture(t3Inventory())
    assertWritten(plain)
    assert.equal(
      plain.read('content-map.json').slots.some((s) => s.entity === 'templateStyle-9'),
      false,
      'off by default: a published profile re-captures byte for byte'
    )
    const run = capture(t3Inventory(), { args: ['--template-style-logos'] })
    assertWritten(run)
    const slots = run.read('content-map.json').slots.filter((s) => s.entity === 'templateStyle-9')
    assert.deepEqual(
      slots.map((s) => [s.key, s.column, s.type, s.jsonPath, s.sample, s.role, s.customize]),
      [
        [
          'templateStyle-9.0',
          'params',
          'image',
          ['logoimage'],
          'images/brand/logo-main.png',
          'business.logo',
          'keep'
        ],
        [
          'templateStyle-9.1',
          'params',
          'image',
          ['logoimage_sm'],
          'images/brand/logo-small.png',
          'business.logo',
          'keep'
        ],
        [
          'templateStyle-9.2',
          'params',
          'image',
          ['logofooterimage'],
          'images/brand/logo-foot.png',
          'business.logo',
          'keep'
        ]
      ],
      'an empty logo param (logoimage_dark) and the switches (logotype) are not pictures'
    )
    assert.deepEqual(slots[0].group, { id: 'site-logo.business', item: 0, kind: 'business' })
  }
)

test(
  '--template-style-logos declares the default picture a T3 style prints when its logo param is empty',
  needsPhp,
  () => {
    const inv = clean()
    inv.template_styles = [
      style('9', {
        home: '1',
        params: JSON.stringify({ logotype: 'image', logoimage: '', enable_logoimage_sm: '1', sitename: '' })
      }),
      style('10', { title: 'Tracy - Text', params: JSON.stringify({ logotype: 'text', logoimage: '' }) })
    ]
    // The template ships its own logo.png but no logo-sm.png, so the small one comes from the T3 base.
    const run = capture(inv, {
      args: ['--template-style-logos'],
      files: { 'templates/tracy/images/logo.png': 'png' }
    })
    assertWritten(run)
    const slots = run.read('content-map.json').slots.filter((s) => s.entity.startsWith('templateStyle-'))
    assert.deepEqual(
      slots.map((s) => [s.key, s.jsonPath, s.sample, s.role, s.customize, s.requiresEvidence]),
      [
        [
          'templateStyle-9.0',
          ['logoimage'],
          'templates/tracy/images/logo.png',
          'business.logo',
          'keep',
          false
        ],
        [
          'templateStyle-9.1',
          ['logoimage_sm'],
          'plugins/system/t3/base/images/logo-sm.png',
          'business.logo',
          'keep',
          false
        ]
      ],
      'a style whose logotype is text prints no picture, so it declares none'
    )
    assert.deepEqual(slots[0].group, { id: 'site-logo.business', item: 0, kind: 'business' })
  }
)

test(
  '--full-coverage declares each page masthead of mod_jamasthead: its background, title and description',
  needsPhp,
  () => {
    const config = {
      item_id: { 0: ['117'], 1: ['108'], 2: ['130'], 3: ['124'] },
      title: { 0: 'Contact', 1: 'Our Blog', 2: 'Video', 3: 'Gone' },
      description: { 0: 'Find us', 1: '', 2: 'Watch', 3: 'Gone too' },
      background: {
        0: 'images/bg-contact.jpg',
        1: 'images/banner-blog.jpg',
        2: 'images/intro.mp4',
        3: 'images/bg-gone.jpg'
      }
    }
    const inv = clean()
    // Menu item 124 does not exist: its entry never shows, so it declares nothing.
    inv.menu.push(
      menu('117', { path: 'contact' }),
      menu('108', { path: 'blog' }),
      menu('130', { path: 'video' })
    )
    inv.modules = [
      module('20', {
        title: 'Masthead',
        module: 'mod_jamasthead',
        position: 'masthead',
        params: JSON.stringify({ 'default-title': 'Diner', menuitem_config: config })
      }),
      // Another module type with the same param name declares nothing from it.
      module('21', {
        title: 'Other',
        module: 'mod_other',
        params: JSON.stringify({ menuitem_config: config })
      })
    ]
    const plain = capture(inv)
    assertWritten(plain)
    assert.equal(
      plain.read('content-map.json').slots.some((s) => s.jsonPath?.[0] === 'menuitem_config'),
      false,
      'off without --full-coverage: a published profile re-captures byte for byte'
    )
    const run = capture(inv, { args: ['--full-coverage'] })
    assertWritten(run)
    const slots = run.read('content-map.json').slots.filter((s) => s.jsonPath?.[0] === 'menuitem_config')
    assert.deepEqual(
      slots.map((s) => [s.entity, s.column, s.type, s.jsonPath.join('|'), s.sample, s.role, s.label]),
      [
        [
          'module-20',
          'params',
          'image',
          'menuitem_config|background|0',
          'images/bg-contact.jpg',
          'business.hero_image',
          'Masthead / menu item 117 / background'
        ],
        [
          'module-20',
          'params',
          'text',
          'menuitem_config|title|0',
          'Contact',
          'editorial.heading',
          'Masthead / menu item 117 / title'
        ],
        [
          'module-20',
          'params',
          'text',
          'menuitem_config|description|0',
          'Find us',
          'editorial.paragraph',
          'Masthead / menu item 117 / description'
        ],
        [
          'module-20',
          'params',
          'image',
          'menuitem_config|background|1',
          'images/banner-blog.jpg',
          'business.hero_image',
          'Masthead / menu item 108 / background'
        ],
        [
          'module-20',
          'params',
          'text',
          'menuitem_config|title|1',
          'Our Blog',
          'editorial.heading',
          'Masthead / menu item 108 / title'
        ],
        [
          'module-20',
          'params',
          'text',
          'menuitem_config|title|2',
          'Video',
          'editorial.heading',
          'Masthead / menu item 130 / title'
        ],
        [
          'module-20',
          'params',
          'text',
          'menuitem_config|description|2',
          'Watch',
          'editorial.paragraph',
          'Masthead / menu item 130 / description'
        ]
      ],
      'an empty description, a video background and an entry for a missing menu item are not slots'
    )
    // One group per page, so each page's banner is replaced on its own.
    assert.deepEqual(
      slots.filter((s) => s.type === 'image').map((s) => s.group),
      [
        { id: 'module-20.masthead-0', item: 0, kind: 'business' },
        { id: 'module-20.masthead-1', item: 0, kind: 'business' }
      ]
    )
  }
)

test(
  '--full-coverage: a masthead title or description the module form already declares is not declared twice',
  needsPhp,
  () => {
    // The module's own form declares `title` and `description`, so the generic params rule already writes
    // menuitem_config.title.N and menuitem_config.description.N (a description with markup as fragment slots).
    // The masthead rule then adds only the backgrounds: one slot per write target, never two.
    const mastheadForm = `<?xml version="1.0" encoding="utf-8"?>
<extension type="module"><config><fields name="params"><fieldset name="basic">
  <field name="title" type="text"/>
  <field name="description" type="textarea"/>
</fieldset></fields></config></extension>`
    const inv = clean()
    inv.menu.push(menu('117', { path: 'contact' }), menu('108', { path: 'blog' }))
    inv.modules = [
      module('20', {
        title: 'Masthead',
        module: 'mod_jamasthead',
        position: 'masthead',
        params: JSON.stringify({
          menuitem_config: {
            item_id: [['117'], ['108']],
            title: ['Reach the Lantern Bakery', 'Lantern Notes'],
            description: ['Fresh loaves daily', 'Read <span>more</span> of our stories'],
            background: ['images/bg-lantern.jpg', 'images/bg-notes.jpg']
          }
        })
      })
    ]
    const run = capture(inv, {
      args: ['--full-coverage'],
      files: { 'modules/mod_jamasthead/mod_jamasthead.xml': mastheadForm }
    })
    assertWritten(run)
    const slots = run.read('content-map.json').slots.filter((s) => s.jsonPath?.[0] === 'menuitem_config')
    const targets = slots.map((s) => `${s.jsonPath.join('|')}${s.xpath ? ` ${s.xpath}` : ''}`)
    assert.equal(new Set(targets).size, targets.length, `one slot per write target: ${targets.join(', ')}`)
    for (const field of ['title', 'description']) {
      for (const k of ['0', '1']) {
        const hits = slots.filter((s) => s.jsonPath[1] === field && String(s.jsonPath[2]) === k && !s.xpath)
        const fragments = slots.filter(
          (s) => s.jsonPath[1] === field && String(s.jsonPath[2]) === k && s.xpath
        )
        assert.ok(
          hits.length + (fragments.length ? 1 : 0) === 1,
          `menuitem_config.${field}.${k} is written by one rule only: ${targets.join(', ')}`
        )
      }
    }
    assert.deepEqual(
      slots.filter((s) => s.type === 'image').map((s) => [s.key, s.jsonPath.join('|'), s.role]),
      [
        [
          slots.find((s) => s.jsonPath.join('|') === 'menuitem_config|background|0').key,
          'menuitem_config|background|0',
          'business.hero_image'
        ],
        [
          slots.find((s) => s.jsonPath.join('|') === 'menuitem_config|background|1').key,
          'menuitem_config|background|1',
          'business.hero_image'
        ]
      ],
      'the per-page backgrounds are still declared'
    )
    // The masthead slots come after every generic slot, so the generic keys are numbered first and never move.
    const index = (s) => Number(s.key.split('.')[1])
    const masthead = slots.filter((s) => s.label.includes(' / menu item '))
    const generic = slots.filter((s) => !masthead.includes(s))
    assert.ok(Math.max(...generic.map(index)) < Math.min(...masthead.map(index)))
    const keys = run
      .read('content-map.json')
      .slots.filter((s) => s.entity === 'module-20')
      .map(index)
    assert.deepEqual(
      keys,
      keys.map((_, i) => i),
      'keys stay dense'
    )
  }
)

test(
  '--skip-trashed-menu-items leaves a trashed menu item out of the entities and the pages',
  needsPhp,
  () => {
    const plain = capture(t3Inventory())
    assertWritten(plain)
    assert.ok(plain.read('content-map.json').pages.some((p) => p.entity === 'menuItem-102'))
    const run = capture(t3Inventory(), { args: ['--skip-trashed-menu-items'] })
    assertWritten(run)
    const map = run.read('content-map.json')
    assert.deepEqual(
      map.pages.map((p) => p.entity),
      ['menuItem-101']
    )
    assert.equal(
      map.entities.some((e) => e.key === 'menuItem-102'),
      false
    )
  }
)

test(
  '--skip-unpublished-menu-pages keeps an unpublished menu item as an entity but no page of the map',
  needsPhp,
  () => {
    const inv = () => {
      const i = clean()
      i.menu.push(menu('120', { path: 'experiences/later', title: 'Later', published: '0' }))
      return i
    }
    const plain = capture(inv())
    assertWritten(plain)
    assert.ok(plain.read('content-map.json').pages.some((p) => p.entity === 'menuItem-120'))
    const run = capture(inv(), { args: ['--skip-unpublished-menu-pages'] })
    assertWritten(run)
    const map = run.read('content-map.json')
    assert.deepEqual(
      map.pages.map((p) => p.entity),
      ['menuItem-101']
    )
    assert.ok(map.entities.some((e) => e.key === 'menuItem-120'))
    assert.ok(run.read('presentation-lock.json').entities['menuItem-120'])
  }
)

test(
  'a menu entry of type url declares the address it opens after its title; a page entry does not',
  needsPhp,
  () => {
    const inv = clean()
    inv.menu.push(menu('130', { path: 'twitter', title: 'Twitter', type: 'url', link: '#' }))
    const run = capture(inv)
    assertWritten(run)
    const slots = run.read('content-map.json').slots
    const of = (e) =>
      slots.filter((s) => s.entity === e).map((s) => [s.column, s.type, s.sample, s.role ?? null])
    assert.deepEqual(of('menuItem-130'), [
      ['title', 'text', 'Twitter', 'contact.social_label'],
      ['link', 'url', '#', 'contact.social_url']
    ])
    assert.equal(
      slots.some((s) => s.entity === 'menuItem-101' && s.column === 'link'),
      false
    )
  }
)

test(
  'audio capability captures v3 track sources as URL facts without retyping the cover or losing row identity',
  needsPhp,
  () => {
    const inv = fullInventory()
    inv.content[1].attribs = JSON.stringify({
      ctm_audio: {
        'audio-src': { 0: 'images/audio/Same.mp3', 2: 'images/audio/Same.mp3' },
        'audio-title': { 0: 'First track', 2: 'Second track' }
      },
      ctm_thumbnail: 'images/cover.jpg'
    })
    const run = capture(inv, {
      args: ['--module-prefix', '', '--list-items', '--full-coverage', '--role-vocabulary', '3'],
      schemas: { features: ICONS_XML },
      files: {
        ...FULL_FILES,
        'templates/tracy/contenttype/types/audio.xml':
          '<form><fields name="attribs"><field name="ctm_audio" type="jaitems"><item name="audio-src" type="text"/><item name="audio-title" type="text"/></field><field name="ctm_thumbnail" type="media"/></fields></form>'
      }
    })
    assertWritten(run)
    const slots = run.read('content-map.json').slots
    const tracks = slots.filter((s) => s.entity === 'article-3' && s.jsonPath?.[1] === 'audio-src')
    assert.equal(tracks.length, 2)
    assert.equal(new Set(tracks.map((s) => s.group.id)).size, 2)
    for (const [row, s] of tracks.entries()) {
      assert.equal(s.type, 'url')
      assert.equal(s.role, 'business.audio')
      assert.equal(s.customize, undefined)
      assert.equal(s.sample, 'images/audio/Same.mp3')
      assert.deepEqual(s.jsonPath, ['ctm_audio', 'audio-src', String(row * 2)])
      assert.equal(s.column, 'attribs')
    }
    const cover = slots.find((s) => s.entity === 'article-3' && s.jsonPath?.[0] === 'ctm_thumbnail')
    assert.equal(cover.type, 'image')
    const previous = run.read('content-map.json')
    for (const s of previous.slots.filter((s) => s.role === 'business.audio')) {
      s.role = 'editorial.illustration'
      s.customize = 'keep'
    }
    const successor = capture(inv, {
      args: ['--module-prefix', '', '--list-items', '--full-coverage', '--role-vocabulary', '3'],
      previous,
      schemas: { features: ICONS_XML },
      files: {
        ...FULL_FILES,
        'templates/tracy/contenttype/types/audio.xml':
          '<form><fields name="attribs"><field name="ctm_audio" type="jaitems"><item name="audio-src" type="text"/><item name="audio-title" type="text"/></field><field name="ctm_thumbnail" type="media"/></fields></form>'
      }
    })
    assertWritten(successor)
    assert.ok(
      successor
        .read('content-map.json')
        .slots.filter((s) => s.jsonPath?.[1] === 'audio-src')
        .every((s) => s.role === 'business.audio' && !s.customize)
    )
  }
)

test('literal PRE: real Cowork capture keeps leaf sample and literal length across whole units', {
  skip:
    needsPhp.skip ||
    (!process.env.COWORK_SLOTS_HELPER &&
      'set COWORK_SLOTS_HELPER to the real ContentSlots.php for cross-repo integration')
}, () => {
  const literal = ' <Widget>\n\tA &amp; B ((strong))Case((/strong)) '
  const html = `Lead <b>words</b><pre><code>${literal.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</code></pre> Tail`
  const run = capture(bodyInventory(html), {
    helper: process.env.COWORK_SLOTS_HELPER,
    args: ['--whole-units', '--inline-markup']
  })
  assertWritten(run)
  const slots = run.read('content-map.json').slots.filter((s) => s.entity === 'module-2')
  const code = slots.find((s) => s.xpath === '/html/body/div/pre/code/text()')
  assert.ok(code, 'the code leaf must never merge into a root fragment')
  assert.equal(code.sample, literal)
  assert.equal(code.maxCharacters, [...literal].length * 2 + 20)
  assert.equal(
    slots.some((s) => s.xpath === '/html/body/div'),
    false,
    'whole-root prose cannot own or cross PRE'
  )
  assert.ok(
    slots.some((s) => s.sample === 'Lead '),
    'ordinary scalar whitespace follows the real helper'
  )
  const unsupported = capture(
    bodyInventory('<p>Keep prose</p><pre><code><span>highlighted</span></code></pre>'),
    {
      helper: process.env.COWORK_SLOTS_HELPER,
      args: ['--whole-units', '--inline-markup']
    }
  )
  assertWritten(unsupported)
  assert.equal(
    unsupported.read('content-map.json').slots.some((s) => s.xpath?.includes('/pre')),
    false
  )
})

test('literal PRE: legacy bare PRE retains ordinary whole-root capture normalization', {
  skip: needsPhp.skip || (!process.env.COWORK_SLOTS_HELPER && 'set real COWORK_SLOTS_HELPER for integration')
}, () => {
  const run = capture(bodyInventory('<pre>Legacy <b>words</b></pre>'), {
    helper: process.env.COWORK_SLOTS_HELPER,
    args: ['--whole-units']
  })
  assertWritten(run)
  const slots = run.read('content-map.json').slots.filter((s) => s.entity === 'module-2')
  assert.equal(slots.length, 1)
  assert.equal(slots[0].xpath, '/html/body/div')
  assert.equal(slots[0].sample, 'Legacy words')
})

const previousMapCapture = (html, previous) =>
  capture(bodyInventory(html), {
    helper: process.env.COWORK_SLOTS_HELPER || PER_TEXT_HELPER,
    args: ['--whole-units', '--inline-markup'],
    previous
  })
const previousMapBody = (map) => map.slots.filter((s) => s.entity === 'module-2')
const reviewPreviousSlot = (slot) => {
  slot.role = 'claim.heading'
  slot.group = { id: 'reviewed.previous', kind: 'claim', item: 0 }
}

test(
  'previous-map identity: inserting PRE preserves ordinary keys and carries only role/group',
  needsPhp,
  () => {
    const ordinary = '<h2>Reviewed heading</h2><p>Reviewed paragraph</p>'
    const first = previousMapCapture(ordinary)
    assertWritten(first)
    const previous = first.read('content-map.json')
    const reviewed = previousMapBody(previous)
    for (const slot of reviewed) {
      reviewPreviousSlot(slot)
      slot.fit = { stale: true }
      slot.customize = 'stale'
      slot.maxCharacters = 1
      slot.requiresEvidence = true
    }
    const run = previousMapCapture(`<pre><code>new literal</code></pre>${ordinary}`, previous)
    assertWritten(run)
    const now = previousMapBody(run.read('content-map.json'))
    for (const before of reviewed) {
      const slot = now.find((s) => s.xpath === before.xpath)
      assert.equal(slot.key, before.key)
      assert.equal(slot.role, before.role)
      assert.deepEqual(slot.group, before.group)
      assert.equal('fit' in slot, false)
      assert.notEqual(slot.customize, 'stale')
      assert.notEqual(slot.maxCharacters, 1)
      assert.equal(slot.requiresEvidence, false)
    }
    const literal = now.find((s) => s.xpath.includes('/pre/'))
    assert.ok(!previous.slots.some((s) => s.key === literal.key), 'new leaf cannot reuse a prior key')
    assert.equal(new Set(now.map((s) => s.key)).size, now.length)
  }
)

test(
  'previous-map identity: equal text at a different address never carries or reuses a key',
  needsPhp,
  () => {
    const previous = previousMapCapture('<h2>Repeated words</h2>').read('content-map.json')
    const before = previousMapBody(previous)[0]
    reviewPreviousSlot(before)
    const run = previousMapCapture('<p>Repeated words</p>', previous)
    assertWritten(run)
    const slot = previousMapBody(run.read('content-map.json'))[0]
    assert.notEqual(slot.key, before.key)
    assert.notEqual(slot.role, before.role)
    assert.notEqual(slot.group?.id, before.group.id)
  }
)

test('previous-map identity: ambiguous addresses or keys never choose a reviewed slot', needsPhp, () => {
  const html = '<h2>Reviewed words</h2><p>Other words</p>'
  const original = previousMapCapture(html).read('content-map.json')
  for (const ambiguity of ['address', 'key', 'entity']) {
    const previous = structuredClone(original)
    const slot = previousMapBody(previous)[0]
    reviewPreviousSlot(slot)
    if (ambiguity === 'address') previous.slots.push({ ...slot, key: 'module-2.999' })
    if (ambiguity === 'key') previousMapBody(previous)[1].key = slot.key
    if (ambiguity === 'entity')
      previous.entities.push({ ...previous.entities.find((e) => e.key === slot.entity) })
    const run = previousMapCapture(html, previous)
    assertWritten(run)
    const now = previousMapBody(run.read('content-map.json'))[0]
    assert.notEqual(now.key, slot.key, ambiguity)
    assert.notEqual(now.role, slot.role, ambiguity)
    assert.notEqual(now.group?.id, slot.group.id, ambiguity)
    assert.equal(new Set(run.read('content-map.json').slots.map((s) => s.key)).size, original.slots.length)
  }
})

test('previous-map identity: entity identity and every write-address component must agree', needsPhp, () => {
  const html = '<h2>Reviewed words</h2>'
  const original = previousMapCapture(html).read('content-map.json')
  for (const field of [
    'identity',
    'kind',
    'identityReferences',
    'column',
    'type',
    'jsonPath',
    'nestedJson',
    'xpath'
  ]) {
    const previous = structuredClone(original)
    const slot = previousMapBody(previous)[0]
    reviewPreviousSlot(slot)
    const entity = previous.entities.find((e) => e.key === slot.entity)
    if (field === 'identity') entity.identity.note = 'another binding'
    else if (field === 'kind') entity.kind = 'article'
    else if (field === 'identityReferences') entity.identityReferences = { owner: 'article-3' }
    else slot[field] = field === 'jsonPath' ? ['different'] : field === 'type' ? 'url' : 'different'
    const run = previousMapCapture(html, previous)
    assertWritten(run)
    const now = previousMapBody(run.read('content-map.json'))[0]
    assert.notEqual(now.key, slot.key, field)
    assert.notEqual(now.role, slot.role, field)
    assert.notEqual(now.group?.id, slot.group.id, field)
  }
})

test('previous-map identity: literal samples require exact case whitespace and markup bytes', {
  skip:
    needsPhp.skip ||
    (!process.env.COWORK_SLOTS_HELPER && 'set real COWORK_SLOTS_HELPER for literal recapture integration')
}, () => {
  const html = '<pre><code> A  B\n((em))Case((/em)) </code></pre>'
  const original = previousMapCapture(html).read('content-map.json')
  const exact = previousMapBody(original)[0].sample
  for (const sample of [
    exact,
    exact.toLowerCase(),
    exact.trim(),
    exact.replace('  ', ' '),
    exact.replaceAll(/\(\(\/?em\)\)/g, '')
  ]) {
    const previous = structuredClone(original)
    const slot = previousMapBody(previous)[0]
    slot.sample = sample
    reviewPreviousSlot(slot)
    const run = previousMapCapture(html, previous)
    assertWritten(run)
    const now = previousMapBody(run.read('content-map.json'))[0]
    assert.equal(now.sample, exact)
    if (sample === exact) {
      assert.equal(now.key, slot.key)
      assert.equal(now.role, slot.role)
      assert.deepEqual(now.group, slot.group)
    } else {
      assert.notEqual(now.key, slot.key)
      assert.notEqual(now.role, slot.role)
      assert.notEqual(now.group?.id, slot.group.id)
    }
  }
})
