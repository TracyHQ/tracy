#!/usr/bin/env node
/**
 * The fingerprint of everything that can end up inside the `tracy-web` or `tracy-host` image, so
 * `build-app-images.yml` builds an image only when its inputs changed — and never skips one whose
 * inputs did.
 *
 *   node scripts/ci/image-context.mjs --image web             → wctx-<12 hex>
 *   node scripts/ci/image-context.mjs --image host --explain  → every input line, then hctx-<12 hex>
 *   node scripts/ci/image-context.mjs --image web --ref <commit>
 *
 * WHY THIS AND NOT A `paths:` LIST. Until 15/09 the workflow ran on a hand-kept allowlist of paths,
 * and a hand-kept list fails in the direction nobody sees: `@tracy/ui`, `@tracy/core`, `@tracy/i18n`
 * and `packages/design/tracy-design-inspiration` all reach the web image through its two SPAs, and
 * none was on the list — so a change there reached neither `/ops` nor `/design-inspiration`, with
 * nothing red. The design page alone reads from five places outside its own directory (relative
 * imports into another plugin, `scripts/lib`, two `vendor/` trees, one of them a build output), so
 * no list of inputs written by hand stays complete. This script does not list inputs for built
 * directories at all: it hashes what was BUILT.
 *
 * WHAT IS HASHED, one line per input (`<id> <path>`):
 *   - every non-`--from` `COPY` source in the Dockerfile that git tracks: its git object id at the
 *     ref (a directory's tree id changes when anything under it does);
 *   - a `COPY` source git does NOT track is a build output. It must be declared in `IMAGES` below
 *     (an undeclared one exits 2 — red, never a silent "unchanged"), it must exist on disk (so the
 *     workflow builds before it fingerprints), and its CONTENT is hashed: every file's path and
 *     bytes. Two fields are volatile by design and are removed first, each at an exact JSON path,
 *     never by key name anywhere — a future content field that happens to be called `sha` must
 *     still count:
 *       · `data/manifest.json` `builtAt` in the design page (measured 15/09: two consecutive builds
 *         of both SPAs differ in that one field and nothing else, over 2753 files);
 *       · the `/ops/cms` snapshot's provenance — `source.{sha,shortSha,committedAt,generatedAt}` in
 *         each environment file, and `generatedAt` + `environments[].{sha,digest,bytes}` in the
 *         index. A push that moved a branch head without changing anything the snapshot reads does
 *         not rebuild the image. The trade, said plainly: the snapshot in a running image names the
 *         commit its content was read from, which can be older than the branch head.
 *   - the Dockerfile, `.dockerignore`, and this script: a change to how the context is assembled is
 *     a change to the image.
 *
 * Needs git, the commit, and — for `web` — the four build outputs on disk (the workflow builds the
 * SPAs, the documentation site and the snapshot first; a missing one exits 2 naming the command
 * that makes it).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = 'scripts/ci/image-context.mjs'

/** The two app images. Generated sources are keyed by the path the Dockerfile copies. */
export const IMAGES = Object.freeze({
  host: { dockerfile: 'apps/tracy-host/Dockerfile', prefix: 'hctx', generated: {} },
  web: {
    dockerfile: 'apps/tracy-web/Dockerfile',
    prefix: 'wctx',
    generated: {
      'packages/web/tracy-harness/dist': { make: 'pnpm --filter @tracy/harness-web build' },
      'packages/web/tracy-design-page/dist': {
        make: 'pnpm --filter @tracy/design-page build',
        volatile: { 'data/manifest.json': [['builtAt']] }
      },
      'packages/web/tracy-wo-find-page/dist': { make: 'pnpm --filter @tracy/wo-find-page build' },
      // The documentation site (S5). No volatile field: two consecutive builds were byte-identical
      // (measured 28/09/2026, `diff -rq` over the whole dist/), so its content hash moves only when
      // a page, the reference tables it is generated from, or Starlight itself changed.
      'apps/tracy-docs/dist': { make: 'pnpm --filter @tracy/docs build' },
      'apps/tracy-web/static/ops-cms': {
        make: 'node scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms',
        volatile: {
          'dev.json': [
            ['source', 'sha'],
            ['source', 'shortSha'],
            ['source', 'committedAt'],
            ['source', 'generatedAt']
          ],
          'main.json': [
            ['source', 'sha'],
            ['source', 'shortSha'],
            ['source', 'committedAt'],
            ['source', 'generatedAt']
          ],
          'index.json': [
            ['generatedAt'],
            ['environments', '*', 'sha'],
            ['environments', '*', 'digest'],
            ['environments', '*', 'bytes']
          ]
        },
        // Checksum files of the JSON above: they change exactly when the provenance does.
        skip: /\.sha256$/
      }
    }
  }
})

class ContextError extends Error {}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** The object id at `<ref>:<path>` — a tree, blob or gitlink — or null when the path is absent. */
function objectId(root, ref, p) {
  try {
    return git(root, ['rev-parse', '-q', '--verify', `${ref}:${p}`]).trim() || null
  } catch {
    return null
  }
}

