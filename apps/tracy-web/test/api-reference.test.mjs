// The public API reference (`src/api-reference/`) against the door it describes: every action of
// `APPLY_RULES` documented, every refusal code the door answers in the error table, every
// `content.read` parameter the door accepts in the spec, and a document whose references resolve.
// A verb added to the door without its line here is a red build, not a silently undocumented action.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APPLY_ACTIONS, applyToolsetLabel } from '../src/sites/route.js'
import { APPLY_ACTION_DOCS } from '../src/api-reference/actions.js'
import { ERROR_DOCS } from '../src/api-reference/errors.js'
import { buildOpenApi, openApiPath, operation } from '../src/api-reference/spec.js'
import { ROUTE_DOCS } from '../src/api-reference/routes/index.js'
import { buildApp } from '../src/app.js'
import { mintSession } from '../src/lib/session.js'
import { CONTENT_QUERY_NAMES } from '../src/lib/content-query.js'

const DOOR = readFileSync(new URL('../src/sites/route.js', import.meta.url), 'utf8')
const spec = (internal = false) =>
  buildOpenApi({
    origin: 'https://tracy.example',
    applyActions: APPLY_ACTIONS,
    toolsetOf: applyToolsetLabel,
    internal
  })

/** The lines of one function or handler, from its opening line to the line closing at its column. */
function region(source, opens) {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.includes(opens))
  assert.notEqual(start, -1, `nothing opens with ${opens}`)
  const indent = lines[start].length - lines[start].trimStart().length
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (line.length - line.trimStart().length <= indent && /^[})\]]/.test(line.trim()))
      return lines.slice(start, i + 1).join('\n')
  }
  assert.fail(`${opens} never closes`)
}

test('every action of the door is documented, and nothing else is', () => {
  assert.deepEqual(Object.keys(APPLY_ACTION_DOCS).sort(), [...APPLY_ACTIONS].sort())
  for (const [action, doc] of Object.entries(APPLY_ACTION_DOCS)) {
    assert.ok(doc.summary && doc.description, `${action}: summary and description`)
    assert.equal(typeof doc.writes, 'boolean', `${action}: writes`)
    assert.ok(doc.platforms.length > 0, `${action}: platforms`)
    for (const platform of doc.platforms)
      assert.ok(['joomla', 'wordpress', 'emdash'].includes(platform), `${action}: ${platform}`)
    assert.ok(applyToolsetLabel(action), `${action}: the door names what it needs`)
  }
})

test('every refusal code the door answers is in the error table, with the status it is answered with', () => {
  // The same regions `scripts/check-refusal-next.ts` reads: the door function, its HTTP shell, the
  // handler, and the resolvers they call first. `applyDoor` is a thin wrapper since 29/09/2026; the
  // codes are `applyDoorOnce`'s, and a list that named only the wrapper checked none of them.
  const answered = new Set()
  for (const opens of [
    'async function applyDoorOnce(',
    'async function applyDoor(',
    'async function applyOverHttp(',
    "app.post('/api/sites/:key/apply'",
    'async function requireGrant(',
    'async function requireKeyGrant(',
    'async function conversationSite('
  ])
    for (const match of region(DOOR, opens).matchAll(/code:\s*'([A-Z_]+)'/g)) answered.add(match[1])
  const documented = new Set(ERROR_DOCS.filter((e) => e.family === 'door').map((e) => e.code))
  const contentCodes = new Set(ERROR_DOCS.filter((e) => e.family === 'content').map((e) => e.code))
  const missing = [...answered].filter((code) => !documented.has(code) && !contentCodes.has(code))
  assert.deepEqual(missing, [], 'codes the door answers that the reference does not list')

  const statusTable = region(DOOR, 'const CONTENT_ERROR_STATUS')
  const contentStatus = Object.fromEntries(
    [...statusTable.matchAll(/(CONTENT_[A-Z_]+):\s*(\d{3})/g)].map((m) => [m[1], Number(m[2])])
  )
  assert.deepEqual(
    Object.fromEntries(ERROR_DOCS.filter((e) => e.family === 'content').map((e) => [e.code, e.status])),
    contentStatus
  )
  assert.equal(new Set(ERROR_DOCS.map((e) => e.code)).size, ERROR_DOCS.length, 'each code once')
})

