// The first user message of a brand run (brand step trial bench, #320): the brand part of the brief, the kit parts the
// prompt's Input section names (kit id, logo spots, favicon, name slots, brand colours) and where the home page shot
// is. How to call the tools is in the prompt; this message only carries the run's data. Compact JSON, no dashes.
const compact = (value) => JSON.stringify(value ?? null)

/** The kit id the brand file records: "<product>@<version>". */
export const kitIdOf = (kit) => `${kit.doc.quickstart?.product}@${kit.doc.quickstart?.version}`

/** The home page shot at 1440 the prompt asks the agent to open, or null. */
export const homeShotOf = (kit) =>
  (kit.doc.images ?? []).find((i) => /^page-home-1440$/.test(i.id))?.id ??
  (kit.doc.images ?? []).find((i) => /home.*1440/.test(i.id))?.id ??
  null

export function firstUserMessage({ kit, brief }) {
  const site = kit.doc.site ?? {}
  const shot = homeShotOf(kit)
  return [
    'Build the brand file for this website.',
    '',
    `Template kit id: ${kitIdOf(kit)}`,
    '',
    'Brief, brand part:',
    compact(brief.brand),
    '',
    `Brief, missing: ${compact(brief.missing ?? [])}`,
    '',
    'site.logoSpots:',
    compact(site.logoSpots),
    '',
    'site.favicon:',
    compact(site.favicon),
    '',
    'site.nameSlots:',
    compact(site.nameSlots),
    '',
    'site.brandColours:',
    compact(site.brandColours),
    '',
    shot ? `The kit's home page shot at 1440 is the image "${shot}"; open it with open_image.` : '',
    'When the brand file is ready, call save_brand_file with it, then answer with one short line. The gate checks the ' +
      'saved file after your answer; if it rejects fields, they come back as the next message.'
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')
}

/** What goes back to the same conversation when the gate rejected fields: only those fields, nothing else. */
export function fixMessage(rejected) {
  const lines = rejected.map((r) => `- ${r.field}: ${r.why}`)
  return [
    `The gate rejected ${rejected.length} field${rejected.length === 1 ? '' : 's'} of the brand file you saved:`,
    ...lines,
    '',
    'Fix these fields only (keep everything else), then call save_brand_file again with the whole file and answer with one short line.'
  ].join('\n')
}
