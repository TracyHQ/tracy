#!/usr/bin/env node
/**
 * Write and check the `tracy_setting.json` of a GitHub release.
 *
 *   node scripts/tracy-setting.mjs write <tag> [--platform p] [--label L] [--version v] [--cms c]
 *                                             [--template t] [--questions <file>] [--card <file>]
 *                                             [--out <dir>]
 *   node scripts/tracy-setting.mjs check <tag>
 *   node scripts/tracy-setting.mjs pins                  every hand-written pin vs the real releases
 *
 * `--card` writes `tracy_design_inspiration.json` BESIDE the setting, and puts nothing inside it:
 * the card left `tracy_setting.json` on 16/09 (`designInspirationFrom` says why).
 *
 * WHY A SCRIPT AND NOT A HAND-WRITTEN FILE. A setting is mostly transcription — the file names and
 * checksums the release already published, in `SHA256SUMS`. Transcribed by hand it is wrong about
 * once per release, and the wrongness lands on a fleet host mid-provision. Here the release is the
 * source: `write` reads its asset list and sums and composes the file; `check` downloads what is
 * attached and runs the same validator the product runs. Only the words a human owns — the label,
 * the template, the CMS version — come from flags, and `write` refuses rather than guessing them.
 *
 * ONE RELEASE SHAPE CANNOT BE TRANSCRIBED, and it is the commonest one: the 79 older
 * `quickstart/ja-*` releases publish no `SHA256SUMS` and no runtime manifest, because they predate
 * both. For those — a Joomla release carrying exactly one zip — `write` downloads the package,
 * computes the checksum from the bytes, and reads the template out of the package's own
 * `templates/`. Both are printed, because both are weaker than transcription: the checksum pins
 * what is served today rather than what the publisher signed.
 *
 * 🔒 IT NEVER UPLOADS. The last step is a `gh release upload` line printed for a person to run:
 * attaching a file to a public-facing release is a decision, and this script is not in a position
 * to make it (`CLAUDE.md`: outward-facing actions are confirmed, not assumed).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { installerAssetOf, templateInZip } from '../apps/tracy-web/src/lib/setting-proposal.js'
import { parseQuestions } from '../packages/site/tracy-site-build-core/src/questions.mjs'
import {
  DESIGN_INSPIRATION_SCHEMA,
  installShapesFor,
  PLATFORMS,
  SETTING_SCHEMA,
  validateDesignInspiration,
  validateSetting
} from '../packages/site/tracy-site-build-core/src/tracy-setting.mjs'

const REPO = 'JoomlArt-Products/joomlart-products'
/** The Design inspiration card of a release — its own asset since 16/09, next to the setting. */
const CARD_FILE = 'tracy_design_inspiration.json'

/** `SHA256SUMS` as the release wrote it → `{ file: sha }`. GNU coreutils marks binary with `*`. */
export function sumsOf(text) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^([a-f0-9]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (m) out[m[2]] = m[1]
  }
  return out
}

/**
 * A `runtime-manifest-<v>.json` read as `{ file: sha }`.
 *
 * WHY A SECOND SOURCE OF CHECKSUMS. `SHA256SUMS` is written when a release is first published and
 * is NOT rewritten when files are attached later: measured 15/09 on `tracy-apple/j6`, where the
 * 1.1.0 webroot and database are attached but the sums file still lists only the 1.0.0 zip. The
 * runtime manifest that came with those files carries them, so it is read too — a checksum is
 * always transcribed from something the release published, never computed here from a download.
 */
export function sumsOfManifest(doc) {
  /** @type {Record<string, string>} */
  const out = {}
  const parts = doc?.parts ?? doc?.runtime?.parts ?? {}
  for (const p of Object.values(parts))
    if (p && typeof p.file === 'string' && typeof p.sha256 === 'string') out[p.file] = p.sha256
  return out
}

