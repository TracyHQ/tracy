/**
 * The `tracy_setting.json` a release does not have yet, composed from the release itself.
 *
 * WHY THIS EXISTS. 79 of the `quickstart/ja-*` releases predate Tracy's file entirely: they are
 * classic Joomla quickstart packages, one zip each, published before `SHA256SUMS` and before
 * anything read a setting. Each one needs the same six fields, five of which are transcription and
 * one of which is a checksum of bytes nobody has hashed. Hand-written 79 times that is wrong about
 * once per release, and the wrongness lands on a fleet host mid-provision.
 *
 * 🔒 IT PROPOSES; IT NEVER DECIDES. Every field comes back with a `source` — `release` (GitHub
 * says so), `package` (read out of the zip), or `default` (nobody chose this) — and a field that
 * cannot be determined comes back `null` with a sentence saying why. The screen marks the guesses
 * and an administrator presses; nothing here writes anything. That is the same rule
 * `scripts/tracy-setting.mjs` keeps ("refuse rather than guess"), on the other side of a press.
 */
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'

import { platformOfTag } from './quickstart-releases.js'
import { SETTING_SCHEMA, validateSetting } from './tracy-setting.mjs'

// ── reading the package ───────────────────────────────────────────────────────────────────────
//
// 🔒 A ZIP IS READ BACKWARDS, FROM ITS CENTRAL DIRECTORY, and that is not a detail worth hiding:
// the entry headers scattered through the file lie about sizes when an entry was written
// streaming (the "data descriptor" case), and the directory at the end is the record the format
// says is authoritative. A reader that walked forwards would come apart on exactly the packages
// this feature exists for — 40–80 MB webroots written by whatever tool JoomlArt used in 2019.
//
// Node has no zip reader and this app has three dependencies; a fourth for two fields read once
// per press is not worth the supply chain. `inflateRawSync` is the only hard part and it is
// already in the standard library.

/** `PK\x05\x06` — the end of central directory record, the only fixed point in the format. */
const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

/** Where the end-of-central-directory record starts, or -1. Scanned from the end: a zip comment */
/** may contain the signature, and the LAST match is the real one. */
function eocdAt(bytes) {
  const floor = Math.max(0, bytes.length - 0xffff - 22)
  for (let at = bytes.length - 22; at >= floor; at -= 1) if (bytes.readUInt32LE(at) === EOCD) return at
  return -1
}

/**
 * Every entry of a zip, as the central directory records them.
 * @param {Buffer} bytes
 * @returns {{ name: string, method: number, compressedSize: number, size: number, at: number }[]}
 */
