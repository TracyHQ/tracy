// The WordPress showcase-navigation map, on the raw markup each release ships (navigation-source.json):
// showcase links leave a navigation, a header drawer is repointed or removed when a decision says so, and every step is pinned
// to the bytes it edits. A contract with no source is "not-covered".
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generate, validate } from '../build-wordpress-showcase-nav.mjs'
import { listingsOf } from '../../packages/cms/tracy-wordpress-quickstart/scripts/capture-navigation-source.mjs'
import { sha256 } from '../lib/showcase-nav/common.mjs'
import {
  applyOperations,
  navigationRefsOf,
  navItems,
  parseBlocks,
  planWordpress,
  removeBlock,
  removeLink,
  setNavigationRef
} from '../lib/showcase-nav/wp-navigation-ast.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/build-wordpress-showcase-nav.mjs')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
const DECISIONS = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/showcase-decisions.json'), 'utf8')
)
const DINER = 'ja-diner/wp7/1.0.1'
const MORGAN = 'ja-morgan/wp7/1.1.16'
const RESTAURANT = 'ja-restaurant/wp7/1.0.1'
const KINETIC = 'ja-kinetic/wp7/1.0.12'

const made = []
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
const scratch = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-showcase-nav-'))
  made.push(dir)
  return dir
}
const sourceOf = (id) => JSON.parse(readFileSync(path.join(CONTRACTS, id, 'navigation-source.json'), 'utf8'))
const inventoryOf = (id) => JSON.parse(readFileSync(path.join(CONTRACTS, id, 'inventory.json'), 'utf8'))
/** The plan of a source changed in memory, read with its release's pages as the builder reads them. */
const planOf = (id, source, decisions = {}) =>
  planWordpress(source, decisions, { pages: inventoryOf(id).posts })
const real = (id) => generate(path.join(CONTRACTS, id), id, DECISIONS.contracts[id])
const labelsIn = (markup) => navItems(parseBlocks(markup)).map((i) => i.label)
const header = (source) => source.templateParts.find((p) => p.area === 'header')

test('Diner: the Home colour variants leave the main menu; the header drawer keeps its account pages and Smart Search', () => {
  const { map, problems } = real(DINER)
  assert.deepEqual(problems, [])
  assert.equal(map.status, 'checked')
  const removed = map.operations
    .filter((o) => o.op === 'navigation.removeLink' && o.navigation.id === 93)
    .map((o) => o.label)
  assert.deepEqual(removed, ['Home - Red', 'Home - Pink', 'Home - Green', 'Home - Blue'])
  assert.ok(!map.operations.some((o) => o.op.startsWith('templatePart.')), 'the header is left as shipped')
  for (const label of ['About Us', 'Reservation', 'Offers', 'Our Blog', 'Contact Us'])
    assert.ok(
      map.kept.some((k) => k.label === label && k.key === 'navigation-93'),
      label
    )
  // Every sample entry of Content leaves, so the emptied submenu goes with them.
  const content = map.operations.find((o) => o.navigation?.id === 278 && o.label === 'Content')
  assert.equal(content.rule, 'hide.empty-heading')

  // Replaying the operations on the release's bytes lands on the sha256 the map promises.
  const source = sourceOf(DINER)
  const current = applyOperations(source, map.operations)
  const part = header(source)
  assert.equal(sha256(current.get(`templatePart-${part.id}`)), part.sha256)
  assert.ok(navigationRefsOf(current.get(`templatePart-${part.id}`)).includes(278))
  const drawer = map.finals.find((f) => f.key === 'navigation-278')
  assert.equal(sha256(current.get('navigation-278')), drawer.after)
  assert.deepEqual(labelsIn(current.get('navigation-278')), [
    'J! Pages',
    'Login',
    'Registration',
    'User Profile',
    'Edit User Profile',
    'Other Pages',
    'Smart Search'
  ])
  const main = labelsIn(current.get('navigation-93'))
  for (const label of ['Home', 'About Us', 'Reservation', 'Offers', 'Our Blog', 'Contact Us'])
    assert.ok(main.includes(label), label)
  assert.ok(!main.some((l) => l.startsWith('Home - ')))
  assert.deepEqual(validate(map), [])
})

test('Morgan: the Site Pages drawer and its toggle stay; only its sample screens leave', () => {
  const { map, problems } = real(MORGAN)
  assert.deepEqual(problems, [])
  assert.ok(!map.operations.some((o) => o.op.startsWith('templatePart.')), 'the header is left as shipped')
  const source = sourceOf(MORGAN)
  const current = applyOperations(source, map.operations)
  const part = current.get(`templatePart-${header(source).id}`)
  assert.ok(part.includes('jm-off-canvas'))
  assert.deepEqual([...new Set(navigationRefsOf(part))], [158, 160])
  assert.deepEqual(labelsIn(current.get('navigation-160')), [
    'Site Pages',
    'Login',
    'Registration',
    'Profile',
    'Edit Profile',
    'Other Pages',
    'Smart Search',
    'Content',
    'Tagged Items'
  ])
  const removed = map.operations.filter((o) => o.navigation?.id === 160).map((o) => o.label)
  for (const label of ['Typography', 'Error Page', 'Offline Page', 'Featured Articles', 'Single Article'])
    assert.ok(removed.includes(label), label)
  assert.deepEqual(validate(map), [])
})

test('Restaurant: the Explore branch leaves the main menu whole once its sample listings are decided; the business entries stay', () => {
  const { map, problems } = real(RESTAURANT)
  assert.deepEqual(problems, [])
  // All Categories, Featured Articles and Tagged Items are decided sample screens; what they list (the
  // tagged posts, and the category archives their cards link) Blog, Gallery and the home page's
  // category list reach, so nothing is left under Explore and it leaves with all it holds.
  const explore = map.operations.find((o) => o.label === 'Explore')
  assert.equal(explore?.rule, 'hide.decision')
  assert.equal(explore.route, undefined)
  for (const label of ['All Categories', 'Featured Articles', 'Tagged Items', 'Typography', 'Themes'])
    assert.ok(
      explore.contains.some((c) => c.endsWith(label)),
      label
    )
  assert.deepEqual(map.unresolved, [])
  const current = applyOperations(sourceOf(RESTAURANT), map.operations)
  const left = labelsIn(current.get('navigation-133'))
  for (const label of ['Explore', 'J! Pages', 'Tagged Items', 'Blue Color'])
    assert.ok(!left.includes(label), label)
  for (const label of ['Blog', 'Gallery', 'Reservation']) assert.ok(left.includes(label), label)

  // Without the home page's category list, the chefs post (category "pages") has no route but the
  // cards of Tagged Items: it stays, a question.
  const source = sourceOf(RESTAURANT)
  const home = source.listings.find((l) => l.id === source.frontPage)
  home.blocks = home.blocks.filter((b) => b.block !== 'core/categories')
  const plan = planOf(RESTAURANT, source, DECISIONS.contracts[RESTAURANT])
  assert.match(
    plan.unresolved.find((u) => u.label === 'Tagged Items')?.reason ?? '',
    /only route to post 95 \(chefs\)/
  )
})