/**
 * Which asset is which part, for this CMS.
 *
 * The names are the ones Tracy's own release tools write, and the test that pins them is the only
 * place they are agreed: a `webroot` tarball and a `database` dump for a PHP CMS; for EmDash the
 * packed template (`-quickstart-<v>.zip`) and the SQLite snapshot (`-state-<v>.tar.gz`). A Joomla
 * release also carries a 79 MB Akeeba bundle — a file for a person, never for a build, so it is
 * deliberately not one of the parts.
 */
/**
 * The newest of several files that are all the same part, by the version in the name.
 *
 * A release keeps the archive it replaced beside the one replacing it, and GitHub lists assets by
 * name — so the FIRST match is the OLDEST. Measured on tracy-apple/j6 the day the 1.2.0 cascade was
 * attached next to 1.1.0: taking the first match wrote a setting that named the archive the
 * registry had already moved off, and nothing said so, because both files are real and both hash.
 * Compared field by field as numbers; `1.10.0` is newer than `1.9.0`, which sorting strings is not.
 */
function newest(files) {
  const order = (f) => (/-(\d+\.\d+\.\d+)\./.exec(f)?.[1] ?? '0').split('.').map(Number)
  return files
    .slice()
    .sort((a, b) => {
      const [x, y] = [order(a), order(b)]
      for (let i = 0; i < Math.max(x.length, y.length); i++)
        if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0)
      return 0
    })
    .at(0)
}

export function partsFrom(platform, assets, sums) {
  const pick = {
    webroot: (f) => /-webroot-[\d.]+\.tar\.gz$/.test(f),
    database: (f) => /-database-[\d.]+\.sql\.gz$/.test(f),
    source: (f) => /-quickstart-[\d.]+\.zip$/.test(f),
    state: (f) => /-state-[\d.]+\.tar\.gz$/.test(f),
    // An Akeeba bundle is named like a source zip; only the CMS tells them apart, which is why the
    // caller passes the platform rather than this guessing from the file name alone.
    bundle: (f) => /-quickstart-[\d.]+\.zip$/.test(f),
    // Never matched on this road, on purpose. This function TRANSCRIBES checksums the release
    // published, and an `installer` release publishes none — its pin is computed from the bytes in
    // `write`. Declared rather than left out so the loop below stays total over the shapes.
    installer: () => false
  }
  /** @type {Record<string, { file: string, sha256: string }>} */
  const out = {}
  // The first shape the release can actually satisfy, in the order the contract lists them: a
  // captured site before a bundle, because a build restores the pair when both are attached.
  for (const shape of installShapesFor(platform)) {
    /** @type {Record<string, { file: string, sha256: string }>} */
    const found = {}
    for (const part of shape) {
      const file = newest(assets.filter(pick[part]))
      if (file && sums[file]) found[part] = { file, sha256: sums[file] }
    }
    if (Object.keys(found).length === shape.length) return found
    if (Object.keys(out).length === 0) Object.assign(out, found)
  }
  return out
}

// ── the `installer` shape: a release with no checksums of its own ──────────────────────────────
//
// The 79 older `quickstart/ja-*` releases publish neither `SHA256SUMS` nor a runtime manifest —
// they predate both. So for this one shape the checksum cannot be transcribed and has to be
// COMPUTED from the bytes the release serves, which is why `write` downloads the package. That is
// a weaker guarantee than transcription (it pins what is there today rather than what the
// publisher signed), and it is stated in the output rather than hidden.

/**
 * Which single zip a release's `installer` shape is built from, and which template it dresses a
 * site in, both re-exported from the module the OPERATIONS PAGE uses (`setting-proposal.js`).
 *
 * 🔒 ONE SPELLING OF THESE TWO RULES, on purpose. From 16/09 the same composition happens on two
 * sides of the same press: here, printing a file for a person to upload, and on `/ops/quickstarts`,
 * where an administrator reviews it and this server writes it. Two copies of "which zip" and "which
 * template" is how the sheet an administrator approves stops matching the file this script writes —
 * and nothing would say so, because both would be internally consistent.
 */
