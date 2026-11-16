// The pin the publish step writes once it published a kit (ticket #588): the one version Tracy builds from and the
// checksums a build checks that version against (`resolvePinnedAiQuickstart`, WO domain `ai-quickstart-pin.mjs`).
// The pin is made from the record the publish step's own gate run wrote and from the assets it published, so it names
// nothing the publish did not check.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  PINS_FILE,
  PINS_SCHEMA,
  pinKeyOf,
  pinShapeProblems
} from '../../../packages/wo/website-opportunities/domain/ai-quickstart-pin.mjs'

/** The pins file of the folder of kits a kit folder `<root>/<slug>/<cms>/<version>` sits in. */
export const pinsFileOf = (folder) => path.join(path.resolve(folder), '..', '..', '..', PINS_FILE)

/** The pin of a published kit. */
export function pinEntryOf({ kitRef, binding, blankSite, manifest, release }) {
  const entry = {
    version: kitRef.version,
    gateVersion: binding.gateVersion ?? null,
    kitFilesSha256: binding.kitFilesSha256,
    recordSha256: binding.recordSha256,
    templateKitSha256: binding.templateKitSha256 ?? null,
    blankSite: { file: blankSite.name, bytes: blankSite.bytes, sha256: blankSite.sha256 },
    manifest,
    release: { repo: release.repo, tag: release.tag }
  }
  const problems = pinShapeProblems(entry)
  if (problems.length) throw new Error('the pin made is not one: ' + problems[0].message)
  return entry
}

/** Writes one pin into a pins file, the other pins kept as they are. */
export function writePin(file, { slug, cms }, entry) {
  const doc = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {
        $comment:
          'The AI quickstart Tracy builds from, per template (ticket #588). Written by the publish step only: scripts/ai-quickstart/publish.mjs.',
        schema: PINS_SCHEMA,
        pins: {}
      }
  if (doc.schema !== PINS_SCHEMA) throw new Error(file + ' is not a pins file of ' + PINS_SCHEMA)
  doc.pins = { ...doc.pins, [pinKeyOf(slug, cms)]: entry }
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
}
