/**
 * THE CLAUDE COWORK PLUGIN'S OWN HTTP SURFACE, AS ONE OPENAPI 3.1 DOCUMENT — the second source of
 * `/docs/api` (served at `/docs/api/claude-cowork.json`).
 *
 * The plugin lives in another repository and is installed on customer Joomla and WordPress sites, so
 * nothing here can be read from running code in this app. What can be shared is shared: the action
 * words from `actions.js`, the refusal words from `errors.js` (family `plugin`, and `content` for
 * `/content.json`), and the answer shapes from `@tracy/content-api`'s `schema.json`. What is typed
 * here — the two action lists, the `content.read` parameters and the version table — was read from
 * the plugin at the releases named in `RELEASES` (`lib/Engine.php` switch, the door file, and
 * `lib/ContentReader.php` allow-list of each CMS). Updating to a newer release means reading those
 * three places again.
 */
import { CONTENT_TYPES, schema as contentSchema } from '../../lib/content-api.js'
import { APPLY_ACTION_DOCS } from '../actions.js'
import { ERROR_DOCS } from '../errors.js'

/**
 * The releases this document was read from (tags `joomla-v…` / `wordpress-v…` of the plugin repository).
 *
 * 0.20.0 and 0.16.0 (30/09/2026) are the releases whose `content.list` reads `search`. They were read again
 * at the tags, against 0.19.2 and 0.15.1: the action switch of each `lib/Engine.php`, the door file and the
 * `ContentReader` allow-lists did not change, so the two action lists and the `content.read` parameters
 * below stand; the one change is `content.list`'s `search` and its two answer keys (`search`, `matched`),
 * documented in `actions.js`.
 *
 * WordPress 0.17.0 (02/10/2026, tag `wordpress-v0.17.0`, claude-cowork d88563b) was read again at the tag
 * against 0.16.0: the 30 cases of `lib/Engine.php`'s action switch, the three actions `claude-cowork.php`
 * answers before the engine and `lib/ContentReader.php` did not change. What it adds is in `actions.js`
 * (`body_revision` on `content.get`, `expected_body_revision` on `content.update`, `kind: "pattern"` on
 * `content.list`) and in `errors.js` (`revision_stale`).
 */
export const RELEASES = { joomla: '0.20.0', wordpress: '0.17.0' }

/** `lib/Engine.php` of the Joomla package: every `case` of the action switch. */
const JOOMLA_ENGINE_ACTIONS = [
  'info',
  'site.stats',
  'db.tables',
  'db.cleanup',
  'db.restore',
  'db.purge',
  'db.dump',
  'db.snapshot',
  'db.rollback',
  'files.list',
  'files.pack',
  'file.read',
  'extension.list',
  'core.manifest',
  'extension.install',
  'extension.enable',
  'content.list',
  'content.get',
  'content.contract',
  'content.batch',
  'content.update',
  'content.delete',
  'media.upload',
  'apply.revert',
  'apply.list',
  'core.upgrade',
  'files.restore'
]

/** Answered by the Joomla component before the engine (`EngineFactory::answer`). */
const JOOMLA_PLUGIN_ACTIONS = ['content.read']

/** `lib/Engine.php` of the WordPress plugin: every `case` of the action switch. */
const WORDPRESS_ENGINE_ACTIONS = [
  'info',
  'site.stats',
  'db.tables',
  'db.dump',
  'files.list',
  'files.pack',
  'file.read',
  'plugin.list',
  'plugin.install',
  'plugin.activate',
  'theme.list',
  'core.manifest',
  'plugin.selfUpdate',
  'language.install',
  'theme.install',
  'theme.activate',
  'theme.style',
  'theme.palette',
  'content.list',
  'content.get',
  'content.update',
  'content.language',
  'content.delete',
  'db.cleanup',
  'db.restore',
  'db.purge',
  'media.upload',
  'apply.revert',
  'apply.list',
  'content.contract'
]

/** Answered by `claude_cowork_exec()` in `claude-cowork.php` before the engine is built. */
const WORDPRESS_PLUGIN_ACTIONS = ['site.counts', 'content.read', 'content.identity']

export const JOOMLA_ACTIONS = [...JOOMLA_ENGINE_ACTIONS, ...JOOMLA_PLUGIN_ACTIONS]
export const WORDPRESS_ACTIONS = [...WORDPRESS_ENGINE_ACTIONS, ...WORDPRESS_PLUGIN_ACTIONS]

