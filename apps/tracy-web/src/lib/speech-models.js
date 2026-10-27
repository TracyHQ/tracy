/** Speech model discovery is metadata, never proof of inference or model installation. */
import { createHmac } from 'node:crypto'
import { localSpeechFetch } from './speech-network.js'

export const ELEVEN_TTS_MODELS = new Set([
  'eleven_v4',
  'eleven_v4_turbo',
  'eleven_v3',
  'eleven_multilingual_v2',
  'eleven_flash_v2_5',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_flash_v2',
  'eleven_monolingual_v1',
  'eleven_multilingual_v1'
])
export const LOCAL_HTTP_TTS = new Set([
  'omnivoice',
  'voxcpm2',
  'cosyvoice',
  'mlx-audio',
  'kittentts',
  'moss-tts-nano',
  'indextts2'
])
const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,149}$/.test(value)
const text = (value, limit = 600) => (typeof value === 'string' ? value.slice(0, limit) : '')
export const documentedStt = () =>
  [
    { id: 'scribe_v2_realtime', name: 'Scribe v2 Realtime', kind: 'stt', selectable: true, reason: null },
    {
      id: 'scribe_v2',
      name: 'Scribe v2',
      kind: 'stt',
      selectable: false,
      reason: 'Batch transcription; this adapter requires the realtime WebSocket API.'
    },
    {
      id: 'scribe_v2_medical',
      name: 'Scribe v2 Medical',
      kind: 'stt',
      selectable: false,
      reason: 'Batch medical transcription; incompatible with this realtime adapter.'
    }
  ].map((model) => ({
    ...model,
    source: 'official-catalog',
    sourceUrl: 'https://elevenlabs.io/docs/overview/models'
  }))

export function classifySpeechModels(provider, payload) {
  const list = provider === 'elevenlabs' ? payload : payload?.data
  if (!Array.isArray(list) || list.length > 500) throw new Error('MODEL_LIST_INVALID')
  const models = [],
    seen = new Set()
  for (const raw of list) {
    const id = provider === 'elevenlabs' ? raw?.model_id : raw?.id
    if (!safeId(id) || seen.has(id)) continue
    seen.add(id)
    const kind =
      provider === 'elevenlabs'
        ? raw.can_do_text_to_speech === true
          ? 'tts'
          : 'other'
        : ['tts', 'stt'].includes(raw.voicestudio?.kind)
          ? raw.voicestudio.kind
          : 'other'
    const alias = provider === 'voicestudio' && raw.voicestudio?.alias_for_active_engine === true
    const selectable =
      kind === 'tts' && !alias && (provider === 'elevenlabs' ? ELEVEN_TTS_MODELS : LOCAL_HTTP_TTS).has(id)
    const reason = selectable
      ? null
      : kind === 'stt'
        ? 'Read-only: the streaming API uses the active ASR engine configured in VoiceStudio.'
        : alias
          ? 'Alias for the active engine; choose a concrete VoiceStudio engine.'
          : kind !== 'tts'
            ? 'Not a Text-to-Speech model.'
            : /^eleven_v[34].*(?:turbo|conversational)|^eleven_v4$/.test(id)
              ? 'This dialogue model has not been enabled for the current adapter.'
              : 'This model has not been enabled for the current PCM24k adapter.'
    models.push({
      id,
      name: text(raw.name, 150) || id,
      kind,
      selectable,
      reason,
      source: 'provider-api',
      alias,
      description: text(raw.description),
      ...(provider === 'elevenlabs'
        ? {
            canDoTextToSpeech: raw.can_do_text_to_speech === true,
            canDoVoiceConversion: raw.can_do_voice_conversion === true,
            canUseStyle: raw.can_use_style === true,
            canUseSpeakerBoost: raw.can_use_speaker_boost === true,
            requiresAlphaAccess: raw.requires_alpha_access === true,
            concurrencyGroup: text(raw.concurrency_group, 100),
            ...(typeof raw.token_cost_factor === 'number' ? { tokenCostFactor: raw.token_cost_factor } : {})
          }
        : {}),
      languages: Array.isArray(raw.languages)
        ? raw.languages
            .slice(0, 150)
            .filter((l) => safeId(l?.language_id))
            .map((l) => ({ id: l.language_id, name: text(l.name, 100) }))
        : [],
      ...(typeof raw.maximum_text_length_per_request === 'number'
        ? { maxCharacters: raw.maximum_text_length_per_request }
        : {})
    })
  }
  return provider === 'elevenlabs' ? [...documentedStt(), ...models] : models
}
export function speechModelFingerprint(snapshot, secret) {
  return createHmac('sha256', secret)
    .update(JSON.stringify([snapshot.provider, snapshot.profile.baseUrl ?? '', snapshot.key]))
    .digest('hex')
}
export async function readSpeechModels(pool, snapshot, secret) {
  const row = pool
    ? (
        await pool.query('select models, read_at, fingerprint from speech_model_cache where provider = $1', [
          snapshot.provider
        ])
      ).rows[0]
    : null
  return {
    models:
      row?.models?.map((model) =>
        snapshot.provider === 'elevenlabs' && model.kind === 'tts' && ELEVEN_TTS_MODELS.has(model.id)
          ? { ...model, selectable: true, reason: null }
          : model
      ) ?? (snapshot.provider === 'elevenlabs' ? documentedStt() : []),
    fetchedCount: row?.models?.filter((model) => model.source === 'provider-api').length ?? 0,
    readAt: row?.read_at ?? null,
    stale: Boolean(row && row.fingerprint !== speechModelFingerprint(snapshot, secret)),
    source:
      snapshot.provider === 'elevenlabs'
        ? 'ElevenLabs /v1/models; STT from the official model catalogue'
        : 'VoiceStudio /v1/models',
    inferenceTested: false
  }
}
export async function discoverSpeechModels(
  snapshot,
  { fetchImpl = fetch, localFetch = localSpeechFetch } = {}
) {
  if (!snapshot.configured) return { error: 'PROVIDER_NOT_CONFIGURED' }
  const url =
    snapshot.provider === 'elevenlabs'
      ? 'https://api.elevenlabs.io/v1/models'
      : `${snapshot.profile.baseUrl}/v1/models`
  try {
    const response = await (snapshot.provider === 'elevenlabs' ? fetchImpl : localFetch)(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(snapshot.key
          ? snapshot.provider === 'elevenlabs'
            ? { 'xi-api-key': snapshot.key }
            : { authorization: `Bearer ${snapshot.key}` }
          : {})
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error'
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      return { error: 'PROVIDER_REFUSED', status: response.status }
    }
    // Bound both JSON parsing and metadata storage; never forward arbitrary provider fields.
    const reader = response.body.getReader(),
      chunks = []
    let bytes = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > 1_000_000) throw new Error('MODEL_LIST_TOO_LARGE')
        chunks.push(Buffer.from(value))
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
    const models = classifySpeechModels(snapshot.provider, JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (snapshot.key && JSON.stringify(models).includes(snapshot.key)) return { error: 'MODEL_LIST_INVALID' }
    return { models }
  } catch {
    return { error: 'MODEL_LIST_UNAVAILABLE' }
  }
}
export async function saveSpeechModels(pool, snapshot, secret, models, at) {
  await pool.query(
    'insert into speech_model_cache (provider, models, read_at, fingerprint) values ($1, $2::jsonb, $3, $4) on conflict (provider) do update set models = excluded.models, read_at = excluded.read_at, fingerprint = excluded.fingerprint',
    [snapshot.provider, JSON.stringify(models), new Date(at), speechModelFingerprint(snapshot, secret)]
  )
}