function entriesIn(bytes) {
  const eocd = eocdAt(bytes)
  if (eocd < 0) return []
  const count = bytes.readUInt16LE(eocd + 10)
  let at = bytes.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== CENTRAL) break
    const nameLength = bytes.readUInt16LE(at + 28)
    const extraLength = bytes.readUInt16LE(at + 30)
    const commentLength = bytes.readUInt16LE(at + 32)
    out.push({
      name: bytes.toString('utf8', at + 46, at + 46 + nameLength),
      method: bytes.readUInt16LE(at + 10),
      compressedSize: bytes.readUInt32LE(at + 20),
      size: bytes.readUInt32LE(at + 24),
      at: bytes.readUInt32LE(at + 42)
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return out
}

/**
 * Every path inside a package. A package this cannot read comes back empty, which every caller
 * reports as "the package could not be read" rather than as "it has no templates".
 * @param {Buffer} bytes
 */
export function namesIn(bytes) {
  return entriesIn(bytes).map((e) => e.name)
}

/**
 * One file out of a package, as text, or null when it is not there or cannot be inflated.
 *
 * Only the two methods a quickstart package actually uses — stored and deflate. Anything else is
 * null rather than a throw: a door answering a press says "the CMS version could not be read",
 * which an administrator can act on, where a stack trace is not.
 * @param {Buffer} bytes
 * @param {string} name
 * @returns {string | null}
 */
export function fileIn(bytes, name) {
  const entry = entriesIn(bytes).find((e) => e.name === name)
  if (!entry) return null
  // The local header repeats the name and extra fields, at their own lengths — the central
  // directory's lengths are NOT the same numbers, and using them is the classic way to read a zip
  // that works on one writer's files and not another's.
  const nameLength = bytes.readUInt16LE(entry.at + 26)
  const extraLength = bytes.readUInt16LE(entry.at + 28)
  const from = entry.at + 30 + nameLength + extraLength
  const raw = bytes.subarray(from, from + entry.compressedSize)
  try {
    if (entry.method === 0) return raw.toString('utf8')
    if (entry.method === 8) return inflateRawSync(raw).toString('utf8')
  } catch {
    return null
  }
  return null
}

/**
 * The Joomla version a package would install, read out of its own `libraries/src/Version.php`.
 *
 * Read rather than taken from the tag, which says which MAJOR the release was cut for and nothing
 * about the point release inside it. All three numbers or nothing: a version composed from two of
 * them would be shown on the review sheet as a fact, unmarked, and be wrong.
 * @param {string | null} php
 * @returns {string | null}
 */
export function cmsVersionOf(php) {
  if (typeof php !== 'string') return null
  const at = (part) => new RegExp(`${part}_VERSION\\s*=\\s*'?([\\w.-]*)'?\\s*;`).exec(php)?.[1]
  const [major, minor, patch] = [at('MAJOR'), at('MINOR'), at('PATCH')]
  if (!major || minor === undefined || patch === undefined) return null
  const extra = at('EXTRA')
  return `${major}.${minor}.${patch}${extra ? `-${extra}` : ''}`
}

/** The words a release title wraps a product name in. Stripped by name, never by position. */
const PACKAGING = /^\s*quickstart\s*:\s*/i
const CMS_SUFFIX = /\s*\/\s*(?:joomla|wordpress|emdash)(?:\s*!?\s*[\d.]+)?\s*$/i

/**
 * The label a person sees, read off the release's own title.
 *
 * A release is titled for the shelf it sits on ("Quickstart: JA Space / Joomla 6"); the label is
 * the product inside it. Both halves are stripped by NAME — a title that genuinely carries a slash
 * ("Blog / Magazine") keeps it, where "everything after the last slash" would have eaten it.
 * @param {string} name
 */
export function labelOf(name) {
  return String(name ?? '')
    .replace(PACKAGING, '')
    .replace(CMS_SUFFIX, '')
    .trim()
}

/**
 * The single classic quickstart package on a release, or nothing when the answer is not single.
 *
 * Measured 16/09 across the `quickstart/ja-*` and `quickstart/purity-iii` releases: one zip each,
 * 40–80 MB, holding a full webroot plus `installation/`. Two zips is not a tie this breaks — which
 * one a customer's site is built from is not a coin toss, and a release with two packages is a
 * release to look at by hand.
 * @param {string[]} assets
 */
export function installerAssetOf(assets) {
  const zips = assets.filter((f) => /\.zip$/i.test(f))
  return zips.length === 1 ? zips[0] : undefined
}

/** Templates every Joomla package carries, so finding them says nothing about this one. */
const JOOMLA_OWN_TEMPLATES = new Set(['cassiopeia', 'cassiopeia_extended', 'system'])

/**
 * The template a quickstart package dresses its site in, read from the package's own `templates/`.
 *
 * Read rather than derived from the tag: the tag is a name a person typed. `administrator/templates`
 * is not matched at all (the admin template is Joomla's business), and the answer is only given
 * when it is unambiguous — two candidates leave the field for a person to fill in.
 * @param {string[]} names every path inside the package
 */
export function templateInZip(names) {
  const found = new Set()
  for (const name of names) {
    const m = /^templates\/([^/]+)\//.exec(name)
    if (m && !JOOMLA_OWN_TEMPLATES.has(m[1])) found.add(m[1])
  }
  return found.size === 1 ? [...found][0] : undefined
}

/** The CMS a release belongs to: the file if it has one, else the tag as a hint. */
const platformOf = (release) => release?.setting?.platform ?? platformOfTag(release?.tag ?? '')

/**
 * Which file of a release a proposal would be built from, or why there is no single answer.
 *
 * 🔒 JOOMLA ONLY, and the sentence says so. The `installer` shape is Joomla's own CLI installer;
 * a WordPress or EmDash release carries none, so proposing one would produce a setting declaring
 * an install the fleet cannot perform — a row that reads Ready and lies.
 * @param {any} release from `readReleases`
 * @returns {{ file: string, why?: undefined } | { file?: undefined, why: string }}
 */
export function packageOf(release) {
  const platform = platformOf(release)
  if (platform !== 'joomla')
    return {
      why: `The installer shape is Joomla's own CLI installer; this release reads as ${platform ?? 'no CMS at all'}, so there is nothing here to compose an install from.`
    }
  const names = (release?.assets ?? []).map((a) => a.name)
  const file = installerAssetOf(names)
  if (!file) {
    const zips = names.filter((f) => /\.zip$/i.test(f))
    return {
      why:
        zips.length === 0
          ? 'This release carries no zip — a classic quickstart is exactly one zip holding a webroot and its installation/ folder.'
          : `This release carries ${zips.length} zips (${zips.join(', ')}); which one a site is built from is not a guess to make here.`
    }
  }
  return { file }
}

/**
 * A downloaded package as the composer needs it: the pin computed from the bytes, the paths, and
 * the one file inside that says which Joomla this is.
 *
 * 🔒 THE CHECKSUM IS COMPUTED, NOT TRANSCRIBED, and that is weaker on purpose-stated grounds: these
 * 79 releases published no `SHA256SUMS`, so the pin is of the bytes served today rather than of
 * what the publisher signed. The review sheet marks it `package` for exactly that reason.
 * @param {string} file
 * @param {Buffer} bytes
 */
export function readPackage(file, bytes) {
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    names: namesIn(bytes),
    php: fileIn(bytes, 'libraries/src/Version.php')
  }
}

