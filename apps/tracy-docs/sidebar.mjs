// The site's sidebar: Get started · Using Tracy · Desktop app · MCP Server · Changelog · For developers
// (tasks/todo-desktop-update-policy.md H5, then PR-0b): the site is read by people who use Tracy
// first, so their pages come first and the whole API is one group at the end. The API pages keep the
// slugs they always had — links already sent, `llms.txt` and the 302s from the old `/docs/…`
// addresses point at them; only their place in the sidebar moved. Kept apart from `astro.config.mjs` so a test can read it
// without building the site (`test/sidebar.test.mjs`).
//
// Labels are English here and come from each translation's `_sidebar.json` (`labels`, keyed as
// below) for every other language — Starlight keys sidebar `translations` by BCP-47 language tag,
// not by directory name. Adding an item means adding its key to all of those files in the same
// change; the test names any that is missing.

/** Starlight's `{ [lang]: label }` for one key, from every translation that carries it. */
const labelsFor = (translations, key) =>
  Object.fromEntries(
    Object.values(translations)
      .filter(({ labels }) => typeof labels?.[key] === 'string')
      .map(({ lang, labels }) => [lang, labels[key]])
  )

/** The tree, as `[kind, key, English label, slug or children]`. */
const TREE = [
  ['item', 'getStarted', 'Get started', 'get-started'],
  ['item', 'usingTracy', 'Using Tracy', 'using-tracy'],
  ['group', 'desktopApp', 'Desktop app', [['item', 'download', 'Download', 'desktop/download']]],
  [
    'group',
    'mcpServer',
    'MCP Server',
    [
      ['item', 'mcpOverview', 'Overview', 'mcp'],
      ['item', 'mcpStart', 'Getting started', 'mcp/getting-started'],
      [
        'group',
        'mcpClients',
        'Connect your app',
        [
          ['item', 'chatgpt', 'ChatGPT', 'mcp/clients/chatgpt'],
          ['item', 'claude', 'Claude', 'mcp/clients/claude'],
          ['item', 'claudeCode', 'Claude Code', 'mcp/clients/claude-code'],
          ['item', 'cursor', 'Cursor', 'mcp/clients/cursor'],
          ['item', 'codex', 'Codex', 'mcp/clients/codex'],
          ['item', 'mcpOther', 'Other clients', 'mcp/clients/other']
        ]
      ],
      ['item', 'mcpWork', 'Working with your site', 'mcp/working-with-your-site'],
      ['item', 'mcpTools', 'Tools', 'mcp/tools'],
      ['item', 'mcpExamples', 'Examples', 'mcp/examples'],
      ['item', 'mcpPermissions', 'Permissions & security', 'mcp/permissions'],
      ['item', 'mcpTroubleshooting', 'Troubleshooting', 'mcp/troubleshooting'],
      ['item', 'mcpReference', 'Technical reference', 'mcp/reference']
    ]
  ],
  // Every changelog lives in this group: the product's first — Tracy Cowork, on the web and in the
  // desktop app, one page per desktop minor version (E3) — then the API's. "Tracy Cowork" is a
  // product name: every translation keeps it as it is.
  [
    'group',
    'changelog',
    'Changelog',
    [
      ['item', 'tracyCowork', 'Tracy Cowork', 'changelog/desktop'],
      ['item', 'api', 'API', 'changelog']
    ]
  ],
  [
    'group',
    'forDevelopers',
    'For developers',
    [
      // The API's own front page (`/api/`), which was the site's home page until PR-0b.
      ['item', 'apiOverview', 'API overview', 'api'],
      ['item', 'quickstart', 'Quickstart', 'quickstart'],
      ['item', 'authentication', 'Authentication', 'authentication'],
      ['item', 'concepts', 'Concepts', 'concepts'],
      [
        'group',
        'guides',
        'Guides',
        [
          ['item', 'joomla', 'Joomla', 'guides/joomla'],
          ['item', 'wordpress', 'WordPress', 'guides/wordpress'],
          ['item', 'emdash', 'EmDash', 'guides/emdash']
        ]
      ],
      [
        'group',
        'reference',
        'Reference',
        [
          ['item', 'referenceOpenapi', 'API reference (OpenAPI)', 'reference'],
          ['item', 'errors', 'Errors', 'reference/errors'],
          ['item', 'compatibility', 'Compatibility', 'reference/compatibility']
        ]
      ]
      // The API changelog is not repeated here: it lives once, under Changelog › API.
    ]
  ]
]

/** Every label key the sidebar reads, once each. */
export function labelKeys() {
  const keys = new Set()
  const walk = (nodes) => {
    for (const [kind, key, , rest] of nodes) {
      keys.add(key)
      if (kind === 'group') walk(rest)
    }
  }
  walk(TREE)
  return [...keys]
}

/**
 * The Starlight sidebar for these translations.
 * @param {Record<string, { lang: string, labels?: Record<string, string> }>} translations
 */
export function sidebar(translations) {
  const build = (nodes) =>
    nodes.map(([kind, key, label, rest]) =>
      kind === 'group'
        ? { label, items: build(rest), translations: labelsFor(translations, key) }
        : { label, slug: rest, translations: labelsFor(translations, key) }
    )
  return build(TREE)
}
