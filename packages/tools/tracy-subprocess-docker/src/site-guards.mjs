/**
 * Three rules about a site's own files, each a pure function so every rule is a unit test. The
 * provider applies them in `tools/pre-execute`:
 *
 * - PLATFORM CORE is refused. A write-type filesystem tool aimed inside `.webroot/wp-admin/`,
 *   `.webroot/wp-includes/` (WordPress) or `.webroot/libraries/`, `includes/`,
 *   `administrator/includes/`, `layouts/joomla/`, `cli/` (Joomla) changes files the next platform
 *   update overwrites, so the site silently loses the change.
 * - A NEW PHP FILE in the public webroot is refused, outside the places the platform itself puts
 *   one. Apache serves whatever lands under `.webroot/`, and PHP there runs with the site's own
 *   database credentials. Measured 15/09: an agent wrote `.webroot/cli/zz_tmp_title.php` for one
 *   job and removed it by hand afterwards — between those two steps it was a public page.
 * - SECRETS FILES are refused. `wp-config.php` and `configuration.php` at the webroot, and any
 *   `.env` in the site, hold the database password; reading one puts it in the conversation.
 *
 * NOT A RULE HERE: reaching the database directly. A text match on `mysql`, `new PDO` or `wp db
 * query` refused the honest call and saw nothing else — measured 15/09, an agent that hit
 * `COMPONENT_NOT_REGISTERED` wrote a PHP script which bootstrapped Joomla's own database API and
 * updated `#__template_styles`. Neither path left a record. What a database change owes the customer
 * is a written trace, and that is asked for where the agent reads its working rules
 * (`@tracy/dsh-site-tools`, `src/host/site-context.mjs`).
 *
 * Refused, not asked: a seat's browser never receives tool approvals (`index.js`
 * `registerApprovalGuard`). The secrets rule applied to a COMMAND is a text match, not a boundary: a
 * command can name a file in ways no match sees (`cat wp-conf*`, a variable, a script). It stops the
 * ordinary, well-meant call; the path fence and the container remain the boundaries.
 */

/** Directories under `.webroot/` that the platform's own update replaces. */
export const PLATFORM_CORE = Object.freeze([
  'wp-admin',
  'wp-includes',
  'libraries',
  'includes',
  'administrator/includes',
  'layouts/joomla',
  // Joomla's own command line lives here: running `php cli/joomla.php` is the documented way, and
  // writing a file next to it is how a scratch script ends up served at `/cli/<name>.php`.
  'cli'
])

/** The path argument each write-type filesystem tool changes. */
const WRITE_TARGET = new Map([
  ['write', 'file_path'],
  ['edit', 'file_path'],
  ['str_replace_editor', 'path']
])

/**
 * The argument naming the file a tool call writes, or null when the call writes nothing.
 * @param {string} name - the tool name as registered.
 * @param {unknown} args - the parsed tool arguments.
 * @returns {string | null}
 */
export function writeTargetArg(name, args) {
  const arg = WRITE_TARGET.get(name)
  if (arg === undefined) return null
  const command =
    typeof args === 'object' && args !== null
      ? /** @type {Record<string, unknown>} */ (args).command
      : undefined
  // `view` is the one str_replace_editor command that changes nothing.
  return name === 'str_replace_editor' && command === 'view' ? null : arg
}

/**
 * The refusal a write into platform core earns, or null.
 * @param {string} resolved - the symlink-resolved write target, or its nearest existing ancestor.
 * @param {string} siteRoot - the symlink-resolved site folder.
 * @returns {string | null}
 */
export function platformCoreReason(resolved, siteRoot) {
  const webroot = `${siteRoot}/.webroot/`
  if (!resolved.startsWith(webroot)) return null
  const inWebroot = resolved.slice(webroot.length)
  if (!PLATFORM_CORE.some((dir) => inWebroot === dir || inWebroot.startsWith(`${dir}/`))) return null
  return `${resolved.slice(siteRoot.length + 1)} is platform core: an edit there is lost at the next update. Use a child theme, a template override (templates/<template>/html/) or the template's user.css.`
}

/** Names a PHP-enabled Apache hands to the interpreter rather than serving as text. */
const PHP_FILE = /\.(php|phtml|phar)$/i

/**
 * The directories under `.webroot/` where the platform's own documented way of working puts new PHP:
 * WordPress child themes, plugins and mu-plugins; Joomla template overrides (`<template>/html/…`) on
 * the site and the administrator side, and the media each template ships with.
 */
