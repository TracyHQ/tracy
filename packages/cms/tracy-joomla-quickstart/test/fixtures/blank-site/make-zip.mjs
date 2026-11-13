/**
 * Test helper: a small zip archive written the way an archiver writes one (fixed times, stored or deflated entries),
 * so the zip and blank site tests need no archiver on the machine.
 */

import { crc32, deflateRawSync } from 'node:zlib'

/** A small zip: `[name, text, deflate?]` entries, with fixed times, the way an archiver writes one. */
export function makeZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text, deflate] of files) {
    const data = Buffer.from(text)
    const body = deflate ? deflateRawSync(data) : data
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt16LE(0x4a21, 10)
    local.writeUInt16LE(0x5b6d, 12)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x031e, 4)
    central.writeUInt16LE(20, 6)
    local.copy(central, 8, 6, 30)
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    const record = Buffer.concat([local, nameBuf, body])
    locals.push(record)
    centrals.push(Buffer.concat([central, nameBuf]))
    offset += record.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}
