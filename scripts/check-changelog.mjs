#!/usr/bin/env node
/**
 * `main` journal gate: a change that touches other people must say whom it touches.
 *
 * WHY THIS GATE EXISTS. Many agent sessions run in parallel in this repo, and the cost of silence
 * has been measured — `tasks/lessons.md` §6: a fix for "you have to click twice to reach Google" was
 * swallowed into another session's commit. The damage was not a dirty commit but that **nobody
 * deployed it**: the bug lived one more day after it was fixed, and only surfaced when the other
 * session happened to mention it.
 *
 * IT DOES NOT JUDGE CONTENT. It checks whether the push **adds or edits a journal entry** —
 * a file in `changes/` (the English journal, one file per change, format in `changes/README.md`).
 * While the internal journal `tasks/nhat-ky/` is still in the tree, an entry there (or in the old
 * `tasks/nhat-ky-main.md`) counts too; the public tree has no `tasks/`, so there only `changes/`
 * counts. A sloppy entry still passes this gate; that is the reviewer's job.
 *
 * 🔒 ONE FILE PER CHANGE, SINCE 25/09/2026. Before that every entry was inserted at the TOP OF ONE
 * file, so two parallel PRs always edited the same line and the later merge needed an extra
 * conflict round just for the journal — measured 25/09: about eight PRs in one day. Two files
 * with different names share no line to conflict on. Read it back as one timeline: `pnpm journal`
 * (`scripts/journal.mjs`); format and naming rules: `tasks/nhat-ky/README.md`.
 *
 * ⚠ DELETING IS NOT WRITING. The guarded area counts every changed file, deleted ones included; the
 * journal side only counts files ADDED or EDITED (`--diff-filter=AM`). Deleting someone else's entry
 * does not say whom this push touches, and the folder's README is the rules, not an entry. Same stance
 * as `check-pr-description.mjs`, and because it is the same stance it has the same shape: the logic
 * lives in the repo, runs on bare `node`, reads the payload from `$GITHUB_EVENT_PATH`, **checkable
 * locally**:
 *
 *   node scripts/check-changelog.mjs <payload-path.json>
 *
 * 🔒 IT GUARDS BOTH `push` AND `pull_request`, AND THAT IS THE CRUX. Most pushes to `main` in this
 * repo are **direct pushes**, not through a PR — measured 02/09/2026: of the last 25 commits only 4
 * carried a PR number. A gate guarding only `pull_request` would guard the minority, and stay silent
 * on exactly the path most code takes.
 *
 * ⚠ NEEDS FULL HISTORY. The workflow must set `fetch-depth: 0`; with a shallow checkout `git diff`
 * has no base to compare and the gate dies on the first line rather than silently passing.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Code areas where an edit touches other people.
 *
 * `packages/` and `apps/` are the two areas of code that reach customers (§1 of `CLAUDE.md`; `workers/`
 * was a third until it was deleted on 16/09/2026).
 *
 * 🔒 `apps/` JOINED THE LIST ON 14/09, AND ITS ABSENCE MEANT A GATE GUARDING THE WRONG TREE. The top
 * table of `CLAUDE.md` makes `apps/tracy-web` + `apps/tracy-host` the architecture REPLACING the seven
 * Workers — what runs locally and on `cowork.tracy.site`. So before this edit the gate guarded the
 * tree about to retire and left its successor unguarded, exactly the area changing most.
 *
 * And it is not a formality: a push touching `apps/` triggers `build-app-images.yml`, which rebuilds
 * `tracy-web` + `tracy-host` and RESTARTS the stack on the dev machine. That is a deploy with visible
 * consequences, and it came with no duty to leave a note for the next person deploying.
 *
 * ⚠ `deploy/` IS LEFT OUT ON PURPOSE. Only THREE files under it reach a running machine (`compose.yml`,
 * `compose.server.yml`, `scripts/deploy-tracy-stack.sh` — exactly the `paths` list of
 * `build-app-images.yml`), while this gate compares by PREFIX. Adding `deploy/` would demand a journal
 * entry for a comment edit in `.env.example`, and a gate that fires in the wrong place is a gate
 * people learn to ignore.
 */
