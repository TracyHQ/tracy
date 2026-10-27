<?php

/**
 * Tracy — com_contact address block.
 *
 * The base override renders a Bootstrap-2 `dl-horizontal` whose <dt> holds a marker glyph; this
 * ships the same fields as hairline-separated key/value rows (--border-soft), which is how the
 * design separates rows everywhere else. Marker text still comes from the contact's own params, so
 * the owner keeps control of the labels in the admin.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;
use Joomla\CMS\String\PunycodeHelper;

/** @var \Joomla\Component\Contact\Site\View\Contact\HtmlView $this */
$params = $this->params;

$hasAddress = ($params->get('address_check') > 0)
    && ($this->item->address || $this->item->suburb || $this->item->state || $this->item->country || $this->item->postcode);

$locality = [];

if ($this->item->suburb && $params->get('show_suburb')) {
    $locality[] = ['contact-suburb', 'addressLocality', $this->item->suburb];
}

if ($this->item->state && $params->get('show_state')) {
    $locality[] = ['contact-state', 'addressRegion', $this->item->state];
}

if ($this->item->postcode && $params->get('show_postcode')) {
    $locality[] = ['contact-postcode', 'postalCode', $this->item->postcode];
}

if ($this->item->country && $params->get('show_country')) {
    $locality[] = ['contact-country', 'addressCountry', $this->item->country];
}

// Marker labels are admin-editable params; fall back to the component's own strings so a blank
// param never leaves a row without a key.
$markers = [
    'address'   => $params->get('marker_address') ?: Text::_('COM_CONTACT_ADDRESS'),
    'email'     => $params->get('marker_email') ?: Text::_('JGLOBAL_EMAIL'),
    'telephone' => $params->get('marker_telephone') ?: Text::_('COM_CONTACT_TELEPHONE'),
    'fax'       => $params->get('marker_fax') ?: Text::_('COM_CONTACT_FAX'),
    'mobile'    => $params->get('marker_mobile') ?: Text::_('COM_CONTACT_MOBILE'),
    'webpage'   => $params->get('marker_webpage') ?: Text::_('COM_CONTACT_WEBPAGE'),
];
?>
<div class="tracy-deflist contact-address" itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">

    <?php if ($hasAddress) : ?>
        <div class="tracy-deflist__row">
            <span class="tracy-deflist__key"><?php echo $this->escape($markers['address']); ?></span>
            <span class="tracy-deflist__val">
                <?php if ($this->item->address && $params->get('show_street_address')) : ?>
                    <span class="contact-street" itemprop="streetAddress"><?php echo nl2br($this->escape($this->item->address)); ?></span>
                <?php endif; ?>
                <?php if ($locality) : ?>
                    <br>
                    <?php foreach ($locality as $i => $part) : ?>
                        <span class="<?php echo $part[0]; ?>" itemprop="<?php echo $part[1]; ?>"><?php echo $this->escape($part[2]); ?></span><?php echo $i < count($locality) - 1 ? ', ' : ''; ?>
                    <?php endforeach; ?>
                <?php endif; ?>
            </span>
        </div>
    <?php endif; ?>

    <?php if ($this->item->email_to && $params->get('show_email')) : ?>
        <div class="tracy-deflist__row">
            <span class="tracy-deflist__key"><?php echo $this->escape($markers['email']); ?></span>
            <span class="tracy-deflist__val contact-emailto" itemprop="email"><?php echo $this->item->email_to; ?></span>
        </div>
    <?php endif; ?>

    <?php if ($this->item->telephone && $params->get('show_telephone')) : ?>
        <div class="tracy-deflist__row">
            <span class="tracy-deflist__key"><?php echo $this->escape($markers['telephone']); ?></span>
            <span class="tracy-deflist__val contact-telephone" itemprop="telephone"><?php echo $this->escape($this->item->telephone); ?></span>
        </div>
    <?php endif; ?>

    <?php if ($this->item->mobile && $params->get('show_mobile')) : ?>
        <div class="tracy-deflist__row">
            <span class="tracy-deflist__key"><?php echo $this->escape($markers['mobile']); ?></span>
            <span class="tracy-deflist__val contact-mobile" itemprop="telephone"><?php echo $this->escape($this->item->mobile); ?></span>
        </div>
    <?php endif; ?>

    <?php if ($this->item->fax && $params->get('show_fax')) : ?>
        <div class="tracy-deflist__row">
            <span class="tracy-deflist__key"><?php echo $this->escape($markers['fax']); ?></span>
            <span class="tracy-deflist__val contact-fax" itemprop="faxNumber"><?php echo $this->escape($this->item->fax); ?></span>
        </div>
    <?php endif; ?>

    <?php if ($this->item->webpage && $params->get('show_webpage')) : ?>
        <div class="tracy-deflist__row">
            <span class="tracy-deflist__key"><?php echo $this->escape($markers['webpage']); ?></span>
            <span class="tracy-deflist__val contact-webpage">
                <a href="<?php echo $this->escape($this->item->webpage); ?>" target="_blank" rel="noopener noreferrer" itemprop="url">
                    <?php echo $this->escape(PunycodeHelper::urlToUTF8($this->item->webpage)); ?>
                </a>
            </span>
        </div>
    <?php endif; ?>
</div>
