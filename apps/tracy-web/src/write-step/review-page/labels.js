// The review page's visible words (#357). The repo holds English defaults only. An operator who reads another language
// passes a JSON file of overrides from outside the repo (`--labels <file>`); a key missing from it keeps its English default.
// Long dashes are turned into commas in every label, so a label file cannot bring one into the page.

export const DEFAULT_LABELS = {
  htmlLang: 'en',
  title: 'Write run review',
  openSite: 'Open the site',
  tabPages: 'Pages',
  tabPictures: 'Pictures',
  summary: 'Summary',
  statFailed: 'Failed',
  statWritten: 'Written',
  statSkipped: 'Skipped',
  statFrames: 'Frames',
  failedFirst: 'Failed slots come first.',
  slot: 'Slot',
  ordered: 'Ordered',
  status: 'Status',
  reason: 'Reason',
  stateFailed: 'Failed',
  stateOk: 'Written and read back',
  stateUnchecked: 'Written, not read back',
  stateSkipped: 'Skipped',
  skippedSlots: 'Skipped slots',
  noSlots: 'Nothing was written to this page.',
  shared: 'Shared parts (header, footer, menu)',
  capture1440: 'Desktop, 1440',
  capture390: 'Phone, 390',
  noCapture: 'No capture. The page did not load.',
  frameNotFound: 'This frame was not found on the page, so there is no crop.',
  approve: 'Approve',
  reject: 'Reject',
  note: 'Note',
  notePlaceholder: 'What is wrong with this picture?',
  copyRedo: 'Copy frames to redo',
  copyNotes: 'Copy notes',
  copied: 'Copied',
  redoCount: 'Frames to redo',
  nearbyCopy: 'Nearby copy',
  planned: 'The plan asked for',
  madePicture: 'Picture made',
  sourcePicture: 'Source picture',
  noNearbyCopy: 'No copy around this frame.',
  filterAll: 'All',
  filterFailed: 'Failed',
  filterRejected: 'Rejected',
  filterOpen: 'Not decided',
  decided: 'decided',
  theme: 'Theme',
  runOf: 'Run on',
  kit: 'Kit',
  siteCheck: 'Site check',
  frameKind: 'Kind',
  frameSource: 'Source',
  crop1440: '1440',
  crop390: '390'
}

const LONG_DASH = /\s*[–—]\s*/g

/** The labels with the operator's overrides on top; unknown keys are ignored, values are plain text without long dashes. */
export function withLabels(overrides = {}) {
  const out = { ...DEFAULT_LABELS }
  for (const [key, value] of Object.entries(overrides ?? {}))
    if (key in DEFAULT_LABELS && typeof value === 'string') out[key] = value
  for (const key of Object.keys(out)) out[key] = out[key].replace(LONG_DASH, ', ')
  return out
}