test('a sign-in screen inside a hidden branch is unresolved unless a decision names it', () => {
  const decisions = structuredClone(DECISIONS.contracts[RESTAURANT])
  decisions.hide = decisions.hide.filter((h) => !/login/i.test(JSON.stringify(h.path ?? h.label)))
  const plan = planWordpress(sourceOf(RESTAURANT), decisions)
  assert.ok(plan.unresolved.some((u) => u.label === 'Login'))
  assert.ok(
    !plan.operations.some((o) => o.label === 'Explore'),
    'a branch holding an unresolved screen is not removed whole'
  )
})

test('no operation names post_status and every map validates', () => {
  for (const id of [DINER, MORGAN, RESTAURANT]) {
    const { map } = real(id)
    assert.ok(!JSON.stringify(map).includes('post_status'), id)
    assert.deepEqual(validate(map), [], id)
  }
})

test('operations on one post chain: each before is the after of the step before it', () => {
  const { map } = real(DINER)
  const onMain = map.operations.filter((o) => o.key === 'navigation-93')
  assert.equal(onMain[0].before, sourceOf(DINER).navigations.find((n) => n.id === 93).sha256)
  for (let i = 1; i < onMain.length; i += 1) assert.equal(onMain[i].before, onMain[i - 1].after)
  assert.ok(
    validate({ ...map, operations: [onMain[0], onMain[2]] }).some((p) => /does not start where/.test(p))
  )
})

test('a header repointed at a page-list navigation is a problem', () => {
  const decisions = structuredClone(DECISIONS.contracts[DINER])
  decisions.repoint = [{ templatePart: 'header', from: 278, to: 4, reason: 'test' }]
  const plan = planWordpress(sourceOf(DINER), decisions)
  assert.ok(plan.problems.some((p) => /page-list navigation 4/.test(p)))
})

test('the AST edits touch one block and leave every other byte as it was', () => {
  const link = (label, id) =>
    `<!-- wp:navigation-link {"label":"${label}","type":"page","id":${id},"url":"/p${id}","kind":"post-type"} /-->`
  const markup = `${link('Home - Red', 85)}\n\n${link('About Us', 67)}`
  assert.ok(removeLink(markup, { path: ['Home - Red'], pageId: 85 }).endsWith(link('About Us', 67)))
  assert.throws(() => removeLink(markup, { path: ['Offers'], pageId: 66 }))
  const head =
    '<!-- wp:group -->\n<div><!-- wp:navigation {"ref":278,"icon":"menu","overlayMenu":"always"} /--></div>\n<!-- /wp:group -->'
  assert.equal(setNavigationRef(head, 278, 93), head.replace('"ref":278', '"ref":93'))
  const drawer =
    '<!-- wp:paragraph -->\n<p>a</p>\n<!-- /wp:paragraph -->\n<!-- wp:group {"anchor":"x"} -->\n<div id="x"></div>\n<!-- /wp:group -->'
  assert.equal(
    removeBlock(drawer, { name: 'core/group', anchor: 'x' }).trimEnd(),
    '<!-- wp:paragraph -->\n<p>a</p>\n<!-- /wp:paragraph -->'
  )
  // Every untouched post of a real release replays to its own sha256.
  const source = sourceOf(DINER)
  const current = applyOperations(source, real(DINER).map.operations)
  for (const n of source.navigations)
    if (n.id !== 93 && n.id !== 278) assert.equal(sha256(current.get(`navigation-${n.id}`)), n.sha256)
})

function contractCopy(id) {
  const dir = scratch()
  cpSync(path.join(CONTRACTS, id), path.join(dir, 'contracts', id), { recursive: true })
  writeFileSync(
    path.join(dir, 'decisions.json'),
    JSON.stringify({ contracts: { [id]: DECISIONS.contracts[id] } })
  )
  return dir
}

test('a contract with no navigation-source.json is not covered, and a decision for it is a problem', () => {
  const dir = path.join(contractCopy(DINER), 'contracts', DINER)
  rmSync(path.join(dir, 'navigation-source.json'))
  const plain = generate(dir, DINER, undefined)
  assert.deepEqual(plain.problems, [])
  assert.equal(plain.map.status, 'not-covered')
  assert.match(plain.map.reason, /navigation-source\.json/)
  assert.deepEqual(validate(plain.map), [])
  assert.equal(generate(dir, DINER, DECISIONS.contracts[DINER]).problems.length, 1)
})

/** A copy of Diner whose navigation-source.json is `edit(source)` (and presentation-lock.json `editLock(lock)`). */
function dinerSourceEdited(edit, editLock) {
  const dir = path.join(contractCopy(DINER), 'contracts', DINER)
  const rewrite = (name, change) => {
    const file = path.join(dir, name)
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    change(doc)
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
  }
  rewrite('navigation-source.json', edit)
  if (editLock) rewrite('presentation-lock.json', editLock)
  return generate(dir, DINER, DECISIONS.contracts[DINER])
}

test('a source with its template parts removed is not covered, with the reason', () => {
  const { map, problems } = dinerSourceEdited((s) => {
    s.templateParts = []
  })
  assert.equal(map.status, 'not-covered')
  assert.deepEqual(map.operations, [])
  assert.match(map.reason, /no template part header, which presentation-lock\.json pins/)
  assert.match(map.reason, /no template part 96 \(header\), which inventory\.json lists/)
  // With no database override, the header resolves to the theme file, which the source does not carry.
  assert.match(map.reason, /does not carry the theme file parts\/header\.html/)
  assert.ok(problems.length > 0)
  assert.deepEqual(validate(map), [])
})

test('a source with the main menu (93) removed is not covered: the header points at it', () => {
  const { map } = dinerSourceEdited((s) => {
    s.navigations = s.navigations.filter((n) => n.id !== 93)
  })
  assert.equal(map.status, 'not-covered')
  assert.match(
    map.reason,
    /template part 96 \(header\) points at navigation 93, which navigation-source\.json does not carry/
  )
  assert.match(map.reason, /no navigation 93 \(mainmenu\), which inventory\.json lists/)
})

