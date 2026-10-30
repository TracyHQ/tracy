/**
 * `content.replace` on words a WordPress theme prints when the page renders (a pattern a theme adds
 * through `the_content`, the wp-ja-diner `/contact-us/` case): no record holds them, so the call takes
 * the plugin's `content.renderedWords` road — and only when every store search found nothing writable,
 * the plugin says it can, and its inspect finds the words on the page.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import {
  linkBesideWords,
  linkTargetOk,
  placesOfTarget,
  RENDERED_TEXT,
  renderedSupport,
  renderedText,
  scanPlaces
} from '../src/host/rendered-words.mjs'
import { planReplace } from '../src/host/replace.mjs'
import { replaceOnWordPress, WP_REPLACE_NEXT } from '../src/host/replace-wordpress.mjs'

import { component, PAGES } from './fixtures/replace/fake-wordpress.mjs'

const PAGE = {
  ID: 905,
  post_type: 'page',
  post_status: 'publish',
  post_name: 'contact-us',
  post_title: 'Contact us',
  post_excerpt: '',
  post_content: '<!-- wp:paragraph -->\n<p>Keep this short line.</p>\n<!-- /wp:paragraph -->'
}

/** The words the theme's pattern prints after the page's own body. */
const PATTERN =
  '<div class="ja-contact-info"><p>Call <a href="tel:0845550110">(084) 555-0110</a></p>' +
  '<p>1600 Amphitheatre Parkway, Mountain View 5692</p>' +
  '<p>Designed by <a href="http://joomlart.com">JoomlArt</a></p></div>'

const html = (pattern = PATTERN) =>
  PAGES['/']
    .replace(/page-id-42/g, 'page-id-905')
    .replace(/wp-tracy-business/g, 'wp-ja-diner')
    .replace(
      /<main\b[\s\S]*<\/main>/,
      `<main class="wp-block-group"><div class="entry-content wp-block-post-content"><p>Keep this short line.</p>${pattern}</div></main>`
    )

const INFO = {
  ok: true,
  component: '0.18.0',
  rendered_words: {
    schema: 1,
    operations: ['inspect', 'apply', 'status'],
    targets: ['text', 'attribute:href'],
    max_rules_request: 16,
    max_rules_scope: 64,
    max_text_bytes: 4096,
    max_url_bytes: 2048
  }
}

/**
 * The plugin's half, faked over the page it renders: inspect counts each target in the page, apply
 * checks the proof and keeps the rules.
 * @param {{ info?: any, page?: string, stale?: number, applyAnswer?: any }} [options]
 */
function renderedPlugin({ info = INFO, page = html(), stale = 0, applyAnswer } = {}) {
  let revision = 3
  let staleLeft = stale
  /** @type {any[]} */
  const applied = []
  const script = (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'info') return info
    if (action !== 'content.renderedWords') return undefined
    if (params.operation === 'inspect')
      return {
        ok: true,
        scope: { entity: { kind: 'post', id: 905 }, locale: 'en' },
        path: params.path,
        revision,
        proof: `proof-${revision}`,
        expires_in: 900,
        rules: [],
        targets: params.targets.map((/** @type {any} */ t) => {
          // The plugin's own scanner (RenderedWords::candidates), ported and checked against it.
          const places = scanPlaces(page) ?? []
          const at = placesOfTarget(places, t)
          return {
            ...t,
            candidates: [...at].map(([anchor, { count }]) => ({
              anchor,
              count,
              where: 'main',
              excerpt: t.old
            }))
          }
        })
      }
    if (params.operation === 'apply') {
      if (staleLeft > 0) {
        staleLeft -= 1
        revision += 1
        return { ok: false, error: 'stale_proof', message: 'the page changed' }
      }
      if (applyAnswer) return applyAnswer
      if (params.proof !== `proof-${revision}` || params.expected_revision !== revision)
        return { ok: false, error: 'stale_proof', message: 'old proof' }
      applied.push(params)
      revision += 1
      return {
        ok: true,
        apply_id: params.apply_id,
        request_id: params.request_id,
        stored: true,
        revision,
        render: 'verified',
        rules: params.rules,
        written: [{ kind: 'option', id: 0, key: 'claude_cowork_rendered_words' }]
      }
    }
    return { ok: false, error: 'bad_params' }
  }
  return { script, applied }
}

/**
 * @param {Record<string, unknown>} params
 * @param {{ plugin?: ReturnType<typeof renderedPlugin>, page?: string, script?: any, confirmed?: boolean,
 *   posts?: any[] }} [options] - `posts`: records next to the page, e.g. a header part.
 */
