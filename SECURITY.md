# Security policy

## Reporting a vulnerability

Please **do not** open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability** (GitHub private vulnerability reporting). The report is visible only to the
maintainers, and we can work on a fix and an advisory together with you there. If you cannot use
GitHub, email [ceo@tracy.ai](mailto:ceo@tracy.ai) instead.

Please include:

- what is affected (component, path, or URL) and which version or commit;
- the steps to reproduce, or a proof of concept;
- the impact you expect (for example: reading another site's data, signing in as someone else).

We aim to acknowledge a report within three working days and to keep you informed until it is resolved.
Please give us a reasonable time to ship a fix before you disclose anything publicly; we will credit you in
the advisory unless you prefer otherwise.

## Scope

In scope: the code in this repository, including the apps in `apps/`, the plugins and tooling in
`packages/`, the deployment files in `deploy/`, and the desktop app.

Particularly important: anything that lets one site, seat or agent reach another site's files, database
or session, bypass sign-in, or run commands outside the site's own containers.

Out of scope: vulnerabilities in third-party projects under `vendor/` that are not caused by Tracy's
changes (please report those upstream), and reports that require an already compromised machine.
