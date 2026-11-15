/**
 * English baseline of the site update strings (#612), part of the `tracy-build-chat` namespace (`strings.ts` spreads
 * them into `en`). The sentence that says how an update, a restore or an undo ended comes from the server with a
 * stable code (`sayCode`, `apps/tracy-web/src/build-draft/rebuild-say.js` `SAY_BY_CODE`); the card shows the code's
 * words from `rebuild.say.<code>` here, in the owner's language, and the server's English sentence only for a code
 * this table does not know. Each `rebuild.say.*` value is the server's sentence word for word.
 */
export const rebuildSayEn = {
  'rebuild.say.revision_needs_removal':
    'Your change takes a page, a section or an item off your site, and I cannot remove things from a live site yet. Your site is unchanged. You can put that item back on the plan, and the team can see what you asked for.',
  'rebuild.say.previous_build_doors_missing':
    'I cannot update your site from this chat yet, so your site is unchanged. The team can see what happened.',
  'rebuild.say.previous_build_not_current':
    'Your site changed while this update was getting ready, so I stopped before changing anything. Your site is unchanged. You can update it again, and I will start from what it shows now.',
  'rebuild.say.previous_build_unreadable':
    'I could not read how your site was last built, so I stopped before changing anything. Your site is unchanged. The team can see what happened.',
  'rebuild.say.previous_run_unfinished':
    'An earlier update of your site did not finish, so I cannot start a new one yet. You can undo the unfinished update, which puts your site back as it was before it, and then update again.',
  'rebuild.say.site_already_built':
    'Your site is already built, so I did not build it again from the start. Change the plan and update your site, and only what you changed is rebuilt.',
  'rebuild.say.site_changed_outside':
    'Part of your site was edited outside Tracy since it was built, so I stopped before writing over that edit. Your edit is kept. The team can see which part it was.',
  'rebuild.say.restore_site_changed':
    'Part of your site was edited outside Tracy since the last update, so I did not go back to the previous version. Your edit is kept and your site stays as it is now.',
  'rebuild.say.restore_needs_removal':
    'The last update added something to your site, and I cannot remove things from a live site yet, so I did not go back to the previous version. Your site stays as it is now.',
  'rebuild.say.restore_shows_held_text':
    'The previous version shows something you asked to keep private, so I did not go back to it. Your site stays as it is now.',
  'rebuild.say.write_record_stale':
    'This update was mixed up with an earlier one, so I stopped before changing anything. Your site is unchanged. The team can see what happened.',
  'rebuild.say.update_done':
    'Your site is updated. Only the parts your change touched were rebuilt, and the rest is as it was.',
  'rebuild.say.restore_done': 'Your site is back to the previous version.',
  'rebuild.say.abandon_done': 'The unfinished update is undone. Your site shows what it showed before it.',
  'rebuild.say.nothing_to_update': 'Your site already shows this plan, so there is nothing to update.',
  'rebuild.say.held_file_left_on_site':
    'A photo of a person you asked to keep private is still stored on your site as a file, although no page shows it. I cannot delete files yet. The team can remove it for you.'
} as const

export const rebuildEn = {
  'rebuild.title': 'Your site',
  'rebuild.changed': 'Your plan changed since your site was built. Only what you changed is rebuilt.',
  'rebuild.update': 'Update my site',
  'rebuild.restore': 'Restore the previous version',
  'rebuild.undo': 'Undo the unfinished update',
  'rebuild.failed': 'Your request was not sent. Try again.',
  'rebuild.heldFiles': 'Files still on your site',
  'rebuild.heldFile.person-photo': 'Photo {n}: a person you asked to keep private',
  ...rebuildSayEn
} as const

/** The table key of a sentence code, or null when the table has none (the card then shows the server's words). */
export const rebuildSayKeyOf = (code: string | null | undefined): keyof typeof rebuildSayEn | null => {
  const key = `rebuild.say.${code ?? ''}`
  return Object.hasOwn(rebuildSayEn, key) ? (key as keyof typeof rebuildSayEn) : null
}

/** The table key that says what one held file is, or null for a kind this table does not know. */
export const heldFileKeyOf = (what: string | null | undefined): 'rebuild.heldFile.person-photo' | null =>
  what === 'person-photo' ? 'rebuild.heldFile.person-photo' : null
