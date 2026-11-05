/**
 * Mechanical label rules R2 to R9 of the content coverage audit (ADR 0040, spec #37): given a content map plus page
 * snapshots (and the audit's holes), the audit reports which rules fail, and writes the result into its committed
 * file. One fictional fixture per rule, and a clean one. Every business, person, phone and address is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { slotHash } from '../content-coverage/lib/label-judge.mjs'
import { applyJudgeToLabelRules, labelRulesOf } from '../content-coverage/lib/label-rules.mjs'

const V3 = 'place-content-roles/3'
const V2 = 'place-content-roles/2'

const grp = (id, item, kind) => ({ id, item, kind })
const text = (key, sample, role, extra = {}) => ({ key, type: 'text', sample, role, ...extra })

/** A clean v3 map of a fictional bakery: every rule passes. */
function cleanMap(version = V3) {
  return {
    roleVocabularyVersion: version,
    slotFitVersion: 'slot-fit/1',
    slots: [
      text('site.name', 'Larkspur Bakehouse', 'business.name', { group: grp('site.0', 0, 'business') }),
      text('site.phone', '(555) 010-4477', 'contact.phone', { group: grp('site.0', 0, 'business') }),
      text('hero.title', 'Fresh bread every morning', 'editorial.heading'),
      text('hero.label', 'Order now', 'contact.cta_label', { group: grp('hero.cta.0', 0, 'contact') }),
      {
        key: 'hero.link',
        type: 'url',
        sample: 'index.php?Itemid=9',
        role: 'contact.cta_url',
        group: grp('hero.cta.0', 0, 'contact')
      },
      { key: 'nav.link', type: 'url', sample: 'index.php?Itemid=3', role: 'editorial.navigation_url' },
      ...[0, 1, 2].flatMap((i) => [
        text(`team.${i}.n`, ['Ada Quill', 'Bo Marsh', 'Cy Fenn'][i], 'person.name', {
          jsonPath: ['team', 'team[name]', i],
          group: grp(`team.person.${i}`, i, 'person')
        }),
        {
          key: `team.${i}.p`,
          type: 'image',
          sample: `images/demo/face-${i}.jpg`,
          role: 'person.image',
          jsonPath: ['team', 'team[photo]', i],
          group: grp(`team.person.${i}`, i, 'person'),
          fit: { measured: true, kind: 'avatar', replace: 'photo' }
        }
      ])
    ]
  }
}

const rule = (res, id) => res.rules[id]
const fails = (res) =>
  Object.entries(res.rules)
    .filter(([, r]) => r.count > 0)
    .map(([id]) => id)

test('clean fixture: no rule fails, R1 is a number', () => {
  const res = labelRulesOf({ map: cleanMap(), pages: [], holes: [] })
  assert.deepEqual(fails(res), [])
  assert.equal(res.applies, true)
  assert.equal(res.roleVocabularyVersion, V3)
  assert.equal(typeof res.r1.percent, 'number')
  assert.deepEqual([res.r1.facts, res.r1.slots], [9, 10])
})

test('R2: a phone, email, address, price or hours sample with an editorial role fails; contact and price roles pass; a stat or claim role may carry a sum, not a phone', () => {
  const map = cleanMap()
  map.slots.push(
    text('about.p', 'Call us on (555) 010-9921 any day', 'editorial.paragraph'),
    text('about.mail', 'hello@larkspur.example', 'editorial.paragraph'),
    text('about.addr', 'Find us at 14 Marlow Street', 'editorial.heading'),
    text('menu.cost', 'Sourdough $6.50', 'editorial.paragraph'),
    text('about.hours', 'Mon-Fri 8am - 6pm', 'editorial.paragraph'),
    text('ok.price', '$4.00', 'offering.price', { group: grp('m.0', 0, 'menu_item') }),
    text('ok.claim', 'A platform that helped raise over $500 million for startups', 'claim.notice'),
    text('ok.stat', '$4.8m', 'stat.value'),
    text('ok.stat2', '$ 250k', 'stat.value'),
    text('home.price', 'Lakeside villa, $1.2 million', 'editorial.paragraph'),
    text('stat.phone', 'Call (555) 010-9921', 'stat.value'),
    text(
      'ok.icon',
      '((svg viewBox="0 0 40 40"))((path d="M3.75 2.5 10.6250 12.5000 18.7684 15.7303"))((/svg))',
      'editorial.item_icon'
    ),
    text('ok.hours', 'Mon-Fri 8am - 6pm', 'contact.hours', { group: grp('site.0', 0, 'business') })
  )
  const res = labelRulesOf({ map })
  assert.deepEqual(fails(res), ['R2'])
  assert.deepEqual(rule(res, 'R2').keys.sort(), [
    'about.addr',
    'about.hours',
    'about.mail',
    'about.p',
    'home.price',
    'menu.cost',
    'stat.phone'
  ])
})

