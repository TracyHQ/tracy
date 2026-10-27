/**
 * Re-export only. The rule itself lives in `@tracy/core/preview`, where the Live site tab in
 * `@tracy/dsh-site-build-core` can reach it too — this file stayed because the wizard's own
 * imports point here, and moving them is a rename with no other purpose.
 */
export { canFrameCopy, EXTERNAL_ONLY_PLATFORMS } from '@tracy/core/preview'
