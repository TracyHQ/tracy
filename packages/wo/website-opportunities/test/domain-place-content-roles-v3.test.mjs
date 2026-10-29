// Place content roles v3 (ADR 0040): the new roles, the split decorative picture, repeatable lists, and the role as the
// only decider of whether a slot keeps the demo's content. Every business, person and file below is fictional.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as domain from '../domain/index.mjs'
import { protectedPicture } from '../domain/pictures/slot-map.mjs'
import { emptyPlaceProfile } from '../domain/place-profile.mjs'

const V2 = 'place-content-roles/2'
const V3 = 'place-content-roles/3'

const photoFit = (replace, kind = 'photo') => ({
  measured: true,
  kind,
  replace,
  transparent: false,
  boxes: { desktop: { width: 320, height: 320 } },
  aspect: 1,
  tolerance: 0.02,
  minWidth: 480,
  crop: 'cover'
})

// A fictional boxing club's map: a trainer card whose photo capture measured as an avatar, a gallery of two pictures
// declared as a repeatable list, a kept design element, an illustration and a sample article.
function v3Map() {
  return {
    roleVocabularyVersion: V3,
    slotFitVersion: 'slot-fit/1',
    slots: [
      {
        key: 'site.name',
        type: 'text',
        sample: 'Ember Ridge Boxing',
        role: 'business.name',
        group: { id: 'site.identity.0', item: 0, kind: 'business' },
        fit: { measured: false }
      },
      {
        key: 'footer.copyright',
        type: 'text',
        sample: 'Copyright 2019 Ember Ridge Boxing',
        role: 'business.copyright',
        group: { id: 'site.identity.0', item: 0, kind: 'business' },
        fit: { measured: false }
      },
      {
        key: 'module-701.0',
        type: 'text',
        sample: 'Marlo Quint',
        role: 'person.name',
        group: { id: 'module-701.person.0', item: 0, kind: 'person' },
        fit: { measured: false }
      },
      {
        key: 'module-701.1',
        type: 'image',
        sample: 'images/demo/trainer-avatar.jpg',
        role: 'person.image',
        group: { id: 'module-701.person.0', item: 0, kind: 'person' },
        fit: photoFit('photo', 'avatar')
      },
      {
        key: 'module-702.0',
        type: 'image',
        sample: 'images/demo/gallery-1.jpg',
        role: 'business.gallery_image',
        group: { id: 'module-702.photo.0', item: 0, kind: 'gallery' },
        fit: photoFit('photo')
      },
      {
        key: 'module-702.1',
        type: 'image',
        sample: 'images/demo/gallery-2.jpg',
        role: 'business.gallery_image',
        group: { id: 'module-702.photo.1', item: 1, kind: 'gallery' },
        fit: photoFit('photo')
      },
      {
        key: 'module-703.0',
        type: 'image',
        sample: 'images/demo/brush-stroke.png',
        role: 'editorial.design_element',
        customize: 'keep',
        fit: photoFit('keep', 'decoration')
      },
      {
        key: 'module-703.1',
        type: 'image',
        sample: 'images/demo/gloves-on-bench.jpg',
        role: 'editorial.illustration',
        fit: photoFit('photo')
      },
      {
        key: 'module-703.2',
        type: 'url',
        sample: 'index.php?Itemid=812',
        role: 'editorial.navigation_url',
        customize: 'keep'
      },
      {
        key: 'article-31.title',
        type: 'text',
        sample: 'Five drills for footwork',
        role: 'article.title',
        fit: { measured: false }
      },
      {
        key: 'article-31.date',
        type: 'text',
        sample: '12 March',
        role: 'article.date',
        fit: { measured: false }
      }
    ],
    repeatableLists: {
      'module-702.photo': { itemTemplate: 'module-702.photo.0', min: 1, max: null }
    }
  }
}
const slotOf = (map, key) => map.slots.find((s) => s.key === key)
const errorsOf = (map) => domain.checkContentMapRoles(map).errors

