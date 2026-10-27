/** Deployment speech profiles. Secrets only enter server snapshots, never the facts document. */
import { metadataAddress } from './speech-network.js'
import { createHmac } from 'node:crypto'
import { openSecret, sealSecret } from './secret-box.js'
import { SPEAK_SERVICE, SPEAK_VOICES, SPEECH_SERVICE } from './speech.js'
import { ELEVEN_TTS_MODELS, LOCAL_HTTP_TTS } from './speech-models.js'

export const LOCAL_DEFAULTS = Object.freeze({
  baseUrl: '',
  ttsModel: 'omnivoice',
  voice: 'default',
  fallbackEnabled: false
})
export const ELEVEN_DEFAULTS = Object.freeze({
  sttModel: SPEECH_SERVICE.model,
  ttsModel: SPEAK_SERVICE.model,
  fallbackEnabled: false
})
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,149}$/.test(value)

/** Private/loopback destinations are intentional for self-hosting; metadata and URL credentials are not. */
export function parseSpeechBase(value) {
  try {
    if (typeof value !== 'string' || value.length > 1000) throw new Error()
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      metadataAddress(host) ||
      ['metadata.google.internal', 'metadata', 'fd00:ec2::254'].includes(host)
    )
      throw new Error()
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function parseSpeechProfile(body) {
  if (!body || !['elevenlabs', 'voicestudio'].includes(body.provider))
    return { ok: false, error: 'PROVIDER_UNKNOWN' }
  const p = body.profile
  if (!p || typeof p !== 'object') return { ok: false, error: 'PROFILE_MISSING' }
  if (p.fallbackEnabled !== undefined && typeof p.fallbackEnabled !== 'boolean')
    return { ok: false, error: 'FALLBACK_INVALID' }
  const fallbackEnabled = p.fallbackEnabled ?? false
  if (body.provider === 'elevenlabs') {
    // STT is the realtime protocol; other ElevenLabs STT models do not speak it.
    if (p.sttModel !== SPEECH_SERVICE.model || !ELEVEN_TTS_MODELS.has(p.ttsModel))
      return { ok: false, error: 'MODEL_INCOMPATIBLE' }
    return {
      ok: true,
      provider: body.provider,
      profile: { sttModel: p.sttModel, ttsModel: p.ttsModel, fallbackEnabled }
    }
  }
  const baseUrl = parseSpeechBase(p.baseUrl)
  if (!baseUrl) return { ok: false, error: 'URL_INVALID' }
  if (!id(p.ttsModel) || !id(p.voice)) return { ok: false, error: 'MODEL_OR_VOICE_INVALID' }
  if (p.sttModel !== undefined) return { ok: false, error: 'STT_MODEL_READ_ONLY' }
  if (!LOCAL_HTTP_TTS.has(p.ttsModel)) return { ok: false, error: 'MODEL_INCOMPATIBLE' }
  if (p.token !== undefined && (typeof p.token !== 'string' || p.token.length > 500 || /\s/.test(p.token)))
    return { ok: false, error: 'TOKEN_INVALID' }
  return {
    ok: true,
    provider: body.provider,
    profile: {
      baseUrl,
      ttsModel: p.ttsModel,
      voice: p.voice,
      fallbackEnabled,
      ...(p.token !== undefined ? { token: p.token } : {})
    }
  }
}

export async function readSpeechProfile(pool, config, draft = null, secondary = false, savedRow = undefined) {
  const row =
    savedRow !== undefined
      ? savedRow
      : pool
        ? ((
            await pool.query(
              'select provider, profiles, revision, api_key_cipher from speech_setting where id'
            )
          ).rows[0] ?? null)
        : null
  const profiles = row?.profiles ?? {}
  const provider = draft?.provider ?? row?.provider ?? 'elevenlabs'
  const saved = { ...(provider === 'voicestudio' ? LOCAL_DEFAULTS : ELEVEN_DEFAULTS), ...profiles[provider] }
  const profile = { ...saved, ...draft?.profile }
  const key =
    provider === 'elevenlabs'
      ? (row?.api_key_cipher ? await openSecret(row.api_key_cipher, config.sessionSecret) : null) ||
        config.speech?.apiKey ||
        null
      : profile.token !== undefined
        ? profile.token || null
        : saved.tokenCipher
          ? await openSecret(saved.tokenCipher, config.sessionSecret)
          : null
  const unreadable =
    provider === 'voicestudio' && Boolean(saved.tokenCipher) && profile.token === undefined && !key
  delete profile.token
  delete profile.tokenCipher
  // A key rotation also changes the snapshot even if an older key-only client saved it.
  const revision = createHmac('sha256', config.sessionSecret)
    .update(JSON.stringify([row?.revision ?? 1, provider, profile, key]))
    .digest('hex')
    .slice(0, 24)
  const snapshot = {
    provider,
    profile,
    key,
    revision,
    configured: provider === 'elevenlabs' ? Boolean(key) : Boolean(profile.baseUrl) && !unreadable,
    unreadable,
    profiles: {
      elevenlabs: { ...ELEVEN_DEFAULTS, ...profiles.elevenlabs },
      voicestudio: {
        ...LOCAL_DEFAULTS,
        ...profiles.voicestudio,
        tokenConfigured: Boolean(profiles.voicestudio?.tokenCipher)
      }
    }
  }
  if (!secondary && profile.fallbackEnabled) {
    const other = provider === 'elevenlabs' ? 'voicestudio' : 'elevenlabs'
    const alternative = await readSpeechProfile(pool, config, { provider: other, profile: {} }, true, row)
    // Rotating the target's legacy key also fences sessions already using that fallback.
    const sharedRevision = createHmac('sha256', config.sessionSecret)
      .update(JSON.stringify([revision, alternative.provider, alternative.profile, alternative.key]))
      .digest('hex')
      .slice(0, 24)
    snapshot.revision = sharedRevision
    snapshot.alternative = {
      ...alternative,
      revision: sharedRevision,
      primaryProvider: provider,
      fallbackUsed: true
    }
  }
  return snapshot
}

export function speechProfileFacts(snapshot) {
  const local = { ...snapshot.profiles.voicestudio }
  delete local.tokenCipher
  return {
    provider: snapshot.provider,
    revision: snapshot.revision,
    configured: snapshot.configured,
    profile: snapshot.profile,
    fallback: snapshot.alternative
      ? { provider: snapshot.alternative.provider, configured: snapshot.alternative.configured }
      : null,
    profiles: { elevenlabs: snapshot.profiles.elevenlabs, voicestudio: local }
  }
}

/** Merge one profile and activate it in one SQL write; never replaces the other provider. */
export async function saveSpeechProfile(pool, parsed, secret, by) {
  const profile = { ...parsed.profile }
  if (Object.hasOwn(profile, 'token')) {
    profile.tokenCipher = profile.token ? await sealSecret(profile.token, secret) : null
    delete profile.token
  }
  await pool.query(
    `insert into speech_setting (id, updated_by, provider, profiles) values (true, $1, $2, jsonb_build_object($2::text, $3::jsonb))
    on conflict (id) do update set provider = excluded.provider,
    profiles = jsonb_set(speech_setting.profiles, array[$2::text], coalesce(speech_setting.profiles->$2::text, '{}'::jsonb) || $3::jsonb),
    revision = speech_setting.revision + 1, updated_by = excluded.updated_by, updated_at = now()`,
    [by, parsed.provider, JSON.stringify(profile)]
  )
}

export const speechVoices = (snapshot) =>
  snapshot.provider === 'voicestudio'
    ? [{ id: snapshot.profile.voice, name: `VoiceStudio · ${snapshot.profile.voice}` }]
    : SPEAK_VOICES
export const speechServices = (snapshot) => ({
  listening: {
    provider: snapshot.provider === 'voicestudio' ? 'VoiceStudio' : 'ElevenLabs',
    model: snapshot.profile.sttModel ?? 'Active ASR engine on VoiceStudio'
  },
  speaking: {
    provider: snapshot.provider === 'voicestudio' ? 'VoiceStudio' : 'ElevenLabs',
    model: snapshot.profile.ttsModel
  }
})

export function speechTtsRequest(snapshot, asked) {
  if (snapshot.provider === 'voicestudio')
    return {
      url: `${snapshot.profile.baseUrl}/v1/audio/speech`,
      headers: {
        'content-type': 'application/json',
        ...(snapshot.key ? { authorization: `Bearer ${snapshot.key}` } : {})
      },
      body: JSON.stringify({
        model: snapshot.profile.ttsModel,
        input: asked.text,
        voice: asked.voice,
        response_format: 'pcm',
        ...(asked.language ? { language: asked.language } : {}),
        seed: 42,
        num_step: 16
      }),
      timeoutMs: 90_000
    }
  if (['eleven_v4', 'eleven_v4_turbo'].includes(snapshot.profile.ttsModel)) {
    const socket = snapshot.profile.ttsModel === 'eleven_v4_turbo'
    const url = new URL(
      socket
        ? 'wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input'
        : 'https://api.elevenlabs.io/v1/text-to-dialogue/stream'
    )
    url.searchParams.set('output_format', SPEAK_SERVICE.format)
    if (socket) {
      url.searchParams.set('model_id', snapshot.profile.ttsModel)
      if (asked.language) url.searchParams.set('language_code', asked.language)
    }
    return {
      url: url.toString(),
      transport: socket ? 'dialogue-ws' : 'dialogue-http',
      headers: { 'xi-api-key': snapshot.key, 'content-type': 'application/json', accept: 'audio/pcm' },
      body: JSON.stringify({
        model_id: snapshot.profile.ttsModel,
        inputs: [{ text: asked.text, voice_id: asked.voice }],
        ...(asked.language ? { language_code: asked.language } : {})
      }),
      voice: asked.voice,
      text: asked.text,
      timeoutMs: 30_000
    }
  }
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${asked.voice}/stream?output_format=${SPEAK_SERVICE.format}`,
    headers: {
      'xi-api-key': snapshot.key,
      'content-type': 'application/json',
      accept: 'application/octet-stream'
    },
    body: JSON.stringify({
      text: asked.text,
      model_id: snapshot.profile.ttsModel,
      ...(asked.language &&
      ['eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'].includes(snapshot.profile.ttsModel)
        ? { language_code: asked.language }
        : {})
    }),
    timeoutMs: 10_000
  }
}

/** Browser-safe capabilities of the actual session provider, never inferred by consumers. */
export function speechCapabilities(snapshot) {
  return {
    stt: { input: 'pcm_s16le', sampleRate: 16_000, channels: 1 },
    tts: {
      output: 'pcm_s16le',
      sampleRate: 24_000,
      channels: 1,
      streaming: snapshot.provider === 'elevenlabs',
      prewarm:
        snapshot.provider === 'elevenlabs' &&
        !['eleven_v4', 'eleven_v4_turbo'].includes(snapshot.profile.ttsModel) &&
        !snapshot.profile.fallbackEnabled &&
        !snapshot.fallbackUsed
    }
  }
}
export function speechSpeakFacts(snapshot) {
  return {
    maxChars: 600,
    sampleRate: 24_000,
    answerMs:
      snapshot.provider === 'voicestudio'
        ? 90_000
        : ['eleven_v4', 'eleven_v4_turbo'].includes(snapshot.profile.ttsModel)
          ? 30_000
          : 10_000
  }
}
