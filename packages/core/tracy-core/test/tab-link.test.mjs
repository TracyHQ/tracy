#!/usr/bin/env node
/**
 * The address of a side-card tab — `src/tab-link/index.ts`.
 *
 *   node --test packages/core/tracy-core/test/tab-link.test.mjs
 *
 * Three pure functions carry the deep link (tasks/todo-deeplink-tab.md): what a `?tab=` in the
 * address means, how the address is rewritten to mirror the active tab without touching the
 * other parameters or the hash, and how a shareable link is built with the session LAST so a
 * person can cut it off. The rest read dsh's native right column (better-sidebar 0.21.1 opens every
 * Tracy tab there): which tab is in sight, which one an open landed on, and how a press reaches it.
 *
 * Node strips the types on import; nothing here needs a build.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  activeTracyTab,
  buildTabLink,
  columnView,
  currentTabType,
  focusUnasked,
  isNarrowFrame,
  intentFromCookie,
  landedTabId,
  mirroredPath,
  openTabWithMeta,
  openUnasked,
  parseTabLink,
  RETIRED_TABS,
  replaceRetiredTab,
  revealTab,
  sidebarRightOf,
  tabIdOf,
  withTabParams
} from '../src/tab-link/index.ts'
import { onboardingBuildUrl } from '../../../design/tracy-design-inspiration/src/client/dsh-url.ts'

test('parseTabLink reads type, site and session', () => {
  assert.deepEqual(parseTabLink('?tab=tracy:brand&site=a.example&s=session-abc-1'), {
    type: 'tracy:brand',
    siteKey: 'a.example',
    sessionId: 'session-abc-1'
  })
  assert.deepEqual(parseTabLink('?tab=tracy%3Abrand&site=a.example'), {
    type: 'tracy:brand',
    siteKey: 'a.example'
  })
  assert.deepEqual(parseTabLink('?tab=tracy:my-sites'), { type: 'tracy:my-sites' })
})

test('parseTabLink refuses anything that is not a Tracy tab type, and drops a bad site or session', () => {
  assert.equal(parseTabLink(''), null)
  assert.equal(parseTabLink('?site=a.example'), null)
  assert.equal(parseTabLink('?tab=editor'), null)
  assert.equal(parseTabLink('?tab=tracy:Brand'), null)
  // Three segments is a per-CMS type (`tracy:build:joomla`); four is not, nor a dotted third (a site).
  assert.equal(parseTabLink('?tab=tracy:brand:extra:more'), null)
  assert.equal(parseTabLink('?tab=tracy:build:granite.localhost'), null)
  assert.deepEqual(parseTabLink('?tab=tracy:brand&site=not%20a%20host'), { type: 'tracy:brand' })
  assert.deepEqual(parseTabLink('?tab=tracy:brand&s=../x'), { type: 'tracy:brand' })
})

test('withTabParams sets tab and site, keeps the other parameters, and never carries s', () => {
  assert.equal(
    withTabParams('', { type: 'tracy:brand', siteKey: 'a.example' }),
    '?tab=tracy:brand&site=a.example'
  )
  assert.equal(withTabParams('?x=1', { type: 'tracy:my-sites' }), '?x=1&tab=tracy:my-sites')
  assert.equal(
    withTabParams('?tab=tracy:team&site=old.example&x=1&s=session-1', {
      type: 'tracy:brand',
      siteKey: 'a.example'
    }),
    '?x=1&tab=tracy:brand&site=a.example'
  )
})

test('withTabParams with null strips tab, site and s and returns an empty string when nothing is left', () => {
  assert.equal(withTabParams('?tab=tracy:brand&site=a.example&s=session-1', null), '')
  assert.equal(withTabParams('?x=1&tab=tracy:brand', null), '?x=1')
  assert.equal(withTabParams('', null), '')
})

test('buildTabLink puts the session last, on the page base', () => {
  assert.equal(
    buildTabLink(
      'https://lane.example/a.example/',
      { type: 'tracy:brand', siteKey: 'a.example' },
      'session-1'
    ),
    'https://lane.example/a.example/?tab=tracy:brand&site=a.example&s=session-1'
  )
  assert.equal(
    buildTabLink('https://lane.example/', { type: 'tracy:my-sites' }, null),
    'https://lane.example/?tab=tracy:my-sites'
  )
})

test('tabIdOf joins type and site the way every Tracy tab is opened', () => {
  assert.equal(tabIdOf('tracy:brand', 'a.example'), 'tracy:brand:a.example')
  assert.equal(tabIdOf('tracy:my-sites'), 'tracy:my-sites')
})

/** A right column the way `columnView` reads it: open or not, the active tab, and its records. */
const column = (over = {}) => ({
  expanded: true,
  active: { id: 'tab-3', kind: 'tracy:brand' },
  tabs: [
    { id: 'tab-1', type: 'tracy:brand', meta: { siteKey: 'b.example' } },
    { id: 'tab-3', type: 'tracy:brand', meta: { siteKey: 'a.example' } }
  ],
  ...over
})

