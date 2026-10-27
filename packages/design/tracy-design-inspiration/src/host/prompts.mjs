/**
 * The ten default prompts, on their own so the design bench can import them without dragging
 * `gallery.mjs` (and `node:path`) into a browser. No imports here, on purpose.
 */

/**
 * The prompt a chip opens with the first time (§4h decision 6): one per page kind, so the customer
 * edits a sensible ask instead of writing one from nothing. After the first model take, the model's
 * own `nextPrompt` replaces it.
 */
export const DEFAULT_PROMPTS = Object.freeze({
  home: 'Keep the headline. Make the rest shorter and more concrete: say what the visitor gets in the first screen, one clear call to action, no marketing adjectives.',
  listing:
    'One line per item, same length, verb first. The intro says who this list is for; keep the item names as they are.',
  article:
    'Keep the title. Open with the one fact the reader came for, then the story in plain sentences; no summary at the end.',
  pricing:
    'Keep the prices and plan names. Say who each plan is for in one line, and what happens after signing up; no "best value" labels.',
  landing:
    'A landing page for one thing we sell: headline states the result, the first paragraph names who it is for, three benefits with a real detail each, one call to action repeated at the end.',
  form: 'A contact page: say in two lines what happens after sending and how soon we answer. Field labels short and plain; the button says what it does, not "Submit".',
  newsletter:
    "This month's issue: one lead story in our own voice, two short updates, one thing readers can do this week. Warm, first person plural, no exclamation marks.",
  email:
    'A transactional email: the subject line says what happened, the first sentence says what to do next, one button. Plain and short — it is read on a phone.',
  poster:
    'A poster for an event or launch: one line that stops a passer-by, the date and place large, one sentence of why to come. Nothing else.',
  typography:
    'Specimen lines for a type sample: each heading a full sentence in our own voice about what we make, the lead and body paragraphs about how we work — real, specific, no filler; keep each line close to its current length.',
  deck: 'An executive deck: title slide with the one-sentence pitch, then problem, what we do, proof with real numbers, the ask. Short lines, no paragraphs.'
})
