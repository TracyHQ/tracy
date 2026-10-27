/**
 * The LLM providers this deployment knows how to talk to, as data.
 *
 * WHY A CATALOG IN CODE AND A DELTA IN THE DATABASE. Borrowed from `tracy-desk`, which learned it
 * the expensive way: it keeps 62 providers as typed source and generates its JSON, and it stores
 * a user's configuration as a `presetProviderId` plus the fields they actually set — never a copy
 * of the preset. The reason is that a copy freezes: the day a provider moves its base URL, every
 * deployment that copied the old one keeps calling the old address, and nothing says why.
 *
 * So here: a row in `llm_provider` names a `preset_id` and carries only what an administrator
 * typed — key, and a base URL only when they overrode ours. Everything else is read from this
 * file at request time, which means a corrected address arrives with a deploy rather than with a
 * migration.
 *
 * 🔒 EIGHT, NOT SIXTY-TWO (22/09). `tracy-desk` is a desktop app where a person brings their
 * own account to any provider they like; this is one company's fleet, and every provider listed
 * here is a credential somebody at Tracy has to hold, rotate and pay for. The list is deliberately
 * the ones actually used, plus Ollama for a machine that runs its own.
 *
 * ⚠ EVERY ENTRY IS OPENAI-COMPATIBLE — they all answer `POST {baseUrl}/chat/completions` with a
 * bearer token, which is the ONE shape every door in this repo already speaks (`config.js`'s
 * `readModel`, `tracy-seeder/src/model.mjs`, both themes' `personalize.mjs`). Anthropic's own
 * `/v1/messages` and Gemini's `generateContent` are NOT spoken here: both vendors publish an
 * OpenAI-compatible address, and that is the one named below. A provider that needs a different
 * wire format needs an adapter, not a row — `tracy-desk` splits exactly this into
 * `endpointType` × `adapterFamily`, and the day this repo needs that, that is the shape to copy.
 */

/**
 * @typedef {object} CatalogEntry
 * @property {string} id - stable, and the value a row's `preset_id` holds. Never renamed.
 * @property {string} name - what a person calls it.
 * @property {string} baseUrl - our default; a row may override it.
 * @property {string} apiKeyUrl - where an administrator goes to get a key. A screen that asks for
 *   a credential and does not say where to obtain it sends everybody to a search engine.
 * @property {string} [keyPrefix] - how that vendor's keys start, shown as a hint beside the field.
 *   Not validated: a vendor changing its prefix must not lock somebody out of their own account.
 * @property {boolean} [keyOptional] - a provider that needs no key at all (a local runtime). The
 *   door must not treat "no key" as "not configured" for these.
 * @property {string} [note] - one sentence of what it is good for here.
 */

/** @type {CatalogEntry[]} */
export const LLM_CATALOG = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
    note: "What the agent talks to today, and the seeder's text when no OpenRouter key is set."
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
    note: 'One key for many vendors. The only door here that answers with PICTURES, which is why a built site gets photographs at all.'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    // The OpenAI-compatible address, NOT `/v1/messages` — see this file's header on why.
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-'
  },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyUrl: 'https://console.mistral.ai/api-keys'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyUrl: 'https://ollama.com/download',
    // 🔒 NO KEY, AND THE DOOR MUST KNOW THAT. Treating a local runtime as "not configured"
    // because it has no credential is how a working provider gets drawn as broken.
    keyOptional: true,
    note: 'A model running on the machine itself. Needs no key; needs to be reachable from this process.'
  }
]

export const catalogEntry = (id) => LLM_CATALOG.find((e) => e.id === id) ?? null

/**
 * The base URL a request should actually use — the row's override, else the catalog's.
 *
 * 🔒 THE TRAILING `#` MEANS "LEAVE MY URL ALONE", borrowed from `tracy-desk`'s `formatApiHost`.
 * Everything else gets its trailing slashes trimmed. The escape hatch matters because a gateway
 * in front of a provider may legitimately need a path this code would otherwise tidy away, and a
 * one-character opt-out is cheaper than a second column nobody would find.
 */
export function baseUrlFor(row) {
  const raw = (row?.baseUrl || catalogEntry(row?.presetId)?.baseUrl || '').trim()
  if (raw.endsWith('#')) return raw.slice(0, -1)
  return raw.replace(/\/+$/, '')
}