async function run(params, options = {}) {
  const plugin = options.plugin ?? renderedPlugin()
  const site = component({
    posts: [PAGE, ...(options.posts ?? [])],
    script: (/** @type {string} */ a, /** @type {any} */ p, /** @type {number} */ n) =>
      options.script?.(a, p, n) ?? plugin.script(a, p)
  })
  const plan = planReplace({ path: '/contact-us/', ...params })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  let n = 0
  const out = /** @type {any} */ (
    await replaceOnWordPress({
      plan,
      read: site.door,
      write: site.door,
      pageHtml: async () => ({ ok: true, status: 200, html: options.page ?? html() }),
      mintApplyId: () => `replace-test-${(n += 1)}`,
      confirmed: options.confirmed,
      verify: false
    })
  )
  const rendered = site.calls.filter(([a]) => a === 'content.renderedWords').map(([, p]) => p)
  return { out, site, plugin, rendered }
}

const NOT_THEIRS = /site editor|theme file|theme's files|wp-cli/i

test('a phone number the theme prints is replaced with its tel: link, one apply, one receipt', async () => {
  const { out, site, plugin, rendered } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.apply_id, 'replace-test-1')
  assert.deepEqual(out.undo, { action: 'apply.revert', params: { apply_id: 'replace-test-1' } })
  assert.deepEqual(site.writes(), [], 'no record is written')
  assert.deepEqual(
    rendered.map((p) => p.operation),
    ['inspect', 'apply']
  )
  assert.deepEqual(rendered[0].targets, [
    { kind: 'text', old: '(084) 555-0110' },
    { kind: 'attribute', name: 'href', old: 'tel:0845550110' }
  ])
  const [apply] = plugin.applied
  assert.equal(apply.request_id, 'replace-test-1')
  assert.equal(apply.expected_revision, 3)
  assert.deepEqual(
    apply.rules.map((/** @type {any} */ r) => [r.kind, r.name ?? null, r.old, r.new, r.expected_matches]),
    [
      ['text', null, '(084) 555-0110', '(028) 5555 0134', 1],
      ['attribute', 'href', 'tel:0845550110', 'tel:02855550134', 1]
    ]
  )
  assert.equal(out.changed.length, 1)
  assert.equal(out.companions.length, 1)
  assert.ok(out.notes.some((/** @type {string} */ x) => x.startsWith('shown on /contact-us/')))
})

