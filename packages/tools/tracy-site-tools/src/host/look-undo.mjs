/**
 * THE LOOK UNDO (Brian, 29/09/2026 ~17:00, "Comment → edit" stage 5): a look change made in a comment
 * turn gets an undo, and Tracy says its scope.
 *
 * WHY. The comment fence (`comment-fence.mjs`) lets exactly one kind of site-file write through in a
 * comment turn — a look change (a stylesheet, a block theme's `theme.json`) — because the person who
 * picks an element and asks for a look wants it changed. But that write has no Apply-door receipt.
 * Stand E2E round 2, G1 (`tasks/evidence/comment-thread/stand-e2e.md` § Round 2): "make this heading
 * lighter" on Joomla T4 edited the template's `.scss` and ran `php tools/t4-scss.php`, which rewrote
 * `css/template.css` — every card on every page in every language changed, and nothing could put it
 * back. So before the fence lets such a write run, the files it will change are copied here, under an
 * undo id the tool result carries, and `tracy_site` `look.revert {undo}` puts them back byte for byte.
 *
 * WHAT IS KEPT, PER CMS. The written file itself, always (or "did not exist", so the undo deletes it).
 * Plus the output a known compiler rebuilds from it, copied at the same moment, so restoring both
 * needs no recompile:
 * - Joomla T4: a `.scss` under `templates/<t>/scss/` → `templates/<t>/css/template.css` (what
 *   `tools/t4-scss.php` builds by default), and for a top-level non-partial `scss/<name>.scss` also
 *   `css/<name>.css` (what `--all` / `--only` build). T4's own bundle under `media/t4/` is rebuilt by
 *   T4 on the next request and is never copied (it is T4's cache, not a source).
 * - WordPress: `style.css`, other theme stylesheets and `theme.json` are read as they are — no
 *   compiler, nothing more to keep. `look.set` writes none of them: it writes the site's Additional
 *   CSS (the `custom_css` post of the theme it runs, `look-set.mjs`), which is not a file — the undo
 *   keeps its content before the write and after it ({@link LookCustomCss}), and `look.revert` puts
 *   the before back only while it still holds the after (a person or another change that wrote to it
 *   since is never overwritten: `LOOK_UNDO_CHANGED_SINCE`).
 * - EmDash: the template source under `/app/src` (inside the site's container) or `<site>/template/`
 *   is kept; the served build is not a file here — after an undo the site needs
 *   `tracy_site_build_emdash request site.rebuild`, which the answer says.
 * NOT covered: a compiler this file does not know (a theme's own npm build), and a write the fence
 * cannot see (a program that writes by itself, `php script.php`) — the fence's own limits.
 *
 * WHERE THE STORE LIVES: `<site>/.tracy/undo/look/<id>/` — `manifest.json` plus one blob per file that
 * existed. `.tracy/` is the site folder's machine-written corner: outside `.webroot/` (so no visitor
 * can fetch a copy), in the site folder's own `.gitignore` (so the team repo never swallows it,
 * `siteFolder.mjs` `GITIGNORE`), on the same `/site/<label>` mount the fence and `page.look` already
 * use from this process, and chowned www-data with the rest of the folder at provision. An `/app/`
 * file is read and written back through the site's OWN container (`<label>-web-1`), as the agent's
 * own shell reaches it — never another site's.
 *
 * KEPT: the newest {@link LOOK_UNDO_KEEP} entries per site; each new snapshot removes the oldest past
 * that. A pruned id answers `LOOK_UNDO_UNKNOWN` like any id this site never had.
 *
 * 🔒 ONE SITE'S UNDO NEVER TOUCHES ANOTHER. The id is looked up only in THIS site's store (the session's
 * own site root), it must be six hex digits (no path), and every file of its manifest is checked again
 * before anything is written — inside this site's served tree (`.webroot/`, `template/`, symlinks
 * resolved) or under `/app/` in this site's container. One path outside refuses the whole undo.
 */
import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { callWriteTargets, isLookFile, served } from './comment-fence.mjs'

/** Where a site's look undo entries live, relative to its site folder. */
export const LOOK_UNDO_DIR = '.tracy/undo/look'