test('a navigation only inventory.json lists is a gap, even when no part points at it', () => {
  const { map } = dinerSourceEdited((s) => {
    s.navigations = s.navigations.filter((n) => n.id !== 94)
  })
  assert.equal(map.status, 'not-covered')
  assert.match(map.reason, /no navigation 94 \(usermenu\), which inventory\.json lists/)
})

test('a theme part file the release resolves to must be carried at the pinned bytes, with no navigation', () => {
  const missing = dinerSourceEdited((s) => {
    s.themeParts = s.themeParts.filter((t) => t.slug !== 'sidebar')
  })
  assert.match(missing.map.reason, /does not carry the theme file parts\/sidebar\.html/)
  const empty = dinerSourceEdited((s) => {
    s.themeParts.find((t) => t.slug === 'sidebar').content = null
  })
  assert.match(empty.map.reason, /parts\/sidebar\.html \(template part sidebar\) has no content/)
  const nav = '<!-- wp:navigation {"ref":93} /-->'
  const unpinned = dinerSourceEdited((s) => {
    const t = s.themeParts.find((t) => t.slug === 'sidebar')
    t.content = nav
    t.sha256 = sha256(nav)
  })
  assert.match(
    unpinned.map.reason,
    /does not carry the theme file parts\/sidebar\.html/,
    'bytes other than the pinned ones are not the release'
  )
  const withNav = dinerSourceEdited(
    (s) => {
      const t = s.themeParts.find((t) => t.slug === 'sidebar')
      t.content = nav
      t.sha256 = sha256(nav)
    },
    (lock) => {
      lock.files['wp-content/themes/wp-ja-diner/parts/sidebar.html'] = sha256(nav)
    }
  )
  assert.equal(withNav.map.status, 'not-covered')
  assert.match(
    withNav.map.reason,
    /theme file parts\/sidebar\.html holds a navigation, and no operation here edits a theme file/
  )
})

test('a nested template part the source does not carry is a gap', () => {
  const { map } = dinerSourceEdited((s) => {
    const header = s.templateParts.find((p) => p.slug === 'footer')
    header.content += '\n<!-- wp:template-part {"slug":"topbar"} /-->'
    header.sha256 = sha256(header.content)
  })
  assert.equal(map.status, 'not-covered')
  assert.match(map.reason, /nests template part topbar, which navigation-source\.json does not carry/)
})

const dinerHeader = (s) => s.templateParts.find((p) => p.id === 96)

test('a header whose area is removed is not covered: the header checks would skip it', () => {
  const { map } = dinerSourceEdited((s) => {
    delete dinerHeader(s).area
  })
  assert.equal(map.status, 'not-covered')
  assert.deepEqual(map.operations, [])
  assert.match(map.reason, /template part 96 \(header\) is missing its id, slug, area or theme/)
  assert.match(map.reason, /template part 96 has area \(none\), inventory\.json header/)
  assert.match(map.reason, /no template part of area header, so no header could be checked/)
})

test('a header whose area is changed is not covered', () => {
  const { map } = dinerSourceEdited((s) => {
    dinerHeader(s).area = 'uncategorized'
  })
  assert.equal(map.status, 'not-covered')
  assert.match(map.reason, /template part 96 has area uncategorized, inventory\.json header/)
})

test('a header whose slug is changed is not covered', () => {
  const { map } = dinerSourceEdited((s) => {
    dinerHeader(s).slug = 'header-2'
  })
  assert.equal(map.status, 'not-covered')
  assert.match(map.reason, /template part 96 has slug header-2, inventory\.json header/)
  assert.match(map.reason, /no template part header, which presentation-lock\.json pins/)
  assert.match(map.reason, /has template part header-2, which presentation-lock\.json does not pin/)
})

test('a part of another theme, or a navigation of another language, is not covered', () => {
  const theme = dinerSourceEdited((s) => {
    dinerHeader(s).theme = 'twentytwentyfive'
  })
  assert.match(
    theme.map.reason,
    /template part 96 \(header\) belongs to theme twentytwentyfive, not wp-ja-diner/
  )
  const language = dinerSourceEdited((s) => {
    s.navigations.find((n) => n.id === 93).language = 'fr'
  })
  assert.equal(language.map.status, 'not-covered')
  assert.match(language.map.reason, /navigation 93 has language fr, inventory\.json en/)
  const noLanguage = dinerSourceEdited((s) => {
    delete s.navigations.find((n) => n.id === 93).language
  })
  assert.match(noLanguage.map.reason, /navigation 93 \(mainmenu\) is missing its id, slug or language/)
})

test('the header checks fail closed: a plan with no header part is a problem, never nothing to check', () => {
  const source = sourceOf(DINER)
  for (const part of source.templateParts) part.area = 'uncategorized'
  assert.ok(planOf(KINETIC, source).problems.some((p) => /no template part of area header/.test(p)))
})

const runCheck = (dir) =>
  spawnSync(process.execPath, [SCRIPT, '--check'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_WP_CONTRACTS: path.join(dir, 'contracts'),
      TRACY_WP_SHOWCASE_DECISIONS: path.join(dir, 'decisions.json')
    }
  })

test('--check fails once navigation-source.json changed under the map', () => {
  const dir = contractCopy(DINER)
  assert.equal(runCheck(dir).status, 0)
  const file = path.join(dir, 'contracts', DINER, 'navigation-source.json')
  const source = JSON.parse(readFileSync(file, 'utf8'))
  source.navigations[0].content += '\n'
  writeFileSync(file, `${JSON.stringify(source, null, 2)}\n`)
  const res = runCheck(dir)
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /not its sha256|stale or missing/)
})

test('--check fails once a base file changed under the map (stale baseHash)', () => {
  const dir = contractCopy(DINER)
  const file = path.join(dir, 'contracts', DINER, 'manifest.json')
  writeFileSync(file, `${readFileSync(file, 'utf8')} `)
  const res = runCheck(dir)
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /stale or missing/)
})

test('Kinetic: Blueprint and Signal leave the "Home" submenu that holds the front page; Terminal, the front page, stays', () => {
  const { map, problems } = real('ja-kinetic/wp7/1.0.12')
  assert.deepEqual(problems, [])
  assert.deepEqual(
    map.operations.map((o) => [o.label, o.rule]),
    [
      ['Blueprint', 'hide.home-branch-variant'],
      ['Signal', 'hide.home-branch-variant'],
      ['Blueprint', 'hide.alias-of-hidden'],
      ['Signal', 'hide.alias-of-hidden']
    ]
  )
  assert.equal(map.kept.find((k) => k.label === 'Terminal')?.rule, 'keep.homepage')
  assert.deepEqual(map.unresolved, [])
  assert.deepEqual(validate(map), [])
})

