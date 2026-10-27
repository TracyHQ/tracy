import { crc32, deflateRawSync } from 'node:zlib'
export function syntheticZip(entries) {
  const local = [],
    central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.path),
      bytes = Buffer.from(e.bytes ?? ''),
      compressed = e.deflate ? deflateRawSync(bytes) : bytes
    const crc = e.crc ?? crc32(bytes),
      size = e.size ?? bytes.length,
      flags = e.flags ?? 0x800
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50)
    l.writeUInt16LE(20, 4)
    l.writeUInt16LE(flags, 6)
    l.writeUInt16LE(e.deflate ? 8 : 0, 8)
    l.writeUInt32LE(crc, 14)
    l.writeUInt32LE(compressed.length, 18)
    l.writeUInt32LE(size, 22)
    l.writeUInt16LE(name.length, 26)
    local.push(l, name, compressed)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50)
    c.writeUInt16LE((3 << 8) | 20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(flags, 8)
    c.writeUInt16LE(e.deflate ? 8 : 0, 10)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(compressed.length, 20)
    c.writeUInt32LE(size, 24)
    c.writeUInt16LE(name.length, 28)
    c.writeUInt32LE(((e.mode ?? 0o100600) << 16) >>> 0, 38)
    c.writeUInt32LE(offset, 42)
    central.push(c, name)
    offset += l.length + name.length + compressed.length
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, cd, end])
}
