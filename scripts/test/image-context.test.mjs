/**
 * `scripts/ci/image-context.mjs` decides whether `build-app-images.yml` rebuilds `tracy-web` and
 * `tracy-host`. A wrong "unchanged" ships nothing and says nothing, so every case where an image
 * MUST rebuild is pinned here next to every case where it must not.
 *
 *   node --test scripts/test/image-context.test.mjs
 *
 * One throwaway git repository shaped like this one — the same paths the script reads, the script
 * itself copied in and committed (it hashes its own blob) — is built once and put back to its base
 * state before every test. The cases ask `imageContext` (the pure core) in-process; two tests spawn
 * the CLI for the wiring only (argv, stdout, exit code 2). The cases come from what the pipeline
 * history of 06–15/09 shows actually happening: a push that touched only docs or Workers, one that
 * touched `@tracy/ui` (which the old `paths:` allowlist did not name), a rebuilt SPA whose only
 * difference is the `builtAt` stamp, and an `/ops/cms` snapshot regenerated after a branch head moved.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, beforeEach, describe, test } from 'node:test'

import { appTag, copySources, dropPath, imageContext } from '../ci/image-context.mjs'

const SCRIPT = fileURLToPath(new URL('../ci/image-context.mjs', import.meta.url))

const WEB_DOCKERFILE = `FROM node:24-slim
WORKDIR /opt/tracy-web
COPY apps/tracy-web/package.json apps/tracy-web/pnpm-lock.yaml ./
COPY apps/tracy-web/src ./src
COPY packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json ./src/design-templates.json
COPY packages/web/tracy-harness/dist ./static/ops
COPY packages/web/tracy-design-page/dist ./static/design-inspiration
COPY apps/tracy-docs/dist ./static/docs
COPY apps/tracy-web/static/ops-cms ./static/ops-cms
CMD ["node", "src/server.js"]
`

const HOST_DOCKERFILE = `FROM node:24-slim
COPY --from=docker:27 /usr/local/bin/docker /usr/local/bin/docker
COPY apps/tracy-host/package.json apps/tracy-host/pnpm-lock.yaml ./
COPY apps/tracy-host/src ./src
COPY packages/fleet/tracy-fleet-operation/scripts /opt/tracy-fleet
CMD ["node", "src/server.js"]
`

function snapshotFile(env, { sha = 'a'.repeat(40), content = 'quickstarts v1' } = {}) {
  return JSON.stringify({
    schemaVersion: 3,
    source: {
      env,
      label: env,
      ref: `origin/${env}`,
      sha,
      shortSha: sha.slice(0, 9),
      committedAt: '2026-09-15T01:00:00Z',
      generatedAt: new Date().toISOString(),
      note: 'n'
    },
    sections: {
      quickstarts: {
        status: 'ok',
        value: content,
        sources: [{ path: 'x.json', sha256: 'f'.repeat(64), bytes: 10 }]
      }
    }
  })
}

/** The untracked build outputs, exactly as on a runner after the build steps. */
function writeBuilds(w) {
  w('packages/web/tracy-harness/dist/index.html', '<script src="/ops/assets/a.js"></script>')
  w('packages/web/tracy-harness/dist/assets/a.js', 'console.log(1)')
  w('packages/web/tracy-design-page/dist/index.html', '<div></div>')
  w(
    'packages/web/tracy-design-page/dist/data/manifest.json',
    JSON.stringify({ vendorCommit: '1d7f861f', count: 152, builtAt: '2026-09-15T10:00:00Z' })
  )
  w('apps/tracy-docs/dist/index.html', '<!doctype html><link href="/docs/_astro/d.css">')
  w('apps/tracy-docs/dist/_astro/d.css', 'body{}')
  w('apps/tracy-web/static/ops-cms/dev.json', snapshotFile('dev'))
  w('apps/tracy-web/static/ops-cms/main.json', snapshotFile('main'))
  w('apps/tracy-web/static/ops-cms/dev.sha256', 'abc  dev.json\n')
  w(
    'apps/tracy-web/static/ops-cms/index.json',
    JSON.stringify({
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      environments: [{ id: 'dev', sha: 'a'.repeat(40), digest: 'd1', bytes: 100 }]
    })
  )
}

