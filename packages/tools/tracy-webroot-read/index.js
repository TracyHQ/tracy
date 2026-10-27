/**
 * tracy-webroot-read — the agent's tool for READING a CMS site, running in the sidecar.
 *
 * The old name was `tracy-wp`, wrong in two ways and changed on 31/08: it was narrower than the truth
 * (the plugin reads Joomla TOO, not only WordPress) and it did not state its most important constraint —
 * read only. The new name carries exactly those two things: it works on the WEBROOT, and it READs.
 *
 * WHY IT EXISTS. The agent already has `bash` and `glob`, so in theory it can find everything itself.
 * In practice, measured in a real session on 30/08: to answer "how much content does this site have and
 * which files define it", the agent ran a long chain of `glob`/`bash`, one `glob` **exceeded the
 * subprocess seam's 20 MB limit and failed**, and the user saw nothing but raw JSON. This tool turns
 * that chain into ONE call with a deterministic result.
 *
 * SCOPE: READ ONLY. The agent writes to a site through four other roads, each with its own fence
 * (`SYSTEM.md` §4; the Worker `…/reskin` door and `webroot-edit.sh` retired on 16/09/2026): shell
 * commands in the site's own web container, dsh's file tools under `/site/<label>`, CMS content
 * through tracy-web's Apply door, and EmDash's MCP door. Every turn becomes a commit in the
 * webroot's git repo, which Site changes reads (`SYSTEM.md` §5).
 *
 * 🔒 NEVER add a write tool here: it would be a fifth road through none of those fences, and its
 * writes would be missing from Site changes. 🔒 NEVER return a secret: `wp-config.php` and
 * `configuration.php` hold the database password and keys; the tools read only the field they need.
 */

import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'

import {
  insideWebroot,
  openInsideWebroot,
  resolveWebroot,
  sessionWebroot,
  WEBROOT_DIR
} from './src/webroot.mjs'

// Re-exported because they were this module's API before the fence moved into its own file.
export { resolveWebroot, sessionWebroot, WEBROOT_DIR }

export const name = 'tracy-webroot-read'
export const inject = ['tools']

/** Scan ceiling: a real WordPress webroot has tens of thousands of files. */
const MAX_FILES_SCANNED = 4000
const MAX_MATCHES = 50
const MAX_FILE_BYTES = 512 * 1024

/** Directories that never hold anything worth finding, and where file counts explode. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'vendor',
  'cache',
  'uploads',
  'upgrade',
  'languages',
  'tmp',
  'logs'
])

/**
 * Scan order, high signal first.
 *
 * 🔒 THIS ORDER IS CORRECTNESS, NOT OPTIMISATION. Measured on a real site (30/08):
 * `wp-content/plugins` alone has **4651 .php files**, while `mu-plugins` has only **12** —
 * and mu-plugins is where Tracy declares post types. The first version of this function walked
 * breadth-first in directory order, so it hit the ceiling **before** reaching mu-plugins and answered
 * "not found" for something sitting right there. A tool that answers wrong with confidence is worse
 * than no tool.
 *
 * `wp-admin` and `wp-includes` are not in the list: that is WordPress core, which declares no customer
 * post types. Dropping them cuts 1281 files without losing a single answer.
 */
const SEARCH_ORDER = [
  'wp-content/mu-plugins',
  'wp-content/themes',
  'wp-content/plugins',
  'wp-content',
  'components',
  'plugins',
  'templates',
  'administrator',
  ''
]

/**
 * Walks the directory tree with a ceiling, skipping noisy directories, high-signal areas first.
 * @returns paths relative to root, `.php` files only, no duplicates.
 */
