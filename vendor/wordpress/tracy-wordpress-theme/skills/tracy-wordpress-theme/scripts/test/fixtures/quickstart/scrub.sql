INSERT INTO `tr_posts` (`ID`, `post_content`) VALUES 
('1', 'line one\nline two, with (parens) and a \'quote\' and ''two'' and \\ backslash');
INSERT INTO `tr_users` (`ID`, `user_login`, `user_pass`, `user_email`, `user_activation_key`, `display_name`) VALUES 
('1', 'tracyagent', '$wp$2y$10$abcdefghijklmnopqrstuv', 'a@example.com', '', 'Tracy'),
('2', 'lee', '$P$Babcdefghijklmnopqrstuv', 'l@example.com', '1700000000:abc', 'Lee');
INSERT INTO `tr_usermeta` (`umeta_id`, `user_id`, `meta_key`, `meta_value`) VALUES 
('1', '1', 'nickname', 'tracyagent'),
('2', '1', 'session_tokens', 'a:1:{s:64:\"abc\";a:4:{s:10:\"expiration\";i:1;s:2:\"ip\";s:9:\"127.0.0.1\";}}'),
('3', '2', 'session_tokens', 'a:0:{}');
INSERT INTO `tr_options` (`option_id`, `option_name`, `option_value`) VALUES 
('1', 'siteurl', 'https://quickstart.invalid');
