import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_BYTES = 1024 * 1024
function readPlain(file, optional = false) {
  if (optional && !existsSync(file)) return null
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('unsafe policy file')
  return readFileSync(file, 'utf8')
}

function replaceConfig(file, text, mode = 0o600) {
  const temporary = `${file}.incoming-${randomUUID()}`
  try {
    writeFileSync(temporary, text, { mode, flag: 'wx' })
    renameSync(temporary, file)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function metadataOf(root, policy, publicOrigin) {
  const file = path.join(root, '.frame-policy.json')
  replaceConfig(file, `${JSON.stringify({ schema: 'tracy-frame-policy/v1', policy, publicOrigin })}\n`)
}

// The zone apex is optional: policies written before it was listed are still Tracy's own, and upgrade.
const managedDefault = (policy) =>
  /^'self' https:\/\/\*\.[a-zA-Z0-9.-]+(?: https:\/\/[a-zA-Z0-9.-]+)? http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*(?: https?:\/\/[^\s;]+)?$/.test(
    policy
  )
/**
 * The EmDash compose with `init: true` under its web service's `restart:` line, where render-compose.sh
 * writes it since 31/10/2026 (#205) and the custody matchers accept it, or the text unchanged when it
 * already has one or is not that form. A file rendered before then gets it at the recreate this job
 * makes anyway, so its next stop is at once instead of after Docker's timeout; nothing else changes.
 * @param {string} compose
 */
export function withInit(compose) {
  if (/^ {4}init: true\r?$/m.test(compose)) return compose
  return compose.replace(
    /^( {2}web:\r?\n {4}image: [^\n]+\n {4}restart: unless-stopped)(\r?\n)/m,
    '$1$2    init: true$2'
  )
}

const docker = (args, options) => execFileSync('docker', args, { timeout: 40_000, stdio: 'pipe', ...options })

/** Called with the site's lifecycle lock held. It never changes CMS content or publish state. */
export function reconcileFramePolicy({ root, label, policy, publicOrigin, run = docker }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new Error('unsafe label')
  const directory = path.join(root, label)
  if (!existsSync(directory)) return { state: 'unmanaged' }
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe site directory')
  const metadata = readPlain(path.join(directory, '.frame-policy.json'), true)
  const previous = metadata ? JSON.parse(metadata) : null
  if (previous && previous.schema !== 'tracy-frame-policy/v1') return { state: 'unmanaged' }
  const apache = path.join(directory, 'apache/tracy-noindex.conf')
  const originals = new Map()
  let current, apply
  if (existsSync(apache)) {
    const parent = lstatSync(path.dirname(apache))
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('unsafe Apache directory')
    const text = readPlain(apache)
    const matches = [
      ...text.matchAll(/^Header always set Content-Security-Policy "frame-ancestors ([^";\n]+)"\r?$/gm)
    ]
    if (matches.length !== 1) return { state: 'unmanaged' }
    current = matches[0][1]
    originals.set(apache, text)
    apply = () => {
      writeFileSync(
        apache,
        text.replace(matches[0][0], `Header always set Content-Security-Policy "frame-ancestors ${policy}"`)
      )
      run(['exec', `${label}-web-1`, 'apache2ctl', '-t'])
      run(['exec', `${label}-web-1`, 'apache2ctl', '-k', 'graceful'])
    }
  } else {
    const envFile = path.join(directory, '.env')
    const env = readPlain(envFile, true)
    if (env === null) return { state: 'unmanaged' }
    const composeFiles = ['docker-compose.yml', 'compose.yml']
      .map((n) => path.join(directory, n))
      .filter(existsSync)
    if (composeFiles.length !== 1) return { state: 'unmanaged' }
    const composeFile = composeFiles[0],
      compose = readPlain(composeFile)
    const setting = /^([ \t]*)TRACY_FRAME_ANCESTORS: "([^"\n]*)"\r?$/m.exec(compose)
    if (!setting) return { state: 'unmanaged' }
    const interpolated = /^\$\{TRACY_FRAME_ANCESTORS(?::-[^}]*)?\}$/.test(setting[2])
    const envSetting = /^TRACY_FRAME_ANCESTORS=(.*)\r?$/m.exec(env)
    if (interpolated && !envSetting) return { state: 'unmanaged' }
    current = interpolated ? envSetting[1].replace(/^"(.*)"$/, '$1') : setting[2]
    originals.set(envFile, env)
    originals.set(composeFile, compose)
    apply = () => {
      if (interpolated) {
        replaceConfig(envFile, env.replace(envSetting[0], `TRACY_FRAME_ANCESTORS="${policy}"`))
        if (withInit(compose) !== compose) replaceConfig(composeFile, withInit(compose))
      } else
        replaceConfig(
          composeFile,
          withInit(compose.replace(setting[0], `${setting[1]}TRACY_FRAME_ANCESTORS: "${policy}"`))
        )
      // Recreate is required: restarting a container does not replace its environment.
      run(
        [
          'compose',
          '-p',
          label,
          '-f',
          composeFile,
          'up',
          '-d',
          '--no-deps',
          '--wait',
          '--wait-timeout',
          '30',
          'web'
        ],
        { cwd: directory }
      )
    }
  }
  if (current.trim() === "'none'") return { state: 'refused' }
  if (!managedDefault(current) && (!previous || current !== previous.policy)) return { state: 'unmanaged' }
  if (current === policy && previous?.policy === policy && previous?.publicOrigin === publicOrigin)
    return { state: 'current' }
  try {
    apply()
    metadataOf(directory, policy, publicOrigin)
    return { state: 'updated' }
  } catch {
    for (const [file, text] of originals) {
      if (file === apache) writeFileSync(file, text)
      else replaceConfig(file, text)
    }
    // Re-apply the previous configuration if a reload/recreate had already started.
    try {
      if (originals.has(apache)) {
        run(['exec', `${label}-web-1`, 'apache2ctl', '-t'])
        run(['exec', `${label}-web-1`, 'apache2ctl', '-k', 'graceful'])
      } else {
        const composeFile = [...originals.keys()].find((f) => f.endsWith('.yml'))
        run(
          [
            'compose',
            '-p',
            label,
            '-f',
            composeFile,
            'up',
            '-d',
            '--no-deps',
            '--wait',
            '--wait-timeout',
            '30',
            'web'
          ],
          { cwd: directory }
        )
      }
    } catch {
      throw new Error('frame policy rollback uncertain')
    }
    throw new Error('frame policy update refused')
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [root, label, policy, publicOrigin] = process.argv.slice(2)
    console.log(JSON.stringify(reconcileFramePolicy({ root, label, policy, publicOrigin })))
  } catch {
    console.error('Managed frame policy could not be reconciled')
    process.exitCode = 1
  }
}
