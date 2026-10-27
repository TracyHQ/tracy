// site-model.mjs — the neutral source contract (ADR 0016), version 1.
//
// WHAT THIS IS. One description of what a SOURCE says, in words that belong to no CMS. Every
// source adapter emits this shape; every CMS skill compiles it into its own storage model. The
// skills stay different where they must (a page is stored very differently in three CMSes) and
// share the one thing they had been rewriting three times: reading a source.
//
// WHY THE VOCABULARY IS GUARDED. This file is written inside the EmDash skill, so the EmDash
// words are the ones most likely to leak in and quietly make the contract un-neutral for the
// other two. A test greps this directory for the storage words of all three CMSes; keep them out
// of names, values and comments alike. Say "type" and "record", not the word one CMS happens to
// use for the same idea.
//
// NOT A SCHEMA LANGUAGE. Plain data plus a validator (validate.mjs) — the repo has no JSON Schema
// runtime, and a hand-written validator is what lets every rule carry a negative fixture.

/** Contract identifier written into every file, and checked on read. */
export const SITE_MODEL_SCHEMA = 'tracy-site-model/v1'

/**
 * What the source was, and how well the output can be held against it.
 *
 * `parity: measured` means the source can be rendered and compared two-sided. `declared` means
 * the numbers were written down by a person from frames or a brief — the output still owes the
 * same result, only the yardstick is weaker. This distinction is the reason a brief and a full
 * site can share one contract without pretending they prove the same thing.
 */
export const SOURCE_KINDS = ['html', 'canvas', 'url', 'frames', 'joomla', 'wordpress', 'brief']
export const SOURCE_PARITY = ['measured', 'declared']

/** How many records a type holds. `single` is one record per locale; `list` is many. */
export const TYPE_MODES = ['single', 'list']

/**
 * Field kinds a source can describe. Deliberately small: a source says what a value IS, not which
 * widget edits it — picking the widget is the compiler's job, and it differs per CMS.
 *
 * `prose` is multi-paragraph text that may carry inline markup. It is NOT a licence to paste a
 * whole rendered page: a record whose prose field holds the page's own chrome is the failure this
 * contract exists to prevent, and the validator rejects it.
 */
export const FIELD_TYPES = [
  'text',
  'prose',
  'number',
  'boolean',
  'date',
  'url',
  'email',
  'image',
  'file',
  'link',
  'group',
  'reference'
]

/** Publication state a source can report. Anything else is the compiler's business. */
export const RECORD_STATES = ['published', 'draft']

/** Route kinds, so a compiler knows which routes it must be able to serve. */
export const ROUTE_KINDS = ['page', 'list', 'detail', 'archive', 'system']

/** Top-level keys, in the order a written file should carry them. */
export const TOP_LEVEL_KEYS = [
  '$schema',
  'source',
  'locales',
  'site',
  'types',
  'taxonomies',
  'records',
  'menus',
  'routes',
  'redirects',
  'media',
  'tokens',
  'facts'
]

/** Keys a file must have; the rest may be absent when the source genuinely has nothing to say. */
export const REQUIRED_KEYS = ['$schema', 'source', 'locales', 'types', 'records']

/** An empty, valid-shaped model — adapters start here so absent keys never mean "forgot". */
export function emptyModel({ kind, parity = 'measured', origin = null } = {}) {
  return {
    $schema: SITE_MODEL_SCHEMA,
    source: { kind, parity, origin, capturedAt: new Date().toISOString() },
    locales: { default: 'en', all: ['en'] },
    site: {},
    types: [],
    taxonomies: [],
    records: [],
    menus: [],
    routes: [],
    redirects: [],
    media: [],
    tokens: {},
    facts: []
  }
}
