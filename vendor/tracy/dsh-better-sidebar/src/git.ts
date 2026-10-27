/**
 * Git operations for the sidebar source-control panel. Everything goes
 * through the system `git` binary spawned per request (no library, no state),
 * with porcelain-parseable output formats (`-z` NUL framing, unit separators)
 * so parsing never depends on locale or color config. All commands run with
 * `-C <cwd>` on the session's working directory and `--no-pager` /
 * `-c color.ui=false` so output stays machine-readable.
 *
 * Commits use the user's git global identity untouched (never sets
 * user.name/user.email).
 */
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { isWithin } from './fs-tree.ts'
import { SidebarError } from './wire.ts'

/** A parsed `git status --porcelain=v1 -z` entry. */
export interface GitStatusEntry {
  path: string
  /** Two-letter index/worktree status (X Y), e.g. 'M ', ' M', 'A ', '??'. */
  xy: string
}

/** The source-control panel snapshot. */
export interface GitStatusResult {
  isRepo: boolean
  branch?: string
  entries: GitStatusEntry[]
  /** True when the working tree had more rows than `GIT_STATUS_LIMIT`; the
   *  panel shows a truncation notice instead of freezing on a huge untracked
   *  set (issue #369). */
  truncated?: boolean
  /** Selected repository root, or the discovered roots when the cwd is a container. */
  root?: string
  repositories?: string[]
}

/** One linked checkout returned by `git worktree list --porcelain`. */
export interface GitWorktree {
  /** Absolute checkout root. */
  path: string
  /** Branch name without `refs/heads/`, or `HEAD` when detached. */
  branch: string
  /** Whether this checkout contains the session cwd. */
  current: boolean
  /** Number of staged + unstaged status rows (a file changed on both sides counts once). */
  changes: number
}

/** One `git log` row. */
export interface GitLogEntry {
  /** Short hash (7+ chars, display). */
  hash: string
  /** Full 40-char hash (advanced operations: revert / cherry-pick). */
  hashFull: string
  subject: string
  author: string
  /** ISO 8601 author date (`%ai`), e.g. `2024-01-01 10:00:00 +0800`. */
  date: string
  /** Ref decorations (`%D` with --decorate=short), e.g. `HEAD -> main, origin/main`; '' when none. */
  refs: string
}

/** One git failure (stderr text as the message). */
export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly code = 'git-error',
    readonly command: string,
  ) {
    super(message)
  }
}

/** Parse porcelain v1 -z output into entries (rename/copy pairs collapse to one row). */
export function parsePorcelainZ(output: string): GitStatusEntry[] {
  const tokens = output.split('\0')
  const entries: GitStatusEntry[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    index += 1
    if (token === '') continue
    const xy = token.slice(0, 2)
    const rest = token.slice(3)
    entries.push({ path: rest, xy })
    // Rename/copy entries carry the ORIGIN path as the next NUL field; the
    // new path (the file as it exists now) is the display path.
    if ((xy[0] === 'R' || xy[0] === 'C') && tokens[index] !== undefined && tokens[index] !== '') {
      index += 1
    }
  }
  return entries
}

/** One raw porcelain worktree record. Prunable checkouts are retained by
 * Git's administrative metadata after their directory disappears and must not
 * become selectable command targets. Locked checkouts remain usable. */
export interface GitWorktreeRecord {
  path: string
  branch: string
  locked: boolean
  prunable: boolean
}

/** Parse `git worktree list --porcelain` records. Production requests use
 * `-z` so even newlines and non-ASCII bytes in checkout paths stay lossless;
 * newline framing remains accepted for small fixtures and older Git output. */
export function parseWorktreeList(output: string): GitWorktreeRecord[] {
  const rows: GitWorktreeRecord[] = []
  let path: string | undefined
  let branch = 'HEAD'
  let locked = false
  let prunable = false
  const flush = (): void => {
    if (path !== undefined) rows.push({ path, branch, locked, prunable })
    path = undefined
    branch = 'HEAD'
    locked = false
    prunable = false
  }
  const sep = output.includes('\0') ? '\0' : '\n'
  const framed = output.endsWith(sep) ? output : `${output}${sep}`
  for (const line of framed.split(sep)) {
    if (line === '') {
      flush()
    } else if (line.startsWith('worktree ')) {
      path = line.slice('worktree '.length)
    } else if (line.startsWith('branch refs/heads/')) {
      branch = line.slice('branch refs/heads/'.length)
    } else if (line === 'locked' || line.startsWith('locked ')) {
      locked = true
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      prunable = true
    }
  }
  return rows
}