/** One field of the proposal: what it would say, where that came from, and why it is empty. */
const field = (value, source, why = null) =>
  value ? { value, source, why: null } : { value: null, source: null, why }

/**
 * The `tracy_setting.json` this release would get, field by field, with nothing decided.
 *
 * `document` is the file a press would write — and it is null unless every field the validator
 * needs is there. Half a document offered for a press is a press that writes a file the product
 * then refuses, on a release a customer can see.
 * @param {{ release: any, pkg: { file: string, sha256: string, names: string[], php: string | null } | null }} input
 */
export function proposalFrom({ release, pkg }) {
  const platform = platformOf(release)
  const names = pkg?.names ?? []
  const classic = names.includes('installation/joomla.php')

  const fields = {
    platform: field(
      platform,
      'release',
      'Neither the tag nor a file says which CMS this release is — the tag would have to end in /j6, /wp7, or carry emdash.'
    ),
    label: field(labelOf(release?.name ?? ''), 'release', 'The release has no name to take a label from.'),
    // A default, and marked as one: nothing in these releases carries a quickstart version, and
    // an unmarked 1.0.0 reads on the sheet exactly like a version somebody looked up.
    version: field('1.0.0', 'default'),
    cms: field(
      cmsVersionOf(pkg?.php ?? null),
      'package',
      'The package carries no readable libraries/src/Version.php, so which Joomla it installs is not known here.'
    ),
    template: field(
      classic ? templateInZip(names) : undefined,
      'package',
      "The package has no single template of its own under templates/ — Joomla's own do not count, and two candidates are not an answer."
    )
  }

  const install = pkg
    ? classic
      ? { value: { installer: { file: pkg.file, sha256: pkg.sha256 } }, source: 'package', why: null }
      : {
          value: null,
          source: null,
          why: `${pkg.file} carries no installation/joomla.php at its root — it is not a classic Joomla quickstart package, and the fleet's installer road cannot build it.`
        }
    : { value: null, source: null, why: 'No package was read.' }

  const complete =
    install.value !== null && ['platform', 'label', 'version', 'cms'].every((k) => fields[k].value)
  const document = complete
    ? {
        schemaVersion: SETTING_SCHEMA,
        platform: fields.platform.value,
        label: fields.label.value,
        version: fields.version.value,
        cms: fields.cms.value,
        ...(fields.template.value ? { template: fields.template.value } : {}),
        install: install.value
      }
    : null

  return {
    tag: release?.tag ?? null,
    fields,
    install,
    document,
    // The validator's own sentences when there IS a document; otherwise the reasons the empty
    // fields already carry — two spellings of "what is wrong" is how one of them goes stale.
    problems: document
      ? validateSetting(document, { assets: (release?.assets ?? []).map((a) => a.name) })
      : [
          ...Object.entries(fields)
            .filter(([, f]) => f.value === null)
            .map(([k, f]) => `${k}: ${f.why}`),
          ...(install.value === null ? [`install: ${install.why}`] : [])
        ]
  }
}
