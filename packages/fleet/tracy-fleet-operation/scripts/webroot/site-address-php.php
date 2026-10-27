<?php
// Read/change only address fields; no configuration dump or bulk content replacement.
ini_set('display_errors', '0');
$input = json_decode(base64_decode($argv[1]), true);
ob_start();
try {
    if (is_file('/var/www/html/wp-load.php')) {
        define('DISABLE_WP_CRON', true);
        define('WP_USE_THEMES', false);
        require '/var/www/html/wp-load.php';
        // The constants are reported, not refused: site-address.py rewrites them in wp-config.php
        // when they are the plain literals Tracy's provisioning wrote, and refuses any other shape.
        $constants = [];
        foreach (['WP_HOME', 'WP_SITEURL'] as $name) $constants[$name] = defined($name) ? (string)constant($name) : null;
        global $wpdb;
        $read = function () use ($wpdb) {
            $values = [];
            foreach (['home', 'siteurl'] as $key) $values[$key] = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name=%s", $key));
            return $values;
        };
        $before = $read();
        if (isset($input['expected'])) {
            $wpdb->query('START TRANSACTION');
            foreach ($input['expected'] as $key => $value) {
                if (!in_array($key, ['home', 'siteurl'], true)) throw new Exception('INVALID_FIELD');
                $current = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name=%s FOR UPDATE", $key));
                if ($current !== $value && $current !== $input['desired'][$key]) throw new Exception('ADDRESS_CONFLICT');
                if ($wpdb->update($wpdb->options, ['option_value'=>$input['desired'][$key]], ['option_name'=>$key]) === false) throw new Exception('ADDRESS_WRITE_FAILED');
            }
            $wpdb->query('COMMIT');
            wp_cache_delete('alloptions', 'options');
            foreach (['home','siteurl'] as $key) wp_cache_delete($key, 'options');
        }
        $answer = ['ok'=>true, 'platform'=>'wordpress', 'values'=>$read(), 'constants'=>$constants];
    } else {
        $file = '/var/www/html/configuration.php';
        require $file;
        $config = new JConfig();
        $value = (string)($config->live_site ?? '');
        if (isset($input['expected'])) {
            $expected = $input['expected']['live_site'];
            $desired = $input['desired']['live_site'];
            if ($value !== $expected && $value !== $desired) throw new Exception('ADDRESS_CONFLICT');
            $text = file_get_contents($file);
            $pattern = '/(public\s+\$live_site\s*=\s*)([\x27\x22])(?:\\\\.|(?!\2).)*\2\s*;/';
            $count = 0;
            $changed = preg_replace_callback($pattern, fn($m) => $m[1] . var_export($desired, true) . ';', $text, -1, $count);
            if ($count !== 1) throw new Exception('JOOMLA_CONFIG_UNSUPPORTED');
            $tmp = $file . '.address-' . bin2hex(random_bytes(6));
            if (file_put_contents($tmp, $changed) === false) throw new Exception('ADDRESS_WRITE_FAILED');
            chmod($tmp, fileperms($file) & 0777);
            if (!rename($tmp, $file)) { unlink($tmp); throw new Exception('ADDRESS_WRITE_FAILED'); }
            $value = $desired;
        }
        $answer = ['ok'=>true, 'platform'=>'joomla', 'values'=>['live_site'=>$value]];
    }
    ob_end_clean();
    echo json_encode($answer, JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $e) {
    if (isset($wpdb)) $wpdb->query('ROLLBACK');
    ob_end_clean();
    $code = in_array($e->getMessage(), ['WP_ADDRESS_CONSTANT','INVALID_FIELD','ADDRESS_CONFLICT','ADDRESS_WRITE_FAILED','JOOMLA_CONFIG_UNSUPPORTED'], true) ? $e->getMessage() : 'CMS_ADDRESS_FAILED';
    echo json_encode(['ok'=>false,'code'=>$code]) . "\n";
    exit(1);
}
