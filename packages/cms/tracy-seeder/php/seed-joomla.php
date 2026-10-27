<?php

/**
 * The seed plan written into a Joomla working copy, from inside Joomla: this script boots the site
 * application from the webroot it is given and writes with the Table API, so it needs no seat
 * cookie and no HTTP — the same rows the admin would write, under the first super user. Reads the
 * plan as JSON on stdin (`{ style, menu, pages[], posts[], pages_wanted[], images{} }`), answers
 * with JSON on stdout, and exits non-zero with one line on stderr when it cannot write.
 *
 * Every article and menu item is looked up by alias first, so a second run updates in place.
 * Pages carry their layout in `attribs` (`tpl_tracy:artifact` + `tracy_artifact`, `tpl_tracy:fixture`,
 * `tpl_tracy:landing`, `tpl_tracy:page`); posts land in a Blog category the menu lists as a blog.
 *
 * Usage: php seed-joomla.php <webroot> < plan.json
 */

use Joomla\CMS\Factory;
use Joomla\CMS\Table\Table;

$webroot = $argv[1] ?? '';

if ($webroot === '' || !is_file($webroot . '/configuration.php')) {
    fwrite(STDERR, "seed-joomla: no Joomla at " . ($webroot === '' ? '(no webroot given)' : $webroot) . "\n");
    exit(2);
}

$plan = json_decode(stream_get_contents(STDIN), true);

if (!\is_array($plan) || !isset($plan['pages'])) {
    fwrite(STDERR, "seed-joomla: no plan on stdin\n");
    exit(2);
}

\define('_JEXEC', 1);
\define('JPATH_BASE', realpath($webroot));
require JPATH_BASE . '/includes/defines.php';
require JPATH_BASE . '/includes/framework.php';

// The console application, the way cli/joomla.php boots (a site application needs a request URI):
// tables, the database and the date helpers resolve; nothing is rendered.
$container = Factory::getContainer();
$container->alias('session', 'session.cli')
    ->alias('JSession', 'session.cli')
    ->alias(\Joomla\CMS\Session\Session::class, 'session.cli')
    ->alias(\Joomla\Session\Session::class, 'session.cli')
    ->alias(\Joomla\Session\SessionInterface::class, 'session.cli');
$app = $container->get(\Joomla\Console\Application::class);
Factory::$application = $app;
$db = Factory::getDbo();

$userId = (int) $db->setQuery('SELECT id FROM #__users ORDER BY id LIMIT 1')->loadResult();
$wanted = isset($plan['pages_wanted']) && \is_array($plan['pages_wanted']) ? $plan['pages_wanted'] : ['all'];
$wants = static fn(string $slug): bool => \in_array('all', $wanted, true) || \in_array($slug, $wanted, true)
    || ($slug === 'posts' && \in_array('blog', $wanted, true));
$out = ['pages' => [], 'posts' => [], 'menu' => [], 'warnings' => []];
$now = Factory::getDate()->toSql();

/** The id of a category by alias under the root, creating it when missing. */
function categoryId(string $alias, string $title, int $userId): int
{
    $db = Factory::getDbo();
    $id = (int) $db->setQuery(
        'SELECT id FROM #__categories WHERE extension = ' . $db->quote('com_content') . ' AND alias = ' . $db->quote($alias)
    )->loadResult();

    if ($id > 0) {
        return $id;
    }

    $table = Table::getInstance('Category');
    $table->setLocation(1, 'last-child');
    $data = [
        'extension' => 'com_content', 'title' => $title, 'alias' => $alias, 'published' => 1, 'access' => 1,
        'language' => '*', 'params' => '{}', 'metadata' => '{}', 'created_user_id' => $userId,
    ];

    if (!$table->bind($data) || !$table->check() || !$table->store()) {
        throw new RuntimeException('category ' . $alias . ': ' . $table->getError());
    }

    $table->rebuildPath($table->id);

    return (int) $table->id;
}

/**
 * The site's contact record, so the Contact page is com_contact's own view — the component
 * validates and sends the mail, and `tpl_tracy`'s `html/com_contact/` override gives it Tracy's
 * shapes. Upserted by alias; returns its id, or 0 when the site gave no address.
 */
