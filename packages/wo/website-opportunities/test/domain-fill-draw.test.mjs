// Pictures a brief build draws, icons and cut-outs it replaces (spec TracyHQ/tracy#189, tickets #194 and #195), decided
// in the fill plan without a model or a site. Every rule runs on a racket club brief (portrait photos only) and on a
// bakery brief with a trimmed map. Fixtures are fictional.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFill } from '../domain/fill-plan.mjs'
import { DRAW_CAP, DRAW_REASONS, drawnPictureVerdict, planDrawings } from '../domain/fill-draw.mjs'
import { DECOR_REASONS, NEUTRAL_GLYPH, decorOf, glyphOf, planDecor } from '../domain/decor-plan.mjs'

const fit = (width, height, extra = {}) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  source: { width, height, format: 'jpg' },
  boxes: { desktop: { width, height } },
  ...extra
})
const image = (key, role, file, { group = null, size = [800, 600], kind = 'photo', ...extra } = {}) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/${file}`,
  label: key,
  role,
  ...(group ? { group } : {}),
  fit: fit(size[0], size[1], { kind }),
  ...extra
})
const text = (key, role, sample, group = null) => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  sample,
  label: key,
  role,
  ...(group ? { group } : {})
})
const card = (entity, n) => ({ id: `${entity}.item.${n}`, item: n, kind: 'service' })
const photo = (id, depicts = 'general', [width, height] = [900, 1200], extra = {}) => ({
  id,
  kind: 'image',
  width,
  height,
  depicts: { id: depicts, evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false,
  faceBoxes: [],
  source: 'website',
  uploaderRole: 'owner',
  ...extra
})
const CLUB = {
  business: { trade: 'sports', subTrade: 'racket club' },
  reading: {
    services: [
      { id: 'svc-tennis', label: 'Tennis Lessons' },
      { id: 'svc-padel', label: 'Padel Lessons' },
      { id: 'svc-swim', label: 'Swimming Lessons' },
      { id: 'svc-fit', label: 'Fitness Lessons' }
    ]
  }
}
const BAKERY = {
  business: { trade: 'food', subTrade: 'bakery' },
  reading: {
    services: [
      { id: 'svc-cakes', label: 'Celebration Cakes' },
      { id: 'svc-bread', label: 'Sourdough Bread' }
    ]
  }
}
const CLUB_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'module-1', kind: 'module' },
    { key: 'module-2', kind: 'module' },
    { key: 'module-3', kind: 'module' },
    { key: 'module-4', kind: 'module' },
    { key: 'article-5', kind: 'article' },
    { key: 'person-9', kind: 'person' }
  ],
  slots: [
    image('module-1.0', 'business.hero_image', 'hero/band.jpg', { size: [1920, 820] }),
    text('module-2.0', 'offering.name', 'Demo Class One', card('module-2', 0)),
    image('module-2.1', 'offering.image', 'classes/one.jpg', { group: card('module-2', 0) }),
    text('module-2.2', 'offering.name', 'Demo Class Two', card('module-2', 1)),
    image('module-2.3', 'offering.image', 'classes/two.jpg', { group: card('module-2', 1) }),
    image('module-3.0', 'business.gallery_image', 'gallery/tile-1.jpg', { size: [1400, 1400] }),
    image('module-3.1', 'business.gallery_image', 'gallery/tile-2.jpg', { size: [1400, 1400] }),
    image('module-4.0', 'business.gallery_image', 'gallery/tile-3.jpg', { size: [1400, 1400] }),
    image('person-9.0', 'person.image', 'team/coach.jpg', { size: [600, 600] }),
    image('module-1.9', 'business.logo', 'logo.png', { size: [200, 80], kind: 'logo', replace: 'logo' }),
    image('article-5.0', 'stat.proof_image', 'proof/strip.jpg', { size: [400, 100] })
  ],
  pages: [
    {
      route: 'home',
      assignedModules: [{ entity: 'module-1' }, { entity: 'module-2' }, { entity: 'module-3' }]
    },
    { route: 'about', assignedModules: [{ entity: 'module-4' }] }
  ]
}
const CLUB_NAMES = { 'module-2.item.0': 'Fitness Lessons', 'module-2.item.1': 'Swimming Lessons' }
const byKey = (slots) => new Map(slots.map((d) => [d.key, d]))

function draw(brief, assets, { contentMap = CLUB_MAP, cardNames = CLUB_NAMES, max, onSite } = {}) {
  const fill = planFill({ contentMap, brief: { ...brief, assets }, cardNames, perSlot: true })
  return planDrawings({
    fill,
    contentMap,
    brief: { ...brief, assets },
    ...(max ? { max } : {}),
    ...(onSite ? { onSite } : {})
  })
}

test('#194 a portrait-only brief gives the wide hero an outpaint drawing from an owner photo, at its shape', () => {
  const plan = draw(CLUB, [photo('court-1'), photo('court-2'), photo('pool-1', 'svc-swim')])
  const hero = byKey(plan.slots).get('module-1.0')
  assert.equal(hero.action, 'draw')
  assert.equal(hero.reason, 'drawn-outpaint')
  const drawing = plan.drawings.find((g) => g.id === hero.drawing)
  assert.equal(drawing.mode, 'outpaint')
  assert.ok(['court-1', 'court-2'].includes(drawing.sourceId), 'a general photo is extended for the place')
  assert.equal(drawing.aspect, Number((1920 / 820).toFixed(4)))
  assert.deepEqual(drawing.subject, { kind: 'venue', category: 'racket club' })
})

test('#194 an offering card without its photo gets a scene drawing whose subject names the offering', () => {
  // The fitness card has no fitness photo; the club's photos are too narrow to extend to its frame.
  const narrow = [300, 1200]
  const plan = draw(CLUB, [photo('court-1', 'general', narrow), photo('pool-1', 'svc-swim', narrow)])
  const fitness = byKey(plan.slots).get('module-2.1')
  assert.equal(fitness.action, 'draw')
  assert.equal(fitness.reason, 'drawn-scene')
  const drawing = plan.drawings.find((g) => g.id === fitness.drawing)
  assert.equal(drawing.mode, 'scene')
  assert.deepEqual(drawing.subject, {
    kind: 'offering',
    id: 'svc-fit',
    label: 'Fitness Lessons',
    category: 'racket club'
  })
  // A photo of another offering is never a reference of this one; a general photo of the place is.
  assert.deepEqual(drawing.referenceIds, ['court-1'])
})

test('#194 a person, a logo, a fact picture and a qualifying photo are never drawn', () => {
  const plan = byKey(draw(CLUB, [photo('court-1', 'general', [1600, 1200]), photo('gym-1', 'svc-fit')]).slots)
  assert.notEqual(plan.get('person-9.0').action, 'draw')
  assert.notEqual(plan.get('module-1.9').action, 'draw')
  assert.notEqual(plan.get('article-5.0').action, 'draw')
  // The fitness card has its own photo: a real photo always beats a drawing.
  assert.equal(plan.get('module-2.1').action, 'photo')
  assert.equal(plan.get('module-2.1').mediaId, 'gym-1')
})

test('#194 a map photo posted by someone else is never a reference, and no reference gives a brand colour block', () => {
  const others = photo('map-1', 'general', [1600, 1200], { source: 'google-maps', uploaderRole: 'customer' })
  const plan = draw(
    CLUB,
    [{ ...others, portraitOf: null }].map((a) => ({ ...a, width: 300, height: 1200 }))
  )
  for (const d of plan.slots.filter((s) => s.type === 'image' && s.role === 'business.gallery_image')) {
    assert.equal(d.action, 'substitute', d.key)
    assert.equal(d.reason, 'no-reference-photo', d.key)
    assert.equal(d.substitute.kind, 'brand-colour', d.key)
  }
  assert.ok(plan.drawings.every((g) => !g.referenceIds.includes('map-1')))
})

test('#194 a drawing serves the same subject and shape on another page, never twice on one page', () => {
  const plan = draw(CLUB, [photo('court-1'), photo('court-2'), photo('court-3')])
  const at = byKey(plan.slots)
  const home1 = at.get('module-3.0')
  const home2 = at.get('module-3.1')
  const about = at.get('module-4.0')
  assert.notEqual(home1.drawing, home2.drawing, 'two tiles of one page get two drawings')
  assert.equal(about.reason, 'drawn-reused')
  assert.ok([home1.drawing, home2.drawing].includes(about.drawing))
})

test('#194 the cap holds, home page first then largest first; a slot past it takes a brand colour block', () => {
  const plan = draw(CLUB, [photo('court-1'), photo('court-2'), photo('court-3')], { max: 1 })
  const at = byKey(plan.slots)
  assert.equal(plan.drawings.length, 1)
  assert.equal(at.get('module-1.0').action, 'draw', 'the home hero, the largest slot, is drawn first')
  assert.equal(at.get('module-3.0').reason, 'drawing-cap')
  assert.ok(plan.capped >= 1)
  // test-quality: contract ticket #194 fixes the cap at 20 drawings per build
  assert.equal(DRAW_CAP, 20)
  for (const d of plan.slots)
    if (d.action === 'draw' || d.reason in DRAW_REASONS) assert.ok(DRAW_REASONS[d.reason] ?? d.reason)
})

test('#194 a slot on no page the site keeps is never drawn and never spends the cap', () => {
  // A bakery whose hero sits on a page the tidy-up takes off: the one drawing the cap allows goes to a shown tile.
  const onSite = new Set(['module-3.0', 'module-3.1', 'module-4.0'])
  const plan = draw(BAKERY, [photo('counter-1'), photo('counter-2')], { cardNames: {}, max: 1, onSite })
  const at = byKey(plan.slots)
  assert.equal(plan.drawings.length, 1)
  assert.ok(
    plan.drawings[0].keys.every((k) => onSite.has(k)),
    'the drawing serves a shown slot'
  )
  assert.notEqual(at.get('module-1.0').action, 'draw', 'the hero off the site is not drawn')
  assert.notEqual(at.get('module-1.0').reason, 'drawing-cap', 'and is not reported as capped')
})

test('#194 a claim strip of customer faces with no brief picture is cleared, never a colour block', () => {
  // A bakery's "happy customers" strip is a png of faces; a jpg proof picture keeps the plain placeholder.
  const contentMap = {
    ...CLUB_MAP,
    slots: [
      ...CLUB_MAP.slots,
      image('module-3.5', 'stat.proof_image', 'proof/faces.png', { size: [324, 84], kind: 'avatar-group' })
    ]
  }
  const fill = planFill({
    contentMap,
    brief: { ...BAKERY, assets: [photo('counter-1')] },
    cardNames: {},
    perSlot: true
  })
  const at = byKey(fill.slots)
  assert.equal(at.get('module-3.5').action, 'substitute')
  assert.deepEqual(at.get('module-3.5').substitute, { kind: 'blank', reason: 'no-proof-picture' })
  assert.equal(at.get('article-5.0').action, 'substitute')
  assert.equal(at.get('article-5.0').substitute, undefined, 'a jpg proof picture keeps the plain placeholder')
})

test('#194 a photo with words added on it never fills a hero or a card, and a gallery takes it only last', () => {
  // A bakery's photos: its best one carries an event poster's words, its other photos are clean.
  const big = [2400, 1100]
  const poster = photo('poster-day', 'general', big, { hasTextOverlay: true })
  const one = draw(BAKERY, [poster, photo('counter-1', 'general', [1400, 1400])], { cardNames: {} })
  const at = byKey(one.slots)
  assert.notEqual(at.get('module-1.0').mediaId, 'poster-day', 'the hero never takes the worded photo')
  assert.ok(!one.drawings.some((g) => g.sourceId === 'poster-day' || g.referenceIds.includes('poster-day')))
  const tiles = ['module-3.0', 'module-3.1', 'module-4.0'].map((k) => at.get(k))
  assert.equal(tiles.find((d) => d.action === 'photo')?.mediaId, 'counter-1', 'the clean photo goes first')
  // With no clean photo left for it, a gallery tile may take the worded photo rather than stay empty.
  const only = draw(BAKERY, [photo('poster-day', 'general', [1400, 1400], { hasTextOverlay: true })], {
    cardNames: {}
  })
  const gallery = ['module-3.0', 'module-3.1', 'module-4.0'].map((k) => byKey(only.slots).get(k))
  assert.ok(gallery.some((d) => d.mediaId === 'poster-day'))
  assert.notEqual(byKey(only.slots).get('module-1.0').mediaId, 'poster-day')
})

test('#194 C06: slots that share one demo file get their own decisions, so each card gets its own picture', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-6', kind: 'module' }],
    slots: [
      text('module-6.0', 'offering.name', 'One', card('module-6', 0)),
      image('module-6.1', 'offering.image', 'shared.jpg', { group: card('module-6', 0) }),
      text('module-6.2', 'offering.name', 'Two', card('module-6', 1)),
      image('module-6.3', 'offering.image', 'shared.jpg', { group: card('module-6', 1) })
    ]
  }
  const assets = [photo('cake-1', 'svc-cakes', [1600, 1200]), photo('loaf-1', 'svc-bread', [1600, 1200])]
  const fill = planFill({
    contentMap,
    brief: { ...BAKERY, assets },
    cardNames: { 'module-6.item.0': 'Celebration Cakes', 'module-6.item.1': 'Sourdough Bread' },
    perSlot: true
  })
  const at = byKey(fill.slots)
  assert.deepEqual(
    ['module-6.1', 'module-6.3'].map((k) => [at.get(k).action, at.get(k).mediaId]),
    [
      ['photo', 'cake-1'],
      ['photo', 'loaf-1']
    ]
  )
  assert.notEqual(at.get('module-6.1').unit, at.get('module-6.3').unit)
  // Without the option the old writers still get one decision per demo file.
  const merged = byKey(
    planFill({
      contentMap,
      brief: { ...BAKERY, assets },
      cardNames: { 'module-6.item.0': 'Celebration Cakes', 'module-6.item.1': 'Sourdough Bread' }
    }).slots
  )
  assert.equal(merged.get('module-6.1').reason, 'conflicting-offerings')
})

test('#194 a bakery brief draws its hero from its own photo, with the bakery as the subject', () => {
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-1', kind: 'module' }],
    slots: [image('module-1.0', 'business.hero_image', 'hero.jpg', { size: [1920, 700] })],
    pages: [{ route: 'home', assignedModules: [{ entity: 'module-1' }] }]
  }
  const plan = draw(BAKERY, [photo('shop-1', 'general', [800, 800])], { contentMap: map, cardNames: {} })
  const drawing = plan.drawings[0]
  assert.equal(drawing.mode, 'outpaint')
  assert.equal(drawing.subject.category, 'bakery')
  assert.ok(!JSON.stringify(plan).includes('restaurant'))
})

test('#194 drawn pictures refuse lettering and accept people and faces independently of owner-photo rules', () => {
  assert.deepEqual(drawnPictureVerdict({ textPresence: 'present' }), { ok: false, reason: 'text-found' })
  assert.deepEqual(drawnPictureVerdict({ hasTextOverlay: true, faceBoxes: [[0, 0, 0.1, 0.1]] }), {
    ok: false,
    reason: 'text-found'
  })
  assert.deepEqual(drawnPictureVerdict({ content: 'text-graphic' }), { ok: false, reason: 'text-found' })
  assert.deepEqual(drawnPictureVerdict({ textPresence: 'absent', content: 'logo' }), {
    ok: true,
    reason: null
  })
  assert.deepEqual(drawnPictureVerdict({ textPresence: 'absent', faceBoxes: [[0, 0, 0.1, 0.1]] }), {
    ok: true,
    reason: null
  })
  assert.deepEqual(drawnPictureVerdict({ textPresence: 'absent', faceBoxes: [] }), { ok: true, reason: null })
  assert.deepEqual(drawnPictureVerdict(null), { ok: false, reason: 'labeller-unavailable' })
})

// ---- #195 icons and cut-outs ----

const icon = (key, file, group = null) =>
  image(key, 'editorial.item_icon', `icons/${file}`, {
    group,
    size: [100, 100],
    kind: 'icon',
    customize: 'keep'
  })

test('#195 decorative slots are labelled: item icons and cut-outs carry the subject, design pieces stay', () => {
  assert.equal(decorOf(icon('module-7.0', 'a.png')), 'icon')
  assert.equal(
    decorOf(image('module-8.0', 'business.hero_image', 'figure.png', { kind: 'cutout' })),
    'cut-out'
  )
  assert.equal(
    decorOf(image('module-8.1', 'editorial.design_element', 'line.png', { kind: 'decoration' })),
    'design'
  )
  assert.equal(decorOf({ ...icon('module-7.1', 'b.png'), decor: 'design' }), 'design')
  assert.equal(decorOf(image('module-8.2', 'business.gallery_image', 'tile.jpg')), null)
})

test('#195 a sports brief gets racquet, ball and swimming icons in place of the demo icons', () => {
  const g = (n) => ({ id: `module-7.item.${n}`, item: n, kind: 'business' })
  const contentMap = {
    slots: [
      text('module-7.0', 'editorial.heading', 'Demo item', g(0)),
      icon('module-7.1', 'dark-1.png', g(0)),
      icon('module-7.2', 'light-1.png', g(0)),
      text('module-7.3', 'editorial.heading', 'Demo item', g(1)),
      icon('module-7.4', 'dark-2.png', g(1)),
      text('module-7.5', 'editorial.heading', 'Demo item', g(2)),
      icon('module-7.6', 'dark-3.png', g(2)),
      text('module-7.7', 'editorial.heading', 'Demo item', g(3)),
      icon('module-7.8', 'dark-4.png', g(3))
    ]
  }
  // Item 0 is written as racquet words; the others take the brief's offerings in item order.
  const copy = { pins: { 'module-7.0': 'Bring your racquet' }, sources: { 'module-7.0': 'brief' } }
  const brief = {
    reading: {
      services: [
        { id: 'svc-tennis', label: 'Tennis Lessons' },
        { id: 'svc-foot', label: 'Football Camp' },
        { id: 'svc-swim', label: 'Swimming Lessons' }
      ]
    }
  }
  const at = byKey(planDecor({ contentMap, brief, copy }).slots)
  assert.deepEqual(
    ['module-7.1', 'module-7.2', 'module-7.4', 'module-7.6'].map((k) => at.get(k).glyph),
    ['racquet', 'racquet', 'soccer-ball', 'person-simple-swim']
  )
  assert.equal(at.get('module-7.1').reason, 'icon-of-item')
  assert.equal(at.get('module-7.4').reason, 'icon-of-offering')
  // Four items, three offerings: the fourth wraps to the first, whose racquet the section already shows (#189).
  assert.equal(at.get('module-7.8').glyph, 'tennis-ball')
})

test('#195 an icon on a page about one offering takes that offering; a demo word never chooses the icon', () => {
  const contentMap = {
    slots: [
      text('article-3.0', 'article.title', 'Demo boxing class'),
      icon('article-3.1', 'dark-1.png'),
      text('article-3.2', 'editorial.heading', 'Boxing Gloves'),
      icon('article-3.3', 'dark-2.png'),
      text('article-3.4', 'editorial.heading', 'Hand Wraps')
    ]
  }
  const copy = {
    pins: { 'article-3.0': 'Sourdough Bread', 'article-3.4': 'An apron' },
    sources: { 'article-3.0': 'brief', 'article-3.4': 'brief' }
  }
  const at = byKey(planDecor({ contentMap, brief: { ...BAKERY }, copy }).slots)
  assert.equal(at.get('article-3.1').glyph, 'bread', 'the page is about bread: a bakery glyph')
  assert.equal(at.get('article-3.1').reason, 'icon-of-page-offering')
  // The second item's words ("An apron") mean nothing the lexicon knows, and the page's bread is shown once: its
  // offering's next icon stands in (#189).
  assert.equal(at.get('article-3.3').glyph, 'grains')
  // Without any written word, offering or page: a neutral mark, never the demo icon.
  const bare = byKey(planDecor({ contentMap, brief: { reading: {} }, copy: null }).slots)
  assert.equal(bare.get('article-3.1').glyph, NEUTRAL_GLYPH)
  assert.equal(bare.get('article-3.1').reason, 'icon-neutral')
  for (const d of bare.values()) assert.ok(DECOR_REASONS[d.reason], d.reason)
})

test('#195 a cut-out is never drawn: it is taken off, and a design piece stays', () => {
  const contentMap = {
    slots: [
      image('module-8.0', 'business.hero_image', 'hero/figure.png', { kind: 'cutout', size: [1175, 960] }),
      image('module-8.1', 'editorial.design_element', 'shapes/line.png', { kind: 'decoration' })
    ]
  }
  const assets = [photo('court-1'), photo('logo-1', 'general', [400, 400], { isLogo: true })]
  const at = byKey(planDecor({ contentMap, brief: { ...CLUB, assets } }).slots)
  assert.equal(at.get('module-8.0').action, 'cut-out')
  assert.equal(at.get('module-8.0').mode, 'off')
  assert.equal(at.get('module-8.0').referenceIds, undefined, 'nothing is drawn from the owner photos')
  assert.equal(at.get('module-8.0').subject.label, 'Tennis Lessons')
  assert.equal(at.get('module-8.1').action, 'keep', 'a line stays as designed')
  assert.equal(glyphOf('Padel and tennis'), 'ping-pong')
})

test('#195 every icon and cut-out decision carries the brief words the site takes a kept picture with', () => {
  const g = (n) => ({ id: `module-7.item.${n}`, item: n, kind: 'business' })
  const contentMap = {
    slots: [
      text('module-7.0', 'editorial.heading', 'Demo item', g(0)),
      icon('module-7.1', 'dark-1.png', g(0)),
      text('module-7.2', 'editorial.heading', 'Demo item', g(1)),
      icon('module-7.3', 'dark-2.png', g(1)),
      image('module-8.0', 'business.hero_image', 'hero/figure.png', { kind: 'cutout', size: [1175, 960] }),
      image('module-8.1', 'editorial.design_element', 'shapes/line.png', { kind: 'decoration' })
    ]
  }
  // A bakery and a dental clinic: the words quote the brief's offering that chose the icon, never a demo word.
  for (const [brief, first] of [
    [BAKERY, 'Celebration Cakes'],
    [{ reading: { services: [{ id: 'svc-white', label: 'Teeth Whitening' }] } }, 'Teeth Whitening']
  ]) {
    const at = byKey(planDecor({ contentMap, brief, copy: null }).slots)
    assert.match(at.get('module-7.1').asked, new RegExp(`"${first}"`))
    assert.doesNotMatch(at.get('module-7.1').asked, /Demo item/)
    assert.ok(at.get('module-8.0').asked, 'a cleared figure says why it goes')
    assert.equal(at.get('module-8.1').asked, undefined, 'a design piece stays, so nothing asks for it')
    for (const d of at.values())
      if (d.asked) assert.ok(d.asked.length <= 2000 && !/[\u2013\u2014]/.test(d.asked))
  }
  // No offering at all: a neutral mark still says the demo's icon goes.
  const bare = byKey(planDecor({ contentMap, brief: { reading: {} }, copy: null }).slots)
  assert.match(bare.get('module-7.1').asked, /replaced/)
})

test('#195 the decorative slots of a released contract map are labelled from their roles and Slot fit', async () => {
  const { readFileSync } = await import('node:fs')
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  const labelled = map.slots.map((s) => [s, decorOf(s)]).filter(([, d]) => d)
  const icons = labelled.filter(([, d]) => d === 'icon').map(([s]) => s)
  assert.equal(icons.length, 48, 'every item icon carries the subject')
  assert.ok(icons.every((s) => /icons\/icon-(dark|light)-\d\.png/.test(s.sample)))
  assert.equal(labelled.filter(([, d]) => d === 'cut-out').length, 2)
  // A photo, a person and a logo are no decoration.
  assert.ok(labelled.every(([s]) => !['person.image', 'business.logo', 'offering.image'].includes(s.role)))
})

test("#194 #195 the site plan carries each slot's drawing, icon and cut-out decision", async () => {
  const { pictureDecisionsOf } = await import('../domain/site-plan-pictures.mjs')
  const contentMap = {
    ...CLUB_MAP,
    slots: [
      ...CLUB_MAP.slots,
      icon('module-3.5', 'dark-1.png', { id: 'module-3.item.0', item: 0, kind: 'business' }),
      image('module-1.4', 'business.hero_image', 'hero/figure.png', { kind: 'cutout', size: [1175, 960] })
    ]
  }
  const at = pictureDecisionsOf(contentMap, { ...CLUB, assets: [photo('court-1'), photo('court-2')] })
  assert.equal(at.get('module-1.0').action, 'draw')
  assert.equal(at.get('module-3.5').action, 'icon')
  assert.equal(at.get('module-3.5').glyph, 'racquet')
  assert.equal(at.get('module-1.4').action, 'cut-out')
  assert.equal(at.get('module-1.4').mode, 'off')
})

test('#192 #194 a kept card shows what the site plan names it: its own photo, or a drawing of that offering', async () => {
  const { pictureDecisionsOf } = await import('../domain/site-plan-pictures.mjs')
  const brief = { ...CLUB, assets: [photo('pool-1', 'svc-swim'), photo('court-1')] }
  // No card names: no card is known to show swimming, so the swimming photo goes on no card.
  const unnamed = pictureDecisionsOf(CLUB_MAP, brief)
  assert.notEqual(unnamed.get('module-2.1').mediaId, 'pool-1')
  // The plan names the first card Swimming Lessons and the second Fitness Lessons.
  const at = pictureDecisionsOf(CLUB_MAP, brief, {
    'module-2.item.0': 'Swimming Lessons',
    'module-2.item.1': 'Fitness Lessons'
  })
  assert.equal(at.get('module-2.1').mediaId, 'pool-1')
  assert.equal(at.get('module-2.3').action, 'draw')
  assert.equal(at.get('module-2.3').reason, 'drawn-scene')
})

test('#194 the brief logo, or a picture its labeller called no photograph, is never a drawing reference', () => {
  // A square logo from a social profile, unlabelled as a photograph: the largest picture of the brief, so it would
  // otherwise be the first one extended. Fictional ids, on both a club and a bakery brief.
  const logo = photo('brand-mark', 'general', [1080, 1080], {
    content: 'unlabelled',
    unlabelledReason: 'not_a_photograph'
  })
  const named = photo('named-mark', 'general', [1080, 1080])
  for (const brief of [CLUB, BAKERY]) {
    const plan = draw({ ...brief, brand: { logo: 'named-mark' } }, [
      logo,
      named,
      photo('court-1', 'general', [600, 800])
    ])
    for (const g of plan.drawings) {
      assert.ok(!g.referenceIds.includes('brand-mark'), `${g.id} uses a picture that is no photograph`)
      assert.ok(!g.referenceIds.includes('named-mark'), `${g.id} uses the brief logo`)
      assert.notEqual(g.sourceId, 'brand-mark')
      assert.notEqual(g.sourceId, 'named-mark')
    }
    assert.ok(plan.drawings.length > 0, 'the owner photo is still drawn from')
  }
})

test('#194 a drawing is planned at the shape the site holds the slot to, and told who the business is', () => {
  // The hero file is 2:1 but the slot is measured in a 1440 x 960 box: the site refuses anything off 1.5.
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-1', kind: 'module' }],
    slots: [
      image('module-1.0', 'business.hero_image', 'hero.jpg', {
        size: [1920, 960],
        fit: {
          ...fit(1920, 960),
          aspect: 1.5,
          crop: 'cover',
          boxes: { desktop: { width: 1440, height: 960 } }
        }
      })
    ],
    pages: [{ route: 'home', assignedModules: [{ entity: 'module-1' }] }]
  }
  const brief = {
    ...BAKERY,
    business: { name: 'Copperleaf Bakery', trade: 'food', subTrade: { id: 'bakery', method: 'model' } },
    keyMessages: [{ label: 'Baked before sunrise' }, { label: 'Rye and spelt loaves' }]
  }
  const plan = draw(brief, [photo('shop-1', 'general', [300, 1200])], { contentMap: map, cardNames: {} })
  const drawing = plan.drawings[0]
  assert.equal(drawing.aspect, 1.5)
  assert.equal(drawing.subject.category, 'bakery', 'a sub-trade record gives its id, never an object')
  assert.equal(drawing.subject.about, 'Copperleaf Bakery; Baked before sunrise; Rye and spelt loaves')
})
