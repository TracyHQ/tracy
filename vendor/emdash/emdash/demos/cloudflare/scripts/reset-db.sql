-- Reset content and schema, preserving users and auth.
-- After running this, redeploy and go through the setup wizard to re-seed.
--
-- Usage: npx wrangler d1 execute emdash-demo --remote --file=scripts/reset-db.sql
--
-- NOTE: D1 may not support IF EXISTS reliably. If a table doesn't exist,
-- the statement fails and D1 aborts. Use reset-db.sh instead, which
-- discovers existing tables dynamically.

-- Drop dynamic content tables
DROP TABLE IF EXISTS ec_posts;
DROP TABLE IF EXISTS ec_pages;

-- Drop FTS virtual tables
DROP TABLE IF EXISTS ec_posts_fts;
DROP TABLE IF EXISTS ec_pages_fts;

-- Drop emdash system tables (child tables before parents)
DROP TABLE IF EXISTS _emdash_entry_taxonomies;
DROP TABLE IF EXISTS _emdash_entries;
DROP TABLE IF EXISTS _emdash_revisions;
DROP TABLE IF EXISTS _emdash_seo;
DROP TABLE IF EXISTS _emdash_comments;
DROP TABLE IF EXISTS _emdash_fields;
DROP TABLE IF EXISTS _emdash_collections;
DROP TABLE IF EXISTS _emdash_taxonomy_terms;
DROP TABLE IF EXISTS _emdash_taxonomies;
DROP TABLE IF EXISTS _emdash_media;
DROP TABLE IF EXISTS _emdash_menu_items;
DROP TABLE IF EXISTS _emdash_menus;
DROP TABLE IF EXISTS _emdash_widgets;
DROP TABLE IF EXISTS _emdash_widget_areas;
DROP TABLE IF EXISTS _emdash_sections;
DROP TABLE IF EXISTS _emdash_redirects;
DROP TABLE IF EXISTS _emdash_404_log;
DROP TABLE IF EXISTS _emdash_plugins;
DROP TABLE IF EXISTS _emdash_cron_tasks;
DROP TABLE IF EXISTS _emdash_authorization_codes;
DROP TABLE IF EXISTS _emdash_oauth_tokens;
DROP TABLE IF EXISTS _emdash_device_codes;
DROP TABLE IF EXISTS _emdash_api_tokens;
DROP TABLE IF EXISTS _emdash_oauth_clients;

-- Clear options (setup flag etc.) so the setup wizard re-runs
DROP TABLE IF EXISTS options;

-- Drop migration tracking so migrations re-run
DROP TABLE IF EXISTS _emdash_migrations;
DROP TABLE IF EXISTS _emdash_migrations_lock;
DROP TABLE IF EXISTS d1_migrations;

-- Auth tables are intentionally preserved:
--   users, passkeys, sessions, login_tokens, invites, oauth_accounts
