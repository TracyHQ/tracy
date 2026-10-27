<?php

/**
 * Tracy Business — language switcher, the topbar dropdown pattern.
 *
 * The core module supplies `$list` (one entry per published content language, with the real
 * association-aware `link`); this layout only changes the markup: a flag + native name + caret
 * toggle, and a panel listing every language with a check on the active one. Opening and
 * closing is js/tracy-business.js; nothing here depends on Bootstrap's dropdown.
 *
 * THE PANEL SHAPE FOLLOWS THE LIST LENGTH, and there are exactly TWO shapes.
 *
 *   ≤ 8   the anchored dropdown, one column — a bilingual site sees no change at all
 *   > 8   a centred modal at EVERY width, multi-column, with a filter box
 *
 * The middle road — an anchored dropdown that is also multi-column — was built first and produced
 * four separate defects in one afternoon (21/09/2026): a shorthand cancelled by the next line, a
 * flex child collapsing to zero, a leftover `position:absolute` from the element's previous life,
 * and `repeat(var(--n))`, which is not valid CSS at all. Every one of them came from placing a
 * wide panel inside a page whose ancestors we do not control. `showModal()` renders in the TOP
 * LAYER, outside every containing block, overflow and z-index, so the whole class disappears.
 *
 * Column count is left to `auto-fill`: the grid takes as many 190px columns as the dialog's width
 * allows, which is one number the stylesheet never has to guess.
 *
 * @package northgate
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Uri\Uri;

$esc  = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$id   = 'tb-lang-' . (int) $module->id;
$flag = static function ($language) use ($esc) {
    if (empty($language->image)) {
        return '';
    }

    return '<span class="tb-lang__flag">' . HTMLHelper::_('image', 'mod_languages/' . $language->image . '.gif', '', null, true) . '</span>';
};
$count  = count($list);
$modal  = $count > 8;
$filter = $count >= 25;
$active = null;

foreach ($list as $language) {
    if ($language->active) {
        $active = $language;
    }
}

if ($active === null) {
    return;
}
?>
<div class="mod-languages">
    <p class="visually-hidden" id="<?php echo $id; ?>-des"><?php echo Text::_('MOD_LANGUAGES_DESC'); ?></p>
    <div class="tb-lang<?php echo $modal ? ' tb-lang--modal' : ''; ?>">
        <button type="button" class="tb-lang__toggle" aria-haspopup="true" aria-expanded="false"
                aria-controls="<?php echo $id; ?>-menu" aria-describedby="<?php echo $id; ?>-des">
            <?php echo $flag($active); ?>
            <?php // Two labels, one shown at a time: "Deutsch (Deutschland)" is 21 characters for a
                  // secondary control, and at 430px it pushed the topbar onto a third row. Below the
                  // breakpoint the stylesheet swaps in the sef code. Both stay in the DOM so the
                  // accessible name never changes with the viewport. ?>
            <span class="tb-lang__name"><?php echo $esc($active->title_native); ?></span>
            <span class="tb-lang__code" aria-hidden="true"><?php echo $esc(strtoupper($active->sef)); ?></span>
            <span class="tb-lang__caret" aria-hidden="true">&#9660;</span>
        </button>
        <?php // A <dialog>, not a <div>: on a phone this opens with showModal() and renders in the
              // TOP LAYER, outside every containing block, overflow and z-index on the page. Two
              // separate attempts to place a fixed-position sheet inside T4's off-canvas wrapper
              // failed on exactly those (21/09/2026). On a wide screen the same element opens
              // non-modally with show() and stays the anchored dropdown it always was. ?>
        <dialog class="tb-lang__panel" id="<?php echo $id; ?>-menu">
            <?php if ($filter) : ?>
                <div class="tb-lang__search">
                    <?php // The template's OWN string, not Joomla's `JSEARCH_FILTER`. That key labels the
                          // list filter in admin, so each pack translated it for that context and the
                          // quality varies: the Vietnamese pack renders it "Quản lý tìm kiếm" (manage
                          // search), Slovenian has no key at all and falls back to English, and four
                          // packs end it in an ellipsis because theirs is a button. Measured across all
                          // 43 on 21/09/2026. A label this template invented belongs in this template's
                          // language files. ?>
                    <input type="search" class="tb-lang__search-input" autocomplete="off"
                           placeholder="<?php echo $esc(Text::_('TPL_TRACY_BUSINESS_LANGUAGE_FILTER')); ?>"
                           aria-label="<?php echo $esc(Text::_('TPL_TRACY_BUSINESS_LANGUAGE_FILTER')); ?>"
                           aria-controls="<?php echo $id; ?>-list">
                </div>
            <?php endif; ?>
        <ul class="tb-lang__menu" id="<?php echo $id; ?>-list">
            <?php foreach ($list as $language) : ?>
                <?php
                // Everything the filter matches on, lower-cased once here: the native name, the
                // English name and the code, so "deu", "german" and "de" all find German.
                $needle = strtolower($language->title_native . ' ' . $language->title . ' ' . $language->lang_code . ' ' . $language->sef);
                ?>
                <li class="tb-lang__item<?php echo $language->active ? ' is-active' : ''; ?>" data-tb-lang-find="<?php echo $esc($needle); ?>">
                    <?php if ($language->active) : ?>
                        <a aria-current="true" href="<?php echo $esc((string) Uri::getInstance()); ?>" lang="<?php echo $esc($language->lang_code); ?>">
                    <?php else : ?>
                        <a href="<?php echo htmlspecialchars_decode(htmlspecialchars($language->link, ENT_QUOTES, 'UTF-8'), ENT_NOQUOTES); ?>" hreflang="<?php echo $esc($language->lang_code); ?>" lang="<?php echo $esc($language->lang_code); ?>">
                    <?php endif; ?>
                        <?php echo $flag($language); ?>
                        <span class="tb-lang__name"><?php echo $esc($language->title_native); ?></span>
                        <?php if ($language->active) : ?><span class="tb-lang__check" aria-hidden="true">&#10003;</span><?php endif; ?>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
            <?php if ($filter) : ?>
                <p class="tb-lang__empty" hidden><?php echo $esc(Text::_('JGLOBAL_NO_MATCHING_RESULTS')); ?></p>
            <?php endif; ?>
        </dialog>
    </div>
</div>
