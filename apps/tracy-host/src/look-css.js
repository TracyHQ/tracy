/**
 * `site-look-css` — undoing a chat turn that changed a WordPress site's look (turn undo,
 * `apps/tracy-web/src/sites/turn-undo.js`).
 *
 * On WordPress `tracy_site` `look.set` writes the site's Additional CSS (the `custom_css` post of the
 * theme it runs) through wp-cli in the site's own container, not a theme file, so the webroot's Git
 * moments never hold it. The plugin keeps its own undo entry instead,
 * `<site>/.tracy/undo/look/<id>/manifest.json` with the Additional CSS before (`c0`) and after (`c1`)
 * the write (`packages/tools/tracy-site-tools/src/host/look-undo.mjs`), and reports the write to
 * tracy-web with via `look-css` and that id. This job is the host half of undoing it:
 *   - `check` (read-only, for `GET /turns`): per id, the SHA-256 of `c0`, of `c1`, of the Additional
 *     CSS the site holds now (of the entry's own theme), and whether the entry was already put back.
 *     Hashes only — no CSS text leaves this host.
 *   - `undo` (for `POST /turns/undo`): write `c0` back only while the site still holds `c1` (the
 *     same compare-and-set PHP the plugin's `look.revert` runs) — or, for an entry whose site had no
 *     Additional CSS post before the write (`existed: false`), delete the post that write created —
 *     then mark the entry used, as `look.revert` does, so a later `look.revert` of the same id refuses.
 *
 * 🔒 THE PHP IS A COPY, HELD IN STEP BY A TEST. The plugin's `WP_CUSTOM_CSS_PHP` lives in the dsh
 * image (`packages/tools/tracy-site-tools`); this image copies only `apps/tracy-host/src`
 * (`Dockerfile`), and `look-undo.mjs` imports the comment fence and more, so it cannot be imported
 * from here. `test/look-css.test.mjs` imports both and fails when they differ — and checks that an
 * entry this job marked is refused by the plugin's own `revertLook`.
 *
 * 🔒 ONE SITE ONLY. The label is checked by `SAFE_LABEL` before this runs; an id is six hex digits
 * (no path); the store is `<sitesRoot>/<label>/.tracy/undo/look/`, the same folder dsh sees as
 * `/site/<label>` (`deploy/compose.yml` mounts `TRACY_SITES_ROOT` at the same path here); the PHP
 * runs as `www-data` in `<label>-web-1`, never another site's container.
 */
import { createHash, randomBytes } from 'node:crypto'
import { chown, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The `kind` of `POST /_host/site` this module answers. */
export const LOOK_CSS_KIND = 'site-look-css'
/** Where a site's look undo entries live, relative to its site folder (`look-undo.mjs` `LOOK_UNDO_DIR`). */
export const LOOK_UNDO_DIR = '.tracy/undo/look'
/** An undo id: six hex digits (`look-undo.mjs` `UNDO_ID`). */
export const UNDO_ID = /^[0-9a-f]{6}$/
/** Ids one `check` may name: a conversation's look writes, newest first. */
export const LOOK_CHECK_MAX = 50

/** The web container's mount of the webroot (`render-compose.sh`: `<webroot>:/var/www/html`). */
const CONTAINER_WEBROOT = '/var/www/html'

/**
 * A copy of `look-undo.mjs` `WP_CUSTOM_CSS_PHP` — see the module comment, and that constant's own for
 * what each part does. `test/look-css.test.mjs` fails when the two differ.
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
 * The docker argv that runs {@link WP_CUSTOM_CSS_PHP} in a site's own web container, as the web
 * server's user (`look-undo.mjs` `wpCustomCssArgv`, the same list).
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

/** The SHA-256 of a CSS text's UTF-8 bytes, as PHP's `hash("sha256", …)` (`look-undo.mjs` `cssHash`). */
export const cssHash = (/** @type {string} */ css) => createHash('sha256').update(css, 'utf8').digest('hex')

/**
 * `null` when `body` is a valid `site-look-css` instruction, else the refusal reason — the same
 * contract as `validateWebrootBody`.
 * @param {Record<string, unknown>} body
 */
export function validateLookCssBody(body) {
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'mode', 'ids', 'id'].includes(key)) return `refused ${key}`
  }
  if (body.mode === 'check') {
    const ids = body.ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > LOOK_CHECK_MAX) return 'refused ids'
    if (!ids.every((id) => typeof id === 'string' && UNDO_ID.test(id))) return 'refused ids'
    if (body.id !== undefined) return 'refused id'
    return null
  }
  if (body.mode === 'undo') {
    if (typeof body.id !== 'string' || !UNDO_ID.test(body.id)) return 'refused id'
    if (body.ids !== undefined) return 'refused ids'
    return null
  }
  return 'refused mode'
}

