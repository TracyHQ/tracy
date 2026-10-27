<?php

/**
 * @package     Tracy
 * @subpackage  com_users.profile
 *
 * Template override of the T4 base partial. Custom fields and user-profile plugin fields in the same
 * definition grid. Two changes beyond the shell: the avatar is a circular 50% media (DESIGN.md §5)
 * instead of a Bootstrap `img-thumbnail` with an inline max-height, and the social row's `<span>`
 * icons get an accessible name — the base emitted an icon-only link with the title on the <a> and a
 * stray target attribute on the <span>.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Uri\Uri;

/** @var \Joomla\Component\Users\Site\View\Profile\HtmlView $this */

$fieldsets = $this->form->getFieldsets();

unset($fieldsets['core'], $fieldsets['params']);

$customFields = [];

foreach ($this->data->jcfields ?? [] as $customField) {
    $customFields[$customField->name] = $customField;
}
?>
<?php foreach ($fieldsets as $group => $fieldset) : ?>
    <?php $fields = $this->form->getFieldset($group); ?>
    <?php if (count($fields)) : ?>
        <section id="users-profile-custom-<?php echo $group; ?>"
                 class="com-users-profile__custom users-profile-custom-<?php echo $group; ?> tracy-profile-panel">
            <?php if (isset($fieldset->label) && ($legend = trim(Text::_($fieldset->label))) !== '') : ?>
                <h2 class="tracy-profile-legend"><?php echo $legend; ?></h2>
            <?php endif; ?>
            <?php if (isset($fieldset->description) && trim($fieldset->description)) : ?>
                <p class="tracy-profile-lead"><?php echo $this->escape(Text::_($fieldset->description)); ?></p>
            <?php endif; ?>

            <dl class="tracy-deflist">
                <?php foreach ($fields as $field) : ?>
                    <?php if (!$field->hidden && $field->type !== 'Spacer') : ?>
                        <div class="tracy-defrow">
                            <dt><?php echo $field->title; ?></dt>
                            <dd>
                                <?php if ($field->fieldname === 'user_avatar' && $field->value) : ?>
                                    <img class="tracy-profile-avatar"
                                         src="<?php echo Uri::root() . $field->value; ?>"
                                         alt="<?php echo $this->escape($this->data->name); ?>">
                                <?php elseif ($field->fieldname === 'user_social' && $field->value) : ?>
                                    <ul class="tracy-profile-social">
                                        <?php foreach ((array) $field->value as $value) : ?>
                                            <?php $social = (array) $value; ?>
                                            <li>
                                                <a href="<?php echo $this->escape($social['social_link']); ?>"
                                                   target="_blank"
                                                   rel="noopener noreferrer">
                                                    <span class="<?php echo $this->escape($social['social_icon']); ?>" aria-hidden="true"></span>
                                                    <span class="visually-hidden"><?php echo $this->escape($social['social_name']); ?></span>
                                                </a>
                                            </li>
                                        <?php endforeach; ?>
                                    </ul>
                                <?php elseif (array_key_exists($field->fieldname, $customFields)) : ?>
                                    <?php echo strlen((string) $customFields[$field->fieldname]->value)
                                        ? $customFields[$field->fieldname]->value
                                        : Text::_('COM_USERS_PROFILE_VALUE_NOT_FOUND'); ?>
                                <?php elseif (HTMLHelper::isRegistered('users.' . $field->id)) : ?>
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
<?php endforeach; ?>