test('activeTracyTab reads the active tab and the site its record holds', () => {
  assert.deepEqual(activeTracyTab(column()), { id: 'tab-3', type: 'tracy:brand', siteKey: 'a.example' })
  assert.deepEqual(activeTracyTab(column({ active: { id: 'tab-9', kind: 'editor' } })), null)
  assert.deepEqual(activeTracyTab(column({ expanded: false })), null)
  assert.deepEqual(activeTracyTab(column({ active: undefined })), null)
  assert.deepEqual(activeTracyTab(null), null)
})

test('activeTracyTab: a tab whose record is not mounted yet is in sight without a site', () => {
  assert.deepEqual(activeTracyTab(column({ active: { id: 'tab-7', kind: 'tracy:my-sites' }, tabs: [] })), {
    id: 'tab-7',
    type: 'tracy:my-sites'
  })
})

test('columnView reads both services once, and a host that throws reads as nothing', () => {
  const right = {
    active: () => ({ id: 'tab-3', kind: 'tracy:brand', title: 'Brand' }),
    isExpanded: () => true,
    toggleExpanded() {},
    focus() {}
  }
  const asked = []
  const sidebar = {
    openTabsOf: (type) => {
      asked.push(type)
      return [{ id: 'tab-3', type, meta: { siteKey: 'a.example' } }]
    }
  }
  assert.deepEqual(columnView(right, sidebar), {
    expanded: true,
    active: { id: 'tab-3', kind: 'tracy:brand' },
    tabs: [{ id: 'tab-3', type: 'tracy:brand', meta: { siteKey: 'a.example' } }]
  })
  assert.deepEqual(asked, ['tracy:brand'])
  assert.equal(columnView(undefined, sidebar), null)
  const broken = {
    ...right,
    active: () => {
      throw new Error('no seat')
    }
  }
  assert.equal(columnView(broken, sidebar), null)
})

test('sidebarRightOf takes the service only when it has the face Tracy calls', () => {
  const right = { active() {}, isExpanded() {}, toggleExpanded() {}, focus() {} }
  assert.equal(sidebarRightOf({ get: (name) => (name === 'sidebarRight' ? right : undefined) }), right)
  assert.equal(sidebarRightOf({ get: () => ({ active() {} }) }), undefined)
  assert.equal(
    sidebarRightOf({
      get: () => {
        throw new Error('not injected')
      }
    }),
    undefined
  )
  assert.equal(sidebarRightOf({}), undefined)
})

test('an address may also carry what a visitor pressed on the public page', () => {
  // The public Design inspiration page sends people here with the inspiration and the CMS they
  // chose. Before 08/09 nothing read them: they rode the address all the way to the Build tab and
  // were dropped, so the tab opened knowing nothing and showed whatever build the lane had run
  // last — measured on lucaswp, a press of "Build with WordPress" landed on somebody else's
  // finished Joomla build.
  // Since 24/09 (one creation flow) the intent names the Add site wizard, which reads the CMS from
  // the platform the press carries (#392).
  const link = parseTabLink('?tab=tracy:build&site=lee.example&inspiration=airbnb&platform=wordpress')
  assert.deepEqual(link, {
    type: 'tracy:add-site',
    siteKey: 'lee.example',
    inspiration: 'airbnb',
    platform: 'wordpress'
  })
})

test('a platform nobody ships, and an inspiration that is not an id, are dropped', () => {
  // Same rule as a malformed site: the tab is still worth opening, so one bad parameter does not
  // fail the whole link — it just does not arrive.
  const link = parseTabLink('?tab=tracy:build&platform=drupal&inspiration=../etc/passwd')
  assert.deepEqual(link, { type: 'tracy:build' })
})

