/**
 * The picture a fill plan's neutral substitute is drawn as (spec TracyHQ/tracy#132), one door for every build path that
 * writes one (the editorial engine, quickstart-first, agent demos): a person's initials (#134), a signer's name in a
 * script font (#137), a blank for a signature nobody can sign, else the plain placeholder in the brand's colours.
 *
 * 🔒 A SIGNATURE IS NEVER A GREY BOX: a slot that showed a hand shows a name or nothing (a transparent picture of its size).
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { initialsAvatar } from './initials-avatar.js'
import { placeholderPicture } from './picture-cut.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** What kind of picture a substitute is drawn as, as receipts and reports name it. */
export function substituteKindOf(substitute) {
  if (substitute?.kind === 'initials-avatar') return 'avatar'
  if (substitute?.kind === 'script-signature') return 'signature'
  if (substitute?.kind === 'blank') return 'blank'
  return 'placeholder'
}

/**
 * @param {{substitute?: any, width: number, height: number, colours?: string[]}} input - `substitute`: the fill plan's
 *   decision (`planFill` slot `substitute`), null for the plain placeholder
 * @returns {Promise<{bytes: Buffer, ext: string, width: number, height: number, sha256: string, kind: string}>}
 */
export async function substitutePicture({ substitute = null, width, height, colours = [] }) {
  const kind = substituteKindOf(substitute)
  if (kind === 'avatar')
    return { ...(await initialsAvatar({ width, height, initials: substitute.initials, colours })), kind }
  if (kind === 'signature' && typeof substitute.svg === 'string') {
    const bytes = await sharp(Buffer.from(substitute.svg))
      .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return { bytes, ext: 'png', width, height, sha256: sha(bytes), kind }
  }
  if (kind === 'blank') {
    const bytes = await sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer()
    return { bytes, ext: 'png', width, height, sha256: sha(bytes), kind }
  }
  return { ...(await placeholderPicture({ width, height, colours })), kind: 'placeholder' }
}
