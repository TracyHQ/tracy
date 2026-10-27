#!/usr/bin/env node
/**
 * `scripts/tools/dsh-image-context.sh` decides whether `build-dsh-image.yml` rebuilds the 4.4 GB
 * tracy-dsh image — and whether a push restarts every agent session on the host with it.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/dsh-image-context.test.mjs
 *
 * The two failure directions cost differently and both happened. Measured over 06–15/09 (161 builds):
 * 97 rebuilt an image nothing they changed could reach — `dsh/*.sh` host scripts, the Storybook
 * bench, docs — each one a dev dsh restart, six of them on production. The other direction has no
 * count because it is silent: a plugin change that does not rebuild ships nothing and says nothing.
 * So every case below is a pair: what must keep the fingerprint, and what must move it.
 *
 * ONE throwaway repository (the paths the script reads, the script itself committed — it hashes its
 * own blob) is written with a single `git fast-import`; every case is a commit derived from the base
 * by the same stream. The REAL script then runs once per commit, all concurrently, asking for that
 * commit with CTX_REF — the answers are collected up front and each `test()` asserts one of them.
 * The default (no CTX_REF = HEAD) path has its own test.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'

const SCRIPT_REL = 'packages/fleet/tracy-fleet-operation/scripts/tools/dsh-image-context.sh'
const SCRIPT_SRC = fileURLToPath(new URL('../scripts/tools/dsh-image-context.sh', import.meta.url))
const DOCKERFILE_REL = 'packages/fleet/tracy-fleet-operation/dsh/Dockerfile'

const DOCKERFILE = `FROM node:24-slim AS build
COPY vendor/tracy/deepseek-harness/ ./
RUN pnpm build:official
COPY vendor/tracy/dsh-passwords /opt/vendor/tracy/dsh-passwords
COPY packages/site/tracy-add-site /desk-home/profiles/native/node_modules/@tracy/dsh-add-site
COPY packages/fleet/tracy-fleet-operation/dsh/profile/settings.yaml /desk-home/settings.yaml
COPY packages/fleet/tracy-fleet-operation/dsh/cms/ /opt/tracy/cms/
FROM node:24-slim AS runtime
COPY --from=build /opt/dsh /opt/dsh
COPY packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh /usr/local/bin/tracy-dsh-entrypoint
`

const HARNESS_A = '1111111111111111111111111111111111111111'
const HARNESS_B = '2222222222222222222222222222222222222222'

// The paths the script reads. The submodule is a gitlink — a commit id in the tree, no contents.
const BASE_FILES = {
  '.dockerignore': '**/node_modules\n',
  [DOCKERFILE_REL]: DOCKERFILE,
  'vendor/tracy/dsh-passwords/src/index.js': 'export {}\n',
  'packages/site/tracy-add-site/lib/client.js': 'console.log("add site v1")\n',
  'packages/site/tracy-add-site/README.md': '# add site\n',
  'packages/fleet/tracy-fleet-operation/dsh/profile/settings.yaml': 'a: 1\n',
  'packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh': '#!/bin/sh\n',
  // Beside the image, never in it: host-side scripts in the same directory as the Dockerfile.
  'packages/fleet/tracy-fleet-operation/dsh/deploy-host-dsh.sh': '#!/bin/sh\necho deploy\n',
  'packages/fleet/tracy-fleet-operation/dsh/host-dsh.yml': 'services: {}\n',
  // The seeder's declared inputs (`generated_inputs` in the script).
  'packages/cms/tracy-seeder/src/index.mjs': 'export {}\n',
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.0/content-map.json': '{}\n',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json': '{}\n',
  'packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh': '#!/bin/sh\n',
  'vendor/tracy/od-design-system/catalog.json': '[]\n',
  // Read by the seeder build too, found missing from the list on 15/09 (see dsh-image-inputs.test.mjs).
  'packages/cms/tracy-joomla-quickstart/language-packs.json': '{}\n',
  'packages/cms/tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.0.0/manifest.json': '{}\n',
  'packages/cms/tracy-cms-sections/lib/fixture.mjs': 'export {}\n',
  'packages/design/tracy-design-inspiration/src/client/preset-for.mjs': 'export {}\n',
  'scripts/lib/od-slots-dom.mjs': 'export {}\n',
  'scripts/check-lint.ts': 'export {}\n',
  'vendor/tracy/od-brand-engine/dist/index.js': 'export {}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'packages/dev/tracy-design/src/story.tsx': 'export {}\n',
  'docs/README.md': '# docs\n',
  'apps/tracy-web/src/server.js': 'export {}\n'
}

const root = mkdtempSync(path.join(tmpdir(), 'dsh-image-context-'))
after(() => rmSync(root, { recursive: true, force: true }))

