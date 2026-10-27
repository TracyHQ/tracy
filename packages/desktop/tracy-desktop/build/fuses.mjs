#!/usr/bin/env node
/**
 * Electron fuses of a PACKAGED app — switches compiled into `Electron Framework` that no argument or
 * environment variable can turn back on. Stock Electron lets any local process run code AS the signed,
 * notarized app: `ELECTRON_RUN_AS_NODE=1 <app> -e …`, `NODE_OPTIONS=--require …`, or `--inspect` and a
 * debugger (found on the first real dev release, 0.3.0-dev.1, 09/10/2026). A packaged app ships with:
 *
 *   RunAsNode                              off   no `ELECTRON_RUN_AS_NODE`
 *   EnableNodeOptionsEnvironmentVariable   off   no `NODE_OPTIONS`
 *   EnableNodeCliInspectArguments          off   no `--inspect` / `--inspect-brk` / SIGUSR1 inspector
 *   EnableCookieEncryption                 on    cookies encrypted at rest with a key in the login keychain.
 *       Chromium reads a cookie stored unencrypted as it is, so an app updated to this should keep its
 *       session (not measured on an update; a lost one costs one sign-in, which mints a new session).
 *       Turning it off again later WOULD lose every session — so it stays on.
 *
 * Left as Electron ships them, on purpose: EnableEmbeddedAsarIntegrityValidation and OnlyLoadAppFromAsar —
 * this app ships `Contents/Resources/app/` as a plain folder, not an asar, so there is nothing to
 * validate and OnlyLoadAppFromAsar would leave it nothing to load. Source runs (`pnpm dev`, `pnpm debug`)
 * use node_modules' Electron, which this never touches, so `--inspect` keeps working there.
 *
 *   node build/fuses.mjs flip <app, install folder or binary>    harden (build/package.sh, before signing)
 *   node build/fuses.mjs check <app, install folder or binary>   print every wire; exit 1 when not hardened
 *
 * An install folder is an unpacked Windows or Linux app (`<Name>.exe` or the Linux executable at its
 * top, `resources/` beside it): the wire is in that main binary.
 *
 * The reader is this file's own: `@electron/fuses`' `getCurrentFuseWire` reads only the FIRST wire,
 * and a universal binary has one per arch slice. Only `flip` loads `@electron/fuses` (a devDependency
 * present where package.sh runs); the release checks read with plain Node.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Marks the fuse wire in the framework binary: version byte, length byte, then one byte per fuse. */
export const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
const ON = 49
const OFF = 48

/** The fuses this app requires, by their index on the version 1 wire, and the state each must be. */
export const REQUIRED_FUSES = Object.freeze([
  { name: 'RunAsNode', index: 0, on: false },
  { name: 'EnableCookieEncryption', index: 1, on: true },
  { name: 'EnableNodeOptionsEnvironmentVariable', index: 2, on: false },
  { name: 'EnableNodeCliInspectArguments', index: 3, on: false }
])

/**
 * Every fuse wire in a binary, in file order — one per arch slice.
 * @param {Buffer} bytes
 * @returns {{ version: number, states: number[] }[]}
 */
export function readFuseWires(bytes) {
  const wires = []
  for (let at = bytes.indexOf(SENTINEL); at !== -1; at = bytes.indexOf(SENTINEL, at + SENTINEL.length)) {
    const start = at + SENTINEL.length
    const length = bytes[start + 1]
    wires.push({ version: bytes[start], states: [...bytes.subarray(start + 2, start + 2 + length)] })
  }
  return wires
}

/**
 * What keeps these wires from being a hardened app; empty when nothing does.
 * @param {{ version: number, states: number[] }[] | undefined} wires
 * @returns {string[]}
 */