test('R3: a URL slot without a role fails', () => {
  const map = cleanMap()
  map.slots.push({ key: 'foot.link', type: 'url', sample: 'index.php?Itemid=5' })
  const res = labelRulesOf({ map })
  assert.deepEqual(fails(res), ['R3'])
  assert.deepEqual(rule(res, 'R3').keys, ['foot.link'])
})

test('R4: an indexed repeat left ungrouped, two items in one group, or a CTA URL apart from its label fails', () => {
  const ungrouped = cleanMap()
  for (const s of ungrouped.slots) if (s.key === 'team.2.n') delete s.group
  assert.deepEqual(fails(labelRulesOf({ map: ungrouped })), ['R4'])
  assert.deepEqual(rule(labelRulesOf({ map: ungrouped }), 'R4').keys, ['team.2.n'])

  const shared = cleanMap()
  for (const s of shared.slots) if (s.key.startsWith('team.2.')) s.group = grp('team.person.1', 1, 'person')
  const res = labelRulesOf({ map: shared })
  assert.deepEqual(fails(res), ['R4'])
  assert.deepEqual(rule(res, 'R4').keys.sort(), ['team.1.n', 'team.1.p', 'team.2.n', 'team.2.p'])

  const apart = cleanMap()
  for (const s of apart.slots) if (s.key === 'hero.link') s.group = grp('hero.cta.9', 9, 'contact')
  assert.deepEqual(rule(labelRulesOf({ map: apart }), 'R4').keys, ['hero.link'])
})

test('R5: a fact role that keeps, or a face, signature or cut-out under a non-person role, fails', () => {
  const kept = cleanMap()
  for (const s of kept.slots)
    if (s.key === 'team.0.p') s.fit = { measured: true, kind: 'avatar', replace: 'keep' }
  assert.deepEqual(fails(labelRulesOf({ map: kept })), ['R5'])
  assert.deepEqual(rule(labelRulesOf({ map: kept }), 'R5').keys, ['team.0.p'])

  const wrongRole = cleanMap()
  wrongRole.slots.push({
    key: 'about.cutout',
    type: 'image',
    sample: 'images/demo/cut.png',
    role: 'editorial.illustration',
    fit: { measured: true, kind: 'cutout', replace: 'photo' }
  })
  assert.deepEqual(rule(labelRulesOf({ map: wrongRole }), 'R5').keys, ['about.cutout'])
})

test('R5: faces that prove a number pass with stat.proof_image (ADR 0040); a signature or cut-out under it fails', () => {
  const map = cleanMap()
  const picture = (key, kind) => ({
    key,
    type: 'image',
    sample: `images/demo/stats/${key}.png`,
    role: 'stat.proof_image',
    group: grp('stats.0', 0, 'stat'),
    fit: { measured: true, kind, replace: 'photo' }
  })
  map.slots.push(
    text('stats.value', '5k+', 'stat.value', { group: grp('stats.0', 0, 'stat') }),
    picture('strip', 'avatar-group'),
    picture('face', 'avatar'),
    picture('sign', 'signature'),
    picture('cut', 'cutout')
  )
  assert.deepEqual(rule(labelRulesOf({ map }), 'R5').keys, ['sign', 'cut'])
})