const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

mkdirSync(path.dirname(path.join(root, SCRIPT_REL)), { recursive: true })
copyFileSync(SCRIPT_SRC, path.join(root, SCRIPT_REL))
git('init', '-q', '-b', 'main')

// ── the cases: id → edits applied to the base commit ─────────────────────────────────────────────
// An edit is { path, body } (write), { path, remove: true } (delete a file or tree) or
// { path, gitlink } (move the submodule pointer).

const KEEP = [
  [
    'a host-side script beside the Dockerfile (dsh/deploy-host-dsh.sh)',
    'packages/fleet/tracy-fleet-operation/dsh/deploy-host-dsh.sh',
    '#!/bin/sh\necho v2\n'
  ],
  [
    'the compose file the host runs (dsh/host-dsh.yml)',
    'packages/fleet/tracy-fleet-operation/dsh/host-dsh.yml',
    'services: { x: {} }\n'
  ],
  ['the Storybook bench (packages/dev)', 'packages/dev/tracy-design/src/story.tsx', 'export const x = 1\n'],
  ['docs', 'docs/README.md', '# docs v2\n'],
  ['a repo gate under scripts/ that is not scripts/lib', 'scripts/check-lint.ts', 'export const v = 2\n'],
  ['the app stack (apps/tracy-web)', 'apps/tracy-web/src/server.js', 'export const y = 1\n']
]

const MOVE = [
  [
    'a committed plugin bundle (lib/client.js)',
    'packages/site/tracy-add-site/lib/client.js',
    'console.log("add site v2")\n'
  ],
  [
    'any file inside a copied plugin directory, even a README',
    'packages/site/tracy-add-site/README.md',
    '# add site v2\n'
  ],
  [
    'a vendored fork the image builds (dsh-passwords)',
    'vendor/tracy/dsh-passwords/src/index.js',
    'export const v = 2\n'
  ],
  [
    'a single copied file (profile/settings.yaml)',
    'packages/fleet/tracy-fleet-operation/dsh/profile/settings.yaml',
    'a: 2\n'
  ],
  [
    'the runtime entrypoint',
    'packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh',
    '#!/bin/sh\nexec dsh\n'
  ],
  // The seeder is a build output (dsh/cms is gitignored); these are what it is built from.
  // Measured 13–15/09: six builds died on a contract/pin mismatch in exactly these files.
  [
    'a quickstart contract the seeder reads',
    'packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.0/content-map.json',
    '{"v":2}\n'
  ],
  [
    'the quickstart registry the seeder pins',
    'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json',
    '{"v":2}\n'
  ],
  ['the seeder source', 'packages/cms/tracy-seeder/src/index.mjs', 'export const v = 2\n'],
  [
    'the script that stages the seeder',
    'packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh',
    '#!/bin/sh\necho 2\n'
  ],
  ['the design systems the seeder renders', 'vendor/tracy/od-design-system/catalog.json', '[{}]\n'],
  // The five holes the old list had — each one a change that shipped nothing before 15/09.
  [
    'a WordPress quickstart contract the seeder copies',
    'packages/cms/tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.0.0/manifest.json',
    '{"v":2}\n'
  ],
  [
    'CMS section code the seeder bundles',
    'packages/cms/tracy-cms-sections/lib/fixture.mjs',
    'export const v = 2\n'
  ],
  [
    'a design-inspiration module the seeder bundles',
    'packages/design/tracy-design-inspiration/src/client/preset-for.mjs',
    'export const v = 2\n'
  ],
  ['scripts/lib, which the seeder bundles', 'scripts/lib/od-slots-dom.mjs', 'export const v = 2\n'],
  [
    'the Joomla language packs the seeder bundles',
    'packages/cms/tracy-joomla-quickstart/language-packs.json',
    '{"v":2}\n'
  ],
  [
    'the lockfile (npm dependencies inlined into the bundle)',
    'pnpm-lock.yaml',
    'lockfileVersion: 9\n# bump\n'
  ],
  ['the Dockerfile, even a comment', DOCKERFILE_REL, `# note\n${DOCKERFILE}`],
  ['.dockerignore', '.dockerignore', '**/node_modules\n*.map\n']
]