export { installerAssetOf, templateInZip } from '../apps/tracy-web/src/lib/setting-proposal.js'

/** The version the part files carry, so a setting cannot claim a version the files are not. */
function versionOf(parts) {
  for (const { file } of Object.values(parts)) {
    const m = /-(\d+\.\d+\.\d+)\./.exec(file)
    if (m) return m[1]
  }
  return undefined
}

/**
 * Compose the file, then hold it to the same validator the product uses — a half-composed setting
 * throws here rather than being written out.
 */
export function settingFrom({
  tag,
  platform,
  label,
  version,
  cms,
  template,
  languages,
  assets,
  sums,
  install
}) {
  // `install` is passed only by the `installer` shape, whose checksum is computed rather than
  // transcribed (there is no sums file to read). Everything after this line is the same, the
  // asset-list check included: a computed checksum is not a licence to skip that.
  const parts = install ?? partsFrom(platform, assets, sums)
  const doc = {
    schemaVersion: SETTING_SCHEMA,
    platform,
    label,
    version: version ?? versionOf(parts),
    cms,
    install: parts
  }
  if (template) doc.template = template
  if (languages) doc.languages = languages
  const problems = validateSetting(doc, { assets })
  if (problems.length > 0)
    throw new Error(`cannot compose tracy_setting.json for ${tag}:\n  - ${problems.join('\n  - ')}`)
  return doc
}

/**
 * The Design inspiration card as its own file, held to the validator the product runs.
 *
 * 🔒 THE CARD LEFT `tracy_setting.json` ON 16/09, and this is the half of that move a release
 * cutter touches. The setting is install truth nobody edits after a release is cut; the card is
 * presentation an administrator edits from the operations page. Writing the card INTO the setting
 * meant rewording a blurb changed the file a provision reads — and a `--card` flag that still did
 * that would quietly undo the split on the next release cut.
 *
 * Copied in whole, like the questionnaire: what a card SAYS is the template author's business. The
 * one field composed here is `template`, and only when the file leaves it out — the setting already
 * declares it, and two places to type one id is one place to type it wrong. A card that names a
 * DIFFERENT template is refused rather than rewritten: one of the two is a mistake and this script
 * cannot tell which.
 */
export function designInspirationFrom({ tag, template, doc }) {
  const card = { schemaVersion: DESIGN_INSPIRATION_SCHEMA, ...doc }
  if (template && card.template === undefined) card.template = template
  if (template && card.template !== template)
    throw new Error(
      `${CARD_FILE} for ${tag} names template ${JSON.stringify(card.template)}, but the setting declares ${JSON.stringify(template)}`
    )
  const problems = validateDesignInspiration(card)
  if (problems.length > 0)
    throw new Error(`cannot compose ${CARD_FILE} for ${tag}:\n  - ${problems.join('\n  - ')}`)
  return card
}

// ── hand-written pins, and whether the releases still carry what they name ─────────────────────
//
// `tracy_setting.json` is checked against its own release's asset list before anything can use it
// (`validateSetting`), but two files in this repository still name release files BY HAND: the
// Joomla capability catalogue, which tells an agent what a site would install, and
// `provision/quickstarts.json`, which the fleet scripts still read. Nothing held either to a real
// release until 15/09 — when `quickstarts.json` was found pinning `tracy-apple-j6-webroot-1.2.0`,
// a file no release has, on the DEFAULT Joomla base, since 13/09 and with every gate green.