const VUNG_GAC = ['packages/', 'apps/']

/** The English journal: one file per change. Ships with the public tree. */
const CHANGES_DIR = 'changes/'

/** Its format rules, not an entry. */
const CHANGES_README = `${CHANGES_DIR}README.md`

/** Internal journal folder, accepted only while it is in the tree (before the public cutover). */
const THU_MUC_NHAT_KY = 'tasks/nhat-ky/'

/** The folder's rules, not an entry: changing it does not count as writing. */
const README_NHAT_KY = `${THU_MUC_NHAT_KY}README.md`

/**
 * The old shared journal file — now an archive. Editing it still counts as writing during the
 * transition, so branches opened before 25/09 do not go red because the rule changed mid-way.
 */
const FILE_NHAT_KY_CU = 'tasks/nhat-ky-main.md'

/** Escape hatch for a push that really touches nobody. Put it in the commit message. */
const CUA_THOAT = '[skip-changelog]'

/** The empty SHA GitHub sends for a branch just created or just deleted. */
const SHA_RONG = '0000000000000000000000000000000000000000'

/**
 * This push's commit range, read from the event payload.
 * @param {Record<string, any>} payload - the `push` or `pull_request` payload.
 * @returns {{goc: string, ngon: string, batCau: boolean} | null} `null` when there is nothing to compare.
 */
export function khoangCommit(payload) {
  if (payload.pull_request !== undefined) {
    // Three dots: compare with the merge-base, so code others merged into base is not counted for this PR.
    return { goc: payload.pull_request.base.sha, ngon: payload.pull_request.head.sha, batCau: true }
  }
  if (typeof payload.before === 'string' && typeof payload.after === 'string') {
    // A branch just created: no base to compare, and guessing one is worse than not guarding.
    if (payload.before === SHA_RONG || payload.after === SHA_RONG) return null
    return { goc: payload.before, ngon: payload.after, batCau: false }
  }
  return null
}

/**
 * Run a git command, return trimmed stdout.
 * @param {string[]} args - arguments for git.
 * @returns {string} stdout.
 */
function git(args) {
  // A release pull request (develop → staging) names tens of thousands of files; the default 1 MiB
  // buffer kills the gate with ENOBUFS before it judges anything (PR #1110, 10/10/2026).
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()
}

/**
 * Entry files of one journal folder, README excluded.
 * @param {string} dir - folder relative to the repo root, with a trailing slash.
 * @param {string} readme - the folder's README path.
 * @returns {string[]} paths relative to the repo root.
 */
function entriesIn(dir, readme) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((ten) => `${dir}${ten}`)
    .filter((duong) => duong !== readme && duong.endsWith('.md'))
    .sort()
}

/**
 * The journal entry files in the tree: `changes/`, then the old file and `tasks/nhat-ky/` if still there.
 * @returns {string[]} paths relative to the repo root.
 */
function fileNhatKy() {
  const ds = existsSync(FILE_NHAT_KY_CU) ? [FILE_NHAT_KY_CU] : []
  return [...entriesIn(CHANGES_DIR, CHANGES_README), ...ds, ...entriesIn(THU_MUC_NHAT_KY, README_NHAT_KY)]
}

/**
 * Whether a path is a journal entry.
 * @param {string} duong - path relative to the repo root.
 * @param {boolean} [legacy] - whether the internal journal is in the tree (then its entries count too).
 * @returns {boolean} `true` if adding/editing this file counts as writing the journal.
 */
export function laMucNhatKy(duong, legacy = true) {
  if (duong.startsWith(CHANGES_DIR) && duong !== CHANGES_README) return true
  if (!legacy) return false
  if (duong === FILE_NHAT_KY_CU) return true
  return duong.startsWith(THU_MUC_NHAT_KY) && duong !== README_NHAT_KY
}

