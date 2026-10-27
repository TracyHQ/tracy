#!/usr/bin/env node
/**
 * Tracy Cowork for Windows and Linux: stage a self-contained app folder, then let electron-builder make
 * the installers from it. The Mac app is NOT built here — `build/package.sh` stays its only path.
 *
 * WHY TWO STEPS. `package.sh` explains why nothing packages straight from this pnpm tree: tools that
 * walk `node_modules` break on it. The cure is the same here: `stage` writes a folder that holds the
 * app and nothing else (`src/` with the bundled window shell and updater, a package.json without
 * dependencies, the pinned origin), so electron-builder never sees the workspace. The staged folder is
 * plain JavaScript and the same for every OS: CI stages once on Linux, where the dsh submodule and the
 * workspace live, and packs it on the Windows and Linux runners, which need neither.
 *
 *   node build/package-win-linux.mjs stage <out>
 *   node build/package-win-linux.mjs pack <stage> --platform win|linux [--arch x64,arm64] [--out <dir>]
 *   node build/package-win-linux.mjs info <stage> <installers dir> --sha <sha> --build-id <id> --release-date <iso>
 *
 * `stage` reads the same switches as `package.sh`: TRACY_DESKTOP_ORIGIN (default the production origin;
 * the origin picks the variant and its feed, build/update-channel.cjs) and TRACY_DESKTOP_VERSION
 * (default package.json's), and TRACY_DESKTOP_UPDATE_FEED (a test feed instead of the channel's own);
 * TRACY_DESKTOP_RELEASE_NOTES (a file: the release's frozen notes → `resources/release-notes.txt`) and
 * TRACY_DESKTOP_DOCS_ORIGIN, as package.sh reads them.
 * LOCAL mode (an empty origin) is Mac only and refused here.
 *
 * `pack` needs electron-builder and @electron/fuses — the versions in the lockfile. It loads them from
 * TRACY_PACK_TOOLS (a folder with its own node_modules; CI installs the two there with npm), else from
 * this package, else from the dsh desktop app in the submodule, which already depends on both.
 * `stage` draws the icons with rsvg-convert or sips, else with @resvg/resvg-js from the same places.
 *
 * `info` writes the build record a release run hands to `build/release.mjs prepare` (`buildInfo`).
 *
 * Unsigned, on purpose (tasks/todo-desktop-windows.md §2 D1). electron-builder publishes nothing:
 * `app-update.yml` is staged by us so the installed app knows its channel and feed.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { writeBundleNotes } from './release-notes-page.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const require = createRequire(import.meta.url)
const updateChannel = require('./update-channel.cjs')

const PRODUCTION_ORIGIN = 'https://cowork.tracy.ai'

/**
 * The three variants, the same three `package.sh` builds on the Mac (keep the names and ids in step
 * with it). The NSIS GUID is how Windows keys an install: an update or a reinstall with the same GUID
 * replaces the app in place, a new GUID installs a second copy. Fixed per variant, never regenerated.
 */
const VARIANTS = Object.freeze({
  stable: {
    productName: 'Tracy Cowork',
    appId: 'ai.tracy.cowork',
    linuxExecutable: 'tracy-cowork',
    nsisGuid: 'e6436d31-4d91-46c7-bcda-6291575eeda0',
    iconSvg: 'icon.svg'
  },
  dev: {
    productName: 'Tracy Cowork Dev',
    appId: 'ai.tracy.cowork.dev',
    linuxExecutable: 'tracy-cowork-dev',
    nsisGuid: '134792f0-a5a3-4249-a071-119b673258d1',
    iconSvg: 'icon-dev.svg'
  },
  preview: {
    productName: 'Tracy Cowork Preview',
    appId: 'ai.tracy.cowork.preview',
    linuxExecutable: 'tracy-cowork-preview',
    nsisGuid: '3d569d6a-e25d-47be-9fa9-4ee2fabca154',
    iconSvg: 'icon-dev.svg'
  }
})

/**
 * Everything about one build that follows from its origin and version.
 * @param {{ origin: string, version: string }} input
 */
