// Addresses of the team's own machines (ssh targets, VPN hosts) are a setting of the machine that
// runs a script, never source: read from the environment, else from a hosts file outside the repo
// so every checkout and worktree on that machine shares it.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HOSTS_FILE = process.env.TRACY_HOSTS_FILE ?? join(homedir(), '.config', 'tracy', 'hosts.env')

function readHostsFile(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    const eq = line.indexOf('=')
    if (!line || line.startsWith('#') || eq < 1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

/** The value of `key`, from `env` first, then the hosts file; throws when neither sets it. */
export function machineHost(key, { env = process.env, file = HOSTS_FILE } = {}) {
  const value = env[key] || readHostsFile(file)[key]
  if (value) return value
  throw new Error(`${key} is not set: export it, or add ${key}=user@host to ${file}`)
}

/** Like machineHost, for a setting that has a public default. */
export function machineSetting(key, fallback, { env = process.env, file = HOSTS_FILE } = {}) {
  return env[key] || readHostsFile(file)[key] || fallback
}
