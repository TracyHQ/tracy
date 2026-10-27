/** Tracy settings, Model & AI, User Interface (with its AI accounts area) and Servers. */
export const NS = 'settings'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'settings/Settings.tsx',
  'settings/panels.tsx',
  'settings/ModelAi.tsx',
  'settings/UserInterface.tsx',
  'settings/Servers.tsx',
  'settings/DesktopApp.tsx',
  'settings/WoRetention.tsx',
  'settings/api.ts',
  'settings/llm-api.ts',
  'settings/desktop-app.ts',
  'settings/wo-retention.ts',
  'settings/route.ts'
] as const

export const en = {
  'settings.common.save': 'Save',
  'settings.common.saving': 'Saving…',
  'settings.common.yes': 'yes',
  'settings.common.no': 'no',
  'settings.common.on': 'on',
  'settings.common.off': 'off',
  'settings.common.readOnlyRole': 'Read-only for your role: only an owner or an admin can change these.',

  'settings.page.title': 'Tracy settings',
  'settings.page.blurb':
    'What this deployment is configured to be. Each panel says where a value lives; Website Opportunity can be changed here.',
  'settings.page.readFailed': "Could not read this deployment's configuration.",

  'settings.panel.team.label': 'Team',
  'settings.panel.team.blurb': 'Who at Tracy can open this surface.',
  'settings.panel.signin.label': 'Sign-in',
  'settings.panel.signin.blurb': 'How a person proves who they are.',
  'settings.panel.limits.label': 'Limits',
  'settings.panel.limits.blurb': 'What this deployment enforces on people.',
  'settings.panel.integrations.label': 'Integrations',
  'settings.panel.integrations.blurb': 'Outside services, and whether each is fully configured.',
  'settings.panel.naming.label': 'Naming',
  'settings.panel.naming.blurb': 'Names a customer may not give a site.',
  'settings.panel.wo.label': 'Website Opportunity',
  'settings.panel.wo.blurb': 'When unused demo sites freeze and are deleted.',

  'settings.panels.notSet': 'not set',
  'settings.panels.where': 'Set in <code>{where}</code>',
  'settings.panels.ready': 'Ready',
  'settings.signin.mail.title': 'Mail',
  'settings.signin.mail.blurb': 'How a sign-in code reaches a person.',
  'settings.signin.mail.consoleOnly': 'Console only — no mail is sent',
  'settings.signin.mail.transport': 'Transport',
  'settings.signin.mail.from': 'From address',
  'settings.signin.oauth.title': 'Sign in with a provider',
  'settings.signin.oauth.blurb':
    'Independent of each other, and neither is required — the mailed code always works.',
  'settings.signin.oauth.off': 'Off — no button shown',
  'settings.signin.turnstile.blurb': 'The captcha in front of the public doors.',
  'settings.signin.turnstile.deliberatelyOff': 'Deliberately off',
  'settings.signin.turnstile.failsClosed': 'Fails closed — public doors refuse',
  'settings.signin.turnstile.secret': 'Secret',
  'settings.signin.turnstile.secretSet': 'set',
  'settings.signin.turnstile.disabled': 'Explicitly disabled',
  'settings.signin.turnstile.localPreview': 'Local login preview',

  'settings.limits.hours_one': '{count} hour',
  'settings.limits.hours_other': '{count} hours',
  'settings.limits.minutes_one': '{count} minute',
  'settings.limits.minutes_other': '{count} minutes',
  'settings.limits.sessions.title': 'Sessions and sign-in codes',
  'settings.limits.sessions.sessionLasts': 'Session lasts',
  'settings.limits.sessions.codeLasts': 'Mailed code lasts',
  'settings.limits.sessions.wrongCodes': 'Wrong codes allowed',
  'settings.limits.rate.title': 'Rate limits',
  'settings.limits.rate.blurb': 'Every check fails CLOSED: one the database cannot answer counts as over.',
  'settings.limits.rate.writesPerHour': 'Writes per hour',
  'settings.limits.rate.designReads': 'Design reads per day',
  'settings.limits.rate.designWords': 'Design words per day',
  'settings.limits.rate.designBrand': 'Design brand runs per day',
  'settings.limits.invitation.title': 'One invitation',
  'settings.limits.invitation.addresses': 'Addresses at most',
  'settings.limits.invitation.sites': 'Sites at most',
  'settings.limits.footer':
    'These are enforced from <code>{where}</code>. Changing one is a code change and a deploy — there is no setting behind this screen yet.',

  'settings.integrations.off': 'Off — nothing set',
  'settings.integrations.partial_one': '{set} of {count} key',
  'settings.integrations.partial_other': '{set} of {count} keys',
  'settings.integrations.keys': 'Keys',
  'settings.integrations.missing': '{key} — missing',

  'settings.naming.addresses.title': 'Addresses',
  'settings.naming.addresses.blurb': 'Where this deployment and the sites it builds answer.',
  'settings.naming.thisDeployment': 'This deployment',
  'settings.naming.siteDomain': 'Site domain',
  'settings.naming.aliases': 'Also reachable as',
  'settings.naming.prefix': 'New site prefix',
  'settings.naming.cookieDomain': 'Session cookie domain',
  'settings.naming.landing': 'Signed-out landing',
  'settings.naming.none': 'none',
  'settings.naming.hostOnly': 'host-only',
  'settings.naming.noLanding': 'none — strangers go to /login',
  'settings.naming.reserved.title': 'Reserved names',
  'settings.naming.reserved.blurb_one': '{count} name a customer may not give a site.',
  'settings.naming.reserved.blurb_other': '{count} names a customer may not give a site.',

  'settings.model.title': 'Model & AI',
  'settings.model.blurb': 'Who Tracy talks to, and which job each provider does.',
  'settings.model.readFailed':
    'Could not read the provider book. This screen is open to owners and admins only.',
  'settings.model.push': 'Send keys to the fleet',
  'settings.model.pushed': 'Sent {files} to {host}. The agent picks it up on its next turn.',
  'settings.model.pushFailed': 'Could not send the keys: {code}',
  'settings.model.pushFailedDetail': 'Could not send the keys: {code} ({detail})',
  'settings.model.noAnswer': 'no answer',
  'settings.model.rereading':
    'Reading the models of {names} again: the saved list predates the record of what each model can do.',
  'settings.model.rereadFailed': '{name}: could not read its model list again ({error}).',
  'settings.model.listFailed': 'Could not read the model list: {error}',
  'settings.model.pickProvider': 'Pick a provider to see or set its key.',
  'settings.model.inUse': 'Still doing a job: {doors}. Point that job elsewhere first.',
  'settings.model.keyUnreadableMark': 'key unreadable',
  'settings.model.inServiceMark': 'in service',
  'settings.model.answeredIn': 'Answered in {ms} ms.',
  'settings.model.contextWindow': 'Context window',
  'settings.model.contextTokens': 'Context window: {tokens} tokens',

  'settings.model.cap.draws': 'Draws pictures',
  'settings.model.cap.vision': 'Reads pictures',
  'settings.model.cap.reasoning': 'Reasoning',
  'settings.model.cap.tools': 'Tool calls',
  'settings.model.cap.json': 'Structured output',
  'settings.model.capInline.draws': 'drawing pictures',
  'settings.model.capInline.vision': 'reading pictures',
  'settings.model.capInline.reasoning': 'reasoning',
  'settings.model.capInline.tools': 'tool calls',
  'settings.model.capInline.json': 'structured output',
  'settings.model.mismatch.unknown':
    'Capabilities are unknown. Select a model with declared support and test it before use.',
  'settings.model.mismatch.lacks': '{model} does not support {caps}: it will still answer, less reliably.',
  'settings.model.mismatch.undeclared':
    '{model}: this provider does not declare {caps}. Test it before relying on it.',
  'settings.model.mismatch.refused': '{door}: {model} cannot do {caps}, and this job needs a model that can.',

  'settings.model.provider.inService': 'In service',
  'settings.model.provider.keyUnreadable':
    'This key was sealed under a different SESSION_SECRET and can no longer be opened. Type it again to replace it.',
  'settings.model.provider.apiKey': 'API key',
  'settings.model.provider.keySet': 'A key is set: type to replace it',
  'settings.model.provider.enterKey': 'Enter API key',
  'settings.model.provider.hideKey': 'Hide the key',
  'settings.model.provider.showKey': 'Show the key',
  'settings.model.provider.noKeyNeeded': 'This provider needs no key.',
  'settings.model.provider.getKey': 'Get a key',
  'settings.model.provider.apiHost': 'API host',
  'settings.model.provider.apiHostHint': 'leave empty for {url}',
  'settings.model.provider.apiHostHintDefault': 'leave empty for the default',
  'settings.model.provider.testModel': 'Model to test with',
  'settings.model.provider.getModels': 'Get model list',
  'settings.model.provider.test': 'Test',
  'settings.model.provider.modelList': 'Model list',
  'settings.model.provider.aliasesHelp':
    'Aliases appear in customer model pickers for Tracy AI only. Leave an alias empty to use the original name. Model IDs stay unchanged.',
  'settings.model.provider.providerAlias': 'Provider Alias',
  'settings.model.provider.modelId': 'Model ID',
  'settings.model.provider.alias': 'Alias',
  'settings.model.provider.aliasFor': 'Alias for {model}',
  'settings.model.provider.aliasesNeedList': 'Get the model list to add aliases.',
  'settings.model.provider.saveAliases': 'Save aliases',
  'settings.model.provider.aliasesSaveFailed': 'Could not save aliases: {error}',
  'settings.model.provider.aliasesSaved':
    'Provider and model aliases saved. Reload an open chat to see the updated names.',
  'settings.model.provider.remove': 'Remove',

  'settings.model.doors.title': 'What each job uses',
  'settings.model.doors.blurb': 'Only providers that are in service and hold a key can take a job.',
  'settings.model.doors.legend': 'As the provider declares it; a model with no marks declared nothing.',
  'settings.model.door.runsIn': 'Runs in: {where}',
  'settings.model.door.notSet': 'Not set',
  'settings.model.door.readingModels': 'Reading the models of {name}…',
  'settings.model.door.readFailed': '{name}: could not read the model list ({error}).',
  'settings.model.door.pickModel': 'Pick a model',
  'settings.model.door.noMatch': 'No model matched.',
  'settings.model.door.modelId': 'model id',
  'settings.model.door.effort': 'Reasoning effort',
  'settings.model.door.effortAria': 'WO editorial reasoning effort',
  'settings.model.door.chooseEffort': 'Choose effort',
  'settings.model.door.effortUnknown':
    'Supported reasoning effort is unknown. Refresh the model list before using WO editorial.',
  'settings.model.door.effortUnsupported':
    'Tracy has no supported effort control for this provider and model. WO editorial will remain unavailable.',
  'settings.model.door.hidden_one': '{count} model hidden: the provider says it cannot do this job.',
  'settings.model.door.hidden_other': '{count} models hidden: the provider says they cannot do this job.',
  'settings.model.door.where.process': 'this process',
  'settings.model.door.where.dsh': 'tracy-dsh',
  'settings.model.door.where.dshAndSite': 'tracy-dsh, and the customer site container',

  'settings.model.vision.passed': 'Pixels and structured JSON verified for {model}.',
  'settings.model.vision.required': 'Pixel test required before Website Opportunities can use this model.',
  'settings.model.vision.menuReasoning': 'Reasoning when reading menu photos',
  'settings.model.vision.effortLow': 'low',
  'settings.model.vision.effortOff': 'off',
  'settings.model.vision.rereadWarning':
    'Changing the model or this setting reads every menu photo again, which costs again, and asks for a new pixel test.',
  'settings.model.vision.testing': 'Testing pixels…',
  'settings.model.vision.resume': 'Resume pixel test',
  'settings.model.vision.test': 'Test with pixels',
  'settings.model.vision.note':
    'Uses the saved reading model and the existing research budget. The provider’s text Test does not verify image reading.',
  'settings.model.vision.testPassed': 'Pixel test passed for {model}. Cost: {cents} US cents.',
  'settings.model.vision.testState': 'Pixel test: {state}.',
  'settings.model.vision.noResponse': 'No response. Resume this test to check its receipt.',

  'settings.model.door.web.label': "Text for Tracy's own pages",
  'settings.model.door.web.blurb': 'The public Design templates page and quickstart card drafts.',
  'settings.model.door.assistant.label': 'AI Assistant',
  'settings.model.door.assistant.blurb':
    'The chat with Tracy in the corner of the customer’s page: answers about Tracy and the asker’s own sites. Not set: it borrows “{fallback}”.',
  'settings.model.door.seedText.label': 'Text for a built site',
  'settings.model.door.seedText.blurb':
    "Blog posts, page sections and translations written into a customer's new site.",
  'settings.model.door.woEditorial.label': 'WO editorial',
  'settings.model.door.woEditorial.blurb':
    'Website Opportunities: understand source dossiers and plan content across the whole site.',
  'settings.model.door.vision.label': 'Read pictures',
  'settings.model.door.vision.blurb':
    'Website Opportunities: analyze source photographs and review rendered screenshots. Requires a separate pixel test; drawing pictures does not prove this capability.',
  'settings.model.door.seedImage.label': 'Pictures for a built site',
  'settings.model.door.seedImage.blurb':
    'Photographs drawn for the customer’s trade. Only some models answer with images.',
  'settings.model.door.agent.label': "The agent's model",
  'settings.model.door.agent.blurb':
    "What every customer's agent talks to. Tracy changes the key here; the model itself is chosen by the agent runtime.",

  'settings.ui.title': 'User Interface',
  'settings.ui.blurb':
    'What a customer sees in the page, area by area. Off hides the piece for every customer of this deployment; their page picks it up on the next load, with no release and no rebuild.',
  'settings.ui.allDefaults': 'All at their defaults',
  'settings.ui.changedCount_one': '{count} changed from the default',
  'settings.ui.changedCount_other': '{count} changed from the default',
  'settings.ui.lastPress': ' · last press by {name}',
  'settings.ui.readFailed': 'The switches answered {status}.',
  'settings.ui.pressFailed': 'The switch answered {status}.',
  'settings.ui.notWired': 'not wired yet',
  'settings.ui.changed': 'changed',
  'settings.ui.offWithParent': 'Off with “{parent}”: turning the whole menu off turns every item in it off.',
  'settings.ui.shot.caption':
    "The customer's page: {area}, every piece shown. Numbers match the switches above.",
  'settings.ui.shot.notDrawn': 'Not drawn on this page:',
  'settings.ui.shot.legend':
    'Solid box: on for customers now. Dashed: off. Captured {date} on <code>{site}</code>.',

  'settings.desktop.title': 'AI accounts',
  'settings.desktop.blurb':
    'Account subscriptions on web and desktop. These switches control connection and use on both surfaces.',
  'settings.desktop.readFailed': 'The desktop settings answered {status}.',
  'settings.desktop.connect.title': 'Let customers use their own AI accounts',
  'settings.desktop.connect.description':
    'Customers connect their existing subscriptions to their Tracy account. Credentials are encrypted on the server and are never shared with other team members.',
  'settings.desktop.providers.title': 'Subscriptions a customer may connect',
  'settings.desktop.providers.on':
    'Only subscriptions switched on here can be connected and used on web and desktop.',
  'settings.desktop.providers.off': 'Turn on the switch above to offer any of these.',
  'settings.desktop.tracyModel':
    "New chats without a connected subscription use Tracy's model: <code>{model}</code>.",
  'settings.desktop.tracyModelRuntime':
    "New chats without a connected subscription use Tracy's model: <code>{model}</code> (the model itself is chosen inside the agent runtime).",
  'settings.desktop.tracyModelNone':
    "New chats without a connected subscription use Tracy's model: no provider is assigned to “{door}” on Model & AI.",
  'settings.desktop.preserved': 'Turning a switch off preserves saved connections and routing order.',
  'settings.desktop.lastChange': 'Last change by {name}.',

  'settings.servers.title': 'Servers',
  'settings.servers.blurb': 'Which machine does what.',
  'settings.servers.noteDefault': 'Roles decide where NEW sites are built.',
  'settings.servers.readFailed': 'Could not read the server list.',
  'settings.servers.server': 'Server',
  'settings.servers.address': 'Address',
  'settings.servers.role.newSites': 'New customer sites',
  'settings.servers.role.demo': 'Public quickstart demos',
  'settings.servers.role.onboarding': "A new account's own workspace",
  'settings.servers.role.landing': 'Signed-out landing',
  'settings.servers.colocated': 'beside this app',
  'settings.servers.recordOnly': 'recorded only',
  'settings.servers.recordNote': 'Tracy records these addresses and never installs onto this machine.',
  'settings.servers.notApplicable': 'Does not apply: Tracy does not install here',
  'settings.servers.held': 'held',
  'settings.servers.notHeld': 'not held',
  'settings.servers.footer':
    'Roles are read-only here. When they become editable, changing one will decide where the NEXT site is built: sites already running carry their own machine and do not move.',

  'settings.wo.count.live': 'Demos live',
  'settings.wo.count.frozen': 'Frozen',
  'settings.wo.count.expiring': 'Expiring in 24 h',
  'settings.wo.builds.title': 'Demo builds',
  'settings.wo.builds.blurb':
    'Each press of Build demo counts once, a rebuild too. The count starts again at 00:00 UTC.',
  'settings.wo.milestones.title': 'Milestones',
  'settings.wo.milestones.blurb': 'What the saved values do, in words.',
  'settings.wo.milestones.note':
    'Opening a demo’s page, handing it to its agent, Extend and Reopen give it a new term. A frozen demo keeps running until it is deleted.',
  'settings.wo.retention.title': 'Demo retention',
  'settings.wo.retention.writable': 'Owners and admins can change these.',
  'settings.wo.retention.readOnly': 'Read-only: only owners and admins can change these.',
  'settings.wo.retention.sweepOn': 'Sweep on',
  'settings.wo.retention.saved':
    'Saved. Build limits apply now; retention changes apply at the next hourly sweep.',
  'settings.wo.find.title': 'Public Find',
  'settings.wo.find.blurb':
    "A search is one Google Places request (about $35 per 1,000), a suggestion one Autocomplete call (about $2.83 per 1,000). The page answers only while the Website Opportunities and public Find switches are both on. Google answers are kept for both Finds for the days below; a kept answer costs no call. Research pressed on /find reserves the per-job research cap from the strangers' budget for each place nobody researched yet; a researched place costs nothing.",
  'settings.wo.find.saved': 'Saved. It applies to the next search.',
  'settings.wo.find.closed': 'Closed: the /find page refuses every search and suggests nothing.',
  'settings.wo.find.open':
    'Strangers on /find may run {searches} Google searches and {suggestions} place suggestions a UTC day in total.',

  'settings.wo.field.wholeNumber': '{field}: a whole number.',
  'settings.wo.field.range': '{field}: from {min} to {max}.',
  'settings.wo.field.demoBuildsPerAccountPerDay': 'Demo builds per account per day (0 = no cap)',
  'settings.wo.field.ownSiteBuildsPerAccountPerDay':
    'Build from my business: sites per account per day (0 = no cap)',
  'settings.wo.field.demoTtlDays': 'Days a demo lives without use',
  'settings.wo.field.demoReviewTtlDays': 'Days for a demo needing review',
  'settings.wo.field.demoFreezeGraceDays': 'Days frozen before deletion',
  'settings.wo.field.demoMaxPerAccount': 'Most demos per account (0 = no cap)',
  'settings.wo.field.demoMaxPerHost': 'Most demos per server (0 = no cap)',
  'settings.wo.field.demoDiskHighWaterPct': 'Server disk high-water mark (%)',
  'settings.wo.field.demoSweepBatch': 'Operations per hourly sweep',
  'settings.wo.field.publicFindSearchesPerDay': 'Searches per day, whole deployment (0 = closed)',
  'settings.wo.field.publicFindSearchesPerMinute': 'Searches per minute, whole deployment',
  'settings.wo.field.publicFindSearchesPerAddressHour': 'Searches per hour, one address',
  'settings.wo.field.publicFindSearchesPerAddressMinute': 'Searches per minute, one address',
  'settings.wo.field.publicFindSuggestPerDay': 'Place suggestions per day, whole deployment (0 = off)',
  'settings.wo.field.publicFindSuggestPerMinute': 'Place suggestions per minute, whole deployment',
  'settings.wo.field.publicFindSuggestPerAddressHour': 'Place suggestions per hour, one address',
  'settings.wo.field.publicFindSuggestPerAddressMinute': 'Place suggestions per minute, one address',
  'settings.wo.field.placesCacheDays': 'Days to keep Google answers, both Finds (0 = no cache)',
  'settings.wo.field.placesCacheCellMeters': 'Cache cell in metres (0 = a fifth of the radius)',
  'settings.wo.field.publicResearchNewPlacesPerDay':
    'New places researched per day, whole deployment (0 = off)',
  'settings.wo.field.publicResearchNewPlacesPerAddressDay': 'New places researched per day, one address',
  'settings.wo.field.researchPublicDailyCapCents':
    'Research budget per day for strangers, in cents (0 = off)',

  'settings.wo.days_one': '{count} day',
  'settings.wo.days_other': '{count} days',
  'settings.wo.milestone.off':
    'Off: no demo is frozen or deleted. The hourly sweep only logs that it is off.',
  'settings.wo.milestone.noCaps': 'No cap on demos per account or per server.',
  'settings.wo.milestone.capsBoth':
    'More than {account} demos on one account, or {host} on one server: the least recently used are frozen, never deleted.',
  'settings.wo.milestone.capsAccount':
    'More than {account} demos on one account: the least recently used are frozen, never deleted. No cap per server.',
  'settings.wo.milestone.capsHost':
    'More than {host} demos on one server: the least recently used are frozen, never deleted. No cap per account.',
  'settings.wo.milestone.unused': 'A demo nobody opens for {days} is frozen.',
  'settings.wo.milestone.review': 'A demo QA handed back for review is frozen after {days}.',
  'settings.wo.milestone.deleted':
    'A demo frozen for {days} is deleted; its brief, QA result, screenshots and costs are kept.',
  'settings.wo.milestone.disk':
    'The {pct}% server disk mark is not connected on this deployment: no demo is frozen for disk use.',
  'settings.wo.milestone.batch': 'The hourly sweep does at most {n} freezes or deletions per run.',
  'settings.wo.readFailed': 'Could not read the demo retention settings (HTTP {status}).',
  'settings.wo.saveFailed': 'Could not save (HTTP {status}).'
} as const

export type SettingsKey = keyof typeof en
