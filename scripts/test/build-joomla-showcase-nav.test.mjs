// The showcase-navigation map of a Joomla contract takes the template's showcase (typography, the
// "Joomla Pages" drawer, Home colour variants) out of the menus and nothing else. The golden negatives
// are the entries a shape-only rule got wrong while it was drawn: each must stay in the navigation.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generate, validate } from '../build-joomla-showcase-nav.mjs'
import {
  ancestors,
  buildJoomlaTree,
  shownToday,
  subcategoryDepth,
  subcategoryGlobal
} from '../lib/showcase-nav/joomla-tree.mjs'
import {
  FUNCTIONAL_OPTIONS,
  classifyJoomla,
  exposuresOf,
  isSampleListing,
  isSampleToken
} from '../lib/showcase-nav/rules.mjs'
import { sha256 } from '../lib/showcase-nav/common.mjs'
import {
  megaSubOperations,
  moduleId,
  placesModule,
  removeMegaColumn,
  removeMegaSub,
  spreadWidths
} from '../lib/showcase-nav/t3-megamenu.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/build-joomla-showcase-nav.mjs')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const DECISIONS = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/showcase-decisions.json'), 'utf8')
)
const MAP = 'showcase-nav-map.json'

const made = []
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** The map of a contract on disk, with the decisions the repo ships. */
function mapOf(id) {
  const { map, problems } = generate(path.join(CONTRACTS, id), id, DECISIONS.contracts[id])
  assert.deepEqual(problems, [], `${id} has no problem`)
  return map
}
const hiddenKeys = (map) => new Set(map.operations.map((o) => o.key))
const byLabel = (entries, label) => entries.filter((e) => e.label.trim() === label)

test('Diner: the "joomla-pages" drawer loses its sample screens and listings, and its emptied module goes', () => {
  const map = mapOf('ja-diner/j6/1.0.4')
  for (const label of ['J! Pages', 'Typography', 'Error Page', 'Offline Page', 'Fetured Articles'])
    assert.ok(byLabel(map.operations, label).length, `${label} leaves the navigation`)
  const drawer = map.operations.filter((o) => o.op === 'menuItem.param')
  assert.ok(
    drawer.every((o) => o.path === 'menu_show' && o.to === '0' && (o.from === '1' || o.from === null))
  )
  // "Our Blog" in the main menu lists category 8 and every subcategory under it, so the sample
  // listings "All categories" and "Tagged Items" lose no real content and leave with their heading.
  for (const label of ['All categories', 'Tagged Items'])
    assert.equal(byLabel(map.operations, label)[0]?.rule, 'hide.sample-listing', label)
  assert.equal(byLabel(map.operations, 'Joomla Content')[0]?.rule, 'hide.decision')
  assert.equal(map.operations.find((o) => o.key === 'module-113')?.rule, 'hide.module-renders-nothing')
  assert.ok(!map.unresolved.some((u) => /item-126/.test(u.where)), 'no mega panel waits on Joomla Content')
})

test('Nova: "Blog", the only route to the Blog category, stays reachable and its footer module stays', () => {
  const map = mapOf('ja-nova/j6/1.0.9')
  const blog = map.kept.find((k) => k.key === 'menuItem-113')
  assert.equal(blog?.rule, 'keep.only-route-to-content')
  assert.match(blog.reason, /category:8/)
  assert.ok(!hiddenKeys(map).has('menuItem-113'))
  assert.ok(!hiddenKeys(map).has('module-135'), 'the "J! Content" module still renders Blog')
  // The sample views beside it still leave.
  assert.ok(byLabel(map.operations, 'Author listting').length)
})

test('Mood: "News", the only route to the New Releases category, stays reachable with its heading', () => {
  const map = mapOf('ja-mood/j6/1.0.4')
  const news = map.kept.find((k) => k.key === 'menuItem-105')
  assert.equal(news?.rule, 'keep.only-route-to-content')
  assert.match(news.reason, /category:11/)
  const lock = JSON.parse(
    readFileSync(path.join(CONTRACTS, 'ja-mood/j6/1.0.4/presentation-lock.json'), 'utf8')
  )
  // Joomla drops the children of a hidden item: no ancestor of News may be hidden.
  for (
    let p = String(lock.entities['menuItem-105'].parent_id);
    p !== '1';
    p = String(lock.entities[`menuItem-${p}`].parent_id)
  )
    assert.ok(!hiddenKeys(map).has(`menuItem-${p}`), `ancestor menuItem-${p} stays`)
})

const treeOf = (id) =>
  buildJoomlaTree(
    JSON.parse(readFileSync(path.join(CONTRACTS, id, 'content-map.json'), 'utf8')),
    JSON.parse(readFileSync(path.join(CONTRACTS, id, 'presentation-lock.json'), 'utf8'))
  )

test('no committed map hides the only route to real content, or a working screen no decision names', () => {
  for (const id of Object.keys(DECISIONS.contracts)) {
    const map = JSON.parse(readFileSync(path.join(CONTRACTS, id, MAP), 'utf8'))
    if (map.status !== 'checked') continue
    const tree = treeOf(id)
    const hidden = new Set(map.operations.filter((o) => o.op === 'menuItem.param').map((o) => o.key))
    const live = (k) => [k, ...ancestors(tree, k)].every((a) => shownToday(tree.items.get(a)))
    const visible = [...tree.items.keys()].filter(
      (k) => live(k) && ![k, ...ancestors(tree, k)].some((a) => hidden.has(a))
    )
    const reached = new Set(visible.flatMap((k) => [...exposuresOf(tree, k)]))
    for (const [aid, a] of tree.articles)
      if (reached.has(`category:${a.catid}`) || (a.featured && reached.has('featured')))
        reached.add(`article:${aid}`)
    const named = new Set((DECISIONS.contracts[id].hide ?? []).map((e) => e.key))
    for (const k of hidden) {
      const item = tree.items.get(k)
      const target = item.aliasTarget ? tree.items.get(item.aliasTarget) : item
      const listing = map.operations.find((o) => o.key === k).rule === 'hide.sample-listing'
      if (FUNCTIONAL_OPTIONS.has(target?.query?.option) && !listing)
        assert.ok(
          named.has(k),
          `${id} ${k} "${item.title.trim()}" opens ${target.query.option} and no decision names it`
        )
      // A decision naming the entry itself may take a category page whose every published article is still
      // reached another way (JA Boxing's "Category Blog": its posts are all on the home page's featured view).
      const stillRead = (t) =>
        named.has(k) &&
        t.startsWith('category:') &&
        [...tree.articles]
          .filter(([, a]) => `category:${a.catid}` === t && a.published)
          .every(([aid]) => reached.has(`article:${aid}`))
      const lost = [...exposuresOf(tree, k)].filter(
        (t) => /^(article|category):/.test(t) && !reached.has(t) && !isSampleToken(tree, t) && !stillRead(t)
      )
      assert.deepEqual(lost, [], `${id} ${k} "${item.title.trim()}" is the only route to real content`)
    }
  }
})

test('Phio: "Home 2 - Minimal", a home demo, stays while it is the only route to Projects and its subcategories', () => {
  const map = mapOf('ja-phio/j6/1.0.8')
  const home2 = map.kept.find((k) => k.key === 'menuItem-133')
  assert.equal(home2?.rule, 'keep.only-route-to-content')
  assert.match(home2.reason, /category:16.*a showcase rule may not take real content along/)
  assert.ok(!hiddenKeys(map).has('menuItem-133'))
})

