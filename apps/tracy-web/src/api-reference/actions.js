/**
 * WHAT EACH ACTION OF THE APPLY DOOR DOES, for the public API reference (`/docs/api`).
 *
 * `POST /api/sites/{site}/apply` takes `{action, params}`; `APPLY_RULES` in `sites/route.js` is the
 * allowlist and the toolset gate. This table is the human half of the same list: what the action is
 * for, which platforms answer it, what `params` it takes and which Claude Cowork plugin release it
 * needs. A test (`test/api-reference.test.mjs`) keeps its keys equal to `APPLY_RULES`, so an action
 * added to the door without a line here is a red build, not a silently undocumented verb.
 *
 * Shape of one entry:
 *   summary      one line, imperative, no trailing period
 *   description  a short paragraph (markdown allowed)
 *   writes       true when the call changes the site (mirrors `APPLY_READS_ONLY` in the door)
 *   platforms    subset of ['joomla', 'wordpress', 'emdash']
 *   params       a JSON Schema object for `params` (type: 'object', properties, required)
 *   requires     optional { joomla?: '<plugin version>', wordpress?: '<plugin version>' }
 *   example      optional example `params` object
 *
 * The toolset each action needs is NOT written here: the reference reads it from `APPLY_RULES`
 * through `toolsetOf` passed to the spec builder, so the two cannot disagree.
 */

// Platform sets, as the Claude Cowork plugins' action switches answer them.
const BOTH = ['joomla', 'wordpress']
const JOOMLA = ['joomla']
const WORDPRESS = ['wordpress']
const ALL = ['joomla', 'wordpress', 'emdash']

/** An action that takes no params. */
const NO_PARAMS = { type: 'object', properties: {}, additionalProperties: false }

/** The undo receipt every logged write is grouped under. */
const APPLY_ID = {
  type: 'string',
  minLength: 1,
  description:
    'Names the receipt this write is recorded under. Every write sharing one apply_id is undone together by `apply.revert`; use one per item of a request.'
}

/** A retry key: the same value on a retry of the same change, a new one for a different change. */
const REQUEST_ID = {
  type: 'string',
  pattern: '^[a-zA-Z0-9._:-]{1,100}$',
  description:
    'Idempotency key. Send the same value when retrying after a lost reply (the stored result is answered again); a new value for a different change.'
}

/** Content kinds each platform's writer knows (Joomla `SiteWriter::KINDS`, WordPress `SiteWriter::KINDS`). */
const JOOMLA_KINDS = [
  'article',
  'category',
  'tag',
  'field',
  'menuItem',
  'menutype',
  'redirect',
  'banner',
  'bannerClient',
  'contact',
  'newsfeed',
  'language',
  'articleAssociation',
  'menuAssociation',
  'moduleAssignment',
  'languageFilter',
  'module',
  'templateStyle',
  'user',
  'extensionParams',
  // One stored custom-field value (`#__fields_values`, id = field_id × 10^9 + item_id), writable on
  // every Joomla site from the plugin release that derives imported contracts.
  'fieldValue',
  // An author's visitor-facing profile field (`#__user_profiles` `profile.aboutme`, `profile.user_jobtitle`,
  // `profile.user_tagline`; id = user_id × 100 + field), plugin 0.24.13.
  'userProfile'
]
// `usermeta`: an author's bio and a theme's job title or tagline (the visitor-facing user meta only), plugin 0.18.9.
const WORDPRESS_KINDS = ['post', 'postmeta', 'option', 'templatePart', 'term', 'menuItem', 'usermeta']
const KIND = {
  type: 'string',
  enum: [...JOOMLA_KINDS, ...WORDPRESS_KINDS.filter((kind) => !JOOMLA_KINDS.includes(kind))],
  description: `Record kind. Joomla: ${JOOMLA_KINDS.join(', ')}. WordPress: ${WORDPRESS_KINDS.join(', ')}.`
}
/**
 * The kinds `content.list` and `content.get` take: the writer's own, and on WordPress `pattern` — a block
 * pattern registered by the theme or a plugin, read-only (WordPress plugin 0.17.0 lists them; `content.get`
 * reads one by name since 0.15.0). Never a write kind: the plugin refuses to write a pattern.
 */
const READ_KIND = { ...KIND, enum: [...KIND.enum, 'pattern'] }
const RECORD_ID = { type: 'integer', minimum: 0, description: 'Numeric record id.' }
const RECORD_KEY = {
  type: 'string',
  description:
    'WordPress only: the record key where a kind has no numeric id — an option name, a template part slug (`header`, `footer`), a postmeta key or a term taxonomy.'
}
const TABLES = {
  type: 'array',
  minItems: 1,
  items: { type: 'string' },
  description: 'Full table names, including the site’s table prefix (see `db.tables`).'
}
const PACKAGE_URL = {
  type: 'string',
  format: 'uri',
  description: 'An https address of a `.zip` package. The site downloads it itself.'
}