/** How many undo entries one site keeps. */
export const LOOK_UNDO_KEEP = 20

/** An undo id: six hex digits, nothing a path can be made of. */
export const UNDO_ID = /^[0-9a-f]{6}$/

/**
 * The `target.kind` a WordPress look write (or its revert) is reported to tracy-web with, beside
 * via `look-css` and its undo id (`index.ts` `siteChanged`): what turn undo
 * (`apps/tracy-web/src/sites/turn-undo.js`) reads to put that Additional CSS back. Names only.
 */
export const LOOK_CSS_TARGET_KIND = 'additional-css'

/** A T4 stylesheet source: the template folder, then the path under its `scss/`. */
const T4_SCSS = /^(.*\/templates\/[^/]+)\/scss\/(.+)\.scss$/

/**
 * The files one call will change that need a copy first: every served look file it writes, each
 * followed by what a known compiler rebuilds from it. Empty outside a comment turn, for a call the
 * fence refuses anyway, and for anything but a look file.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string,
 *   turn: { writes: string[] } | null }} call - as `commentFenceDecision` takes it.
 * @returns {string[]} absolute paths, host side or `/app/…` in the site's container, no repeats.
 */
export function lookFiles({ name, args, cwd, siteRoot, turn }) {
  if (turn === null) return []
  /** @type {string[]} */
  const out = []
  const add = (/** @type {string} */ file) => {
    if (!out.includes(file)) out.push(file)
  }
  for (const target of lookWriteTargets({ name, args, cwd, siteRoot })) {
    add(target)
    const t4 = T4_SCSS.exec(target)
    if (t4 === null) continue
    add(`${t4[1]}/css/template.css`)
    if (!t4[2].includes('/') && !t4[2].startsWith('_')) add(`${t4[1]}/css/${t4[2]}.css`)
  }
  return out
}

/**
 * The served look files (a stylesheet, a block theme's `theme.json`) one file-tool call writes, in
 * ANY turn — what changes how the site looks, so a write of one that ran stamps the site changed for
 * everybody's Refresh button (stage 6 F2, `index.ts`). `lookFiles` is the comment-turn subset that is
 * also copied for an undo.
 * @param {{ name: string, args: unknown, cwd: string, siteRoot: string }} call
 * @returns {string[]}
 */
export function lookWriteTargets({ name, args, cwd, siteRoot }) {
  const targets = callWriteTargets({ name, args, cwd, siteRoot }) ?? []
  return [...new Set(targets.filter((target) => served(target, siteRoot) && isLookFile(target)))]
}

/**
 * @typedef {{ read(): Promise<{ stylesheet: string, css: string, block?: boolean, exists?: boolean }>,
 *   write(input: { stylesheet: string, css: string, expect: string }):
 *     Promise<{ ok: true, css: string } | { ok: false, conflict: true }>,
 *   remove?(input: { stylesheet: string, expect: string }):
 *     Promise<{ ok: true, css: string } | { ok: false, conflict: true }> }} LookCustomCss
 * A WordPress site's Additional CSS: `read` is the `custom_css` post of the theme it runs (`stylesheet`,
 * `''` when it has none, and then `exists: false`) and whether that theme is a block theme (`block`:
 * WordPress then prints the CSS inside global styles, before the theme's own sheets, `look-set.mjs`);
 * `write` replaces it only while its content still hashes to `expect` ({@link cssHash}), else answers
 * `conflict`, and gives back the content WordPress stored; `remove` deletes the post the same way —
 * how an undo puts back a site that had none.
 * @typedef {{ read(file: string): Promise<Buffer | null>, write(file: string, bytes: Buffer): Promise<void>,
 *   remove(file: string): Promise<void>, customCss?: LookCustomCss }} LookIo
 * A null read is "does not exist".
 */

/** How the Additional CSS a write expects is named: the SHA-256 of its UTF-8 text, as PHP's `hash()`. */
export const cssHash = (/** @type {string} */ css) => createHash('sha256').update(css, 'utf8').digest('hex')

