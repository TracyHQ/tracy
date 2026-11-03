// open_image(id): lets the agent look at a brief image or a kit image. The lab had no code for it (the agent read
// the file); here the image is found in the run folder (a brief image, by media id or path) or, when the run gives
// ctx.kitImage(id), among the kit images, and handed back downscaled to 512 px on the long edge as a PNG.
import { toAgentImage } from '../agent-image.js'
import { BrandToolError, imagePath, sharp } from './common.js'

export const tool = {
  name: 'open_image',
  description: 'Look at a brief image or a kit image by its id.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A brief image id (or file path), or a kit image id.' }
    },
    required: ['id'],
    additionalProperties: false
  },
  async run({ id }, ctx) {
    if (typeof id !== 'string' || !id) throw new BrandToolError('usage: open_image(id)')
    let bytes
    let file = null
    try {
      file = imagePath(ctx.files, id)
      bytes = ctx.files.read(file)
    } catch (e) {
      bytes = ctx.kitImage ? await ctx.kitImage(id) : null
      if (!bytes) throw e
    }
    const meta = await sharp(bytes).metadata()
    const shown = await toAgentImage(bytes)
    const small = await sharp(shown).metadata()
    return {
      ok: true,
      id,
      file,
      width: meta.width,
      height: meta.height,
      shownAt: [small.width, small.height],
      image: { mediaType: 'image/png', base64: shown.toString('base64') }
    }
  }
}
