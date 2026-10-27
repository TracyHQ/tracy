#!/usr/bin/env node
/**
 * A JA Joomla template's stylesheets compiled from its own sources in ja-products — T4 SCSS with dart-sass,
 * T3 LESS with lessc — the way the role-variable batches rebuild css/*.css after editing scss/ or less/:
 *
 *   node scripts/template-css.mjs <ja-products>/products/joomlart/paid-templates/ja_x/source
 *        [--files template,darkmode]   only these entries (default: every entry whose css/<name>.css exists)
 *        [--write]                     replace css/<name>.css (and its .map when the template keeps one)
 *
 * The sources import the framework by a site path (`../../../plugins/system/t4/themes/base/vendors/...`,
 * `../../../plugins/system/t3/base-bs3/...`), so the compile runs in a throwaway site layout:
 * <tmp>/templates/<tpl> and <tmp>/plugins/system/<fw> are symlinks to the template source and to the
 * framework source in the same ja-products checkout (products/joomlart/frameworks/<fw>/source/plg_system_<fw>).
 * Compilers are pinned: sass 1.97.3 (JA Kinetic, ja-products 45a895423; TEMPLATE_CSS_SASS=<x.y.z> for another) and less 4.2.0 with --math=always
 * (Bootstrap 3 divides without parentheses) and --rewrite-urls=all (T3 writes urls relative to css/).
 *
 * Every entry is compared with the committed css/<name>.css with comments, whitespace, hex case/length and
 * leading zeros normalised: `same: true` means the source still builds what is shipped — check this BEFORE
 * editing, a template whose CSS was edited by hand (drift) loses those edits on --write.
 * Known drift, measured 16/10/2026: most JA T4 sheets were shipped through Prepros with autoprefixer (-webkit-
 * lines, hex colours) and sass 1.97.3 writes rgb() with fractions (JA Vogue: +447/-271 tokens); T3's own
 * compiler folded calc() (`calc(132%)`) where lessc 4 keeps `calc(100% + 32px)`. Keep such lines as
 * shipped, or let release-batch.mjs verify prove the default look did not move.
 * T3 colour themes (css/themes/<theme>/) and RTL (css/rtl/) are not built here; the result names them.
 * Prints one JSON document.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const SASS = `sass@${process.env.TEMPLATE_CSS_SASS ?? '1.97.3'}`
const LESS = 'less@4.2.0'
const args = process.argv.slice(2)
const opt = (n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const FILES = opt('--files')?.split(',').filter(Boolean) ?? null
const WRITE = args.includes('--write')
const SRC = args.find((a) => !a.startsWith('--')) && resolve(args.find((a) => !a.startsWith('--')))
if (!SRC || !existsSync(join(SRC, 'templateDetails.xml'))) {
  console.error(
    'usage: template-css.mjs <template source folder (has templateDetails.xml)> [--files a,b] [--write]'
  )
  process.exit(2)
}

// the framework: a scss/ folder is T4, a less/ folder is T3
const fw = existsSync(join(SRC, 'scss')) ? 't4' : existsSync(join(SRC, 'less')) ? 't3' : null
if (!fw) throw new Error(`${SRC}: neither scss/ (T4) nor less/ (T3)`)
const srcDir = join(SRC, fw === 't4' ? 'scss' : 'less')
const ext = fw === 't4' ? '.scss' : '.less'

// the ja-products checkout the template sits in: the first parent with products/joomlart/frameworks
let root = SRC
while (root !== dirname(root) && !existsSync(join(root, 'products/joomlart/frameworks'))) root = dirname(root)
const plugin = join(root, `products/joomlart/frameworks/${fw}/source/plg_system_${fw}`)
if (!existsSync(plugin)) throw new Error(`no framework source at ${plugin}`)

// the template's folder name as a site has it (ja_x), from templateDetails.xml
const xml = readFileSync(join(SRC, 'templateDetails.xml'), 'utf8')
const tpl = (xml.match(/<name>\s*([^<]+?)\s*<\/name>/)?.[1] ?? basename(dirname(SRC))).toLowerCase()

const site = mkdtempSync(join(tmpdir(), 'template-css-'))
mkdirSync(join(site, 'plugins/system'), { recursive: true })
mkdirSync(join(site, 'templates'), { recursive: true })
symlinkSync(plugin, join(site, 'plugins/system', fw))
symlinkSync(SRC, join(site, 'templates', tpl))
const inSite = join(site, 'templates', tpl)

// entries: a source file (no leading underscore for SCSS) whose compiled sibling exists in css/
// (T4's theme.scss is not one: T4 compiles it at run time from tpl/theme.tpl.scss with the site's own values)
const entries = (
  FILES ??
  readdirSync(srcDir)
    .filter((f) => f.endsWith(ext) && !f.startsWith('_') && !(fw === 't4' && f === 'theme.scss'))
    .map((f) => basename(f, ext))
).filter((n) => existsSync(join(srcDir, n + ext)) && (FILES || existsSync(join(SRC, 'css', `${n}.css`))))

/** CSS reduced to comparable tokens: no comments, short hex expanded and lower-cased, no leading zero. */
const tokens = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])\b(?![0-9a-fA-F])/g, '#$1$1$2$2$3$3')
    .toLowerCase()
    .replace(/(^|[\s:(,])0\.(\d)/g, '$1.$2')
    .replace(/\s*!important/g, ' !important')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
const tally = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())
const onlyIn = (a, b) => [...a].filter(([k, v]) => (b.get(k) ?? 0) < v).map(([k]) => k)