test('the address stops asking once the tab is open', () => {
  // Both are an INTENT, spent the moment it is acted on — not a description of the tab in sight.
  // Left in place they would re-open a build every time the address is mirrored, and a copied
  // link would start a build in the reader's own lane.
  assert.equal(
    withTabParams('?tab=tracy:build&inspiration=airbnb&platform=wordpress&keep=me', {
      type: 'tracy:build'
    }),
    '?keep=me&tab=tracy:build'
  )
})

test('a copied link carries no build intent', () => {
  assert.equal(
    buildTabLink('https://cowork.tracy.ai/', { type: 'tracy:build', siteKey: 'lee.example' }, 'session-1'),
    'https://cowork.tracy.ai/?tab=tracy:build&site=lee.example&s=session-1'
  )
})

test('buildTabLink carries what a tab put on the address, and drops the intents', () => {
  // The Design inspiration tab keeps its filter and its open preview there (`view-url.mjs`).
  assert.equal(
    buildTabLink(
      'https://cowork.tracy.ai/a.example',
      { type: 'tracy:design-inspiration', siteKey: 'a.example' },
      'session-1',
      '?cat=Community&open=clay'
    ),
    'https://cowork.tracy.ai/a.example?tab=tracy:design-inspiration&site=a.example&cat=Community&open=clay&s=session-1'
  )
  // Its own three are replaced, never doubled.
  assert.equal(
    buildTabLink(
      'https://cowork.tracy.ai/',
      { type: 'tracy:brand', siteKey: 'b.example' },
      'session-2',
      '?tab=tracy:my-sites&site=old.example&s=session-old&open=clay'
    ),
    'https://cowork.tracy.ai/?tab=tracy:brand&site=b.example&open=clay&s=session-2'
  )
  // An intent is spent on arrival: copying a link must not start a build in the reader's lane.
  assert.equal(
    buildTabLink(
      'https://cowork.tracy.ai/',
      { type: 'tracy:build' },
      null,
      '?inspiration=clay&platform=wordpress&cat=Community'
    ),
    'https://cowork.tracy.ai/?tab=tracy:build&cat=Community'
  )
})

test('an address carrying only a creation intent asks for the Add site tab by itself', () => {
  // Measured 08/09: the public page's link sets `inspiration` and `platform` and NOTHING else —
  // no `tab=`. Lee's press appeared to work only because that session already had the tab open,
  // so the mirror had written `tab=` into the address on an earlier visit. On a session without
  // it, the link asked for nothing and nothing happened.
  assert.deepEqual(parseTabLink('?inspiration=airbnb&platform=wordpress'), {
    type: 'tracy:add-site',
    inspiration: 'airbnb',
    platform: 'wordpress'
  })
  // The CMS is the wizard's pill now, not a tab of its own: every platform lands on the one wizard
  // and keeps its name, EmDash included (measured 15/09: a fallback once turned it into WordPress).
  for (const platform of ['joomla', 'emdash']) {
    assert.deepEqual(parseTabLink(`?inspiration=airbnb&platform=${platform}`), {
      type: 'tracy:add-site',
      inspiration: 'airbnb',
      platform
    })
  }
  // A platform nobody builds is dropped by PLATFORMS; the design still arrives, the pill stays.
  assert.deepEqual(parseTabLink('?inspiration=airbnb&platform=drupal'), {
    type: 'tracy:add-site',
    inspiration: 'airbnb'
  })
})

test('the address a press outside the creation workspace navigates to opens Add site (#392)', () => {
  // #392: `buildOpener` sends a press made in a SITE's workspace to `onboardingBuildUrl(…)`. When
  // tracy-web forwards that address as it stands (dsh did not answer ahead, or a `/new/s/<id>?…`
  // link), this parser is the only reader — and it opened `tracy:build:<cms>`, the retired road,
  // while the redirect and the in-workspace press both land on Add site. One press, one tab.
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const address = new URL(onboardingBuildUrl('tracy-business', platform), 'https://cowork.tracy.ai')
    assert.equal(address.pathname, '/new/')
    assert.deepEqual(parseTabLink(address.search), {
      type: 'tracy:add-site',
      inspiration: 'tracy-business',
      platform
    })
  }
  // A brand inspiration carries a colon and a dot through the encoding.
  const brand = new URL(onboardingBuildUrl('brand:acme.com', 'joomla'), 'https://cowork.tracy.ai')
  assert.equal(parseTabLink(brand.search)?.inspiration, 'brand:acme.com')
})

