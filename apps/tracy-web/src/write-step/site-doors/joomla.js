// The Joomla site door (index.js): the Claude Cowork for Joomla content contract, read and written through the seeder's own
// caller (`apply-joomla-contract`), so its rules, how a refusal is worded and how one apply call is made, are the seeder's
// and never a second copy (lib/seeder.js). The module is loaded at the first call, as the write step loaded it before.
import { seeder } from '../../lib/seeder.js'

const tools = () => seeder('apply-joomla-contract')

export const joomlaSiteDoor = Object.freeze({
  platform: 'joomla',
  writes: true,
  /** The plugin's refusal in its own words (`doorRefusal`). */
  refusal: async (answer, options) => (await tools()).doorRefusal(answer, options),
  /** One contract write, all or nothing (`applyJoomlaContract`: inspect, then apply). */
  applyContract: async (input) => (await tools()).applyJoomlaContract(input)
})