/**
 * Hashes in the journal that `git cat-file` cannot find.
 *
 * WHY CHECK. The journal is written BEFORE committing (CLAUDE.md §5 step 0), so the writer has no
 * real hash to point at yet. Guessing one ahead means it dies on the first `commit --amend` or rebase,
 * while the journal line does not change with it. This really happened in the first three entries
 * other people wrote.
 *
 * The gate runs AFTER the push, so by now the hash is fixed — this is the only moment it can be
 * checked without getting in the way of writing first.
 *
 * ⚠ A HASH FROM ANOTHER REPO NEEDS A PREFIX. The gate reads everything in backticks that looks like a
 * hash as a commit OF THIS REPO, and has no way to know otherwise. An entry on 05/09 pinned upstream
 * open-design with a bare `3d0d15fc` and the gate called it a dead hash — right by its rules, wrong by
 * the writer's intent. Writing `od@3d0d15fc` (or any prefix) solves it: the regex requires the backticks
 * to hold EXACTLY the hash, so with a prefix it is skipped, and the reader also knows which repo it is from.
 *
 * Checked on EVERY entry file (the old file and `tasks/nhat-ky/`), not only the files this push changed:
 * the rule is unchanged, the journal just lives in many files now.
 * @returns {{hash: string, file: string}[]} Dead hashes with the file holding each, empty if clean.
 */
function hashChet() {
  const tim = fileNhatKy().flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((dong) => dong.startsWith('- **'))
      .flatMap((dong) => [...dong.matchAll(/`([0-9a-f]{7,40})`/g)].map((khop) => ({ hash: khop[1], file })))
  )
  if (tim.length === 0) return []
  const tra = execFileSync('git', ['cat-file', '--batch-check'], {
    input: tim.map(({ hash }) => `${hash}^{commit}`).join('\n'),
    encoding: 'utf8'
  })
  // `--batch-check` returns exactly one line per input line, in the same order.
  return tra
    .split('\n')
    .slice(0, tim.length)
    .flatMap((dong, i) => (dong.endsWith(' missing') ? [tim[i]] : []))
}

/**
 * The gate's verdict, pure: no git, no disk, no output.
 * @param {object} vao - everything the gate needs to know about the push.
 * @param {{hash: string, file: string}[]} vao.chet - dead hashes in the journal (`hashChet()`).
 * @param {{goc: string, ngon: string, batCau: boolean} | null} vao.khoang - `khoangCommit(payload)`.
 * @param {string[]} vao.doiFile - every file this push changed (deleted ones included).
 * @param {string[]} vao.mucGhi - journal files ADDED or EDITED (already filtered with `laMucNhatKy`).
 * @param {string} vao.loiNhan - the commit messages of the whole range.
 * @param {boolean} [vao.legacy] - whether the internal journal `tasks/nhat-ky/` is in the tree.
 * @returns {{ma: number, stdout: string, stderr: string}} exit code and the two streams to print.
 */
