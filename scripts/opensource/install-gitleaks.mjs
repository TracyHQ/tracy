#!/usr/bin/env node
// Downloads the pinned gitleaks into scripts/opensource/.bin (gitignored), checking its SHA-256.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GITLEAKS_VERSION = '8.28.0'

// From gitleaks_8.28.0_checksums.txt on the GitHub release.
const ASSETS = {
  'darwin-arm64': ['darwin_arm64.tar.gz', 'd942f3ad147250c9edbaab3fed9e482f98d3b59ba10ae97b8d75647e3ade492c'],
  'darwin-x64': ['darwin_x64.tar.gz', 'edf5a507008b0d2ef4959575772772770586409c1f6f74dabf19cbe7ec341ced'],
  'linux-x64': ['linux_x64.tar.gz', 'a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb'],
  'linux-arm64': ['linux_arm64.tar.gz', 'eff65261156100e5d94a6b3dec313d532fddfe19ae1590bf7a2b4f2699128356'],
  'win32-x64': ['windows_x64.zip', 'da6458e8864af553807de1c46a7a8eac0880bd6b99ba56288e87e86a45af884f']
}

export const BIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '.bin')
export const GITLEAKS_PATH = join(BIN_DIR, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks')

async function install() {
  const asset = ASSETS[`${process.platform}-${process.arch}`]
  if (!asset) throw new Error(`no pinned gitleaks build for ${process.platform}-${process.arch}`)
  const [suffix, sha256] = asset
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${suffix}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`)
  const body = Buffer.from(await res.arrayBuffer())
  const got = createHash('sha256').update(body).digest('hex')
  if (got !== sha256) throw new Error(`checksum mismatch for ${suffix}: ${got}`)
  const work = mkdtempSync(join(tmpdir(), 'gitleaks-'))
  try {
    const archive = join(work, suffix)
    writeFileSync(archive, body)
    // bsdtar (macOS, Windows 10+) and GNU tar both read .tar.gz; bsdtar also reads .zip.
    execFileSync('tar', ['-xf', archive, '-C', work])
    mkdirSync(BIN_DIR, { recursive: true })
    copyFileSync(join(work, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'), GITLEAKS_PATH)
    chmodSync(GITLEAKS_PATH, 0o755)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  return GITLEAKS_PATH
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (existsSync(GITLEAKS_PATH) && !process.argv.includes('--force')) {
    console.log(`gitleaks already at ${GITLEAKS_PATH}`)
  } else {
    console.log(`installed gitleaks ${GITLEAKS_VERSION} at ${await install()}`)
  }
}
