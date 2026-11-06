// What each finisher model call was shown and what it answered, kept as files next to the repair log so a person can audit
// that the model looked at the pictures and what it said (spec #418). A reply file holds the role, the page or repair it
// was about, the door's label and model, the words it was sent, the image FILES it was sent (the finder's page tiles under
// `shots/`, the checker's crops under `crops/`, never the bytes), and the reply exactly as the model gave it.

export const REPLIES_DIR = 'replies'
export const SHOTS_DIR = 'shots'

const bytesOf = (image) => Buffer.from(String(image).replace(/^data:image\/[a-z]+;base64,/, ''), 'base64')

/** A page path as a file name part: `/` is `home`, `/about/coaches` is `about-coaches`. */
export const pageSlug = (page) =>
  String(page ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'home'

/**
 * Saves every tile of a page shot as a file, so the finder's pictures can be looked at later.
 * @param {(name: string, data: Buffer) => Promise<void>} saveFile
 * @param {{ page: string, viewport: string, index: number, image: string }[]} shots
 * @returns {Promise<(shot: object) => string | null>} the file a tile was saved as
 */
export async function keepShotFiles(saveFile, shots) {
  const files = new Map()
  for (const shot of shots) {
    const file = `${SHOTS_DIR}/${pageSlug(shot.page)}-${shot.viewport}-${shot.index}.jpg`
    await saveFile(file, bytesOf(shot.image))
    files.set(shot, file)
  }
  return (shot) => files.get(shot) ?? null
}

/**
 * @param {(name: string, data: string) => Promise<void>} saveFile
 * @returns {{ keep: (input: { name: string, role: string, page?: string | null, repair?: number | null,
 *   door: { label?: string, model?: string }, sent: object[], images: string[], call: object }) => Promise<void>,
 *   files: string[] }}
 */
export function replyKeeper(saveFile) {
  const files = []
  const keep = async ({ name, role, page = null, repair = null, door, sent, images, call }) => {
    const file = `${REPLIES_DIR}/${name}.json`
    const reply = {
      role,
      page,
      repair,
      door: door?.label ?? null,
      model: door?.model ?? null,
      sent: sent.filter((c) => c?.type === 'text').map((c) => c.text),
      images: images.filter(Boolean),
      text: call.text ?? null,
      problem: call.problem ?? null,
      costUsd: call.costUsd ?? null
    }
    await saveFile(file, `${JSON.stringify(reply, null, 2)}\n`)
    files.push(file)
  }
  return { keep, files }
}
