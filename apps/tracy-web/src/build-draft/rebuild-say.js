/**
 * What the owner is told when an update of a built site (#612) stops, by the code the revision run, the restore or
 * the abandon stopped with (`docs/references/draft-revision-run.md`, "Typed stops"). Each is a plain statement: what
 * happened and what the owner can do. Never a question, never a code, no dashes; English first, as the build chat's
 * other sentences (`engine-state.js SAY`). What exactly went wrong stays with the team (the run record).
 */

/** By stop code. */
export const REBUILD_SAY = Object.freeze({
  revision_needs_removal:
    'Your change takes a page, a section or an item off your site, and I cannot remove things from a live site yet. Your site is unchanged. You can put that item back on the plan, and the team can see what you asked for.',
  previous_build_doors_missing:
    'I cannot update your site from this chat yet, so your site is unchanged. The team can see what happened.',
  previous_build_not_current:
    'Your site changed while this update was getting ready, so I stopped before changing anything. Your site is unchanged. You can update it again, and I will start from what it shows now.',
  previous_build_unreadable:
    'I could not read how your site was last built, so I stopped before changing anything. Your site is unchanged. The team can see what happened.',
  previous_run_unfinished:
    'An earlier update of your site did not finish, so I cannot start a new one yet. You can undo the unfinished update, which puts your site back as it was before it, and then update again.',
  site_already_built:
    'Your site is already built, so I did not build it again from the start. Change the plan and update your site, and only what you changed is rebuilt.',
  site_changed_outside:
    'Part of your site was edited outside Tracy since it was built, so I stopped before writing over that edit. Your edit is kept. The team can see which part it was.',
  restore_site_changed:
    'Part of your site was edited outside Tracy since the last update, so I did not go back to the previous version. Your edit is kept and your site stays as it is now.',
  restore_needs_removal:
    'The last update added something to your site, and I cannot remove things from a live site yet, so I did not go back to the previous version. Your site stays as it is now.',
  restore_shows_held_text:
    'The previous version shows something you asked to keep private, so I did not go back to it. Your site stays as it is now.',
  write_record_stale:
    'This update was mixed up with an earlier one, so I stopped before changing anything. Your site is unchanged. The team can see what happened.'
})

/** What the owner is told when the server cannot run an update at all (no runner, no site doors). */
export const UNAVAILABLE_SAY = REBUILD_SAY.previous_build_doors_missing

/** Said once an update, a restore or an abandon ended well, or when there is nothing to update. */
export const DONE_SAY = Object.freeze({
  partial:
    'Your site is updated. Only the parts your change touched were rebuilt, and the rest is as it was.',
  restore: 'Your site is back to the previous version.',
  abandon: 'The unfinished update is undone. Your site shows what it showed before it.',
  unchanged: 'Your site already shows this plan, so there is nothing to update.'
})

/** The flag the write step raises when a held person's photo is still a public file of the site. */
export const HELD_FILE_FLAG = 'held_file_left_on_site'
export const HELD_FILE_SAY =
  'A photo of a person you asked to keep private is still stored on your site as a file, although no page shows it. I cannot delete files yet. The team can remove it for you.'

/** The sentence for a stop code, or null when the code is not one of an update (the stopped card says the rest). */
export const rebuildSayOf = (code) =>
  typeof code === 'string' && Object.hasOwn(REBUILD_SAY, code) ? REBUILD_SAY[code] : null

/** The held file flags of a write step value or its record line output, as the owner is told them. */
export function heldFilesOf(flags) {
  const files = (Array.isArray(flags) ? flags : [])
    .filter((f) => f?.code === HELD_FILE_FLAG)
    .flatMap((f) => (Array.isArray(f.places) ? f.places : []))
    .map((p) => p?.file)
    .filter((file) => typeof file === 'string' && file !== '')
  return files.length ? { code: HELD_FILE_FLAG, say: HELD_FILE_SAY, files: [...new Set(files)] } : null
}
