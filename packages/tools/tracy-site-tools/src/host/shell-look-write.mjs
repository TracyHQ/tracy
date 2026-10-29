/**
 * WHICH BASH COMMANDS WRITE THE SITE'S LOOK (ADR 0023, "Addendum 30/09").
 *
 * A look edit outside `tracy_site` is measured before the agent's next step (`design-drift.mjs`
 * `lookEdit`), and a measure costs ~6 s of the step. The first cut matched the whole command text
 * with two regexes — a look file anywhere, and a `>` anywhere — so a READ-ONLY
 * `grep --include=*.css … | sed 's/:.*var(/ -> var(/'` read as a write (the `>` of ` -> ` inside a
 * quoted sed expression; df2saas1, 30/09), and `sed -n 1,30p tools/t4-scss.php` — reading the
 * compiler — fired two measures, one past the 15 s budget (df2jbiz1, 30/09).
 *
 * So the command is split the way a shell splits it (quotes, escapes, `$(…)`, operators, heredocs)
 * and only these forms count, each against a word that IS a look file (not one containing it):
 * - an unquoted redirection `>`, `>>`, `>|`, `&>`, `N>` whose target is a look file;
 * - `tee` with a look file among its operands;
 * - `sed -i` / `perl -i` with a look file among the files it edits (never its script);
 * - `cp` / `mv` / `install` whose destination (last operand) is a look file;
 * - running a look compiler (`t4-scss.php`, as `php …/t4-scss.php` or `./…/t4-scss.php`);
 * - an inline interpreter script (`python3 - <<EOF`, `python3 -c`, `node -e`, `php -r`) that names
 *   a look file AND opens something for writing — how the agent edited `tokens.css` on df2saas1.
 * Text inside quotes is never an operator; a command that cannot be split (an open quote) is not a
 * write — nothing is guessed. Tested case by case in `test/shell-look-write.test.mjs`.
 */
import path from 'node:path'

