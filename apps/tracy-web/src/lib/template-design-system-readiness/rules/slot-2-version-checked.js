/**
 * SLOT-2: the release's version is one the contract was checked on, `[minVersion, maxVersion]`.
 *
 * The door offers Apply only inside that range (`ds-slot.js` `contractFor`, README `maxVersion`): a
 * release newer than the last one checked is refused (`TEMPLATE_VERSION_UNCHECKED`), an older one or a
 * key the contract does not list too. So every new release of a template with a contract must be
 * checked and its `maxVersion` moved, or new sites quietly lose the button.
 */
import { slotOf } from '../readers/slot.js'

/** @type {import('../index.js').Rule} */
export const slot2VersionChecked = {
  id: 'SLOT-2',
  title: 'The release is a version the contract was checked on',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'contract',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.name || slot.contract?.ready === false)
      return { status: 'not-applicable', message: 'Waits for SLOT-1: no ready contract to compare with.' }
    const { key, version } = slot.versionKey
    const door = /** @type {any} */ (slot.door)
    const file = `templates/${slot.name}.json`
    if (door.contract)
      return { status: 'pass', message: `${key} ${version} is inside the range ${file} was checked on.` }
    const check =
      context.release.platform === 'wordpress'
        ? `the theme's stylesheets still read var(--ds-c-…) and functions.php still calls tracy_apply_inspiration`
        : `its stylesheets still read var(--ds-c-…) (CSS-1 and CSS-2 of this check pass)`
    switch (door.reason) {
      case 'TEMPLATE_VERSION_UNCHECKED':
        return {
          status: 'fail',
          message: `${key} ${version} is newer than the last version ${file} was checked on (${String(door.upTo)}), so the Design system button refuses new sites.`,
          fix: `Check that ${check}, then move maxVersion["${key}"] to ${version} in ${file}.`
        }
      case 'TEMPLATE_NEEDS_UPDATE':
        return {
          status: 'fail',
          message:
            door.need === null
              ? `${file} says no release of ${key} wears the slot yet.`
              : `${key} ${version} is older than the first version that wears the slot (${String(door.need)}).`,
          fix: 'Release the tokenized template (release-joomla.mjs, release-batch.mjs, or the theme release), then set minVersion and maxVersion to it.'
        }
      default:
        return {
          status: 'fail',
          message:
            version === null
              ? `The version of ${key ?? 'this release'} cannot be read, so the door cannot place it.`
              : `${file} lists no version range for ${key ?? 'this release'}.`,
          fix: `Add "${key}" to minVersion and maxVersion of ${file} once ${check}.`
        }
    }
  }
}
