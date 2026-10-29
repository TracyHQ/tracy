/**
 * Creating a release's missing `tracy_setting.json` from the Quickstarts screen.
 *
 * WHY A PRESS AND NOT A SCRIPT. 79 of the `quickstart/ja-*` releases predate Tracy's file: each is
 * a classic Joomla quickstart package and each needs the same six fields, five transcription and
 * one a checksum of bytes nobody hashed. `scripts/tracy-setting.mjs` composes exactly that file and
 * deliberately stops short of uploading, printing a `gh release upload` line instead — because a
 * script run from a laptop is not in a position to decide what a customer-facing release carries.
 * Here that decision has already been made: an administrator read the proposal and pressed. Same
 * rule, other side of the press (`lib/release-assets.js` says the same thing about the card).
 *
 * 🔒 TWO DOORS, AND THE READ WRITES NOTHING. The proposal downloads a 40–80 MB package to compute
 * a pin the publisher never signed; the press changes a release the world can see. Folded into one
 * call, opening the review sheet WOULD BE the write and "show me what it would say" would have no
 * answer. So the GET composes and answers, and the POST takes back the document a person approved —
 * not a token saying "write what you proposed", which would let the sheet and the file differ.
 *
 * 🔒 THE PRESS NEVER INVENTS. What is written is the body, held to `validateSetting` against the
 * release's own asset list — the same validator every read of GitHub runs. A field an administrator
 * cleared stays cleared and the door refuses with the list; nothing here fills a gap back in.
 */
import { Hono } from 'hono'

import { uploadReleaseAsset } from '../lib/release-assets.js'
import { kickReadiness } from '../lib/customize-readiness.js'
import { kickDsReadiness } from '../lib/design-system-readiness.js'
import { readReleases, refreshReleases, RELEASES_REPO, releasesToken } from '../lib/quickstart-releases.js'
import { packageOf, proposalFrom, readPackage } from '../lib/setting-proposal.js'
import { validateSetting } from '../lib/tracy-setting.mjs'
import { admit, denied } from './admit.js'

const API = 'https://api.github.com'
/** The file this whole screen is about. */
const SETTING_FILE = 'tracy_setting.json'

/**
 * One release's asset bytes, fetched BY ID with this deployment's own token.
 *
 * By id rather than by browser address: `joomlart-products` is private, and the public
 * `/releases/download/…` address answers 404 to a token that is not a browser session. It is the
 * same road `quickstart.py` takes on a fleet host, for the same reason.
 */
async function assetBytes(fetchImpl, id, token) {
  const response = await fetchImpl(`${API}/repos/${RELEASES_REPO}/releases/assets/${id}`, {
    headers: {
      accept: 'application/octet-stream',
      authorization: `Bearer ${token}`,
      'user-agent': 'tracy-web',
      'x-github-api-version': '2022-11-28'
    }
  })
  if (!response.ok) return { bytes: null, reason: `GitHub answered ${response.status} for asset ${id}.` }
  return { bytes: Buffer.from(await response.arrayBuffer()), reason: null }
}