test('a link target the theme prints is replaced with href:true', async () => {
  const { out, plugin } = await run({
    changes: [{ find: 'http://joomlart.com', replace: 'https://diner.example/', href: true }]
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied[0].rules.map((/** @type {any} */ r) => [r.kind, r.name, r.old, r.new]),
    [['attribute', 'href', 'http://joomlart.com', 'https://diner.example/']]
  )
})

test('words and a link of the same pattern go in one batch', async () => {
  const { out, plugin } = await run({
    changes: [
      { find: '1600 Amphitheatre Parkway, Mountain View 5692', replace: '12 Nguyen Hue, District 1' },
      { find: 'http://joomlart.com', replace: '/about/', href: true }
    ]
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(plugin.applied.length, 1)
  assert.equal(plugin.applied[0].rules.length, 2)
})

test('an older plugin says so, in render-time words, never the Site Editor', async () => {
  const plugin = renderedPlugin({ info: { ok: true, component: '0.17.0' } })
  const { out, site, rendered } = await run(
    { find: '(084) 555-0110', replace: '(028) 5555 0134' },
    { plugin }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.next, RENDERED_TEXT.olderNext)
  assert.doesNotMatch(out.next, NOT_THEIRS)
  assert.deepEqual(rendered, [])
  assert.deepEqual(site.writes(), [])
})

test('an older plugin answers a link change as not supported here, nothing written', async () => {
  const plugin = renderedPlugin({ info: { ok: false, error: 'bad_action' } })
  const { out, rendered } = await run(
    { changes: [{ find: 'http://joomlart.com', replace: 'https://diner.example/', href: true }] },
    { plugin }
  )
  assert.equal(out.code, 'NOT_SUPPORTED_HERE', JSON.stringify(out))
  assert.doesNotMatch(out.next, NOT_THEIRS)
  assert.deepEqual(rendered, [])
})

/** The Apply door's answer when the call went out under a viewer's cookie, not the agent's actor. */
const AGENT_ONLY = { ok: false, code: 'ACTION_AGENT_ONLY', action: 'content.renderedWords' }
const agentOnlyDoor = (/** @type {string} */ a) => (a === 'content.renderedWords' ? AGENT_ONLY : undefined)

test('the Apply door refusing a cookie relay keeps the words: the store search answer, nothing written', async () => {
  const { out, site, plugin, rendered } = await run(
    { find: '(084) 555-0110', replace: '(028) 5555 0134' },
    { script: agentOnlyDoor }
  )
  assert.equal(out.ok, false, JSON.stringify(out))
  assert.notEqual(out.code, 'ACTION_AGENT_ONLY', 'the door code is never the answer')
  assert.doesNotMatch(out.next, NOT_THEIRS)
  assert.deepEqual(rendered.length, 1, 'one inspect, refused; no apply')
  assert.deepEqual(plugin.applied, [])
  assert.deepEqual(site.writes(), [])
})

test('the Apply door refusing a cookie relay answers a link change as not supported here', async () => {
  const { out, plugin } = await run(
    { changes: [{ find: 'http://joomlart.com', replace: 'https://diner.example/', href: true }] },
    { script: agentOnlyDoor }
  )
  assert.equal(out.code, 'NOT_SUPPORTED_HERE', JSON.stringify(out))
  assert.deepEqual(plugin.applied, [])
})

test('words a record holds go the record road and never this one', async () => {
  const { out, site, rendered } = await run({ find: 'Keep this short line.', replace: 'Keep this line.' })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(rendered, [])
  assert.equal(site.writes().length, 1)
})

test('a call mixing record words and theme-printed words is refused whole', async () => {
  const { out, site, rendered } = await run({
    changes: [
      { find: 'Keep this short line.', replace: 'Keep this line.' },
      { find: '(084) 555-0110', replace: '(028) 5555 0134' }
    ]
  })
  assert.equal(out.code, 'BAD_PARAMS', JSON.stringify(out))
  assert.equal(out.rule, 'mixed-stores')
  assert.match(out.next, /\(084\) 555-0110/)
  assert.deepEqual(rendered, [])
  assert.deepEqual(site.writes(), [])
})

test('a link a record holds is not changed by href:true', async () => {
  const page = html().replace(
    '<p>Keep this short line.</p>',
    '<p>Keep this <a href="/menu/">short</a> line.</p>'
  )
  const { out, rendered } = await run(
    { changes: [{ find: '/menu/', replace: '/our-menu/', href: true }] },
    {
      page,
      script: (/** @type {string} */ a, /** @type {any} */ p) =>
        a === 'content.get' && p.kind === 'post' && p.id === 905
          ? {
              ok: true,
              kind: 'post',
              id: 905,
              item: {
                ...PAGE,
                post_content:
                  '<!-- wp:paragraph -->\n<p>Keep this <a href="/menu/">short</a> line.</p>\n<!-- /wp:paragraph -->'
              }
            }
          : undefined
    }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.match(out.error, /is a link kept in/)
  assert.deepEqual(rendered, [])
})

test('a read that fails is the answer: the rendered road is not a way around it', async () => {
  const { out, rendered } = await run(
    { find: '(084) 555-0110', replace: '(028) 5555 0134' },
    {
      script: (/** @type {string} */ a) =>
        a === 'content.list' || a === 'content.get'
          ? { ok: false, code: 'COWORK_WEB_UNREACHABLE', error: 'down' }
          : undefined
    }
  )
  assert.notEqual(out.ok, true)
  assert.deepEqual(rendered, [])
})

test('a dryRun inspects and counts, and writes nothing', async () => {
  const { out, plugin, rendered } = await run({
    find: '(084) 555-0110',
    replace: '(028) 5555 0134',
    dryRun: true
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.dryRun, true)
  assert.equal(out.count, 1)
  assert.deepEqual(
    rendered.map((p) => p.operation),
    ['inspect']
  )
  assert.deepEqual(plugin.applied, [])
})

test('words printed twice need all:"page"; then both places change in one apply', async () => {
  const twice = html(`${PATTERN}<p>1600 Amphitheatre Parkway, Mountain View 5692</p>`)
  const plugin = renderedPlugin({ page: twice })
  const params = { find: '1600 Amphitheatre Parkway, Mountain View 5692', replace: '12 Nguyen Hue' }
  const first = await run(params, { page: twice, plugin })
  assert.equal(first.out.code, 'AMBIGUOUS', JSON.stringify(first.out))
  assert.deepEqual(plugin.applied, [])
  const second = await run({ ...params, all: 'page' }, { page: twice, plugin })
  assert.equal(second.out.ok, true, JSON.stringify(second.out))
  // Two places of the page, each its own anchor (the plugin's tag path), in one apply.
  assert.deepEqual(
    plugin.applied[0].rules.map((/** @type {any} */ r) => r.expected_matches),
    [1, 1]
  )
})

test('a page that moved between inspect and apply is read once more, then written', async () => {
  const plugin = renderedPlugin({ stale: 1 })
  const { out, rendered } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' }, { plugin })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    rendered.map((p) => p.operation),
    ['inspect', 'apply', 'inspect', 'apply']
  )
})

test('words removed are refused: the plugin replaces, never removes', async () => {
  const { out, rendered } = await run({ find: '1600 Amphitheatre Parkway, Mountain View 5692', replace: '' })
  assert.equal(out.code, 'VALUE_NOT_ALLOWED', JSON.stringify(out))
  assert.deepEqual(rendered, [])
})

test('the plugin says what it can do; a link target is one a page can carry', () => {
  assert.deepEqual(renderedSupport(INFO), { href: true, maxRules: 16 })
  assert.equal(renderedSupport({ ok: true, component: '0.17.0' }), null)
  assert.equal(
    renderedSupport({ ok: true, rendered_words: { operations: ['status'], targets: ['text'] } }),
    null
  )
  for (const ok of ['https://diner.example/', 'tel:+842855550134', 'mailto:a@b.example', '/about/', '#map'])
    assert.equal(linkTargetOk(ok), true, ok)
  for (const bad of ['javascript:alert(1)', 'http://', '//evil.example', 'ftp://x.example', 'a b'])
    assert.equal(linkTargetOk(bad), false, bad)
})

test('every sentence of this road fits its budget and sends nobody to the theme', () => {
  const long = 'x'.repeat(200)
  const facts = { find: long, replace: long, what: long, path: `/${long}`, why: long, n: 64, max: 16 }
  for (const key of /** @type {(keyof typeof RENDERED_TEXT)[]} */ (Object.keys(RENDERED_TEXT))) {
    const text = renderedText(key, facts)
    const budget = key.endsWith('Next') ? 200 : 160
    assert.ok(text.length <= budget, `${key}: ${text.length}`)
    assert.doesNotMatch(text, NOT_THEIRS, key)
  }
  assert.ok(WP_REPLACE_NEXT.untracedNext.length <= 200)
  assert.doesNotMatch(WP_REPLACE_NEXT.untracedNext, NOT_THEIRS)
})

test('a following tel: link a record holds stays: no rule over the record, and the answer says so', async () => {
  // The header part keeps the same `tel:` link the pattern prints, under other words.
  const header = component({ posts: [] }).partOf('header')
  const page = html().replace(/tel:\+78005506789/g, 'tel:0845550110')
  const plugin = renderedPlugin({ page })
  const { out, site } = await run(
    { find: '(084) 555-0110', replace: '(028) 5555 0134' },
    {
      plugin,
      page,
      posts: [
        { ...header, post_content: header.post_content.replace(/tel:\+78005506789/g, 'tel:0845550110') }
      ]
    }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const rules = plugin.applied.flatMap((a) => a.rules)
  assert.deepEqual(
    rules.map((r) => r.kind),
    ['text'],
    'only the words: the link a record holds is no rule'
  )
  assert.ok(JSON.stringify(out).includes('the tel:0845550110 link stays: it is kept in'), JSON.stringify(out))
  assert.deepEqual(site.writes(), [])
})

test('a following link printed away from the words stays as it is', async () => {
  // No record holds this header link (the fixture part keeps another number), but the page prints it
  // in the header: the change's link is the pattern's alone.
  const page = html().replace(
    '<header class="tracy-header wp-block-template-part">',
    '<header class="tracy-header wp-block-template-part"><a href="tel:0845550110">Hotline</a>'
  )
  const plugin = renderedPlugin({
    page: page.replace('<a href="tel:0845550110">(084)', '<a href="tel:+1">(084)')
  })
  const { out } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' }, { plugin, page })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied.flatMap((a) => a.rules).map((r) => r.kind),
    ['text']
  )
  assert.ok(JSON.stringify(out).includes('the tel:0845550110 link stays: the page prints it away'))
})

test('a following link in another element than the words stays, even in main', async () => {
  // The number is in one paragraph; the same tel: link sits under other words in another one.
  const page = html(
    '<div class="ja-contact-info"><p>Call (084) 555-0110</p>' +
      '<p><a href="tel:0845550110">Emergency service</a></p></div>'
  )
  const plugin = renderedPlugin({ page })
  const { out } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' }, { plugin, page })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied.flatMap((a) => a.rules).map((r) => r.kind),
    ['text']
  )
  assert.ok(JSON.stringify(out).includes(renderedText('linkAwayNote', { href: 'tel:0845550110' })))
})

test('a following link right beside the words in the same element follows them', async () => {
  const page = html(
    '<div class="ja-contact-info"><p>Call (084) 555-0110 <a href="tel:0845550110">now</a></p></div>'
  )
  const plugin = renderedPlugin({ page })
  const { out } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' }, { plugin, page })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied.flatMap((a) => a.rules).map((r) => [r.kind, r.old, r.new]),
    [
      ['text', '(084) 555-0110', '(028) 5555 0134'],
      ['attribute', 'tel:0845550110', 'tel:02855550134']
    ]
  )
})

test('a following link past an <hr> stays, even in the same block', async () => {
  const page = html(
    '<div class="ja-contact-info"><p>Call (084) 555-0110</p><hr><a href="tel:0845550110">Emergency service</a></div>'
  )
  const plugin = renderedPlugin({ page })
  const { out } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' }, { plugin, page })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied.flatMap((a) => a.rules).map((r) => r.kind),
    ['text']
  )
  assert.ok(JSON.stringify(out).includes(renderedText('linkAwayNote', { href: 'tel:0845550110' })))
})

test('a following link in the sibling inline element right after the words follows them', async () => {
  const page = html(
    '<div class="ja-contact-info"><p><span>(084) 555-0110</span><span><a href="tel:0845550110">Call</a></span></p></div>'
  )
  const plugin = renderedPlugin({ page })
  const { out } = await run({ find: '(084) 555-0110', replace: '(028) 5555 0134' }, { plugin, page })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied.flatMap((a) => a.rules).map((r) => [r.kind, r.old, r.new]),
    [
      ['text', '(084) 555-0110', '(028) 5555 0134'],
      ['attribute', 'tel:0845550110', 'tel:02855550134']
    ]
  )
})