const CASES = {}
for (const [name, p, body] of KEEP) CASES[`keep:${name}`] = [{ path: p, body }]
for (const [name, p, body] of MOVE) CASES[`move:${name}`] = [{ path: p, body }]
CASES.submodule = [{ path: 'vendor/tracy/deepseek-harness', gitlink: HARNESS_B }]
CASES.undeclared = [
  {
    path: DOCKERFILE_REL,
    body: `${DOCKERFILE}COPY packages/fleet/tracy-fleet-operation/dsh/generated /x\n`
  }
]
CASES.missing = [{ path: 'packages/cms/tracy-seeder', remove: true }]
// HEAD itself: the base plus a plugin change, so "default = HEAD" and "CTX_REF = the commit before" differ.
const HEAD_EDIT = [{ path: 'packages/site/tracy-add-site/lib/client.js', body: 'console.log("v3")\n' }]

// ── one fast-import stream writes the base, HEAD and every case commit ───────────────────────────

const stream = []
const data = (text) => {
  stream.push(`data ${Buffer.byteLength(text)}\n${text}\n`)
}
const header = (ref, from) => {
  stream.push(`commit ${ref}\ncommitter t <t@example.com> 0 +0000\n`)
  data(ref)
  if (from) stream.push(`from ${from}\n`)
}
const applyEdit = (e) => {
  if (e.remove) stream.push(`D ${e.path}\n`)
  else if (e.gitlink) stream.push(`M 160000 ${e.gitlink} ${e.path}\n`)
  else {
    stream.push(`M 100644 inline ${e.path}\n`)
    data(e.body)
  }
}

header('refs/cases/base')
for (const [p, body] of Object.entries(BASE_FILES)) applyEdit({ path: p, body })
applyEdit({ path: SCRIPT_REL, body: readFileSync(SCRIPT_SRC, 'utf8') })
applyEdit({ path: 'vendor/tracy/deepseek-harness', gitlink: HARNESS_A })
stream.push('\n')
header('refs/heads/main', 'refs/cases/base')
HEAD_EDIT.forEach(applyEdit)
stream.push('\n')
Object.values(CASES).forEach((edits, i) => {
  header(`refs/cases/c${i}`, 'refs/cases/base')
  edits.forEach(applyEdit)
  stream.push('\n')
})
execFileSync('git', ['-C', root, 'fast-import', '--quiet', '--force'], { input: stream.join('') })

const refs = Object.fromEntries(
  git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/cases')
    .trim()
    .split('\n')
    .map((l) => l.split(' '))
)
const BASE = refs['refs/cases/base']

/** Run the REAL script for one commit (or HEAD when `ref` is null), the way CI does. */
function fingerprintOf(ref) {
  return new Promise((resolve) => {
    const env = { ...process.env }
    if (ref) env.CTX_REF = ref
    else delete env.CTX_REF
    const child = spawn('bash', [path.join(root, SCRIPT_REL)], { cwd: root, env })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => resolve({ code, out: out.trim(), err }))
  })
}

const answers = {}
await Promise.all([
  fingerprintOf(BASE).then((r) => (answers.base = r)),
  fingerprintOf(null).then((r) => (answers.head = r)),
  ...Object.keys(CASES).map((id, i) => fingerprintOf(refs[`refs/cases/c${i}`]).then((r) => (answers[id] = r)))
])

const fingerprint = (id) => {
  const r = answers[id]
  assert.equal(r.code, 0, r.err)
  assert.match(r.out, /^ctx-[0-9a-f]{12}$/, `not a fingerprint: ${JSON.stringify(r.out)}`)
  return r.out
}

describe('dsh-image-context — what must NOT rebuild (the 97 of 161)', () => {
  for (const [name] of KEEP) {
    test(name, () => {
      assert.equal(fingerprint(`keep:${name}`), fingerprint('base'))
    })
  }
})

describe('dsh-image-context — what MUST rebuild', () => {
  for (const [name] of MOVE) {
    test(name, () => {
      assert.notEqual(fingerprint(`move:${name}`), fingerprint('base'))
    })
  }

  test('a submodule bump (the gitlink moves, contents never checked out)', () => {
    assert.notEqual(fingerprint('submodule'), fingerprint('base'))
  })
})

describe('dsh-image-context — answers for any commit, and refuses to guess', () => {
  test('CTX_REF gives the fingerprint of an older commit ("would this push have rebuilt?")', () => {
    // HEAD (no CTX_REF) is the plugin change; CTX_REF=<its parent> is the base.
    assert.notEqual(fingerprint('head'), fingerprint('base'))
    assert.equal(git('rev-parse', 'HEAD~1').trim(), BASE)
  })

  test('a new COPY of a path git does not track and nothing declares exits 2, naming it', () => {
    assert.equal(answers.undeclared.code, 2)
    assert.match(answers.undeclared.err, /dsh\/generated/)
  })

  test('a declared seeder input that disappeared exits 2 rather than hashing less', () => {
    assert.equal(answers.missing.code, 2)
    assert.match(answers.missing.err, /tracy-seeder/)
  })
})
