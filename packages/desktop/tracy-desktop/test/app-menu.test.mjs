/**
 * The application menu on each operating system, and the menus dsh's Windows caption row pops up.
 * The platform is passed in, so every branch runs on any host.
 *
 *   node --test packages/desktop/tracy-desktop/test/app-menu.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { applicationMenu, captionMenu } = require('../src/app-menu.js')

const closePage = { id: 'dsh-page-close', label: 'Close Page', enabled: true, click: () => {} }
const file = { label: 'File', submenu: [closePage] }
const check = { label: 'Check for Updates…', click: () => {} }

/** The parts of a template a person sees, without the click handlers. */
const shape = (items) =>
  items.map(({ click: _click, submenu, ...rest }) =>
    Array.isArray(submenu) ? { ...rest, submenu: shape(submenu) } : rest
  )

const find = (items, predicate) => {
  for (const item of items) {
    if (predicate(item)) return item
    if (Array.isArray(item.submenu)) {
      const inner = find(item.submenu, predicate)
      if (inner) return inner
    }
  }
  return undefined
}

test('macOS without update items: the stock app menu, File with New Window and Close Page — as before', () => {
  assert.deepEqual(
    shape(applicationMenu({ platform: 'darwin', file, updateItems: [], newWindow: () => {} })),
    [
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          { id: 'tracy-new-window', label: 'New Window', accelerator: 'Command+Shift+N' },
          { type: 'separator' },
          { id: 'dsh-page-close', label: 'Close Page', enabled: true }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ]
  )
})

test('macOS with update items: they sit under About in the spelled-out app menu — as before', () => {
  const [app] = shape(
    applicationMenu({ platform: 'darwin', file, updateItems: [check], newWindow: () => {} })
  )
  assert.deepEqual(app, {
    role: 'appMenu',
    submenu: [
      { role: 'about' },
      { label: 'Check for Updates…' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  })
})

for (const platform of ['win32', 'linux']) {
  test(`${platform}: File has New Window on Ctrl+Shift+N, Close Page and Quit; Help holds the update item`, () => {
    assert.deepEqual(shape(applicationMenu({ platform, file, updateItems: [check], newWindow: () => {} })), [
      {
        label: 'File',
        submenu: [
          { id: 'tracy-new-window', label: 'New Window', accelerator: 'Ctrl+Shift+N' },
          { type: 'separator' },
          { id: 'dsh-page-close', label: 'Close Page', enabled: true },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: 'Check for Updates…' }] }
    ])
  })

  test(`${platform}: with no updater running, Help shows Check for Updates… greyed out, not missing`, () => {
    const help = applicationMenu({ platform, file, updateItems: [], newWindow: () => {} }).at(-1)
    assert.deepEqual(shape(help.submenu), [
      { id: 'tracy-check-updates', label: 'Check for Updates…', enabled: false }
    ])
  })
}

test('New Window opens a window on every platform', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    let opened = 0
    const menu = applicationMenu({ platform, file, updateItems: [], newWindow: () => opened++ })
    find(menu, (item) => item.id === 'tracy-new-window').click()
    assert.equal(opened, 1, platform)
  }
})

test("the caption row's Application menu: New Window, Close Page, the update item, Exit", () => {
  const items = captionMenu('application', {
    file,
    updateItems: [check],
    newWindow: () => {},
    editKey: () => {}
  })
  assert.deepEqual(shape(items), [
    { id: 'tracy-new-window', label: 'New Window', accelerator: 'Ctrl+Shift+N' },
    { type: 'separator' },
    { id: 'dsh-page-close', label: 'Close Page', enabled: true },
    { type: 'separator' },
    { label: 'Check for Updates…' },
    { type: 'separator' },
    { role: 'quit', label: 'Exit' }
  ])
})

test("the caption row's Edit menu sends each edit as a key to the editor, as dsh's does", () => {
  const sent = []
  const items = captionMenu('edit', {
    file,
    updateItems: [],
    newWindow: () => {},
    editKey: (keyCode, modifiers) => sent.push([keyCode, ...modifiers].join('+'))
  })
  assert.deepEqual(
    items.filter((item) => item.type !== 'separator').map((item) => [item.label, item.accelerator ?? '']),
    [
      ['Undo', 'Ctrl+Z'],
      ['Redo', 'Ctrl+Y'],
      ['Cut', 'Ctrl+X'],
      ['Copy', 'Ctrl+C'],
      ['Paste', 'Ctrl+V'],
      ['Delete', ''],
      ['Select All', 'Ctrl+A']
    ]
  )
  for (const item of items) item.click?.()
  assert.deepEqual(sent, [
    'Z+control',
    'Y+control',
    'X+control',
    'C+control',
    'V+control',
    'Delete',
    'A+control'
  ])
})

test('a caption menu the page names but the app does not have is refused', () => {
  assert.equal(captionMenu('view', { file, updateItems: [], newWindow: () => {}, editKey: () => {} }), null)
})

const GETTING_STARTED = 'Getting started with Tracy Cowork'

test('Help › Getting started with Tracy Cowork, on every platform, opens the first-run screen', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const asked = []
    const menu = applicationMenu({
      platform,
      file,
      updateItems: [check],
      newWindow: () => {},
      gettingStarted: () => asked.push(platform)
    })
    const help = menu.find((item) => item.role === 'help')
    assert.ok(help, `${platform} has a Help menu`)
    assert.equal(help.submenu[0].label, GETTING_STARTED, platform)
    help.submenu[0].click()
    assert.deepEqual(asked, [platform])
  }
})

