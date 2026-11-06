// The before and after crops of one repair: the tile of the page and width where the finder saw the fault, from the first
// shots and from the page shot again after the write, kept as files next to the run so a repair can be reviewed at any time.
// A crop is the whole viewport tile for now; cutting it down to the repaired block comes with the block boxes (#424).

const bytesOf = (image) => Buffer.from(String(image).replace(/^data:image\/[a-z]+;base64,/, ''), 'base64')

const tileOf = (shots, fault) =>
  shots.filter((s) => s.page === fault.page && s.viewport === fault.viewport && s.index === fault.tile)

/**
 * @param {{ fault: { page: string, viewport: string, tile: number }, before: object[], after: object[], name: string,
 *   saveFile: (name: string, data: Buffer) => Promise<void> }} input
 * @returns {Promise<{ beforeShots: object[], afterShots: object[], files: { before: string[], after: string[] } }>}
 */
export async function cropsOf({ fault, before, after, name, saveFile }) {
  const beforeShots = tileOf(before, fault)
  const afterShots = tileOf(after, fault)
  const files = { before: [], after: [] }
  for (const [when, list] of [
    ['before', beforeShots],
    ['after', afterShots]
  ])
    for (const shot of list) {
      const file = `crops/${name}-${when}-${shot.viewport}-${shot.index}.jpg`
      await saveFile(file, bytesOf(shot.image))
      files[when].push(file)
    }
  return { beforeShots, afterShots, files }
}