/** @type {Record<string, {summary: string, description: string, writes: boolean, platforms: string[], params: object, requires?: Record<string, string>, example?: object}>} */
export const APPLY_ACTION_DOCS = {
  'demo.research': {
    summary: 'Read and plan an assigned agent demo',
    description:
      'Private agent-demo/1 capability for the exact assigned site, account and chat session, with a current content seat. Seat keys are refused. Reads the frozen research catalogue and paginated sources/media, saves or reads the immutable editorial plan, and imports only planned frozen media IDs. Import verifies manifest membership, bytes hash and revocation and keeps a durable uncertainty/receipt ledger. It never accepts an arbitrary URL or object key. Native content writes continue through the existing content tools.',
    writes: true,
    platforms: ALL,
    params: {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'structure.read', 'plan.read', 'plan.save', 'media.import', 'media.look', 'guard']
        },
        part: {
          type: 'string',
          enum: ['catalogue', 'profile', 'brand', 'sources', 'posts', 'media', 'reviews', 'ratings']
        },
        offset: { type: 'integer', minimum: 0 },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description:
            'Records a `structure.read` page holds, at most 200 (default 200); a `read` page of research, at most 50 (default 20).'
        },
        assetId: { type: 'string' },
        rowIndex: { type: 'integer', minimum: 0 },
        plan: { type: 'object' }
      },
      additionalProperties: false
    }
  },
  info: {
    summary: 'Read the site’s software versions',
    description:
      'Answers the PHP version, the CMS version (`joomla` or `wordpress`) and the Claude Cowork plugin version installed on the site. Use it to learn what the site runs before choosing an action.',
    writes: false,
    platforms: BOTH,
    params: NO_PARAMS
  },
  'content.list': {
    summary: 'List one page of records of a kind',
    description:
      'Answers `{kind, offset, items}`: record summaries, paged by `offset` and `limit` (at most 200, or 25 with `include_body`). An empty page means you are past the end. On WordPress only `kind: "post"` is listed (narrow with `post_type` or look up one slug with `name`); read other kinds with `content.get`. To find a record by part of its title, send `search` instead of paging. On WordPress, `kind: "pattern"` lists the block patterns the theme and plugins register (WordPress plugin 0.17.0+): `{kind, items:[{name, title, categories, description, chars}], matched, offset, limit}`, sorted by name, `limit` from 1 to 200 (default 50), narrowed by `search` and `category`; a page stops before 64 KB and then carries `truncated: true`. Patterns hidden from the inserter are left out. An older plugin refuses the kind (`bad_params`). Read one pattern’s markup with `content.get {kind: "pattern", key: <name>}`. `kind: "usermeta"` (WordPress plugin 0.18.9) lists the authors and the fields of theirs a visitor reads, `{id, name, meta: {description, <theme job title or tagline key>}}`; `kind: "userProfile"` (Joomla plugin 0.24.13) lists those profile fields, `{id, user_id, name, field, value}`.',
    writes: false,
    platforms: BOTH,
    params: {
      type: 'object',
      properties: {
        kind: {
          ...READ_KIND,
          description:
            'Record kind to list. Default `article` on Joomla, `post` on WordPress; `pattern` lists the registered block patterns (WordPress plugin 0.17.0+).'
        },
        offset: { type: 'integer', minimum: 0, default: 0 },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Default 100 (25 with include_body).'
        },
        include_body: {
          type: 'boolean',
          description: 'Return full rows instead of summaries (smaller pages).'
        },
        post_type: { type: 'string', description: 'WordPress only: narrow posts to one post type.' },
        name: { type: 'string', description: 'WordPress only: find the post with this slug.' },
        search: {
          type: 'string',
          maxLength: 200,
          description:
            'Keep the records whose title holds this text, ignoring case (Joomla: title or alias; WordPress: title or slug, in every language). One piece of text, not split into words; at most 200 characters; blank filters nothing. Read by Joomla plugin 0.20.0+ and WordPress plugin 0.16.0+ (the action itself is older: see `requires`); an older plugin ignores it, so the relay refuses the answer (501 `LIST_SEARCH_UNSUPPORTED`) and returns no rows: page with `offset` and `limit` (every kind takes them), or read pages, articles and shared records with `content.read`. The answer carries `search` (the text as cleaned) and `matched` (every match, whatever `offset` and `limit` are). Kinds with no title (Joomla `user`, `redirect`, `extensionParams`, `languageFilter`, the association kinds, `fieldValue`; WordPress `templatePart`, `template`) are refused `bad_params`. With `kind: "pattern"` it matches a pattern’s name, title, description or keywords (WordPress plugin 0.17.0+), and the answer echoes it.'
        },
        category: {
          type: 'string',
          minLength: 1,
          description:
            'WordPress, `kind: "pattern"` only: keep the patterns filed under this category slug (`banner`, `call-to-action`, …), matched exactly. Read by WordPress plugin 0.17.0+; an empty value is refused `bad_params`, and the answer echoes it.'
        }
      }
    },
    requires: { joomla: '0.8.4', wordpress: '0.5.2' }
  },
  'content.get': {
    summary: 'Read one record exactly as the site holds it',
    description:
      'Answers the full row of one record — the same read the undo log takes before a write. Joomla addresses a record by `kind` and `id`; WordPress also by `key` for kinds without a numeric id (an option, a template part, a registered block pattern by its name). On WordPress a `post`, `templatePart` or `template` also answers `body_revision` (WordPress plugin 0.17.0+): the sha256 (64 hex) of the body a write replaces (`post_content`, a part’s or template’s `content`), theme file included; send it back as `expected_body_revision` on `content.update`.',
    writes: false,
    platforms: BOTH,
    params: {
      type: 'object',
      properties: {
        kind: {
          ...READ_KIND,
          description:
            'Record kind. Default `article` on Joomla, `post` on WordPress; `pattern` reads a registered block pattern by `key` (WordPress).'
        },
        id: RECORD_ID,
        key: RECORD_KEY
      }
    },
    requires: { joomla: '0.8.4', wordpress: '0.5.2' }
  },
  'core.manifest': {
    summary: 'List which of the site’s extensions ship with the CMS',
    description:
      'Answers the site’s own record of its core extensions (Joomla) or core packages (WordPress), and on Joomla the `platform` name. Use it to tell core from third-party software before installing or switching anything.',
    writes: false,
    platforms: BOTH,
    params: NO_PARAMS,
    requires: { joomla: '0.8.11', wordpress: '0.5.3' }
  },
  'extension.list': {
    summary: 'List the installed Joomla extensions',
    description:
      'Answers every extension installed on the Joomla site. Ask it before `extension.install` to learn whether an install is needed, and after it to confirm the package took.',
    writes: false,
    platforms: JOOMLA,
    params: NO_PARAMS,
    requires: { joomla: '0.3.0' }
  },
  'plugin.list': {
    summary: 'List the installed WordPress plugins',
    description:
      'Answers `{plugins}`: every plugin installed on the WordPress site and whether it is active.',
    writes: false,
    platforms: WORDPRESS,
    params: NO_PARAMS,
    requires: { wordpress: '0.2.0' }
  },
  'theme.list': {
    summary: 'List the installed WordPress themes',
    description: 'Answers `{themes}`: every theme installed on the WordPress site and which one is active.',
    writes: false,
    platforms: WORDPRESS,
    params: NO_PARAMS,
    requires: { wordpress: '0.2.0' }
  },
  'db.tables': {
    summary: 'List the database tables',
    description:
      'Answers `{tables, details}`: every table name with an estimated row count. Table prefixes are chosen at install time, so read the real names here before `db.dump` or any other table action.',
    writes: false,
    platforms: BOTH,
    params: NO_PARAMS
  },
  'content.batch': {
    summary: 'Write several Joomla records in one transaction',
    description:
      'Applies 1–100 record writes in one database transaction: all land or none do. A step may name a `key` and later steps refer to the id it created as `"$key"`. `expected` values are checked before a step writes (a mismatch is a conflict). Retrying with the same `request_id` answers the stored result. `user` and `extensionParams` are refused.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      required: ['apply_id', 'request_id', 'operations'],
      properties: {
        apply_id: APPLY_ID,
        request_id: REQUEST_ID,
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['kind', 'fields'],
            properties: {
              kind: {
                type: 'string',
                enum: JOOMLA_KINDS.filter((k) => k !== 'user' && k !== 'extensionParams')
              },
              id: {
                oneOf: [
                  { type: 'integer', minimum: 0 },
                  { type: 'string', pattern: '^\\$' }
                ],
                description: 'Record id, 0 to create, or `"$<key>"` for a record an earlier step created.'
              },
              fields: {
                type: 'object',
                description: 'Columns to write; a value `"$<key>"` is replaced by that id.'
              },
              expected: {
                type: 'object',
                description: 'Column values the row must still hold before writing.'
              },
              key: { type: 'string', description: 'Unique name for this step’s resulting id.' }
            }
          }
        }
      }
    },
    requires: { joomla: '0.13.0' }
  },
  'content.contract': {
    summary: 'Inspect or change a site built from a sealed quickstart through its content contract',
    description:
      'Works on the named content slots of a quickstart-built site, or of an imported site bound to the contract its plugin derived from its own database at import. `inspect` (the default), and every `*.plan` / `*.verify` operation, only read. `bind`, `apply`, `string`, and the `set`/`apply`/`revert`/`package`/`retire`/`restore` operations write. `apply` checks every change first and writes nothing if any is refused; a derived slot that no longer holds its value where it is stored is refused with `SLOT_UNWRITABLE`. After a derived write the plugin reads the page back: words the page does not show come back as a warning `{code: "WRITTEN_NOT_VISIBLE", severity: "warning", message, slotKey, url}` in `warnings`, and the answer stays `ok: true`. `string` (WordPress) overrides one gettext string a theme or plugin prints (`domain`, `msgid`, `context`, `locale`, `value`, `apply_id`): the value must keep every printf placeholder of the msgid and use only the tags the msgid uses, and `apply.revert` takes it back. `derive` builds an imported site’s contract; import provisioning runs it, and the Apply door refuses it to every seat (`CONTRACT_OPERATION_PROVISION_ONLY`). Language and demo-trim operations need a contract that ships that profile; a derived contract answers them `unsupported`.',
    writes: true,
    platforms: BOTH,
    params: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          default: 'inspect',
          enum: [
            'inspect',
            'bind',
            'apply',
            'string',
            'derive',
            'multilingual.plan',
            'multilingual.package',
            'multilingual.apply',
            'multilingual.verify',
            'multilingual.revert',
            'multilingual.retire',
            'multilingual.restore',
            'demoTrim.plan',
            'demoTrim.apply',
            'demoTrim.revert',
            'siteLanguage.plan',
            'siteLanguage.set',
            'siteLanguage.revert',
            'sourceLanguage.plan',
            'sourceLanguage.set',
            'sourceLanguage.revert'
          ],
          description:
            'WordPress answers `multilingual.retire` and `multilingual.restore` only; Joomla answers every multilingual operation. `string` is WordPress only. `derive` is refused at the Apply door (import provisioning runs it on the site directly).'
        },
        apply_id: {
          type: 'string',
          description:
            'Required by every writing operation, with a prefix per family: `contract-` (apply), `mlang-` (multilingual), `dtrim-` (demoTrim), `slang-` (siteLanguage), `srclang-` (sourceLanguage). One new apply_id per content revision.'
        },
        request_id: REQUEST_ID,
        changes: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description:
            '`apply`: 1–1500 slot values, `{"<slot key>": "<text>"}`, slot keys as `inspect` lists them.'
        },
        evidence: {
          type: 'object',
          additionalProperties: { type: 'string', maxLength: 8000 },
          description:
            '`apply`: per slot key, the customer’s own words backing a slot that requires evidence.'
        },
        expected_revision: {
          type: 'string',
          description:
            '`apply`: the whole-contract revision `inspect` answered. Refused when the site moved since.'
        },
        expected_content_revisions: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description:
            '`apply`: `{"<content id>": "<revision>"}` as `content.read` listed them; only the contents you change must be unchanged. Joomla 0.18.0 / WordPress 0.14.0 and later.'
        },
        contract: {
          type: 'string',
          description: 'WordPress `inspect`/`bind`: the contract profile to check against.'
        },
        domain: {
          type: 'string',
          pattern: '^[A-Za-z0-9_.-]{1,100}$',
          description: 'WordPress `string`: the text domain of the string (`default` for core).'
        },
        msgid: {
          type: 'string',
          description: 'WordPress `string`: the original string exactly as the code passes it to gettext.'
        },
        context: {
          type: 'string',
          description: 'WordPress `string`: the gettext context, for a string translated with one (`_x`).'
        },
        value: {
          type: 'string',
          maxLength: 2000,
          description:
            'WordPress `string`: what visitors read instead. Keeps every printf placeholder of `msgid` (`%s`, `%1$d`), no lone `%`, and only the tags `msgid` itself uses.'
        },
        locale: {
          type: 'string',
          description:
            'Joomla `multilingual.*` and `siteLanguage.*`, both `sourceLanguage.*`: the language tag, e.g. `vi-VN`. WordPress `string`: the WordPress locale the override is for, e.g. `en_US`.'
        },
        language: {
          type: 'string',
          description: 'WordPress `siteLanguage.set`: the edition to make the default, e.g. `vi`.'
        },
        translations: {
          type: 'object',
          description: 'Joomla `multilingual.apply`: the translated slot values.'
        },
        keep: {
          type: 'array',
          items: { type: 'string' },
          description: '`multilingual.retire`: the language editions to keep.'
        }
      }
    },
    requires: { joomla: '0.16.0', wordpress: '0.12.0' },
    example: {
      operation: 'apply',
      apply_id: 'contract-hero-2026-09-28',
      request_id: 'hero-title-1',
      expected_revision: '<revision from inspect>',
      changes: { 'hero.0': 'Fresh bread every morning' }
    }
  },
  'content.read': {
    summary: 'Read the site’s published content in one shape for every CMS',
    description:
      'The Content API: published pages, posts, menus and their fields, with ids, locales and per-content revisions. The relay adds `describe` (what the site holds), `view: "pages"` (a page list with a `version`), `changedSince` (what moved since that version), `ifVersion` (answers `notModified`) and `fields` (trim the answer).',
    writes: false,
    platforms: ALL,
    params: { $ref: '#/components/schemas/ContentReadParams' },
    requires: { joomla: '0.18.0', wordpress: '0.14.0' }
  },
  'content.update': {
    summary: 'Create, edit or move one record',
    description:
      'Writes the given `fields` of one record and records how to undo it under `apply_id`. Without an id (or with 0) it creates a record where the kind allows it. On Joomla, `parent_id` / `move_after` on an existing menu item, category or tag move it with everything under it; `fieldValue` writes one stored custom-field value (`id` = field_id × 1000000000 + item_id), only a text, textarea, editor or media field holding exactly one row. An author’s visitor-facing words: Joomla `userProfile` (`id` from `content.list`, field `value`; plugin 0.24.13) and WordPress `usermeta` (`id` = user id, `key` = `description` or a theme’s job title or tagline key, field `value`; plugin 0.18.9); never another field of a person’s account, never created. Answers `{kind, id, created}`; live at once.',
    writes: true,
    platforms: BOTH,
    params: {
      type: 'object',
      required: ['apply_id', 'kind', 'fields'],
      properties: {
        apply_id: APPLY_ID,
        kind: KIND,
        id: { ...RECORD_ID, description: 'The record to edit; left out or 0 creates one.' },
        key: RECORD_KEY,
        fields: {
          type: 'object',
          minProperties: 1,
          description:
            'Columns to write, e.g. WordPress post `post_title`, `post_content`, `post_status`; option `value`; Joomla article `title`, `introtext`, `state`.'
        },
        expected_body_revision: {
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
          description:
            'WordPress `post`, `templatePart` or `template` that exists: write only over the body this `body_revision` (from `content.get`) names. The plugin compares it with the body it holds inside its write lock; when the body changed since, nothing is written and the answer is `revision_stale` with the current `body_revision`. The answer of a write carries the new `body_revision` (`null` when its read-back failed). Read by WordPress plugin 0.17.0+; an older plugin ignores it and writes. Not a guard against an edit saved in the WordPress editor in the same instant.'
        }
      }
    },
    requires: { joomla: '0.7.2', wordpress: '0.3.0' },
    example: {
      apply_id: 'about-page-title',
      kind: 'post',
      id: 42,
      fields: { post_title: 'About our bakery' }
    }
  },
  'content.delete': {
    summary: 'Move one record to the trash',
    description:
      'Trashes one record and records it under `apply_id`, so `apply.revert` brings it back. Nothing is purged: Joomla sets the kind’s trash state, WordPress uses its own trash. Kinds without a trash are refused.',
    writes: true,
    platforms: BOTH,
    params: {
      type: 'object',
      required: ['apply_id', 'kind'],
      properties: { apply_id: APPLY_ID, kind: KIND, id: { ...RECORD_ID, minimum: 1 }, key: RECORD_KEY }
    },
    requires: { joomla: '0.8.13', wordpress: '0.6.0' }
  },
  'content.renderedWords': {
    summary: 'Replace words or a link a WordPress theme prints when one page renders',
    description:
      'Sent by Tracy’s agent alone, inside `content.replace`, once it found the words in no stored record: a browser session or a seat key is refused (`ACTION_AGENT_ONLY`). For words no stored record holds: a pattern a theme filter injects, or a literal in a template. `inspect` (`path`, `targets: [{kind: "text"|"attribute", name?: "href", old}]`) reads the page as printed and answers each target’s `candidates` (`anchor`, `count`, `where`, `excerpt`), the page’s `revision` and rules, and a `proof` valid for 15 minutes. `apply` writes replacement rules (`kind`, `name?`, `anchor`, `old`, `new`, `expected_matches`) for that page and locale, only when the whole set still applies to the page as it renders (`drift` otherwise), then purges the page caches and reads the page as a visitor (`render`). The same `request_id` again returns the first answer with `replayed: true`. `status` reads a scope’s rules and receipts. `apply.revert` takes an apply back. Only text inside one text node and the whole value of an `<a href>` are matched. A plugin that has the action says so with `rendered_words` in its `info` answer; an older one refuses the action.',
    writes: true,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: { type: 'string', enum: ['inspect', 'apply', 'status'] },
        path: { type: 'string', description: '`inspect`: the page’s path on the site, e.g. `/contact-us/`.' },
        targets: {
          type: 'array',
          items: { type: 'object' },
          description: '`inspect`: the words or link targets to find, as the page prints them.'
        },
        apply_id: APPLY_ID,
        request_id: {
          ...REQUEST_ID,
          description: '`apply`: the request’s own id, for a safe retry; `status`: the request to read.'
        },
        expected_revision: {
          type: 'integer',
          minimum: 0,
          description: '`apply`: the `revision` the inspection answered.'
        },
        proof: { type: 'string', description: '`apply`: the `proof` the inspection answered.' },
        rules: { type: 'array', items: { type: 'object' }, description: '`apply`: the replacement rules.' },
        post: { type: 'integer', minimum: 1, description: '`status`: the page’s post id, with `locale`.' },
        locale: { type: 'string', description: '`status`: the scope’s locale, with `post`.' }
      }
    }
  },
  'content.language': {
    summary: 'Set the language of a WordPress page and link its translations',
    description:
      'Files one post under a language in the site’s translation plugin (Polylang), adding the language if the site lacks it, and optionally links the posts that translate each other. Refused when the site has no translation plugin.',
    writes: true,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      required: ['apply_id', 'id', 'lang'],
      properties: {
        apply_id: APPLY_ID,
        id: { type: 'integer', minimum: 1, description: 'The post id.' },
        lang: {
          type: 'string',
          pattern: '^[a-zA-Z]{2}(-[a-zA-Z]{2})?$',
          description: 'Language code, e.g. `vi`.'
        },
        translations: {
          type: 'object',
          additionalProperties: { type: 'integer' },
          description: '`{"<lang>": <post id>}`: the posts that are translations of each other.'
        }
      }
    },
    requires: { wordpress: '0.9.0' }
  },
  'content.locate': {
    summary: 'Find which record printed an element on a page',
    description:
      'Given an element picked on a live page (its text, picture or render marks), answers which record and field printed it, with a short label and whether you may write it — a map, never content. Answered by Tracy from the site’s Content API. `warm: true` only prepares the index for that page. Says so when the evidence conflicts instead of guessing. A site with no Content API yet (a WordPress site whose content identity was never set up, an EmDash site with no reader) answers 200 `{status: "unavailable", code: "CONTENT_ADAPTER_UNSUPPORTED", message, next}` — an expected state, not an error: stop calling `content.locate` there and follow `next`.',
    writes: false,
    platforms: ALL,
    params: {
      type: 'object',
      required: ['url'],
      additionalProperties: false,
      properties: {
        url: { type: 'string', maxLength: 2048, description: 'Address of the page the element is on.' },
        text: { type: 'string', description: 'The element’s own words (cut to 300 characters).' },
        image: {
          type: 'object',
          required: ['src'],
          properties: { src: { type: 'string' }, alt: { type: 'string' } },
          description: 'The picture the element shows.'
        },
        marks: {
          type: 'array',
          items: { type: 'string' },
          description: 'The `data-tracy-src` marks around the element, innermost first (at most 12).'
        },
        domPath: { type: 'string' },
        selector: { type: 'string' },
        locale: { type: 'string', description: 'The page’s language.' },
        warm: { type: 'boolean', description: 'Build or refresh the index for this page and answer nothing.' }
      },
      description: 'Send at least one of `text`, `image` or `marks`, unless `warm` is true.'
    },
    requires: { joomla: '0.18.0', wordpress: '0.14.0' }
  },
  'media.upload': {
    summary: 'Upload one file into the site’s media folder',
    description:
      'Writes one file (base64, at most 8 MiB) under the media roots — `images/` or `media/` on Joomla, `wp-content/uploads/` on WordPress (also added to the Media Library) — and records the undo. A picture for a contract slot goes under `…/tracy-content/<sha256>.<png|jpg|webp>` with an apply_id not starting `contract-`. On EmDash the picture (PNG, JPEG or WebP) goes into the site’s media library under the last segment of `path`, through the site’s own `media_upload`; the answer is `{ok, id, url, path, deduplicated}`, where `path` is the url to write into an entry’s picture field, and the same bytes again answer the item already there. EmDash keeps no undo for it.',
    writes: true,
    platforms: ALL,
    params: {
      type: 'object',
      required: ['apply_id', 'path', 'content_b64'],
      properties: {
        apply_id: APPLY_ID,
        path: {
          type: 'string',
          maxLength: 1024,
          description: 'Relative path under a media root, e.g. `images/hero.jpg`.'
        },
        content_b64: { type: 'string', contentEncoding: 'base64', description: 'The file’s bytes, base64.' },
        sha256: {
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
          description:
            'WordPress: sha256 of the bytes; when sent, a mismatch is refused and nothing is written.'
        }
      }
    },
    requires: { joomla: '0.7.2', wordpress: '0.3.0' }
  },
  'media.delete': {
    summary: 'Delete one WordPress picture or Joomla file under images/',
    description:
      'Dry run answers the WordPress attachment id or Joomla path, files with size and sha256, totalBytes, undoCopyUnderCap, usedIn and usedInScope. If undoCopyUnderCap is false, the 8 MiB undo-copy cap prevents deletion and no confirmation is requested. After confirmation, the real answer includes storageDeleted, filesLeft, usedIn, usedInScope, undo (`apply.revert <apply_id>`) and cdnCache. WordPress removes the attachment record and attempts its files; Joomla deletes a file under images/. Page references are not removed. A CDN or browser may keep serving a cached copy. Available after the site’s Claude Cowork plugin is updated to a release that supports `media.delete`.',
    writes: true,
    platforms: BOTH,
    params: {
      type: 'object',
      required: ['apply_id'],
      properties: {
        apply_id: APPLY_ID,
        id: { ...RECORD_ID, minimum: 1, description: 'WordPress attachment id.' },
        url: { type: 'string', maxLength: 2048, description: 'WordPress media URL.' },
        path: { type: 'string', maxLength: 1024, description: 'Joomla path relative to `images/`.' },
        dry_run: { type: 'boolean', description: 'Preview files and page uses without changing anything.' }
      }
    }
  },
  'media.usage': {
    summary: 'List where one WordPress picture is kept beyond post bodies',
    description:
      'Answers `usedIn` (post bodies, featured images, the logo and icon options) and `usedInStorage`: every post meta `{post_id, key, shape, size?}` and option `{option, shape, size?, locked?, pinned?}` holding the attachment, where `shape` is `id`, `url`, `json` or `serialized`. Each table is walked by its primary key, at most 100000 ids per call: `scanned` says where each walk stopped, and `after: {postmeta, options}` resumes it. `truncated` says the list is not the whole site, and `errors` names a table that could not be read; neither means the picture is used nowhere. `locked` marks an option the site refuses to write, `pinned` one the quickstart contract holds. A URL that is not a Media Library picture answers `not_found`. Available after the site’s Claude Cowork plugin is updated to a release that supports `media.usage`.',
    writes: false,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      properties: {
        id: { ...RECORD_ID, minimum: 1, description: 'Attachment id.' },
        url: { type: 'string', maxLength: 2048, description: 'Media URL, when the id is not known.' },
        after: {
          type: 'object',
          description: 'Where each walk resumes: `scanned.<table>.through` of the previous answer.',
          properties: { postmeta: { type: 'integer', minimum: 0 }, options: { type: 'integer', minimum: 0 } }
        }
      }
    }
  },
  'apply.revert': {
    summary: 'Undo every write recorded under one apply_id',
    description:
      'Puts back, newest first, every change recorded under `apply_id` — record writes, creates, trashes and uploads — and answers `{reverted}` plus any step that failed. A contract, language or demo-trim receipt is taken back through the contract. A record open in the CMS editor refuses the revert.',
    writes: true,
    platforms: BOTH,
    params: { type: 'object', required: ['apply_id'], properties: { apply_id: APPLY_ID } },
    requires: { joomla: '0.7.0', wordpress: '0.3.0' }
  },
  'apply.list': {
    summary: 'List what one apply_id changed, or the site’s recent changes',
    description:
      'With `apply_id`, answers `{apply_id, steps}`: each recorded step with its kind, id (and key on WordPress) or media path, and whether it created the record. The before-values are not returned. Without it, answers `{changes}` from Tracy’s own record of the site, not the CMS: the changes asked for by a conversation or a key in the last 30 days, at most 15 apply_ids, newest first, each `{apply_id, at, thisConversation, changed: [{action, kind, id, fields}], undone}` — what `apply.revert` takes back. A viewer sees only its own.',
    writes: false,
    platforms: BOTH,
    params: { type: 'object', properties: { apply_id: APPLY_ID } },
    requires: { joomla: '0.7.0', wordpress: '0.3.0' }
  },
  'db.cleanup': {
    summary: 'Move leftover tables to the trash',
    description:
      'Renames each table to `_tracy_trash_<timestamp>__<name>` — instant and reversible, never a drop. The whole list is checked first; tables that look like core tables are refused. Answers `{renamed}`. Bring tables back with `db.restore`, delete them for good with `db.purge`.',
    writes: true,
    platforms: BOTH,
    params: { type: 'object', required: ['tables'], properties: { tables: TABLES } },
    requires: { joomla: '0.8.16', wordpress: '0.6.0' }
  },
  'db.restore': {
    summary: 'Bring tables back out of the trash',
    description:
      'Renames trashed tables (`_tracy_trash_…__<name>`) back to their original names. Refused when a table of that name already exists. Answers `{restored}`.',
    writes: true,
    platforms: BOTH,
    params: {
      type: 'object',
      required: ['tables'],
      properties: {
        tables: { ...TABLES, description: 'Trashed table names, as `db.cleanup` answered them.' }
      }
    },
    requires: { joomla: '0.8.16', wordpress: '0.6.0' }
  },
  'db.purge': {
    summary: 'Permanently drop tables from the trash',
    description:
      'Drops tables that `db.cleanup` already moved to the trash. Any name not starting `_tracy_trash_` is refused. This cannot be undone. Answers `{dropped}`.',
    writes: true,
    platforms: BOTH,
    params: {
      type: 'object',
      required: ['tables'],
      properties: { tables: { ...TABLES, description: 'Trashed table names only.' } }
    },
    requires: { joomla: '0.8.17', wordpress: '0.6.0' }
  },
  'db.dump': {
    summary: 'Export rows of one table as SQL',
    description:
      'Answers one chunk of a table as SQL (`sql_b64`) with `rows`, `total`, `done`, and a `next_cursor` (when you sent `cursor`) or `next_offset` to ask for the next chunk. Changes nothing, but carries the site’s data out, so it needs the `site` toolset.',
    writes: false,
    platforms: BOTH,
    params: {
      type: 'object',
      required: ['table'],
      properties: {
        table: { type: 'string', description: 'Full table name (see `db.tables`).' },
        limit: { type: 'integer', minimum: 1, maximum: 5000, default: 1000 },
        cursor: { type: 'string', description: 'Keyset paging: empty string to start, then `next_cursor`.' },
        offset: { type: 'integer', minimum: 0, description: 'Offset paging, used when no cursor is sent.' }
      }
    }
  },
  'db.snapshot': {
    summary: 'Copy tables aside before a risky change',
    description:
      'Copies each table to `_tracy_snap_<tag>__<name>` and answers `{tag, copied}`. All of the site’s tables when `tables` is left out. Take one before `core.upgrade`; put it back with `db.rollback {tag}`. Briefly needs about twice the database’s disk space.',
    writes: true,
    platforms: JOOMLA,
    params: { type: 'object', properties: { tables: TABLES } },
    requires: { joomla: '0.9.0' }
  },
  'db.rollback': {
    summary: 'Put a snapshot back',
    description:
      'For every table in the snapshot, moves the live table to the trash and gives the copy its name — two renames per table, so it finishes in one request. What it displaces stays in the trash until purged. Answers `{restored, trashed}`.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      required: ['tag'],
      properties: {
        tag: {
          type: 'string',
          pattern: '^[0-9]{14}$',
          description: 'The 14-digit tag `db.snapshot` answered.'
        }
      }
    },
    requires: { joomla: '0.9.0' }
  },
  'extension.install': {
    summary: 'Install a Joomla extension from a package URL',
    description:
      'The site downloads one https `.zip` and installs it through Joomla’s own installer, answering its name, type and version. With `sha256` the bytes are verified first. There is no uninstall and no local path.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      required: ['url'],
      properties: {
        url: PACKAGE_URL,
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Expected sha256 of the package.' },
        bytes: { type: 'integer', minimum: 1, description: 'Expected size, with sha256.' }
      }
    },
    requires: { joomla: '0.3.0' }
  },
  'extension.enable': {
    summary: 'Enable or disable one installed Joomla extension',
    description:
      'Switches one non-core extension on or off, addressed as `extension.list` and `core.manifest` name it, and records the previous state under `apply_id`. Core extensions and the Claude Cowork component itself are refused.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      required: ['apply_id', 'type', 'element', 'enabled'],
      properties: {
        apply_id: APPLY_ID,
        type: { type: 'string', description: 'Extension type, e.g. `plugin`, `module`.' },
        element: { type: 'string', description: 'Extension element name.' },
        folder: { type: 'string', description: 'Plugin group, for plugins.' },
        enabled: { type: 'boolean' }
      }
    },
    requires: { joomla: '0.9.0' }
  },
  'core.upgrade': {
    summary: 'Upgrade Joomla one major version',
    description:
      'Moves Joomla to 4.4, 5.4 or 6.1, one hop at a time, in two separate calls: `prepare` replaces the code on disk, `finalise` runs on the new code. Take a `db.snapshot` before `prepare`.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      required: ['to', 'step'],
      properties: {
        to: { type: 'string', enum: ['4.4', '5.4', '6.1'] },
        step: { type: 'string', enum: ['prepare', 'finalise'] }
      }
    },
    requires: { joomla: '0.8.6' }
  },
  'plugin.install': {
    summary: 'Install a WordPress plugin from a package URL',
    description:
      'The site downloads one https `.zip` and installs it as a plugin. Installing does not activate it: call `plugin.activate` next.',
    writes: true,
    platforms: WORDPRESS,
    params: { type: 'object', required: ['url'], properties: { url: PACKAGE_URL } },
    requires: { wordpress: '0.2.0' }
  },
  'plugin.activate': {
    summary: 'Activate an installed WordPress plugin',
    description: 'Turns on one installed plugin by its main file and answers whether it was already active.',
    writes: true,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', description: 'Plugin file, e.g. `akismet/akismet.php`.' } }
    },
    requires: { wordpress: '0.2.0' }
  },
  'theme.install': {
    summary: 'Install a WordPress theme from a package URL',
    description:
      'The site downloads one https `.zip` and installs it as a theme. Installing does not switch to it: call `theme.activate` next.',
    writes: true,
    platforms: WORDPRESS,
    params: { type: 'object', required: ['url'], properties: { url: PACKAGE_URL } },
    requires: { wordpress: '0.2.0' }
  },
  'theme.activate': {
    summary: 'Switch the live WordPress theme',
    description:
      'Makes an installed theme the live one and answers `previous`, the theme it replaced, so you can switch back.',
    writes: true,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      required: ['stylesheet'],
      properties: {
        stylesheet: { type: 'string', description: 'Theme directory name, e.g. `twentytwentyfour`.' }
      }
    },
    requires: { wordpress: '0.2.0' }
  },
  'theme.style': {
    summary: 'Apply one style variation of the active WordPress theme',
    description:
      'Makes the site wear one of the active block theme’s style variations (colours, fonts, spacing) as a whole. It replaces every value of the current style.',
    writes: true,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      required: ['style'],
      properties: { style: { type: 'string', description: 'The style variation id, e.g. `airbnb`.' } }
    },
    requires: { wordpress: '0.8.1' }
  },
  'language.install': {
    summary: 'Install a WordPress core translation',
    description:
      'Fetches WordPress’s own translation for one locale, so the admin, theme strings and dates speak the site’s language. Already installed answers `already: true`.',
    writes: true,
    platforms: WORDPRESS,
    params: {
      type: 'object',
      required: ['locale'],
      properties: {
        locale: {
          type: 'string',
          pattern: '^[a-z]{2,3}(_[A-Za-z0-9]+){0,2}$',
          description: 'WordPress locale, e.g. `vi`, `pt_BR`, `de_DE_formal`.'
        }
      }
    },
    requires: { wordpress: '0.11.0' }
  },
  'site.identity': {
    summary: 'Read or set the Joomla site name, site description and site name in page titles',
    description:
      'Global Configuration’s `sitename` (the site name every page title and Joomla’s own mail can carry), `MetaDesc` (the description every page without its own falls back to) and `sitename_pagetitles` (Site Name in Page Titles: `0` no, `1` before the page title, `2` after it; Claude Cowork for Joomla 0.24.5+, an older plugin refuses a set naming it with `unsupported` and writes nothing of that set), and no other key of `configuration.php`. `read` (the default) answers `{fields: {sitename, MetaDesc, sitename_pagetitles}, writable}`. `set` writes the fields given, cleaned the way Joomla’s own form cleans them, and records the previous values under `apply_id` so `apply.revert` puts them back; an empty `sitename` is refused, as Joomla refuses it. A configuration file this process cannot write answers `unsupported` with `code: CONFIG_NOT_WRITABLE` and changes nothing.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read', 'set'], description: 'Defaults to `read`.' },
        fields: {
          type: 'object',
          description: '`set` only: the values to write, any of them.',
          properties: {
            sitename: { type: 'string', maxLength: 200 },
            MetaDesc: { type: 'string', maxLength: 300 },
            sitename_pagetitles: {
              type: 'integer',
              enum: [0, 1, 2],
              description:
                '0 no, 1 "Site - Page", 2 "Page - Site" (0.24.5+; the same digit as a string is taken).'
            }
          },
          additionalProperties: false
        },
        apply_id: APPLY_ID
      }
    },
    requires: { joomla: '0.22.0' }
  },
  'template.siteSettings': {
    summary: 'Read or set a Joomla template’s logo, name and favicon',
    description:
      'A T4 template keeps its logo, its name and slogan and its favicon in a site profile file per template style (`templates/<t>/etc/site/<profile>.json`). `read` (the default) answers the profiles the site’s styles use, each with `source` and the eight keys it holds, and `missing` for a profile no file holds; a template without T4 (T3) answers `other_faviconFile` and `other_shareImage`, its logo being a template style param (`content.update` kind `templateStyle`). `other_shareImage` (0.24.5+, a png, jpg, webp or gif) is the share picture the plugin prints as `og:image`: on a template without T4 on every page, in place of any other; on T4 only where the page’s head has no `og:image` of its own, and only in `fields` (refused inside `profiles`). `set` writes `fields` into every profile a site style uses and `profiles: {<name>: {...}}` into that one, keeps every other byte of each file, and records the previous bytes under `apply_id` so `apply.revert` puts them back. A picture is a path under `images/`, `media/` or a template’s `images/` naming a file already on the site (`media.upload` first, under a new name each time); empty clears it. Any other key is refused with `unsupported` and nothing is written.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'The site template’s folder name, e.g. `ja_nova`.' },
        operation: { type: 'string', enum: ['read', 'set'], description: 'Defaults to `read`.' },
        fields: {
          type: 'object',
          description:
            '`set` only: values for every profile a site style uses (a T3 template: `other_faviconFile` and `other_shareImage` only; `other_shareImage` on T4 is the site’s share-picture fallback, not a profile key).',
          properties: Object.fromEntries(
            [
              'site_logo',
              'site_logo_small',
              'site_logo_dark',
              'site_logo_dark_small',
              'site_logo_2',
              'site_name',
              'site_slogan',
              'other_faviconFile',
              'other_shareImage'
            ].map((key) => [key, { type: 'string', maxLength: 4096 }])
          ),
          additionalProperties: false
        },
        profiles: {
          type: 'object',
          description: '`set` only, T4 only: profile name → values for that profile, over `fields`.',
          additionalProperties: { type: 'object' }
        },
        apply_id: APPLY_ID
      },
      required: ['template']
    },
    requires: { joomla: '0.23.0' },
    example: {
      operation: 'set',
      template: 'ja_nova',
      apply_id: 'brand-1',
      fields: { site_logo: 'images/tracy-brand/logo-light-0a1b2c3d4e5f6a7b-brand-1.png' }
    }
  },
  'template.languageOverrides': {
    summary: 'Read or write a Joomla site’s language overrides for one language',
    description:
      'The front-end language strings of the site template and the site’s extensions that still read in en-GB in `locale` (a language pack leaves them out, or holds the en-GB words, or holds another string’s translation), and the site’s override file for that language, `language/overrides/<locale>.override.ini`, which Joomla reads after every other language file. `read` (the default) answers `strings`, each `{key, source, reason, file}` (`reason` is `missing`, `untranslated` or `suspect`; `date-format` with `value`, the language’s own format to write as it is; `literal` for words a layout prints with no language key, under a `TRACY_LITERAL_` key that the plugin’s output filter prints in their place, plugin 0.24.13), `overrides` (what the file holds now) and `truncated` when the site found more strings than one read offers. `set` writes `strings: {KEY: words}`, each key one the read offers and each value one line of plain text that keeps the en-GB words’ placeholders; a key or value that is not is named in `refused` and not written. The file’s previous bytes are recorded under `apply_id`, so `apply.revert` puts them back. Nothing the template or the language pack ships is edited.',
    writes: true,
    platforms: JOOMLA,
    params: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'The site template’s folder name, e.g. `ja_essence`.' },
        locale: { type: 'string', description: 'A Joomla language tag other than en-GB, e.g. `vi-VN`.' },
        operation: { type: 'string', enum: ['read', 'set'], description: 'Defaults to `read`.' },
        strings: {
          type: 'object',
          description: '`set` only: language key → its words in `locale`.',
          additionalProperties: { type: 'string', maxLength: 2000 }
        },
        apply_id: APPLY_ID
      },
      required: ['template', 'locale']
    },
    requires: { joomla: '0.24.11' },
    example: {
      operation: 'set',
      template: 'ja_essence',
      locale: 'de-DE',
      apply_id: 'lover-1',
      strings: { TPL_SHARE_ARTICLE: 'Artikel teilen:' }
    }
  }
}