/** Parse `git log --pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D` rows. */
export function parseLogLines(output: string): GitLogEntry[] {
  const rows: GitLogEntry[] = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [hash, subject, author, date, hashFull, refs] = line.split('\x1f')
    if (hash === undefined || subject === undefined) continue
    rows.push({
      hash,
      subject,
      author: author ?? '',
      date: date ?? '',
      hashFull: hashFull ?? hash,
      refs: refs ?? '',
    })
  }
  return rows
}

/**
 * Tracy: git executes programs named by the REPOSITORY's own files —
 * `core.fsmonitor`, hooks, filter/merge/diff drivers, pagers, signing
 * programs, `include.path` pulling any of those in — and this module runs in
 * the host's single dsh process, on site folders a customer's agent can
 * write. Two layers keep every call from running them:
 *
 * 1. `safeGit` never lets git read the repository's config at all. It hands
 *    git a private common directory (`GIT_COMMON_DIR`) whose `config` holds
 *    only a whitelist of inert keys copied from a snapshot of the real one
 *    (no includes, no drivers, no per-worktree config), and whose `objects`,
 *    `refs`, `logs`… are symlinks to the real repository. Git reads that
 *    snapshot, not the live file, so a config rewritten between our read and
 *    git's read changes nothing — enumerating driver names and overriding
 *    them with `-c` would lose exactly that race. Hooks live in the common
 *    directory too, so `.git/hooks` is never seen either.
 * 2. Every call (including the two that must see the real repository,
 *    `probeGit`) carries command-line overrides, which outrank every config
 *    file and every include, for each fixed-name key that runs a program.
 *
 * Submodules are not descended into: a child git there would read the
 * submodule's own config. The system and global config files stay in effect:
 * they belong to the operator (the image and dsh's HOME), not to a site.
 */
const HARDENING: readonly string[] = [
  'core.fsmonitor=false',
  'core.hooksPath=/dev/null',
  'core.pager=cat',
  'core.editor=:',
  'sequence.editor=:',
  'core.askPass=',
  'credential.helper=',
  'diff.external=',
  'commit.gpgSign=false',
  'tag.gpgSign=false',
  'log.showSignature=false',
  'gc.auto=0',
  'maintenance.auto=false',
  'submodule.recurse=false',
  'diff.ignoreSubmodules=all',
  'protocol.allow=never',
  'color.ui=false',
].flatMap(pair => ['-c', pair])

/** Keys copied from the repository's config into the private one: what git
 * needs to read the repository correctly, none of which names a program. */
const SAFE_CONFIG_KEYS = new Set([
  'core.repositoryformatversion',
  'core.filemode',
  'core.symlinks',
  'core.ignorecase',
  'core.precomposeunicode',
  'core.autocrlf',
  'core.eol',
  'core.safecrlf',
  'core.checkstat',
  'core.trustctime',
  'core.logallrefupdates',
  'extensions.objectformat',
  'extensions.refstorage',
])
const SAFE_CONFIG_VALUE = /^[A-Za-z0-9._-]{0,64}$/

/** Entries of the common directory the private one links to (everything git
 * keeps there except `config`, `hooks` and `info/attributes`). */
const SHARED_ENTRIES = ['objects', 'refs', 'packed-refs', 'logs', 'worktrees', 'shallow', 'reftable']

/** Environment for every git child: none of the dsh process's own GIT_*
 * variables leak in, nothing can prompt, and nothing fetches lazily. */
function gitEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value
  }
  return {
    ...env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_PAGER: 'cat',
    ...extra,
  }
}

/** The only place a git process is started. Callers: `probeGit`,
 * `readSafeConfig` and `safeGit` (a test pins this list). */
function spawnGit(args: string[], env: NodeJS.ProcessEnv, cwd: string | undefined, timeoutMs: number): Promise<string> {
  const label = args.join(' ')
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new GitCommandError(`git timed out after ${timeoutMs}ms`, 'git-error', label))
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new GitCommandError(`cannot run git: ${error.message}`, 'git-error', label))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolvePromise(stdout)
      } else {
        reject(new GitCommandError(stderr.trim() || `git exited with ${String(code)}`, 'git-error', label))
      }
    })
  })
}

