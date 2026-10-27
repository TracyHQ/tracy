// Fixtures — fake data with the right shape for every view. UI-only, no network calls.

export type Platform = 'joomla' | 'wordpress' | 'shopify'

export interface Site {
  key: string
  name: string
  platform: Platform
  role: 'owner' | 'editor' | 'viewer'
  /** sites belong to the workspace the user is assigned to — switching workspace switches the site set */
  workspaceId: string
  liveUrl: string
  previewUrl: string
  adminUrl: string
}

export const sites: Site[] = [
  {
    key: 'joomlart.com',
    name: 'joomlart.com',
    platform: 'joomla',
    role: 'owner',
    workspaceId: 'w1',
    liveUrl: 'https://joomlart.com/',
    previewUrl: 'https://joomlart-com-0871462c.tracy.ai/',
    adminUrl: 'https://joomlart.com/administrator/'
  },
  {
    key: 'tracy.ai',
    name: 'tracy.ai',
    platform: 'wordpress',
    role: 'editor',
    workspaceId: 'w1',
    liveUrl: 'https://tracy.ai/',
    previewUrl: 'https://tracy-ai-8836f920.tracy.ai/',
    adminUrl: 'https://tracy.ai/wp-admin/'
  },
  {
    key: 'shop.acme.com',
    name: 'shop.acme.com',
    platform: 'shopify',
    role: 'editor',
    workspaceId: 'w1',
    liveUrl: 'https://shop.acme.com/',
    previewUrl: 'https://shop-acme-11aa22bb.tracy.ai/',
    adminUrl: 'https://acme.myshopify.com/admin'
  },
  {
    key: 'leeblog.dev',
    name: 'leeblog.dev',
    platform: 'wordpress',
    role: 'owner',
    workspaceId: 'w2',
    liveUrl: 'https://leeblog.dev/',
    previewUrl: 'https://leeblog-dev-33cc44dd.tracy.ai/',
    adminUrl: 'https://leeblog.dev/wp-admin/'
  },
  {
    key: 'demo.client.io',
    name: 'demo.client.io',
    platform: 'joomla',
    role: 'viewer',
    workspaceId: 'w3',
    liveUrl: 'https://demo.client.io/',
    previewUrl: 'https://demo-client-55ee66ff.tracy.ai/',
    adminUrl: 'https://demo.client.io/administrator/'
  }
]

export const sitesInWorkspace = (workspaceId: string) => sites.filter((s) => s.workspaceId === workspaceId)

export interface ChangedFile {
  path: string
  status: 'M' | 'A' | 'D'
  additions?: number
  deletions?: number
}

export const changeGroups: { group: string; files: ChangedFile[] }[] = [
  {
    group: 'Core',
    files: [
      {
        path: 'administrator/manifests/packages/pkg_claudecowork.xml',
        status: 'M',
        additions: 2,
        deletions: 1
      },
      { path: 'webroot/configuration.php', status: 'M', additions: 14, deletions: 14 },
      { path: 'webroot/tracy-changed.json', status: 'M', additions: 1, deletions: 1 }
    ]
  },
  {
    group: 'Design',
    files: [
      { path: 'webroot/templates/ja_v5/css/custom.css', status: 'M', additions: 31, deletions: 32 },
      { path: 'webroot/templates/ja_v5/tpls/blocks/head.php', status: 'M', additions: 2, deletions: 4 }
    ]
  },
  {
    group: 'Add-ons',
    files: [
      {
        path: 'administrator/components/com_claudecowork/claudecowork.xml',
        status: 'M',
        additions: 1,
        deletions: 1
      },
      {
        path: 'administrator/components/com_claudecowork/lib/Engine.php',
        status: 'M',
        additions: 173,
        deletions: 3
      },
      { path: 'administrator/components/com_claudecowork/lib/RowSource.php', status: 'A', additions: 13 }
    ]
  },
  {
    group: 'Content',
    files: [{ path: 'images/home/masthead-hero.webp', status: 'A', additions: 0 }]
  }
]

export interface Release {
  version: number
  sha: string
  ago: string
  title: string
  author: string
}

export const releases: Release[] = [
  { version: 4, sha: 'f9c21ab', ago: '2 hours ago', title: 'Masthead tagline rewrite', author: 'Tracy' },
  { version: 3, sha: 'a17d930', ago: 'yesterday', title: 'Footer wrap fix at 1100px', author: 'Tracy' },
  { version: 2, sha: '8b40c1e', ago: '3 days ago', title: 'New pricing table', author: 'Tracy' },
  { version: 1, sha: '2f91d05', ago: 'last week', title: 'First checkpoint', author: 'Tracy' }
]

export interface Task {
  id: string
  title: string
  pinned?: boolean
  pending?: boolean
}

export const tasks: Task[] = [
  { id: 't1', title: 'Joomla Tagline Rewrite Suggestions', pinned: true },
  { id: 't2', title: 'Homepage SEO check', pending: true },
  { id: 't3', title: 'Pick a look for the blog section' },
  { id: 't4', title: 'Broken links scan' }
]

export interface Message {
  id: string
  role: 'user' | 'agent'
  text: string
  /** file chips attached to the agent's answer */
  files?: { name: string; note: string }[]
}

export const messages: Message[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'The big headline in the masthead reads stale. Rewrite it — keep it short.'
  },
  {
    id: 'm2',
    role: 'agent',
    text: 'Checked it on the page directly — the masthead headline now shows:\n\n“Everything Joomla, beautifully done.”\n\nThe edit lives in module [Home] Masthead (mod_custom, id 365), field content — database data, so it went through Apply, no template file touched. The description, CTA button and image below stay as they were; only the h1 line changed.',
    files: [
      { name: 'resp-480.png', note: 'hamburger band OK' },
      { name: 'resp-390.png', note: 'mobile OK' },
      { name: 'resp-375.png', note: 'OK' }
    ]
  },
  {
    id: 'm3',
    role: 'agent',
    text: 'Since this was an Apply, the same step also runs on the live site once you approve. Want me to push it live now, or keep looking at it on Preview first? If you need to take it back, I can revert to the old line in one step.'
  }
]

export const skills = [
  {
    name: 'Joomla content editor',
    origin: "This site's own",
    version: '1.4.0',
    updated: 'Updated 2 days ago'
  },
  { name: 'SEO audit', origin: 'From your workspace', version: '2.1.0', updated: 'Updated last week' },
  {
    name: 'WooCommerce catalog',
    origin: 'From your workspace',
    version: '0.9.2',
    updated: 'Update available'
  }
]

export const mcpServers = [
  {
    name: 'tracy-registry',
    description: 'Site registry and seats — built in.',
    status: 'Connected',
    builtIn: true
  },
  {
    name: 'playwright',
    description: 'Drives a browser for checks and screenshots.',
    status: 'Connected',
    builtIn: false
  },
  {
    name: 'search-console',
    description: 'Google Search Console queries.',
    status: 'Needs re-connect',
    builtIn: false
  }
]

export const currentUser = {
  name: 'Lee',
  email: 'patowner@example.com'
}

export interface Workspace {
  id: string
  name: string
  hint: string
}

export const workspaces: Workspace[] = [
  { id: 'w1', name: 'JoomlArt', hint: 'Team · 5 members' },
  { id: 'w2', name: "Lee's workspace", hint: 'Personal' },
  { id: 'w3', name: 'Client sandbox', hint: 'Team · 2 members' }
]
