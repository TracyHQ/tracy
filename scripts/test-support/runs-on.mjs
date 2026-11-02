// The runners a workflow job's `runs-on` can ask for, read without GitHub's expression engine.
//
// A job is either a plain label list (or one label), or — the Tracy CI jobs a pull request runs on
// GitHub-hosted unless it carries the `ci:self-hosted` label (30/10/2026) — ONE expression of exactly
// this shape:
//
//   ${{ <condition> && 'ubuntu-latest' || fromJSON(format('["self-hosted",…,"{0}",…]', <arg0>, …)) }}
//
// `runnerPaths` returns both paths: the hosted one, and the self-hosted list rebuilt with each `{i}`
// replaced by `${{ <argi> }}` — the very per-label expressions the list carried before, so a test that
// evaluates a label (the lane, `ci:aws-only`) reads the same text either way. Any other expression in
// `runs-on` throws: a test must refuse a shape it does not know, never guess it.
const HOSTED_RUNS_ON =
  /^\$\{\{\s*(github\.event_name == 'pull_request' && !contains\(github\.event\.pull_request\.labels\.\*\.name, 'ci:self-hosted'\))\s*&&\s*'ubuntu-latest'\s*\|\|\s*fromJSON\(format\('(\[[^']*\])',\s*([\s\S]*)\)\)\s*\}\}$/

/** Split `a, b(c, d), 'e, f'` on its top-level commas. */
function splitArgs(source) {
  const args = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === "'") quoted = !quoted
    else if (quoted) continue
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      args.push(source.slice(start, i).trim())
      start = i + 1
    }
  }
  if (depth !== 0 || quoted) throw new Error(`unbalanced runs-on arguments: ${source}`)
  args.push(source.slice(start).trim())
  return args
}

/**
 * @param {unknown} runsOn - a job's `runs-on`, as js-yaml parsed it
 * @returns {{ hosted: string | null, selfHosted: string[] | null, condition: string | null }}
 *   `hosted` — the GitHub-hosted label this job can run on (`ubuntu-latest`), or null;
 *   `selfHosted` — the self-hosted label list, or null for a job that is GitHub-hosted only;
 *   `condition` — the expression that picks `hosted`, when the job has both paths.
 */
export function runnerPaths(runsOn) {
  if (Array.isArray(runsOn)) {
    const labels = runsOn.map(String)
    return labels.includes('self-hosted')
      ? { hosted: null, selfHosted: labels, condition: null }
      : { hosted: labels.join(','), selfHosted: null, condition: null }
  }
  const text = String(runsOn).trim()
  if (!text.includes('${{')) return { hosted: text, selfHosted: null, condition: null }
  const m = HOSTED_RUNS_ON.exec(text.replace(/\s+/g, ' '))
  if (!m) throw new Error(`a runs-on expression this test does not know: ${text}`)
  const args = splitArgs(m[3])
  const template = JSON.parse(m[2])
  const used = new Set()
  const selfHosted = template.map((label) =>
    label.replace(/\{(\d+)\}/g, (_, i) => {
      if (args[Number(i)] === undefined)
        throw new Error(`runs-on uses {${i}} but has no such argument: ${text}`)
      used.add(Number(i))
      return `\${{ ${args[Number(i)]} }}`
    })
  )
  if (used.size !== args.length) throw new Error(`runs-on passes an argument it never uses: ${text}`)
  if (!selfHosted.includes('self-hosted'))
    throw new Error(`the fallback of runs-on is not self-hosted: ${text}`)
  return { hosted: 'ubuntu-latest', selfHosted, condition: m[1] }
}

/** Every label set the job may ask for, one array per path. */
export const labelSets = (runsOn) => {
  const { hosted, selfHosted } = runnerPaths(runsOn)
  return [...(hosted === null ? [] : [[hosted]]), ...(selfHosted === null ? [] : [selfHosted])]
}