test('an intent names the Add site tab even when the address names another', () => {
  // A press is a request to create; it wins over a tab the address happens to be mirroring.
  assert.equal(parseTabLink('?tab=tracy:brand&inspiration=airbnb')?.type, 'tracy:add-site')
  assert.equal(
    parseTabLink('?tab=tracy:build:joomla&inspiration=airbnb&platform=joomla')?.type,
    'tracy:add-site'
  )
})

test('a Build link without an intent still opens that Build tab', () => {
  // Only a press moved. A plain `?tab=` is a link to a tab, and the Build tabs still exist.
  assert.deepEqual(parseTabLink('?tab=tracy:build:joomla&site=lee.example'), {
    type: 'tracy:build:joomla',
    siteKey: 'lee.example'
  })
})

test('a platform alone is not an intent', () => {
  // Only the inspiration says WHAT to build. A stray `platform` names no build and must not open
  // a tab on its own.
  assert.equal(parseTabLink('?platform=wordpress'), null)
})

// 20/09 (tasks/pa-dia-chi-mot-duong-cho-site.md, Part B): a create used to change the address
// eight times; two of those were this plugin cleaning `?…` in one `replaceState` while dsh wrote
// `s/<id>` into the path in another, a beat apart. When the mirror already knows the session, it
// writes both in one stroke; dsh then finds `next === current` and writes nothing.
test('mirroredPath writes the session into a bare base in the same stroke as the query', () => {
  // The first address after a load: base only, intent still on it, session known from the list.
  assert.equal(
    mirroredPath({
      pathname: '/new/',
      search: '?inspiration=apple&platform=joomla',
      base: '/new/',
      sessionId: 'session-1',
      tab: null
    }),
    '/new/s/session-1'
  )
  assert.equal(
    mirroredPath({
      pathname: '/wpdemo.localhost/',
      search: '?tab=tracy:build:joomla&site=wpdemo.localhost',
      base: '/wpdemo.localhost/',
      sessionId: 'session-2',
      tab: { type: 'tracy:build:joomla', siteKey: 'wpdemo.localhost' }
    }),
    '/wpdemo.localhost/s/session-2?tab=tracy:build:joomla&site=wpdemo.localhost'
  )
})

test("mirroredPath never rewrites a path that already names a session — that is dsh's history entry", () => {
  // A person changed session: dsh pushes `s/<new>`; the mirror only tends the query.
  assert.equal(
    mirroredPath({
      pathname: '/new/s/session-old',
      search: '?x=1&s=session-old',
      base: '/new/',
      sessionId: 'session-new',
      tab: null
    }),
    '/new/s/session-old?x=1'
  )
  // No session known yet (list pending): the path stays a bare base.
  assert.equal(
    mirroredPath({ pathname: '/new/', search: '?x=1', base: '/new/', sessionId: null, tab: null }),
    '/new/?x=1'
  )
  // A hash rides along untouched.
  assert.equal(
    mirroredPath({
      pathname: '/new/',
      search: '',
      hash: '#top',
      base: '/new/',
      sessionId: 'session-1',
      tab: null
    }),
    '/new/s/session-1#top'
  )
})

// ── The intent as a cookie: a press that enters already on its session ────────────────────────

test('intentFromCookie reads the pair tracy-web writes, URL-encoded once, among other cookies', () => {
  const written = encodeURIComponent('inspiration=stripe&platform=joomla')
  assert.deepEqual(intentFromCookie(`tracy_site=a.b; tracy_intent=${written}; other=1`), {
    inspiration: 'stripe',
    platform: 'joomla'
  })
  // A brand inspiration carries a colon and a dot; both survive the encoding.
  assert.deepEqual(
    intentFromCookie(`tracy_intent=${encodeURIComponent('inspiration=brand:acme.com&platform=wordpress')}`),
    {
      inspiration: 'brand:acme.com',
      platform: 'wordpress'
    }
  )
})