export function packagingPlan({ origin, version, feed }) {
  const pinned = String(origin ?? '').replace(/\/+$/, '')
  if (!/^https?:\/\/[^/?#\s]+$/.test(pinned))
    throw new Error(`origin must look like https://cowork.tracy.ai (LOCAL mode is Mac only), got: ${origin}`)
  if (!/^\d+\.\d+\.\d+(-dev\.\d+)?$/.test(version))
    throw new Error(`version must be X.Y.Z or X.Y.Z-dev.N, got: ${version}`)
  const channel = updateChannel.channelForOrigin(pinned)
  const variant = channel ?? 'preview'
  if (channel === 'stable' && version.includes('-dev.'))
    throw new Error(`${version} is a dev version; a stable build takes X.Y.Z only`)
  // A test feed (a private stand's update door) replaces the channel's own, as TRACY_DESKTOP_UPDATE_FEED
  // does for package.sh; a Preview has no channel, so nothing to point elsewhere.
  if (feed !== undefined && feed !== null && feed !== '') {
    if (channel === null) throw new Error('a Preview never updates itself: it takes no feed')
    if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(feed)) throw new Error(`update feed must be a URL, got: ${feed}`)
  }
  return {
    variant,
    origin: pinned,
    version,
    channel,
    feed: channel === null ? null : feed ? feed.replace(/\/+$/, '') : updateChannel.feedFor(channel),
    ...VARIANTS[variant]
  }
}

/**
 * The files `pack` leaves for one OS and arch, in the form a release names them.
 * @param {ReturnType<typeof packagingPlan>} plan
 * @param {'win' | 'linux'} os
 * @param {'x64' | 'arm64'} arch
 */
export function artifactNames(plan, os, arch) {
  const base = `${plan.productName.replaceAll(' ', '-')}-${plan.version}-${os}-${arch}`
  return os === 'win' ? [`${base}-setup.exe`] : [`${base}.AppImage`, `${base}.deb`]
}

/** The platforms and archs one release run packs, in the order the record lists them. */
const RELEASE_SET = Object.freeze(
  ['win', 'linux'].flatMap((os) => ['x64', 'arm64'].map((arch) => ({ os, arch })))
)

/**
 * Which run built a record: the GitHub Actions run (its id, attempt and trigger — prepare binds the
 * run's draft release to them), or `manual` when `info` runs outside Actions (installers packed by hand
 * in the pinned builder image, runbook §4 ②c; prepare takes those for a real store only with a reason).
 * @param {Record<string, string | undefined>} env
 */
export function buildRun(env) {
  const inActions = Boolean(env.GITHUB_RUN_ID)
  return {
    id: env.GITHUB_RUN_ID ?? null,
    attempt: env.GITHUB_RUN_ATTEMPT ?? null,
    url: inActions
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null,
    trigger: inActions ? (env.GITHUB_EVENT_NAME ?? null) : 'manual',
    ref: env.GITHUB_REF_NAME ?? null,
    runner: env.RUNNER_NAME ?? env.TRACY_MANUAL_RUNNER ?? null,
    onOrigin: env.TRACY_RELEASE_ON_ORIGIN || null
  }
}

/**
 * What one release run built, for `build/release.mjs prepare` to check before it uploads anything
 * (`build-info.json`, a workflow artifact of its own): the sha and candidate it was asked for, the
 * Electron and lockfile it was built with, and every installer with its sha512 (base64, as a channel
 * file says it) and size. All six files or none: a missing one throws.
 * @param {{ plan: ReturnType<typeof packagingPlan>, dir: string, sha: string, buildId: string, releaseDate: string,
 *   electronVersion?: string, lockfileSha256?: string, run: object }} input
 */
export function buildInfo({ plan, dir, sha, buildId, releaseDate, electronVersion, lockfileSha256, run }) {
  const files = []
  const missing = []
  for (const { os, arch } of RELEASE_SET)
    for (const name of artifactNames(plan, os, arch)) {
      const file = path.join(dir, name)
      if (!existsSync(file)) {
        missing.push(name)
        continue
      }
      const body = readFileSync(file)
      files.push({
        name,
        platform: os,
        arch,
        kind: name.endsWith('.exe') ? 'exe' : name.endsWith('.deb') ? 'deb' : 'AppImage',
        sha512: createHash('sha512').update(body).digest('base64'),
        size: body.length
      })
    }
  if (missing.length > 0) throw new Error(`build record: installers missing: ${missing.join(', ')}`)
  return {
    schema: 1,
    sha,
    variant: plan.variant,
    version: plan.version,
    buildId,
    releaseDate,
    origin: plan.origin,
    feed: plan.feed,
    electronVersion: electronVersion ?? null,
    lockfileSha256: lockfileSha256 ?? null,
    run,
    files
  }
}

/**
 * An .ico holding each PNG as is (PNG-in-ICO, read by Windows since Vista). Windows wants a 256 entry
 * for the large icons, so pass 16…256.
 * @param {Buffer[]} pngs
 * @returns {Buffer}
 */
export function icoFromPngs(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const directory = Buffer.alloc(16 * pngs.length)
  let offset = header.length + directory.length
  pngs.forEach((png, i) => {
    if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47 || png.toString('latin1', 12, 16) !== 'IHDR')
      throw new Error(`icon ${i} is not a PNG`)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    const entry = 16 * i
    directory[entry] = width >= 256 ? 0 : width
    directory[entry + 1] = height >= 256 ? 0 : height
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, directory, ...pngs])
}