/**
 * Actions the relay reference (`actions.js`) does not describe, because Tracy's door does not carry
 * them to agents; they are still part of the plugin's surface. `requires` is only given where the
 * release that brought the action was established.
 */
const LOCAL_ACTION_DOCS = {
  'site.stats': {
    summary: 'Measure the site before copying it',
    description:
      'How many files and bytes, when the newest file changed, and how many tables and rows there are. Each half is optional: a site whose database is unreachable is still sized by its files.',
    writes: false,
    params: { type: 'object', properties: {}, additionalProperties: false }
  },
  'files.list': {
    summary: 'List files under the web root',
    description: 'One page of the web root, walked from a cursor.',
    writes: false
  },
  'files.pack': {
    summary: 'Pack the web root into a tar, one multipart-upload part per call',
    description:
      'Each call streams one bounded part to a presigned URL the caller supplies and answers its ETag, SHA-256 and a two-part cursor (`next_path`, `next_offset`) so a file larger than one part spans several calls. The caller completes the multipart upload itself.',
    writes: false
  },
  'file.read': {
    summary: 'Read one file under the web root',
    description:
      'Answers the bytes base64-encoded; files above the inline limit are refused with `too_large`.',
    writes: false
  },
  'files.restore': {
    summary: 'Lay a files.pack snapshot back over the web root',
    description:
      'The reverse of `files.pack`: fetches the archive from a URL and writes files only, never the database.',
    writes: true
  },
  'plugin.selfUpdate': {
    summary: 'Install the newest announced release of this plugin now',
    description:
      'Takes no parameters: the version is whatever the plugin update manifest announces, checked by the same filter that draws the notice on the Plugins screen.',
    writes: true,
    params: { type: 'object', properties: {}, additionalProperties: false }
  },
  'theme.palette': {
    summary: 'Read or change the colour palette of the active block theme',
    description:
      'Called with no `colors` it returns the palette with the theme’s own slugs; called with `colors` it writes those slugs and answers every previous value, so the change can be put back.',
    writes: true
  },
  'site.counts': {
    summary: 'Count what the site is made of, by post type',
    description:
      'Counts posts, pages, attachments and the other WordPress content kinds separately (row-counting `wp_posts` would include every revision and menu item). Answers `{ ok: true, counts }`.',
    writes: false,
    params: { type: 'object', properties: {}, additionalProperties: false }
  },
  'content.identity': {
    summary: 'Set up content identities (opt-in write)',
    description:
      'Mints the site’s content seed and a uid for every row, so `content.read` can list them. `newSite: true` with a `requestId` rekeys the site after it was copied from another one. Called by provisioning or an operator, never by an agent. Answers `{ ok: true, identity, alias }`, where `alias` says where `/content.json` answers (`path`, `available`, `collision`).',
    writes: true,
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        newSite: { type: 'boolean', description: 'Rekey the site identity (a copied site). Default false.' },
        requestId: {
          type: 'string',
          description: 'Required with `newSite: true`; makes the rekey idempotent.'
        }
      }
    }
  }
}

const PLATFORM_NAMES = { joomla: 'Joomla', wordpress: 'WordPress' }

/** `schema.json` refers to its own `$defs`; in this document they are `components.schemas`. */
function rehome(node) {
  if (Array.isArray(node)) return node.map(rehome)
  if (node === null || typeof node !== 'object') return node
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string' && value.startsWith('#/$defs/'))
      out[key] = `#/components/schemas/${value.slice('#/$defs/'.length)}`
    else out[key] = rehome(value)
  }
  return out
}

/**
 * Only the schemas the document reaches from its paths. `schema.json` also holds the documents Tracy
 * computes itself (`describe`, `pages`, `changes`, `notModified`), which the plugin never answers.
 */
function reachable(schemas, paths) {
  const kept = {}
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (node === null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/schemas/')) {
        const name = value.slice('#/components/schemas/'.length)
        if (!(name in kept) && name in schemas) {
          kept[name] = schemas[name]
          visit(schemas[name])
        }
      } else visit(value)
    }
  }
  visit(paths)
  return Object.fromEntries(
    Object.keys(schemas)
      .filter((name) => name in kept)
      .map((name) => [name, schemas[name]])
  )
}

/** Markdown-safe cell. */
const cell = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')