test('intentFromCookie is null for no cookie, a malformed value, or an inspiration that is not one — never a partial intent', () => {
  assert.equal(intentFromCookie(''), null)
  assert.equal(intentFromCookie('tracy_site=a.b'), null)
  assert.equal(intentFromCookie('tracy_intent=%E0%A4%A'), null)
  assert.equal(intentFromCookie(`tracy_intent=${encodeURIComponent('platform=joomla')}`), null)
  assert.equal(
    intentFromCookie(`tracy_intent=${encodeURIComponent('inspiration=../etc&platform=joomla')}`),
    null
  )
  // A platform this side does not build is dropped, not kept: the tab falls back to the default.
  assert.deepEqual(
    intentFromCookie(`tracy_intent=${encodeURIComponent('inspiration=stripe&platform=drupal')}`),
    {
      inspiration: 'stripe'
    }
  )
})

// ── A per-CMS Build type is a type, not an id ─────────────────────────────────────────────────

test('a tab type split per CMS — tracy:build:joomla — is read from the address and seen in sight', () => {
  assert.deepEqual(parseTabLink('?tab=tracy:build:joomla&site=granite.localhost'), {
    type: 'tracy:build:joomla',
    siteKey: 'granite.localhost'
  })
  const view = {
    expanded: true,
    active: { id: 't1', kind: 'tracy:build:emdash' },
    tabs: [{ id: 't1', type: 'tracy:build:emdash', meta: { siteKey: 'granite.localhost' } }]
  }
  assert.deepEqual(activeTracyTab(view), {
    id: 't1',
    type: 'tracy:build:emdash',
    siteKey: 'granite.localhost'
  })
  // A tab ID — type plus a site — is still not a type: the site's dot gives it away.
  assert.equal(parseTabLink('?tab=tracy:build:joomla:granite.localhost'), null)
  assert.equal(activeTracyTab({ ...view, active: { id: 't1', kind: 'tracy:build:granite.localhost' } }), null)
})

// ── Landing an open on the native right column (better-sidebar 0.21.1, dsh 0.1.7) ─────────────

test('landedTabId: the active tab, when the open made its kind the one in sight', () => {
  const view = { expanded: true, active: { id: 'tab-4', kind: 'tracy:add-site' }, tabs: [] }
  assert.equal(landedTabId(view, 'tracy:add-site'), 'tab-4')
})

test('landedTabId: null when the column shows another kind, nothing, or is not there', () => {
  assert.equal(
    landedTabId({ expanded: true, active: { id: 'e', kind: 'editor' }, tabs: [] }, 'tracy:add-site'),
    null
  )
  assert.equal(landedTabId({ expanded: false, tabs: [] }, 'tracy:add-site'), null)
  assert.equal(landedTabId(null, 'tracy:add-site'), null)
})

/** A side card and a right column that record what was asked of them. */
const services = ({ active, mounted = 'S1', sessionId = 'S1', records = [] } = {}) => {
  const calls = []
  const right = {
    active: () => active,
    isExpanded: () => true,
    toggleExpanded: () => calls.push(['toggle']),
    focus: (id) => calls.push(['focus', id]),
    mounted: { getSnapshot: () => mounted, subscribe: () => () => {} }
  }
  const sidebar = {
    openTab: (seed, scope) => calls.push(['open', seed, scope]),
    updateTab: (id, patch) => calls.push(['update', id, patch]),
    getSnapshot: () => ({ sessionId }),
    openTabsOf: (type) => records.filter((tab) => tab.type === type)
  }
  return { calls, right, sidebar }
}

test('openTabWithMeta patches the meta onto the tab the open focused — a navigation keeps the old one', () => {
  const { calls, right, sidebar } = services({
    active: { id: 'tab-2', kind: 'tracy:team' },
    records: [{ id: 'tab-2', type: 'tracy:team', meta: { siteKey: 'a.example' } }]
  })
  openTabWithMeta(sidebar, right, { type: 'tracy:team', meta: { siteKey: 'b.example' } })
  assert.deepEqual(calls, [
    ['open', { type: 'tracy:team', meta: { siteKey: 'b.example' } }, undefined],
    ['update', 'tab-2', { meta: { siteKey: 'b.example' } }]
  ])
})

