// A plain zip archive written with the standard library: JSON and other text deflated, pictures stored as they are
// (a JPEG does not shrink). Every entry carries the same fixed date, so the same files give the same bytes and the
// same sha256 on every run.
import { crc32, deflateRawSync } from 'node:zlib'

const DOS_TIME = 0 // 00:00:00
const DOS_DATE = (2020 - 1980) * 512 + 1 * 32 + 1 // 2020-01-01: a fixed stamp, never the clock
const STORED = /\.(jpe?g|png|webp|gif|zip|gz)$/i

/**
 * @param {Array<{name: string, data: Buffer}>} entries in archive order (names use `/`)
 * @returns {Buffer}
 */
export function zipStore(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const store = STORED.test(e.name)
    const body = store ? e.data : deflateRawSync(e.data, { level: 9 })
    const crc = crc32(e.data) >>> 0
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(0x0800, 6) // names in UTF-8
    head.writeUInt16LE(store ? 0 : 8, 8)
    head.writeUInt16LE(DOS_TIME, 10)
    head.writeUInt16LE(DOS_DATE, 12)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(body.length, 18)
    head.writeUInt32LE(e.data.length, 22)
    head.writeUInt16LE(name.length, 26)
    head.writeUInt16LE(0, 28)
    locals.push(head, name, body)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(store ? 0 : 8, 10)
    dir.writeUInt16LE(DOS_TIME, 12)
    dir.writeUInt16LE(DOS_DATE, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(e.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    centrals.push(dir, name)
    offset += head.length + name.length + body.length
  }
  const central = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, end])
}