/**
 * Rasterise the icon: `rsvg-convert` (librsvg2-bin), else macOS `sips`, else `@resvg/resvg-js` from
 * TRACY_PACK_TOOLS. The last one is what CI uses: the self-hosted runners carry neither tool and the
 * job has no root to install one (tracy-runners `runner/Dockerfile`), while npm puts resvg's prebuilt
 * binary in the tools folder next to electron-builder.
 * @param {string} svg
 * @param {number} size
 * @param {string} out
 * @param {() => { Resvg: new (svg: Buffer, options: object) => { render(): { asPng(): Buffer } } }} [loadResvg]
 */
export function renderPng(svg, size, out, loadResvg = () => requireTool('@resvg/resvg-js')) {
  const missing = (error) => error.code === 'ENOENT'
  try {
    execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, svg], { stdio: 'pipe' })
    return
  } catch (error) {
    if (!missing(error)) throw error
  }
  try {
    execFileSync('sips', ['-s', 'format', 'png', '-Z', String(size), svg, '--out', out], { stdio: 'pipe' })
    return
  } catch (error) {
    if (!missing(error)) throw error
  }
  const { Resvg } = loadResvg()
  writeFileSync(out, new Resvg(readFileSync(svg), { fitTo: { mode: 'width', value: size } }).render().asPng())
}