/** Every hand-written pin in a set of files, as `{ tag, file, where }`. */
export function pinsIn(files) {
  const pins = []
  const walk = (node, where) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.url === 'string' && node.url.includes('/releases/download/')) {
      // `https://github.com/<owner>/<repo>/releases/download/<tag…>/<file>` — the repo matters:
      // the Claude Cowork plugin is pinned from TracyHQ/claude-cowork, not from the quickstarts repo,
      // and asking the wrong repository answers "release not found" for a release that is fine.
      const [head, tail] = node.url.split('/releases/download/')
      const owner = head.split('/').slice(-2).join('/')
      const parts = tail.split('/')
      pins.push({
        repo: owner,
        tag: decodeURIComponent(parts.slice(0, -1).join('/')),
        file: decodeURIComponent(parts.at(-1)),
        where
      })
    }
    for (const value of Object.values(node)) walk(value, where)
  }
  for (const [where, text] of Object.entries(files)) {
    try {
      walk(JSON.parse(text), where)
    } catch {
      pins.push({ tag: null, file: null, where, unreadable: true })
    }
  }
  return pins
}

/**
 * Which pins name a file their release does not carry.
 * @param {{tag: string, file: string, where: string}[]} pins
 * @param {Record<string, string[]>} assets asset names per tag
 */
export function pinProblems(pins, assets) {
  const problems = []
  for (const pin of pins) {
    if (pin.unreadable) {
      problems.push(`${pin.where}: not JSON`)
      continue
    }
    const have = assets[`${pin.repo ?? ''} ${pin.tag}`] ?? assets[pin.tag]
    if (!have) {
      problems.push(`${pin.where}: release ${pin.tag} (${pin.repo ?? '?'}) could not be read`)
      continue
    }
    if (!have.includes(pin.file))
      problems.push(
        `${pin.where}: pins ${JSON.stringify(pin.file)}, which release ${pin.tag} does not carry — a build would 404 mid-provision`
      )
  }
  return problems
}

// ── the GitHub half ────────────────────────────────────────────────────────────────────────────

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

function release(tag, repo = REPO) {
  const data = JSON.parse(gh(['release', 'view', tag, '-R', repo, '--json', 'assets,isDraft,name']))
  return { assets: data.assets.map((a) => a.name), draft: data.isDraft, name: data.name }
}

