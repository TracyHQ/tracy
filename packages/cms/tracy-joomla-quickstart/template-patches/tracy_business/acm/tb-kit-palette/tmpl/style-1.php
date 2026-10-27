<?php
/** Tracy Business — ACM `tb-kit-palette`: PALETTE — a bordered sidebar box of 30 px swatches with name and hex. The swatch colour is the hex itself (a brand fact), so it does not flip with the theme. A hex of the template's own palette is drawn through the role it plays, so a site wearing a design system shows the system's colour; with none, the hex. */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
// a hex of the template's own palette is drawn through the role it plays, so a site wearing a design
// system shows the system's colour in its place; with no system the role is unset and the hex shows
$swatchFill = static function (string $hx): string {
    $role = ['#14171A' => '--ds-c-ink', '#F5F3EE' => '--ds-c-bg', '#EDEAE2' => '--ds-c-surface', '#DCD7CC' => '--ds-c-border', '#14483A' => '--ds-c-accent', '#DA5A2A' => '--ds-c-accent-hover'][strtoupper($hx)] ?? null;
    return $role ? 'var(' . $role . ', ' . $hx . ')' : $hx;
};
$title = trim((string) $helper->get('title'));
$rows = [];
for ($i = 0, $n = (int) $helper->getRows('swatch-name'); $i < $n; $i++) { $nm = trim((string) $helper->get('swatch-name', $i)); $hx = strtoupper(trim((string) $helper->get('swatch-hex', $i))); if ($nm !== '' && preg_match('/^#[0-9A-F]{6}$/', $hx)) $rows[] = [$nm, $hx]; }
if (!$rows) return;
$id = 'tb-kitpal-' . (int) $module->id;
?>
<section class="ja-acm acm-tb-kit-palette tb-kitside tb-kitbox tb-kitpal" id="<?php echo $id; ?>"<?php if ($title !== '') : ?> aria-labelledby="<?php echo $id; ?>-title"<?php endif; ?>>
  <?php if ($title !== '') : ?><h2 class="tb-kitside__title tb-kitbox__title" id="<?php echo $id; ?>-title"><?php echo $esc($title); ?></h2><?php endif; ?>
  <ul class="tb-kitpal__list">
    <?php foreach ($rows as [$nm, $hx]) : ?><li class="tb-kitpal__row"><span class="tb-kitpal__swatch" style="background:<?php echo $swatchFill($hx); ?>" aria-hidden="true"></span><span class="tb-kitpal__name"><?php echo $esc($nm); ?></span><code class="tb-kitpal__hex"><?php echo $hx; ?></code></li><?php endforeach; ?>
  </ul>
</section>