test('beside means only whitespace and inline elements between, in one block', () => {
  const beside = (/** @type {string} */ page) =>
    linkBesideWords(scanPlaces(page) ?? [], 'tel:0845550110', ['0845550110'])
  const tel = (/** @type {string} */ inner) => `<a href="tel:0845550110">${inner}</a>`
  // Review inputs (24/10/2026).
  assert.equal(beside(`<div><p>Call 0845550110</p><hr>${tel('Emergency service')}</div>`), false)
  assert.equal(beside(`<p><span>0845550110</span><span>${tel('Call')}</span></p>`), true)
  // Wrapped, or whitespace and inline elements alone between, before or after.
  assert.equal(beside(`<p>Call ${tel('0845550110')}</p>`), true)
  assert.equal(beside(`<p>Call <strong>0845550110</strong> <em>${tel('now')}</em></p>`), true)
  assert.equal(beside(`<p>${tel('Call')} <small>0845550110</small></p>`), true)
  // A separator, a block, other words, or another paragraph between.
  assert.equal(beside(`<p>0845550110<br>${tel('Call')}</p>`), false)
  assert.equal(beside(`<div>0845550110<div>${tel('Call')}</div></div>`), false)
  assert.equal(beside(`<p>0845550110, or our office: ${tel('Call')}</p>`), false)
  assert.equal(beside(`<p>${tel('Call')}</p><p>0845550110</p>`), false)
  // Every place the link is printed must be beside the words.
  assert.equal(beside(`<p>0845550110 ${tel('Call')}</p><p>${tel('Hotline')}</p>`), false)
})

