/**
 * `uiSwitches()` — which pieces of the customer's dsh page an operator has hidden
 * (`tasks/plan-ui-switches.md`). Everything here is the real module; `fetch` and the `<html>`
 * element are doubles, same shape as `config.test.mjs`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { LAUNCHER_TABS, switchesAtTracy, UI_SWITCHES, uiSwitches } from '@tracy/core/ui-switches'

const never = () => new Promise(() => {})

test('before the door answers, every switch reads its code default', () => {
  const ui = uiSwitches({ fetch: never, root: null })
  // Known-good values from the catalogue Lee fixed on 28/09/2026 (Settings button shown since 29/09).
  assert.equal(ui.isShown('language'), true)
  assert.equal(ui.isShown('tracy-account'), true)
  assert.equal(ui.isShown('settings-button'), true)
  assert.equal(ui.isShown('other-sites'), false)
  assert.equal(ui.isShown('model-picker'), false)
})

const answer = (status, body) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('an id the door names that the catalogue no longer lists is ignored, silently', async () => {
  // A row stored before a switch left the catalogue (the retired Releases and History switches,
  // ADR 0024): it answers nothing any more — no attribute, no error, no tab policy.
  const root = fakeRoot()
  const ui = uiSwitches({
    fetch: answer(200, { hidden: ['tab-releases', 'launch-releases', 'tab-history', 'language'] }),
    root
  })
  await ui.ready
  assert.equal(ui.isShown('language'), false)
  for (const gone of ['tab-releases', 'launch-releases', 'tab-history']) {
    assert.ok(!root.hidden().includes(gone), `${gone} is not written on <html>`)
    assert.throws(() => ui.isShown(gone), /not in catalogue\.json/, 'code may not ask about it either')
  }
})

test("the door's hidden list decides, and subscribers hear once it lands", async () => {
  // An operator showed the site folders and hid Language.
  const ui = uiSwitches({ fetch: answer(200, { hidden: ['language', 'model-picker'] }), root: null })
  let heard = 0
  ui.subscribe(() => heard++)
  await ui.ready
  assert.equal(ui.isShown('other-sites'), true)
  assert.equal(ui.isShown('language'), false)
  assert.equal(ui.isShown('model-picker'), false)
  assert.equal(heard, 1)
})

test('a door that cannot be read keeps the defaults, never throws, and tells nobody', async () => {
  const broken = [
    async () => {
      throw new Error('offline')
    },
    answer(404, { error: 'no such door' }), // a local lane has no root door
    answer(500, { hidden: ['language'] }),
    async () => new Response('<!doctype html><title>nope</title>', { status: 200 }),
    answer(200, { hidden: 'language' }),
    answer(200, null)
  ]
  for (const fetch of broken) {
    const ui = uiSwitches({ fetch, root: null })
    let heard = 0
    ui.subscribe(() => heard++)
    await ui.ready
    assert.equal(ui.isShown('language'), true)
    assert.equal(ui.isShown('other-sites'), false)
    assert.equal(heard, 0)
  }
})

/** The one piece of `<html>` the module touches. */
const fakeRoot = () => {
  const attrs = new Map()
  return {
    setAttribute: (name, value) => attrs.set(name, value),
    getAttribute: (name) => attrs.get(name) ?? null,
    hidden: () => (attrs.get('data-tracy-hide') ?? '').split(' ').filter(Boolean).sort()
  }
}

