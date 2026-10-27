/**
 * Gate: a script a workflow RUNS must exist in the tree.
 *
 * WHY THIS GATE EXISTS. On 08/09 the merge of `main` into `develop` carried a rename — `main` had
 * turned `stage-cms-themes.sh` into `stage-cms-seeder.sh` when the two theme zips left the image —
 * and `build-dsh-image.yml` kept calling the old name. All 27 gates were green on that merge commit,
 * and the first thing that noticed was the job itself, on the push right after: `No such file or
 * directory`, exit 127, after a 59-second install.
 *
 * 🔒 THE POINT IS NOT "A WORKFLOW CAN BE WRONG" — it is that NOTHING IN `build:check` OPENS ONE.
 * Every other gate reads `packages/`, `workers/`, `docs/`, `vendor/` or a lockfile; a workflow YAML
 * is the one file in this repo that only CI can judge, and CI judges it by running it. That makes a
 * dead path in a workflow the most expensive kind of typo here: it costs a runner, a checkout, an
 * install, and on `build-dsh-image` a 4.4 GB image build, before anyone learns the name is wrong.
 * Reading it costs milliseconds.
 *
 * WHAT IT READS. Every `run:` body in `.github/workflows/*.yml`, looking for tokens that are
 * repo-relative paths to a script — a leading `./`, or a first segment that is a directory in this
 * tree (`packages/…`, `scripts/…`) — and asserting the file is there.
 *
 * ⚠ WHAT IT CANNOT SEE, SAID OUT LOUD SO NOBODY TRUSTS IT FURTHER THAN IT GOES:
 *
 *   · A path built from a variable (`"$SCRIPTS/stage.sh"`, `${{ inputs.script }}`). It reads
 *     literals, like `check-origins.ts` does, and for the same reason: the alternative is executing
 *     the shell to find out.
 *   · Whether the script WORKS, or is executable, or takes the arguments the workflow passes.
 *   · A path inside a heredoc destined for another machine (`ssh host <<'EOF' … EOF`), which names a
 *     file on THAT host and is correctly absent here. Those are skipped, which also means a genuine
 *     typo inside one is not caught.
 *   · Anything in a composite action or a called workflow — only `.github/workflows/*.yml` is read.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-workflow-scripts.ts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = join(ROOT, '.github', 'workflows')

/** One dead path, named by the file it was written in. */
export interface Problem {
  readonly file: string
  readonly message: string
}

/**
 * Top-level directories of this repo that a script path may start with. Anything else is a path on
 * some other machine (`/opt/tracy-fleet/…`, `~/.ssh/…`) or a program on `PATH`, and not ours to
 * judge.
 */
const REPO_DIRS = new Set([
  '.agents',
  '.github',
  'docs',
  'infra',
  'packages',
  'scripts',
  'tasks',
  'tch',
  'vendor',
  'workers'
])

/** Extensions this gate treats as "a script somebody runs". */
const SCRIPT_RE = /\.(sh|mjs|cjs|js|ts|py)$/

/**
 * Read the `run:` bodies out of a workflow. Deliberately a line scanner rather than a YAML parse:
 * the gate must not need a YAML dependency to answer a question this shallow, and a workflow whose
 * YAML is broken is caught by GitHub itself in a way that names the line.
 *
 * @param text - the workflow file, verbatim.
 * @returns The shell text of every `run:` step, one entry per step.
 */
function runBodies(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const inline = /^\s*(?:-\s+)?run:\s*(?:[|>][-+]?\s*)?(.*)$/.exec(lines[i])
    if (inline === null) continue
    const first = inline[1].trim()
    if (first !== '') {
      out.push(first)
      continue
    }
    // A block scalar: everything indented deeper than the `run:` key belongs to it.
    const indent = /^\s*/.exec(lines[i])?.[0].length ?? 0
    const body: string[] = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trim() === '') {
        body.push('')
        continue
      }
      const own = /^\s*/.exec(line)?.[0].length ?? 0
      if (own <= indent) break
      body.push(line)
      i = j
    }
    out.push(body.join('\n'))
  }
  return out
}

/**
 * Drop heredoc bodies. `ssh host <<'EOF' … EOF` carries commands for ANOTHER machine, where a path
 * that does not exist here is exactly right.
 *
 * @param body - one `run:` body.
 * @returns The same text with heredoc bodies removed.
 */
function withoutHeredocs(body: string): string {
  const lines = body.split('\n')
  const out: string[] = []
  let closing: string | null = null
  for (const line of lines) {
    if (closing !== null) {
      if (line.trim() === closing) closing = null
      continue
    }
    const open = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(line)
    if (open !== null) {
      closing = open[1]
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Check one workflow's `run:` steps for script paths that are not in the tree.
 *
 * @param text - the workflow file, verbatim.
 * @param label - repo-relative path, for the message.
 * @param exists - whether a repo-relative path is present; injected so the suite runs on fixtures.
 * @returns Problems found, one per dead path.
 */
export function checkWorkflowScripts(
  text: string,
  label: string,
  exists: (path: string) => boolean
): Problem[] {
  const out: Problem[] = []
  const seen = new Set<string>()
  for (const raw of runBodies(text)) {
    const body = withoutHeredocs(raw)
    for (const token of body.split(/[\s;&|()'"`]+/)) {
      // A path built from a variable is not a literal, and this gate reads literals.
      if (token.includes('$') || token.includes('*')) continue
      const path = token.startsWith('./') ? token.slice(2) : token
      if (!SCRIPT_RE.test(path)) continue
      const head = path.split('/')[0]
      if (!REPO_DIRS.has(head)) continue
      if (seen.has(path)) continue
      seen.add(path)
      if (!exists(path)) {
        out.push({
          file: label,
          message: `runs \`${path}\`, which is not in the tree — renamed, moved, or a typo. CI would find this only by running the job.`
        })
      }
    }
  }
  return out
}

function main(): void {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  const problems = files.flatMap((file) =>
    checkWorkflowScripts(readFileSync(join(WORKFLOWS, file), 'utf8'), `.github/workflows/${file}`, (path) =>
      existsSync(join(ROOT, path))
    )
  )
  if (problems.length > 0) {
    for (const problem of problems) console.error(`${problem.file}: ${problem.message}`)
    console.error(
      `check-workflow-scripts: ${problems.length} dead script path(s) in ${files.length} workflow(s).`
    )
    process.exit(1)
  }
  console.log(`check-workflow-scripts: xanh (${files.length} workflow).`)
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  main()
}
