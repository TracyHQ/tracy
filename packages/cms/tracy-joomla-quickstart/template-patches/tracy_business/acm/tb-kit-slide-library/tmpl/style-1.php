<?php
/**
 * Tracy Business — ACM `tb-kit-slide-library`: SLIDE LIBRARY — a 3-column grid of numbered 16:9
 * thumbnails, each drawn in CSS after the design's eight slide kinds, with title, one line and
 * "Use this slide →" linking to #page=N of one PDF deck.
 *
 * The drawn content inside the thumbnails (the cover project, the agenda, the stats, the stages, …) is a
 * picture of a sample deck, not editable copy. Its words come from the template language files
 * (TPL_TRACY_BUSINESS_KITSLIDE_*), so each edition draws them in its own language and no edition carries
 * another script. The link is rendered only when the deck file exists on disk.
 */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$media = static function (string $v): string { $v = explode('#', trim($v))[0]; if ($v === '') return ''; return preg_match('~^(?:[a-z][a-z0-9+.-]*:|/)~i', $v) ? $v : \Joomla\CMS\Uri\Uri::root(true) . '/' . $v; };
$fileUrl = static function (string $path): string {
    $path = ltrim(trim($path), '/');
    if ($path === '' || !is_file(JPATH_ROOT . '/' . $path)) return '';
    return \Joomla\CMS\Uri\Uri::root(true) . '/' . implode('/', array_map('rawurlencode', explode('/', $path)));
};
$title = trim((string) $helper->get('title')); $hint = trim((string) $helper->get('hint')); $use = trim((string) $helper->get('use-text'));
$deck = $fileUrl((string) $helper->get('deck'));
$kinds = ['cover', 'agenda', 'stats', 'case', 'process', 'quote', 'map', 'contact'];
$slides = [];
for ($i = 0, $n = (int) $helper->getRows('slide-title'); $i < $n; $i++) {
    $t = trim((string) $helper->get('slide-title', $i)); if ($t === '') continue;
    $k = (string) $helper->get('slide-kind', $i);
    $slides[] = ['num' => trim((string) $helper->get('slide-num', $i)) ?: sprintf('%02d', count($slides) + 1), 'title' => $t, 'desc' => trim((string) $helper->get('slide-desc', $i)),
        'kind' => in_array($k, $kinds, true) ? $k : 'cover', 'image' => $media((string) $helper->get('slide-image', $i))];
}
if (!$slides) return;
$id = 'tb-kitslides-' . (int) $module->id;
// One word of the drawn sample deck, from the language file of the page.
$w = static fn (string $key): string => htmlspecialchars(\Joomla\CMS\Language\Text::_($key), ENT_QUOTES, 'UTF-8');
$thumb = static function (array $s) use ($esc, $w): string {
    switch ($s['kind']) {
        case 'cover':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--cover"><div class="tb-kitslide__brand"><span class="tb-kitslide__mark">{site.monogram}</span><span>{site.name}</span></div><div><span class="tb-kitslide__rule"></span><div class="tb-kitslide__h">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_COVER_TITLE') . '</div><div class="tb-kitslide__sub">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_COVER_SUB') . '</div></div></div>';
        case 'agenda':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--agenda"><div class="tb-kitslide__eyebrow">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_AGENDA') . '</div><div class="tb-kitslide__rows"><div><span>01</span><i></i></div><div><span>02</span><i></i></div><div><span>03</span><i style="width:70%"></i></div><div><span>04</span><i style="width:55%"></i></div></div></div>';
        case 'stats':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--stats"><div><b>380+</b><small>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STAT_PROJECTS') . '</small></div><div><b>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STAT_AREA_VALUE') . '</b><small>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STAT_AREA') . '</small></div><div><b>22</b><small>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STAT_YEARS') . '</small></div><div class="is-forest"><b>0</b><small>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STAT_INCIDENTS') . '</small></div></div>';
        case 'case':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--case">' . ($s['image'] !== '' ? '<div class="tb-kitslide__photo"><img src="' . $esc($s['image']) . '" alt="" loading="lazy" decoding="async"></div>' : '<div class="tb-kitslide__photo"></div>') . '<div class="tb-kitslide__case"><div class="tb-kitslide__eyebrow">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_CASE') . '</div><div class="tb-kitslide__case-h">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_CASE_TITLE') . '</div><i></i><i style="width:80%"></i><i style="width:60%"></i></div></div>';
        case 'process':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--process"><div class="tb-kitslide__eyebrow">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_PROCESS') . '</div><div class="tb-kitslide__line"><span class="is-done"></span><i></i><span class="is-done"></span><i></i><span class="is-now"></span><i></i><span class="is-todo"></span></div><div class="tb-kitslide__ticks"><span>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STEP_DESIGN') . '</span><span>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STEP_FRAME') . '</span><span>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STEP_ROOF') . '</span><span>' . $w('TPL_TRACY_BUSINESS_KITSLIDE_STEP_HANDOVER') . '</span></div></div>';
        case 'quote':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--quote"><div class="tb-kitslide__q">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_QUOTE') . '</div><div class="tb-kitslide__sub">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_QUOTE_BY') . '</div></div>';
        case 'map':
            return '<div class="tb-kitslide__draw tb-kitslide__draw--map">' . ($s['image'] !== '' ? '<img src="' . $esc($s['image']) . '" alt="" loading="lazy" decoding="async">' : '') . '</div>';
        case 'contact':
        default:
            return '<div class="tb-kitslide__draw tb-kitslide__draw--contact"><div class="tb-kitslide__h">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_CONTACT_TITLE') . '</div><div class="tb-kitslide__sub">{contact.email} · {contact.phone}</div><span class="tb-kitslide__cta">' . $w('TPL_TRACY_BUSINESS_KITSLIDE_CONTACT_CTA') . '</span></div>';
    }
};
?>
<section class="ja-acm acm-tb-kit-slide-library tb-kitlib" id="<?php echo $id; ?>"<?php if ($title !== '') : ?> aria-labelledby="<?php echo $id; ?>-title"<?php endif; ?>>
  <div class="tb-container">
    <?php if ($title !== '' || $hint !== '') : ?>
      <header class="tb-section__head tb-kitlib__head">
        <?php if ($title !== '') : ?><h2 class="tb-section__title" id="<?php echo $id; ?>-title"><?php echo $esc($title); ?></h2><?php endif; ?>
        <?php if ($hint !== '') : ?><p class="tb-kitlib__hint"><?php echo $esc($hint); ?></p><?php endif; ?>
      </header>
    <?php endif; ?>
    <ol class="tb-kitlib__grid">
      <?php foreach ($slides as $i => $s) : $page = (int) $s['num'] ?: $i + 1; $href = $deck !== '' ? $deck . '#page=' . $page : ''; ?>
        <li class="tb-kitslide tb-kitslide--<?php echo $s['kind']; ?>">
          <?php if ($href !== '') : ?><a class="tb-kitslide__frame" href="<?php echo $esc($href); ?>" target="_blank" rel="noopener" aria-label="<?php echo $esc($s['title']); ?>"><?php else : ?><div class="tb-kitslide__frame"><?php endif; ?>
            <?php echo $thumb($s); ?>
            <span class="tb-kitslide__num"><?php echo $esc($s['num']); ?></span>
          <?php echo $href !== '' ? '</a>' : '</div>'; ?>
          <h3 class="tb-kitslide__title"><?php echo $esc($s['title']); ?></h3>
          <?php if ($s['desc'] !== '') : ?><p class="tb-kitslide__desc"><?php echo $esc($s['desc']); ?></p><?php endif; ?>
          <?php if ($use !== '') : ?><?php if ($href !== '') : ?><a class="tb-kitslide__use" href="<?php echo $esc($href); ?>" target="_blank" rel="noopener"><?php echo $esc($use); ?></a><?php else : ?><span class="tb-kitslide__use"><?php echo $esc($use); ?></span><?php endif; ?><?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ol>
  </div>
</section>