test('the spec takes content.read parameters from the list the door enforces', () => {
  const params = spec().components.schemas.ContentReadParams.properties
  assert.deepEqual(Object.keys(params), [...CONTENT_QUERY_NAMES])
})

test('the document is OpenAPI 3.1, names every action once, and every reference resolves', () => {
  const doc = spec()
  assert.equal(doc.openapi, '3.1.0')
  const body = doc.paths['/api/sites/{key}/apply'].post.requestBody.content['application/json'].schema
  const named = body.oneOf.map((request) => request.properties.action.const)
  assert.deepEqual(named, [...APPLY_ACTIONS])
  const unresolved = []
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (typeof node.$ref === 'string') {
      const name = node.$ref.replace('#/components/schemas/', '')
      if (!node.$ref.startsWith('#/components/schemas/') || !(name in doc.components.schemas))
        unresolved.push(node.$ref)
    }
    Object.values(node).forEach(walk)
  }
  walk(doc)
  assert.deepEqual(unresolved, [])
  assert.deepEqual(doc.servers, [{ url: 'https://tracy.example' }])
})

test('content.list documents `search` on the apply door, on its own page and on the records route — its size, what it matches, the release that reads it and the refusal an older plugin gets', () => {
  const doc = spec()
  const search = APPLY_ACTION_DOCS['content.list'].params.properties.search
  assert.equal(search.type, 'string')
  assert.equal(search.maxLength, 200)
  for (const words of [
    /title/,
    /Joomla plugin 0\.20\.0/,
    /WordPress plugin 0\.16\.0/,
    /`LIST_SEARCH_UNSUPPORTED`/,
    /`matched`/
  ])
    assert.match(search.description, words)
  // The action's own minimum stays the release that brought the action; the parameter's is in its text.
  assert.deepEqual(APPLY_ACTION_DOCS['content.list'].requires, { joomla: '0.8.4', wordpress: '0.5.2' })
  const body = doc.paths['/api/sites/{key}/apply'].post.requestBody.content['application/json'].schema
  const variant = body.oneOf.find((request) => request.properties.action.const === 'content.list')
  assert.deepEqual(variant.properties.params.properties.search, search)
  assert.ok(doc.paths['/api/sites/{key}/apply/content.list'], 'its own page')
  const route = doc.paths['/v1/sites/{key}/records/{kind}'].get
  const named = route.parameters.find((parameter) => parameter.name === 'search')
  assert.equal(named?.in, 'query')
  assert.match(named?.description ?? '', /Joomla plugin 0\.20\.0/)
  assert.match(named?.description ?? '', /LIST_SEARCH_UNSUPPORTED/)
  // The refusal is in the error table with the status the relay answers it with, and names the road.
  const refusal = ERROR_DOCS.find((error) => error.code === 'LIST_SEARCH_UNSUPPORTED')
  assert.equal(refusal?.status, 501)
  assert.match(refusal?.meaning ?? '', /Joomla 0\.20\.0/)
  assert.match(refusal?.meaning ?? '', /WordPress 0\.16\.0/)
  // The road it names exists for every kind: the list paged. `content.read` lists pages, articles and shared
  // records, not every kind the door lists (a banner, a language, a category…), and the text says so.
  assert.match(
    refusal?.next ?? '',
    /^Leave `search` out and list with `offset` and `limit`, which every kind takes\./
  )
  assert.match(refusal?.next ?? '', /`content\.read` lists pages, articles and shared records only\.$/)
  assert.match(search.description, /page with `offset` and `limit` \(every kind takes them\)/)
  assert.match(search.description, /read pages, articles and shared records with `content\.read`/)
})

