<?php

/**
 * @package     Tracy
 * @subpackage  com_users.profile
 *
 * Template override of the T4 base partial. The user's basic settings, in the same panel and the same
 * definition grid as the core facts, so the profile reads as one document instead of three fieldsets
 * with three different rhythms.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;

/** @var \Joomla\Component\Users\Site\View\Profile\HtmlView $this */

HTMLHelper::addIncludePath(JPATH_COMPONENT . '/helpers/html');

$fields = $this->form->getFieldset('params');
?>
<?php if (count($fields)) : ?>
    <section id="users-profile-custom" class="com-users-profile__params tracy-profile-panel">
        <h2 class="tracy-profile-legend">
            <?php echo Text::_('COM_USERS_SETTINGS_FIELDSET_LABEL'); ?>
        </h2>

        <dl class="tracy-deflist">
            <?php foreach ($fields as $field) : ?>
                <?php if (!$field->hidden) : ?>
                    <div class="tracy-defrow">
                        <dt><?php echo $field->title; ?></dt>
                        <dd>
                            <?php if (HTMLHelper::isRegistered('users.' . $field->id)) : ?>
                                <?php echo HTMLHelper::_('users.' . $field->id, $field->value); ?>
                            <?php elseif (HTMLHelper::isRegistered('users.' . $field->fieldname)) : ?>
                                <?php echo HTMLHelper::_('users.' . $field->fieldname, $field->value); ?>
                            <?php elseif (HTMLHelper::isRegistered('users.' . $field->type)) : ?>
                                <?php echo HTMLHelper::_('users.' . $field->type, $field->value); ?>
                            <?php else : ?>
                                <?php echo HTMLHelper::_('users.value', $field->value); ?>
                            <?php endif; ?>
                        </dd>
                    </div>
                <?php endif; ?>
            <?php endforeach; ?>
        </dl>
    </section>
<?php endif; ?>