test('version 3 lists every new role, the split decorative picture and the article family; version 2 is unchanged', () => {
  for (const role of [
    'business.gallery_image',
    'business.video',
    'offering.schedule',
    'editorial.item_icon',
    'business.copyright',
    'contact.map',
    'editorial.newsletter_label',
    'editorial.navigation_url',
    'stat.proof_image',
    'claim.heading',
    'article.title',
    'article.lead',
    'article.image',
    'article.date',
    'editorial.illustration',
    'editorial.design_element'
  ]) {
    assert.equal(domain.isRole(role, V3), true, role)
    assert.equal(domain.isRole(role, V2), false, `${role} is version 3 only`)
    assert.ok(Object.hasOwn(domain.DEFAULT_NEUTRAL_BY_ROLE, role), `no rule for no fact: ${role}`)
  }
  assert.equal(domain.isRole('editorial.decorative_image', V2), true)
  assert.equal(domain.isRole('editorial.decorative_image', V3), false, 'split in version 3')
  assert.equal(
    domain.isRole('editorial.decorative_image'),
    true,
    'the default version is the one capture writes'
  )
  // test-quality: contract capture keeps writing version 2 until a template adopts version 3
  assert.equal(domain.ROLE_VOCABULARY_VERSION, V2)
  // test-quality: contract during the expand step a content map may name either vocabulary
  assert.deepEqual(domain.CONTENT_MAP_ROLE_VOCABULARY_VERSIONS, [V2, V3])
  for (const role of domain.FACT_ROLES) assert.equal(domain.isRole(role, V3), true, role)
  for (const role of domain.FACT_ROLES_ADDED_IN_V3) assert.equal(domain.isFactRole(role), true, role)
  for (const role of domain.ARTICLE_ROLES) assert.equal(domain.isFactRole(role), false, role)
  assert.equal(domain.isGroupKind('gallery', V3), true)
  assert.equal(domain.isGroupKind('gallery', V2), false)
  assert.equal(Object.hasOwn(domain.GROUP_KINDS, 'gallery'), false, 'version 2 kinds are unchanged')
  assert.equal(domain.modeOfRole('business.gallery_image'), 'asset')
  assert.equal(domain.modeOfRole('business.video'), 'asset')
})

test('every role of every version has exactly one keep decision', () => {
  for (const role of [...domain.PLACE_CONTENT_ROLES, ...domain.PLACE_CONTENT_ROLES_V3])
    assert.ok(domain.KEEP_DECISIONS.includes(domain.keepDecisionOfRole(role)), role)
  for (const role of [...domain.FACT_ROLES_V3, ...domain.ARTICLE_ROLES])
    assert.equal(domain.keepDecisionOfRole(role), 'replace', `a fact never keeps demo content: ${role}`)
  assert.equal(domain.keepDecisionOfRole('editorial.illustration'), 'rewrite')
  assert.equal(domain.keepDecisionOfRole('editorial.design_element'), 'keep')
  assert.equal(domain.keepDecisionOfRole('editorial.not_a_role'), null)
})

test('a well-formed version 3 map passes the role and Slot fit checks', () => {
  assert.deepEqual(domain.checkContentMapRoles(v3Map()), { declared: true, ok: true, errors: [] })
  assert.deepEqual(domain.checkContentMapFit(v3Map()).errors, [])
})

test('neither side may invent a role string: an unknown role, a version 3 role in a version 2 map and the old decorative role in a version 3 map are refused', () => {
  const invented = v3Map()
  slotOf(invented, 'module-703.1').role = 'editorial.hero_banner'
  assert.ok(
    errorsOf(invented).some((e) => e.includes('module-703.1') && e.includes('unknown role')),
    errorsOf(invented).join('\n')
  )

  const old = v3Map()
  slotOf(old, 'module-703.0').role = 'editorial.decorative_image'
  assert.ok(errorsOf(old).some((e) => e.includes('module-703.0') && e.includes('unknown role')))

  const early = structuredClone(v3Map())
  early.roleVocabularyVersion = V2
  delete early.repeatableLists
  assert.ok(errorsOf(early).some((e) => e.includes('footer.copyright') && e.includes('unknown role')))
  assert.ok(errorsOf(early).some((e) => e.includes('module-702.0') && e.includes('not a known kind')))

  const sidecar = domain.slotRolesOfContentMap(v3Map())
  sidecar.bindings[0].role = 'business.nickname'
  assert.ok(
    domain.validateSlotRoles(sidecar).errors.some((e) => e.includes('unknown role "business.nickname"'))
  )
})

test('the role alone decides keep or replace: a trainer photo measured as an avatar is replaced', () => {
  const map = v3Map()
  const trainer = slotOf(map, 'module-701.1')
  assert.equal(domain.keepDecisionOf(trainer, map), 'replace')
  assert.equal(domain.keepDecisionOf(slotOf(map, 'module-703.0'), map), 'keep')
  assert.equal(domain.keepDecisionOf(slotOf(map, 'module-703.1'), map), 'rewrite')
  // Readers that only look at fit.replace and customize follow: the avatar is not a protected picture.
  assert.equal(protectedPicture(trainer, 'images/demo/trainer-avatar.jpg'), null)
  assert.equal(
    protectedPicture(slotOf(map, 'module-703.0'), 'images/demo/brush-stroke.png')?.kind,
    'decoration'
  )
  assert.equal(domain.pictureReplaceOfRole('business.logo'), 'logo')
  assert.equal(domain.customizeOfRole('editorial.item_icon'), 'keep')
  assert.equal(domain.customizeOfRole('person.image'), null)
})