test('Kinetic: replaying the map leaves no link to Blueprint or Signal anywhere in the header, mega menu included', () => {
  const source = sourceOf('ja-kinetic/wp7/1.0.12')
  const { map } = real('ja-kinetic/wp7/1.0.12')
  const part = header(source)
  for (const href of ['/home-menu/home-blueprint', '/home-menu/home-signal'])
    assert.ok(part.content.includes(`href="${href}"`))
  const after = applyOperations(source, map.operations).get(`templatePart-${part.id}`)
  for (const href of ['/home-menu/home-blueprint', '/home-menu/home-signal']) {
    assert.ok(!after.includes(`"${href}"`), `${href} is still linked`)
  }
  assert.ok(after.includes('<li><a href="/">Terminal</a></li>'))
  assert.ok(labelsIn(after).includes('Terminal'))
  parseBlocks(after)
})

test('a link to a hidden entry that is not a list item of its own is a question', () => {
  const source = sourceOf('ja-kinetic/wp7/1.0.12')
  const part = header(source)
  const signal = '<li><a href="/home-menu/home-signal">Signal</a></li>'
  assert.ok(part.content.includes(signal))
  part.content = part.content.replace(
    signal,
    '<li><a href="/home-menu/home-signal">Signal</a> <em>new</em></li>'
  )
  const plan = planOf(KINETIC, source)
  assert.deepEqual(plan.problems, [])
  assert.deepEqual(
    plan.operations.filter((o) => o.rule === 'hide.alias-of-hidden').map((o) => o.label),
    ['Blueprint']
  )
  assert.deepEqual(
    plan.unresolved.map((u) => [u.label, u.rule]),
    [['Signal new', 'unresolved.link-to-hidden']]
  )
})

test('a list that removing the links to hidden entries would empty stays, as a question', () => {
  const source = sourceOf('ja-kinetic/wp7/1.0.12')
  const part = header(source)
  const terminal = '<!-- wp:list-item -->\n<li><a href="/">Terminal</a></li>\n<!-- /wp:list-item -->\n'
  assert.ok(part.content.includes(terminal))
  part.content = part.content.replace(terminal, '')
  const plan = planOf(KINETIC, source)
  assert.deepEqual(plan.problems, [])
  assert.ok(!plan.operations.some((o) => o.rule === 'hide.alias-of-hidden'))
  assert.deepEqual(
    plan.unresolved.map((u) => [u.label, u.rule]),
    [
      ['Blueprint', 'unresolved.link-to-hidden'],
      ['Signal', 'unresolved.link-to-hidden']
    ]
  )
})

test('Kinetic: a real page under the "Home" submenu, with no home-demo sign of its own, is a question, not a removal', () => {
  const source = sourceOf('ja-kinetic/wp7/1.0.12')
  const part = header(source)
  const signal =
    '<!-- wp:navigation-link {"label":"Signal","url":"/home-menu/home-signal","type":"custom"} /-->'
  assert.ok(part.content.includes(signal))
  part.content = part.content.replace(
    signal,
    `${signal}\n<!-- wp:navigation-link {"label":"Support","type":"page","id":99001,"url":"/support","kind":"post-type"} /-->`
  )
  source.linkedPosts.push({ id: 99001, type: 'page', status: 'publish', slug: 'support', blocks: [] })
  const plan = planOf(KINETIC, source)
  assert.deepEqual(plan.problems, [])
  assert.ok(!plan.operations.some((o) => o.label === 'Support'))
  assert.deepEqual(
    plan.unresolved.map((u) => [u.label, u.rule]),
    [['Support', 'unresolved.variant-label']]
  )
  assert.deepEqual(
    plan.operations.filter((o) => o.rule === 'hide.home-branch-variant').map((o) => o.label),
    ['Blueprint', 'Signal']
  )
})

test('an id past 2^53 is not read: its entry is a question, and a navigation ref stops the plan', () => {
  const source = sourceOf('ja-kinetic/wp7/1.0.12')
  const part = header(source)
  const blueprint = '{"label":"Blueprint","url":"/home-menu/home-blueprint","type":"custom"}'
  assert.ok(part.content.includes(blueprint))
  part.content = part.content.replace(
    blueprint,
    '{"label":"Blueprint","url":"/home-menu/home-blueprint","type":"page","id":"9007199254740993"}'
  )
  const plan = planOf(KINETIC, source)
  assert.deepEqual(plan.problems, [])
  assert.ok(!plan.operations.some((o) => o.label === 'Blueprint'))
  assert.deepEqual(
    plan.unresolved.map((u) => [u.label, u.rule]),
    [['Blueprint', 'unresolved.inexact-id']]
  )
  const diner = sourceOf(DINER)
  const ref = header(diner)
  const at = ref.content.match(/"ref":\s*(\d+)/)
  ref.content = ref.content.replace(at[0], '"ref":9007199254740993')
  assert.ok(
    planOf(DINER, diner).problems.some((p) => p.includes('9007199254740992') && p.includes('exact integers'))
  )
})

/** The Kinetic header with one more entry under its "Home" submenu, and the release's pages plus `pages`. */
const kineticWith = (entry, pages = []) => {
  const source = sourceOf(KINETIC)
  const part = header(source)
  const signal =
    '<!-- wp:navigation-link {"label":"Signal","url":"/home-menu/home-signal","type":"custom"} /-->'
  assert.ok(part.content.includes(signal))
  part.content = part.content.replace(signal, `${signal}\n${entry}`)
  return planWordpress(source, {}, { pages: [...inventoryOf(KINETIC).posts, ...pages] })
}

test('Kinetic: a page under "Home" leaves only as a copy of the home page; a slug or label reading "home" is no proof', () => {
  const front = inventoryOf(KINETIC).posts.find((p) => p.id === 1740)
  const homeCare = kineticWith(
    '<!-- wp:navigation-link {"label":"Home Care","url":"/home-care","type":"custom"} /-->',
    [{ id: 99002, type: 'page', status: 'publish', slug: 'home-care', parent: 0, skeleton: 'f'.repeat(64) }]
  )
  assert.deepEqual(homeCare.problems, [])
  assert.ok(!homeCare.operations.some((o) => o.label === 'Home Care'))
  assert.deepEqual(
    homeCare.unresolved.map((u) => [u.label, u.rule]),
    [['Home Care', 'unresolved.variant-label']]
  )
  // A page with no skeleton in the release (nothing to compare) is a question too.
  const unknown = kineticWith(
    '<!-- wp:navigation-link {"label":"Home Two","url":"/home-two","type":"custom"} /-->'
  )
  assert.deepEqual(
    unknown.unresolved.map((u) => [u.label, u.rule]),
    [['Home Two', 'unresolved.variant-label']]
  )
  // The home page's own skeleton under another name is a copy, whatever its label says.
  const atlas = kineticWith(
    '<!-- wp:navigation-link {"label":"Atlas","type":"page","id":99003,"url":"/atlas","kind":"post-type"} /-->',
    [{ id: 99003, type: 'page', status: 'publish', slug: 'atlas', parent: 0, skeleton: front.skeleton }]
  )
  assert.deepEqual(
    atlas.operations.filter((o) => o.rule === 'hide.home-branch-variant').map((o) => o.label),
    ['Blueprint', 'Signal', 'Atlas']
  )
})