test('openTabWithMeta leaves another session alone, and patches nothing the open did not land on', () => {
  const other = services({ active: { id: 'tab-2', kind: 'tracy:team' }, mounted: 'S1' })
  openTabWithMeta(
    other.sidebar,
    other.right,
    { type: 'tracy:team', meta: { siteKey: 'b.example' } },
    {
      sessionId: 'S2'
    }
  )
  assert.deepEqual(
    other.calls.map((call) => call[0]),
    ['open']
  )
  const elsewhere = services({ active: { id: 'e', kind: 'editor' } })
  openTabWithMeta(elsewhere.sidebar, elsewhere.right, { type: 'tracy:team', meta: { siteKey: 'b.example' } })
  assert.deepEqual(
    elsewhere.calls.map((call) => call[0]),
    ['open']
  )
  const bare = services({ active: { id: 'tab-2', kind: 'tracy:my-sites' } })
  openTabWithMeta(bare.sidebar, bare.right, { type: 'tracy:my-sites' })
  assert.deepEqual(
    bare.calls.map((call) => call[0]),
    ['open']
  )
})

test('revealTab focuses the tab and opens a collapsed column, and leaves an open one open', () => {
  let expanded = false
  const calls = []
  const right = {
    active: () => undefined,
    isExpanded: () => expanded,
    toggleExpanded: () => {
      expanded = !expanded
      calls.push('toggle')
    },
    focus: (id) => calls.push(`focus:${id}`)
  }
  revealTab(right, 'tab-5')
  revealTab(right, 'tab-5')
  assert.deepEqual(calls, ['focus:tab-5', 'toggle', 'focus:tab-5'])
})

test('a retired tab type opens the one that took over from it, for the same site (ADR 0024)', () => {
  assert.deepEqual(RETIRED_TABS, { 'tracy:releases': 'tracy:changes', 'tracy:history': 'tracy:changes' })
  assert.deepEqual(parseTabLink('?tab=tracy:releases&site=a.example'), {
    type: 'tracy:changes',
    siteKey: 'a.example'
  })
  assert.deepEqual(parseTabLink('?tab=tracy%3Ahistory&site=a.example&s=session-1'), {
    type: 'tracy:changes',
    siteKey: 'a.example',
    sessionId: 'session-1'
  })
  assert.equal(currentTabType('tracy:team'), 'tracy:team')
  // A name that only looks like a key of the table is not one.
  assert.equal(currentTabType('toString'), 'toString')
  // The mirror then writes the successor's address, never the retired one.
  assert.equal(
    withTabParams('?tab=tracy:releases&site=a.example', { type: 'tracy:changes', siteKey: 'a.example' }),
    '?tab=tracy:changes&site=a.example'
  )
})

/**
 * A right column whose active tab is `active`, recording what was opened and closed. An open lands as
 * dsh's does: the opened kind becomes the tab in sight. `state` can change between two calls — the
 * successor registering, the side card binding the session on screen — as a page that is still
 * loading changes under the mirror's pulses.
 */
function retiredColumn(
  active,
  { expanded = true, withClose = true, registered = true, enabled = true, seated = true, lands = true } = {}
) {
  const calls = []
  const state = { registered, enabled, seated }
  let inSight = active
  const right = {
    active: () => inSight,
    isExpanded: () => expanded,
    toggleExpanded() {},
    focus() {},
    mounted: { getSnapshot: () => 'session-1', subscribe: () => () => undefined },
    ...(withClose ? { close: (id) => calls.push(['close', id]) } : {})
  }
  const sidebar = {
    getTab: (type) => (state.registered ? { id: type } : undefined),
    isTabEnabled: () => state.enabled,
    getSnapshot: () => ({ sessionId: state.seated ? 'session-1' : undefined }),
    openTab: (seed) => {
      calls.push(['open', seed])
      if (lands) inSight = { id: 'tab9', kind: seed.type }
    }
  }
  return { right, sidebar, calls, state }
}

test('a retired tab restored in sight gives its place to Site changes, once', () => {
  const done = new Set()
  const { right, sidebar, calls } = retiredColumn({
    id: 'tab4',
    kind: 'tracy:releases',
    title: 'Releases · a.example'
  })
  assert.equal(replaceRetiredTab(right, sidebar, done), 'tab4')
  // Opened first, so the pane never empties; no meta, so it takes the page's own site.
  assert.deepEqual(calls, [
    ['open', { type: 'tracy:changes' }],
    ['close', 'tab4']
  ])
  assert.equal(replaceRetiredTab(right, sidebar, done), null, 'a tab already handled is left alone')
  assert.equal(calls.length, 2)
})

