---
description: Draft licence text for JoomlArt templates received through Tracy (free) — Brian approves it before it shows on the landing page and before the word "Free" goes up on joomlart.com. Not inserted into the zip (the hash must match the release).
sources:
  - tasks/todo-tai-joomlart-qua-tracy.md
---

# Licence for JoomlArt templates received through Tracy — DRAFT, awaiting Brian's approval

**Status:** draft of 10/10/2026, not approved. Until it is approved the landing page (`templateLandingPage`) shows no
licence link and the Download button returns only the release's original file. This text is **never** inserted
into the zip: the zip must keep its bytes so the hash matches the release's `SHA256SUMS` (council 10/10).

## Why a separate text is needed

- JoomlArt has published: the PHP part is under GPLv2, images/CSS/JS under its own licence unless stated otherwise
  (the [licenses](https://www.joomlart.com/joomlart/licenses) page). For the GPL part, no condition can be added
  forbidding recipients from redistributing — the text below does not try to.
- "Free through Tracy" grants rights over the parts JoomlArt **has the right to grant**: demo images, CSS/JS, quickstart
  content, updates, support. What third parties hold the copyright to (stock images, fonts, icons) can only be named
  once F1 (a licence audit of each quickstart, done by Brian) is finished for that template.

## The English version (shown to customers — a public surface, in English)

> **JoomlArt template licence — free through Tracy**
>
> You received this template package (`<name>`, version `<version>`) through Tracy, signed in with
> your JoomlArt account. JoomlArt grants you, free of charge, the right to:
>
> 1. install and use it on any number of websites you own or build for others;
> 2. modify its files, including the CSS, JavaScript, images and demo content JoomlArt owns;
> 3. keep every site you build with it, and move that site to any hosting, whether or not you keep
>    using Tracy.
>
> What this licence does not grant:
>
> - repackaging the template, its demo content or its images as a template product of your own, or
>   redistributing the package as a download to people who did not receive it through Tracy or the
>   JoomlArt member area;
> - using the JoomlArt or Tracy names or logos to present a modified copy as an official release;
> - removing or hiding the copyright notices in the package.
>
> The PHP in this package is licensed under the GNU GPL v2 as Joomla's licensing policy requires;
> nothing above narrows the rights the GPL gives you over that part. Third-party assets named in
> `THIRD-PARTY.txt` of the package keep their own licences.
>
> Updates and support for this template are provided through Tracy and the JoomlArt member area.
> Provided "as is", without warranty, to the extent the law allows.

The `<name>`/`<version>` fields are filled from the release (`tracy_setting.json`: `label`, `version`).

## The Vietnamese version (internal reference, not shown to customers)

A summary of the three rights: use on unlimited sites; modify freely, including JoomlArt's images/CSS/JS; the sites made
belong to the customer and can be taken anywhere. Three things not granted: repackaging as a template product for
distribution; using the JoomlArt or Tracy name/logo for a modified copy; removing copyright notices. The PHP stays GPLv2.

## Still open

- [ ] Brian approves the English version (the words "repackaging" and "redistributing" are the main boundary — should it be
      stricter or looser?).
- [ ] F1: a table of third-party asset licences per quickstart → generate `THIRD-PARTY.txt` in the
      release (`ja-products`), not inserted into the existing zip.
- [ ] Once approved: the landing page adds a "Licence" link to `/docs/licence/joomlart-template` (a new
      server-rendered page) and door B7 additionally returns a separate `LICENSE.txt` (not inside the zip).
