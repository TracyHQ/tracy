/**
 * Whether the Claude Cowork plugin a NEW site of this release gets carries the content contract it
 * names, file for file (STAB-1 (3), spec `tasks/spec-template-customization-question-readiness.md`).
 * A site that names a contract its plugin does not carry is refused at bind (JA Essence WordPress
 * 1.0.10, 09/10/2026); a plugin that carries the contract without its maps builds the site and keeps
 * the demo menu and pages (JA Boxing 1.0.3 with Claude Cowork for Joomla 0.24.62, 25/10/2026).
 *
 * This reader only JUDGES evidence; it opens no plugin and reads no network. The evidence is read by
 * the caller (`lib/cowork-contract-evidence.js`, collected by `lib/customize-readiness.js` before the
 * check runs, for the plugin `lib/cowork-install.js` selects, the same choice `resolveInstall`
 * makes) and passed in as `context.coworkEvidence`. A check run without it, or with evidence for
 * another contract, says "not checked", which never counts as a pass.
 */

/**
 * @typedef {{ state: 'carries' | 'lacks' | 'not-checked', problems: string[], note: string }} PluginVerdict
 */

/**
 * @param {import('../index.js').RuleContext} context
 * @param {{ id: string, text: (file: string) => string | null }} contract the contract this deployment carries for the release
 * @returns {PluginVerdict}
 */
export function pluginCarriesContract(context, contract) {
  const evidence = context.coworkEvidence
  const { id } = contract
  if (!evidence)
    return {
      state: 'not-checked',
      problems: [],
      note: `whether the Claude Cowork plugin a new site gets carries ${id} was not read for this check`
    }
  if (evidence.contract !== id)
    return {
      state: 'not-checked',
      problems: [],
      note: `the plugin evidence was read for ${evidence.contract ?? 'no contract'}, not ${id}`
    }
  const at = evidence.checkedAt ? ` (read ${evidence.checkedAt})` : ''
  const names = (evidence.plugins ?? [])
    .map((p) => `Claude Cowork ${p.version ?? p.file ?? '?'} (${p.role})`)
    .join(' and ')
  if (evidence.state === 'lacks')
    return {
      state: 'lacks',
      problems: (evidence.plugins ?? []).flatMap((p) => (p.state === 'lacks' ? p.problems : [])),
      note: `${names} does not carry ${id} whole${at}`
    }
  if (evidence.state === 'carries')
    return {
      state: 'carries',
      problems: [],
      note: `${names} carries ${id}${Object.keys(evidence.expected ?? {}).length ? `: ${Object.keys(evidence.expected).join(', ')} byte for byte` : ''}${at}`
    }
  const reasons = (evidence.plugins ?? []).filter((p) => p.state === 'not-checked').map((p) => p.reason)
  return {
    state: 'not-checked',
    problems: [],
    note: `whether ${names || 'the plugin a new site gets'} carries ${id} could not be read${at}${reasons.length ? `: ${reasons.join('; ')}` : ''}`
  }
}