test('R6: a link or list item inside a fact slot fails', () => {
  const map = cleanMap()
  map.slots.push(
    {
      key: 'site.blob',
      type: 'html',
      sample: '<p>Open <a href="/x">daily</a></p>',
      role: 'contact.hours',
      group: grp('site.0', 0, 'business')
    },
    {
      key: 'pkg.list',
      type: 'html',
      sample: '<ul><li>Loaf</li><li>Roll</li></ul>',
      role: 'package.features_list',
      group: grp('pkg.0', 0, 'package')
    },
    {
      key: 'about.blob',
      type: 'html',
      sample: '<p>Read <a href="/y">more</a></p>',
      role: 'editorial.paragraph'
    }
  )
  const res = labelRulesOf({ map })
  assert.deepEqual(fails(res), ['R6'])
  assert.deepEqual(rule(res, 'R6').keys.sort(), ['pkg.list', 'site.blob'])
})

test('R7: siblings of a repeat with different roles fail', () => {
  const map = cleanMap()
  for (const s of map.slots) if (s.key === 'team.1.n') s.role = 'quote.author_name'
  const res = labelRulesOf({ map })
  assert.deepEqual(fails(res), ['R7'])
  assert.deepEqual(rule(res, 'R7').keys, ['team.1.n'])
})

test('a contact block whose cards each link one fact (address, email, phone) passes R4 and R7; T4 layout sections are not siblings', () => {
  // JA Impact 1.0.6 module 112: `<a href="mailto:…"><h5>email</h5></a>` — the fact is the link's label, and each card
  // of the repeat holds another channel.
  const card = (i, role, sample, href) => [
    text(`contact.${i}.t`, sample, role, {
      jsonPath: ['contact', 'contact[title]', i],
      group: grp(`contact.card.${i}`, 0, 'contact')
    }),
    {
      key: `contact.${i}.l`,
      type: 'url',
      sample: href,
      role: 'contact.cta_url',
      jsonPath: ['contact', 'contact[link]', i],
      group: grp(`contact.card.${i}`, 0, 'contact')
    }
  ]
  const map = cleanMap()
  map.slots.push(
    ...card(0, 'contact.address', '12 Wren Lane, Larkspur', ''),
    ...card(1, 'contact.email', 'hello@larkspur.example', 'mailto:hello@larkspur.example'),
    ...card(2, 'contact.phone', '(555) 010-4478', 'tel:5550104478')
  )
  assert.deepEqual(fails(labelRulesOf({ map })), [])

  // An offer's link still needs a button label: a phone beside it is not one.
  const offer = cleanMap()
  offer.slots.push(
    text('offer.phone', '(555) 010-4479', 'contact.phone', { group: grp('offer.0', 0, 'business') }),
    {
      key: 'offer.link',
      type: 'url',
      sample: 'index.php?Itemid=12',
      role: 'offering.cta_url',
      group: grp('offer.0', 0, 'business')
    }
  )
  assert.deepEqual(rule(labelRulesOf({ map: offer }), 'R4').keys, ['offer.link'])

  // Backgrounds of different sections of one T4 layout: a photo and a pattern may carry different roles.
  const bg = (i, role) => ({
    key: `templateConfig-1.${i}`,
    type: 'image',
    sample: `images/demo/bg-${i}.jpg`,
    role,
    entity: 'templateConfig-1',
    jsonPath: ['layout', 'sections', i, 'background_image'],
    group: grp(`templateConfig-1.section.${i}`, 0, 'business'),
    fit: { measured: true, kind: 'photo', replace: role === 'editorial.design_element' ? 'keep' : 'photo' }
  })
  const layout = cleanMap()
  layout.slots.push(
    bg(5, 'editorial.illustration'),
    bg(6, 'editorial.illustration'),
    bg(7, 'editorial.design_element')
  )
  assert.deepEqual(fails(labelRulesOf({ map: layout })), [])

  // Columns of one mega menu are still siblings.
  const col = (i, role) =>
    text(`templateConfig-2.${i}`, ['Platform', 'Styles', 'Guides'][i], role, {
      entity: 'templateConfig-2',
      jsonPath: ['mainmenu', '105', 'settings', 0, 'contents', i, 'title'],
      group: grp(`templateConfig-2.column.${i}`, 0, 'business')
    })
  const menu = cleanMap()
  menu.slots.push(col(0, 'editorial.heading'), col(1, 'editorial.heading'), col(2, 'editorial.paragraph'))
  assert.deepEqual(rule(labelRulesOf({ map: menu }), 'R7').keys, ['templateConfig-2.2'])
})

