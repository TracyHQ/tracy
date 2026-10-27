/**
 * The query the main process loads the local waiting page with (src/signin-waiting.html), while a
 * desktop sign-in round waits for the browser. The page is static and holds no secret: it shows the
 * match code, a Cancel link back to `<home>/login`, the address typed (email sign-in), the Setup frame
 * on a first run, and its words in the OS language (tasks/todo-desktop-onboard-v2.md, contract 4 and
 * council c). The words travel in the query because the page may fetch nothing (CSP `default-src
 * 'none'`), and must still work offline.
 */
const { pickInterfaceLanguage } = require('./interface-language.js')
const STRINGS = require('./signin-waiting-strings.json')

/**
 * @param {object} input
 * @param {string} input.code - the round's match code.
 * @param {string} input.home - the origin the window was opened on.
 * @param {unknown} [input.email] - the address typed on the sign-in page, if any.
 * @param {boolean} input.setup - a first run: draw the Setup frame.
 * @param {unknown} input.languages - `app.getPreferredSystemLanguages()`.
 * @returns {Record<string, string>} the query for `loadFile`.
 */
function waitingQuery({ code, home, email, setup, languages }) {
  const lang = pickInterfaceLanguage(languages)
  const query = { code: String(code ?? ''), home: String(home), lang, t: JSON.stringify(STRINGS[lang]) }
  const address = typeof email === 'string' ? email.trim() : ''
  if (address !== '') query.email = address
  if (setup) query.setup = '1'
  return query
}

module.exports = { waitingQuery }