async function walkPhp(root, order = SEARCH_ORDER) {
  const found = []
  const seen = new Set()

  for (const area of order) {
    if (found.length >= MAX_FILES_SCANNED) break
    const queue = [area]
    while (queue.length > 0 && found.length < MAX_FILES_SCANNED) {
      const rel = queue.shift()
      let entries
      try {
        const dir = await insideWebroot(root, path.join(root, rel))
        if (dir === null) continue
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (found.length >= MAX_FILES_SCANNED) break
        const childRel = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          // An area with its own pass above is not walked again from its parent.
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
          if (order.includes(childRel) && childRel !== rel) continue
          queue.push(childRel)
        } else if (entry.isFile() && entry.name.endsWith('.php') && !seen.has(childRel)) {
          seen.add(childRel)
          found.push(childRel)
        }
      }
    }
  }
  return found
}

/** Reads a text file with a size ceiling; returns an empty string when unreadable or outside the webroot. */
async function readTextCapped(root, file) {
  const handle = await openInsideWebroot(root, file)
  if (handle === null) return ''
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return ''
    return await handle.readFile('utf8')
  } catch {
    return ''
  } finally {
    await handle.close().catch(() => {})
  }
}

async function exists(root, file) {
  try {
    if ((await insideWebroot(root, file)) === null) return false
    return true
  } catch {
    return false
  }
}

/** The WordPress version lives in a PHP variable; no metadata file is cheaper. */
async function wordpressVersion(root) {
  const text = await readTextCapped(root, path.join(root, 'wp-includes/version.php'))
  return /\$wp_version\s*=\s*'([^']+)'/.exec(text)?.[1] ?? null
}

async function joomlaVersion(root) {
  for (const candidate of ['libraries/src/Version.php', 'libraries/cms/version/version.php']) {
    const text = await readTextCapped(root, path.join(root, candidate))
    const major = /MAJOR_VERSION\s*=\s*(\d+)/.exec(text)?.[1]
    const minor = /MINOR_VERSION\s*=\s*(\d+)/.exec(text)?.[1]
    const patch = /PATCH_VERSION\s*=\s*(\d+)/.exec(text)?.[1]
    if (major) return [major, minor, patch].filter((part) => part !== undefined).join('.')
  }
  return null
}

/**
 * WordPress's table prefix.
 *
 * 🔒 ONLY the prefix. `wp-config.php` also holds DB_PASSWORD, AUTH_KEY and seven other secrets — do not
 * read them, return them or log them. A tool that returns wp-config's contents is a tool that leaks
 * credentials into the model's transcript.
 */