/** Commands that must see the real repository (to find it, and to list its
 * linked worktrees by their real paths) and that read no index, no work tree
 * file and no attribute: nothing in them can reach a driver, a hook or
 * fsmonitor. Anything else goes through `safeGit`. Discovery never climbs
 * above the workspace (`GIT_CEILING_DIRECTORIES` is its parent). */
function probeGit(cwd: string, realWorkspace: string, args: string[], timeoutMs = 30_000): Promise<string> {
  const allowed = args[0] === 'rev-parse' || (args[0] === 'worktree' && args[1] === 'list')
  if (!allowed) throw new Error(`probeGit does not run "${args[0] ?? ''}"; use safeGit`)
  return spawnGit(
    ['-C', cwd, '--no-pager', ...HARDENING, ...args],
    gitEnv({ GIT_CEILING_DIRECTORIES: dirname(realWorkspace) }),
    undefined,
    timeoutMs,
  )
}

/** The whitelisted keys of the repository's own config file, read as a
 * plain file (`--file`, no includes). A config git cannot parse fails the
 * call: better a panel error than a guess. */
async function readSafeConfig(commonDir: string, scratch: string): Promise<string> {
  let raw: string
  try {
    raw = await spawnGit(
      ['--no-pager', 'config', '--file', join(commonDir, 'config'), '--no-includes', '--null', '--list'],
      gitEnv({ GIT_CEILING_DIRECTORIES: dirname(scratch) }),
      scratch,
      DISCOVERY_TIMEOUT_MS,
    )
  } catch (error) {
    throw new GitCommandError(`unreadable repository config: ${(error as Error).message}`, 'git-error', 'config')
  }
  const sections = new Map<string, string[]>()
  for (const record of raw.split('\0')) {
    const newline = record.indexOf('\n')
    if (newline < 0) continue
    const key = record.slice(0, newline)
    const value = record.slice(newline + 1)
    if (!SAFE_CONFIG_KEYS.has(key) || !SAFE_CONFIG_VALUE.test(value)) continue
    const [section, name] = key.split('.') as [string, string]
    sections.set(section, [...(sections.get(section) ?? []), `\t${name} = ${value}`])
  }
  return [...sections].map(([section, lines]) => `[${section}]\n${lines.join('\n')}\n`).join('')
}

/**
 * Tracy: one repository the panel may work on, every path of it resolved
 * (symlinks followed) and checked to sit INSIDE the session workspace. A site
 * folder can redirect git anywhere on the host — a `.git` pointer file or
 * symlink, `core.worktree`, a linked worktree's `commondir`, a symlinked
 * `objects`/`refs`, object alternates — and the one dsh process can read and
 * write every site, so any of those is refused (403) before git runs on it.
 */
interface Repo { workspace: string; gitDir: string; commonDir: string; workTree: string }

function outsideWorkspace(what: string, path: string): SidebarError {
  return new SidebarError('forbidden', `git ${what} "${path}" is outside the session workspace`, 403)
}

async function realWorkspaceOf(workspace: string): Promise<string> {
  try {
    return await realpath(workspace)
  } catch (error) {
    throw new SidebarError('fs-error', `cannot resolve workspace "${workspace}": ${(error as Error).message}`, 400)
  }
}

/** The real path of `path`, refused when it is outside the workspace. */
async function insideWorkspace(realWorkspace: string, path: string, what: string): Promise<string> {
  let real: string
  try {
    real = await realpath(path)
  } catch {
    throw new GitCommandError(`git ${what} "${path}" does not exist`, 'not-repo', 'rev-parse')
  }
  if (!isWithin(realWorkspace, real)) throw outsideWorkspace(what, path)
  return real
}

/**
 * Before git is asked anything about `cwd`: find the `.git` its discovery
 * would use (walking up no further than the workspace) and check where a
 * pointer file, a symlink or a linked worktree's `commondir` lead, so git
 * never reads a byte of a repository outside the workspace.
 */