/** The web container's mount of the webroot (`render-compose.sh`: `<webroot>:/var/www/html`). */
const CONTAINER_WEBROOT = '/var/www/html'

/** What an answer calls a WordPress site's Additional CSS, in `files` and `restored`. */
export const ADDITIONAL_CSS = 'Additional CSS'

/**
 * The PHP `wp eval` runs in a WordPress site's web container for its Additional CSS, a JSON request
 * on stdin: `{mode:"read"}`, `{mode:"write", stylesheet, css, expect}` or `{mode:"remove", stylesheet,
 * expect}`. It prints ONE line, `TRACY_WP_CSS <base64 JSON>`, whatever else WordPress prints.
 * - The post is WordPress's own (`wp_get_custom_css_post`, `wp_update_custom_css_post` — what the
 *   Customizer's "Additional CSS" panel writes), so WordPress prints it in `wp_head` at priority 101
 *   (`wp_custom_css_cb`), after the stylesheets it enqueued and the global-styles inline CSS, and a
 *   theme update leaves it alone.
 * - `expect`: the write lands only while the post still holds what the caller read (compare and set),
 *   so a person who saved Additional CSS in between is never overwritten.
 * - `kses_remove_filters()`: wp-cli runs with no user, so WordPress would pass the text through kses
 *   as a post body and turn the `>` of a selector into `&gt;`. The Customizer writes it as an
 *   administrator, unfiltered; this does the same.
 * - The answer carries what WordPress stored, read back, so an undo compares against exactly that.
 * - 🔒 `exists` and `remove` (uiweekwp, 10/10/2026): a site with no Additional CSS reads as `""`, so
 *   an undo of the first look write put `""` back — into the post that write had created, leaving an
 *   empty `custom_css` post the site never had. `read` now says whether the post exists, and an undo
 *   of a write that created it deletes it (`wp_delete_post`, revisions with it; the next lookup caches
 *   "none" for the theme, as WordPress does for a site that never had one), compare-and-set as `write`.
 */
export const WP_CUSTOM_CSS_PHP =
  '$o=function($a){echo "\\nTRACY_WP_CSS ".base64_encode(json_encode($a,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE))."\\n";};' +
  '$q=json_decode(stream_get_contents(fopen("php://stdin","r")),true);' +
  'if(!is_array($q)||!isset($q["mode"])){$o(["ok"=>false,"error"=>"no request"]);return;}' +
  '$s=(isset($q["stylesheet"])&&is_string($q["stylesheet"])&&$q["stylesheet"]!=="")?$q["stylesheet"]:get_stylesheet();' +
  '$now=function()use($s){$p=wp_get_custom_css_post($s);return $p?(string)$p->post_content:"";};' +
  '$c=$now();' +
  'if($q["mode"]==="read"){$o(["ok"=>true,"stylesheet"=>$s,"css"=>$c,"exists"=>wp_get_custom_css_post($s)?true:false,"block"=>wp_get_theme($s)->is_block_theme()]);return;}' +
  '$w=$q["mode"]==="write";' +
  'if((!$w&&$q["mode"]!=="remove")||($w&&(!isset($q["css"])||!is_string($q["css"])))||!isset($q["expect"])||!is_string($q["expect"])){$o(["ok"=>false,"error"=>"bad request"]);return;}' +
  'if(!hash_equals($q["expect"],hash("sha256",$c))){$o(["ok"=>false,"conflict"=>true,"stylesheet"=>$s]);return;}' +
  'if(!$w){$p=wp_get_custom_css_post($s);if($p&&!wp_delete_post($p->ID,true)){$o(["ok"=>false,"error"=>"the Additional CSS post was not deleted"]);return;}' +
  '$o(["ok"=>true,"stylesheet"=>$s,"css"=>$now(),"exists"=>wp_get_custom_css_post($s)?true:false]);return;}' +
  'kses_remove_filters();' +
  '$r=wp_update_custom_css_post($q["css"],["stylesheet"=>$s]);' +
  'if(is_wp_error($r)){$o(["ok"=>false,"error"=>$r->get_error_message()]);return;}' +
  '$o(["ok"=>true,"stylesheet"=>$s,"css"=>$now()]);'

