/**
 * Where a public demo of a quickstart lives — `<templateName>-<cms>.<zone>` (16/09/2026) —
 * and the admin table that lets a person pin a different label per tag.
 *
 * ONE level under the zone on purpose: Universal SSL covers `*.tracy.ai` and nothing deeper, so
 * `business.joomla.tracy.ai` fails TLS at the edge (measured 14/09 on the first Joomla demo).
 *
 * The default is DERIVED, never typed: the tag already names the template (`tracy-business/j6`,
 * `quickstart/ja-kinetic/j6`) and the release's setting names the CMS. A person who wants another
 * label writes it into `demo_domain`; a tag with no row answers with the derived one, so the
 * screen never shows an empty address and nobody has to fill 86 rows by hand.
 */
import { isLocalTag } from './local-releases.js'

/** The same shape `apps/tracy-host` refuses anything outside of (`SAFE_LABEL`). */
export const DEMO_LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/

/**
 * Where a demo can live. A target is a SERVER AND A DOMAIN TOGETHER, never one without the other,
 * because that pair is what a person has to be sure of before they press Install (16/09) —
 * and because the two servers stay independent: a domain does not move between them.
 *
 * `tracy` is every Tracy deployment's own demo host, reached through `/provision` like any site.
 * `joomlart` is `demo.joomlart.com`, which Tracy did not build and does not run: 459 demos on one
 * CentOS 7 box, served by one nginx regex block per folder name. Tracy only RECORDS those
 * addresses — nothing here installs onto that machine.
 */
export const DEMO_TARGETS = Object.freeze(['tracy', 'joomlart'])

/** Tags JoomlArt publishes a demo for. Anything else has no address on that domain, and saying so
 *  with `null` is the point: an invented one would 404 while looking exactly like a live demo. */
const JOOMLART_TAG = /^quickstart\/(ja-[a-z0-9][a-z0-9-]*)\/[a-z0-9]+$/

/**
 * `tracy-business/j6` + `joomla` → `business-joomla`. The template name is the tag's second-to-last
 * segment with Tracy's own prefix dropped; the CMS comes from the setting, never guessed off the tag.
 *
 * ⚠ THE RULE IS PER TARGET, and not because the two want different spellings. On `tracy` the
 * address is one Tracy is about to CREATE, so a derived name is a proposal. On `joomlart` the
 * address ALREADY ANSWERS — measured 16/09: 70 of 70 `ja-*` tags have a folder on that server and
 * 68 serve 200 — so the name is a FACT to be read, not a proposal to be made. Deriving
 * `ja-kinetic-joomla` there would offer an address nobody serves, dressed as a live demo.
 *
 * @param {string} tag
 * @param {string | null | undefined} platform
 * @param {string} [target] one of `DEMO_TARGETS`; defaults to `tracy`.
 * @returns {string | null}
 */
export function defaultDemoLabel(tag, platform, target = 'tracy') {
  if (target === 'joomlart') {
    const slug = typeof tag === 'string' ? JOOMLART_TAG.exec(tag)?.[1] : null
    return slug !== undefined && slug !== null && DEMO_LABEL.test(slug) ? slug : null
  }
  if (typeof tag !== 'string' || typeof platform !== 'string' || platform === '') return null
  const segments = tag.split('/')
  if (segments.length < 2) return null
  const name = segments[segments.length - 2].replace(/^tracy-/, '')
  // A local pack (`local-releases.js`) must not propose the address of the release it stands for.
  const label = isLocalTag(tag) ? `local-${name}-${platform}` : `${name}-${platform}`
  return DEMO_LABEL.test(label) ? label : null
}

/**
 * One row per installable release PER TARGET: the pinned label when a person wrote one, the
 * derived one otherwise. Drafts and unreadable releases are left out — there is nothing to
 * install, so there is nothing to name.
 *
 * A release with no address on a target is still listed for it, with `label: null`. That is the
 * honest answer for Tracy's own releases on `joomlart`, which JoomlArt does not serve — and the
 * screen draws it as "no address here", never as an address it made up.
 * @param {{query: Function}} pool
 * @param {any[]} releases from `readReleases`
 * @param {string} [target] one of `DEMO_TARGETS`; defaults to `tracy`.
 */
export async function readDemoDomains(pool, releases, target = 'tracy') {
  const { rows } = await pool.query(
    'select tag, label, revision, updated_by, updated_at from demo_domain where target = $1',
    [target]
  )
  const pinned = new Map(rows.map((r) => [r.tag, r]))
  return releases
    .filter((r) => r.choosable)
    .map((r) => {
      const row = pinned.get(r.tag)
      const derived = defaultDemoLabel(r.tag, r.platform, target)
      return {
        tag: r.tag,
        target,
        platform: r.platform,
        label: row?.label ?? derived,
        defaultLabel: derived,
        pinned: Boolean(row),
        revision: row?.revision ?? 0,
        updatedBy: row?.updated_by ?? null,
        updatedAt: row?.updated_at ?? null
      }
    })
}

/**
 * Pin `label` as the demo address of `tag` ON ONE TARGET. `revision` 0 means "no row yet";
 * anything else must equal the row's current revision or the save is refused — the caller re-reads
 * and decides.
 *
 * ⚠ THE CLASH IS CHECKED WITHIN THE TARGET, matching the constraint the table now carries. The
 * same label on two targets is two hostnames on two machines, not a collision; refusing it would
 * be refusing a name that is not taken.
 * @returns {Promise<{ok: true, revision: number} | {error: 'INVALID_LABEL' | 'UNKNOWN_TARGET' | 'DEMO_CHANGED'} | {error: 'LABEL_TAKEN', by: string}>}
 */
export async function saveDemoDomain(pool, tag, label, revision, email, target = 'tracy') {
  if (!DEMO_TARGETS.includes(target)) return { error: 'UNKNOWN_TARGET' }
  if (typeof label !== 'string' || !DEMO_LABEL.test(label) || !Number.isSafeInteger(revision) || revision < 0)
    return { error: 'INVALID_LABEL' }
  const taken = await pool.query(
    'select tag from demo_domain where target = $1 and label = $2 and tag <> $3',
    [target, label, tag]
  )
  if (taken.rows.length) return { error: 'LABEL_TAKEN', by: taken.rows[0].tag }
  const result =
    revision === 0
      ? await pool.query(
          `insert into demo_domain (tag, target, label, updated_by) values ($1, $2, $3, $4)
           on conflict do nothing returning revision`,
          [tag, target, label, email]
        )
      : await pool.query(
          `update demo_domain set label = $1, updated_by = $2, revision = revision + 1, updated_at = now()
           where tag = $3 and target = $4 and revision = $5 returning revision`,
          [label, email, tag, target, revision]
        )
  return result.rows.length ? { ok: true, revision: result.rows[0].revision } : { error: 'DEMO_CHANGED' }
}