/** A path that IS a look file: a stylesheet, a `theme.json`, a style variation's json. */
const LOOK_PATH = /^[^\s]*(?:\.(?:css|scss|sass|less)|(?:^|\/)theme\.json|\/styles\/[\w-]+\.json)$/i
/** A look file named inside a script's text. */
const LOOK_IN_TEXT = /[\w./~-]*(?:\.(?:css|scss|sass|less)|theme\.json|\/styles\/[\w-]+\.json)(?![\w.])/i
/** A look compiler: running it rewrites the compiled stylesheet. */
const COMPILER = /(?:^|\/)t4-scss\.php$/
/** An inline script that writes a file. */
const SCRIPT_WRITES =
  /\bopen\([^)]*,\s*(?:mode\s*=\s*)?['"][wax]\+?b?['"]|\.write_text\(|\.write_bytes\(|writeFileSync|appendFileSync|\bwriteFile\(|\bappendFile\(|file_put_contents|\bfwrite\(/
const INTERPRETERS = /^(?:python\d?(?:\.\d+)?|node|php\d?(?:\.\d+)?|ruby)$/
/** Words that run the next word as the command. */
const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time', 'nice'])

/**
 * @typedef {{ text: string, quoted: boolean }} Word
 * @typedef {{ words: Word[], redirects: { op: string, target: string }[], heredocs: string[], depth?: number }} Simple
 * `depth`: how many `( … )` subshells the command stands in (0 at the top).
 */

/**
 * A command line split into simple commands, or null when it cannot be split.
 * @param {string} src
 * @returns {Simple[] | null}
 */
export function splitShell(src) {
  /** @type {Simple[]} */
  const out = []
  let depth = 0
  /** @type {Simple} */
  let cmd = { words: [], redirects: [], heredocs: [], depth }
  /** @type {Word | null} */
  let word = null
  /** @type {string | null} */
  let redirect = null
  /** @type {{ delim: string, strip: boolean, cmd: Simple }[]} */
  let pendingDocs = []
  const endWord = () => {
    if (word === null) return
    if (redirect !== null) {
      if (redirect === '<<' || redirect === '<<-')
        pendingDocs.push({ delim: word.text, strip: redirect === '<<-', cmd })
      else cmd.redirects.push({ op: redirect, target: word.text })
      redirect = null
    } else cmd.words.push(word)
    word = null
  }
  const endCmd = () => {
    endWord()
    if (cmd.words.length > 0 || cmd.redirects.length > 0) out.push(cmd)
    cmd = { words: [], redirects: [], heredocs: [], depth }
  }
  const put = (/** @type {string} */ s, quoted = false) => {
    if (word === null) word = { text: '', quoted: false }
    word.text += s
    if (quoted) word.quoted = true
  }
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '\\') {
      if (src[i + 1] === '\n') i += 2
      else {
        put(src[i + 1] ?? '', true)
        i += 2
      }
      continue
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1)
      if (end === -1) return null
      put(src.slice(i + 1, end), true)
      i = end + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let s = ''
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) {
          s += src[j + 1]
          j += 2
        } else s += src[j++]
      }
      if (j >= n) return null
      put(s, true)
      i = j + 1
      continue
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1)
      if (end === -1) return null
      put(src.slice(i, end + 1), true)
      i = end + 1
      continue
    }
    if (c === '$' && src[i + 1] === '(') {
      let depth = 0
      let j = i + 1
      for (; j < n; j++) {
        if (src[j] === '(') depth += 1
        else if (src[j] === ')' && --depth === 0) break
      }
      if (j >= n) return null
      put(src.slice(i, j + 1), true)
      i = j + 1
      continue
    }
    if (c === '#' && word === null) {
      const end = src.indexOf('\n', i)
      i = end === -1 ? n : end
      continue
    }
    if (c === '\n') {
      endCmd()
      i += 1
      // Heredoc bodies begin on the line after the command that opened them.
      for (const doc of pendingDocs) {
        const lines = []
        while (i < n) {
          const eol = src.indexOf('\n', i)
          const line = src.slice(i, eol === -1 ? n : eol)
          i = eol === -1 ? n : eol + 1
          if ((doc.strip ? line.replace(/^\t+/, '') : line) === doc.delim) break
          lines.push(line)
        }
        doc.cmd.heredocs.push(lines.join('\n'))
      }
      pendingDocs = []
      continue
    }
    if (c === ' ' || c === '\t') {
      endWord()
      i += 1
      continue
    }
    if (c === ';' || c === '|' || c === '(' || c === ')' || (c === '&' && src[i + 1] !== '>')) {
      endCmd()
      // a subshell's own commands stand one level down; the command after it, back up
      if (c === '(') depth += 1
      else if (c === ')') depth = Math.max(0, depth - 1)
      cmd.depth = depth
      i += c === '|' && src[i + 1] === '|' ? 2 : c === '&' && src[i + 1] === '&' ? 2 : 1
      continue
    }
    if (c === '>' || c === '<' || (c === '&' && src[i + 1] === '>')) {
      // A word of digits right before is the descriptor, not an argument (`2>&1`).
      const held = /** @type {Word | null} */ (word)
      if (held !== null && !held.quoted && /^\d+$/.test(held.text)) word = null
      else endWord()
      const op = /^(?:&>>|&>|>>|>\||>&|<<<|<<-|<<|<&|<>|>|<)/.exec(src.slice(i))?.[0] ?? c
      i += op.length
      redirect = op
      continue
    }
    put(c)
    i += 1
  }
  if (redirect !== null && word === null) return null
  endCmd()
  return out
}

/** The words after the prefixes and variable assignments that only set up the command. */
function commandWords(/** @type {Word[]} */ words) {
  let k = 0
  while (k < words.length) {
    const w = words[k].text
    if (!words[k].quoted && /^[A-Za-z_]\w*=/.test(w)) k += 1
    else if (PREFIXES.has(w)) {
      k += 1
      while (k < words.length && words[k].text.startsWith('-')) k += 1
    } else break
  }
  return words.slice(k).map((w) => w.text)
}

const isLook = (/** @type {string} */ w) => LOOK_PATH.test(w)
/** Whether a path is a stylesheet, a `theme.json` or a style variation's json (the role pins read them). */
export const isLookFile = isLook
const base = (/** @type {string} */ w) => w.split('/').at(-1) ?? w