test('a branch hide keeps the working screens inside it unless a decision names each one', () => {
  // Donate has a member area (a top-bar Login): its sample drawer's user screens stay, for a person to decide.
  const donate = mapOf('ja-donate/j6/1.0.7')
  for (const label of ['Login', 'Registration', 'User Profile', 'Edit User Profile'])
    assert.equal(byLabel(donate.unresolved, label)[0]?.rule, 'unresolved.functional-in-hidden-branch', label)
  assert.ok(!byLabel(donate.operations, 'Login').length)
  // Diner names them one by one, with their own reason; Tagged Items, a sample listing, leaves by rule.
  const diner = mapOf('ja-diner/j6/1.0.4')
  for (const label of ['Login', 'Registration', 'User Profile', 'Edit User Profile', 'Smart Search']) {
    const op = byLabel(diner.operations, label)[0]
    assert.equal(op?.rule, 'hide.decision', label)
    assert.match(op.reason, /sample-pages drawer; the page and its URL keep working/)
  }
  assert.equal(byLabel(diner.operations, 'Tagged Items')[0]?.rule, 'hide.sample-listing')
  // Social II and Sensei: login is a real feature there.
  for (const id of ['ja-social-ii/j6/1.0.5', 'ja-sensei/j6/1.0.6'])
    for (const label of ['Login', 'Login page', 'Registration'])
      assert.ok(!byLabel(mapOf(id).operations, label).length, `${id} ${label}`)
})

test('Nova without its Blog category: Blog stays and is listed unresolved, never hidden', () => {
  const id = 'ja-nova/j6/1.0.9'
  const dir = mkdtempSync(path.join(tmpdir(), 'joomla-showcase-nav-'))
  made.push(dir)
  cpSync(path.join(CONTRACTS, id), dir, { recursive: true })
  const file = path.join(dir, 'content-map.json')
  const contentMap = JSON.parse(readFileSync(file, 'utf8'))
  const before = contentMap.entities.length
  contentMap.entities = contentMap.entities.filter(
    (e) => !(e.kind === 'category' && String(e.sourceId) === '8')
  )
  assert.equal(contentMap.entities.length, before - 1, 'category 8 was in the contract')
  writeFileSync(file, JSON.stringify(contentMap))
  const { map, problems } = generate(dir, id, DECISIONS.contracts[id])
  assert.deepEqual(problems, [])
  assert.ok(!hiddenKeys(map).has('menuItem-113'), 'Blog is not hidden')
  const blog = map.unresolved.find((u) => u.key === 'menuItem-113')
  assert.equal(blog?.rule, 'unresolved.missing-content')
  assert.match(blog.reason, /category:8/)
  assert.ok(!hiddenKeys(map).has('module-135'))
})

test('a contract with no content records is not covered, with the reason', () => {
  const id = 'ja-nova/j6/1.0.9'
  const dir = mkdtempSync(path.join(tmpdir(), 'joomla-showcase-nav-'))
  made.push(dir)
  cpSync(path.join(CONTRACTS, id), dir, { recursive: true })
  const file = path.join(dir, 'content-map.json')
  const contentMap = JSON.parse(readFileSync(file, 'utf8'))
  contentMap.entities = contentMap.entities.filter((e) => e.kind !== 'category' && e.kind !== 'article')
  writeFileSync(file, JSON.stringify(contentMap))
  const { map, problems } = generate(dir, id, DECISIONS.contracts[id])
  assert.deepEqual(problems, [])
  assert.equal(map.status, 'not-covered')
  assert.match(map.reason, /0 category and 0 article record/)
  assert.deepEqual(map.operations, [])
})

test('Diner: the Home colour variants leave; Offers, which opens the same featured view, stays', () => {
  const map = mapOf('ja-diner/j6/1.0.4')
  for (const label of ['Home - Red', 'Home - Pink', 'Home - Green', 'Home - Blue'])
    assert.equal(byLabel(map.operations, label)[0]?.rule, 'hide.home-branch-variant', label)
  assert.ok(byLabel(map.kept, 'Offers').length, 'Offers is kept')
  assert.ok(!byLabel(map.operations, 'Offers').length)
})

test('Morgan: no "Home" entry leaves the navigation', () => {
  const map = mapOf('ja-morgan/j6/1.0.9')
  assert.equal(byLabel(map.operations, 'Home').length, 0)
  assert.ok(byLabel(map.kept, 'Home').some((k) => k.rule === 'keep.homepage'))
})

test('Voyara: tour tag views stay', () => {
  const map = mapOf('ja-voyara/j6/1.0.11')
  const lock = JSON.parse(
    readFileSync(path.join(CONTRACTS, 'ja-voyara/j6/1.0.11/presentation-lock.json'), 'utf8')
  )
  const tags = Object.entries(lock.entities)
    .filter(([key, row]) => key.startsWith('menuItem-') && String(row.link ?? '').includes('option=com_tags'))
    .map(([key]) => key)
  assert.ok(tags.length > 0)
  for (const key of tags) assert.ok(!hiddenKeys(map).has(key), `${key} stays`)
})

test('Social II: Login and Registration stay (PO), Typography leaves', () => {
  const map = mapOf('ja-social-ii/j6/1.0.5')
  for (const label of ['Login page', 'Registration page', 'Registration'])
    assert.ok(byLabel(map.kept, label).length && !byLabel(map.operations, label).length, `${label} stays`)
  assert.ok(byLabel(map.operations, 'Typography').length)
})

test('Sensei: Login/Registration stay and the main menu module 123 is not touched', () => {
  const map = mapOf('ja-sensei/j6/1.0.6')
  for (const label of ['Login', 'Registration'])
    assert.ok(!byLabel(map.operations, label).length, `${label} stays`)
  assert.ok(!hiddenKeys(map).has('module-123'))
  assert.ok(map.kept.some((k) => k.key === 'module-123'))
})

test('Resume: anchors of the one-page homes stay', () => {
  const map = mapOf('ja-resume/j6/1.0.7')
  const lock = JSON.parse(
    readFileSync(path.join(CONTRACTS, 'ja-resume/j6/1.0.7/presentation-lock.json'), 'utf8')
  )
  const anchors = Object.entries(lock.entities)
    .filter(
      ([key, row]) =>
        key.startsWith('menuItem-') && row.type === 'url' && String(row.link ?? '').startsWith('#')
    )
    .map(([key]) => key)
  assert.ok(anchors.length > 0)
  for (const key of anchors) assert.ok(!hiddenKeys(map).has(key), `${key} stays`)
})

test('Seven: no mod_custom block is touched — only menu modules may be unpublished', () => {
  const map = mapOf('ja-seven/j6/1.0.5')
  const lock = JSON.parse(
    readFileSync(path.join(CONTRACTS, 'ja-seven/j6/1.0.5/presentation-lock.json'), 'utf8')
  )
  for (const o of map.operations.filter((x) => x.op === 'module.published'))
    assert.equal(lock.entities[o.key].module, 'mod_menu')
  assert.ok(Object.values(lock.entities).some((row) => row.module === 'mod_custom'))
})

test('Donate: the head-action "Donate Now!" stays', () => {
  const map = mapOf('ja-donate/j6/1.0.7')
  assert.ok(byLabel(map.kept, 'Donate Now!').length)
  assert.ok(!map.unresolved.some((u) => u.label.trim() === 'Donate Now!'))
})

test('every map on disk carries only menu_show 1/absent → 0, module published 1 → 0 and T3 mega sub/column removals', () => {
  for (const id of Object.keys(DECISIONS.contracts)) {
    const map = JSON.parse(readFileSync(path.join(CONTRACTS, id, MAP), 'utf8'))
    assert.deepEqual(validate(map), [], id)
    assert.ok(!JSON.stringify(map).includes('"unpublish'), id)
  }
})

