// The released files of the template version a kit was drafted from (ticket #585), read as demo corpus sources: the
// demo baseline, the demo site's content map, the template kit's fixed texts and frame pictures, and the copy file's
// demo company names. Found by the kit's own `mapping.template` ({slug, version}) under
// `packages/cms/<package>/contracts/<slug>/<cms>/<version>/`; nothing is found when no folder or more than one matches.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const list = (value) => (Array.isArray(value) ? value : [])
const SAFE = /^[a-z0-9][a-z0-9._-]*$/i
const dirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : []
const json = (file) => {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The contract folder of a template version: `{dir, copyFile}`, or null when none or several match. */
export function releaseFolderOf(template, root = ROOT) {
  const { slug, version } = template ?? {}
  if (!SAFE.test(String(slug ?? '')) || !SAFE.test(String(version ?? ''))) return null
  const cms = path.join(root, 'packages', 'cms')
  const found = []
  for (const pkg of dirs(cms)) {
    const at = path.join(cms, pkg, 'contracts', slug)
    for (const kind of dirs(at)) {
      const dir = path.join(at, kind, version)
      if (existsSync(dir)) found.push({ dir, copyFile: path.join(at, kind, `${version}.copy.json`) })
    }
  }
  return found.length === 1 ? found[0] : null
}

/**
 * The corpus sources a release folder ships, each left out when its file is missing:
 * `{demoBaseline, contentMap, fixedTexts, mediaFiles, companyNames, interfaceTexts}`.
 */
export function releasedSourcesOf(kit, root = ROOT) {
  const folder = releaseFolderOf(kit?.mapping?.template, root)
  if (!folder) return {}
  const out = {}
  const baseline = json(path.join(folder.dir, 'demo-baseline.json'))
  if (baseline) out.demoBaseline = baseline
  const contentMap = json(path.join(folder.dir, 'content-map.json'))
  if (contentMap) out.contentMap = contentMap
  const templateKit = json(path.join(folder.dir, 'template-kit.json'))
  if (templateKit) {
    out.fixedTexts = [
      ...list(templateKit.site?.fixedTexts),
      ...list(templateKit.blocks).flatMap((b) => list(b?.fixedText))
    ].map((f) => f?.text)
    out.mediaFiles = list(templateKit.blocks)
      .flatMap((b) => list(b?.frames))
      .map((f) => f?.picture)
      .filter((p) => typeof p === 'string')
  }
  const copy = json(folder.copyFile)
  if (copy) {
    out.companyNames = list(copy.demoCompanyNames)
    const kept = list(copy.keptText).map((k) => (typeof k === 'string' ? k : k?.text))
    if (kept.length) out.interfaceTexts = kept
  }
  return out
}
