// Shared planner and writer evidence reader. Domain policies stay in their own modules.
const list = (value) => (Array.isArray(value) ? value : [])

/** Only references actually delivered in a subsequent answered model turn count. */
export function reviewedImages({ kit, kitRef, history = [] }) {
  const catalogue = new Map(list(kit?.images).map((image) => [image.id, image.sha256]))
  const requested = new Set()
  const seen = new Set()
  for (const turn of [...history].sort((a, b) => a.n - b.n)) {
    if (turn.state !== 'answered') continue
    for (const message of list(turn.sent))
      for (const part of list(message?.content)) {
        const ref = part?.type === 'image_ref' ? part.ref : null
        if (
          ref?.kit === kitRef &&
          requested.has(ref.image) &&
          catalogue.has(ref.image) &&
          /^[a-f0-9]{64}$/.test(ref.sha256 ?? '') &&
          catalogue.get(ref.image) === ref.sha256
        )
          seen.add(ref.image)
      }
    // These calls are answered by tools after this model turn, so cannot prove delivery in this turn.
    for (const call of list(turn.message?.tool_calls)) {
      if (call?.function?.name !== 'open_kit_image') continue
      let args = call.function.arguments
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args)
        } catch {
          continue
        }
      }
      if (catalogue.has(args?.id)) requested.add(args.id)
    }
  }
  return seen
}
