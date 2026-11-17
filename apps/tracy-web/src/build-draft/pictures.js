/**
 * The pictures a build chat research stored before a site exists (#609), table `build_draft_picture` (migration 218),
 * under a key of the draft (`build-drafts/<account>/<sha256>.<ext>`). Since #575 a research of links keeps its pictures
 * in the step chain's own store (`wo_place_media`, opened through `lib/research-picture-reader.js`) and stores none
 * here; the rows a research made before #575 stay readable until nothing reads them.
 *
 * 🔒 A NEWER RESEARCH REPLACES THE PICTURES. Once a research step's record is in the draft, `prune` deletes the rows of
 * every older run and their objects, so the draft holds exactly the pictures its current research names, the pictures
 * of the research its living plan was composed from, and those of an approved build's research until that build ends
 * (#610).
 */

/**
 * @param {{pool: import('pg').Pool, objects: {get: Function, delete?: Function} | null}} deps
 */
export function createDraftPictures({ pool, objects }) {
  /**
   * Delete the account's pictures of every run but `run`, rows and objects. Answers how many went. 🔒 A picture a
   * research the draft still reads is kept, by its run or by its id in that research's manifest: the draft's research,
   * the research its living plan was composed from (`plan_research`, #609), and the research of an approved build that
   * has not ended (#610). By id too, because a later research that stored the same bytes moved the row to its own run,
   * and that research may never have been recorded.
   */
  async function prune(accountId, run) {
    const { rows } = await pool.query(
      `delete from build_draft_picture p where p.account_id = $1 and p.research_run <> $2
         and not exists (
           select 1 from build_draft d
             cross join lateral (values (d.research), (d.plan_research),
               (case when d.build is not null and d.build ->> 'endedAt' is null
                     then d.build -> 'snapshot' -> 'research' end)) as kept(research)
            where d.account_id = p.account_id and kept.research is not null
              and (kept.research ->> 'pictureRun' = p.research_run::text
                or exists (
                  select 1 from jsonb_array_elements(
                      case when jsonb_typeof(kept.research -> 'manifest') = 'array'
                           then kept.research -> 'manifest' else '[]'::jsonb end) m
                   where m ->> 'id' = p.id::text)))
       returning p.object_key`,
      [accountId, run]
    )
    for (const r of rows) await objects?.delete?.(r.object_key).catch(() => false)
    return rows.length
  }

  /** The stored bytes of one draft picture, checked against its sha256; null when gone or changed. */
  async function open(id, { accountId = null, hash } = {}) {
    const { rows } = await pool.query(
      `select id, account_id, sha256, object_key, mime, width, height, kind, labels from build_draft_picture
        where id::text = $1 and ($2::uuid is null or account_id = $2)`,
      [String(id), accountId]
    )
    const row = rows[0]
    if (!row || !objects) return null
    const res = await objects.get(row.object_key).catch(() => null)
    if (!res?.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (hash && hash(bytes) !== row.sha256) return null
    return {
      id: row.id,
      sha256: row.sha256,
      mime: row.mime,
      width: row.width,
      height: row.height,
      kind: row.kind,
      // What the draft's own vision read said of it (or null), so a later build reuses it instead of paying again.
      labels: row.labels ?? null,
      bytes
    }
  }

  return { prune, open }
}
