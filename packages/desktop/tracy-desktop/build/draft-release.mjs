#!/usr/bin/env node
/**
 * The workflow's side of the Windows + Linux transport (`.github/workflows/desktop-win-linux.yml`): the
 * run hands its six installers and `build-info.json` over in a DRAFT release `desktop-win-linux-<run id>`
 * for `build/release.mjs prepare` to download (build/release-win-linux.mjs), instead of Actions artifacts
 * — those share the org's pooled 500 MB on GitHub Free and blocked release 0.6.0 (12/10/2026).
 *
 *   node build/draft-release.mjs hand-over --tag <tag> --sha <sha> --title <t> --notes <n> <file>...
 *   node build/draft-release.mjs sweep --prefix desktop-win-linux- --days 14
 *
 * The build runner has no `gh`, so this talks to the REST API with `fetch`, `GH_TOKEN` (the job's
 * `github.token`, `contents: write`) and `GITHUB_REPOSITORY`. A draft has no git tag; it is listed only to
 * those with push access, and only by the release list (not `releases/tags/<tag>`), so both commands page
 * through the list.
 */
import { openAsBlob } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const API = 'https://api.github.com'
const UPLOADS = 'https://uploads.github.com'

/**
 * @typedef {(method: string, url: string, options?: { body?: unknown, contentType?: string }) =>
 *   Promise<{ status: number, json: any }>} Request
 */

/** Every release of the repo, drafts included (100 a page, until a short page). */
async function allReleases(request, repo) {
  const all = []
  for (let page = 1; ; page++) {
    const res = await request('GET', `${API}/repos/${repo}/releases?per_page=100&page=${page}`)
    if (res.status !== 200) throw new Error(`listing releases: HTTP ${res.status}`)
    all.push(...res.json)
    if (res.json.length < 100) return all
  }
}

/**
 * Create the draft (replacing a draft of an earlier attempt of the same run) and upload every file.
 * Anything under that name that is not a draft is someone's release: refused, nothing touched.
 * @param {{ request: Request, repo: string, tag: string, sha: string, title: string, notes: string,
 *   files: string[], open?: (file: string) => Promise<Blob> }} input
 */
export async function handOver({ request, repo, tag, sha, title, notes, files, open = openAsBlob }) {
  for (const old of (await allReleases(request, repo)).filter((r) => r.tag_name === tag)) {
    if (!old.draft) throw new Error(`${tag} exists and is not a draft — not touching it`)
    const res = await request('DELETE', `${API}/repos/${repo}/releases/${old.id}`)
    if (res.status !== 204) throw new Error(`deleting the earlier draft ${tag}: HTTP ${res.status}`)
  }
  const created = await request('POST', `${API}/repos/${repo}/releases`, {
    body: { tag_name: tag, target_commitish: sha, name: title, body: notes, draft: true }
  })
  if (created.status !== 201) throw new Error(`creating the draft ${tag}: HTTP ${created.status}`)
  const assets = []
  for (const file of files) {
    const name = path.basename(file)
    const blob = await open(file)
    const res = await request(
      'POST',
      `${UPLOADS}/repos/${repo}/releases/${created.json.id}/assets?name=${encodeURIComponent(name)}`,
      { body: blob, contentType: 'application/octet-stream' }
    )
    if (res.status !== 201)
      throw new Error(`uploading ${name}: HTTP ${res.status} ${JSON.stringify(res.json?.message ?? '')}`)
    if (res.json?.size !== blob.size)
      throw new Error(
        `uploading ${name}: GitHub has ${res.json?.size} bytes, the file has ${blob.size} (size)`
      )
    assets.push({ name, size: blob.size })
  }
  return { id: created.json.id, tag, assets }
}

/**
 * Delete our drafts (tag starts with `prefix`) whose newest asset was uploaded before the cutoff — a
 * release's own `created_at` is its commit's date, so the assets date it; a draft with none goes by
 * `created_at`. Published releases are never touched.
 * @param {{ request: Request, repo: string, prefix: string, olderThanDays: number, now?: Date }} input
 * @returns {Promise<string[]>} the tags deleted
 */
export async function sweep({ request, repo, prefix, olderThanDays, now = new Date() }) {
  const cutoff = now.getTime() - olderThanDays * 86_400_000
  const deleted = []
  for (const r of await allReleases(request, repo)) {
    if (!r.draft || !String(r.tag_name).startsWith(prefix)) continue
    const dates = (r.assets ?? []).map((a) => Date.parse(a.created_at))
    const age = dates.length > 0 ? Math.max(...dates) : Date.parse(r.created_at)
    if (!(age < cutoff)) continue
    const res = await request('DELETE', `${API}/repos/${repo}/releases/${r.id}`)
    if (res.status !== 204) throw new Error(`deleting the draft ${r.tag_name}: HTTP ${res.status}`)
    deleted.push(r.tag_name)
  }
  return deleted
}

/** `fetch` with the job's token. */
function realRequest(token) {
  return async (method, url, { body, contentType } = {}) => {
    const json = body !== undefined && !(body instanceof Blob)
    const res = await fetch(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body !== undefined ? { 'content-type': json ? 'application/json' : contentType } : {})
      },
      body: body === undefined ? undefined : json ? JSON.stringify(body) : body
    })
    const text = await res.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {}
    return { status: res.status, json: parsed }
  }
}

async function main(argv) {
  const [command, ...rest] = argv
  const token = process.env.GH_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) throw new Error('needs GH_TOKEN and GITHUB_REPOSITORY')
  const request = realRequest(token)
  const text = { type: 'string' }
  if (command === 'hand-over') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { tag: text, sha: text, title: text, notes: text },
      allowPositionals: true
    })
    if (!values.tag || !values.sha || positionals.length === 0)
      throw new Error('hand-over needs --tag, --sha and files')
    const got = await handOver({
      request,
      repo,
      tag: values.tag,
      sha: values.sha,
      title: values.title ?? values.tag,
      notes: values.notes ?? '',
      files: positionals
    })
    for (const a of got.assets) process.stdout.write(`${got.tag}: ${a.name} ${a.size}\n`)
    return 0
  }
  if (command === 'sweep') {
    const { values } = parseArgs({ args: rest, options: { prefix: text, days: text } })
    if (!values.prefix || !values.days) throw new Error('sweep needs --prefix and --days')
    // An old draft left over is clutter, not a broken release: say it, never fail the build.
    try {
      const deleted = await sweep({
        request,
        repo,
        prefix: values.prefix,
        olderThanDays: Number(values.days)
      })
      process.stdout.write(`sweep: deleted ${deleted.length} draft(s) ${deleted.join(' ')}\n`)
    } catch (error) {
      process.stdout.write(`::warning::sweep of old ${values.prefix}* drafts failed: ${error.message}\n`)
    }
    return 0
  }
  process.stderr.write('usage: draft-release.mjs hand-over|sweep … (see the header)\n')
  return 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`draft-release: ${error.message}\n`)
      process.exit(1)
    }
  )
}