test('<html> carries the hidden ids at once (defaults), then the door answer', async () => {
  const root = fakeRoot()
  let release
  const gate = new Promise((resolve) => (release = resolve))
  const ui = uiSwitches({
    fetch: async () => {
      await gate
      return answer(200, { hidden: ['language'] })()
    },
    root
  })
  // Synchronous: the CSS that hides a piece must match before the first paint, not after a fetch.
  assert.ok(root.hidden().includes('other-sites'))
  assert.ok(root.hidden().includes('model-picker'))
  assert.ok(!root.hidden().includes('language'))
  assert.ok(!root.hidden().includes('settings-button'))
  // 25 since the retired Releases and History tabs took their three switches with them (ADR 0024);
  // 26 once the Need help? button went off by default; 27 with the logo and favicon questions
  // (`site-brand-uploads`, off by default until the brand writers ship); 28 with host-wide subscriptions locked off;
  // 29 with the chat route to a design system (`chat-design-system`, off by default since 11/10/2026);
  // 30 with the role picker (`preset-picker`, off by default since 13/10/2026);
  // 31 with the embeddable website voice widget, enabled only for the dev trial;
  // 32 with Website Opportunities, off until an operator opens Phase 1;
  // 33 with approving a plan by voice (`voice-plan-approval`, off by default; council 19/10/2026, A6);
  // 34 with Build from my business (`site-from-business`, off by default, #1640);
  // 35 with the sign-in-free Find page (`website-opportunities-public-find`, 23/10/2026);
  // 36 with Sync to live (`site-sync-to-live`, off until an operator turns it on, 24/10/2026);
  // 37 with Design system in the + menu (`launch-design-system`, off until an operator turns it on, 25/10/2026).
  assert.equal(root.hidden().length, 37)
  assert.ok(root.hidden().includes('launch-design-system'))
  assert.ok(root.hidden().includes('site-sync-to-live'))
  assert.ok(root.hidden().includes('site-from-business'))
  assert.ok(root.hidden().includes('website-opportunities-public-find'))
  assert.ok(root.hidden().includes('voice-plan-approval'))
  assert.ok(root.hidden().includes('website-opportunities'))
  assert.ok(root.hidden().includes('website-voice-widget'))
  assert.ok(root.hidden().includes('chat-design-system'))
  assert.ok(root.hidden().includes('preset-picker'))
  assert.ok(root.hidden().includes('dsh-subscriptions'))
  assert.ok(root.hidden().includes('help-button'))

  release()
  await ui.ready
  // A locked switch keeps its default even when the door leaves it out.
  assert.deepEqual(root.hidden(), ['dsh-open-in-app', 'dsh-subscriptions', 'language'])
})

test('asking about an id the catalogue does not list is a bug, not a quiet "shown"', () => {
  const ui = uiSwitches({ fetch: never, root: null })
  assert.throws(() => ui.isShown('model_picker'), /model_picker/)
})