const docOf = (action) => APPLY_ACTION_DOCS[action] ?? LOCAL_ACTION_DOCS[action] ?? {}

function actionTable(platform, actions) {
  const rows = actions.map((action) => {
    const doc = docOf(action)
    const since = doc.requires?.[platform] ?? ''
    return `| \`${action}\` | ${cell(doc.summary)} | ${doc.writes ? 'yes' : 'no'} | ${cell(since)} |`
  })
  return ['| Action | What it does | Writes | Since |', '|---|---|---|---|', ...rows].join('\n')
}

const PLUGIN_ERRORS = ERROR_DOCS.filter((e) => e.family === 'plugin')
/** `{ ok: false, error }` codes are lower case; contract `errors[].code` are upper case. */
const ANSWER_ERRORS = PLUGIN_ERRORS.filter((e) => !/^[A-Z_]+$/.test(e.code))
const CONTRACT_ERRORS = PLUGIN_ERRORS.filter((e) => /^[A-Z_]+$/.test(e.code))
const CONTENT_ERRORS = ERROR_DOCS.filter((e) => e.family === 'content')

function errorTable(errors, withStatus) {
  const rows = errors.map(
    (e) => `| \`${e.code}\` |${withStatus ? ` ${e.status} |` : ''} ${cell(e.meaning)} | ${cell(e.next)} |`
  )
  const head = withStatus
    ? ['| Code | HTTP | Meaning | What to do next |', '|---|---|---|---|']
    : ['| Code | Meaning | What to do next |', '|---|---|---|']
  return [...head, ...rows].join('\n')
}

/** The `content.read` parameters each plugin's `ContentReader` accepts (its allow-list). */
function contentParams(platform) {
  const props = {
    id: {
      type: 'string',
      description: 'Read one content in detail. Not combined with `type`, `locale`, `limit` or `cursor`.'
    },
    type: { type: 'string', enum: [...CONTENT_TYPES], description: 'List only contents of this type.' },
    locale: { type: 'string', description: 'List only contents in this locale (one of `site.locales`).' },
    limit: {
      type: 'string',
      pattern: '^[1-9][0-9]{0,2}$',
      description:
        'Contents per page, 1 to 100 (default 30), as a decimal string; the door also takes an integer.'
    },
    cursor: {
      type: 'string',
      description:
        '`pagination.nextCursor` of the previous page. Expires after 300 s or when the site changes.'
    },
    blocksCursor: {
      type: 'string',
      description: 'Continue the blocks of one content (with `id` and `blockId`).'
    },
    blockId: { type: 'string', description: 'Read one block of the content named by `id`.' },
    maxBytes: {
      type: 'string',
      pattern: '^[1-9][0-9]{0,5}$',
      description:
        'Byte budget of the whole answer, 8192 to 262144 (default 65536 for a listing, 262144 for a detail). Contents that do not fit move to the next page instead of being refused.'
    },
    ids: {
      description:
        'Up to 100 content ids read from one projection: a comma-separated string over GET, a list at the door. Combined with `maxBytes` only. Contents that did not fit are named in `pagination.pending`, unknown ids in `pagination.missing`.',
      oneOf: [
        { type: 'string' },
        {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: { type: 'string', maxLength: 128 }
        }
      ]
    },
    protocolVersions: {
      type: 'string',
      description: 'Accepted and ignored (a relay announcing `tracy-content/v1`).'
    }
  }
  if (platform === 'wordpress')
    props.itemsCursor = {
      type: 'string',
      description: 'Recognised but not served yet: answers 501 `CONTENT_ADAPTER_UNSUPPORTED`.'
    }
  return { type: 'object', additionalProperties: false, properties: props }
}

const PRINCIPAL = {
  joomla: { values: '^(service|seat:[a-f0-9]{64})$', fallback: 'service', scopes: ['published'] },
  wordpress: {
    values: '^(site-token|seat:[0-9a-f]{64})$',
    fallback: 'site-token',
    scopes: ['published', 'editorial']
  }
}

