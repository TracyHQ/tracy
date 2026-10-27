#!/usr/bin/env node
/**
 * Tracy's feed-signing key (src/feed-signature.js): the Ed25519 key publish signs every channel file
 * with, and whose public half every app pins in src/feed-key.js.
 *
 *   node build/feed-key.mjs create [--file <path>]   once, on the iMac: write the private key, print the public key
 *   node build/feed-key.mjs public [--file <path>]   print the public key of the existing private key
 *
 * Default file: ~/TracyHQ/.infra/tracy-feed-ed25519.key (PKCS#8 PEM, chmod 600, outside every repo).
 * The key travels only as a file path — never on a command line, where `ps` would show it. `create`
 * never overwrites: a new key orphans every installed app pinned to the old one.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const { publicKeyText } = require('../src/feed-signature.js')

export const FEED_KEY_FILE = path.join(homedir(), 'TracyHQ/.infra/tracy-feed-ed25519.key')

/**
 * @param {{ file?: string }} [options]
 * @returns {{ file: string, publicKey: string }} `publicKey`: the line to pin in src/feed-key.js.
 */
export function createFeedKey(options = {}) {
  const file = options.file ?? FEED_KEY_FILE
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' })
  try {
    // `wx`: create only; the mode applies at creation, so the key is never readable by others.
    writeFileSync(file, pem, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `${file} already exists — a new key would orphan every app pinned to it; print it with \`public\``
      )
    throw error
  }
  return { file, publicKey: publicKeyText(publicKey) }
}

/**
 * The private key publish signs with. Refused unless only its owner can read the file.
 * @param {{ file?: string }} [options]
 * @returns {import('node:crypto').KeyObject}
 */
export function readFeedSigningKey(options = {}) {
  const file = options.file ?? FEED_KEY_FILE
  let mode
  try {
    mode = statSync(file).mode
  } catch {
    throw new Error(
      `no feed signing key: ${file} does not exist — create it once on the iMac with \`node build/feed-key.mjs create\` and pin the public key it prints in src/feed-key.js`
    )
  }
  if (mode & 0o077) throw new Error(`the feed signing key ${file} is readable by others — chmod 600 it first`)
  let key
  try {
    key = createPrivateKey(readFileSync(file))
  } catch {
    throw new Error(`${file} is not an Ed25519 private key`)
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${file} is not an Ed25519 private key`)
  return key
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    options: { file: { type: 'string' } },
    allowPositionals: true,
    strict: true
  })
  const [command] = positionals
  try {
    if (command === 'create') {
      const { file, publicKey } = createFeedKey({ file: values.file })
      process.stdout.write(
        `wrote ${file} (chmod 600)\npublic key: ${publicKey}\n` +
          `pin it: FEED_PUBLIC_KEYS = Object.freeze(['${publicKey}']) in packages/desktop/tracy-desktop/src/feed-key.js\n`
      )
    } else if (command === 'public') {
      const key = readFeedSigningKey({ file: values.file })
      process.stdout.write(`${publicKeyText(createPublicKey(key))}\n`)
    } else {
      process.stderr.write('usage: feed-key.mjs create|public [--file <path>]\n')
      process.exit(2)
    }
  } catch (error) {
    process.stderr.write(`feed-key: ${error.message}\n`)
    process.exit(1)
  }
}
