#!/usr/bin/env node
/**
 * Coverage for path-fence behaviours of `src/route.mjs` that no other test in this folder pins:
 * label-prefix confusion between two sites (`foo` vs `foo-bar`), how `pathCandidates` sorts an
 * argument into declared / generous / content / unparseable, and that the URL-path exemption never
 * reaches a file tool.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/review-fence-coverage.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FS_TOOL_ARGS,
  URL_PATH_ARGS,
  execTarget,
  insideSite,
  pathCandidates,
  siteOf,
  siteRootOf,
  workdirDecision
} from '../src/route.mjs'

const ROOT = '/site'
const CFG = { sitesRoot: ROOT, containerName: '{label}-web-1' }

test('insideSite: a sibling site whose label starts with ours is outside', () => {
  assert.equal(insideSite('/site/foo', '/site/foo'), true)
  assert.equal(insideSite('/site/foo/.webroot/index.php', '/site/foo'), true)
  assert.equal(insideSite('/site/foo-bar', '/site/foo'), false)
  assert.equal(insideSite('/site/foo-bar/.webroot/wp-config.php', '/site/foo'), false)
  assert.equal(insideSite('/site/foobar', '/site/foo'), false)
  assert.equal(insideSite('/site', '/site/foo'), false)
})

test('siteOf / siteRootOf: the label is the whole first segment, never a prefix of it', () => {
  assert.equal(siteOf('/site/foo-bar/x', ROOT).label, 'foo-bar')
  assert.equal(siteRootOf('/site/foo/deep/er', ROOT), '/site/foo')
  assert.equal(siteRootOf('/site/foo-bar', ROOT), '/site/foo-bar')
  // A trailing slash on the configured root names the same root.
  assert.equal(siteRootOf('/site/foo', '/site/'), '/site/foo')
})

test('siteOf: the sites root itself and a root-prefixed sibling directory are not site paths', () => {
  assert.throws(() => siteOf('/site', ROOT), /outside/)
  assert.throws(() => siteOf('/sites/foo', ROOT), /outside/)
  assert.throws(() => siteOf('/site/', ROOT), /not a site label/)
})

test('execTarget: a stamped root of site foo refuses a cwd in site foo-bar, and vice versa', () => {
  assert.throws(
    () => execTarget({ cwd: '/site/foo-bar', mode: 'workspace-write', root: '/site/foo', cfg: CFG }),
    /another site/
  )
  assert.throws(
    () => execTarget({ cwd: '/site/foo', mode: 'workspace-write', root: '/site/foo-bar', cfg: CFG }),
    /another site/
  )
  assert.deepEqual(execTarget({ cwd: '/site/foo/sub', mode: 'read-only', root: '/site/foo', cfg: CFG }), {
    label: 'foo',
    user: 'nobody',
    container: 'foo-web-1'
  })
})

test('execTarget: an unknown mode is refused rather than mapped to a default user', () => {
  assert.throws(
    () => execTarget({ cwd: '/site/foo', mode: 'full-access', root: '/site/foo', cfg: CFG }),
    /unknown sandbox mode/
  )
})

test('workdirDecision: an absolute workdir in a label-prefixed sibling site is denied', () => {
  const reason = workdirDecision({
    name: 'bash',
    args: { command: 'ls', workdir: '/site/foo-bar' },
    sessionCwd: '/site/foo',
    sitesRoot: ROOT
  })
  assert.match(String(reason), /another site/)
  const pwsh = workdirDecision({
    name: 'pwsh',
    args: { command: 'ls', workdir: '/site/foo-bar/x' },
    sessionCwd: '/site/foo',
    sitesRoot: ROOT
  })
  assert.match(String(pwsh), /another site/)
})

test('pathCandidates: a declared path is fenced, content is skipped, other strings are generous', () => {
  const { known, candidates, unparseable } = pathCandidates('write', {
    file_path: 'a.txt',
    content: '/desk-home/secret mentioned in text',
    justification: 'see /etc/passwd',
    extra: '/site/other/x'
  })
  assert.equal(known, true)
  assert.deepEqual(unparseable, [])
  assert.deepEqual(candidates, [
    { arg: 'file_path', value: 'a.txt', declared: true },
    { arg: 'extra', value: '/site/other/x', declared: false }
  ])
})

test('pathCandidates: a declared path that is not a usable string is unparseable, absent is skipped', () => {
  for (const bad of ['', '   ', 42, ['/site/other'], { p: '/x' }]) {
    const { unparseable, candidates } = pathCandidates('read', { file_path: bad })
    assert.deepEqual(unparseable, ['file_path'], `value ${JSON.stringify(bad)}`)
    assert.deepEqual(candidates, [])
  }
  for (const absent of [undefined, null]) {
    const { unparseable, candidates } = pathCandidates('read', { file_path: absent })
    assert.deepEqual(unparseable, [])
    assert.deepEqual(candidates, [])
  }
})

test('pathCandidates: glob fences both path and pattern; grep treats its pattern as content', () => {
  assert.deepEqual(
    pathCandidates('glob', { path: 'wp-content', pattern: '**/*.php' }).candidates.map((c) => c.arg),
    ['path', 'pattern']
  )
  assert.deepEqual(
    pathCandidates('grep', { path: 'wp-content', pattern: '/etc/', include: '*.php' }).candidates.map(
      (c) => c.arg
    ),
    ['path']
  )
})

test('pathCandidates: non-object arguments yield nothing to check', () => {
  for (const args of [null, undefined, 'read /etc/passwd', 7]) {
    const out = pathCandidates('read', args)
    assert.deepEqual(out.candidates, [])
    assert.deepEqual(out.unparseable, [])
  }
})

test('URL_PATH_ARGS: the exemption applies to its own tool only, never to a file tool', () => {
  for (const tool of Object.keys(URL_PATH_ARGS)) assert.equal(FS_TOOL_ARGS[tool], undefined)
  assert.deepEqual(pathCandidates('tracy_design_check', { path: '/' }).candidates, [])
  // Another argument of the same tool is still judged by the generous branch.
  assert.deepEqual(pathCandidates('tracy_design_check', { path: '/', other: '/site/x' }).candidates, [
    { arg: 'other', value: '/site/x', declared: false }
  ])
  // The same argument name on an unknown tool is NOT exempt.
  assert.deepEqual(pathCandidates('some_tool', { path: '/' }).candidates, [
    { arg: 'path', value: '/', declared: false }
  ])
})

test('lookup tables answer only their own keys: a tool or mode named like an Object.prototype member gets no match', () => {
  for (const name of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
    // Before the Object.hasOwn guard, pathCandidates('toString', …) found Object.prototype.toString as
    // the table row and threw on `table.content.includes`. Now it is an unknown tool: every string
    // argument with a slash is still fenced by the generous branch.
    const out = pathCandidates(name, { file_path: '/site/other/x', note: 'plain' })
    assert.equal(out.known, false, name)
    assert.deepEqual(out.candidates, [{ arg: 'file_path', value: '/site/other/x', declared: false }], name)
    assert.deepEqual(out.unparseable, [], name)
    assert.equal(
      workdirDecision({ name, args: { workdir: '/site/other' }, sessionCwd: '/site/foo', sitesRoot: ROOT }),
      null,
      name
    )
    assert.throws(
      () => execTarget({ cwd: '/site/foo', mode: name, root: null, cfg: CFG }),
      /unknown sandbox mode/,
      name
    )
  }
})
