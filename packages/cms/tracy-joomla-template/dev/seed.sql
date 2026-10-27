-- Demo content for the local stand: one page of each kind of the content contract, a menu, and
-- tpl_tracy as the default style. Idempotent enough for a fresh volume; rerunning duplicates rows.
-- Table prefix is jos_ (JOOMLA_DB_PREFIX in compose.yml).

SET @user := (SELECT id FROM jos_users ORDER BY id LIMIT 1);
SET @com_content := (SELECT extension_id FROM jos_extensions WHERE type = 'component' AND element = 'com_content' LIMIT 1);

-- ---- tpl_tracy becomes the site default, wearing Brutalism ------------------------------------
UPDATE jos_template_styles SET home = '0' WHERE client_id = 0 AND home = '1';
UPDATE jos_template_styles
   SET home = '1', title = 'Tracy - Default',
       params = '{"inspiration":"brutalism","nav":"auto","hero":"auto"}'
 WHERE client_id = 0 AND template = 'tpl_tracy';

-- ---- a "Blog" category for the listing (nested set under the root category) ----------------------
SET @r := (SELECT rgt FROM jos_categories WHERE id = 1);
INSERT INTO jos_categories
  (asset_id, parent_id, lft, rgt, level, path, extension, title, alias, note, description, published,
   access, params, metadesc, metakey, metadata, created_user_id, created_time, modified_user_id, modified_time, hits, language, version)
VALUES
  (0, 1, @r, @r + 1, 1, 'blog', 'com_content', 'Blog', 'blog', '', '', 1,
   1, '{}', '', '', '{}', @user, NOW(), @user, NOW(), 0, '*', 1);
SET @blog_cat := LAST_INSERT_ID();
UPDATE jos_categories SET rgt = rgt + 2 WHERE id = 1;

-- ---- home: the engine's landing artifact (the preview's Landing chip), body filled by dev/seed.sh --------------------------------------------------------------------------------------
INSERT INTO jos_content
  (title, alias, introtext, `fulltext`, state, catid, created, created_by, created_by_alias, modified, publish_up,
   images, urls, attribs, metadesc, metadata, note, language, access, ordering, featured, version)
VALUES
  ('Home', 'home',
   '',
   '<p>Filled by dev/seed.sh with the chosen design system fixture</p>',
   1, 2, NOW(), @user, '', NOW(), NOW(),
   '{"image_intro":"","image_intro_alt":"","image_fulltext":"images/sampledata/cassiopeia/nasa1-1200.jpg","image_fulltext_alt":"Earth from orbit"}',
   '{}',
   '{"article_layout":"tpl_tracy:artifact","tracy_artifact":"landing","hero_eyebrow":"AI workstation for websites","hero_headline":"One desk for every site you run","hero_sub":"Tracy pairs an AI agent with each of your sites, armed with skills for WordPress, Joomla and Shopify.","hero_cta_label":"Download for macOS","hero_cta_url":"index.php?option=com_content&view=article&id=0","hero_cta2_label":"See pricing","hero_cta2_url":"index.php?option=com_content&view=article&id=0"}',
   '', '{}', '', '*', 1, 1, 0, 1);
SET @home := LAST_INSERT_ID();

-- ---- pricing ---------------------------------------------------------------------------------------
INSERT INTO jos_content
  (title, alias, introtext, `fulltext`, state, catid, created, created_by, created_by_alias, modified, publish_up,
   images, urls, attribs, metadesc, metadata, note, language, access, ordering, featured, version)
VALUES
  ('Pricing', 'pricing',
   '<table class="tracy-pricing" data-hot="1"><thead><tr><th></th><th>Starter<small>$29 / month</small></th><th>Team<small>$99 / month</small></th><th>Agency<small>$299 / month</small></th></tr></thead><tbody><tr><th>Sites</th><td>1</td><td>10</td><td>Unlimited</td></tr><tr><th>Agents</th><td>1</td><td>5</td><td>Unlimited</td></tr><tr><th>Review before publish</th><td>Yes</td><td>Yes</td><td>Yes</td></tr><tr><th>Support</th><td>Email</td><td>Priority</td><td>Dedicated</td></tr></tbody></table>',
   '',
   1, 2, NOW(), @user, '', NOW(), NOW(),
   '{}', '{}', '{"article_layout":"tpl_tracy:pricing"}', '', '{}', '', '*', 1, 2, 0, 1);
SET @pricing := LAST_INSERT_ID();

-- ---- design: the design system's own fixture (the preview's Home chip), body filled by dev/seed.sh --
INSERT INTO jos_content
  (title, alias, introtext, `fulltext`, state, catid, created, created_by, created_by_alias, modified, publish_up,
   images, urls, attribs, metadesc, metadata, note, language, access, ordering, featured, version)
VALUES
  ('Design', 'design', '', '<p>Filled by dev/seed.sh with the design system fixture</p>', 1, 2, NOW(), @user, '', NOW(), NOW(),
   '{}', '{}', '{"article_layout":"tpl_tracy:fixture"}', '', '{}', '', '*', 1, 5, 0, 1);
SET @design := LAST_INSERT_ID();

