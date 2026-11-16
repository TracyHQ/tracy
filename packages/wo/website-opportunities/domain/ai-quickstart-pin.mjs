/**
 * The pin of an AI quickstart (ticket #588): which version of a template's kit Tracy builds from, and the checksums
 * that version must have. One pin per template, `ai-quickstart/<slug>/<cms>`, in `pins.json` beside the kits
 * (`packages/cms/<package>/ai-quickstarts/pins.json`, copied into the image with them), as a human quickstart is pinned
 * by one version and its installer's sha256 in `quickstarts.json`. The publish step writes a pin only after it
 * published the kit (`scripts/ai-quickstart/publish/`); nothing else writes one.
 *
 * `resolvePinnedAiQuickstart` is how a build reads a kit: exactly the pinned version, and only when its files are the
 * ones the pin names. A kit whose files changed since it was published, whose check record is not the published one,
 * whose template kit moved, or that names no site is refused, each with its own code. Reads files only.
 *
 * The kit files sha256 is the check record's (`kitFilesSha256` of `scripts/ai-quickstart/gate/record.mjs`): one
 * sha256 over `<path> <sha256>` lines of every kit file sorted by path, `check-record/` left out.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const PINS_FILE = 'pins.json'
export const PINS_SCHEMA = 'tracy-ai-quickstart-pins/v1'
const CHECK_RECORD_DIR = 'check-record'
const RECORD_FILE = CHECK_RECORD_DIR + '/record.json'
const HEX = /^[0-9a-f]{64}$/
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The key of a template's pin. */
export const pinKeyOf = (slug, cms) => 'ai-quickstart/' + slug + '/' + cms

/** The sha256 over every kit file but the check record, as the check record binds it; null for a missing folder. */
export function kitFilesSha256Of(folder) {
  if (!existsSync(folder)) return null
  const lines = []
  for (const rel of readdirSync(folder, { recursive: true }).map(String).sort()) {
    const name = rel.split(path.sep).join('/')
    if (name === CHECK_RECORD_DIR || name.startsWith(CHECK_RECORD_DIR + '/')) continue
    const file = path.join(folder, rel)
    if (statSync(file).isFile()) lines.push(name + ' ' + sha256(readFileSync(file)) + '\n')
  }
  return sha256(lines.sort().join(''))
}

/** Why a pin entry is not one: `[{code, message}]`, empty when it is. */
export function pinShapeProblems(pin) {
  const bad = (message) => [{ code: 'pin_unreadable', message }]
  if (!pin || typeof pin !== 'object') return bad('the pin is not an object')
  if (typeof pin.version !== 'string' || !SEGMENT.test(pin.version)) return bad('the pin names no version')
  for (const key of ['kitFilesSha256', 'recordSha256'])
    if (!HEX.test(String(pin[key] ?? ''))) return bad('the pin has no ' + key)
  if (pin.templateKitSha256 != null && !HEX.test(String(pin.templateKitSha256)))
    return bad('the pin templateKitSha256 is not a sha256')
  for (const key of ['blankSite', 'manifest']) {
    const a = pin[key]
    if (!a || typeof a.file !== 'string' || !HEX.test(String(a.sha256 ?? '')) || !Number.isInteger(a.bytes))
      return bad('the pin ' + key + ' must be {file, bytes, sha256}')
  }
  if (!pin.release || typeof pin.release.repo !== 'string' || typeof pin.release.tag !== 'string')
    return bad('the pin must name its release {repo, tag}')
  return []
}

/** The pins file of a folder of kits: `{pins, problems}`; no file is no pin. */
export function readPins(root) {
  const file = path.join(root, PINS_FILE)
  if (!existsSync(file)) return { pins: {}, problems: [] }
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return {
      pins: {},
      problems: [{ code: 'pin_unreadable', message: PINS_FILE + ' is not JSON: ' + error.message }]
    }
  }
  if (doc?.schema !== PINS_SCHEMA || !doc.pins || typeof doc.pins !== 'object')
    return {
      pins: {},
      problems: [
        {
          code: 'pin_unreadable',
          message: PINS_FILE + ' must be {"schema": "' + PINS_SCHEMA + '", "pins": {}}'
        }
      ]
    }
  return { pins: doc.pins, problems: [] }
}

/** The template kit of a kit folder, `<root>/../contracts/<slug>/<cms>/<version>/template-kit.json`. */
const templateKitFile = (root, slug, cms, version) =>
  path.join(root, '..', 'contracts', slug, cms, version, 'template-kit.json')

/**
 * The pinned kit of a template, read exactly as pinned.
 * @param {{root: string, slug: string, cms: string, pins?: Record<string, object>}} input `root`: the folder of kits
 *   (`<slug>/<cms>/<version>/` under it); `pins`: the pins to use instead of `<root>/pins.json`
 * @returns {{ok: true, folder: string, version: string, pin: object} | {ok: false, problems: Array<{code: string,
 *   message: string}>}}
 */
export function resolvePinnedAiQuickstart({ root, slug, cms, pins }) {
  const refused = (code, message) => ({ ok: false, problems: [{ code, message }] })
  if (!SEGMENT.test(String(slug)) || !SEGMENT.test(String(cms)))
    return refused('not_pinned', 'no such template')
  const read = pins ? { pins, problems: [] } : readPins(root)
  if (read.problems.length) return { ok: false, problems: read.problems }
  const key = pinKeyOf(slug, cms)
  const pin = read.pins[key]
  if (!pin) return refused('not_pinned', 'Tracy pins no AI quickstart for ' + key)
  const shape = pinShapeProblems(pin)
  if (shape.length) return { ok: false, problems: shape }
  const folder = path.join(root, slug, cms, pin.version)
  if (!existsSync(folder))
    return refused('kit_missing', 'the pinned kit ' + key + ' ' + pin.version + ' is not here')
  const problems = []
  if (kitFilesSha256Of(folder) !== pin.kitFilesSha256)
    problems.push({
      code: 'kit_files_differ',
      message: 'the kit files are not the ones published for the pin'
    })
  const record = path.join(folder, RECORD_FILE)
  if (!existsSync(record) || sha256(readFileSync(record)) !== pin.recordSha256)
    problems.push({
      code: 'record_differs',
      message: RECORD_FILE + ' is not the check record published for the pin'
    })
  const tk = templateKitFile(root, slug, cms, pin.version)
  const tkSha = existsSync(tk) ? sha256(readFileSync(tk)) : null
  if ((pin.templateKitSha256 ?? null) !== tkSha)
    problems.push({
      code: 'template_kit_differs',
      message: 'the template kit is not the one published for the pin'
    })
  let manifest = null
  try {
    manifest = JSON.parse(readFileSync(path.join(folder, 'kit-manifest.json'), 'utf8'))
  } catch {}
  if (!manifest?.site) problems.push({ code: 'no_site', message: 'the pinned kit manifest names no site' })
  return problems.length ? { ok: false, problems } : { ok: true, folder, version: pin.version, pin }
}
