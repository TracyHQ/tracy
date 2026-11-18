# Controlled hero readability attempt

**Verdict: NOT_ACCEPTED.** This was one controlled repair on an existing owned local Joomla Boxing QA site, using web repair source `2a39089b0f`. It was neither a full Website opportunity acceptance run nor a shared-footer consent test. The existing native runtime was older than the web repair source.

## What the real measurements and agent established

- The production look reader and judge measured 27 observations at desktop and phone widths, with no unshot observations. Two blocking desktop observations, dark and light, named the same hero description and measured 3.07:1 contrast.
- Production repair grouped those observations into one comment carrying the correct verified element selector. The agent initially used that selector in both `page.look` and `look.set`; it did not invent occurrence numbers from the observations.
- Two initial `page.look` calls returned `LOOK_FAILED`. The subsequent exact-selector style read returned zero matches with `loaded: false`. Later read-only inspection found the original selector matched exactly one element, with the same words and ancestor structure, in both the served HTML and a DOM captured through the native container route. These observations do not establish selector instability; the incomplete browser read remains unresolved.
- The agent subsequently tried shorter selectors and made one recorded look write setting font weight and text shadow on the hero description. The turn was cancelled through the supported session door. Its final tool response was aborted, but the write had already been recorded, so cancellation was not treated as proof that nothing changed.
- Native elapsed time was **227.366 seconds**, across **11 tool calls**. The after-cancellation measurement still found the same two 3.07:1 failures. The contrast judge does not credit text shadow as a change to the measured foreground/background contrast.
- Text, hero geometry and description geometry were unchanged at 1440 and 390 pixels. Before and after screenshots at both widths were captured and read by eye.

## Harness limitation and recovery

The local measurement bridge attempted to write its recheck request into a read-only bind mount and failed with `EROFS`. This was a harness error and prevents claiming a completed production repair pass. It is separate from the native browser errors. No successful readability or full-site acceptance is claimed.

The cancelled turn's audit was settled through the supported moment doors using its actual aborted trace. Supported whole-turn undo then returned HTTP 409, `BLOCKED`, with `SHARED_CHANGE` caused by an unsealed turn. That refusal was preserved; no internal tool dispatch, forced authority, direct file rewrite or database rewrite was used to bypass it.

The owner then authorized a normal full restore of **Backup 2** for this exact QA site. The supported restore door completed successfully:

- All six restore stages completed, including verification, the automatic backup before restore, database loading, file restoration, database swap and final checks.
- **116 tables** were restored. The verified database backup SHA-256 was `2789a3fd1c52c77ab9fd3e5355dbe0d41edb1effc8c8e41b379dd594b636f938`.
- The newly created customization stylesheet was absent after restoration, as it was in Backup 2.
- Automatic **Backup 4**, taken before restoration, retained the exact 189-byte stylesheet from the controlled write. Its SHA-256 was verified as `7e096ab24624ee310ada2e030063df161a4018a80cc7fb2a2e679c3a0dd21426`.
- The site returned HTTP 200, no native audit turn remained open, and hero geometry and words matched the baseline at both widths. Restored screenshots were also read by eye.
- Docker had approximately **2.19 GiB available** at the final capacity check. This is an available-space observation, not a peak resource measurement.

The full restore intentionally also rolled back the earlier controlled BXR picture replacement. Its separate positive picture-repair evidence remains valid for that completed fixture; the stand now holds its original demo baseline and is **not an accepted customer site**. No model, measurement bridge or repair process from this attempt remained active after recovery.
