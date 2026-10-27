/** Each model-callable contract operation has a fixed route and its own schema and effects. */
const OPERATIONS = {
  inspect: ['Inspect content slots and their current revision', ['contract'], [], false],
  bind: ['Bind the site to its content contract', ['contract'], [], true],
  apply: [
    'Apply changes to named content slots',
    ['changes', 'evidence', 'expected_revision', 'apply_id'],
    ['changes'],
    true
  ],
  string: [
    'Override one WordPress gettext string',
    ['domain', 'msgid', 'context', 'locale', 'value', 'apply_id'],
    ['domain', 'msgid', 'value'],
    true
  ],
  'multilingual.plan': [
    'Plan a Joomla language edition without changing the site',
    ['locale'],
    ['locale'],
    false
  ],
  'multilingual.package': [
    'Install the reviewed Joomla language package for an edition',
    ['locale'],
    ['locale'],
    true
  ],
  'multilingual.apply': [
    'Apply translated slots to a Joomla language edition',
    ['locale', 'translations', 'expected_revision', 'apply_id'],
    ['locale', 'translations'],
    true
  ],
  'multilingual.verify': [
    'Verify a Joomla language edition without changing it',
    ['locale'],
    ['locale'],
    false
  ],
  'multilingual.revert': [
    'Undo a Joomla language edition',
    ['locale', 'expected_revision', 'apply_id'],
    ['locale'],
    true
  ],
  'multilingual.retire': [
    'Hide language editions except the ones to keep',
    ['keep', 'apply_id'],
    ['keep'],
    true
  ],
  'multilingual.restore': [
    'Restore language editions hidden under a receipt',
    ['apply_id'],
    ['apply_id'],
    true
  ],
  'demoTrim.plan': ['Plan which reviewed demo content would be hidden', [], [], false],
  'demoTrim.apply': ['Hide a batch of reviewed quickstart demo content', ['apply_id'], [], true],
  'demoTrim.revert': ['Restore hidden quickstart demo content', ['apply_id'], [], true],
  'siteLanguage.plan': [
    'Plan the default site language without changing it',
    ['locale', 'language'],
    [],
    false
  ],
  'siteLanguage.set': ['Change the default site language', ['locale', 'language', 'apply_id'], [], true],
  'siteLanguage.revert': ['Restore the previous default site language', ['apply_id'], [], true],
  'sourceLanguage.plan': [
    'Plan the source content language without changing it',
    ['locale'],
    ['locale'],
    false
  ],
  'sourceLanguage.set': ['Change the source content language', ['locale', 'apply_id'], ['locale'], true],
  'sourceLanguage.revert': ['Restore the previous source content language', ['apply_id'], [], true]
}

export function contractTools(entry) {
  const params = entry.tool.inputSchema.properties.body.properties
  // Catalogue tests keep this explicit list equal to the callable public operations.
  const declared = Object.keys(OPERATIONS)
  return declared.map((operation) => {
    const [title, fields, required, writes] = OPERATIONS[operation]
    const inputSchema = structuredClone(entry.tool.inputSchema)
    delete inputSchema.properties.path.properties.operation
    inputSchema.properties.path.required = ['key']
    inputSchema.properties.body = {
      type: 'object',
      properties: Object.fromEntries(fields.map((name) => [name, structuredClone(params[name])])),
      additionalProperties: false,
      ...(required.length ? { required } : {})
    }
    if (required.length) inputSchema.required = [...new Set([...inputSchema.required, 'body'])]
    const headers = inputSchema.properties.header.properties
    if (operation !== 'apply') delete headers['If-Match']
    if (!writes) {
      delete headers['Tracy-Apply-Id']
      delete headers['Idempotency-Key']
    }
    const description = `${title}. Executes only content.contract ${operation}; the operation cannot be changed by arguments. ${writes ? 'Changes the selected site and returns the operation result or a refusal. Writes use the existing REST and Apply authorization and receipt rules; unsupported CMS profiles are refused.' : 'Reads the selected site and returns the plan, verification, or contract snapshot. Does not modify site content.'}`
    return {
      contractOperation: operation,
      row: {
        ...entry.row,
        path: entry.row.path.replace(':operation', operation),
        summary: title,
        description,
        writes
      },
      tool: {
        ...entry.tool,
        name: `tracy_post_sites_by_key_contract_${operation.replace(/\./g, '_')}`,
        title,
        description,
        inputSchema,
        annotations: {
          ...entry.tool.annotations,
          readOnlyHint: !writes,
          destructiveHint: writes,
          idempotentHint: !writes
        }
      }
    }
  })
}