function contactId(string $name, string $email, string $lead, int $userId, string $now): int
{
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return 0;
    }

    $db = Factory::getDbo();
    $alias = 'contact';
    $id = (int) $db->setQuery('SELECT id FROM #__contact_details WHERE alias = ' . $db->quote($alias))->loadResult();
    $columns = [
        'name' => $name !== '' ? $name : 'Contact',
        'alias' => $alias,
        'email_to' => $email,
        // Every Joomla ships one com_contact category ("Uncategorised"); the record goes there.
        'catid' => (int) $db->setQuery(
            'SELECT id FROM #__categories WHERE extension = ' . $db->quote('com_contact')
            . ' AND published = 1 ORDER BY lft LIMIT 1'
        )->loadResult(),
        'published' => 1,
        'access' => 1,
        'language' => '*',
        'params' => json_encode(['show_email_form' => 1, 'show_email' => 1, 'show_page_heading' => 0, 'address_check' => 0]),
        'metadata' => '{}',
        'metadesc' => '',
        'metakey' => '',
        // The section's lead paragraph: com_contact's own field for the words beside the form.
        'misc' => $lead !== '' ? '<p class="tracy-lead">' . htmlspecialchars($lead, ENT_QUOTES, 'UTF-8') . '</p>' : '',
        'created' => $now,
        'created_by' => $userId,
        'modified' => $now,
    ];

    if ($id > 0) {
        $query = $db->getQuery(true)->update($db->quoteName('#__contact_details'));

        foreach ($columns as $k => $v) {
            if ($k === 'created' || $k === 'created_by') {
                continue;
            }

            $query->set($db->quoteName($k) . ' = ' . $db->quote($v));
        }

        $db->setQuery($query->where('id = ' . $id))->execute();

        return $id;
    }

    $db->setQuery(
        $db->getQuery(true)
            ->insert($db->quoteName('#__contact_details'))
            ->columns(array_map([$db, 'quoteName'], array_keys($columns)))
            ->values(implode(',', array_map([$db, 'quote'], array_values($columns))))
    )->execute();

    return (int) $db->insertid();
}

/** Upsert one article by alias; returns its id. */
function upsertArticle(array $fields, int $catid, int $userId, string $now): int
{
    $db = Factory::getDbo();
    $id = (int) $db->setQuery('SELECT id FROM #__content WHERE alias = ' . $db->quote($fields['alias']))->loadResult();
    $table = Table::getInstance('Content');

    if ($id > 0) {
        $table->load($id);
    }

    $data = array_merge([
        'catid' => $catid, 'state' => 1, 'access' => 1, 'language' => '*', 'created_by' => $userId,
        'created' => $id > 0 ? $table->created : $now, 'modified' => $now, 'publish_up' => $id > 0 ? $table->publish_up : $now,
        'images' => '{}', 'urls' => '{}', 'metadata' => '{}', 'metadesc' => '', 'attribs' => '{}', 'introtext' => '', 'fulltext' => '',
    ], $fields);

    if (!$table->bind($data) || !$table->check() || !$table->store()) {
        throw new RuntimeException('article ' . $fields['alias'] . ': ' . $table->getError());
    }

    return (int) $table->id;
}

/** Upsert one menu item of the main menu by alias, appended as a last child of the root. */
function upsertMenuItem(string $alias, string $title, string $link, bool $home, int $order, array $params = []): int
{
    $db = Factory::getDbo();
    $comId = (int) $db->setQuery(
        'SELECT extension_id FROM #__extensions WHERE type = ' . $db->quote('component') . ' AND element = ' . $db->quote('com_content')
    )->loadResult();
    $id = (int) $db->setQuery(
        'SELECT id FROM #__menu WHERE client_id = 0 AND menutype = ' . $db->quote('mainmenu') . ' AND alias = ' . $db->quote($alias)
    )->loadResult();
    $table = Table::getInstance('Menu');

    if ($id > 0) {
        $table->load($id);
    } else {
        $table->setLocation(1, 'last-child');
    }

    $data = [
        'menutype' => 'mainmenu', 'title' => $title, 'alias' => $alias, 'path' => $alias, 'link' => $link, 'type' => 'component',
        'published' => 1, 'parent_id' => 1, 'level' => 1, 'component_id' => $comId, 'access' => 1, 'language' => '*',
        'client_id' => 0, 'template_style_id' => 0, 'params' => json_encode((object) $params), 'home' => $home ? 1 : 0,
    ];

    if (!$table->bind($data) || !$table->check() || !$table->store()) {
        throw new RuntimeException('menu ' . $alias . ': ' . $table->getError());
    }

    return (int) $table->id;
}

