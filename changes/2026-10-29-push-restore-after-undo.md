- **After an Undo, a post the copy still holds is offered as an addition that brings it back.** — David · issue #117 · `fix/push-restore-after-undo` · 2026-10-29
  **Affects:** Sync to live Preview after an Undo, on WordPress and Joomla. A live record in the trash whose copy is not trashed is shown under "Will add" instead of as a change of status and a `__trashed` slug. It is still written to the same live record, out of the trash, so no second record is made beside the trashed one.

  Verification: a new changeset case failed before the fix and passes after it (and a record trashed on both sides is still no change). Changeset suite 37/37 with zero skipped; push SQL, push flow and live-write suites unchanged. The fleet needs the next shared-script image release.
