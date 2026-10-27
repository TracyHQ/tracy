/** Recover original native picture evidence for historical retries without adopting current content. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { emdashToolFor } from '../../lib/emdash-tool.js'
import { createHash } from 'node:crypto'
import { qualityHash } from '../../lib/quality-hash.js'
import { responsivePictures } from './quickstart-pictures.js'
const fail = (code) => Object.assign(new Error(code), { code })
export async function recoverQuickstartPictureBaseline({
  inventory,
  reader,
  checkAllowed,
  ctx,
  releaseVersion,
  releaseMedia: providedMedia
}) {
  let releaseMedia = providedMedia
  if (!releaseMedia) {
    const tool = emdashToolFor(ctx?.quickstart)
    if (!tool || !releaseVersion) throw fail('QUICKSTART_BASELINE_RELEASE_REQUIRED')
    const config = JSON.parse(readFileSync(path.join(tool.seedDir, '../template.config.json'), 'utf8'))
    if (config.version !== releaseVersion) throw fail('QUICKSTART_BASELINE_RELEASE_MISMATCH')
    const media = JSON.parse(readFileSync(path.join(tool.seedDir, 'media-map.json'), 'utf8'))
    releaseMedia = new Map()
    for (const item of media.items ?? []) {
      if (!item.copied?.startsWith('media/') || item.copied.split('/').includes('..'))
        throw fail('QUICKSTART_BASELINE_RELEASE_REQUIRED')
      const sha = createHash('sha256')
        .update(readFileSync(path.join(tool.seedDir, item.copied)))
        .digest('hex')
      const filename = path.basename(item.file)
      releaseMedia.set(filename, [...(releaseMedia.get(filename) ?? []), sha])
    }
  }
  if (!Array.isArray(inventory?.structure) || !inventory.copyHash) throw fail('QUICKSTART_BASELINE_REQUIRED')
  const files = new Map()
  const base = new URL(reader.base)
  const add = (value, filename = null) => {
    if (value.startsWith('data:')) return
    const url = new URL(value, base)
    if (url.origin !== base.origin) throw fail('QUICKSTART_BASELINE_EXTERNAL_PICTURE')
    files.set(url.pathname + url.search, filename ?? path.basename(url.pathname))
  }
  const visit = (value) => {
    if (value && typeof value === 'object' && value.id && (value.provider || value.mimeType)) {
      const file =
        value.src ?? (value.meta?.storageKey ? `/_emdash/api/media/file/${value.meta.storageKey}` : null)
      if (file) add(file, value.filename)
    } else if (typeof value === 'string') {
      if (/<img|<source|background|url\(/i.test(value))
        for (const group of responsivePictures(value)) add(group.file)
      else if (/\.(?:png|jpe?g|webp|avif)(?:[?#]|$)/i.test(value) && !/<|\s/.test(value)) add(value)
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child)
  }
  for (const record of inventory.structure) visit(record.shape)
  if (!files.size) throw fail('QUICKSTART_BASELINE_REQUIRED')
  const shas = new Set()
  for (const [file, filename] of files) {
    await checkAllowed()
    const bytes = await reader.bytes(file)
    if (!bytes?.length) throw fail('QUICKSTART_BASELINE_PICTURE_UNREADABLE')
    const sha = createHash('sha256').update(bytes).digest('hex')
    if (!releaseMedia.get(filename)?.includes(sha)) throw fail('QUICKSTART_BASELINE_RELEASE_BYTES_MISMATCH')
    shas.add(sha)
  }
  return {
    cssRules: {},
    texts: [],
    pictures: {
      files: [...files.keys()]
        .map((file) => decodeURIComponent(new URL(file, base).pathname).replace(/^\/+/, ''))
        .sort(),
      shas: [...shas].sort()
    },
    provenance: {
      version: 'native-inventory-recovery/1',
      scope: 'original-native-picture-references',
      releaseVersion: releaseVersion ?? 'fixture',
      releaseMediaHash: qualityHash([...releaseMedia].sort(([a], [b]) => a.localeCompare(b))),
      inventoryHash: qualityHash(inventory.structure)
    }
  }
}

/** Picture-only recovery declares unavailable CSS/text evidence rather than adopting current styles. */
export function quickstartQaBaseline(baseline) {
  if (baseline?.provenance?.version !== 'native-inventory-recovery/1') return baseline
  return { ...baseline, cssRules: baseline.cssRules ?? {}, texts: baseline.texts ?? [] }
}
