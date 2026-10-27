/**
 * THE PUBLIC API REFERENCE, AS ONE OPENAPI 3.1 DOCUMENT — built, never hand-copied.
 *
 * Every part comes from the thing it describes: the actions and their toolsets from the door's own
 * allowlist (passed in by `app.js`, because this domain may not import `sites/`), the `content.read`
 * parameters from `lib/content-query.js` (the list the door enforces), the answer shapes from
 * `@tracy/content-api`'s `schema.json`, and the words from `actions.js` / `errors.js`, which tests keep
 * equal to the door. `/docs/api` renders it with Scalar (`route.js`); Bruno and, later, the agent's
 * tool schema read the same document.
 */
import { CONTENT_QUERY_PARAMS } from '../lib/content-query.js'
import { schema as contentSchema } from '../lib/content-api.js'
import { APPLY_ACTION_DOCS } from './actions.js'
import { ERROR_DOCS } from './errors.js'
import { ROUTE_DOCS, ROUTE_GROUPS } from './routes/index.js'
import { V1_GATEWAY_STATUS, V1_REFUSAL_STATUS, V1_ROUTES } from '../lib/v1-routes.js'

const PLATFORM_NAMES = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/** `schema.json` refers to its own `$defs`; in the document they are `components.schemas`. */
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

/** Markdown-safe cell. */
const cell = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')

function actionTable(applyActions, toolsetOf) {
  const rows = applyActions.map((action) => {
    const doc = APPLY_ACTION_DOCS[action] ?? {}
    const platforms = (doc.platforms ?? []).map((p) => PLATFORM_NAMES[p] ?? p).join(', ')
    const requires = Object.entries(doc.requires ?? {})
      .map(([platform, version]) => `${PLATFORM_NAMES[platform] ?? platform} ≥ ${version}`)
      .join(', ')
    return `| \`${action}\` | ${cell(doc.summary)} | ${cell(toolsetOf(action))} | ${doc.writes ? 'yes' : 'no'} | ${cell(platforms)} | ${cell(requires)} |`
  })
  return [
    '| Action | What it does | Needs | Writes | Platforms | Claude Cowork plugin |',
    '|---|---|---|---|---|---|',
    ...rows
  ].join('\n')
}

function errorTable(family) {
  const rows = ERROR_DOCS.filter((e) => e.family === family).map(
    (e) => `| \`${e.code}\` | ${e.status} | ${cell(e.meaning)} | ${cell(e.next)} |`
  )
  return ['| Code | HTTP | Meaning | What to do next |', '|---|---|---|---|', ...rows].join('\n')
}

/** A Hono path as an OpenAPI path: `:key` → `{key}`, a trailing `*` → `{path}`. */
export function openApiPath(honoPath) {
  return honoPath
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)(\{[^}]*\})?/g, '{$1}')
    .replace(/\/\*$/, '/{path}')
    .replace(/^\*$/, '/{path}')
}

/** The names of an OpenAPI path's `{params}`. */
const pathParams = (path) => [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])

/** How one route is authenticated, as security requirements. */
const SECURITY = {
  none: [],
  session: [{ session: [] }],
  admin: [{ session: [] }],
  actor: [{ actor: [] }],
  'session-or-actor': [{ session: [] }, { actor: [] }]
}

const AUTH_WORDS = {
  none: 'none',
  session: 'a signed-in session (tracy_sess cookie)',
  admin: 'a signed-in session holding a Tracy admin seat',
  actor: "a signed assertion from the host's dsh (x-tracy-actor)",
  'session-or-actor': 'a signed-in session, or the agent acting for one (x-tracy-actor)',
  otp: 'a one-time code sent by email',
  oauth: 'an OAuth sign-in with the named provider',
  token: 'a bearer token or shared secret (see the description)',
  signature: 'a signed request (see the description)',
  invite: 'a one-time invitation link'
}

