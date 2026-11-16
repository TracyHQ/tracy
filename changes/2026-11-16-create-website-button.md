# Create a website button in the left column

The creation workspace (`/new/`, a person with no site yet) now shows a primary "Create a website"
button above "New session" in the left column. It opens the build chat at `/new/build`.

- Shown only in the creation workspace and only while the `chat-build` operator switch is on.
- Collapsed rail: icon only, with an accessible name.
- New string `site.create` in the `tracy-sidebar` namespace, with translations for every interface language.
- Rebuilds `@tracy/dsh-sidebar` (`lib/client.js`): the dsh image must be rebuilt to ship it.

Affects: people with no site yet.
