import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateSlotRoles } from 'website-opportunities/domain'
import { checkAllSlotRoles } from '../../../scripts/slot-roles/check.mjs'
import { proposeSlotRoles } from '../../../scripts/slot-roles/propose.mjs'
import { readSlotRoles } from '../src/lib/contract-slot-roles.js'
import { SLOT_ROLES_FILE, slotRolesOf } from '../src/lib/slot-roles.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const JOOMLA_DIR = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5')
const WP_DIR = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts/ja-restaurant/wp7/1.0.1')
const EMDASH_DIR = path.join(ROOT, 'packages/cms/tracy-emdash-theme-base/contracts/0.5.6')

test('slotRolesOf reports missing when slot-roles.json is absent', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'slot-roles-missing-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(JOOMLA_DIR, dir, { recursive: true })
  rmSync(path.join(dir, SLOT_ROLES_FILE), { force: true })

  const res = slotRolesOf(dir)
  assert.equal(res.state, 'missing')
  assert.ok(res.gaps.length > 0)
})

test('slotRolesOf reports stale when a base file changes in Joomla/WordPress or EmDash', (t) => {
  const joomlaTmp = mkdtempSync(path.join(tmpdir(), 'slot-roles-stale-j-'))
  t.after(() => rmSync(joomlaTmp, { recursive: true, force: true }))
  cpSync(JOOMLA_DIR, joomlaTmp, { recursive: true })
  const manifestPath = path.join(joomlaTmp, 'manifest.json')
  writeFileSync(manifestPath, `${readFileSync(manifestPath, 'utf8')}\n`)
  const jRes = slotRolesOf(joomlaTmp)
  assert.equal(jRes.state, 'stale')

  const emdashTmp = mkdtempSync(path.join(tmpdir(), 'slot-roles-stale-e-'))
  t.after(() => rmSync(emdashTmp, { recursive: true, force: true }))
  const themeDir = path.join(emdashTmp, 'packages/cms/tracy-emdash-theme-base')
  cpSync(path.join(ROOT, 'packages/cms/tracy-emdash-theme-base/seed'), path.join(themeDir, 'seed'), {
    recursive: true
  })
  cpSync(EMDASH_DIR, path.join(themeDir, 'contracts/0.5.6'), { recursive: true })
  const fieldMapPath = path.join(themeDir, 'seed/field-map.json')
  writeFileSync(fieldMapPath, `${readFileSync(fieldMapPath, 'utf8')}\n`)
  const eRes = slotRolesOf(path.join(themeDir, 'contracts/0.5.6'))
  assert.equal(eRes.state, 'stale')
})

test('slotRolesOf reports invalid when slot-roles.json is malformed JSON or fails schema validation', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'slot-roles-invalid-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(JOOMLA_DIR, dir, { recursive: true })

  writeFileSync(path.join(dir, SLOT_ROLES_FILE), '{not-valid-json')
  assert.equal(slotRolesOf(dir).state, 'invalid')

  const doc = JSON.parse(readFileSync(path.join(JOOMLA_DIR, SLOT_ROLES_FILE), 'utf8'))
  doc.bindings[0] = { ...doc.bindings[0], role: 'unknown.invalid_role' }
  writeFileSync(path.join(dir, SLOT_ROLES_FILE), JSON.stringify(doc, null, 2))
  const res = slotRolesOf(dir)
  assert.equal(res.state, 'invalid')
  assert.ok(Array.isArray(res.errors) && res.errors.length > 0)
})

test('slotRolesOf reports gaps when a requiresEvidence slot has no fact role bound', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'slot-roles-gaps-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(JOOMLA_DIR, dir, { recursive: true })

  const doc = JSON.parse(readFileSync(path.join(JOOMLA_DIR, SLOT_ROLES_FILE), 'utf8'))
  const targetSlot = 'module-183.9'
  doc.bindings = doc.bindings.filter((b) => b.slotKey !== targetSlot)
  writeFileSync(path.join(dir, SLOT_ROLES_FILE), JSON.stringify(doc, null, 2))

  const res = slotRolesOf(dir)
  assert.equal(res.state, 'ready')
  assert.ok(res.gaps.includes(targetSlot))
})

