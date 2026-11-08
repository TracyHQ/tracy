// The two long commands of the brand bench's command line (brand step trial bench, #320): `run` (queue a run on a
// brief file or a WO revision) and `get` (write a run's files out). Split from brand-cli.js to keep both short.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { briefOfRevision, startBrandRun } from './brand-control.js'
import { runFiles } from './brand-export.js'
import { readRun } from './brand-store.js'

const LABEL = /^[A-Za-z0-9._@-]{1,64}$/

/** A wrong command line: the CLI prints the usage and exits 2. */
export class Usage extends Error {}

export const refused = (io, message) => {
  io.err(message)
  return 1
}

export async function startRunCommand(d, values) {
  const file = values['brief-file']
  const revision = values['brief-revision']
  if (!values.kit) throw new Usage('run needs --kit')
  if (Boolean(file) === Boolean(revision))
    throw new Usage('run needs exactly one of --brief-file and --brief-revision')
  if (values['logo-file'] && !file) throw new Usage('--logo-file goes with --brief-file')
  if (values.by !== undefined && !LABEL.test(values.by))
    throw new Usage('--by takes letters, digits and . _ @ - only, up to 64')
  if (Boolean(values['agent-model']) !== Boolean(values['agent-model-reason']))
    throw new Usage('--agent-model and --agent-model-reason go together')
  if (values['reviewer-model'] && !values['agent-model'])
    throw new Usage('--reviewer-model goes with --agent-model')
  let brief
  let briefSource
  if (file) {
    let text
    try {
      text = await readFile(path.resolve(d.cwd ?? process.cwd(), file), 'utf8')
    } catch (error) {
      return refused(d, `Cannot read the brief file ${path.basename(file)} (${error.code ?? 'error'}).`)
    }
    try {
      brief = JSON.parse(text)
    } catch {
      return refused(d, `The brief file ${path.basename(file)} is not JSON.`)
    }
    // Only the file's name is stored: a path would name the machine it was run on.
    briefSource = { kind: 'file', name: path.basename(file) }
  } else {
    const found = await briefOfRevision(d.pool, revision)
    if (!found.ok) return refused(d, `No WO revision ${revision}.`)
    brief = found.brief
    briefSource = { kind: 'revision', revisionId: revision }
  }
  let logo
  if (values['logo-file']) {
    const name = path.basename(values['logo-file'])
    try {
      logo = { name, bytes: await readFile(path.resolve(d.cwd ?? process.cwd(), values['logo-file'])) }
    } catch (error) {
      return refused(d, `Cannot read the logo file ${name} (${error.code ?? 'error'}).`)
    }
  }
  const started = await startBrandRun({
    pool: d.pool,
    secret: d.secret,
    brief,
    briefSource,
    kitRef: values.kit,
    startedBy: values.by ? `cli:${values.by}` : 'cli',
    ...(logo ? { logo } : {}),
    kitImages: d.kitImages,
    noCaps: values['no-caps'] === true,
    wiring: d.wiring,
    ...(values['agent-model']
      ? {
          agentModel: {
            model: values['agent-model'],
            reason: values['agent-model-reason'],
            ...(values['reviewer-model'] ? { reviewerModel: values['reviewer-model'] } : {})
          }
        }
      : {}),
    ...(d.index ? { index: d.index } : {})
  })
  if (!started.ok) return refused(d, `${started.code}: ${started.reason}`)
  d.out(started.run.id)
  return 0
}

export async function getRunCommand(d, values, runId) {
  if (!values.out) throw new Usage('get needs --out <dir>')
  const run = await readRun(d.pool, runId)
  if (!run) return refused(d, `No run ${runId}.`)
  const { rows } = await d.pool.query(
    `select * from brand_call where run_id = $1 and kind = 'agent' order by n`,
    [run.id]
  )
  const dir = path.resolve(d.cwd ?? process.cwd(), values.out)
  await mkdir(dir, { recursive: true })
  // Every image and file the tools wrote, at the same relative paths the brand file names.
  await cp(d.runDir(run.id), dir, { recursive: true }).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
  const files = await runFiles(d.pool, run, rows)
  for (const [name, text] of files) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
    await writeFile(path.join(dir, name), text)
  }
  d.out(`${files.length} files written besides the images: ${files.map(([name]) => name).join(', ')}`)
  if (run.outcome === 'safe-version') d.out(`safe version (${run.safeVersionReason})`)
  else if (run.status === 'queued') d.out('still running')
  return 0
}
