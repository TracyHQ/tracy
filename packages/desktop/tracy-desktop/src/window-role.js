/**
 * Which app window a page is in: the main window (`primary`) or a second one (`secondary`, opened by
 * Cmd+click or File › New Window). The main process sets it on the renderer's command line when it
 * creates the window (`webPreferences.additionalArguments`), so the preload reads it synchronously,
 * before the page's first script — early enough to give a second window its own storage copy
 * (src/window-storage.js) and to expose `tracyDesktop.window.role`.
 */

const ROLE_ARG = '--tracy-window='
const ROLES = new Set(['primary', 'secondary'])

/**
 * @param {'primary' | 'secondary'} role
 * @returns {string} the command-line argument naming it.
 */
function windowRoleArgument(role) {
  if (!ROLES.has(role)) throw new Error(`unknown window role: ${role}`)
  return `${ROLE_ARG}${role}`
}

/**
 * @param {readonly string[] | undefined} argv - the renderer's `process.argv`.
 * @returns {'primary' | 'secondary'} the window's role; anything missing or unknown is the main window.
 */
function windowRoleOf(argv) {
  const value = (argv ?? []).find((arg) => arg.startsWith(ROLE_ARG))?.slice(ROLE_ARG.length)
  return value === 'secondary' ? 'secondary' : 'primary'
}

module.exports = { windowRoleArgument, windowRoleOf }