test('slotRolesOf reports ready with zero gaps on the three committed sidecars and preserves D2 semantic fixes', () => {
  for (const dir of [JOOMLA_DIR, WP_DIR, EMDASH_DIR]) {
    const res = slotRolesOf(dir)
    // The EmDash sidecar was cut from the released 0.5.6 seed; the theme source's field map has since gained roles
    // (ticket 1804), so it reads as stale beside it. Its content is still the sidecar the roles are checked against.
    const expected = dir === EMDASH_DIR ? 'stale' : 'ready'
    assert.equal(res.state, expected, `expected ${expected} for ${dir}: ${JSON.stringify(res.errors)}`)
    assert.equal(res.doc?.status, 'checked')
    assert.deepEqual(res.gaps, [], `unexpected gaps in ${dir}: ${JSON.stringify(res.gaps)}`)
  }

  // D2 §2 + §7 checks:
  // 1) module-181 & module-199 are 4 process steps ("01" / "Discover the business"), bound to step.index / step.title (entityKind "step").
  const joomlaDoc = slotRolesOf(JOOMLA_DIR).doc
  const joomlaBySlot = new Map(joomlaDoc.bindings.map((b) => [b.slotKey, b]))
  const joomlaGroupById = new Map(joomlaDoc.groups.map((g) => [g.groupId ?? g.id, g]))
  assert.equal(joomlaBySlot.get('module-181.2')?.role, 'step.index')
  assert.equal(joomlaBySlot.get('module-181.6')?.role, 'step.title')
  assert.equal(joomlaGroupById.get(joomlaBySlot.get('module-181.2')?.groupId)?.entityKind, 'step')
  assert.equal(joomlaBySlot.get('module-199.2')?.role, 'step.index')
  assert.equal(joomlaBySlot.get('module-199.6')?.role, 'step.title')
  assert.equal(joomlaGroupById.get(joomlaBySlot.get('module-199.2')?.groupId)?.entityKind, 'step')
  assert.equal(joomlaBySlot.get('module-191.2')?.role, 'stat.value')
  assert.equal(joomlaBySlot.get('module-216.2')?.role, 'stat.value')

  // 2) module-236 ("OpenDesign · Landing · testimonials") contains 3 team members ("Adam Hale" / "Design Director"); fake-person initials are not bound.
  assert.equal(joomlaBySlot.has('module-236.4'), false)
  assert.equal(joomlaBySlot.get('module-236.5')?.role, 'person.name')
  assert.equal(joomlaBySlot.get('module-236.6')?.role, 'person.role')
  assert.equal(
    joomlaDoc.bindings.some((b) => b.role === 'person.initials'),
    false
  )

  // 3) module-238 checkmark spans ("✓" at module-238.7, .9, .11) are not bound as package.feature_item.
  assert.equal(joomlaBySlot.has('module-238.7'), false)
  assert.equal(joomlaBySlot.get('module-238.8')?.role, 'package.feature_item')

  // 4) EmDash landing/about stats_figures are bound to step.* (entityKind "step"), while home_2/product stats_figures stay stat_item.
  const emdashDoc = slotRolesOf(EMDASH_DIR).doc
  const emdashBySlot = new Map(emdashDoc.bindings.map((b) => [b.slotKey, b]))
  const emdashGroupById = new Map(emdashDoc.groups.map((g) => [g.groupId ?? g.id, g]))
  assert.equal(emdashBySlot.get('landing.landing.stats_figures[0].value')?.role, 'step.index')
  assert.equal(emdashBySlot.get('landing.landing.stats_figures[0].caption')?.role, 'step.title')
  assert.equal(
    emdashGroupById.get(emdashBySlot.get('landing.landing.stats_figures[0].value')?.groupId)?.entityKind,
    'step'
  )
  assert.equal(emdashBySlot.get('about.about.stats_figures[0].value')?.role, 'step.index')
  assert.equal(emdashBySlot.get('about.about.stats_figures[0].caption')?.role, 'step.title')
  assert.equal(
    emdashGroupById.get(emdashBySlot.get('about.about.stats_figures[0].value')?.groupId)?.entityKind,
    'step'
  )
  assert.equal(emdashBySlot.get('home_2.home_2.stats_figures[0].value')?.role, 'stat.value')
  assert.equal(emdashBySlot.get('product.product.stats_figures[0].value')?.role, 'stat.value')
  assert.equal(
    emdashDoc.bindings.some((b) => b.role === 'person.initials'),
    false
  )

  // 5) WordPress checks:
  // homepage.features-intro item 3 is the featured special dish (offering.*), while items 1 & 2 are business story cards.
  const wpDoc = slotRolesOf(WP_DIR).doc
  const wpBySlot = new Map(wpDoc.bindings.map((b) => [b.slotKey, b]))
  assert.equal(wpBySlot.get('homepage.features-intro.title.3')?.role, 'offering.name')
  assert.equal(wpBySlot.get('homepage.menu.dish-name.1')?.role, 'offering.name')
  assert.equal(wpBySlot.get('homepage.menu.dish-price.1')?.role, 'offering.price')
  assert.equal(wpBySlot.get('about-us.teams.member-name.1')?.role, 'person.name')

  // 6) Neutral policies in all three sidecars strictly follow §7 and contain no forbidden neutral strings.
  const forbidden = ['Coming soon', "Chef's selection", 'Seasonal special', 'House favourite', 'Market price']
  for (const doc of [joomlaDoc, wpDoc, emdashDoc]) {
    const rawLower = JSON.stringify(doc).toLowerCase()
    for (const phrase of forbidden) {
      assert.equal(
        rawLower.includes(phrase.toLowerCase()),
        false,
        `sidecar ${doc.contract} must not contain forbidden neutral text "${phrase}"`
      )
    }
    for (const group of doc.groups) {
      const n = group.neutral ?? {}
      if (n['person.name']) assert.deepEqual(n['person.name'], { policy: 'empty' })
      if (n['person.image']) assert.deepEqual(n['person.image'], { policy: 'empty' })
      if (n['stat.label']) assert.deepEqual(n['stat.label'], { policy: 'empty' })
      if (n['stat.value']) {
        assert.deepEqual(n['stat.value'], { policy: 'neutral_key', key: 'neutral.stat.dash' })
      }
      if (n['offering.name']) {
        assert.equal(n['offering.name'].policy, 'neutral_by_kind')
        assert.equal(n['offering.name'].keysByKind?.dish, 'neutral.offering.menu_item')
        assert.equal(n['offering.name'].keysByKind?.drink, 'neutral.offering.menu_item')
        assert.equal(n['offering.name'].keysByKind?.service, 'neutral.offering.service')
        assert.equal(n['offering.name'].keysByKind?.product, 'neutral.offering.product')
      }
      if (n['package.name']) assert.deepEqual(n['package.name'], { policy: 'empty' })
      if (n['package.price']) assert.deepEqual(n['package.price'], { policy: 'empty' })
      if (n['package.period']) assert.deepEqual(n['package.period'], { policy: 'empty' })
      if (n['package.features_list']) assert.deepEqual(n['package.features_list'], { policy: 'empty' })
      if (n['package.feature_item']) assert.deepEqual(n['package.feature_item'], { policy: 'empty' })
      for (const ctaRole of ['contact.cta_label', 'offering.cta_label', 'package.cta_label']) {
        if (n[ctaRole]) {
          assert.equal(n[ctaRole].policy, 'neutral_key')
          assert.ok(
            (n[ctaRole].key === 'neutral.cta.contact' && n[ctaRole].requires === 'contact-target') ||
              (n[ctaRole].key === 'neutral.cta.call' && n[ctaRole].requires === 'phone')
          )
        }
      }
      if (n['step.index']) assert.deepEqual(n['step.index'], { policy: 'index_padded' })
      if (n['step.title']) {
        assert.deepEqual(n['step.title'], { policy: 'neutral_key', key: 'neutral.step.title' })
      }
      if (n['step.description']) assert.deepEqual(n['step.description'], { policy: 'empty' })
    }
  }
})