/**
 * The docker sub-argv that runs {@link WP_CUSTOM_CSS_PHP} in a WordPress site's own web container, as
 * the web server's user: wp-cli with no plugin and no theme code loaded (neither is needed to read or
 * write a post, and neither may print into the answer).
 * @param {string} container
 */
export function wpCustomCssArgv(container) {
  return [
    'exec',
    '-i',
    '-u',
    'www-data',
    container,
    'wp',
    `--path=${CONTAINER_WEBROOT}`,
    '--skip-plugins',
    '--skip-themes',
    '--no-color',
    'eval',
    WP_CUSTOM_CSS_PHP
  ]
}

/**
 * The one answer line of {@link WP_CUSTOM_CSS_PHP}, or null.
 * @param {string} stdout
 * @returns {Record<string, unknown> | null}
 */
export function parseWpCustomCss(stdout) {
  const line = String(stdout)
    .split('\n')
    .find((l) => l.startsWith('TRACY_WP_CSS '))
  if (line === undefined) return null
  try {
    const out = JSON.parse(Buffer.from(line.slice('TRACY_WP_CSS '.length).trim(), 'base64').toString('utf8'))
    return out && typeof out === 'object' && !Array.isArray(out) ? out : null
  } catch {
    return null
  }
}

/** The script the site's container runs for an `/app/` file: `node -e SCRIPT <mode> <file>`. */
export const LOOK_FILE_SCRIPT =
  'const fs=require("fs"),path=require("path");const [mode,file]=process.argv.slice(1);' +
  'try{if(mode==="read"){if(!fs.existsSync(file)){console.log("TRACY_LOOK_ABSENT")}else{console.log("TRACY_LOOK_B64 "+fs.readFileSync(file).toString("base64"))}}' +
  'else if(mode==="write"){const c=[];process.stdin.on("data",d=>c.push(d));process.stdin.on("end",()=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(Buffer.concat(c).toString(),"base64"));console.log("TRACY_LOOK_OK")})}' +
  'else if(mode==="remove"){fs.rmSync(file,{force:true});console.log("TRACY_LOOK_OK")}}catch(e){console.log("TRACY_LOOK_ERR "+String((e&&e.message)||e).slice(0,200))}'

/**
 * The file access a snapshot and an undo use: the site folder through this process's own mount, an
 * `/app/` file through the site's own container.
 * @param {{ siteRoot: string, container: string | null,
 *   run: (input: { argv: readonly string[], stdin?: string, timeoutMs: number, maxBuffer: number }) =>
 *     Promise<{ code: number | null, stdout: string, stderr: string }> }} where
 * @returns {LookIo}
 */