/** The Kinetic plan with the mega menu's Blueprint link written as `anchor`. */
const kineticMega = (anchor) => {
  const source = sourceOf(KINETIC)
  const part = header(source)
  const blueprint = '<a href="/home-menu/home-blueprint">Blueprint</a>'
  assert.ok(part.content.includes(blueprint))
  part.content = part.content.replace(blueprint, anchor)
  const plan = planOf(KINETIC, source)
  return { plan, after: applyOperations(source, plan.operations).get(`templatePart-${part.id}`) }
}

test('a link on another origin is never the hidden page, even on the same path', () => {
  for (const href of [
    'https://external.example/home-menu/home-blueprint',
    '//external.example/home-menu/home-blueprint',
    '/\\external.example/home-menu/home-blueprint'
  ]) {
    const anchor = `<a href="${href}">Blueprint</a>`
    const { plan, after } = kineticMega(anchor)
    assert.deepEqual(plan.problems, [], href)
    assert.deepEqual(
      plan.operations.filter((o) => o.rule === 'hide.alias-of-hidden').map((o) => o.label),
      ['Signal'],
      href
    )
    assert.ok(after.includes(anchor), href)
    assert.deepEqual(plan.unresolved, [], href)
  }
})

test('an href is read as HTML reads it: single-quoted, unquoted or with character references', () => {
  for (const anchor of [
    "<a href='/home-menu/home-blueprint'>Blueprint</a>",
    '<a href=/home-menu/home-blueprint>Blueprint</a>',
    '<a class="x" HREF = "/home-menu/home&#45;blueprint/">Blueprint</a>',
    '<a href="/home-menu/home%2Dblueprint?">Blueprint</a>'
  ]) {
    const { plan, after } = kineticMega(anchor)
    assert.deepEqual(plan.problems, [], anchor)
    assert.deepEqual(
      plan.operations.filter((o) => o.rule === 'hide.alias-of-hidden').map((o) => o.label),
      ['Blueprint', 'Signal'],
      anchor
    )
    assert.ok(!after.includes(anchor), anchor)
    assert.deepEqual(plan.unresolved, [], anchor)
  }
  // A link this cannot read with certainty is said, never passed over.
  for (const anchor of [
    '<a href="/home-menu/home&bogus;blueprint">Blueprint</a>',
    '<a href="/home-menu/home-blueprint>Blueprint</a>',
    '<a href="home-blueprint">Blueprint</a>'
  ]) {
    const { plan } = kineticMega(anchor)
    assert.ok(
      plan.unresolved.some((u) => u.rule === 'unresolved.link-to-hidden'),
      anchor
    )
  }
})

test('Tracy Base: a "Pages" submenu with a stand-in link to the front page is not a home branch', () => {
  const { map } = real('tracy-base/wp7/1.1.6')
  assert.ok(!map.operations.some((o) => o.rule === 'hide.home-branch-variant'))
})

/**
 * A small release: front page 1, About (2), a "Pages" submenu with Careers (4) and Error Page (8),
 * Typography (3) and News (5), plus `extra` entries; `linked` posts carry their core blocks. Post 20 is
 * published, and only the page whose blocks hold `core/query` lists it.
 */
const release = ({ listsOn = [], extra = '', linked = null, filters = null } = {}) => {
  const link = (label, id) =>
    `<!-- wp:navigation-link {"label":"${label}","type":"page","id":${id},"url":"/${label.toLowerCase().replace(/ /g, '-')}","kind":"post-type"} /-->`
  const content = [
    link('Home', 1),
    link('About', 2),
    '<!-- wp:navigation-submenu {"label":"Pages","url":"#"} -->',
    link('Careers', 4),
    link('Error Page', 8),
    '<!-- /wp:navigation-submenu -->',
    link('Typography', 3),
    link('News', 5),
    extra
  ].join('\n')
  const page = (id, slug) => ({ id, type: 'page', status: 'publish', slug, title: slug, parent: 0 })
  const pages = [
    page(1, 'home'),
    page(2, 'about'),
    page(3, 'typography'),
    page(4, 'careers'),
    page(5, 'news'),
    page(8, 'error-page'),
    { id: 20, type: 'post', status: 'publish', slug: 'hello', title: 'Hello', parent: 0 }
  ]
  const blocks = (id) =>
    listsOn.includes(id) ? ['core/heading', 'core/query', 'core/post-template'] : ['core/paragraph']
  return {
    source: {
      frontPage: 1,
      navigations: [{ id: 10, slug: 'main', content }],
      templateParts: [
        { id: 30, slug: 'header', area: 'header', content: '<!-- wp:navigation {"ref":10} /-->\n' }
      ],
      linkedPosts: (linked ?? [1, 2, 3, 4, 5, 8]).map((id) => ({
        id,
        type: 'page',
        status: 'publish',
        slug: pages.find((p) => p.id === id)?.slug ?? `p${id}`,
        blocks: blocks(id)
      })),
      ...(filters ? filteredSource(filters) : {})
    },
    pages
  }
}
/**
 * The listings part of a source: `listings` by page id, posts 20 (category 6, the older) and 21
 * (category 7) unless `posts` says otherwise, category 7 under category 6 when `nested`.
 */
const filteredSource = ({ listings = {}, posts = null, sticky = [], nested = false }) => ({
  listings: Object.entries(listings).map(([id, blocks]) => ({
    id: Number(id),
    type: 'page',
    language: 'en',
    blocks
  })),
  listedPosts: posts ?? [
    {
      id: 20,
      type: 'post',
      slug: 'hello',
      author: 1,
      date: '2026-01-01 10:00:00',
      language: 'en',
      terms: { category: [6] }
    },
    {
      id: 21,
      type: 'post',
      slug: 'world',
      author: 2,
      date: '2026-01-02 10:00:00',
      language: 'en',
      terms: { category: [7] }
    }
  ],
  terms: [
    { id: 6, taxonomy: 'category', slug: 'c6', parent: 0 },
    { id: 7, taxonomy: 'category', slug: 'c7', parent: nested ? 6 : 0 }
  ],
  stickyPosts: sticky
})
const query = (over = {}) => ({
  block: 'core/query',
  postType: 'post',
  inherit: false,
  taxQuery: {},
  taxExclude: {},
  author: [],
  search: '',
  sticky: '',
  exclude: [],
  offset: 0,
  perPage: 10,
  pages: 0,
  paginated: true,
  order: 'desc',
  orderBy: 'date',
  termLinks: [],
  unsupported: [],
  ...over
})
const ruleOf = (plan, label) =>
  plan.operations.find((o) => o.label === label)?.rule ?? plan.unresolved.find((u) => u.label === label)?.rule