test('slotRolesOf resolves EmDash seed files when laid out as in the tracy-web Docker image', (t) => {
  const imgRoot = mkdtempSync(path.join(tmpdir(), 'slot-roles-emdash-img-'))
  t.after(() => rmSync(imgRoot, { recursive: true, force: true }))

  const dockerfile = readFileSync(path.join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
  for (const slug of ['tracy-business', 'tracy-saas', 'tracy-base']) {
    const pkg = slug.replace(/^tracy-/, 'tracy-emdash-theme-')
    assert.ok(
      dockerfile.includes(`packages/cms/${pkg}/seed/field-map.json`),
      `Dockerfile must copy ${pkg}/seed/field-map.json`
    )
  }

  const contractDest = path.join(imgRoot, 'src/contracts/tracy-base/emdash-0.x/0.5.6')
  const seedDest = path.join(imgRoot, 'src/emdash-tool/tracy-base/seed')
  cpSync(EMDASH_DIR, contractDest, { recursive: true })
  for (const file of ['seed.json', 'personalize.json', 'field-map.json']) {
    cpSync(path.join(ROOT, 'packages/cms/tracy-emdash-theme-base/seed', file), path.join(seedDest, file), {
      recursive: true
    })
  }

  // The seed files are found in the image layout; the sidecar is stale beside the current seed (field map roles, 1804).
  const res = slotRolesOf(contractDest)
  assert.equal(res.state, 'stale')
  assert.deepEqual(res.gaps, [])
  const read = readSlotRoles(contractDest, { cms: 'emdash' })
  assert.equal(read.source, 'field-map')
  assert.equal(read.state, 'ready')
})

test('proposeSlotRoles is deterministic on the three contracts and covers every requiresEvidence slot in bindings or unplaced', () => {
  for (const dir of [JOOMLA_DIR, WP_DIR, EMDASH_DIR]) {
    const first = proposeSlotRoles(dir)
    const second = proposeSlotRoles(dir)
    assert.deepEqual(first, second, `non-deterministic proposal for ${dir}`)
    assert.equal(first.doc.status, 'draft')

    const valid = validateSlotRoles(first.doc, { slotKeys: first.slotKeys })
    assert.deepEqual(valid, { ok: true, errors: [] }, `invalid draft for ${dir}`)

    const boundSet = new Set(first.doc.bindings.map((b) => b.slotKey))
    const unplacedSet = new Set(
      (first.doc.unplaced ?? []).map((u) => (typeof u === 'string' ? u : u.slotKey))
    )
    for (const reqKey of first.requiresEvidenceSlots) {
      assert.ok(
        boundSet.has(reqKey) || unplacedSet.has(reqKey),
        `requiresEvidence slot ${reqKey} missing from both bindings and unplaced in ${dir}`
      )
    }
  }
})

test('checkAllSlotRoles passes on the committed sidecars', () => {
  const res = checkAllSlotRoles(ROOT)
  assert.equal(res.ok, true, `checkAllSlotRoles errors: ${JSON.stringify(res.errors)}`)
  assert.ok(res.checkedCount >= 3)
})

// A sample blog post's author is template copy, not one of the business's people: binding it to person.*
// would put a real staff name under an article the business never wrote.
test('no sidecar, committed or proposed, binds a post author or byline to a person role', () => {
  const byline = /(^|\.)(author|byline|author_name)$/
  for (const dir of [JOOMLA_DIR, WP_DIR, EMDASH_DIR]) {
    const committed = JSON.parse(readFileSync(path.join(dir, SLOT_ROLES_FILE), 'utf8'))
    for (const doc of [committed, proposeSlotRoles(dir).doc]) {
      const wrong = doc.bindings.filter((b) => byline.test(b.slotKey) && b.role.startsWith('person.'))
      assert.deepEqual(wrong, [], `${dir}: ${wrong.length} author slots bound to a person`)
    }
  }
  const committed = JSON.parse(readFileSync(path.join(EMDASH_DIR, SLOT_ROLES_FILE), 'utf8'))
  const authors = committed.bindings.filter((b) => /^posts\..+\.author$/.test(b.slotKey))
  assert.ok(authors.length > 0)
  for (const b of authors) assert.equal(b.role, 'post.author', b.slotKey)
})