test('every plugin on the page shares one read of the door', async () => {
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (...args) => {
    calls++
    return answer(200, { hidden: [] })(...args)
  }
  try {
    const a = uiSwitches()
    const b = uiSwitches()
    await Promise.all([a.ready, b.ready])
    assert.equal(calls, 1)
    assert.equal(b.isShown('other-sites'), true)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('filtering registrations keeps what is shown, and passes ids that are not switches', async () => {
  const ui = uiSwitches({ fetch: answer(200, { hidden: ['plugins', 'language'] }), root: null })
  await ui.ready
  // Ledger order of Settings › General plus one row Tracy never catalogued (dsh's link-opening).
  const ids = ['language', 'appearance', 'link-opening', 'plugins', 'tracy-account']
  assert.deepEqual(ui.keepShown(ids), ['appearance', 'link-opening', 'tracy-account'])
})

test('right-column switches become a tab policy: tab-* decides existence, launch-* the + menu', async () => {
  const ui = uiSwitches({
    fetch: answer(200, { hidden: ['tab-git', 'launch-add-site', 'launch-build'] }),
    root: null
  })
  await ui.ready
  const policy = ui.tabPolicy()
  assert.equal(policy.isAllowed('git'), false)
  assert.equal(policy.isAllowed('tracy:team'), true)
  // The door hides the Build entry of the + menu; the Build tab itself still exists.
  assert.equal(policy.isAllowed('tracy:build:joomla'), true)
  assert.equal(policy.isListed('tracy:build:joomla'), false)
  assert.equal(policy.isListed('tracy:add-site'), false)
  assert.equal(policy.isListed('tracy:my-sites'), true)
  // A tab type no switch names is not Tracy's to hide.
  assert.equal(policy.isAllowed('some-plugin:tab'), true)
  assert.equal(policy.isListed('some-plugin:tab'), true)
})

test("the site's Settings and Publish tabs have no switch of their own: no switch names either type, so the policy never takes them away", async () => {
  const everyTab = UI_SWITCHES.flatMap((one) => one.tabs ?? [])
  for (const type of ['tracy:site-settings', 'tracy:site-publish'])
    assert.equal(everyTab.includes(type), false, `${type} is named by no switch`)
  // Every switch off: the two tabs still exist. (Their registration keeps them out of the + menu.)
  const ui = uiSwitches({ fetch: answer(200, { hidden: UI_SWITCHES.map((one) => one.id) }), root: null })
  await ui.ready
  const policy = ui.tabPolicy()
  for (const type of ['tracy:site-settings', 'tracy:site-publish'])
    assert.equal(policy.isAllowed(type), true, type)
})

test('Connect domain is a switch of the Publish tab, and its hint says where the button is', () => {
  const connect = UI_SWITCHES.find((one) => one.id === 'site-connect-domain')
  assert.ok(connect, 'the switch is in the catalogue')
  assert.equal(connect.defaultOn, true)
  assert.match(connect.hint, /Publish tab/)
  assert.doesNotMatch(connect.hint, /Site settings|Settings ›|› Domains/)
})

test('followed by a side card, the policy is installed at once, replaced when the door answers, and removed on dispose', async () => {
  let release
  const gate = new Promise((resolve) => (release = resolve))
  const ui = uiSwitches({
    fetch: async () => {
      await gate
      return answer(200, { hidden: ['launch-my-sites'] })()
    },
    root: null
  })
  const installed = []
  const sidebar = {
    setTabPolicy(policy) {
      installed.push(policy)
      return () => installed.splice(installed.indexOf(policy), 1)
    }
  }
  const stop = ui.followTabPolicy(sidebar)
  assert.equal(installed.length, 1)
  assert.equal(installed[0].isListed('tracy:my-sites'), true, 'the code default lists My sites')

  release()
  await ui.ready
  assert.equal(installed.length, 1, 'replaced, not stacked')
  assert.equal(installed[0].isListed('tracy:my-sites'), false)

  stop()
  assert.equal(installed.length, 0)
  // A side card from before the feature: nothing to install, nothing thrown.
  assert.doesNotThrow(() => ui.followTabPolicy({})())
})

test('the + menu offers every tab a launch switch names, in catalogue order; the switches then pick', () => {
  // dsh's launcher shows the intersection of this list and the listed guide entries, so the list is
  // every candidate and `isListed` decides — a hard-coded three-entry list could never grow.
  assert.deepEqual(LAUNCHER_TABS.slice(0, 3), [
    'tracy:add-site',
    'tracy:my-sites',
    'tracy:design-inspiration'
  ])
  assert.ok(LAUNCHER_TABS.includes('tracy:build:joomla'))
  assert.ok(LAUNCHER_TABS.includes('tracy:browser'))
  assert.ok(LAUNCHER_TABS.includes('files'), 'the native Files guide uses files, not editor')
  assert.equal(new Set(LAUNCHER_TABS).size, LAUNCHER_TABS.length)
})

test('Design system: a + menu entry of its own, off by default, beside Design templates (Akemi, 25/10/2026)', async () => {
  const sw = UI_SWITCHES.find((s) => s.id === 'launch-design-system')
  assert.ok(sw, 'the catalogue lists launch-design-system')
  assert.equal(sw.group, 'right-launcher')
  assert.equal(sw.defaultOn, false)
  assert.deepEqual(sw.tabs, ['tracy:design-system'])
  assert.ok(LAUNCHER_TABS.includes('tracy:design-system'), 'the launcher may offer the Design system tab')
  assert.equal(
    LAUNCHER_TABS.indexOf('tracy:design-system'),
    LAUNCHER_TABS.indexOf('tracy:design-inspiration') + 1,
    'listed right after Design templates'
  )

  const byDefault = uiSwitches({ fetch: never, root: null })
  assert.equal(
    byDefault.tabPolicy().isListed('tracy:design-system'),
    false,
    'off until the operator turns it on'
  )
  assert.equal(byDefault.tabPolicy().isAllowed('tracy:design-system'), true, 'the tab itself still exists')

  const on = uiSwitches({ fetch: answer(200, { hidden: [] }), root: null })
  await on.ready
  assert.equal(on.tabPolicy().isListed('tracy:design-system'), true)
})

test('Files launcher policy covers the editor registration and native files guide', async () => {
  const ui = uiSwitches({
    fetch: answer(200, { hidden: ['launch-files'] }),
    root: null
  })
  await ui.ready
  assert.equal(ui.tabPolicy().isListed('editor'), false)
  assert.equal(ui.tabPolicy().isListed('files'), false)
})

test('a child switch names a parent that exists, is not itself a child, and sits in the same area', async () => {
  const { default: catalogue } = await import('../src/ui-switches/catalogue.json', { with: { type: 'json' } })
  const byId = new Map(catalogue.switches.map((s) => [s.id, s]))
  const areaOf = (group) => catalogue.areas.find((a) => a.groups.includes(group))?.id
  const children = catalogue.switches.filter((s) => s.parent)
  // Lee, 29/09/2026: the session "…" menu is one switch, and each of its two items another.
  assert.deepEqual(children.map((s) => s.id).sort(), [
    'dsh-session-menu-download',
    'dsh-session-menu-feedback',
    'help-desktop-download'
  ])
  for (const child of children) {
    const parent = byId.get(child.parent)
    assert.ok(parent, `${child.id} names ${child.parent}`)
    assert.equal(parent.parent, undefined, `${child.parent} is not itself a child`)
    assert.equal(areaOf(child.group), areaOf(parent.group), `${child.id} sits in its parent's area`)
  }
})

test('a locked switch stays off whatever the door says, and says why', async () => {
  const { default: catalogue } = await import('../src/ui-switches/catalogue.json', { with: { type: 'json' } })
  const locked = catalogue.switches.filter((s) => s.locked !== undefined)
  // Lee, 29/09/2026: the "Open in app" plugin is off in every bundle; its switch stays on /ops,
  // locked, so a later upstream fix only has to unlock it.
  // A piece whose code is gone has no switch at all ("remove means delete"): the locked Releases
  // and History switches went with their tabs (ADR 0024), so a lock is only ever for a piece whose
  // code is there but whose plugin is off.
  assert.deepEqual(
    locked.map((s) => s.id),
    ['dsh-subscriptions', 'dsh-open-in-app']
  )
  for (const s of locked) {
    assert.equal(s.defaultOn, false, `${s.id} is locked off`)
    assert.ok(typeof s.locked === 'string' && s.locked.length > 20, `${s.id} says why`)
  }
  const ui = uiSwitches({ fetch: answer(200, { hidden: [] }), root: null })
  await ui.ready
  assert.equal(ui.isShown('dsh-open-in-app'), false)
  assert.equal(ui.isShown('dsh-session-menu'), true)
})

test('every switch that can take away the only Sign out says so before it is turned off', () => {
  // Sign out lives only in Settings › Account (F-S2-011, #811): the gear that opens the dialog and
  // the Account section inside it each remove it, so each carries the warning `/ops` prints when
  // the switch is off. Read from the exported list, which is what the plugins and the door get.
  const byId = new Map(UI_SWITCHES.map((s) => [s.id, s]))
  for (const id of ['settings-button', 'tracy-account']) {
    const warning = byId.get(id)?.warning
    assert.equal(typeof warning, 'string', `${id} carries a warning`)
    assert.match(warning, /no way to sign out/i, `${id} names what is lost`)
    assert.match(warning, /Settings › Account/, `${id} names where Sign out lives`)
  }
  // The warning is words for the operator only: the switch itself is unchanged.
  const account = byId.get('tracy-account')
  assert.equal(account.defaultOn, true)
  assert.equal(account.locked, undefined)
  assert.equal(uiSwitches({ fetch: never, root: null }).isShown('tracy-account'), true)
})

test('chat-design-system: off by default, in the Design system button group (David, 11/10/2026)', () => {
  const row = UI_SWITCHES.find((s) => s.id === 'chat-design-system')
  assert.ok(row, 'the switch is in the catalogue')
  assert.equal(row.defaultOn, false)
  assert.equal(row.group, UI_SWITCHES.find((s) => s.id === 'toolbar-design-system')?.group)
  assert.equal(uiSwitches({ fetch: never, root: null }).isShown('chat-design-system'), false)
})

test('preset-picker: off by default, in the composer group, drawn by Tracy (Lee, 13/10/2026)', () => {
  const row = UI_SWITCHES.find((s) => s.id === 'preset-picker')
  assert.ok(row, 'the switch is in the catalogue')
  assert.equal(row.defaultOn, false)
  assert.equal(row.group, 'composer')
  assert.equal(row.drawnBy, 'Tracy')
  assert.equal(uiSwitches({ fetch: never, root: null }).isShown('preset-picker'), false)
})

test("switchesAtTracy: a host reads the switches at Tracy's origin, and no answer is null", async () => {
  /** @type {string[]} */
  const asked = []
  const on = await switchesAtTracy('https://tracy.example/', {
    fetch: async (url) => {
      asked.push(String(url))
      return new Response(JSON.stringify({ hidden: ['toolbar-design-system'] }), { status: 200 })
    }
  })
  assert.deepEqual(asked, ['https://tracy.example/api/ui'])
  assert.ok(on)
  assert.equal(on('chat-design-system'), true, 'not hidden: an operator turned it on')
  assert.equal(on('toolbar-design-system'), false)
  assert.equal(on('dsh-open-in-app'), false, 'a locked switch is its default whatever the door says')
  assert.throws(() => on('no-such-switch'), /not in catalogue\.json/)

  // No origin, a refusal, a throw and a body of another shape are all "no answer": the caller closes.
  assert.equal(await switchesAtTracy(null), null)
  assert.equal(await switchesAtTracy(''), null)
  for (const fetch of [
    async () => new Response('nope', { status: 503 }),
    async () => {
      throw new Error('offline')
    },
    async () => new Response(JSON.stringify({ hidden: 'all' }), { status: 200 })
  ])
    assert.equal(await switchesAtTracy('https://tracy.example', { fetch }), null)
})
