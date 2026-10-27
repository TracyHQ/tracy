# Security Policy

## Supported versions

The project is **pre-release**. Until the first release, only the latest commit on `main` receives
security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/TracyHQ/website-opportunities/security/advisories/new)
form on this repository, with:

- what the problem is and where (file, endpoint, or plugin),
- how to reproduce it,
- what an attacker could do with it.

Only the maintainers can read these reports. We aim to acknowledge a report within three working days and to agree a disclosure date
with you. Please give us a reasonable time to fix the problem before you disclose it.

## Known risk classes

These are the areas where a bug is most likely to matter. Reports about them are especially welcome.

### 1. Server-side request forgery (SSRF) in crawlers

The app fetches URLs it did not choose: business websites, social links, menu files and images found
on the web or sent in by users. A malicious URL, redirect, or DNS answer could make the server reach
internal networks, cloud metadata endpoints, or local services.

What the code does today:

- `domain/url-guard.mjs` refuses private, loopback, link-local, carrier-grade NAT, documentation,
  multicast and reserved address ranges, and non-default ports.
- `domain/fetch-limited.mjs` checks every URL, limits response size and time, and re-checks each
  redirect instead of following it blindly.
- The pinned fetch checks the address the connection actually dials, so a DNS server that answers a
  public address first and a private one second (DNS rebinding) is refused.

A bypass of any of these is a vulnerability.

### 2. Untrusted research data reaching AI prompts

Text collected from websites, reviews and social pages can contain instructions aimed at an AI model
("ignore previous instructions ..."). That text flows into briefs, and a builder may hand a brief to
an AI agent that builds a site.

Research data is treated as **untrusted data all the way to the brief and the builder**. What a model
or agent may do is checked in the code that carries out its actions, not by filtering prompts. A path
where research text can change what a tool is allowed to do is a vulnerability.

### 3. Contribution poisoning in the shared research hub (planned)

When the shared hub accepts data from other users (planned), someone could submit false or harmful
data: a wrong website or phone number for a business, a malicious link, or many copies of the same
claim to look credible.

The planned defenses:

- A token identifies who sent the data, not whether it is true.
- Submissions go through *submit, check, accept, publish*; the hub decides what to publish and does
  not trust a sender's claimed confidence, "verified" flags, or timestamps.
- Identity fields (website, contact details) need stronger checks than descriptive fields.
- Many copies from the same source count as one piece of evidence.
- Images are uploaded through a checked endpoint (hash and format); nobody outside the hub writes to
  its storage directly.
- A token can be revoked and its submissions withdrawn; withdrawal recomputes the published data.
- Contributing data never runs code supplied by the contributor. Source plugins are code and are
  reviewed as code.

## Plugins are code

A data source or builder adapter you install runs with network access and with your API keys. Only
install plugins you trust, and review them as you would any dependency.
