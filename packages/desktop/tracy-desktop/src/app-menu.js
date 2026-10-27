/**
 * The application menu on each operating system, and the two menus dsh's Windows caption row pops up.
 * Pure templates with the platform passed in (test/app-menu.test.mjs); shell/main.ts builds them.
 *
 * - macOS: Electron's default menu, except File (New Window, then dsh's Close Page item) and Tracy's
 *   update item under About when the updater runs.
 * - Windows and Linux: File (New Window on Ctrl+Shift+N, Close Page, Quit), Edit, View, Window, and
 *   Help with the update item.
 * - Every platform, once the first-run screen exists: Help › Getting started with Tracy Cowork,
 *   What's New…, and Find Website Opportunities… while the operator's switch is on
 *   (src/website-opportunities-menu.js)
 *   (macOS gets a Help menu for it; Windows also in the caption row's Application menu). Linux shows it as the window's menu bar, hidden until Alt
 *   (src/window-chrome.js). A Windows window has no menu bar under its hidden title bar — its
 *   accelerators still work — so dsh's caption row draws Application and Edit buttons in the page,
 *   and each pops up `captionMenu`.
 *
 * `file` is dsh's `installDesktopShortcuts().fileMenu()`: its Close Page item follows the page's own
 * binding, so the page, not the window, decides what that key closes.
 */

/** @typedef {import('electron').MenuItemConstructorOptions} MenuItem */
/** @typedef {{ visible: boolean, open: () => void }} WebsiteOpportunities */

const SEPARATOR = /** @type {MenuItem} */ ({ type: 'separator' })

/**
 * @param {string} accelerator
 * @param {() => void} newWindow
 * @returns {MenuItem}
 */
function newWindowItem(accelerator, newWindow) {
  return { id: 'tracy-new-window', label: 'New Window', accelerator, click: () => newWindow() }
}

/**
 * Help › Getting started (as Orca's "Getting Started with Orca"): the page opens the first-run
 * screen again (src/onboarding-bridge.js `openOnboarding`). Absent when no callback is given.
 * @param {(() => void) | undefined} gettingStarted
 * @param {(() => void) | undefined} [whatsNew]
 * @returns {MenuItem[]}
 */
function gettingStartedItems(gettingStarted, whatsNew) {
  return [
    ...(gettingStarted === undefined
      ? []
      : [
          {
            id: 'tracy-getting-started',
            label: 'Getting started with Tracy Cowork',
            click: () => gettingStarted()
          }
        ]),
    // Help › What's New… (tasks/todo-desktop-update-policy.md D6): Settings › Help & about, where the
    // running version's notes are; absent without a callback.
    ...(whatsNew === undefined
      ? []
      : [{ id: 'tracy-whats-new', label: 'What’s New…', click: () => whatsNew() }])
  ]
}

/**
 * Help › Find Website Opportunities…, behind its own separator. `visible`, not `enabled`: an
 * operator who switched it off sees no item. Absent without the state.
 * @param {WebsiteOpportunities | undefined} state
 * @returns {MenuItem[]}
 */
function websiteOpportunitiesItems(state) {
  if (state === undefined) return []
  const { visible, open } = state
  return [
    { type: 'separator', visible },
    { id: 'tracy-website-opportunities', label: 'Find Website Opportunities…', visible, click: () => open() }
  ]
}

/**
 * The Getting started group with Website Opportunities after it.
 * @param {(() => void) | undefined} gettingStarted
 * @param {(() => void) | undefined} whatsNew
 * @param {WebsiteOpportunities | undefined} opportunities
 * @returns {MenuItem[]}
 */
function startedItems(gettingStarted, whatsNew, opportunities) {
  return [...gettingStartedItems(gettingStarted, whatsNew), ...websiteOpportunitiesItems(opportunities)]
}

/**
 * The update items, or — while no updater runs (a source run, a Preview, a build whose updater is
 * not wired yet) — the same item greyed out, so the menu does not change shape when it arrives.
 * @param {MenuItem[]} updateItems
 * @returns {MenuItem[]}
 */
function helpItems(updateItems) {
  return updateItems.length > 0
    ? updateItems
    : [{ id: 'tracy-check-updates', label: 'Check for Updates…', enabled: false }]
}

/**
 * @param {{ submenu?: unknown }} file
 * @returns {MenuItem[]} dsh's File items (Close Page).
 */
