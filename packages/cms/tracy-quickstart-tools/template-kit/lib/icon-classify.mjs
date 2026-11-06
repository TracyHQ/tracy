// Two questions asked by looking at a frame's crop. Is an icon generic (an arrow, a tick, a clock, a social mark,
// a texture: `fixed`) or does it draw the demo business's trade (`demo`)? Does a picture present real people as
// the demo business's own (avatar strips, reviewers, customers, staff portraits: `demo-faces`, keeping them
// would be fake proof), or are people at most part of an illustrative scene (`illustration`)? Asked of a vision model through the repo's vision door (TRACY_VISION_* settings, the image-code
// check of every answer), one call per batch of crops. The answer lands in icon-classes.json as `by: "model"`;
// an entry a person wrote (any other `by`) always wins. No door: nothing is classified and the kit names what
// is left in `errors` (never a guess).
export const ICON_PROMPT_VERSION = 'i2'
export const FACES_PROMPT_VERSION = 'f1'
export const ICON_CLASSES = new Set(['fixed', 'demo', 'demo-faces'])
export const FACE_CLASSES = new Set(['demo-faces', 'illustration'])

/** The question asked about a batch of icons of a template made for a demo business of `trade`. */
export function iconPrompt(trade) {
  const of = trade ? ` The demo business of this template is: ${trade}.` : ''
  return [
    `Each picture below is an icon cut from a website template, introduced by its id.${of}`,
    'For each icon decide one class:',
    '- "fixed": a generic interface icon any business could keep (arrow, tick, clock, phone, mail, pin, star,',
    '  quote mark, play button, social network mark, decorative texture or pattern).',
    '- "demo": an icon that draws the demo business\'s own trade, products or brand (its tools, its sport, its',
    '  goods, its logo or signature), which a different business would have to replace.',
    '- "demo-faces": an icon that shows the face of one or more real people (an avatar).',
    'Answer with JSON only: {"imageCode": "<the code shown in the first image>", "icons": [{"id": "<id>",',
    '"class": "fixed" | "demo" | "demo-faces", "reason": "<what the icon shows, at most 12 words>"}]}.'
  ].join('\n')
}

/** The question asked about a batch of pictures: do they present real people as the business's own? */
export function facesPrompt() {
  return [
    'Each picture below is cut from a website template made for a demo business, introduced by its id and the',
    'content field it fills. For each picture decide one class:',
    '- "demo-faces": it presents real people as the business\'s own: avatars or a strip of customer or reviewer',
    '  faces, staff, trainer or team portraits, an author photo. A new business keeping it would show strangers',
    '  as its own people, which is fake proof.',
    '- "illustration": no recognisable face, or people only as part of an illustrative scene (action shots,',
    '  places, objects, a crowd, a figure from behind, a drawing).',
    'Answer with JSON only: {"imageCode": "<the code shown in the first image>", "icons": [{"id": "<id>",',
    '"class": "demo-faces" | "illustration", "reason": "<what the picture shows, at most 12 words>"}]}.'
  ].join('\n')
}

/** Model entries never replace a person's. */
export function mergeClasses(existing = {}, fromModel = {}) {
  const out = { ...existing }
  for (const [id, c] of Object.entries(fromModel)) if (!out[id] || out[id].by === 'model') out[id] = c
  return out
}

/**
 * `question` picks the prompt and the classes it accepts: `icons` (the default) or `faces`.
 * @param {{door: {url: string, key: string, model: string}|null, icons: {id: string, bytes: Uint8Array, note?: string}[], trade?: string, batch?: number, question?: 'icons'|'faces',
 *   fetchImpl?: typeof fetch, challengeFor: () => Promise<{image: string}>, codeMatches: (answer: object, challenge: object) => boolean, instruction: string}} o
 * @returns {Promise<{classes: Record<string, {class: string, reason: string, by: string}>, unanswered: string[]}>}
 */
export async function classifyIcons({
  door,
  icons,
  trade,
  batch = 8,
  question = 'icons',
  fetchImpl = fetch,
  challengeFor,
  codeMatches,
  instruction
}) {
  const faces = question === 'faces'
  const prompt = faces ? facesPrompt() : iconPrompt(trade)
  const allowed = faces ? FACE_CLASSES : ICON_CLASSES
  const version = faces ? FACES_PROMPT_VERSION : ICON_PROMPT_VERSION
  const classes = {}
  if (!door || !icons.length) return { classes, unanswered: icons.map((i) => i.id) }
  for (let i = 0; i < icons.length; i += batch) {
    const group = icons.slice(i, i + batch)
    const challenge = await challengeFor()
    const content = [
      { type: 'text', text: `${prompt}\n${instruction}` },
      { type: 'image_url', image_url: { url: challenge.image } }
    ]
    for (const icon of group) {
      content.push({ type: 'text', text: `Id: ${icon.id}${icon.note ? ` (${icon.note})` : ''}` })
      const b64 = Buffer.from(icon.bytes).toString('base64')
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })
    }
    try {
      const res = await fetchImpl(door.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${door.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: door.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }]
        }),
        signal: AbortSignal.timeout(60_000)
      })
      if (!res.ok) continue
      const body = await res.json()
      const answer = JSON.parse(String(body?.choices?.[0]?.message?.content ?? ''))
      if (!codeMatches(answer, challenge)) continue
      const asked = new Set(group.map((g) => g.id))
      for (const a of Array.isArray(answer.icons) ? answer.icons : [])
        if (asked.has(a?.id) && allowed.has(a.class))
          classes[a.id] = {
            class: a.class,
            reason: String(a.reason ?? '').slice(0, 120),
            by: 'model',
            model: door.model,
            prompt: version
          }
    } catch {
      // A failed call leaves its icons unanswered; the kit names them in errors.
    }
  }
  return { classes, unanswered: icons.map((i) => i.id).filter((id) => !classes[id]) }
}
