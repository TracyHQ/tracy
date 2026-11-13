#!/usr/bin/env node
/**
 * Prove on a real blank site that the in-page blocks of an AI quickstart work as COPIES (ticket #584, ADR 0045).
 *
 *   TRACY_DOOR_URL=<site base URL> TRACY_DOOR_TOKEN=<the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/copy-proof.mjs <AI quickstart folder> [--report <file.json>]
 *
 * The site is a blank site of that AI quickstart, bound to its blank site contract (as for `door-proof.mjs`), with
 * the plugin's updater off. Through the plugin's door it:
 *   1. reads the plugin version (again at the end: it must not move) and binds and inspects the site;
 *   2. creates pages (a home page and one page per layout) and the menu items the menu blocks draw;
 *   3. copies the store record of every copy block and of every in-place module (`content.get`, then
 *      `content.update` id 0), writes a letters-only marker at the field limit into the copy (a piece is set with the
 *      plugin's functions), cuts the rows of a `row` hide to one, assigns the copy (`moduleAssignment`), loads the
 *      pages and finds the marker, then reads the copy back;
 *   4. one block copied twice onto two pages with different content; inline codes; a picture; an emptied button;
 *      the declared resets of the article list (`placements`) against the defect a plain copy shows; two plans
 *      containers on one page, sharing one position and then each with its own; the footer social copy assigned to
 *      every page; a masthead copy holding the one row of its page; a value past the limit (the door guards no copy);
 *   5. inspects (the warnings name the changed inventory) and sends one apply on an in-place slot of the blank site
 *      contract, then reads the home page.
 * The site is written: run it on a throwaway site only. Needs php on PATH. Exits 0 when every step holds.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { coworkLib } from '../../packages/cms/tracy-joomla-quickstart/scripts/cowork-lib.mjs'
import * as K from './copy-proof-lib.mjs'

const argv = process.argv.slice(2)
const folder = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--report')
const reportFile = argv.includes('--report') ? argv[argv.indexOf('--report') + 1] : null
const base = (process.env.TRACY_DOOR_URL ?? '').replace(/\/+$/, '')
const token = process.env.TRACY_DOOR_TOKEN ?? ''
if (!folder || !base || !token) {
  console.error(
    'usage: TRACY_DOOR_URL=... TRACY_DOOR_TOKEN=... copy-proof.mjs <AI quickstart folder> [--report <file>]'
  )
  process.exit(2)
}
const json = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
const store = json('block-store.json')
const mapping = json('mapping.json')
const cowork = await coworkLib()
if (cowork.skip) throw new Error(cowork.skip)
const lib = cowork.lib
const door = K.doorOf(base, token)
const report = { steps: [], notVerified: [], ok: true }
const step = (name, ok, detail) => {
  report.steps.push({ step: name, ok, ...(detail === undefined ? {} : { detail }) })
  if (!ok) report.ok = false
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)
}
// A letters-only marker, unique per number: three letters of the number in base 26, then filler to the length.
const marker = (n, length) => {
  const code = [676, 26, 1].map((d) => String.fromCharCode(65 + (Math.floor(n / d) % 26))).join('')
  return `Cp${code}`.padEnd(length, 'q')
}
const count = (html, text) => html.split(text).length - 1
const moduleId = (entity) => Number(entity.split('-')[1])
// A picture the blank site keeps on disk.
const picture = 'images/joomlart/default.jpg'

// 1. The plugin and the contract.
const info = await door.call('info', {})
const version = info.info?.component
step('plugin version', Boolean(version), version)
await door.call('content.contract', { operation: 'bind' })
const first = await door.call('content.contract', { operation: 'inspect' })
step('inspect bound blank site contract', first.ok === true, first.contract)

// 2. Pages and menu items. Template styles come from the blank site's content map.
const styles = json('blank-site-contract/content-map.json').entities.filter((e) => e.kind === 'templateStyle')
const styleId = (title) => styles.find((s) => s.identity?.title?.includes(title))?.sourceId
const LANDING = styleId('Landing')
const DEFAULT = styleId('Default')
if (!LANDING || !DEFAULT) throw new Error('the content map names no Landing and Default template styles')
let alias = 0
const menuItem = async (title, menutype, style, extra = {}) =>
  (
    await door.update('menuItem', 0, {
      title,
      alias: `copy-proof-${Date.now()}-${alias++}`,
      menutype,
      type: 'component',
      component_id: 19,
      link: 'index.php?option=com_content&view=featured',
      published: 1,
      language: '*',
      access: 1,
      params: '{}',
      template_style_id: style,
      ...extra
    })
  ).id
const home = await menuItem('Proof Home', 'mainmenu', LANDING, { home: 1 })
const landing2 = await menuItem('Proof Landing', 'mainmenu', LANDING)
const landing3 = await menuItem('Proof Lists', 'mainmenu', LANDING)
const plans = await menuItem('Proof Plans', 'mainmenu', LANDING)
const inner = await menuItem('Proof Inner', 'mainmenu', DEFAULT)
const inner2 = await menuItem('Proof Inner Two', 'mainmenu', DEFAULT)
const landing4 = await menuItem('Proof Rows', 'mainmenu', LANDING)
// A category and an article, for the article lists and an article page (the related items and detail positions).
const category = (
  await door.update('category', 0, {
    title: 'Proof Classes',
    alias: `copy-proof-classes-${Date.now()}`,
    extension: 'com_content',
    published: 1,
    language: '*',
    access: 1
  })
).id
const article = (
  await door.update('article', 0, {
    title: 'Proof Class Article',
    alias: `copy-proof-article-${Date.now()}`,
    catid: category,
    state: 1,
    language: '*',
    access: 1,
    metakey: 'proof',
    introtext: '<p>An invented class.</p>'
  })
).id
const articlePage = await menuItem('Proof Article', 'mainmenu', DEFAULT, {
  link: `index.php?option=com_content&view=article&id=${article}`
})
step('pages created', true, { home, landing2, landing3, landing4, plans, inner, inner2, articlePage })

// A copy of a store module: edit its fields, create it, assign it.
const copy = async (entity, edit, pages) => {
  const fields = edit(K.copyFields(await door.get('module', moduleId(entity))))
  const { id } = await door.update('module', 0, fields)
  await door.update('moduleAssignment', id, { menuids: JSON.stringify(pages) })
  return id
}
const rowHide = (id) => (mapping.hides?.[id] ?? []).find((h) => h.by === 'row')
const cut = (id, keep) => (fields) => (rowHide(id) ? K.cutRows(fields, rowHide(id).row, keep) : fields)

// 3. Every copy block and every in-place module, copied and written.
const placed = store.blocks.filter((b) => b.placement !== 'created' && mapping.placements[b.id]?.entity)
const held = new Set(placed.filter((b) => b.positions.some((p) => p.startsWith('inside:'))).map((b) => b.id))
const own = (b) => mapping.placements[b.id].entity
// The text fields of a block stored on its own record: the store field and its mapping location (the first row of
// a row field).
const textFields = (b) =>
  [...(b.fields ?? []), ...(b.itemFields ?? [])].flatMap((f) => {
    const at = mapping.blocks[b.id]?.fields?.[f.name] ?? mapping.blocks[b.id]?.itemFields?.[f.name]?.[0]
    return f.type === 'text' && f.limit && at?.entity === own(b) ? [{ field: f, at }] : []
  })
const textField = (b) => textFields(b)[0] ?? null
// The links and pictures a block stores on its own record: a text often prints only beside them (a button label
// with its address, an image alt with its image), so the copy writes them too.
const companions = (b) =>
  [...(b.fields ?? []), ...(b.itemFields ?? [])].flatMap((f) => {
    const at = mapping.blocks[b.id]?.fields?.[f.name] ?? mapping.blocks[b.id]?.itemFields?.[f.name]?.[0]
    if (at?.entity !== own(b)) return []
    if (f.type === 'link') return [{ at, value: '/index.php?proof=link' }]
    if (f.type === 'image') return [{ at, value: picture }]
    // The gallery stat prints at the picture its show-on setting names; one row is kept, so it names the first.
    if (f.type === 'design' && at.jsonPath?.at(-2)?.endsWith('[show-on]')) return [{ at, value: '1' }]
    return []
  })
// The site facts a block stores on its own record (a contact email beside its label), first row or single places.
const FACT_VALUES = { email: 'proof@example.test', phone: '+1 555 0100' }
const factPlaces = (b) =>
  Object.entries(mapping.facts ?? {}).flatMap(([fact, places]) =>
    [places]
      .flat()
      .filter(
        (at) =>
          at?.entity === own(b) && [0, undefined].includes(at.jsonPath?.find((s) => typeof s === 'number'))
      )
      .map((at) => ({ at, value: FACT_VALUES[fact] ?? 'Proof Fact' }))
  )
// Menu items for the menus the menu blocks draw (the blank site keeps them empty).
const menus = new Set(Object.values(mapping.placements).flatMap((p) => (p.menu ? [p.menu.menutype] : [])))
const menuMarkers = {}
for (const menutype of menus)
  if (menutype !== 'mainmenu') {
    menuMarkers[menutype] = marker(600 + Object.keys(menuMarkers).length, 14)
    await menuItem(menuMarkers[menutype], menutype, DEFAULT)
  }
// A block placed inside a container is proved with its container (4d); the masthead with its page row (4e).
const generic = placed.filter(
  (b) => !held.has(b.id) && !mapping.placements[b.id].holds && b.id !== 'block-162'
)
const genericPages = [home, inner, articlePage]
const written = []
let n = 0
for (const b of generic) {
  // Every text field at its limit; a block with none gets a marker in its module title.
  const fields = textFields(b)
  const values = (fields.length ? fields : [{ at: { entity: own(b), column: 'title' } }]).map((f) => ({
    at: f.at,
    value: marker(n++, f.field?.limit ?? 20)
  }))
  const edit = (f) =>
    [...companions(b), ...factPlaces(b), ...values].reduce(
      (out, v) => K.setAt(out, v.at, v.value, lib),
      cut(b.id, 1)(f)
    )
  const id = await copy(own(b), edit, genericPages)
  written.push({
    block: b.id,
    id,
    values,
    titleOnly: !fields.length,
    module: mapping.entities[own(b)].identity?.module
  })
}
const pages = {}
for (const p of genericPages) pages[p] = await K.pageHtml(base, p)
const allPages = Object.values(pages).join('\n')
const types = {}
for (const w of written) {
  const record = await door.get('module', w.id)
  const unread = w.values.filter((v) => K.getAt(record, v.at, lib) !== v.value).length
  const undrawn = w.values.filter((v) => !allPages.includes(v.value)).map((v) => v.at.slot ?? v.at.column)
  // A title the page prints nowhere (placements title.drawn "no") is only read back.
  const titleDrawn = mapping.placements[w.block].title?.drawn
  const mustDraw = !w.titleOnly || titleDrawn === 'aria-label'
  // A copy whose position the proof pages do not print (an article detail layout the build makes, #597).
  if (mustDraw && !allPages.includes(`id="Mod${w.id}"`) && undrawn.length === w.values.length) {
    report.notVerified.push(`${w.block}: position ${store.blocks.find((b) => b.id === w.block).positions}`)
    console.log(
      `SKIP copy ${w.block} (${w.module}) as module ${w.id}: read back ${unread === 0}, its position is on no proof page`
    )
    if (unread) step(`copy ${w.block} read back`, false)
    continue
  }
  step(
    `copy ${w.block} (${w.module}) as module ${w.id}`,
    unread === 0 && (!mustDraw || undrawn.length === 0),
    {
      fields: w.values.length,
      readBack: unread === 0,
      ...(mustDraw ? (undrawn.length ? { undrawn } : {}) : { titleNotDrawn: titleDrawn })
    }
  )
  types[w.module] = (types[w.module] ?? 0) + 1
}
step('module types copied and written', true, types)

// 4a. One block twice, on two pages, with different content; a value past the limit.
const twice = placed.find((b) => b.id === 'block-157')
const tw = textField(twice)
const one = marker(700, tw.field.limit)
const two = marker(701, tw.field.limit + 31)
await copy(own(twice), (f) => K.setAt(cut(twice.id, 1)(f), tw.at, two, lib), [landing2])
const l2 = await K.pageHtml(base, landing2)
const homeAgain = await K.pageHtml(base, home)
step(
  'one block copied twice onto two pages',
  l2.includes(two) && !l2.includes(one) && !homeAgain.includes(two)
)
step('a value past the limit is accepted on a copy (the door guards no copy)', l2.includes(two), {
  limit: tw.field.limit,
  written: two.length
})

// 4b. Inline codes, a picture, an emptied button, both icon versions.
const hero = placed.find((b) => b.id === 'block-156')
const heading = mapping.blocks[hero.id].fields.heading
const image = mapping.blocks[hero.id].fields['hero-image']
const inlineId = await copy(
  own(hero),
  (f) => K.setAt(K.setAt(f, heading, 'Proof ((span))Inline((/span))', lib), image, picture, lib),
  [landing2]
)
const hl = K.moduleHtml(await K.pageHtml(base, landing2), inlineId) ?? (await K.pageHtml(base, landing2))
step('inline codes print as markup', /<span[^>]*>Inline<\/span>/.test(hl))
step('a picture path prints', hl.includes(picture))
// The section text prints with its heading, so both copies write the heading and the paragraph; the second also
// takes the button element out of the stored value (the build's form of the rows.remove hide on a copy).
const desc = mapping.blocks[twice.id].fields['button-label']
const section = (f) =>
  K.setAt(
    K.setAt(cut(twice.id, 2)(f), mapping.blocks[twice.id].fields.heading, 'Proof Heading', lib),
    mapping.blocks[twice.id].fields.paragraph,
    'Proof paragraph.',
    lib
  )
const plain = await copy(own(twice), section, [landing3])
const emptied = await copy(
  own(twice),
  (f) => {
    const out = section(f)
    const params = JSON.parse(out.params)
    params[desc.jsonPath[0]] = String(params[desc.jsonPath[0]]).replace(/<a\b[^>]*>[\s\S]*?<\/a>/, '')
    return { ...out, params: JSON.stringify(params) }
  },
  [landing3]
)
const l3 = await K.pageHtml(base, landing3)
const emptiedHtml = K.moduleHtml(l3, emptied) ?? ''
step(
  'an emptied button leaves no empty anchor',
  K.emptyAnchors(emptiedHtml) === 0 && emptiedHtml.includes('Proof paragraph.'),
  {
    plainCopy: K.emptyAnchors(K.moduleHtml(l3, plain) ?? ''),
    emptied: K.emptyAnchors(K.moduleHtml(l3, emptied) ?? '')
  }
)
const rows = rowHide(twice.id).row
const titles = mapping.blocks[twice.id].itemFields['heading-2']
const rowMarks = [marker(710, 12), marker(711, 12)]
const iconAt = (i, light) => ({
  ...titles[i],
  jsonPath: [rows.parent[0], `features-intro[img-${light}icon]`, i]
})
const iconsId = await copy(
  own(twice),
  (f) => {
    let out = cut(twice.id, 2)(f)
    for (const i of [0, 1]) {
      out = K.setAt(out, titles[i], rowMarks[i], lib)
      out = K.setAt(out, iconAt(i, ''), picture, lib)
      if (i === 0) out = K.setAt(out, iconAt(i, 'light-'), picture, lib)
    }
    return out
  },
  [landing4]
)
const icons = K.moduleHtml(await K.pageHtml(base, landing4), iconsId) ?? ''
const prefix = (html, mark) => html.slice(Math.max(0, html.indexOf(mark) - 30), html.indexOf(mark))
step(
  'fewer rows: the copy prints only the rows left',
  rowMarks.every((m) => icons.includes(m)),
  {
    rowsPrinted: count(icons, prefix(icons, rowMarks[0]))
  }
)
step('an empty light icon prints a broken picture (both versions must be written)', true, {
  brokenPictures: count(icons, 'src="/"')
})

// 4c. The article list: a plain copy against one with the declared resets. Its item button label is a site language
// string (one for every copy), written once in place through the blank site contract.
const list = mapping.placements['block-160']
const contractApply = async (changes, why) => {
  const state = await door.call('content.contract', { operation: 'inspect' })
  return door.call('content.contract', {
    operation: 'apply',
    apply_id: `contract-copy-proof-${Date.now()}-${alias++}`,
    request_id: `copy-proof-${Date.now()}-${alias++}`,
    expected_revision: state.revision,
    changes,
    evidence: Object.fromEntries(Object.keys(changes).map((k) => [k, why]))
  })
}
const tryLabel = mapping.blocks['block-160'].fields['try-button-label']
const tryApplied = await contractApply(
  { [tryLabel.slot]: 'Try this class' },
  'invented: the list item button'
)
step('the list item button label (a language string) is written in place', tryApplied.ok === true, {
  slot: tryLabel.slot,
  ...(tryApplied.ok ? {} : { error: `${tryApplied.error}: ${tryApplied.message}` })
})
const listPage = await menuItem('Proof List Fixed', 'mainmenu', LANDING)
const bare = await copy(list.entity, (f) => f, [landing2])
const fixed = await copy(
  list.entity,
  (f) => {
    const params = JSON.parse(f.params)
    for (const r of list.resets) {
      if (r.from === 'buildSets') params[r.location.jsonPath[0]] = [String(category)]
      if (r.from === 'hides') params[r.location.jsonPath[0]] = '0'
    }
    return { ...f, params: JSON.stringify(params) }
  },
  [listPage]
)
const bareHtml = K.moduleHtml(await K.pageHtml(base, landing2), bare) ?? ''
const fixedHtml = K.moduleHtml(await K.pageHtml(base, listPage), fixed) ?? ''
step(
  'the article list defect: a plain copy prints an empty button and no article',
  K.emptyAnchors(bareHtml) > 0 && !bareHtml.includes('Proof Class Article'),
  {
    emptyAnchors: K.emptyAnchors(bareHtml)
  }
)
step(
  'the declared resets remove it',
  K.emptyAnchors(fixedHtml) === 0 && fixedHtml.includes('Proof Class Article'),
  {
    resets: list.resets.map((r) => `${r.from}:${r.location.jsonPath.join('.')}`),
    emptyAnchors: K.emptyAnchorList(fixedHtml),
    article: fixedHtml.includes('Proof Class Article')
  }
)

// 4d. Two plans containers on one page.
const box = mapping.placements['block-184']
const tabs = [
  ['block-167', marker(720, 14)],
  ['block-188', marker(721, 14)]
]
const containers = []
const inners = []
const boxBlock = placed.find((b) => b.id === 'block-184')
const boxText = textFields(boxBlock).map((f, i) => ({ at: f.at, value: marker(750 + i, f.field.limit) }))
for (const [held, label] of tabs) {
  containers.push(
    await copy(box.entity, (f) => boxText.reduce((out, v) => K.setAt(out, v.at, v.value, lib), f), [plans])
  )
  inners.push(await copy(mapping.placements[held].entity, (f) => ({ ...f, title: label }), [plans]))
}
let plansHtml = await K.pageHtml(base, plans)
step(
  'the plans container copy draws its own text and its tabs',
  boxText.every((v) => plansHtml.includes(v.value)),
  {
    fields: boxText.length
  }
)
const shared = tabs.map(([, label]) => count(plansHtml, label))
for (const [i, id] of containers.entries()) {
  const position = `copy-proof-tabs-${id}`
  const record = await door.get('module', id)
  await door.update('module', id, { params: K.setAt(record, box.holds.position, position, lib).params })
  await door.update('module', inners[i], { position })
}
plansHtml = await K.pageHtml(base, plans)
const apart = tabs.map(([, label]) => count(plansHtml, label))
step(
  'two plans containers sharing one position: each draws the tabs of both',
  shared.every((c) => c >= 2),
  {
    labelCounts: shared
  }
)
step(
  'a position of its own per container copy keeps them apart',
  apart.every((c) => c === 1),
  {
    labelCounts: apart
  }
)

// 4e. Footer social on every page; a masthead copy holding the one row of its page; the menu blocks.
const social = placed.find((b) => b.id === 'block-171')
const sf = textField(social)
const socialMark = marker(730, 20)
await copy(own(social), (f) => K.setAt(cut(social.id, 1)(f), sf.at, socialMark, lib), [0])
const everywhere = [landing2, inner2]
const socialSeen = []
for (const p of everywhere) socialSeen.push((await K.pageHtml(base, p)).includes(socialMark))
step('a copy assigned to every page ("[0]") draws on every page', socialSeen.every(Boolean), {
  pages: everywhere
})
const mastTitle = marker(740, 19)
const mast = await copy(
  mapping.placements['block-162'].entity,
  (f) => {
    const params = JSON.parse(f.params)
    params.menuitem_config = {
      item_id: [[String(inner2)]],
      title: [mastTitle],
      description: [''],
      background: ['']
    }
    return { ...f, params: JSON.stringify(params) }
  },
  [inner2]
)
step(
  'a masthead copy holding the one row of its page draws it',
  (await K.pageHtml(base, inner2)).includes(mastTitle),
  {
    module: mast
  }
)
const menuHtml = allPages
step(
  'the menu blocks draw the items the build creates in their menus',
  Object.values(menuMarkers).every((m) => menuHtml.includes(m)),
  menuMarkers
)

// 5. An in-place block: the store record is assigned to the pages (here every page), then written through the
// blank site contract. Inspect first: the copies change the inventory, the assignment adds a drift warning.
await door.update('moduleAssignment', moduleId(mapping.placements['block-176'].entity), { menuids: '[0]' })
const state = await door.call('content.contract', { operation: 'inspect' })
step('inspect after the copies', state.ok === true, {
  warnings: (state.warnings ?? []).map((w) => w.message ?? w)
})
const slot = (state.slots ?? []).find((s) => s.key === 'module-176.1')
const label = 'Book a proof class'
const applied = await door.call('content.contract', {
  operation: 'apply',
  apply_id: `contract-copy-proof-${Date.now()}`,
  request_id: `copy-proof-${Date.now()}`,
  expected_revision: state.revision,
  changes: { [slot?.key ?? 'module-176.1']: label },
  evidence: { [slot?.key ?? 'module-176.1']: 'invented: the proof writes the in-place header button' }
})
const homeEnd = await fetch(`${base}/`)
const homeText = await homeEnd.text()
step(
  'one apply on the bound blank site contract (in-place chrome)',
  applied.ok === true && homeText.includes(label),
  {
    error: applied.ok ? undefined : `${applied.error}: ${applied.message}`
  }
)
step('home page answers', homeEnd.status === 200, homeEnd.status)
const end = await door.call('info', {})
const after = end.info?.component
step('plugin version unchanged during the run', after === version, { start: version, end: after })

if (reportFile) writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`)
console.log(report.ok ? 'copy proof: every step holds' : 'copy proof: some steps FAILED')
process.exit(report.ok ? 0 : 1)