/** One documented route as an OpenAPI operation. */
export function operation(route) {
  const path = openApiPath(route.path)
  const parameters = [
    ...pathParams(path).map((name) => ({
      name,
      in: 'path',
      required: true,
      description: route.params?.path?.[name] ?? (name === 'path' ? 'Any path below this one.' : undefined),
      schema: { type: 'string' }
    })),
    ...Object.entries(route.params?.query ?? {}).map(([name, description]) => ({
      name,
      in: 'query',
      required: false,
      description,
      schema: { type: 'string' }
    }))
  ]
  const who = route.audience?.length ? `**Called by:** ${route.audience.join(', ')}.` : ''
  const auth = `**Authentication:** ${AUTH_WORDS[route.auth] ?? route.auth ?? 'unknown'}.`
  return {
    tags: [route.tag],
    summary: route.summary || `${route.method} ${route.path}`,
    description: [route.description, who, auth].filter(Boolean).join('\n\n'),
    operationId: `${route.method.toLowerCase()}${path.replace(/[^A-Za-z0-9]+/g, '_')}`,
    ...(SECURITY[route.auth] ? { security: SECURITY[route.auth] } : {}),
    ...(parameters.length ? { parameters } : {}),
    // `bodyOptional` is the row saying the door also answers with no body at all; a generated
    // client must not be told that call is invalid.
    ...(route.body
      ? {
          requestBody: {
            required: route.bodyOptional !== true,
            content: { 'application/json': { schema: route.body } }
          }
        }
      : {}),
    responses: { 200: { description: route.answers || 'OK' } },
    'x-audience': route.audience ?? [],
    ...(route.internal ? { 'x-internal': true } : {})
  }
}

/** The overview every reader starts from: who talks to whom, and where each part of the API lives. */
const ARCHITECTURE = [
  '```text',
  'browser (a person)        the Tracy agent (dsh)          fleet hosts, GitHub, sites',
  '      |  session cookie         |  signed x-tracy-actor              |  signatures, tokens',
  '      +-------------------------+------------------------------------+',
  '                                |',
  '                        tracy-web  (this API)',
  '      accounts & seats · sites · Apply door · mail · badge · ops (staff)',
  '                                |',
  '          +---------------------+----------------------+',
  '          |                                            |',
  "  the host's dsh: one per host,              the site's own web container",
  '  runs the agent; its commands run            Joomla / WordPress: Claude Cowork plugin',
  "  inside the site's web container            EmDash: the Tracy content reader + EmDash API",
  '```',
  '',
  '- **tracy-web** answers every address in this reference. It knows who you are (a session cookie in a browser, or a signed assertion when the agent acts for you) and what your seat on each site allows: one of three roles, each with a fixed set of toolsets — a viewer holds none (it reads, comments and asks; the agent is read-only for it), an editor holds `content`, `code` and `site`, an owner those and `lifecycle`.',
  '- **The Apply door** (`/api/sites/{key}/apply`, and one page per action under the Apply groups) is how anything reads or changes a site. Tracy checks the seat and the toolset, takes a short write lease so two conversations do not write at once, then calls the site and returns its answer.',
  '- **On the site**, the Claude Cowork plugin (Joomla, WordPress) or the Tracy reader (EmDash) does the work. Its own HTTP surface is documented in the *Claude Cowork plugin* reference; EmDash also serves its own API at `/_emdash/api/openapi.json` on the site.',
  '- **The agent** calls the same door through its tools, never the CMS database: every write is recorded under an `apply_id` and can be reverted with `apply.revert`.',
  '- **Staff and machine routes** (Ops, fleet hooks, the host dsh sign-in) are in the internal reference, behind a Tracy admin seat.'
].join('\n')

/** The Apply groups: which actions share a page group in the reference. */
const ACTION_GROUPS = [
  {
    tag: 'Apply · Content API',
    description: 'Reading a site as a map of pages, blocks and fields.',
    test: (a) => a === 'content.read' || a === 'content.locate'
  },
  {
    tag: 'Apply · Contract',
    description: 'Changing a quickstart site slot by slot, with its recommendations.',
    test: (a) => a === 'content.contract'
  },
  {
    tag: 'Apply · Records',
    description: "Reading and writing the CMS's own records.",
    test: (a) => a.startsWith('content.') || a.startsWith('media.')
  },
  {
    tag: 'Apply · Undo',
    description: 'Listing and reverting what was written.',
    test: (a) => a.startsWith('apply.')
  },
  {
    tag: 'Apply · Database',
    description: 'Tables, dumps, snapshots and clean-ups.',
    test: (a) => a.startsWith('db.')
  },
  {
    tag: 'Apply · Software',
    description: 'Versions, extensions, plugins, themes and languages.',
    test: () => true
  }
]