const PHP_ALLOWED = Object.freeze(['wp-content', 'templates', 'administrator/templates', 'media/templates'])

/**
 * The refusal creating a NEW PHP file in the public webroot earns, or null.
 *
 * Only a file that is not there yet. Editing PHP the platform or an earlier step already published
 * changes nothing about what the webroot serves, and a child theme's `functions.php` or a Joomla
 * override under `templates/<template>/html/` is ordinary work that must stay allowed.
 * @param {string} target - the path the write would create, with every existing ancestor resolved.
 * @param {string} siteRoot - the symlink-resolved site folder.
 * @param {boolean} existed - whether that file is already there.
 * @returns {string | null}
 */
export function newWebrootPhpReason(target, siteRoot, existed) {
  if (existed || !PHP_FILE.test(target)) return null
  const webroot = `${siteRoot}/.webroot/`
  if (!target.startsWith(webroot)) return null
  const inWebroot = target.slice(webroot.length)
  if (PHP_ALLOWED.some((dir) => inWebroot.startsWith(`${dir}/`))) return null
  // The way out is named, because there is one: the site folder is mounted in the same container as
  // the webroot, so a script written there runs with the same PHP and the same database — it is just
  // not a page anyone can open.
  return `.webroot/${inWebroot} would be a new PHP file in the public webroot: Apache serves it at that address, and it runs with the site's own database credentials. A script written to do one job belongs in the site folder, which the same container mounts: write ${siteRoot}/TracyWork/agents/<name>.php and run "php ${siteRoot}/TracyWork/agents/<name>.php". Under .webroot/ a new PHP file belongs only where the platform puts one: wp-content/ (child theme, plugin, mu-plugin), templates/ or administrator/templates/ (an override under <template>/html/), media/templates/. Editing a PHP file that is already there is not refused.`
}

/**
 * Command words that run the next word as a command: `sudo ln …`, `xargs ln …`, `nohup ln …`, and
 * the shell's own `do`/`then` inside a loop or a branch.
 */
const COMMAND_PREFIX = new Set([
  'sudo',
  'doas',
  'env',
  'command',
  'exec',
  'nohup',
  'nice',
  'time',
  'timeout',
  'stdbuf',
  'xargs',
  'setsid',
  'do',
  'then',
  'else',
  'if',
  'while',
  'until',
  '!'
])

/** Multi-call binaries whose first operand names the applet: `busybox ln -s …`. */
const MULTICALL = new Set(['busybox', 'toybox'])

/**
 * A shell word as the command will see it, quotes taken off. Text level only: an expansion is kept
 * as written, and {@link unreadableLinkTarget} refuses it.
 * @param {string} word
 * @returns {string}
 */
