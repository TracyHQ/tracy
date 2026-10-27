/**
 * One "Create with <CMS>" button of the preview dialog: whether it can be pressed, and the one line
 * it says about that.
 *
 * A row that names its platforms is buildable only there; a CMS not named is greyed and says why,
 * never hidden (Lee, 15/09: what the customer sees is what they get). `undefined` names nothing and
 * leaves every button open — a surface that sends no list does not know.
 *
 * A brand (`brand:<host>`) is a look, not a site: its buttons light where a published quickstart
 * can wear it (`withBrandPlatforms`, host side), and a greyed one says that no quickstart on that
 * CMS can wear a brand yet — not that the brand "has no build", which reads as the brand's fault.
 *
 * Plain JavaScript so `node --test` runs it without a build step.
 *
 * @param {{ id: string, platforms?: string[] }} row
 * @param {string} platform
 * @returns {{ disabled: boolean, title: 'dialog.createWithTitle' | 'dialog.createWithNone' | 'dialog.createWithNoBrand' }}
 */
export function createWith(row, platform) {
  if (!Array.isArray(row.platforms) || row.platforms.includes(platform))
    return { disabled: false, title: 'dialog.createWithTitle' }
  return {
    disabled: true,
    title: row.id.startsWith('brand:') ? 'dialog.createWithNoBrand' : 'dialog.createWithNone'
  }
}
