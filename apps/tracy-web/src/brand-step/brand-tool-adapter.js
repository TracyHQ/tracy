// Brand tools as the agent loop takes them (brand step trial bench, #320). The tools are product modules with the
// shape { name, description, inputSchema, run(input, ctx) } (brand-step/tools/); the loop wants { name, description,
// parameters, run(args) }. A tool answers a JSON object, which goes to the agent as { text: '<the JSON>', images }.
// open_image adds `image: { mediaType, base64 }`: the adapter takes it out of the JSON and sends it as the agent's
// image entry { mediaType, base64, ref }.
// A usage error (BrandToolError) goes back as the JSON the lab tool printed: { ok: false, error, ...extra }.
// The saved conversation stays free of image bytes: every picture is fitted to the harness's long edge (512 px),
// written to the run's file folder once, and travels as a reference to that file; resolveImage(ref) reads it back
// when a run resumes or a fix round replays the conversation.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { BrandToolError } from './tools/common.js'

/** The picture fitted inside `edge` px on its long side (never enlarged); PNG stays PNG, anything else becomes JPEG. */
export async function fitToEdge({ mediaType, base64 }, edge) {
  const input = Buffer.from(base64, 'base64')
  try {
    const { width = 0, height = 0 } = await sharp(input).metadata()
    if (Math.max(width, height) <= edge) return { mediaType, bytes: input }
    const resized = sharp(input).resize({
      width: edge,
      height: edge,
      fit: 'inside',
      withoutEnlargement: true
    })
    return mediaType === 'image/png'
      ? { mediaType, bytes: await resized.png().toBuffer() }
      : { mediaType: 'image/jpeg', bytes: await resized.jpeg({ quality: 85 }).toBuffer() }
  } catch {
    // Bytes sharp cannot read go as they are.
    return { mediaType, bytes: input }
  }
}

/**
 * @param {{ tools: Array<{ name: string, description: string, inputSchema: object, run: Function }>, ctx: object,
 *   imageEdge: number, onTool?: (name: string | null) => void }} input `ctx.files` is the run's file folder
 * @returns {{ tools: object[], resolveImage: (ref: { file: string }) => Promise<{ mediaType: string, base64: string } | null> }}
 */
export function agentTools({ tools, ctx, imageEdge, onTool = () => {}, extra = [] }) {
  const written = new Map()
  const stored = async (image) => {
    const fitted = await fitToEdge(image, imageEdge)
    const sha256 = createHash('sha256').update(fitted.bytes).digest('hex')
    if (!written.has(sha256)) written.set(sha256, await ctx.files.write('agent-view.png', fitted.bytes))
    return {
      mediaType: fitted.mediaType,
      base64: fitted.bytes.toString('base64'),
      ref: { file: written.get(sha256), sha256 }
    }
  }
  const run = (tool) => async (args) => {
    onTool(tool.name)
    try {
      const result = await tool.run(args, ctx)
      if (!result || typeof result !== 'object') return result
      // Always the { text, images } envelope: a bare object with a `text` field of its own (set_name's) would be taken
      // by the loop for the envelope and only that string would reach the agent.
      const { image, ...rest } = result
      return { text: JSON.stringify(rest), images: image ? [await stored(image)] : [] }
    } catch (error) {
      if (!(error instanceof BrandToolError)) throw error
      return JSON.stringify({ ok: false, error: error.message, ...error.extra })
    } finally {
      onTool(null)
    }
  }
  return {
    tools: [...tools, ...extra].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? tool.parameters,
      run: tool.adapted ? tool.run : run(tool)
    })),
    async resolveImage(ref) {
      if (!ref?.file || !ctx.files.has(ref.file)) return null
      const bytes = await ctx.files.read(ref.file)
      const { mediaType } = await sharp(bytes)
        .metadata()
        .then((m) => ({ mediaType: m.format === 'png' ? 'image/png' : 'image/jpeg' }))
      return { mediaType, base64: Buffer.from(bytes).toString('base64') }
    }
  }
}
