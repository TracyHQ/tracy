/**
 * A creation intent (`?inspiration=…&platform=…`) is consumed when the tab it asked for is
 * OPEN — never by a timeout (plan first-site-build-onboarding §3). Before 13/09 the open's deadline
 * dropped the stash, and since the mirror had already cleaned the address, a reload after a slow
 * boot arrived with nothing to open.
 *
 * The tab is Add site since 24/09/2026 (`creationTabFor`, one creation flow): the intent's shape
 * did not change, only where it lands. What this file pins is the LIFETIME, which is the same
 * question whichever tab the press opens.
 *
 * Lives in `scripts/test/` (the tsx suite, `pnpm test:interop`) because the plugin's client is
 * TypeScript with extensionless imports, which plain `node --test` cannot load, and its built
 * bundle is wrapped in dsh's module loader. Runs the plugin's `apply` against a fake page: a
 * `sessionStorage`, a `location`, a `history`, and the two dsh services it reads, all in memory.
 * Timers are the test runner's mock clock: `advance()` moves it, so nothing here waits for real.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

// The plugin's timers (`window.setTimeout` and friends, wrapped below) run on the mock clock.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }))
afterEach(() => mock.timers.reset())

/** Move the mock clock forward in small steps, letting promise callbacks (a fetch answer) land between them. */
async function advance(ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= 50) {
    mock.timers.tick(Math.min(50, left))
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// The page, as much of it as the plugin touches. Assigned onto `globalThis` through `any`: these
// are stand-ins, not the DOM types, and the test is about what the plugin does with them.
// biome-ignore lint/suspicious/noExplicitAny: a fake browser page, deliberately untyped
const page = globalThis as any

function fakePage(search: string) {
  const store = new Map<string, string>()
  page.window = {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as NodeJS.Timeout),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: unknown) => clearInterval(id as NodeJS.Timeout),
    addEventListener() {},
    removeEventListener() {}
  }
  page.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k)
  }
  page.location = {
    pathname: '/new/',
    search,
    hash: '',
    origin: 'http://tracy.test',
    href: `http://tracy.test/new/${search}`
  }
  page.history = {
    state: null,
    replaceState: (_s: unknown, _t: string, url: string) => {
      const u = new URL(url, 'http://tracy.test')
      page.location.pathname = u.pathname
      page.location.search = u.search
    }
  }
  // The plugin also installs the strip-gap reset on the document, so the fake takes listeners.
  page.document = {
    cookie: '',
    querySelector: () => ({ getAttribute: () => 'http://tracy.test/new/' }),
    addEventListener: () => {},
    removeEventListener: () => {}
  }
  return store
}

function fakeServices({ registered }: { registered: Set<string> }) {
  let launcher: { kinds: readonly string[]; label: string; emptyLabel: string } | undefined
  const locale = { register: () => () => {}, bind: () => (key: string) => key }
  const right = {
    registerLauncher: (value: typeof launcher) => {
      launcher = value
      return () => {
        launcher = undefined
      }
    }
  }
  const opened: { type: string; meta?: unknown }[] = []
  const sidebar = {
    getTab: (type: string) => (registered.has(type) ? {} : undefined),
    subscribe: () => () => {},
    getSnapshot: () => ({ sessionId: 's-1', state: null }),
    subscribeState: () => () => {},
    openTab: (seed: { type: string; meta?: unknown }) => {
      opened.push(seed)
    }
  }
  // dsh 0.1.6-alpha.2 shape: the main view's session is the one `retainedBy.mainView` holds; the
  // sessions service no longer has `current` or `open` (switching is `uiWorkspace.openSession`).
  const sessions = {
    list: {
      getSnapshot: () => ({ byId: { 's-1': { retainedBy: { mainView: 1 } } }, phase: 'ready' }),
      subscribe: () => () => {}
    }
  }
  const effects: (() => (() => void) | undefined)[] = []
  const ctx = {
    effect: (fn: () => (() => void) | undefined) => {
      effects.push(fn)
    },
    get: (name: string) => (name === 'sidebarRight' ? right : name === 'locale' ? locale : undefined),
    betterSidebar: sidebar,
    sessions
  }
  return { ctx, sidebar, opened, effects, launcher: () => launcher, run: () => effects.map((fn) => fn()) }
}