test('WordPress 0.17.0 (02/10/2026): content.get answers body_revision, content.update takes expected_body_revision, content.list and content.get take kind "pattern" — each with the release that reads it', () => {
  const doc = spec()
  const list = APPLY_ACTION_DOCS['content.list']
  const get = APPLY_ACTION_DOCS['content.get']
  const update = APPLY_ACTION_DOCS['content.update']
  // A pattern is listed and read, never written: the write kinds stay the writer's own.
  assert.ok(list.params.properties.kind.enum.includes('pattern'))
  assert.ok(get.params.properties.kind.enum.includes('pattern'))
  assert.ok(!update.params.properties.kind.enum.includes('pattern'))
  assert.ok(!APPLY_ACTION_DOCS['content.delete'].params.properties.kind.enum.includes('pattern'))
  for (const words of [
    /kind: "pattern"/,
    /sorted by name/,
    /1 to 200/,
    /64 KB/,
    /`truncated: true`/,
    /WordPress plugin 0\.17\.0/
  ])
    assert.match(list.description, words)
  const category = list.params.properties.category
  assert.equal(category.type, 'string')
  assert.match(category.description, /kind: "pattern"/)
  assert.match(category.description, /WordPress plugin 0\.17\.0/)
  assert.match(list.params.properties.search.description, /a pattern’s name, title, description or keywords/)
  for (const words of [/`body_revision`/, /sha256/, /template/, /WordPress plugin 0\.17\.0/])
    assert.match(get.description, words)
  const expected = update.params.properties.expected_body_revision
  assert.equal(expected.type, 'string')
  assert.equal(expected.pattern, '^[a-f0-9]{64}$')
  for (const words of [
    /`body_revision`/,
    /`revision_stale`/,
    /WordPress plugin 0\.17\.0/,
    /nothing is written/
  ])
    assert.match(expected.description, words)
  assert.ok(!(update.params.required ?? []).includes('expected_body_revision'))
  // The plugin's refusal is in the error table, with the road.
  const stale = ERROR_DOCS.find((error) => error.code === 'revision_stale')
  assert.equal(stale?.family, 'plugin')
  assert.match(stale?.meaning ?? '', /`body_revision`/)
  // The records route lists patterns and passes their category.
  const route = doc.paths['/v1/sites/{key}/records/{kind}'].get
  assert.match(route.description, /`pattern`/)
  assert.match(route.description, /WordPress plugin 0\.17\.0/)
  const named = route.parameters.find((parameter) => parameter.name === 'category')
  assert.equal(named?.in, 'query')
  assert.match(named?.description ?? '', /`pattern`/)
})