export function lookIo({ container, run }) {
  const inContainer = (/** @type {string} */ file) => file.startsWith('/app/')
  /** @type {(mode: string, file: string, stdin?: string) => Promise<string>} */
  const exec = async (mode, file, stdin) => {
    if (container === null || !/^[a-z0-9][a-z0-9-]*-web-1$/.test(container))
      throw new Error(`no site container to reach ${file}`)
    const result = await run({
      argv: [
        'exec',
        ...(stdin === undefined ? [] : ['-i']),
        '-u',
        'www-data',
        container,
        'node',
        '-e',
        LOOK_FILE_SCRIPT,
        mode,
        file
      ],
      ...(stdin === undefined ? {} : { stdin }),
      timeoutMs: 20_000,
      maxBuffer: 64 * 1024 * 1024
    })
    const line = result.stdout.split('\n').find((l) => l.startsWith('TRACY_LOOK_')) ?? ''
    if (line === '' || line.startsWith('TRACY_LOOK_ERR'))
      throw new Error(
        `${mode} ${file} in ${container}: ${line || result.stderr.trim() || `exit ${result.code}`}`
      )
    return line
  }
  /** @type {(request: Record<string, unknown>) => Promise<Record<string, unknown>>} */
  const wp = async (request) => {
    if (container === null || !/^[a-z0-9][a-z0-9-]*-web-1$/.test(container))
      throw new Error("no site container to reach the site's Additional CSS")
    const result = await run({
      argv: wpCustomCssArgv(container),
      stdin: JSON.stringify(request),
      timeoutMs: 30_000,
      maxBuffer: 16 * 1024 * 1024
    })
    const answer = parseWpCustomCss(result.stdout)
    if (answer !== null) return answer
    const said = `${result.stderr}\n${result.stdout}`
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '')
    throw new Error(
      /executable file not found|wp: not found|no such file or directory/i.test(said ?? '')
        ? `wp-cli is not in ${container}`
        : `wp-cli in ${container}: ${(said ?? `exit ${result.code}`).slice(0, 200)}`
    )
  }
  return {
    customCss: {
      async read() {
        const r = await wp({ mode: 'read' })
        if (r.ok !== true || typeof r.css !== 'string' || typeof r.stylesheet !== 'string')
          throw new Error(String(r.error ?? 'no Additional CSS read').slice(0, 200))
        return { stylesheet: r.stylesheet, css: r.css, block: r.block === true, exists: r.exists !== false }
      },
      async write({ stylesheet, css, expect }) {
        const r = await wp({ mode: 'write', stylesheet, css, expect })
        if (r.conflict === true) return { ok: false, conflict: true }
        if (r.ok !== true || typeof r.css !== 'string')
          throw new Error(String(r.error ?? 'the Additional CSS was not written').slice(0, 200))
        return { ok: true, css: r.css }
      },
      async remove({ stylesheet, expect }) {
        const r = await wp({ mode: 'remove', stylesheet, expect })
        if (r.conflict === true) return { ok: false, conflict: true }
        if (r.ok !== true || typeof r.css !== 'string')
          throw new Error(String(r.error ?? 'the Additional CSS was not removed').slice(0, 200))
        return { ok: true, css: r.css }
      }
    },
    async read(file) {
      if (inContainer(file)) {
        const line = await exec('read', file)
        return line === 'TRACY_LOOK_ABSENT'
          ? null
          : Buffer.from(line.slice('TRACY_LOOK_B64 '.length), 'base64')
      }
      try {
        return await fs.readFile(file)
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
        throw error
      }
    },
    async write(file, bytes) {
      if (inContainer(file)) return void (await exec('write', file, bytes.toString('base64')))
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, bytes)
    },
    async remove(file) {
      if (inContainer(file)) return void (await exec('remove', file))
      await fs.rm(file, { force: true })
    }
  }
}

/**
 * Is `file` one this site's undo may write? Inside the site's served tree (symlinks resolved, so a
 * link cannot lead into another site) or under `/app/` in its own container.
 * @param {string} file
 * @param {string} siteRoot
 * @returns {Promise<boolean>}
 */
async function insideSite(file, siteRoot) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.normalize(file) !== file) return false
  if (file.split('/').includes('..')) return false
  if (file.startsWith('/app/')) return true
  if (!file.startsWith(`${siteRoot}/`) || !served(file, siteRoot)) return false
  const realRoot = await fs.realpath(siteRoot).catch(() => null)
  if (realRoot === null) return false
  // The deepest part of the path that exists, resolved: a symlink there must still land in this site.
  let probe = file
  for (;;) {
    const real = await fs.realpath(probe).catch(() => null)
    if (real !== null) return real === realRoot || real.startsWith(`${realRoot}/`)
    const up = path.dirname(probe)
    if (up === probe) return false
    probe = up
  }
}

/** How a file is shown in an answer: relative to the site folder, or its container path. */
const shown = (/** @type {string} */ file, /** @type {string} */ siteRoot) =>
  file.startsWith(`${siteRoot}/`) ? file.slice(siteRoot.length + 1) : file

/**
 * Copy the files a look write is about to change into a new undo entry of this site, then prune.
 * `customCss` is a WordPress site's Additional CSS as it was read before the write (`look.set`): kept
 * as blob `c0`, with `existed: false` when the site had no `custom_css` post at all (then `c0` is
 * empty and the undo deletes the post rather than emptying it); {@link noteLookAfter} adds what the
 * write left (`c1`), which `look.revert` checks.
 * @param {{ siteRoot: string, files: readonly string[], io: LookIo, tool: string, now?: number,
 *   customCss?: { stylesheet: string, css: string, existed?: boolean } }} input
 * @returns {Promise<{ id: string, files: string[] }>}
 */
