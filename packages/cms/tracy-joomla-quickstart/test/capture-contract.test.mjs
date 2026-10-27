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
  { countsFrom, args = [], existing, previous, blockFolders = [], schemas = {}, files = {} } = {}
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
      SLOTS_HELPER,
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
    // The release's Super User wrote a post too, but a provision takes that account over.
    { id: '42', name: 'Tracy Agent', username: 'tracyagent', admin: '1' }
  ]
  inv.user_profiles = [
    { user_id: '44', profile_key: 'profile.aboutme', profile_value: '"<p>Loves to <b>box</b></p>"' },
    { user_id: '44', profile_key: 'profile.user_jobtitle', profile_value: '"Boxer"' },
    { user_id: '44', profile_key: 'profile.user_tagline', profile_value: '""' },
    { user_id: '44', profile_key: 'profile.user_avatar', profile_value: '"images\\/author\\/pic-4.jpg"' },
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
    'user-44 name  text Drew Stokes  keep',
    'userProfile-4401 value  text Boxer keep',
    'userProfile-4403 value  image images/author/pic-4.jpg keep',
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
      ['user-44', { username: 'Drew_Stokes' }, null, 44],
      ['userProfile-4401', { field: 'user_jobtitle' }, { user_id: 'user-44' }, 4401],
      ['userProfile-4403', { field: 'user_avatar' }, { user_id: 'user-44' }, 4403],
      // The Super User has no `user` entity (its username changes); its picture is matched by the account id.
      ['userProfile-4203', { field: 'user_avatar', user_id: '42' }, null, 4203]
    ]
  )
  // The lock keeps an author's name and username, never the account.
  const lock = run.read('presentation-lock.json')
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
    '; Tracy\nTPL_TRY_CLASS = "Try a class"\nTPL_LEAD = "The 6 <span>punches</span>"\nTPL_CONTACT_SEND="Submit"\nTPL_UNUSED = "Not on any page"\nTPL_T4_SUPPORT="Support"\n',
  'templates/tracy/language/en-GB/en-GB.tpl_tracy.ini': 'TPL_TRY_CLASS = "Try a class (template copy)"\n',
  'language/en-GB/en-GB.tpl_tracy.sys.ini': 'TPL_TRACY_POSITION_MAIN="Main"\n',
  // An override the release ships is what a visitor reads.
  'language/overrides/en-GB.override.ini': 'TPL_CONTACT_SEND="Send it"\n',
  'language/en-GB/com_finder.ini': 'COM_FINDER_SEARCH="Search"\n',
  'templates/tracy/html/com_content/article/classes.php':
    "<?php echo Text::_('TPL_TRY_CLASS'); ?><h2><?php echo Text::_('TPL_LEAD'); ?></h2><?php echo JText::_(\"TPL_FOLLOW_US\"); echo Text::sprintf('TPL_CONTACT_SEND', 1);",
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
    assert.equal(roleOf(run, 'eyebrow').role, 'business.category_label')
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
  assert.equal(roleOf(run, 'eyebrow').role, 'business.category_label')
  assert.equal(unplacedBanner(run).length, 1, 'only the panel size remains')
})