test('an automatic hide that would leave a page or the post listing with no route is not applied', () => {
  // A kit screen leaves with its own screen, but not with the only listing of the posts.
  const kit = release({ listsOn: [3] })
  const plan = planWordpress(kit.source, {}, { pages: kit.pages })
  assert.deepEqual(plan.problems, [])
  assert.equal(ruleOf(plan, 'Typography'), 'unresolved.only-route-to-content')
  assert.match(plan.unresolved.find((u) => u.label === 'Typography').reason, /only route to the post listing/)
  assert.equal(ruleOf(plan, 'Error Page'), 'hide.kit-screen')
  // With the front page listing the posts too, it leaves.
  const listed = release({ listsOn: [1, 3] })
  assert.equal(
    ruleOf(planWordpress(listed.source, {}, { pages: listed.pages }), 'Typography'),
    'hide.kit-screen'
  )

  // A page swept along by a submenu's hide, which no other entry opens, stays; so does its submenu.
  const swept = release({ listsOn: [1] })
  const sweep = planWordpress(
    swept.source,
    { hide: [{ navigation: 10, label: 'Pages', subtree: true, reason: 'a showcase branch' }] },
    { pages: swept.pages }
  )
  assert.deepEqual(sweep.problems, [])
  assert.equal(ruleOf(sweep, 'Careers'), 'unresolved.only-route-to-content')
  assert.match(sweep.unresolved.find((u) => u.label === 'Careers').reason, /only route to page 4 \(careers\)/)
  assert.ok(sweep.kept.some((k) => k.label === 'Pages' && k.rule === 'keep.holds-kept-entry'))
  assert.ok(!sweep.operations.some((o) => o.label === 'Pages'))
  // The kit screen of that submenu is a showcase wherever it sits: it leaves.
  assert.ok(sweep.operations.some((o) => o.label === 'Error Page'))
  const left = labelsIn(applyOperations(swept.source, sweep.operations).get('navigation-10'))
  assert.deepEqual(left, ['Home', 'About', 'Pages', 'Careers', 'News'])
})

test('a decision hide that would leave a page or the post listing with no route is not applied', () => {
  // A decision names News, the only page that lists the posts: its own screen may go, the posts may not.
  const only = release({ listsOn: [5] })
  const hideNews = { hide: [{ navigation: 10, label: 'News', pageId: 5, reason: 'a demo listing' }] }
  const plan = planWordpress(only.source, hideNews, { pages: only.pages })
  assert.deepEqual(plan.problems, [])
  assert.equal(ruleOf(plan, 'News'), 'unresolved.only-route-to-content')
  assert.match(
    plan.unresolved.find((u) => u.label === 'News').reason,
    /^a demo listing; but it is the only route/
  )
  // Once the front page lists them too, the decision applies.
  const both = release({ listsOn: [1, 5] })
  assert.equal(ruleOf(planWordpress(both.source, hideNews, { pages: both.pages }), 'News'), 'hide.decision')

  // A decision that names a submenu may not take a page that only it opens along.
  const sweep = planWordpress(
    both.source,
    { hide: [{ navigation: 10, label: 'Pages', subtree: true, reason: 'a showcase branch' }] },
    { pages: both.pages }
  )
  assert.equal(ruleOf(sweep, 'Careers'), 'unresolved.only-route-to-content')
  // Another entry that opens Careers is a route: then the whole submenu leaves.
  const twice = release({
    listsOn: [1],
    extra:
      '<!-- wp:navigation-link {"label":"Jobs","type":"page","id":4,"url":"/careers","kind":"post-type"} /-->'
  })
  const whole = planWordpress(
    twice.source,
    { hide: [{ navigation: 10, label: 'Pages', subtree: true, reason: 'a showcase branch' }] },
    { pages: twice.pages }
  )
  assert.equal(ruleOf(whole, 'Pages'), 'hide.decision')
})

test('a route the contract cannot prove: an automatic hide stays a question, a decision applies and says so', () => {
  // Typography (3) and News (5) are in no inventory and not among the linked posts: what they hold is unknown.
  const blind = release({ listsOn: [1], linked: [1, 2, 4, 8] })
  const plan = planWordpress(
    blind.source,
    { hide: [{ navigation: 10, label: 'News', pageId: 5, reason: 'a demo listing' }] },
    { pages: [] }
  )
  assert.deepEqual(plan.problems, [])
  assert.equal(ruleOf(plan, 'Typography'), 'unresolved.route-not-proven')
  const news = plan.operations.find((o) => o.label === 'News')
  assert.equal(news.rule, 'hide.decision')
  assert.equal(news.route.proven, false)
  assert.match(
    news.route.reason,
    /post 5 is neither in inventory\.json nor among the posts the navigations link/
  )
  // A kit screen whose page the navigations' linked posts describe needs no inventory to leave.
  assert.equal(ruleOf(plan, 'Error Page'), 'hide.kit-screen')
  assert.equal(plan.operations.find((o) => o.label === 'Error Page').route, undefined)
})