/** @param {string} out */
function stage(out) {
  const plan = packagingPlan({
    origin: process.env.TRACY_DESKTOP_ORIGIN ?? PRODUCTION_ORIGIN,
    version:
      process.env.TRACY_DESKTOP_VERSION ||
      JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf8')).version,
    feed: process.env.TRACY_DESKTOP_UPDATE_FEED
  })
  rmSync(out, { recursive: true, force: true })
  const app = path.join(out, 'app')
  mkdirSync(app, { recursive: true })

  // The window shell and electron-updater, bundled into src/generated/ from shell/ and the submodule.
  execFileSync(process.execPath, [path.join(HERE, 'build-shell.mjs')], { stdio: 'inherit' })
  // Not src/native/: the macOS notification permission addon (build/build-native.sh) has no use here.
  const macOnly = path.join(PKG, 'src', 'native')
  cpSync(path.join(PKG, 'src'), path.join(app, 'src'), {
    recursive: true,
    filter: (source) => source !== macOnly && !source.startsWith(`${macOnly}${path.sep}`)
  })
  writeFileSync(
    path.join(app, 'package.json'),
    `${JSON.stringify(
      {
        // The .deb package name: one per variant, so Dev and the production app install side by side.
        name: plan.linuxExecutable,
        productName: plan.productName,
        version: plan.version,
        description: 'Tracy Cowork desktop app',
        author: { name: 'Tracy' },
        license: 'UNLICENSED',
        homepage: 'https://tracy.ai',
        main: 'src/main.js'
      },
      null,
      2
    )}\n`
  )
  writeFileSync(path.join(app, 'origin'), `${plan.origin}\n`)

  const resources = path.join(out, 'resources')
  mkdirSync(resources, { recursive: true })
  if (plan.channel !== null) {
    writeFileSync(path.join(app, 'update-channel'), `${plan.channel}\n`)
    writeFileSync(
      path.join(resources, 'app-update.yml'),
      updateChannel.appUpdateYml({ channel: plan.channel, url: plan.feed })
    )
    // The build's own notes, as package.sh writes them on a Mac (build/release-notes-page.mjs):
    // TRACY_DESKTOP_RELEASE_NOTES names the file of notes the release froze.
    const notesFile = process.env.TRACY_DESKTOP_RELEASE_NOTES
    writeBundleNotes(resources, {
      version: plan.version,
      channel: plan.channel,
      notes: notesFile ? readFileSync(notesFile, 'utf8') : undefined,
      docsOrigin: process.env.TRACY_DESKTOP_DOCS_ORIGIN || undefined
    })
  }

  // Icons from the same drawing the Mac app uses: an .ico for Windows, a PNG set for Linux.
  const svg = path.join(HERE, plan.iconSvg)
  const pngDir = path.join(out, 'icons', 'png')
  mkdirSync(pngDir, { recursive: true })
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  for (const size of sizes) renderPng(svg, size, path.join(pngDir, `${size}x${size}.png`))
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(
    path.join(out, 'icons', 'icon.ico'),
    icoFromPngs(icoSizes.map((size) => readFileSync(path.join(pngDir, `${size}x${size}.png`))))
  )

  writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
  process.stdout.write(
    `stage: ${plan.productName} ${plan.version} → ${plan.origin} (channel ${plan.channel ?? 'none'}) in ${out}\n`
  )
}

/** Where a packaging tool may be installed: TRACY_PACK_TOOLS, this package, the dsh desktop app (header). */
function toolBases() {
  return [
    process.env.TRACY_PACK_TOOLS,
    PKG,
    path.resolve(PKG, '../../../vendor/tracy/deepseek-harness/apps/desktop')
  ].filter(Boolean)
}

/** A CommonJS packaging tool, loaded synchronously (see toolBases). */
function requireTool(name) {
  for (const base of toolBases()) {
    try {
      return createRequire(path.join(base, 'package.json'))(name)
    } catch {}
  }
  throw new Error(`cannot load ${name} — install it into TRACY_PACK_TOOLS (see this file's header)`)
}

/** Load a packaging tool (see toolBases). */
async function loadTool(name) {
  for (const base of toolBases()) {
    try {
      const resolved = createRequire(path.join(base, 'package.json')).resolve(name)
      return await import(pathToFileURL(resolved).href)
    } catch {}
  }
  throw new Error(`cannot load ${name} — install it into TRACY_PACK_TOOLS (see this file's header)`)
}

/**
 * The electron-builder configuration for one staged app.
 * @param {ReturnType<typeof packagingPlan>} plan
 * @param {string} stageDir
 * @param {string} outDir
 * @param {(context: { appOutDir: string, electronPlatformName: string }) => Promise<void>} afterPack
 */
