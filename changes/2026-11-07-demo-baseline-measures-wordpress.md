# Demo baseline and demo measures judged for WordPress

Ticket #456 (spec #452). The demo baseline check and the demo measures check of the template readiness verdict now judge
WordPress releases by the same rules as Joomla, and the commands that measure them work on a WordPress demo.

- `demo-measures.mjs` reads a WordPress contract's pages from its content map (parents resolved from the inventory, no
  `/index.php`) and its version from the manifest; `site-check-baseline.mjs --base` asks WordPress pages as they are.
- Touches preparers of WordPress quickstarts only; Joomla behaviour is unchanged.
