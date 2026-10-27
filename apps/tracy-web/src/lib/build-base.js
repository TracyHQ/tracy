/**
 * The archive a NEW site of a given CMS starts from — a live setting, one row per platform.
 *
 * WHY THE OPTIONS ARE PASSED IN AND NOT READ HERE. Two platforms answer "which bases exist?" from
 * two different files: Joomla from the design registry (every design resolves onto one of its
 * bases), EmDash from the quickstart catalog (one entry per template, because for EmDash the
 * template IS the design). A function that knew both would have to be edited for the third, and
 * the row it writes is identical in either case.
 *
 * 🔒 A SELECTION THAT NO LONGER EXISTS IS AN ERROR, NEVER A SILENT FALLBACK. A configured id
 * missing from this build means the image and the database disagree about what can be restored;
 * quietly building something else would produce a site nobody asked for, and nothing would say so.
 */

/**
 * @typedef {{ id: string, name?: string, version?: string | null }} BaseOption
 * @typedef {{ options: BaseOption[], fallback: string | null, revision: string | null }} BaseChoices
 */

/** @param {BaseChoices} choices @param {string} id */
function has(choices, id) {
  return choices.options.some((o) => o.id === id)
}

/**
 * The current selection for one platform, or the fallback when nobody has chosen yet.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} platform
 * @param {BaseChoices} choices
 */
export async function readBuildBase(pool, platform, choices) {
  const { rows } = await pool.query(
    'SELECT quickstart, revision, updated_by, updated_at FROM build_base WHERE platform = $1',
    [platform]
  )
  const row = rows[0]
  const quickstart = row?.quickstart ?? choices.fallback
  if (!quickstart || !has(choices, quickstart))
    throw new Error(`Configured ${platform} base is unavailable in this build`)
  return {
    platform,
    quickstart,
    revision: row?.revision ?? 0,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null
  }
}

/**
 * Compare-and-swap prevents one administrator silently replacing another's selection.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} platform
 * @param {BaseChoices} choices
 * @param {unknown} quickstart
 * @param {unknown} revision
 * @param {string} email
 */
export async function saveBuildBase(pool, platform, choices, quickstart, revision, email) {
  if (
    typeof quickstart !== 'string' ||
    !has(choices, quickstart) ||
    !Number.isSafeInteger(revision) ||
    /** @type {number} */ (revision) < 0
  )
    return { error: 'INVALID_BASE' }
  const result =
    revision === 0
      ? await pool.query(
          `INSERT INTO build_base (platform, quickstart, updated_by)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING revision`,
          [platform, quickstart, email]
        )
      : await pool.query(
          `UPDATE build_base SET quickstart=$1, updated_by=$2,
        revision=revision+1, updated_at=now() WHERE platform=$3 AND revision=$4 RETURNING revision`,
          [quickstart, email, platform, revision]
        )
  return result.rows.length ? { ok: true } : { error: 'BASE_CHANGED' }
}

/**
 * What a platform may be built from, from whichever file knows.
 *
 * Joomla: the design registry's bases, and its `defaultBase`, exactly as before — every design is a
 * template on one of those archives. EmDash: the quickstart catalog's own entries, one per template
 * (`template.label` is the name a person reads). A platform with no archive in either file gets an
 * empty list, which the screen draws as "no choice here", never as a fault.
 *
 * @param {string} platform
 * @param {{ registry: any, revision: string }} designs
 * @param {any[]} releases the readable releases of that platform (`readReleases`), newest first
 * @returns {BaseChoices}
 */
export function baseChoices(platform, designs, releases = []) {
  if (platform === 'joomla') {
    const bases = designs.registry.bases ?? {}
    return {
      options: Object.entries(bases).map(([id, b]) => ({
        id,
        name: /** @type {any} */ (b).name,
        version: /** @type {any} */ (b).version ?? null
      })),
      fallback: designs.registry.defaultBase ?? null,
      revision: designs.revision
    }
  }
  // Every release of this platform this server can install. The list moves when GitHub moves —
  // which is the point (ADR 0017) — so a base that vanishes is an error at read time, loudly,
  // rather than a silent switch to another one.
  const options = releases
    .filter((r) => r.platform === platform && r.choosable)
    .map((r) => ({ id: r.tag, name: r.setting?.label ?? r.tag, version: r.setting?.version ?? null }))
  return {
    options,
    // One archive is a choice already made: a platform with exactly one base needs no setting to
    // have an answer, and a person arriving before anyone pressed Save must still see the right one.
    fallback: options.length > 0 ? options[0].id : null,
    // Only Joomla's list can move under a reader in a way a revision could catch — it is generated
    // from 152 inspirations in this build. The release list moves with GitHub, and pinning a
    // revision to it would fail every save for a reason nobody could act on.
    revision: null
  }
}
