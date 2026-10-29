/**
 * English baseline for the `tracy-onboard` namespace: the Getting started screen (web and desktop app).
 *
 * Copied from the `T` object of the approved mock
 * (tasks/evidence/desktop-onboard/mock/onboard-connect-now.html): change a sentence there and here
 * together. This package OWNS the namespace and ships `en` only;
 * the other interface languages come from `@tracy/dsh-tracy-locale-vi` and `@tracy/dsh-tracy-locales`.
 * Vendor names are the vendors' own (`{vendor}`), never translated.
 */
export const NS = 'tracy-onboard'

export const en = {
  // Approved tour copy; translations are supplied by the interface locale packages.
  'tour.welcome.title': 'Welcome to Tracy',
  'tour.welcome.body':
    'Tracy edits your website for you. You ask in plain words, check the result, then publish when you are happy.',
  'tour.welcome.ask': 'Ask',
  'tour.welcome.askBody': '"Make the headline shorter"',
  'tour.welcome.review': 'Review',
  'tour.welcome.reviewBody': 'See it on your site first',
  'tour.welcome.publish': 'Publish',
  'tour.welcome.publishBody': 'Live when you say so',
  'tour.later': 'Skip for now',
  'tour.begin': 'Show me around',
  'tour.skip': 'Skip tour',
  'tour.back': 'Back',
  'tour.next': 'Next',
  'tour.done': 'Done',
  'tour.step': '{current} OF {total}',
  'tour.progress': 'Tour progress',
  'tour.saveError': 'Tracy could not save your tour progress. Please try again.',
  'tour.sendError': 'Tracy could not send your request. Please try again.',
  'tour.chip.0': 'Make the homepage headline shorter',
  'tour.chip.1': 'Change the main color to dark blue',
  'tour.chip.2': 'Add our phone number to the top bar',
  'tour.template.heading': 'Pick a design you love',
  'tour.template.body':
    'Browse ready-made designs by industry and style. Each one can be reshaped to fit your brand.',
  'tour.import.heading': 'Already have a website?',
  'tour.import.body': 'Connect your Joomla or WordPress site and Tracy works on that one instead.',
  'tour.createsite.heading': 'Your turn: get a website in minutes',
  'tour.createsite.body':
    'Tracy builds a full, working site from a professional design, and you change anything just by asking. Press Create a new site to begin.',
  'tour.preview.heading': 'This is your website',
  'tour.preview.body':
    'A real, working copy of your site. Every change appears here first, so you see it before anyone else does.',
  'tour.edit.heading': 'Change anything by pointing at it',
  'tour.edit.body': 'Your turn. Press Edit to turn on editing.',
  'tour.pick.heading': 'Pick something to change',
  'tour.pick.body': 'Click any text, image or section on your page.',
  'tour.change.heading': 'Say what you want instead',
  'tour.change.body':
    'Type your change, for example "Make this bigger" or "Change this text to ...", then send it.',
  'tour.designsystem.heading': 'Restyle your whole site',
  'tour.designsystem.body': "Your site's colors, fonts and styles, all in one place.",
  'tour.undo.heading': 'Every change can be undone',
  'tour.undo.body': 'Not happy with a change? Undo puts it back exactly as it was.',
  'tour.changes.heading': 'A full history, with backups',
  'tour.changes.body':
    'See every change and who asked for it, and go back to an earlier version whenever you need.',
  'tour.publish.heading': 'You decide when it goes live',
  'tour.publish.body':
    'Your changes appear in Tracy right away. Visitors to your live site see them only after you press Publish. Until then, try anything.',
  'tour.team.heading': 'Bring your team',
  'tour.team.body': 'Invite colleagues or clients, and choose what each person can do.',
  'tour.composer.heading': 'Ask for your next change',
  'tour.composer.body':
    'Pick one of these or type your own. Tracy makes the change and the preview updates in about 20 seconds.',

  // The first-run "Welcome to Tracy" popup (Welcome.tsx). ALL of its copy is here, in scene order.
  // The scene copy was approved by the owner on 25/10/2026; change it here and nowhere else.
  'welcome.1.title': 'Welcome to Tracy',
  'welcome.1.body':
    'A faster way to run your website on the CMS you already trust. Click any part of a page, ask for the change, done. No need to open the Joomla or WordPress admin.',
  'welcome.2.title': 'Bring the site you have',
  'welcome.2.body':
    'Paste your address and Tracy makes a working copy. Your live site keeps running while you edit, and you send the changes over whenever you are ready. No maintenance mode.',
  'welcome.3.title': 'Start from free templates',
  'welcome.3.body':
    'No site yet? Browse a large library of free templates made for every kind of business. Preview any of them in light, dark or on a phone, then build your site from it.',
  'welcome.4.title': 'Restyle from 1,200+ styles',
  'welcome.4.body':
    'Browse more than 1,200 design systems inspired by products like Figma or ElevenLabs. Choose one and Tracy restyles every page with its colors, fonts and spacing.',
  'welcome.5.title': 'Turn your brief into a site',
  'welcome.5.body':
    'Tell Tracy your business name, what you do, the language, the tone and your logo. Tracy writes every page and makes matching images, so you get a nearly finished site, not a demo to fill in line by line.',
  'welcome.6.title': 'Invite your team, set their access',
  'welcome.6.body':
    'Invite people to the site and give each one a role: Editor to make changes, Viewer to look and follow along. Click any part of a page to leave a note and tag them with @.',
  'welcome.7.title': 'See and undo every change',
  'welcome.7.body':
    'Every change is saved in Site changes with who made it and when. Open one to see what changed, or roll the whole site back to an earlier version.',
  'welcome.8.title': 'Go live your way',
  'welcome.8.body':
    'Put your site live on Tracy in one click and add your own domain. Imported a site? Send the changes back to your current hosting. Or download a ZIP to host it anywhere.',
  /** The last scene's way out, once its replay has ended: opens Add site. */
  'welcome.cta': "Let's build your first site",
  /** Accessible names of the popup's controls. */
  'welcome.close': 'Close welcome',
  'welcome.previous': 'Previous screen',
  'welcome.next': 'Next screen',
  'welcome.position': 'Scene {current} of {total}',
  'welcome.dot': 'Scene {current} of {total}: {title}',
  'welcome.demo': '{title}: animated demonstration of the Tracy app',
  'welcome.frame': 'Animated Tracy app demonstration',

  /** The top row's line on first run. */
  eyebrow: 'Welcome to Tracy Cowork',
  /** The top row's line when the panel was reopened from the app's Help menu (its menu item's name). */
  'eyebrow.reopened': 'Getting started with Tracy Cowork',
  /** The heading of the checklist on the left (shown in capitals), after Orca's "Setup". */
  'rail.title': 'Setup',
  /** The dialog's accessible name. */
  'dialog.label': 'Tracy Cowork onboarding',
  /** The account menu's row that reopens this screen (web and desktop app). */
  'menu.gettingStarted': 'Getting started',
  /** The progress ring's accessible name on that row; the row also shows `{done}/{total}`. */
  'menu.progress': '{done} of {total} setup steps complete',

  /**
   * Settings › Help & about's "Getting started" row (its title is `menu.gettingStarted`): the line
   * under the title while steps remain, a sentence like the section's other status lines.
   */
  'help.progress': '{done} of {total} setup steps complete.',
  /** The same line once every step is done. */
  'help.allDone': 'All set. Open it again any time.',
  /** Appended to the line, after a separator, while the row is hidden from the account menu. */
  'help.hidden': 'Hidden from the account menu',
  /** The row's button: opens the Getting started screen. */
  'help.open': 'Open',

  /** Step 1. This screen draws only after sign-in, so the step shows who is signed in. */
  'signin.title': 'Sign in',
  'signin.subtitle':
    "You're signed in. The AI plans you connect next belong to this account, so they work in the app and on the web.",
  /** The badge on the signed-in card. */
  'signin.badge': 'Signed in',

  'account.title': 'Pick your AI account',
  'account.subtitle':
    'Tracy works with your own AI subscription. Pick the one you use most. You can change it any time.',
  /** Heading over the vendors whose program the desktop app found; finding one never means connected. */
  'account.found': 'Found on this computer',
  /** Heading when nothing was found: the first six vendors. */
  'account.popular': 'Popular',
  /** Heading while the scan of this computer is not complete. */
  'account.looking': 'Looking for AI tools on this computer…',
  'account.refresh': 'Refresh',
  'account.noneFound':
    'No AI tools were found on this computer. Pick the account you want to connect; you can also do it later in Settings › AI accounts.',
  'account.showMore': 'Show {n} more →',
  'account.showLess': 'Show fewer',
  /** `{vendor}` is drawn in bold. Only after a complete scan reported the program missing. */
  'account.notInstalled':
    "{vendor} isn't on this computer yet. Tracy will still set it as your account to connect; install it any time.",
  'account.install': 'Install instructions',
  /** On the card of a vendor the person already connected (the status door's `connections`). */
  'account.connected': 'Connected',
  /**
   * The section over the Tracy AI card, the first of step 2 (shared with Settings › AI accounts,
   * tasks/todo-ai-accounts-unify.md). The card's name, "Tracy AI", is the product's: a constant in
   * code like `PRODUCT` in Onboard.tsx, not a string to translate.
   */
  'account.included': 'Included with your Tracy account',
  /** The panel under the grid when the Tracy AI card is picked; `{account}` is the signed-in email. */
  'account.tracyLine':
    'Part of your Tracy account, signed in as {account}. Your default: new chats use it. Connect your own plan to use it instead.',
  /** The badge on the card at the head of the order (new chats use it) and on Tracy AI once another is. */
  'account.badge.default': 'Default',
  'account.badge.included': 'Included',
  /** The check mark's accessible name on the picked card. */
  'account.picked': 'Selected',
  /** Under the grid when `/ops` turned connecting one's own account off (plan §3.2, not in the mock). */
  'account.connectOff': 'Connecting your own account is turned off on this deployment.',

  /** The connect panel under the grid, for the picked vendor (`{vendor}` is its name). */
  'connect.idle.title': 'Connect {vendor} to finish this step',
  'connect.idle.line': 'Tracy works on your {vendor} plan. Sign in once in your browser.',
  'connect.now': 'Connect now',
  'connect.pending.title': 'Waiting for {vendor}…',
  'connect.pending.line': 'Finish signing in to {vendor} in your browser, then come back here.',
  /** A vendor that signs in by a code the person types on its page (GitHub Copilot). */
  'connect.device.line': 'Enter this code on the {vendor} page in your browser, then come back here.',
  'connect.device.open': 'Open the {vendor} page',
  'connect.copy': 'Copy code',
  'connect.copied': 'Copied',
  'connect.reopen': 'Open sign-in page again',
  'connect.cancel': 'Cancel',
  'connect.noReturn': "Browser didn't come back to the app?",
  'connect.paste': 'Paste the callback URL',
  'connect.submit': 'Submit',
  'connect.connected.title': '{vendor} connected',
  /** `{account}` is the account the vendor reported (an email or a user name). */
  'connect.connected.line': 'Signed in as {account}. New chats use this plan.',
  'connect.connected.plain': 'New chats use this plan.',
  'connect.error.title': 'Could not connect {vendor}',
  'connect.error.line': 'The sign-in expired or was declined.',
  'connect.retry': 'Try again',
  /** A vendor the deployment offers that has no sign-in: its key is pasted in Settings. */
  'connect.key.title': '{vendor} connects with an API key',
  'connect.key.line': 'Paste the key in Settings › AI accounts.',
  'connect.key.open': 'Open AI accounts',

  'appearance.title': 'Appearance & language',
  'appearance.subtitle': 'Pick your language and the look you want to stare at for hours.',
  /** The heading over the three theme cards, under the Language row. */
  'appearance.look': 'Appearance',
  /**
   * Under the Language row while it follows the device and the device's language is not one Tracy
   * offers: `{system}` is that language in its own name, `{fallback}` the language used instead;
   * both drawn in bold.
   */
  'language.unsupported':
    "This computer uses {system}. Tracy doesn't offer it yet, so it uses {fallback}. You can pick another language above.",
  /** The same, when the device's language could not be read. */
  'language.failed':
    "Tracy couldn't read this computer's language, so it uses {fallback}. You can pick another language above.",
  'theme.system': 'System',
  'theme.system.hint': 'Match this computer',
  'theme.dark': 'Dark',
  'theme.dark.hint': 'Easy on the eyes',
  'theme.light': 'Light',
  'theme.light.hint': 'Bright and crisp',
  /** `{place}` is `appearance.place`, drawn in bold. */
  'appearance.more': 'More options in {place}.',
  'appearance.place': 'Settings › Appearance',

  'notify.title': 'Notifications',
  'notify.subtitle': 'Tracy will let you know when the agent is done, if you are in another app.',
  /** The card above the switch (Lee's review of the mock, 10/10/2026). */
  'notify.on': 'Notifications are on',
  'notify.onLine': 'Tracy will alert you when the agent finishes.',
  'notify.off': 'Notifications are off',
  'notify.offLine': 'Turn them on to be told when the agent finishes.',
  'notify.toggle': 'Notify me when the agent finishes',
  'notify.toggleHint': 'Only when Tracy is not the app in front.',
  /** Tracy's switch is on but the app cannot read the system's permission (Windows, Linux, an older app). */
  'notify.unknownLine': "Tracy's switch is on. Tracy can't read this computer's notification permission.",
  /** macOS refuses Tracy's notifications (`permission: 'denied'`). `{switch}` is `notify.allowSwitch`, in bold. */
  'notify.blocked': 'macOS is blocking notifications from Tracy Cowork',
  'notify.blockedLine':
    'Turn on {switch} for Tracy Cowork in System Settings › Notifications, then come back here.',
  /** The name of the macOS switch, as System Settings shows it in this language. */
  'notify.allowSwitch': 'Allow notifications',
  /** Under the disabled sound picker and test button while macOS blocks notifications. */
  'notify.lockedWhy': 'Allow notifications in System Settings to choose a sound and send a test.',
  /** The app handed the test to the system; whether it showed is not known (Focus may hold it). */
  'notify.sent': 'Test notification sent at {time}.',
  'notify.notSent': 'No test notification sent yet.',
  /** After a test, when the permission cannot be read. */
  'notify.check': "Didn't see or hear it? Check Focus and the notification permission of Tracy Cowork.",
  /** The system offers the app no notifications at all (replaces the mock's "turned off" claim). */
  'notify.unsupported': 'This computer does not offer notifications to Tracy Cowork.',
  'notify.openSystemSettings': 'Open System Settings',
  'notify.sendTest': 'Send a test notification',
  /** The sound picker's label; its first choice. The macOS sound names themselves are not translated. */
  'notify.sound': 'Choose a sound',
  'notify.soundLine': 'The sound played with a notification.',
  'notify.soundDefault': 'System Default',

  'action.back': 'Back',
  'action.continue': 'Continue',
  'action.done': 'Done',
  'action.skip': 'Skip',
  /** The header's × (its accessible name); it does what Skip does. */
  'action.close': 'Close',
  /** The header's text button beside × while the account menu shows the row: records the flag; the screen stays. */
  'action.hideFromMenu': 'Hide from account menu',
  /** Its tooltip. */
  'action.hideFromMenuHint':
    'Removes the Getting started row from the account menu. Settings › Help & about still opens this screen.',
  /** The same button once the row is hidden: clears the flag; the screen stays. */
  'action.showInMenu': 'Show in account menu',
  /** Its tooltip. */
  'action.showInMenuHint': 'Puts the Getting started row back in the account menu.',
  /** The chip at the right of each step's title, and the done progress bars' accessible state. */
  'step.done': 'Done',
  'step.notDone': 'Not done'
}