-- ---- sections: the section library end to end (sections/landing.html), body filled by dev/seed.sh --
INSERT INTO jos_content
  (title, alias, introtext, `fulltext`, state, catid, created, created_by, created_by_alias, modified, publish_up,
   images, urls, attribs, metadesc, metadata, note, language, access, ordering, featured, version)
VALUES
  ('Sections', 'sections', '', '<p>Filled by dev/seed.sh with the section library</p>', 1, 2, NOW(), @user, '', NOW(), NOW(),
   '{}', '{}', '{"article_layout":"tpl_tracy:landing"}', '', '{}', '', '*', 1, 6, 0, 1);
SET @sections := LAST_INSERT_ID();

-- ---- style guide and contact: bodies are filled by dev/seed.sh from the section library --------
INSERT INTO jos_content
  (title, alias, introtext, `fulltext`, state, catid, created, created_by, created_by_alias, modified, publish_up,
   images, urls, attribs, metadesc, metadata, note, language, access, ordering, featured, version)
VALUES
  ('Style guide', 'style-guide', '', '<p>Filled by dev/seed.sh</p>', 1, 2, NOW(), @user, '', NOW(), NOW(),
   '{}', '{}', '{"article_layout":"tpl_tracy:page"}', '', '{}', '', '*', 1, 3, 0, 1),
  ('Contact', 'contact', '', '<p>Filled by dev/seed.sh</p>', 1, 2, NOW(), @user, '', NOW(), NOW(),
   '{}', '{}', '{"article_layout":"tpl_tracy:page"}', '', '{}', '', '*', 1, 4, 0, 1);
SET @styleguide := (SELECT id FROM jos_content WHERE alias = 'style-guide' LIMIT 1);
SET @contact := (SELECT id FROM jos_content WHERE alias = 'contact' LIMIT 1);

-- the two hero buttons point at real pages now that their ids exist
UPDATE jos_content
   SET attribs = REPLACE(attribs, '"hero_cta_url":"index.php?option=com_content&view=article&id=0"',
                                  CONCAT('"hero_cta_url":"index.php?option=com_content&view=category&layout=blog&id=', @blog_cat, '"'))
 WHERE id = @home;
UPDATE jos_content
   SET attribs = REPLACE(attribs, '"hero_cta2_url":"index.php?option=com_content&view=article&id=0"',
                                  CONCAT('"hero_cta2_url":"index.php?option=com_content&view=article&id=', @pricing, '"'))
 WHERE id = @home;

-- ---- three listing items (the first doubles as the article page) ----------------------------------
INSERT INTO jos_content
  (title, alias, introtext, `fulltext`, state, catid, created, created_by, created_by_alias, modified, publish_up,
   images, urls, attribs, metadesc, metadata, note, language, access, ordering, featured, version)
VALUES
  ('WordPress skills, explained', 'wordpress-skills',
   '<p>What an agent can and cannot touch on a WordPress site, and how every change is held for review.</p>',
   '<p>Skills are bounded actions: install a plugin, edit a post, put a file in the media library. Nothing else.</p><p>Each change is recorded under an apply id, so one call puts a whole deliverable back.</p>',
   1, @blog_cat, NOW(), @user, 'Tracy team', NOW(), NOW(),
   '{"image_intro":"images/sampledata/cassiopeia/nasa2-640.jpg","image_intro_alt":"Nebula","image_fulltext":"images/sampledata/cassiopeia/nasa2-1200.jpg","image_fulltext_alt":"Nebula"}',
   '{}', '{}', '', '{}', '', '*', 1, 1, 0, 1),
  ('Joomla on the fleet', 'joomla-on-the-fleet',
   '<p>A fresh Joomla in ninety seconds, with the template already wearing your design system.</p>',
   '<p>Provisioning installs the template as an extension and sets the style before the first request.</p>',
   1, @blog_cat, DATE_SUB(NOW(), INTERVAL 1 DAY), @user, 'Tracy team', NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY),
   '{"image_intro":"images/sampledata/cassiopeia/nasa3-640.jpg","image_intro_alt":"Galaxy","image_fulltext":"images/sampledata/cassiopeia/nasa3-1200.jpg","image_fulltext_alt":"Galaxy"}',
   '{}', '{}', '', '{}', '', '*', 1, 2, 0, 1),
  ('Shopify, coming next', 'shopify-coming-next',
   '<p>The same bounded endpoint, on a platform that has no files to walk.</p>',
   '<p>Every action is named. There is no shell, no arbitrary write.</p>',
   1, @blog_cat, DATE_SUB(NOW(), INTERVAL 2 DAY), @user, 'Tracy team', NOW(), DATE_SUB(NOW(), INTERVAL 2 DAY),
   '{"image_intro":"images/sampledata/cassiopeia/nasa4-400.jpg","image_intro_alt":"Sun","image_fulltext":"images/sampledata/cassiopeia/nasa4-1200.jpg","image_fulltext_alt":"Sun"}',
   '{}', '{}', '', '{}', '', '*', 1, 3, 0, 1);

