/**
 * English baseline for the `tracy-build-chat` namespace. This package OWNS the namespace; `NS` lives beside `en` so
 * `check-dsh-locale` can find the owner. Wording follows the build chat mock the product owner approved.
 */
import { ASK_STRINGS, LINK_FOUND_STRINGS, LINK_READ_STRINGS, SAY_STRINGS } from '@tracy/core/build-chat'
import { planReviewEn } from './plan-review-strings'
import { rebuildEn } from './rebuild-strings'

export const NS = 'tracy-build-chat'

export const en = {
  'template.list': 'Designs for your site',
  'template.recommended': 'Recommended',
  'template.later': 'You can change the design later.',
  'template.use': 'Use {name}',
  'template.chosen': 'Chosen: {name}',
  'template.saveFailed': 'Your choice was not saved. Try again.',
  'template.picked': 'I picked {name}.',
  'template.sendFailed':
    'Your choice is saved, but it did not reach the chat. Press Continue to send it again.',
  'template.continue': 'Continue',
  'retry.button': 'Try again',
  'stop.fault': 'This step could not finish, so I stopped here. What I gathered so far is kept.',
  'stop.limit': 'I paused because this step ran many times in a short while. You can try again from {time}.',
  'stop.limit.now': 'I paused because this step ran many times in a short while. You can try again now.',
  'stop.startOver': 'Start over',
  'stop.startOver.confirm':
    'Starting over discards what Tracy has gathered so far and opens a new conversation. A site already built is not affected.',
  'stop.startOver.yes': 'Discard and start over',
  'stop.cancel': 'Cancel',
  'stop.startOver.failed': 'I cannot start over right now. You can continue in this conversation.',
  'template.none': 'No ready design fits your business yet.',
  'template.noneNext': 'You can still create your site from the Add site page.',
  'template.openAddSite': 'Open Add site',
  'progress.title.build': 'Building your site',
  'progress.title.partial': 'Updating your site',
  'progress.done': '{count} completed',
  'progress.running': '{count} in progress',
  'progress.pending': '{count} pending',
  'progress.failed': '{count} failed',
  'progress.state.done': 'Completed',
  'progress.state.running': 'In progress',
  'progress.state.pending': 'Pending',
  'progress.state.failed': 'Failed',
  'progress.note.failed': 'Failed',
  'progress.note.failedTwice': 'Failed twice',
  'progress.note.notStarted': 'Not started',
  'progress.clock': 'Elapsed time',
  'stopped.title': 'Your site is not finished yet',
  'stopped.twice':
    'I could not finish "{step}" after two tries, so I stopped instead of showing you an unfinished site.',
  'stopped.once': 'I could not finish "{step}", so I stopped instead of showing you an unfinished site.',
  'stopped.kept.none': 'Kept: your plan and your answers.',
  'stopped.kept.one': 'Kept: your plan, your answers and the written page.',
  'stopped.kept.other': 'Kept: your plan, your answers and the {count} written pages.',
  'stopped.unchanged': 'Your current site is unchanged.',
  'stopped.notified': 'The Tracy team has been told and will follow up. You do not need to do anything.',
  'stopped.notStarted':
    'Your site could not be started, but your plan is kept and you can approve it again later.',
  'stopped.notStarted.design':
    'This design cannot be built yet, so your site was not started, but your plan is kept and you can approve it again later.',
  'cancelled.title': 'The build was cancelled',
  'cancelled.body': 'You cancelled this build. Your plan and your answers are kept.',
  'plan.title': '{name} site plan',
  'plan.design': 'Design: {name}',
  'plan.facts': 'Business facts',
  'plan.language': 'Site language',
  'plan.allSources': 'All sources',
  'plan.look': 'Appearance',
  'plan.look.template': 'Design',
  'plan.look.accent': 'Main colour',
  'plan.look.accentLight': 'Main colour on light pages',
  'plan.look.accentDark': 'Main colour on dark pages',
  'plan.look.logoLight': 'Logo on light pages',
  'plan.look.logoDark': 'Logo on dark pages',
  'plan.look.logoOwn': 'Your logo, from {source}',
  'plan.look.logoDrawn': 'A logo Tracy drew, based on your logo',
  'plan.look.logoText': 'Your business name as text',
  'plan.services': 'Services ({count})',
  'plan.service': 'Service {n}',
  'plan.pages': 'Pages ({count})',
  'plan.sections.one': '{count} section',
  'plan.sections.other': '{count} sections',
  'plan.fromServices': 'From Services',
  // A section kept from general knowledge of the owner's trade (plan block `basis: "trade"`, #575).
  'plan.trade':
    'Written from general knowledge of your trade. Remove it with Change the plan if it does not fit.',
  'plan.count.service.one': '{count} service',
  'plan.count.service.other': '{count} services',
  'plan.count.person.one': '{count} person',
  'plan.count.person.other': '{count} people',
  'plan.count.quote.one': '{count} review',
  'plan.count.quote.other': '{count} reviews',
  'plan.count.gallery.one': '{count} photo',
  'plan.count.gallery.other': '{count} photos',
  'plan.count.item.one': '{count} item',
  'plan.count.item.other': '{count} items',
  'plan.pictures': 'Pictures',
  'plan.pictures.own': 'Your photos',
  'plan.pictures.ownValue.one': '{count} photo from {from}',
  'plan.pictures.ownValue.other': '{count} photos from {from}',
  // The photos the plan places beside all the photos of the owner it holds, when it holds more.
  'plan.pictures.ownOfValue.one': '{count} of your {total} photos, from {from}',
  'plan.pictures.ownOfValue.other': '{count} of your {total} photos, from {from}',
  'plan.pictures.drawn': 'Pictures Tracy creates',
  'plan.pictures.drawnValue.one': 'About {count} picture',
  'plan.pictures.drawnValue.other': 'About {count} pictures',
  'plan.pictures.drawnNone': 'None',
  'plan.assumptions': 'What I assumed',
  'plan.leftOut': 'Left out',
  'plan.leftOut.showAll': 'Show all ({count})',
  'plan.leftOut.showFewer': 'Show fewer',
  'plan.revised.changed': 'What changed',
  'plan.revised.notDone': 'Not done',
  'plan.revised.dismiss': 'Hide this note',
  'plan.revised.edited': '{label} is now {value}.',
  // A change request's lines, by the stable code the plan step gives each (#609 over #617). Each English text is the
  // server's own sentence with its names as parameters: a line that reads otherwise keeps the server's text.
  'plan.revised.line.owner_value_saved': 'Your answer is saved: {label}, {value}.',
  'plan.revised.line.item_renamed': '{from} is now called {to}.',
  'plan.revised.line.item_taken_off': '{label} stays off your site, as you asked.',
  'plan.revised.line.page-removed': 'The {name} page is removed.',
  'plan.revised.line.page-added': 'A {name} page is added.',
  'plan.revised.line.page-renamed': 'The {from} page is now called {to}.',
  'plan.revised.line.page-order': 'The pages are now in this order: {names}.',
  'plan.revised.line.block-removed': 'The {section} section is removed from the {page} page.',
  'plan.revised.line.block-added': 'A {section} section is added to the {page} page.',
  'plan.revised.line.block-data.count': 'The {section} section of the {page} page now shows {count} items.',
  'plan.revised.line.block-data': 'The {section} section of the {page} page now shows {names}.',
  'plan.revised.line.block-order': 'The sections of the {page} page are in a new order.',
  'plan.revised.line.data-off': 'No longer shown: {names}.',
  'plan.revised.line.data-on': 'Now shown: {names}.',
  'plan.revised.line.data-again': 'Now shown again: {names}, which you had taken off earlier.',
  'plan.revised.line.pictures-own.one': 'The plan now uses {count} photo of yours.',
  'plan.revised.line.pictures-own.other': 'The plan now uses {count} photos of yours.',
  'plan.revised.line.pictures-drawn.none': 'Tracy will not create any pictures now.',
  'plan.revised.line.pictures-drawn.one':
    'About {count} picture will be created where you have no suitable photo.',
  'plan.revised.line.pictures-drawn.other':
    'About {count} pictures will be created where you have no suitable photo.',
  'plan.revised.notDone.nothing_to_change.what': 'Your request',
  'plan.revised.notDone.nothing_to_change.why':
    'Nothing on the plan could follow it, so the plan is unchanged.',
  'plan.revised.notDone.page_already_on_plan.why': 'The plan already has this page.',
  'plan.revised.notDone.section_not_filled.what': 'A new section',
  'plan.revised.notDone.section_not_filled.why':
    'There is nothing of your business to fill it, so it is not added.',
  'plan.revised.notDone.item_rename_refused.what': 'Rename {name}',
  'plan.revised.notDone.owner_value_not_shown.what': 'Show your {label} on the site',
  'plan.revised.notDone.owner_value_not_shown.why':
    'Your answer is saved, but your design has no place that shows it.',
  // A repeated data name in a change line, said once with its count: "12 photos" (the plan step's plural).
  'plan.revised.names.counted': '{count} {plural}',
  // The lead in of a not done line the model wrote, by its refusal kind; shown only in another interface language.
  'plan.revised.notDone.reason.no_recipe': 'Your design has no page of this kind.',
  'plan.revised.notDone.reason.no_data': 'Nothing of your business fills this section.',
  'plan.revised.notDone.reason.fact_missing': 'Your business does not have this information.',
  'plan.revised.notDone.reason.kept_private': 'You keep this off your site.',
  'plan.revised.notDone.reason.outside_plan':
    'A change request cannot change this. Change it on the plan card.',
  // Left out reasons by their code: each the plan step's sentence word for word.
  'plan.leftOut.reason.no_email_for_form':
    'Your business has no email address for its sign up form to send answers to.',
  'plan.leftOut.reason.no_booking_link': 'You have no booking or contact link for its button to open.',
  'plan.leftOut.reason.no_items_to_show': 'You have nothing yet for this section to show.',
  'plan.leftOut.reason.shown_in_other_sections':
    'What this section would show is already shown in other sections of your plan.',
  'plan.leftOut.reason.owner_withheld': 'You asked to keep this off the site.',
  'plan.leftOut.reason.left_out_neutral.page': 'This page is not part of your plan.',
  'plan.leftOut.reason.left_out_neutral.block': 'This section is not part of your plan.',
  'plan.leftOut.reason.left_out_neutral.item': 'This is not shown on your plan.',
  'plan.leftOut.reason.no_gallery_room.one':
    'No gallery has room for this photo. It stays with your photos and may be used elsewhere on the site.',
  'plan.leftOut.reason.no_gallery_room.other':
    'No gallery has room for these {count} photos. They stay with your photos and may be used elsewhere on the site.',
  'plan.leftOut.reason.no_place_in_design': 'Your design has no place that shows this.',
  'plan.leftOut.reason.no_place_for_whatsapp':
    'This design has no place for a WhatsApp link, so your site does not show it.',
  'plan.leftOut.reason.no_place_for_other_phones':
    'This design shows one phone number, so your site shows your main one.',
  'plan.leftOut.reason.no_place_for_google_rating':
    'This design has no place for your Google rating, so your site does not show it.',
  'plan.leftOut.reason.hours_unconfirmed':
    'Only one source gives your opening hours, as open 24 hours every day, so they stay off your site until you confirm them.',
  'plan.leftOut.reason.hours_sources_disagree':
    'Your sources give different opening hours, so they stay off your site until you confirm them.',
  // What the content brief holds back (`plan-held-back.mjs`), by code.
  'plan.leftOut.reason.not_collected':
    'None of the sources we read gives this, so your site does not show it yet.',
  'plan.leftOut.reason.sources_disagree':
    'Your sources disagree on this, so it stays off your site until you confirm it.',
  'plan.leftOut.reason.kept_off_site': 'This stays off your site until you confirm it.',
  'plan.leftOut.reason.no_fitting_video':
    'None of your videos fit this space (wide pictures without text on top), so it shows no video.',
  'plan.leftOut.reason.page_nothing_to_show': 'You have nothing yet for these pages to show.',
  'plan.leftOut.reason.page_not_planned': 'Your plan does not need these pages.',
  // Every other code a left out line can carry (`plan-left-out-codes.mjs`, #575 stand: these read in English).
  'plan.leftOut.reason.whatsapp_unconfirmed':
    'No source says this number takes WhatsApp messages, so your site does not link to WhatsApp.',
  'plan.leftOut.reason.contact_value_missing':
    'You chose how visitors reach you but gave no value yet, so none is shown. Add it on the plan.',
  'plan.leftOut.reason.fact_longer_than_every_place':
    'This is longer than every place your design has for it, and Tracy never shortens it.',
  'plan.leftOut.reason.no_room_left': 'Every place your design has for this is taken already.',
  'plan.leftOut.reason.no_room_left.item': 'There is no room left for more of these.',
  'plan.leftOut.reason.fewer_than_section_needs':
    'Every section for these needs at least {min}. Tracy never invents more to fill a section.',
  'plan.leftOut.reason.section_below_minimum':
    'It was in a section that needs at least {min} of these, and too few were left for it, so it is not shown.',
  'plan.leftOut.reason.gallery_photo_shown_elsewhere.one':
    'This photo already shows in a gallery on another page, and each photo shows once on your site, so this gallery shows one fewer.',
  'plan.leftOut.reason.gallery_photo_shown_elsewhere.other':
    'These {count} photos already show in a gallery on another page, and each photo shows once on your site, so this gallery shows {count} fewer.',
  'plan.leftOut.reason.data_over_limit':
    'This is longer than the section can show, so it is not shown there.',
  'plan.leftOut.reason.value_over_limit': 'This is longer than the section can show, so it is not shown.',
  'plan.leftOut.reason.row_beyond_stored_places':
    'The section that shows these has room for fewer rows than you have.',
  'plan.leftOut.reason.row_over_max': 'The section that shows these has room for fewer rows than you have.',
  'plan.leftOut.reason.row_field_undeclared': 'The section shows only part of this row.',
  'plan.leftOut.reason.row_parts_over_fields':
    'This row has more parts than the section has places for, so it is not shown.',
  'plan.leftOut.reason.row_value_over_limit':
    'This row is longer than the section can show, so it is not shown.',
  'plan.leftOut.reason.row_parts_order': 'The times of this row come before its days, so it is not shown.',
  'plan.leftOut.reason.row_no_list': 'No section of the template shows rows like this one.',
  'plan.leftOut.reason.social_link_shortened':
    'This is a shortened link, so the network it leads to is unknown.',
  'plan.leftOut.reason.social_network_unknown': 'This link is not on a social network the section can show.',
  'plan.leftOut.reason.social_handle_without_network': 'This handle does not say which network it is on.',
  'plan.leftOut.reason.social_link_not_web': 'This is not a web link.',
  'plan.leftOut.reason.no_social_link': 'There is no link to show.',
  'plan.leftOut.reason.social_network_repeated': 'Another link to the same network is already shown.',
  'plan.leftOut.reason.social_link_over_rows':
    'The section that shows these has room for fewer rows than you have.',
  'plan.leftOut.reason.page_removed': 'You asked to remove this page.',
  'plan.leftOut.reason.no_longer_in_plan': 'It is not part of your plan.',
  'plan.leftOut.reason.requested_off': 'You asked to take this off the plan.',
  'plan.leftOut.reason.removed_page_data': 'It was only on a page you asked to remove.',
  // A review the Tracy reviews section does not show (`library_section_refused`), by why (`params.why`); the reasons
  // of one line are said after one lead in, joined by a semicolon.
  'plan.leftOut.reason.library_section_refused': 'Not shown in the Tracy section: {why}.',
  'plan.leftOut.why.not_google_review': 'it is not a Google review',
  'plan.leftOut.why.no_text': 'it has no text',
  'plan.leftOut.why.no_star_rating': 'it has no star rating',
  'plan.leftOut.why.stars_below_four': 'only reviews of four or five stars are shown',
  'plan.leftOut.why.stars_not_whole': 'its star rating is not a whole number',
  'plan.leftOut.why.reviewer_anonymous': 'its reviewer is anonymous on Google',
  'plan.leftOut.why.no_reviewer_name': 'it has no reviewer name',
  'plan.leftOut.why.reviewer_name_too_long':
    'its reviewer name is longer than the section holds, and a name is never cut',
  'plan.leftOut.why.review_too_long': 'it is longer than the section holds, and a review is never cut',
  // What a left out line names, by its code, when it reports no fact or item of the plan.
  'plan.leftOut.what.no_place_for_whatsapp': 'WhatsApp',
  'plan.leftOut.what.no_place_for_other_phones': 'Other phone numbers',
  'plan.leftOut.what.no_place_for_google_rating': 'Google rating',
  'plan.leftOut.what.hours_unconfirmed': 'Opening hours',
  'plan.leftOut.what.hours_sources_disagree': 'Opening hours',
  'plan.leftOut.what.no_fitting_video.one': '{count} video spot',
  'plan.leftOut.what.no_fitting_video.other': '{count} video spots',
  // The template's pages left out for one reason; the page names are site content, never translated.
  'plan.leftOut.what.pages.one': '{page} page',
  'plan.leftOut.what.pages.two': '{first} and {last} pages',
  'plan.leftOut.what.pages.three': '{first}, {second} and {last} pages',
  'plan.leftOut.what.pages.more': '{first}, {second}, {third} and {count} more pages',
  // The pictures estimate, by its code.
  'plan.pictures.estimate.one':
    'About {count} picture will be created where you have no suitable photo. The final number depends on your photos.',
  'plan.pictures.estimate.other':
    'About {count} pictures will be created where you have no suitable photo. The final number depends on your photos.',
  // Where an own logo was found, by its source kind.
  'plan.logoSource.website': 'Website',
  'plan.logoSource.google': 'Google Maps listing',
  'plan.logoSource.instagram': 'Instagram profile',
  'plan.logoSource.facebook': 'Facebook page',
  'plan.logoSource.tiktok': 'TikTok profile',
  // The logo assumptions, by their code and parameters.
  'plan.assumption.logo_drawn.new-symbol-drawn':
    "Tracy drew a logo based on your logo: a new symbol of your trade beside your business name, set in the template's font. It is not your logo file. Approve it, or send us your logo to replace it.",
  'plan.assumption.logo_drawn.symbol-cut-from-logo':
    "Tracy drew a logo based on your logo: the symbol cut from your logo beside your business name, set in the template's font. It is not your logo file. Approve it, or send us your logo to replace it.",
  'plan.assumption.logo_drawn.name-set-in-template-font':
    "Tracy drew a logo based on your logo: a mark beside your business name, set in the template's font. It is not your logo file. Approve it, or send us your logo to replace it.",
  'plan.assumption.logo_made.found.icon':
    'Your logo could not be used as it is, so I made a temporary one: a simple icon of your trade beside your business name. Send your logo file here in the chat to replace it.',
  'plan.assumption.logo_made.found.lettermark':
    'Your logo could not be used as it is, so I made a temporary one: your initials beside your business name. Send your logo file here in the chat to replace it.',
  'plan.assumption.logo_made.found.mark':
    'Your logo could not be used as it is, so I made a temporary one: a simple mark beside your business name. Send your logo file here in the chat to replace it.',
  'plan.assumption.logo_made.none.icon':
    "No logo was found, so I made a temporary one: a simple icon of your trade beside your business name, in the design's main colour. Send your logo here in the chat to replace it.",
  'plan.assumption.logo_made.none.lettermark':
    "No logo was found, so I made a temporary one: your initials beside your business name, in the design's main colour. Send your logo here in the chat to replace it.",
  'plan.assumption.logo_made.none.mark':
    "No logo was found, so I made a temporary one: a simple mark beside your business name, in the design's main colour. Send your logo here in the chat to replace it.",
  // The main colour assumption, by its code and parameters; an English card keeps the plan's own sentence.
  'plan.assumption.accent_logo_moved.lighter':
    'The colour of your logo was made lighter so buttons and links stand out on the design.',
  'plan.assumption.accent_logo_moved.darker':
    'The colour of your logo was made darker so buttons and links stand out on the design.',
  'plan.assumption.accent_logo_kept': 'Buttons and links use the colour of your logo.',
  'plan.assumption.accent_no_hue.black': 'Your logo has no colour, so buttons and links are black.',
  'plan.assumption.accent_no_hue.white': 'Your logo has no colour, so buttons and links are white.',
  'plan.assumption.accent_no_hue.both':
    'Your logo has no colour, so buttons and links are black on light pages and white on dark pages.',
  'plan.assumption.accent_unreadable.black':
    'The colour of your logo is hard to read on buttons, so buttons and links are black.',
  'plan.assumption.accent_unreadable.white':
    'The colour of your logo is hard to read on buttons, so buttons and links are white.',
  'plan.assumption.accent_unreadable.both':
    'The colour of your logo is hard to read on buttons, so buttons and links are black on light pages and white on dark pages.',
  'plan.assumption.accent_kept_unmeasured':
    "The colours of your logo could not be read, so buttons and links keep the design's main colour.",
  'plan.assumption.accent_kept_template':
    "The colours of your logo would not read on this design, so buttons and links keep the design's main colour.",
  // Opening hours, from their parameters: "Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00".
  'plan.hours.days': '{from} to {to}',
  'plan.hours.time': '{from} to {to}',
  'plan.hours.closed': 'closed',
  'plan.hours.ranges': '{first} and {next}',
  'plan.hours.group': '{days}, {hours}',
  'plan.hours.groups': '{first}; {next}',
  // Section names by their code (`blocks[].labelCode`, the `section` of a change line).
  'plan.section.header': 'Menu',
  'plan.section.footer': 'Footer',
  'plan.section.hero': 'Hero',
  'plan.section.page_header': 'Page header',
  'plan.section.about': 'About',
  'plan.section.text': 'Text',
  'plan.section.call_to_action': 'Call to action',
  'plan.section.contact': 'Contact details',
  'plan.section.map': 'Map',
  'plan.section.video': 'Video',
  'plan.section.newsletter': 'Newsletter',
  'plan.section.services': 'Services',
  'plan.section.menu': 'Menu',
  'plan.section.pricing': 'Prices',
  'plan.section.schedule': 'Schedule',
  'plan.section.team': 'Team',
  'plan.section.stats': 'Figures',
  'plan.section.steps': 'Steps',
  'plan.section.reviews': 'Reviews',
  'plan.section.claims': 'Awards',
  'plan.section.faq': 'Questions',
  'plan.section.events': 'Events',
  'plan.section.posts': 'Articles',
  'plan.section.gallery': 'Photos',
  'plan.undo.chatChange':
    'Undo takes back changes made on this card. To take back a change you asked for in the chat, ask in the chat.',
  'plan.fact.business.name': 'Business name',
  'plan.fact.business.founded_year': 'Founded',
  'plan.fact.business.tagline': 'Tagline',
  'plan.fact.business.summary': 'About',
  'plan.fact.contact.phone': 'Phone',
  'plan.fact.contact.email': 'Email',
  'plan.fact.contact.address': 'Address',
  'plan.fact.contact.hours': 'Opening hours',
  'plan.fact.contact.cta_url': 'Booking link',
  'plan.fact.contact.cta_label': 'Main button',
  'plan.fact.contact.social_url': 'Social link',
  'plan.source.website': 'Website',
  'plan.source.google': 'Google Maps listing',
  'plan.source.social': 'Social profile',
  'plan.source.listing': 'Directory listing',
  'plan.source.answer': 'Your answer',
  'plan.and': '{first} and {last}',
  'plan.saveFailed': 'Your change was not saved. Try again.',
  'plan.locked': 'Your site is being built from this plan, so the plan cannot change until the build ends.',
  'plan.stale':
    'The plan changed meanwhile, so your change was not saved. The card now shows the latest plan.',
  'plan.busy':
    'I am still working on your plan, so it cannot change right now. Make your change again when I am done.',
  'plan.tooLarge': 'This change is too long to save. Make it shorter and try again.',
  'plan.edit': 'Edit {label}: {value}',
  'plan.newValue': 'New value for {label}',
  'plan.save': 'Save',
  'plan.cancel': 'Cancel',
  'plan.changed': 'Changed',
  'plan.undo': 'Undo',
  'plan.undoLabel': 'Undo last change',
  'tool.research.one': 'Read {count} source',
  'tool.research.other': 'Read {count} sources',
  'tool.research.none': 'Read about your business',
  'tool.working': 'Working on your site plan',
  'tool.working.research': 'Reading your links',
  'tool.working.about': 'Reading about your business',
  'tool.working.templates': 'Finding designs for your site',
  'tool.working.build': 'Building your site',
  'tool.working.startOver': 'Starting over',
  'tool.waiting.place': 'Waiting for you to choose your place',
  'tool.templates': 'Found designs for your site',
  'tool.plan': 'Prepared your site plan',
  'tool.edit': 'Updated your site plan',
  'tool.stopped': 'This step could not finish',
  'review.failed': 'Your answer was not sent. Try again.',
  'review.question': 'Approve this plan?',
  'review.approve': 'Approve',
  'review.change': 'Change the plan',
  'review.say': 'Or describe the change you want',
  'review.summary': '{name}: {pages}, {services}',
  'review.summary.one': '{name}: {part}',
  'review.pages.one': '{count} page',
  'review.pages.other': '{count} pages',
  'handoff.earlier': 'Earlier conversation',
  'handoff.tooLong':
    'Your site is ready, but this conversation is too long to move to the site chat. Open your site from your list of sites.',
  ...rebuildEn,
  ...planReviewEn,
  // The question card's words (#609): the host says a question in the interface language by these keys
  // (`src/host/ask-words.mjs`); English is the engine's own wording, kept with the code in `@tracy/core/build-chat`.
  ...ASK_STRINGS,
  // What became of each link the owner gave the research (#609): English kept with the code in `@tracy/core/build-chat`.
  ...LINK_READ_STRINGS,
  ...LINK_FOUND_STRINGS,
  // The sentences the tool says in the language of the chat (#609): English kept with the code in `@tracy/core/build-chat`.
  ...SAY_STRINGS
} as const

export type StringKey = keyof typeof en
export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string

/** A translator that says which language it speaks (`translatorIn`), so a word equal to the English one is still known. */
export function inLanguage(t: Translate, language: string): Translate {
  return Object.assign(t, { language })
}
/** The language a translator speaks, or null when it does not say (dsh's bound one). */
export function languageOf(t: Translate): string | null {
  const language = (t as { language?: unknown }).language
  return typeof language === 'string' ? language : null
}

/** Translate with the English source; the plugin passes its bound locale instead. */
export const english: Translate = inLanguage(
  (key, vars = {}) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? '')),
  'en'
)
