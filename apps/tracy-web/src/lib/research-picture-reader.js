/**
 * The opener of the pictures a build chat draft's research names (#575): the step chain's content brief of a research
 * of links names its pictures by origin, `place` (the shared place research, `wo_place_media`) or `opportunity` (the
 * account's own, `wo_media`), and a research made before #575, or of the owner's words, names draft pictures
 * (`draft`, `build_draft_picture`). One door opens all three, so the draft's site run reads a place picture as a Website
 * Opportunities build does (`brief-picture-bytes.js`, the same hash checked reader), without copying it anywhere.
 *
 * 🔒 A PLACE PICTURE IS OPENED ONLY FOR AN ACCOUNT THAT HOLDS AN OPPORTUNITY ON THAT PLACE: the place research is shared
 * between accounts, a draft's run reads only what its own account's research named.
 */
import { briefPictureBytes } from './brief-picture-bytes.js'

const MIME = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['avif', 'image/avif']
])

/**
 * @param {{pool: {query: Function}, objects: object | null, openDraft: Function}} deps `openDraft`: the draft picture
 *   reader (`build-draft-gather-wiring.js` `draftPictureReader`)
 * @returns {(id: string, opts?: {accountId?: string | null, origin?: string, sha256?: string}) =>
 *   Promise<{id: string, sha256: string, mime?: string, bytes: Buffer} | null>}
 */
export function researchPictureReader({ pool, objects, openDraft }) {
  return async (id, { accountId = null, origin = 'draft', sha256 = null } = {}) => {
    if (origin === 'draft') return openDraft(id, { accountId })
    if (!accountId || typeof sha256 !== 'string' || !['place', 'opportunity'].includes(origin)) return null
    const { rows } = await pool.query(
      origin === 'place'
        ? `select m.mime from wo_place_media m
            where m.id = $1::uuid and exists (select 1 from wo_opportunity o
              where o.account_id = $2 and o.place_id = m.place_id)`
        : 'select mime from wo_media where id = $1::uuid and account_id = $2',
      [id, accountId]
    )
    if (!rows[0]) return null
    const [got] = await briefPictureBytes({ pool, objects }, [{ id, sha256, origin }], accountId)
    if (!got) return null
    const mime = rows[0].mime ?? null
    return { id, sha256, bytes: got.bytes, ...(mime ? { mime: MIME.get(mime) ?? mime } : {}) }
  }
}
