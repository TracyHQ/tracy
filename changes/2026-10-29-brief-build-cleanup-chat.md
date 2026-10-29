- **The leftover cleanup turn gets a chat the seat door allocates** — Akemi (Claude) · #189 · `feat/brief-build-own-site` · 2026-10-29
  **Affects:** every brief build whose leftover check still finds demo content: the bounded cleanup turn now runs. It asks for its own chat as `wo-demo-<uuid>` derived from the build id (the only shape the seat door allocates), apart from the hand-off chat.
  **Why / Measured:** the turn asked for `wo-cleanup-<build id>`, which the seat door refuses ("invalid session allocation request"), so every build ended with CLEANUP_SESSION_FAILED and the turn never ran.