function fileItemsOf(file) {
  return Array.isArray(file.submenu) ? file.submenu : []
}

/**
 * The application menu template.
 * @param {{ platform: string, file: MenuItem, updateItems: MenuItem[], newWindow: () => void,
 *   gettingStarted?: () => void, whatsNew?: () => void, websiteOpportunities?: WebsiteOpportunities }} input
 * @returns {MenuItem[]}
 */
function applicationMenu({
  platform,
  file,
  updateItems,
  newWindow,
  gettingStarted,
  whatsNew,
  websiteOpportunities
}) {
  const items = fileItemsOf(file)
  const started = startedItems(gettingStarted, whatsNew, websiteOpportunities)
  if (platform === 'darwin') {
    // The standard macOS app menu, spelled out only when Tracy has items to put under About.
    const appMenu =
      updateItems.length === 0
        ? { role: 'appMenu' }
        : {
            role: 'appMenu',
            submenu: [
              { role: 'about' },
              ...updateItems,
              SEPARATOR,
              { role: 'services' },
              SEPARATOR,
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              SEPARATOR,
              { role: 'quit' }
            ]
          }
    return [
      /** @type {MenuItem} */ (appMenu),
      { ...file, submenu: [newWindowItem('Command+Shift+N', newWindow), SEPARATOR, ...items] },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      // macOS adds its own Search field to the Help menu.
      ...(started.length > 0 ? [{ role: 'help', submenu: started }] : [])
    ]
  }
  return [
    {
      ...file,
      submenu: [newWindowItem('Ctrl+Shift+N', newWindow), SEPARATOR, ...items, SEPARATOR, { role: 'quit' }]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu:
        started.length > 0 ? [...started, SEPARATOR, ...helpItems(updateItems)] : helpItems(updateItems)
    }
  ]
}

/**
 * One Edit item that sends its key to the editor (dsh's `sendEditingKey`): the editor keeps its own
 * history and listens to keys, not to Chromium's native undo stack.
 * @param {string} label
 * @param {string} keyCode
 * @param {Array<'control'>} modifiers
 * @param {string | undefined} accelerator
 * @param {(keyCode: string, modifiers: Array<'control'>) => void} editKey
 * @returns {MenuItem}
 */
function editItem(label, keyCode, modifiers, accelerator, editKey) {
  return {
    label,
    ...(accelerator === undefined ? {} : { accelerator }),
    click: () => editKey(keyCode, modifiers)
  }
}

/**
 * A menu dsh's Windows caption row asks for (`DESKTOP_IPC.windowsMenu`).
 * @param {unknown} name - `application` or `edit`, as the page sent it.
 * @param {{ file: MenuItem, updateItems: MenuItem[], newWindow: () => void,
 *   editKey: (keyCode: string, modifiers: Array<'control'>) => void, gettingStarted?: () => void,
 *   whatsNew?: () => void, websiteOpportunities?: WebsiteOpportunities }} input
 * @returns {MenuItem[] | null} null for a name the app has no menu for.
 */
function captionMenu(
  name,
  { file, updateItems, newWindow, editKey, gettingStarted, whatsNew, websiteOpportunities }
) {
  if (name === 'application')
    return [
      newWindowItem('Ctrl+Shift+N', newWindow),
      SEPARATOR,
      ...fileItemsOf(file),
      SEPARATOR,
      ...startedItems(gettingStarted, whatsNew, websiteOpportunities),
      ...helpItems(updateItems),
      SEPARATOR,
      { role: 'quit', label: 'Exit' }
    ]
  if (name === 'edit') {
    const control = /** @type {Array<'control'>} */ (['control'])
    return [
      editItem('Undo', 'Z', control, 'Ctrl+Z', editKey),
      editItem('Redo', 'Y', control, 'Ctrl+Y', editKey),
      SEPARATOR,
      editItem('Cut', 'X', control, 'Ctrl+X', editKey),
      editItem('Copy', 'C', control, 'Ctrl+C', editKey),
      editItem('Paste', 'V', control, 'Ctrl+V', editKey),
      editItem('Delete', 'Delete', [], undefined, editKey),
      SEPARATOR,
      editItem('Select All', 'A', control, 'Ctrl+A', editKey)
    ]
  }
  return null
}

module.exports = { applicationMenu, captionMenu }