try {
    $pagesCat = 2; // Uncategorised, present on every Joomla
    $blogCat = categoryId('blog', 'Blog', $userId);
    $contactId = contactId(
        (string) ($plan['contact']['name'] ?? 'Contact'),
        (string) ($plan['contact']['email'] ?? ''),
        (string) ($plan['contact']['lead'] ?? ''),
        $userId,
        $now
    );

    // The template style: the chosen design system, and tpl_tracy as the site default.
    if (isset($plan['style']['inspiration']) && preg_match('/^[a-z0-9-]+$/', $plan['style']['inspiration'])) {
        $params = json_encode(['inspiration' => $plan['style']['inspiration'], 'nav' => 'auto', 'hero' => 'auto']);
        $db->setQuery('UPDATE #__template_styles SET home = ' . $db->quote('0') . ' WHERE client_id = 0 AND home = ' . $db->quote('1'))->execute();
        $db->setQuery(
            'UPDATE #__template_styles SET home = ' . $db->quote('1') . ', params = ' . $db->quote($params)
            . ' WHERE client_id = 0 AND template = ' . $db->quote('tpl_tracy')
        )->execute();
        $out['style'] = $plan['style']['inspiration'];
    }

    // Pages.
    $articleIds = [];

    foreach ($plan['pages'] as $page) {
        $slug = (string) $page['slug'];

        if (!$wants($slug)) {
            $existing = (int) $db->setQuery('SELECT id FROM #__content WHERE alias = ' . $db->quote($slug))->loadResult();

            if ($existing > 0) {
                $articleIds[$slug] = $existing;
            }

            continue;
        }

        $attribs = ['article_layout' => 'tpl_tracy:' . $page['kind']];

        if ($page['kind'] === 'artifact') {
            $attribs['tracy_artifact'] = (string) ($page['artifact'] ?? 'landing');
        }

        $articleIds[$slug] = upsertArticle([
            'title' => (string) $page['title'], 'alias' => $slug, 'introtext' => '', 'fulltext' => (string) $page['body'],
            'attribs' => json_encode($attribs),
        ], $pagesCat, $userId, $now);
        $out['pages'][$slug] = $articleIds[$slug];
    }

    // Posts, dated backwards a day apart; a cover lands under images/tracy/.
    if ($wants('posts') && isset($plan['posts']) && \is_array($plan['posts'])) {
        $i = 0;

        foreach ($plan['posts'] as $post) {
            $slug = (string) $post['slug'];
            $date = Factory::getDate('-' . $i . ' days')->toSql();
            $paragraphs = \is_array($post['paragraphs']) ? $post['paragraphs'] : [];
            $lead = array_shift($paragraphs) ?? '';
            $images = ['image_intro' => '', 'image_intro_alt' => '', 'image_fulltext' => '', 'image_fulltext_alt' => ''];

            if (isset($plan['images'][$slug]) && \is_string($plan['images'][$slug])) {
                $rel = 'images/tracy/' . $slug . '.' . (str_contains($plan['images'][$slug], 'image/jpeg') ? 'jpg' : 'png');
                $abs = JPATH_BASE . '/' . $rel;

                if (!is_dir(\dirname($abs))) {
                    mkdir(\dirname($abs), 0755, true);
                }

                $data = explode(',', $plan['images'][$slug], 2)[1] ?? '';
                file_put_contents($abs, base64_decode($data));
                $images = ['image_intro' => $rel, 'image_intro_alt' => $post['title'], 'image_fulltext' => $rel, 'image_fulltext_alt' => $post['title']];
            }

            $metadata = ['tracy_image_prompt' => (string) ($post['imagePrompt'] ?? '')];
            $out['posts'][$slug] = upsertArticle([
                'title' => (string) $post['title'], 'alias' => $slug,
                'introtext' => '<p>' . htmlspecialchars((string) ($post['excerpt'] !== '' ? $post['excerpt'] : $lead), ENT_QUOTES, 'UTF-8') . '</p>',
                'fulltext' => implode('', array_map(static fn($p) => '<p>' . htmlspecialchars((string) $p, ENT_QUOTES, 'UTF-8') . '</p>', array_merge([$lead], $paragraphs))),
                'created' => $date, 'publish_up' => $date, 'created_by_alias' => (string) ($plan['author'] ?? ''),
                'images' => json_encode($images), 'metadata' => json_encode($metadata),
            ], $blogCat, $userId, $now);
            $i++;
        }
    }

    // The menu, in order: home first as the site's home item.
    if (\in_array('all', $wanted, true) || \in_array('menu', $wanted, true)) {
        $order = 0;

        foreach ($plan['menu'] as $item) {
            $slug = (string) $item['slug'];
            $order++;

            if ($slug === 'blog') {
                $out['menu'][$slug] = upsertMenuItem('blog', (string) $item['label'],
                    'index.php?option=com_content&view=category&layout=blog&id=' . $blogCat, false, $order,
                    ['num_leading_articles' => '0', 'num_intro_articles' => '6', 'num_columns' => '3', 'show_page_heading' => '0']);
                continue;
            }

            // Contact: com_contact's own view, so the form really sends (the template dresses it).
            if ($slug === 'contact' && $contactId > 0) {
                $comContact = (int) $db->setQuery(
                    'SELECT extension_id FROM #__extensions WHERE type = ' . $db->quote('component') . ' AND element = ' . $db->quote('com_contact')
                )->loadResult();
                $menuId = upsertMenuItem('contact', (string) $item['label'],
                    'index.php?option=com_contact&view=contact&id=' . $contactId, false, $order,
                    ['show_email_form' => '1', 'show_email' => '1', 'show_page_heading' => '0']);

                if ($comContact > 0) {
                    $db->setQuery('UPDATE #__menu SET component_id = ' . $comContact . ' WHERE id = ' . $menuId)->execute();
                }

                $out['menu'][$slug] = $menuId;
                $out['contact'] = $contactId;
                continue;
            }

            if (!isset($articleIds[$slug])) {
                continue;
            }

            $link = 'index.php?option=com_content&view=article&id=' . $articleIds[$slug];

            if ($slug === 'home') {
                // The existing home item keeps its id (101 on a stock install); point it at the article.
                $homeId = (int) $db->setQuery('SELECT id FROM #__menu WHERE client_id = 0 AND home = 1 AND language = ' . $db->quote('*'))->loadResult();

                if ($homeId > 0) {
                    $db->setQuery('UPDATE #__menu SET link = ' . $db->quote($link) . ', title = ' . $db->quote((string) $item['label'])
                        . ', params = ' . $db->quote('{}') . ' WHERE id = ' . $homeId)->execute();
                    $out['menu']['home'] = $homeId;
                    continue;
                }
            }

            $out['menu'][$slug] = upsertMenuItem($slug, (string) $item['label'], $link, $slug === 'home', $order);
        }

        // The menu module in position nav, on every page — present on the stand's seed; created when missing.
        $modId = (int) $db->setQuery('SELECT id FROM #__modules WHERE module = ' . $db->quote('mod_menu') . ' AND position = ' . $db->quote('nav') . ' AND client_id = 0')->loadResult();

        if ($modId === 0) {
            $module = Table::getInstance('Module');
            $module->bind([
                'title' => 'Main menu', 'module' => 'mod_menu', 'position' => 'nav', 'published' => 1, 'access' => 1, 'showtitle' => 0,
                'language' => '*', 'client_id' => 0, 'params' => json_encode(['menutype' => 'mainmenu', 'layout' => '_:default']),
            ]);

            if ($module->check() && $module->store()) {
                $db->setQuery('INSERT INTO #__modules_menu (moduleid, menuid) VALUES (' . (int) $module->id . ', 0)')->execute();
                $out['menuModule'] = (int) $module->id;
            }
        }
    }

    // Two things the article writes above rely on: a rebuilt nested set is not needed for
    // last-child inserts; the page cache, when on, is emptied so the next request shows the seed.
    $cacheDir = JPATH_BASE . '/cache/page';

    if (is_dir($cacheDir)) {
        foreach (glob($cacheDir . '/*') ?: [] as $f) {
            is_file($f) && unlink($f);
        }
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'seed-joomla: ' . $e->getMessage() . "\n");
    exit(1);
}

echo json_encode($out, JSON_UNESCAPED_SLASHES), "\n";