test('href:true keeps to where: a header link is refused under where:"main", nothing written', async () => {
  const header = '<header class="tracy-header wp-block-template-part">'
  const page = html().replace(header, `${header}<a href="/theme-link/">Visit</a>`)
  const plugin = renderedPlugin({ page })
  const { out, rendered } = await run(
    { where: 'main', changes: [{ find: '/theme-link/', replace: '/new-link/', href: true }] },
    { plugin, page }
  )
  assert.equal(out.code, 'NOT_FOUND', JSON.stringify(out))
  assert.deepEqual(out.seenIn, ['header'])
  assert.deepEqual(plugin.applied, [])
  assert.ok(rendered.every((p) => p.operation !== 'apply'))
})

test('href:true under where:"main" writes a link the page prints in main', async () => {
  const { out, plugin } = await run({
    where: 'main',
    changes: [{ find: 'http://joomlart.com', replace: 'https://diner.example/', href: true }]
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    plugin.applied[0].rules.map((/** @type {any} */ r) => [r.kind, r.old, r.new]),
    [['attribute', 'http://joomlart.com', 'https://diner.example/']]
  )
})

test('words the plugin finds in another place than the page read showed are refused, nothing written', async () => {
  // The page this call read prints the words in main; the plugin's render puts them in the header.
  const header = '<header class="tracy-header wp-block-template-part">'
  const pluginPage = html('').replace(header, `${header}${PATTERN}`)
  const plugin = renderedPlugin({ page: pluginPage })
  const { out, site } = await run({ find: '1600 Amphitheatre Parkway', replace: '12 Le Loi' }, { plugin })
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.error, renderedText('placeError', { find: '1600 Amphitheatre Parkway' }))
  assert.deepEqual(plugin.applied, [])
  assert.deepEqual(site.writes(), [])
})

