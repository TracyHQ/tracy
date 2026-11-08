/**
 * The hidden kit fields check and the content map lists check on WordPress (ticket #457): both judged JA Diner WP7,
 * the WordPress reference, through the template readiness verdict, and turn red on a deliberately broken copy of it
 * (`dinerWp7({ edit })`) with the expected code. The committed kit declares none of the five hidden fields and the
 * committed content map carries no post entity, so the reference itself is recorded red today (the work of #459);
 * the green cases below declare what the kit and the map lack on a copy.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CONTENT_MAP_LISTS_CHECK } from '../src/lib/template-readiness/content-map-lists-check.js'
import { HIDDEN_KIT_FIELDS_CHECK } from '../src/lib/template-readiness/hidden-kit-fields.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'
import { postEntitiesOf } from '../../../packages/cms/tracy-wordpress-quickstart/scripts/capture-contract.mjs'
import { dinerWp7 } from './ja-diner-wp7-fixture.mjs'

const FIELDS = 'kit-hidden-fields'
const LISTS = 'content-map-lists'

/**
 * What one check of the verdict says of a copy of the Diner release (or of the release as it is when `edit` is left
 * out): its `{ state, code, params }`, or undefined when it flags nothing. The verdict hands a check the release and the
 * world exactly so; the piece it joins is decided by the first red entry, which road steps may take first.
 */
function judged(check, step, edit) {
  const { release, world, done } = dinerWp7(edit ? { edit } : {})
  try {
    const out = check.judge(release, world, {})
    return out ? { step, ...out } : undefined
  } finally {
    done()
  }
}

/** The five hidden kit fields, declared as a WordPress kit would. */
const declared = (site) => {
  site.emptyVideoButtons = [{ selector: '.jd-video[data-src$="/embed/"]', why: 'play button over the hero' }]
  site.selfLinkButtons = [{ container: 'div.jd-more', why: 'more button of a section' }]
  site.hiddenPageLinks = [{ container: 'div.jd-team-card', why: 'card links to a profile page' }]
  site.createdPageHide = [{ selector: 'div.jd-share', why: 'share bar of single posts' }]
  site.createdPageLayouts = { legal: { articleLayout: 'page', why: 'the plain page template' } }
}
const withKit =
  (change) =>
  ({ readJson, writeJson }) => {
    const kit = readJson('template-kit.json')
    change(kit.site, kit)
    writeJson('template-kit.json', kit)
  }

// ── hidden kit fields ────────────────────────────────────────────────────────────────────────────────────────────────

test('hidden fields: the committed Diner WP7 kit declares none of the five, so all five are named', () => {
  const step = judged(HIDDEN_KIT_FIELDS_CHECK, FIELDS)
  assert.deepEqual([step.state, step.code], ['todo', 'kit-hidden-field-missing'])
  assert.deepEqual(step.params.fields, [
    'emptyVideoButtons',
    'selfLinkButtons',
    'hiddenPageLinks',
    'createdPageHide',
    'createdPageLayouts.legal'
  ])
  assert.equal(step.params.platform, 'wordpress')
  assert.equal(step.params.framework, null)
})

test('hidden fields: a copy that declares all five is green', () => {
  const step = judged(HIDDEN_KIT_FIELDS_CHECK, FIELDS, withKit(declared))
  assert.deepEqual([step.state, step.code], ['done', 'kit-hidden-fields-declared'])
  assert.equal(step.params.declared.length, 5)
})

test('hidden fields: none with a reason is green; an empty list with no reason is red', () => {
  const none = withKit((site) => {
    declared(site)
    site.emptyVideoButtons = []
    site.noneWhy = { emptyVideoButtons: 'the theme prints no play button' }
    site.createdPageLayouts = { legal: { articleLayout: null, why: 'the default page template is plain' } }
  })
  const green = judged(HIDDEN_KIT_FIELDS_CHECK, FIELDS, none)
  assert.equal(green.code, 'kit-hidden-fields-declared')
  assert.deepEqual(green.params.none, ['emptyVideoButtons', 'createdPageLayouts.legal'])

  const red = judged(
    HIDDEN_KIT_FIELDS_CHECK,
    FIELDS,
    withKit((site) => {
      declared(site)
      site.selfLinkButtons = []
    })
  )
  assert.deepEqual([red.state, red.code], ['todo', 'kit-hidden-field-missing'])
  assert.deepEqual(red.params.fields, ['selfLinkButtons'])
})

test('hidden fields: a selector the write step would leave out, or a legal layout that is no template name, is red', () => {
  const step = judged(
    HIDDEN_KIT_FIELDS_CHECK,
    FIELDS,
    withKit((site) => {
      declared(site)
      site.emptyVideoButtons = [{ selector: '.jd-video', why: 'does not test the address' }]
      site.createdPageLayouts = { legal: { articleLayout: 'ja_boxing:default', why: 'a Joomla layout' } }
    })
  )
  assert.equal(step.code, 'kit-hidden-field-missing')
  assert.deepEqual(step.params.fields, ['emptyVideoButtons', 'createdPageLayouts.legal'])
  assert.ok(step.params.problems.length >= 2)
})

test('hidden fields: a WordPress legal layout is a block template name, with or without its theme', () => {
  for (const layout of ['page', 'wp-ja-diner//page-no-title']) {
    const step = judged(
      HIDDEN_KIT_FIELDS_CHECK,
      FIELDS,
      withKit((site) => {
        declared(site)
        site.createdPageLayouts = { legal: { articleLayout: layout, why: 'plain' } }
      })
    )
    assert.equal(step.code, 'kit-hidden-fields-declared', layout)
  }
})

