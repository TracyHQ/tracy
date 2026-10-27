/**
 * The English every Build plugin starts from.
 *
 * Each plugin OWNS its own namespace (`NS` in its `src/client/strings.ts`, which `check-dsh-locale`
 * reads) and composes its `en` from this table plus the stage lines of its own CMS. Vietnamese
 * arrives from `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs.
 *
 * Words follow `docs/references/vocabulary.md`: the customer reads "design template", never
 * "design system"; the stages are said in what they do for the customer, never by their engine
 * names (`check`, `seed`) — those are keys here, not text.
 */
import { HOST_MESSAGES, hostKeys } from '../host-messages.mjs'

export const baseEn = {
  /** Accessible name of the tab's loading bar (a 2px line under the tab strip, no visible words). */
  'loading.label': 'Loading',
  'form.planUnavailable': 'Could not check the selected design. Try again before creating your site.',
  'form.preparing': 'Preparing your {platform} assistant…',
  'preview.title': 'Live site',
  'preview.autoRefresh': 'Update automatically',
  'tab.title': 'Build',

  /**
   * The workspace after the build: the six views' names (the strip's title follows the one picked),
   * their empty states, and the composer. Rows are the site's own; a view with none says so.
   */
  'workspace.view': 'Build view',
  'workspace.brief': 'Build brief',
  'workspace.pages': 'Pages & blocks',
  'workspace.comments': 'Need comment ({count})',
  'workspace.quality': 'Quality',
  'workspace.changes': 'Changes',
  'workspace.admin': 'Admin',
  'workspace.refresh': 'Refresh',
  'workspace.failed': 'Could not load this view.',
  'workspace.prompt': 'What should Tracy change here?',
  'workspace.comment': 'Comment',
  'workspace.sent': 'Sent to Tracy. Awaiting changes.',
  'workspace.sendFailed': 'Could not send: {message}. Your comment is still here.',
  'workspace.shared': 'Shared',
  'workspace.sharedNote': 'A change here shows on every page.',
  'workspace.openInAdmin': 'Open in admin',
  'workspace.noTargets': 'No pages recorded for this build yet.',
  'workspace.noReview':
    'Tracy has not reviewed this site yet. Ask for a read-only inspection to list blocks, open questions and checks.',
  'workspace.inspect': 'Inspect site',
  'workspace.inspectSent': 'Inspection requested. Awaiting Tracy.',
  'workspace.noComments': 'No questions awaiting your comment.',
  'workspace.source': 'Source: {source}',
  'workspace.noChecks': 'No checks recorded yet.',
  'workspace.noEvidence': 'No evidence recorded.',
  'workspace.passed': 'Passed',
  'workspace.checkFailed': 'Failed',
  'workspace.unverified': 'Unverified',
  'workspace.outdated': 'Outdated',
  'workspace.fileHistory': 'File history of the site. Edits made in the CMS database are not listed here.',
  'workspace.historyPending': 'The site is preparing its history. Refresh in a moment.',
  'workspace.files': '{count} files',
  'workspace.by.agent': 'By Tracy',
  'workspace.by.outside': 'From outside Tracy',
  'workspace.kind.moment': 'Change',
  'workspace.kind.outside': 'Outside',
  /** A backup row says which backup, as Site changes does; never the tag's `v3` (03/10/2026). */
  'workspace.kind.backup': 'Backup {n}',
  'workspace.backup.initial': 'Initial backup',
  /** v1's own line, in place of its tag message ("Initial release" on sites set up before 03/10). */
  'workspace.backup.initialTitle': 'Site as built',
  'workspace.backup.beforeRestore': 'Before restore to Backup {m}',
  'workspace.noChanges': 'No recorded changes.',
  'workspace.openAdmin': 'Open {platform} admin',
  'workspace.noSettings': 'No settings Tracy can change on this site yet.',

  /** The brief, read back after the build. */
  'brief.edit': 'Edit brief',
  'brief.cancel': 'Cancel',
  'brief.empty': 'Not provided',
  'brief.updated': 'Brief sent {at}',
  'brief.editNote': 'Sending a changed brief rewrites the words and lays the pages out again on this site.',
  /**
   * The form — what the tab asks before anything runs. FIVE questions in two steps (Lee, 08/09):
   * what the business is, then how it should read.
   *
   * 🔒 ALMOST NO PROSE, and the four lines that went are not coming back — an intro sentence, two
   * hints and a footnote. A label plus a placeholder is the whole of a question; a field that needs
   * a sentence of explanation is a wrong field, not an under-explained one.
   */
  'form.title': 'Build with {platform}',
  'form.sub': 'Design template {name}',
  'form.missing': 'Tracy needs a little more before writing your words.',
  'form.name': 'Business name',
  'form.about': 'One line about your business',
  'form.aboutPlaceholder': 'What you do, for whom, and what makes you the right choice.',
  'form.pages': 'Pages',
  'form.tone': 'Tone',
  'form.language': 'Site language',
  'form.build': 'Create the site with {platform}',
  'form.creating': 'Creating your site…',
  'form.creatingStep': 'Creating your site — {step}…',
  'form.signIn':
    'Tracy needs an account to put the site under. Sign in in the window that opened, and the build carries on here.',
  'form.signInFailed': 'The sign-in window closed before it finished. Press again when you are ready.',
  'form.created': 'Your site is at {url}.',
  'form.continue': 'Send to Tracy',
  'form.noSession': 'Open a chat session first, then press Build.',
  'form.setupFailed':
    'The assistant could not be prepared. Return to the design template and try Create again.',
  /** The one line the name step needs: what pressing Next does. */
  /** The moment between the press and the site's own workspace. */
  'form.claiming': 'Opening your site’s workspace…',
  /** A Build tab the side card brought back from an earlier visit: it asks before making a site. */
  'form.claimStart': 'Create this site',
  'form.claimFailed': 'The site could not be started: {message}',
  /** Under the name box, in the site: the draft address is not the name and does not follow it. */
  'form.draftAddress':
    'Draft address: {address}. The name above is what the site shows; the address changes when you go live.',
  'form.followup': 'Ask me follow-up questions',
  'form.send': 'Send to Tracy',
  'form.missingRequired': 'Please answer the marked questions first.',
  'form.sent': 'Tracy sent these questions.',
  'form.next': 'Next',
  'form.back': 'Back',
  /**
   * Said BEFORE the button, whenever the picked inspiration has no template of its own on this
   * platform yet. It names both designs on purpose: the customer has to recognise their own choice
   * in the sentence, or it reads as a message about somebody else's site.
   */
  'form.designBuildFromBase':
    '{requested} needs a new Joomla template. We will build its design from the configured base; the website is complete only after design review.',
  'form.designFallback':
    '{requested} does not have a supported Joomla template yet. This website will use the {effective} template.',
  'form.planChanged':
    'The list of supported designs changed while you were filling this in. Check what this will build with, then press again.',

  /** The language box: chips for what is chosen, a picker below it. */
  'lang.add': 'Add another…',
  'lang.change': 'Choose another…',
  'lang.detected': 'Looks like your text is in',
  'lang.more': '+{count} more',
  'lang.none': 'No match.',
  'lang.remove': 'Remove {language}',

  /** The tab opened before the agent sent its questions. */
  'waiting.title': 'Tracy is preparing a few questions…',
  'waiting.sub': 'They land here in a moment. Answer them, and the build starts.',
  'waiting.skip': 'Use the standard questions',
  'form.failed': 'The build could not start: {message}',
  /** `new-site.mjs`: the create door is still finishing a claim for this press (`CREATE_PENDING`). */
  'form.stillClaiming':
    'The site is still being claimed. Press again in a moment; the same request is continued, not repeated.',
  /** `new-site.mjs`: the create door answered without naming a site. */
  'form.noSite': 'The fleet answered without a site.',
  /** Neither Tracy's door nor the plugin's own answered with a questionnaire. */
  'form.questionsFailed': 'The questions could not be loaded. Try again in a moment.',
  /**
   * The site was claimed and the fleet could not finish it: the task list above the composer holds
   * the step it died at (the same words are NOT repeated here — a customer reads them once), and
   * the press is offered again. Pressing again continues the SAME build: same answers, same site
   * name, one more attempt on the fleet — never a second site.
   */
  'form.provisionFailed': 'Your site could not be finished. The task list shows where it stopped.',
  'form.retry': 'Try again',

  'page.home': 'Home',
  'page.product': 'Product',
  'page.service': 'Service',
  'page.blog': 'Blog',
  'page.about': 'About us',
  'page.pricing': 'Pricing',
  'page.contact': 'Contact',
  'tone.plain': 'Plain',
  'tone.warm': 'Warm',
  'tone.bold': 'Bold',

  /** Each stage, while it runs and once it is done. */
  'stage.check.run': 'Checking the site',
  'stage.check.done': 'Site checked',
  'stage.style.run': 'Applying the look',
  'stage.style.done': 'Look applied',
  'stage.copy.run': 'Writing your words',
  'stage.copy.done': 'Words written',
  'stage.seed.run': 'Laying out the pages',
  'stage.seed.done': 'Pages laid out',
  'stage.shot.run': 'Taking a picture',
  'stage.shot.done': 'Picture taken',
  'stage.skipped': 'skipped',
  'stage.byAgent': 'the agent is doing this in the chat',
  'stage.waiting': 'waiting',

  /** The Building screen of the tab. */
  'building.count': '{done} of {total}',
  'building.failed': '{stage} failed',
  'building.paused': 'Paused while Tracy updates. Your build continues by itself in a few minutes.',
  'building.note':
    "The page you are looking at is the design template's own layout. Words drop in as Tracy writes them; the live site replaces it when the pages are laid out.",
  'building.retry': 'Retry this step',
  /** A done stage that wrote values the customer did not give (a model's words, a drawn picture). */
  'stage.generated': '{count} values written by Tracy — replace them with yours',
  'building.answer': 'Answer the questions above and Tracy continues.',

  /** The Built screen of the tab. */
  'built.open': 'Open site',
  // The Live site tab cannot frame every platform — see `@tracy/core/preview`. Said out loud
  // rather than shown as an empty panel: a blank frame reads as "the site is broken", and the
  // site is not broken.
  'preview.external': 'This site cannot be shown inside Tracy — open it in a new tab.',

  /** The two chat cards. */
  'card.building': 'Building your site…',
  'card.updating': 'Updating the site…',
  'card.stopped': 'Build stopped',
  'card.waiting': 'Waiting for answers',
  'card.waitingAgent': 'Waiting for the agent',
  'card.answerInTab': 'answer in the Build tab',
  'card.done': 'Site built',
  'card.paused': 'Paused while Tracy updates',
  'card.created': 'Created {site}',
  'card.updated': 'Updated {site}',
  'card.open': 'Open site',
  'card.buildTab': 'Build tab',
  'card.formSent': 'Form sent to the Build tab',
  'card.starting': 'Starting the build…',
  'card.noBuild': 'No build on this site yet.',

  /** What the composer posts once the customer pressed Build — their answers, as their message. */
  'msg.answered':
    'Build "{name}" with {platform} on this site. Business: {business}. About: {about}. Pages: {pages}. Tone: {tone}. Language: {language}.',
  'msg.revised':
    'I changed the brief for "{name}" on this site. Business: {business}. About: {about}. Pages: {pages}. Tone: {tone}. Language: {language}. The pages are being laid out again.',
  /** The name-only form's message: the archive is the site, so nothing else was asked or promised. */
  'msg.answeredName':
    'Build "{name}" with {platform} on this site. Business: {business}. The site starts from the default template; the design template is noted for later, not applied.',
  /** A template press (D37): what was picked is what is built, and the answers go into it. */
  'msg.answeredTemplate':
    'Build "{name}" with {platform} on this site. Business: {business}. The site is the {name} template as shown; the answers go into it, the demo projects, news and careers are rewritten for this business (counts, certifications and named clients are removed, never invented), and pictures are drawn for it. Ask before touching what the build wrote.',
  'msg.followup': 'Ask me follow-up questions here in the chat before building.',
  'msg.none': '(none)',

  /**
   * The host's own sentences — a stopped stage's detail, a refused start — as `host.<code>`, read
   * by `hostText`. The English lives in `host-messages.mjs`, the one table the host fills too.
   */
  ...hostKeys(HOST_MESSAGES)
} as const

/** The base keys, plus the stage lines and host sentences each plugin adds for its own stages. */
export type Key = keyof typeof baseEn | `stage.${string}.run` | `stage.${string}.done` | `host.${string}`
export type Translate = (key: Key, params?: Record<string, string | number>) => string