test('R7: the pieces of one HTML field in a repeat are not siblings of each other; the same piece across items is', () => {
  // Each item's description field holds an icon and words: the icon of item 0 and the icon of item 1 are siblings, the
  // icon and the words of one item are not, so their different roles are right.
  const map = cleanMap()
  for (const i of [0, 1]) {
    const at = { jsonPath: ['perks', 'perks[desc]', i], group: grp(`perks.${i}`, i, 'offering') }
    map.slots.push(
      {
        key: `perks.${i}.icon`,
        type: 'image',
        sample: `images/demo/perk-${i}.svg`,
        role: 'editorial.item_icon',
        xpath: '/html/body/div/p/img/@src',
        ...at
      },
      text(`perks.${i}.words`, ['Warm rolls', 'Cold brew'][i], 'editorial.paragraph', {
        xpath: '/html/body/div/p/text()[1]',
        ...at
      })
    )
  }
  assert.deepEqual(fails(labelRulesOf({ map })), [])
  map.slots.find((s) => s.key === 'perks.1.words').role = 'editorial.heading'
  map.slots.push(
    text('perks.2.words', 'Rye loaves', 'editorial.paragraph', {
      xpath: '/html/body/div/p/text()[1]',
      jsonPath: ['perks', 'perks[desc]', 2],
      group: grp('perks.2', 2, 'offering')
    })
  )
  const res = labelRulesOf({ map })
  assert.deepEqual(fails(res), ['R7'])
  assert.deepEqual(rule(res, 'R7').keys, ['perks.1.words'])
})

const item = (value, slot, rect, tag = 'span') => ({
  kind: 'text',
  value,
  tag,
  status: 'matched',
  slots: [slot],
  viewports: { desktop: { visible: true, count: 1, rect } }
})

test('R8: short slots on one line in two different items of a grouped repeat (a row of member cards) are not a cut heading', () => {
  const map = cleanMap()
  map.slots.push(
    text('m.0', 'Siggi Campel', 'person.name', {
      entity: 'module-99',
      group: grp('module-99.person.0', 0, 'person')
    }),
    text('m.1', 'Lee McClayton', 'person.name', {
      entity: 'module-99',
      group: grp('module-99.person.1', 1, 'person')
    })
  )
  const pages = [
    {
      url: 'https://site.example/',
      items: [
        item('Siggi Campel', 'm.0', { x: 100, y: 200, w: 120, h: 30 }),
        item('Lee McClayton', 'm.1', { x: 250, y: 200, w: 130, h: 30 })
      ]
    }
  ]
  assert.deepEqual(fails(labelRulesOf({ map, pages })), [])
})

test('R8: adjacent short slots of one entity on one line are flagged as a cut heading; a full line or another line is not', () => {
  const map = cleanMap()
  map.slots.push(
    text('h.a', 'Join our', 'editorial.heading', { entity: 'module-9' }),
    text('h.b', 'boxing club', 'editorial.heading', { entity: 'module-9' }),
    text('h.c', 'Train hard and eat well every day', 'editorial.heading', { entity: 'module-9' }),
    text('h.d', 'Welcome', 'editorial.heading', { entity: 'module-9' })
  )
  const pages = [
    {
      url: 'https://site.example/',
      items: [
        item('Join our', 'h.a', { x: 100, y: 200, w: 70, h: 40 }),
        item('boxing club', 'h.b', { x: 176, y: 202, w: 120, h: 40 }),
        item('Train hard and eat well every day', 'h.c', { x: 100, y: 300, w: 500, h: 40 }),
        item('Welcome', 'h.d', { x: 100, y: 500, w: 90, h: 40 })
      ]
    }
  ]
  const res = labelRulesOf({ map, pages })
  assert.deepEqual(fails(res), ['R8'])
  assert.deepEqual(rule(res, 'R8').keys, ['h.a + h.b'])
})