test('a filtered listing proves routes only to the posts it filters to', () => {
  // Typography (3), a kit screen, lists every post; News (5) lists what its filters let through.
  const typographyWith = (news, more = {}) => {
    const r = release({ filters: { listings: { 3: [query()], 5: [query(news)] }, ...more } })
    return planWordpress(r.source, {}, { pages: r.pages })
  }
  const lost = (plan) => plan.unresolved.find((u) => u.label === 'Typography')?.reason ?? ''
  assert.equal(ruleOf(typographyWith({}), 'Typography'), 'hide.kit-screen')
  // Terms: News lists category 7 only, so post 20 has no other route.
  const terms = typographyWith({ taxQuery: { category: [7] } })
  assert.deepEqual(terms.problems, [])
  assert.equal(ruleOf(terms, 'Typography'), 'unresolved.only-route-to-content')
  assert.match(lost(terms), /only route to post 20 \(hello\)$/)
  assert.match(lost(typographyWith({ taxExclude: { category: [6] } })), /post 20 \(hello\)$/)
  // Author, excluded posts, sticky.
  assert.match(lost(typographyWith({ author: [2] })), /post 20 \(hello\)$/)
  assert.match(lost(typographyWith({ exclude: [21] })), /post 21 \(world\)$/)
  assert.match(lost(typographyWith({ sticky: 'only' }, { sticky: [20] })), /post 21 \(world\)$/)
  assert.match(lost(typographyWith({ sticky: 'exclude' }, { sticky: [20] })), /post 20 \(hello\)$/)
  // A search, or a filter the capture could not read, proves no route.
  assert.match(lost(typographyWith({ search: 'world' })), /post 2[01].*post 2[01]/)
  assert.match(lost(typographyWith({ unsupported: ['tracyMore'] })), /post 2[01].*post 2[01]/)
  // An inherited query on a page lists that page, not the posts.
  assert.match(lost(typographyWith({ inherit: true })), /post 2[01].*post 2[01]/)
  // Another post type lists none of the posts.
  assert.match(lost(typographyWith({ postType: 'page' })), /post 2[01].*post 2[01]/)
  // With no pagination only the first page counts, by date.
  assert.match(lost(typographyWith({ paginated: false, perPage: 1 })), /post 20 \(hello\)$/)
  assert.match(lost(typographyWith({ paginated: false, perPage: 1, order: 'asc' })), /post 21 \(world\)$/)
  assert.match(lost(typographyWith({ paginated: false, perPage: 1, offset: 1 })), /post 21 \(world\)$/)
  assert.match(
    lost(typographyWith({ paginated: false, perPage: 1, orderBy: 'title' })),
    /post 2[01].*post 2[01]/
  )
  assert.match(lost(typographyWith({ paginated: true, perPage: 1, pages: 1 })), /post 20 \(hello\)$/)
  assert.equal(ruleOf(typographyWith({ paginated: true, perPage: 1 }), 'Typography'), 'hide.kit-screen')
  // Two posts of one date may swap at the edge of the first page: neither is proven.
  const sameDay = [20, 21].map((id) => ({
    id,
    type: 'post',
    slug: `p${id}`,
    author: 1,
    date: '2026-01-01 10:00:00',
    language: 'en',
    terms: { category: [6] }
  }))
  assert.match(
    lost(typographyWith({ paginated: false, perPage: 1 }, { posts: sameDay })),
    /post 20 \(p20\), post 21 \(p21\)$/
  )
  // A post of another language is not listed on an English page.
  const french = [
    {
      id: 22,
      type: 'post',
      slug: 'bonjour',
      author: 1,
      date: '2026-01-03 10:00:00',
      language: 'fr',
      terms: {}
    }
  ]
  assert.equal(ruleOf(typographyWith({}, { posts: french }), 'Typography'), 'hide.kit-screen')
  const frenchOnly = release({
    filters: { listings: { 3: [query()], 5: [query()] }, posts: french }
  })
  frenchOnly.source.listings[0].language = 'fr'
  assert.match(
    planWordpress(frenchOnly.source, {}, { pages: frenchOnly.pages }).unresolved.find(
      (u) => u.label === 'Typography'
    )?.reason ?? '',
    /post 22 \(bonjour\)$/
  )
})

test('what a hidden listing would take along is read wide: every page of it, and the archives its cards link', () => {
  // Typography shows one post a page, never paged on, with category links on its cards: it may show
  // any post through those links, so News listing post 21 alone is not enough.
  const r = (news) =>
    release({
      filters: {
        listings: {
          3: [query({ paginated: false, perPage: 1, search: 'x', termLinks: ['category'] })],
          5: news
        }
      }
    })
  const plan = (news) => {
    const x = r(news)
    return planWordpress(x.source, {}, { pages: x.pages })
  }
  assert.match(
    plan([query({ taxQuery: { category: [7] } })]).unresolved.find((u) => u.label === 'Typography')?.reason ??
      '',
    /only route to post 20 \(hello\)$/
  )
  // A category list links every category archive: the route is there.
  assert.equal(
    ruleOf(plan([{ block: 'core/categories', taxonomy: 'category' }]), 'Typography'),
    'hide.kit-screen'
  )
  // A tag cloud links the tag archives, which hold neither post.
  assert.equal(
    ruleOf(plan([{ block: 'core/tag-cloud', taxonomy: 'post_tag' }]), 'Typography'),
    'unresolved.only-route-to-content'
  )
})

test('a term archive reaches the posts of the term and of the terms below it, linked by id or by URL', () => {
  const r = (extra, nested = false) => {
    const x = release({ extra, filters: { listings: { 3: [query()] }, nested } })
    return planWordpress(x.source, {}, { pages: x.pages })
  }
  const byId = (id) =>
    `<!-- wp:navigation-link {"label":"Topics","type":"category","id":${id},"url":"/category/c${id}/","kind":"taxonomy"} /-->`
  assert.equal(ruleOf(r(byId(6), true), 'Typography'), 'hide.kit-screen')
  assert.match(
    r(byId(6)).unresolved.find((u) => u.label === 'Typography')?.reason ?? '',
    /only route to post 21 \(world\)$/
  )
  const byUrl = (slug) =>
    `<!-- wp:navigation-link {"label":"Topics","url":"/category/${slug}/","kind":"custom"} /-->`
  assert.equal(ruleOf(r(byUrl('c6'), true), 'Typography'), 'hide.kit-screen')
  assert.match(
    r(byUrl('c7'), true).unresolved.find((u) => u.label === 'Typography')?.reason ?? '',
    /post 20 \(hello\)$/
  )
  // A term the source does not carry proves no route.
  assert.equal(ruleOf(r(byId(99)), 'Typography'), 'unresolved.only-route-to-content')
})

test('capture reads each listing block as its filters', () => {
  const blocks = listingsOf(
    [
      '<!-- wp:query {"query":{"perPage":3,"postType":"post","categoryIds":[4],"author":"2,3","sticky":"only","tracyMore":{"after":2}}} -->',
      '<!-- wp:post-template --><!-- wp:post-terms {"term":"category"} /--><!-- /wp:post-template -->',
      '<!-- wp:query-pagination /-->',
      '<!-- /wp:query -->',
      '<!-- wp:query {"query":{"taxQuery":{"include":{"post_tag":[9]},"exclude":{"category":[3]}},"inherit":true}} /-->',
      '<!-- wp:latest-posts {"categories":[{"id":5}],"postsToShow":2,"selectedAuthor":7} /-->',
      '<!-- wp:categories /--><!-- wp:tag-cloud {"taxonomy":"genre"} /--><!-- wp:page-list /-->'
    ].join('\n')
  )
  assert.deepEqual(
    blocks.map((b) => b.block),
    ['core/query', 'core/query', 'core/latest-posts', 'core/categories', 'core/tag-cloud', 'core/page-list']
  )
  const [paged, split, latest, categories, cloud] = blocks
  assert.deepEqual(
    [
      paged.taxQuery,
      paged.author,
      paged.sticky,
      paged.perPage,
      paged.paginated,
      paged.termLinks,
      paged.unsupported
    ],
    [{ category: [4] }, [2, 3], 'only', 3, true, ['category'], ['tracyMore']]
  )
  assert.deepEqual(
    [split.taxQuery, split.taxExclude, split.inherit, split.paginated],
    [{ post_tag: [9] }, { category: [3] }, true, false]
  )
  assert.deepEqual(
    [latest.taxQuery, latest.author, latest.perPage, latest.paginated],
    [{ category: [5] }, [7], 2, false]
  )
  assert.equal(categories.taxonomy, 'category')
  assert.equal(cloud.taxonomy, 'genre')
})

