-- Which of the template's quickstarts the waiting row means (plan tasks/todo-quickstart-desktop-only.md,
-- S3). The quickstart zip is now handed out inside Tracy Desktop only, so the web landing page no
-- longer consumes the row: it writes it, for the app to find after it is installed and signed in
-- as the same account. One JoomlArt id can carry a Joomla and a WordPress quickstart, and the page
-- the person came from may have named one (`/new?template=<id>&platform=<cms>`); the app's root
-- landing sends them to that same one. Null = unsaid, and the landing picks as it always did.
alter table desktop_intent add column platform text;
