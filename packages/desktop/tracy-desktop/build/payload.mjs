/**
 * The app inside a Windows installer (`.exe`) or a Linux `.AppImage` / `.deb`, for the release
 * preflight (build/release-preflight.mjs `checkPayload`). These builds are not code-signed (decision
 * D1), so what publish can check is what the app IS: its version, the arch of its main binary (not the
 * installer's bootstrapper), its fuses, and the origin, channel and feed it is pinned to.
 *
 *   extractPayload(artifact)  unpack it into a temp folder; null where this machine has no unpacker
 *   readPayload(root)         the facts of the unpacked app, found by its `resources/app-update.yml`
 *
 * Unpackers (none ships with macOS except bsdtar):
 *   .deb       bsdtar (macOS, libarchive) — the `data.tar.*` member is the installed tree
 *   .AppImage  unsquashfs (`brew install squashfs`) at the offset where the runtime ELF ends
 *   .exe       7zz / 7z (`brew install sevenzip`) — the NSIS installer, then each app archive inside it
 *              (`$PLUGINSDIR/app-*.7z`, electron-builder's layout)
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { electronBinaryIn, readFuseWires } from './fuses.mjs'
import { debugGuardFirst } from './release-preflight.mjs'

const require = createRequire(import.meta.url)
const updateChannel = require('./update-channel.cjs')

/** What unpacks each kind, for the "cannot unpack here" line. */
export const UNPACK_TOOL = Object.freeze({
  exe: '7zz or 7z — brew install sevenzip',
  AppImage: 'unsquashfs — brew install squashfs',
  deb: 'bsdtar'
})

/** PE `Machine` and ELF `e_machine` values of the archs Tracy ships. */
const PE_MACHINE = { 0x8664: 'x64', 0xaa64: 'arm64' }
const ELF_MACHINE = { 62: 'x64', 183: 'arm64' }

/**
 * The arch of a Windows (PE) or Linux (ELF) binary, from its header.
 * @param {Buffer} bytes
 * @returns {string | null} `x64`, `arm64`, `machine 0x…` for another one, null when not PE or ELF.
 */
export function binaryArch(bytes) {
  if (bytes.length >= 0x40 && bytes.toString('latin1', 0, 2) === 'MZ') {
    const at = bytes.readUInt32LE(0x3c)
    if (at + 6 > bytes.length || bytes.toString('latin1', at, at + 4) !== 'PE\0\0') return null
    const machine = bytes.readUInt16LE(at + 4)
    return PE_MACHINE[machine] ?? `machine 0x${machine.toString(16)}`
  }
  if (bytes.length >= 0x14 && bytes.readUInt32BE(0) === 0x7f454c46) {
    const machine = bytes[5] === 2 ? bytes.readUInt16BE(0x12) : bytes.readUInt16LE(0x12)
    return ELF_MACHINE[machine] ?? `machine 0x${machine.toString(16)}`
  }
  return null
}

/**
 * Where an AppImage's squashfs starts: the end of the runtime ELF, which is the end of its section
 * header table (`e_shoff + e_shentsize * e_shnum`, what `--appimage-offset` prints).
 * @param {Buffer} bytes - at least the first 64 bytes of the AppImage.
 */
export function appImageOffset(bytes) {
  if (bytes.length < 0x40 || bytes.readUInt32BE(0) !== 0x7f454c46) throw new Error('not an ELF file')
  if (bytes[4] !== 2) throw new Error('not a 64-bit ELF')
  const le = bytes[5] === 1
  const shoff = le ? bytes.readBigUInt64LE(0x28) : bytes.readBigUInt64BE(0x28)
  const shentsize = le ? bytes.readUInt16LE(0x3a) : bytes.readUInt16BE(0x3a)
  const shnum = le ? bytes.readUInt16LE(0x3c) : bytes.readUInt16BE(0x3c)
  return Number(shoff) + shentsize * shnum
}

/** Is `command` on this machine? */
function onPath(command) {
  return spawnSync(command, ['--help'], { stdio: 'ignore' }).error === undefined
}

/**
 * The unpackers a Windows/Linux preflight needs that this machine lacks, each with how to get it — the
 * check a publishing machine runs before anything else (`node build/release.mjs tools`).
 * @param {(command: string) => boolean} [has]
 * @returns {{ tool: string, hint: string }[]}
 */
export function missingUnpackers(has = onPath) {
  const missing = []
  if (!has('7zz') && !has('7z')) missing.push({ tool: '7zz', hint: 'brew install sevenzip' })
  if (!has('unsquashfs')) missing.push({ tool: 'unsquashfs', hint: 'brew install squashfs' })
  if (!has('bsdtar'))
    missing.push({ tool: 'bsdtar', hint: 'part of macOS; on Linux: apt install libarchive-tools' })
  return missing
}