async function checkGitEntry(cwd: string, realWorkspace: string): Promise<void> {
  let dir = await insideWorkspace(realWorkspace, cwd, 'directory')
  for (;;) {
    const entry = join(dir, '.git')
    const info = await lstat(entry).catch(() => null)
    if (info !== null) {
      let gitDir: string
      if (info.isFile()) {
        const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(await readFile(entry, 'utf8'))
        if (pointer === null) return
        gitDir = await insideWorkspace(realWorkspace, resolve(dir, pointer[1]!), 'directory')
      } else {
        gitDir = await insideWorkspace(realWorkspace, entry, 'directory')
      }
      const commonDir = await readFile(join(gitDir, 'commondir'), 'utf8').catch(() => null)
      if (commonDir !== null) await insideWorkspace(realWorkspace, resolve(gitDir, commonDir.trim()), 'common directory')
      return
    }
    if (dir === realWorkspace) return
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

/** Every symlink directly inside a git directory, and every object
 * alternate, must lead inside the workspace too. */
async function checkGitDirLinks(dir: string, realWorkspace: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isSymbolicLink()) await insideWorkspace(realWorkspace, join(dir, entry.name), 'path')
  }
  for (const file of [join(dir, 'objects', 'info', 'alternates'), join(dir, 'objects', 'info', 'http-alternates')]) {
    const text = await readFile(file, 'utf8').catch(() => '')
    for (const line of text.split('\n').map(value => value.trim())) {
      if (line === '' || line.startsWith('#')) continue
      if (file.endsWith('http-alternates')) throw outsideWorkspace('object alternate', line)
      await insideWorkspace(realWorkspace, resolve(join(dir, 'objects'), line), 'object alternate')
    }
  }
}

/** Resolve and fence the repository whose top level is `root`. */
async function openRepo(root: string, realWorkspace: string): Promise<Repo> {
  await checkGitEntry(root, realWorkspace)
  const out = await probeGit(root, realWorkspace, ['rev-parse', '--path-format=absolute', '--absolute-git-dir', '--git-common-dir', '--show-toplevel'], DISCOVERY_TIMEOUT_MS)
  const [gitDir, commonDir, workTree] = out.split('\n')
  if (!gitDir || !commonDir || !workTree) throw new GitCommandError('not a git repository', 'not-repo', 'rev-parse')
  const repo: Repo = {
    workspace: realWorkspace,
    gitDir: await insideWorkspace(realWorkspace, gitDir, 'directory'),
    commonDir: await insideWorkspace(realWorkspace, commonDir, 'common directory'),
    workTree: await insideWorkspace(realWorkspace, workTree, 'work tree'),
  }
  await checkGitDirLinks(repo.gitDir, realWorkspace)
  if (repo.commonDir !== repo.gitDir) await checkGitDirLinks(repo.commonDir, realWorkspace)
  return repo
}

/** Run one git command on a fenced repository without letting its config,
 * hooks or `info/attributes` reach git (see above). */
async function safeGit(repo: Repo, args: string[], timeoutMs = 30_000): Promise<string> {
  const common = await mkdtemp(join(tmpdir(), 'dsh-sidebar-git-'))
  try {
    await writeFile(join(common, 'config'), await readSafeConfig(repo.commonDir, common))
    await Promise.all(SHARED_ENTRIES.map(name => symlink(join(repo.commonDir, name), join(common, name))))
    await mkdir(join(common, 'info'))
    await symlink(join(repo.commonDir, 'info', 'exclude'), join(common, 'info', 'exclude'))
    return await spawnGit(
      ['--no-pager', ...HARDENING, ...args],
      gitEnv({ GIT_DIR: repo.gitDir, GIT_COMMON_DIR: common, GIT_WORK_TREE: repo.workTree }),
      repo.workTree,
      timeoutMs,
    )
  } finally {
    await rm(common, { recursive: true, force: true })
  }
}

/** Cap on child directories probed by the workspace-container fallback scan.
 *  A home-directory cwd can hold hundreds of visible folders (Library, iCloud
 *  mounts…); probing them all serially is what froze the panel in #369. */
const DISCOVERY_LIMIT = 200
/** Per-probe and direct-discovery budget. `rev-parse` is millisecond-scale on
 *  a healthy checkout; a probe that needs longer is a stalled mount and is
 *  better abandoned than waited on. */
