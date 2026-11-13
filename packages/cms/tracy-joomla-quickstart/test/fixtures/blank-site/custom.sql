/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;

DROP TABLE IF EXISTS `#__acym_configuration`;
CREATE TABLE IF NOT EXISTS `#__acym_configuration` (
  `name` varchar(255) NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

LOCK TABLES `#__acym_configuration` WRITE;
/*!40000 ALTER TABLE `#__acym_configuration` DISABLE KEYS */;
INSERT INTO `#__acym_configuration` (`name`, `value`) VALUES 
('cron_frequency','900')
,('security_key','invented0security0key0value')
,('smtp_password','')
,('uploadfolder','media/com_acym/upload/');
/*!40000 ALTER TABLE `#__acym_configuration` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `#__acym_user`;
CREATE TABLE IF NOT EXISTS `#__acym_user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `cms_id` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__acym_user` (`id`, `email`, `cms_id`) VALUES 
(1,'reader@example.test',42);

DROP TABLE IF EXISTS `#__assets`;
CREATE TABLE IF NOT EXISTS `#__assets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `parent_id` int(11) NOT NULL DEFAULT 0,
  `lft` int(11) NOT NULL DEFAULT 0,
  `rgt` int(11) NOT NULL DEFAULT 0,
  `level` int(10) unsigned NOT NULL,
  `name` varchar(50) NOT NULL,
  `title` varchar(100) NOT NULL,
  `rules` varchar(5120) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__assets` (`id`, `parent_id`, `lft`, `rgt`, `level`, `name`, `title`, `rules`) VALUES 
(1,0,0,40,0,'root.1','Root Asset','{}')
,(8,1,10,19,1,'com_content','com_content','{}')
,(18,1,20,25,1,'com_modules','com_modules','{}')
,(30,8,11,12,2,'com_content.category.2','Uncategorised','{}')
,(31,8,13,18,2,'com_content.category.8','Bakery News','{}')
,(40,31,14,15,3,'com_content.article.1','Fresh Rye Every Morning','{}')
,(41,31,16,17,3,'com_content.article.2','Meet The Bakers','{}')
,(50,18,21,22,2,'com_modules.module.90','Hero','{}')
,(51,18,23,24,2,'com_modules.module.91','Footer Copy','{}');

DROP TABLE IF EXISTS `#__categories`;
CREATE TABLE IF NOT EXISTS `#__categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asset_id` int(10) unsigned NOT NULL DEFAULT 0,
  `parent_id` int(10) unsigned NOT NULL DEFAULT 0,
  `extension` varchar(50) NOT NULL DEFAULT '',
  `title` varchar(255) NOT NULL,
  `alias` varchar(400) NOT NULL DEFAULT '',
  `published` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__categories` (`id`, `asset_id`, `parent_id`, `extension`, `title`, `alias`, `published`) VALUES 
(1,0,0,'system','ROOT','root',1)
,(2,30,1,'com_content','Uncategorised','uncategorised',1)
,(4,0,1,'com_contact','Uncategorised','uncategorised',1)
,(8,31,1,'com_content','Bakery News','bakery-news',1);

DROP TABLE IF EXISTS `#__contact_details`;
CREATE TABLE IF NOT EXISTS `#__contact_details` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `telephone` varchar(255) DEFAULT NULL,
  `catid` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__contact_details` (`id`, `name`, `telephone`, `catid`) VALUES 
(1,'Harbor Lantern Bakery','(000) 555-0199',4);

DROP TABLE IF EXISTS `#__content`;
CREATE TABLE IF NOT EXISTS `#__content` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int(10) unsigned NOT NULL DEFAULT 0,
  `title` varchar(255) NOT NULL,
  `introtext` mediumtext NOT NULL,
  `catid` int(10) unsigned NOT NULL DEFAULT 0,
  `attribs` varchar(5120) NOT NULL,
  `created_by` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__content` (`id`, `asset_id`, `title`, `introtext`, `catid`, `attribs`, `created_by`) VALUES 
(1,40,'Fresh Rye Every Morning','<p>Our ovens start at four, and the rye is ready by six.</p>\r\n<p>It\'s worth the walk.</p>',8,'{\"show_title\":\"\"}',42)
,(2,41,'Meet The Bakers','<p>Three bakers, one starter, \"no shortcuts\".</p>',8,'{}',43);

DROP TABLE IF EXISTS `#__content_frontpage`;
CREATE TABLE IF NOT EXISTS `#__content_frontpage` (
  `content_id` int(11) NOT NULL DEFAULT 0,
  `ordering` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`content_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__content_frontpage` (`content_id`, `ordering`) VALUES 
(1,1);

DROP TABLE IF EXISTS `#__contentitem_tag_map`;
CREATE TABLE IF NOT EXISTS `#__contentitem_tag_map` (
  `type_alias` varchar(255) NOT NULL DEFAULT '',
  `core_content_id` int(10) unsigned NOT NULL,
  `content_item_id` int(11) NOT NULL,
  `tag_id` int(10) unsigned NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__contentitem_tag_map` (`type_alias`, `core_content_id`, `content_item_id`, `tag_id`) VALUES 
('com_content.article',1,1,2);

DROP TABLE IF EXISTS `#__extensions`;
CREATE TABLE IF NOT EXISTS `#__extensions` (
  `extension_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` varchar(20) NOT NULL,
  `element` varchar(100) NOT NULL,
  `folder` varchar(100) NOT NULL,
  `client_id` tinyint(3) NOT NULL,
  `params` text NOT NULL,
  PRIMARY KEY (`extension_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__extensions` (`extension_id`, `name`, `type`, `element`, `folder`, `client_id`, `params`) VALUES 
(10,'plg_authentication_ldap','plugin','ldap','authentication',0,'{\"host\":\"\",\"port\":\"389\",\"username\":\"directory-reader\",\"password\":\"invented-directory-pass\",\"ldap_uid\":\"uid\"}')
,(11,'plg_system_mapblock','plugin','mapblock','system',0,'{\"api_key\":\"invented-map-key-000\",\"zoom\":\"12\",\"link\":\"https:\\/\\/maps.example.test\\/\"}')
,(12,'com_users','component','com_users','',1,'{\"allowUserRegistration\":\"1\",\"sendpassword\":\"0\",\"new_usertype\":\"2\"}')
,(13,'ja_bakery','template','ja_bakery','',0,'{}');

DROP TABLE IF EXISTS `#__menu`;
CREATE TABLE IF NOT EXISTS `#__menu` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `menutype` varchar(24) NOT NULL,
  `title` varchar(255) NOT NULL,
  `link` varchar(1024) NOT NULL,
  `parent_id` int(10) unsigned NOT NULL DEFAULT 1,
  `lft` int(11) NOT NULL DEFAULT 0,
  `rgt` int(11) NOT NULL DEFAULT 0,
  `home` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `client_id` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__menu` (`id`, `menutype`, `title`, `link`, `parent_id`, `lft`, `rgt`, `home`, `client_id`) VALUES 
(1,'','Menu_Item_Root','',0,0,15,0,0)
,(2,'main','com_banners','index.php?option=com_banners',1,1,2,0,1)
,(101,'mainmenu','Home','index.php?option=com_content&view=featured',1,3,4,1,0)
,(102,'mainmenu','News','index.php?option=com_content&view=category&id=8',1,5,8,0,0)
,(103,'mainmenu','Rye','index.php?option=com_content&view=article&id=1',102,6,7,0,0)
,(104,'footer','Contact','index.php?option=com_contact&view=contact&id=1',1,9,10,0,0);

DROP TABLE IF EXISTS `#__menu_types`;
CREATE TABLE IF NOT EXISTS `#__menu_types` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `menutype` varchar(24) NOT NULL,
  `title` varchar(48) NOT NULL,
  `client_id` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__menu_types` (`id`, `menutype`, `title`, `client_id`) VALUES 
(1,'mainmenu','Main Menu',0)
,(2,'footer','Footer',0);

DROP TABLE IF EXISTS `#__modules`;
CREATE TABLE IF NOT EXISTS `#__modules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asset_id` int(10) unsigned NOT NULL DEFAULT 0,
  `title` varchar(100) NOT NULL DEFAULT '',
  `position` varchar(50) NOT NULL DEFAULT '',
  `published` tinyint(1) NOT NULL DEFAULT 0,
  `module` varchar(50) DEFAULT NULL,
  `params` text NOT NULL,
  `client_id` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__modules` (`id`, `asset_id`, `title`, `position`, `published`, `module`, `params`, `client_id`) VALUES 
(3,0,'Popular Articles','cpanel',1,'mod_popular','{}',1)
,(90,50,'Hero','hero',1,'mod_ja_acm','{\"jatools-config\":\"{\\\":type\\\":\\\"ja_bakery:hero\\\",\\\"hero\\\":{\\\"title\\\":[\\\"Bread, slowly\\\"]}}\",\"bg-color\":\"dark\"}',0)
,(91,51,'Footer Copy','copyright',1,'mod_footer','{}',0)
,(92,0,'Old Banner','section-1',-2,'mod_custom','{}',0);

DROP TABLE IF EXISTS `#__modules_menu`;
CREATE TABLE IF NOT EXISTS `#__modules_menu` (
  `moduleid` int(11) NOT NULL DEFAULT 0,
  `menuid` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`moduleid`,`menuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__modules_menu` (`moduleid`, `menuid`) VALUES 
(3,0)
,(90,101)
,(91,0)
,(92,-102);

DROP TABLE IF EXISTS `#__session`;
CREATE TABLE IF NOT EXISTS `#__session` (
  `session_id` varbinary(192) NOT NULL,
  `client_id` tinyint(3) unsigned DEFAULT NULL,
  `userid` int(11) DEFAULT 0,
  `data` mediumtext DEFAULT NULL,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__session` (`session_id`, `client_id`, `userid`, `data`) VALUES 
(_binary 'inventedsession01',1,42,'joomla|s:4:\"a;b,\";');

DROP TABLE IF EXISTS `#__tags`;
CREATE TABLE IF NOT EXISTS `#__tags` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__tags` (`id`, `title`) VALUES 
(1,'ROOT')
,(2,'sourdough');

DROP TABLE IF EXISTS `#__template_styles`;
CREATE TABLE IF NOT EXISTS `#__template_styles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `template` varchar(50) NOT NULL DEFAULT '',
  `client_id` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `home` char(7) NOT NULL DEFAULT '0',
  `params` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__template_styles` (`id`, `template`, `client_id`, `home`, `params`) VALUES 
(12,'ja_bakery',0,'1','{\"typelist-theme\":\"default\",\"system_footer\":\"© Harbor Lantern Bakery\"}');

DROP TABLE IF EXISTS `#__ucm_content`;
CREATE TABLE IF NOT EXISTS `#__ucm_content` (
  `core_content_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `core_type_alias` varchar(255) NOT NULL DEFAULT '',
  `core_title` varchar(255) NOT NULL DEFAULT '',
  `core_content_item_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`core_content_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__ucm_content` (`core_content_id`, `core_type_alias`, `core_title`, `core_content_item_id`) VALUES 
(1,'com_content.article','Fresh Rye Every Morning',1);

DROP TABLE IF EXISTS `#__ucm_base`;
CREATE TABLE IF NOT EXISTS `#__ucm_base` (
  `ucm_id` int(10) unsigned NOT NULL,
  `ucm_item_id` int(11) NOT NULL,
  `ucm_type_id` int(11) NOT NULL,
  PRIMARY KEY (`ucm_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__ucm_base` (`ucm_id`, `ucm_item_id`, `ucm_type_id`) VALUES 
(1,1,1);

DROP TABLE IF EXISTS `#__user_profiles`;
CREATE TABLE IF NOT EXISTS `#__user_profiles` (
  `user_id` int(11) NOT NULL,
  `profile_key` varchar(100) NOT NULL,
  `profile_value` text NOT NULL,
  `ordering` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__user_profiles` (`user_id`, `profile_key`, `profile_value`, `ordering`) VALUES 
(42,'joomlatoken.token','aW52ZW50ZWQtdG9rZW4=',1);

DROP TABLE IF EXISTS `#__user_usergroup_map`;
CREATE TABLE IF NOT EXISTS `#__user_usergroup_map` (
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `group_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`,`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__user_usergroup_map` (`user_id`, `group_id`) VALUES 
(42,8)
,(43,2);

DROP TABLE IF EXISTS `#__users`;
CREATE TABLE IF NOT EXISTS `#__users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(400) NOT NULL DEFAULT '',
  `username` varchar(150) NOT NULL DEFAULT '',
  `email` varchar(100) NOT NULL DEFAULT '',
  `password` varchar(100) NOT NULL DEFAULT '',
  `otpKey` varchar(1000) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__users` (`id`, `name`, `username`, `email`, `password`, `otpKey`) VALUES 
(42,'Super User','admin','owner@example.test','$2y$10$inventedhashinventedhashinventedhashinventedhash00','')
,(43,'Pat Baker','pat','pat@example.test','$2y$10$inventedhashinventedhashinventedhashinventedhash01','');

DROP TABLE IF EXISTS `#__workflow_associations`;
CREATE TABLE IF NOT EXISTS `#__workflow_associations` (
  `item_id` int(10) unsigned NOT NULL DEFAULT 0,
  `stage_id` int(10) unsigned NOT NULL,
  `extension` varchar(50) NOT NULL,
  PRIMARY KEY (`item_id`,`extension`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `#__workflow_associations` (`item_id`, `stage_id`, `extension`) VALUES 
(1,1,'com_content.article')
,(2,1,'com_content.article');

UPDATE `#__content` SET `attribs` = '{\"show_title\":\"1\"}' WHERE `id` = 2;
UPDATE `#__modules` SET `params` = '{\"bg-color\":\"light\",\"note\":\"it\'s; fine\"}' WHERE `id` = 91 AND `module` = 'mod_footer';
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
