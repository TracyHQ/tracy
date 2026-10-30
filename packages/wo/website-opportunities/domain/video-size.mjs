// A video's width and height as it plays, read from its MP4 / QuickTime header (pure): the first track header ('tkhd' in
// 'moov' > 'trak') with a picture, turned by its matrix when the phone recorded it sideways. Null for anything else
// (WebM, a cut file, a sound-only file): an unknown size stays unknown, never a guess.

const CONTAINERS = new Set(['moov', 'trak'])

/** The boxes inside `bytes[start, end)`: `{type, body: [start, end)}`; stops at the first malformed one. */
function* boxes(view, start, end) {
  let at = start
  while (at + 8 <= end) {
    let size = view.getUint32(at)
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7)
    )
    let head = 8
    if (size === 1) {
      if (at + 16 > end) return
      size = Number(view.getBigUint64(at + 8))
      head = 16
    } else if (size === 0) size = end - at
    if (size < head || at + size > end) return
    yield { type, start: at + head, end: at + size }
    at += size
  }
}

/** The size a track header names, turned by its matrix; null for a track with no picture. */
function trackSize(view, start, end) {
  const version = view.getUint8(start)
  // Width and height are the last 8 bytes; the 36-byte matrix comes right before them.
  const sizeAt = start + (version === 1 ? 88 : 76)
  if (sizeAt + 8 > end) return null
  const width = Math.round(view.getUint32(sizeAt) / 65536)
  const height = Math.round(view.getUint32(sizeAt + 4) / 65536)
  if (!width || !height) return null
  const a = view.getInt32(sizeAt - 36)
  const b = view.getInt32(sizeAt - 32)
  const quarterTurn = a === 0 && Math.abs(b) === 65536
  return quarterTurn ? { width: height, height: width } : { width, height }
}

function find(view, start, end) {
  for (const b of boxes(view, start, end)) {
    if (b.type === 'tkhd') {
      const size = trackSize(view, b.start, b.end)
      if (size) return size
    } else if (CONTAINERS.has(b.type)) {
      const size = find(view, b.start, b.end)
      if (size) return size
    }
  }
  return null
}

/**
 * @param {Uint8Array} bytes the whole video file
 * @returns {{width: number, height: number} | null}
 */
export function videoSize(bytes) {
  if (!bytes || bytes.length < 16) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    return find(view, 0, bytes.byteLength)
  } catch {
    return null
  }
}
