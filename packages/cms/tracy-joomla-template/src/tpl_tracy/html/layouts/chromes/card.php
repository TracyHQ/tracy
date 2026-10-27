<?php

/**
 * Module chrome "card": a surface-coloured box with an optional title. Used for the footer and
 * sidebar positions.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

$module  = $displayData['module'];
$params  = $displayData['params'];

if ((string) $module->content === '') {
    return;
}

$suffix = htmlspecialchars((string) $params->get('moduleclass_sfx', ''), ENT_QUOTES, 'UTF-8');
?>
<div class="tracy-card tracy-module<?php echo $suffix !== '' ? ' ' . $suffix : ''; ?>">
    <?php if ($module->showtitle) : ?>
        <h3 class="tracy-card__title"><?php echo $module->title; ?></h3>
    <?php endif; ?>
    <?php echo $module->content; ?>
</div>