export function phanXet({ chet, khoang, doiFile, mucGhi, loiNhan, legacy = true }) {
  // Check hashes BEFORE anything else: a dead hash is an error wherever this push touches.
  if (chet.length > 0) {
    let stderr = 'The journal points at commits that do not exist:\n\n'
    for (const { hash, file } of chet) stderr += `  - \`${hash}\` in ${file}\n`
    stderr +=
      '\nAlmost certainly the hash was typed BEFORE the commit existed, then an amend or rebase\n' +
      'changed it. Look it up again with `git log --oneline` and fix it, or write `—` if there is no commit to point at yet.\n'
    return { ma: 1, stdout: '', stderr }
  }

  if (khoang === null) {
    return {
      ma: 0,
      stdout: 'Journal: no commit range to compare (new or just-deleted branch) — skipped.\n',
      stderr: ''
    }
  }

  const chamNguoiKhac = doiFile.filter((duong) => VUNG_GAC.some((vung) => duong.startsWith(vung)))

  if (chamNguoiKhac.length === 0) {
    // This sentence is GENERATED from `VUNG_GAC`, not typed: the typed version drifted once — `apps/`
    // joined the list while the sentence still named the two old areas, so log readers believed the gate ignored their tree.
    const keTen = VUNG_GAC.map((vung) => `\`${vung}\``).join(' or ')
    return { ma: 0, stdout: `Journal: this push does not touch ${keTen} — nothing to write.\n`, stderr: '' }
  }

  if (mucGhi.length > 0) {
    return { ma: 0, stdout: `Journal: entry found in ${mucGhi.join(', ')}.\n`, stderr: '' }
  }

  if (loiNhan.includes(CUA_THOAT)) {
    return {
      ma: 0,
      stdout: `Journal: ${CUA_THOAT} in the commit message — skipped on request.\n`,
      stderr: ''
    }
  }

  let stderr = 'This push touches other people but does not say so:\n\n'
  for (const duong of chamNguoiKhac.slice(0, 10)) stderr += `  - ${duong}\n`
  if (chamNguoiKhac.length > 10) stderr += `  … and ${String(chamNguoiKhac.length - 10)} more files\n`
  stderr +=
    `\nAdd an entry file to ${CHANGES_DIR} — named \`YYYY-MM-DD-<slug>.md\`, in English, saying: what was done,\n` +
    'who did it (name or role), which pull request, which branch, the date, and an **Affects:** line saying\n' +
    `whom it touches. Format and the "which entries to write, which to skip" rules are in ${CHANGES_README}.\n` +
    (legacy
      ? `While the internal journal ${THU_MUC_NHAT_KY} is in this tree, an entry there counts too (${README_NHAT_KY}).\n`
      : '') +
    'Read the whole journal: `pnpm journal`.\n\n' +
    `If this push really touches nobody, put ${CUA_THOAT} in the commit message.\n\n` +
    'This gate does not read code — it only checks that the change was announced.\n'
  return { ma: 1, stdout: '', stderr }
}

/**
 * Read the payload + git, then ask `phanXet`. Only this part touches the outside world.
 * @param {string | undefined} payloadPath - path of the event payload.
 * @returns {number} exit code.
 */
function main(payloadPath) {
  if (payloadPath === undefined) {
    process.stderr.write('check-changelog: no payload — pass a path, or set GITHUB_EVENT_PATH\n')
    return 2
  }
  // The public export leaves `tasks/` out; there only `changes/` counts.
  const legacy = existsSync(THU_MUC_NHAT_KY)
  const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
  const chet = hashChet()
  const khoang = khoangCommit(payload)
  let doiFile = []
  let mucGhi = []
  let loiNhan = ''
  if (khoang !== null) {
    const dauNoi = khoang.batCau ? '...' : '..'
    const range = `${khoang.goc}${dauNoi}${khoang.ngon}`
    doiFile = git(['diff', '--name-only', range])
      .split('\n')
      .filter((duong) => duong !== '')
    // The journal side counts only ADDED or EDITED files; `--no-renames` so renaming an entry shows up
    // as delete + add, and the added file is still an entry with content.
    mucGhi = git(['diff', '--name-only', '--no-renames', '--diff-filter=AM', range])
      .split('\n')
      .filter((duong) => duong !== '' && laMucNhatKy(duong, legacy))
    loiNhan = git(['log', '--format=%B', range])
  }
  const kq = phanXet({ chet, khoang, doiFile, mucGhi, loiNhan, legacy })
  process.stdout.write(kq.stdout)
  process.stderr.write(kq.stderr)
  return kq.ma
}

// realpath on both sides: a temp path on macOS is reached through a symlink (/var -> /private/var).
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv[2] ?? process.env.GITHUB_EVENT_PATH))
}
