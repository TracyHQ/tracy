- **A chain build on WordPress gets past the home health check: the probe follows WordPress's redirect to its own address** — David (WO) · #760 · `fix/wo-wordpress-recovery-probe` · 2026-11-26
  **Affects:** the write step's site recovery probe (`probeSiteHome`) on every CMS, used before and after a chain build's write.
  - The probe follows a redirect at most three times, and only while it stays on the site's read or public origin.
  - A redirect that leaves the site stays `unknown`, as before.
  - Joomla and EmDash homes do not redirect, so their probe does not change.
  **Why:** the first JA Diner WordPress chain build on dev (`arabian-tea-wp1`, 26/11) stopped `SITE_RECOVERY_BASE_UNHEALTHY` with `before: {state: unknown, status: 301}` before its first write: WordPress answers its container origin with a canonical 301 to its public address.
