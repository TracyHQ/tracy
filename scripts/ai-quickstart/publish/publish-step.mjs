// The publish step of an AI quickstart (ticket #588), as one function with its machine parts injected: the blank site
// step, the gate run and `gh`. In order:
//   1. what needs no gate run: the kit names its `site` (`no_site`: the record binds the kit manifest, so `site` is in
//      it before the gate runs), the quickstart list pins this template (`no_pin`) at this version (`pin_version`),
//      the human quickstart given is the pinned installer (`human_quickstart_not_pinned`), its release is named
//      (`no_release`) and read: it carries the human quickstart and no asset of this kit version yet; the output
//      folder is new (`out_not_empty`);
//   2. the blank site archive made from the pinned human quickstart (`blank-site.mjs`);
//   3. `publishVerified` (`gate/release-publish.mjs`): the gate run on that archive into an empty run folder with
//      `--into-kit`, the record in the kit folder the one it wrote, the kit's own plan, the release guard;
//   4. only then the asset set (`publish-assets.mjs`) written into `<out>/assets` with its checksum manifest and the
//      pin it gives (`<out>/pin.json`); with `upload`, the release read again, the assets uploaded to it and the pin
//      written into the pins file beside the kits. Without `upload` (a dry run) nothing leaves the machine.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { bindingOf, templateKitFileOf } from '../gate/release-binding.mjs'
import { publishVerified } from '../gate/release-publish.mjs'
import { assetSetOf, collisionsOf, kitRefOf, publishedManifestOf, writeAssetSet } from './publish-assets.mjs'
import { pinEntryOf, pinsFileOf, writePin } from './publish-pin.mjs'
import {
  humanEntryOf,
  readReleaseAssets,
  releaseOfEntry,
  releaseProblems,
  uploadToRelease
} from './publish-release.mjs'

const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const problem = (code, message) => ({ code, message })

function precheck({ folder, human, out, entry, kitRef }) {
  const out_ = []
  let manifest = null
  try {
    manifest = JSON.parse(readFileSync(path.join(folder, 'kit-manifest.json'), 'utf8'))
  } catch {}
  if (!manifest?.site)
    out_.push(
      problem('no_site', 'kit-manifest.json names no site: a kit Tracy cannot build from is not published')
    )
  if (!entry) out_.push(problem('no_pin', 'the quickstart list pins no human quickstart for this template'))
  else if (entry.version !== kitRef.version)
    out_.push(
      problem('pin_version', 'the quickstart list pins ' + entry.version + ', the kit is ' + kitRef.version)
    )
  if (entry && (!human || !existsSync(human) || sha256File(human) !== entry.installer?.sha256))
    out_.push(
      problem('human_quickstart_not_pinned', 'the human quickstart given is not the pinned installer')
    )
  if (existsSync(out) && readdirSync(out).length) out_.push(problem('out_not_empty', out + ' is not empty'))
  return out_
}

/**
 * @param {{folder: string, human: string, out: string, root: string, upload?: boolean, deps: {buildBlankSite:
 *   (input: object) => Promise<string>, runGate: (input: object) => Promise<{record: object}>, gh?: ((args:
 *   string[]) => string) | null, plan?: Function, pinsFile?: string, log?: Function}}} input `gh` null: the release
 *   is not read (a dry run only)
 * @returns {Promise<{published: boolean, uploaded: boolean, problems: object[], release?: object, assets?: object[],
 *   pin?: object}>}
 */
export async function publishKit({ folder, human, out, root, upload = false, deps }) {
  const log = deps.log ?? (() => {})
  const kitRef = kitRefOf(folder)
  const entry = humanEntryOf(root, kitRef)
  const refused = (problems, more = {}) => ({ published: false, uploaded: false, problems, ...more })
  const problems = precheck({ folder, human, out, entry, kitRef })
  const release = entry ? releaseOfEntry(entry) : null
  if (entry && !release) problems.push(problem('no_release', 'the pinned installer URL names no release'))
  const prefix = 'ai-quickstart-' + kitRef.slug + '-' + kitRef.cms + '-' + kitRef.version
  if (release && deps.gh)
    problems.push(...releaseProblems(release, readReleaseAssets(release, deps.gh), prefix))
  else if (release && upload) problems.push(problem('release_not_read', 'an upload reads the release first'))
  else if (release) log('release ' + release.tag + ' of ' + release.repo + ' not read (offline)')
  if (problems.length) return refused(problems, { release })

  const blankSite = await deps.buildBlankSite({ human, folder, out })
  const blankSiteSha = sha256File(blankSite)
  log('blank site archive ' + path.basename(blankSite) + ' sha256 ' + blankSiteSha)
  const pins = { plugin: entry.cowork?.version, humanQuickstartSha256: entry.installer?.sha256 }
  let record = null
  let made = null
  const result = await publishVerified({
    folder,
    pins,
    blankSiteSha,
    ...(deps.plan ? { plan: deps.plan } : {}),
    runGate: async () => {
      const ran = await deps.runGate({
        folder,
        human,
        installer: blankSite,
        runDir: path.join(out, 'gate-run')
      })
      record = ran?.record ?? null
      return ran
    },
    publish: async (checked) => {
      const set = assetSetOf({ folder: checked, blankSite, templateKit: templateKitFileOf(checked) })
      if (set.problems.length)
        throw Object.assign(new Error(set.problems[0].message), { problems: set.problems })
      const binding = bindingOf(record)
      const target = { repo: release.repo, tag: release.tag }
      const manifest = publishedManifestOf({ kitRef, release: target, binding, assets: set.assets })
      const written = writeAssetSet(path.join(out, 'assets'), set, manifest)
      const pin = pinEntryOf({
        kitRef,
        binding,
        blankSite: set.assets[0],
        manifest: written.manifest,
        release
      })
      writeFileSync(path.join(out, 'pin.json'), JSON.stringify(pin, null, 2) + '\n')
      made = {
        assets: [
          ...set.assets.map(({ from: _from, ...a }) => a),
          { name: written.manifest.file, role: 'manifest', path: null, ...written.manifest }
        ],
        pin,
        files: written.files
      }
      if (!upload) return
      const taken = collisionsOf(
        made.assets.map((a) => a.name),
        readReleaseAssets(release, deps.gh)
      )
      if (taken.length) throw new Error('the release already carries ' + taken.join(', '))
      uploadToRelease(release, written.files, deps.gh)
      writePin(deps.pinsFile ?? pinsFileOf(checked), kitRef, pin)
    }
  }).catch((error) => ({
    published: false,
    problems: error.problems ?? [problem('publish_failed', String(error?.message ?? error).slice(0, 300))]
  }))
  if (!result.published) return refused(result.problems, { release })
  return { published: true, uploaded: upload, problems: [], release, assets: made.assets, pin: made.pin }
}