const DISCOVERY_TIMEOUT_MS = 5_000
/** Discovery results are cheap to recompute but expensive to storm: the panel
 *  polls every 2s and each poll fans out into several git.* calls that all
 *  resolve the same roots. A short TTL keeps fan-out at one scan per cwd. */
const DISCOVERY_CACHE_TTL_MS = 60_000

const repoRootsCache = new Map<string, { roots: string[]; expires: number }>()
const repoRootsInFlight = new Map<string, Promise<string[]>>()

/** A refusal is the answer, never a reason to keep looking elsewhere. */
function rethrowRefusal(error: unknown): void {
  if (error instanceof SidebarError) throw error
}

/** Whether the directory is inside a git work tree (exit-0 `git rev-parse`).
 *  Probe timeout is short: a cwd on a stalled mount must not hold the panel
 *  hostage for the full command budget (issue #369). `workspace` is the
 *  session workspace the repository must sit in (defaults to `cwd`). */
export async function isGitRepo(cwd: string, workspace: string = cwd): Promise<boolean> {
  try {
    const realWorkspace = await realWorkspaceOf(workspace)
    await checkGitEntry(cwd, realWorkspace)
    // `--show-toplevel` first: a work tree moved outside (`core.worktree`)
    // is a refusal, not merely "cwd is not in a work tree".
    const [top, inside] = (await probeGit(cwd, realWorkspace, ['rev-parse', '--show-toplevel', '--is-inside-work-tree'], DISCOVERY_TIMEOUT_MS)).split('\n')
    await insideWorkspace(realWorkspace, top ?? '', 'work tree')
    return inside === 'true'
  } catch (error) {
    rethrowRefusal(error)
    return false
  }
}

/** The repository top level containing `cwd` (`git rev-parse --show-toplevel`). */
async function directRepoRoot(cwd: string, realWorkspace: string): Promise<string> {
  await checkGitEntry(cwd, realWorkspace)
  const out = await probeGit(cwd, realWorkspace, ['rev-parse', '--show-toplevel'], DISCOVERY_TIMEOUT_MS)
  return insideWorkspace(realWorkspace, out.trim(), 'work tree')
}

/** Discover the current repository or direct child repositories. Results are
 *  cached per cwd and concurrent callers share one in-flight scan, so opening
 *  the panel (three parallel git.* requests) costs a single discovery pass. */
export function repoRoots(cwd: string, workspace: string = cwd): Promise<string[]> {
  const key = `${workspace}\0${cwd}`
  const cached = repoRootsCache.get(key)
  if (cached !== undefined && cached.expires > Date.now()) return Promise.resolve(cached.roots)
  const pending = repoRootsInFlight.get(key)
  if (pending !== undefined) return pending
  const promise = realWorkspaceOf(workspace).then(real => discoverRepoRoots(cwd, real)).then(
    (roots) => {
      repoRootsCache.set(key, { roots, expires: Date.now() + DISCOVERY_CACHE_TTL_MS })
      repoRootsInFlight.delete(key)
      return roots
    },
    (error: unknown) => {
      repoRootsInFlight.delete(key)
      throw error
    },
  )
  repoRootsInFlight.set(key, promise)
  return promise
}

async function discoverRepoRoots(cwd: string, realWorkspace: string): Promise<string[]> {
  try {
    return [await directRepoRoot(cwd, realWorkspace)]
  } catch (error) {
    rethrowRefusal(error)
    const entries = await readdir(cwd, { withFileTypes: true }).catch(() => [])
    const roots: string[] = []
    for (const entry of entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, DISCOVERY_LIMIT)) {
      try {
        const root = await directRepoRoot(join(cwd, entry.name), realWorkspace)
        if (!roots.some(existing => pathIdentity(existing) === pathIdentity(root))) roots.push(root)
      } catch (childError) {
        rethrowRefusal(childError)
        // Ordinary child directory; keep discovering sibling repositories.
      }
    }
    return roots
  }
}

/** Resolve the selected repository, defaulting to the first discovered root. */
export async function repoRoot(cwd: string, selected?: string, workspace: string = cwd): Promise<string> {
  const roots = await repoRoots(cwd, workspace)
  if (roots.length === 0) throw new GitCommandError('not a git repository', 'not-repo', 'rev-parse')
  // Git for Windows may return forward-slash roots while callers pass
  // backslashes (or vice-versa); compare via the platform-aware identity.
  if (selected !== undefined) {
    const identity = pathIdentity(selected)
    const match = roots.find(root => pathIdentity(root) === identity)
    if (match !== undefined) return match
  }
  return roots[0]!
}