/** One request variant per action, discriminated by `action`. */
function requests(platform, actions) {
  const name = PLATFORM_NAMES[platform]
  return actions.map((action) => {
    const doc = docOf(action)
    const since = doc.requires?.[platform]
    const properties = {
      token: { type: 'string', description: 'The site token set in the plugin settings.' },
      action: { $ref: `#/components/schemas/${name}Action`, const: action },
      params:
        action === 'content.read'
          ? { $ref: `#/components/schemas/${name}ContentReadParams` }
          : (doc.params ?? { type: 'object' })
    }
    if (action === 'content.read') {
      const p = PRINCIPAL[platform]
      properties.contentPrincipal = {
        type: 'string',
        pattern: p.values,
        default: p.fallback,
        description:
          'Who the read is for; set by the relay that holds the token (a seat as an HMAC), never by an agent. Scopes continuation cursors only and grants nothing.'
      }
      properties.contentScope = {
        type: 'string',
        enum: p.scopes,
        default: 'published',
        description:
          platform === 'joomla'
            ? 'Only `published` is served; anything else answers 501.'
            : 'Which revisions are read.'
      }
    }
    return {
      type: 'object',
      title: action,
      description: [doc.summary, doc.description, since ? `Since ${name} plugin ${since}.` : '']
        .filter(Boolean)
        .join('\n\n'),
      required: ['token', 'action'],
      properties
    }
  })
}

function doorOperation(platform, { operationId, summary, description, queryParams }) {
  const name = PLATFORM_NAMES[platform]
  return {
    tags: [name],
    operationId,
    summary,
    description,
    security: [],
    parameters: queryParams,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${name}Request` },
          examples: {
            info: {
              summary: 'Software versions',
              value: { token: '<site token>', action: 'info', params: {} }
            },
            'content.read': {
              summary: 'First page of published pages',
              value: { token: '<site token>', action: 'content.read', params: { type: 'page', limit: '30' } }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description:
          'Every action except `content.read` answers HTTP 200: `{ ok: true, … }` on success, `{ ok: false, error, message }` when refused (a bad token included). `content.read` answers a Content API envelope.',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/PluginSuccess' },
                { $ref: '#/components/schemas/PluginRefusal' },
                { $ref: '#/components/schemas/envelope' }
              ]
            }
          }
        }
      },
      ...contentRefusals('`content.read` only: ')
    }
  }
}

/** The HTTP refusals of a content read, from the `content` family of `errors.js`. */
function contentRefusals(prefix = '') {
  const statuses = [...new Set(CONTENT_ERRORS.map((e) => e.status))].sort()
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: `${prefix}${CONTENT_ERRORS.filter((e) => e.status === status)
          .map((e) => `\`${e.code}\``)
          .join(', ')}`,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/error' } } }
      }
    ])
  )
}

const DOC_PARAMS_GET = [
  ['id', 'Read one content in detail.'],
  ['type', `List only contents of this type (${CONTENT_TYPES.join(', ')}).`],
  ['locale', 'List only contents in this locale.'],
  ['limit', 'Contents per page, 1 to 100 (default 30).'],
  ['cursor', '`pagination.nextCursor` of the previous page (expires after 300 s or when the site changes).'],
  ['blocksCursor', 'Continue the blocks of one content (with `id` and `blockId`).'],
  ['blockId', 'Read one block of the content named by `id`.'],
  ['maxBytes', 'Byte budget of the whole answer, 8192 to 262144.'],
  ['ids', 'Up to 100 comma-separated content ids, read together; combined with `maxBytes` only.'],
  ['protocolVersions', 'Accepted and ignored.'],
  ['itemsCursor', 'WordPress only: recognised but not served yet (501 `CONTENT_ADAPTER_UNSUPPORTED`).']
]

function versionTable() {
  const rows = [
    ['`content.read` at the door and `GET /content.json`', '0.18.0', '0.14.0'],
    ['`lockedBy` on a content held open in the CMS editor', '0.18.0', '0.14.0'],
    ['`maxBytes` byte budget', '0.18.0', '0.14.0'],
    ['`native` (the CMS rows each content comes from)', '0.18.2', '0.14.2'],
    ['`ids` (many details in one read)', '0.18.3', '0.14.3']
  ]
  return [
    '| Feature | Joomla plugin | WordPress plugin |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`)
  ].join('\n')
}

/**
 * @param {{ origin: string }} input  Tracy's own origin, only to point at its reference.
 * @returns {object} an OpenAPI 3.1 document
 */