function asset(tag, file) {
  const dir = path.join(process.env.TMPDIR ?? '/tmp', `tracy-setting-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  gh(['release', 'download', tag, '-R', REPO, '-p', file, '-D', dir, '--clobber'])
  return readFileSync(path.join(dir, file), 'utf8')
}

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** A tag says which CMS when Tracy's own naming was followed; otherwise `--platform` must. */
function platformOfTag(tag) {
  if (/\/j\d+$/.test(tag)) return 'joomla'
  if (/\/wp\d+$/.test(tag)) return 'wordpress'
  if (/emdash/.test(tag)) return 'emdash'
  return undefined
}

/** Every checksum the release published: the sums file, plus any runtime manifest attached later. */
function allSums(tag, assets) {
  const sums = assets.includes('SHA256SUMS') ? sumsOf(asset(tag, 'SHA256SUMS')) : {}
  for (const file of assets)
    if (/^runtime-manifest-[\d.]+\.json$/.test(file))
      Object.assign(sums, sumsOfManifest(JSON.parse(asset(tag, file))))
  return sums
}

/**
 * The `installer` road: download the one package, compute its pin, and read the template out of it.
 *
 * Only for a release that publishes NO checksums at all — the 79 older `quickstart/ja-*` releases.
 * Everything here is printed, because everything here is weaker than transcription: the checksum
 * is of the bytes served today rather than of what the publisher signed, and the template is read
 * out of a directory listing rather than stated by a person. Printed is not the same as hidden, and
 * the person running this is the one who decides whether to upload.
 */
function installerPart(tag, file) {
  const dir = path.join(process.env.TMPDIR ?? '/tmp', `tracy-setting-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const local = path.join(dir, file)
  process.stdout.write(`${tag} publishes no checksums — downloading ${file} to compute one\n`)
  gh(['release', 'download', tag, '-R', REPO, '-p', file, '-D', dir, '--clobber'])
  const bytes = readFileSync(local)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  process.stdout.write(`  ${file}  ${bytes.length} bytes  sha256 ${sha256}\n`)
  const names = execFileSync('unzip', ['-Z1', local], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
  if (!names.includes('installation/joomla.php'))
    throw new Error(
      `${file} carries no installation/joomla.php at its root — it is not a classic Joomla quickstart package, and the fleet's installer road cannot build it`
    )
  return { install: { installer: { file, sha256 } }, template: templateInZip(names) }
}

function write(tag) {
  const { assets, draft } = release(tag)
  const platform = flag('platform', platformOfTag(tag))
  if (!PLATFORMS.includes(platform))
    throw new Error(`${tag}: pass --platform (${PLATFORMS.join(' | ')}); the tag does not say`)
  // A release with no checksums used to end here for everybody. It still does for every shape whose
  // pin is transcribed — but a Joomla release carrying exactly one package is the `installer` shape,
  // which predates both `SHA256SUMS` and the runtime manifest, and there are 79 of them.
  const pinned = assets.some((f) => f === 'SHA256SUMS' || f.startsWith('runtime-manifest-'))
  const packaged = platform === 'joomla' ? installerAssetOf(assets) : undefined
  if (!pinned && !packaged)
    throw new Error(
      `${tag} publishes no checksums (SHA256SUMS or a runtime manifest) and no single quickstart package — nothing to transcribe and nothing to weigh`
    )
  const label = flag('label')
  const cms = flag('cms')
  if (!label || !cms) throw new Error(`${tag}: pass --label "Tracy Business" and --cms 0.37.0`)
  const installer = pinned ? undefined : installerPart(tag, packaged)
  if (installer && !flag('template') && installer.template)
    process.stdout.write(`  template read from the package: ${installer.template}  (--template overrides)\n`)
  // One binding, used twice: the setting below, and the card file's own `template` check.
  const template = flag('template', installer?.template)
  const doc = settingFrom({
    tag,
    platform,
    label,
    version: flag('version'),
    cms,
    template,
    install: installer?.install,
    assets,
    sums: allSums(tag, assets)
  })

  const out = flag('out', path.join(process.env.TMPDIR ?? '/tmp', 'tracy-setting'))
  mkdirSync(out, { recursive: true })
  const files = ['tracy_setting.json']
  writeFileSync(path.join(out, 'tracy_setting.json'), `${JSON.stringify(doc, null, 2)}\n`)

  // The Design inspiration card, when this release is a finished site somebody can pick. Its own
  // file since 16/09 — `--card` writes it beside the setting and puts nothing inside the setting.
  const cardFlag = flag('card')
  if (cardFlag) {
    const card = designInspirationFrom({
      tag,
      template,
      doc: JSON.parse(readFileSync(cardFlag, 'utf8'))
    })
    writeFileSync(path.join(out, CARD_FILE), `${JSON.stringify(card, null, 2)}\n`)
    files.push(CARD_FILE)
  }

  // The questionnaire is a straight copy of an authored file — validated here so a set the gate
  // would refuse never reaches a release, but not composed or edited.
  const questions = flag('questions')
  if (questions) {
    const raw = readFileSync(questions, 'utf8')
    parseQuestions(raw, { where: questions })
    writeFileSync(path.join(out, 'tracy_site_question.json'), raw)
    files.push('tracy_site_question.json')
  }

  process.stdout.write(`${JSON.stringify(doc, null, 2)}\n\n`)
  process.stdout.write(`${files.length} file(s) in ${out}${draft ? '  (release is a DRAFT)' : ''}\n`)
  process.stdout.write(
    `\nAttach them, from that directory:\n  gh release upload ${JSON.stringify(tag)} ${files.join(' ')} --clobber -R ${REPO}\n`
  )
}

function check(tag) {
  const { assets } = release(tag)
  let bad = 0
  if (!assets.includes('tracy_setting.json')) {
    process.stdout.write(`${tag}: no tracy_setting.json — Tracy lists it but cannot start a site from it\n`)
    return 1
  }
  const setting = JSON.parse(asset(tag, 'tracy_setting.json'))
  const problems = validateSetting(setting, { assets })
  if (problems.length > 0) {
    bad += 1
    process.stdout.write(`${tag} tracy_setting.json:\n  - ${problems.join('\n  - ')}\n`)
  } else process.stdout.write(`${tag} tracy_setting.json: valid\n`)

  // A release cut before 16/09 still carries its card inside the setting. Tracy reads it (the
  // transition in `templateCards`), so this is a WARNING and not a failure — the release works
  // today, and what it needs is a re-cut, which is a person's decision and not this command's.
  if (setting.card !== undefined)
    process.stdout.write(
      `${tag}: warning — tracy_setting.json still carries a \`card\` block. The card is ${CARD_FILE} since 16/09; cut this release again with --card to move it.\n`
    )

  if (assets.includes(CARD_FILE)) {
    const cardProblems = validateDesignInspiration(JSON.parse(asset(tag, CARD_FILE)))
    if (cardProblems.length > 0) {
      bad += 1
      process.stdout.write(`${tag} ${CARD_FILE}:\n  - ${cardProblems.join('\n  - ')}\n`)
    } else process.stdout.write(`${tag} ${CARD_FILE}: valid\n`)
  } else if (setting.card === undefined)
    process.stdout.write(`${tag}: no ${CARD_FILE} — this release is not on Design templates\n`)

  if (assets.includes('tracy_site_question.json')) {
    try {
      const doc = parseQuestions(asset(tag, 'tracy_site_question.json'), {
        where: `${tag} tracy_site_question.json`
      })
      process.stdout.write(`${tag} tracy_site_question.json: valid, ${doc.questions.length} questions\n`)
    } catch (e) {
      bad += 1
      process.stdout.write(`${e instanceof Error ? e.message : String(e)}\n`)
    }
  } else process.stdout.write(`${tag}: no tracy_site_question.json — sites are asked the CMS default set\n`)
  return bad
}

/**
 * Every hand-written pin in the tree, held to the releases that exist right now.
 *
 * Not one of `check-all`'s gates: it needs the network and a GitHub token, and a gate that goes
 * red because a laptop is on a train teaches people to skip gates. It is a command to run before a
 * deploy, and before believing a catalogue.
 */
const PINNED_FILES = [
  'packages/site/tracy-site-build-joomla/src/host/capabilities.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]

function pins() {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const files = Object.fromEntries(
    PINNED_FILES.map((rel) => [rel, readFileSync(path.join(root, rel), 'utf8')])
  )
  const found = pinsIn(files)
  /** @type {Record<string, string[]>} */
  const assets = {}
  for (const key of new Set(found.filter((p) => p.tag).map((p) => `${p.repo} ${p.tag}`))) {
    const [repo, ...rest] = key.split(' ')
    try {
      assets[key] = release(rest.join(' '), repo).assets
    } catch {
      // Left out of `assets`, which `pinProblems` reports as "could not be read" — never as "gone".
    }
  }
  const problems = pinProblems(found, assets)
  process.stdout.write(`${found.length} pin(s) in ${PINNED_FILES.length} file(s)\n`)
  for (const problem of problems) process.stdout.write(`  ${problem}\n`)
  if (problems.length === 0) process.stdout.write('every pinned file is on its release.\n')
  return problems.length
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [action, tag] = process.argv.slice(2)
  if (!['write', 'check', 'pins'].includes(action) || (action !== 'pins' && !tag)) {
    process.stderr.write('usage: node scripts/tracy-setting.mjs write|check <tag> [flags] | pins\n')
    process.exit(2)
  }
  try {
    if (action === 'pins') process.exit(pins() > 0 ? 1 : 0)
    process.exit(action === 'write' ? (write(tag), 0) : check(tag) > 0 ? 1 : 0)
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  }
}
