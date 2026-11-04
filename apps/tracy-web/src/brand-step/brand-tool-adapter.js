// Brand tools as the agent loop takes them (brand step trial bench, #320). The tools are product modules with the
// shape { name, description, inputSchema, run(input, ctx) } (brand-step/tools/); the loop wants { name, description,
// parameters, run(args) }. A tool answers a JSON object, which goes to the agent as { text: '<the JSON>', images }.
// open_image adds `image: { mediaType, base64 }`: the adapter takes it out of the JSON and sends it as the agent's
// image entry { mediaType, base64, ref }.
// A usage error (BrandToolError) goes back as the JSON the lab tool printed: { ok: false, error, ...extra }.
// The saved conversation stays free of image bytes: every picture is fitted to the harness's long edge (512 px),
// written to the run's file folder once, and travels as a reference to that file; resolveImage(ref) reads it back
// when a run resumes or a fix round replays the conversation.
// Every tool answer is saved (`results`, brand-tool-result-store.js) before it goes back to the loop, keyed by the agent
// turn that made the call, the tool, its arguments and its place among identical calls of that turn. A run that resumes
// re-runs the tools of its last answered turn; a call with a saved answer gets that answer and the tool is not called,
// so a drawing or a reviewer question is never paid twice. A cost cap reached inside a tool (CostCapReached) is not
// an answer: `onCapReached` hears it, the call is answered as a failure that is not saved, and the caller ends the run.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { CostCapReached } from './brand-spend.js'
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
 *   imageEdge: number, onTool?: (name: string | null) => void,
 *   results?: { get: Function, put: Function }, onCapReached?: (error: Error) => void }} input `ctx.files` is the run's file folder
 * @returns {{ tools: object[], resolveImage: (ref: { file: string }) => Promise<{ mediaType: string, base64: string } | null> }}
 */
export function agentTools({
  tools,
  ctx,
  imageEdge,
  onTool = () => {},
  extra = [],
  results = null,
  onCapReached = () => {}
}) {
  const written = new Map()
  const places = new Map()
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
  /** The key of a call: its turn, tool, arguments and place among identical calls of the turn. Null: nothing to key by. */
  const keyOf = (tool, args, turn) => {
    if (!results || !Number.isInteger(turn)) return null
    const argsSha = createHash('sha256')
      .update(JSON.stringify(args ?? {}))
      .digest('hex')
    const place = `${turn}|${tool}|${argsSha}`
    const seq = places.get(place) ?? 0
    places.set(place, seq + 1)
    return { turn, tool, argsSha, seq }
  }
  // What goes back to the loop from a saved answer: text (a string), or the { text, images } envelope; a picture is
  // read back from the run's file folder.
  const replayed = async (saved) => {
    if (saved.kind === 'text') return saved.text
    if (saved.kind === 'raw') return saved.value
    const images = []
    for (const ref of saved.images ?? []) {
      const bytes = await ctx.files.read(ref.ref.file)
      images.push({ mediaType: ref.mediaType, base64: Buffer.from(bytes).toString('base64'), ref: ref.ref })
    }
    return { text: saved.text, images }
  }
  const saveable = (answer) => {
    if (typeof answer === 'string') return { kind: 'text', text: answer }
    if (!answer || typeof answer !== 'object') return { kind: 'raw', value: answer ?? null }
    return {
      kind: 'envelope',
      text: answer.text,
      images: answer.images.map(({ mediaType, ref }) => ({ mediaType, ref }))
    }
  }
  const answerOf = async (tool, args) => {
    try {
      const result = await tool.run(args, ctx)
      // Always the { text, images } envelope: a bare object with a `text` field of its own (set_name's) would be taken
      // by the loop for the envelope and only that string would reach the agent.
      if (!result || typeof result !== 'object') return result
      const { image, ...rest } = result
      return { text: JSON.stringify(rest), images: image ? [await stored(image)] : [] }
    } catch (error) {
      if (error instanceof BrandToolError)
        return JSON.stringify({ ok: false, error: error.message, ...error.extra })
      if (error instanceof CostCapReached) {
        onCapReached(error)
        return { unsaved: JSON.stringify({ error: 'TOOL_FAILED', tool: tool.name, detail: error.message }) }
      }
      // What the loop would have made of any other failure; saved too, so a paid call that failed is not paid again.
      return JSON.stringify({
        error: 'TOOL_FAILED',
        tool: tool.name,
        detail: String(error?.message ?? error)
      })
    }
  }
  const run = (tool) => async (args, meta) => {
    const key = keyOf(tool.name, args, meta?.call)
    const saved = key ? await results.get(key) : null
    if (saved) return replayed(saved)
    onTool(tool.name)
    try {
      const answer = await answerOf(tool, args)
      if (answer?.unsaved) return answer.unsaved
      if (key) await results.put(key, saveable(answer))
      return answer
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