function unquote(word) {
  return word.replace(/^["']+|["']+$/g, '').replace(/\\(.)/g, '$1')
}

/**
 * The last path segment of a command word, so `/bin/ln` and `/usr/bin/cp` read as `ln` and `cp`.
 * @param {string} word
 * @returns {string}
 */
function commandName(word) {
  const bare = unquote(word)
  return bare.slice(bare.lastIndexOf('/') + 1)
}

/**
 * Whether a link target leaves the site folder, or cannot be judged from the text: absolute, from
 * a home directory, climbing with `..`, or built by the shell at run time (a variable, a command
 * substitution, a brace or glob expansion) — `T=/site/other; ln -s "$T" f` reads as `$T` here.
 * @param {string} target - the operand as written, quotes and all.
 * @returns {boolean}
 */
function unreadableLinkTarget(target) {
  if (/[$`{*?]/.test(target)) return true
  const bare = unquote(target)
  return bare === '' || bare.startsWith('/') || bare.startsWith('~') || /(?:^|\/)\.\.(?:\/|$)/.test(bare)
}

/**
 * The link targets one `ln`/`cp` invocation names, when it makes SYMBOLIC links; null when it does
 * not. GNU and busybox share the option shapes that matter here: `-s`/`--symbolic` (`ln`),
 * `-s`/`--symbolic-link` (`cp`) — alone or in any short cluster (`-sf`, `-fs`, `-snf`, `-as`) and in
 * any position, a long option by any unambiguous prefix (`--sym`); `-t DIR`/`--target-directory`
 * makes every operand a target, otherwise every operand but the destination is one; `--` ends the
 * options. A symbolic flag written AFTER `--` is an operand to getopt, and is read as the flag
 * anyway: refusing a link that is not one costs a rename, missing one costs the fence.
 * @param {'ln' | 'cp'} tool
 * @param {string[]} words - the words after the command name, up to the end of the command.
 * @returns {string[] | null}
 */
function symbolicTargets(tool, words) {
  let symbolic = false
  let intoDirectory = false
  /** @type {string[]} */
  const operands = []
  let options = true
  for (let i = 0; i < words.length; i++) {
    const word = unquote(words[i])
    if (options && word === '--') {
      options = false
      continue
    }
    if (!options && (/^-[A-Za-z]*s[A-Za-z]*$/.test(word) || word.startsWith('--sy'))) {
      symbolic = true
      continue
    }
    if (options && word.startsWith('--')) {
      const long = word.slice(2).split('=')[0]
      if (
        long.length >= 2 &&
        'symbolic-link'.startsWith(long) &&
        (tool === 'cp' || 'symbolic'.startsWith(long))
      )
        symbolic = true
      if (long.length >= 2 && 'target-directory'.startsWith(long)) {
        intoDirectory = true
        if (!word.includes('=')) i++
      }
      if (long.length >= 2 && 'suffix'.startsWith(long) && !word.includes('=')) i++
      continue
    }
    if (options && /^-[A-Za-z]+$/.test(word)) {
      if (word.includes('s')) symbolic = true
      if (word.includes('t')) intoDirectory = true
      // `-t DIR` and `-S SUFFIX` take the next word when they end the cluster.
      if (word.endsWith('t') || word.endsWith('S')) i++
      continue
    }
    operands.push(words[i])
  }
  if (!symbolic) return null
  return intoDirectory || operands.length < 2 ? operands : operands.slice(0, -1)
}

/**
 * The first argument of a language-level symlink call, as written: `symlink('a', 'b')` (PHP, Perl,
 * Python's `os.symlink`, Node's `fs.symlink`/`symlinkSync`) and Python's `Path(link).symlink_to(a)`
 * all take the TARGET there. Perl may drop the parentheses (`symlink "a", "b"`), which only counts
 * when the command runs perl, so prose that says "symlink" is not read as a call.
 *
 * Only a plain quoted literal can be judged; anything else — a variable, an f-string, a joined path,
 * an escaped quote — is returned as `literal: false`, and the caller refuses it.
 * @param {string} command
 * @returns {{ target: string, literal: boolean }[]} one entry per call.
 */
function languageSymlinkTargets(command) {
  /** @type {string[]} */
  const targets = []
  const call = /\b(?:symlinkSync|symlink_to|symlink)\s*\(\s*/g
  for (const m of command.matchAll(call)) targets.push(command.slice(m.index + m[0].length))
  if (/\bperl\b/.test(command))
    for (const m of command.matchAll(/\bsymlink\s+(?=[^\s(])/g))
      targets.push(command.slice(m.index + m[0].length))
  // Keep only the leading argument: a quoted literal when there is one, else whatever comes first.
  return targets.map((rest) => {
    const literal = /^(['"])((?:(?!\1)[^\\])*)\1\s*[,)]/.exec(rest)
    return literal
      ? { target: literal[2], literal: true }
      : { target: rest.split(/[,)\s]/)[0] ?? '', literal: false }
  })
}

/**
 * The refusal-worthy symlink one shell command makes, or null: how it is made (`ln -s`, `cp -s`,
 * `symlink()`) and the target as written.
 *
 * 🔒 THE PRECONDITION OF A SWAPPED-LINK RACE. The path fence resolves a path once, then dsh's own tool
 * opens it again; a link flipped between the two would be followed out of the site. The race needs a
 * link that leads out, so refusing to MAKE one (an absolute, home or `..` target, or one the shell
 * computes at run time) takes the primitive away. Until 09/10/2026 this matched only the literal
 * text `ln -s`, and `/bin/ln -s`, `ln -s -- /x f`, `T=/x; ln -s "$T" f`, `busybox ln -s`,
 * `php -r 'symlink(…)'` and `python3 -c 'os.symlink(…)'` all passed. It now reads `ln` and `cp` by
 * any path or through busybox/toybox, with the symbolic flag anywhere, and the symlink calls of
 * PHP, Python, Perl and Node.
 *
 * STILL A TEXT MATCH, NOT A BOUNDARY — like every rule here. A script file the command runs, an
 * alias, `eval` of a built string all make a link no match sees; the container and the path fence
 * remain the boundaries, and the exit sweep (`index.js` `attachReaper`) is what ends a loop that
 * swaps one. Reading a link (`readlink`, `ls -l`, `stat`) is never matched.
 * @param {string} command
 * @returns {{ via: string, target: string } | null}
 */
export function outsideSymlinkIn(command) {
  // Every simple command, quotes ignored on purpose: `sh -c '…; ln -s /x f'` must still be read.
  for (const segment of command.split(/&&|\|\||[;&|\n()`]|\$\(/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean)
    // A command starts the segment, and also follows find's `-exec`/`-execdir`/`-ok`.
    const starts = [0, ...words.flatMap((word, i) => (/^-(?:exec|ok)(?:dir)?$/.test(word) ? [i + 1] : []))]
    for (let at of starts) {
      while (at < words.length) {
        const word = commandName(words[at])
        const prefix = COMMAND_PREFIX.has(word) || /^\w+=/.test(words[at]) || /^\d+$/.test(word)
        if (!prefix && !words[at].startsWith('-')) break
        at++
      }
      if (at < words.length && MULTICALL.has(commandName(words[at]))) at++
      const tool = at < words.length ? commandName(words[at]) : ''
      if (tool !== 'ln' && tool !== 'cp') continue
      const target = symbolicTargets(tool, words.slice(at + 1))?.find(unreadableLinkTarget)
      if (target !== undefined) return { via: `${tool} -s`, target: unquote(target) }
    }
  }
  for (const { target, literal } of languageSymlinkTargets(command))
    if (!literal || unreadableLinkTarget(target)) return { via: 'symlink()', target }
  return null
}

/** The files a CMS keeps its database password in, at the webroot. */
const WEBROOT_SECRETS = Object.freeze(['wp-config.php', 'configuration.php'])

/** The path argument each reading tool opens. */
const READ_TARGET = new Map([
  ['read', 'file_path'],
  ['grep', 'path'],
  // Its `view` command opens a file like `read` does; the editing commands are the write fence's.
  ['str_replace_editor', 'path']
])

/**
 * The argument naming the file a reading tool opens, or null for any other tool.
 * @param {string} name - the tool name as registered.
 * @returns {string | null}
 */
export function readTargetArg(name) {
  return READ_TARGET.get(name) ?? null
}

/**
 * Config a CMS keeps in its secrets file that is NOT a secret — the site's identity, which an agent
 * has ordinary reasons to read. Joomla keeps these in `configuration.php` beside the password.
 */
const JOOMLA_PUBLIC_CONFIG = Object.freeze([
  'sitename',
  'MetaDesc',
  'MetaTitle',
  'MetaKeys',
  'sitename_pagetitles'
])

/**
 * @param {string} file - the secrets file as the question names it.
 * @param {string} [platform] - `joomla` or `wordpress`, when the caller knows it.
 * @returns {string}
 *
 * 🔒 A REFUSAL THAT NAMES NO NEXT STEP IS A DETOUR, NOT A STOP — CLAUDE.md §6 (`refusal-next`).
 * Until 19/09 this sentence only said "read CMS data through tracy_site instead", and for Joomla that
 * door DOES NOT EXIST: `sitename`, `MetaDesc`, `MetaTitle` live in `configuration.php` itself, not in
 * the database, and the component's `SiteWriter::KINDS` has no kind for them. Measured on
 * `--site-demojjjj--` 19/09: the agent ran `grep "sitename|MetaDesc|MetaTitle" .webroot/configuration.php`
 * — looking for the SITE NAME, not the password — was blocked, and it happened again in two sessions.
 */
function secretsReason(file, platform) {
  const next =
    platform === 'joomla'
      ? `read one option at a time with \`php .webroot/cli/joomla.php config:get <option>\` (${JOOMLA_PUBLIC_CONFIG.join(', ')}); that command is refused for the credential options`
      : 'read CMS data through tracy_site instead'
  return `${file} holds the database password; ${next}.`
}

/**
 * The approval question for opening a site's secrets file, or null.
 * @param {string} resolved - the symlink-resolved path the tool opens.
 * @param {string} siteRoot - the symlink-resolved site folder.
 * @returns {string | null}
 */
export function secretsFileReason(resolved, siteRoot) {
  const atWebroot = WEBROOT_SECRETS.some((file) => resolved === `${siteRoot}/.webroot/${file}`)
  // `.env`, `.env.local`, `.env.production`… and `.dev.vars` (the Cloudflare-style secrets file).
  const dotenv =
    resolved.startsWith(`${siteRoot}/`) &&
    /\/(\.env(\.[\w-]+)?|\.dev\.vars)$/.test(resolved) &&
    !/\.(example|sample|dist|template)$/.test(resolved)
  if (!atWebroot && !dotenv) return null
  // The platform is read from the file name ITSELF — only Joomla creates `configuration.php`, and it
  // is the only one of these three files whose next step exists (see `secretsReason`).
  const platform = resolved.endsWith('/configuration.php') ? 'joomla' : undefined
  return secretsReason(resolved.slice(siteRoot.length + 1), platform)
}

/**
 * A secrets file named as a whole word of a shell command, a word being a run of file-name
 * characters: `.webroot/wp-config.php` and `"$DIR/.env"` name one, `wp-config.php.bak`, `my.env` and
 * `.env.example` do not.
 */
const SECRETS_WORD = /(?<![\w.-])(wp-config\.php|configuration\.php|\.env)(?![\w.-])/

/**
 * The option names a CMS config reader must never print. Joomla's `config:get` and wp-cli's
 * `config get` read the SAME file the fence protects, so they are the same question asked sideways.
 */
const CREDENTIAL_OPTION =
  /^(password|user|db|host|secret|ftp_pass|ftp_user|smtppass|smtpuser|mailfrom|db_password|db_user|db_name|db_host|[a-z_]*_?(?:key|salt)|auth_key|auth_salt)$/i

/**
 * A CMS config reader and the option it was asked for: `php cli/joomla.php config:get <option>`, or
 * wp-cli's `wp config get <name>`. `null` when the command is not one of those.
 *
 * 🔒 THE FENCE GUARDED THE FILE AND LEFT THE DOOR BESIDE IT OPEN — measured 19/09 on `demojjjj`.
 * `grep … .webroot/configuration.php` was blocked, but `php cli/joomla.php config:get password` printed
 * the password straight out, and bare `config:get` dumped the WHOLE configuration, `password` and
 * `secret` included. The old fence matched only the FILE NAME, so it blocked the laborious way of
 * asking and let the easier one through. Neither of those two runs was the agent acting on purpose —
 * but a refusal is only trustworthy when it blocks both paths to the same secret.
 *
 * @param {string} command
 * @returns {{ reader: string, option: string | null } | null} `option: null` = the whole table was asked for.
 */
function configReaderIn(command) {
  const joomla = /\bconfig:get\b(?:\s+(?:-[-\w]+(?:=\S+)?\s+)*)?(\S+)?/.exec(command)
  if (joomla) return { reader: 'config:get', option: joomla[1] ?? null }
  const wp = /\bwp\b[^\n;|&]*?\bconfig\s+get\b(?:\s+(?:-[-\w]+(?:=\S+)?\s+)*)?(\S+)?/.exec(command)
  if (wp) return { reader: 'wp config get', option: wp[1] ?? null }
  return null
}

/**
 * The refusal one shell command earns, or null when it earns none.
 * @param {string} command - the command text the model wrote.
 * @returns {string | null}
 */
export function commandApprovalReason(command) {
  const link = outsideSymlinkIn(command)
  if (link !== null)
    return `${link.via} ${link.target} would make a link that leaves the site folder, or one whose target is only known when it runs; the file fence resolves a path once and a link can be moved afterwards. Link to a path inside the site folder, written out literally and relative to it (ln -s assets/img.png hero.png), or copy the file instead.`
  const secret = SECRETS_WORD.exec(command)
  if (secret !== null)
    return secretsReason(secret[1], secret[1] === 'configuration.php' ? 'joomla' : undefined)
  const reader = configReaderIn(command)
  if (reader === null) return null
  // The whole table always contains credentials; for a single option only the credential options are
  // blocked, because `sitename` and `MetaDesc` are why `secretsReason` above names this path.
  if (reader.option === null)
    return `${reader.reader} with no option prints every setting, the database password among them; ask for one option by name.`
  return CREDENTIAL_OPTION.test(reader.option)
    ? `${reader.reader} ${reader.option} would print a credential; read a non-credential option by name instead.`
    : null
}
