// The logo a brief held in memory hands the brand step (#575, P5 of the brand audit), by the step chain's own branches.
// Only a draft researched before #575 has one: its brief names the logo by a draft picture id (`build_draft_picture`)
// and the research kept the logo as a file the bench stages (`--logo-file`). The bench loads a brief's logo by its id
// from the Website Opportunities media tables only (`brand-step/brand-logo.js` `ensureLogo`), where a draft picture
// never is, so a brief naming its logo without the file stops the run. The step chain's research never hands over such
// a brief: a logo it could not store was no file and no logo in the brief. So, before the run:
//   - the file is on the disk: it is passed as it is;
//   - the file is gone: it is written again from the draft's stored copy of the logo (checked against its hash);
//   - the stored copy is gone too: the brief goes with `brand.logo: null` (what research found stays in
//     `brand.logoResearch`, so the plan card says the logo could not be used, never that none was found);
//   - a brief that names no logo never takes a file (the bench refuses it: `BRAND_LOGO_NO_ID`).
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { logoIdOf } from './brand-step/brand-logo.js'

/** Where a logo file written again from its stored copy goes when the caller names no folder. */
export const DRAFT_LOGO_DIR = path.join(tmpdir(), 'tracy-build-draft-logos')
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
/** A draft picture id: written into a file name, so nothing but a plain id is accepted. */
const PLAIN_ID = /^[A-Za-z0-9-]{1,64}$/

/**
 * @param {{brief: object, logoFile?: string | null, accountId?: string | null,
 *   openPicture?: ((id: string, opts: {accountId: string | null}) => Promise<{bytes: Buffer, mime?: string} | null>) | null,
 *   logoDir?: string}} input `openPicture`: the draft picture reader (`build-draft-gather-wiring.js` `draftPictureReader`)
 * @returns {Promise<{brief: object, logoFile?: string}>}
 */
export async function brandLogoInputOf({
  brief,
  logoFile = null,
  accountId = null,
  openPicture = null,
  logoDir = DRAFT_LOGO_DIR
}) {
  const id = logoIdOf(brief)
  if (!id) return { brief }
  if (typeof logoFile === 'string' && path.isAbsolute(logoFile) && existsSync(logoFile))
    return { brief, logoFile }
  const picture =
    PLAIN_ID.test(id) && openPicture ? await openPicture(id, { accountId }).catch(() => null) : null
  if (picture?.bytes?.length) {
    const file = path.resolve(logoDir, `${id}.${EXT[picture.mime] ?? 'png'}`)
    try {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, picture.bytes)
      return { brief, logoFile: file }
    } catch {
      // A file that cannot be written is a logo that cannot be had: the brief goes without it, below.
    }
  }
  return { brief: { ...brief, brand: { ...brief.brand, logo: null } } }
}
