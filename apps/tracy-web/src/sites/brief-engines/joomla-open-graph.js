/**
 * The template's own Open Graph switched on for a Joomla brief build (spec TracyHQ/tracy#189, criterion 8.4, R12 group G).
 *
 * 🔒 A SHARED LINK SHOWS THE PAGE'S OWN TITLE, WORDS AND PICTURE, AND THE TEMPLATE ALREADY KNOWS HOW. A T4 template prints
 * og:title, og:description and og:image for every page (from the menu entry's `og_title` / `og_desc`, which the SEO stage
 * writes from the plan, or the article's own title and picture) only when its `system_opengraph` setting is on, and most
 * releases ship it off. T4 keeps its `system_*` settings in a file, `etc/global.json`, with the site's own changes in
 * `local/etc/global.json` (what its admin saves); so the switch is written there, through the template file door
 * (`template.files.write`, compare-and-set on the file the site holds, undone with the build).
 *
 * A template with no such file (T3, Gavick, a plain Joomla template) has no Open Graph of its own: nothing is written, and
 * the Tracy plugin's share picture stays the only og tag there (the final check names those pages).
 */
import { createHash } from 'node:crypto'

/** git's blob id of some bytes: what the template file door compares against. */
const blobOf = (/** @type {Buffer} */ bytes) =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex')

/** A file the site holds, or null when it has none or will not say. */
async function readFile(apply, siteKey, path) {
  const got = await apply({ siteKey, action: 'file.read', params: { path } }).catch(() => null)
  if (!got || got.ok === false || typeof got.content_b64 !== 'string') return null
  return Buffer.from(got.content_b64, 'base64')
}

/**
 * The settings file with the switch on: the site's own file when it has one, else the template's copied with the switch.
 * @param {{ local: Buffer | null, base: Buffer | null }} files
 * @returns {{ path: 'local' | 'base' | null, bytes: Buffer | null, already: boolean }}
 */
export function openGraphFile({ local, base }) {
  const held = local ?? base
  if (!held) return { path: null, bytes: null, already: false }
  let settings
  try {
    settings = JSON.parse(held.toString('utf8'))
  } catch {
    return { path: null, bytes: null, already: false }
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return { path: null, bytes: null, already: false }
  if (String(settings.system_opengraph ?? '') === '1') return { path: 'local', bytes: null, already: true }
  return {
    path: 'local',
    bytes: Buffer.from(JSON.stringify({ ...settings, system_opengraph: '1' })),
    already: false
  }
}

/**
 * Switch the template's own Open Graph on. Never throws.
 * @param {{ apply: Function, siteKey: string, template: string | null, applyId: string, note: (line: string) => void }} input
 * @returns {Promise<'on' | 'already' | 'none' | 'refused'>}
 */
export async function enableTemplateOpenGraph({ apply, siteKey, template, applyId, note }) {
  if (!template) return 'none'
  const root = `templates/${template}`
  const localPath = `${root}/local/etc/global.json`
  const local = await readFile(apply, siteKey, localPath)
  const base = local ? null : await readFile(apply, siteKey, `${root}/etc/global.json`)
  const plan = openGraphFile({ local, base })
  if (plan.already) return 'already'
  if (!plan.bytes) return 'none'
  const answer = await apply({
    siteKey,
    action: 'template.files.write',
    params: {
      apply_id: applyId,
      files: [
        {
          path: localPath,
          expected_blob: local ? blobOf(local) : null,
          content_b64: plan.bytes.toString('base64'),
          sha256: createHash('sha256').update(plan.bytes).digest('hex')
        }
      ]
    }
  }).catch((/** @type {unknown} */ error) => ({ ok: false, message: String(error) }))
  if (answer?.ok === false) {
    note(
      `the template's Open Graph could not be switched on, so shared links show only the share picture: ${answer.message ?? answer.error}`
    )
    return 'refused'
  }
  return 'on'
}
