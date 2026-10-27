// The transport of the legacy dev E2E suite (tests/e2e-dev), moved from "the dev host over ssh,
// https and secure cookies" to "a local stand over docker exec and plain http".
//
// Rule: the journeys' assertions are NOT touched. Only the three places where the suite reaches
// the outside world are changed, each by an exact, checked source patch applied while the module
// loads (adapter/hooks.mjs):
//   dev.mjs      `ssh(...)` → run the same fixed, validated command line on this machine, with
//                `sudo ` dropped (the stand's docker needs none)
//   browser.mjs  the session cookie is written for the stand's origin, not Secure
//   J11          the Origin of its CSRF probe carries the stand's scheme and port, not https
// A patch that does not apply exactly once makes the adapter refuse the branch (TEST_INVALID),
// never run it half-changed. Every applied patch is recorded with the sha256 of the original file
// and of the patched text (provenance.json).

import { createHash } from 'node:crypto'

/**
 * @typedef {{ id: string, file: RegExp, find: RegExp, replace: string, prepend?: string, why: string }} Patch
 */

/** @type {Patch[]} */
export const PATCHES = [
  {
    id: 'dev-exec-local',
    file: /tests\/e2e-dev\/lib\/dev\.mjs$/,
    find: /spawn\(\s*'ssh',\s*\[[\s\S]*?\],\s*\{ stdio: \['pipe', 'pipe', 'pipe'\] \}\s*\)/,
    replace: "spawn('/bin/sh', ['-c', qaLocalCommand(command)], { stdio: ['pipe', 'pipe', 'pipe'] })",
    prepend: `
// ── qa-flows transport patch: the dev host's ssh becomes a local shell ─────────────────────────
function qaLocalCommand(command) {
  // The commands are fixed templates over validated pieces (see devExec). The stand's docker
  // needs no sudo; the dev host's health script has no local twin and is refused loudly.
  if (/check-server\\.sh/.test(command)) return 'echo "no local equivalent of the dev health script" >&2; exit 127'
  return command.replace(/\\bsudo /g, '')
}
`,
    why: 'ssh to the dev host → local docker exec on the stand'
  },
  {
    id: 'dev-em-label-pool',
    file: /tests\/e2e-dev\/lib\/dev\.mjs$/,
    find: /label\.startsWith\(`\$\{ENV\.sitePrefix\}e2e\$\{runId\}`\)/,
    replace: "label.startsWith('tchqa-')",
    why: "a run's site labels are slots of the owned pool, not e2e<runId>…"
  },
  {
    id: 'browser-cookie-local',
    file: /tests\/e2e-dev\/lib\/browser\.mjs$/,
    find: /domain: ENV\.cookieDomain,\s*path: '\/',\s*secure: true,/,
    replace: 'url: ENV.origin,\n        secure: false,',
    why: 'the stand answers plain http on one host; a Secure cookie for the dev domain would never be sent'
  },
  {
    id: 'j11-origin-scheme',
    file: /tests\/e2e-dev\/journeys\/J11\.test\.mjs$/,
    find: /const bOrigin = `https:\/\/\$\{addressLabel\(labelB\)\}\.\$\{ENV\.siteDomain\}`/,
    replace: 'const bOrigin = siteOrigin(addressLabel(labelB))',
    prepend: "import { siteOrigin } from '../lib/env.mjs'\n",
    why: 'the Origin a customer site sends carries the stand scheme and port'
  }
]

export class TransportPatchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TransportPatchError'
  }
}

const sha = (s) => createHash('sha256').update(s).digest('hex')

/**
 * Apply every patch that targets `file` to `source`.
 * @param {string} file - path with forward slashes
 * @param {string} source
 * @param {Patch[]} [patches]
 * @returns {{ source: string, applied: { id: string, originalSha256: string, patchedSha256: string }[] }}
 */
export function applyPatches(file, source, patches = PATCHES) {
  let out = source
  const applied = []
  for (const patch of patches) {
    if (!patch.file.test(file)) continue
    const hits = [...out.matchAll(new RegExp(patch.find.source, `${patch.find.flags.replace('g', '')}g`))]
    if (hits.length !== 1)
      throw new TransportPatchError(
        `patch ${patch.id} matches ${hits.length} time(s) in ${file} (need exactly 1): the legacy suite changed; branch is TEST_INVALID`
      )
    const before = out
    out = out.replace(patch.find, () => patch.replace)
    if (patch.prepend) out = insertAfterImports(out, patch.prepend)
    applied.push({ id: patch.id, originalSha256: sha(before), patchedSha256: sha(out) })
  }
  return { source: out, applied }
}

/** Put `text` after the last top-level import so the module stays valid ESM. */
function insertAfterImports(source, text) {
  const imports = [...source.matchAll(/^import\b[\s\S]*?['"][^'"\n]+['"];?[ \t]*\n/gm)]
  if (imports.length === 0) return text + source
  const last = imports.at(-1)
  const at = last.index + last[0].length
  return source.slice(0, at) + text + source.slice(at)
}