const actionTag = (action) => ACTION_GROUPS.find((group) => group.test(action)).tag

/** One action's own page: `POST /api/sites/{key}/apply/<action>`, its params as the body. */
function actionPath(action, applyOperation, toolsetOf) {
  const doc = APPLY_ACTION_DOCS[action] ?? {}
  const platforms = (doc.platforms ?? []).map((p) => PLATFORM_NAMES[p] ?? p).join(', ')
  const requires = Object.entries(doc.requires ?? {})
    .map(([platform, version]) => `${PLATFORM_NAMES[platform] ?? platform} ≥ ${version}`)
    .join(', ')
  const params =
    action === 'content.read'
      ? { $ref: '#/components/schemas/ContentReadParams' }
      : (doc.params ?? { type: 'object' })
  return {
    [`/api/sites/{key}/apply/${action}`]: {
      post: {
        tags: [actionTag(action)],
        summary: doc.summary || action,
        operationId: `apply_${action.replace(/\W/g, '_')}`,
        description: [
          doc.description,
          `**Needs:** ${toolsetOf(action) ?? 'unknown'} · **Writes:** ${doc.writes ? 'yes' : 'no'} · **Platforms:** ${platforms || '—'}${requires ? ` · **Claude Cowork plugin:** ${requires}` : ''}`,
          `Same as \`POST /api/sites/{key}/apply\` with \`{ "action": "${action}", "params": … }\`.`
        ]
          .filter(Boolean)
          .join('\n\n'),
        security: SECURITY['session-or-actor'],
        parameters: applyOperation.parameters,
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: params,
              ...(doc.example ? { example: doc.example } : {})
            }
          }
        },
        responses: applyOperation.responses
      }
    }
  }
}

const V1_TAG = 'API v1'
/** `/v1/demos`: on the api host's reference too, drawn by `operation` (no Apply action behind it). */
const V1_DEMOS_TAG = 'API v1: Demos'

