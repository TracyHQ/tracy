/**
 * `POST /_host/site-files` — the language files and template sources of one site, read-only, for
 * `content.locate` in tracy-web (comment → edit, `apps/tracy-web/src/sites/content-strings.js`).
 *
 * WHY HERE. A picked element's words are often not in any record the Content API returns: a Joomla
 * language string (`Select your language`), a label hard-coded in a template layout (`Open menu`),
 * a block attribute in a WordPress theme part (`"label":"Resources"`). The only process that can
 * read a site's files is the one holding its webroot, and on a fleet host that is this one (the
 * sites root is mounted here; tracy-web holds no webroot and no docker socket). The Claude Cowork
 * plugin has no file-read action, and adding one would still leave sites whose plugin is older.
 *
 * WHAT IS READ — A FIXED SET, NEVER A PATH THE CALLER NAMES. The caller sends a label and a locale;
 * this file decides the directories and extensions by the platform the webroot shows:
 * - Joomla: `language/<tag>/*.ini` and `language/overrides/<tag>.override.ini` (never `.sys.ini`:
 *   extension names and positions for the administrator, not words a visitor reads), and every site
 *   template's `.php`/`.html` layouts plus its own `.ini` files of that language;
 * - WordPress: every theme's `.php`/`.html`, every plugin's `.php`, the core block renderers
 *   (`wp-includes/blocks/**.php`), the `.po` files of the page's locale, and the NAMES (not bytes) of
 *   the pictures themes and plugins ship;
 * - EmDash: the template's source in the site's OWN container (`/app/src`), since an EmDash webroot
 *   holds only the database and uploads: every `.astro`/`.tsx` (markup a visitor reads) and the
 *   word dictionaries (`*words.ts`, `*strings.ts`, `*messages.ts`, and `.ts`/`.json` under an
 *   `i18n/` or `locales/` folder). Read by `docker exec` into `<label>-web-1` (this process holds
 *   the docker socket), two fixed scripts, the label as the only input; the file list goes down
 *   stdin, each path first vouched for by the listing.
 * Symbolic links are never followed (a link can point out of the webroot), `vendor/`,
 * `node_modules/` and test folders are skipped, and every size is capped; a read that hits a cap
 * says `truncated` so the caller can answer `incomplete` rather than silently know less.
 *
 * CHEAP TO ASK AGAIN. The answer carries a fingerprint of every selected file's path, size and
 * modification time. A caller that sends back the fingerprint it holds gets `{unchanged: true}` and
 * no bytes when nothing moved — the same revalidation the Content API snapshot does by revision.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { siteShape } from './webroot.js'

export const SITE_FILE_LIMITS = Object.freeze({
  /** One file larger than this is a bundle or a data dump, not a template: skipped. */
  fileBytes: 512 * 1024,
  /** All text returned in one answer (WordPress with three plugins measured 4.2 MB, 27/09/2026). */
  totalBytes: 16 * 1024 * 1024,
  /** Text files in one answer. */
  files: 6000,
  /** Picture names in one answer. */
  images: 20000,
  /** Directory depth below a root. */
  depth: 12
})

/** Folders that hold other people's libraries, build tools or tests — never words a page prints. */
const SKIP_DIRS = new Set(['vendor', 'node_modules', 'tests', 'test', '.git', 'languages', 'language'])
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif)$/i
/** A language tag as a locale names it (`en-GB`, `pt-BR`, `af`). */
const SAFE_LOCALE = /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/

/**
 * Every file under `root` (relative to `webroot`) whose name passes `take`, depth-first, links
 * skipped. Directory names in `SKIP_DIRS` are not entered unless `keepDirs` names them.
 * @param {string} webroot
 * @param {string} root
 * @param {(name: string, rel: string) => boolean} take
 * @param {{ keepDirs?: Set<string>, depth?: number }} [options]
 * @returns {Promise<string[]>}
 */
