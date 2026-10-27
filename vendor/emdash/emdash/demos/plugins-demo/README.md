# EmDash Plugins Demo

This demo showcases EmDash's plugin system with plugins that demonstrate the hook architecture.

## Plugins Included

### 1. Audit Log Plugin (`@emdash-cms/plugin-audit-log`)

Tracks all content changes for compliance.

- **Hooks:**
  - `content:beforeSave` (priority 1) - captures "before" state
  - `content:afterSave` (priority 200) - logs final state
  - `content:beforeDelete` (priority 200) - logs deletions
  - `media:afterUpload` (priority 200) - logs uploads
- **Features:**
  - Create/update/delete tracking
  - Before/after state comparison
  - Admin history page

### 2. Webhook Notifier Plugin (`@emdash-cms/plugin-webhook-notifier`)

Posts JSON payloads to external webhook URLs on content/media events.

- **Hooks:** `content:afterSave`, `content:afterDelete`, `media:afterUpload` (priority 210)
- **Features:**
  - Retry with exponential backoff
  - Admin-configurable settings (URL, secret token)
  - SSRF protection
  - Delivery tracking

### 3. Embeds Plugin (`@emdash-cms/plugin-embeds`)

Provides Portable Text block types for embedding external content.

- **Features:**
  - YouTube, Vimeo, Twitter/X, Bluesky, Mastodon embeds
  - Link previews (Open Graph)
  - GitHub Gist embeds

### 4. API Test Plugin (`@emdash-cms/plugin-api-test`)

Exercises all v2 plugin APIs for testing.

- **Features:**
  - Routes for each plugin API (kv, storage, content, media, http)
  - Combined `test/all` route

## Running the Demo

```bash
# Install dependencies
pnpm install

# Seed sample content
pnpm seed

# Start development server
pnpm dev

# Open browser
open http://localhost:4321
```

## Testing Plugin Hooks

1. Open the admin at `http://localhost:4321/_emdash/admin`
2. Create a new post with a title like "Hello World! Testing Plugins"
3. Watch the console output to see hooks executing:
   - `[audit-log] + create content/posts/post-xxx`