/**
 * The repository at the shape the script reads, committed, with every build output on disk. Built
 * ONCE for the file; `reset()` puts it back (tracked files by `reset --hard`, build outputs rewritten).
 */
function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'image-context-'))
  const w = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  const g = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@example.com')
  g('config', 'user.name', 't')
  mkdirSync(path.join(root, 'scripts/ci'), { recursive: true })
  copyFileSync(SCRIPT, path.join(root, 'scripts/ci/image-context.mjs'))
  w('.dockerignore', '**/node_modules\n')
  w('apps/tracy-web/Dockerfile', WEB_DOCKERFILE)
  w('apps/tracy-web/package.json', '{"name":"tracy-web"}')
  w('apps/tracy-web/pnpm-lock.yaml', 'lockfileVersion: 9\n')
  w('apps/tracy-web/src/server.js', 'export {}\n')
  w('apps/tracy-host/Dockerfile', HOST_DOCKERFILE)
  w('apps/tracy-host/package.json', '{"name":"tracy-host"}')
  w('apps/tracy-host/pnpm-lock.yaml', 'lockfileVersion: 9\n')
  w('apps/tracy-host/src/server.js', 'export {}\n')
  w('packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json', '{"designs":{}}')
  w('packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh', '#!/bin/sh\n')
  w('packages/ui/tracy-ui/src/button.tsx', 'export const Button = 1\n')
  w('docs/README.md', '# docs\n')
  w('workers/cowork/src/index.js', 'export default {}\n')
  w('.gitignore', 'dist/\napps/tracy-web/static/ops-cms/\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  const base = g('rev-parse', 'HEAD').trim()
  writeBuilds(w)
  const commit = (msg) => {
    g('add', '-A')
    g('commit', '-q', '--allow-empty', '-m', msg)
  }
  const reset = () => {
    g('reset', '-q', '--hard', base)
    g('clean', '-q', '-fdx')
    writeBuilds(w)
  }
  return { root, w, commit, reset }
}

/** In-process answers for both images; a malformed one fails HERE (two empty strings compare equal). */
function fingerprints(root) {
  const web = imageContext({ root, image: 'web' }).fingerprint
  const host = imageContext({ root, image: 'host' }).fingerprint
  assert.match(web, /^wctx-[0-9a-f]{12}$/)
  assert.match(host, /^hctx-[0-9a-f]{12}$/)
  return { web, host }
}

