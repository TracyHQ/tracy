<?php

/**
 * Bare document for modal and print views (tmpl=component): the component alone, in the same look.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Uri\Uri;

/** @var Joomla\CMS\Document\HtmlDocument $this */

$wa = $this->getWebAssetManager();

require_once __DIR__ . '/resolve.php';
$look = tpl_tracy_resolve($this->params);

$wa->useStyle('template.tracy')
    ->registerAndUseStyle(
        'template.inspiration',
        'media/templates/site/tpl_tracy/css/inspirations/' . $look['id'] . '.css',
        [],
        [],
        ['template.tracy']
    );

// Last, once every sheet of this template is registered: each one's version follows its file, so a
// look change that rewrites it reaches every browser at once (resolve.php).
tpl_tracy_stamp_styles($wa, JPATH_ROOT);
$this->setMetaData('viewport', 'width=device-width, initial-scale=1');
?>
<!DOCTYPE html>
<html lang="<?php echo $this->language; ?>" dir="<?php echo $this->direction; ?>">
<head>
    <jdoc:include type="metas" />
    <jdoc:include type="styles" />
    <jdoc:include type="scripts" />
</head>
<body class="tracy tracy-component" data-inspiration="<?php echo $look['id']; ?>">
    <div class="tracy-container">
        <jdoc:include type="message" />
        <jdoc:include type="component" />
    </div>
</body>
</html>
