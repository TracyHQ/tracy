/**
 * REG-PR-1100-p10-released-theme-number-not-reused: no WordPress theme tree carries content under a number
 * already released from TracyHQ/claude-cowork.
 *
 * A site takes a theme update only when the version goes up, and claude-cowork's release script refuses a
 * tag that exists, so a tree changed after its release but still declaring that release's number never
 * reaches a site, and mirroring it puts bytes under that number that no released zip holds (the Kinetic
 * 1.1.3 lesson). On 10/10/2026 three trees did: `tracy` 1.1.4 (functions.php and inc/brand-logo.php
 * changed by #879 and a2f40f706 after wordpress-theme-v1.1.4), wp-ja-kinetic 1.1.11 and wp-ja-morgan
 * 1.1.13 (a changelog entry added by #1092 an hour after both were released).
 *
 * RELEASED is each theme's newest release as measured on 10/10/2026 with `gh release list --repo
 * TracyHQ/claude-cowork` and `gh release download`: the tag and the digest of the zip's theme folder
 * (every file's path and sha256, files the mirror never carries left out). Per theme:
 *   S1 — the version the tree declares (theme.config.json, or package.json for `tracy`) is the one its
 *        built style.css says;
 *   S2 — it is either that release's number with the tree byte-identical to the release, or a later one;
 *   S3 — a theme whose readme.txt keeps a changelog opens it with the declared version.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { ROOT, checks } from './lib.mjs'

const c = checks()
const THEME = join(ROOT, 'packages/cms/tracy-wordpress-theme')

/** Newest release per theme on 10/10/2026: version, tag, digest of the zip's theme folder. */
const RELEASED = {
  tracy: [
    '1.1.4',
    'wordpress-theme-v1.1.4',
    'c86c7aa9d0dd7136e7c693725822b7d5d2b5278dfaee0d26bcb33212ce428670'
  ],
  'tracy-base': [
    '1.1.5',
    'wordpress-theme-tracy-base-v1.1.5',
    '3fd33a87e006d99d511921365fa073ff8ec8355e67d504f76dbb4a5f17d9be52'
  ],
  'wp-ja-essence': [
    '1.0.10',
    'wordpress-theme-wp-ja-essence-v1.0.10',
    'f1da68e00d87bb7d3486032f41e8867fafb37d45c7dfa22f5ddd16e5d63155af'
  ],
  'wp-ja-impact': [
    '1.0.8',
    'wordpress-theme-wp-ja-impact-v1.0.8',
    'c9f96622ddc9ffe48076b0f46df1db823a12ea312dca242d83e2e793dabf6669'
  ],
  'wp-ja-kinetic': [
    '1.1.11',
    'wordpress-theme-wp-ja-kinetic-v1.1.11',
    '7f6bb2dce7ef3907ebadc02e142e7d9980ff4dff4d1bb4d22d63ffc2f0b7c614'
  ],
  'wp-ja-morgan': [
    '1.1.13',
    'wordpress-theme-wp-ja-morgan-v1.1.13',
    '4d6208e948b6ab6998fdb154580f6dba9a7e278febe8b083eb58035f1e914de2'
  ],
  'wp-ja-nova': [
    '1.1.11',
    'wordpress-theme-wp-ja-nova-v1.1.11',
    '780d36783e64a33de95910ee0b27c1af0fae0ca5262f5bfa8873d878aa3764c3'
  ],
  'wp-ja-vega': [
    '1.1.13',
    'wordpress-theme-wp-ja-vega-v1.1.13',
    '575914904acb439efced1b6900e346ac105aec743a16059fc51146fb09c0004f'
  ],
  'wp-tracy-business': [
    '1.1.7',
    'wordpress-theme-wp-tracy-business-v1.1.7',
    '94a70de123b09ebb58292dd051f2bd304c707e4a0e7ecc8f74239673a96ed4e4'
  ]
}

// What the mirror never carries (scripts/sync-cms-themes.mjs) and what the release adds to the zip.
const SKIP = new Set(['.DS_Store', 'update.json', 'tracy-release.json'])

/** Every file under a directory, as sorted POSIX paths relative to it. */
function filesOf(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesOf(full, base))
    else out.push(relative(base, full).split(sep).join('/'))
  }
  return out.sort()
}

/** The digest RELEASED records: one `path<TAB>sha256` line per file, hashed. */
function treeDigest(dir) {
  const h = createHash('sha256')
  for (const rel of filesOf(dir)) {
    h.update(
      `${rel}\t${createHash('sha256')
        .update(readFileSync(join(dir, rel)))
        .digest('hex')}\n`
    )
  }
  return h.digest('hex')
}

/** -1, 0 or 1 comparing the x.y.z cores; a `-pre` suffix sorts before its own core. */
function compare(a, b) {
  const parts = (v) => {
    const [core, pre] = v.split('-')
    return [...core.split('.').map(Number), pre === undefined ? 1 : 0]
  }
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

for (const [slug, [released, tag, digest]] of Object.entries(RELEASED)) {
  const config =
    slug === 'tracy' ? join(THEME, 'package.json') : join(THEME, 'overlays', slug, 'theme.config.json')
  const declared = JSON.parse(readFileSync(config, 'utf8')).version
  const tree = join(THEME, 'src', slug)
  const stamped = readFileSync(join(tree, 'style.css'), 'utf8').match(/^Version:\s*(\S+)/m)?.[1]
  c.eq(`S1: ${slug} style.css Version is the declared ${declared}`, stamped, declared)

  const order = compare(declared, released)
  if (order === 0) {
    c.eq(
      `S2: ${slug} still declares ${released}, so src/${slug} is byte-identical to ${tag}`,
      treeDigest(tree),
      digest
    )
  } else {
    c.check(`S2: ${slug} declares ${declared}, a number after its release ${released}`, order > 0, declared)
  }

  const readme = join(tree, 'readme.txt')
  const log = existsSync(readme) ? readFileSync(readme, 'utf8').split('== Changelog ==')[1] : undefined
  if (log !== undefined) {
    c.eq(
      `S3: ${slug} readme.txt changelog opens with the declared version`,
      log.match(/^= (\S+) =$/m)?.[1],
      declared
    )
  }
}

c.done()