test('the launcher offers every tab a launch switch names, first the three on by default, and disposes its registration', async () => {
  // Which of them actually show is the operator's call (/ops › User Interface, `launch-*` switches),
  // made through the side card's tab policy: dsh's launcher intersects this list with the LISTED guide
  // entries. A fixed three-entry list here could never grow when an operator turned one on.
  fakePage('')
  const { apply } = await import('../../packages/ui/tracy-tab-link/src/client/index.ts')
  const { LAUNCHER_TABS } = await import('../../packages/core/tracy-core/src/ui-switches/index.mjs')
  const services = fakeServices({
    registered: new Set(['tracy:add-site', 'tracy:my-sites', 'tracy:design-inspiration', 'tracy:team'])
  })
  apply(services.ctx as never)
  const disposers = services.run()
  try {
    const kinds = services.launcher()?.kinds ?? []
    assert.deepEqual(kinds, [...LAUNCHER_TABS])
    assert.deepEqual(kinds.slice(0, 3), ['tracy:add-site', 'tracy:my-sites', 'tracy:design-inspiration'])
    assert.ok(kinds.includes('tracy:team'), 'Team is a candidate; its launch switch decides')
    assert.ok(services.sidebar.getTab('tracy:team'), 'the Team registration remains available')
  } finally {
    for (const dispose of disposers) dispose?.()
  }
  assert.equal(services.launcher(), undefined)
})

test('a hidden Browser deep-link reads the accepted site address before opening its preview', async () => {
  fakePage('?tab=tracy%3Abrowser&site=b.test')
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        sites: [
          { siteKey: 'b.test', status: 'accepted', copyUrl: 'https://preview-b.test/', platform: 'joomla' }
        ]
      })
    )
  const { apply } = await import('../../packages/ui/tracy-tab-link/src/client/index.ts')
  const services = fakeServices({ registered: new Set(['tracy:browser']) })
  services.sidebar.getTab = () => ({ hidden: true })
  apply(services.ctx as never)
  const disposers = services.run()
  try {
    await advance(400)
    assert.equal(services.opened.length, 1)
    assert.equal((services.opened[0] as { url?: string }).url, 'https://preview-b.test/')
    assert.equal((services.opened[0]?.meta as { siteKey?: string } | undefined)?.siteKey, 'b.test')
  } finally {
    for (const dispose of disposers) dispose?.()
    globalThis.fetch = oldFetch
  }
})

test('the stash outlives an open that gives up, and is spent by one that lands', async () => {
  const store = fakePage('?inspiration=stripe&platform=joomla')
  const { apply } = await import('../../packages/ui/tracy-tab-link/src/client/index.ts')
  // 1) The Build plugin never registers: the open gives up at its deadline — the stash stays.
  const registered = new Set<string>()
  const first = fakeServices({ registered })
  apply(first.ctx as never)
  const disposers = first.run()
  assert.equal(
    store.get('tracy-tab-link:intent'),
    JSON.stringify({ inspiration: 'stripe', platform: 'joomla' })
  )
  // Disposing the effects (a plugin reload) is not a spent intent either.
  for (const d of disposers) if (typeof d === 'function') d()
  assert.equal(
    store.get('tracy-tab-link:intent'),
    JSON.stringify({ inspiration: 'stripe', platform: 'joomla' }),
    'kept after the open was disposed'
  )
  assert.equal(first.opened.length, 0)

  // 2) A reload: the mirror already cleaned the address, so the intent comes from the stash —
  // and this time the tab type is registered, so it opens and the stash is spent.
  page.location.search = ''
  registered.add('tracy:add-site')
  const second = fakeServices({ registered })
  apply(second.ctx as never)
  const disposers2 = second.run()
  await advance(400)
  assert.equal(second.opened.length, 1)
  assert.equal(second.opened[0]?.type, 'tracy:add-site')
  // `pressedAt` is not decoration and not a stray key: an intent read from the address IS a press,
  // and the stamp is what tells a pressed tab from one the side card restored later. It reaches a
  // decision -- BuildTab passes `Date.now() - pressedAt < PRESS_FRESH_MS` down as `fresh`, and
  // BuildForm claims a site on its own only while that holds. So assert the shape and that the
  // stamp is from this press, not a frozen number, and still refuse any key nobody asked for.
  const meta = second.opened[0]?.meta as { id?: string; platform?: string; pressedAt?: number }
  assert.deepEqual(Object.keys(meta).sort(), ['id', 'platform', 'pressedAt'])
  assert.equal(meta.id, 'stripe')
  assert.equal(meta.platform, 'joomla')
  assert.ok(
    typeof meta.pressedAt === 'number' && Date.now() - meta.pressedAt < 10_000,
    `stamped at the moment of the press, got ${meta.pressedAt}`
  )
  assert.equal(store.get('tracy-tab-link:intent'), undefined, 'spent once the tab is open')
  for (const d of disposers2) if (typeof d === 'function') d()
})

