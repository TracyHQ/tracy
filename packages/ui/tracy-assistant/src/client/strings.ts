/**
 * English baseline for the `tracy-assistant` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Other interface languages
 * arrive from `@tracy/dsh-tracy-locale-vi` and `@tracy/dsh-tracy-locales`. `NS` lives beside `en`
 * so `check-dsh-locale` can find the owner.
 */
export const NS = 'tracy-assistant'

export const en = {
  'onboarding.placeholder': 'Not sure where to start? Just ask',
  'onboarding.send': 'Send',
  'onboarding.action.create': 'Create a new site',
  'onboarding.action.templates': 'Start from a template',
  'onboarding.action.import': 'Import your site',
  /** The same doors in a narrow column, where the full names do not fit on one line. */
  'onboarding.action.create.short': 'New site',
  'onboarding.action.templates.short': 'Template',
  'onboarding.action.import.short': 'Import',
  /** The chat box's paperclip on the creation screen: read aloud and shown on hover. */
  'onboarding.attach': 'Attach files',
  /** Over the page while files are dragged onto it. */
  'onboarding.drop': 'Drop files to attach them',
  /** A file chip while its upload runs (screen readers); `{name}` is the file name. */
  'file.uploading': 'Uploading {name}',
  /** The × of a file chip. */
  'file.remove': 'Remove {name}',
  /** A sent file, pressed to open or download it. */
  'file.open': 'Open {name}',
  /** Refusals, each naming the file. */
  'file.type': '{name} cannot be attached. Attach a picture, PDF, Word, Excel, text or CSV file.',
  'file.tooLarge': '{name} is larger than 20 MB.',
  'file.failed': '{name} could not be uploaded.',
  'file.tooMany': 'A message can carry up to 10 files.',
  'file.limit': 'You have attached many files. Try again in an hour.',
  'file.storeOff': 'Files cannot be kept right now.',
  /** The row in the `/` menu of the agent's chat: the command's title. */
  'command.label': 'Help',
  /** The row in the `/` menu: what typing /help does. */
  'command.description': 'Ask about Tracy and your sites',
  /** Faint text after the marked /help token in the chat box, until the person types their question. */
  'command.hint': 'Type your question',
  /** The reply to a bare /help once the chat has begun: one sentence asking what they need. */
  'askBack.text': 'What would you like help with? Ask about Tracy or your sites.',
  /** Names a row for screen readers only; nothing on screen says it is not the agent. */
  'node.label': 'Tracy assistant',
  /** Shown while the first words of an answer are on their way. */
  'status.thinking': 'Thinking…',
  /** A question waiting for the one before it to finish. */
  'status.queued': 'Waiting',
  /** The chat box's round button while a Help answer is being written; read aloud and shown on hover. */
  'action.stopAnswer': 'Stop the answer',
  'action.retry': 'Retry',
  /** Drops a question that is still waiting. */
  'action.remove': 'Remove',
  /** Closes a row that only informs (the tip, a refusal). */
  'action.dismiss': 'Dismiss',
  /** The row after a bare /help is only these suggested questions; pressing one asks it as if /help <question> was typed. */
  'chip.what': 'What can Tracy do?',
  'chip.undo': 'How do I undo a change?',
  'chip.sites': 'Which sites can I open?',
  'chip.report': 'I want to report a problem',
  /** Under a bare /help, and in an error: where a person of the team can be reached. */
  'discord.label': 'Ask the Tracy team on Discord',
  /** In front of the chat box's own hint, in the same style as it ("/ commands, @ files"): the command, then what it is for. */
  'placeholder.prefix': '/help to ask Tracy · ',
  /** The whole hint of both chat boxes (dsh's own words hidden there): a change first, then /help. */
  'placeholder.hero': 'Describe a change. /help for Tracy, / commands, @ files or sessions',
  /** Shown once per account under the chat box. */
  'tip.text': 'Tip: type /help to ask about Tracy or your sites.',
  /** Copies a block (a sample request, a problem report) to the clipboard. */
  'action.copy': 'Copy',
  'action.copied': 'Copied',
  /** The heading of the report to paste on Discord, and its field names. */
  'report.title': 'Problem report',
  'report.site': 'Site',
  'report.time': 'Time',
  'report.session': 'Agent session',
  'report.browser': 'Browser',
  'report.describe': 'What went wrong',
  /** A field Help does not know. */
  'report.none': 'none',
  /** Above the copy block of a report. */
  'report.intro': 'To report a problem, copy this and paste it on Discord:',
  'error.limit': 'You have asked a lot of questions. Try again in a minute.',
  'error.limitDay': 'You have reached the limit of Help questions for today. Try again tomorrow.',
  'error.unavailable': 'Help is not available right now.',
  'error.signin': 'Your session has ended. Sign in again to use Help.',
  'error.tooLong': 'That question is too long. Try a shorter one.',
  /** The stream broke after some of the answer arrived. */
  'error.cut': 'The answer was cut off.',
  /** The fourth /help while three are already waiting. */
  'error.queueFull': 'Three questions are already waiting. Try again when one is answered.'
} as const

export type AssistantKey = keyof typeof en

export type Translate = (key: AssistantKey, params?: Record<string, string | number>) => string