/**
 * The one answer line of {@link WP_CUSTOM_CSS_PHP} in a run's merged output, or null.
 * @param {string[]} tail
 * @returns {Record<string, unknown> | null}
 */
export function parseWpCustomCss(tail) {
  const line = [...tail].reverse().find((l) => l.startsWith('TRACY_WP_CSS '))
  if (line === undefined) return null
  try {
    const out = JSON.parse(Buffer.from(line.slice('TRACY_WP_CSS '.length).trim(), 'base64').toString('utf8'))
    return out && typeof out === 'object' && !Array.isArray(out) ? out : null
  } catch {
    return null
  }
}

/**
 * One look undo entry of a site, with its Additional CSS blobs, or why it cannot be used.
 * @param {string} siteRoot
 * @param {string} id
 * @returns {Promise<{ ok: true, manifest: Record<string, any>, stylesheet: string, before: string,
 *   after: string } | { ok: false, code: 'LOOK_UNDO_UNKNOWN' }>}
 */
async function readEntry(siteRoot, id) {
  const dir = path.join(siteRoot, LOOK_UNDO_DIR, id)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  } catch {
    return { ok: false, code: 'LOOK_UNDO_UNKNOWN' }
  }
  const custom = manifest?.customCss
  const blob = async (/** @type {unknown} */ name) =>
    typeof name === 'string' && /^c[01]$/.test(name)
      ? readFile(path.join(dir, name), 'utf8').catch(() => null)
      : null
  const before = await blob(custom?.before)
  const after = await blob(custom?.after)
  const stylesheet = typeof custom?.stylesheet === 'string' ? custom.stylesheet : ''
  // An entry of a file look (no Additional CSS), or one whose write did not finish (no `c1`).
  if (before === null || after === null || stylesheet === '') return { ok: false, code: 'LOOK_UNDO_UNKNOWN' }
  return { ok: true, manifest, stylesheet, before, after }
}

/**
 * Write the manifest back with `reverted` set (`look-undo.mjs` `markLookReverted`, the same field),
 * atomically, keeping the file's owner: the plugin writes these as the site folder's user, and a
 * manifest this root process left behind as root would keep its next `look.revert` from marking it.
 * @param {string} siteRoot
 * @param {string} id
 * @param {Record<string, any>} manifest
 * @param {number} now
 */
async function markReverted(siteRoot, id, manifest, now) {
  const file = path.join(siteRoot, LOOK_UNDO_DIR, id, 'manifest.json')
  const owner = await stat(file).catch(() => null)
  const tmp = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
  const next = { ...manifest, reverted: { at: new Date(now).toISOString(), by: 'turn-undo' } }
  await writeFile(tmp, `${JSON.stringify(next, null, 1)}\n`)
  if (owner !== null) await chown(tmp, owner.uid, owner.gid).catch(() => {})
  await rename(tmp, file)
}

/**
 * Run {@link WP_CUSTOM_CSS_PHP} once in the site's container.
 * @param {{ run: Function, label: string, request: Record<string, unknown> }} input
 * @returns {Promise<Record<string, unknown>>}
 */
async function wp({ run, label, request }) {
  const { code, tail } = await run({
    script: 'docker',
    args: wpCustomCssArgv(`${label}-web-1`),
    env: process.env,
    stdin: JSON.stringify(request),
    timeoutMs: 30_000
  })
  const answer = parseWpCustomCss(tail ?? [])
  if (answer !== null) return answer
  const said = (tail ?? []).map((l) => l.trim()).find((l) => l !== '')
  throw new Error(`wp-cli in ${label}-web-1: ${(said ?? `exit ${code}`).slice(0, 200)}`)
}

