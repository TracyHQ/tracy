// safe-path.mjs — a file name taken from a model, a seed or a media map is data, not a trusted path.
// `unsafeReason` says why a name cannot stay inside the directory it will be joined to; `joinInside`
// returns the joined path or throws. Both refuse `..` segments, absolute paths, drive letters and
// backslashes (a Windows path read on POSIX is one odd file name, on Windows it is an escape).
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'

export function unsafeReason(name) {
  if (typeof name !== 'string' || name === '') return 'is not a non-empty string'
  if (name.includes('\0')) return 'contains a NUL byte'
  if (name.includes('\\')) return 'contains a backslash'
  if (path.posix.isAbsolute(name) || path.win32.isAbsolute(name) || /^[A-Za-z]:/.test(name))
    return 'is absolute'
  if (name.split('/').includes('..')) return 'has a ".." segment'
  return null
}

// `within` is the trusted anchor when root itself is not: the real path of the result must be inside the real
// path of `within` (default: root), and root may not be a symlink then, so a linked media folder cannot
// carry the files out.
export function joinInside(root, name, { within = root } = {}) {
  const reason = unsafeReason(name)
  if (reason) throw new Error(`file name ${JSON.stringify(name)} ${reason}; it must stay inside ${root}`)
  const base = path.resolve(root)
  const full = path.resolve(base, name)
  if (full === base || !full.startsWith(base + path.sep)) {
    throw new Error(`file name ${JSON.stringify(name)} resolves outside ${root}`)
  }
  // The text is clean; now the disk. A symlinked directory (or file) inside root must not lead out of it.
  const realRoot = realpathExisting(path.resolve(within))
  if (within !== root && isLink(base))
    throw new Error(`${root} is a symlink; file name ${JSON.stringify(name)} is refused`)
  const realProbe = isLink(full) ? null : realpathExisting(full)
  if (realProbe === null) throw new Error(`file name ${JSON.stringify(name)} is a symlink inside ${root}`)
  if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
    throw new Error(`file name ${JSON.stringify(name)} leaves ${within} through a symlink`)
  }
  return full
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

// realpath of the deepest ancestor that exists (the path itself when it does); a dangling link counts as existing
function realpathExisting(p) {
  let probe = p
  while (!existsSync(probe) && !isLink(probe)) probe = path.dirname(probe)
  return realpathSync(probe)
}