test('R8: names of two cards side by side on one line are not a cut heading', () => {
  const map = cleanMap()
  const pages = [
    {
      url: 'https://site.example/team',
      items: [
        item('Ada Quill', 'team.0.n', { x: 100, y: 200, w: 90, h: 30 }),
        item('Bo Marsh', 'team.1.n', { x: 196, y: 200, w: 80, h: 30 })
      ]
    }
  ]
  for (const s of map.slots) if (s.jsonPath) s.entity = 'module-4'
  assert.deepEqual(fails(labelRulesOf({ map, pages })), [])
  // The same two pieces in one card are still flagged.
  for (const s of map.slots) if (s.key === 'team.1.n') s.group = grp('team.person.0', 0, 'person')
  assert.equal(rule(labelRulesOf({ map, pages }), 'R8').count, 1)
})

test('R7: info cards that each hold a different contact fact pass; a contact fact beside an editorial sibling fails', () => {
  const map = cleanMap()
  const card = (i, sample, role) =>
    text(`info.${i}`, sample, role, {
      jsonPath: ['info', 'info[desc]', i],
      group: grp(`info.${i}`, i, 'contact')
    })
  map.slots.push(
    card(0, '12 Larkspur Lane, Hollow Bay', 'contact.address'),
    card(1, 'Mon - Fri: 7am - 3pm', 'contact.hours')
  )
  assert.deepEqual(fails(labelRulesOf({ map })), [])
  // In one shared card the different roles are a slip again.
  for (const s of map.slots) if (s.key === 'info.1') s.group = grp('info.0', 0, 'contact')
  assert.ok(fails(labelRulesOf({ map })).includes('R7'))
})

test('R4: a mailto or tel CTA URL is labelled by the email or phone in its group', () => {
  const map = cleanMap()
  const g = grp('foot.contact.0', 0, 'contact')
  map.slots.push(text('foot.email', 'hello@larkspur.example', 'contact.email', { group: g }), {
    key: 'foot.mail',
    type: 'url',
    sample: 'mailto:hello@larkspur.example',
    role: 'contact.cta_url',
    group: g
  })
  assert.deepEqual(fails(labelRulesOf({ map })), [])
  // An ordinary page link still needs a label slot beside it.
  map.slots.find((s) => s.key === 'foot.mail').sample = 'index.php?Itemid=4'
  assert.deepEqual(rule(labelRulesOf({ map }), 'R4').keys, ['foot.mail'])
})

test('slots of a demo-only entity (a style-guide page) are left out of the label rules; holes are not', () => {
  // A style-guide article shows "Example heading" cut in pieces and sample progress bars: the same layout on a page the
  // map does not mark would fail R8, the marked one does not. R9 still reads every hole.
  const build = (demoOnly) => {
    const map = cleanMap()
    map.entities = [
      { key: 'article-17', kind: 'article', sourceId: 17, ...(demoOnly ? { demoOnly: true } : {}) }
    ]
    map.slots.push(
      text('article-17.a', 'Example', 'editorial.heading', { entity: 'article-17' }),
      text('article-17.b', 'heading', 'editorial.heading', { entity: 'article-17' }),
      text('article-17.c', 'Call (555) 010-2299', 'editorial.paragraph', { entity: 'article-17' })
    )
    const pages = [
      {
        url: 'https://site.example/typography',
        items: [
          item('Example', 'article-17.a', { x: 100, y: 200, w: 80, h: 40 }),
          item('heading', 'article-17.b', { x: 186, y: 200, w: 80, h: 40 })
        ]
      }
    ]
    const holes = [{ kind: 'text', value: 'Call 555 010 3344', class: 'capture' }]
    return labelRulesOf({ map, pages, holes })
  }
  assert.deepEqual(fails(build(false)), ['R2', 'R8', 'R9'])
  const res = build(true)
  assert.deepEqual(fails(res), ['R9'])
  assert.equal(
    res.r1.slots,
    labelRulesOf({ map: cleanMap() }).r1.slots,
    'R1 counts no slot of the style-guide page'
  )
})

test('R9: a fact-like hole fails and an accepted reason does not lift it; other holes do not', () => {
  const holes = [
    {
      kind: 'text',
      value: 'Call 555 010 7788 today',
      class: 'capture',
      accepted: 'it is the template demo phone'
    },
    { kind: 'text', value: 'Lemon tart 3.50 EUR', class: 'template' },
    { kind: 'text', value: 'Read more about our story', class: 'template' },
    { kind: 'text', value: 'Call 555 010 1111', class: 'core' },
    // A code sample's log line (JA Kinetic): the sample's own words, never the business's.
    { kind: 'text', value: 'WARN: SAML assertion for user@example.com contained 340 group claims', class: 'capture', inCode: true }
  ]
  const res = labelRulesOf({ map: cleanMap(), holes })
  assert.deepEqual(fails(res), ['R9'])
  assert.equal(rule(res, 'R9').count, 2)
  assert.ok(!rule(res, 'R9').keys.some((k) => k.includes('user@example')))
})