/** Every file under `dir` whose name matches, depth first. */
function findFiles(dir, match, depth = 6) {
  if (depth < 0) return []
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...findFiles(full, match, depth - 1))
    else if (match(entry.name, full)) found.push(full)
  }
  return found
}

/**
 * Unpack a Windows or Linux artifact into a temp folder.
 * @param {{ name: string, platform: 'win' | 'linux', kind: string, body: Buffer }} artifact
 * @param {{ has?: (command: string) => boolean }} [tools] - for tests.
 * @returns {Promise<{ root: string, cleanup: () => void } | null>} null when this machine has no unpacker.
 */
export async function extractPayload({ name, kind, body }, tools = {}) {
  const has = tools.has ?? onPath
  const sevenZip = ['7zz', '7z'].find((c) => has(c))
  if (kind === 'exe' && !sevenZip) return null
  if (kind === 'AppImage' && !has('unsquashfs')) return null
  if (kind === 'deb' && !has('bsdtar')) return null
  if (!['exe', 'AppImage', 'deb'].includes(kind)) throw new Error(`${name}: not a Windows or Linux artifact`)

  const dir = mkdtempSync(path.join(tmpdir(), 'release-payload-'))
  const cleanup = () => rmSync(dir, { recursive: true, force: true })
  const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    const file = path.join(dir, `artifact.${kind}`)
    writeFileSync(file, body)
    const root = path.join(dir, 'root')
    mkdirSync(root)
    if (kind === 'deb') {
      const members = path.join(dir, 'deb')
      mkdirSync(members)
      run('bsdtar', ['-xf', file, '-C', members])
      const data = readdirSync(members).find((n) => n.startsWith('data.tar'))
      if (!data) throw new Error(`${name} has no data.tar member`)
      run('bsdtar', ['-xf', path.join(members, data), '-C', root])
    } else if (kind === 'AppImage') {
      const offset = appImageOffset(body.subarray(0, 0x40))
      rmSync(root, { recursive: true })
      run('unsquashfs', ['-q', '-n', '-d', root, '-o', String(offset), file])
    } else {
      const outer = path.join(dir, 'installer')
      run(sevenZip, ['x', '-y', `-o${outer}`, file])
      // electron-builder's NSIS keeps the app in `$PLUGINSDIR/app-<bits|arch>.7z`; a flat installer has none.
      const inner = findFiles(outer, (n) => /^app.*\.7z$/i.test(n))
      if (inner.length === 0) cpSync(outer, path.join(root, 'app'), { recursive: true })
      for (const archive of inner)
        run(sevenZip, ['x', '-y', `-o${path.join(root, path.basename(archive, '.7z'))}`, archive])
    }
    return { root, cleanup }
  } catch (error) {
    cleanup()
    throw error
  }
}

/**
 * The facts of the app unpacked under `root`: the install folder is the one whose `resources/`
 * holds `app-update.yml` (found at any depth: `opt/<Name>/` in a .deb, the root of an AppImage, a
 * folder of its own in an installer).
 * @param {string} root
 * @returns {{ binary: string, version: string | null, arch: string | null, fuses: object[], origin: string,
 *   updateChannel: string, updateFeed: string, debugGuard: boolean, releaseNotes: string | null,
 *   releaseNotesInfo: { version: string, page: string, docsOrigin: string } | null }}
 */
export function readPayload(root) {
  const configs = findFiles(
    root,
    (n, full) => n === 'app-update.yml' && path.basename(path.dirname(full)) === 'resources'
  )
  if (configs.length === 0) throw new Error(`no resources/app-update.yml under the unpacked artifact`)
  if (configs.length > 1) throw new Error(`more than one app in the unpacked artifact: ${configs.join(', ')}`)
  const resources = path.dirname(configs[0])
  const install = path.dirname(resources)
  const binary = electronBinaryIn(install)
  if (binary === null) throw new Error(`no Electron binary (a file carrying the fuse wire) in ${install}`)
  const bytes = readFileSync(binary)
  const text = (rel) => {
    const file = path.join(resources, rel)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  }
  let version = null
  try {
    version = JSON.parse(text('app/package.json')).version ?? null
  } catch {}
  return {
    binary,
    version,
    arch: binaryArch(bytes),
    fuses: readFuseWires(bytes),
    origin: text('app/origin').trim(),
    updateChannel: text('app/update-channel').trim(),
    updateFeed: updateChannel.feedOf(text('app-update.yml')) ?? '',
    debugGuard: debugGuardFirst(text('app/src/main.js')) && text('app/src/debug-switches.js') !== '',
    // The build's own notes (build/release-notes-page.mjs `writeBundleNotes`); null when it has none.
    releaseNotes: existsSync(path.join(resources, 'release-notes.txt')) ? text('release-notes.txt') : null,
    releaseNotesInfo: (() => {
      try {
        return JSON.parse(text('release-notes.json'))
      } catch {
        return null
      }
    })()
  }
}
