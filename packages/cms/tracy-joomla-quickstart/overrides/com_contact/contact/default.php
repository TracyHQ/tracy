<?php

/**
 * Tracy — com_contact single-contact view.
 *
 * Starts from the T4 base override (plugins/system/t4/themes/base/html/com_contact/contact) and
 * changes only what the design needs: the base's sliders/tabs branches are dead on Joomla 4+ (the
 * base itself pins $presentation_style to 'plain' there), so this ships the plain branch only, laid
 * out as the fixture's #form region — a 1.3:1 grid with the form on the left and one ringed detail
 * card on the right. Every colour/size/space/radius is a var(--*) declared in scss/_tokens-apple.scss.
 *
 * @package     tracy
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\FileLayout;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\CMS\Router\Route;
use Joomla\Component\Contact\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Contact\Site\View\Contact\HtmlView $this */
$tparams  = $this->item->params;
$showForm = $tparams->get('show_email_form') && ($this->item->email_to || $this->item->user_id);
$addressHtml = $this->loadTemplate('address');
$hasDetails = trim(strip_tags($addressHtml)) !== ''
    || ($this->item->image && $tparams->get('show_image'))
    || ($this->item->con_position && $tparams->get('show_position'))
    || $tparams->get('allow_vcard');
$showInfo = $this->params->get('show_info', 1) && $hasDetails;
?>
<div class="com-contact tracy-contact-page<?php echo $this->pageclass_sfx; ?>" itemscope itemtype="https://schema.org/Person">

    <div class="tracy-view-head">
        <?php if ($tparams->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($tparams->get('page_heading')); ?></h1>
        <?php endif; ?>

        <?php if ($this->item->name && $tparams->get('show_name')) : ?>
            <h2 class="tracy-view-head__title">
                <span class="contact-name" itemprop="name"><?php echo $this->escape($this->item->name); ?></span>
            </h2>
        <?php endif; ?>

        <?php $showCategory = $tparams->get('show_contact_category'); ?>
        <?php if ($showCategory === 'show_no_link') : ?>
            <p class="tracy-view-head__lead contact-category"><?php echo $this->escape($this->item->category_title); ?></p>
        <?php elseif ($showCategory === 'show_with_link') : ?>
            <p class="tracy-view-head__lead contact-category">
                <a href="<?php echo Route::_(RouteHelper::getCategoryRoute($this->item->catid, $this->item->language)); ?>">
                    <?php echo $this->escape($this->item->category_title); ?>
                </a>
            </p>
        <?php endif; ?>
    </div>

    <?php echo $this->item->event->afterDisplayTitle; ?>

    <?php if ($tparams->get('show_contact_list') && count($this->contacts) > 1) : ?>
        <form action="#" method="get" name="selectForm" id="selectForm" class="tracy-filterbar">
            <div class="tracy-field">
                <label for="select_contact"><?php echo Text::_('COM_CONTACT_SELECT_CONTACT'); ?></label>
                <?php echo HTMLHelper::_('select.genericlist', $this->contacts, 'select_contact', 'class="form-select" onchange="document.location.href = this.value"', 'link', 'name', $this->item->link); ?>
            </div>
        </form>
    <?php endif; ?>

    <?php if ($tparams->get('show_tags', 1) && !empty($this->item->tags->itemTags)) : ?>
        <?php $this->item->tagLayout = new FileLayout('joomla.content.tags'); ?>
        <?php echo $this->item->tagLayout->render($this->item->tags->itemTags); ?>
    <?php endif; ?>

    <?php echo $this->item->event->beforeDisplayContent; ?>

    <div class="tracy-contact">

        <div class="tracy-contact__main">
            <?php if ($showForm) : ?>
                <h2 class="tracy-contact__heading"><?php echo Text::_('COM_CONTACT_EMAIL_FORM'); ?></h2>
                <?php echo $this->loadTemplate('form'); ?>
            <?php endif; ?>
        </div>

        <aside class="tracy-contact__aside">
            <?php if ($showInfo) : ?>
                <div class="tracy-card tracy-contact__card">
                    <h2 class="tracy-card__title"><?php echo Text::_('COM_CONTACT_DETAILS'); ?></h2>

                    <?php if ($this->item->image && $tparams->get('show_image')) : ?>
                        <div class="tracy-contact__image">
                            <?php echo HTMLHelper::_('image', $this->item->image, $this->escape($this->item->name), ['itemprop' => 'image']); ?>
                        </div>
                    <?php endif; ?>

                    <?php if ($this->item->con_position && $tparams->get('show_position')) : ?>
                        <p class="tracy-card__meta" itemprop="jobTitle"><?php echo $this->escape($this->item->con_position); ?></p>
                    <?php endif; ?>

                    <?php echo $addressHtml; ?>

                    <?php if ($tparams->get('allow_vcard')) : ?>
                        <a class="tracy-card__link" href="<?php echo Route::_('index.php?option=com_contact&view=contact&id=' . $this->item->id . '&format=vcf'); ?>">
                            <?php echo Text::_('COM_CONTACT_VCARD'); ?>
                        </a>
                    <?php endif; ?>
                </div>
            <?php endif; ?>

            <?php
                // The links/articles/profile/custom-field sub-templates come from core and happily
                // return an empty <ul>/<dl> when the contact has none of that data. Each one here is
                // a ringed card, and an empty ring is a visible defect the base layout never had —
                // so render the shell only once the partial has actually produced something.
                $panels = [];

                if ($tparams->get('show_links')) {
                    $panels[] = ['contact-link', '', $this->loadTemplate('links')];
                }

                if ($tparams->get('show_articles') && $this->item->user_id && $this->item->articles) {
                    $panels[] = ['contact-articles', Text::_('JGLOBAL_ARTICLES'), $this->loadTemplate('articles')];
                }

                if ($tparams->get('show_profile') && $this->item->user_id && PluginHelper::isEnabled('user', 'profile')) {
                    $panels[] = ['contact-profile', Text::_('COM_CONTACT_PROFILE'), $this->loadTemplate('profile')];
                }

                if ($tparams->get('show_user_custom_fields') && $this->contactUser) {
                    $panels[] = ['contact-custom-field', '', $this->loadTemplate('user_custom_fields')];
                }
            ?>
            <?php foreach ($panels as $panel) : ?>
                <?php if (trim(strip_tags($panel[2])) === '') : ?>
                    <?php continue; ?>
                <?php endif; ?>
                <div class="tracy-card tracy-contact__card <?php echo $panel[0]; ?>">
                    <?php if ($panel[1] !== '') : ?>
                        <h2 class="tracy-card__title"><?php echo $panel[1]; ?></h2>
                    <?php endif; ?>
                    <?php echo $panel[2]; ?>
                </div>
            <?php endforeach; ?>

            <?php foreach (\Joomla\CMS\Helper\ModuleHelper::getModules('footer') as $contactModule) : ?>
                <?php if ($contactModule->module === 'mod_ja_acm' && str_contains($contactModule->params, 'tracy:contact-information')) : ?>
                    <?php echo \Joomla\CMS\Helper\ModuleHelper::renderModule($contactModule, ['style' => 'none']); ?>
                <?php endif; ?>
            <?php endforeach; ?>
        </aside>

    </div>

    <?php echo $this->item->event->afterDisplayContent; ?>
</div>