/** The fenced repository a route works on. */
async function repoOf(cwd: string, selected: string | undefined, workspace: string): Promise<Repo> {
  return openRepo(await repoRoot(cwd, selected, workspace), await realWorkspaceOf(workspace))
}

/** The current branch name (`git rev-parse --abbrev-ref HEAD`; 'HEAD' when detached). */
async function currentBranch(repo: Repo): Promise<string> {
  const out = await safeGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return out.trim()
}

/** Upper bound on status rows shipped to the client. Beyond this the result
 *  is truncated (with `truncated: true`) so a pathological untracked set —
 *  e.g. the working tree discovered under a home-directory cwd — cannot
 *  freeze the browser main thread on JSON parse or list render (#369). */
const GIT_STATUS_LIMIT = 2_000

/**
 * Working-tree status (untracked included). `--untracked-files=all` lists
 * the contents of new directories as individual entries, while preserving
 * repository discovery and explicit repository selection for workspace roots.
 */
export async function status(cwd: string, selected?: string, workspace: string = cwd): Promise<GitStatusResult> {
  const repositories = await repoRoots(cwd, workspace)
  if (repositories.length === 0) return { isRepo: false, entries: [], repositories: [] }
  const repo = await repoOf(cwd, selected, workspace)
  const [branch, raw] = await Promise.all([
    currentBranch(repo).catch(() => 'HEAD'),
    safeGit(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']),
  ])
  const parsed = parsePorcelainZ(raw)
  const truncated = parsed.length > GIT_STATUS_LIMIT
  return {
    isRepo: true,
    branch,
    entries: truncated ? parsed.slice(0, GIT_STATUS_LIMIT) : parsed,
    truncated,
    root: repo.workTree,
    repositories,
  }
}

/** Platform-aware identity used only for comparing absolute checkout roots. */
function pathIdentity(path: string): string {
  const absolute = resolve(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

/** Whether the current Git binary supports NUL-framed `worktree list` output.
 * Git < 2.36 rejects `-z`; cache the capability after the first attempt so
 * the SCM panel's polling does not repeatedly spawn a command known to fail. */
let worktreeListSupportsZ: boolean | undefined

/** Raw usable checkout records, shared by inventory and target validation.
 * Prunable records point at missing paths and are deliberately excluded from
 * both the selector and the command-target allowlist; so is any checkout
 * outside the session workspace (Tracy). */
async function listedWorktrees(repo: Repo): Promise<GitWorktreeRecord[]> {
  let raw: string
  if (worktreeListSupportsZ === false) {
    raw = await probeGit(repo.workTree, repo.workspace, ['worktree', 'list', '--porcelain'])
  } else {
    try {
      raw = await probeGit(repo.workTree, repo.workspace, ['worktree', 'list', '--porcelain', '-z'])
      worktreeListSupportsZ = true
    } catch {
      worktreeListSupportsZ = false
      raw = await probeGit(repo.workTree, repo.workspace, ['worktree', 'list', '--porcelain'])
    }
  }
  const rows: GitWorktreeRecord[] = []
  for (const entry of parseWorktreeList(raw)) {
    if (entry.prunable) continue
    const real = await realpath(entry.path).catch(() => null)
    if (real !== null && isWithin(repo.workspace, real)) rows.push(entry)
  }
  return rows
}

/** All linked checkouts of the repository containing `cwd`, enriched with a
 * live change count. The current checkout is first so a single-worktree repo
 * preserves the old UI ordering. */
export async function worktrees(cwd: string, workspace: string = cwd): Promise<GitWorktree[]> {
  if (!await isGitRepo(cwd, workspace)) return []
  const current = await repoOf(cwd, undefined, workspace)
  const listed = await listedWorktrees(current)
  const rows = await Promise.all(listed.map(async (entry): Promise<GitWorktree> => ({
    path: entry.path,
    branch: entry.branch,
    current: pathIdentity(entry.path) === pathIdentity(current.workTree),
    // One stale/permission-raced linked checkout must not hide the valid
    // current repository from the panel. Targeted operations still fail loud.
    changes: await status(entry.path, undefined, workspace).then(result => result.entries.length, () => 0),
  })))
  return rows.sort((left, right) => Number(right.current) - Number(left.current))
}

/** Resolve an optional client-selected linked checkout. A caller may never use
 * this seam to point Git operations at an unrelated repository: the target
 * must occur in the authoritative session repository's worktree list, inside
 * the session workspace. */
export async function resolveWorktree(cwd: string, requested?: string, workspace: string = cwd): Promise<string> {
  if (requested === undefined || requested === '') return cwd
  const identity = pathIdentity(requested)
  const match = (await listedWorktrees(await repoOf(cwd, undefined, workspace))).find(entry => pathIdentity(entry.path) === identity)
  if (match === undefined) {
    throw new SidebarError('forbidden', `unknown linked worktree: ${requested}`, 403)
  }
  return match.path
}

/** Diff text of the worktree (unstaged) or the index (staged). */
export async function diff(cwd: string, path: string | undefined, staged: boolean, selected?: string, workspace: string = cwd): Promise<string> {
  const repo = await repoOf(cwd, selected, workspace)
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--no-color', '-U3']
  if (staged) args.push('--cached')
  if (path !== undefined) args.push('--', path)
  return safeGit(repo, args)
}

/** Stage paths (all when path is undefined). */
export async function stage(cwd: string, path: string | undefined, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['add', '-A', ...(path !== undefined ? ['--', path] : [])])
}

/** Unstage paths (all when path is undefined). */
export async function unstage(cwd: string, path: string | undefined, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['reset', '-q', ...(path !== undefined ? ['--', path] : [])])
}

/** Commit the staged changes with a message (global identity untouched). */
export async function commit(cwd: string, message: string, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['commit', '--no-verify', '-m', message])
}