async function tablePrefix(root) {
  const text = await readTextCapped(root, path.join(root, 'wp-config.php'))
  if (text === '') return null

  const literal = /\$table_prefix\s*=\s*['"]([A-Za-z0-9_]+)['"]\s*;/.exec(text)
  if (literal) return literal[1]

  // The official WordPress Docker image writes `getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_')`.
  // This is not an odd case — it is the shape of every site built from that image, the fleet included.
  // The first version matched literals only, so it returned null on the very first site it was tried on.
  const viaEnv = /\$table_prefix\s*=\s*[A-Za-z_]\w*\s*\([^)]*?['"]([A-Za-z0-9_]+)['"]\s*\)\s*;/.exec(text)
  if (viaEnv) return viaEnv[1]

  // Assigned but the value cannot be read: say so, rather than `null` as if there were no such line.
  return /\$table_prefix\s*=/.test(text) ? 'dynamic' : null
}

/** Reads a WordPress-style header (`Theme Name:`, `Plugin Name:`) from a file. */
function headerField(text, field) {
  const found = new RegExp(`^[\\s*#]*${field}\\s*:\\s*(.+)$`, 'im').exec(text)
  return found?.[1].trim() || null
}

async function listDirNames(root, dir) {
  try {
    const real = await insideWebroot(root, dir)
    if (real === null) return []
    const entries = await readdir(real, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  } catch {
    return []
  }
}

/** Detects the platform from traces on disk, never by guessing from directory names. */
async function detectPlatform(root) {
  if (await exists(root, path.join(root, 'wp-includes/version.php'))) return 'wordpress'
  if (await exists(root, path.join(root, 'configuration.php'))) {
    if (await exists(root, path.join(root, 'libraries/src/Version.php'))) return 'joomla'
    if (await exists(root, path.join(root, 'administrator'))) return 'joomla'
  }
  return 'unknown'
}

/**
 * Each pattern is one way a CMS declares a named thing.
 *
 * 🔒 `ref` IS NOT just a quoted name — it is "quoted OR a constant". Well-written WordPress code almost
 * always uses constants: the first site tried declared `define('TRACY_CPT','catalog_item')` and then
 * called `register_post_type( TRACY_CPT, … )`. The tool's first version matched literals only, so it
 * missed exactly the most carefully written codebases — and answered "not found" with confidence.
 * Phase 1 looks for constants first; phase 2 then looks for the calls.
 */
function refPattern(name, constants) {
  const quoted = `['"]${name}['"]`
  const names = constants.length > 0 ? `|${constants.join('|')}` : ''
  return `(?:${quoted}${names})`
}

const DEFINITION_PATTERNS = [
  { kind: 'post_type', build: (r) => `register_post_type\\s*\\(\\s*${r}` },
  { kind: 'taxonomy', build: (r) => `register_taxonomy\\s*\\(\\s*${r}` },
  { kind: 'shortcode', build: (r) => `add_shortcode\\s*\\(\\s*${r}` },
  { kind: 'block', build: (r) => `register_block_type\\s*\\(\\s*${r}` },
  { kind: 'option', build: (r) => `(?:get|update|add)_option\\s*\\(\\s*${r}` },
  { kind: 'hook', build: (r) => `(?:add_action|add_filter)\\s*\\(\\s*${r}` }
]

/** `define('X', 'symbol')` and `const X = 'symbol'` — the two ways PHP binds a name to a constant. */
function constantsBinding(text, symbol) {
  const names = new Set()
  const byDefine = new RegExp(`define\\s*\\(\\s*['"]([A-Z_][A-Z0-9_]*)['"]\\s*,\\s*['"]${symbol}['"]`, 'g')
  const byConst = new RegExp(`const\\s+([A-Z_][A-Z0-9_]*)\\s*=\\s*['"]${symbol}['"]`, 'g')
  for (const re of [byDefine, byConst]) {
    let hit
    while ((hit = re.exec(text)) !== null) names.add(hit[1])
  }
  return [...names]
}

/** Simple names only: this string goes straight into a RegExp. */
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/

function textBlock(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

export function apply(ctx, config) {
  const webroot = (exec) => sessionWebroot(config?.webroot, exec)

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'tracy_site_profile',
          description:
            'Identify the CMS in the site webroot and report its shape: platform, version, ' +
            'table prefix, themes, plugins and must-use plugins. Read-only. Call this before ' +
            'reasoning about where anything lives — guessing the platform from a directory ' +
            'name is the usual way to be wrong.',
          parameters: {},
          output: {
            schema: { type: 'json' },
            render: (_args, value) => textBlock(value)
          },
          async execute(_args, exec) {
            const root = await webroot(exec)
            const platform = await detectPlatform(root)
            if (platform === 'unknown') {
              return { webroot: root, platform, note: 'No WordPress or Joomla install found here.' }
            }
            if (platform === 'joomla') {
              return {
                webroot: root,
                platform,
                version: await joomlaVersion(root),
                extensions: (await listDirNames(root, path.join(root, 'components'))).slice(0, 100),
                templates: await listDirNames(root, path.join(root, 'templates'))
              }
            }

            const themesDir = path.join(root, 'wp-content/themes')
            const themeNames = await listDirNames(root, themesDir)
            const themes = []
            for (const dir of themeNames) {
              const text = await readTextCapped(root, path.join(themesDir, dir, 'style.css'))
              themes.push({ dir, name: headerField(text, 'Theme Name') })
            }

            const pluginsDir = path.join(root, 'wp-content/plugins')
            const plugins = []
            for (const dir of await listDirNames(root, pluginsDir)) {
              const main = await readTextCapped(root, path.join(pluginsDir, dir, `${dir}.php`))
              plugins.push({ dir, name: headerField(main, 'Plugin Name') })
            }

            let mustUse = []
            try {
              const muDir = await insideWebroot(root, path.join(root, 'wp-content/mu-plugins'))
              const entries = muDir === null ? [] : await readdir(muDir)
              mustUse = entries.filter((file) => file.endsWith('.php'))
            } catch {
              mustUse = []
            }

            return {
              webroot: root,
              platform,
              version: await wordpressVersion(root),
              tablePrefix: await tablePrefix(root),
              themes,
              plugins,
              mustUsePlugins: mustUse
            }
          }
        })
      ),
    'tracy-webroot-read: tracy_site_profile'
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'tracy_find_definition',
          description:
            'Find which PHP file defines a named CMS thing — a post type, taxonomy, shortcode, ' +
            'block, option or hook — and return the file and line. Read-only. Prefer this over ' +
            'a glob-and-grep crawl: it skips uploads, vendor and cache, so it neither misses ' +
            'must-use plugins nor blows the subprocess output cap.',
          parameters: {
            symbol: {
              type: 'string',
              required: true,
              description:
                'Exact registered name, e.g. a post type slug like "catalog_item". ' +
                'Letters, digits, underscore and hyphen only.'
            },
            kind: {
              type: 'string',
              description:
                'Narrow the search to one kind: post_type, taxonomy, shortcode, block, option, hook. ' +
                'Omit to search every kind.'
            }
          },
          output: {
            schema: { type: 'json' },
            render: (_args, value) => textBlock(value)
          },
          async execute(args, exec) {
            const root = await webroot(exec)
            const symbol = String(args.symbol)
            if (!SAFE_NAME.test(symbol)) {
              return { symbol, error: 'symbol must be 1-64 chars of letters, digits, _ or -' }
            }
            const wanted = args.kind
              ? DEFINITION_PATTERNS.filter((entry) => entry.kind === args.kind)
              : DEFINITION_PATTERNS
            if (wanted.length === 0) {
              return { symbol, error: `unknown kind ${JSON.stringify(args.kind)}` }
            }

            const files = await walkPhp(root)

            // PHASE 1 — read once, keep the contents, and collect every constant bound to the symbol.
            const texts = new Map()
            const constants = new Set()
            for (const rel of files) {
              const text = await readTextCapped(root, path.join(root, rel))
              if (text === '' || !text.includes(symbol)) continue
              texts.set(rel, text)
              for (const constant of constantsBinding(text, symbol)) constants.add(constant)
            }

            // PHASE 2 — find the calls, accepting both literals and the constants just found.
            //
            // 🔒 Match on the WHOLE TEXT, not line by line: `register_post_type(` and its argument are
            // often on different lines (test site: call on line 415, argument on line 416). `\s*`
            // already covers newlines, so just never split the text into lines before matching.
            const ref = refPattern(symbol, [...constants])
            const compiled = wanted.map((entry) => ({
              kind: entry.kind,
              re: new RegExp(entry.build(ref), 'g')
            }))

            const matches = []
            const scan = constants.size > 0 ? files : [...texts.keys()]
            for (const rel of scan) {
              if (matches.length >= MAX_MATCHES) break
              let text = texts.get(rel)
              if (text === undefined) {
                // A constant may be declared in one file and USED in another that never mentions the symbol.
                text = await readTextCapped(root, path.join(root, rel))
                if (text === '') continue
              }
              for (const { kind, re } of compiled) {
                re.lastIndex = 0
                let hit
                while ((hit = re.exec(text)) !== null && matches.length < MAX_MATCHES) {
                  const line = text.slice(0, hit.index).split('\n').length
                  matches.push({
                    kind,
                    file: rel,
                    line,
                    text: hit[0].replace(/\s+/g, ' ').trim().slice(0, 200)
                  })
                }
              }
            }

            return {
              symbol,
              webroot: root,
              constantsBoundToSymbol: [...constants],
              filesScanned: files.length,
              scanTruncated: files.length >= MAX_FILES_SCANNED,
              matches,
              matchesTruncated: matches.length >= MAX_MATCHES
            }
          }
        })
      ),
    'tracy-webroot-read: tracy_find_definition'
  )
}
