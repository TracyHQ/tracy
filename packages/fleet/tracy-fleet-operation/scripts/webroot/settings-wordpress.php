<?php
// Whitelisted read: no credentials, email configuration or arbitrary option names.
ini_set('display_errors', '0');
ob_start();
define('DISABLE_WP_CRON', true);
define('WP_USE_THEMES', false);
require '/var/www/html/wp-load.php';
$theme = wp_get_theme();
$answer = ['ok' => true, 'platform' => 'wordpress', 'version' => $wp_version,
 'title' => get_option('blogname'), 'language' => get_locale(),
 'theme' => $theme->get('Name') . ' · ' . $theme->get('Version'),
 'homepage' => get_option('show_on_front'), 'permalinks' => get_option('permalink_structure'),
 'timezone' => wp_timezone_string()];
ob_end_clean();
echo json_encode($answer, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
