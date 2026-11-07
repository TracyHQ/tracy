// Test-only: the server's contract index with every kit's platform set to one value, so a bench seam can be run on a
// "WordPress" or a "Joomla" kit without a second kit fixture. Only the platform word changes; the kit is the same.
import { defaultContracts } from '../src/lib/contracts.js'

export const indexAs = (platform) =>
  new Map([...defaultContracts()].map(([key, contract]) => [key, { ...contract, platform }]))
