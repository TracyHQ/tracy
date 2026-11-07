// One line naming the CMS a site runs on, put at the top of each locked model prompt (planner, brand, writer,
// pictures) when a run builds its system prompt. The prompt files themselves are the owner's locked text and are never
// edited for it: the line comes from the kit's platform (its contract manifest), so there is still one prompt for
// every CMS. A kit with no known platform is an error, never a guess.
const LINES = Object.freeze({
  joomla: 'This site runs on Joomla.',
  wordpress: 'This site runs on WordPress (block editor).'
})

/** The CMS line for a kit platform ("joomla", "wordpress"); throws for anything else. */
export function cmsLine(platform) {
  const line = typeof platform === 'string' && Object.hasOwn(LINES, platform) ? LINES[platform] : null
  if (!line)
    throw new Error(
      `the kit has no known platform (got ${JSON.stringify(platform ?? null)}; expected ${Object.keys(LINES).join(' or ')})`
    )
  return line
}

/** The locked prompt text with the CMS line in front of it, a blank line between. */
export const withCmsLine = (text, platform) => `${cmsLine(platform)}\n\n${text}`

/** A run's refusal when its kit has no known platform (checked before any model call), or null when it has one. */
export function platformRefusal(kit, codePrefix) {
  try {
    cmsLine(kit?.platform)
    return null
  } catch (error) {
    return { ok: false, code: `${codePrefix}_KIT_PLATFORM`, reason: error.message }
  }
}
