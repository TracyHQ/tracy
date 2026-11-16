// The release an AI quickstart is published to (ticket #588): the very release that carries the human quickstart of
// the same template version, read off the human quickstart's pin in the quickstart list
// (`apps/tracy-web/src/quickstarts.json`, `quickstart/<slug>/<cms>`: its `installer.url` names the repository and the
// tag). Reading the release and uploading to it go through `gh`, injected as `exec(args) => stdout` so the tests never
// call it. Uploading never replaces an asset (no `--clobber`): a name the release already has refuses the publish.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const DOWNLOAD = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/

/** The human quickstart entry of a kit in the quickstart list, or null. */
export function humanEntryOf(root, { slug, cms }) {
  const list = JSON.parse(readFileSync(path.join(root, 'apps/tracy-web/src/quickstarts.json'), 'utf8'))
  return list['quickstart/' + slug + '/' + cms] ?? null
}

/** `{repo, tag, humanFile}` of a human quickstart entry, or null when its installer URL names no release. */
export function releaseOfEntry(entry) {
  const m = DOWNLOAD.exec(String(entry?.installer?.url ?? ''))
  if (!m) return null
  return { repo: m[1], tag: decodeURIComponent(m[2]), humanFile: decodeURIComponent(m[3]) }
}

/** The asset names of a release, read with `gh release view`. */
export function readReleaseAssets({ repo, tag }, exec) {
  const out = exec(['release', 'view', tag, '--repo', repo, '--json', 'assets'])
  return (JSON.parse(out).assets ?? []).map((a) => a.name)
}

/** Uploads files to a release with `gh release upload`, never replacing one. */
export function uploadToRelease({ repo, tag }, files, exec) {
  exec(['release', 'upload', tag, ...files, '--repo', repo])
}

/**
 * Why the kit may not go to this release before anything is built: the human quickstart is not in it, or an asset of
 * this kit version already is.
 */
export function releaseProblems(release, names, prefix) {
  const out = []
  if (!names.includes(release.humanFile))
    out.push({
      code: 'human_quickstart_not_in_release',
      message: release.tag + ' of ' + release.repo + ' does not carry ' + release.humanFile
    })
  const taken = names.filter((n) => n.startsWith(prefix + '.'))
  if (taken.length)
    out.push({
      code: 'already_published',
      message: release.tag + ' already carries ' + taken.length + ' asset(s) of ' + prefix + ': ' + taken[0]
    })
  return out
}