export function builderConfig(plan, stageDir, outDir, afterPack) {
  const dashed = plan.productName.replaceAll(' ', '-')
  const icons = path.join(stageDir, 'icons')
  // Everything stage put in resources/: the feed file and the build's own notes (release-notes-page.mjs).
  const resources = ['app-update.yml', 'release-notes.txt', 'release-notes.json']
    .map((name) => ({ from: path.join(stageDir, 'resources', name), to: name }))
    .filter(({ from }) => existsSync(from))
  return {
    appId: plan.appId,
    productName: plan.productName,
    electronVersion: require('../package.json').devDependencies.electron,
    // The staged app is the project: electron-builder looks for node_modules from here only, never in
    // the workspace (without it, it searches the current directory — this package's pnpm tree).
    directories: { output: outDir, buildResources: icons },
    // A plain `resources/app/` folder like the Mac bundle: fuses.mjs leaves the asar fuses alone for that.
    asar: false,
    npmRebuild: false,
    nodeGypRebuild: false,
    extraResources: resources,
    // No feed yet (W3); with `publish` set electron-builder would write its own app-update.yml.
    publish: null,
    afterPack,
    // The AppImage runtime: the default (legacy, 0.0.0) arm64 runtime links an unversioned `libz.so`,
    // which a stock Ubuntu 24.04 does not have — measured 10/10/2026 on the arm64 test VM, the AppImage
    // died at once with "libz.so: cannot open shared object file". 1.0.3 is the static 2025-11 runtime
    // (Cherry Studio pins the same).
    toolsets: { appimage: '1.0.3' },
    win: {
      executableName: plan.productName,
      icon: path.join(icons, 'icon.ico'),
      target: ['nsis'],
      // Unsigned (D1). `signAndEditExecutable` still runs rcedit: icon and version info in the .exe.
      signAndEditExecutable: true
    },
    nsis: {
      // Per-user, one click: installs to %LOCALAPPDATA%\Programs without asking for elevation.
      oneClick: true,
      perMachine: false,
      guid: plan.nsisGuid,
      deleteAppDataOnUninstall: false,
      artifactName: `${dashed}-\${version}-win-\${arch}-setup.\${ext}`,
      shortcutName: plan.productName,
      uninstallDisplayName: plan.productName,
      createStartMenuShortcut: true,
      createDesktopShortcut: true,
      buildUniversalInstaller: false,
      differentialPackage: false
    },
    linux: {
      executableName: plan.linuxExecutable,
      icon: path.join(icons, 'png'),
      target: ['AppImage', 'deb'],
      category: 'Office',
      maintainer: 'Tracy',
      synopsis: plan.productName,
      artifactName: `${dashed}-\${version}-linux-\${arch}.\${ext}`,
      desktop: {
        entry: {
          Name: plan.productName,
          // Electron names every window's class after the app name (src/platform.js `wmClass`), so the
          // dock ties a running window to this launcher only when this is the product name exactly.
          // No `desktopName` in the staged package.json: it would rename the class (electron-builder warns).
          StartupWMClass: plan.productName
        }
      }
    }
  }
}

