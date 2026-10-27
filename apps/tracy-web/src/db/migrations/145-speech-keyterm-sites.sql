-- The keyterms pilot (council 19/10/2026, A1; `lib/speech-keyterms.js`): the sites whose voice
-- sessions hand the speech service the site's own names to listen for. Listed on /ops › Agents ›
-- Voice; empty by default, and an empty list is the pilot off everywhere. Site keys only: the names
-- themselves are read from the site's brief and admin log when a session opens, never stored here.
alter table speech_setting add column keyterm_sites text[] not null default '{}';
