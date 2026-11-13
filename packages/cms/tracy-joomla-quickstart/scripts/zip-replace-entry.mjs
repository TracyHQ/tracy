/**
 * Copy a zip archive with one entry replaced (or new entries added, `addEntries`), every other entry kept as its
 * exact compressed bytes.
 *
 * WHY not unzip and zip again: the blank site of an AI quickstart (ADR 0045) must carry the human quickstart's
 * template files unchanged, provably. Copying each entry's local record as it is keeps its bytes, CRC and time, so a
 * comparison of the two archives shows the demo data as the only difference. The new entry is deflated at a fixed
 * level and keeps the source entry's time, so the same input gives the same archive byte for byte.
 *
 * Plain zip only (no Zip64, no encryption, no multi-disk): a quickstart installer is far below those limits, and an
 * archive that needs them is refused rather than half-copied.
 */

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const DESCRIPTOR = 0x08074b50

/** The entries in central directory order: name, method, crc, sizes, DOS time, and `raw`, the local record bytes. */
export function listEntries(zip) {
  const end = findEnd(zip)
  const count = zip.readUInt16LE(end + 10)
  const cdOffset = zip.readUInt32LE(end + 16)
  if (count === 0xffff || cdOffset === 0xffffffff || zip.readUInt16LE(end + 4) !== 0) {
    throw new Error('a Zip64 or multi-disk archive is not supported')
  }
  const entries = []
  let at = cdOffset
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL) throw new Error(`no central directory header at ${at}`)
    const nameLen = zip.readUInt16LE(at + 28)
    const centralLen = 46 + nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    const flags = zip.readUInt16LE(at + 8)
    if (flags & 0x0001) throw new Error('an encrypted entry is not supported')
    const compressedSize = zip.readUInt32LE(at + 20)
    const localOffset = zip.readUInt32LE(at + 42)
    if (zip.readUInt32LE(localOffset) !== LOCAL) throw new Error(`no local header at ${localOffset}`)
    const dataStart =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    let recordEnd = dataStart + compressedSize
    if (flags & 0x0008) recordEnd += zip.readUInt32LE(recordEnd) === DESCRIPTOR ? 16 : 12
    entries.push({
      name: zip.toString('utf8', at + 46, at + 46 + nameLen),
      method: zip.readUInt16LE(at + 10),
      dosTime: zip.readUInt16LE(at + 12),
      dosDate: zip.readUInt16LE(at + 14),
      crc: zip.readUInt32LE(at + 16),
      compressedSize,
      size: zip.readUInt32LE(at + 24),
      localOffset,
      dataStart,
      central: zip.subarray(at, at + centralLen),
      raw: zip.subarray(localOffset, recordEnd)
    })
    at += centralLen
  }
  return entries
}

/** The uncompressed bytes of one entry, checked against the CRC-32 and size the archive records for it. */
export function readEntry(zip, name) {
  const entry = listEntries(zip).find((e) => e.name === name)
  if (!entry) throw new Error(`the archive has no entry ${name}`)
  const data = zip.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
  let content
  if (entry.method === 0) content = Buffer.from(data)
  else if (entry.method === 8) content = inflateRawSync(data)
  else throw new Error(`entry ${name} uses compression method ${entry.method}`)
  if (content.length !== entry.size || crc32(content) !== entry.crc) {
    throw new Error(`entry ${name} does not match its recorded CRC-32 or size`)
  }
  return content
}

/** A new archive: `name` holds `content`, every other entry and the archive comment are copied unchanged. */
export function replaceEntry(zip, name, content) {
  const entries = listEntries(zip)
  if (!entries.some((e) => e.name === name)) throw new Error(`the archive has no entry ${name}`)
  const records = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const central = Buffer.from(entry.central)
    let record = entry.raw
    if (entry.name === name) {
      const body = deflateRawSync(content, { level: 9 })
      const localHeader = Buffer.from(entry.raw.subarray(0, entry.dataStart - entry.localOffset))
      const flags = localHeader.readUInt16LE(6) & ~0x0008
      for (const [buf, base] of [
        [localHeader, 0],
        [central, 2]
      ]) {
        buf.writeUInt16LE(flags, base + 6)
        buf.writeUInt16LE(8, base + 8)
        buf.writeUInt32LE(crc32(content), base + 14)
        buf.writeUInt32LE(body.length, base + 18)
        buf.writeUInt32LE(content.length, base + 22)
      }
      record = Buffer.concat([localHeader, body])
    }
    central.writeUInt32LE(offset, 42)
    records.push(record)
    centrals.push(central)
    offset += record.length
  }
  const cd = Buffer.concat(centrals)
  const endAt = findEnd(zip)
  const end = Buffer.from(zip.subarray(endAt))
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...records, cd, end])
}

/**
 * A new archive with `files` (`[name, Buffer]`, none of them in the archive yet) added after every entry, which are
 * copied unchanged. Each new entry is deflated at a fixed level and takes the time and attributes of the entry
 * `like` names, so the same input gives the same archive byte for byte.
 */
export function addEntries(zip, files, { like }) {
  const entries = listEntries(zip)
  const model = entries.find((e) => e.name === like)
  if (!model) throw new Error(`the archive has no entry ${like}`)
  for (const [name] of files)
    if (entries.some((e) => e.name === name)) throw new Error(`the archive already has an entry ${name}`)
  const endAt = findEnd(zip)
  const cdOffset = zip.readUInt32LE(endAt + 16)
  const records = [zip.subarray(0, cdOffset)]
  const centrals = [zip.subarray(cdOffset, endAt)]
  let offset = cdOffset
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = deflateRawSync(content, { level: 9 })
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(model.dosTime, 10)
    local.writeUInt16LE(model.dosDate, 12)
    local.writeUInt32LE(crc32(content), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(model.central.readUInt16LE(4), 4)
    local.copy(central, 6, 4, 26)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(model.central.readUInt32LE(38), 38)
    central.writeUInt32LE(offset, 42)
    records.push(local, nameBuf, body)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.from(zip.subarray(endAt))
  end.writeUInt16LE(entries.length + files.length, 8)
  end.writeUInt16LE(entries.length + files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...records, cd, end])
}

function findEnd(zip) {
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at -= 1) {
    if (zip.readUInt32LE(at) === END) return at
  }
  throw new Error('not a zip archive (no end of central directory)')
}
