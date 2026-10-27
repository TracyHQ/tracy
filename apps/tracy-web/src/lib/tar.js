/**
 * A tar of a handful of in-memory files, written by hand.
 *
 * WHY NOT A LIBRARY. This writes two entries, once, for one door — a captured site's webroot and
 * the database beside it, handed to a machine that reads one stdin. `apps/tracy-web` ships four
 * dependencies on purpose (see `lib/demo-ssh.js` on why the fourth was argued for); a tar writer
 * for two files is forty lines of a format that has not changed since 1988.
 *
 * 🔒 USTAR, AND THE NAMES ARE OURS. Only this file's own callers name entries, and they name
 * literals — never a path from a release, a caller or a page. A tar entry name is a path on
 * somebody else's disk when it is unpacked, so the one rule here is that nothing variable reaches
 * it: `assertName` refuses anything but a plain file name, which makes the rule checkable rather
 * than remembered.
 */

const BLOCK = 512

/** 2020-01-01T00:00:00Z — old, fixed, and not old enough for tar to complain about. */
const FIXED_MTIME = 1577836800

/** A plain file name: no directory, no traversal, no leading dash, and short enough for ustar. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,98}$/

function assertName(name) {
  if (!NAME.test(name)) throw new Error(`tar: refusing an entry called ${JSON.stringify(name)}`)
}

/** One 512-byte header. Octal, NUL-padded, with the checksum computed over spaces then written. */
function header(name, size) {
  const block = Buffer.alloc(BLOCK)
  const octal = (value, width) => value.toString(8).padStart(width - 1, '0') + '\0'
  block.write(name, 0, 100, 'utf8')
  block.write(octal(0o644, 8), 100, 8, 'ascii') // mode
  block.write(octal(0, 8), 108, 8, 'ascii') // uid
  block.write(octal(0, 8), 116, 8, 'ascii') // gid
  block.write(octal(size, 12), 124, 12, 'ascii')
  // A fixed mtime, not `Date.now()`: the same two assets must tar to the same bytes every time, or
  // nothing downstream can ever compare one package to another.
  //
  // ⚠ NOT ZERO, THOUGH. Epoch 0 is 1970, and GNU tar calls that "implausibly old" — one warning
  // PER FILE. Measured 17/09 restoring a 55 MB Joomla webroot: 13,762 warning lines, a 1.5 MB log,
  // and the one line that mattered buried in it. A fixed date that is merely old is just as
  // reproducible and says nothing.
  block.write(octal(FIXED_MTIME, 12), 136, 12, 'ascii')
  block.write('        ', 148, 8, 'ascii') // checksum field, spaces while it is computed
  block.write('0', 156, 1, 'ascii') // type: regular file
  block.write('ustar\0', 257, 6, 'ascii')
  block.write('00', 263, 2, 'ascii')
  let sum = 0
  for (const byte of block) sum += byte
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
  return block
}

/** Round a length up to the next 512-byte block — tar pads every file to a whole block. */
const padding = (size) => (size % BLOCK === 0 ? 0 : BLOCK - (size % BLOCK))

/**
 * Tar the given files into one buffer.
 * @param {{ name: string, bytes: Buffer }[]} files
 * @returns {Buffer}
 */
export function tarOf(files) {
  const parts = []
  for (const file of files) {
    assertName(file.name)
    parts.push(header(file.name, file.bytes.length), file.bytes, Buffer.alloc(padding(file.bytes.length)))
  }
  // Two empty blocks end the archive, and `tar` warns about a file that lacks them.
  parts.push(Buffer.alloc(BLOCK * 2))
  return Buffer.concat(parts)
}