/** The CLI, the way CI runs it. */
function cli(root, ...args) {
  const res = spawnSync('node', [path.join(root, 'scripts/ci/image-context.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8'
  })
  return { code: res.status, out: res.stdout.trim(), err: res.stderr }
}

const r = makeRepo()
after(() => rmSync(r.root, { recursive: true, force: true }))
const BEFORE = fingerprints(r.root)
beforeEach(() => r.reset())

describe('copySources', () => {
  test('joins continuations, drops --from copies, flags and the destination', () => {
    const text =
      'COPY --chown=33:33 a/b \\\n  c/d/ /dest\nCOPY --from=build /x /y\nRUN echo COPY nope\nCOPY e ./'
    assert.deepEqual(copySources(text), ['a/b', 'c/d', 'e'])
  })
})

describe('dropPath', () => {
  test('removes an exact path, walks arrays on *, and leaves same-named keys elsewhere alone', () => {
    const doc = {
      sha: 'keep',
      source: { sha: 'drop', note: 'n' },
      environments: [
        { sha: 'x', id: 1 },
        { sha: 'y', id: 2 }
      ]
    }
    dropPath(doc, ['source', 'sha'])
    dropPath(doc, ['environments', '*', 'sha'])
    assert.deepEqual(doc, { sha: 'keep', source: { note: 'n' }, environments: [{ id: 1 }, { id: 2 }] })
  })
})

describe('image-context — what must NOT rebuild', () => {
  test('a push touching only docs and Workers changes neither image', () => {
    r.w('docs/README.md', '# docs, edited\n')
    r.w('workers/cowork/src/index.js', 'export default { fetch() {} }\n')
    r.commit('docs + workers')
    assert.deepEqual(fingerprints(r.root), BEFORE)
  })

  test('rebuilding the design page changes only `builtAt` — not a new web image', () => {
    r.w(
      'packages/web/tracy-design-page/dist/data/manifest.json',
      JSON.stringify({ vendorCommit: '1d7f861f', count: 152, builtAt: '2026-09-16T08:00:00Z' })
    )
    assert.deepEqual(fingerprints(r.root), BEFORE)
  })

  test('a snapshot regenerated after a branch head moved, with the same content, is not a new web image', () => {
    r.w('apps/tracy-web/static/ops-cms/dev.json', snapshotFile('dev', { sha: 'b'.repeat(40) }))
    r.w('apps/tracy-web/static/ops-cms/dev.sha256', 'def  dev.json\n')
    r.w(
      'apps/tracy-web/static/ops-cms/index.json',
      JSON.stringify({
        schemaVersion: 3,
        generatedAt: 'later',
        environments: [{ id: 'dev', sha: 'b'.repeat(40), digest: 'd2', bytes: 101 }]
      })
    )
    assert.deepEqual(fingerprints(r.root), BEFORE)
  })

  test('a web-only change leaves the host fingerprint alone', () => {
    r.w('apps/tracy-web/src/server.js', 'export const x = 2\n')
    r.commit('web')
    const after = fingerprints(r.root)
    assert.notEqual(after.web, BEFORE.web)
    assert.equal(after.host, BEFORE.host)
  })
})

describe('image-context — what MUST rebuild', () => {
  test('a change that reaches an SPA only through a workspace package (the old allowlist hole)', () => {
    // `@tracy/ui` changed; the build of the harness SPA picked it up. The fingerprint must follow
    // the BUILT bytes, whatever source path they came from.
    r.w('packages/ui/tracy-ui/src/button.tsx', 'export const Button = 2\n')
    r.commit('ui')
    r.w('packages/web/tracy-harness/dist/assets/a.js', 'console.log(2)')
    assert.notEqual(fingerprints(r.root).web, BEFORE.web)
  })

  test('a new file in a built directory', () => {
    r.w('packages/web/tracy-design-page/dist/systems/apple/tokens.css', ':root{}')
    assert.notEqual(fingerprints(r.root).web, BEFORE.web)
  })

  test('a rebuilt documentation page changes web — and only web', () => {
    // The docs are generated partly from `apps/tracy-web/src/api-reference/*.js`; the fingerprint
    // follows the BUILT bytes, so a regenerated page counts whatever source moved it.
    r.w('apps/tracy-docs/dist/reference/errors/index.html', '<!doctype html><title>Errors</title>')
    const after = fingerprints(r.root)
    assert.notEqual(after.web, BEFORE.web)
    assert.equal(after.host, BEFORE.host)
  })

  test('the snapshot CONTENT changed', () => {
    r.w('apps/tracy-web/static/ops-cms/main.json', snapshotFile('main', { content: 'quickstarts v2' }))
    assert.notEqual(fingerprints(r.root).web, BEFORE.web)
  })

  test('a field NAMED like provenance but elsewhere in the snapshot still counts', () => {
    const doc = JSON.parse(snapshotFile('main'))
    doc.sections.quickstarts.sha = 'a content hash that matters'
    r.w('apps/tracy-web/static/ops-cms/main.json', JSON.stringify(doc))
    assert.notEqual(fingerprints(r.root).web, BEFORE.web)
  })

  test('a provision json the web image copies changes web — and host, which copies the whole scripts tree', () => {
    r.w('packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json', '{"designs":{"a":1}}')
    r.commit('templates')
    const after = fingerprints(r.root)
    assert.notEqual(after.web, BEFORE.web)
    assert.notEqual(after.host, BEFORE.host)
  })

  test('a fleet script changes host only', () => {
    r.w('packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh', '#!/bin/sh\necho 2\n')
    r.commit('provision')
    const after = fingerprints(r.root)
    assert.equal(after.web, BEFORE.web)
    assert.notEqual(after.host, BEFORE.host)
  })

  test('a Dockerfile edit — even a comment — and a .dockerignore edit', () => {
    r.w('apps/tracy-host/Dockerfile', `# note\n${HOST_DOCKERFILE}`)
    r.commit('dockerfile')
    const mid = fingerprints(r.root)
    assert.notEqual(mid.host, BEFORE.host)
    r.w('.dockerignore', '**/node_modules\n*.map\n')
    r.commit('dockerignore')
    const after = fingerprints(r.root)
    assert.notEqual(after.host, mid.host)
    assert.notEqual(after.web, mid.web)
  })

  test('the deploy tag changes when either image does, and only then', () => {
    assert.equal(appTag('wctx-1', 'hctx-1'), appTag('wctx-1', 'hctx-1'))
    assert.notEqual(appTag('wctx-1', 'hctx-1'), appTag('wctx-2', 'hctx-1'))
    assert.notEqual(appTag('wctx-1', 'hctx-1'), appTag('wctx-1', 'hctx-2'))
    assert.match(appTag('wctx-1', 'hctx-1'), /^app-[0-9a-f]{12}$/)
  })
})

describe('image-context — refuses instead of guessing', () => {
  test('a build output that was not built is refused and names the command', () => {
    rmSync(path.join(r.root, 'packages/web/tracy-harness/dist'), { recursive: true })
    assert.throws(
      () => imageContext({ root: r.root, image: 'web' }),
      /pnpm --filter @tracy\/harness-web build/
    )
  })

  test('the documentation site not built is refused and names its build', () => {
    rmSync(path.join(r.root, 'apps/tracy-docs/dist'), { recursive: true })
    assert.throws(() => imageContext({ root: r.root, image: 'web' }), /pnpm --filter @tracy\/docs build/)
  })

  test('a COPY of an untracked path nobody declared is refused and names the path', () => {
    r.w('apps/tracy-host/Dockerfile', `${HOST_DOCKERFILE}COPY apps/tracy-host/generated /x\n`)
    r.commit('new copy')
    assert.throws(() => imageContext({ root: r.root, image: 'host' }), /apps\/tracy-host\/generated/)
  })

  test('an unknown image name is refused', () => {
    assert.throws(() => imageContext({ root: r.root, image: 'nope' }), /unknown image "nope"/)
  })
})

describe('image-context — CLI wiring', () => {
  test('--image prints the fingerprint the core computes, and --app-tag joins the two', () => {
    const web = cli(r.root, '--image', 'web')
    const host = cli(r.root, '--image', 'host')
    assert.equal(web.code, 0, web.err)
    assert.equal(web.out, BEFORE.web)
    assert.equal(host.out, BEFORE.host)
    const tag = cli(r.root, '--app-tag', '--web', web.out, '--host', host.out)
    assert.equal(tag.code, 0, tag.err)
    assert.equal(tag.out, appTag(BEFORE.web, BEFORE.host))
  })

  test('a refusal exits 2 with the message on stderr; an unknown image also exits 2', () => {
    rmSync(path.join(r.root, 'apps/tracy-docs/dist'), { recursive: true })
    const missing = cli(r.root, '--image', 'web')
    assert.equal(missing.code, 2)
    assert.match(missing.err, /pnpm --filter @tracy\/docs build/)
    assert.equal(cli(r.root, '--image', 'nope').code, 2)
  })
})
