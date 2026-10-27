// Shared by the shard script tests. Run every test from the repository root
// (`node --test scripts/test/<file>.test.mjs`): the scripts under deploy/ and the imports of apps/*
// resolve against it, as pnpm test:workers runs them.
import { execFile, spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

export const R = process.cwd()
export const script = (name) => path.join(R, 'deploy/scripts', name)
export const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0
export const tempDir = (prefix = 'shard-') => mkdtempSync(path.join(tmpdir(), prefix))
// A syntactically valid age X25519 recipient (bech32 charset, 62 characters) that nobody holds.
export const fakeAge = `age1${'q'.repeat(58)}`

export function writeFiles(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return dir
}

export function bash(args, { env = {} } = {}) {
  return spawnSync('bash', args, { env: { ...process.env, ...env }, encoding: 'utf8' })
}

// For tests that serve HTTP from this same process: spawnSync would block the server's event loop.
export async function bashAsync(args, { env = {} } = {}) {
  try {
    const { stdout, stderr } = await promisify(execFile)('bash', args, {
      env: { ...process.env, ...env },
      encoding: 'utf8'
    })
    return { status: 0, stdout, stderr }
  } catch (error) {
    return { status: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

// The shard channel's canonical string, the shard interface contract, section 2, written out here
// independently of every implementation under test (the bash signer, W2's lib/shard-channel.js):
//   <timestamp ms>\n<nonce>\n<METHOD>\n<path without query>\n<sha256hex(body)>
// METHOD is the real one (GET for /_shard/status), unlike the host channel's literal POST.
export function shardCanonical({ timestamp, nonce, method, path: signedPath, body = '' }) {
  const bodyHash = createHash('sha256').update(body).digest('hex')
  return `${timestamp}\n${nonce}\n${method}\n${signedPath}\n${bodyHash}`
}

export const shardSignature = ({ secret, ...input }) =>
  createHmac('sha256', secret).update(shardCanonical(input)).digest('hex')

// The three x-shard-* headers of one request, checked the way the master and the shard check them:
// signature and nonce shape. The clock and replay halves are W1's and W2's to test. A missing header
// answers why 'signature' (contract v1.1 section 2), not a separate 'missing'.
export function verifyShardHeaders({ secret, method, path: signedPath, body = '', headers }) {
  const timestamp = headers['x-shard-timestamp']
  const nonce = headers['x-shard-nonce']
  const signature = headers['x-shard-signature']
  if (!timestamp || !nonce || !signature) return { ok: false, why: 'signature' }
  if (!/^[0-9a-f]{32}$/.test(nonce)) return { ok: false, why: 'nonce' }
  const expected = shardSignature({ secret, timestamp, nonce, method, path: signedPath, body })
  return expected === signature ? { ok: true } : { ok: false, why: 'signature' }
}
