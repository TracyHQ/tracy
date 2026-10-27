/**
 * Which files of a template the role scan reads: its shipped stylesheets (CSS, SCSS, LESS, compiled
 * CSS) and the markup and components that carry classes (Astro, TSX/JSX, PHP, HTML, Vue). Tests,
 * tools, seeds, docs and third-party libraries are not the template's design and are left out; a
 * third-party stylesheet inside the template is listed as skipped, with why.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { skipByContent } from './skip-content.mjs'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.astro',
  '.cache',
  'coverage',
  'test',
  'tests',
  '__tests__',
  'fixtures',
  'docs',
  'seed',
  'tools',
  'ingest',
  'contract',
  'contracts',
  '.github',
  'scripts',
  'language',
  'languages',
  'images',
  'fonts'
])
const THIRD_PARTY =
  /(^|[./_-])(bootstrap|font-?awesome|fa-(solid|brands|regular)|swiper|slick|owl\.carousel|owl-carousel|animate|magnific|lightbox|html5lightbox|pdfjs|fancybox|aos|splide|glide|flatpickr|select2|chosen|jquery|icomoon|normalize|reset)([./_-]|$)/i

/** @returns {'css' | 'scss' | 'less' | 'markup' | 'script' | 'theme-json' | null} */
export function fileKindOf(path) {
  if (/\.(test|spec|stories|mock)\.[a-z]+$/i.test(path) || path.endsWith('.d.ts')) return null
  // a WordPress block theme's global styles and their style variations
  if (/(^|[\\/])theme\.json$/i.test(path) || /(^|[\\/])styles[\\/][^\\/]+\.json$/i.test(path))
    return 'theme-json'
  if (/\.css$/i.test(path)) return 'css'
  if (/\.scss$/i.test(path)) return 'scss'
  if (/\.less$/i.test(path)) return 'less'
  if (/\.(astro|html?|php|vue|svelte)$/i.test(path)) return 'markup'
  if (/\.(tsx|jsx|ts|js|mjs)$/i.test(path) && !/\.config\.[a-z]+$/i.test(path)) return 'script'
  return null
}

/**
 * @param {string} root the template's folder
 * @param {{ include?: string[] }} [opts] folders (relative to root) to read; default: `src/` when the
 *   template has one (an Astro/EmDash project), else the whole folder
 * @returns {{ files: { path: string, rel: string, kind: string }[], skipped: { file: string, reason: string }[] }}
 */
export function templateFiles(root, opts = {}) {
  const include = opts.include?.length ? opts.include : exists(join(root, 'src')) ? ['src'] : ['.']
  const files = []
  const skipped = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      const st = statSync(path)
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith('.')) walk(path)
        continue
      }
      const kind = fileKindOf(path)
      if (!kind) continue
      const rel = relative(root, path).split('\\').join('/')
      // a library carried in its own folder (js/html5lightbox/pdfjs/web/viewer.css) is skipped by the folder
      const folders = rel.split('/').slice(0, -1)
      if (
        THIRD_PARTY.test(basename(path)) ||
        folders.some((d) => THIRD_PARTY.test(d)) ||
        /(^|\/)vendor\//.test(rel)
      ) {
        skipped.push({ file: rel, reason: 'third-party library: its colours are not the template palette' })
        continue
      }
      if (/\.min\.[a-z]+$/i.test(name)) {
        skipped.push({
          file: rel,
          reason: 'minified file (*.min.*): a library build, not the template palette'
        })
        continue
      }
      if (st.size > 4 * 1024 * 1024) {
        skipped.push({ file: rel, reason: 'larger than 4 MB' })
        continue
      }
      const text = readFileSync(path, 'utf8')
      // the empty index.html a Joomla/WordPress folder carries so the server lists no directory
      if (/^index\.html?$/i.test(name) && text.length < 400 && !/\bclass\s*=|<style|style\s*=/i.test(text)) {
        skipped.push({ file: rel, reason: 'directory-listing blocker (an empty index.html): no design' })
        continue
      }
      const why = skipByContent(text, kind)
      if (why) {
        skipped.push({ file: rel, reason: why })
        continue
      }
      files.push({ path, rel, kind })
    }
  }
  for (const inc of include) if (exists(join(root, inc))) walk(join(root, inc))
  return { files, skipped }
}

/**
 * Import prefixes of the template's `tsconfig.json` `paths` (`"@/*": ["./src/*"]` → `@/` → `src/`), so a
 * component import resolves to its file. Comments and trailing commas in the file are tolerated.
 * @param {string} root @returns {Record<string, string>}
 */
export function importAliases(root) {
  let text
  try {
    text = readFileSync(join(root, 'tsconfig.json'), 'utf8')
  } catch {
    return {}
  }
  let cfg
  try {
    cfg = JSON.parse(
      text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/,(\s*[}\]])/g, '$1')
    )
  } catch {
    return {}
  }
  const base = String(cfg?.compilerOptions?.baseUrl ?? '.').replace(/^\.\/?/, '')
  const out = {}
  for (const [from, [to] = []] of Object.entries(cfg?.compilerOptions?.paths ?? {}))
    if (from.endsWith('/*') && typeof to === 'string' && to.endsWith('/*'))
      out[from.slice(0, -1)] = `${base ? `${base}/` : ''}${to.slice(0, -1).replace(/^\.\//, '')}`
  return out
}

function exists(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

/**
 * The release identity of a template folder: `tracy_setting.json` when it has one, else its
 * package.json, and the platform from what the folder holds.
 * @param {string} root
 */
export function templateMeta(root) {
  const json = (f) => {
    try {
      return JSON.parse(readFileSync(join(root, f), 'utf8'))
    } catch {
      return null
    }
  }
  const setting = json('tracy_setting.json')
  const pkg = json('package.json')
  const platform =
    setting?.platform ??
    (exists(join(root, 'templateDetails.xml'))
      ? 'joomla'
      : exists(join(root, 'style.css')) &&
          (exists(join(root, 'functions.php')) || exists(join(root, 'theme.json')))
        ? 'wordpress'
        : exists(join(root, 'astro.config.mjs'))
          ? 'emdash'
          : null)
  // a Joomla manifest and a WordPress stylesheet header name the template and its version too
  const text = (f) => {
    try {
      return readFileSync(join(root, f), 'utf8')
    } catch {
      return ''
    }
  }
  const xml = text('templateDetails.xml')
  const wp = platform === 'wordpress' ? text('style.css').slice(0, 4000) : ''
  const tag = (re) =>
    re
      .exec(xml || wp)
      ?.slice(1)
      .find(Boolean)
      ?.trim() ?? null
  return {
    template:
      setting?.template ??
      tag(/<name>([^<]+)<\/name>|Text Domain:\s*(\S+)/) ??
      pkg?.name?.replace(/^@[^/]+\//, '') ??
      basename(root),
    platform,
    version:
      setting?.version ?? tag(/<version>([^<]+)<\/version>|^\s*Version:\s*(\S+)/m) ?? pkg?.version ?? null,
    pkg
  }
}
