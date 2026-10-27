<?php
/**
 * @package   TRACY
 * @copyright Copyright (C) 2005 - 2012 Open Source Matters, Inc. All rights reserved.
 * @license   GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

/*
 * THE TOKEN LAYER HAS TO BE LOADED HERE TOO.
 *
 * Every `tmpl=component` page — a modal, an iframe, a print view, com_contact's privacy note —
 * renders through THIS file, not index.php. It used to be three lines that handed everything to
 * `T4::render()`, and T4 does not know about `css/styles/<design system>.css`: that link is added by
 * index.php. So a modal loaded `template.css`, whose rules are written entirely in `var(--token)`,
 * with none of the tokens declared.
 *
 * Nothing errors. The page renders at the browser's defaults — body type instead of the scale,
 * no spacing steps, links as bare blue — beside a parent page that is perfectly styled. Measured on
 * the contact form's privacy modal: the panel came out at browser defaults while the page behind it
 * was correct.
 *
 * Same three artefacts index.php loads, in the same order, for the same reason.
 */
$designSystem = $this->params->get('typelist-theme', 'default');
$dsCss        = __DIR__ . '/css/styles/' . $designSystem . '.css';

if (is_file($dsCss)) {
    $href = \Joomla\CMS\Uri\Uri::root(true) . '/templates/' . $this->template
        . '/css/styles/' . $designSystem . '.css?' . filemtime($dsCss);
    $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
}

$darkCss = __DIR__ . '/css/darkmode.css';

if (is_file($darkCss)) {
    $href = \Joomla\CMS\Uri\Uri::root(true) . '/templates/' . $this->template
        . '/css/darkmode.css?' . filemtime($darkCss);
    $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
}

if (class_exists('\T4\T4')) {
    \T4\T4::render($this);
} else {
    include 'error-t4.php';
}