async function walk(webroot, root, take, { keepDirs = new Set(), depth = SITE_FILE_LIMITS.depth } = {}) {
  const found = []
  const visit = async (rel, level) => {
    if (level > depth) return
    const entries = await readdir(path.join(webroot, rel), { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`
      // `Dirent` never follows a link: a symbolic link is neither a file nor a directory here.
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) && !keepDirs.has(entry.name)) continue
        await visit(child, level + 1)
      } else if (entry.isFile() && take(entry.name, child)) found.push(child)
    }
  }
  await visit(root, 0)
  return found
}

const exists = (file) =>
  lstat(file)
    .then((held) => held.isFile() || held.isDirectory())
    .catch(() => false)

/**
 * Which CMS a webroot holds, by the files only that CMS has. `null`: neither (an EmDash site keeps
 * only its data and uploads in the webroot; its template source is in its container, read by
 * `readEmdashFiles`).
 * @param {string} webroot
 * @returns {Promise<'joomla'|'wordpress'|null>}
 */
export async function webrootPlatform(webroot) {
  if (
    (await exists(path.join(webroot, 'wp-includes/version.php'))) &&
    (await exists(path.join(webroot, 'wp-content')))
  )
    return 'wordpress'
  if (
    (await exists(path.join(webroot, 'configuration.php'))) &&
    (await exists(path.join(webroot, 'language')))
  )
    return 'joomla'
  return null
}

/**
 * The files `content.locate` reads for one platform and locale, relative to the webroot.
 * @param {string} webroot
 * @param {'joomla'|'wordpress'} platform
 * @param {string|null} locale
 * @returns {Promise<{ texts: string[], images: string[] }>}
 */
export async function selectSiteFiles(webroot, platform, locale) {
  if (platform === 'joomla') {
    const tag = locale && SAFE_LOCALE.test(locale) ? locale.replace('_', '-') : null
    const texts = []
    if (tag) {
      texts.push(
        ...(await walk(
          webroot,
          `language/${tag}`,
          (name) => name.endsWith('.ini') && !name.endsWith('.sys.ini'),
          {
            depth: 0
          }
        ))
      )
      const override = `language/overrides/${tag}.override.ini`
      if (await exists(path.join(webroot, override))) texts.push(override)
    }
    const templates = await readdir(path.join(webroot, 'templates'), { withFileTypes: true }).catch(() => [])
    for (const template of templates
      .filter((one) => one.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const root = `templates/${template.name}`
      texts.push(
        ...(await walk(
          webroot,
          root,
          (name, rel) =>
            /\.(php|html)$/.test(name) ||
            (tag !== null &&
              name.endsWith('.ini') &&
              !name.endsWith('.sys.ini') &&
              (name.startsWith(`${tag}.`) || rel.includes(`/${tag}/`))),
          { keepDirs: new Set(['language']) }
        ))
      )
    }
    return { texts, images: [] }
  }
  const texts = []
  const images = []
  const code = await walk(
    webroot,
    'wp-content/themes',
    (name) => /\.(php|html)$/.test(name) || IMAGE_EXT.test(name)
  )
  const plugins = await walk(
    webroot,
    'wp-content/plugins',
    (name) => name.endsWith('.php') || IMAGE_EXT.test(name)
  )
  for (const rel of [...code, ...plugins]) (IMAGE_EXT.test(rel) ? images : texts).push(rel)
  texts.push(...(await walk(webroot, 'wp-includes/blocks', (name) => name.endsWith('.php'))))
  const wpLocale = locale && SAFE_LOCALE.test(locale) ? locale.replace('-', '_') : null
  if (wpLocale && !/^en(_US)?$/.test(wpLocale)) {
    // WordPress's own locale names drop the region where it has one language (`uk`, `vi`).
    const names = new Set([wpLocale, wpLocale.split('_')[0]])
    texts.push(
      ...(await walk(
        webroot,
        'wp-content/languages',
        (name) =>
          name.endsWith('.po') &&
          [...names].some((one) => name === `${one}.po` || name.endsWith(`-${one}.po`)),
        { keepDirs: new Set(['languages']), depth: 1 }
      ))
    )
  }
  return { texts, images }
}

/**
 * The fingerprint of a file set: path, size and modification time of each, in order.
 * @param {{ path: string, size: number, mtimeMs: number }[]} stats
 */
export function filesFingerprint(stats) {
  const hash = createHash('sha256')
  for (const one of stats) hash.update(`${one.path}\t${one.size}\t${Math.trunc(one.mtimeMs)}\n`)
  return hash.digest('hex')
}

// ── EmDash: the template source in the site's container ─────────────────────────────────────────

/** Where an EmDash image keeps the template source (`packages/cms/tracy-emdash-theme-*`'s `Dockerfile`). */
export const EMDASH_SRC = '/app/src'

/**
 * Lists every candidate file below `/app/src` as `<size> <mtime seconds> ./<path>`. `find` never
 * follows a link (`-P` is its default), and build output, dependencies and tests are pruned. Exit 3:
 * the image keeps no template source.
 */
const EMDASH_LIST = `cd ${EMDASH_SRC} 2>/dev/null || exit 3
find . -maxdepth ${SITE_FILE_LIMITS.depth} \\( -name node_modules -o -name dist -o -name .git -o -name tests -o -name test \\) -prune -o -type f \\( -name '*.astro' -o -name '*.tsx' -o -name '*.ts' -o -name '*.json' \\) -exec stat -c '%s %Y %n' {} +`

/**
 * Reads the paths on stdin (relative to `/app/src`, one per line): `F <path>` then the file in
 * base64 on one line, or `M <path>` and an empty line when it is no longer a plain file — a link put
 * there after the listing is not followed.
 */
const EMDASH_READ = `cd ${EMDASH_SRC} || exit 3
while IFS= read -r p; do
  if [ -f "$p" ] && [ ! -L "$p" ]; then printf 'F %s\\n' "$p"; base64 -w0 "$p"; printf '\\n'
  else printf 'M %s\\n\\n' "$p"; fi
done`

/** A path the listing may name: plain segments, no `..`, nothing a line or a shell could split. */
const SAFE_SRC_PATH = /^(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9_@.[\]()+-]+(?:\/[A-Za-z0-9_@.[\]()+-]+)*$/

/**
 * Is this template file one `content.locate` reads? Markup a visitor reads (`.astro`, `.tsx`), and
 * dictionaries of the words the theme says itself; other TypeScript is code, and a declaration file
 * (`.d.ts`) prints nothing.
 * @param {string} rel - relative to `/app/src`.
 */
export function emdashTakes(rel) {
  if (/\.(astro|tsx)$/.test(rel)) return true
  if (rel.endsWith('.d.ts')) return false
  const inDictionary = /(?:^|\/)(?:i18n|locales)\//.test(rel)
  if (rel.endsWith('.json')) return inDictionary
  if (rel.endsWith('.ts')) return inDictionary || /(?:^|[/_-])(?:words|strings|messages)\.ts$/.test(rel)
  return false
}

/**
 * `docker exec -i <container> sh -c <script>`, stdin written and closed, stdout kept as bytes up to
 * `maxBytes` (past it the process is killed and `cut` says so). Not `run.js`'s `runScript`: that
 * keeps only the last 200 lines and mixes stderr in, and these bytes are file contents.
 * @param {{ container: string, script: string, stdin?: string, maxBytes?: number, timeoutMs?: number }} input
 * @returns {Promise<{ code: number, stdout: Buffer, cut?: boolean }>}
 */
export function dockerExec({
  container,
  script,
  stdin = '',
  maxBytes = 32 * 1024 * 1024,
  timeoutMs = 20_000
}) {
  return new Promise((resolve) => {
    const child = spawn('docker', ['exec', '-i', container, 'sh', '-c', script], {
      stdio: ['pipe', 'pipe', 'ignore']
    })
    const chunks = []
    let size = 0
    let cut = false
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        cut = true
        child.kill('SIGKILL')
        return
      }
      chunks.push(chunk)
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    const done = (code) => {
      clearTimeout(timer)
      resolve({ code: cut ? 0 : code, stdout: Buffer.concat(chunks), ...(cut ? { cut: true } : {}) })
    }
    child.once('close', (code) => done(code ?? 1))
    child.once('error', () => done(1))
  })
}

/**
 * Read an EmDash site's template source out of its container.
 * @param {{ label: string, locale: string|null, known: string|null, limits: typeof SITE_FILE_LIMITS,
 *   exec: typeof dockerExec }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function readEmdashFiles({ label, locale, known, limits, exec }) {
  const container = `${label}-web-1`
  const listed = await exec({ container, script: EMDASH_LIST, maxBytes: 4 * 1024 * 1024 })
  const empty = { platform: 'emdash', fingerprint: null, files: [], images: [] }
  if (listed.code === 3) return { status: 200, body: empty }
  if (listed.code !== 0 || listed.cut) return { status: 502, body: { code: 'SITE_UNREADABLE' } }
  let truncated = false
  const stats = []
  for (const line of listed.stdout.toString('utf8').split('\n')) {
    const match = /^(\d+) (\d+) \.\/(.+)$/.exec(line)
    if (!match || !SAFE_SRC_PATH.test(match[3]) || !emdashTakes(match[3])) continue
    const size = Number(match[1])
    if (size > limits.fileBytes) continue
    stats.push({ path: match[3], size, mtimeMs: Number(match[2]) * 1000 })
  }
  stats.sort((a, b) => a.path.localeCompare(b.path))
  if (stats.length > limits.files) {
    stats.length = limits.files
    truncated = true
  }
  const wanted = []
  let total = 0
  for (const one of stats) {
    if (total + one.size > limits.totalBytes) {
      truncated = true
      break
    }
    total += one.size
    wanted.push(one)
  }
  const fingerprint = filesFingerprint([
    ...stats.map((one) => ({ ...one, path: `${EMDASH_SRC}/${one.path}` })),
    { path: `\u0000emdash\u0000${locale ?? ''}`, size: truncated ? 1 : 0, mtimeMs: 0 }
  ])
  if (known !== null && known === fingerprint)
    return { status: 200, body: { platform: 'emdash', fingerprint, unchanged: true } }
  if (wanted.length === 0)
    return { status: 200, body: { ...empty, fingerprint, ...(truncated ? { truncated: true } : {}) } }
  const read = await exec({
    container,
    script: EMDASH_READ,
    stdin: `${wanted.map((one) => one.path).join('\n')}\n`,
    maxBytes: Math.ceil(total * 1.4) + wanted.length * 600 + 4096
  })
  if (read.code !== 0 || read.cut) return { status: 502, body: { code: 'SITE_UNREADABLE' } }
  const asked = new Set(wanted.map((one) => one.path))
  const files = []
  const lines = read.stdout.toString('utf8').split('\n')
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const head = /^([FM]) (.+)$/.exec(lines[i])
    if (!head || !asked.has(head[2])) continue
    asked.delete(head[2])
    if (head[1] === 'M') continue
    files.push({
      path: `${EMDASH_SRC}/${head[2]}`,
      text: Buffer.from(lines[i + 1], 'base64').toString('utf8')
    })
  }
  // A file listed and then gone (or turned into a link) is words this answer no longer holds.
  if (files.length < wanted.length) truncated = true
  return {
    status: 200,
    body: { platform: 'emdash', fingerprint, files, images: [], ...(truncated ? { truncated: true } : {}) }
  }
}

/**
 * Read one site's language and template files.
 * @param {{ label: string, locale: string|null, known?: string|null,
 *   config: { sitesRoot: string, privateRoot?: string },
 *   limits?: Partial<typeof SITE_FILE_LIMITS>, exec?: typeof dockerExec }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function readSiteFiles({
  label,
  locale,
  known = null,
  config,
  limits: asked = {},
  exec = dockerExec
}) {
  const limits = { ...SITE_FILE_LIMITS, ...asked }
  const webroot = path.join(config.sitesRoot, label, '.webroot')
  const root = await lstat(webroot).catch(() => null)
  if (!root?.isDirectory()) return { status: 404, body: { code: 'NO_WEBROOT' } }
  const platform = await webrootPlatform(webroot)
  if (!platform) {
    // An EmDash site by the fleet's own marks (`siteShape`, the token door's rule), never by a guess.
    if (config.privateRoot && (await siteShape(path.join(config.privateRoot, label))) === 'emdash')
      return readEmdashFiles({ label, locale, known, limits, exec })
    return { status: 200, body: { platform: null, fingerprint: null, files: [], images: [] } }
  }
  const selected = await selectSiteFiles(webroot, platform, locale)
  let truncated = false
  const stats = []
  for (const rel of selected.texts) {
    const held = await lstat(path.join(webroot, rel)).catch(() => null)
    if (!held?.isFile()) continue
    if (held.size > limits.fileBytes) continue
    if (stats.length >= limits.files) {
      truncated = true
      break
    }
    stats.push({ path: rel, size: held.size, mtimeMs: held.mtimeMs })
  }
  const images = selected.images.slice(0, limits.images)
  if (selected.images.length > limits.images) truncated = true
  const fingerprint = filesFingerprint([
    ...stats,
    ...images.map((one) => ({ path: one, size: 0, mtimeMs: 0 })),
    { path: `\u0000${platform}\u0000${locale ?? ''}`, size: truncated ? 1 : 0, mtimeMs: 0 }
  ])
  if (known !== null && known === fingerprint)
    return { status: 200, body: { platform, fingerprint, unchanged: true } }
  const files = []
  let total = 0
  for (const one of stats) {
    if (total + one.size > limits.totalBytes) {
      truncated = true
      break
    }
    const text = await readFile(path.join(webroot, one.path), 'utf8').catch(() => null)
    if (text === null) continue
    total += one.size
    files.push({ path: one.path, text })
  }
  return {
    status: 200,
    body: { platform, fingerprint, files, images, ...(truncated ? { truncated: true } : {}) }
  }
}