test('hidden fields: a copy without its kit is not judged here (the kit step says it)', () => {
  assert.equal(
    judged(HIDDEN_KIT_FIELDS_CHECK, FIELDS, ({ remove }) => remove('template-kit.json')),
    undefined
  )
})

// ── content map lists ────────────────────────────────────────────────────────────────────────────────────────────────

const postEntities = (n) =>
  Array.from({ length: n }, (_, i) => ({
    key: `post-${i + 1}`,
    kind: 'post',
    identity: { postType: 'post', slug: `news-${i + 1}` }
  }))
const withMap =
  (change) =>
  ({ readJson, writeJson }) => {
    const map = readJson('content-map.json')
    change(map)
    writeJson('content-map.json', map)
  }
const withPosts = (n) =>
  withMap((map) => {
    map.entities.push(...postEntities(n))
    for (let i = 0; i < n; i++)
      map.slots.push({
        key: `post-${i + 1}.title`,
        entity: `post-${i + 1}`,
        target: { field: 'post_title' },
        type: 'text',
        sample: 'x',
        maxCharacters: 80,
        label: 'Title'
      })
  })

test('lists: the committed Diner WP7 map carries no post entity although its inventory holds 22 posts', () => {
  const step = judged(CONTENT_MAP_LISTS_CHECK, LISTS)
  assert.deepEqual([step.state, step.code], ['todo', 'content-map-missing-lists'])
  assert.deepEqual(step.params.missing, ['itemLists', 'itemPages'])
})

test('lists: a copy whose map carries the posts is not flagged (menus are carried by navigation-source.json)', () => {
  assert.equal(judged(CONTENT_MAP_LISTS_CHECK, LISTS, withPosts(3)), undefined)
})

test('lists: one post entity is enough for the article page, not for a list', () => {
  const step = judged(CONTENT_MAP_LISTS_CHECK, LISTS, withPosts(1))
  assert.deepEqual(step.params.missing, ['itemLists'])
})

test('lists: a post entity with no slot cannot be named or refilled, so the page is still missing', () => {
  const step = judged(
    CONTENT_MAP_LISTS_CHECK,
    LISTS,
    withMap((map) => map.entities.push(...postEntities(3)))
  )
  assert.deepEqual(step.params.missing, ['itemLists', 'itemPages'])
})

test('lists: a menu the inventory holds but navigation-source.json lacks is flagged as menuBlocks', () => {
  const dropMenu = ({ readJson, writeJson }) => {
    withPosts(3)({ readJson, writeJson })
    const nav = readJson('navigation-source.json')
    nav.navigations = nav.navigations.filter((n) => n.slug !== 'mainmenu')
    writeJson('navigation-source.json', nav)
  }
  assert.deepEqual(judged(CONTENT_MAP_LISTS_CHECK, LISTS, dropMenu).params.missing, ['menuBlocks'])
  const noFile = ({ readJson, writeJson, remove }) => {
    withPosts(3)({ readJson, writeJson })
    remove('navigation-source.json')
  }
  assert.deepEqual(judged(CONTENT_MAP_LISTS_CHECK, LISTS, noFile).params.missing, ['menuBlocks'])
})

test('lists: a site that holds no posts is not flagged for them', () => {
  const noPosts = ({ readJson, writeJson }) => {
    const inv = readJson('inventory.json')
    inv.posts = inv.posts.filter((p) => p.type === 'page')
    writeJson('inventory.json', inv)
  }
  assert.equal(judged(CONTENT_MAP_LISTS_CHECK, LISTS, noPosts), undefined)
})

test('lists: in the verdict the Diner map joins the contract piece through the same check', () => {
  const { release, world } = dinerWp7()
  const verdict = readinessVerdict(release, { ...world, checks: [CONTENT_MAP_LISTS_CHECK] })
  assert.ok(verdict.pieces.some((p) => p.piece === 'contract'))
})

// ── what the WordPress capture makes (capture-contract.mjs --posts) is what this check accepts ──

/** The Diner inventory's posts as rows of the dump's posts table: the capture reads titles, the inventory records them. */
const dinerPostRows = (inv) =>
  inv.posts.map((p) => ({
    ID: String(p.id),
    post_type: p.type,
    post_status: p.status,
    post_name: p.slug,
    post_title: p.title,
    post_excerpt: '',
    post_content: ''
  }))

test('lists: the post entities the WordPress capture makes from the 22 Diner posts satisfy the check', () => {
  let made = 0
  const step = judged(CONTENT_MAP_LISTS_CHECK, LISTS, ({ readJson, writeJson }) => {
    const got = postEntitiesOf(dinerPostRows(readJson('inventory.json')))
    made = got.entities.length
    const map = readJson('content-map.json')
    map.entities.push(...got.entities)
    map.slots.push(...got.slots)
    writeJson('content-map.json', map)
  })
  assert.equal(made, 22)
  assert.equal(step, undefined)
})

test('lists: a synced pattern or another structure of WordPress is not a post, so it carries no list', () => {
  const step = judged(
    CONTENT_MAP_LISTS_CHECK,
    LISTS,
    withMap((map) => {
      for (const [i, postType] of ['wp_block', 'wp_template_part', 'wp_navigation'].entries()) {
        map.entities.push({ key: `structure-${i}`, kind: 'post', identity: { postType, slug: `s-${i}` } })
        map.slots.push({
          key: `structure-${i}.x`,
          entity: `structure-${i}`,
          target: { block: 'x', attr: 'content' },
          type: 'text',
          sample: 'x',
          maxCharacters: 80,
          label: 'x'
        })
      }
    })
  )
  assert.deepEqual(step.params.missing, ['itemLists', 'itemPages'])
})
