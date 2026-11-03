// Shared stdout handling for the kit CLIs that used to print a page of lines per run (visual-qa.mjs,
// fast-gate.mjs, checkpoint.mjs, release-chain.mjs). By default a CLI prints ONE bounded summary line,
// `<tool> <command>: <key=value …> -> <file>`, and the complete result stays in that file; `--verbose`
// restores the per-page / per-stage lines. What a CLI decides (exit code, files written) is never
// touched here — only what is shown. Errors and warnings still go to stderr as they always did.
// Modelled on the WordPress kit's scripts/lib/cli-output.mjs (references/tools.md, output convention).

export const SUMMARY_MAX = 240

/** One physical line: control characters become spaces, length bounded with an ellipsis. */
export function oneLine(value, max = 120) {
  const s = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * A value as one printable field: control characters, `%` and any `extra` character become `%XX`, so
 * a path with a newline or a `|` keeps the row shape and decodes back exactly (decodeURIComponent).
 */
export function encodeField(value, extra = '') {
  const bad = new RegExp(
    `[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029%${extra.replace(/[\\\]^-]/g, '\\$&')}]`,
    'g'
  )
  return String(value).replace(bad, (c) =>
    encodeURIComponent(c).replace(
      /^[^%]$/,
      (x) => `%${x.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
    )
  )
}

/** Remove `--verbose` from an argument list IN PLACE (tools whose `opt()` splices argv) and say whether it was there. */
export function takeVerbose(argv) {
  let verbose = false
  for (let i = argv.indexOf('--verbose'); i >= 0; i = argv.indexOf('--verbose')) {
    argv.splice(i, 1)
    verbose = true
  }
  return verbose
}

/** `k=v` tokens, in the order given; arrays by length, objects as `k:v,…`, null/undefined skipped. */
export function fields(obj) {
  const tokens = []
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) tokens.push(`${key}=${value.length}`)
    else if (typeof value === 'object')
      tokens.push(
        `${key}=${
          Object.entries(value)
            .map(([k, v]) => `${k}:${v}`)
            .join(',') || '-'
        }`
      )
    else tokens.push(`${key}=${oneLine(value, 80)}`)
  }
  return tokens.join(' ')
}

/** The summary line itself: `<tool> <command>: <summary> -> <file>` (file percent-encoded). */
export function summaryLine(tool, command, summary, file) {
  const head = `${tool}${command ? ` ${command}` : ''}: ${oneLine(typeof summary === 'string' ? summary : fields(summary), SUMMARY_MAX)}`
  return file ? `${head} -> ${encodeField(file)}` : head
}
