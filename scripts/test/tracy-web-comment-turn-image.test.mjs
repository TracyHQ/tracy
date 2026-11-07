// The tracy-web image carries the preview popover's comment turn builder for step 9b (#448): `apps/tracy-web/Dockerfile`
// copies `comment-turn.mjs` to `src/comment-turn/` and the `@tracy/core` files it imports by name under
// `node_modules/@tracy/core/`, because the image installs from the app's own lockfile alone and a workspace dependency
// would have nothing to resolve to there. A new import in `comment-turn.mjs` (another `@tracy/core` subpath, a sibling
// file) loads in a checkout and crashes the image. Two guards: the image build itself imports the copy (a `RUN` line, so
// the build fails), and this suite rebuilds that layout from the Dockerfile's own COPY lines, with nothing beside it, and
// imports the module in a fresh Node process.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DOCKERFILE = readFileSync(join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
const IMAGE_PATH = 'src/comment-turn/comment-turn.mjs'

/** The Dockerfile's COPY lines that lay out the comment turn builder and what it imports: `[from, to]`. */
const copies = () =>
  [
    ...DOCKERFILE.matchAll(/^COPY (\S+) (\.\/(?:src\/comment-turn\/|node_modules\/@tracy\/core\/)\S*)$/gm)
  ].map((m) => [m[1], m[2]])

test('the image build imports the copied comment turn builder, so a missing import fails the build', () => {
  assert.match(
    DOCKERFILE,
    new RegExp(`^RUN node --input-type=module -e .*${IMAGE_PATH.replace(/[./]/g, '\\$&')}`, 'm')
  )
  assert.ok(
    copies().some(([, to]) => to === `./${IMAGE_PATH}`),
    'the Dockerfile copies comment-turn.mjs to src/comment-turn/'
  )
})

test('comment-turn.mjs loads from the image layout alone', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tracy-web-comment-turn-image-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [from, to] of copies()) {
    const target = join(root, to)
    mkdirSync(statSync(join(ROOT, from)).isDirectory() ? target : dirname(target), { recursive: true })
    cpSync(join(ROOT, from), target, { recursive: true })
  }
  const href = pathToFileURL(join(root, IMAGE_PATH)).href
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(href)}); if (typeof m.buildCommentTurn !== 'function') process.exit(3)`
    ],
    { cwd: root, encoding: 'utf8' }
  )
  assert.equal(run.status, 0, run.stderr)
})
