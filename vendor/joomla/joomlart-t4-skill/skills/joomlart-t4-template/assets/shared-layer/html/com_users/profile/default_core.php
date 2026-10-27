<?php

/**
 * @package     Tracy
 * @subpackage  com_users.profile
 *
 * Template override of the T4 base partial. Same four facts, but the Bootstrap grid `dl-horizontal
 * row` / `col-sm-3` / `col-sm-9` pair becomes a two-column definition grid inside a --surface panel,
 * each row hairline-separated by --border-soft. The grid classes could not carry the hairline: a
 * border on a `col-*` traces the gutter, not the row.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;

/** @var \Joomla\Component\Users\Site\View\Profile\HtmlView $this */
?>
<section id="users-profile-core" class="com-users-profile__core tracy-profile-panel">
    <h2 class="tracy-profile-legend">
        <?php echo Text::_('COM_USERS_PROFILE_CORE_LEGEND'); ?>
    </h2>

    <dl class="tracy-deflist">
        <div class="tracy-defrow">
            <dt><?php echo Text::_('COM_USERS_PROFILE_NAME_LABEL'); ?></dt>
            <dd><?php echo $this->escape($this->data->name); ?></dd>
        </div>
        <div class="tracy-defrow">
            <dt><?php echo Text::_('COM_USERS_PROFILE_USERNAME_LABEL'); ?></dt>
            <dd><?php echo htmlspecialchars($this->data->username, ENT_COMPAT, 'UTF-8'); ?></dd>
        </div>
        <div class="tracy-defrow">
            <dt><?php echo Text::_('COM_USERS_PROFILE_REGISTERED_DATE_LABEL'); ?></dt>
            <dd><?php echo HTMLHelper::_('date', $this->data->registerDate, Text::_('DATE_FORMAT_LC1')); ?></dd>
        </div>
        <div class="tracy-defrow">
            <dt><?php echo Text::_('COM_USERS_PROFILE_LAST_VISITED_DATE_LABEL'); ?></dt>
            <dd>
                <?php if ($this->data->lastvisitDate !== null) : ?>
                    <?php echo HTMLHelper::_('date', $this->data->lastvisitDate, Text::_('DATE_FORMAT_LC1')); ?>
                <?php else : ?>
                    <?php echo Text::_('COM_USERS_PROFILE_NEVER_VISITED'); ?>
                <?php endif; ?>
            </dd>
        </div>
    </dl>
</section>