/** Branch names (current first). */
export async function branches(cwd: string, selected?: string, workspace: string = cwd): Promise<{ current: string; names: string[] }> {
  const repo = await repoOf(cwd, selected, workspace)
  const [current, raw] = await Promise.all([
    currentBranch(repo).catch(() => 'HEAD'),
    safeGit(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
  ])
  const names = raw.split('\n').filter(line => line !== '')
  return { current, names: names.includes(current) ? names : [current, ...names] }
}

/** Switch to an existing branch. */
export async function checkout(cwd: string, branch: string, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['checkout', branch])
}

/** Recent commit history (newest first), lazily pageable via skip/count. */
export async function log(cwd: string, count = 30, skip = 0, selected?: string, workspace: string = cwd): Promise<GitLogEntry[]> {
  const raw = await safeGit(await repoOf(cwd, selected, workspace), [
    'log', '-n', String(count), '--skip', String(skip), '--decorate=short',
    '--pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D',
  ])
  return parseLogLines(raw)
}

/**
 * Content of a file at a revision (`git show <rev>:<path>`), or null when the
 * revision has no such path (a new/untracked file has no HEAD side).
 */
export async function show(cwd: string, rev: string, path: string, selected?: string, workspace: string = cwd): Promise<string | null> {
  const repo = await repoOf(cwd, selected, workspace)
  try {
    return await safeGit(repo, ['show', '--no-textconv', `${rev}:${path}`])
  } catch {
    return null
  }
}

/** Full patch text of one commit (`git show` with the commit header suppressed).
 *  Merge commits show their diff against the first parent (`-m --first-parent`
 *  is a no-op for regular commits), so a history click always has content. */
export async function commitDiff(cwd: string, hash: string, selected?: string, workspace: string = cwd): Promise<string> {
  return safeGit(await repoOf(cwd, selected, workspace), ['show', '--no-ext-diff', '--no-textconv', '--no-color', '--format=', '-m', '--first-parent', hash])
}

/** Discard the worktree changes of one path (`git checkout -- <path>`; the index is untouched). */
export async function discard(cwd: string, path: string, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['checkout', '--', path])
}

/** Revert one commit onto the current branch with an auto-generated message. */
export async function revert(cwd: string, hash: string, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['revert', '--no-edit', hash])
}

/** Cherry-pick one commit onto the current branch. */
export async function cherryPick(cwd: string, hash: string, selected?: string, workspace: string = cwd): Promise<void> {
  await safeGit(await repoOf(cwd, selected, workspace), ['cherry-pick', hash])
}
