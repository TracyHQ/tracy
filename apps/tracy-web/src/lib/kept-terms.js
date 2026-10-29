/**
 * The words every translation keeps verbatim, for tracy-web's own translations.
 *
 * A copy rather than an import: this process ships alone in its own image, which copies only
 * `apps/tracy-web/src`, so `packages/locale/tracy-locale-vi/terms.ts` is not there at run time.
 * `test/kept-terms-copy.test.mjs` holds this list and `droppedTerms` equal to the originals
 * (`terms.ts` and `scripts/lib/dsh-locale-terms.ts`), so the copy cannot drift in silence.
 */
export const KEEP_VERBATIM_TERMS = Object.freeze([
  'agent',
  'API',
  'blog',
  'brand',
  'commit',
  'deploy',
  'file',
  'fleet',
  'JSON',
  'MCP',
  'model',
  'plugin',
  'proposal',
  'release',
  'session',
  'site',
  'Sitespace',
  'Sitespaces',
  'skill',
  'token',
  'URL',
  'webhook',
  'workspace',
  'admin',
  'backup',
  'chat',
  'domain',
  'download',
  'email',
  'folder',
  'link',
  'log',
  'preview',
  'prompt',
  'restore',
  'sandbox',
  'tab',
  'template',
  'terminal',
  'theme',
  'upload'
])

/**
 * Whether the text holds this term, case-insensitive on ASCII word boundaries. Only an English
 * plural ending is allowed after it (`files`), never a longer word (`deployment` is not `deploy`),
 * and a compound such as `Templatevorschau` does not count: German writes `Template-Vorschau`.
 * @param {string} text
 * @param {string} term
 */
export function hasTerm(text, term) {
  return new RegExp(`\\b${term}(?:s|es)?\\b`, 'i').test(text)
}

/**
 * The kept terms the English source holds and the translation dropped.
 * @param {string} source
 * @param {string} translated
 * @param {readonly string[]} [terms]
 */
export const droppedTerms = (source, translated, terms = KEEP_VERBATIM_TERMS) =>
  terms.filter((term) => hasTerm(source, term) && !hasTerm(translated, term))
