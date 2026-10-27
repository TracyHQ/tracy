#!/usr/bin/env python3
"""Add the two style-driven content hooks to a staged template, without changing its source site."""
import pathlib,sys
root=pathlib.Path(sys.argv[1]);logo=root/'html/layouts/t4/element/logo.php'
s=logo.read_text();marker="$hasLink  ="
addition="""// A seeded business overrides the demo wordmark through its reversible template-style params.
$businessName = (string) $doc->params->get('tracy_business_name', '');
if ($businessName !== '') { $siteName = $businessName; $logo = ''; $slogan = ''; }
"""
if addition not in s:s=s.replace(marker,addition+marker)
logo.write_text(s)
(root/'html/layouts/t4/element/megamenu.php').write_text('''<?php
/** The active language selects a menu through reversible style params. */
defined('_JEXEC') or die;
$app = \\Joomla\\CMS\\Factory::getApplication();
$params = $app->getTemplate(true)->params;
$menus = $params->get('tracy_menu_types', []);
if (is_string($menus)) $menus = json_decode($menus, true) ?: [];
if (is_object($menus)) $menus = (array) $menus;
$lang = $app->getLanguage()->getTag();
$menu = $menus[$lang] ?? $menus['*'] ?? null;
if (is_string($menu) && preg_match('/^[a-zA-Z0-9_-]+$/D', $menu)) {
    $displayData->params['menutype'] = $menu;
}
// MEGA SETTINGS ARE KEYED BY THE SOURCE LANGUAGE'S MENU ITEM IDS. A translated route has its own
// ids, so every column configuration misses and the mega menu degrades to a plain Bootstrap
// dropdown with no warning - measured 12/09/2026 on a zh-TW edition of the Airbnb quickstart: the
// same 60 nav items and 9 dropdowns as English, and none of mega-col-nav, mega-dropdown-menu or
// mega-sub-*. The settings come from a design file (etc/navigation/<profile>.json) that T4's
// loadTypelistData() reloads into navigation-settings on every request, so a template-style param
// cannot carry a correction. This is the one place that runs between that load and the render:
// translate the ids through the associations the language apply already wrote, and add an entry
// for each translated item beside the original. Additive - the source language keeps its own keys.
$navigation = $params->get('navigation-settings');
if ($navigation instanceof \\Joomla\\Registry\\Registry) {
    $mega = $navigation->get('mega_settings');
    if (is_string($mega)) $mega = json_decode($mega, true);
    if (is_object($mega)) $mega = json_decode(json_encode($mega), true);
    if (is_array($mega) && $mega !== []) {
        $db = \\Joomla\\CMS\\Factory::getContainer()->get(\\Joomla\\Database\\DatabaseInterface::class);
        $rows = $db->setQuery(
            $db->getQuery(true)
                ->select($db->quoteName(['a.id', 'a.key', 'm.language']))
                ->from($db->quoteName('#__associations', 'a'))
                ->join('INNER', $db->quoteName('#__menu', 'm'), $db->quoteName('m.id') . ' = ' . $db->quoteName('a.id'))
                ->where($db->quoteName('a.context') . ' = ' . $db->quote('com_menus.item'))
        )->loadAssocList();
        $byKey = [];
        foreach ($rows as $row) $byKey[$row['key']][$row['language']] = (int) $row['id'];
        $translated = [];
        foreach ($byKey as $group) {
            foreach ($group as $from) {
                foreach ($group as $language => $to) {
                    if ($from !== $to) $translated[$language][$from] = $to;
                }
            }
        }
        $map = $translated[$lang] ?? [];
        if ($map !== []) {
            $remapList = static function ($list) use ($map) {
                $out = [];
                foreach (preg_split('/\\s*,\\s*/', (string) $list, -1, PREG_SPLIT_NO_EMPTY) as $one) {
                    $out[] = $map[(int) $one] ?? (int) $one;
                }
                return implode(',', $out);
            };
            $changed = false;
            foreach ($mega as $menutype => $items) {
                if (!is_array($items)) continue;
                foreach ($items as $sourceId => $setting) {
                    $target = $map[(int) $sourceId] ?? null;
                    if ($target === null || isset($items[(string) $target])) continue;
                    $copy = $setting;
                    if (isset($copy['settings']) && is_array($copy['settings'])) {
                        foreach ($copy['settings'] as $r => $row) {
                            if (!isset($row['contents']) || !is_array($row['contents'])) continue;
                            foreach ($row['contents'] as $c => $content) {
                                if (isset($content['items'])) {
                                    $copy['settings'][$r]['contents'][$c]['items'] = $remapList($content['items']);
                                }
                            }
                        }
                    }
                    $mega[$menutype][(string) $target] = $copy;
                    $changed = true;
                }
            }
            if ($changed) $navigation->set('mega_settings', json_encode($mega));
        }
    }
}
require JPATH_ROOT . '/plugins/system/t4/themes/base/html/layouts/t4/element/megamenu.php';
''')

offcanvas=root/'html/layouts/t4/layout/offcanvas.php'
s=offcanvas.read_text();marker="$logo_cls ="
addition="""$businessName = (string) $paramsTpl->get('tracy_business_name', '');
if ($businessName !== '') { $site_name = $businessName; $site_slogan = ''; $logo = ''; $logo_small = ''; }
"""
if addition not in s:s=s.replace(marker,addition+marker)
offcanvas.write_text(s)
for hero in (root/'acm/hero/tmpl').glob('style-*.php'):
 s=hero.read_text()
 if "$seeded =" not in s:s=s.replace("defined('_JEXEC') or die;", "defined('_JEXEC') or die;\n$seeded = (bool) $helper->get('tracy-seeded');")
 s=s.replace("if ($btn1Text === '' && $btn2Text === '') {", "if (!$seeded && $btn1Text === '' && $btn2Text === '') {")
 s=s.replace("if ($asideLabel === '' && $asideBadge === '' && !$notes) {", "if (!$seeded && $asideLabel === '' && $asideBadge === '' && !$notes) {")
 hero.write_text(s)