/**
 * The answer of one `site-look-css` instruction, already validated.
 *
 * `check` → `{ok: true, entries: {<id>: {before, after, now, reverted} | {unknown: true}}}`, hashes only.
 * `undo`  → `{ok: true, id, marked}` once `c0` is back; `{ok: false, code}` for a clean refusal that
 * wrote nothing: `LOOK_UNDO_UNKNOWN` (no such entry, or no Additional CSS kept whole), `LOOK_UNDO_USED`
 * (already put back), `LOOK_UNDO_CHANGED_SINCE` (the site no longer holds `c1`). Throws when wp-cli
 * gave no readable answer — the write may or may not have landed, and the job says it failed.
 * @param {{ body: { label: string, mode: 'check' | 'undo', ids?: string[], id?: string },
 *   config: { sitesRoot: string }, run: Function, now?: number }} input
 */
export async function lookCss({ body, config, run, now = Date.now() }) {
  const label = String(body.label)
  const siteRoot = path.join(config.sitesRoot, label)
  if (body.mode === 'check') {
    /** @type {Record<string, unknown>} */
    const entries = {}
    /** @type {Map<string, string>} stylesheet → hash of what the site holds now */
    const current = new Map()
    for (const id of /** @type {string[]} */ (body.ids)) {
      const entry = await readEntry(siteRoot, id)
      if (!entry.ok) {
        entries[id] = { unknown: true }
        continue
      }
      if (!current.has(entry.stylesheet)) {
        const read = await wp({ run, label, request: { mode: 'read', stylesheet: entry.stylesheet } })
        if (read.ok !== true || typeof read.css !== 'string')
          throw new Error(String(read.error ?? 'no Additional CSS read').slice(0, 200))
        current.set(entry.stylesheet, cssHash(read.css))
      }
      entries[id] = {
        before: cssHash(entry.before),
        after: cssHash(entry.after),
        now: current.get(entry.stylesheet),
        reverted: entry.manifest.reverted !== undefined && entry.manifest.reverted !== null
      }
    }
    return { ok: true, entries }
  }
  const id = /** @type {string} */ (body.id)
  const entry = await readEntry(siteRoot, id)
  if (!entry.ok) return { ok: false, code: entry.code }
  if (entry.manifest.reverted !== undefined && entry.manifest.reverted !== null)
    return { ok: false, code: 'LOOK_UNDO_USED' }
  // A site that had no Additional CSS post before the look write gets none back (`existed: false`,
  // `look-undo.mjs` `takeLookSnapshot`): the post that write created is deleted, not emptied.
  const remove = entry.manifest.customCss?.existed === false && entry.before === ''
  const put = await wp({
    run,
    label,
    request: remove
      ? { mode: 'remove', stylesheet: entry.stylesheet, expect: cssHash(entry.after) }
      : { mode: 'write', stylesheet: entry.stylesheet, css: entry.before, expect: cssHash(entry.after) }
  })
  if (put.conflict === true) return { ok: false, code: 'LOOK_UNDO_CHANGED_SINCE' }
  if (put.ok !== true)
    throw new Error(String(put.error ?? 'the Additional CSS was not written').slice(0, 200))
  // The CSS is back; a mark that did not land only means a later look.revert meets a `c1` the site
  // no longer holds, and refuses for that reason instead.
  const marked = await markReverted(siteRoot, id, entry.manifest, now).then(
    () => true,
    () => false
  )
  return { ok: true, id, marked }
}

/**
 * Run one instruction as a job: `output` is the answer as one JSON line.
 * @param {{ jobId: string, body: any, config: { sitesRoot: string }, jobs: any, run: Function }} input
 */
export async function runLookCssJob({ jobId, body, config, jobs, run }) {
  await jobs.put(jobId, { state: 'running', step: LOOK_CSS_KIND, label: body.label })
  try {
    const answer = await lookCss({ body, config, run })
    await jobs.put(jobId, { state: 'done', step: LOOK_CSS_KIND, exitCode: 0, output: JSON.stringify(answer) })
  } catch (error) {
    await jobs.put(jobId, {
      state: 'failed',
      step: LOOK_CSS_KIND,
      detail: String(error?.message ?? error).slice(0, 200)
    })
  }
}