test('in a version 3 map fit replace and customize may not decide on their own: each must follow the role', () => {
  const lockedFace = v3Map()
  Object.assign(slotOf(lockedFace, 'module-701.1'), { customize: 'keep', fit: photoFit('keep', 'avatar') })
  const faceErrors = errorsOf(lockedFace)
  assert.ok(
    faceErrors.some((e) => e.includes('module-701.1') && e.includes('must not carry customize "keep"')),
    faceErrors.join('\n')
  )
  assert.ok(faceErrors.some((e) => e.includes('module-701.1') && e.includes('fit replace must be "photo"')))

  const loose = v3Map()
  delete slotOf(loose, 'module-703.0').customize
  slotOf(loose, 'module-703.0').fit.replace = 'photo'
  const looseErrors = errorsOf(loose)
  assert.ok(looseErrors.some((e) => e.includes('module-703.0') && e.includes('needs customize "keep"')))
  assert.ok(looseErrors.some((e) => e.includes('module-703.0') && e.includes('fit replace must be "keep"')))

  const keptCopy = v3Map()
  slotOf(keptCopy, 'article-31.title').customize = 'keep'
  assert.ok(errorsOf(keptCopy).some((e) => e.includes('article-31.title') && e.includes('decides "replace"')))
})

test('the Slot fit check judges the kind as shape only in a version 3 map, and as the keep flag in a version 2 map', () => {
  assert.deepEqual(domain.checkContentMapFit(v3Map()).errors, [])
  const asV2 = v3Map()
  asV2.roleVocabularyVersion = V2
  const errors = domain.checkContentMapFit(asV2).errors
  assert.ok(
    errors.some((e) => e.includes('module-701.1') && e.includes('replace must be "keep" for kind avatar')),
    errors.join('\n')
  )
})

test('a version 2 map keeps its old keep reading: customize or a kept fit keeps, a fact is replaced', () => {
  const map = { roleVocabularyVersion: V2, slots: [] }
  assert.equal(
    domain.keepDecisionOf({ type: 'text', role: 'editorial.heading', customize: 'keep' }, map),
    'keep'
  )
  assert.equal(
    domain.keepDecisionOf(
      { type: 'image', role: 'person.image', customize: 'keep', fit: photoFit('keep', 'avatar') },
      map
    ),
    'keep'
  )
  assert.equal(domain.keepDecisionOf({ type: 'text', role: 'offering.price' }, map), 'replace')
  assert.equal(domain.keepDecisionOf({ type: 'text', role: 'editorial.paragraph' }, map), 'rewrite')
  assert.equal(domain.keepDecisionOf({ type: 'image', role: 'editorial.decorative_image' }, map), 'rewrite')
})

test('a repeatable list names an item of its own collection, one kind, and a min and max that hold', () => {
  const bad = (mutate) => {
    const map = v3Map()
    mutate(map.repeatableLists['module-702.photo'], map)
    return errorsOf(map).filter((e) => e.startsWith('repeatableLists'))
  }
  assert.deepEqual(
    bad(() => {}),
    []
  )
  assert.ok(
    bad((list) => (list.itemTemplate = 'module-702.photo.9'))[0].includes('is not a group of the map')
  )
  assert.ok(
    bad((list) => (list.itemTemplate = 'module-701.person.0'))[0].includes('not an item of this collection')
  )
  assert.ok(bad((list) => (list.min = -1))[0].includes('min must be'))
  assert.ok(bad((list) => Object.assign(list, { min: 4, max: 2 }))[0].includes('max must be'))
  assert.deepEqual(
    bad((list) => (list.max = 300)),
    []
  )
  assert.ok(
    bad((_, map) => {
      slotOf(map, 'module-702.1').group.kind = 'business'
      slotOf(map, 'module-702.1').role = 'business.hero_image'
    }).some((e) => e.includes('mixes kinds'))
  )
  const onV2 = {
    roleVocabularyVersion: V2,
    slots: [{ key: 'h', type: 'text', role: 'editorial.heading' }],
    repeatableLists: {}
  }
  assert.ok(errorsOf(onV2).some((e) => e.includes('repeatableLists needs roleVocabularyVersion')))
  assert.equal(domain.collectionOfGroupId('module-702.photo.12'), 'module-702.photo')
  assert.equal(domain.collectionOfGroupId('site'), null)
})

test('the group plan of a version 3 map binds the new fact roles, and the fill planner leaves them empty with no facts', () => {
  const doc = domain.slotRolesOfContentMap(v3Map(), { contract: 'ember-ridge/j6/1.0.0', cms: 'joomla' })
  assert.deepEqual(domain.validateSlotRoles(doc), { ok: true, errors: [] })
  assert.ok(doc.bindings.some((b) => b.role === 'business.copyright'))
  assert.ok(doc.groups.some((g) => g.entityKind === 'gallery'))
  assert.ok(!doc.bindings.some((b) => b.role.startsWith('article.') || b.role.startsWith('editorial.')))
  const profile = emptyPlaceProfile()
  const plan = domain.planSlotFill({
    slotRoles: doc,
    profile,
    assessment: domain.provisionalAssessment(profile),
    locale: 'en',
    neutralFor: domain.neutralFor
  })
  for (const write of plan.writes) assert.ok(['empty', 'neutral'].includes(write.state), write.slotKey)
})
