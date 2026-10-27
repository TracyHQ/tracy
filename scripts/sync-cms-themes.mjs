/**
 * Mirror the built Joomla template and WordPress theme into the distribution repository
 * (TracyHQ/claude-cowork), where they are released from — the same repository the Cowork plugin
 * and component are released from, and the only place a customer site ever downloads them.
 *
 *   node scripts/sync-cms-themes.mjs ~/TracyHQ/claude-cowork-joomla
 *   node scripts/sync-cms-themes.mjs ~/TracyHQ/claude-cowork-joomla --check
 *
 * Why a mirror and not a build inside that repository: the 152 style variations, the 152 token
 * files and the artifact sheets are generated here, from `vendor/tracy/od-design-system` and the brand
 * engine, and gated here by `pnpm build:check`. The distribution repository holds what is
 * released, byte for byte, so what a site downloads can be read there without running anything.
 *
 * The copy is a MIRROR: a file deleted here is deleted there. A merge would leave a design system
 * that was dropped upstream sitting in the released zip forever, and nothing would say so.
 *
 * `--check` reports differences and writes nothing (exit 1 when out of date), so a gate or a
 * release script can refuse to publish a tree that no longer matches this repository.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** What travels, and where it lands in the distribution repository. */
const PARTS = [
  {
    name: 'joomla template',
    from: path.join(ROOT, 'packages', 'cms', 'tracy-joomla-template', 'src', 'tpl_tracy'),
    to: path.join('joomla', 'template', 'tpl_tracy'),
    build: path.join(ROOT, 'packages', 'cms', 'tracy-joomla-template', 'scripts', 'build.mjs'),
    // The hand-written source of the manifest never ships: Joomla's installer must see one
    // manifest, and the zip already excludes it.
    skip: new Set(['templateDetails.tpl.xml', '.DS_Store'])
  },
  {
    name: 'wordpress theme',
    from: path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'src', 'tracy'),
    to: path.join('wordpress', 'theme', 'tracy'),
    build: path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'scripts', 'build.mjs'),
    skip: new Set(['.DS_Store'])
  },
  // A template's own theme travels the same way, to its own folder: its `inc/update.php` polls
  // `wordpress/theme/<slug>/update.json` there, and that folder's release is cut by
  // `release-wordpress-theme.mjs <version> --theme <slug>` in the distribution repository.
  ...[
    'tracy-base',
    'wp-ja-essence',
    'wp-ja-impact',
    'wp-ja-kinetic',
    'wp-ja-morgan',
    'wp-ja-nova',
    'wp-ja-restaurant',
    'wp-ja-vega',
    'wp-tracy-business'
  ].map((slug) => ({
    name: `wordpress theme ${slug}`,
    from: path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'src', slug),
    to: path.join('wordpress', 'theme', slug),
    build: path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'scripts', 'build.mjs'),
    buildArgs: ['--target', slug],
    // The folder is also where its sites read the announcement, so the mirror leaves that file be:
    // it belongs to the distribution repository's release script, not to this tree.
    skip: new Set(['.DS_Store', 'update.json'])
  }))
]

/** Every file under a directory, as paths relative to it. */
function filesOf(dir, skip, base = dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir).sort()) {
    if (skip.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesOf(full, skip, base))
    else out.push(path.relative(base, full))
  }
  return out
}

function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const repo = args.find((a) => !a.startsWith('--'))
  if (!repo) {
    console.error('usage: node scripts/sync-cms-themes.mjs <path to claude-cowork checkout> [--check]')
    process.exit(1)
  }
  const dest = path.resolve(repo.replace(/^~/, process.env.HOME ?? '~'))
  if (!existsSync(path.join(dest, '.git'))) {
    console.error(`sync-cms-themes: ${dest} is not a checkout of the distribution repository`)
    process.exit(1)
  }

  let stale = 0
  for (const part of PARTS) {
    // The tree that travels is the one the gate has just proven, never one built minutes ago and
    // edited since: `--check` on the package's own build is what says the generated files match
    // the vendor library.
    const gate = spawnSync(process.execPath, [part.build, ...(part.buildArgs ?? []), '--check'], {
      encoding: 'utf8'
    })
    if (gate.status !== 0) {
      console.error(`sync-cms-themes: ${part.name} is not up to date with the vendor library`)
      console.error((gate.stdout || gate.stderr || '').trim())
      process.exit(1)
    }

    const target = path.join(dest, part.to)
    const here = filesOf(part.from, part.skip)
    const there = filesOf(target, part.skip)
    const same =
      here.length === there.length &&
      here.every((rel, i) => there[i] === rel) &&
      here.every((rel) =>
        readFileSync(path.join(part.from, rel)).equals(readFileSync(path.join(target, rel)))
      )

    if (same) {
      console.log(`sync-cms-themes: ${part.name} — ${here.length} files, already current`)
      continue
    }
    stale++
    if (check) {
      console.log(`sync-cms-themes: ${part.name} — ${here.length} files here, ${there.length} there, differ`)
      continue
    }

    // Files the mirror skips at the top of the target (a theme's `update.json`) are the
    // distribution repository's own: carried across the wipe, never compared or copied from here.
    const kept = [...part.skip]
      .map((name) => path.join(target, name))
      .filter((file) => existsSync(file) && statSync(file).isFile())
      .map((file) => [file, readFileSync(file)])
    rmSync(target, { recursive: true, force: true })
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(part.from, target, {
      recursive: true,
      filter: (src) => !part.skip.has(path.basename(src))
    })
    for (const [file, bytes] of kept) writeFileSync(file, bytes)
    console.log(`sync-cms-themes: ${part.name} → ${part.to} (${here.length} files)`)
  }

  if (check && stale > 0) {
    console.error(
      `\nsync-cms-themes: ${stale} tree(s) out of date — run node scripts/sync-cms-themes.mjs ${repo}\n`
    )
    process.exit(1)
  }
  if (!check && stale > 0)
    console.log(
      '\nsync-cms-themes: commit the change in the distribution repository, then cut a release there.'
    )
}

main()