test('words the plugin finds in one more place than the page read showed are refused', async () => {
  const header = '<header class="tracy-header wp-block-template-part">'
  const plugin = renderedPlugin({ page: html().replace(header, `${header}<p>1600 Amphitheatre Parkway</p>`) })
  const { out } = await run(
    { find: '1600 Amphitheatre Parkway', replace: '12 Le Loi', all: 'page' },
    { plugin }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.deepEqual(plugin.applied, [])
})

test('an older plugin never repeats the search reason that sends the agent to theme files or wp-cli', async () => {
  // A page the store search calls the theme's template file (`WHY.themeFile`): the same words, an
  // older plugin, and every sentence of the answer in render-time words.
  const page = html(`<div class="wp-block-template-part">${PATTERN}</div>`)
  for (const info of [
    { ok: true, component: '0.17.0' },
    { ok: false, error: 'bad_action' }
  ]) {
    const plugin = renderedPlugin({ info, page })
    const { out } = await run({ find: '1600 Amphitheatre Parkway', replace: '12 Le Loi' }, { plugin, page })
    assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
    assert.doesNotMatch(JSON.stringify(out), NOT_THEIRS)
    assert.equal(out.next, RENDERED_TEXT.olderNext)
  }
})

test('an inspect the plugin does not take is answered in render-time words too', async () => {
  const page = html(`<div class="wp-block-template-part">${PATTERN}</div>`)
  const plugin = renderedPlugin({ page })
  const { out } = await run(
    { find: '1600 Amphitheatre Parkway', replace: '12 Le Loi' },
    {
      plugin,
      page,
      script: (/** @type {string} */ a, /** @type {any} */ p) =>
        a === 'content.renderedWords' && p.operation === 'inspect'
          ? { ok: false, error: 'unsupported', message: 'this page is not taken' }
          : undefined
    }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.doesNotMatch(JSON.stringify(out), NOT_THEIRS)
})

// ── Which gate closed the road (wp-ja-restaurant 1.0.1 `/blog/`, 24/10/2026) ────────────────────

/**
 * The lunch banner JA Restaurant's PHP prints under the blog sidebar (`inc/groups/blog.php`, pattern
 * `blog-banner`): beside the list, inside the page template's `<main>`, held by no record.
 */
const SIDEBAR =
  '<div class="t3-sidebar t3-sidebar-right"><div class="banner-bonus"><p class="price">Only $5.99</p>' +
  '<ul class="wp-block-list"><li>Soup or salad of the day</li><li>Monday to Friday, 11 am - 2 pm</li></ul>' +
  '<p class="actions"><a class="btn btn-primary" href="/contact/phone-reservation/">Book a Table</a></p></div></div>'
const SIDEBAR_CHANGES = [
  { find: 'Soup or salad of the day', replace: 'Chef soup of the day' },
  { find: 'Monday to Friday, 11 am - 2 pm', replace: 'Weekdays, 11 am - 3 pm' }
]

test('all:true on words the theme prints on this page names its gate and all:"page", nothing written', async () => {
  const page = html(SIDEBAR)
  const plugin = renderedPlugin({ page })
  const { out, site, rendered } = await run({ all: true, changes: SIDEBAR_CHANGES }, { plugin, page })
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.next, renderedText('allNext', { path: '/contact-us/' }))
  assert.notEqual(out.next, RENDERED_TEXT.stayNext)
  assert.equal(out.error, renderedText('stayError', { find: 'Soup or salad of the day' }))
  assert.doesNotMatch(JSON.stringify(out), NOT_THEIRS)
  assert.deepEqual(rendered, [], 'the road is not taken under all:true')
  assert.deepEqual(site.writes(), [])
})

test('the same sidebar words with all:"page" change through the rendered-words road, one apply', async () => {
  const page = html(SIDEBAR)
  const plugin = renderedPlugin({ page })
  const { out, site } = await run({ all: 'page', changes: SIDEBAR_CHANGES }, { plugin, page })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(site.writes(), [])
  assert.deepEqual(
    plugin.applied[0].rules.map((/** @type {any} */ r) => [r.old, r.new]),
    SIDEBAR_CHANGES.map((c) => [c.find, c.replace])
  )
})

test('all:true on an older plugin says the plugin is older, never sends the call round with all:"page"', async () => {
  const page = html(SIDEBAR)
  const plugin = renderedPlugin({ page, info: { ok: true, component: '0.17.0' } })
  const { out } = await run({ all: true, changes: SIDEBAR_CHANGES }, { plugin, page })
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.next, RENDERED_TEXT.olderNext)
})

test('all:true on words a record holds elsewhere and the theme prints here is refused as mixed', async () => {
  const page = html(SIDEBAR)
  const { out } = await run(
    {
      all: true,
      changes: [{ find: 'Keep this short line', replace: 'Keep it short' }, SIDEBAR_CHANGES[0]]
    },
    { page }
  )
  assert.equal(out.code, 'BAD_PARAMS', JSON.stringify(out))
  assert.equal(out.rule, 'mixed-stores')
})

test('at on words the theme prints keeps the core answer that names at, never the generic sentence', async () => {
  const page = html(SIDEBAR)
  const { out, rendered } = await run({ at: ['post:905'], changes: [SIDEBAR_CHANGES[0]] }, { page })
  assert.match(out.next, /without at/, JSON.stringify(out))
  assert.notEqual(out.next, RENDERED_TEXT.stayNext)
  assert.deepEqual(rendered, [])
})

test('words the theme prints outside the main region say so, never the generic sentence', async () => {
  const header = '<header class="tracy-header wp-block-template-part">'
  const page = html('').replace(header, `${header}<p>Open late on Fridays</p>`)
  const { out, rendered } = await run({ find: 'Open late on Fridays', replace: 'Open late' }, { page })
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.next, renderedText('outsideNext', { path: '/contact-us/' }))
  assert.doesNotMatch(JSON.stringify(out), NOT_THEIRS)
  assert.deepEqual(rendered, [])
})

