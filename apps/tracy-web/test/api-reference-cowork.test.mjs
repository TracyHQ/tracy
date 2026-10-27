// The Claude Cowork plugin's reference (`src/api-reference/sources/claude-cowork.js`): an OpenAPI 3.1
// document whose references all resolve, whose paths declare every parameter they name, and whose
// action lists are complete enough to use — every action described, both CMSs present.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JOOMLA_ACTIONS,
  RELEASES,
  WORDPRESS_ACTIONS,
  buildCoworkOpenApi
} from '../src/api-reference/sources/claude-cowork.js'
import { ERROR_DOCS } from '../src/api-reference/errors.js'

const doc = buildCoworkOpenApi({ origin: 'https://tracy.example' })

/** Every `$ref` in the document, with where it was found. */
function refs(node, at = '#', out = []) {
  if (Array.isArray(node)) node.forEach((item, i) => refs(item, `${at}/${i}`, out))
  else if (node && typeof node === 'object')
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') out.push({ ref: value, at })
      else refs(value, `${at}/${key}`, out)
    }
  return out
}

function resolve(ref) {
  assert.ok(ref.startsWith('#/'), `only local references: ${ref}`)
  let node = doc
  for (const part of ref.slice(2).split('/')) node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')]
  return node
}

test('the document is OpenAPI 3.1 and points at the customer site, not at Tracy', () => {
  assert.equal(doc.openapi, '3.1.0')
  assert.ok(doc.info.title && doc.info.version && doc.info.description)
  assert.equal(doc.servers[0].url, 'https://{siteAddress}')
  assert.ok(doc.servers[0].variables.siteAddress.default)
  assert.match(doc.info.description, /https:\/\/tracy\.example\/docs\/api/)
  assert.deepEqual(doc.tags.map((t) => t.name).sort(), ['Joomla', 'WordPress'])
})

test('every $ref resolves', () => {
  const found = refs(doc)
  assert.ok(found.length > 0)
  const dangling = found.filter(({ ref }) => resolve(ref) === undefined)
  assert.deepEqual(dangling, [])
})

test('every path parameter is declared, and every operation has a unique id and a known tag', () => {
  const tags = new Set(doc.tags.map((t) => t.name))
  const ids = new Set()
  for (const [path, item] of Object.entries(doc.paths)) {
    assert.ok(!path.includes('?'), `${path}: no query string in a path`)
    const named = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
    for (const [method, op] of Object.entries(item)) {
      const declared = (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name)
      assert.deepEqual(declared.sort(), named.sort(), `${method} ${path}: path parameters`)
      assert.ok(op.operationId && !ids.has(op.operationId), `${method} ${path}: unique operationId`)
      ids.add(op.operationId)
      for (const tag of op.tags) assert.ok(tags.has(tag), `${method} ${path}: tag ${tag}`)
    }
  }
})

test('both CMSs list their actions, each described once', () => {
  const { schemas } = doc.components
  for (const [name, actions] of [
    ['Joomla', JOOMLA_ACTIONS],
    ['WordPress', WORDPRESS_ACTIONS]
  ]) {
    assert.ok(actions.length > 0)
    assert.equal(new Set(actions).size, actions.length, `${name}: each action once`)
    assert.deepEqual(schemas[`${name}Action`].enum, actions)
    const request = schemas[`${name}Request`]
    const variants = request.oneOf.map(({ $ref }) => resolve($ref))
    assert.deepEqual(Object.keys(request.discriminator.mapping), actions)
    assert.deepEqual(
      variants.map((v) => v.properties.action.const),
      actions
    )
    for (const v of variants) {
      assert.ok(v.description, `${name} ${v.title}: described`)
      assert.deepEqual(v.required, ['token', 'action'])
    }
    assert.ok(actions.includes('content.read'), `${name}: content.read`)
  }
  assert.ok(WORDPRESS_ACTIONS.includes('site.counts') && WORDPRESS_ACTIONS.includes('content.identity'))
})

test('the Joomla and WordPress doors carry their query strings as required parameters', () => {
  const query = (path) => Object.fromEntries(doc.paths[path].post.parameters.map((p) => [p.name, p]))
  for (const path of ['/index.php', '/administrator/index.php']) {
    const q = query(path)
    assert.deepEqual(q.option.schema.enum, ['com_claudecowork'])
    assert.ok(q.option.required && q.task.required)
    assert.deepEqual(q.task.schema.enum, ['api.exec'])
    assert.deepEqual(q.format.schema.enum, ['json'])
  }
  assert.deepEqual(query('/wp-admin/admin-ajax.php').action.schema.enum, ['claude_cowork'])
  assert.deepEqual(doc.paths['/content.json'].get.security, [{ siteToken: [] }])
  assert.equal(doc.components.securitySchemes.siteToken.scheme, 'bearer')
})

test('refusal codes come from errors.js, not a second list', () => {
  const plugin = ERROR_DOCS.filter((e) => e.family === 'plugin').map((e) => e.code)
  const refusal = doc.components.schemas.PluginRefusal.properties
  const listed = [...refusal.error.anyOf[0].enum, ...refusal.errors.items.properties.code.enum]
  for (const code of listed) assert.ok(plugin.includes(code), code)
  for (const code of plugin)
    assert.ok(doc.info.description.includes(`\`${code}\``), `${code} in the introduction`)
})

test('the document was read from the plugin releases that read content.list `search`, and its content.list request carries the parameter', () => {
  // Joomla 0.20.0 and WordPress 0.16.0 (published 30/09/2026): the action switch, the door file and the
  // content reader allow-lists are those of 0.19.2 and 0.15.1 (unchanged, read again at the new tags); only
  // `content.list` gained its `search` (README of each plugin, "Finding a row by its title").
  // WordPress 0.17.0 (02/10/2026, claude-cowork d88563b): the 30 cases of `lib/Engine.php`'s action switch,
  // the three actions `claude-cowork.php` answers first and `lib/ContentReader.php` are those of 0.16.0, read
  // again at the tag; what is new is in `actions.js` (`body_revision`, `expected_body_revision`, the pattern list).
  assert.deepEqual(RELEASES, { joomla: '0.20.0', wordpress: '0.17.0' })
  assert.match(doc.info.description, /Joomla plugin 0\.20\.0 and WordPress plugin 0\.17\.0/)
  for (const name of ['Joomla', 'WordPress']) {
    const request = doc.components.schemas[`${name}Request`].oneOf
      .map(({ $ref }) => resolve($ref))
      .find((variant) => variant.properties.action.const === 'content.list')
    assert.equal(request.properties.params.properties.search.maxLength, 200, name)
  }
})
