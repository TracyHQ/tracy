#!/usr/bin/env node
// Print a one-hour GitHub App installation token scoped to ONE repository — the token a fleet
// host needs to download a quickstart release from a private repo, minted here on the machine
// that holds the App key and never stored on the host (ADR 0023: the fleet holds no App key).
//
//   node scripts/quickstart-token.mjs [owner/repo]        default JoomlArt-Products/ja-products
//
//   ssh root@<fleet-host> 'read -r GITHUB_TOKEN; export GITHUB_TOKEN;
//     /opt/tracy-fleet/provision/emdash/deploy-quickstart.sh tracy-business' \
//     <<< "$(node scripts/quickstart-token.mjs)"
//
// Reads .env.github-app at the repo root (GITHUB_HOST_APP_ID, GITHUB_HOST_APP_PRIVATE_KEY_FILE),
// the same App tracy-web uses to create site repos; the JWT and mint calls are that module's.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { installationIdFor, mintTokenFor } from '../apps/tracy-web/src/github/app.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const env = Object.fromEntries(
  readFileSync(path.join(root, '.env.github-app'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim()))
)
const repo = process.argv[2] ?? 'JoomlArt-Products/ja-products'
const config = {
  appId: env.GITHUB_HOST_APP_ID,
  privateKey: readFileSync(path.resolve(root, env.GITHUB_HOST_APP_PRIVATE_KEY_FILE), 'utf8')
}
const installation = await installationIdFor(config, repo)
if (!installation) {
  console.error(`!! the App is not installed on ${repo}`)
  process.exit(1)
}
const minted = await mintTokenFor(config, installation, repo.split('/')[1])
if (!minted) {
  console.error(`!! could not mint a token for ${repo}`)
  process.exit(1)
}
console.error(`token for ${repo} expires ${minted.expiresAt}`)
process.stdout.write(minted.token)