test('a page the plugin scanner cannot read names that gate', async () => {
  // An unclosed comment after </html>: the page units still read, the plugin's scanner gives up.
  const page = `${html(SIDEBAR)}<!-- open`
  const { out } = await run({ changes: [SIDEBAR_CHANGES[0]] }, { page })
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.next, renderedText('unscannedNext', { path: '/contact-us/' }))
})

test('an inspect refused for a viewer names that gate', async () => {
  const page = html(SIDEBAR)
  const { out } = await run(
    { changes: [SIDEBAR_CHANGES[0]] },
    {
      page,
      script: (/** @type {string} */ a, /** @type {any} */ p) =>
        a === 'content.renderedWords' && p.operation === 'inspect'
          ? { ok: false, error: 'ACTION_AGENT_ONLY', message: 'agent only' }
          : undefined
    }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.next, RENDERED_TEXT.viewerNext)
})

test('an href change refused for its shape shows a concrete link change: find is the old target', () => {
  const example = '{find:"/old-target/", replace:"/new-target/", href:true}'
  // The two calls that came back BAD_PARAMS on wp-ja-restaurant before the model read the rule.
  for (const change of [
    { find: 'Book a Table', replace: '/contact/contact-us/', href: '/contact/contact-us/' },
    { find: 'BOOK A TABLE', replace: '/contact/contact-us/', href: true }
  ]) {
    const out = /** @type {any} */ (planReplace({ path: '/blog/', changes: [change] }))
    assert.equal(out.code, 'BAD_PARAMS', JSON.stringify(out))
    assert.ok(out.next.includes(example), out.next)
    assert.ok(out.next.length <= 200, out.next)
    assert.ok(out.error.length <= 160, out.error)
  }
  const out = /** @type {any} */ (
    planReplace({ path: '/blog/', changes: [{ find: 'BOOK A TABLE', replace: '/x/', href: true }] })
  )
  assert.match(out.error, /old target, not its words/)
})

/** The same page on a theme `WP_THEME_STORES` knows (wp-tracy-business 1.1.0): its reason is `WHY.theme`. */
const knownTheme = (/** @type {string} */ page) => page.replace(/wp-ja-diner/g, 'wp-tracy-business')

test('on a known theme, words the theme prints in the header name the outside gate too', async () => {
  const header = '<header class="tracy-header wp-block-template-part">'
  const page = knownTheme(html('').replace(header, `${header}<p>Open late on Fridays</p>`))
  const { out, rendered } = await run({ find: 'Open late on Fridays', replace: 'Open late' }, { page })
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.unchanged[0].why, 'words the theme prints, which no door here changes')
  assert.equal(out.next, renderedText('outsideNext', { path: '/contact-us/' }))
  assert.deepEqual(rendered, [])
})

