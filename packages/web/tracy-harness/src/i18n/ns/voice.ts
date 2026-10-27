/**
 * /ops › Agents › Voice. Provider names, model ids, outcome and status values, reasons and messages
 * the server or the speech service sends are shown as sent; Tracy's own labels and hints are here.
 */
export const NS = 'voice'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['Voice.tsx'] as const

export const en = {
  'voice.title': 'Voice',
  'voice.lead':
    "The microphone beside Send in the customer's chat box, and in the comment box of the Browser tab: they speak, and the words appear as they are recognised, in the language spoken. One switch for every agent.",
  'voice.notCounted': 'Not counted on a server without a database.',

  'voice.error.load': 'Voice answered {status}',
  'voice.error.models': 'Model list answered {status}',
  'voice.error.switch': 'The switch answered {status}',
  'voice.error.keyNotSaved': 'The key was not saved ({reason})',
  'voice.error.pilotNotSaved': 'The pilot list was not saved ({reason})',
  'voice.error.test': 'The test answered {status}',
  'voice.error.profile': 'Speech profile: {reason}',

  'voice.health.stt': 'Speech to text',
  'voice.health.tts': 'Text to speech',
  'voice.health.notTried': '{what}: not tried yet.',
  'voice.health.unavailable':
    '{what}: the service is unavailable ({reason}, {when}). Check its server, installed models and required terms, then test again.',
  'voice.health.ok': '{what}: the service takes the key ({when}).',
  'voice.health.limited.stt':
    '{what}: the service LIMITS this account ({reason}, {when}). The key is accepted, but dictation and Voice fail until the account is topped up or released.',
  'voice.health.limited.tts':
    '{what}: the service LIMITS this account ({reason}, {when}). The key is accepted, but readings fail until the account is topped up or released.',
  'voice.health.refused.stt':
    '{what}: the service REFUSES the key ({reason}, {when}). Customers see no microphone and no Voice until a key with this permission is saved.',
  'voice.health.refused.tts':
    '{what}: the service REFUSES the key ({reason}, {when}). Customers see no Voice until a key with this permission is saved.',
  'voice.health.reason.unavailable': 'unavailable',
  'voice.health.reason.limited': 'limited',
  'voice.health.reason.refused': 'refused',
  'voice.health.tried': 'Tried every 10 minutes while voice is on, and when a key is saved.',

  'voice.span.speechToReply': 'End of speech → reply heard',
  'voice.span.speechToCommit': 'End of speech → phrase confirmed',
  'voice.span.commitToSent': 'Confirmed → message sent',
  'voice.span.sentToAck': 'Sent → “got it” heard',
  'voice.span.sentToReply': 'Sent → reply heard',
  'voice.share.errors': 'Failed',
  'voice.share.interrupted': 'Cut off before the reply',
  'voice.share.ackCached': '“Got it” ready at once',
  'voice.turns.step': 'Step',
  'voice.turns.day': 'Last 24 hours ({turns})',
  'voice.turns.week': 'Last 7 days ({turns})',

  'voice.seen.unknown': 'Unknown: the switch could not be read',
  'voice.seen.off': 'No microphone: voice is off',
  'voice.seen.sttFailed': 'Microphone unavailable: listening test failed',
  'voice.seen.notConfigured': 'No microphone: speech is not configured',
  'voice.seen.on': 'Microphone shown in every chat and comment box',

  'voice.key.unread': 'Could not read the speech key.',
  'voice.key.saved': 'Saved here ({hint}).',
  'voice.key.savedBy': 'Saved here ({hint}) by {by}.',
  'voice.key.savedAt': 'Saved here ({hint}), {when}.',
  'voice.key.savedByAt': 'Saved here ({hint}) by {by}, {when}.',
  'voice.key.env':
    "From this server's environment, SPEECH_TO_TEXT_API_KEY ({hint}). Save one here to use it instead.",
  'voice.key.none': 'No key yet. Paste an ElevenLabs API key with the Speech to Text permission.',
  'voice.key.title': 'ElevenLabs key',
  'voice.key.onlyElevenLabs': 'This key is used only by ElevenLabs and stays on the server.',
  'voice.key.unreadable':
    "The key saved here can no longer be opened (this server's secret changed). Paste it again.",
  'voice.key.placeholder': 'Paste an ElevenLabs API key',
  'voice.key.aria': 'Speech key',
  'voice.key.test': 'Test',
  'voice.key.save': 'Save key',
  'voice.key.worksTyped': 'Works: this key can open voice sessions.',
  'voice.key.worksInUse': 'Works: the key in use can open voice sessions.',
  'voice.key.fails': 'Does not work: {message}',
  'voice.key.removeAsk':
    'Remove the saved key? Voice then uses SPEECH_TO_TEXT_API_KEY if this server has one; if not, no microphone shows anywhere.',
  'voice.key.remove': 'Remove key',
  'voice.key.keep': 'Keep it',
  'voice.key.removeSaved': 'Remove saved key…',

  'voice.switch.title': 'Voice input',
  'voice.switch.description':
    "On: the microphone shows in every customer's chat and comment box, for every agent, and the chat's header offers a voice conversation (the customer talks, Tracy says what it does and reads its reply out loud). Off: neither shows anywhere, and the server refuses every voice session and every reading. The same switch as Composer › Voice input on User Interface.",
  'voice.switch.seenNow': 'What customers see now',
  'voice.switch.readOnly': 'Only an owner or admin of this deployment can press it or change the key.',

  'voice.provider.title': 'Speech provider',
  'voice.provider.active':
    'Active: {provider}. Choose one provider for listening and spoken replies. Each profile is kept when you switch.',
  'voice.provider.runtime': 'Most recent voice connection: {provider}, {status}.',
  'voice.provider.runtimeFallback': '{provider} (fallback)',
  'voice.provider.label': 'Provider',
  'voice.provider.serverUrl': 'Server URL',
  'voice.provider.voicestudioServer':
    'A server Tracy can reach, including a private or local server. VoiceStudio must be installed separately. Listening uses its active ASR engine; configure that engine in VoiceStudio.',
  'voice.provider.stt': 'Speech-to-Text (STT)',
  'voice.provider.tts': 'Text-to-Speech (TTS)',
  'voice.provider.activeEngine': 'Active ASR engine; get model list to inspect',
  'voice.provider.sttReadOnly':
    'Read-only. This streaming API uses the server’s active ASR engine; change it in VoiceStudio, not in Tracy.',
  'voice.provider.voice': 'Voice profile ID or preset',
  'voice.provider.voiceHint': 'A voice controls who speaks; the TTS model controls how speech is generated.',
  'voice.provider.token': 'Optional server token',
  'voice.provider.tokenKept': 'Saved token kept; type to replace',
  'voice.provider.noToken': 'No token saved',
  'voice.provider.removeToken': 'Remove saved token when applying',
  'voice.provider.voicestudioModels':
    'Models must already be available and their terms accepted on the VoiceStudio server. Language support depends on the selected engines.',
  'voice.provider.elevenlabsNote':
    'The ElevenLabs key below is preserved when VoiceStudio is active. STT choices come from the official catalogue because the model-list API does not list transcription models.',
  'voice.provider.currentModel': '{model} (current selection; refresh the list)',

  'voice.models.get': 'Get model list',
  'voice.models.getting': 'Getting model list…',
  'voice.models.uses':
    'Uses this provider’s saved server and credentials. Listing does not test speech, download models, or apply your draft. Test separately before Apply.',
  'voice.models.loading': 'Loading cached model list…',
  'voice.models.refreshFailed':
    'Could not refresh model list ({reason}). The previous list and your choices are kept.',
  'voice.models.refreshFailedUpstream':
    'Could not refresh model list ({reason}, upstream {status}). The previous list and your choices are kept.',
  'voice.models.lastRead': 'Last read: {when}.',
  'voice.models.notFetched': 'No provider list fetched yet.',
  'voice.models.stale': 'Saved credentials or server changed; refresh this list.',
  'voice.models.noEntries':
    'The provider returned no model entries. Any documented catalogue entries are shown separately.',
  'voice.models.details': 'Model list and compatibility',
  'voice.models.aria': 'Speech model list',

  'voice.fallback.switch': 'Fall back to {target} if this provider cannot start',
  'voice.fallback.note':
    'This setting belongs to the {provider} profile. One attempt before audio starts; no switching after a session starts or replaying spoken output. The target profile must be configured. Fallback never runs for a stopped request, Voice off, access denial, Tracy quota or agent errors.',
  'voice.fallback.notConfigured':
    'The fallback target is not configured. Save and test its profile before relying on fallback.',
  'voice.profile.testNote':
    'Test checks listening and generates a short spoken sound. It may warm models and use provider quota. Apply activates this profile; reload the chat page before starting Voice after applying.',
  'voice.profile.test': 'Test profile',
  'voice.profile.apply': 'Apply provider',
  'voice.profile.listening': 'Listening: {result}',
  'voice.profile.speaking': 'Speaking: {result}',
  'voice.profile.accepted': 'Connection accepted; audio quota not checked',
  'voice.profile.works': 'Works',
  'voice.profile.unavailable': 'Unavailable ({reason})',
  'voice.profile.unknown': 'unknown',
  'voice.profile.lastChecks':
    'Last active checks: listening {stt}, speaking {tts}. Checks run every ten minutes while Voice is on.',
  'voice.profile.notChecked': 'not checked',

  'voice.limits.title': 'Limits',
  'voice.limits.text':
    '{session} min of audio per session, which also ends after {silence} s without a word; {account} min a day per account, {total} min a day for this server.',
  'voice.keyRow.title': 'Key',
  'voice.today.title': 'Today',
  'voice.today.audio_one': '{minutes} of {total} min of audio from {count} account ({day}, UTC).',
  'voice.today.audio_other': '{minutes} of {total} min of audio from {count} accounts ({day}, UTC).',
  'voice.speak.title': 'Replies read out loud',
  'voice.speak.text':
    '{provider} {model}; the key needs the Text to Speech permission when using ElevenLabs. At most {maxChars} characters a reading, {accountChars} a day per account, {totalChars} a day for this server.',
  'voice.speak.todayTitle': 'Read out today',
  'voice.speak.today_one': '{chars} of {total} characters for {count} account ({day}, UTC).',
  'voice.speak.today_other': '{chars} of {total} characters for {count} accounts ({day}, UTC).',

  'voice.keyterms.title': 'Keyterms pilot',
  'voice.keyterms.unread': 'The pilot list could not be read.',
  'voice.keyterms.lead':
    'Voice sessions on the sites listed here ask ElevenLabs to listen for the site’s own names: the business name the customer gave in Add site, then titles of products, menu entries and pages edited in the CMS admin, up to {terms} names of at most {chars} characters, read on the server for people with a seat on the site. A session with names costs about 20% more listening. Off everywhere while the list is empty;',
  'voice.keyterms.emptyNow': 'it is empty now.',
  'voice.keyterms.count_one': '{count} site is in it now.',
  'voice.keyterms.count_other': '{count} sites are in it now.',
  'voice.keyterms.aria': 'Pilot site keys',
  'voice.keyterms.placeholder': 'One site key a line, for example shop.example.com',
  'voice.keyterms.saving': 'Saving…',
  'voice.keyterms.save': 'Save pilot list',

  'voice.turns.title': 'Turn times',
  'voice.turns.lead':
    'Each voice turn as the customer’s page timed it, median · 95th percentile, Tracy staff left out. A median needs 20 turns and the 95th percentile 100; until then the count is shown. Turns sent with Send now are counted, not timed.'
} as const