test('a tree with no showcase gives an empty map that is still checked and valid', () => {
  const contentMap = {
    entities: [
      { key: 'menuItem-101', kind: 'menuItem', sourceId: 101 },
      { key: 'menuItem-102', kind: 'menuItem', sourceId: 102 }
    ]
  }
  const row = (id, title, home) => ({
    menutype: 'mainmenu',
    title,
    alias: title.toLowerCase(),
    path: title.toLowerCase(),
    type: 'component',
    link: 'index.php?option=com_content&view=article&id=1',
    published: '1',
    parent_id: '1',
    level: '1',
    home,
    language: '*',
    client_id: '0',
    params: '{}'
  })
  const lock = { entities: { 'menuItem-101': row(101, 'Home', '1'), 'menuItem-102': row(102, 'About', '0') } }
  const result = classifyJoomla(buildJoomlaTree(contentMap, lock), {})
  assert.deepEqual(result.operations, [])
  assert.deepEqual(result.problems, [])
  const map = { status: 'checked', operations: [], kept: result.kept, unresolved: [] }
  assert.deepEqual(validate(map), [])
})

test('a decision naming a wrong path or no reason is a problem, not a silent no-op', () => {
  const id = 'ja-diner/j6/1.0.4'
  const { problems } = generate(path.join(CONTRACTS, id), id, {
    hide: [{ key: 'menuItem-145', path: 'not/its/path', reason: 'x' }, { key: 'menuItem-146' }]
  })
  assert.equal(problems.length, 2)
})

function tree(ids) {
  const dir = mkdtempSync(path.join(tmpdir(), 'joomla-showcase-nav-'))
  made.push(dir)
  for (const id of ids) cpSync(path.join(CONTRACTS, id), path.join(dir, 'contracts', id), { recursive: true })
  const own = Object.fromEntries(
    ids.filter((id) => DECISIONS.contracts[id]).map((id) => [id, DECISIONS.contracts[id]])
  )
  writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify({ contracts: own }))
  return dir
}
const run = (dir, args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_JOOMLA_CONTRACTS: path.join(dir, 'contracts'),
      TRACY_JOOMLA_SHOWCASE_DECISIONS: path.join(dir, 'decisions.json')
    }
  })