const out = { template: tpl, framework: fw, source: SRC, compiler: fw === 't4' ? SASS : LESS, files: [] }
try {
  for (const name of entries) {
    const target = join(SRC, 'css', `${name}.css`)
    const tmp = join(site, `${name}.css`)
    const keepMap = fw === 't4' && existsSync(`${target}.map`)
    let log = ''
    try {
      log =
        fw === 't4'
          ? execFileSync(
              'npx',
              [
                '-y',
                '-p',
                SASS,
                'sass',
                '--quiet',
                keepMap ? '--source-map' : '--no-source-map',
                join(inSite, 'scss', `${name}.scss`),
                join(inSite, 'css', `${name}.css.tmp-${process.pid}`)
              ],
              { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
            )
          : execFileSync(
              'npx',
              [
                '-y',
                '-p',
                LESS,
                'lessc',
                '--math=always',
                '--rewrite-urls=all',
                '--silent',
                join(inSite, 'less', `${name}.less`),
                tmp
              ],
              { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
            )
    } catch (e) {
      // a failed sass run may leave its half-written output beside the committed file
      for (const x of ['', '.map'])
        rmSync(join(SRC, 'css', `${name}.css.tmp-${process.pid}${x}`), { force: true })
      out.files.push({
        name,
        error: String(e.stderr || e.message)
          .split('\n')
          .slice(0, 6)
          .join('\n')
      })
      continue
    }
    // sass writes beside the committed file (its map paths are then relative to css/, as shipped)
    let css
    let map = null
    if (fw === 't4') {
      const t = join(SRC, 'css', `${name}.css.tmp-${process.pid}`)
      css = readFileSync(t, 'utf8').replace(`${basename(t)}.map`, `${name}.css.map`)
      if (keepMap)
        map = readFileSync(`${t}.map`, 'utf8').replace(`"file":"${basename(t)}"`, `"file":"${name}.css"`)
      rmSync(t, { force: true })
      rmSync(`${t}.map`, { force: true })
    } else css = readFileSync(tmp, 'utf8')
    const was = existsSync(target) ? tally(tokens(readFileSync(target, 'utf8'))) : new Map()
    const now = tally(tokens(css))
    const onlyCompiled = onlyIn(now, was)
    const onlyCommitted = onlyIn(was, now)
    out.files.push({
      name,
      same: onlyCompiled.length === 0 && onlyCommitted.length === 0,
      onlyCompiled: onlyCompiled.length,
      onlyCommitted: onlyCommitted.length,
      sampleCompiled: onlyCompiled.slice(0, 6),
      sampleCommitted: onlyCommitted.slice(0, 6),
      warnings: log.trim() ? log.trim().split('\n').length : 0,
      written: WRITE
    })
    if (WRITE) {
      writeFileSync(target, css)
      if (map) writeFileSync(`${target}.map`, map)
    }
  }
} finally {
  rmSync(site, { recursive: true, force: true })
}
// what this script does not build, so a reader knows to edit it by hand or through T3
out.notBuilt = ['themes', 'rtl'].filter((d) => existsSync(join(SRC, 'css', d)))
console.log(JSON.stringify(out, null, 2))
process.exit(out.files.some((f) => f.error) ? 1 : 0)
