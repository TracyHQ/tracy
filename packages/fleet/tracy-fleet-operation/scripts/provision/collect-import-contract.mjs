/** Generate lookup documents only for an imported copy, from its own live Claude Cowork plugin. */
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildImportContract, publishImportContract, singleLine } from './import-contract-documents.mjs'
import { checkPath, readPlainFile, stageFile, writeFileAtomic } from './safe-site-files.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const START = '<!-- tracy:import-contract -->'
const END = '<!-- /tracy:import-contract -->'
/** Where the documents go, below the site folder. */
const DOCUMENTS = 'docs/agents/import-contract'

/** The two markers of the managed paragraph, or a refusal when only one stands or they are out of order. */
function markersOf(agents) {
  const start = agents.indexOf(START)
  const end = agents.indexOf(END)
  if (start >= 0 !== end >= 0 || (start >= 0 && end < start))
    throw new Error('Malformed managed import paragraph')
  return { start, end }
}

/**
 * The team's AGENTS.md with the managed paragraph set to `block`, or taken out when `block` is null. The
 * paragraph is replaced where it stands, else appended; taking it out leaves the team's own text as it was.
 */
function withBlock(agents, block) {
  const { start, end } = markersOf(agents)
  if (block === null) {
    if (start < 0) return agents
    const head = agents.slice(0, start).trimEnd()
    const tail = agents.slice(end + END.length).trimStart()
    if (tail === '') return head === '' ? '' : `${head}\n`
    return head === '' ? tail : `${head}\n\n${tail}`
  }
  return start >= 0
    ? agents.slice(0, start) + block + agents.slice(end + END.length)
    : agents.trimEnd() + '\n\n' + block + '\n'
}

/** AGENTS.md as text, read only when it is a plain file, with its markers checked. */
async function readAgents(folder) {
  const agents = await readPlainFile(folder, 'AGENTS.md')
  if (agents === null) throw new Error('The site folder has no AGENTS.md')
  markersOf(agents)
  return agents
}

/**
 * Set the managed paragraph of AGENTS.md (null takes it out) without losing what the team wrote meanwhile.
 *
 * 🔒 A CAPTURE TAKES UP TO TEN MINUTES, so the file is read here, after it, and never before it (a read
 * made before is what lost an edit made during the capture). The new text goes to a temporary file first;
 * the file is read once more right before the rename, and when it changed since, the paragraph is written
 * onto the fresh text instead, once, and then moved over. AGENTS.md is replaced by rename and keeps the
 * owner and mode it had. What this cannot close is an edit in the microseconds between that last read and
 * the rename.
 *
 * @param {string} folder the site folder
 * @param {string | null} block the paragraph with its markers, or null to remove it
 * @param {{ onStaged?: () => Promise<void> }} [hooks] called once the new text is staged (tests edit the file here)
 * @returns {Promise<boolean>} whether the file changed
 */
export async function setManagedBlock(folder, block, { onStaged } = {}) {
  let text = await readAgents(folder)
  // Two rounds at most: against what was read, then against what a last-moment edit left. The second round
  // does not look again, so the loop always ends.
  for (let round = 0; ; round++) {
    const updated = withBlock(text, block)
    if (updated === text) return false
    const staged = await stageFile(folder, 'AGENTS.md', updated)
    let latest = text
    try {
      await onStaged?.()
      if (round === 0) latest = await readAgents(folder)
    } catch (error) {
      await staged.discard()
      throw error
    }
    if (latest === text) {
      await staged.commit()
      return true
    }
    await staged.discard()
    text = latest
  }
}

/** A capture refused with "retry" means the copy was edited while its pages were read: once more, never a loop. */
async function captureWithRetry(run, label, platform) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run(label, platform)
    } catch (error) {
      if (attempt >= 2 || !/\bretry\b/i.test(String(error?.stderr ?? error?.message ?? ''))) throw error
    }
  }
}