/** @param {string} stageDir @param {{ platform: string, arch: string[], out: string }} options */
async function pack(stageDir, { platform, arch, out }) {
  const plan = JSON.parse(readFileSync(path.join(stageDir, 'plan.json'), 'utf8'))
  const builder = await loadTool('electron-builder')
  const { flipRequiredFuses, fuseProblems, readAppFuses } = await import('./fuses.mjs')
  const fusesModule = await loadTool('@electron/fuses')
  const { Platform, Arch } = builder
  const binaryOf = (context) =>
    path.join(
      context.appOutDir,
      context.electronPlatformName === 'win32' ? `${plan.productName}.exe` : plan.linuxExecutable
    )
  // Fuses before rcedit and before the installer is made (electron-builder calls afterPack first).
  const binaries = []
  const afterPack = async (context) => {
    binaries.push(binaryOf(context))
    await flipRequiredFuses(binaryOf(context), fusesModule)
    process.stdout.write(`pack: fuses hardened in ${binaryOf(context)}\n`)
  }
  // 🔒 The NSIS payload's executables must be packed with the plain BCJ filter. On a Windows host 7-Zip
  // picks BCJ2 for .exe/.dll, which the installer's 7z plugin cannot unpack — and it SKIPS those files
  // without failing: measured 10/10/2026 on Windows 11 ARM, `/S` exited 0 and the install folder had
  // every .pak and no `Tracy Cowork.exe`, no DLL. Cherry Studio sets the same variable in its release job.
  if (platform === 'win') process.env.ELECTRON_BUILDER_7Z_FILTER ??= 'BCJ'
  const target = platform === 'win' ? Platform.WINDOWS : Platform.LINUX
  const targets = target.createTarget(
    platform === 'win' ? ['nsis'] : ['AppImage', 'deb'],
    ...arch.map((a) => Arch[a])
  )
  const files = await builder.build({
    targets,
    projectDir: path.join(stageDir, 'app'),
    config: builderConfig(plan, stageDir, out, afterPack),
    publish: 'never'
  })

  // Read back what went into the installers: rcedit rewrites the .exe after afterPack.
  for (const binary of binaries) {
    const problems = fuseProblems(readAppFuses(binary))
    if (problems.length > 0) throw new Error(`pack: ${binary}: ${problems.join('; ')}`)
    process.stdout.write(`pack: fuses still hardened in the packed ${path.basename(path.dirname(binary))}\n`)
  }

  // electron-builder spells some archs its own way (x86_64, amd64); rename to what the release expects.
  const expected = arch.flatMap((a) => artifactNames(plan, platform, a))
  for (const file of files) {
    const name = path.basename(file)
    const ext = name.endsWith('.AppImage') ? '.AppImage' : path.extname(name)
    if (!['.exe', '.AppImage', '.deb'].includes(ext) || expected.includes(name)) continue
    const fixed = name.replace(
      /-(x86_64|amd64|aarch64)(?=[.-])/,
      (_, a) => `-${a === 'aarch64' ? 'arm64' : 'x64'}`
    )
    if (fixed !== name) renameSync(file, path.join(path.dirname(file), fixed))
  }
  const present = new Set(readdirSync(out))
  const missing = expected.filter((name) => !present.has(name))
  for (const name of expected.filter((n) => present.has(n)))
    process.stdout.write(`pack: ${path.join(out, name)}\n`)
  if (missing.length > 0) throw new Error(`pack: expected files missing: ${missing.join(', ')}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir, ...rest] = process.argv.slice(2)
  const option = (name, fallback) => {
    const at = rest.indexOf(`--${name}`)
    return at === -1 ? fallback : rest[at + 1]
  }
  try {
    if (command === 'stage' && dir) stage(path.resolve(dir))
    else if (command === 'info' && dir && rest[0] && !rest[0].startsWith('--')) {
      // node build/package-win-linux.mjs info <stage> <installers dir> --sha <sha> --build-id <id> --release-date <iso>
      const plan = JSON.parse(readFileSync(path.join(path.resolve(dir), 'plan.json'), 'utf8'))
      const env = process.env
      const info = buildInfo({
        plan,
        dir: path.resolve(rest[0]),
        sha: option('sha'),
        buildId: option('build-id'),
        releaseDate: option('release-date'),
        electronVersion: JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf8')).devDependencies
          .electron,
        lockfileSha256: createHash('sha256')
          .update(readFileSync(path.resolve(PKG, '../../../pnpm-lock.yaml')))
          .digest('hex'),
        run: buildRun(env)
      })
      process.stdout.write(`${JSON.stringify(info, null, 2)}\n`)
    } else if (command === 'pack' && dir) {
      const platform = option('platform')
      if (platform !== 'win' && platform !== 'linux') throw new Error('pack: --platform must be win or linux')
      const arch = option('arch', 'x64,arm64').split(',')
      if (arch.some((a) => a !== 'x64' && a !== 'arm64'))
        throw new Error('pack: --arch takes x64 and/or arm64')
      await pack(path.resolve(dir), {
        platform,
        arch,
        out: path.resolve(option('out', path.join(PKG, 'dist', platform)))
      })
    } else {
      process.stderr.write(
        'usage: package-win-linux.mjs stage <out> | pack <stage> --platform win|linux [--arch x64,arm64] [--out dir]\n' +
          '       | info <stage> <installers dir> --sha <sha> --build-id <id> --release-date <iso>\n'
      )
      process.exit(2)
    }
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exit(1)
  }
}
