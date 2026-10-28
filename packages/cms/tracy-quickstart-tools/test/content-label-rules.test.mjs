/**
 * Mechanical label rules R2 to R9 of the content coverage audit (ADR 0040, spec #37): given a content map plus page
 * snapshots (and the audit's holes), the audit reports which rules fail, and writes the result into its committed
 * file. One fictional fixture per rule, and a clean one. Every business, person, phone and address is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { labelRulesOf } from '../content-coverage/lib/label-rules.mjs'

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

test('R2: a phone, email, address, price or hours sample with an editorial role fails; contact and price roles pass', () => {
  const map = cleanMap()
  map.slots.push(
    text('about.p', 'Call us on (555) 010-9921 any day', 'editorial.paragraph'),
    text('about.mail', 'hello@larkspur.example', 'editorial.paragraph'),
    text('about.addr', 'Find us at 14 Marlow Street', 'editorial.heading'),
    text('menu.cost', 'Sourdough $6.50', 'editorial.paragraph'),
    text('about.hours', 'Mon-Fri 8am - 6pm', 'editorial.paragraph'),
    text('ok.price', '$4.00', 'offering.price', { group: grp('m.0', 0, 'menu_item') }),
    text('ok.hours', 'Mon-Fri 8am - 6pm', 'contact.hours', { group: grp('site.0', 0, 'business') })
  )
  const res = labelRulesOf({ map })
  assert.deepEqual(fails(res), ['R2'])
  assert.deepEqual(rule(res, 'R2').keys.sort(), [
    'about.addr',
    'about.hours',
    'about.mail',
    'about.p',
    'menu.cost'
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

const item = (value, slot, rect, tag = 'span') => ({
  kind: 'text',
  value,
  tag,
  status: 'matched',
  slots: [slot],
  viewports: { desktop: { visible: true, count: 1, rect } }
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
    { kind: 'text', value: 'Call 555 010 1111', class: 'core' }
  ]
  const res = labelRulesOf({ map: cleanMap(), holes })
  assert.deepEqual(fails(res), ['R9'])
  assert.equal(rule(res, 'R9').count, 2)
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
  assert.equal(doc.tool.version, '1.3.0')
  assert.equal(doc.labelRules.rules.R3.count, 1)
  assert.deepEqual(doc.labelRules.rules.R3.keys, ['foot.link'])
  assert.equal(doc.labelRules.applies, true)
})