test('Windows and Linux keep the update item in Help, after Getting started', () => {
  const menu = applicationMenu({
    platform: 'linux',
    file,
    updateItems: [check],
    newWindow: () => {},
    gettingStarted: () => {}
  })
  const help = menu.find((item) => item.role === 'help')
  assert.deepEqual(
    shape(help.submenu).map((item) => item.label ?? item.type),
    [GETTING_STARTED, 'separator', 'Check for Updates…']
  )
})

test("the caption row's Application menu has Getting started too (a Windows window has no menu bar)", () => {
  const asked = []
  const items = captionMenu('application', {
    file,
    updateItems: [check],
    newWindow: () => {},
    editKey: () => {},
    gettingStarted: () => asked.push('caption')
  })
  const item = find(items, (entry) => entry.label === GETTING_STARTED)
  assert.ok(item)
  item.click()
  assert.deepEqual(asked, ['caption'])
})

test("Help › What's New… (tasks/todo-desktop-update-policy.md D6), after Getting started, on every platform and in the caption menu", () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const asked = []
    const menu = applicationMenu({
      platform,
      file,
      updateItems: [check],
      newWindow: () => {},
      gettingStarted: () => {},
      whatsNew: () => asked.push(platform)
    })
    const help = menu.find((item) => item.role === 'help')
    assert.equal(help.submenu[1].label, 'What’s New…', platform)
    help.submenu[1].click()
    assert.deepEqual(asked, [platform])
  }
  const items = captionMenu('application', {
    file,
    updateItems: [check],
    newWindow: () => {},
    editKey: () => {},
    gettingStarted: () => {},
    whatsNew: () => {}
  })
  assert.ok(find(items, (entry) => entry.label === 'What’s New…'))
  // No callback, no item.
  const without = applicationMenu({
    platform: 'linux',
    file,
    updateItems: [check],
    newWindow: () => {},
    gettingStarted: () => {}
  })
  assert.equal(
    find(without, (entry) => entry.label === 'What’s New…'),
    undefined
  )
})

const OPPORTUNITIES = 'Find Website Opportunities…'
const opportunities = (visible, asked = []) => ({ visible, open: () => asked.push('open') })

test('Help › Find Website Opportunities…: after What’s New, behind a separator, on every platform', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const asked = []
    const menu = applicationMenu({
      platform,
      file,
      updateItems: [check],
      newWindow: () => {},
      gettingStarted: () => {},
      whatsNew: () => {},
      websiteOpportunities: opportunities(true, asked)
    })
    const help = menu.find((item) => item.role === 'help')
    const labels = shape(help.submenu).map((item) => item.label ?? item.type)
    assert.deepEqual(
      labels.slice(0, 4),
      [GETTING_STARTED, 'What’s New…', 'separator', OPPORTUNITIES],
      platform
    )
    const item = help.submenu[3]
    assert.equal(item.id, 'tracy-website-opportunities')
    assert.equal(item.visible, true)
    assert.equal(help.submenu[2].visible, true)
    item.click()
    assert.deepEqual(asked, ['open'], platform)
  }
})

test('Find Website Opportunities… is not shown (visible: false, its separator too) while the switch is off', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const menu = applicationMenu({
      platform,
      file,
      updateItems: [check],
      newWindow: () => {},
      gettingStarted: () => {},
      whatsNew: () => {},
      websiteOpportunities: opportunities(false)
    })
    const help = menu.find((item) => item.role === 'help')
    assert.deepEqual(
      help.submenu.slice(2, 4).map((item) => item.visible),
      [false, false],
      platform
    )
    assert.equal(help.submenu[3].id, 'tracy-website-opportunities')
  }
})

test('without the website opportunities state, the menus are exactly as before', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const input = {
      platform,
      file,
      updateItems: [check],
      newWindow: () => {},
      gettingStarted: () => {},
      whatsNew: () => {}
    }
    assert.deepEqual(
      shape(applicationMenu({ ...input, websiteOpportunities: undefined })),
      shape(applicationMenu(input))
    )
  }
})

test("the caption row's Application menu has Find Website Opportunities… too", () => {
  const asked = []
  const items = captionMenu('application', {
    file,
    updateItems: [check],
    newWindow: () => {},
    editKey: () => {},
    gettingStarted: () => {},
    whatsNew: () => {},
    websiteOpportunities: opportunities(true, asked)
  })
  const at = items.findIndex((entry) => entry.id === 'tracy-website-opportunities')
  assert.ok(at > 0)
  assert.equal(items[at].label, OPPORTUNITIES)
  assert.equal(items[at - 1].type, 'separator')
  assert.equal(items[at - 2].label, 'What’s New…')
  items[at].click()
  assert.deepEqual(asked, ['open'])
  const hidden = captionMenu('application', {
    file,
    updateItems: [check],
    newWindow: () => {},
    editKey: () => {},
    gettingStarted: () => {},
    whatsNew: () => {},
    websiteOpportunities: opportunities(false)
  })
  assert.equal(find(hidden, (entry) => entry.id === 'tracy-website-opportunities').visible, false)
})
