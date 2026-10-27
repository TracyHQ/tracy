import yauzl from 'yauzl'
import { crc32 } from 'node:zlib'
import { decodeEmailImage } from './real-images.js'
import { sanitizeEmailHtml, emailImagePath } from './real-html.js'
import { realError } from './real-store.js'

const MIB = 1024 * 1024
function open(bytes) {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => (error ? reject(error) : resolve(zip))
    )
  )
}
export async function readTemplateZip({ bytes, registry }) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 10 * MIB) throw realError('REAL_ZIP_LIMIT')
  let zip
  try {
    zip = await open(bytes)
    const files = [],
      seen = new Set(),
      warnings = new Set()
    let expanded = 0,
      entries = 0
    await new Promise((resolve, reject) => {
      zip.on('error', reject)
      zip.on('end', resolve)
      zip.on('entry', (entry) => {
        void (async () => {
          const name = entry.fileName,
            directory = name.endsWith('/'),
            path = directory ? name.slice(0, -1) : name
          const normalized = path.normalize('NFC').toLowerCase()
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000
          if (
            ++entries > 50 ||
            !emailImagePath(path) ||
            seen.has(normalized) ||
            entry.generalPurposeBitFlag & 1 ||
            (mode && mode !== (directory ? 0o040000 : 0o100000))
          )
            throw realError('REAL_ZIP_ENTRY')
          seen.add(normalized)
          const ignored =
            path.startsWith('__MACOSX/') || path === '__MACOSX' || path.split('/').at(-1) === '.DS_Store'
          const limit = ignored
            ? 20 * MIB
            : directory
              ? 0
              : /(?:^|\/)index\.html$/.test(path)
                ? 256 * 1024
                : /(?:^|\/)text\.txt$/.test(path)
                  ? 100 * 1024
                  : 2 * MIB
          if (
            !ignored &&
            !directory &&
            !/(?:^|\/)index\.html$|(?:^|\/)text\.txt$|\.(?:png|jpe?g|gif)$/i.test(path)
          )
            throw realError('REAL_ZIP_CONTENT')
          if (entry.uncompressedSize > limit || expanded + entry.uncompressedSize > 20 * MIB)
            throw realError('REAL_ZIP_LIMIT')
          const stream = await new Promise((yes, no) =>
            zip.openReadStream(entry, (error, stream) => (error ? no(error) : yes(stream)))
          )
          let size = 0,
            checksum = 0
          const chunks = []
          for await (const chunk of stream) {
            size += chunk.length
            expanded += chunk.length
            if (size > limit || expanded > 20 * MIB) {
              stream.destroy()
              throw realError('REAL_ZIP_LIMIT')
            }
            checksum = crc32(chunk, checksum)
            if (!ignored) chunks.push(chunk)
          }
          if (size !== entry.uncompressedSize || checksum !== entry.crc32)
            throw realError('REAL_ZIP_INTEGRITY')
          if (ignored) warnings.add('ZIP_METADATA_IGNORED')
          else if (!directory) files.push({ path, bytes: Buffer.concat(chunks) })
          zip.readEntry()
        })().catch(reject)
      })
      zip.readEntry()
    })
    const indexes = files.filter((f) => /(?:^|\/)index\.html$/.test(f.path))
    if (indexes.length !== 1) throw realError('REAL_ZIP_INDEX')
    const index = indexes[0],
      prefix = index.path.slice(0, -10)
    if ((prefix && !/^[^/]+\/$/.test(prefix)) || files.some((f) => !f.path.startsWith(prefix)))
      throw realError('REAL_ZIP_LAYOUT')
    const images = []
    let text = null
    for (const file of files) {
      const path = file.path.slice(prefix.length)
      if (file === index) continue
      if (path === 'text.txt') text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
      else {
        const image = await decodeEmailImage({ bytes: file.bytes })
        const expected = /\.png$/i.test(path)
          ? 'image/png'
          : /\.jpe?g$/i.test(path)
            ? 'image/jpeg'
            : /\.gif$/i.test(path)
              ? 'image/gif'
              : null
        if (image.mediaType !== expected) throw realError('REAL_IMAGE_FORMAT')
        images.push({ path, ...image })
      }
    }
    const html = new TextDecoder('utf-8', { fatal: true }).decode(index.bytes)
    const clean = sanitizeEmailHtml({ html, imagePaths: images.map((i) => i.path), registry })
    return {
      html: clean.html,
      text,
      images,
      warnings: [...new Set([...warnings, ...clean.warnings])],
      removed: clean.removed
    }
  } catch (error) {
    if (error.code?.startsWith('REAL_')) throw error
    throw realError('REAL_ZIP_INVALID')
  } finally {
    zip?.close()
  }
}