// #392: a press made OUTSIDE the creation workspace navigates to `onboardingBuildUrl(…)`
// (`/new/?inspiration=…&platform=…`). When tracy-web forwards that address as it stands, the intent
// is read from the ADDRESS — the road the cookie tests above do not take. It used to open
// `tracy:build:<cms>`; it must open Add site, on the tab the open actually landed on, exactly as the
// cookie road and the in-workspace press do.
test('an intent on the address opens Add site in a fresh session and patches the tab it landed on', async () => {
  const { onboardingBuildUrl } = await import(
    '../../packages/design/tracy-design-inspiration/src/client/dsh-url.ts'
  )
  const { apply } = await import('../../packages/ui/tracy-tab-link/src/client/index.ts')
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const address = new URL(onboardingBuildUrl('tracy-business', platform), 'http://tracy.test')
    const store = fakePage(address.search)
    // The session's right column already shows Add site, opened from the `+` list. Since
    // better-sidebar 0.21.1 it lives in dsh's native column, which keeps ONE tab per kind and mints
    // its ids: the open only focuses that tab (`seed.id` is ignored), and the press must be written
    // onto the id the column reports (#381's rule, `openTabWithMeta`).
    let session = 's-1'
    const right = {
      registerLauncher: () => () => {},
      active: () => ({ id: 'native-7', kind: 'tracy:add-site' }),
      isExpanded: () => true,
      toggleExpanded: () => {},
      focus: () => {},
      mounted: { getSnapshot: () => session, subscribe: () => () => {} },
      openTabs: { subscribe: () => () => {} }
    }
    const opened: { type: string; id?: string; meta?: unknown }[] = []
    const updates: { id: string; meta: unknown; session: string }[] = []
    const sidebar = {
      getTab: (type: string) => (type === 'tracy:add-site' ? {} : undefined),
      subscribe: () => () => {},
      getSnapshot: () => ({ sessionId: session, state: null }),
      subscribeState: () => () => {},
      openTabsOf: (type: string) => (type === 'tracy:add-site' ? [{ id: 'native-7', type }] : []),
      openTab: (seed: { type: string; id?: string; meta?: unknown }) => {
        opened.push({ ...seed })
      },
      updateTab: (id: string, patch: { meta?: unknown }) => {
        updates.push({ id, meta: patch.meta, session })
      }
    }
    const byId = () => ({ [session]: { retainedBy: { mainView: 1 } } })
    const sessions = {
      list: { getSnapshot: () => ({ byId: byId(), phase: 'ready' }), subscribe: () => () => {} }
    }
    // `startSession` returns before the session exists; the open must wait for it.
    let started = 0
    const workspace = {
      startSession: () => {
        started += 1
        setTimeout(() => {
          session = 's-2'
        }, 150)
      },
      openSession: () => {}
    }
    const effects: (() => (() => void) | undefined)[] = []
    apply({
      effect: (fn: () => (() => void) | undefined) => {
        effects.push(fn)
      },
      get: (name: string) =>
        name === 'uiWorkspace'
          ? workspace
          : name === 'sidebarRight'
            ? right
            : name === 'locale'
              ? { register: () => () => {}, bind: () => (key: string) => key }
              : undefined,
      betterSidebar: sidebar,
      sessions
    } as never)
    const disposers = effects.map((fn) => fn())
    assert.equal(started, 1, `${platform}: the press gets a session of its own`)
    assert.equal(opened.length, 0, `${platform}: nothing opens in the session the person was in`)
    await advance(600)
    assert.equal(opened.length, 1, `${platform}: one open`)
    assert.equal(opened[0]?.type, 'tracy:add-site', `${platform}: Add site, not a Build tab`)
    const meta = opened[0]?.meta as { id?: string; platform?: string; pressedAt?: number }
    assert.equal(meta.id, 'tracy-business')
    assert.equal(meta.platform, platform)
    assert.equal(typeof meta.pressedAt, 'number')
    assert.deepEqual(updates, [{ id: 'native-7', meta, session: 's-2' }])
    assert.equal(store.get('tracy-tab-link:intent'), undefined, `${platform}: spent once the tab is open`)
    // The address is cleaned by the mirror on the state change `openTab` makes, which this fake does
    // not emit; the browser test (`test/e2e/create-platform-ui.test.mjs`) asserts it on the real side card.
    for (const d of disposers) if (typeof d === 'function') d()
  }
})
