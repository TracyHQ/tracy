DROP TABLE IF EXISTS `tr_options`;
CREATE TABLE `tr_options` (`option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `option_name` varchar(191), `option_value` longtext, PRIMARY KEY (`option_id`));
INSERT INTO `tr_options` (`option_id`, `option_name`, `option_value`) VALUES 
 (1,'siteurl','https://quickstart.invalid'),(2,'home','https://quickstart.invalid');
DROP TABLE IF EXISTS `tr_posts`;
CREATE TABLE `tr_posts` (`ID` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `post_content` longtext, `guid` varchar(255), PRIMARY KEY (`ID`));
INSERT INTO `tr_posts` (`ID`, `post_content`, `guid`) VALUES 
 (1,'<!-- wp:image {\"url\":\"http:\\/\\/127.0.0.1:8227\\/wp-content\\/uploads\\/a.png\"} -->','https://quickstart.invalid/?p=1');
DROP TABLE IF EXISTS `tr_users`;
CREATE TABLE `tr_users` (`ID` bigint(20) unsigned NOT NULL, `user_login` varchar(60), `user_pass` varchar(255), `user_activation_key` varchar(255));
INSERT INTO `tr_users` (`ID`, `user_login`, `user_pass`, `user_activation_key`) VALUES 
 (1,'tracyagent','$wp$2y$10$fixturehashfixturehashfixturehashfixturehash','');
DROP TABLE IF EXISTS `tr_usermeta`;
CREATE TABLE `tr_usermeta` (`umeta_id` bigint(20) unsigned NOT NULL, `user_id` bigint(20), `meta_key` varchar(255), `meta_value` longtext);
INSERT INTO `tr_usermeta` (`umeta_id`, `user_id`, `meta_key`, `meta_value`) VALUES 
 (1,1,'session_tokens','a:1:{s:64:\"abc\";a:4:{s:10:\"expiration\";i:1;}}');
