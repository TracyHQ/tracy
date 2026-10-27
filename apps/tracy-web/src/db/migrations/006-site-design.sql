-- Which design a site was asked for, and which one it was actually built with.
--
-- Two columns and not one, because they answer two different questions and the answers diverge on
-- purpose: a customer picks an inspiration from a library of 152, and only a handful of those have
-- a Joomla template Tracy can serve today. The rest are built on the default design and told so.
-- Collapsing that into one column loses whichever half is asked for next — the agent needs to know
-- what the customer wanted so it never claims to have installed it, and every later check needs to
-- know what is actually on disk.
--
-- `design_profile` is the published contract profile the site is bound to (`tracy-airbnb/j6/1.0.0`).
-- It is the same string the provisioner wrote into the site's own Cowork parameters, kept here so a
-- later reader does not have to reach into the site to learn what it is held to.
--
-- Nullable throughout: every site created before this migration has no recorded design, and there
-- is no honest value to invent for one. A reader that finds null must say "not recorded", never
-- assume the default — a WordPress or EmDash site has no Joomla design at all.
alter table site add column requested_design text;
alter table site add column effective_design text;
alter table site add column design_profile text;
