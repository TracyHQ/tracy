# Write step and site check: faults a visitor sees

The site check now opens only the pages the plan keeps, named on the write report. It reads text held by a div, no longer counts
link addresses as the customer's words, ignores visually hidden headings for overflow, and adds three measures: unusable buttons
and form fields, words glued to a highlight, and headings that stop halfway. The demo baseline must be measured again.

The write step empties a field the kit calls unprinted when no file fills it, removes a placeholder address when the plan hides
its link's words, keeps the space a template sets beside a highlight, and closes a contact form the plan hides.

The Joomla plugin's review lists a contact's `email_to` and a form field's hint as emptiable, in `feat/hide-ops`.

Touches: anyone reading site check results or running `site-check-baseline.mjs`; old baselines read fewer texts.
