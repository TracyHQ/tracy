/**
 * The build chat's stages (#604), each a slice of one of the two Contract B sample scenarios beside this file.
 *
 * The sample scenarios are the data behind the approved chat mock, an invented tennis club: the build that is
 * done (`sunrise-tennis-club-chat`) and the build that stops (`sunrise-tennis-club-chat-could-not-finish`). Both
 * files are checked in CI by gate `build-contract`. A stage says how much of that exchange the chat has received
 * at one moment, so every stage is checked against the contract too (`build-chat-scenarios.test.mjs`).
 *
 * Research is not a Contract B document: it is the build session's own `web_fetch` calls, shown as one
 * collapsed tool row. `RESEARCH` holds what those calls read, in the words of the mock.
 *
 * Adding a stage: append `{ name, from, take }` to `STAGES` and its name to `STAGE_NAMES`.
 */
import { readFileSync } from 'node:fs'

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))

/** The two Contract B sample scenarios. */
export const SCENARIOS = {
  done: read('./sunrise-tennis-club-chat.build-scenario.json'),
  stopped: read('./sunrise-tennis-club-chat-could-not-finish.build-scenario.json')
}

/** What research read, one entry per source the owner linked (the mock's research line). */
export const RESEARCH = {
  title: 'Read 3 sources',
  summary: '4 services, 38 photos, 6 reviews',
  sources: [
    {
      tool: 'web_fetch',
      url: 'https://sunrise-tennis.example',
      name: 'Website',
      summary: 'sunrise-tennis.example, 5 pages read',
      found: [
        'Name: Sunrise Tennis Club',
        'Phone: 04 000 0000',
        '3 services: Adult coaching, Junior squad, Court hire',
        'Club story, 2 paragraphs',
        'No prices published'
      ]
    },
    {
      tool: 'web_fetch',
      url: 'https://instagram.com/sunrise.tennis.example',
      name: 'Instagram',
      summary: '4 services, 38 photos',
      found: [
        '@sunrise.tennis.example, 412 posts',
        '38 usable photos of courts and classes',
        'Services: Adult coaching, Junior squad, Court hire',
        'Cardio tennis, only in a post caption',
        '2 upright videos, not used for the top banner'
      ]
    },
    {
      tool: 'web_fetch',
      url: 'https://maps.google.com/?cid=0000',
      name: 'Google Maps',
      summary: 'Rating 4.8, 6 reviews kept',
      found: [
        'Address: 12 Court Lane, Harbour District',
        'Open every day, 6:00 to 22:00',
        'Phone: 04 000 0009',
        '6 recent reviews kept word for word'
      ]
    }
  ]
}

/** A placeholder page picture (an inline drawing, no request): a nav bar, a banner and three tiles. */
const PICTURE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#e6e6e6"/>' +
    '<rect x="8" y="8" width="144" height="6" rx="2" fill="#c8c8c8"/><rect x="8" y="20" width="144" height="46" rx="3" fill="#b4b4b4"/>' +
    '<rect x="8" y="72" width="44" height="20" rx="2" fill="#c8c8c8"/><rect x="58" y="72" width="44" height="20" rx="2" fill="#c8c8c8"/>' +
    '<rect x="108" y="72" width="44" height="20" rx="2" fill="#c8c8c8"/></svg>'
)}`

/**
 * The templates the build session weighed for the business (the mock's template card). Not a Contract B document:
 * the session lists the released AI quickstarts and says which fit. Only JA Boxing has a released AI quickstart this
 * round; the other two fit the trade but are not ready, so the card must never show them.
 */
export const TEMPLATES = [
  {
    slug: 'ja-boxing',
    name: 'JA Boxing',
    version: '1.0.0',
    picture: PICTURE,
    reason: 'Built for sports clubs: classes, coaches and a booking button up front.',
    quickstart: 'released',
    fits: true,
    recommended: true
  },
  {
    slug: 'ja-kinetic',
    name: 'JA Kinetic',
    version: '1.0.0',
    picture: PICTURE,
    reason: 'Strong for fitness timetables; less room for coach profiles.',
    quickstart: 'none',
    fits: true
  },
  {
    slug: 'ja-impact',
    name: 'JA Impact',
    version: '1.0.0',
    picture: PICTURE,
    reason: 'Clean club layout; no reviews section, so reviews move to Home.',
    quickstart: 'none',
    fits: true
  }
]

/**
 * `take` names what of the scenario has arrived: `questions` only (before a plan exists), or the plan with the
 * first `edits` plan edits and the first `runs` runs; `events` cuts the last run to its first events, with no
 * outcome yet.
 */
export const STAGES = [
  { name: 'research', from: 'done', take: {} },
  { name: 'questions', from: 'done', take: { questions: true } },
  { name: 'template-choice', from: 'done', take: { plan: true, edits: 0, runs: 0 } },
  { name: 'plan-edit-undo', from: 'done', take: { plan: true, edits: 2, runs: 0 } },
  { name: 'building', from: 'done', take: { plan: true, edits: 2, runs: 1, events: 2 } },
  { name: 'done', from: 'done', take: { plan: true, edits: 2, runs: 1 } },
  { name: 'could-not-finish', from: 'stopped', take: { plan: true, runs: 1 } },
  { name: 'rebuild', from: 'done', take: { plan: true } }
]

export const STAGE_NAMES = [
  'research',
  'questions',
  'template-choice',
  'plan-edit-undo',
  'building',
  'done',
  'could-not-finish',
  'rebuild'
]

/**
 * The Contract B documents of one stage: `scenario`, a build scenario cut to the stage (null before the plan
 * exists), and `loose`, documents that arrived before any plan (the questions).
 */
export function stageDocuments(stage) {
  const source = structuredClone(SCENARIOS[stage.from])
  const { take } = stage
  if (!take.plan) return { scenario: null, loose: take.questions ? source.questions : [] }
  const scenario = { ...source }
  if (take.edits !== undefined) scenario.edits = (source.edits ?? []).slice(0, take.edits)
  if (take.runs !== undefined) scenario.runs = (source.runs ?? []).slice(0, take.runs)
  if (take.events !== undefined) {
    const last = scenario.runs.at(-1)
    scenario.runs[scenario.runs.length - 1] = { events: last.events.slice(0, take.events) }
  }
  return { scenario, loose: [] }
}