/** The host-owned record: evidence of a captured contract, not a new binding or a quickstart fence. */
async function writeHostRecord(sitesRoot, label, manifest) {
  const directory = path.join(sitesRoot, '.import-contracts', label)
  await mkdir(directory, { recursive: true })
  await writeFileAtomic(directory, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n')
}

export async function collectImportContract(sitesRoot, label, platform, { run = capture } = {}) {
  if (!/^[a-z0-9-]{3,80}$/.test(label)) throw new Error('Invalid site label')
  const folder = path.join(sitesRoot, label)
  // Everything under the site folder is the agent's to write: a link is refused wherever it stands.
  const identity = await readPlainFile(folder, '.tracy/site.json', { limit: 1024 * 1024 })
  if (identity === null) throw new Error('The site folder has no .tracy/site.json')
  const site = JSON.parse(identity)
  if (site === null || typeof site !== 'object') throw new Error('The site identity is not an object')
  if (site.origin !== 'imported') return { skipped: true }
  // The paragraph's file is looked at BEFORE a capture that can take ten minutes: a link, or a damaged
  // paragraph, is refused now. Nothing can be written to it, so nothing is undone either.
  await readAgents(folder)
  try {
    const copyUrl = site.address ?? site.copyAddress
    if (site.platform && site.platform !== platform) throw new Error('The copy CMS does not match capture')
    await checkPath(folder, DOCUMENTS)
    const data = await captureWithRetry(run, label, platform)
    if (data.inspect?.contract !== `derived/${label}`)
      throw new Error('The captured contract belongs to a different copy')
    const bundle = buildImportContract({ ...data, platform, siteKey: site.siteKey, copyUrl })
    const published = await publishImportContract(path.join(folder, DOCUMENTS), bundle, { root: folder })
    await setManagedBlock(folder, `${START}\n${bundle.brief}\n${END}`)
    // Last: the record is what opens the derived door, so it exists only once everything it describes does.
    await writeHostRecord(sitesRoot, label, bundle.manifest)
    return {
      ...published,
      slots: bundle.coverage.slots,
      pages: bundle.coverage.pages,
      complete: bundle.coverage.complete,
      withheld: bundle.coverage.withheld
    }
  } catch (error) {
    // 🔒 A FAILED CAPTURE LEAVES NO PARAGRAPH. provision.sh has already removed the host's record, so the open
    // surface no longer lists content.contract; a paragraph from the last capture would keep telling the agent
    // to use it. The failure to report is the first one, whatever happens to this.
    await setManagedBlock(folder, null).catch(() => {})
    throw error
  }
}

async function capture(label, platform) {
  const php = await readFile(path.join(HERE, 'import-contract-export.php'), 'utf8')
  return new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        `TRACY_IMPORT_PLATFORM=${platform}`,
        '-e',
        `TRACY_IMPORT_LABEL=${label}`,
        `${label}-web-1`,
        'php'
      ],
      { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // What the script said, and only that: it never puts a payload, a configuration value or a token in
          // its messages. Never stdout, which is the captured map.
          const said = singleLine(stderr, 300) || (error.killed ? 'timed out' : '')
          return reject(
            Object.assign(
              new Error(`The imported copy could not export its contract${said === '' ? '' : `: ${said}`}`),
              { stderr: said }
            )
          )
        }
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new Error('The imported copy returned invalid contract JSON'))
        }
      }
    )
    // `docker exec` may exit before it reads the script (no such container). The reason is in the callback
    // above; a broken pipe here must not become a crash of its own.
    child.stdin.on('error', () => {})
    child.stdin.end(php)
  })
}

/** Whether this file is the one node was started on: real paths on both sides, so a symlinked path still runs. */
function isEntry() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (process.argv[1] && isEntry()) {
  const [sitesRoot, label, platform] = process.argv.slice(2)
  collectImportContract(sitesRoot, label, platform)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(`Import contract documents: ${error.message}`)
      process.exitCode = 1
    })
}