test('on a known theme, a page with no record of its own names that gate', async () => {
  const page = PAGES['/news/'].replace('</main>', '<p>Fresh notes every week</p></main>')
  const { out, rendered } = await run(
    { find: 'Fresh notes every week', replace: 'New notes weekly', path: '/news/' },
    { page }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(out.unchanged[0].why, 'words the theme prints, which no door here changes')
  assert.equal(out.next, renderedText('noRecordNext', { path: '/news/' }))
  assert.deepEqual(rendered, [])
})

test('a reason with a road of its own keeps its next: the theme file on a page with no record', async () => {
  const { out } = await run(
    { find: 'Get our industry brief every two weeks', replace: 'x y', path: '/news/' },
    { page: PAGES['/news/'] }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.match(out.error, /theme's template file/)
  assert.notEqual(out.next, renderedText('noRecordNext', { path: '/news/' }))
  assert.match(out.next, /that is an answer/)
})

test('a whole-output capable plugin receives the visible edit with its proven raw rule identity', async () => {
  const visible = 'For enquiries, telephone our bakery.'
  const page = html(`<div class="ja-contact-info"><p>${visible}</p></div>`)
  const plugin = renderedPlugin({ page })
  const rule = '0123456789abcdef'
  const { out, rendered } = await run(
    { find: visible, replace: 'Contact the bakery using this form.' },
    {
      plugin,
      page,
      script(action, params) {
        if (action === 'info')
          return { ...INFO, rendered_words: { ...INFO.rendered_words, composition: ['whole-output'] } }
        if (action === 'content.renderedWords' && params.operation === 'inspect') {
          const seen = plugin.script(action, params)
          return {
            ...seen,
            targets: seen.targets.map((t) => ({
              ...t,
              candidates: t.candidates.map((c) => ({ ...c, replaces_rule: rule }))
            }))
          }
        }
      }
    }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(rendered[0].composition, 'whole-output')
  assert.deepEqual(
    rendered[1].rules.map((r) => [r.old, r.new, r.replaces_rule]),
    [[visible, 'Contact the bakery using this form.', rule]]
  )
  assert.equal(out.changed[0].before.includes(visible), true)
})

for (const capable of [false, true]) {
  test(`unproven composition candidates never dispatch a write (capability ${capable})`, async () => {
    const plugin = renderedPlugin()
    const { out } = await run(
      { find: '(084) 555-0110', replace: '(028) 3822 1234' },
      {
        plugin,
        script(action, params) {
          if (action === 'info' && capable)
            return { ...INFO, rendered_words: { ...INFO.rendered_words, composition: ['whole-output'] } }
          if (action === 'content.renderedWords' && params.operation === 'inspect') {
            const seen = plugin.script(action, params)
            return {
              ...seen,
              targets: seen.targets.map((t) => ({
                ...t,
                candidates: t.candidates.map((c) => ({
                  ...c,
                  replaces_rule: capable ? '../bad-rule' : '0123456789abcdef'
                }))
              }))
            }
          }
        }
      }
    )
    assert.equal(out.ok, false)
    assert.equal(out.code, 'READ_FAILED')
    assert.equal(plugin.applied.length, 0)
  })
}

for (const coverage of [
  'full',
  'partial',
  'wrong-anchor',
  'wrong-kind',
  'duplicate',
  'missing',
  'empty',
  'dropped-companion'
]) {
  test(`theme recovery requires every old raw rule to be superseded: ${coverage}`, async () => {
    const plugin = renderedPlugin()
    const oldRules = [
      { kind: 'text', old: '(084) 555-0110', new: 'Old inactive phone' },
      { kind: 'attribute', name: 'href', old: 'tel:0845550110', new: 'tel:111' }
    ].map((r) => {
      const [[anchor, { count }]] = placesOfTarget(scanPlaces(html()), r)
      const rule = { ...r, anchor, expected_matches: count }
      return {
        ...rule,
        id: createHash('sha256')
          .update([r.kind, r.name ?? '', anchor, r.old].join('\0'))
          .digest('hex')
          .slice(0, 16)
      }
    })
    if (coverage === 'partial')
      oldRules.push({ ...oldRules[0], old: 'An unrelated earlier edit', id: '0123456789abcdef' })
    if (coverage === 'wrong-anchor') oldRules[0].anchor = '0123456789abcdef'
    if (coverage === 'wrong-kind') oldRules[0].kind = 'attribute'
    if (coverage === 'duplicate') oldRules.push({ ...oldRules[0] })
    for (const r of oldRules)
      r.id = createHash('sha256')
        .update([r.kind, r.name ?? '', r.anchor, r.old].join('\0'))
        .digest('hex')
        .slice(0, 16)
    const success = coverage === 'full' || coverage === 'empty'
    const { out, rendered } = await run(
      { find: '(084) 555-0110', replace: '(028) 3822 1234' },
      {
        plugin,
        script(action, params) {
          if (action === 'info')
            return { ...INFO, rendered_words: { ...INFO.rendered_words, composition: ['whole-output'] } }
          if (action === 'content.renderedWords' && params.operation === 'inspect') {
            if (params.composition)
              return {
                ok: false,
                error: 'conflict',
                message: 'The active theme changed since the rules were written'
              }
            const inspected = plugin.script(action, params)
            if (coverage === 'missing') {
              delete inspected.rules
              return inspected
            }
            if (coverage === 'dropped-companion')
              inspected.targets = inspected.targets.map((t) =>
                t.kind === 'attribute' ? { ...t, candidates: [] } : t
              )
            return { ...inspected, rules: coverage === 'empty' ? [] : oldRules }
          }
        }
      }
    )
    assert.equal(rendered[0].composition, 'whole-output')
    assert.equal(rendered[1].composition, undefined)
    assert.equal(out.ok, success, JSON.stringify(out))
    assert.equal(plugin.applied.length, success ? 1 : 0)
    if (!success) assert.equal(out.code, 'STORE_CHANGED')
    else {
      assert.equal(plugin.applied[0].proof, 'proof-3')
      assert.deepEqual(
        plugin.applied[0].rules.map((r) => r.new),
        ['(028) 3822 1234', 'tel:02838221234']
      )
      assert.ok(out.notes.some((n) => n.includes('current theme')))
    }
  })
}

test('an ordinary inspect conflict does not trigger raw recovery or claim a failed read', async () => {
  const { out, rendered, plugin } = await run(
    { find: '(084) 555-0110', replace: 'New number' },
    {
      script(action) {
        if (action === 'content.renderedWords')
          return { ok: false, error: 'conflict', message: 'Another revision changed' }
      }
    }
  )
  assert.equal(out.code, 'STORE_CHANGED')
  assert.equal(rendered.length, 1)
  assert.equal(plugin.applied.length, 0)
})
