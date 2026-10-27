<?php
/**
 * After "Sync from live" put a merged database in place on a WordPress copy (`webroot-sync.sh --op
 * apply`), what WordPress itself must do for the result to read right. Run inside the site's web
 * container, as `docker compose exec -T -e TRACY_SYNC_REBUILD=<tables> web php < sync-wordpress-after.php`
 * (sync-joomla-after.php's counterpart).
 *
 *   rebuild   the counters the merge never compares (lib/live_sync_wordpress.py `derivedColumns`),
 *             recounted from the rows when the merge took rows into their table (TRACY_SYNC_REBUILD,
 *             comma-separated names without the prefix): `term_taxonomy` (each term's post count,
 *             through the taxonomy's own counter) and `posts` (each post's approved comments)
 *   cache     the object cache, the rewrite rules (the copy kept its own, and the live site may have
 *             brought a post type or a permalink setting with it) and the page caches of the plugins
 *             that say how to empty them
 *   content   Claude Cowork's content uid for every row that came over without one, when the copy is
 *             opted in to the content reader (`content.identity` with newSite false: the seed stays)
 *
 * Exit 0 always; the last two stdout lines name each outcome for a machine:
 * `TRACY_RESULT rebuild=<name:ok|failed|unknown,…> cache=<cleared|failed>` and
 * `TRACY_RESULT content_reader=<enabled|none|failed>`.
 */
if (PHP_SAPI !== 'cli') exit(1);

$said = [];
$cache = 'cleared';
$reader = 'none';
try {
    $_SERVER['HTTP_HOST'] = $_SERVER['HTTP_HOST'] ?? 'localhost';
    define('WP_USE_THEMES', false);
    require '/var/www/html/wp-load.php';
    global $wpdb;

    foreach (array_filter(explode(',', (string) getenv('TRACY_SYNC_REBUILD'))) as $name) {
        try {
            if ($name === 'term_taxonomy') {
                foreach (get_taxonomies() as $taxonomy) {
                    $ids = $wpdb->get_col($wpdb->prepare(
                        "SELECT term_taxonomy_id FROM {$wpdb->term_taxonomy} WHERE taxonomy = %s", $taxonomy));
                    if ($ids) wp_update_term_count_now(array_map('intval', $ids), $taxonomy);
                }
                $said[] = "$name:ok";
            } elseif ($name === 'posts') {
                $ids = $wpdb->get_col("SELECT p.ID FROM {$wpdb->posts} p WHERE p.comment_count <> (SELECT COUNT(*)
                    FROM {$wpdb->comments} c WHERE c.comment_post_ID = p.ID AND c.comment_approved = '1')");
                foreach ($ids as $id) wp_update_comment_count_now((int) $id);
                $said[] = "$name:ok";
            } else {
                $said[] = "$name:unknown";
            }
        } catch (\Throwable $e) {
            fwrite(STDERR, "!! recount of $name failed: " . $e->getMessage() . "\n");
            $said[] = "$name:failed";
        }
    }

    try {
        wp_cache_flush();
        // Soft: the rules in the database only; the copy's .htaccess is provision's.
        flush_rewrite_rules(false);
        // Page caches, each through its own plugin when it is there.
        if (function_exists('wp_cache_clear_cache')) wp_cache_clear_cache();
        if (function_exists('w3tc_flush_all')) w3tc_flush_all();
        if (function_exists('rocket_clean_domain')) rocket_clean_domain();
        do_action('litespeed_purge_all');
    } catch (\Throwable $e) {
        fwrite(STDERR, "!! cache flush failed: " . $e->getMessage() . "\n");
        $cache = 'failed';
    }

    try {
        if (trim((string) get_option('claude_cowork_content_site', '')) !== ''
            && function_exists('claude_cowork_content_identity') && function_exists('claude_cowork_load_engine')) {
            claude_cowork_load_engine();
            $answer = claude_cowork_content_identity(['newSite' => false]);
            $reader = !empty($answer['ok']) ? 'enabled' : 'failed';
            if (empty($answer['ok'])) fwrite(STDERR, "!! content identity: " . json_encode($answer) . "\n");
        }
    } catch (\Throwable $e) {
        fwrite(STDERR, "!! content identity failed: " . $e->getMessage() . "\n");
        $reader = 'failed';
    }
} catch (\Throwable $e) {
    // WordPress itself did not load: nothing above ran.
    fwrite(STDERR, "!! WordPress did not load: " . $e->getMessage() . "\n");
    foreach (array_filter(explode(',', (string) getenv('TRACY_SYNC_REBUILD'))) as $name) $said[] = "$name:failed";
    $cache = 'failed';
    $reader = 'failed';
}

echo 'TRACY_RESULT rebuild=' . (implode(',', $said) ?: 'none') . " cache=$cache\n";
echo "TRACY_RESULT content_reader=$reader\n";