export function buildCoworkOpenApi({ origin }) {
  const schemas = rehome(contentSchema.$defs)
  schemas.JoomlaAction = {
    type: 'string',
    enum: [...JOOMLA_ACTIONS],
    description: 'Every action the Joomla door answers.'
  }
  schemas.WordPressAction = {
    type: 'string',
    enum: [...WORDPRESS_ACTIONS],
    description: 'Every action the WordPress door answers.'
  }
  schemas.JoomlaContentReadParams = contentParams('joomla')
  schemas.WordPressContentReadParams = contentParams('wordpress')
  // Each variant is a named schema (`JoomlaRequest.content.read`): a discriminator selects `$ref`s only.
  for (const [platform, actions] of [
    ['joomla', JOOMLA_ACTIONS],
    ['wordpress', WORDPRESS_ACTIONS]
  ]) {
    const base = `${PLATFORM_NAMES[platform]}Request`
    const mapping = {}
    requests(platform, actions).forEach((variant, i) => {
      schemas[`${base}.${actions[i]}`] = variant
      mapping[actions[i]] = `#/components/schemas/${base}.${actions[i]}`
    })
    schemas[base] = {
      description: `One call to the ${PLATFORM_NAMES[platform]} door; \`action\` selects the shape of \`params\`.`,
      oneOf: Object.values(mapping).map(($ref) => ({ $ref })),
      discriminator: { propertyName: 'action', mapping }
    }
  }
  schemas.PluginSuccess = {
    type: 'object',
    description: 'A successful answer; the other fields depend on the action.',
    required: ['ok'],
    properties: { ok: { const: true } },
    additionalProperties: true
  }
  schemas.PluginRefusal = {
    type: 'object',
    description:
      'A refusal. `writer_busy` also says who holds the write lock and when to ask again; a `content.contract` refusal lists one `code` per slot in `errors[]`.',
    required: ['ok', 'error'],
    properties: {
      ok: { const: false },
      error: {
        type: 'string',
        description: 'See the refusal table in the introduction.',
        anyOf: [
          { enum: ANSWER_ERRORS.map((e) => e.code).filter((code) => !code.includes('<')) },
          { pattern: '^[a-z_]+_failed$' }
        ]
      },
      message: { type: 'string' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', enum: CONTRACT_ERRORS.map((e) => e.code) },
            message: { type: 'string' }
          },
          additionalProperties: true
        }
      }
    },
    additionalProperties: true
  }

  const joomlaQuery = [
    {
      name: 'option',
      in: 'query',
      required: true,
      schema: { type: 'string', enum: ['com_claudecowork'] },
      description: 'The component.'
    },
    {
      name: 'task',
      in: 'query',
      required: true,
      schema: { type: 'string', enum: ['api.exec'] },
      description: 'The door (matched case-insensitively).'
    },
    {
      name: 'format',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['json'] },
      description:
        'Always sent by Tracy; Joomla 3 needs it to find the controller. Joomla 4 and later ignore it.'
    }
  ]
  const joomlaDoor = doorOperation('joomla', {
    operationId: 'joomlaExec',
    summary: 'Run one action on a Joomla site',
    description:
      'The full address is `/index.php?option=com_claudecowork&task=api.exec&format=json` (OpenAPI paths cannot hold a query string). A system plugin answers it before Joomla routes the request, so an offline or coming-soon page does not block it. The token in the body is the only credential.',
    queryParams: joomlaQuery
  })
  const joomlaAdminDoor = doorOperation('joomla', {
    operationId: 'joomlaExecAdministrator',
    summary: 'Run one action on a Joomla site (administrator address)',
    description:
      'The same door at `/administrator/index.php?option=com_claudecowork&task=api.exec&format=json`, for a site whose front end is blocked by a firewall or maintenance extension. Same body, same answers; no administrator login is needed.',
    queryParams: joomlaQuery
  })
  const wordpressDoor = doorOperation('wordpress', {
    operationId: 'wordpressExec',
    summary: 'Run one action on a WordPress site',
    description:
      'The full address is `/wp-admin/admin-ajax.php?action=claude_cowork` (OpenAPI paths cannot hold a query string). The body is raw JSON, not form-encoded; the token in it is the only credential, and no WordPress login is needed.',
    queryParams: [
      {
        name: 'action',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['claude_cowork'] },
        description: 'The admin-ajax action the plugin registers.'
      }
    ]
  })

  const contentJson = {
    tags: ['Joomla', 'WordPress'],
    operationId: 'getContentJson',
    summary: 'Read published content (Content API)',
    description: [
      'The same reader as the `content.read` action, over GET. Served at the exact path `/content.json` below the site address, before the CMS routes the request; the plugin does not answer there when a file or a page already holds that address. Every answer is `Cache-Control: private, no-store`.',
      'Without `id` it lists one page of contents; with `id` it answers one content in detail; with `ids` it answers several. A GET always reads with the `published` scope and a service principal.',
      'Joomla answers any method other than GET with 400 `CONTENT_BAD_QUERY`; WordPress with 405 and `Allow: GET`.'
    ].join('\n\n'),
    security: [{ siteToken: [] }],
    parameters: DOC_PARAMS_GET.map(([name, description]) => ({
      name,
      in: 'query',
      required: false,
      description,
      schema: { type: 'string' }
    })),
    responses: {
      200: {
        description: 'One Content API envelope (`tracy-content/v1`).',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/envelope' } } }
      },
      ...contentRefusals()
    }
  }

  const description = [
    'The **Claude Cowork plugin** is what Tracy installs on a customer’s Joomla or WordPress site so Tracy can read and change it: one door that takes `{ "token", "action", "params" }` and answers JSON, and a read-only Content API at `/content.json`.',
    `This document describes the plugin as it answers on the customer site itself, for Joomla plugin ${RELEASES.joomla} and WordPress plugin ${RELEASES.wordpress}. Callers normally do not call it directly: Tracy's relay door \`POST /api/sites/{key}/apply\` checks the caller's seat and role, adds the site token, calls this door and hands the answer back. That door is documented in Tracy's own reference at ${origin}/docs/api.`,
    '## Token',
    'Each site has one token, set in the plugin settings when Tracy connects the site. It is a service credential for the whole site, not a person: the door takes it in the request body (`token`), and `/content.json` takes it as `Authorization: Bearer <token>`. Never put it in a URL. A missing or wrong token answers `{ ok: false, error: "unauthorized" }` at the door, and 401 `CONTENT_UNAUTHENTICATED` on a content read.',
    '## Versions',
    'Features of the content reader, and the first plugin release that has them:',
    versionTable(),
    '## Joomla actions',
    actionTable('joomla', JOOMLA_ACTIONS),
    '## WordPress actions',
    actionTable('wordpress', WORDPRESS_ACTIONS),
    '## Refusals at the door',
    'Answered with HTTP 200 as `{ "ok": false, "error": "…", "message": "…" }`. `<verb>_failed` stands for any action-specific failure (`dump_failed`, `install_failed`…).',
    errorTable(ANSWER_ERRORS, false),
    '## Contract refusals',
    'A `content.contract` (or `apply.revert`) refusal lists one `code` per slot in `errors[]`.',
    errorTable(CONTRACT_ERRORS, false),
    '## Content read refusals',
    'A `content.read` at the door and `GET /content.json` answer `{ "error": { "code", "message" } }` with these HTTP statuses.',
    errorTable(CONTENT_ERRORS, true)
  ].join('\n\n')

  const paths = {
    '/index.php': { post: joomlaDoor },
    '/administrator/index.php': { post: joomlaAdminDoor },
    '/wp-admin/admin-ajax.php': { post: wordpressDoor },
    '/content.json': { get: contentJson }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Claude Cowork plugin',
      version: `joomla ${RELEASES.joomla} / wordpress ${RELEASES.wordpress}`,
      license: { name: 'GPL-2.0-or-later', identifier: 'GPL-2.0-or-later' },
      description
    },
    servers: [
      {
        url: 'https://{siteAddress}',
        description: 'The customer site itself (not Tracy).',
        variables: {
          siteAddress: {
            default: 'www.example.com',
            description:
              'The host name of the customer site, followed by its path when the CMS is installed in a subfolder.'
          }
        }
      }
    ],
    tags: [
      {
        name: 'Joomla',
        description: `The Claude Cowork component for Joomla (package \`pkg_claudecowork\`), release ${RELEASES.joomla}.`
      },
      {
        name: 'WordPress',
        description: `The Claude Cowork plugin for WordPress (\`claude-cowork\`), release ${RELEASES.wordpress}.`
      }
    ],
    paths,
    components: {
      schemas: reachable(schemas, paths),
      securitySchemes: {
        siteToken: {
          type: 'http',
          scheme: 'bearer',
          description:
            'The site token from the plugin settings. At the POST doors the same token goes in the body as `token`.'
        }
      }
    }
  }
}