test('--check fails once a base file changed under the map (stale baseHash)', () => {
  const id = 'ja-diner/j6/1.0.4'
  const dir = tree([id])
  assert.equal(run(dir, ['--check']).status, 0, 'the copied map is current')
  const file = path.join(dir, 'contracts', id, 'content-map.json')
  writeFileSync(file, `${readFileSync(file, 'utf8')} `)
  const res = run(dir, ['--check'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /stale or missing/)
})

// ── T3 mega sub ─────────────────────────────────────────────────────────────────────────────────────

test('Diner: Home keeps no T3 dropdown once its four colour variants leave — one byte-exact removal per style', () => {
  const id = 'ja-diner/j6/1.0.4'
  const map = mapOf(id)
  assert.equal(map.schemaVersion, 'tracy-quickstart-showcase-nav/joomla/v2')
  const subs = map.operations.filter((o) => o.op === 'templateStyle.megaSubRemove')
  assert.deepEqual(
    subs.map((o) => o.key),
    ['templateStyle-9', 'templateStyle-10', 'templateStyle-11', 'templateStyle-12', 'templateStyle-13']
  )
  const firstSub = map.operations.findIndex((o) => o.op === 'templateStyle.megaSubRemove')
  assert.ok(
    map.operations.slice(firstSub).every((o) => o.op === 'templateStyle.megaSubRemove'),
    'after the hides'
  )
  const lock = JSON.parse(readFileSync(path.join(CONTRACTS, id, 'presentation-lock.json'), 'utf8'))
  for (const o of subs) {
    assert.equal(o.path, 'mm_config.mainmenu.item-101.sub')
    assert.deepEqual(o.style, { id: Number(o.key.split('-')[1]), template: 'ja_diner' })
    const raw = lock.entities[o.key].params
    assert.equal(o.before, sha256(raw))
    const next = removeMegaSub(raw, 'mainmenu', 101).raw
    assert.equal(o.after, sha256(next))
    // Only the bytes of that one key go; everything around them is the release's own.
    const gone = raw.replace('\\"sub\\":{\\"rows\\":[[{\\"item\\":145,\\"width\\":12}]]}', '')
    assert.equal(next, gone)
  }
  assert.deepEqual(validate(map, treeOf(id)), [])
})

test('a map without a mega sub removal stays v1', () => {
  assert.equal(mapOf('ja-mood/j6/1.0.4').schemaVersion, 'tracy-quickstart-showcase-nav/joomla/v1')
})

/** A one-menu tree: Home (101) with children 145/146, and the given template styles. */
function megaTree(styles, lockOnly = {}) {
  const items = [
    [101, 'Home', '1', '1'],
    [145, 'Home - Red', '101', '2'],
    [146, 'Home - Blue', '101', '2'],
    [147, 'Old draft', '101', '2', '0'],
    [200, 'Pages', '1', '1'],
    [201, 'Typography', '200', '2']
  ]
  const contentMap = {
    entities: [
      ...items.map(([id]) => ({ key: `menuItem-${id}`, kind: 'menuItem', sourceId: id })),
      ...styles.map((_, i) => ({
        key: `templateStyle-${9 + i}`,
        kind: 'templateStyle',
        sourceId: 9 + i,
        identity: { title: `style ${9 + i}`, template: 'ja_test', client_id: '0' }
      }))
    ]
  }
  const entities = {}
  for (const [id, title, parent, level, published = '1'] of items)
    entities[`menuItem-${id}`] = {
      menutype: 'mainmenu',
      title,
      path: title.toLowerCase().replace(/\W+/g, '-'),
      type: 'component',
      link: 'index.php?option=com_content&view=featured',
      published,
      parent_id: parent,
      level,
      home: id === 101 ? '1' : '0',
      language: '*',
      client_id: '0',
      params: '{}'
    }
  styles.forEach((params, i) => {
    entities[`templateStyle-${9 + i}`] = {
      template: 'ja_test',
      client_id: '0',
      home: '0',
      title: `style ${9 + i}`,
      params
    }
  })
  return buildJoomlaTree(contentMap, { entities: { ...entities, ...lockOnly } })
}
const t3Params = (mm, extra = '') =>
  `{"t3_template":"1"${extra},"mm_config":${JSON.stringify(mm)},"x":"a\\/b"}`
const SUB = '{"mainmenu":{"item-101":{"sub":{"rows":[[{"item":145,"width":12}]]},"caption":"Eat"}}}'
const BOTH = new Set(['menuItem-145', 'menuItem-146'])

test('mega sub: emitted when every child leaves (an unpublished child does not count), other keys kept', () => {
  const tree = megaTree([t3Params(SUB)])
  const { operations, unresolved } = megaSubOperations(tree, BOTH)
  assert.deepEqual(unresolved, [])
  assert.equal(operations.length, 1)
  const raw = tree.styles.get('templateStyle-9').rawParams
  const next = removeMegaSub(raw, 'mainmenu', 101).raw
  assert.equal(next, t3Params('{"mainmenu":{"item-101":{"caption":"Eat"}}}'))
  assert.deepEqual(
    validate(
      { schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v2', operations, kept: [], unresolved },
      tree
    ),
    []
  )
})

test('mega sub: not emitted while one child stays visible; its hidden column head is listed unresolved', () => {
  const tree = megaTree([t3Params(SUB)])
  const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-145']))
  assert.deepEqual(operations, [])
  assert.deepEqual(
    unresolved.map((u) => u.rule),
    ['unresolved.mega-column-member-shown']
  )
  // A hidden child that heads no column breaks nothing: no op, nothing listed.
  assert.deepEqual(megaSubOperations(tree, new Set(['menuItem-146'])), { operations: [], unresolved: [] })
})

test('mega sub: a module column stays when every item column leaves; the sub is kept around it', () => {
  const mm =
    '{"mainmenu":{"item-101":{"sub":{"rows":[[{"item":145,"width":6},{"position":"112","width":6}]]}}}}'
  const tree = megaTree([t3Params(mm)])
  const { operations, unresolved } = megaSubOperations(tree, BOTH)
  assert.deepEqual(unresolved, [])
  assert.deepEqual(
    operations.map((o) => [o.op, o.column, o.path]),
    [['templateStyle.megaColumnRemove', 145, 'mm_config.mainmenu.item-101.sub.rows[item=145]']]
  )
  const next = removeMegaColumn(tree.styles.get('templateStyle-9').rawParams, 'mainmenu', 101, 145).raw
  assert.equal(next, t3Params('{"mainmenu":{"item-101":{"sub":{"rows":[[{"position":"112","width":12}]]}}}}'))
  assert.equal(operations[0].after, sha256(next))
})

test('mega sub: a style that is not T3 is never touched', () => {
  const params = `{"mm_config":${JSON.stringify(SUB)}}`
  assert.deepEqual(megaSubOperations(megaTree([params]), BOTH), { operations: [], unresolved: [] })
})

test('mega sub: an mm_config whose bytes no encoder reproduces is unresolved, not rewritten', () => {
  // A float PHP wrote as 12.0 and a space after a colon: JSON.parse cannot give either back.
  for (const mm of [SUB.replace('12}', '12.0}'), SUB.replace('"sub":', '"sub": ')]) {
    const { operations, unresolved } = megaSubOperations(megaTree([t3Params(mm)]), BOTH)
    assert.deepEqual(operations, [], mm)
    assert.equal(unresolved[0]?.rule, 'unresolved.mega-sub-encoding', mm)
  }
  // The string literal around it escapes one slash and not the other: no one encoder writes both.
  const inner = '{"mainmenu":{"item-101":{"sub":{"rows":[]}}},"a":"x/y","b":"z/w"}'
  const literal = JSON.stringify(inner).replaceAll('/', '\\/').replace('\\/', '/')
  const outer = `{"t3_template":"1","mm_config":${literal}}`
  assert.equal(JSON.parse(outer).mm_config, inner)
  assert.equal(removeMegaSub(outer, 'mainmenu', 101).rule, 'unresolved.mega-sub-encoding')
  // Escaped the same way throughout, it round-trips.
  assert.ok(removeMegaSub(outer.replace('x/y', 'x\\/y'), 'mainmenu', 101).raw)
})

test('mega sub: one operation per style that keeps the key, chained per style; a style without it is skipped', () => {
  const two = '{"mainmenu":{"item-101":{"sub":{"rows":[[{"item":145,"width":12}]]}},"item-200":{"sub":{}}}}'
  const tree = megaTree([t3Params(SUB), t3Params('{"mainmenu":{}}'), t3Params(two)])
  const { operations } = megaSubOperations(tree, new Set([...BOTH, 'menuItem-201']))
  assert.deepEqual(
    operations.map((o) => `${o.key} ${o.item}`),
    ['templateStyle-9 101', 'templateStyle-11 101', 'templateStyle-11 200']
  )
  assert.equal(operations[2].before, operations[1].after)
  assert.equal(operations[2].after, sha256(t3Params('{"mainmenu":{"item-101":{},"item-200":{}}}')))
  const map = {
    schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v2',
    operations,
    kept: [],
    unresolved: []
  }
  assert.deepEqual(validate(map, tree), [])
  // A tampered end, or the op under v1, is caught by --check.
  const bad = { ...map, operations: [{ ...operations[0], after: 'f'.repeat(64) }, operations[1]] }
  assert.ok(validate(bad, tree).some((p) => /does not end at its after/.test(p)))
  assert.ok(validate({ ...map, schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v1' }, tree).length)
})

test('mega sub: a shown child the lock holds but the content map leaves out keeps the dropdown, listed unresolved', () => {
  const row = (published, params) => ({
    menutype: 'mainmenu',
    title: 'Hidden extra',
    path: 'home/hidden-extra',
    type: 'component',
    link: 'index.php?option=com_content&view=featured',
    published,
    parent_id: '101',
    level: '2',
    home: '0',
    language: 'en-GB',
    client_id: '0',
    params
  })
  const shown = megaSubOperations(
    megaTree([t3Params(SUB)], { 'menuItem-160': row('1', '{"menu_show":"1"}') }),
    BOTH
  )
  assert.deepEqual(shown.operations, [])
  assert.equal(shown.unresolved[0]?.key, 'templateStyle-9')
  assert.equal(shown.unresolved[0].where, 'mm_config.mainmenu.item-101.sub')
  assert.equal(shown.unresolved[0].rule, 'unresolved.mega-column-member-shown')
  assert.match(shown.unresolved[0].reason, /menuItem-160/)
  // Unknown menu_show reads as shown, as the plugin reads it.
  for (const params of ['{}', '', 'not json', '{"menu_show":"2"}'])
    assert.equal(
      megaSubOperations(megaTree([t3Params(SUB)], { 'menuItem-160': row('1', params) }), BOTH).operations
        .length,
      0,
      params
    )
  // Not shown in the lock (unpublished, or menu_show "0"/0/false): the op goes ahead.
  for (const [published, params] of [
    ['0', '{}'],
    ['1', '{"menu_show":0}'],
    ['1', '{"menu_show":false}'],
    ['1', '{"menu_show":"0"}']
  ])
    assert.equal(
      megaSubOperations(megaTree([t3Params(SUB)], { 'menuItem-160': row(published, params) }), BOTH)
        .operations.length,
      1,
      `${published} ${params}`
    )
})

/** Lock-only children of Pages (200), shown unless the params say otherwise. */
const pagesChildren = (...ids) =>
  Object.fromEntries(
    ids.map((id) => [
      `menuItem-${id}`,
      {
        menutype: 'mainmenu',
        title: `Page ${id}`,
        path: `pages/page-${id}`,
        type: 'component',
        link: 'index.php?option=com_content&view=featured',
        published: '1',
        parent_id: '200',
        level: '2',
        home: '0',
        language: '*',
        client_id: '0',
        params: '{}'
      }
    ])
  )
const PAGES = (rows) => JSON.stringify({ mainmenu: { 'item-200': { sub: { width: 600, rows } } } })
const col = (item) => ({ item, width: 4 })

test('mega column: a column whose every child leaves is dropped from the sub, the rest re-spread over the row', () => {
  const tree = megaTree([t3Params(PAGES([[col(201), col(202), col(203)]]))], pagesChildren(202, 203))
  const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-201']))
  assert.deepEqual(unresolved, [])
  assert.equal(operations.length, 1)
  const o = operations[0]
  assert.deepEqual(
    {
      op: o.op,
      key: o.key,
      style: o.style,
      menutype: o.menutype,
      item: o.item,
      column: o.column,
      path: o.path
    },
    {
      op: 'templateStyle.megaColumnRemove',
      key: 'templateStyle-9',
      style: { id: 9, template: 'ja_test' },
      menutype: 'mainmenu',
      item: 200,
      column: 201,
      path: 'mm_config.mainmenu.item-200.sub.rows[item=201]'
    }
  )
  assert.equal(o.rule, 'hide.mega-column-of-hidden-items')
  assert.equal(o.before, sha256(tree.styles.get('templateStyle-9').rawParams))
  assert.equal(
    o.after,
    sha256(
      t3Params(
        PAGES([
          [
            { item: 202, width: 6 },
            { item: 203, width: 6 }
          ]
        ])
      )
    )
  )
  const map = { schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v2', operations, kept: [], unresolved }
  assert.deepEqual(validate(map, tree), [])
  // A column op whose path does not name its column, or under v1, is refused.
  assert.ok(
    validate({ ...map, operations: [{ ...o, path: 'mm_config.mainmenu.item-200.sub' }] }, tree).length
  )
  assert.ok(validate({ ...map, schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v1' }, tree).length)
  // A child the lock does not show (unpublished) counts as gone, like a hidden one.
  const lock = pagesChildren(202, 203)
  lock['menuItem-202'].published = '0'
  assert.deepEqual(
    megaSubOperations(
      megaTree([t3Params(PAGES([[col(201), col(202), col(203)]]))], lock),
      new Set(['menuItem-201'])
    ).operations.map((x) => x.column),
    [201, 202]
  )
})

test('mega column: a hidden head with a child still shown outside any column head stays, listed unresolved', () => {
  const tree = megaTree([t3Params(PAGES([[col(201), col(203)]]))], pagesChildren(202, 203))
  const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-201']))
  assert.deepEqual(operations, [])
  assert.equal(unresolved.length, 1)
  assert.deepEqual(
    { key: unresolved[0].key, where: unresolved[0].where, rule: unresolved[0].rule },
    {
      key: 'templateStyle-9',
      where: 'mm_config.mainmenu.item-200.sub',
      rule: 'unresolved.mega-column-member-shown'
    }
  )
  assert.match(unresolved[0].reason, /menuItem-201 leave while menuItem-202 stay/)
})

test('mega column: a module column is never touched; a row the drop empties goes with it', () => {
  const rows = [[col(201)], [col(202), { position: '112', width: 4 }]]
  const tree = megaTree([t3Params(PAGES(rows))], pagesChildren(202))
  const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-201']))
  assert.deepEqual(unresolved, [])
  assert.equal(operations[0].after, sha256(t3Params(PAGES([[col(202), { position: '112', width: 4 }]]))))
  // A column the sub does not hold, or a module id that matches the item, changes nothing.
  const raw = tree.styles.get('templateStyle-9').rawParams
  assert.deepEqual(removeMegaColumn(raw, 'mainmenu', 200, 999), { absent: true })
  assert.deepEqual(removeMegaColumn(raw, 'mainmenu', 200, 112), { absent: true })
})

test('mega column: when the last item column leaves and no module column stays, the whole sub goes', () => {
  const tree = megaTree([t3Params(PAGES([[col(201), col(202)]]))], pagesChildren(202))
  const { operations } = megaSubOperations(tree, new Set(['menuItem-201', 'menuItem-202']))
  assert.deepEqual(
    operations.map((o) => [o.op, o.path]),
    [['templateStyle.megaSubRemove', 'mm_config.mainmenu.item-200.sub']]
  )
  assert.equal(operations[0].after, sha256(t3Params('{"mainmenu":{"item-200":{}}}')))
})

test('mega column: a sub removal and a column removal on one style chain, and --check replays both', () => {
  const mm = JSON.stringify({
    mainmenu: {
      'item-101': { sub: { rows: [[{ item: 145, width: 12 }]] } },
      'item-200': { sub: { width: 600, rows: [[col(201), col(202)]] } }
    }
  })
  const tree = megaTree([t3Params(mm)], pagesChildren(202))
  const { operations, unresolved } = megaSubOperations(tree, new Set([...BOTH, 'menuItem-201']))
  assert.deepEqual(unresolved, [])
  assert.deepEqual(
    operations.map((o) => `${o.key} ${o.op} ${o.item}`),
    ['templateStyle-9 templateStyle.megaSubRemove 101', 'templateStyle-9 templateStyle.megaColumnRemove 200']
  )
  assert.equal(operations[0].before, sha256(tree.styles.get('templateStyle-9').rawParams))
  assert.equal(operations[1].before, operations[0].after)
  assert.equal(
    operations[1].after,
    sha256(
      t3Params(
        '{"mainmenu":{"item-101":{},"item-200":{"sub":{"width":600,"rows":[[{"item":202,"width":8}]]}}}}'
      )
    )
  )
  const map = { schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v2', operations, kept: [], unresolved }
  assert.deepEqual(validate(map, tree), [])
  // Out of order, the column op no longer starts where the style stands.
  assert.ok(
    validate({ ...map, operations: [operations[1], operations[0]] }, tree).some((p) =>
      /does not start where its params stand/.test(p)
    )
  )
})

test('mega column: a column is a module column exactly when T3 isset()s its position', () => {
  // Pages' only child leaves. Missing or null position: an item column; the emptied sub goes.
  // "" is a module column to T3, but module() loads id 0, which is nothing: the sub goes too.
  for (const extra of [{}, { position: null }, { position: '' }, { position: 'abc' }, { position: 0 }]) {
    const tree = megaTree([t3Params(PAGES([[{ item: 201, width: 12, ...extra }]]))])
    const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-201']))
    assert.deepEqual(unresolved, [], JSON.stringify(extra))
    assert.deepEqual(
      operations.map((o) => [o.op, o.path]),
      [['templateStyle.megaSubRemove', 'mm_config.mainmenu.item-200.sub']],
      JSON.stringify(extra)
    )
  }
  // A real module id: the panel still shows that module, so nothing is written.
  for (const position of ['112', ' 112', 112, '112abc']) {
    const tree = megaTree([t3Params(PAGES([[{ item: 201, width: 12, position }]]))])
    assert.deepEqual(
      megaSubOperations(tree, new Set(['menuItem-201'])),
      { operations: [], unresolved: [] },
      String(position)
    )
  }
  // A null-position column whose head leaves while another column stays: that column alone is dropped.
  const tree = megaTree(
    [t3Params(PAGES([[{ item: 201, width: 6, position: null }, col(202)]]))],
    pagesChildren(202)
  )
  const { operations } = megaSubOperations(tree, new Set(['menuItem-201']))
  assert.deepEqual(
    operations.map((o) => [o.op, o.column]),
    [['templateStyle.megaColumnRemove', 201]]
  )
  assert.equal(operations[0].after, sha256(t3Params(PAGES([[{ item: 202, width: 10 }]]))))
  // A position that is a list or an object is no shape T3 reads safely: unresolved, nothing written.
  const odd = megaTree([t3Params(PAGES([[{ item: 201, width: 12, position: ['112'] }]]))])
  assert.equal(
    megaSubOperations(odd, new Set(['menuItem-201'])).unresolved[0]?.rule,
    'unresolved.mega-sub-shape'
  )
  // The two predicates, as the plugin mirrors them.
  assert.deepEqual([{}, { position: null }, { position: '' }, { position: '7' }].map(placesModule), [
    false,
    false,
    true,
    true
  ])
  assert.deepEqual(['', 'abc', '  12x', '-3', 12.9, true, false, null, []].map(moduleId), [
    0,
    0,
    12,
    -3,
    12,
    1,
    0,
    null,
    null
  ])
  // PHP 8 reads a numeric prefix with a fraction and an exponent, as the plugin's intval() does.
  assert.deepEqual(
    ['0.5e1', '1e-5', '1e3', '1e3abc', '1e', '1e+2x', '-3.7e1', '.5', '5.', '0x1A', '1e999', '\v9'].map(
      moduleId
    ),
    [5, 0, 1000, 1000, 1, 100, -37, 0, 5, 0, 0, 9]
  )
  // An id past 2^53 is no id this rule can hold exactly: null, which the sub reads as a shape it cannot judge.
  assert.deepEqual(['99999999999999999999', 1e19].map(moduleId), [null, null])
})

// ── mega column widths: the columns left in a row are re-spread over the row's old total ──────────

test('mega column widths: integers stay integers, digit strings stay strings, the row keeps its total', () => {
  const w = (widths, drop) => {
    const row = widths.map((width, i) => ({ item: 300 + i, width }))
    return spreadWidths(
      row,
      row.filter((_, i) => !drop.includes(i))
    ).widths
  }
  assert.deepEqual(w([4, 4, 4], [0]), [6, 6])
  assert.deepEqual(w(['6', '3', '3'], [2]), ['8', '4'])
  assert.deepEqual(w([4, 4, 4], [0, 1]), [12])
  // T = 12, S = 9: 5·12/9 = 6 r6, 4·12/9 = 5 r3 → 11; the one unit left goes to the larger remainder.
  assert.deepEqual(w([5, 4, 3], [2]), [7, 5])
  // Equal remainders: the leftmost first. T = 12, S = 9: 3·12/9 = 4 r0 each → 12, nothing left.
  assert.deepEqual(w([3, 3, 3, 3], [3]), [4, 4, 4])
  // T = 12, S = 7: 3·12/7 = 5 r1, 2·12/7 = 3 r3 twice → 11; the unit goes to the first 2.
  assert.deepEqual(w([3, 2, 2, 5], [3]), [5, 4, 3])
  // A row that does not sum to 12 keeps its own total.
  assert.deepEqual(w([3, 3, 4], [2]), [5, 5])
  // w·T passes 2^53 while every width and the total are exact: the spread still keeps the total.
  // T − S = 45: a·45/S = 7.9955…, b·45/S = 37.0045…, so a gains 8 (7 and the one unit left) and b 37.
  assert.deepEqual(w([174310442144858, 806747342639474, 45], [2]), [174310442144866, 806747342639511])
})

test('mega column widths: an encoding the rule cannot reproduce leaves the panel as it is, listed unresolved', () => {
  for (const row of [
    [col(201), { item: 202, width: '4' }],
    [col(201), { item: 202 }],
    [col(201), { item: 202, width: 4, class: 'wide' }],
    [col(201), { item: 202, width: 4.5 }],
    [col(201), { item: 202, width: '04' }],
    [col(201), { item: 202, width: 0 }],
    // A width, or a row total, past 2^53 is not one JavaScript holds exactly, like an id.
    [
      { item: 201, width: '9007199254740993' },
      { item: 202, width: '1' }
    ],
    [
      { item: 201, width: '4503599627370496' },
      { item: 202, width: '4503599627370496' }
    ],
    [
      { item: 201, width: 9007199254740991 },
      { item: 202, width: 1 }
    ]
  ]) {
    const tree = megaTree([t3Params(PAGES([row]))], pagesChildren(202))
    const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-201']))
    assert.deepEqual(operations, [], JSON.stringify(row))
    assert.deepEqual(
      unresolved.map((u) => [u.rule, u.where]),
      [['unresolved.mega-column-width', 'mm_config.mainmenu.item-200.sub']],
      JSON.stringify(row)
    )
  }
})

test('mega column widths: only a row that lost a column is re-spread; a module column takes its share', () => {
  const rows = [
    [col(201), col(202), { position: '112', width: 4 }],
    [
      { item: 203, width: 6 },
      { item: 204, width: 6 }
    ]
  ]
  const tree = megaTree([t3Params(PAGES(rows))], pagesChildren(202, 203, 204))
  const { operations, unresolved } = megaSubOperations(tree, new Set(['menuItem-201']))
  assert.deepEqual(unresolved, [])
  assert.match(operations[0].reason, /re-spread over the row's old width/)
  assert.equal(
    operations[0].after,
    sha256(
      t3Params(
        PAGES([
          [
            { item: 202, width: 6 },
            { position: '112', width: 6 }
          ],
          rows[1]
        ])
      )
    )
  )
})

// ── sample listings: all categories, featured and tags in a showcase menu or drawer ──────────────

/** A small site: a main menu, a drawer menu, two categories, and the modules that render the menus. */
function listingTree({ items, categories = [], articles = [], modules = [] }, global = null) {
  const entities = []
  const rows = {}
  for (const [id, menutype, title, parent, link, params = {}, type = 'component'] of items) {
    entities.push({ key: `menuItem-${id}`, kind: 'menuItem', sourceId: id })
    rows[`menuItem-${id}`] = {
      menutype,
      title,
      alias: title.toLowerCase().replace(/\W+/g, '-'),
      path: title.toLowerCase().replace(/\W+/g, '-'),
      type,
      link,
      published: '1',
      parent_id: String(parent),
      level: parent === 1 ? '1' : '2',
      home: id === 101 ? '1' : '0',
      language: '*',
      client_id: '0',
      params: JSON.stringify(params)
    }
  }
  for (const [id, title, parent] of categories) {
    entities.push({ key: `category-${id}`, kind: 'category', sourceId: id })
    rows[`category-${id}`] = { title, parent_id: String(parent), published: '1', extension: 'com_content' }
  }
  for (const [id, title, catid, featured = '0'] of articles) {
    entities.push({ key: `article-${id}`, kind: 'article', sourceId: id })
    rows[`article-${id}`] = { title, alias: title.toLowerCase(), catid: String(catid), featured, state: '1' }
  }
  const assignments = []
  for (const [id, position, menutype] of modules) {
    entities.push({ key: `module-${id}`, kind: 'module', sourceId: id })
    rows[`module-${id}`] = {
      title: `Menu ${id}`,
      module: 'mod_menu',
      position,
      published: '1',
      client_id: '0',
      params: JSON.stringify({ menutype, startLevel: 1, endLevel: 0 })
    }
    assignments.push({ moduleid: String(id), menuid: '0' })
  }
  return buildJoomlaTree({ entities }, { entities: rows, assignments }, { subcategoryGlobal: global })
}
const BLOG = (depth) => ({ layout_type: 'blog', show_subcategory_content: depth })
const LISTING_SITE = (blogDepth, extra = []) => ({
  items: [
    [101, 'mainmenu', 'Home', 1, 'index.php?option=com_content&view=article&id=1'],
    [
      102,
      'mainmenu',
      'Blog',
      1,
      'index.php?option=com_content&view=category&layout=blog&id=8',
      BLOG(blogDepth)
    ],
    [301, 'drawer', 'Featured Articles', 1, 'index.php?option=com_content&view=featured'],
    [302, 'drawer', 'Tagged Items', 1, 'index.php?option=com_tags&view=tag&id[0]=2'],
    [303, 'drawer', 'All categories', 1, 'index.php?option=com_content&view=categories&id=8'],
    ...extra
  ],
  categories: [
    [8, 'Blog', 1],
    [9, 'Recipes', 8]
  ],
  articles: [
    [1, 'Welcome', 8],
    [2, 'Pasta', 9],
    [3, 'Soup', 8, '1']
  ],
  modules: [
    [1, 'offcanvas', 'drawer'],
    [2, 'mainnav', 'mainmenu']
  ]
})

test('sample listing: which entries are sample listings', () => {
  const q = (link) => ({ type: 'component', query: Object.fromEntries(new URL(`x:/?${link}`).searchParams) })
  assert.deepEqual(
    [
      'option=com_content&view=featured',
      'option=com_content&view=categories',
      'option=com_tags&view=tag',
      'option=com_tags&view=tags',
      'option=com_content&view=category&id=8',
      'option=com_tags&view=tag&layout=list',
      'option=com_contact&view=featured'
    ].map((l) => isSampleListing(q(l))),
    [true, true, true, true, false, true, false]
  )
  assert.equal(isSampleListing({ type: 'alias', query: { option: 'com_tags', view: 'tag' } }), false)
})

test('sample listing: in a drawer-only menu, Featured, Tagged and All categories leave, and the emptied drawer goes', () => {
  const result = classifyJoomla(listingTree(LISTING_SITE('-1')), {})
  assert.deepEqual(result.problems, [])
  const ops = new Map(result.operations.map((o) => [o.key, o.rule]))
  for (const k of ['menuItem-301', 'menuItem-302', 'menuItem-303'])
    assert.equal(ops.get(k), 'hide.sample-listing', k)
  assert.equal(ops.get('module-1'), 'hide.module-renders-nothing')
  // Nothing in the main menu changes, and its module stays.
  assert.ok(!ops.has('menuItem-101') && !ops.has('menuItem-102') && !ops.has('module-2'))
})

test('sample listing: one that is the only route to real content stays as it stood before the rule', () => {
  // Blog lists only category 8: Recipes (category 9) is reached by "All categories" alone.
  const result = classifyJoomla(listingTree(LISTING_SITE('')), {})
  const ops = new Map(result.operations.map((o) => [o.key, o.rule]))
  assert.equal(ops.get('menuItem-301'), 'hide.sample-listing')
  assert.equal(ops.get('menuItem-302'), 'hide.sample-listing')
  assert.ok(!ops.has('menuItem-303'))
  assert.equal(result.unresolved.find((u) => u.key === 'menuItem-303')?.rule, 'unresolved.drawer-menu')
  assert.ok(!ops.has('module-1'), 'the drawer still renders All categories')
  // A blog that lists one level of subcategories reaches Recipes again.
  const one = classifyJoomla(listingTree(LISTING_SITE('1')), {})
  assert.equal(one.operations.find((o) => o.key === 'menuItem-303')?.rule, 'hide.sample-listing')
})

test('sample listing: one a main-menu entry leads to stays; a listing outside any showcase is never touched', () => {
  const alias = [104, 'mainmenu', 'News', 1, '', { aliasoptions: '302' }, 'alias']
  const used = classifyJoomla(listingTree(LISTING_SITE('-1', [alias])), {})
  const ops = new Map(used.operations.map((o) => [o.key, o.rule]))
  assert.ok(!ops.has('menuItem-302'), 'News in the main menu opens Tagged Items')
  assert.ok(!ops.has('menuItem-104'))
  assert.ok(!ops.has('module-1'))
  // A tag view in the main menu itself is the business's: a working feature, kept.
  const tags = [105, 'mainmenu', 'Tags', 1, 'index.php?option=com_tags&view=tags']
  const main = classifyJoomla(listingTree(LISTING_SITE('-1', [tags])), {})
  assert.ok(!main.operations.some((o) => o.key === 'menuItem-105'))
  assert.equal(main.kept.find((k) => k.key === 'menuItem-105')?.rule, 'keep.functional-default')
})

test('sample listing: a tag view a branch decision sweeps leaves without a decision of its own', () => {
  const site = LISTING_SITE('-1', [
    [200, 'mainmenu', 'Joomla Pages', 1, '', {}, 'heading'],
    [201, 'mainmenu', 'Tagged Items', 200, 'index.php?option=com_tags&view=tag&id[0]=2'],
    [202, 'mainmenu', 'Login', 200, 'index.php?option=com_users&view=login']
  ])
  const result = classifyJoomla(listingTree(site), {
    hide: [{ key: 'menuItem-200', subtree: true, reason: 'the sample-pages branch' }]
  })
  const ops = new Map(result.operations.map((o) => [o.key, o.rule]))
  assert.equal(ops.get('menuItem-201'), 'hide.sample-listing')
  // A working screen in the same branch still waits for a decision that names it.
  assert.equal(
    result.unresolved.find((u) => u.key === 'menuItem-202')?.rule,
    'unresolved.functional-in-hidden-branch'
  )
})

test('a category blog reaches its subcategories as deep as show_subcategory_content says', () => {
  const cat = { option: 'com_content', view: 'category', id: '8' }
  assert.equal(subcategoryDepth({ ...cat, layout: 'blog' }, { show_subcategory_content: '-1' }), Infinity)
  assert.equal(subcategoryDepth(cat, { layout_type: 'blog', show_subcategory_content: '2' }), 2)
  // Empty defers to the global setting, which the contract does not carry: no reach.
  assert.equal(subcategoryDepth({ ...cat, layout: 'blog' }, { show_subcategory_content: '' }), 0)
  assert.equal(subcategoryDepth({ ...cat, layout: 'blog' }, {}), 0)
  // A list layout lists no subcategory articles.
  assert.equal(subcategoryDepth(cat, { show_subcategory_content: '-1' }), 0)
  const tree = listingTree({
    items: [
      [102, 'mainmenu', 'Blog', 1, 'index.php?option=com_content&view=category&layout=blog&id=8', BLOG('1')]
    ],
    categories: [
      [8, 'Blog', 1],
      [9, 'Recipes', 8],
      [10, 'Pasta', 9]
    ]
  })
  assert.deepEqual([...exposuresOf(tree, 'menuItem-102')], ['category:8', 'category:9'])
})

test('an empty show_subcategory_content defers to the com_content default of the pinned Joomla release', () => {
  const cat = { option: 'com_content', view: 'category', id: '8', layout: 'blog' }
  assert.equal(subcategoryDepth(cat, { show_subcategory_content: '' }, '-1'), Infinity)
  assert.equal(subcategoryDepth(cat, {}, '1'), 1)
  // A value of its own outranks the global.
  assert.equal(subcategoryDepth(cat, { show_subcategory_content: '0' }, '-1'), 0)
  assert.deepEqual(subcategoryGlobal({ quickstart: { cms: { version: '6.1.1' } } }), {
    value: '0',
    source: 'com_content config.xml default of Joomla 6.1.1'
  })
  assert.equal(subcategoryGlobal({ quickstart: { platformVersion: '6.0.3' } }).value, '0')
  assert.equal(subcategoryGlobal({ quickstart: { cms: { version: '5.4.0' } } }).value, null)
  assert.equal(subcategoryGlobal({}).value, null)
  const items = [
    [102, 'mainmenu', 'Blog', 1, 'index.php?option=com_content&view=category&layout=blog&id=8', BLOG('')]
  ]
  const categories = [
    [8, 'Blog', 1],
    [9, 'Recipes', 8]
  ]
  assert.deepEqual(
    [...exposuresOf(listingTree({ items, categories }, '-1'), 'menuItem-102')],
    ['category:8', 'category:9']
  )
  assert.deepEqual([...exposuresOf(listingTree({ items, categories }, '0'), 'menuItem-102')], ['category:8'])
})

const HOME_BRANCH = (extra = []) => ({
  items: [
    [100, 'mainmenu', 'Homepages', 1, '', {}, 'heading'],
    [101, 'mainmenu', 'Home', 100, 'index.php?option=com_content&view=featured'],
    [
      103,
      'mainmenu',
      'Studio',
      100,
      'index.php?option=com_content&view=category&layout=blog&id=9',
      BLOG('0')
    ],
    [104, 'mainmenu', 'Blog', 1, 'index.php?option=com_content&view=category&layout=blog&id=8', BLOG('0')],
    ...extra
  ],
  categories: [
    [8, 'Blog', 1],
    [9, 'Projects', 1]
  ],
  articles: [
    [1, 'Welcome', 8, '1'],
    [2, 'Bridge', 9]
  ]
})

test('a home demo that is the only route to real content stays; once another entry reaches it, it leaves', () => {
  const alone = classifyJoomla(listingTree(HOME_BRANCH()), {})
  assert.equal(alone.kept.find((k) => k.key === 'menuItem-103')?.rule, 'keep.only-route-to-content')
  assert.ok(!alone.operations.some((o) => o.key === 'menuItem-103'))
  const covered = HOME_BRANCH([
    [105, 'mainmenu', 'Projects', 1, 'index.php?option=com_content&view=category&id=9']
  ])
  const result = classifyJoomla(listingTree(covered), {})
  assert.equal(result.operations.find((o) => o.key === 'menuItem-103')?.rule, 'hide.home-branch-variant')
})

const STOCK_SITE = (extra = []) => ({
  items: [
    [101, 'mainmenu', 'Home', 1, 'index.php?option=com_content&view=featured'],
    [200, 'mainmenu', 'Pages', 1, '', {}, 'heading'],
    [201, 'mainmenu', 'Landing', 200, 'index.php?option=com_content&view=featured'],
    [202, 'mainmenu', 'Single Article', 200, 'index.php?option=com_content&view=article&id=2'],
    [203, 'mainmenu', 'All Tags', 200, 'index.php?option=com_tags&view=tags'],
    [204, 'mainmenu', 'Login', 200, 'index.php?option=com_users&view=login'],
    [205, 'mainmenu', 'Register', 200, 'index.php?option=com_users&view=registration'],
    [210, 'mainmenu', 'Product', 1, '', {}, 'heading'],
    [211, 'mainmenu', 'Features', 210, 'index.php?option=com_content&view=article&id=1'],
    [212, 'mainmenu', 'Blog', 210, 'index.php?option=com_content&view=category&layout=blog&id=8', BLOG('0')],
    [213, 'mainmenu', 'All Categories', 210, 'index.php?option=com_content&view=categories&id=8'],
    ...extra
  ],
  categories: [[8, 'Blog', 1]],
  articles: [
    [1, 'Features', 8, '1'],
    [2, 'Release notes', 8]
  ]
})

test('a heading of mostly stock screens is the sample-pages branch whatever its name', () => {
  const result = classifyJoomla(listingTree(STOCK_SITE()), {})
  assert.deepEqual(result.problems, [])
  const ops = new Map(result.operations.map((o) => [o.key, o.rule]))
  const kept = new Map(result.kept.map((k) => [k.key, k.rule]))
  assert.equal(ops.get('menuItem-201'), 'hide.sample-listing', 'Landing, the featured view again')
  // Its working screens stay, the tag index included; a content entry waits for a decision.
  for (const k of ['menuItem-203', 'menuItem-204', 'menuItem-205'])
    assert.equal(kept.get(k), 'keep.functional-default', k)
  assert.equal(
    result.unresolved.find((u) => u.key === 'menuItem-202')?.rule,
    'unresolved.stock-screens-branch'
  )
  // A main-menu heading of mostly real pages keeps its sample listing.
  for (const k of ['menuItem-210', 'menuItem-211', 'menuItem-212', 'menuItem-213']) assert.ok(!ops.has(k), k)
  assert.equal(kept.get('menuItem-213'), 'keep.default')
})

test('a stock screen drawn by a template layout does not count toward a sample-pages branch', () => {
  const layout = 'index.php?option=com_content&view=categories&layout=ja_podcast:podcast-1&id=8'
  const site = {
    items: [
      [101, 'mainmenu', 'Home', 1, 'index.php?option=com_content&view=article&id=1'],
      [200, 'mainmenu', 'Podcasts', 1, '', {}, 'heading'],
      [201, 'mainmenu', 'Listing 1', 200, layout],
      [202, 'mainmenu', 'Listing 2', 200, layout.replace('podcast-1', 'podcast-2')],
      [203, 'mainmenu', 'Latest', 200, 'index.php?option=com_content&view=category&id=8']
    ],
    categories: [[8, 'Shows', 1]],
    articles: [[1, 'Welcome', 8]]
  }
  const result = classifyJoomla(listingTree(site), {})
  assert.deepEqual(result.operations, [])
  assert.ok(!result.unresolved.some((u) => u.rule === 'unresolved.stock-screens-branch'))
})

test('a home or colour label outside the home branch leaves only when it opens sample content or the home page again', () => {
  const site = {
    items: [
      [101, 'mainmenu', 'Home', 1, 'index.php?option=com_content&view=featured'],
      [200, 'mainmenu', 'Resources', 1, '', {}, 'heading'],
      [201, 'mainmenu', 'Colour', 200, 'index.php?option=com_content&view=article&id=3'],
      [202, 'mainmenu', 'Home — variant', 200, 'index.php?option=com_content&view=featured'],
      [203, 'mainmenu', 'Home Services', 200, 'index.php?option=com_content&view=article&id=1'],
      [204, 'mainmenu', 'Blog', 200, 'index.php?option=com_content&view=category&layout=blog&id=8', BLOG('0')]
    ],
    categories: [
      [2, 'Uncategorised', 1],
      [8, 'Blog', 1]
    ],
    articles: [
      [1, 'Home services', 8],
      [2, 'Welcome', 8, '1'],
      [3, 'Color roles', 2]
    ]
  }
  const result = classifyJoomla(listingTree(site), {})
  const ops = new Map(result.operations.map((o) => [o.key, o.rule]))
  assert.equal(ops.get('menuItem-201'), 'hide.variant-opens-sample', 'a kit article in Uncategorised')
  assert.equal(ops.get('menuItem-202'), 'hide.variant-opens-sample', 'the featured view the home page opens')
  // A real page reached by the blog too: the label alone never hides it.
  assert.ok(!ops.has('menuItem-203'))
  assert.equal(result.unresolved.find((u) => u.key === 'menuItem-203')?.rule, 'unresolved.variant-label')
})

test('Kinetic: Landing leaves the "Pages" branch, its working screens stay, Product keeps every entry', () => {
  for (const id of ['ja-kinetic/j6/1.0.9', 'ja-kinetic/j6/1.0.10']) {
    const map = mapOf(id)
    assert.equal(map.operations.find((o) => o.key === 'menuItem-229')?.rule, 'hide.sample-listing', id)
    for (const k of ['menuItem-231', 'menuItem-232', 'menuItem-233', 'menuItem-234'])
      assert.equal(map.kept.find((e) => e.key === k)?.rule, 'keep.functional-default', `${id} ${k}`)
    for (const k of ['menuItem-217', 'menuItem-250', 'menuItem-251', 'menuItem-252'])
      assert.ok(!hiddenKeys(map).has(k) && map.kept.some((e) => e.key === k), `${id} ${k}`)
  }
})

test('Tracy Airbnb: "Colour" (a token sheet in Uncategorised) and "Home — variant" (the featured view again) leave', () => {
  const map = mapOf('tracy-airbnb/j6/1.2.0')
  for (const k of ['menuItem-242', 'menuItem-246'])
    assert.equal(map.operations.find((o) => o.key === k)?.rule, 'hide.variant-opens-sample', k)
  assert.deepEqual(map.unresolved, [])
})

test('a JoomlArt sample-pages branch ("J!Pages", "J! Content") hides its non-functional entries without a decision', () => {
  // JA Boxing 1.0.4 with no decision: the kit branch's sample screens and listings leave by rule, its working screens
  // (Smart Search) stay, and Category Blog stays as the only route to the Blogs category (the cascade guard).
  const id = 'ja-boxing/j6/1.0.4'
  const { map, problems } = generate(path.join(CONTRACTS, id), id, undefined)
  assert.deepEqual(problems, [])
  const hidden = hiddenKeys(map)
  for (const key of [
    'menuItem-159',
    'menuItem-160',
    'menuItem-161',
    'menuItem-164',
    'menuItem-165',
    'menuItem-166'
  ])
    assert.ok(hidden.has(key), `${key} leaves the navigation`)
  assert.equal(map.operations.find((o) => o.key === 'menuItem-165').rule, 'hide.kit-branch')
  assert.ok(!hidden.has('menuItem-162'), 'Smart Search, a working screen, stays unless decided')
  assert.ok(!hidden.has('menuItem-163'), 'Category Blog stays: the only route to the Blogs category')
  assert.deepEqual(
    map.unresolved.filter((u) => u.rule === 'unresolved.showcase-word').map((u) => u.key),
    [],
    'nothing under a kit branch is left as an undecided showcase word'
  )
})

test('JA Boxing: the whole Pages branch leaves the navigation, its pages keep their URLs', () => {
  const map = mapOf('ja-boxing/j6/1.0.4')
  const hidden = hiddenKeys(map)
  for (let id = 152; id <= 166; id += 1)
    assert.ok(hidden.has(`menuItem-${id}`), `menuItem-${id} leaves the navigation`)
  assert.deepEqual(map.unresolved, [])
  for (const o of map.operations) assert.equal(o.path, 'menu_show', 'only "Display in Menu" changes')
  for (const key of ['menuItem-101', 'menuItem-167', 'menuItem-168', 'menuItem-169', 'menuItem-193'])
    assert.ok(!hidden.has(key), `${key} stays`)
})
