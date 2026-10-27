/**
 * The sentences the HOST half of a Build puts in front of a customer, keyed by a stable code.
 *
 * The host does not know which language the person reading is in, and should not pick one: a stage
 * that stops writes its English `detail` for the log and the agent, and beside it a `detailCode`
 * (plus `detailParams`) the client renders through `t('host.<code>')` in the interface language
 * (spec #730). A code the client does not know, or a detail with no code, is shown as written.
 *
 * ONE TABLE, TWO READERS. The host fills a template from here for the English `detail`; the client
 * strings spread the same table into their `en` (`hostKeys`), so the English a person reads when no
 * translation exists is the English the host wrote, and the translation gate sees every key.
 *
 * What gets a code: a fixed sentence Tracy wrote, possibly with names, numbers or versions as
 * parameters. What does not: text that comes from somewhere else (a site's own refusal words, a
 * seeder's or a container's output, a model's message). That text is a diagnosis in the language
 * of the tool that wrote it, and it travels unchanged.
 *
 * Each CMS plugin keeps its own sentences in its own table (`src/messages.mjs` there) and passes it
 * as `table`; the codes below are the ones every plugin can say.
 */

/** Sentences every Build plugin can say. Codes are part of the job file: never rename one. */
export const HOST_MESSAGES = Object.freeze({
  SITE_UNNAMED_START: 'This build names no site. Start it from the Build tab, which makes one.',
  SITE_UNNAMED: 'This build names no site.',
  NO_DOOR: 'This lane cannot reach the site (site tools are not loaded).',
  NOT_AN_INSPIRATION: '"{id}" is not a design template.',
  LOOK_UNREACHABLE: 'The published look could not be reached just now. Try again in a moment.',
  SITE_SILENT: '{site} did not answer.',
  WRONG_PLATFORM: '{site} runs {cms}; this build is for {platform}.',
  NO_COPY: 'Content generation is unavailable on this host.',
  COPY_LANG_FAILED: '{lang} · not written ({reason})',
  COPY_POLL_FAILED: 'The copy job answered {status}.',
  COPY_NO_ANSWER: 'The model did not answer.',
  COPY_TIMEOUT: 'The words took too long to arrive.',
  NO_SEEDER: 'The content seeder is unavailable on this host.',
  SEEDER_STOPPED: 'The seeder stopped.',
  NO_EXECUTOR: 'The required stage has no executor.',
  // The refusals a person can read something into (`refusalWords`); the code is the door's own.
  NOT_SIGNED_IN:
    'Nobody is signed in behind this build any more. Reload this page to sign in again, then run the step once more.',
  ACTOR_NOT_ACCEPTED:
    "Tracy did not accept this workspace's own signature, so it cannot act on the site. This is a Tracy setting, not your sign-in: an operator has to repair it, and signing in again will not help.",
  SEAT_NOT_AUTHORIZED: 'The account behind this build holds no seat on this site.',
  NOT_SITE_OWNER: 'This step needs the owner or an admin of the site.',
  COMPONENT_NOT_REGISTERED: 'This site is not connected to Tracy, so the build cannot read or change it.',
  COMPONENT_UNAUTHORIZED:
    'The site no longer accepts the key Tracy holds for it; somebody has to reconnect it.',
  // Refusals of the `start` door (`messageCode` on the answer), read by the Build form.
  START_NO_SESSION: 'Start the build from an open chat session.',
  START_DESIGN_SYSTEMS_OFF:
    'Building from a design template is off on this Tracy, so "{id}" cannot be built. Pick a template on Design templates.',
  START_MISSING_REQUIRED: 'Answer the required questions first: {missing}.',
  START_BUILD_BUSY: 'Another session is already building this site.'
})

/** The key prefix a host sentence carries in a Build plugin's client namespace. */
export const HOST_KEY_PREFIX = 'host.'

/**
 * Fill `{name}` holes the way the client's `t` does; an unknown hole stays as written.
 * @param {string} template @param {Record<string, string | number>} params
 */
function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (whole, key) => (key in params ? String(params[key]) : whole))
}

/**
 * One host sentence: its English text, filled, with the code and the parameters it was filled with.
 * @param {string} code - a key of `table`.
 * @param {Record<string, string | number>} [params]
 * @param {Readonly<Record<string, string>>} [table] - the plugin's own table, when the code is the plugin's.
 * @returns {{ text: string, code: string, params: Record<string, string | number> }}
 * @throws when `code` is in neither `table` nor the shared table — a typo here would ship a sentence nobody can translate.
 */
export function hostMessage(code, params = {}, table = HOST_MESSAGES) {
  const template = table[code] ?? HOST_MESSAGES[/** @type {keyof typeof HOST_MESSAGES} */ (code)]
  if (typeof template !== 'string') throw new Error(`Unknown host message code: ${code}`)
  return { text: fill(template, params), code, params }
}

/**
 * The fields a stage result carries for one host sentence: `detail` (English), `detailCode`, and
 * `detailParams` when the sentence has any.
 * @param {string} code @param {Record<string, string | number>} [params] @param {Readonly<Record<string, string>>} [table]
 * @returns {{ detail: string, detailCode: string, detailParams?: Record<string, string | number> }}
 */
export function detailOf(code, params = {}, table = HOST_MESSAGES) {
  const said = hostMessage(code, params, table)
  return {
    detail: said.text,
    detailCode: said.code,
    ...(Object.keys(params).length > 0 ? { detailParams: params } : {})
  }
}

/**
 * The same sentence as the fields of a door's refusal answer: `message`, `messageCode`,
 * `messageParams`.
 * @param {string} code @param {Record<string, string | number>} [params] @param {Readonly<Record<string, string>>} [table]
 * @returns {{ message: string, messageCode: string, messageParams?: Record<string, string | number> }}
 */
export function messageOf(code, params = {}, table = HOST_MESSAGES) {
  const said = hostMessage(code, params, table)
  return {
    message: said.text,
    messageCode: said.code,
    ...(Object.keys(params).length > 0 ? { messageParams: params } : {})
  }
}

/**
 * A table as client strings: every code under `host.`, the English as written.
 * @template {Readonly<Record<string, string>>} T
 * @param {T} table
 * @returns {{ [K in keyof T & string as `host.${K}`]: T[K] }}
 */
export function hostKeys(table) {
  return /** @type {any} */ (
    Object.fromEntries(Object.entries(table).map(([code, text]) => [`${HOST_KEY_PREFIX}${code}`, text]))
  )
}