export function quickstartSettingRoutes({ pool, config, fetchImpl = fetch }) {
  const app = new Hono()

  /** The same admission and the same origin check every write on this screen keeps. */
  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's: behind the tunnel the app is handed plain http.
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /**
   * The release this door may act on, or the sentence saying why it is none of them.
   *
   * A release that is already Ready is refused rather than quietly overwritten: its file is install
   * truth a fleet host reads, and "create the missing one" is not a licence to replace one that is
   * there. A draft is refused because a draft's assets are not the ones a customer would get.
   */
  const target = async (c) => {
    // The tag rides the QUERY, not the path: `quickstart/ja-space/j6` carries two slashes, and
    // the sibling doors of this screen (`ops/quickstarts.js`) already read it this way.
    const tag = c.req.query('tag') ?? ''
    const [release] = (await readReleases(pool)).filter((r) => r.tag === tag)
    if (!release) return { refusal: c.json({ error: 'UNKNOWN_QUICKSTART' }, 404) }
    if (release.tracy === 'ready')
      return {
        refusal: c.json(
          {
            error: 'ALREADY_READY',
            reason: `${tag} already carries a ${SETTING_FILE}. Editing what a release declares is re-cutting it, not creating a missing file.`
          },
          409
        )
      }
    if (release.github === 'draft')
      return {
        refusal: c.json(
          {
            error: 'DRAFT',
            reason: `${tag} is a draft: its assets are not the ones a customer would install, so a file written now would pin files that may never be published.`
          },
          409
        )
      }
    return { release }
  }

  /**
   * ── GET …/setting-proposal — the file this server WOULD write ────────────────────────────────
   *
   * Every field carries its `source`: `release` (GitHub says so), `package` (read out of the zip),
   * `default` (nobody chose this). A field that cannot be determined comes back null with a
   * sentence. That split is the whole value of the sheet — six confident-looking strings would be
   * approved without being read.
   */
  app.get('/api/ops/quickstart/setting-proposal', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const t = await target(c)
    if (t.refusal) return t.refusal

    const chosen = packageOf(t.release)
    if (!chosen.file) return c.json({ error: 'NO_PACKAGE', reason: chosen.why }, 409)

    const { token, reason } = await releasesToken(config, fetchImpl)
    if (!token) return c.json({ error: 'NO_GITHUB', reason }, 503)
    const asset = t.release.assets.find((a) => a.name === chosen.file)
    if (!asset?.id)
      return c.json(
        {
          error: 'NO_PACKAGE',
          reason: `${chosen.file} has no asset id in the last reading of this release — press Refresh from GitHub and try again.`
        },
        409
      )
    const { bytes, reason: failed } = await assetBytes(fetchImpl, asset.id, token)
    if (!bytes) return c.json({ error: 'DOWNLOAD_FAILED', reason: failed }, 502)

    const pkg = readPackage(chosen.file, bytes)
    const proposal = proposalFrom({ release: t.release, pkg })
    return c.json({
      ...proposal,
      // The names are not sent: a webroot is thousands of paths, and nothing on the sheet reads
      // them. What a person needs is which file was weighed and what it weighed to.
      package: { file: pkg.file, sha256: pkg.sha256, bytes: bytes.length }
    })
  })

  /**
   * ── POST …/setting — write the reviewed document onto the release ────────────────────────────
   *
   * The body is what the sheet showed, as the administrator left it. Held to the validator against
   * the release's own asset list first: a setting naming a file the release does not carry is the
   * failure that lands on a fleet host mid-provision as a 404 inside a shell script, and the whole
   * point of this screen is that it is a sentence here instead.
   */
  app.post('/api/ops/quickstart/setting', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const t = await target(c)
    if (t.refusal) return t.refusal

    const doc = await c.req.json().catch(() => null)
    const problems = validateSetting(doc, { assets: t.release.assets.map((a) => a.name) })
    if (problems.length > 0) return c.json({ error: 'INVALID_SETTING', problems }, 400)

    const written = await uploadReleaseAsset(
      config,
      { tag: t.release.tag, name: SETTING_FILE, body: `${JSON.stringify(doc, null, 2)}\n` },
      { fetchImpl }
    )
    if (!written.ok) return c.json({ error: 'UPLOAD_FAILED', reason: written.reason }, 502)

    // Read GitHub again so the row is Ready on the press rather than within the ten-minute sweep.
    // The whole repository, through the one call the webhook and the Refresh button also make:
    // a second, single-release reading here would be a second spelling of "what makes a release
    // readable", and the two would drift where nothing looks.
    const read = await refreshReleases(pool, config, { fetchImpl })
    if (read.ok) {
      kickReadiness(pool, config, { fetchImpl })
      kickDsReadiness(pool, config, { fetchImpl })
    }
    const [after] = (await readReleases(pool)).filter((r) => r.tag === t.release.tag)
    return c.json({
      ok: true,
      replaced: written.replaced,
      // What the release says NOW, read back rather than assumed: an upload that succeeded and a
      // file the product accepts are two different facts, and the screen shows the second.
      tracy: after?.tracy ?? 'no-setting',
      ...(after?.tracy === 'ready' ? {} : { reason: after?.reason ?? read.reason ?? null })
    })
  })

  return app
}