/**
 * The jobs this deployment spends a model on, named — so an administrator assigns a provider
 * to a JOB rather than to a piece of code, and so a screen can say what changing one affects.
 *
 * ⚠ THEY DO NOT ALL RUN IN THIS PROCESS, and the screen has to say so. `web` is answered here;
 * `seedText`/`seedImage` are spent by the seeder inside `tracy-dsh` and by `personalize.mjs`
 * inside a customer's own container; `agent` is the model every customer's agent talks to. The
 * measurement behind this split is in `apps/tracy-web/src/ops/general.js`'s header.
 */
export const LLM_DOORS = [
  {
    id: 'web',
    label: "Text for Tracy's own pages",
    where: 'this process',
    blurb: 'The public Design templates page and quickstart card drafts.',
    needsModel: true,
    // Wanted, not required: both callers ask for JSON and unwrap a fenced answer, so a model
    // without `structured_outputs` works — less reliably.
    // The screen warns; the door does not refuse.
    prefers: ['json']
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    where: 'this process',
    blurb:
      'The chat with Tracy in the corner of the customer’s page: answers about Tracy and the asker’s own sites. Not set: it borrows “Text for Tracy’s own pages”.',
    needsModel: true,
    // Streamed text, no tool calls: the server builds the asker's context itself
    // (`assistant/context.js`), so any chat model works. A fast, cheap one is the right pick.
    prefers: []
  },
  {
    id: 'seedText',
    label: 'Text for a built site',
    where: 'tracy-dsh, and the customer site container',
    blurb: "Blog posts, page sections and translations written into a customer's new site.",
    needsModel: true,
    prefers: ['json']
  },
  {
    id: 'woEditorial',
    label: 'WO editorial',
    where: 'this process',
    blurb: 'Website Opportunities: understand source dossiers and plan content across the whole site.',
    needsModel: true,
    requires: ['reasoning'],
    prefers: ['json'],
    configurableEffort: true
  },
  {
    id: 'vision',
    label: 'Read pictures',
    where: 'this process',
    blurb:
      'Website Opportunities: analyze source photographs and review rendered screenshots. Requires a separate pixel test; drawing pictures does not prove this capability.',
    needsModel: true,
    requires: ['vision'],
    prefers: ['json']
  },
  {
    id: 'seedImage',
    label: 'Pictures for a built site',
    where: 'tracy-dsh, and the customer site container',
    blurb: 'Photographs drawn for the customer’s trade. Only some models answer with images.',
    needsModel: true,
    // 🔒 REQUIRED, not preferred — the difference is whether the door REFUSES or the screen warns.
    // This is the one job whose mismatch a machine can prove and whose failure is completely
    // silent: a text-only model gives the customer a site with no photographs and no error.
    requires: ['draws'],
    drawsPictures: true
  },
  {
    id: 'agent',
    label: "The agent's model",
    where: 'tracy-dsh',
    blurb:
      "What every customer's agent talks to. Tracy changes the key here; the model itself is chosen by the agent runtime.",
    // 🔒 KEY ONLY, BY DECISION (22/09): "I only need to change the key when the current one runs out of credit".
    // Choosing a different model for the agent means touching `agent-default-model` inside the
    // dsh image, which is a different job from rotating a credential.
    needsModel: false
  }
]

export const doorEntry = (id) => LLM_DOORS.find((d) => d.id === id) ?? null

/**
 * What each capability is called on screen, and what it is read from — one place, so the door that
 * refuses and the screen that explains use the same words.
 *
 * ⚠ `null` IS "UNKNOWN", EVERYWHERE. Only OpenRouter publishes this shape today; a provider that
 * declares nothing must not have its models drawn as incapable.
 */
export const CAPABILITIES = [
  { id: 'draws', label: 'Draws pictures', from: 'architecture.output_modalities' },
  { id: 'vision', label: 'Reads pictures', from: 'architecture.input_modalities' },
  { id: 'reasoning', label: 'Reasoning', from: 'supported_parameters' },
  { id: 'tools', label: 'Tool calls', from: 'supported_parameters' },
  { id: 'json', label: 'Structured output', from: 'supported_parameters' }
]
