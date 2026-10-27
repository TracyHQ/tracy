<?php

/**
 * Menu override: the core item sub-layouts (default_component / _url / _heading / _separator)
 * unchanged, only the list markup is Tracy's so layout.css can place it.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Helper\ModuleHelper;

/** @var array $list @var Joomla\Registry\Registry $params @var int $active_id @var array $path */
?>
<ul class="tracy-menu<?php echo $class_sfx !== '' ? ' ' . htmlspecialchars($class_sfx, ENT_QUOTES, 'UTF-8') : ''; ?>">
<?php foreach ($list as $i => &$item) :
    $itemParams = $item->getParams();
    $class      = 'tracy-menu__item';

    if ($item->id == $active_id) {
        $class .= ' is-current';
    }

    if (\in_array($item->id, $path)) {
        $class .= ' is-active';
    }

    if ($item->type === 'separator') {
        $class .= ' is-divider';
    }

    if ($item->deeper) {
        $class .= ' has-children';
    }

    echo '<li class="' . $class . '">';

    switch ($item->type) :
        case 'separator':
        case 'component':
        case 'heading':
        case 'url':
            require ModuleHelper::getLayoutPath('mod_menu', 'default_' . $item->type);
            break;

        default:
            require ModuleHelper::getLayoutPath('mod_menu', 'default_url');
            break;
    endswitch;

    if ($item->deeper) {
        echo '<ul class="tracy-menu__sub">';
    } elseif ($item->shallower) {
        echo '</li>';
        echo str_repeat('</ul></li>', $item->level_diff);
    } else {
        echo '</li>';
    }
endforeach; ?>
</ul>