/** The Q9 table as markdown: which HTTP status a plugin refusal gets at `/v1`. */
function v1RefusalTable() {
  const rows = V1_REFUSAL_STATUS.map(
    (row) => `| ${row.errors.map((e) => `\`${e}\``).join(', ')} | ${row.status} | ${cell(row.note)} |`
  )
  return [
    '| Plugin `error` | HTTP at `/v1` | Meaning |',
    '|---|---|---|',
    ...rows,
    '| any other word | 400 | passed through as `error.code`, upper-cased |',
    '| `errors[]` holds `REVISION_STALE` | 409 | whatever the outer word; read the content again and apply with its new revision |'
  ].join('\n')
}

/** What the `/v1` layer says about itself — shared by both documents. */
const V1_INTRO = [
  '## Authentication',
  'Every `/v1` call carries `Authorization: Bearer trk_<id>.<secret>` — a **seat key**. A person with a live seat on a site mints one on the cowork host (`POST /api/me/keys`, signed in there and sent with that host’s own `Origin`), bound to their account and that ONE site, with `scopes` inside their seat’s toolsets (`content`, `code`, `site`, `lifecycle`). On every call Tracy asks the seat book again: a revoked seat shuts every key on it, and a key never holds more than its seat — the effective rights are the seat’s toolsets ∩ the key’s scopes, owner included. Revoking a key is permanent. The api host reads no session cookie; a request without a Bearer is nobody (`401 NOT_SIGNED_IN`).',
  'Keys are for programs, not browsers: `/v1` sends no CORS headers, and a key belongs in a server or a CI secret, never in page code.',
  '## Preconditions and undo',
  '`GET` answers that carry an `ETag` (`snapshot.revision` of a content envelope, `version` of the pages and changes documents, the revision of a WordPress record) take `If-None-Match` and answer `304` when nothing moved. A record’s `ETag` covers the WHOLE editable record — every field it holds (title, content, excerpt, status, slug, meta…), normalised before hashing — not its `body_revision` alone (since 11/10/2026). `If-Match` is honoured on two writes: **`POST /v1/sites/{key}/contract/apply`** — tags `"<contentId>:<revision>"`, the revisions `content.read` listed — and **`PATCH /v1/sites/{key}/records/{kind}/{id}`** — one tag, the record’s `ETag`, for a WordPress `post`, `templatePart` or `template` on plugin 0.17.0+; a record changed since (any field) answers `412 REVISION_STALE` with the current `ETag`, and nothing is written. The body is checked again inside the plugin’s write lock; the other fields are checked by Tracy’s read just before the write, so an edit saved in the WordPress editor in that same instant is not caught. A site that answers no `body_revision` (Joomla, a kind without a body, an older plugin) refuses the header (`400 IF_MATCH_NOT_SUPPORTED`) rather than write unchecked. A write’s answer carries no `ETag`: read the record for its new one. A records `DELETE` has no revision check and refuses it too. `Idempotency-Key` is the plugin’s `request_id`, on the contract route only. Every write is recorded under an apply id (`Tracy-Apply-Id`, or one Tracy makes) and undone with `POST /v1/sites/{key}/applies/{id}/revert`.',
  '## Rate limits',
  'Per key and site, per fixed hour: 600 calls that change the site, 6000 reads — classified by what the action does, not by HTTP method. Over the cap: `429 RATE_LIMITED` with `Retry-After` in seconds.'
].join('\n\n')

/**
 * One `/v1` route as an OpenAPI operation — from the SAME row `api/route.js` registers, so the
 * headers it reads, the body it takes and the answers it gives are documented from one place.
 */
function v1Operation(row, { toolsetOf, doorStatuses }) {
  const path = openApiPath(row.path)
  const doc = row.action ? (APPLY_ACTION_DOCS[row.action] ?? {}) : {}
  const parameters = [
    ...pathParams(path).map((name) => ({
      name,
      in: 'path',
      required: true,
      description:
        { key: 'The site key, as My Sites shows it; a public name of the site is accepted too.' }[name] ??
        `The \`${name}\` this route names (see its description).`,
      schema: { type: 'string' }
    })),
    ...Object.entries(row.query).map(([name, description]) => ({
      name,
      in: 'query',
      required: name === 'since' && row.path.endsWith('/changes'),
      description,
      schema: ['limit', 'offset', 'maxBytes'].includes(name) ? { type: 'integer' } : { type: 'string' }
    })),
    ...row.headers.map((name) => ({
      name,
      in: 'header',
      required: name === 'Tracy-Apply-Id' && row.method === 'DELETE',
      description: {
        'If-None-Match': 'The `ETag` of an earlier answer (weak comparison); unchanged → `304` with no body.',
        'Tracy-Apply-Id':
          row.method === 'DELETE'
            ? 'Required: the receipt this trash is recorded under; `POST …/applies/{id}/revert` brings the record back.'
            : 'The receipt this write is recorded under; left out, Tracy makes one (`api-<keyId>-<ms>`) and it appears in `GET …/applies`.',
        'If-Match':
          row.action === 'content.update'
            ? 'One tag — the record’s `ETag` from `GET`, the revision of the whole editable record, 64 lowercase hex, weak `W/` accepted; no list, no `*` — and the write goes only over that record (WordPress `post`, `templatePart`, `template`; plugin 0.17.0+). Any field changed since (title, content, excerpt, status…): `412 REVISION_STALE` with the current `ETag`, nothing written. A site that answers no `body_revision`: `400 IF_MATCH_NOT_SUPPORTED`, nothing written.'
            : '`apply` only: one or more tags `"<contentId>:<revision>"` (weak `W/` accepted) → `expected_content_revisions`. A moved content answers `409` with `errors[].code = REVISION_STALE`.',
        'Idempotency-Key':
          'The plugin’s `request_id` (`^[a-zA-Z0-9._:-]{1,100}$`): the same value on a retry answers the stored result.'
      }[name],
      schema: { type: 'string' }
    }))
  ]
  let requestBody
  if (row.body) {
    const source = doc.params?.properties ?? {}
    const properties =
      row.body.fields === null
        ? Object.fromEntries(
            Object.entries(source).filter(
              ([name]) => !['operation', 'expected_content_revisions', 'request_id'].includes(name)
            )
          )
        : Object.fromEntries(row.body.fields.map((name) => [name, source[name] ?? { type: 'string' }]))
    requestBody = {
      required: row.body.required.length > 0,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            ...(row.body.required.length ? { required: row.body.required } : {}),
            properties,
            ...(row.body.fields === null ? {} : { additionalProperties: false })
          }
        }
      }
    }
  }
  const success = {
    me: { $ref: '#/components/schemas/V1Me' },
    applies: { $ref: '#/components/schemas/V1Applies' },
    design: { $ref: '#/components/schemas/V1Design' }
  }[row.kind] ??
    {
      '/v1/sites/:key': { $ref: '#/components/schemas/describe' },
      '/v1/sites/:key/pages': { $ref: '#/components/schemas/pages' },
      '/v1/sites/:key/contents': { $ref: '#/components/schemas/envelope' },
      '/v1/sites/:key/contents/:id': { $ref: '#/components/schemas/envelope' },
      '/v1/sites/:key/changes': { $ref: '#/components/schemas/changes' }
    }[row.path] ?? { $ref: '#/components/schemas/PluginAnswer' }
  // `/v1` answers the door's 502/504 as `V1_GATEWAY_STATUS` (see `api/route.js` `shape`): the
  // reference lists those codes under the status a caller actually receives.
  const v1Door = new Map()
  for (const [status, codes] of doorStatuses) {
    const said = status === 502 || status === 504 ? V1_GATEWAY_STATUS : status
    v1Door.set(said, [...(v1Door.get(said) ?? []), ...codes])
  }
  const refusal = (status) => {
    const door = v1Door.get(status) ?? []
    const plugin = V1_REFUSAL_STATUS.filter((r) => r.status === status).flatMap((r) => r.errors)
    const words = [...door.map((c) => `\`${c}\``), ...plugin.map((w) => `plugin \`${w}\``)]
    return {
      description: words.length ? words.join(', ') : 'Refused.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/V1Refusal' } } }
    }
  }
  const answered = new Set(v1Door.keys())
  if (row.kind === 'door') for (const r of V1_REFUSAL_STATUS) answered.add(r.status)
  // `/v1/me` asks nothing of the site: only the key and seat refusals can happen there.
  const statuses = [...answered].filter((status) => row.kind !== 'me' || [401, 403, 503].includes(status))
  const needs = row.action
    ? `**Action:** \`${row.action}\` · **Needs:** ${toolsetOf(row.action) ?? 'unknown'} · **Writes:** ${row.writes ? 'yes' : 'no'}`
    : ''
  return {
    tags: [V1_TAG],
    summary: row.summary,
    operationId: `v1_${row.method.toLowerCase()}${path.replace(/^\/v1/, '').replace(/[^A-Za-z0-9]+/g, '_')}`,
    description: [
      row.description,
      needs,
      '**Authentication:** a Bearer seat key (`Authorization: Bearer trk_…`).'
    ]
      .filter(Boolean)
      .join('\n\n'),
    security: [{ bearer: [] }],
    parameters,
    ...(requestBody ? { requestBody } : {}),
    responses: {
      200: {
        description:
          row.kind === 'door' && row.action !== 'content.read' ? 'What the site answered.' : 'The answer.',
        ...(row.etag || row.headers.includes('Tracy-Apply-Id')
          ? {
              headers: {
                ...(row.etag
                  ? {
                      ETag: {
                        description:
                          row.etag === 'record'
                            ? 'Strong entity tag: the revision of the whole editable record — a sha256 over every field it holds (title, content, excerpt, status, slug, meta…), normalised; not the `body_revision` alone. Answered for a record whose site answers a `body_revision` (WordPress `post`, `templatePart`, `template`; plugin 0.17.0+).'
                            : `Weak entity tag: ${{ snapshot: '`snapshot.revision`', version: '`version`', design: '`design.updatedAt`' }[row.etag]} of the answer.`,
                        schema: { type: 'string' }
                      }
                    }
                  : {}),
                ...(row.headers.includes('Tracy-Apply-Id')
                  ? {
                      'Tracy-Apply-Id': {
                        description:
                          'The apply id this write is recorded under — the one sent, or the one Tracy made (`api-<keyId>-<ms>`). Undo with `POST /v1/sites/{key}/applies/{id}/revert`.',
                        schema: { type: 'string' }
                      }
                    }
                  : {})
              }
            }
          : {}),
        content: { 'application/json': { schema: success } }
      },
      ...(row.etag ? { 304: { description: 'Nothing moved since the `If-None-Match` tag; no body.' } } : {}),
      ...Object.fromEntries(statuses.sort().map((status) => [status, refusal(status)]))
    },
    'x-audience': ['public', 'agent']
  }
}