-- ---- menu: Home points at the home article; its attribs pick the layout (fixture). The rest appended --
UPDATE jos_menu
   SET link = CONCAT('index.php?option=com_content&view=article&id=', @home),
       component_id = @com_content, params = '{}'
 WHERE id = 101;

-- Order (lft): Home · Design · Sections · Blog · Pricing · Style guide · Contact — the same as
-- the WordPress stand's navigation, so the two can be compared page for page.
SET @r := (SELECT rgt FROM jos_menu WHERE id = 1);
INSERT INTO jos_menu
  (menutype, title, alias, note, path, link, type, published, parent_id, level, component_id, browserNav, access, img, template_style_id, params, lft, rgt, home, language, client_id)
VALUES
  ('mainmenu', 'Design', 'design', '', 'design',
   CONCAT('index.php?option=com_content&view=article&id=', @design), 'component', 1, 1, 1, @com_content, 0, 1, '', 0,
   '{}', @r, @r + 1, 0, '*', 0);
UPDATE jos_menu SET rgt = rgt + 2 WHERE id = 1;

SET @r := (SELECT rgt FROM jos_menu WHERE id = 1);
INSERT INTO jos_menu
  (menutype, title, alias, note, path, link, type, published, parent_id, level, component_id, browserNav, access, img, template_style_id, params, lft, rgt, home, language, client_id)
VALUES
  ('mainmenu', 'Sections', 'sections', '', 'sections',
   CONCAT('index.php?option=com_content&view=article&id=', @sections), 'component', 1, 1, 1, @com_content, 0, 1, '', 0,
   '{}', @r, @r + 1, 0, '*', 0);
UPDATE jos_menu SET rgt = rgt + 2 WHERE id = 1;

SET @r := (SELECT rgt FROM jos_menu WHERE id = 1);
INSERT INTO jos_menu
  (menutype, title, alias, note, path, link, type, published, parent_id, level, component_id, browserNav, access, img, template_style_id, params, lft, rgt, home, language, client_id)
VALUES
  ('mainmenu', 'Blog', 'blog', '', 'blog',
   CONCAT('index.php?option=com_content&view=category&layout=blog&id=', @blog_cat), 'component', 1, 1, 1, @com_content, 0, 1, '', 0,
   '{"num_leading_articles":"0","num_intro_articles":"6","num_columns":"3","show_page_heading":"0","show_description":"1","show_no_articles":"1","show_pagination":"2"}',
   @r, @r + 1, 0, '*', 0);
UPDATE jos_menu SET rgt = rgt + 2 WHERE id = 1;

SET @r := (SELECT rgt FROM jos_menu WHERE id = 1);
INSERT INTO jos_menu
  (menutype, title, alias, note, path, link, type, published, parent_id, level, component_id, browserNav, access, img, template_style_id, params, lft, rgt, home, language, client_id)
VALUES
  ('mainmenu', 'Pricing', 'pricing', '', 'pricing',
   CONCAT('index.php?option=com_content&view=article&id=', @pricing), 'component', 1, 1, 1, @com_content, 0, 1, '', 0,
   '{}', @r, @r + 1, 0, '*', 0);
UPDATE jos_menu SET rgt = rgt + 2 WHERE id = 1;

SET @r := (SELECT rgt FROM jos_menu WHERE id = 1);
INSERT INTO jos_menu
  (menutype, title, alias, note, path, link, type, published, parent_id, level, component_id, browserNav, access, img, template_style_id, params, lft, rgt, home, language, client_id)
VALUES
  ('mainmenu', 'Style guide', 'style-guide', '', 'style-guide',
   CONCAT('index.php?option=com_content&view=article&id=', @styleguide), 'component', 1, 1, 1, @com_content, 0, 1, '', 0,
   '{}', @r, @r + 1, 0, '*', 0);
UPDATE jos_menu SET rgt = rgt + 2 WHERE id = 1;

SET @r := (SELECT rgt FROM jos_menu WHERE id = 1);
INSERT INTO jos_menu
  (menutype, title, alias, note, path, link, type, published, parent_id, level, component_id, browserNav, access, img, template_style_id, params, lft, rgt, home, language, client_id)
VALUES
  ('mainmenu', 'Contact', 'contact', '', 'contact',
   CONCAT('index.php?option=com_content&view=article&id=', @contact), 'component', 1, 1, 1, @com_content, 0, 1, '', 0,
   '{}', @r, @r + 1, 0, '*', 0);
UPDATE jos_menu SET rgt = rgt + 2 WHERE id = 1;

-- ---- the menu module in position nav, on every page ------------------------------------------------
INSERT INTO jos_modules
  (asset_id, title, note, content, ordering, position, published, module, access, showtitle, params, client_id, language, publish_up, publish_down)
VALUES
  (0, 'Main menu', '', '', 1, 'nav', 1, 'mod_menu', 1, 0, '{"menutype":"mainmenu","layout":"_:default","showAllChildren":"0"}', 0, '*', NULL, NULL);
INSERT INTO jos_modules_menu (moduleid, menuid) VALUES (LAST_INSERT_ID(), 0);

SELECT @home AS home_id, @pricing AS pricing_id, @blog_cat AS blog_category_id;
