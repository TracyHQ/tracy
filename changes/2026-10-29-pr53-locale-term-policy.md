- **Approve the corrected locale artifact for PR #53's CI follow-up** — Codex · `chore/pr53-corrected-locale-policy` · 2026-10-29

  **Affects:** the trusted language policy for the existing PR #53 prerequisite line authorized by Vincent. One exact object is added for the language bundle after its Italian, Spanish and Chinese setup strings were corrected to retain the required `site` term. The validator, matching rules and previous approvals stay unchanged.

  **Verified:** the locale builder reproduces the artifact from the corrected JSON, the kept-terms gate and its eight tests pass, and the extended setup/catalogue regression passes. This prerequisite must reach develop before PR #53's regenerated bundle can pass the trusted-base check.