/**
 * @param {{ origin: string, applyActions: readonly string[], toolsetOf: (action: string) => string | null,
 *   internal?: boolean, publicApi?: boolean }} input
 *   `internal: true` builds the staff reference (every route); otherwise the public one, without the
 *   routes marked `internal`. `publicApi: true` builds the api host's own document: the `/v1` routes
 *   alone, `origin` (the api host) as the server, bearer as the one security scheme.
 * @returns {object} an OpenAPI 3.1 document
 */
export function buildOpenApi({ origin, applyActions, toolsetOf, internal = false, publicApi = false }) {
  const schemas = rehome(contentSchema.$defs)
  schemas.ContentReadParams = {
    type: 'object',
    description:
      'Parameters of `content.read`. `describe` is sent alone; `view: "pages"` takes only `locale` and `url`; `changedSince` takes only `locale`.',
    additionalProperties: false,
    properties: Object.fromEntries(
      CONTENT_QUERY_PARAMS.map((param) => [param.name, { ...param.schema, description: param.description }])
    )
  }
  schemas.DoorRefusal = {
    type: 'object',
    description: 'A refusal answered by Tracy itself, before or around the call to the site.',
    required: ['code'],
    properties: {
      code: { type: 'string', enum: ERROR_DOCS.filter((e) => e.family === 'door').map((e) => e.code) },
      message: { type: 'string' }
    }
  }
  schemas.V1Refusal = {
    type: 'object',
    description:
      'A refusal at `/v1`: Tracy’s own (`error.code` from the door table) or the plugin’s, normalised — `error.code` is the plugin’s `error` word upper-cased (or its own `code`), `errors[]` its per-slot entries, `next` its suggestion; any other field of the answer rides along.',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' }, message: { type: 'string' } }
      },
      errors: {
        type: 'array',
        items: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }
      },
      next: { type: 'string' }
    },
    additionalProperties: true
  }
  schemas.V1Me = {
    type: 'object',
    required: ['email', 'keyId', 'siteKey', 'scopes'],
    properties: {
      email: { type: 'string', format: 'email' },
      keyId: { type: 'string' },
      siteKey: { type: 'string' },
      scopes: { type: 'array', items: { type: 'string', enum: ['content', 'code', 'site', 'lifecycle'] } }
    }
  }
  schemas.V1Applies = {
    type: 'object',
    required: ['applies', 'applyIds'],
    properties: {
      applies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            at: { type: 'string', format: 'date-time' },
            actor: { type: 'string' },
            action: { type: 'string' },
            ok: { type: 'boolean' },
            applyId: { type: ['string', 'null'] }
          }
        }
      },
      applyIds: { type: 'array', items: { type: 'string' } }
    }
  }
  schemas.V1Design = {
    type: 'object',
    required: ['design'],
    properties: {
      design: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            required: ['id', 'name', 'source', 'platform', 'tokens', 'tokensFrom', 'updatedAt'],
            properties: {
              id: {
                type: ['string', 'null'],
                description:
                  'Catalogue id (`apple`) for `source: catalog`, `brand:<host>` for `brand`, the quickstart id (`tracy-business`) for `quickstart`, or null.'
              },
              name: { type: ['string', 'null'] },
              source: { type: 'string', enum: ['catalog', 'brand', 'template', 'quickstart', 'none'] },
              platform: { type: 'string', description: '`joomla`, `wordpress` or `emdash`.' },
              tokens: {
                type: ['object', 'null'],
                additionalProperties: { type: 'string' },
                description: 'CSS custom property name → value, e.g. `"--accent": "#0071e3"`.'
              },
              tokensFrom: { type: ['string', 'null'] },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        ]
      }
    }
  }
  schemas.PluginAnswer = {
    type: 'object',
    description:
      'What the site answered, passed through verbatim. A refusal is `{ ok: false, error, message }`; a `content.contract` refusal also carries `errors[]` with a `code` per slot.',
    properties: {
      ok: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              enum: ERROR_DOCS.filter((e) => e.family === 'plugin').map((e) => e.code)
            },
            message: { type: 'string' }
          }
        }
      }
    },
    additionalProperties: true
  }
  const requests = []
  for (const action of applyActions) {
    const doc = APPLY_ACTION_DOCS[action] ?? {}
    requests.push({
      type: 'object',
      title: action,
      description: [doc.summary, doc.description, `Needs: ${toolsetOf(action) ?? 'unknown'}.`]
        .filter(Boolean)
        .join('\n\n'),
      required: ['action'],
      properties: {
        action: { const: action },
        params:
          action === 'content.read'
            ? { $ref: '#/components/schemas/ContentReadParams' }
            : (doc.params ?? { type: 'object' })
      }
    })
  }
  const examples = {}
  for (const action of applyActions) {
    const doc = APPLY_ACTION_DOCS[action]
    if (doc?.example) examples[action] = { summary: doc.summary, value: { action, params: doc.example } }
  }
  examples['content.read'] ??= {
    summary: 'The pages of the site with their addresses',
    value: { action: 'content.read', params: { view: 'pages', locale: 'en-GB' } }
  }
  const refusal = (status) => {
    const codes = ERROR_DOCS.filter((e) => e.status === status && e.family !== 'plugin').map(
      (e) => `\`${e.code}\``
    )
    return {
      description: codes.length ? codes.join(', ') : 'Refused.',
      content: {
        'application/json': {
          schema: {
            oneOf: [{ $ref: '#/components/schemas/DoorRefusal' }, { $ref: '#/components/schemas/error' }]
          }
        }
      }
    }
  }
  const statuses = [...new Set(ERROR_DOCS.filter((e) => e.family !== 'plugin').map((e) => e.status))].sort()
  const applyOperation = {
    tags: ['Sites'],
    operationId: 'apply',
    summary: 'Read or change one site',
    description:
      'One action per call. The table in the introduction lists every action, what it needs and which platforms answer it.',
    parameters: [
      {
        name: 'key',
        in: 'path',
        required: true,
        description: 'The site key: the address Tracy gave the site, as it appears in My Sites.',
        schema: { type: 'string' }
      }
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { oneOf: requests, discriminator: { propertyName: 'action' } },
          examples
        }
      }
    },
    responses: {
      200: {
        description:
          'The answer. `content.read` answers one of the Content API documents; every other action answers what the site returned.',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/envelope' },
                { $ref: '#/components/schemas/describe' },
                { $ref: '#/components/schemas/pages' },
                { $ref: '#/components/schemas/changes' },
                { $ref: '#/components/schemas/notModified' },
                { $ref: '#/components/schemas/PluginAnswer' }
              ]
            }
          }
        }
      },
      ...Object.fromEntries(statuses.map((status) => [status, refusal(status)]))
    }
  }
  const doorStatuses = new Map()
  for (const e of ERROR_DOCS)
    if (e.family !== 'plugin') doorStatuses.set(e.status, [...(doorStatuses.get(e.status) ?? []), e.code])
  const shown = ROUTE_DOCS.filter((route) =>
    publicApi ? route.tag === V1_TAG || route.tag === V1_DEMOS_TAG : internal || !route.internal
  )
  const shownGroups = ROUTE_GROUPS.filter((group) => shown.some((route) => route.tag === group.tag))
  const paths = {}
  for (const route of shown) {
    const path = openApiPath(route.path)
    const method = route.method.toLowerCase()
    paths[path] ??= {}
    if (route.tag === V1_TAG) {
      const row = V1_ROUTES.find((r) => r.method === route.method && r.path === route.path)
      paths[path][method] = v1Operation(row, { toolsetOf, doorStatuses })
      continue
    }
    if (route.path === '/api/sites/:key/apply/:action' && route.method === 'POST') {
      // One page per action (the reason this address exists), grouped by what the action touches.
      for (const action of applyActions) Object.assign(paths, actionPath(action, applyOperation, toolsetOf))
      continue
    }
    paths[path] ??= {}
    paths[path][method] =
      route.path === '/api/sites/:key/apply' && route.method === 'POST'
        ? { ...applyOperation, tags: [route.tag] }
        : operation(route)
  }
  const version = contentSchema.title?.match(/v\d+/)?.[0] ?? 'v1'
  const bearerScheme = {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'trk_<id>.<secret>',
    description:
      'A seat key: `Authorization: Bearer trk_<id16>.<secret32>`, minted by a person with a live seat on the site (`POST /api/me/keys` on the cowork host) and bound to that one site. Effective rights are the seat’s toolsets ∩ the key’s scopes.'
  }
  if (publicApi)
    return {
      openapi: '3.1.0',
      info: {
        title: 'Tracy API',
        version,
        description: [
          'Read and change one customer website (Joomla, WordPress, EmDash) as resources — its pages, contents, records, content contract and the receipts of what was changed — with a seat key its owner minted for you.',
          'Every route is a thin alias of one action of Tracy’s Apply door: Tracy checks the key and the seat behind it, takes a short write lease so two callers do not write at once, calls the site — the Claude Cowork plugin on Joomla and WordPress, the Tracy reader on EmDash — and hands the answer back. Every write is recorded under an apply id and can be reverted.',
          '## How the system is organised',
          ARCHITECTURE,
          V1_INTRO,
          '## Errors',
          'A refusal is `{ "error": { "code", "message" }, "errors": [], "next" }`. Codes Tracy answers itself, with their status:',
          errorTable('door'),
          'Refusals of a content read (`GET …`, `/contents`, `/pages`, `/changes`):',
          errorTable('content'),
          'What the site answers as a refusal comes back with the status of this table (the plugin’s own word is `error.code`, upper-cased):',
          v1RefusalTable(),
          '## Versioning',
          `This is API \`${version}\`; every answer carries \`X-Tracy-Api-Version\`. Adding a route, a parameter or a field keeps the version; removing one, or changing what it means, is a new version for the Bearer routes under \`/v1/*\`. The session routes under \`/api/*\` are called by Tracy’s own interface and ship together with it; a change to one of them is a dated “Changed” line in the changelog. The dated changelog is on the cowork host at \`/docs/api\`.`
        ].join('\n\n')
      },
      servers: [{ url: origin }],
      security: [{ bearer: [] }],
      tags: shownGroups.map((group) => ({ name: group.tag, description: group.description })),
      paths,
      components: { schemas, securitySchemes: { bearer: bearerScheme } }
    }
  return {
    openapi: '3.1.0',
    info: {
      title: internal ? 'Tracy API (internal)' : 'Tracy API',
      version,
      description: [
        'Tracy reads and changes customer websites (Joomla, WordPress, EmDash) through one door: `POST /api/sites/{key}/apply` with `{ "action": "…", "params": { … } }`.',
        'Tracy checks who you are and what your seat on that site may do, then passes the call to the site — to the Claude Cowork plugin on Joomla and WordPress, or to the Tracy reader on EmDash — and hands the answer back unchanged. Some `content.read` answers are computed by Tracy itself (`describe`, `view: "pages"`, `fields`, `ifVersion`, `changedSince`).',
        '## How the system is organised',
        ARCHITECTURE,
        '## Actions',
        actionTable(applyActions, toolsetOf),
        '## Refusals from Tracy',
        errorTable('door'),
        '## Refusals of `content.read`',
        errorTable('content'),
        '## Answers from the site',
        'The site\'s own refusals come back inside the answer, as `{ "ok": false, "error": "…" }`, and a `content.contract` refusal lists one `code` per slot in `errors[]`.',
        errorTable('plugin'),
        '## The REST layer `/v1` (api host)',
        'On the api host the same door is offered as resources under `/v1`, to a Bearer seat key. There a plugin refusal is not a 200: it gets the status of this table and the shape `{ "error": { "code", "message" }, "errors": [], "next" }`.',
        v1RefusalTable(),
        V1_INTRO,
        '## EmDash',
        'An EmDash site also serves its own REST and MCP API, documented by EmDash at `/_emdash/api/openapi.json` on the site itself.'
      ].join('\n\n')
    },
    servers: [{ url: origin }],
    security: [{ session: [] }, { actor: [] }],
    tags: [
      ...shownGroups.map((group) => ({ name: group.tag, description: group.description })),
      ...ACTION_GROUPS.map((group) => ({ name: group.tag, description: group.description }))
    ],
    paths,
    components: {
      schemas,
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'tracy_sess',
          description: 'The session of a person signed in to Tracy.'
        },
        actor: {
          type: 'apiKey',
          in: 'header',
          name: 'x-tracy-actor',
          description: 'A signed assertion from the Tracy agent acting for a signed-in person.'
        },
        bearer: bearerScheme
      }
    }
  }
}