/**
 * The files `sed`/`perl` edit, after their options and script.
 * @param {string[]} args
 * @param {Set<string>} takesValue - options whose value is the next word.
 * @param {(opt: string) => boolean} inPlace
 * @param {Set<string>} scriptOpts - options that give the script, so no operand is the script.
 * @returns {string[] | null} the files, or null when not in place.
 */
function editedFiles(args, takesValue, inPlace, scriptOpts) {
  let edits = false
  let scriptGiven = false
  const operands = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a === '--') {
      operands.push(...args.slice(k + 1))
      break
    }
    if (a.startsWith('-') && a.length > 1) {
      if (inPlace(a)) edits = true
      const letters = a.startsWith('--') ? a : a.slice(1)
      const opt = a.startsWith('--') ? a.split('=')[0] : `-${letters.at(-1)}`
      if (scriptOpts.has(opt) || [...scriptOpts].some((o) => o.length === 2 && letters.includes(o[1])))
        scriptGiven = true
      if (takesValue.has(opt) && !a.includes('=')) k += 1
      continue
    }
    operands.push(a)
  }
  if (!edits) return null
  return scriptGiven ? operands : operands.slice(1)
}

/**
 * What one simple command writes of the look, or null.
 * @param {Simple} cmd
 * @returns {string | null}
 */
function simpleLookWrite(cmd) {
  for (const r of cmd.redirects) if (/^(?:>|>>|>\||&>|&>>)$/.test(r.op) && isLook(r.target)) return r.target
  const words = commandWords(cmd.words)
  if (words.length === 0) return null
  const [head, ...args] = words
  const name = base(head)
  if (COMPILER.test(head)) return head
  if (name === 'tee') return args.find((a) => !a.startsWith('-') && isLook(a)) ?? null
  if (name === 'sed' || name === 'gsed') {
    const files = editedFiles(
      args,
      new Set(['-e', '-f', '--expression', '--file', '-l']),
      (a) => a === '--in-place' || a.startsWith('--in-place=') || /^-[a-zA-Z]*i/.test(a),
      new Set(['-e', '-f', '--expression', '--file'])
    )
    return files?.find(isLook) ?? null
  }
  if (name === 'perl') {
    const files = editedFiles(
      args,
      new Set(['-e', '-E', '-M', '-I']),
      (a) => /^-[a-zA-Z]*i/.test(a),
      new Set(['-e', '-E'])
    )
    if (files !== null) return files.find(isLook) ?? null
  }
  if (name === 'cp' || name === 'mv' || name === 'install') {
    const operands = args.filter((a) => !a.startsWith('-'))
    const dest = operands.at(-1)
    return operands.length >= 2 && dest !== undefined && isLook(dest) ? dest : null
  }
  if (INTERPRETERS.test(name) || name === 'perl') {
    const firstFile = args.find((a) => !a.startsWith('-'))
    if (name.startsWith('php') && firstFile !== undefined && COMPILER.test(firstFile)) return firstFile
    /** @type {string[]} */
    const scripts = [...cmd.heredocs]
    for (let k = 0; k < args.length - 1; k++) if (/^-[ceEr]$/.test(args[k])) scripts.push(args[k + 1])
    for (const s of scripts) {
      const look = s.match(LOOK_IN_TEXT)
      if (look && SCRIPT_WRITES.test(s)) return look[0]
    }
  }
  return null
}

/**
 * The look file (or compiler) a bash command writes, or null when it writes none — including when
 * the command cannot be split.
 * @param {string} command
 * @returns {string | null}
 */
export function shellLookWrite(command) {
  const cmds = splitShell(command)
  if (cmds === null) return null
  for (const cmd of cmds) {
    const hit = simpleLookWrite(cmd)
    if (hit !== null) return hit
  }
  return null
}

/**
 * Every stylesheet a bash command writes, as the command names it (absolute, or relative to its own cwd —
 * after a `cd <dir>` earlier in the same command, relative to that, so `cd wp-content/themes/t && sed -i … style.css`
 * names `wp-content/themes/t/style.css`),
 * for the before/after read of the role pins (`role-pins.mjs`): the same forms `shellLookWrite` counts,
 * every file of each rather than the first, and never a look compiler (what it writes is the compiled
 * output, not text the agent typed). Empty when the command writes none or cannot be split.
 * @param {string} command
 * @returns {string[]}
 */
export function shellLookFiles(command) {
  return shellLookWrites(command).files
}

