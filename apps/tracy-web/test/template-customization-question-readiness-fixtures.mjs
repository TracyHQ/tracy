/**
 * Small release fixtures built in memory for the Template Customization Question Readiness tests:
 * a stored zip, a mysqldump of a few rows, and a rule context over a release source that serves
 * them (the same shape `checkRelease` builds).
 */
import { crc32, gzipSync } from 'node:zlib'

import { releaseContent } from '../src/lib/template-customization-question-readiness/readers/release-content.js'

/** A stored (uncompressed) zip of `files` (path -> text or Buffer), enough for the readers. */
export function zipOf(/** @type {Record<string, string | Buffer>} */ files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const nameBytes = Buffer.from(name)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const quote = (/** @type {unknown} */ v) =>
  v === null ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** A gzipped mysqldump of `tables` (name -> rows of one shape). */
export function dumpOf(/** @type {Record<string, Record<string, unknown>[]>} */ tables) {
  const parts = []
  for (const [name, rows] of Object.entries(tables)) {
    const columns = Object.keys(rows[0] ?? {})
    parts.push(
      `CREATE TABLE \`${name}\` (\n${columns.map((c) => `  \`${c}\` text`).join(',\n')}\n) ENGINE=InnoDB;`
    )
    if (rows.length)
      parts.push(
        `INSERT INTO \`${name}\` VALUES ${rows.map((r) => `(${columns.map((c) => quote(r[c])).join(',')})`).join(',\n')};`
      )
  }
  return gzipSync(Buffer.from(`${parts.join('\n\n')}\n`))
}

const CMS = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/**
 * A rule context over `files` (asset name -> bytes), for a release of `setting`.
 * @param {Record<string, any>} setting
 * @param {Record<string, string | Buffer>} files
 * @param {string | null} [tag]
 */
export function contextOf(setting, files, tag = null) {
  const source = {
    tag,
    where: 'memory',
    names: async () => Object.keys(files).sort(),
    read: async (/** @type {string} */ name) => (name in files ? Buffer.from(files[name]) : null)
  }
  return {
    release: {
      template: setting.template ?? null,
      platform: setting.platform,
      version: setting.version,
      tag,
      name: `${setting.label} ${CMS[/** @type {'joomla'} */ (setting.platform)]} ${setting.version}`
    },
    setting,
    source,
    content: releaseContent(source, setting)
  }
}