test('a retired tab is left alone while the column is collapsed, and replaced once it opens', () => {
  const done = new Set()
  const collapsed = retiredColumn({ id: 'tab2', kind: 'tracy:history' }, { expanded: false })
  assert.equal(replaceRetiredTab(collapsed.right, collapsed.sidebar, done), null)
  assert.deepEqual(collapsed.calls, [])
  const open = retiredColumn({ id: 'tab2', kind: 'tracy:history' })
  assert.equal(replaceRetiredTab(open.right, open.sidebar, done), 'tab2')
})

test('Site changes not registered yet: the retired tab stays, nothing opens — until it registers', () => {
  // A page still loading: the saved layout is restored before the site-tabs plugin registers its
  // tab types. Closing the retired tab then left the column with nothing in its place (REG-016).
  const done = new Set()
  const { right, sidebar, calls, state } = retiredColumn(
    { id: 'tab6', kind: 'tracy:releases' },
    { registered: false }
  )
  assert.equal(replaceRetiredTab(right, sidebar, done), null)
  assert.deepEqual(calls, [])
  state.registered = true
  assert.equal(replaceRetiredTab(right, sidebar, done), 'tab6', 'the next pulse replaces it')
  assert.deepEqual(calls, [
    ['open', { type: 'tracy:changes' }],
    ['close', 'tab6']
  ])
})

test('the side card not bound to the session on screen yet: nothing opens, nothing closes (REG-016)', () => {
  // dsh drops an open it has no session for, without a word (`whenSeated`, 28/09); the retired tab
  // was closed all the same, so a reload lost it with no Site changes in its place (scv2, 03/10).
  const done = new Set()
  const { right, sidebar, calls, state } = retiredColumn(
    { id: 'tab3', kind: 'tracy:history' },
    { seated: false }
  )
  assert.equal(replaceRetiredTab(right, sidebar, done), null)
  assert.deepEqual(calls, [])
  state.seated = true
  assert.equal(replaceRetiredTab(right, sidebar, done), 'tab3')
  assert.deepEqual(calls, [
    ['open', { type: 'tracy:changes' }],
    ['close', 'tab3']
  ])
})

test('Site changes switched off for this deployment: the retired tab closes, nothing opens', () => {
  // The operator's `tab-changes` (or the viewer's own switch): it can never show anything again.
  const { right, sidebar, calls } = retiredColumn({ id: 'tab6', kind: 'tracy:releases' }, { enabled: false })
  assert.equal(replaceRetiredTab(right, sidebar, new Set()), 'tab6')
  assert.deepEqual(calls, [['close', 'tab6']])
})

test('an open that does not land leaves the retired tab where it is, and is not tried again', () => {
  const done = new Set()
  const { right, sidebar, calls } = retiredColumn({ id: 'tab6', kind: 'tracy:releases' }, { lands: false })
  assert.equal(replaceRetiredTab(right, sidebar, done), null)
  assert.equal(replaceRetiredTab(right, sidebar, done), null)
  assert.deepEqual(calls, [['open', { type: 'tracy:changes' }]])
})

test('nothing to replace: a live tab, no tab, no close on the host, or a host that throws', () => {
  const live = retiredColumn({ id: 'tab1', kind: 'tracy:changes' })
  assert.equal(replaceRetiredTab(live.right, live.sidebar, new Set()), null)
  const none = retiredColumn(undefined)
  assert.equal(replaceRetiredTab(none.right, none.sidebar, new Set()), null)
  const old = retiredColumn({ id: 'tab1', kind: 'tracy:releases' }, { withClose: false })
  assert.equal(replaceRetiredTab(old.right, old.sidebar, new Set()), null)
  assert.deepEqual(old.calls, [])
  assert.equal(replaceRetiredTab(undefined, live.sidebar, new Set()), null)
  const broken = retiredColumn({ id: 'tab1', kind: 'tracy:releases' })
  broken.right.active = () => {
    throw new Error('no seat')
  }
  assert.equal(replaceRetiredTab(broken.right, broken.sidebar, new Set()), null)
})