test('a version 2 map is measured and reported but does not apply', () => {
  const map = cleanMap(V2)
  map.slots.push({ key: 'foot.link', type: 'url', sample: 'index.php?Itemid=5' })
  const res = labelRulesOf({ map })
  assert.equal(res.applies, false)
  assert.equal(res.roleVocabularyVersion, V2)
  assert.deepEqual(fails(res), ['R3'])
})

test('the committed coverage file carries the rule results', () => {
  const map = cleanMap()
  map.slots.push({ key: 'foot.link', type: 'url', sample: 'index.php?Itemid=5' })
  const result = {
    pages: [{ url: 'https://site.example/', items: [] }],
    failures: [],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const contract = { manifest: { id: 'x/j6/1.0.0' }, sha256: { contentMap: 'a', presentationLock: 'b' }, map }
  const doc = buildCoverageFile({ result, contract })
  assert.equal(doc.tool.version, '1.7.0')
  assert.equal(doc.labelRules.rules.R3.count, 1)
  assert.deepEqual(doc.labelRules.rules.R3.keys, ['foot.link'])
  assert.equal(doc.labelRules.applies, true)
})

test('R5: a design cut-out leaves R5 only once the label judge saw it as it is now and said right', () => {
  const design = (key, sample) => ({
    key,
    type: 'image',
    sample,
    role: 'editorial.design_element',
    customize: 'keep',
    fit: { measured: true, kind: 'cutout', replace: 'keep' }
  })
  const brush = design('hero.brush', 'images/demo/hero/deco.png')
  const trainer = design('hero.trainer', 'images/demo/hero/item-1.png')
  const keptPhone = text('foot.phone', '(555) 010-9999', 'contact.phone', { customize: 'keep' })
  const map = cleanMap()
  map.slots.push(brush, trainer, keptPhone)
  const measured = labelRulesOf({ map })
  // Measured alone, all three fail; the two design cut-outs wait for the judge.
  assert.equal(rule(measured, 'R5').count, 3)
  assert.deepEqual(
    rule(measured, 'R5').pendingJudge.map((p) => p.key),
    ['hero.brush', 'hero.trainer']
  )
  const judge = (slots) => ({ slots })
  // The brush stroke judged right as it is: lifted. The trainer cut-out judged wrong: still fails. A kept fact: still fails.
  const judged = applyJudgeToLabelRules(
    measured,
    judge([
      { key: 'hero.brush', hash: slotHash(brush), verdict: 'right' },
      { key: 'hero.trainer', hash: slotHash(trainer), verdict: 'wrong', groupWrong: true }
    ])
  )
  assert.equal(rule(judged, 'R5').count, 2)
  assert.deepEqual(rule(judged, 'R5').keys, ['hero.trainer', 'foot.phone'])
  assert.deepEqual(rule(judged, 'R5').exempted, ['hero.brush'])
  // No verdict, or a verdict on the slot as it was before (another hash): nothing is lifted.
  assert.equal(rule(applyJudgeToLabelRules(measured, null), 'R5').count, 3)
  const stale = applyJudgeToLabelRules(
    measured,
    judge([
      { key: 'hero.brush', hash: slotHash({ ...brush, sample: 'images/demo/old.png' }), verdict: 'right' }
    ])
  )
  assert.equal(rule(stale, 'R5').count, 3)
  // Recording again is idempotent, and a later wrong verdict puts the slot back.
  assert.deepEqual(
    applyJudgeToLabelRules(judged, judge([{ key: 'hero.brush', hash: slotHash(brush), verdict: 'right' }])),
    judged
  )
  const back = applyJudgeToLabelRules(judged, judge([]))
  assert.equal(rule(back, 'R5').count, 3)
  assert.deepEqual(rule(back, 'R5').exempted, [])
})