test('a submenu that opens nothing and whose every entry leaves goes with them, unless a decision keeps it', () => {
  // Jobs opens Careers (4) too, so the decision on Careers takes no route; Error Page is a kit screen.
  const x = release({
    listsOn: [1],
    extra:
      '<!-- wp:navigation-link {"label":"Jobs","type":"page","id":4,"url":"/careers","kind":"post-type"} /-->'
  })
  const hideCareers = {
    navigation: 10,
    label: 'Careers',
    pageId: 4,
    path: ['Pages', 'Careers'],
    reason: 'a demo page'
  }
  const plan = planWordpress(x.source, { hide: [hideCareers] }, { pages: x.pages })
  assert.deepEqual(plan.problems, [])
  assert.equal(ruleOf(plan, 'Pages'), 'hide.empty-heading')
  assert.deepEqual(labelsIn(applyOperations(x.source, plan.operations).get('navigation-10')), [
    'Home',
    'About',
    'News',
    'Jobs'
  ])
  const kept = planWordpress(
    x.source,
    { hide: [hideCareers], keep: [{ navigation: 10, label: 'Pages', path: ['Pages'], reason: 'kept' }] },
    { pages: x.pages }
  )
  assert.ok(kept.kept.some((k) => k.label === 'Pages' && k.rule === 'keep.decision'))
  assert.ok(!kept.operations.some((o) => o.label === 'Pages'))
})

test('a hidden entry whose page another kept entry opens takes nothing along', () => {
  // News shows one post, never paged on, with category links on its cards: read wide, hiding it would
  // take every post along. Latest opens the same page, and everything that page leads to stays with it.
  const x = (extra) =>
    release({
      extra,
      filters: {
        listings: { 5: [query({ paginated: false, perPage: 1, search: 'x', termLinks: ['category'] })] }
      }
    })
  const hideNews = { hide: [{ navigation: 10, label: 'News', pageId: 5, reason: 'a demo listing' }] }
  const alone = x('')
  assert.equal(
    ruleOf(planWordpress(alone.source, hideNews, { pages: alone.pages }), 'News'),
    'unresolved.only-route-to-content'
  )
  const twice = x(
    '<!-- wp:navigation-link {"label":"Latest","type":"page","id":5,"url":"/news","kind":"post-type"} /-->'
  )
  const plan = planWordpress(twice.source, hideNews, { pages: twice.pages })
  assert.deepEqual(plan.problems, [])
  assert.equal(ruleOf(plan, 'News'), 'hide.decision')
  assert.ok(plan.kept.some((k) => k.label === 'Latest'))
})

test('Tracy Business: a kit screen the header links only from its mega menu leaves it, the other entries stay', () => {
  const id = 'tracy-business/wp7/1.3.8'
  const source = sourceOf(id)
  const { map, problems } = real(id)
  assert.deepEqual(problems, [])
  assert.deepEqual(
    map.operations.map((o) => [o.op, o.label, o.rule, o.block]),
    [
      [
        'templatePart.removeBlock',
        'Style guide',
        'hide.kit-screen',
        { name: 'core/list-item', contains: '<a href="/style-guide/">' }
      ]
    ]
  )
  assert.deepEqual(validate(map), [])
  const part = header(source)
  const after = applyOperations(source, map.operations).get(`templatePart-${part.id}`)
  assert.ok(part.content.includes('href="/style-guide/"'))
  assert.ok(!after.includes('href="/style-guide/"'))
  for (const kept of ['/newsletter/', '/email/', '/form/', '/slide/'])
    assert.ok(after.includes(`<a href="${kept}">`), kept)
  assert.deepEqual(map.finals, [
    { key: `templatePart-${part.id}`, before: sha256(part.content), after: sha256(after) }
  ])
  parseBlocks(after)
})

test('a kit screen linked from the markup and from a navigation entry follows the entry', () => {
  const id = 'tracy-business/wp7/1.3.8'
  const source = sourceOf(id)
  const nav = source.navigations.find((n) => n.slug === 'tracy')
  const link =
    '<!-- wp:navigation-link {"label":"Kit","type":"page","id":50,"url":"/style-guide/","kind":"post-type"} /-->'
  nav.content = nav.content.replace(/(<!-- wp:navigation-link )/, `${link}\n$1`)
  const plan = planOf(id, source, {
    keep: [{ navigation: nav.id, label: 'Kit', reason: 'the owner keeps it' }]
  })
  assert.deepEqual(plan.problems, [])
  assert.deepEqual(plan.operations, [])
  assert.equal(plan.kept.find((k) => k.label === 'Kit')?.rule, 'keep.decision')
})

test('a kit screen in the markup that is not a list item of its own is a question', () => {
  const source = sourceOf('tracy-business/wp7/1.3.8')
  const part = header(source)
  const li =
    '<li><a href="/style-guide/">Style guide</a><span class="tracy-mega__note">Module positions, type scale</span></li>'
  assert.ok(part.content.includes(li))
  part.content = part.content.replace(li, '<li>See the <a href="/style-guide/">Style guide</a></li>')
  const plan = planOf('tracy-business/wp7/1.3.8', source)
  assert.deepEqual(plan.problems, [])
  assert.deepEqual(plan.operations, [])
  assert.deepEqual(
    plan.unresolved.filter((u) => u.rule === 'unresolved.link-to-hidden').map((u) => u.label),
    ['Style guide']
  )
})

test('Tracy Base: Typography, linked only from the header mega menu, is judged a kit screen; with no inventory.json its route is not proven', () => {
  const { map, problems } = real('tracy-base/wp7/1.1.6')
  assert.deepEqual(problems, [])
  assert.deepEqual(map.operations, [])
  assert.deepEqual(
    map.unresolved.map((u) => [u.key, u.label, u.rule]),
    [['templatePart-143', 'Typography', 'unresolved.route-not-proven']]
  )
})
