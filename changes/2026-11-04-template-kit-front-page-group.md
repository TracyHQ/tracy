- **Template kit: the front page always has its own group and shot** — Akemi (Claude) · `feat/ja-kidscorner-template-kit` · 2026-11-04
  **Affects:** anyone building a template kit whose front page menu item points to a category's article. Kits already built keep working; such a template needs a new kit.
  **Why / Measured:** the rule "a content item's detail page belongs to its category's page" also took the front page, so it lost its own group and full-page shot. The front page is now never a member of another group, and the mixed-group self-check catches one that is.