/**
 * The same, with the stylesheets named relative to a directory the text does not tell (after `cd "$DIR"`,
 * `cd ~`, `cd -`): those are `unresolved` — said as not checked, never dropped in silence (review, 20/10/2026).
 * @param {string} command
 * @returns {{ files: string[], unresolved: string[] }}
 */
export function shellLookWrites(command) {
  const cmds = splitShell(command)
  if (cmds === null) return { files: [], unresolved: [] }
  /** @type {Set<string>} */
  const named = new Set()
  /** @type {Set<string>} */
  const unresolved = new Set()
  /** @type {string | null} the directory a `cd` moved to, relative to the command's own; null: unknown */
  let dir = ''
  // 🔒 A `cd` IN A SUBSHELL ENDS WITH IT (reviews, 20/10/2026): each depth keeps the directory it had when
  // entered, so `(cd sub && sed -i … x.css); echo > t.css` names `sub/x.css` and `t.css`. A command
  // substitution (`$( … )`, backticks) runs apart and never moves the command's own directory.
  /** @type {(string | null)[]} */
  const dirs = []
  let at = 0
  const out = {
    add: (/** @type {string} */ f) => {
      if (f.startsWith('/')) named.add(f)
      else if (dir !== null) named.add(dir === '' ? f : path.posix.normalize(`${dir}/${f}`))
      else unresolved.add(f)
    }
  }
  for (const cmd of cmds) {
    const d = cmd.depth ?? 0
    while (at < d) {
      dirs.push(dir)
      at += 1
    }
    while (at > d) {
      dir = dirs.pop() ?? dir
      at -= 1
    }
    for (const r of cmd.redirects)
      if (/^(?:>|>>|>\||&>|&>>)$/.test(r.op) && isLook(r.target)) out.add(r.target)
    const words = commandWords(cmd.words)
    if (words.length === 0) continue
    const [head, ...args] = words
    if (head === 'pushd' || head === 'popd') {
      dir = null
      continue
    }
    if (head === 'cd') {
      const to = args.find((a) => !a.startsWith('-'))
      // `cd` alone, `cd -`, a variable or `~`: where it lands is not known from the text
      dir =
        to === undefined || /[$~`]/.test(to) || to === '-'
          ? null
          : to.startsWith('/')
            ? to
            : dir === null
              ? null
              : path.posix.normalize(dir === '' ? to : `${dir}/${to}`)
      continue
    }
    const name = base(head)
    if (COMPILER.test(head)) continue
    if (name === 'tee') for (const a of args) if (!a.startsWith('-') && isLook(a)) out.add(a)
    if (name === 'sed' || name === 'gsed' || name === 'perl') {
      const files =
        name === 'perl'
          ? editedFiles(
              args,
              new Set(['-e', '-E', '-M', '-I']),
              (a) => /^-[a-zA-Z]*i/.test(a),
              new Set(['-e', '-E'])
            )
          : editedFiles(
              args,
              new Set(['-e', '-f', '--expression', '--file', '-l']),
              (a) => a === '--in-place' || a.startsWith('--in-place=') || /^-[a-zA-Z]*i/.test(a),
              new Set(['-e', '-f', '--expression', '--file'])
            )
      for (const f of files ?? []) if (isLook(f)) out.add(f)
    }
    if (name === 'cp' || name === 'mv' || name === 'install') {
      const operands = args.filter((a) => !a.startsWith('-'))
      const dest = operands.at(-1)
      if (operands.length >= 2 && dest !== undefined && isLook(dest)) out.add(dest)
    }
    if (INTERPRETERS.test(name) || name === 'perl') {
      /** @type {string[]} */
      const scripts = [...cmd.heredocs]
      for (let k = 0; k < args.length - 1; k++) if (/^-[ceEr]$/.test(args[k])) scripts.push(args[k + 1])
      for (const sc of scripts)
        if (SCRIPT_WRITES.test(sc))
          for (const m of sc.matchAll(new RegExp(LOOK_IN_TEXT.source, 'gi'))) if (isLook(m[0])) out.add(m[0])
    }
  }
  // read in the site's own container, where nothing but this site is: `../` stays inside it
  return { files: [...named], unresolved: [...unresolved] }
}