test('isNarrowFrame follows dsh: the column covers the conversation below 768px', () => {
  assert.equal(isNarrowFrame(360), true)
  assert.equal(isNarrowFrame(767), true)
  assert.equal(isNarrowFrame(768), false)
  assert.equal(isNarrowFrame(undefined), false)
})

function fakeColumn(expanded) {
  const calls = []
  const right = {
    active: () => undefined,
    isExpanded: () => expanded,
    toggleExpanded: () => {
      expanded = !expanded
      calls.push(expanded ? 'expand' : 'collapse')
    },
    focus: (id) => calls.push(`focus:${id}`)
  }
  // An open that lands in sight, as dsh's does while the page holds a user activation.
  const open = () => {
    calls.push('open')
    expanded = true
  }
  return { right, open, calls, expanded: () => expanded }
}

test('openUnasked on a narrow frame collapses again a column the open expanded', () => {
  const c = fakeColumn(false)
  openUnasked(c.right, c.open, true)
  assert.deepEqual(c.calls, ['open', 'collapse'])
  assert.equal(c.expanded(), false)
})

test('openUnasked leaves a wide frame, and a column already open, to dsh', () => {
  const wide = fakeColumn(false)
  openUnasked(wide.right, wide.open, false)
  assert.equal(wide.expanded(), true)
  const open = fakeColumn(true)
  openUnasked(open.right, open.open, true)
  assert.deepEqual(open.calls, ['open'])
})

test('focusUnasked only focuses on a narrow frame, and reveals on a wide one', () => {
  const narrow = fakeColumn(false)
  focusUnasked(narrow.right, 'tab-2', true)
  assert.deepEqual(narrow.calls, ['focus:tab-2'])
  const wide = fakeColumn(false)
  focusUnasked(wide.right, 'tab-2', false)
  assert.deepEqual(wide.calls, ['focus:tab-2', 'expand'])
})

// ── A link in the agent's chat opens its tab where the person is (21/10/2026) ───────────────────────────
import { tabLinkOfClick } from '../src/tab-link/index.ts'

const HERE = { origin: 'https://cowork.tracy.ai', basePath: '/shop.tracy.site/' }

test('tabLinkOfClick: a Tracy tab link to this workspace opens in place', () => {
  assert.deepEqual(
    tabLinkOfClick(
      'https://cowork.tracy.ai/shop.tracy.site/?tab=tracy:site-publish&site=shop.tracy.site',
      HERE
    ),
    { type: 'tracy:site-publish', siteKey: 'shop.tracy.site' }
  )
  // A relative link (the `/help` ones) and a base written without its closing slash read the same.
  assert.deepEqual(tabLinkOfClick('/shop.tracy.site/?tab=tracy:team&site=shop.tracy.site', HERE), {
    type: 'tracy:team',
    siteKey: 'shop.tracy.site'
  })
  assert.deepEqual(
    tabLinkOfClick('https://cowork.tracy.ai/shop.tracy.site?tab=tracy:team', {
      ...HERE,
      basePath: '/shop.tracy.site'
    }),
    { type: 'tracy:team' }
  )
})

test('tabLinkOfClick: anything that is not ours is left to the browser', () => {
  const link = '?tab=tracy:site-publish&site=x'
  // another host, another site\'s workspace, no tab, a tab that is not Tracy\'s, a malformed address
  assert.equal(tabLinkOfClick(`https://evil.example/shop.tracy.site/${link}`, HERE), null)
  assert.equal(tabLinkOfClick(`https://cowork.tracy.ai/other.tracy.site/${link}`, HERE), null)
  assert.equal(tabLinkOfClick('https://cowork.tracy.ai/shop.tracy.site/', HERE), null)
  assert.equal(tabLinkOfClick('https://cowork.tracy.ai/shop.tracy.site/?tab=editor', HERE), null)
  assert.equal(tabLinkOfClick('https://cowork.tracy.ai:8443/shop.tracy.site/' + link, HERE), null)
  assert.equal(tabLinkOfClick('http://', HERE), null)
  assert.equal(tabLinkOfClick('mailto:a@b.c', HERE), null)
  // A creation press names a build and starts a session: not a click-open.
  assert.equal(
    tabLinkOfClick('https://cowork.tracy.ai/shop.tracy.site/?inspiration=abc-1&platform=joomla', HERE),
    null
  )
})
