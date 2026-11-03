// Brand tools as the agent loop takes them (brand step trial bench, #320). The tools are product modules with the
// shape { name, description, inputSchema, run(input, ctx) } (brand-step/tools/); the loop wants { name, description,
// parameters, run(args) }. This adapter also keeps the saved conversation free of image bytes: every picture a tool
// returns is fitted to the harness's long edge (512 px), written to the run's file folder once, and travels as a
// reference to that file; resolveImage(ref) reads it back when a run resumes or a fix round replays the conversation.
import { createHash } from 'node:crypto'
import sharp from 'sharp'

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
      if (!result || typeof result !== 'object' || !Array.isArray(result.images)) return result
      return { ...result, images: await Promise.all(result.images.map(stored)) }
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
