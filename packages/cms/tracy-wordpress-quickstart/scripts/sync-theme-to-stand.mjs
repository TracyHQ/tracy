#!/usr/bin/env node
/**
 * Put the FINAL theme zip on the build stand, and make the template parts of its database rows say what the theme
 * file says. A template part saved in the database shadows the theme's `parts/<name>.html`, so a part changed in the
 * theme (a footer line that now prints a token) shows on the stand, in the pack and in the sweep only when the row
 * is written again. Nothing else is touched: pages, options and posts stay as they are.
 *
 *   node sync-theme-to-stand.mjs --theme-zip <zip> --webroot <stand webroot> --wp "<wp-cli runner>" [--parts footer,header]
 *
 * The runner is the stand's wp-cli prefix (the same string the patch chain takes as --wp-a); the webroot is the folder
 * that runner sees as /var/www/html. Run it before the cycle (prune, pack, restore, verify), then read the part again.
 * Exit 0 done, 1 a command failed, 2 usage.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/

/**
 * The wp-cli argument lists that write each part's file into its database row.
 * @param {{ slug: string, parts: string[], ids: Record<string, number[]> }} plan
 * @returns {string[][]} one argument list per row, in order.
 */
export function syncCommands({ slug, parts, ids }) {
  if (!SAFE_NAME.test(slug)) throw new Error(`theme slug ${JSON.stringify(slug)} is not a plain name`)
  const out = []
  for (const part of parts) {
    if (!SAFE_NAME.test(part)) throw new Error(`part ${JSON.stringify(part)} is not a plain name`)
    for (const id of ids[part] ?? [])
      out.push(['post', 'update', String(id), `/var/www/html/wp-content/themes/${slug}/parts/${part}.html`])
  }
  return out
}

/** Shell-split a runner string on spaces (it holds no quoting beyond double quotes around nothing we use). */
const words = (s) => s.trim().split(/\s+/)

function main() {
  const { values: o } = parseArgs({
    options: {
      'theme-zip': { type: 'string' },
      webroot: { type: 'string' },
      wp: { type: 'string' },
      parts: { type: 'string', default: 'footer' }
    }
  })
  if (!o['theme-zip'] || !o.webroot || !o.wp) {
    process.stderr.write(
      'usage: sync-theme-to-stand.mjs --theme-zip <zip> --webroot <dir> --wp "<runner>" [--parts footer,header]\n'
    )
    process.exit(2)
  }
  const slug = path.basename(o['theme-zip']).replace(/-\d.*$/, '')
  const themes = path.join(o.webroot, 'wp-content/themes')
  if (!existsSync(themes)) throw new Error(`${themes} does not exist`)
  rmSync(path.join(themes, slug), { recursive: true, force: true })
  execFileSync('unzip', ['-q', o['theme-zip'], '-d', themes])
  const [bin, ...pre] = words(o.wp)
  const wp = (args) => execFileSync(bin, [...pre, ...args], { encoding: 'utf8' }).trim()
  const parts = o.parts.split(',').filter(Boolean)
  const ids = {}
  for (const part of parts)
    ids[part] = wp([
      'post',
      'list',
      '--post_type=wp_template_part',
      `--name=${part}`,
      '--field=ID',
      '--format=ids'
    ])
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
  for (const args of syncCommands({ slug, parts, ids })) {
    wp(args)
    process.stdout.write(`synced ${args[2]} from ${path.basename(args[3])}\n`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