/** `COPY` sources of a Dockerfile: continuations joined, `--from=` copies and flags dropped. */
export function copySources(dockerfileText) {
  const joined = dockerfileText.replace(/\\\r?\n/g, ' ')
  const out = new Set()
  for (const line of joined.split(/\r?\n/)) {
    const words = line.trim().split(/\s+/)
    if (words[0] !== 'COPY') continue
    if (words.some((w) => w.startsWith('--from='))) continue
    const args = words.slice(1).filter((w) => !w.startsWith('--'))
    // The last argument is the destination.
    for (const src of args.slice(0, -1)) out.add(src.replace(/\/+$/, ''))
  }
  return [...out].sort()
}

/** Delete one JSON path; `*` walks every element of an array. Absent paths are fine. */
export function dropPath(value, keys) {
  if (value === null || typeof value !== 'object' || keys.length === 0) return
  const [head, ...rest] = keys
  if (head === '*') {
    if (Array.isArray(value)) for (const item of value) dropPath(item, rest)
    return
  }
  if (rest.length === 0) delete value[head]
  else dropPath(value[head], rest)
}

function listFiles(abs, rel = '') {
  const out = []
  for (const entry of readdirSync(path.join(abs, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listFiles(abs, child))
    else if (entry.isFile()) out.push(child)
  }
  return out
}

/** Content hash of a build output on disk: every file's path and bytes, volatile JSON paths removed. */
export function builtHash(root, dir, gen) {
  const abs = path.join(root, dir)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new ContextError(`${dir} does not exist — build it first: ${gen.make}`)
  }
  const files = listFiles(abs)
    .filter((f) => !(gen.skip && gen.skip.test(f)))
    .sort()
  if (files.length === 0) throw new ContextError(`${dir} is empty — ${gen.make} wrote nothing`)
  const h = createHash('sha256')
  for (const file of files) {
    let bytes = readFileSync(path.join(abs, file))
    const volatile = gen.volatile?.[file]
    if (volatile) {
      let doc
      try {
        doc = JSON.parse(bytes.toString('utf8'))
      } catch {
        throw new ContextError(`${dir}/${file} is declared volatile JSON but does not parse`)
      }
      for (const keys of volatile) dropPath(doc, keys)
      bytes = Buffer.from(JSON.stringify(doc))
    }
    h.update(file).update('\0').update(bytes).update('\0')
  }
  return h.digest('hex')
}

/**
 * @param {{root: string, ref?: string, image: 'web'|'host'}} options
 * @returns {{fingerprint: string, lines: string[]}}
 */
export function imageContext({ root, ref = 'HEAD', image }) {
  const spec = IMAGES[image]
  if (!spec) throw new ContextError(`unknown image "${image}"; known: ${Object.keys(IMAGES).join(', ')}`)
  const lines = []
  const add = (id, label) => lines.push(`${id} ${label}`)

  const dockerfileId = objectId(root, ref, spec.dockerfile)
  if (!dockerfileId) throw new ContextError(`${spec.dockerfile} is not tracked at ${ref}`)
  const dockerfileText = git(root, ['show', `${ref}:${spec.dockerfile}`])

  for (const src of copySources(dockerfileText)) {
    const id = objectId(root, ref, src)
    if (id) {
      add(id, src)
      continue
    }
    const gen = spec.generated[src]
    if (!gen) {
      throw new ContextError(
        `${spec.dockerfile} copies '${src}', which git does not track at ${ref} and ${SELF} does not declare. ` +
          `If it is a build output, add it to IMAGES.${image}.generated with the command that builds it.`
      )
    }
    add(builtHash(root, src, gen), `${src} (built content)`)
  }

  for (const meta of [spec.dockerfile, '.dockerignore', SELF]) {
    const id = objectId(root, ref, meta)
    if (!id) throw new ContextError(`${meta} is not tracked at ${ref}`)
    add(id, meta)
  }

  lines.sort()
  const digest = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12)
  return { fingerprint: `${spec.prefix}-${digest}`, lines }
}

/** The one tag both images are deployed at: changes exactly when either image's context does. */
export function appTag(webFingerprint, hostFingerprint) {
  return `app-${createHash('sha256').update(`${webFingerprint}\n${hostFingerprint}`).digest('hex').slice(0, 12)}`
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
  try {
    if (argv.includes('--app-tag')) {
      const [web, host] = [arg('web'), arg('host')]
      if (!web || !host) throw new ContextError('--app-tag needs --web <wctx-…> and --host <hctx-…>')
      process.stdout.write(`${appTag(web, host)}\n`)
      return 0
    }
    const { fingerprint, lines } = imageContext({ root, ref: arg('ref') ?? 'HEAD', image: arg('image') })
    if (argv.includes('--explain')) process.stdout.write(`${lines.join('\n')}\n---\n${lines.length} inputs\n`)
    process.stdout.write(`${fingerprint}\n`)
    return 0
  } catch (e) {
    if (e instanceof ContextError) {
      process.stderr.write(`image-context: ${e.message}\n`)
      return 2
    }
    throw e
  }
}

// realpath on both sides: a temp directory on macOS is reached through a symlink (/var -> /private/var),
// and a plain comparison there makes the script exit 0 having printed nothing.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(process.argv[1]))
) {
  process.exit(main(process.argv.slice(2)))
}