/** Every route the app registers when every domain is mounted (deps are stand-ins: nothing is called). */
function registeredRoutes() {
  const any = new Proxy(function () {}, {
    get: (_, key) => (key === 'then' ? undefined : any),
    apply: () => any
  })
  const config = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? undefined
          : key === 'origin'
            ? 'https://tracy.example'
            : key === 'woSocialRole'
              ? 'central'
              : 'x'
    }
  )
  const app = buildApp({ config, pool: any, sites: any, host: any, seats: any, mail: any, fleet: any })
  return new Set(
    app.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} ${route.path}`)
  )
}

test('every route the app serves is in the reference, and every documented route is served', () => {
  const served = registeredRoutes()
  const documented = new Set(ROUTE_DOCS.map((route) => `${route.method} ${route.path}`))
  assert.deepEqual([...served].filter((key) => !documented.has(key)).sort(), [], 'served but not documented')
  assert.deepEqual([...documented].filter((key) => !served.has(key)).sort(), [], 'documented but not served')
  assert.equal(documented.size, ROUTE_DOCS.length, 'each route once')
})

test('every documented route says what it is, who calls it and how it is authenticated', () => {
  const unfinished = ROUTE_DOCS.filter(
    (route) => !route.summary || !route.auth || !route.audience?.length
  ).map((route) => `${route.method} ${route.path}`)
  assert.deepEqual(unfinished, [])
})

test('the public reference leaves out internal routes; the internal one has them all', () => {
  const publicPaths = spec(false).paths
  const internalPaths = spec(true).paths
  for (const route of ROUTE_DOCS) {
    // Expanded into one page per action (next test), not documented as a `{action}` template.
    if (route.path === '/api/sites/:key/apply/:action') continue
    const method = route.method.toLowerCase()
    const path = openApiPath(route.path)
    assert.ok(internalPaths[path]?.[method], `internal lists ${route.method} ${route.path}`)
    if (route.internal)
      assert.equal(publicPaths[path]?.[method], undefined, `public hides ${route.method} ${route.path}`)
    else assert.ok(publicPaths[path]?.[method], `public lists ${route.method} ${route.path}`)
  }
})

test('the internal reference is refused without an admin seat', async () => {
  const app = buildApp({ config: { sessionSecret: 'x'.repeat(32) }, mail: { send: async () => {} } })
  const page = await app.request('/ops/api')
  assert.ok([302, 403].includes(page.status), `got ${page.status}`)
  const doc = await app.request('/ops/api/openapi.json')
  assert.ok([302, 403].includes(doc.status), `got ${doc.status}`)
})

test('every {param} of every path is declared by its operation', () => {
  const undeclared = []
  for (const [path, item] of Object.entries(spec(true).paths))
    for (const [method, op] of Object.entries(item)) {
      const declared = new Set((op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name))
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g))
        if (!declared.has(name)) undeclared.push(`${method.toUpperCase()} ${path} {${name}}`)
    }
  assert.deepEqual(undeclared, [])
})

test('the internal reference opens for a Tracy admin seat and stays shut for any other signed-in person', async () => {
  // Measured 28/09 on the stand: the first gate read admit()'s answer backwards — an admin got 403,
  // and a signed-in person with no staff seat would have been let in.
  const secret = 'x'.repeat(32)
  const appFor = (role) =>
    buildApp({
      config: { sessionSecret: secret, origin: 'http://localhost' },
      mail: { send: async () => {} },
      pool: { query: async () => ({ rows: role ? [{ role }] : [] }) }
    })
  const cookie = `tracy_sess=${await mintSession('someone@example.test', secret)}`
  for (const path of ['/ops/api', '/ops/api/openapi.json']) {
    const admin = await appFor('admin').request(path, { headers: { cookie } })
    assert.equal(admin.status, 200, `admin ${path}`)
    const stranger = await appFor(null).request(path, { headers: { cookie } })
    assert.equal(stranger.status, 403, `no staff seat ${path}`)
  }
})

test('every action of the door has its own page at /api/sites/{key}/apply/<action>', () => {
  const paths = spec(false).paths
  const missing = APPLY_ACTIONS.filter((action) => !paths[`/api/sites/{key}/apply/${action}`]?.post)
  assert.deepEqual(missing, [])
  const read = paths['/api/sites/{key}/apply/content.read'].post
  assert.deepEqual(read.requestBody.content['application/json'].schema, {
    $ref: '#/components/schemas/ContentReadParams'
  })
  assert.match(read.tags[0], /^Apply · /)
})

// #792: a control names its action; the document says so, as the door enforces it.
test('the seat removal is documented as naming its action', () => {
  const remove = spec().paths['/api/sites/{key}/seats/{grant}'].delete.requestBody
  // v1 is not broken: the call with no body is still valid; a body that is sent names its kind.
  assert.equal(remove.required, false)
  const removal = remove.content['application/json'].schema
  assert.deepEqual(removal.required, ['kind'])
  assert.equal(removal.additionalProperties, false)
  assert.deepEqual(Object.keys(removal.properties), ['kind'])
  assert.deepEqual(removal.properties.kind.enum, ['revoke', 'cancel_invite', 'decline_request'])

  // The generator says a body may be left out only for a row that says so: this DELETE, and the
  // sync start, whose `allowHeld` is optional and whose door answers a bodiless POST.
  const row = { method: 'POST', path: '/x', tag: 'X', auth: 'session', body: { type: 'object' } }
  assert.equal(operation(row).requestBody.required, true)
  assert.equal(operation({ ...row, bodyOptional: true }).requestBody.required, false)
  assert.deepEqual(
    ROUTE_DOCS.filter((route) => route.bodyOptional === true).map((route) => `${route.method} ${route.path}`),
    ['POST /api/sites/:key/sync', 'DELETE /api/sites/:key/seats/:grant']
  )
})

test('content.renderedWords declares its params with the types the plugin accepts', () => {
  // Engine.php apply(): `is_int($expected) && $expected >= 0`, and request_id of REQUEST_ID_SHAPE.
  const props = APPLY_ACTION_DOCS['content.renderedWords'].params.properties
  assert.deepEqual([props.expected_revision.type, props.expected_revision.minimum], ['integer', 0])
  assert.equal(props.request_id.pattern, '^[a-zA-Z0-9._:-]{1,100}$')
})