export async function takeLookSnapshot({ siteRoot, files, io, tool, now = Date.now(), customCss }) {
  const store = path.join(siteRoot, LOOK_UNDO_DIR)
  await fs.mkdir(store, { recursive: true })
  let id = ''
  for (let tries = 0; tries < 8; tries += 1) {
    id = randomBytes(3).toString('hex')
    try {
      await fs.mkdir(path.join(store, id))
      break
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST' || tries === 7) throw error
    }
  }
  const dir = path.join(store, id)
  /** @type {{ path: string, existed: boolean, blob?: string }[]} */
  const entries = []
  for (const [i, file] of files.entries()) {
    if (!(await insideSite(file, siteRoot))) throw new Error(`${file} is not in this site's served files`)
    const bytes = await io.read(file)
    if (bytes === null) entries.push({ path: file, existed: false })
    else {
      const blob = `f${i}`
      await fs.writeFile(path.join(dir, blob), bytes)
      entries.push({ path: file, existed: true, blob })
    }
  }
  /** @type {Record<string, unknown>} */
  const manifest = { v: 1, id, at: new Date(now).toISOString(), tool, files: entries }
  if (customCss !== undefined) {
    await fs.writeFile(path.join(dir, 'c0'), customCss.css, 'utf8')
    manifest.customCss = {
      stylesheet: customCss.stylesheet,
      before: 'c0',
      ...(customCss.existed === false ? { existed: false } : {})
    }
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  await pruneLookUndo(siteRoot)
  return {
    id,
    files: [
      ...entries.map((entry) => shown(entry.path, siteRoot)),
      ...(customCss === undefined ? [] : [ADDITIONAL_CSS])
    ]
  }
}

/**
 * Record in an undo entry what the Additional CSS holds after the look write (blob `c1`): `look.revert`
 * puts the before back only while the site still holds exactly this.
 * @param {{ siteRoot: string, id: string, css: string }} input
 */
export async function noteLookAfter({ siteRoot, id, css }) {
  if (!UNDO_ID.test(id)) throw new Error(`${id} is not a look undo id`)
  const dir = path.join(siteRoot, LOOK_UNDO_DIR, id)
  const manifest = await readManifest(siteRoot, id)
  if (manifest === null || !manifest.customCss || typeof manifest.customCss !== 'object')
    throw new Error(`look undo ${id} keeps no Additional CSS`)
  await fs.writeFile(path.join(dir, 'c1'), css, 'utf8')
  const next = { ...manifest, customCss: { ...manifest.customCss, after: 'c1' } }
  await fs.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(next, null, 1)}\n`)
}

/**
 * Remove one undo entry of this site: a look write that did not land keeps no undo.
 * @param {{ siteRoot: string, id: string }} input
 */
export async function dropLookSnapshot({ siteRoot, id }) {
  if (!UNDO_ID.test(id)) return
  await fs.rm(path.join(siteRoot, LOOK_UNDO_DIR, id), { recursive: true, force: true })
}

/**
 * This site's undo entries, newest first.
 * @param {string} siteRoot
 * @returns {Promise<{ id: string, at: string, files: string[] }[]>}
 */
async function listEntries(siteRoot) {
  const store = path.join(siteRoot, LOOK_UNDO_DIR)
  const names = await fs.readdir(store).catch(() => /** @type {string[]} */ ([]))
  /** @type {{ id: string, at: string, files: string[] }[]} */
  const out = []
  for (const name of names) {
    if (!UNDO_ID.test(name)) continue
    const manifest = await readManifest(siteRoot, name)
    out.push({
      id: name,
      at: typeof manifest?.at === 'string' ? manifest.at : '',
      files: [
        ...(Array.isArray(manifest?.files)
          ? manifest.files.map((f) => shown(String(f?.path), siteRoot))
          : []),
        ...(manifest?.customCss ? [ADDITIONAL_CSS] : [])
      ]
    })
  }
  return out.sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)))
}

/**
 * Keep the newest {@link LOOK_UNDO_KEEP} entries of a site; remove the rest.
 * @param {string} siteRoot
 */
export async function pruneLookUndo(siteRoot) {
  const entries = await listEntries(siteRoot)
  for (const old of entries.slice(LOOK_UNDO_KEEP))
    await fs.rm(path.join(siteRoot, LOOK_UNDO_DIR, old.id), { recursive: true, force: true })
}

/**
 * @param {string} siteRoot
 * @param {string} id
 * @returns {Promise<{ at?: unknown, files?: { path?: unknown, existed?: unknown, blob?: unknown }[],
 *   customCss?: { stylesheet?: unknown, before?: unknown, after?: unknown, existed?: unknown },
 *   reverted?: { at?: unknown, by?: unknown } } | null>}
 */
async function readManifest(siteRoot, id) {
  try {
    return JSON.parse(await fs.readFile(path.join(siteRoot, LOOK_UNDO_DIR, id, 'manifest.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Mark one undo entry used: what it kept is back on the site, so a second `look.revert` of the same
 * id refuses (`LOOK_UNDO_USED`) instead of writing over whatever came after. `by` says which door
 * put it back: `look.revert`, or `turn-undo` — tracy-host's `look-css` job writes the same field when
 * a chat turn is undone (`apps/tracy-host/src/look-css.js`; its test holds the two in step).
 * @param {{ siteRoot: string, id: string, by: string, now?: number }} input
 */
export async function markLookReverted({ siteRoot, id, by, now = Date.now() }) {
  if (!UNDO_ID.test(id)) throw new Error(`${id} is not a look undo id`)
  const manifest = await readManifest(siteRoot, id)
  if (manifest === null) throw new Error(`this site keeps no look undo ${id}`)
  const next = { ...manifest, reverted: { at: new Date(now).toISOString(), by } }
  await fs.writeFile(
    path.join(siteRoot, LOOK_UNDO_DIR, id, 'manifest.json'),
    `${JSON.stringify(next, null, 1)}\n`
  )
}

/**
 * `tracy_site` `look.revert {undo}`: put back every file of one undo entry, byte for byte, and delete
 * the ones that did not exist before. Works in any turn; reaches only this site's own entries. An
 * entry already put back ({@link markLookReverted}) is refused, whoever put it back.
 * @param {{ siteRoot: string, undo: unknown, io: LookIo }} input
 * @returns {Promise<{ ok: true, undo: string, restored: string[], removed: string[], next?: string }
 *   | { ok: false, code: string, error: string, next: string }>}
 */
export async function revertLook({ siteRoot, undo, io }) {
  const known = async () => {
    const entries = (await listEntries(siteRoot)).slice(0, 5)
    return entries.length === 0
      ? 'This site keeps no look undo: nothing to put back this way. Answer with what you changed instead.'
      : `Name one this site keeps, newest first: ${entries
          .map((entry) => `${entry.id} (${entry.at}: ${entry.files.join(', ')})`)
          .join('; ')}.`
  }
  if (typeof undo !== 'string' || !UNDO_ID.test(undo))
    return {
      ok: false,
      code: 'LOOK_UNDO_BAD_ID',
      error: 'look.revert takes {undo: "<id>"}, the six-character id a look write gave as `undo: <id>`.',
      next: await known()
    }
  const manifest = await readManifest(siteRoot, undo)
  if (manifest === null || !Array.isArray(manifest.files))
    return {
      ok: false,
      code: 'LOOK_UNDO_UNKNOWN',
      error: `This site keeps no look undo ${undo} (another site's, or older than the last ${LOOK_UNDO_KEEP}).`,
      next: await known()
    }
  if (manifest.reverted !== undefined && manifest.reverted !== null)
    return {
      ok: false,
      code: 'LOOK_UNDO_USED',
      error: `Look change ${undo} was already put back${manifest.reverted.by === 'turn-undo' ? ' when its chat request was undone' : ''}, so nothing was put back again.`,
      next: 'Read the look with page.look: it is as it was before that change. Set what the person wants with look.set.'
    }
  const files = manifest.files
  for (const entry of files)
    if (!(await insideSite(/** @type {string} */ (entry?.path), siteRoot)))
      return {
        ok: false,
        code: 'LOOK_UNDO_OUTSIDE_SITE',
        error: `Look undo ${undo} names a file outside this site's served files; nothing was put back.`,
        next: 'Put the look back by hand from what you changed, and tell the person this undo could not be used.'
      }
  /** @type {string[]} */
  const restored = []
  /** @type {string[]} */
  const removed = []
  // A WordPress look.set's Additional CSS goes back FIRST, and only while it still holds what that
  // write left: a refusal here leaves every file as it is too.
  const custom = manifest.customCss
  if (custom !== undefined && custom !== null) {
    const dir = path.join(siteRoot, LOOK_UNDO_DIR, undo)
    const blob = async (/** @type {unknown} */ name) =>
      typeof name === 'string' && /^c[01]$/.test(name) ? fs.readFile(path.join(dir, name), 'utf8') : null
    const before = await blob(custom.before).catch(() => null)
    const after = await blob(custom.after).catch(() => null)
    const stylesheet = typeof custom.stylesheet === 'string' ? custom.stylesheet : ''
    if (before === null || after === null || stylesheet === '' || io.customCss === undefined)
      return {
        ok: false,
        code: 'LOOK_UNDO_UNKNOWN',
        error: `Look undo ${undo} did not keep the site's Additional CSS whole (the write it was taken for did not finish), so nothing was put back.`,
        next: 'Read the look with page.look and set it back with look.set, or tell the person this undo could not be used.'
      }
    // a site that had no Additional CSS post gets none back; an entry from before `existed` was kept
    // cannot tell "none" from "empty", and puts back the empty text, as it always did
    const put =
      custom.existed === false && before === '' && io.customCss.remove !== undefined
        ? await io.customCss.remove({ stylesheet, expect: cssHash(after) })
        : await io.customCss.write({ stylesheet, css: before, expect: cssHash(after) })
    if (put.ok !== true)
      return {
        ok: false,
        code: 'LOOK_UNDO_CHANGED_SINCE',
        error: `The site's Additional CSS changed after look change ${undo} (a person or another change wrote to it since), so nothing was put back: an undo never overwrites a later change.`,
        next: 'Read the look with page.look and set what the person wants back with look.set, or tell them what changed since.'
      }
    restored.push(ADDITIONAL_CSS)
  }
  for (const entry of files) {
    const file = /** @type {string} */ (entry.path)
    if (entry.existed === true && typeof entry.blob === 'string' && /^f\d+$/.test(entry.blob)) {
      await io.write(file, await fs.readFile(path.join(siteRoot, LOOK_UNDO_DIR, undo, entry.blob)))
      restored.push(shown(file, siteRoot))
    } else {
      await io.remove(file)
      removed.push(shown(file, siteRoot))
    }
  }
  await markLookReverted({ siteRoot, id: undo, by: 'look.revert' }).catch(() => {
    // what it kept is back; a second revert then meets the after it no longer finds (Additional CSS)
  })
  const emdash = files.some((entry) => {
    const file = String(entry.path)
    return file.startsWith('/app/') || file.startsWith(`${siteRoot}/template/`)
  })
  return {
    ok: true,
    undo,
    restored,
    removed,
    ...(emdash
      ? {
          next: 'The template source is back; EmDash serves it after one `tracy_site_build_emdash request site.rebuild`.'
        }
      : {})
  }
}

/**
 * The block a look write's tool result carries: its undo id and the call that uses it — the words the
 * comment's reply line gives the person (`prompter.mjs` `COMMENT_LOOK_SCOPE`).
 * @param {{ id: string, files: string[] }} kept
 * @returns {string}
 */
export function lookUndoNote({ id, files }) {
  return `undo: ${id} — Tracy kept a copy of ${files.join(', ')} before this look change; \`tracy_site\` \`look.revert\` {undo: "${id}"} puts ${files.length === 1 ? 'it' : 'them'} back. In your reply, say the change's scope in plain words and that they can ask you to put it back; the id is for you, never in the reply.`
}
