/** The Demos screen, a template's Demo Site row, the Listing editor (Demo Card) and their helpers. */
export const NS = 'cms-demos'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'cms/Demos.tsx',
  'cms/DemoCardEditor.tsx',
  'cms/DemoCardFields.tsx',
  'cms/demo-card-pages.ts',
  'cms/demo-failure-guides.ts',
  'cms/card-press.ts',
  'cms/ReleaseDemo.tsx',
  'cms/ReleaseDemoFailed.tsx',
  'cms/ShotLightbox.tsx'
] as const

export const en = {
  'cms-demos.door.answered': 'the door answered {status}',

  'cms-demos.guide.retry.press': 'Press Retry install twice.',
  'cms-demos.guide.retry.report': 'Still failing? Send the reason to the dev team.',
  'cms-demos.guide.mail.fact': 'Fixed on 11/10/2026, so a retry should pass.',
  'cms-demos.guide.rateLimit.fact':
    'GitHub refused the download for now. Press again after the time in the error.',
  'cms-demos.guide.rateLimit.wait': 'Wait until the time in the error.',
  'cms-demos.guide.rateLimit.press': 'Press the button again.',
  'cms-demos.guide.staleCopy.fact': 'An old broken copy is in the way. Press Remove, then Install demo.',
  'cms-demos.guide.staleCopy.remove': 'Press Remove twice.',
  'cms-demos.guide.staleCopy.install': 'Press Install demo.',

  'cms-demos.step.provision': 'setting up the site',
  'cms-demos.step.teardown': 'taking the old copy down',
  'cms-demos.step.prefetch': 'fetching the new release',
  'cms-demos.step.remove': 'removing the demo',
  'cms-demos.step.install': 'installing',

  'cms-demos.press.unsure.save': 'It may or may not have been saved. Reload to see before pressing again.',
  'cms-demos.press.unsure.publish':
    'It may or may not have been published. Reload to see before pressing again.',
  'cms-demos.press.unsure.unpublish':
    'It may or may not have been unpublished. Reload to see before pressing again.',
  'cms-demos.press.dropped': 'The request did not complete ({error}). {unsure}',
  'cms-demos.press.unconfirmed': 'The door answered {status} without confirming it. {unsure}',

  'cms-demos.pages.noPath': 'Give this page a path, for example /about.',
  'cms-demos.pages.noSlash': 'The path starts with /, for example /about.',
  'cms-demos.pages.taken': 'Another page already uses {path}.',
  'cms-demos.pages.noLabel': 'Give this page a label: it is the name on its tab.',

  'cms-demos.present.dropped': 'did not answer ({error})',
  'cms-demos.present.answered': 'answered {status}',
  'cms-demos.present.noList': 'answered {status} without the list of what it serves',
  'cms-demos.install.answered': 'the install answered {status}',

  'cms-demos.job.unsure': 'It may or may not have started. Reload to see the demo before pressing again.',
  'cms-demos.job.install.dropped': 'The install did not complete ({error}). {unsure}',
  'cms-demos.job.install.noJob': 'The install answered {status} without a job to follow. {unsure}',
  'cms-demos.job.remove.dropped': 'The removal did not complete ({error}). {unsure}',
  'cms-demos.job.remove.noJob': 'The removal answered {status} without a job to follow. {unsure}',
  'cms-demos.job.toldUnsure': '{told}. {unsure}',

  'cms-demos.running.removing': 'Removing…',
  'cms-demos.running.prefetch': 'Fetching the new release, the demo stays up',
  'cms-demos.running.teardown': 'Taking the old copy down',
  'cms-demos.running.install': 'Installing',

  'cms-demos.state.failedAt': 'Failed at {step}',
  'cms-demos.state.failed': 'Failed',
  'cms-demos.state.installedOn': 'Installed on {server}',
  'cms-demos.state.serverSilent': 'Server did not answer',
  'cms-demos.state.noAddressHere': 'No address here',
  'cms-demos.state.served': 'Served',
  'cms-demos.state.recordedOnly': 'Recorded, not on the server',
  'cms-demos.state.notInstalled': 'Not installed',
  'cms-demos.state.localhostOnly': 'Installed · localhost only (no Cloudflare here to publish it)',
  'cms-demos.state.notPublished': 'Installed · not published yet',
  'cms-demos.state.inProgress': 'In progress · {step}',
  'cms-demos.state.deployed': 'Deployed',

  'cms-demos.history.reading': 'Reading the deploy history…',
  'cms-demos.history.failed': 'Could not read the history: {error}',
  'cms-demos.history.empty': 'No deploy has been recorded for this demo yet.',
  'cms-demos.history.label': 'Deploy history of {tag}',
  'cms-demos.history.installLabel': 'Install history of {tag}',
  'cms-demos.history.title': 'Deploy history · {address}',
  'cms-demos.history.description': 'Every provision and teardown recorded for this demo, newest first.',

  'cms-demos.action.moveTo': 'Move to {server}',
  'cms-demos.action.updateTo': 'Update to {version}',
  'cms-demos.action.redeploy': 'Redeploy',
  'cms-demos.action.retryInstall': 'Retry install',
  'cms-demos.action.installDemo': 'Install demo',
  'cms-demos.action.askMove': 'Move {name} to {server}?',
  'cms-demos.action.askUpdate': 'Update {name} to {version}?',
  'cms-demos.action.askRedeploy': 'Redeploy {name}?',
  'cms-demos.action.askInstallOver': 'Install over {name}?',
  'cms-demos.action.releaseVersion': 'release {version}',
  'cms-demos.action.thisRelease': 'this release',
  'cms-demos.action.confirm.record': 'Press again to install {release} at {name} on {server}',
  'cms-demos.action.confirm.recordServed':
    'Press again to install {release} at {name} on {server}, replacing the demo already there',
  'cms-demos.action.confirm.recordFree':
    'Press again to install {release} at {name} on {server}, replacing any demo put there since that server last said the address was free',
  'cms-demos.action.confirm.recordUnknown':
    'Press again to install {release} at {name} on {server}, replacing any demo already there: that server has not said what it serves',
  'cms-demos.action.confirm.tearDown':
    'Press again: the copy of {name} is torn down, then {release} is installed',
  'cms-demos.action.confirm.tearDownFrom':
    'Press again: the copy of {name} on {from} is torn down, then {release} is installed',
  'cms-demos.action.confirm.tearDownOnto':
    'Press again: the copy of {name} is torn down, then {release} is installed on {onto}',
  'cms-demos.action.confirm.tearDownFromOnto':
    'Press again: the copy of {name} on {from} is torn down, then {release} is installed on {onto}',
  'cms-demos.action.confirm.over':
    'Press again to install {release} at {name}, over the demo recorded there, which is not live',
  'cms-demos.action.confirm.overOnto':
    'Press again to install {release} at {name} on {onto}, over the demo recorded there, which is not live',
  'cms-demos.action.serverFor': 'Server for the demo of {tag}',
  'cms-demos.action.serverTitle':
    'This demo is installed on {server}. Picking another server moves it there; its address stays the same.',
  'cms-demos.action.currentServer': '{name} (current)',
  'cms-demos.action.badgeTitle':
    'The Tracy badge on the demo: Tracy’s mark and “Customize with Tracy”, opening this template on the Design templates page',
  'cms-demos.action.badge': 'Badge',
  'cms-demos.action.overrideTitle':
    'Replace the demo already at this address. The old webroot is moved aside on that server, not deleted, and its database is left standing: a wrong replacement is a move back.',
  'cms-demos.action.override': 'Override',
  'cms-demos.action.noAddress': 'This release has no demo address',
  'cms-demos.action.ownersOnly': 'Owners and admins install demos',
  'cms-demos.action.moveTitle':
    'Tear the copy on {from} down and install it on {onto}. The address stays the same.',
  'cms-demos.action.redeployTitle': 'Tear the running copy down and install this release again',
  'cms-demos.action.recordTitle':
    '{server} is JoomlArt’s machine. Tracy records this address, it does not install onto it.',
  'cms-demos.action.installAt': 'Install this release at {address}',
  'cms-demos.action.installAtOn': 'Install this release at {address} on {server}',
  'cms-demos.action.removing': 'Removing…',
  'cms-demos.action.installing': 'Installing…',
  'cms-demos.action.working': 'Working…',
  'cms-demos.action.removeConfirmTitle':
    'Press again to tear the demo down and return this release to Not installed',
  'cms-demos.action.removeTitle':
    'Remove this demo: its containers go, its row goes, and the release reads as Not installed',
  'cms-demos.action.removeConfirm': 'Remove for good?',
  'cms-demos.action.remove': 'Remove',

  'cms-demos.address.taken': '{label} is already the demo of {by}',
  'cms-demos.address.changed': 'Someone else changed this address, so it was reloaded',
  'cms-demos.address.invalid': 'A label is lowercase letters, digits and dashes',
  'cms-demos.address.saveAnswered': 'the save answered {status}',
  'cms-demos.address.labelOf': 'Demo label of {tag}',
  'cms-demos.address.save': 'Save',
  'cms-demos.address.cancel': 'Cancel',
  'cms-demos.address.open': 'Open {address} in a new tab',
  'cms-demos.address.none': 'no address',
  'cms-demos.address.pinnedBy': 'Pinned by {by} {when}',
  'cms-demos.address.pinned': 'pinned',
  'cms-demos.address.change': 'Change the demo address of {tag}',

  'cms-demos.screen.title': 'Demos',
  'cms-demos.screen.intro':
    'The public demo of every quickstart, on <m>{server}</m>. An address is <m>{pattern}</m> unless someone pins another one.',
  'cms-demos.screen.recordNote': 'Tracy records these addresses; it does not install onto that machine.',
  'cms-demos.screen.hostNote': 'Installing again replaces the running copy.',
  'cms-demos.screen.serverSilent': '{server} did not answer: {why}',
  'cms-demos.screen.elsewhere': '{tag} on {server}',
  'cms-demos.screen.col.quickstart': 'Quickstart',
  'cms-demos.screen.col.cms': 'CMS',
  'cms-demos.screen.col.release': 'Release',
  'cms-demos.screen.col.address': 'Demo address',
  'cms-demos.screen.col.deployed': 'Deployed',
  'cms-demos.screen.empty':
    'No installable release for this CMS: a release with no <m>tracy_setting.json</m> has no demo to put up.',

  'cms-demos.release.reading': 'Reading…',
  'cms-demos.release.loadFailed': 'Couldn’t load the demo status. Reload to try again.',
  'cms-demos.release.loadFailedStatus':
    'Couldn’t load the demo status (server error {status}). Reload to try again.',
  'cms-demos.release.retry': 'Retry',
  'cms-demos.release.none': 'No demo on this server',
  'cms-demos.release.noVersion': 'None',
  'cms-demos.release.url': 'URL',
  'cms-demos.release.status': 'Status',
  'cms-demos.release.triedVersion': 'Tried version',
  'cms-demos.release.currentVersion': 'Current version',
  'cms-demos.release.latestVersion': 'Latest version',
  'cms-demos.release.upToDate': 'Up to date',
  'cms-demos.release.updateStopped':
    'The update stopped before anything changed. The demo still serves {version}.',
  'cms-demos.release.updateStoppedCurrent':
    'The update stopped before anything changed. The demo still serves the current version.',

  'cms-demos.failed.pill': 'Failed',
  'cms-demos.failed.status': 'Last install failed',
  'cms-demos.failed.history': 'Show install history',
  'cms-demos.failed.details': 'Error details',
  'cms-demos.failed.copy': 'Copy error details',
  'cms-demos.failed.copied': 'Copied',
  'cms-demos.failed.report': 'Demo install failed: {tag}, while {step}',
  'cms-demos.failed.reportVersion': 'Demo install failed: {tag} {version}, while {step}',

  'cms-demos.lightbox.close': 'Close',
  'cms-demos.lightbox.desktopAlt': 'Desktop picture of {label}',
  'cms-demos.lightbox.mobileAlt': 'Mobile picture of {label}',
  'cms-demos.lightbox.empty': 'No picture to show.',

  'cms-demos.fields.blurbPlaceholder': 'One sentence: what the site is for and what its demo content shows.',
  'cms-demos.fields.hint.provider': 'Shown under the name on the card. Two values today; the gate pins them.',
  'cms-demos.fields.hint.category': 'One of Design templates’ own categories, so the filter finds it.',
  'cms-demos.fields.hint.blurb':
    'One sentence in the preview dialog: what the site is, and whose demo content it carries.',
  'cms-demos.fields.hint.traits':
    'What the Design templates filters say about this template. Set them so the filter does not lie.',
  'cms-demos.fields.category': 'Category',
  'cms-demos.fields.pickCategory': 'Pick a category',
  'cms-demos.fields.provider': 'Provider',
  'cms-demos.fields.blurb': 'Blurb',
  'cms-demos.fields.filters': 'Filters',
  'cms-demos.fields.navigation': 'Navigation',
  'cms-demos.fields.hero': 'Hero',
  'cms-demos.fields.dark': 'Has a dark mode',
  'cms-demos.fields.opensIn': 'Opens in',
  'cms-demos.fields.light': 'Light',
  'cms-demos.fields.darkTheme': 'Dark',

  'cms-demos.card.listing': 'Listing',
  'cms-demos.card.waiting': 'Waiting for the demo site.',
  'cms-demos.card.edit': 'Edit listing',
  'cms-demos.card.preview': 'Preview',
  'cms-demos.card.previewNote': 'How customers see this card on Design templates',
  'cms-demos.card.viewPicture': 'View the card picture large',
  'cms-demos.card.noCategory': 'No category yet',
  'cms-demos.card.inDialog': 'In the preview dialog',
  'cms-demos.card.createWith': 'Create with',
  'cms-demos.card.noPlatform': 'No platform yet',
  'cms-demos.card.pages': 'Pages',
  'cms-demos.card.pageCount_one': '{count} page',
  'cms-demos.card.pageCount_other': '{count} pages',
  'cms-demos.card.pageTabs': 'Page tabs',
  'cms-demos.card.more': '+{count} more',
  'cms-demos.card.noPages': 'No pages yet',
  'cms-demos.card.theme': 'Theme',
  'cms-demos.card.lightDarkOpensDark': 'Light and Dark, opens Dark',
  'cms-demos.card.lightDark': 'Light and Dark',
  'cms-demos.card.lightOnly': 'Light',
  'cms-demos.card.pagesTitle': 'Pages · {count}',
  'cms-demos.card.pagesHint':
    'The pages the preview dialog lists, in this order. Create listing and Regenerate listing take every picture from the demo, at 1440×900 and 390×844, and Regenerate listing lists the demo’s menu again. For one page, open its picture chooser (the pencil, or the empty frame): Take from demo shoots that page alone, Upload a picture uses your own. A page you add is shot as soon as you enter its path. Click a picture to see it large.',
  'cms-demos.card.addLayout': 'Add a layout',
  'cms-demos.card.newPage': 'new page',
  'cms-demos.card.noDemo': 'This template has no demo yet, so there is nothing to take pictures from.',
  'cms-demos.card.desktopPicture': 'Desktop picture for {name}',
  'cms-demos.card.mobilePicture': 'Mobile picture for {name}',
  'cms-demos.card.moveUpOf': 'Move {name} up',
  'cms-demos.card.moveUp': 'Move up',
  'cms-demos.card.moveDownOf': 'Move {name} down',
  'cms-demos.card.moveDown': 'Move down',
  'cms-demos.card.pickShot': 'Pick a shot',
  'cms-demos.card.labelFor': 'Label for {name}',
  'cms-demos.card.labelPlaceholder': 'Page label, for example About us',
  'cms-demos.card.pathFor': 'Path for {name}',
  'cms-demos.card.pathPlaceholder': '/path-on-the-demo',
  'cms-demos.card.answersAt': 'answers at {address}',
  'cms-demos.card.count': 'count',
  'cms-demos.card.countFor': 'Pages {name} stands for',
  'cms-demos.card.notSet': 'not set',
  'cms-demos.card.removeHomeConfirmOf': 'Press again to remove {name}, the home page',
  'cms-demos.card.removeOf': 'Remove {name}',
  'cms-demos.card.removeHomeConfirmTitle':
    'Press again to remove the home page. The card’s picture is taken from it, so it changes too.',
  'cms-demos.card.removeHomeTitle': 'Remove this page. It is the home page: the card’s picture follows it',
  'cms-demos.card.removeTitle': 'Remove this page',
  'cms-demos.card.removeHome': 'Remove home?',
  'cms-demos.card.taking': 'Taking pictures…',
  'cms-demos.card.saveNeeds': 'What Save listing needs',
  'cms-demos.card.done': 'Done: ',
  'cms-demos.card.todo': 'To do: ',
  'cms-demos.card.warnings': 'Warnings'
} as const

export type CmsDemosKey = keyof typeof en