export function fuseProblems(wires) {
  if (wires === undefined) return ['fuses were not read']
  if (wires.length === 0) return ['no fuse wire in the Electron framework binary']
  const problems = []
  wires.forEach((wire, i) => {
    const where = wires.length > 1 ? ` (slice ${i + 1})` : ''
    if (wire.version !== 1) {
      problems.push(`fuse wire version ${wire.version}${where}, this check reads version 1`)
      return
    }
    for (const fuse of REQUIRED_FUSES) {
      const state = wire.states[fuse.index]
      if (state !== (fuse.on ? ON : OFF))
        problems.push(
          `fuse ${fuse.name} is ${state === ON ? 'on' : state === OFF ? 'off' : `state ${state}`}${where}, must be ${fuse.on ? 'on' : 'off'}`
        )
    }
  })
  return problems
}

/**
 * The binary that holds the fuse wire.
 *   an `.app`          its `Electron Framework` (macOS)
 *   another folder     an unpacked Windows or Linux install: the file at its top that carries the wire —
 *                      `<Name>.exe` or the Linux executable (Electron links itself into that binary there,
 *                      no framework); helpers next to it (crashpad, chrome-sandbox) carry none
 *   a file             itself
 * @param {string} target
 */
export function frameworkBinary(target) {
  if (target.endsWith('.app'))
    return path.join(target, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')
  if (!statSync(target).isDirectory()) return target
  const found = electronBinaryIn(target)
  if (found === null)
    throw new Error(`no Electron binary (a file carrying the fuse wire) at the top of ${target}`)
  return found
}

/**
 * The file at the top of `dir` that carries the fuse wire, or null.
 * @param {string} dir
 * @returns {string | null}
 */
export function electronBinaryIn(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(dir, entry.name)
    const bytes = readFileSync(file)
    const magic = bytes.subarray(0, 4)
    const executable =
      magic.subarray(0, 2).toString('latin1') === 'MZ' || magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    if (executable && bytes.includes(SENTINEL)) return file
  }
  return null
}

/** @param {string} target @returns {{ version: number, states: number[] }[]} */
export function readAppFuses(target) {
  return readFuseWires(readFileSync(frameworkBinary(target)))
}

/**
 * Harden the binary in place — every wire (both slices of a universal binary). Run BEFORE signing:
 * it rewrites the framework binary, which voids any signature it had.
 *
 * build/package-win-linux.mjs runs where `@electron/fuses` is not resolvable from build/ (a CI tools
 * folder), so it passes the module it loaded.
 * @param {string} target
 * @param {typeof import('@electron/fuses')} [fuses]
 */
export async function flipRequiredFuses(target, fuses) {
  const { flipFuses, FuseVersion } = fuses ?? (await import('@electron/fuses'))
  const config = { version: FuseVersion.V1 }
  for (const fuse of REQUIRED_FUSES) config[fuse.index] = fuse.on
  // The `.app` itself, not our framework path: @electron/fuses resolves any path containing `.app`
  // relative to Contents/MacOS, so a framework path inside a bundle would point it at the wrong file.
  // A Windows or Linux folder: its main binary (the .exe, the Linux executable) holds the wire.
  await flipFuses(target.endsWith('.app') ? target : frameworkBinary(target), config)
  const problems = fuseProblems(readAppFuses(target))
  if (problems.length > 0) throw new Error(`fuses still not hardened after flipping: ${problems.join('; ')}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, target] = process.argv.slice(2)
  if ((command !== 'flip' && command !== 'check') || !target) {
    process.stderr.write('usage: fuses.mjs flip|check <app, install folder or binary>\n')
    process.exit(2)
  }
  if (command === 'flip') await flipRequiredFuses(target)
  const wires = readAppFuses(target)
  wires.forEach((wire, i) =>
    process.stdout.write(
      `fuses: wire ${i + 1}/${wires.length} v${wire.version} ${REQUIRED_FUSES.map((f) => `${f.name}=${wire.states[f.index] === ON ? 'on' : 'off'}`).join(' ')}\n`
    )
  )
  const problems = fuseProblems(wires)
  for (const p of problems) process.stderr.write(`fuses: ${p}\n`)
  process.exit(problems.length === 0 ? 0 : 1)
}
